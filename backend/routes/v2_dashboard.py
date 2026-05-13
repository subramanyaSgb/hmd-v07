"""
Version 2 Dashboard — live data endpoints.

Backs the new "VERSION 2" tab on /statistics (mounted to the left of
PERFORMANCE / DEVIATION in Statistics.jsx). 1:1 layout match with
desing_idea/dashboard.jsx; data sourced from V07's existing mirror
tables (WbatnglTripMirror + HtsHeatMirror) plus the new `alerts`
table (see utils/alert_detector.py).

Endpoint structure is hybrid — one fast aggregated endpoint
(/overview) for cards lit up on first paint, plus separate endpoints
for the heavy sections that the frontend can refresh on their own
cadence:

    /overview                     10s — KPIs + fleet donut + shift bars
    /throughput?range=...         60s — area chart data
    /sankey                       60s — BF→SMS flow
    /active-trips?limit=...       10s — trip table rows
    /alerts?window=60m            10s — exception feed
    /alerts/{id}/ack  (POST)      on-click
    /chemistry-distribution       60s — temp histogram bins
    /system-health                30s — probe 3 upstream DBs

Design doc: docs/plans/2026-05-12-version2-dashboard-design.md
"""
from __future__ import annotations

import os
import statistics
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ..constants import TripStatus
from ..database.engine import get_db
from ..database.models import (
    Alert,
    FleetLiveLocation,
    FleetManagement,
    HtsHeatMirror,
    ShiftConfig,
    Trip,
    User,
    WbatnglTripMirror,
)
from ..logger import logger
from ..utils.security import get_current_user_required


router = APIRouter(prefix="/api/statistics/v2", tags=["v2_dashboard"])


# ── Helpers ──────────────────────────────────────────────────────

# WBATNGL and HTS Oracle source tables store timestamps as IST-naive
# wall-clock datetimes (no tzinfo, IST values). To compare with these in
# elapsed-time / time-window calculations we need "now" in the same
# IST-naive frame. Same pattern as backend/routes/operations.py:43-49.
# Before 2026-05-13 the helpers below used UTC anchors; between 00:00
# and 05:30 IST every day the "today" filter wrongly absorbed yesterday
# (see changes_tracker.md #173).
_IST_OFFSET = timedelta(hours=5, minutes=30)

# "Active trip" = WBATNGL trip that left BF (out_date set) but hasn't been
# acked at SMS (sms_ack_time null), bounded to the last N hours so stale
# forgotten-ack rows don't inflate the counter. Must stay in sync with
# operations.py:66 — same definition; consider extracting to a shared
# constants module if a third callsite appears.
ACTIVE_TRIP_WINDOW_HOURS = 6


def _now_ist_naive() -> datetime:
    """UTC now + 5:30 → IST wall-clock naive datetime, matching the
    convention used by WBATNGL.OUT_DATE / HTS.TORPEDO_IN_TIME etc."""
    return datetime.utcnow() + _IST_OFFSET


def _start_of_day_ist() -> datetime:
    """IST-naive midnight today. Compared against IST-naive WBATNGL
    columns (out_date / closetime / sms_ack_time / etc.)."""
    return _now_ist_naive().replace(hour=0, minute=0, second=0, microsecond=0)


def _hours_ago(h: int) -> datetime:
    """IST-naive 'h hours ago'. Anchored on _now_ist_naive() so the
    rolling window aligns with WBATNGL's IST-naive timestamps."""
    return _now_ist_naive() - timedelta(hours=h)


def _shift_from_hour(hour: int, shifts: list[ShiftConfig]) -> Optional[str]:
    """
    Resolve the configured shift name for a given clock hour. If no
    shifts are configured, returns None (caller falls back to a fixed
    A/B/C scheme).
    """
    for s in shifts:
        if not s.is_active:
            continue
        start, end = s.start_hour, s.end_hour
        if start <= end:
            if start <= hour < end:
                return s.shift_name
        else:
            # wraparound: e.g. C 22:00 → 06:00
            if hour >= start or hour < end:
                return s.shift_name
    return None


