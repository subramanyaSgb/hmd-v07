"""
GET /api/jsw/trips      — paginated, filtered, searchable list
GET /api/jsw/dashboard  — aggregates for the Plant Live page

Both read from `wbatngl_trip_mirror` (populated by the wbatngl_trip_sync
background job) and never touch the existing manual-trip flow. Auth: any
authenticated role.

See docs/plans/2026-05-08-wbatngl-trip-mirror-design.md (Topic 8) for the
threat-model / role rationale.
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, func, or_
from sqlalchemy.orm import Session

from ..database.engine import get_db
from ..database.models import Alert, FleetManagement, User, WbatnglTripMirror
from ..logger import logger
from ..utils.cache import fleet_cache
from ..utils.security import get_current_user_required


def _derive_stage_idx(row: "WbatnglTripMirror") -> int:
    """
    Map WBATNGL timestamps to the 5-stage strip used by the Trip
    Operations V2 board (matches the design idea's stage progression):

        0 Tap     — first_tare_time set, nothing else
        1 Weigh   — closetime set (chemistry sampled)
        2 Transit — out_date set, no SMS ack yet
        3 SMS     — sms_ack_time set (arrived at consumer)
        4 Return  — updated_date drifted ≥ 30 min past sms_ack_time

    Defensive: any null cascade falls through to the lowest stage so a
    half-empty row still renders something.
    """
    if row.sms_ack_time is not None:
        if (row.updated_date is not None
                and (row.updated_date - row.sms_ack_time).total_seconds() > 30 * 60):
            return 4
        return 3
    if row.out_date is not None:
        return 2
    if row.closetime is not None:
        return 1
    if row.first_tare_time is not None:
        return 0
    return 0


def _row_to_dict_v2(row: "WbatnglTripMirror", alert: Optional[dict] = None) -> dict:
    """
    Same as `_row_to_dict` but with the Trip Operations V2 extras:
    `stage_idx` (derived) and `alert` (latest unacked for this trip_id
    or None). Existing callers that read `_row_to_dict` are unaffected
    — those extras are additive.
    """
    base = {c.name: getattr(row, c.name)
            for c in WbatnglTripMirror.__table__.columns}
    base["stage_idx"] = _derive_stage_idx(row)
    base["alert"] = alert
    return base


def _fetch_alerts_by_trip_id(
    db: Session, trip_ids: list[str]
) -> dict[str, dict]:
    """
    Return a dict mapping trip_id → latest unacked alert dict (or skip if
    no unacked alert). Fetched in ONE query so /api/jsw/trips doesn't
    fan into N+1 (53 active trips × per-row alert query was the obvious
    foot-gun).
    """
    if not trip_ids:
        return {}
    rows = db.query(
        Alert.id, Alert.kind, Alert.severity, Alert.tag, Alert.message,
        Alert.trip_id, Alert.detected_at,
    ).filter(
        Alert.trip_id.in_(trip_ids),
        Alert.acknowledged_at.is_(None),
    ).order_by(Alert.trip_id, Alert.detected_at.desc()).all()
    out: dict[str, dict] = {}
    for r in rows:
        # first row per trip_id wins (most recent unacked)
        if r.trip_id in out:
            continue
        out[r.trip_id] = {
            "id":       r.id,
            "kind":     r.kind,
            "severity": r.severity,
            "tag":      r.tag,
            "detail":   r.message,
        }
    return out


router = APIRouter(tags=["jsw"])


# Locked sort whitelist — never let user input become an ORDER BY column.
SORT_WHITELIST = {
    "updated_date", "first_tare_time", "out_date",
    "net_weight", "temp", "fleet_id",
}

CHEM_THRESHOLDS = {
    "temp_min": 1450, "temp_max": 1530,
    "s_max":    0.05,
    "si_min":   0.2,  "si_max":   1.0,
}

DASHBOARD_CACHE_TTL_SEC = 5
CACHE_KEY_DASHBOARD = "jsw_dashboard"


def _time_window_to_cutoff(time_window: str) -> datetime:
    """today / 24h / 7d / 30d → datetime cutoff."""
    now = datetime.utcnow()
    if time_window == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if time_window == "24h":
        return now - timedelta(hours=24)
    if time_window == "7d":
        return now - timedelta(days=7)
    if time_window == "30d":
        return now - timedelta(days=30)
    raise HTTPException(400, f"Invalid time_window: {time_window!r}")


def _last_sync_at(db: Session) -> Optional[datetime]:
    return db.query(func.max(WbatnglTripMirror.synced_at)).scalar()


def _row_to_dict(row: WbatnglTripMirror) -> dict:
    return {c.name: getattr(row, c.name)
            for c in WbatnglTripMirror.__table__.columns}


@router.get("/api/jsw/trips")
async def jsw_trips(
    time_window: str = Query("today"),
    mode: Optional[str] = Query(
        None, regex="^(in_flight|completed)$",
        description=(
            "Trip Operations V2 filter. "
            "in_flight = out_date set + sms_ack_time null. "
            "completed = sms_ack_time set. "
            "Omit for the legacy unfiltered behaviour."
        ),
    ),
    source_lab: Optional[str] = Query(None),
    destination: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    fleet_id: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: str = Query("updated_date"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    if sort_by not in SORT_WHITELIST:
        raise HTTPException(
            400, f"sort_by must be one of {sorted(SORT_WHITELIST)}"
        )

    cutoff = _time_window_to_cutoff(time_window)
    qry = db.query(WbatnglTripMirror).filter(
        WbatnglTripMirror.updated_date >= cutoff
    )

    # Trip Operations V2 sub-tab filters. Both modes are stricter
    # subsets of the legacy unfiltered behaviour — existing callers
    # that omit `mode` keep their exact response shape.
    if mode == "in_flight":
        qry = qry.filter(
            WbatnglTripMirror.out_date.isnot(None),
            WbatnglTripMirror.sms_ack_time.is_(None),
        )
    elif mode == "completed":
        qry = qry.filter(
            WbatnglTripMirror.sms_ack_time.isnot(None),
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
            cast(WbatnglTripMirror.tap_no, String).ilike(like),
        ))

    total = qry.count()

    col = getattr(WbatnglTripMirror, sort_by)
    order = col.desc() if sort_order == "desc" else col.asc()
    rows = (qry.order_by(order)
               .offset((page - 1) * page_size)
               .limit(page_size)
               .all())

    # Batch-fetch alerts per trip_id only if any rows are in-flight /
    # have potentially-alerting state. For legacy (mode=None) callers
    # we ALSO attach alert/stage_idx — additive fields, safe to add.
    trip_ids = [r.trip_id for r in rows if r.trip_id]
    alert_by_trip = _fetch_alerts_by_trip_id(db, trip_ids)

    return {
        "rows": [_row_to_dict_v2(r, alert_by_trip.get(r.trip_id))
                 for r in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "mode": mode,
        "last_sync_at": _last_sync_at(db),
    }


def _avg_cycle_minutes(db: Session, cutoff: datetime) -> Optional[float]:
    """
    Average (closetime - first_tare_time) in minutes for rows in the window.
    Production runs on PostgreSQL where `extract('epoch', t1 - t2)` works.
    Tests run on SQLite where datetime subtraction is meaningless; on SQLite
    we use julianday-difference. Both branches return None if no eligible
    rows exist.
    """
    dialect = db.get_bind().dialect.name
    base = (db.query(WbatnglTripMirror.first_tare_time,
                     WbatnglTripMirror.closetime)
              .filter(WbatnglTripMirror.updated_date >= cutoff,
                      WbatnglTripMirror.first_tare_time.isnot(None),
                      WbatnglTripMirror.closetime.isnot(None)))
    if dialect == "postgresql":
        scalar = db.query(func.avg(
            func.extract(
                "epoch",
                WbatnglTripMirror.closetime - WbatnglTripMirror.first_tare_time,
            ) / 60.0
        )).filter(
            WbatnglTripMirror.updated_date >= cutoff,
            WbatnglTripMirror.first_tare_time.isnot(None),
            WbatnglTripMirror.closetime.isnot(None),
        ).scalar()
        return float(scalar) if scalar is not None else None

    # SQLite path — average julianday difference × 24 × 60 = minutes.
    pairs = base.all()
    if not pairs:
        return None
    deltas_min = [
        (close_t - tare_t).total_seconds() / 60.0
        for tare_t, close_t in pairs
        if tare_t is not None and close_t is not None
    ]
    if not deltas_min:
        return None
    return sum(deltas_min) / len(deltas_min)


@router.get("/api/jsw/dashboard")
async def jsw_dashboard(
    time_window: str = Query("today"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    cache_key = f"{CACHE_KEY_DASHBOARD}:{time_window}"
    cached = fleet_cache.get(cache_key)
    if cached is not None:
        return cached

    cutoff = _time_window_to_cutoff(time_window)
    window_length = datetime.utcnow() - cutoff
    prior_cutoff_start = cutoff - window_length

    base = db.query(WbatnglTripMirror).filter(
        WbatnglTripMirror.updated_date >= cutoff
    )

    # KPIs
    trips_count = base.count()
    tonnage = db.query(
        func.coalesce(func.sum(WbatnglTripMirror.net_weight), 0)
    ).filter(WbatnglTripMirror.updated_date >= cutoff).scalar()
    cycle_avg = _avg_cycle_minutes(db, cutoff)
    active = db.query(
        func.count(func.distinct(WbatnglTripMirror.fleet_id))
    ).filter(WbatnglTripMirror.updated_date >= cutoff).scalar()

    fleet_size = db.query(FleetManagement).filter(
        FleetManagement.type == "torpedo",
        FleetManagement.deleted_at.is_(None),
    ).count() or 53

    # Prior window (for delta arrows)
    prior_trips = db.query(WbatnglTripMirror).filter(
        WbatnglTripMirror.updated_date >= prior_cutoff_start,
        WbatnglTripMirror.updated_date < cutoff,
    ).count()
    prior_tonnage = db.query(
        func.coalesce(func.sum(WbatnglTripMirror.net_weight), 0)
    ).filter(
        WbatnglTripMirror.updated_date >= prior_cutoff_start,
        WbatnglTripMirror.updated_date < cutoff,
    ).scalar()

    # Producer→Consumer flow
    flow_rows = (
        db.query(
            WbatnglTripMirror.source_lab,
            WbatnglTripMirror.destination,
            func.count().label("trips"),
            func.coalesce(func.sum(WbatnglTripMirror.net_weight), 0).label("tonnage"),
            func.avg(WbatnglTripMirror.net_weight).label("avg_net"),
        )
        .filter(WbatnglTripMirror.updated_date >= cutoff)
        .group_by(WbatnglTripMirror.source_lab, WbatnglTripMirror.destination)
        .order_by(func.sum(WbatnglTripMirror.net_weight).desc())
        .all()
    )

    # Chemistry (only rows that have at least one measured value)
    chem = (
        db.query(
            func.avg(WbatnglTripMirror.temp).label("temp"),
            func.avg(WbatnglTripMirror.si_l).label("si"),
            func.avg(WbatnglTripMirror.s_l).label("s"),
        )
        .filter(
            WbatnglTripMirror.updated_date >= cutoff,
            or_(WbatnglTripMirror.temp.isnot(None),
                WbatnglTripMirror.si_l.isnot(None),
                WbatnglTripMirror.s_l.isnot(None)),
        )
        .first()
    )
    high_s = base.filter(
        WbatnglTripMirror.s_l > CHEM_THRESHOLDS["s_max"]
    ).count()
    low_temp = base.filter(
        WbatnglTripMirror.temp < CHEM_THRESHOLDS["temp_min"]
    ).count()
    high_temp = base.filter(
        WbatnglTripMirror.temp > CHEM_THRESHOLDS["temp_max"]
    ).count()

    # Recent — last 15 by updated_date desc
    recent = (
        base.order_by(WbatnglTripMirror.updated_date.desc())
            .limit(15)
            .all()
    )

    payload = {
        "kpis": {
            "trips_count": trips_count,
            "tonnage_total_mt": float(tonnage or 0),
            "avg_cycle_min": round(cycle_avg, 1) if cycle_avg else None,
            "active_torpedoes": active or 0,
            "fleet_size": fleet_size,
            "trips_count_prior": prior_trips,
            "tonnage_total_prior_mt": float(prior_tonnage or 0),
        },
        "flow": [
            {"source_lab": s, "destination": d,
             "trips": t, "tonnage_mt": float(ton or 0),
             "avg_net_mt": float(avg) if avg is not None else None}
            for s, d, t, ton, avg in flow_rows
        ],
        "chemistry": {
            "avg_temp_c": round(float(chem.temp), 1) if chem.temp is not None else None,
            "avg_si_pct": round(float(chem.si), 3) if chem.si is not None else None,
            "avg_s_pct":  round(float(chem.s), 4) if chem.s is not None else None,
            "out_of_spec_count": high_s + low_temp + high_temp,
            "out_of_spec_breakdown": {
                "high_s": high_s, "low_temp": low_temp, "high_temp": high_temp,
            },
            "thresholds": CHEM_THRESHOLDS,
        },
        "recent_trips": [_row_to_dict(r) for r in recent],
        "last_sync_at": _last_sync_at(db),
    }
    try:
        fleet_cache.set(cache_key, payload, DASHBOARD_CACHE_TTL_SEC)
    except Exception:
        logger.exception("JSW dashboard: cache set failed (non-fatal)")
    return payload


# ───────────────────────── /api/jsw/v2/exceptions ─────────────────

@router.get("/api/jsw/v2/exceptions")
async def jsw_v2_exceptions(
    window_hours: int = Query(24, ge=1, le=168),
    kind: Optional[str] = Query(
        None,
        description=(
            "Optional filter on alert kind: "
            "cold | chem_s | chem_si | dwell | gps_stale | sms_ack | battery. "
            "Omit to return all kinds."
        ),
    ),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Exceptions queue for the Trip Operations V2 sub-tab.

    Joins `alerts` (the table shipped in v2dash001) with
    `wbatngl_trip_mirror` on `trip_id`, returns one row per alert with
    enough trip context to render the queue table. Last `window_hours`
    hours by default; bounded at 7 days to keep the payload sane.

    Auth: any authenticated role (same as the rest of /api/jsw/*).
    Ack workflow reuses the existing
    `POST /api/statistics/v2/alerts/{id}/ack` endpoint — no new
    write-side mutation here.
    """
    cutoff = datetime.utcnow() - timedelta(hours=window_hours)

    # LEFT JOIN so an alert with no matching mirror row still shows up
    # (rare but possible — e.g. a fleet-level alert that doesn't carry
    # a trip_id reference). Mirror columns then default to None client-side.
    qry = (
        db.query(Alert, WbatnglTripMirror)
        .outerjoin(WbatnglTripMirror, Alert.trip_id == WbatnglTripMirror.trip_id)
        .filter(Alert.detected_at >= cutoff)
    )
    if kind:
        qry = qry.filter(Alert.kind == kind)
    qry = qry.order_by(Alert.detected_at.desc()).limit(limit)

    out = []
    for alert, mirror in qry.all():
        out.append({
            "alert_id":       alert.id,
            "kind":           alert.kind,
            "severity":       alert.severity,
            "tag":            alert.tag,
            "message":        alert.message,
            "torpedo_id":     alert.torpedo_id,
            "trip_id":        alert.trip_id,
            "detected_at":    alert.detected_at.isoformat() if alert.detected_at else None,
            "acknowledged_at": alert.acknowledged_at.isoformat() if alert.acknowledged_at else None,
            "acknowledged_by": alert.acknowledged_by,
            "raw_value":      alert.raw_value,
            "threshold":      alert.threshold,
            # mirror-side context — None if join missed
            "tap_no":         mirror.tap_no if mirror else None,
            "source_lab":     mirror.source_lab if mirror else alert.source,
            "destination":    mirror.destination if mirror else alert.destination,
            "net_weight":     float(mirror.net_weight) if (mirror and mirror.net_weight is not None) else None,
            "temp":           float(mirror.temp) if (mirror and mirror.temp is not None) else None,
            "first_tare_time": mirror.first_tare_time.isoformat() if (mirror and mirror.first_tare_time) else None,
            "sms_ack_time":   mirror.sms_ack_time.isoformat() if (mirror and mirror.sms_ack_time) else None,
            "stage_idx":      _derive_stage_idx(mirror) if mirror else None,
        })
    return {
        "window_hours": window_hours,
        "rows":         out,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# ───────────────────────── /api/jsw/v2/timeline ────────────────────

@router.get("/api/jsw/v2/timeline")
async def jsw_v2_timeline(
    hours: int = Query(12, ge=1, le=48),
    lanes_limit: int = Query(18, ge=1, le=53),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Per-torpedo gantt for the Trip Operations V2 Timeline sub-tab.

    Returns the top `lanes_limit` torpedoes by recent activity (count of
    WBATNGL rows in the window) with each torpedo's trip lanes:
      [{ trip_id, src, dst, start, end }]
    where:
      start = first_tare_time  (when the trip began)
      end   = sms_ack_time     (or None if still in-flight)

    Designed for client-side rendering as a horizontal gantt — the
    frontend handles the "now" cursor + viewport.
    """
    now = datetime.utcnow()
    cutoff = now - timedelta(hours=hours)

    # Pull all in-window rows once, group client-side.
    # WBATNGL only has ~30-100 rows per 12h window for the full fleet,
    # so single SELECT is fine — no need for an aggregate-then-detail dance.
    rows = (
        db.query(WbatnglTripMirror)
        .filter(
            or_(
                WbatnglTripMirror.first_tare_time >= cutoff,
                WbatnglTripMirror.updated_date >= cutoff,
            ),
            WbatnglTripMirror.fleet_id.isnot(None),
        )
        .order_by(WbatnglTripMirror.first_tare_time.asc())
        .all()
    )

    by_fleet: dict[str, list] = {}
    for r in rows:
        if not r.fleet_id:
            continue
        by_fleet.setdefault(r.fleet_id, []).append({
            "trip_id":  r.trip_id,
            "src":      r.source_lab,
            "dst":      r.destination,
            "start":    r.first_tare_time.isoformat() if r.first_tare_time else None,
            "end":      r.sms_ack_time.isoformat() if r.sms_ack_time else None,
            "stage_idx": _derive_stage_idx(r),
        })

    # Pull current FleetManagement.status for each torpedo (one query)
    fleet_ids = list(by_fleet.keys())
    fleet_status_by: dict[str, str] = {}
    if fleet_ids:
        fleet_rows = db.query(
            FleetManagement.fleet_id, FleetManagement.status
        ).filter(
            FleetManagement.fleet_id.in_(fleet_ids),
            FleetManagement.deleted_at.is_(None),
        ).all()
        fleet_status_by = {fid: status for fid, status in fleet_rows}

    # Rank by trip count desc (most-active torpedoes float to the top),
    # cap to lanes_limit.
    ranked = sorted(by_fleet.items(), key=lambda kv: len(kv[1]), reverse=True)
    lanes = [
        {
            "fleet_id": fid,
            "status":   fleet_status_by.get(fid, "Unknown"),
            "trips":    trips,
        }
        for fid, trips in ranked[:lanes_limit]
    ]

    return {
        "hours": hours,
        "now":   now.isoformat() + "Z",
        "cutoff": cutoff.isoformat() + "Z",
        "lanes": lanes,
    }


# ───────────────────────── /api/jsw/sync-now ──────────────────────
#
# Module-level in-flight guard so a user mashing the Refresh button
# doesn't fan out into N parallel Oracle round-trips. The 60s scheduler
# tick still runs independently — this just prevents concurrent manual
# triggers from one user. Cleared in the finally block below.
_sync_in_flight = False


@router.post("/api/jsw/sync-now")
async def jsw_sync_now(
    current_user: User = Depends(get_current_user_required),
):
    """
    Manual trigger for the WBATNGL trip-mirror sync. Runs the same
    `wbatngl_trip_sync.run_once()` job that APScheduler runs every 60s,
    off the event-loop thread so the Oracle round-trip doesn't block
    other requests.

    Wired to the JSW tab's Refresh button so users can pull fresh data
    on demand instead of waiting up to 60s for the next tick. Auth is
    `get_current_user_required` (any authenticated role) to mirror the
    read-side auth on /api/jsw/trips — no admin gating, since the read
    endpoints are already open to all authenticated users.

    Returns the same stats dict as `run_once`: fetched/upserted/
    skipped_non_torpedo/errors. If a sync triggered by *this* same
    process is already in flight, returns `{"in_flight": true}` and
    skips firing a duplicate (the in-flight job will commit shortly,
    then a fresh GET /api/jsw/trips picks up the result).
    """
    global _sync_in_flight
    import asyncio
    from ..utils.wbatngl_trip_sync import run_once

    if _sync_in_flight:
        return {"success": True, "in_flight": True}

    _sync_in_flight = True
    try:
        logger.info(
            f"WBATNGL manual trip sync requested by {current_user.username}"
        )
        stats = await asyncio.to_thread(run_once)
        # Bust dashboard cache so the next /api/jsw/dashboard read
        # recomputes from the freshly-synced mirror state.
        try:
            fleet_cache.invalidate_pattern(CACHE_KEY_DASHBOARD)
        except Exception:
            logger.exception(
                "JSW sync-now: cache invalidation failed (non-fatal)"
            )
        return {"success": True, "in_flight": False, **(stats or {})}
    finally:
        _sync_in_flight = False
