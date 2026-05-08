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
from ..database.models import FleetManagement, User, WbatnglTripMirror
from ..logger import logger
from ..utils.cache import fleet_cache
from ..utils.security import get_current_user_required


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

    return {
        "rows": [_row_to_dict(r) for r in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
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