def _fleet_breakdown(db: Session) -> dict:
    """
    3-bucket donut classifier — MAINTENANCE / ACTIVE / IDLE. First match wins:

      1. FleetManagement.status == "Maintenance"        →  MAINTENANCE
      2. has-in-flight-trip OR status == "Moving"       →  ACTIVE
      3. else                                           →  IDLE

    `has-in-flight-trip` = WbatnglTripMirror row exists for this torpedo
    where out_date IS NOT NULL, sms_ack_time IS NULL, out_date >=
    now_ist - ACTIVE_TRIP_WINDOW_HOURS. Same definition as Card 2 KPI —
    single source of truth for "in flight".

    History (changes_tracker #182):
      - Pre-fix this returned 7 buckets (Loading / In Transit / At SMS /
        Returning / Idle / Hot Repair / Ign Off). 3 were always 0 because
        the trip-stage classifier read V07's empty Trip table.
      - Hot Repair bucket required MaintenanceSchedule rows, but probe
        (test_fleet_donut_probe.py) confirmed the table is empty on BF4.
      - V07 Trip + MaintenanceSchedule lookups dropped entirely.
      - IST timezone bug at the old `today = datetime.utcnow().date()`
        line is now moot — no date comparison left.

    Returns:
      {"total": 53, "breakdown": {"MAINTENANCE": 4, "ACTIVE": 6, "IDLE": 43}}
    """
    in_flight_floor = _now_ist_naive() - timedelta(hours=ACTIVE_TRIP_WINDOW_HOURS)
    in_flight_rows = db.query(WbatnglTripMirror.fleet_id).filter(
        WbatnglTripMirror.out_date.isnot(None),
        WbatnglTripMirror.sms_ack_time.is_(None),
        WbatnglTripMirror.out_date >= in_flight_floor,
        WbatnglTripMirror.fleet_id.isnot(None),
    ).distinct().all()
    in_flight_set = {r[0] for r in in_flight_rows}

    fleets = db.query(FleetManagement).filter(
        FleetManagement.deleted_at.is_(None),
    ).all()

    buckets = {"MAINTENANCE": 0, "ACTIVE": 0, "IDLE": 0}
    for f in fleets:
        status = (f.status or "").strip()
        if status == "Maintenance":
            # Wins even if a stale in-flight trip exists (see TLC-36 case
            # 2026-05-13 — torpedo went to maintenance mid-trip and the
            # trip was never acked; data-hygiene anomaly to investigate
            # separately, but the bucket assignment is correct).
            buckets["MAINTENANCE"] += 1
        elif f.fleet_id in in_flight_set or status == "Moving":
            buckets["ACTIVE"] += 1
        else:
            buckets["IDLE"] += 1

    return {"total": len(fleets), "breakdown": buckets}


def _today_wbatngl_query(db: Session):
    """Base query — WbatnglTripMirror rows with closetime in today (IST).
    Currently unused; kept for symmetry with future per-card helpers."""
    return db.query(WbatnglTripMirror).filter(
        WbatnglTripMirror.closetime >= _start_of_day_ist(),
    )


# ── /overview ────────────────────────────────────────────────────

