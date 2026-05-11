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
