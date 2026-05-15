"""
Live Tracking V2 — live data endpoints.

Backs the (only) Live Tracking page at route `/`. Three endpoints under
`/api/tracking/v2/*`:

    GET /torpedoes              5s — list rows + map positions
    GET /torpedoes/{fleet_id}  10s — right-side detail panel
    GET /plant-nodes            once on mount — labelled stations
    GET /trip-routes            once on mount — source/dest dropdown values

Design doc: docs/plans/2026-05-15-live-tracking-v2-revamp-design.md

Architecture rule (2026-05-15):
    HMD owns the trip workflow. `Trip` table is the source for all trip
    surfaces on this page (CURRENT TRIP, RECENT TRIPS, source/dest
    filters, transit polylines). `wbatngl_trip_mirror` and `hts_heat_mirror`
    no longer feed this page — they remain as analytics/audit ground
    truth, but the live tracking detail panel surfaces nothing from them.

Status semantics (2026-05-15 revamp — decisions #1, #2, #15):
    The `status` field returned for each torpedo is the RAW SuVeechi
    value (Idle / Moving / Ign Off — and that's it). No 7-bucket
    derivation, no Trip-status overlay, no maintenance overlay. UI is
    expected to compute `is_stale` from `last_report_sec > STALE_AGE_SEC`
    and render stale rows at reduced opacity.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from ..constants import TripStatus
from ..database.engine import get_db
from ..database.models import (
    FleetLiveLocation,
    FleetManagement,
    LocationCoordinate,
    Trip,
    User,
    Weighbridge,
)
from ..logger import logger
from ..utils.security import get_current_user_required


router = APIRouter(prefix="/api/tracking/v2", tags=["tracking_v2"])


# Decision #2 — stale threshold = 1 hour.
STALE_AGE_SEC = 3600


# ── Helpers ──────────────────────────────────────────────────────

def _now_age_sec(ts: Optional[datetime]) -> Optional[int]:
    """Seconds-since-now for a (possibly aware) timestamp. None-safe."""
    if ts is None:
        return None
    naive = ts.replace(tzinfo=None) if ts.tzinfo else ts
    return max(0, int((datetime.utcnow() - naive).total_seconds()))


# Trip.status (0-15) → label string for the RECENT TRIPS column.
_TRIP_STATUS_LABELS = {
    0:  "Pending",
    1:  "Assigned",
    2:  "WB Tare Entry",
    3:  "Tare Recorded",
    4:  "Producer Entry",
    5:  "Loading Start",
    6:  "Loading End",
    7:  "Producer Exit",
    8:  "WB Gross Entry",
    9:  "Gross Recorded",
    10: "Consumer Entry",
    11: "Unloading Start",
    12: "Unloading End",
    13: "Completed",
    14: "Canceled",
    15: "Aborted",
}


def _status_label(status: Optional[int]) -> str:
    if status is None:
        return "—"
    return _TRIP_STATUS_LABELS.get(int(status), str(status))


def _trip_status_to_stage(status: Optional[int]) -> int:
    """
    Map V07's 16-state TripStatus to the 5-stage strip
    (0=Tap, 1=Weigh, 2=Transit, 3=SMS, 4=Return).
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


def _active_trip_for_fleet(db: Session, fleet_id: str) -> Optional[Trip]:
    """Latest non-deleted Trip with status in [ASSIGNED..UNLOADING_ENDED]."""
    return (
        db.query(Trip)
        .filter(
            Trip.torpedo_id == fleet_id,
            Trip.status.between(TripStatus.ASSIGNED, TripStatus.UNLOADING_ENDED),
            Trip.deleted_at.is_(None),
        )
        .order_by(Trip.created_at.desc())
        .limit(1)
        .first()
    )


def _serialize_current_trip(t: Trip) -> dict:
    """Shape used by both /torpedoes (per-row) and /torpedoes/{id}."""
    return {
        "trip_id":     t.trip_id,
        "source":      t.producer_id,
        "destination": t.consumer_id,
        "status":      t.status,
        "stage_idx":   _trip_status_to_stage(t.status),
        "net_wt":      float(t.net_weight_kg) if t.net_weight_kg is not None else None,
        "assigned_at": t.assigned_at.isoformat() if t.assigned_at else None,
    }


# ── /torpedoes — list endpoint ───────────────────────────────────