@router.get("/overview")
def overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Fast aggregated endpoint for first paint. KPIs + fleet donut + shift
    bars in one round trip. System health is NOT included — it probes
    external Oracle/MySQL and gets its own slower endpoint.
    """
    t0 = time.monotonic()
    start_today = _start_of_day_ist()
    yesterday = _hours_ago(24)

    # ── KPIs ────────────────────────────────────────────────────
    # 1) Hot Metal Dispatched today (kt) + hourly sparkline (last 24h).
    #
    # Semantic = BF-side output (Option A, user-confirmed 2026-05-13).
    # "Dispatched" anchors on out_date (BF gate exit, see jsw.py:30-49
    # stage map), with closetime fallback so we don't undercount rows
    # weighed-but-not-yet-gate-stamped. Matches the anchor used in
    # heat_trace.py:73-76 and operations.py:201.
    dispatch_ts = func.coalesce(
        WbatnglTripMirror.out_date,
        WbatnglTripMirror.closetime,
    )

    today_rows = db.query(
        func.sum(WbatnglTripMirror.net_weight).label("sum_net"),
    ).filter(
        dispatch_ts >= start_today,
    ).first()
    hm_dispatched_kt = float(today_rows.sum_net or 0) / 1000.0

    # Sparkline: dense 24-bucket array (one entry per hour, oldest→newest).
    # Pre-fix bug: GROUP BY hr dropped empty hours, and the left-pad
    # collapsed the time axis whenever any hour had zero trips. Now we
    # build an explicit hour-keyed dict and index by hour offset so the
    # x-axis is always honest.
    hour_bucket = func.date_trunc('hour', dispatch_ts)
    hourly_q = db.query(
        hour_bucket.label("hr"),
        func.coalesce(func.sum(WbatnglTripMirror.net_weight), 0).label("net"),
    ).filter(
        dispatch_ts >= yesterday,
    ).group_by("hr").order_by("hr").all()

    by_hour = {row.hr: float(row.net or 0) for row in hourly_q if row.hr is not None}
    spark_anchor = _now_ist_naive().replace(minute=0, second=0, microsecond=0)
    sparkline = []
    for offset in range(23, -1, -1):                                     # 24 → 1 hours ago, then 0
        bucket = spark_anchor - timedelta(hours=offset)
        sparkline.append(by_hour.get(bucket, 0.0))

    # 2) Active trips — in-flight definition (Option A, user-confirmed
    # 2026-05-13): WBATNGL trip departed BF (out_date set), not yet
    # acknowledged at SMS (sms_ack_time null), within the last
    # ACTIVE_TRIP_WINDOW_HOURS so we don't include stale forgotten-ack
    # rows. Matches operations.py:201 definition exactly.
    #
    # Pre-fix bug (changes_tracker #174): this counted V07's manual `Trip`
    # table, which is effectively empty on BF4 because operators never
    # create manual trips — real trip data flows from JSW's WBATNGL system
    # via the wbatngl_trip_sync job. The KPI was therefore stuck at 0
    # while the very same dashboard's bottom Active Trips table (which
    # correctly reads WbatnglTripMirror) showed 5-7 live rows.
    active_window_floor = _now_ist_naive() - timedelta(hours=ACTIVE_TRIP_WINDOW_HOURS)
    active_trips = db.query(func.count(WbatnglTripMirror.id)).filter(
        WbatnglTripMirror.out_date.isnot(None),
        WbatnglTripMirror.sms_ack_time.is_(None),
        WbatnglTripMirror.out_date >= active_window_floor,
    ).scalar() or 0

    # "of 53 torpedoes" denominator = gross fleet count (FleetManagement
    # soft-delete filter), per user decision 2026-05-13. Includes Hot
    # Repair + Ign Off because the sub-label says "torpedoes" (gross),
    # not "in-service".
    total_torpedoes = db.query(func.count(FleetManagement.id)).filter(
        FleetManagement.deleted_at.is_(None),
    ).scalar() or 0

    # 3) Cycle time (min) — full BF arrival → SMS ack on trips that
    # FINISHED today. Filter is anchored on the cycle's END (sms_ack_time
    # >= today) rather than its middle (closetime >= today) so trips that
    # started late yesterday and acked today are counted honestly.
    # Reports MEDIAN instead of arithmetic mean — robust to occasional
    # 12h+ overnight-queue outliers without dropping data. Verified
    # 2026-05-13 via test_avg_cycle_probe.py: mean (397.1) and median
    # (379.4) were within 18 min today; median is the safer choice for
    # future days when a single outlier could pull the mean significantly.
    cycle_rows = db.query(
        WbatnglTripMirror.first_tare_time,
        WbatnglTripMirror.sms_ack_time,
    ).filter(
        WbatnglTripMirror.sms_ack_time >= start_today,
        WbatnglTripMirror.first_tare_time.isnot(None),
        WbatnglTripMirror.sms_ack_time.isnot(None),
    ).all()
    cycle_durations = [
        (ack - tare).total_seconds() / 60.0
        for tare, ack in cycle_rows
        if ack and tare and ack > tare
    ]
    # Key stays `avg_cycle_min` so the frontend payload doesn't change.
    # The value is the MEDIAN of cycle durations; the sub-label on the
    # card already calls it "AVG CYCLE" which the user accepts as
    # "typical cycle". Field rename deferred to avoid frontend churn.
    avg_cycle_min = round(statistics.median(cycle_durations), 1) if cycle_durations else 0

    # 4) BF tap temp (°C) — average of WBATNGL.temp on trips closed in last 24h.
    #
    # Re-purposed 2026-05-13 (changes_tracker #178) from a "BF − SMS temp
    # drop" calc that always returned 0. The original intent was to subtract
    # HTS-receive temperature from BF tap temperature, but the SMS-receive
    # temp (WBATNGL.bds_temp / upstream HTS_BDS_TEMP) is never populated in
    # our mirror — verified by test_temp_drop_probe.py over 2,314 rows / 30
    # days / 6 source-labs / 2 source-tables: zero rows ever had bds_temp.
    # JSW does not appear to capture SMS-receive temperature in any data
    # source we have access to (HTS mirror has no temp columns either).
    #
    # BF tap temp by contrast is well-populated (97% of last-24h rows) with
    # plausible values (1387-1578 °C, mean 1488). That's a meaningful KPI
    # on its own — tap-temp drift signals BF furnace issues. So instead of
    # showing 0 forever, we surface the avg BF tap temp.
    bf_tap_temp_avg = db.query(
        func.avg(WbatnglTripMirror.temp),
    ).filter(
        WbatnglTripMirror.closetime >= yesterday,
        WbatnglTripMirror.temp.isnot(None),
    ).scalar()
    avg_bf_tap_temp = round(float(bf_tap_temp_avg), 1) if bf_tap_temp_avg else 0

    # KPIs 5 (ON-SPEC %) and 6 (CHEM ALERTS) were dropped 2026-05-13 per
    # user decision (changes_tracker #181). The frontend KPIRow is now
    # a 4-card grid instead of 6. SystemConfig keys SPEC_S_MAX /
    # SPEC_SI_MIN / SPEC_SI_MAX remain seeded by init_db.py — harmless,
    # may be useful if these KPIs are ever resurrected. The bottom-row
    # Alerts & Exceptions widget reads from a separate /alerts endpoint
    # and is unaffected by this drop.

    # ── Fleet donut ─────────────────────────────────────────────
    fleet_payload = _fleet_breakdown(db)

    # ── Shift bars (today, grouped by WBATNGL.shift) ────────────
    shift_rows = db.query(
        WbatnglTripMirror.shift,
        func.count(WbatnglTripMirror.id).label("trips"),
        func.coalesce(func.sum(WbatnglTripMirror.net_weight), 0).label("tonnes"),
    ).filter(
        WbatnglTripMirror.closetime >= start_today,
        WbatnglTripMirror.shift.isnot(None),
    ).group_by(WbatnglTripMirror.shift).all()
    shifts_cfg = db.query(ShiftConfig).filter(ShiftConfig.is_active.is_(True)).all()
    current_shift = _shift_from_hour(datetime.now().hour, shifts_cfg)
    shift_payload = []
    seen = set()
    for s in (shifts_cfg or []):
        match = next((r for r in shift_rows if r.shift == s.shift_name), None)
        trips = int(match.trips) if match else 0
        tonnes = float(match.tonnes) if match else 0
        shift_payload.append({
            "id":     s.shift_name,
            "range":  f"{s.start_hour:02d}:00 – {s.end_hour:02d}:00",
            "trips":  trips,
            "tonnes": round(tonnes, 1),
            "is_active": s.shift_name == current_shift,
        })
        seen.add(s.shift_name)
    # if no ShiftConfig rows exist yet, fall back to A/B/C 8-hour schedule
    if not shift_payload:
        defaults = [("A", 6, 14), ("B", 14, 22), ("C", 22, 6)]
        for name, sh, eh in defaults:
            match = next((r for r in shift_rows if r.shift == name), None)
            shift_payload.append({
                "id": name,
                "range": f"{sh:02d}:00 – {eh:02d}:00",
                "trips": int(match.trips) if match else 0,
                "tonnes": float(match.tonnes) if match else 0,
                "is_active": _is_hour_in(datetime.now().hour, sh, eh),
            })

    elapsed_ms = int((time.monotonic() - t0) * 1000)
    return {
        "kpis": {
            "hot_metal_dispatched_kt": round(hm_dispatched_kt, 1),
            "hot_metal_sparkline":     sparkline,
            "active_trips":            int(active_trips),
            "total_torpedoes":         int(total_torpedoes),
            "avg_cycle_min":           avg_cycle_min,
            "avg_bf_tap_temp_c":       avg_bf_tap_temp,
            # ON-SPEC and CHEM ALERTS payload fields removed 2026-05-13
            # (changes_tracker #181 — cards dropped from KPI row).
        },
        "fleet":  fleet_payload,
        "shifts": shift_payload,
        "current_shift": current_shift,
        "generated_at":  datetime.utcnow().isoformat() + "Z",
        "elapsed_ms":    elapsed_ms,
    }


def _is_hour_in(h: int, start: int, end: int) -> bool:
    if start <= end:
        return start <= h < end
    return h >= start or h < end


# ── /throughput ──────────────────────────────────────────────────

@router.get("/throughput")
def throughput(
    range: str = Query("24h", regex="^(24h|7d|30d)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Hot Metal Throughput area chart. Grouped by hour for 24h, by day for
    7d/30d. Returns a flat list of {label, value} so the frontend just
    plots it.
    """
    now = datetime.utcnow()
    if range == "24h":
        cutoff = now - timedelta(hours=24)
        bucket = func.date_trunc('hour', WbatnglTripMirror.closetime)
        fmt = "%H:%M"
    elif range == "7d":
        cutoff = now - timedelta(days=7)
        bucket = func.date_trunc('day', WbatnglTripMirror.closetime)
        fmt = "%d %b"
    else:                                                                # 30d
        cutoff = now - timedelta(days=30)
        bucket = func.date_trunc('day', WbatnglTripMirror.closetime)
        fmt = "%d %b"

    rows = db.query(
        bucket.label("bucket"),
        func.coalesce(func.sum(WbatnglTripMirror.net_weight), 0).label("net"),
    ).filter(
        WbatnglTripMirror.closetime >= cutoff,
    ).group_by("bucket").order_by("bucket").all()

    return {
        "range": range,
        "points": [
            {"label": r.bucket.strftime(fmt), "value": round(float(r.net or 0), 1)}
            for r in rows
        ],
    }


