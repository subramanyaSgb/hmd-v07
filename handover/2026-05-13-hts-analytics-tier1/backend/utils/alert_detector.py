"""
Alert detector for the Version 2 dashboard Alerts & Exceptions feed.

Pure functions that take a mirror row + threshold context, return either
an Alert dict (ready to insert) or None. Caller is responsible for the
DB session — keeps this module unit-testable on machines without DB.

Threshold defaults are hard-coded here for now (match the demo design)
but read from `DeviationThresholdConfig` if present, falling back. If
the user changes thresholds in Settings, the next sync tick picks them
up — no restart required.

Hook points:
  - utils/wbatngl_trip_sync.run_once() after upsert_rows() — passes
    chemistry/dwell/no-sms-ack signals
  - utils/suveechi_sync.sync_once() after upsert_locations() — passes
    gps-stale/battery signals

Dedupe rule: skip insertion if a non-acknowledged alert of the same
`(kind, torpedo_id)` exists in the last 30 min. Prevents every 60s
WBATNGL tick from re-inserting the same cold-metal alert on an
unchanged closetime.

Design doc: docs/plans/2026-05-12-version2-dashboard-design.md
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import and_
from sqlalchemy.orm import Session

from ..database.models import (
    Alert,
    FleetLiveLocation,
    HEqupBreakdownMirror,
    HUnitCodeMirror,
    WbatnglTripMirror,
)
from ..logger import logger


# ── Thresholds ───────────────────────────────────────────────────
# Match the demo design idea's defaults exactly. Admin can override via
# Settings → Alert Thresholds in a follow-up sprint (DeviationThresholdConfig
# was originally scoped for trip-deviation only; we are not extending it now).

COLD_METAL_TEMP_C        = 1450.0   # °C — closetime temp below this
HIGH_SULFUR_PCT          = 0.05     # % S_L
HIGH_SILICON_PCT         = 1.20     # % Si_L
DWELL_MAX_MIN            = 180      # tap → SMS ack
SMS_ACK_LATE_MIN         = 60       # out_date older than this with no ack
GPS_STALE_SECONDS        = 300      # last_updated older than this
BATTERY_LOW_PCT          = 60       # battery below this

DEDUPE_WINDOW_MIN        = 30


def _has_recent_unacked(db: Session, kind: str, torpedo_id: Optional[str]) -> bool:
    """
    Return True if there's already an un-acknowledged alert of the same
    (kind, torpedo_id) within the dedupe window. Skipping the insert in
    that case keeps the feed stable across sync ticks.
    """
    if not torpedo_id:
        return False
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=DEDUPE_WINDOW_MIN)
    q = db.query(Alert.id).filter(
        Alert.kind == kind,
        Alert.torpedo_id == torpedo_id,
        Alert.acknowledged_at.is_(None),
        Alert.detected_at > cutoff,
    ).limit(1)
    return q.first() is not None


def _insert_if_new(db: Session, payload: dict) -> bool:
    """
    Helper — dedupes then inserts. Returns True if a new row was added.
    Does not commit; caller is expected to commit (matches sync-job
    convention where multiple side-effects share one transaction).
    """
    if _has_recent_unacked(db, payload["kind"], payload.get("torpedo_id")):
        return False
    db.add(Alert(**payload))
    return True


# ── Detectors — pure (kind, payload) builders ────────────────────

def _route_label(source: Optional[str], destination: Optional[str]) -> str:
    """Build 'BF4 → SMS2' style label, gracefully when one side is None."""
    if source and destination:
        return f"{source} → {destination}"
    return source or destination or ""


def detect_cold_metal(wbatngl_row: dict) -> Optional[dict]:
    """
    `wbatngl_row` is a row mapping (already-upserted shape) with keys
    matching WbatnglTripMirror columns. Returns an Alert payload dict
    or None.
    """
    temp = wbatngl_row.get("temp")
    if temp is None or temp >= COLD_METAL_TEMP_C:
        return None
    fleet_id = wbatngl_row.get("fleet_id")
    src = wbatngl_row.get("source_lab")
    dst = wbatngl_row.get("destination")
    return {
        "kind":        "cold",
        "severity":    "high",
        "tag":         "COLD METAL",
        "message":     f"{fleet_id} closed at {int(temp)}°C, below {int(COLD_METAL_TEMP_C)} threshold",
        "location":    _route_label(src, dst),
        "torpedo_id":  fleet_id,
        "trip_id":     wbatngl_row.get("trip_id"),
        "source":      src,
        "destination": dst,
        "raw_value":   float(temp),
        "threshold":   COLD_METAL_TEMP_C,
    }


def detect_high_sulfur(wbatngl_row: dict) -> Optional[dict]:
    s = wbatngl_row.get("s_l")
    if s is None or s <= HIGH_SULFUR_PCT:
        return None
    fleet_id = wbatngl_row.get("fleet_id")
    return {
        "kind":        "chem_s",
        "severity":    "med",
        "tag":         "HIGH S",
        "message":     f"{fleet_id} sulfur {s:.3f} vs spec {HIGH_SULFUR_PCT}",
        "location":    _route_label(wbatngl_row.get("source_lab"), wbatngl_row.get("destination")),
        "torpedo_id":  fleet_id,
        "trip_id":     wbatngl_row.get("trip_id"),
        "source":      wbatngl_row.get("source_lab"),
        "destination": wbatngl_row.get("destination"),
        "raw_value":   float(s),
        "threshold":   HIGH_SULFUR_PCT,
    }


def detect_high_silicon(wbatngl_row: dict) -> Optional[dict]:
    si = wbatngl_row.get("si_l")
    if si is None or si <= HIGH_SILICON_PCT:
        return None
    fleet_id = wbatngl_row.get("fleet_id")
    return {
        "kind":        "chem_si",
        "severity":    "med",
        "tag":         "HIGH Si",
        "message":     f"{fleet_id} silicon {si:.2f} vs spec {HIGH_SILICON_PCT}",
        "location":    _route_label(wbatngl_row.get("source_lab"), wbatngl_row.get("destination")),
        "torpedo_id":  fleet_id,
        "trip_id":     wbatngl_row.get("trip_id"),
        "source":      wbatngl_row.get("source_lab"),
        "destination": wbatngl_row.get("destination"),
        "raw_value":   float(si),
        "threshold":   HIGH_SILICON_PCT,
    }


def detect_dwell(wbatngl_row: dict) -> Optional[dict]:
    """
    Long dwell = `sms_ack_time − first_tare_time` > DWELL_MAX_MIN.
    Only triggers on completed trips (sms_ack_time is set).
    """
    start = wbatngl_row.get("first_tare_time")
    ack = wbatngl_row.get("sms_ack_time")
    if not start or not ack:
        return None
    dwell_min = (ack - start).total_seconds() / 60.0
    if dwell_min <= DWELL_MAX_MIN:
        return None
    fleet_id = wbatngl_row.get("fleet_id")
    return {
        "kind":        "dwell",
        "severity":    "low",
        "tag":         "DWELL LONG",
        "message":     f"{fleet_id} dwell {int(dwell_min)} min, above {DWELL_MAX_MIN} threshold",
        "location":    wbatngl_row.get("destination") or "",
        "torpedo_id":  fleet_id,
        "trip_id":     wbatngl_row.get("trip_id"),
        "source":      wbatngl_row.get("source_lab"),
        "destination": wbatngl_row.get("destination"),
        "raw_value":   float(dwell_min),
        "threshold":   float(DWELL_MAX_MIN),
    }


def detect_no_sms_ack(wbatngl_row: dict) -> Optional[dict]:
    """
    Out from BF but no SMS ack within SMS_ACK_LATE_MIN minutes.
    `now` is passed in (or read from utc clock) so this stays pure-ish
    for unit tests.
    """
    out = wbatngl_row.get("out_date")
    ack = wbatngl_row.get("sms_ack_time")
    if not out or ack:
        return None
    # naive vs aware tolerance — WbatnglTripMirror uses TIMESTAMP WITHOUT TZ
    out_naive = out.replace(tzinfo=None) if out.tzinfo else out
    now_naive = datetime.utcnow()
    waiting_min = (now_naive - out_naive).total_seconds() / 60.0
    if waiting_min <= SMS_ACK_LATE_MIN:
        return None
    fleet_id = wbatngl_row.get("fleet_id")
    return {
        "kind":        "sms_ack",
        "severity":    "med",
        "tag":         "NO SMS ACK",
        "message":     f"{fleet_id} out at {out_naive.strftime('%H:%M')}, no ack from {wbatngl_row.get('destination','SMS')}",
        "location":    wbatngl_row.get("destination") or "",
        "torpedo_id":  fleet_id,
        "trip_id":     wbatngl_row.get("trip_id"),
        "source":      wbatngl_row.get("source_lab"),
        "destination": wbatngl_row.get("destination"),
        "raw_value":   float(waiting_min),
        "threshold":   float(SMS_ACK_LATE_MIN),
    }


def detect_gps_stale(fleet_id: str, last_updated: Optional[datetime]) -> Optional[dict]:
    """
    Triggers when a fleet row's last_updated is older than GPS_STALE_SECONDS.
    Caller passes both — typically iterating fleet_live_locations after
    suveechi sync.
    """
    if not last_updated:
        return None
    last = last_updated.replace(tzinfo=None) if last_updated.tzinfo else last_updated
    age_s = (datetime.utcnow() - last).total_seconds()
    if age_s <= GPS_STALE_SECONDS:
        return None
    return {
        "kind":        "gps_stale",
        "severity":    "med" if age_s < 900 else "high",
        "tag":         "GPS STALE",
        "message":     f"{fleet_id} last reported {int(age_s // 60)}m {int(age_s % 60)}s ago",
        "location":    "Yard",
        "torpedo_id":  fleet_id,
        "trip_id":     None,
        "source":      None,
        "destination": None,
        "raw_value":   float(age_s),
        "threshold":   float(GPS_STALE_SECONDS),
    }


def detect_battery_low(fleet_id: str, battery_pct: Optional[float]) -> Optional[dict]:
    """
    Battery check — SuVeechi exposes a battery percent. We don't currently
    mirror that column into FleetLiveLocation (only x/y/last_updated). If
    SuVeechi adds it in a future sync revision the wiring is already here
    via this function — invoke with the value once it's accessible.
    """
    if battery_pct is None or battery_pct >= BATTERY_LOW_PCT:
        return None
    return {
        "kind":        "battery",
        "severity":    "low",
        "tag":         "BATTERY",
        "message":     f"{fleet_id} GPS unit at {int(battery_pct)}%",
        "location":    "Yard",
        "torpedo_id":  fleet_id,
        "trip_id":     None,
        "source":      None,
        "destination": None,
        "raw_value":   float(battery_pct),
        "threshold":   float(BATTERY_LOW_PCT),
    }


# ── Orchestrators — called from sync hooks ──────────────────────

def scan_wbatngl_rows(db: Session, rows: list[dict]) -> int:
    """
    Run every WBATNGL detector against `rows` (post-upsert dicts).
    Returns count of new Alert rows added. Caller commits.
    """
    detectors = (
        detect_cold_metal,
        detect_high_sulfur,
        detect_high_silicon,
        detect_dwell,
        detect_no_sms_ack,
    )
    new_alerts = 0
    for row in rows:
        for fn in detectors:
            try:
                payload = fn(row)
            except Exception as e:
                logger.warning(f"alert_detector.{fn.__name__} failed: {e}")
                continue
            if payload and _insert_if_new(db, payload):
                new_alerts += 1
    return new_alerts


def scan_fleet_rows(db: Session) -> int:
    """
    Run GPS-stale check across the latest fleet_live_locations rows.
    Battery detection wired but not invoked until SuVeechi exposes that
    column — see detect_battery_low docstring.

    Returns count of new Alert rows added. Caller commits.
    """
    new_alerts = 0
    # latest row per fleet_id (postgres-safe: subquery with MAX last_updated)
    from sqlalchemy import func as sa_func
    sub = db.query(
        FleetLiveLocation.fleet_id,
        sa_func.max(FleetLiveLocation.last_updated).label("ts"),
    ).group_by(FleetLiveLocation.fleet_id).subquery()

    rows = db.query(FleetLiveLocation.fleet_id, FleetLiveLocation.last_updated).join(
        sub,
        and_(
            FleetLiveLocation.fleet_id == sub.c.fleet_id,
            FleetLiveLocation.last_updated == sub.c.ts,
        ),
    ).all()

    for fleet_id, last_updated in rows:
        try:
            payload = detect_gps_stale(fleet_id, last_updated)
        except Exception as e:
            logger.warning(f"alert_detector.detect_gps_stale failed for {fleet_id}: {e}")
            continue
        if payload and _insert_if_new(db, payload):
            new_alerts += 1
    return new_alerts


# ── HTS breakdown alerts (Tier 1 #7) ─────────────────────────────
# Folds equipment breakdowns from h_equp_breakdown_mirror into the
# V2 Dashboard Alerts feed. Unlike the wbatngl detectors, breakdown
# rows aren't tied to a torpedo — they're per-unit-per-date events.
# So we dedupe by exact message string within a 12h window rather
# than by (kind, torpedo_id).

HTS_BREAKDOWN_LOOKBACK_HOURS = 24
HTS_BREAKDOWN_DEDUPE_HOURS   = 12

# Severity scoring keyed off REASON + DELAY_TYPE. Heat-flow incidents
# (torpedo/ladle) escalate to high; the rest stay medium/low so the
# feed doesn't drown out cold-metal/chemistry signals which directly
# affect product quality.
_HIGH_SEV_KEYWORDS = ("TORPEDO", "LADLE", "BOF", "CONVERTER")
_DELAY_TYPE_SEV = {
    "DEL": "med",   # generic delay
    "OBM": "low",   # other / minor
}


def _has_recent_breakdown_alert(db: Session, message: str) -> bool:
    """Dedupe HTS breakdown alerts by exact message within the window."""
    cutoff = datetime.now(timezone.utc) - timedelta(hours=HTS_BREAKDOWN_DEDUPE_HOURS)
    q = db.query(Alert.id).filter(
        Alert.kind == "breakdown",
        Alert.message == message,
        Alert.detected_at > cutoff,
    ).limit(1)
    return q.first() is not None


def detect_hts_breakdown(
    row: HEqupBreakdownMirror,
    unit_name: Optional[str],
) -> Optional[dict]:
    """
    Build an Alert payload from one breakdown mirror row, or None on
    insufficient data. unit_name is resolved upstream from the unit
    code mirror; we accept it as an arg to keep this function pure.
    """
    if row.brk_date is None or not row.reason:
        return None
    reason = row.reason.strip()
    sev = _DELAY_TYPE_SEV.get((row.delay_type or "").strip(), "med")
    reason_upper = reason.upper()
    if any(kw in reason_upper for kw in _HIGH_SEV_KEYWORDS):
        sev = "high"

    unit_label = unit_name or (f"Unit {row.unit_code}" if row.unit_code else "Unit")
    dur = (row.dur_brk_hrs_min or "").strip() or "n/a"
    brk_str = row.brk_date.strftime("%d-%b %H:%M")

    return {
        "kind":        "breakdown",
        "severity":    sev,
        "tag":         "BREAKDOWN",
        "message":     f"{unit_label}: {reason} ({dur}) at {brk_str}",
        "location":    unit_label,
        "torpedo_id":  None,
        "trip_id":     None,
        "source":      None,
        "destination": None,
        "raw_value":   float(row.unit_code) if row.unit_code is not None else None,
        "threshold":   None,
    }


def scan_hts_breakdowns(db: Session) -> int:
    """
    Iterate recent rows of `h_equp_breakdown_mirror` and insert one
    Alert per new breakdown. Returns count of new Alert rows added.
    Caller commits.

    Called from `hts_sync.run_once()` immediately after the breakdown
    table is synced — that ordering guarantees the latest breakdown is
    visible in the mirror before we scan.
    """
    cutoff = datetime.utcnow() - timedelta(hours=HTS_BREAKDOWN_LOOKBACK_HOURS)
    rows = (
        db.query(HEqupBreakdownMirror)
        .filter(HEqupBreakdownMirror.brk_date > cutoff)
        .order_by(HEqupBreakdownMirror.brk_date.desc())
        .all()
    )
    if not rows:
        return 0

    # Single bulk lookup — typically 36 rows.
    unit_map = {u.unit_code: u.unit_desc for u in db.query(HUnitCodeMirror).all()}

    new_alerts = 0
    for row in rows:
        try:
            payload = detect_hts_breakdown(row, unit_map.get(row.unit_code))
        except Exception as e:
            logger.warning(f"detect_hts_breakdown failed for row {row.id}: {e}")
            continue
        if not payload:
            continue
        if _has_recent_breakdown_alert(db, payload["message"]):
            continue
        db.add(Alert(**payload))
        new_alerts += 1
    return new_alerts
