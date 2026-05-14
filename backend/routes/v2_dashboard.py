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

from ..database.engine import get_db
from ..database.models import (
    Alert,
    FleetLiveLocation,
    FleetManagement,
    HtsHeatMirror,
    ShiftConfig,
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
    Fleet Donut data — 2026-05-14 (#190) rewrite.

    PURE READ of raw SuVeechi status. No calculation, no mapping, no
    in-flight-trip lookup, no manual-override merging. Whatever values
    SuVeechi's `vw_unit_status_ist.status` returns (currently
    Idle / Moving / Ign Off) are grouped verbatim and counted.

    Returns:
      {"total": 53, "breakdown": {"Idle": 43, "Moving": 6, "Ign Off": 4}}

    Edge cases:
      - NULL or empty suveechi_status (sync hasn't run yet, or torpedo
        was inserted from a different code path) bucketed as "Unknown".
      - New statuses upstream automatically appear as new buckets — no
        backend or frontend changes required.

    History:
      - #182 (pre-#190): 3-bucket classifier MAINTENANCE/ACTIVE/IDLE built
        from FleetManagement.status (mapped) + in-flight WBATNGL trip
        lookup. Caused divergence with Card 2 KPI count (32 trips vs 3
        active torpedoes) because the rules used different logic.
      - #190: dropped the calculation entirely. Donut now shows raw
        operational state; Card 2 KPI shows trip-record count. The two
        are intentionally different views and no longer pretend to share
        a definition.
    """
    fleets = db.query(FleetManagement).filter(
        FleetManagement.deleted_at.is_(None),
    ).all()

    buckets: dict[str, int] = {}
    for f in fleets:
        key = (f.suveechi_status or "").strip() or "Unknown"
        buckets[key] = buckets.get(key, 0) + 1

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

    # 1b) Per-producer breakdown of today's dispatched tonnes (#191).
    # Uses the SAME `dispatch_ts >= start_today` filter as the hot-metal
    # KPI above so the sum across producers always equals the KPI value —
    # no off-by-one between "Card 1 says 5.9 kt" and the producer strip.
    # Returns all 7 known producers (BF1..BF5 + COREX1/2), even those with
    # zero trips today, so the UI can always render 7 slots and operators
    # see at a glance which producer is silent.
    KNOWN_PRODUCERS = ["BF1", "BF2", "BF3", "BF4", "BF5", "COREX1", "COREX2"]
    producer_rows = db.query(
        WbatnglTripMirror.source_lab,
        func.count(WbatnglTripMirror.id).label("trips"),
        func.sum(WbatnglTripMirror.net_weight).label("tonnes"),
        func.max(dispatch_ts).label("last_dispatch"),
    ).filter(
        dispatch_ts >= start_today,
        WbatnglTripMirror.source_lab.isnot(None),
    ).group_by(WbatnglTripMirror.source_lab).all()
    producer_data = {
        (r.source_lab or "").upper(): {
            "trips": int(r.trips or 0),
            "tonnes": float(r.tonnes or 0),
            "last_dispatch": r.last_dispatch,
        }
        for r in producer_rows
    }
    total_kt_for_pct = float(today_rows.sum_net or 0) / 1000.0
    one_hour_ago_ist = _hours_ago(1)
    producer_breakdown = []
    for src in KNOWN_PRODUCERS:                                          # alphabetical-by-design
        d = producer_data.get(src, {"trips": 0, "tonnes": 0.0, "last_dispatch": None})
        kt = d["tonnes"] / 1000.0
        producer_breakdown.append({
            "source":          src,
            "trips":           d["trips"],
            "tonnes":          round(d["tonnes"], 1),
            "kt":              round(kt, 2),
            "pct_of_total":    round(100 * kt / total_kt_for_pct, 1) if total_kt_for_pct > 0 else 0.0,
            "last_dispatch_at": d["last_dispatch"].isoformat() if d["last_dispatch"] else None,
            "active_last_hour": bool(d["last_dispatch"] and d["last_dispatch"] >= one_hour_ago_ist),
        })

    # 2) Active trips — in-flight definition (Option A, user-confirmed
    # 2026-05-13): WBATNGL trip departed BF (out_date set), not yet
    # acknowledged at SMS (sms_ack_time null), within the last
    # ACTIVE_TRIP_WINDOW_HOURS so we don't include stale forgotten-ack
    # rows. Matches operations.py:201 definition exactly.
    #
    # 2026-05-14 (changes_tracker #186): migrated to the new 4-rule
    # trip-completion logic (see memory: project_trip_completion_logic.md
    # AND _count_active_trips below). Drops dependency on sms_ack_time
    # (NULL on 45% of WBATNGL rows). Uses HTS torpedo_out_time as the
    # primary completion signal (verified 100% populated via probe over
    # 30d / 5 active converters / 3168 heats). KPI count here matches
    # the row count returned by /active-trips exactly — fixes the long
    # standing 1-vs-7 inconsistency between Card 2 and the bottom table.
    active_trips = _count_active_trips(db)

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
        "producer_breakdown": producer_breakdown,    # #191: per-BF/COREX
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
#
# Trip-completion logic redesigned 2026-05-14 (changes_tracker #186).
# Memory: project_trip_completion_logic.md
#
# 4-rule definition of trip lifecycle, first match wins:
#   RULE 1: HTS torpedo_out_time exists within [out_date, out_date+6h]
#           → COMPLETED — released from SMS
#   RULE 2: Same torpedo has a newer WBATNGL trip (>60min after out_date)
#           → COMPLETED — non-converter destination or unconfirmed
#   RULE 3: out_date < now - 24h
#           → STALE — likely failed / diverted
#   RULE 4: default
#           → IN FLIGHT (this is the "active" trip)
#
# Rules 1-3 close a trip. The /active-trips list returns rows where
# none of 1-3 fire (Rule 4). Probe verified 100% torpedo_out_time
# coverage across 5 converters / 3168 heats / 30 days.

# Active-trip stage values (lifecycle position WITHIN an active trip):
STAGE_AT_BF_WB    = "AT_BF_WB"      # only first_tare_time set
STAGE_AT_BF_TAP   = "AT_BF_TAP"     # tap_no set, no gross_weight
STAGE_WB_LOADED   = "WB_LOADED"     # gross_weight set, no out_date
STAGE_IN_TRANSIT  = "IN_TRANSIT"    # out_date set, no HTS torpedo_in_time
STAGE_AT_SMS      = "AT_SMS"        # HTS torpedo_in_time set, torpedo_out_time NOT set


def _derive_stage(trip_row: dict) -> str:
    """Compute the active-trip stage from data shape. Order matters —
    most-progressed stage wins.

    2026-05-14 (#189): IN_TRANSIT detection now uses closetime as a
    fallback for out_date. Probe-confirmed (3309 trips / 30d): when both
    fields are set, median gap is 0 min — they fire at the same source
    event. ~10% of trips never get out_date written; those are still
    really in transit if closetime is set."""
    if trip_row.get("torpedo_in_time"):
        return STAGE_AT_SMS
    if trip_row.get("out_date") or trip_row.get("closetime"):
        return STAGE_IN_TRANSIT
    if trip_row.get("gross_weight"):
        return STAGE_WB_LOADED
    if trip_row.get("tap_no"):
        return STAGE_AT_BF_TAP
    return STAGE_AT_BF_WB


def _active_trips_base_sql() -> str:
    """
    Returns the CTE-driven SQL that produces all currently-active trips
    (Rule 4 — none of Rules 1, 2, 3 fired). Used by both the count and
    the paginated list. Sourced from a single SQL string so the active
    set is defined in one place.

    Returned columns are exactly the ones the API payload needs.
    """
    return """
    WITH closed_by_hts AS (
        -- Rule 1 (2026-05-14 #189): HTS recorded torpedo_out_time within
        -- 6h of BF "dispatched" timestamp. Uses COALESCE(out_date, closetime)
        -- because ~10% of trips never get out_date written even though the
        -- WB transaction did close — probe-confirmed both columns share
        -- the same source event when present (median gap 0 min).
        SELECT DISTINCT w.id
        FROM wbatngl_trip_mirror w
        INNER JOIN hts_heat_mirror h
            ON h.torpedo_no = w.fleet_id
           AND h.torpedo_in_time >= COALESCE(w.out_date, w.closetime)
           AND h.torpedo_in_time <= COALESCE(w.out_date, w.closetime) + INTERVAL '6 hours'
           AND h.torpedo_out_time IS NOT NULL
        WHERE COALESCE(w.out_date, w.closetime) IS NOT NULL
    ),
    closed_by_next_trip AS (
        -- Rule 2: same torpedo started another trip > 60min later
        SELECT DISTINCT w1.id
        FROM wbatngl_trip_mirror w1
        INNER JOIN wbatngl_trip_mirror w2
            ON w2.fleet_id = w1.fleet_id
           AND w2.first_tare_time > COALESCE(w1.out_date, w1.first_tare_time)
                                    + INTERVAL '60 minutes'
    ),
    stale_trips AS (
        -- Rule 3 (2026-05-14 #189): unified 24h stale cap using
        -- COALESCE(out_date, closetime, first_tare_time). One single
        -- formula handles all 3 dispatched-state combinations:
        --   (a) out_date set         -> use out_date for staleness
        --   (b) only closetime set   -> use closetime
        --   (c) neither set          -> use first_tare_time (Rule 3b)
        -- Probe-confirmed: closes 4 stuck-at-WB-no-close trips and
        -- 3 dispatched-no-out-date trips that would have hung forever
        -- under the old Rule 3 (which required out_date).
        SELECT id
        FROM wbatngl_trip_mirror
        WHERE first_tare_time IS NOT NULL
          AND COALESCE(out_date, closetime, first_tare_time)
              < (NOW() AT TIME ZONE 'Asia/Kolkata')::timestamp
                - INTERVAL '24 hours'
    )
    SELECT
        w.id,
        w.trip_id,
        w.fleet_id,
        w.source_lab,
        w.destination,
        w.first_tare_time,
        w.out_date,
        w.gross_weight,
        w.net_weight,
        w.temp,
        w.s_l,
        w.tap_no,
        w.tap_hole,
        h.heat_no,
        h.converter_no,
        h.sms                 AS hts_sms,
        h.hotmetal_qty,
        h.torpedo_in_time,
        fp.location_text      AS current_location_text,
        fp.last_updated       AS gps_last_updated
    FROM wbatngl_trip_mirror w
    LEFT JOIN LATERAL (
        -- 2026-05-14 #189: anchor on COALESCE(out_date, closetime) so
        -- trips that have closetime but no out_date can still match
        -- their HTS heat.
        SELECT *
        FROM hts_heat_mirror h2
        WHERE h2.torpedo_no = w.fleet_id
          AND COALESCE(w.out_date, w.closetime) IS NOT NULL
          AND h2.torpedo_in_time >= COALESCE(w.out_date, w.closetime)
          AND h2.torpedo_in_time <= COALESCE(w.out_date, w.closetime) + INTERVAL '6 hours'
        ORDER BY h2.torpedo_in_time ASC
        LIMIT 1
    ) h ON true
    LEFT JOIN LATERAL (
        SELECT location_text, last_updated
        FROM fleet_live_locations fl
        WHERE fl.fleet_id = w.fleet_id
        ORDER BY fl.last_updated DESC
        LIMIT 1
    ) fp ON true
    WHERE w.first_tare_time IS NOT NULL
      AND w.id NOT IN (SELECT id FROM closed_by_hts)
      AND w.id NOT IN (SELECT id FROM closed_by_next_trip)
      AND w.id NOT IN (SELECT id FROM stale_trips)
    """


def _count_active_trips(db: Session) -> int:
    """
    Total active-trip count (Rule 4) — used by Card 2 KPI and the
    pagination 'total' field. Single source of truth shared with
    /active-trips so the KPI and the table can never disagree.
    """
    sql = "SELECT COUNT(*) FROM (" + _active_trips_base_sql() + ") AS active_set"
    result = db.execute(text(sql)).scalar()
    return int(result or 0)


def _row_to_active_trip_dict(row, now_ist: datetime) -> dict:
    """Project a SQL row (mapping) onto the API response dict. Computes
    derived fields (stage, age_seconds, gps_stale, quality flags)."""
    # row is a SQLAlchemy Row / RowMapping — index by column name.
    r = dict(row._mapping) if hasattr(row, "_mapping") else dict(row)

    stage = _derive_stage(r)

    age_seconds = None
    if r.get("first_tare_time"):
        age_seconds = int(max(0, (now_ist - r["first_tare_time"]).total_seconds()))

    gps_stale = False
    gps_last = r.get("gps_last_updated")
    if gps_last is not None:
        # gps_last_updated is tz-aware (+05:30); compare via UTC.
        gps_age = (datetime.utcnow().replace(tzinfo=timezone.utc) - gps_last.astimezone(timezone.utc)).total_seconds()
        gps_stale = gps_age > 3600  # 1 hour

    temp_val = float(r["temp"]) if r.get("temp") is not None else None
    s_val    = float(r["s_l"])  if r.get("s_l")  is not None else None

    # Inline quality flags (replaced the old Status column badges)
    is_cold   = temp_val is not None and temp_val < 1450
    is_high_s = s_val    is not None and s_val    > 0.05
    is_late   = age_seconds is not None and age_seconds > 6 * 3600  # >6h

    return {
        "trip_id":               r.get("trip_id"),
        "ladle":                 r.get("fleet_id"),
        "tap_no":                r.get("tap_no"),
        "tap_hole":              r.get("tap_hole"),
        "source":                r.get("source_lab"),
        "dest_destination_raw":  r.get("destination"),
        "dest_sms":              r.get("hts_sms"),
        "dest_converter":        r.get("converter_no"),
        "heat_no":               r.get("heat_no"),
        "created_at":            r["first_tare_time"].isoformat() if r.get("first_tare_time") else None,
        "dispatched_at":         r["out_date"].isoformat() if r.get("out_date") else None,
        "torpedo_in_time":       r["torpedo_in_time"].isoformat() if r.get("torpedo_in_time") else None,
        "net_weight":            round(float(r["net_weight"]), 1) if r.get("net_weight") is not None else None,
        "hotmetal_qty":          round(float(r["hotmetal_qty"]), 1) if r.get("hotmetal_qty") is not None else None,
        "temp":                  round(temp_val, 0) if temp_val is not None else None,
        "s":                     round(s_val, 3)    if s_val    is not None else None,
        "stage":                 stage,
        "current_location_text": r.get("current_location_text"),
        "gps_last_updated":      gps_last.isoformat() if gps_last else None,
        "gps_stale":             gps_stale,
        "age_seconds":           age_seconds,
        "is_cold":               is_cold,
        "is_high_s":             is_high_s,
        "is_late":               is_late,
    }


_SORTABLE_FIELDS = {
    # API field name → SQL expression for sorting
    "created_at":     "first_tare_time",
    "dispatched_at":  "out_date",
    "ladle":          "fleet_id",
    "trip_id":        "trip_id",
    "source":         "source_lab",
    "dest_sms":       "hts_sms",
    "net_weight":     "net_weight",
    "temp":           "temp",
    "s":              "s_l",
    "age_seconds":    "first_tare_time",  # age = inverse of created_at
}


@router.get("/active-trips")
def active_trips(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None, description="Substring match on trip_id or fleet_id"),
    source: Optional[str] = Query(None, description="Filter by source_lab (BF1..COREX2)"),
    dest:   Optional[str] = Query(None, description="Filter by SMS (SMS-1..SMS-4)"),
    stage:  Optional[str] = Query(None, description="Filter by computed stage"),
    sort_by: str = Query("created_at"),
    sort_dir: str = Query("desc", regex="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Active trips list — implements the 4-rule trip-completion logic.

    Returns paginated rows AND the total count so the frontend can both
    render the page and update the Card 2 KPI counter from one round-trip.

    Filters / sort / pagination are applied in Python after the CTE
    runs, which is fine because the active set is small (typically
    < 20 trips at any moment).
    """
    now_ist = _now_ist_naive()

    rows = db.execute(text(_active_trips_base_sql())).all()
    all_trips = [_row_to_active_trip_dict(r, now_ist) for r in rows]

    # ─── Filters
    if source:
        s = source.upper()
        all_trips = [t for t in all_trips if (t.get("source") or "").upper() == s]
    if dest:
        d = dest.upper()
        # match either HTS-side mapped SMS, or raw WBATNGL destination string
        all_trips = [
            t for t in all_trips
            if (t.get("dest_sms") or "").upper() == d
               or (t.get("dest_destination_raw") or "").upper().startswith(d)
        ]
    if stage:
        st = stage.upper()
        all_trips = [t for t in all_trips if t.get("stage") == st]
    if search:
        q = search.strip().lower()
        if q:
            all_trips = [
                t for t in all_trips
                if q in (t.get("trip_id") or "").lower()
                   or q in (t.get("ladle") or "").lower()
            ]

    # ─── Sort
    sort_field = _SORTABLE_FIELDS.get(sort_by, "first_tare_time")
    # The API field for the dict (key in _row_to_active_trip_dict) — for
    # most fields this is the same as sort_by. age_seconds is special:
    # sort_dir applies inverted vs created_at (older first vs newest first).
    api_key_for_sort = {
        "first_tare_time": "created_at",
        "out_date":        "dispatched_at",
        "fleet_id":        "ladle",
        "trip_id":         "trip_id",
        "source_lab":      "source",
        "hts_sms":         "dest_sms",
        "net_weight":      "net_weight",
        "temp":            "temp",
        "s_l":             "s",
    }.get(sort_field, "created_at")
    reverse = (sort_dir == "desc")
    all_trips.sort(
        key=lambda t: (t.get(api_key_for_sort) is None, t.get(api_key_for_sort) or ""),
        reverse=reverse,
    )

    # ─── Pagination
    total = len(all_trips)
    total_pages = max(1, (total + page_size - 1) // page_size)
    start = (page - 1) * page_size
    end   = start + page_size
    page_trips = all_trips[start:end]

    return {
        "count":       total,                       # Card 2 KPI source
        "page":        page,
        "page_size":   page_size,
        "total_pages": total_pages,
        "trips":       page_trips,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


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
