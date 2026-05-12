"""
Live Tracking V2 — live data endpoints for the new tracking page tab.

Backs the new VERSION 2 tab on the Live Tracking page (route `/`).
1:1 layout port of `desing_idea/tracking.jsx`, adapted to V07's light
theme. Sister sprint to the Version 2 Statistics dashboard shipped
earlier today.

Three endpoints under `/api/tracking/v2/*`:

    GET /torpedoes              5s — list rows + map positions
    GET /torpedoes/{fleet_id}  10s — right-side detail panel
    GET /plant-nodes            once on mount — labelled stations

Status derivation reuses the same 7-state logic as the V2 dashboard
donut (`routes/v2_dashboard._fleet_breakdown`) but applied per-torpedo
so the list / map / filter pills all agree on bucket membership.

Design doc: docs/plans/2026-05-12-livetracking-v2-design.md
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, and_
from sqlalchemy.orm import Session

from ..constants import TripStatus
from ..database.engine import get_db
from ..database.models import (
    FleetLiveLocation,
    FleetManagement,
    LocationCoordinate,
    MaintenanceSchedule,
    Trip,
    User,
    WbatnglTripMirror,
    Weighbridge,
)
from ..logger import logger
from ..utils.security import get_current_user_required


router = APIRouter(prefix="/api/tracking/v2", tags=["tracking_v2"])


# ── Helpers ──────────────────────────────────────────────────────

def _derive_status(
    fleet_status: str,
    trip_status: Optional[int],
    has_maintenance: bool,
) -> str:
    """
    Single-torpedo version of the 7-state derivation from V2 dashboard
    `_fleet_breakdown`. Identical buckets so list filter / map color /
    donut all agree.
    """
    status = (fleet_status or "").strip()

    if status == "Maintenance":
        return "Hot Repair" if has_maintenance else "Ign Off"

    if status == "Moving":
        if trip_status is None:
            return "Returning"
        if trip_status == TripStatus.PRODUCER_EXITED:
            return "In Transit"
        if trip_status >= TripStatus.UNLOADING_ENDED:
            return "Returning"
        if TripStatus.is_at_consumer(trip_status):
            return "In Transit"  # moving while past-producer counts as transit
        return "In Transit"

    # Operating / Assigned / Idle
    if trip_status is None:
        return "Idle"
    if TripStatus.is_at_consumer(trip_status):
        return "At SMS"
    if (TripStatus.is_at_producer(trip_status) or
            trip_status in (TripStatus.WB_TARE_ENTRY,
                            TripStatus.WB_TARE_RECORDED,
                            TripStatus.ASSIGNED)):
        return "Loading"
    return "Idle"


def _now_age_sec(ts: Optional[datetime]) -> Optional[int]:
    """Seconds-since-now for a (possibly aware) timestamp. None-safe."""
    if ts is None:
        return None
    naive = ts.replace(tzinfo=None) if ts.tzinfo else ts
    return max(0, int((datetime.utcnow() - naive).total_seconds()))


def _latest_wbatngl_for_fleet(db: Session, fleet_id: str) -> Optional[WbatnglTripMirror]:
    """
    Latest WBATNGL trip row for a given fleet_id. WBATNGL uses 'TLC 19'
    (with a space) as ladleno_raw while V07 normalizes to 'TLC-19' for
    fleet_id. We index on `fleet_id` (the normalized form), so this
    matches cleanly.
    """
    return db.query(WbatnglTripMirror).filter(
        WbatnglTripMirror.fleet_id == fleet_id
    ).order_by(WbatnglTripMirror.updated_date.desc()).limit(1).first()


# ── /torpedoes — list endpoint ───────────────────────────────────

@router.get("/torpedoes")
def list_torpedoes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Returns one entry per torpedo with everything the left list + the
    map markers need in a single round-trip. ~53 rows; fast (single
    Postgres query + a couple of joined dicts).
    """
    t0 = time.monotonic()
    today = datetime.utcnow().date()

    # 1. All torpedoes (filter out soft-deleted)
    fleets = db.query(FleetManagement).filter(
        FleetManagement.deleted_at.is_(None),
        FleetManagement.type == 'torpedo',
    ).all()
    fleet_ids = [f.fleet_id for f in fleets if f.fleet_id]

    if not fleet_ids:
        return {"torpedoes": [], "generated_at": datetime.utcnow().isoformat() + "Z"}

    # 2. Latest FleetLiveLocation per fleet_id (with location_text)
    sub = db.query(
        FleetLiveLocation.fleet_id,
        func.max(FleetLiveLocation.last_updated).label("ts"),
    ).filter(
        FleetLiveLocation.fleet_id.in_(fleet_ids),
    ).group_by(FleetLiveLocation.fleet_id).subquery()
    latest_rows = db.query(FleetLiveLocation).join(
        sub,
        and_(
            FleetLiveLocation.fleet_id == sub.c.fleet_id,
            FleetLiveLocation.last_updated == sub.c.ts,
        ),
    ).all()
    by_fleet = {r.fleet_id: r for r in latest_rows}

    # 3. Latest active Trip per fleet_id (status + destination — destination
    # drives the animated transit polyline on the map for "In Transit"
    # torpedoes; we need it client-side to find the destination station).
    trip_status_by: dict[str, int] = {}
    trip_dest_by: dict[str, str] = {}
    trip_rows = db.query(
        Trip.torpedo_id, Trip.status, Trip.consumer_id,
    ).filter(
        Trip.torpedo_id.in_(fleet_ids),
        Trip.status.between(TripStatus.ASSIGNED, TripStatus.UNLOADING_ENDED),
        Trip.deleted_at.is_(None),
    ).order_by(Trip.torpedo_id, Trip.created_at.desc())
    for tid, st, dest in trip_rows:
        if tid in trip_status_by:
            continue                                                     # already have the most recent
        trip_status_by[tid] = st
        if dest:
            trip_dest_by[tid] = dest

    # 4. Maintenance overlay (which fleets are scheduled today)
    maint_rows = db.query(MaintenanceSchedule.node_id).filter(
        MaintenanceSchedule.start_date <= today,
        MaintenanceSchedule.end_date >= today,
    ).all()
    maintenance_active = {r[0] for r in maint_rows if r[0]}

    # 5. Latest temp per fleet_id from WBATNGL — for the row's right-side
    # temperature hint. One query for all fleets (avoid N+1).
    temp_sub = db.query(
        WbatnglTripMirror.fleet_id,
        func.max(WbatnglTripMirror.updated_date).label("ts"),
    ).filter(
        WbatnglTripMirror.fleet_id.in_(fleet_ids),
        WbatnglTripMirror.temp.isnot(None),
    ).group_by(WbatnglTripMirror.fleet_id).subquery()
    temp_rows = db.query(
        WbatnglTripMirror.fleet_id,
        WbatnglTripMirror.temp,
    ).join(
        temp_sub,
        and_(
            WbatnglTripMirror.fleet_id == temp_sub.c.fleet_id,
            WbatnglTripMirror.updated_date == temp_sub.c.ts,
        ),
    ).all()
    temp_by = {fid: float(t) for fid, t in temp_rows if t is not None}

    # 6. Build response — one entry per torpedo
    result = []
    for f in fleets:
        live = by_fleet.get(f.fleet_id)
        trip_status = trip_status_by.get(f.fleet_id)
        derived = _derive_status(
            f.status, trip_status, f.fleet_id in maintenance_active
        )
        result.append({
            "fleet_id":         f.fleet_id,
            "raw_status":       f.status,
            "derived_status":   derived,
            "trip_status":      trip_status,
            "destination":      trip_dest_by.get(f.fleet_id),            # for transit line endpoint
            "lat":              float(live.x) if live and live.x is not None else None,
            "lon":              float(live.y) if live and live.y is not None else None,
            "location_text":    (live.location_text if live else None),
            "last_report_sec":  _now_age_sec(live.last_updated) if live else None,
            "last_temp":        temp_by.get(f.fleet_id),
            "capacity":         f.capacity,
        })

    return {
        "torpedoes":    sorted(result, key=lambda r: r["fleet_id"]),
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "elapsed_ms":   int((time.monotonic() - t0) * 1000),
    }


