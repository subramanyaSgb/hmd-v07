"""
Operations Live + Trip History (Live) endpoints.

Consumed by the new /operations-live and /trip-history-live pages. Reads
from wbatngl_trip_mirror (producer-side), hts_heat_mirror (consumer-side),
and fleet_live_locations (live GPS). Strictly read-only — never mutates
any source table.

Auth: get_current_user_required for all endpoints (any authenticated role),
matching the read-side auth on /api/jsw/*.

See docs/plans/2026-05-11-operations-live-design.md for the full architecture
and docs/plans/2026-05-12-operations-live-phase-2.md for the per-task plan.
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from ..database.engine import get_db
from ..database.models import (
    FleetLiveLocation,
    FleetManagement,
    HtsHeatMirror,
    User,
    WbatnglTripMirror,
)
from ..logger import logger
from ..utils.cache import fleet_cache
from ..utils.security import get_current_user_required


router = APIRouter(tags=["operations-live"])

# WBATNGL and HTS Oracle source tables store timestamps as IST-naive
# wall-clock datetimes (no tzinfo, IST values). To compare with these in
# elapsed-time / time-window calculations, we need "now" in the same
# IST-naive frame. We do NOT convert IST timestamps to UTC at sync time
# (that would break parity with the source-system clocks operators see in
# WBATNGL); instead we shift our internal "now" anchor.
_IST_OFFSET = timedelta(hours=5, minutes=30)


def _now_ist_naive() -> datetime:
    """UTC now + 5:30 → IST wall-clock naive datetime, matching the
    convention used by WBATNGL.OUT_DATE / HTS.TORPEDO_IN_TIME etc."""
    return datetime.utcnow() + _IST_OFFSET


# Trip ↔ heat matching window (must match the v_trip_heat_story view).
MATCH_WINDOW_BEFORE = timedelta(minutes=15)
MATCH_WINDOW_AFTER = timedelta(minutes=90)

# Six SMS3 converters tracked on Page 1. Order is the display order.
CONVERTERS = ("D", "E", "F", "G", "H", "I")

# Weight-delta anomaly threshold: |WBATNGL net - SUM(HTS hotmetal)| / WBATNGL net > 10%.
WEIGHT_DELTA_ANOMALY_PCT = 10.0

# Active-trips KPI window: a trip counts as "active" when it departed within
# the last N hours AND no matched heat has been recorded. The time-window
# replaces the old `.limit(200)` candidate cap; bounded by IST-naive
# elapsed time, not row count.
ACTIVE_TRIP_WINDOW_HOURS = 6

# Sort whitelist for /api/trip-history-live — never let user input become ORDER BY.
TRIP_HISTORY_SORT_WHITELIST = {
    "updated_date", "first_tare_time", "out_date", "closetime",
    "net_weight", "fleet_id",
}

# Cache keys / TTLs.
CACHE_KEY_DASHBOARD = "ops_live_dashboard"
DASHBOARD_CACHE_TTL_SEC = 5
CACHE_KEY_TRIP_DETAIL = "ops_live_trip_detail"
TRIP_DETAIL_CACHE_TTL_SEC = 10


def _time_window_to_cutoff(time_window: str) -> datetime:
    """today / 24h / 7d / 30d → IST-naive cutoff datetime. Raises 400 otherwise.

    Compared against IST-naive WbatnglTripMirror.updated_date (etc.), so we
    anchor on IST-naive "now" — see _now_ist_naive() above.
    """
    now = _now_ist_naive()
    if time_window == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if time_window == "24h":
        return now - timedelta(hours=24)
    if time_window == "7d":
        return now - timedelta(days=7)
    if time_window == "30d":
        return now - timedelta(days=30)
    raise HTTPException(400, f"Invalid time_window: {time_window!r}")


def find_matched_heats(db: Session, trip: WbatnglTripMirror) -> list[HtsHeatMirror]:
    """
    Return HTS heats that match this trip via the (torpedo, ±window) rule.

    Window: closetime - 15 min  ..  closetime + 90 min.
    Empty list if trip.closetime is null (in-flight, no destination ETA).
    Cross-dialect: uses Python-side timedelta arithmetic instead of the
    PG-only `v_trip_heat_story` view's INTERVAL syntax so SQLite tests pass.
    """
    if trip.closetime is None or trip.fleet_id is None:
        return []
    lo = trip.closetime - MATCH_WINDOW_BEFORE
    hi = trip.closetime + MATCH_WINDOW_AFTER
    return (
        db.query(HtsHeatMirror)
        .filter(
            HtsHeatMirror.torpedo_no == trip.fleet_id,
            HtsHeatMirror.torpedo_in_time.between(lo, hi),
        )
        .order_by(HtsHeatMirror.torpedo_in_time.asc())
        .all()
    )


def compute_anomaly_flags(net_weight_mt: Optional[float],
                          matched_total_mt: Optional[float]) -> list[dict]:
    """
    Compute anomaly flags for one trip.

    For v1 the only flag is `weight_delta` — fires when |HTS sum - WBATNGL
    net| / WBATNGL net exceeds WEIGHT_DELTA_ANOMALY_PCT. Returns [] when
    either side is missing (matched_total_mt is None when no heats matched
    yet; net_weight_mt may be null on torpedoes that depart without weight).
    """
    flags: list[dict] = []
    if net_weight_mt and matched_total_mt is not None:
        delta_mt = matched_total_mt - net_weight_mt
        delta_pct = (delta_mt / net_weight_mt) * 100.0
        if abs(delta_pct) > WEIGHT_DELTA_ANOMALY_PCT:
            sign = "+" if delta_mt >= 0 else "-"
            flags.append({
                "code": "weight_delta",
                "severity": "warn",
                "message": (
                    f"Weight anomaly: WBATNGL {net_weight_mt:.0f} MT, "
                    f"HTS sum {matched_total_mt:.0f} MT "
                    f"({sign}{abs(delta_mt):.0f} MT, {sign}{abs(delta_pct):.1f}%)"
                ),
            })
    return flags


def _last_sync_at(db: Session) -> dict:
    return {
        "wbatngl": db.query(func.max(WbatnglTripMirror.synced_at)).scalar(),
        "hts":     db.query(func.max(HtsHeatMirror.synced_at)).scalar(),
    }


def _build_empty_converter_card(letter: str) -> dict:
    return {
        "converter_no": letter, "sms": None, "state": "IDLE",
        "current_heat_no": None, "current_torpedo": None,
        "elapsed_minutes": None, "hotmetal_received_mt": None,
        "last_heat_no": None, "last_heat_at": None,
        "heats_today": 0,
    }


@router.get("/api/operations-live/dashboard")
async def operations_live_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Consolidated Page 1 (operations live) payload.

    Converter state machine is `IDLE | HEAT_IN_PROGRESS`. The design doc also
    mentions `WAITING_TORPEDO`, but in v1 we can't distinguish "converter idle
    and waiting for a specific incoming torpedo" without consumer-side
    scheduling data we don't yet sync — so it stays out of the wire payload.
    """
    cached = fleet_cache.get(CACHE_KEY_DASHBOARD)
    if cached is not None:
        return cached

    today_cutoff = _now_ist_naive().replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    # KPI strip
    production_today = db.query(
        func.coalesce(func.sum(WbatnglTripMirror.net_weight), 0.0)
    ).filter(WbatnglTripMirror.updated_date >= today_cutoff).scalar()

    consumption_today = db.query(
        func.coalesce(func.sum(HtsHeatMirror.hotmetal_qty), 0.0)
    ).filter(HtsHeatMirror.torpedo_in_time >= today_cutoff).scalar()

    heats_in_progress = db.query(HtsHeatMirror).filter(
        HtsHeatMirror.torpedo_out_time.is_(None),
    ).count()

    # Active trips = out_date in last ACTIVE_TRIP_WINDOW_HOURS AND no matched
    # heat. The time-window bounds the candidate set (replaces the old
    # row-cap of 200, which fired spuriously when HTS was frozen and no
    # trips could match). Captures realistic torpedo cycle times (departure
    # → load → travel → pour is typically 1-3 hours).
    recent_floor = _now_ist_naive() - timedelta(hours=ACTIVE_TRIP_WINDOW_HOURS)
    candidate_trips = (
        db.query(WbatnglTripMirror)
        .filter(
            WbatnglTripMirror.out_date.isnot(None),
            WbatnglTripMirror.out_date >= recent_floor,
        )
        .order_by(WbatnglTripMirror.out_date.desc())
        .all()
    )
    active_trip_rows = [t for t in candidate_trips
                        if not find_matched_heats(db, t)]
    active_trips_now = len(active_trip_rows)

    # Idle torpedoes = FleetManagement.status == "Operating" (SuVeechi-mapped
    # "Idle"); see SUVEECHI_STATUS_MAP in backend/utils/suveechi_sync.py.
    # FleetLiveLocation.type is hardcoded to "torpedo" (entity-type, not state),
    # so it cannot drive this KPI. soft-deleted rows are excluded to match the
    # active_only() pattern used elsewhere (see routes/fleet.py).
    idle_torpedoes = (
        db.query(FleetManagement)
        .filter(
            FleetManagement.status == "Operating",
            FleetManagement.deleted_at.is_(None),
            FleetManagement.type == "torpedo",
        )
        .count()
    )

    # Converter cards — one row per letter; data sourced from hts_heat_mirror.
    converter_cards = []
    for letter in CONVERTERS:
        base = db.query(HtsHeatMirror).filter(
            HtsHeatMirror.converter_no == letter
        )

        in_progress = (
            base.filter(HtsHeatMirror.torpedo_out_time.is_(None))
                .order_by(HtsHeatMirror.torpedo_in_time.desc())
                .first()
        )
        last_completed = (
            base.filter(HtsHeatMirror.torpedo_out_time.isnot(None))
                .order_by(HtsHeatMirror.torpedo_out_time.desc())
                .first()
        )
        heats_today = (
            base.filter(HtsHeatMirror.torpedo_in_time >= today_cutoff).count()
        )
        # SMS label: prefer the in-progress heat's value, then most recent
        # non-null SMS overall.
        sms_value = None
        if in_progress and in_progress.sms:
            sms_value = in_progress.sms
        else:
            recent_with_sms = (
                base.filter(HtsHeatMirror.sms.isnot(None))
                    .order_by(HtsHeatMirror.torpedo_in_time.desc())
                    .first()
            )
            if recent_with_sms:
                sms_value = recent_with_sms.sms

        if in_progress:
            elapsed_min = int(
                (_now_ist_naive() - in_progress.torpedo_in_time).total_seconds() // 60
            )
            card = {
                "converter_no": letter,
                "sms": sms_value,
                "state": "HEAT_IN_PROGRESS",
                "current_heat_no": in_progress.heat_no,
                "current_torpedo": in_progress.torpedo_no,
                "elapsed_minutes": elapsed_min,
                "hotmetal_received_mt": (
                    float(in_progress.hotmetal_qty)
                    if in_progress.hotmetal_qty is not None else None
                ),
                "last_heat_no": last_completed.heat_no if last_completed else None,
                "last_heat_at": (
                    last_completed.torpedo_out_time if last_completed else None
                ),
                "heats_today": heats_today,
            }
        else:
            card = {
                "converter_no": letter,
                "sms": sms_value,
                "state": "IDLE",
                "current_heat_no": None,
                "current_torpedo": None,
                "elapsed_minutes": None,
                "hotmetal_received_mt": None,
                "last_heat_no": last_completed.heat_no if last_completed else None,
                "last_heat_at": (
                    last_completed.torpedo_out_time if last_completed else None
                ),
                "heats_today": heats_today,
            }
        converter_cards.append(card)

    # active_trip_rows was computed during KPI strip — reuse, don't re-query.
    # Per-torpedo operational status comes from FleetManagement.status
    # (SuVeechi-mapped: "Operating"/"Moving"/"Maintenance"/"Assigned").
    # FleetLiveLocation.type is hardcoded entity-type ("torpedo"); do not use.
    torpedo_ids = [t.fleet_id for t in active_trip_rows if t.fleet_id]
    latest_status_by_fleet: dict[str, str] = {}
    if torpedo_ids:
        rows = (
            db.query(FleetManagement.fleet_id, FleetManagement.status)
            .filter(
                FleetManagement.fleet_id.in_(torpedo_ids),
                FleetManagement.deleted_at.is_(None),
            )
            .all()
        )
        latest_status_by_fleet = {r.fleet_id: r.status for r in rows}

    active_trips_payload = []
    now = _now_ist_naive()
    for t in active_trip_rows[:50]:                     # cap at 50 for UI
        elapsed_min = (
            int((now - t.out_date).total_seconds() // 60)
            if t.out_date else None
        )
        active_trips_payload.append({
            "trip_id": t.trip_id,
            "torpedo_no": t.fleet_id,
            "source_lab": t.source_lab,
            "destination": t.destination,
            "net_weight_mt": (
                float(t.net_weight) if t.net_weight is not None else None
            ),
            "out_date": t.out_date,
            "elapsed_minutes": elapsed_min,
            "current_status": latest_status_by_fleet.get(t.fleet_id),
        })

    # Activity feed — last 20 events from the union of trip_close + heat_start.
    feed_horizon = _now_ist_naive() - timedelta(hours=2)

    recent_closes = (
        db.query(WbatnglTripMirror)
        .filter(WbatnglTripMirror.closetime.isnot(None),
                WbatnglTripMirror.closetime >= feed_horizon)
        .order_by(WbatnglTripMirror.closetime.desc())
        .limit(20)
        .all()
    )
    recent_heats = (
        db.query(HtsHeatMirror)
        .filter(HtsHeatMirror.torpedo_in_time >= feed_horizon)
        .order_by(HtsHeatMirror.torpedo_in_time.desc())
        .limit(20)
        .all()
    )
    events = []
    for t in recent_closes:
        events.append({
            "type": "trip_completed",
            "at": t.closetime,
            "summary": (
                f"{t.fleet_id or '?'} closed {t.source_lab or '?'} → "
                f"{t.destination or '?'}"
                + (f" ({float(t.net_weight):.0f} MT)" if t.net_weight else "")
            ),
            "ref_id": t.trip_id,
        })
    for h in recent_heats:
        events.append({
            "type": "heat_started",
            "at": h.torpedo_in_time,
            "summary": (
                f"Heat {h.heat_no} started"
                + (f" @ {h.converter_no}" if h.converter_no else "")
                + (f" (torpedo {h.torpedo_no})" if h.torpedo_no else "")
            ),
            "ref_id": h.heat_no,
        })
    events.sort(key=lambda e: e["at"], reverse=True)
    events = events[:20]

    payload = {
        "kpi_strip": {
            "production_today_mt": float(production_today or 0.0),
            "consumption_today_mt": float(consumption_today or 0.0),
            "active_trips_now": active_trips_now,
            "heats_in_progress": heats_in_progress,
            "idle_torpedoes": idle_torpedoes,
        },
        "converters": converter_cards,
        "active_trips": active_trips_payload,
        "activity_feed": events,
        "last_sync_at": _last_sync_at(db),
    }
    try:
        fleet_cache.set(CACHE_KEY_DASHBOARD, payload, DASHBOARD_CACHE_TTL_SEC)
    except Exception:
        logger.exception("ops-live dashboard: cache set failed (non-fatal)")
    return payload


def _row_to_dict(row, model) -> dict:
    """Serialize a SQLAlchemy row to a dict using the model's column names.

    Model-agnostic; reused by trip-history-live list + detail endpoints.
    """
    return {c.name: getattr(row, c.name) for c in model.__table__.columns}


@router.get("/api/trip-history-live")
async def trip_history_live(
    time_window: str = Query("today"),
    source_lab: Optional[str] = Query(None),
    destination: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    fleet_id: Optional[str] = Query(None),
    status: str = Query("all"),
    converter: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: str = Query("out_date"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Paginated trip history with per-row enrichment from matched HTS heats.

    Filter semantics: source_lab / destination / shift / fleet_id / q are
    applied at the SQL level. status / converter are applied AFTER pagination
    and enrichment (acknowledged v1 caveat — see Task 2.12 in
    docs/plans/2026-05-12-operations-live-phase-2.md). When a post-filter is
    active, `total` reports the post-filter count of the current visible page
    rather than the global filtered count.
    """
    if sort_by not in TRIP_HISTORY_SORT_WHITELIST:
        raise HTTPException(
            400, f"sort_by must be one of {sorted(TRIP_HISTORY_SORT_WHITELIST)}"
        )

    cutoff = _time_window_to_cutoff(time_window)

    qry = db.query(WbatnglTripMirror).filter(
        WbatnglTripMirror.updated_date >= cutoff
    )
    if source_lab and source_lab != "all":
        qry = qry.filter(WbatnglTripMirror.source_lab == source_lab)
    if destination and destination != "all":
        qry = qry.filter(WbatnglTripMirror.destination == destination)
    if shift and shift != "all":
        qry = qry.filter(WbatnglTripMirror.shift == shift)
    if fleet_id and fleet_id != "all":
        qry = qry.filter(WbatnglTripMirror.fleet_id == fleet_id)
    if q:
        like = f"%{q}%"
        qry = qry.filter(or_(
            WbatnglTripMirror.trip_id.ilike(like),
            WbatnglTripMirror.fleet_id.ilike(like),
            WbatnglTripMirror.ladleno_raw.ilike(like),
        ))

    total = qry.count()
    col = getattr(WbatnglTripMirror, sort_by)
    order = col.desc() if sort_order == "desc" else col.asc()
    trips = (qry.order_by(order)
                .offset((page - 1) * page_size)
                .limit(page_size)
                .all())

    # Per-row enrichment — pull matched heats once per page; small N (≤200).
    enriched_rows = []
    for t in trips:
        heats = find_matched_heats(db, t)
        match_count = len(heats)
        matched_total = (
            sum(float(h.hotmetal_qty) for h in heats if h.hotmetal_qty is not None)
            if heats else None
        )
        anomaly = bool(compute_anomaly_flags(
            net_weight_mt=float(t.net_weight) if t.net_weight is not None else None,
            matched_total_mt=matched_total,
        ))
        if t.closetime is None:
            ms = "in_flight"
        elif match_count == 0:
            ms = "awaiting_pour"
        elif anomaly:
            ms = "anomaly"
        else:
            ms = "complete"
        weight_delta_pct = None
        if matched_total is not None and t.net_weight:
            weight_delta_pct = ((matched_total - float(t.net_weight))
                                / float(t.net_weight)) * 100.0
        enriched_rows.append({
            **_row_to_dict(t, WbatnglTripMirror),
            "match_status": ms,
            "first_heat_no": heats[0].heat_no if heats else None,
            "matched_heat_count": match_count,
            "matched_hotmetal_total_mt": matched_total,
            "weight_delta_pct": (
                round(weight_delta_pct, 2)
                if weight_delta_pct is not None else None
            ),
            "_matched_converters": {h.converter_no for h in heats if h.converter_no},
        })

    # Post-filter by status / converter. Caveat: these filters narrow the
    # *current page* because enrichment runs after pagination. For v1 the
    # page_size cap of 200 keeps the visible window large enough; this
    # filtering will move down to SQL in Phase 5 if it becomes pain.
    if status != "all":
        enriched_rows = [r for r in enriched_rows if r["match_status"] == status]
    if converter and converter != "all":
        enriched_rows = [r for r in enriched_rows
                         if converter in r["_matched_converters"]]
    for r in enriched_rows:
        r.pop("_matched_converters", None)

    # When a post-filter is active, recompute total from the visible page
    # (acknowledged v1 limitation — see caveat above).
    final_total = (
        total
        if (status == "all" and (not converter or converter == "all"))
        else len(enriched_rows)
    )

    return {
        "rows": enriched_rows,
        "page": page,
        "page_size": page_size,
        "total": final_total,
        "last_sync_at": _last_sync_at(db),
    }


@router.get("/api/trip-history-live/{trip_id}")
async def trip_history_live_detail(
    trip_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Per-trip drill-down payload for the trip-history-live page.

    Shape: trip + matched_heats (sorted ASC by torpedo_in_time via
    find_matched_heats) + current_torpedo_position (latest fleet_live_locations
    row for the torpedo, null when missing or no fleet_id) + anomaly_flags
    (via compute_anomaly_flags) + last_sync_at. Cached 10 s under
    "{CACHE_KEY_TRIP_DETAIL}:{trip_id}".
    """
    cache_key = f"{CACHE_KEY_TRIP_DETAIL}:{trip_id}"
    cached = fleet_cache.get(cache_key)
    if cached is not None:
        return cached

    trip = (
        db.query(WbatnglTripMirror)
        .filter(WbatnglTripMirror.trip_id == trip_id)
        .first()
    )
    if trip is None:
        raise HTTPException(404, f"Trip not found: {trip_id}")

    heats = find_matched_heats(db, trip)
    matched_total = (
        sum(float(h.hotmetal_qty) for h in heats if h.hotmetal_qty is not None)
        if heats else None
    )
    flags = compute_anomaly_flags(
        net_weight_mt=float(trip.net_weight) if trip.net_weight is not None else None,
        matched_total_mt=matched_total,
    )

    # Latest fleet_live_locations row for the torpedo (carries x/y/last_updated
    # GPS data). Operational status comes from FleetManagement.status — added
    # as a top-level key on the position dict alongside the GPS fields.
    current_pos = None
    if trip.fleet_id:
        latest = (
            db.query(FleetLiveLocation)
            .filter(FleetLiveLocation.fleet_id == trip.fleet_id)
            .order_by(FleetLiveLocation.last_updated.desc())
            .first()
        )
        if latest:
            current_pos = _row_to_dict(latest, FleetLiveLocation)
            fm = (
                db.query(FleetManagement.status)
                .filter(
                    FleetManagement.fleet_id == trip.fleet_id,
                    FleetManagement.deleted_at.is_(None),
                )
                .first()
            )
            current_pos["status"] = fm.status if fm else None

    payload = {
        "trip": _row_to_dict(trip, WbatnglTripMirror),
        "matched_heats": [_row_to_dict(h, HtsHeatMirror) for h in heats],
        "current_torpedo_position": current_pos,
        "anomaly_flags": flags,
        "last_sync_at": _last_sync_at(db),
    }
    try:
        fleet_cache.set(cache_key, payload, TRIP_DETAIL_CACHE_TTL_SEC)
    except Exception:
        logger.exception(
            "ops-live trip detail: cache set failed (non-fatal)"
        )
    return payload
