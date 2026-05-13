"""
Card 3 (AVG CYCLE) investigation probe.

Runs the SAME filter used by /api/statistics/v2/overview (Card 3 calc),
then dumps the distribution so we can tell whether the 397.1 min average
is real or outlier-inflated.

Usage on BF4 (flat layout, no Development\\Version_07\\ subfolder):
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_avg_cycle_probe.py

Read-only. No side effects on the DB. Output is plain text — paste back.
"""
from __future__ import annotations

import statistics
from datetime import timedelta

from backend.database.engine import SessionLocal
from backend.database.models import WbatnglTripMirror
from backend.routes.v2_dashboard import _now_ist_naive, _start_of_day_ist


def main() -> None:
    db = SessionLocal()
    try:
        start_today = _start_of_day_ist()
        now_ist = _now_ist_naive()

        print("=" * 70)
        print("Card 3 — AVG CYCLE probe")
        print("=" * 70)
        print(f"now (IST naive)     : {now_ist}")
        print(f"start_today (IST)   : {start_today}")
        print(f"window age (hours)  : {(now_ist - start_today).total_seconds() / 3600:.2f}")
        print()

        # --- Filter A: current production filter (closetime >= today) ---
        rows_a = db.query(
            WbatnglTripMirror.trip_id,
            WbatnglTripMirror.fleet_id,
            WbatnglTripMirror.source_lab,
            WbatnglTripMirror.destination,
            WbatnglTripMirror.first_tare_time,
            WbatnglTripMirror.closetime,
            WbatnglTripMirror.out_date,
            WbatnglTripMirror.sms_ack_time,
        ).filter(
            WbatnglTripMirror.closetime >= start_today,
            WbatnglTripMirror.first_tare_time.isnot(None),
            WbatnglTripMirror.sms_ack_time.isnot(None),
        ).all()

        # --- Filter B: alternative (sms_ack_time >= today) ---
        rows_b = db.query(
            WbatnglTripMirror.trip_id,
            WbatnglTripMirror.first_tare_time,
            WbatnglTripMirror.sms_ack_time,
        ).filter(
            WbatnglTripMirror.sms_ack_time >= start_today,
            WbatnglTripMirror.first_tare_time.isnot(None),
            WbatnglTripMirror.sms_ack_time.isnot(None),
        ).all()

        for label, rows, has_full in (
            ("FILTER A — current production: closetime >= today", rows_a, True),
            ("FILTER B — alternative: sms_ack_time >= today", rows_b, False),
        ):
            print("-" * 70)
            print(label)
            print("-" * 70)
            durations = []
            for r in rows:
                if has_full:
                    ack = r.sms_ack_time
                    tare = r.first_tare_time
                else:
                    ack = r.sms_ack_time
                    tare = r.first_tare_time
                if ack and tare and ack > tare:
                    durations.append((ack - tare).total_seconds() / 60.0)

            n = len(durations)
            print(f"  rows matching filter   : {len(rows)}")
            print(f"  rows passing ack>tare  : {n}")
            if not durations:
                print("  (no valid cycles, nothing to summarise)")
                print()
                continue

            mn = min(durations)
            mx = max(durations)
            mean = sum(durations) / n
            med = statistics.median(durations)
            stdev = statistics.pstdev(durations) if n > 1 else 0.0

            print(f"  min cycle (min)        : {mn:7.1f}")
            print(f"  max cycle (min)        : {mx:7.1f}")
            print(f"  mean (production calc) : {mean:7.1f}  <-- THIS is what the dashboard shows")
            print(f"  median                 : {med:7.1f}")
            print(f"  stddev                 : {stdev:7.1f}")
            print()

            # histogram buckets (minutes)
            buckets = [
                ("< 60 min   ", lambda d: d < 60),
                (" 60-120 min", lambda d: 60 <= d < 120),
                ("120-240 min", lambda d: 120 <= d < 240),
                ("240-360 min", lambda d: 240 <= d < 360),
                ("360-480 min", lambda d: 360 <= d < 480),
                ("480-720 min", lambda d: 480 <= d < 720),
                ("720+ min   ", lambda d: d >= 720),
            ]
            print("  histogram:")
            for name, predicate in buckets:
                c = sum(1 for d in durations if predicate(d))
                pct = c * 100.0 / n if n else 0
                bar = "#" * int(round(pct / 2))
                print(f"    {name}  {c:3d} ({pct:5.1f}%)  {bar}")
            print()

            # trimmed mean (drop top + bottom 5% if n >= 20)
            if n >= 20:
                trim = max(1, n // 20)
                sorted_d = sorted(durations)
                trimmed = sorted_d[trim:-trim] if trim else sorted_d
                trim_mean = sum(trimmed) / len(trimmed)
                print(f"  trimmed mean (5%/side, n={len(trimmed)}): {trim_mean:.1f}")
                print()

        # --- Top 5 longest cycles in Filter A (the production rows) ---
        print("-" * 70)
        print("TOP 5 longest cycles in production filter (likely outliers / stuck acks)")
        print("-" * 70)
        ranked = []
        for r in rows_a:
            ack, tare = r.sms_ack_time, r.first_tare_time
            if ack and tare and ack > tare:
                ranked.append(((ack - tare).total_seconds() / 60.0, r))
        ranked.sort(key=lambda x: -x[0])
        for dur, r in ranked[:5]:
            print(
                f"  trip {r.trip_id:<25} torpedo {r.fleet_id:<8} "
                f"{r.source_lab or '?'} -> {r.destination or '?':<8} "
                f"cycle {dur:7.1f} min  "
                f"first_tare={r.first_tare_time}  "
                f"sms_ack={r.sms_ack_time}"
            )
        print()

        # --- Filter A diagnostics — when did first_tare happen? ---
        print("-" * 70)
        print("FILTER A row-age diagnostics")
        print("-" * 70)
        crossed_midnight = 0
        for r in rows_a:
            if r.first_tare_time and r.first_tare_time < start_today:
                crossed_midnight += 1
        print(f"  rows in Filter A where first_tare < today_00:00 IST: {crossed_midnight}")
        print(f"  (these are trips that started yesterday but show up because closetime is today)")
        print()

    finally:
        db.close()


if __name__ == "__main__":
    main()