# ── /torpedoes/{fleet_id} — detail endpoint ──────────────────────

@router.get("/torpedoes/{fleet_id}")
def torpedo_detail(
    fleet_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    All right-panel sections in one payload. Slower than /torpedoes
    (a few joins + a recent-trips list), so polled every other tick
    (10s) on the frontend instead of every tick.

    Sections returned:
      - header (id, derived_status, last_report_sec)
      - location (text, lat, lon)
      - current_trip (joined Trip + latest WBATNGL row, if active)
      - chemistry (latest temp/s/si from WBATNGL)
      - asset (life_cycles, campaign; sensor fields = null)
      - recent_trips (last 5 WBATNGL rows)
    """
    fleet = db.query(FleetManagement).filter(
        FleetManagement.fleet_id == fleet_id,
        FleetManagement.deleted_at.is_(None),
    ).first()
    if not fleet:
        raise HTTPException(404, f"Torpedo {fleet_id!r} not found")

    today = datetime.utcnow().date()
    in_maint = db.query(MaintenanceSchedule.id).filter(
        MaintenanceSchedule.node_id == fleet_id,
        MaintenanceSchedule.start_date <= today,
        MaintenanceSchedule.end_date >= today,
    ).first() is not None

    # Latest live location
    live = db.query(FleetLiveLocation).filter(
        FleetLiveLocation.fleet_id == fleet_id,
    ).order_by(FleetLiveLocation.last_updated.desc()).limit(1).first()

    # Active V07 trip (most recent if multiple)
    active_trip = db.query(Trip).filter(
        Trip.torpedo_id == fleet_id,
        Trip.status.between(TripStatus.ASSIGNED, TripStatus.UNLOADING_ENDED),
        Trip.deleted_at.is_(None),
    ).order_by(Trip.created_at.desc()).limit(1).first()

    # Latest WBATNGL row (for chemistry)
    latest_wb = _latest_wbatngl_for_fleet(db, fleet_id)

    # Recent 5 WBATNGL trips for the panel's "Recent Trips" list
    recent_wb = db.query(WbatnglTripMirror).filter(
        WbatnglTripMirror.fleet_id == fleet_id,
    ).order_by(WbatnglTripMirror.updated_date.desc()).limit(5).all()

    # Asset section — life_cycles = COUNT of WBATNGL trips on this TLC
    life_cycles = db.query(func.count(WbatnglTripMirror.id)).filter(
        WbatnglTripMirror.fleet_id == fleet_id,
    ).scalar() or 0
    campaign = (life_cycles // 80) + 1 if life_cycles else 0

    derived = _derive_status(
        fleet.status,
        active_trip.status if active_trip else None,
        in_maint,
    )

    # Current trip block — only populated when there's a live V07 trip
    current_trip = None
    if active_trip:
        # If WBATNGL mirror has a matching tap_no for this fleet today, use
        # its chemistry; otherwise fall back to the Trip table fields.
        wb_for_trip = None
        if active_trip.assigned_at:
            wb_for_trip = db.query(WbatnglTripMirror).filter(
                WbatnglTripMirror.fleet_id == fleet_id,
                WbatnglTripMirror.updated_date >= active_trip.assigned_at - timedelta(hours=6),
            ).order_by(WbatnglTripMirror.updated_date.desc()).limit(1).first()
        current_trip = {
            "trip_id":     active_trip.trip_id,
            "source":      active_trip.producer_id,
            "destination": active_trip.consumer_id,
            "status":      active_trip.status,
            "stage_idx":   _trip_status_to_stage(active_trip.status),
            "net_wt":      float(active_trip.net_weight_kg) if active_trip.net_weight_kg else (
                float(wb_for_trip.net_weight) if wb_for_trip and wb_for_trip.net_weight else None
            ),
            "wb_trip_id":  wb_for_trip.trip_id if wb_for_trip else None,
            "tap_no":      wb_for_trip.tap_no if wb_for_trip else None,
            "tap_hole":    wb_for_trip.tap_hole if wb_for_trip else None,
            "assigned_at": active_trip.assigned_at.isoformat() if active_trip.assigned_at else None,
        }

    return {
        "fleet_id":         fleet_id,
        "raw_status":       fleet.status,
        "derived_status":   derived,
        "last_report_sec":  _now_age_sec(live.last_updated) if live else None,
        "location": {
            "text": live.location_text if live else None,
            "lat":  float(live.x) if live and live.x is not None else None,
            "lon":  float(live.y) if live and live.y is not None else None,
        },
        "current_trip": current_trip,
        "chemistry": {
            "temp":    float(latest_wb.temp)    if latest_wb and latest_wb.temp is not None else None,
            "sulfur":  float(latest_wb.s_l)     if latest_wb and latest_wb.s_l  is not None else None,
            "silicon": float(latest_wb.si_l)    if latest_wb and latest_wb.si_l is not None else None,
            "as_of":   latest_wb.updated_date.isoformat() if latest_wb and latest_wb.updated_date else None,
        },
        "asset": {
            "life_cycles":  int(life_cycles),
            "campaign":     int(campaign),
            "shell_temp":   None,                # no sensor — design idea field, kept for UI parity
            "heel_tonnes":  None,                # no sensor
            "gps_battery":  None,                # not in vw_unit_status_ist
            "capacity":     float(fleet.capacity) if fleet.capacity is not None else None,
        },
        "recent_trips": [
            {
                "trip_id":     w.trip_id,
                "tap_no":      w.tap_no,
                "source":      w.source_lab,
                "destination": w.destination,
                "net_wt":      float(w.net_weight) if w.net_weight is not None else None,
                "temp":        float(w.temp)        if w.temp        is not None else None,
                "updated_date": w.updated_date.isoformat() if w.updated_date else None,
            }
            for w in recent_wb
        ],
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def _trip_status_to_stage(status: Optional[int]) -> int:
    """
    Map V07's 16-state TripStatus to the design's 5-stage strip
    (0=Tap, 1=Weigh, 2=Transit, 3=SMS, 4=Return).

    Duplicated from routes/v2_dashboard.py to keep the modules
    decoupled — both modules ship together but a future refactor
    might pull this to a shared util.
    """
    if status is None:
        return 0
    s = int(status)
    if s in (TripStatus.PENDING, TripStatus.ASSIGNED):
        return 0
    if s in (TripStatus.WB_TARE_ENTRY, TripStatus.WB_TARE_RECORDED):
        return 1
    if TripStatus.PRODUCER_ENTERED <= s <= TripStatus.LOADING_ENDED:
        return 1
    if s == TripStatus.PRODUCER_EXITED:
        return 2
    if s in (TripStatus.WB_GROSS_ENTRY, TripStatus.WB_GROSS_RECORDED):
        return 2
    if TripStatus.CONSUMER_ENTERED <= s <= TripStatus.UNLOADING_ENDED:
        return 3
    if s >= TripStatus.COMPLETED:
        return 4
    return 0


# ── /plant-nodes — labelled stations ─────────────────────────────

# Cached payload — plant geography changes once in a blue moon. 5min TTL.
_NODES_CACHE: dict = {"at": 0.0, "data": None}
_NODES_TTL = 300.0


@router.get("/plant-nodes")
def plant_nodes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    All labelled plant nodes for the V2 map:
      - 3 BFs + 4 SMSs from `locations_coordinates`
      - 3 weighbridges from `weighbridges`
      - YARD + REPAIR seeded into `locations_coordinates` by
        livetrack001 migration
    """
    now = time.monotonic()
    if _NODES_CACHE["data"] and (now - _NODES_CACHE["at"]) < _NODES_TTL:
        return _NODES_CACHE["data"]

    nodes = []
    # producers + consumers + yard + repair (all in LocationCoordinate)
    rows = db.query(LocationCoordinate).filter(
        LocationCoordinate.is_visible.is_(True),
    ).all()
    for r in rows:
        kind = "bf" if r.type == "producer" else (
            "sms" if r.type == "consumer" else r.type  # 'yard' / 'repair'
        )
        nodes.append({
            "id":    r.user_id or r.location_name,
            "label": r.location_name,
            "kind":  kind,
            "lat":   float(r.x) if r.x is not None else None,
            "lon":   float(r.y) if r.y is not None else None,
        })

    # weighbridges
    wb_rows = db.query(Weighbridge).filter(
        Weighbridge.is_active.is_(True),
    ).all()
    for w in wb_rows:
        nodes.append({
            "id":    w.name,
            "label": w.location_name or w.name,
            "kind":  "wb",
            "lat":   float(w.x) if w.x is not None else None,
            "lon":   float(w.y) if w.y is not None else None,
        })

    payload = {
        "nodes": [n for n in nodes if n["lat"] is not None and n["lon"] is not None],
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
    _NODES_CACHE["at"] = now
    _NODES_CACHE["data"] = payload
    return payload