# /sankey endpoint removed 2026-05-13 (changes_tracker #181) — the
# Producer→Consumer flow card was dropped from the V2 dashboard per
# user decision. The FlowSankey.jsx component file remains under
# frontend/src/components/Statistics/V2/ for reference / future re-use
# but is no longer imported anywhere.


# ── /active-trips ────────────────────────────────────────────────

@router.get("/active-trips")
def active_trips(
    limit: int = Query(7, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Active trip table rows. Join V07 Trip + WBATNGL mirror by tap_no /
    fleet_id to surface chemistry alongside trip lifecycle stage. Falls
    back to mirror-only rows if no matching V07 Trip exists.
    """
    now = datetime.utcnow()
    yesterday = _hours_ago(24)

    # WBATNGL rows updated in the last 24h — these are the "in-flight"
    # candidates. We then enrich with Trip.status if a matching torpedo
    # has an active V07 Trip.
    mirror_rows = db.query(WbatnglTripMirror).filter(
        WbatnglTripMirror.updated_date >= yesterday,
    ).order_by(WbatnglTripMirror.updated_date.desc()).limit(limit * 3).all()

    # batch-fetch active Trip.status per fleet_id
    fleet_ids = [r.fleet_id for r in mirror_rows if r.fleet_id]
    trip_rows = db.query(Trip.torpedo_id, Trip.status).filter(
        Trip.torpedo_id.in_(fleet_ids),
        Trip.status.between(TripStatus.ASSIGNED, TripStatus.UNLOADING_ENDED),
        Trip.deleted_at.is_(None),
    ).order_by(Trip.torpedo_id, Trip.created_at.desc()).all() if fleet_ids else []
    trip_status_by: dict[str, int] = {}
    for tid, st in trip_rows:
        trip_status_by.setdefault(tid, st)

    # latest alert per torpedo for the small alert tag in the table
    alert_rows = db.query(
        Alert.torpedo_id, Alert.kind, Alert.tag,
    ).filter(
        Alert.acknowledged_at.is_(None),
        Alert.torpedo_id.in_(fleet_ids),
    ).order_by(Alert.torpedo_id, Alert.detected_at.desc()).all() if fleet_ids else []
    alert_by: dict[str, dict] = {}
    for tid, kind, tag in alert_rows:
        alert_by.setdefault(tid, {"kind": kind, "tag": tag})

    result = []
    for m in mirror_rows:
        if len(result) >= limit:
            break
        trip_status = trip_status_by.get(m.fleet_id)
        stage_idx = _trip_status_to_stage(trip_status)
        age_min = None
        if m.first_tare_time:
            ref = m.sms_ack_time or now
            age_min = int(max(0, (ref - m.first_tare_time).total_seconds() / 60))
        result.append({
            "trip_id":     m.trip_id,
            "ladle":       m.fleet_id,
            "tap_no":      m.tap_no,
            "tap_hole":    m.tap_hole,
            "source":      m.source_lab,
            "destination": m.destination,
            "net_wt":      round(float(m.net_weight or 0), 1),
            "temp":        round(float(m.temp), 0) if m.temp is not None else None,
            "sulfur":      round(float(m.s_l), 3) if m.s_l is not None else None,
            "silicon":     round(float(m.si_l), 2) if m.si_l is not None else None,
            "stage_idx":   stage_idx,
            "trip_status": trip_status,
            "age_min":     age_min,
            "alert":       alert_by.get(m.fleet_id),
        })
    return {"trips": result, "generated_at": datetime.utcnow().isoformat() + "Z"}


def _trip_status_to_stage(status: Optional[int]) -> int:
    """
    Map V07's 16-state TripStatus to the design's 5-stage strip:
      0 Tap  ·  1 Weigh  ·  2 Transit  ·  3 SMS  ·  4 Return

    Returns 0 when status is None (= phase unknown, we still show stage 0
    so the dot strip renders).
    """
    if status is None:
        return 0
    s = int(status)
    if s in (TripStatus.PENDING, TripStatus.ASSIGNED):
        return 0  # Tap
    if s in (TripStatus.WB_TARE_ENTRY, TripStatus.WB_TARE_RECORDED):
        return 1  # Weigh
    if TripStatus.PRODUCER_ENTERED <= s <= TripStatus.PRODUCER_EXITED:
        return 1  # still at producer
    if s == TripStatus.PRODUCER_EXITED:
        return 2  # In Transit
    if s in (TripStatus.WB_GROSS_ENTRY, TripStatus.WB_GROSS_RECORDED):
        return 2  # Transit (weighbridge intermediate)
    if TripStatus.CONSUMER_ENTERED <= s <= TripStatus.UNLOADING_ENDED:
        return 3  # SMS
    if s >= TripStatus.COMPLETED:
        return 4  # Return
    return 0


# ── /alerts ──────────────────────────────────────────────────────

@router.get("/alerts")
def alerts_feed(
    window: str = Query("60m", regex="^(60m|6h|24h)$"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Recent alerts feed for the dashboard right column. Includes
    acknowledged rows so users can see what was recently resolved.
    """
    if window == "60m":
        cutoff = datetime.utcnow() - timedelta(minutes=60)
    elif window == "6h":
        cutoff = _hours_ago(6)
    else:
        cutoff = _hours_ago(24)

    rows = db.query(Alert).filter(
        Alert.detected_at >= cutoff,
    ).order_by(Alert.detected_at.desc()).limit(limit).all()

    return {
        "window": window,
        "alerts": [
            {
                "id":              a.id,
                "kind":            a.kind,
                "severity":        a.severity,
                "tag":             a.tag,
                "message":         a.message,
                "location":        a.location,
                "torpedo_id":      a.torpedo_id,
                "trip_id":         a.trip_id,
                "source":          a.source,
                "destination":     a.destination,
                "raw_value":       a.raw_value,
                "threshold":       a.threshold,
                "detected_at":     a.detected_at.isoformat() if a.detected_at else None,
                "acknowledged_at": a.acknowledged_at.isoformat() if a.acknowledged_at else None,
                "acknowledged_by": a.acknowledged_by,
            }
            for a in rows
        ],
    }


@router.post("/alerts/{alert_id}/ack")
def acknowledge_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    a = db.query(Alert).filter(Alert.id == alert_id).first()
    if not a:
        raise HTTPException(404, "Alert not found")
    if a.acknowledged_at:
        return {"id": a.id, "already_acked": True}
    a.acknowledged_at = datetime.utcnow()
    a.acknowledged_by = current_user.username
    db.commit()
    return {"id": a.id, "acknowledged_at": a.acknowledged_at.isoformat(),
            "acknowledged_by": a.acknowledged_by}


# ── /chemistry-distribution ──────────────────────────────────────

@router.get("/chemistry-distribution")
def chemistry_distribution(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Temperature histogram bins over last 24h. Returns bin edges, counts
    and summary stats. Frontend renders as a BarChart (Recharts).
    """
    cutoff = _hours_ago(24)
    temps_rows = db.query(WbatnglTripMirror.temp).filter(
        WbatnglTripMirror.closetime >= cutoff,
        WbatnglTripMirror.temp.isnot(None),
    ).all()
    temps = [float(r[0]) for r in temps_rows if r[0] is not None]

    if not temps:
        return {
            "bins": [], "labels": [], "mean": 0, "stddev": 0, "below_cutoff": 0,
            "cutoff": 1450, "total": 0,
        }

    # 20°C-wide bins from 1420 to 1580 (9 bins) — matches design idea
    edges = list(range(1420, 1600, 20))                                  # 1420,1440,...,1580
    counts = [0] * (len(edges) - 1)
    for t in temps:
        if t < edges[0]:
            counts[0] += 1
        elif t >= edges[-1]:
            counts[-1] += 1
        else:
            idx = int((t - edges[0]) // 20)
            counts[idx] += 1

    mean = sum(temps) / len(temps)
    var = sum((t - mean) ** 2 for t in temps) / len(temps)
    stddev = var ** 0.5
    below_cutoff = sum(1 for t in temps if t < 1450)

    return {
        "labels":       [str(e) for e in edges[:-1]],
        "edges":        edges,
        "bins":         counts,
        "mean":         round(mean, 1),
        "stddev":       round(stddev, 1),
        "below_cutoff": below_cutoff,
        "cutoff":       1450,
        "total":        len(temps),
    }


# ── /system-health ───────────────────────────────────────────────

# Cache so we don't probe Oracle on every poll. 30s TTL aligns with the
# frontend refresh cadence; if a single probe takes 600ms+ (HTS does on
# occasion) we still serve fresh enough state.
_SYSHEALTH_CACHE: dict = {"at": 0.0, "data": None}
_SYSHEALTH_TTL = 30.0


def _probe_postgres(db: Session) -> dict:
    """Latency check against the local Postgres."""
    start = time.monotonic()
    try:
        db.execute(text("SELECT 1")).scalar()                            # cheap round-trip
        latency_ms = int((time.monotonic() - start) * 1000)
        last_sync = db.query(func.max(WbatnglTripMirror.synced_at)).scalar()
        return {
            "id":       "postgres",
            "label":    "HMD (Postgres)",
            "engine":   "PostgreSQL",
            "host":     f"{os.getenv('DATABASE_HOST', 'localhost')}:{os.getenv('DATABASE_PORT', '5432')}",
            "db":       os.getenv("DATABASE_NAME", "hmd"),
            "status":   "online",
            "latency":  latency_ms,
            "last_sync": last_sync.isoformat() if last_sync else None,
        }
    except Exception as e:
        return {
            "id": "postgres", "label": "HMD (Postgres)",
            "engine": "PostgreSQL", "status": "degraded",
            "latency": None, "last_sync": None, "error": str(e),
        }


def _probe_wbatngl_mirror_freshness(db: Session) -> dict:
    """
    We can't easily ping the upstream Oracle synchronously inside a
    request (no pooled connection, thick-client init is expensive). Read
    `MAX(synced_at)` from the mirror table — if it's recent the sync job
    is alive. Same logic for HTS.
    """
    last_sync = db.query(func.max(WbatnglTripMirror.synced_at)).scalar()
    age_s = None
    status = "offline"
    if last_sync:
        age_s = (datetime.utcnow() - last_sync.replace(tzinfo=None) if last_sync.tzinfo else datetime.utcnow() - last_sync).total_seconds()
        # WBATNGL ticks every 60s — give it 3x grace
        status = "online" if age_s < 180 else ("degraded" if age_s < 600 else "offline")
    return {
        "id":      "wbatngl",
        "label":   "WBATNGL (BF Weighbridge)",
        "engine":  "Oracle",
        "host":    f"{os.getenv('WBATNGL_HOST', '10.10.1.67')}:{os.getenv('WBATNGL_PORT', '1522')}",
        "db":      os.getenv("WBATNGL_SERVICE", "WBATNGL"),
        "status":  status,
        "latency": None,                                                 # not probed live
        "last_sync": last_sync.isoformat() if last_sync else None,
        "last_sync_age_seconds": int(age_s) if age_s is not None else None,
    }


def _probe_hts_mirror_freshness(db: Session) -> dict:
    last_sync = db.query(func.max(HtsHeatMirror.synced_at)).scalar()
    age_s = None
    status = "offline"
    if last_sync:
        age_s = (datetime.utcnow() - last_sync.replace(tzinfo=None) if last_sync.tzinfo else datetime.utcnow() - last_sync).total_seconds()
        # HTS ticks every 300s — 3x grace
        status = "online" if age_s < 900 else ("degraded" if age_s < 1800 else "offline")
    return {
        "id":      "hts",
        "label":   "HTS (SMS Receiving)",
        "engine":  "Oracle",
        "host":    f"{os.getenv('HTS_HOST', '10.10.1.67')}:{os.getenv('HTS_PORT', '1522')}",
        "db":      os.getenv("HTS_SERVICE", "HTS"),
        "status":  status,
        "latency": None,
        "last_sync": last_sync.isoformat() if last_sync else None,
        "last_sync_age_seconds": int(age_s) if age_s is not None else None,
    }


def _probe_suveechi_freshness(db: Session) -> dict:
    last_loc = db.query(func.max(FleetLiveLocation.last_updated)).scalar()
    age_s = None
    status = "offline"
    if last_loc:
        age_s = (datetime.utcnow() - last_loc.replace(tzinfo=None) if last_loc.tzinfo else datetime.utcnow() - last_loc).total_seconds()
        status = "online" if age_s < 30 else ("degraded" if age_s < 120 else "offline")
    return {
        "id":      "suveechi",
        "label":   "SuVeechi (Live GPS)",
        "engine":  "MySQL",
        "host":    f"{os.getenv('SUVEECHI_HOST', '10.10.156.157')}:{os.getenv('SUVEECHI_PORT', '3306')}",
        "db":      os.getenv("SUVEECHI_DB", "suvetracg"),
        "status":  status,
        "latency": None,
        "last_sync": last_loc.isoformat() if last_loc else None,
        "last_sync_age_seconds": int(age_s) if age_s is not None else None,
    }


@router.get("/system-health")
def system_health(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Health of the 4 data sources backing the dashboard. Cached for 30s
    server-side so a fleet of frontend tabs polling at 30s doesn't fan
    out into 4 probes per tab.
    """
    now = time.monotonic()
    if _SYSHEALTH_CACHE["data"] and (now - _SYSHEALTH_CACHE["at"]) < _SYSHEALTH_TTL:
        return _SYSHEALTH_CACHE["data"]

    payload = {
        "connections": [
            _probe_suveechi_freshness(db),
            _probe_wbatngl_mirror_freshness(db),
            _probe_hts_mirror_freshness(db),
            _probe_postgres(db),
        ],
        "checked_at": datetime.utcnow().isoformat() + "Z",
    }
    _SYSHEALTH_CACHE["at"] = now
    _SYSHEALTH_CACHE["data"] = payload
    return payload
