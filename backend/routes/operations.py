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
from sqlalchemy import String, cast, func, or_, and_
from sqlalchemy.orm import Session

from ..database.engine import get_db
from ..database.models import (
    FleetLiveLocation,
    HtsHeatMirror,
    User,
    WbatnglTripMirror,
)
from ..logger import logger
from ..utils.cache import fleet_cache
from ..utils.security import get_current_user_required


router = APIRouter(tags=["operations-live"])

# Trip ↔ heat matching window (must match the v_trip_heat_story view).
MATCH_WINDOW_BEFORE = timedelta(minutes=15)
MATCH_WINDOW_AFTER = timedelta(minutes=90)

# Six SMS3 converters tracked on Page 1. Order is the display order.
CONVERTERS = ("D", "E", "F", "G", "H", "I")

# Weight-delta anomaly threshold: |WBATNGL net - SUM(HTS hotmetal)| / WBATNGL net > 10%.
WEIGHT_DELTA_ANOMALY_PCT = 10.0

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
    """today / 24h / 7d / 30d → UTC cutoff datetime. Raises 400 otherwise."""
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

    today_cutoff = datetime.utcnow().replace(
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

    # Active trips = out_date NOT NULL AND no matched heat in window.
    # Compute in Python — small N (typically <20 active trips at a time).
    candidate_trips = (
        db.query(WbatnglTripMirror)
        .filter(WbatnglTripMirror.out_date.isnot(None))
        .order_by(WbatnglTripMirror.out_date.desc())
        .limit(200)
        .all()
    )
    active_trip_rows = [t for t in candidate_trips
                        if not find_matched_heats(db, t)]
    active_trips_now = len(active_trip_rows)

    # Idle torpedoes — latest FleetLiveLocation per fleet_id where type='Idle'.
    # Cross-dialect "row_number()-style" via correlated subquery.
    latest_per_fleet = (
        db.query(
            FleetLiveLocation.fleet_id,
            func.max(FleetLiveLocation.last_updated).label("mx"),
        )
        .group_by(FleetLiveLocation.fleet_id)
        .subquery()
    )
    idle_torpedoes = (
        db.query(FleetLiveLocation)
        .join(
            latest_per_fleet,
            and_(
                FleetLiveLocation.fleet_id == latest_per_fleet.c.fleet_id,
                FleetLiveLocation.last_updated == latest_per_fleet.c.mx,
            ),
        )
        .filter(FleetLiveLocation.type == "Idle")
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
                (datetime.utcnow() - in_progress.torpedo_in_time).total_seconds() // 60
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
    # Build a per-torpedo lookup of latest FleetLiveLocation.type.
    torpedo_ids = [t.fleet_id for t in active_trip_rows if t.fleet_id]
    latest_status_by_fleet = {}
    if torpedo_ids:
        latest_per_fleet_sq = (
            db.query(
                FleetLiveLocation.fleet_id,
                func.max(FleetLiveLocation.last_updated).label("mx"),
            )
            .filter(FleetLiveLocation.fleet_id.in_(torpedo_ids))
            .group_by(FleetLiveLocation.fleet_id)
            .subquery()
        )
        rows = (
            db.query(FleetLiveLocation)
            .join(
                latest_per_fleet_sq,
                and_(
                    FleetLiveLocation.fleet_id == latest_per_fleet_sq.c.fleet_id,
                    FleetLiveLocation.last_updated == latest_per_fleet_sq.c.mx,
                ),
            )
            .all()
        )
        latest_status_by_fleet = {r.fleet_id: r.type for r in rows}

    active_trips_payload = []
    now = datetime.utcnow()
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
        "activity_feed": [],
        "last_sync_at": _last_sync_at(db),
    }
    try:
        fleet_cache.set(CACHE_KEY_DASHBOARD, payload, DASHBOARD_CACHE_TTL_SEC)
    except Exception:
        logger.exception("ops-live dashboard: cache set failed (non-fatal)")
    return payload
