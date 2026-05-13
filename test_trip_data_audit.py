"""
Trip data quality audit — what do we actually have in WBATNGL mirror?

User question (2026-05-13): "are we getting trip details properly like
with trip ids are we getting if yes are we getting proper status for them?
we need to dig deep — let's start from table data, what we have, what
we are missing."

Phase 1 of /systematic-debugging — gather evidence before any rule
change on the active-trip KPIs.

This probe dumps:
  1. Coverage matrix: which timestamp / data fields are populated per
     trip in last 24h
  2. Per-trip stage classification using the WBATNGL-canonical lifecycle
     (Tap / Weighed / Departed / In Transit / Received / Acked / Stale)
  3. Anomaly detection: out_date < closetime, sms_ack without out_date,
     received_date after sms_ack, etc.
  4. Trip-ID format check: are they consistent?
  5. Per-source breakdown: which BFs have what data quality

Read-only. No DB writes.

Usage on BF4:
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_trip_data_audit.py
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import timedelta

from sqlalchemy import func

from backend.database.engine import SessionLocal
from backend.database.models import WbatnglTripMirror
from backend.routes.v2_dashboard import _now_ist_naive, _hours_ago


def _pct(num: int, denom: int) -> float:
    return (num * 100.0 / denom) if denom else 0.0


def _stage_of(t: WbatnglTripMirror) -> str:
    """Classify a WBATNGL row by its timestamp pattern.

    Lifecycle: first_tare → closetime → out_date → received_date → sms_ack_time
    """
    if t.sms_ack_time:
        return "Acked"
    if t.received_date:
        return "Received (no ack)"
    if t.out_date:
        return "Departed"
    if t.closetime:
        return "Weighed (BF)"
    if t.first_tare_time:
        return "Tap (tare only)"
    return "Empty"


def _detect_anomalies(t: WbatnglTripMirror) -> list[str]:
    """Return list of anomaly strings for this trip row."""
    anomalies = []
    ts = [
        ("first_tare", t.first_tare_time),
        ("closetime",  t.closetime),
        ("out_date",   t.out_date),
        ("received",   t.received_date),
        ("sms_ack",    t.sms_ack_time),
    ]
    # Order check: each timestamp should be ≥ the previous one
    prev_name, prev_ts = None, None
    for name, ts_val in ts:
        if ts_val is None:
            continue
        if prev_ts is not None and ts_val < prev_ts:
            anomalies.append(f"{name} ({ts_val}) before {prev_name} ({prev_ts})")
        prev_name, prev_ts = name, ts_val
    # If sms_ack set but out_date missing → suspicious skip
    if t.sms_ack_time and not t.out_date:
        anomalies.append("sms_ack set but out_date missing")
    # If received_date set but sms_ack missing → received but never acked
    if t.received_date and not t.sms_ack_time:
        anomalies.append("received but never acked")
    # If out_date set but no first_tare → trip skipped weighing
    if t.out_date and not t.first_tare_time:
        anomalies.append("out_date set but no first_tare")
    # Net weight check
    if t.gross_weight and t.tare_weight and t.net_weight:
        expected = float(t.gross_weight) - float(t.tare_weight)
        actual = float(t.net_weight)
        if abs(expected - actual) > 0.5:
            anomalies.append(f"net_weight mismatch (gross-tare={expected:.1f}, stored={actual:.1f})")
    return anomalies


# Canonical trip_id pattern from WBATNGL — we've seen format like
# "74656TLC 111130526" (tap_no + space + TLC + torpedo + ddmmyy)
# but the space sometimes missing. Probe shows actual format diversity.
TRIPID_PATTERN_A = re.compile(r"^\d+TLC\s*\d+\d{6}$")            # "74656TLC 111130526"
TRIPID_PATTERN_B = re.compile(r"^\d+$")                          # pure numeric


def main() -> None:
    db = SessionLocal()
    try:
        now_ist = _now_ist_naive()
        yesterday = _hours_ago(24)

        print("=" * 80)
        print("Trip data quality audit (last 24h WBATNGL trips)")
        print("=" * 80)
        print(f"now (IST naive)   : {now_ist}")
        print(f"24h floor         : {yesterday}")
        print()

        rows = db.query(WbatnglTripMirror).filter(
            WbatnglTripMirror.updated_date >= yesterday,
        ).order_by(WbatnglTripMirror.updated_date.desc()).all()
        total = len(rows)
        print(f"Total trips touched in last 24h: {total}")
        print()

        # ── SECTION 1: Field coverage ──────────────────────────────
        print("-" * 80)
        print("SECTION 1 — field coverage (% of {} trips with field populated)".format(total))
        print("-" * 80)
        fields = [
            ("trip_id",          lambda r: r.trip_id is not None and r.trip_id != ""),
            ("fleet_id",         lambda r: r.fleet_id is not None),
            ("tap_no",           lambda r: r.tap_no is not None),
            ("source_lab",       lambda r: r.source_lab is not None),
            ("destination",      lambda r: r.destination is not None),
            ("first_tare_time",  lambda r: r.first_tare_time is not None),
            ("closetime",        lambda r: r.closetime is not None),
            ("out_date",         lambda r: r.out_date is not None),
            ("received_date",    lambda r: r.received_date is not None),
            ("sms_ack_time",     lambda r: r.sms_ack_time is not None),
            ("gross_weight",     lambda r: r.gross_weight is not None),
            ("tare_weight",      lambda r: r.tare_weight is not None),
            ("net_weight",       lambda r: r.net_weight is not None),
            ("net_weight_actual", lambda r: r.net_weight_actual is not None),
            ("tare_weight_actual",lambda r: r.tare_weight_actual is not None),
            ("temp",             lambda r: r.temp is not None),
            ("s_l",              lambda r: r.s_l is not None),
            ("si_l",             lambda r: r.si_l is not None),
            ("bds_temp",         lambda r: r.bds_temp is not None),
            ("shift",            lambda r: r.shift is not None and r.shift != ""),
        ]
        for name, pred in fields:
            c = sum(1 for r in rows if pred(r))
            print(f"  {name:<22} {c:>4}/{total}  ({_pct(c, total):5.1f}%)")
        print()

        # ── SECTION 2: Stage classification ────────────────────────
        print("-" * 80)
        print("SECTION 2 — trip stage distribution")
        print("-" * 80)
        stages = defaultdict(int)
        for r in rows:
            stages[_stage_of(r)] += 1
        order = ["Empty", "Tap (tare only)", "Weighed (BF)",
                 "Departed", "Received (no ack)", "Acked"]
        for s in order:
            n = stages.get(s, 0)
            print(f"  {s:<22} {n:>4}  ({_pct(n, total):5.1f}%)")
        # surface anything unexpected
        for s, n in stages.items():
            if s not in order:
                print(f"  {s:<22} {n:>4}  ({_pct(n, total):5.1f}%)  *unexpected*")
        print()

        # ── SECTION 3: Anomaly detection ───────────────────────────
        print("-" * 80)
        print("SECTION 3 — anomalies (rows with at least one issue)")
        print("-" * 80)
        anomaly_counts = defaultdict(int)
        per_trip_anomalies = []
        for r in rows:
            anos = _detect_anomalies(r)
            if anos:
                per_trip_anomalies.append((r, anos))
                for a in anos:
                    # Group by leading description token for counting
                    key = a.split(" (")[0]
                    anomaly_counts[key] += 1
        print(f"  total rows with ≥1 anomaly: {len(per_trip_anomalies)} / {total}")
        print()
        print("  by anomaly type:")
        for k, n in sorted(anomaly_counts.items(), key=lambda x: -x[1]):
            print(f"    {k:<55} {n:>4}")
        print()
        if per_trip_anomalies:
            print("  first 10 anomalous trips:")
            for r, anos in per_trip_anomalies[:10]:
                print(f"    trip_id='{r.trip_id}' fleet={r.fleet_id} stage={_stage_of(r)}")
                for a in anos:
                    print(f"      - {a}")
        print()

        # ── SECTION 4: Trip-ID format ──────────────────────────────
        print("-" * 80)
        print("SECTION 4 — trip_id format check")
        print("-" * 80)
        fmt_a = fmt_b = other = empty = 0
        oddballs = []
        for r in rows:
            tid = r.trip_id or ""
            if not tid:
                empty += 1
            elif TRIPID_PATTERN_A.match(tid):
                fmt_a += 1
            elif TRIPID_PATTERN_B.match(tid):
                fmt_b += 1
            else:
                other += 1
                if len(oddballs) < 10:
                    oddballs.append(tid)
        print(f"  pattern A ('\\d+TLC\\s*\\d+\\d{{6}}', e.g. 74656TLC 111130526): {fmt_a}")
        print(f"  pattern B (pure numeric, e.g. 67171341130526)              : {fmt_b}")
        print(f"  other                                                      : {other}")
        print(f"  empty / NULL                                               : {empty}")
        if oddballs:
            print(f"  sample 'other' trip_ids: {oddballs}")
        print()

        # ── SECTION 5: Per-source breakdown ────────────────────────
        print("-" * 80)
        print("SECTION 5 — coverage by source_lab")
        print("-" * 80)
        by_src = defaultdict(lambda: {"n": 0, "in_flight": 0, "acked": 0,
                                       "with_temp": 0, "with_si": 0,
                                       "with_chem": 0, "anomalies": 0})
        for r in rows:
            src = r.source_lab or "(NULL)"
            b = by_src[src]
            b["n"] += 1
            stage = _stage_of(r)
            if stage == "Acked":
                b["acked"] += 1
            elif stage in ("Departed", "Received (no ack)"):
                b["in_flight"] += 1
            if r.temp is not None: b["with_temp"] += 1
            if r.si_l is not None: b["with_si"] += 1
            if r.s_l is not None and r.si_l is not None: b["with_chem"] += 1
            if _detect_anomalies(r): b["anomalies"] += 1
        print(f"  {'source':<10} {'n':>5} {'in_fl':>6} {'acked':>6} "
              f"{'temp%':>6} {'Si%':>6} {'chem%':>6} {'anom':>5}")
        for src in sorted(by_src.keys()):
            b = by_src[src]
            print(f"  {src:<10} {b['n']:>5} {b['in_flight']:>6} {b['acked']:>6} "
                  f"{_pct(b['with_temp'], b['n']):>5.1f}% "
                  f"{_pct(b['with_si'], b['n']):>5.1f}% "
                  f"{_pct(b['with_chem'], b['n']):>5.1f}% "
                  f"{b['anomalies']:>5}")
        print()

        # ── SECTION 6: The 6 in-flight from Card 2 KPI - deep dump ──
        print("-" * 80)
        print("SECTION 6 — DEEP DUMP of every in-flight trip (Card 2 KPI source)")
        print("-" * 80)
        in_flight_floor = now_ist - timedelta(hours=6)
        in_flight = db.query(WbatnglTripMirror).filter(
            WbatnglTripMirror.out_date.isnot(None),
            WbatnglTripMirror.sms_ack_time.is_(None),
            WbatnglTripMirror.out_date >= in_flight_floor,
        ).order_by(WbatnglTripMirror.out_date.desc()).all()
        print(f"  In-flight trips (out_date set, sms_ack null, last 6h): {len(in_flight)}")
        print()
        for t in in_flight:
            print(f"  trip_id={t.trip_id!r}  id={t.id}  fleet={t.fleet_id}")
            print(f"    {t.source_lab} → {t.destination}  net_wt={t.net_weight}  "
                  f"temp={t.temp}  S={t.s_l}  Si={t.si_l}")
            print(f"    first_tare = {t.first_tare_time}")
            print(f"    closetime  = {t.closetime}")
            print(f"    out_date   = {t.out_date}  (← anchor)")
            print(f"    received   = {t.received_date}")
            print(f"    sms_ack    = {t.sms_ack_time}  (← NULL: 'in flight')")
            print(f"    updated    = {t.updated_date}")
            print(f"    stage      = {_stage_of(t)}")
            anos = _detect_anomalies(t)
            if anos:
                for a in anos:
                    print(f"    ⚠ anomaly: {a}")
            print()

    finally:
        db.close()


if __name__ == "__main__":
    main()