@router.get("/torpedoes")
def list_torpedoes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    One entry per torpedo with everything the left list + the map markers
    need in a single round-trip. ~53 rows; fast (single Postgres query
    + a couple of joined dicts).

    Response shape (per torpedo) — see design doc decision #15, #16:
        {
            "fleet_id":        "TLC-19",
            "status":          "Moving",            # raw SuVeechi
            "is_stale":        false,               # last_report_sec > STALE_AGE_SEC
            "lat":             15.123456,
            "lon":             76.654321,
            "location_text":   "0.07 KM S of BF4 CH8",
            "last_report_sec": 12,
            "current_trip":    {...} | null,        # from Trip table
            "capacity":        375.0
        }
    """
    t0 = time.monotonic()

    # 1. All torpedoes (active, type=torpedo)
    fleets = (
        db.query(FleetManagement)
        .filter(
            FleetManagement.deleted_at.is_(None),
            FleetManagement.type == "torpedo",
        )
        .all()
    )
    fleet_ids = [f.fleet_id for f in fleets if f.fleet_id]

    if not fleet_ids:
        return {"torpedoes": [], "generated_at": datetime.utcnow().isoformat() + "Z"}

    # 2. Latest FleetLiveLocation per fleet_id
    sub = (
        db.query(
            FleetLiveLocation.fleet_id,
            func.max(FleetLiveLocation.last_updated).label("ts"),
        )
        .filter(FleetLiveLocation.fleet_id.in_(fleet_ids))
        .group_by(FleetLiveLocation.fleet_id)
        .subquery()
    )
    latest_rows = (
        db.query(FleetLiveLocation)
        .join(
            sub,
            and_(
                FleetLiveLocation.fleet_id == sub.c.fleet_id,
                FleetLiveLocation.last_updated == sub.c.ts,
            ),
        )
        .all()
    )
    by_fleet = {r.fleet_id: r for r in latest_rows}

    # 3. Active Trip per fleet_id (most-recent first; one per fleet)
    active_trips: dict[str, Trip] = {}
    trip_rows = (
        db.query(Trip)
        .filter(
            Trip.torpedo_id.in_(fleet_ids),
            Trip.status.between(TripStatus.ASSIGNED, TripStatus.UNLOADING_ENDED),
            Trip.deleted_at.is_(None),
        )
        .order_by(Trip.torpedo_id, Trip.created_at.desc())
        .all()
    )
    for t in trip_rows:
        if t.torpedo_id not in active_trips:
            active_trips[t.torpedo_id] = t

    # 4. Build response
    result = []
    for f in fleets:
        live = by_fleet.get(f.fleet_id)
        last_age = _now_age_sec(live.last_updated) if live else None
        is_stale = last_age is not None and last_age > STALE_AGE_SEC
        active = active_trips.get(f.fleet_id)
        result.append({
            "fleet_id":         f.fleet_id,
            "status":           f.suveechi_status or "Idle",   # raw SuVeechi, default Idle
            "is_stale":         is_stale,
            "lat":              float(live.x) if live and live.x is not None else None,
            "lon":              float(live.y) if live and live.y is not None else None,
            "location_text":    (live.location_text if live else None),
            "last_report_sec":  last_age,
            "current_trip":     _serialize_current_trip(active) if active else None,
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
    Right-side panel payload. 4 sections per design doc (decisions #5-#8):

        - header  (fleet_id, raw status, last_report_sec, is_stale)
        - location (text, lat, lon)
        - current_trip — from Trip table (or None)
        - recent_trips — last 5 trips from Trip table where
          status IN (COMPLETED, CANCELED, ABORTED) for this torpedo

    Polled every other 5s tick (10s) on the frontend.
    """
    fleet = (
        db.query(FleetManagement)
        .filter(
            FleetManagement.fleet_id == fleet_id,
            FleetManagement.deleted_at.is_(None),
        )
        .first()
    )
    if not fleet:
        raise HTTPException(404, f"Torpedo {fleet_id!r} not found")

    # Latest live location
    live = (
        db.query(FleetLiveLocation)
        .filter(FleetLiveLocation.fleet_id == fleet_id)
        .order_by(FleetLiveLocation.last_updated.desc())
        .limit(1)
        .first()
    )
    last_age = _now_age_sec(live.last_updated) if live else None
    is_stale = last_age is not None and last_age > STALE_AGE_SEC

    # Active trip (from Trip table)
    active = _active_trip_for_fleet(db, fleet_id)

    # Recent completed/canceled/aborted trips — last 5
    finished_statuses = (TripStatus.COMPLETED, TripStatus.CANCELED, TripStatus.ABORTED)
    recent_rows = (
        db.query(Trip)
        .filter(
            Trip.torpedo_id == fleet_id,
            Trip.status.in_(finished_statuses),
            Trip.deleted_at.is_(None),
        )
        .order_by(
            func.coalesce(Trip.c_exited_at, Trip.created_at).desc()
        )
        .limit(5)
        .all()
    )

    return {
        "fleet_id":        fleet_id,
        "status":          fleet.suveechi_status or "Idle",
        "is_stale":        is_stale,
        "last_report_sec": last_age,
        "location": {
            "text": live.location_text if live else None,
            "lat":  float(live.x) if live and live.x is not None else None,
            "lon":  float(live.y) if live and live.y is not None else None,
        },
        "current_trip": _serialize_current_trip(active) if active else None,
        "recent_trips": [
            {
                "trip_id":      r.trip_id,
                "source":       r.producer_id,
                "destination":  r.consumer_id,
                "status":       r.status,
                "status_label": _status_label(r.status),
                "net_wt":       float(r.net_weight_kg) if r.net_weight_kg is not None else None,
                "completed_at": (r.c_exited_at or r.created_at).isoformat() if (r.c_exited_at or r.created_at) else None,
            }
            for r in recent_rows
        ],
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


# ── /trip-routes — distinct sources & destinations ───────────────

# Cached briefly — source/dest values change only when operators add
# new routes via Trip Management. 60s TTL means the dropdowns refresh
# within a minute of a new route appearing without hammering the DB on
# every list-panel mount.
_ROUTES_CACHE: dict = {"at": 0.0, "data": None}
_ROUTES_TTL = 60.0


@router.get("/trip-routes")
def trip_routes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Distinct producer_id and consumer_id values from the Trip table.
    Feeds the source / destination dropdowns above the torpedo list.

    Empty arrays when no trips exist yet — frontend shows only "All".
    """
    now = time.monotonic()
    if _ROUTES_CACHE["data"] and (now - _ROUTES_CACHE["at"]) < _ROUTES_TTL:
        return _ROUTES_CACHE["data"]

    src_rows = (
        db.query(Trip.producer_id)
        .filter(Trip.deleted_at.is_(None), Trip.producer_id.isnot(None))
        .distinct()
        .all()
    )
    dst_rows = (
        db.query(Trip.consumer_id)
        .filter(Trip.deleted_at.is_(None), Trip.consumer_id.isnot(None))
        .distinct()
        .all()
    )

    payload = {
        "sources":      sorted({s[0] for s in src_rows if s[0]}),
        "destinations": sorted({d[0] for d in dst_rows if d[0]}),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
    _ROUTES_CACHE["at"] = now
    _ROUTES_CACHE["data"] = payload
    return payload


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
      - BFs (type='producer') + SMSs (type='consumer') from `locations_coordinates`
      - Weighbridges from `weighbridges`

    Decision #20 (2026-05-15): YARD and REPAIR rows are not returned.
    The operator manages this via the location registry directly
    (delete the rows or set is_visible=False). This endpoint just
    honors `is_visible` — no special-casing needed.
    """
    now = time.monotonic()
    if _NODES_CACHE["data"] and (now - _NODES_CACHE["at"]) < _NODES_TTL:
        return _NODES_CACHE["data"]

    nodes = []
    rows = (
        db.query(LocationCoordinate)
        .filter(LocationCoordinate.is_visible.is_(True))
        .all()
    )
    for r in rows:
        if r.type == "producer":
            kind = "bf"
        elif r.type == "consumer":
            kind = "sms"
        else:
            # 'yard' / 'repair' / future types — pass through. Operator
            # controls visibility via the registry's is_visible flag.
            kind = r.type
        nodes.append({
            "id":    r.user_id or r.location_name,
            "label": r.location_name,
            "kind":  kind,
            "lat":   float(r.x) if r.x is not None else None,
            "lon":   float(r.y) if r.y is not None else None,
        })

    wb_rows = (
        db.query(Weighbridge)
        .filter(Weighbridge.is_active.is_(True))
        .all()
    )
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
