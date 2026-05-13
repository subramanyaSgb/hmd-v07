"""
Card 5 (ON-SPEC %) investigation probe.

Card shows 100 %. We need to know:
  (a) Is the chem data actually flowing? (NULL rate for s_l, si_l)
  (b) Is the 100% real, or are out-of-spec rows being filtered out?
  (c) What does JSW's real S and Si distribution look like? — drives
      sensible default thresholds for SPEC_S_MAX / SPEC_SI_MIN / SPEC_SI_MAX
      when we move them to SystemConfig.
  (d) How many trips would fail at various candidate thresholds?

Read-only. No DB writes. No side effects.

Usage on BF4:
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_on_spec_probe.py
"""
from __future__ import annotations

import statistics
from datetime import timedelta

from sqlalchemy import func, and_

from backend.database.engine import SessionLocal
from backend.database.models import WbatnglTripMirror
from backend.routes.v2_dashboard import _now_ist_naive, _hours_ago


def _pct(num: int, denom: int) -> float:
    return (num * 100.0 / denom) if denom else 0.0


def main() -> None:
    db = SessionLocal()
    try:
        now_ist = _now_ist_naive()
        yesterday = _hours_ago(24)
        thirty_days_ago = now_ist - timedelta(days=30)

        print("=" * 72)
        print("Card 5 — ON-SPEC % probe")
        print("=" * 72)
        print(f"now (IST naive)        : {now_ist}")
        print(f"24h window cutoff      : {yesterday}")
        print(f"30d window cutoff      : {thirty_days_ago}")
        print()

        # ── Section 1: coverage in 24h ─────────────────────────────
        print("-" * 72)
        print("SECTION 1 — coverage in last 24h (dashboard window)")
        print("-" * 72)
        total_24h = db.query(func.count(WbatnglTripMirror.id)).filter(
            WbatnglTripMirror.closetime >= yesterday,
        ).scalar() or 0
        with_s = db.query(func.count(WbatnglTripMirror.id)).filter(
            WbatnglTripMirror.closetime >= yesterday,
            WbatnglTripMirror.s_l.isnot(None),
        ).scalar() or 0
        with_si = db.query(func.count(WbatnglTripMirror.id)).filter(
            WbatnglTripMirror.closetime >= yesterday,
            WbatnglTripMirror.si_l.isnot(None),
        ).scalar() or 0
        with_both = db.query(func.count(WbatnglTripMirror.id)).filter(
            WbatnglTripMirror.closetime >= yesterday,
            WbatnglTripMirror.s_l.isnot(None),
            WbatnglTripMirror.si_l.isnot(None),
        ).scalar() or 0
        print(f"  rows in last 24h            : {total_24h}")
        print(f"    with s_l not null         : {with_s:5d}  ({_pct(with_s, total_24h):5.1f}%)")
        print(f"    with si_l not null        : {with_si:5d}  ({_pct(with_si, total_24h):5.1f}%)")
        print(f"    with BOTH (denom of KPI)  : {with_both:5d}  ({_pct(with_both, total_24h):5.1f}%)")
        print()

        # ── Section 2: 24h ON-SPEC count under current code (S<=0.05, Si<=1.20) ───
        print("-" * 72)
        print("SECTION 2 — current production calc (S<=0.05 AND Si<=1.20)")
        print("-" * 72)
        in_spec_now = db.query(func.count(WbatnglTripMirror.id)).filter(
            WbatnglTripMirror.closetime >= yesterday,
            WbatnglTripMirror.s_l.isnot(None),
            WbatnglTripMirror.si_l.isnot(None),
            WbatnglTripMirror.s_l <= 0.05,
            WbatnglTripMirror.si_l <= 1.20,
        ).scalar() or 0
        print(f"  denominator (with both)     : {with_both}")
        print(f"  numerator (in spec)         : {in_spec_now}")
        print(f"  on_spec_pct (live dashboard): {_pct(in_spec_now, with_both):.1f} %")
        print()

        # ── Section 3: distributions over 30d ──────────────────────
        s_rows = db.query(WbatnglTripMirror.s_l).filter(
            WbatnglTripMirror.closetime >= thirty_days_ago,
            WbatnglTripMirror.s_l.isnot(None),
        ).all()
        si_rows = db.query(WbatnglTripMirror.si_l).filter(
            WbatnglTripMirror.closetime >= thirty_days_ago,
            WbatnglTripMirror.si_l.isnot(None),
        ).all()
        s_vals = [float(r[0]) for r in s_rows]
        si_vals = [float(r[0]) for r in si_rows]

        def _stats(label, vals, unit="%"):
            print(f"  {label}: n={len(vals)}", end="")
            if vals:
                print(f"  min={min(vals):.4f}  max={max(vals):.4f}  "
                      f"mean={sum(vals)/len(vals):.4f}  median={statistics.median(vals):.4f}  "
                      f"stddev={statistics.pstdev(vals):.4f} {unit}")
            else:
                print(" (no data)")

        print("-" * 72)
        print("SECTION 3 — distribution stats (last 30 days)")
        print("-" * 72)
        _stats("S  (s_l) ", s_vals, "%")
        _stats("Si (si_l)", si_vals, "%")
        print()

        # ── Section 4: histograms ──────────────────────────────────
        print("-" * 72)
        print("SECTION 4 — histograms (last 30 days)")
        print("-" * 72)
        print()
        print("  S distribution (typical BF tap range 0.020 - 0.080)")
        s_buckets = [
            ("< 0.020       ", lambda v: v < 0.020),
            ("0.020 - 0.030 ", lambda v: 0.020 <= v < 0.030),
            ("0.030 - 0.040 ", lambda v: 0.030 <= v < 0.040),
            ("0.040 - 0.050 ", lambda v: 0.040 <= v < 0.050),
            ("0.050 - 0.060 ", lambda v: 0.050 <= v < 0.060),
            ("0.060 - 0.080 ", lambda v: 0.060 <= v < 0.080),
            ("0.080+        ", lambda v: v >= 0.080),
        ]
        for name, pred in s_buckets:
            c = sum(1 for v in s_vals if pred(v))
            pct = _pct(c, len(s_vals))
            print(f"    {name}  {c:4d} ({pct:5.1f}%)  {'#' * int(round(pct/2))}")
        print()
        print("  Si distribution (typical BF tap range 0.4 - 1.2)")
        si_buckets = [
            ("< 0.20       ", lambda v: v < 0.20),
            ("0.20 - 0.30  ", lambda v: 0.20 <= v < 0.30),
            ("0.30 - 0.40  ", lambda v: 0.30 <= v < 0.40),
            ("0.40 - 0.60  ", lambda v: 0.40 <= v < 0.60),
            ("0.60 - 0.80  ", lambda v: 0.60 <= v < 0.80),
            ("0.80 - 1.00  ", lambda v: 0.80 <= v < 1.00),
            ("1.00 - 1.20  ", lambda v: 1.00 <= v < 1.20),
            ("1.20 - 1.50  ", lambda v: 1.20 <= v < 1.50),
            ("1.50+        ", lambda v: v >= 1.50),
        ]
        for name, pred in si_buckets:
            c = sum(1 for v in si_vals if pred(v))
            pct = _pct(c, len(si_vals))
            print(f"    {name}  {c:4d} ({pct:5.1f}%)  {'#' * int(round(pct/2))}")
        print()

        # ── Section 5: candidate threshold pass/fail counts (30d) ──
        print("-" * 72)
        print("SECTION 5 — pass count at candidate thresholds (30d, both populated)")
        print("-" * 72)
        # We need rows where BOTH are populated for the AND check
        both_rows = db.query(
            WbatnglTripMirror.s_l, WbatnglTripMirror.si_l,
        ).filter(
            WbatnglTripMirror.closetime >= thirty_days_ago,
            WbatnglTripMirror.s_l.isnot(None),
            WbatnglTripMirror.si_l.isnot(None),
        ).all()
        both = [(float(r[0]), float(r[1])) for r in both_rows]
        denom = len(both)
        print(f"  rows with both populated (30d): {denom}")
        print()
        configs = [
            ("S<=0.05 AND Si<=1.20 (current)",
                lambda s, si: s <= 0.05 and si <= 1.20),
            ("S<=0.05 AND 0.30<=Si<=1.20 (proposed)",
                lambda s, si: s <= 0.05 and 0.30 <= si <= 1.20),
            ("S<=0.05 AND 0.40<=Si<=1.20 (tighter Si min)",
                lambda s, si: s <= 0.05 and 0.40 <= si <= 1.20),
            ("S<=0.04 AND 0.30<=Si<=1.20 (tighter S)",
                lambda s, si: s <= 0.04 and 0.30 <= si <= 1.20),
            ("S<=0.05 AND 0.30<=Si<=1.00 (tighter Si max)",
                lambda s, si: s <= 0.05 and 0.30 <= si <= 1.00),
        ]
        for name, pred in configs:
            ok = sum(1 for s, si in both if pred(s, si))
            print(f"  {name:<42}  {ok}/{denom}  ({_pct(ok, denom):5.1f}%)")
        print()

        # ── Section 6: failure breakdown for proposed thresholds (30d) ──
        print("-" * 72)
        print("SECTION 6 — failure breakdown (30d, proposed S<=0.05 AND 0.30<=Si<=1.20)")
        print("-" * 72)
        fail_s_high = sum(1 for s, si in both if s > 0.05)
        fail_si_low = sum(1 for s, si in both if si < 0.30)
        fail_si_high = sum(1 for s, si in both if si > 1.20)
        only_s = sum(1 for s, si in both if s > 0.05 and 0.30 <= si <= 1.20)
        only_si_low = sum(1 for s, si in both if s <= 0.05 and si < 0.30)
        only_si_high = sum(1 for s, si in both if s <= 0.05 and si > 1.20)
        multi = sum(1 for s, si in both
                    if (s > 0.05) and (si < 0.30 or si > 1.20))
        print(f"  rows where S > 0.05            : {fail_s_high}  ({_pct(fail_s_high, denom):.1f}%)")
        print(f"  rows where Si < 0.30           : {fail_si_low}   ({_pct(fail_si_low, denom):.1f}%)")
        print(f"  rows where Si > 1.20           : {fail_si_high}  ({_pct(fail_si_high, denom):.1f}%)")
        print(f"  only S failing                 : {only_s}")
        print(f"  only Si-low failing            : {only_si_low}")
        print(f"  only Si-high failing           : {only_si_high}")
        print(f"  multi-fail (S + Si)            : {multi}")
        print()

        # ── Section 7: today's out-of-spec rows (proposed thresholds) ──
        print("-" * 72)
        print("SECTION 7 — today's out-of-spec rows (proposed S<=0.05 AND 0.30<=Si<=1.20)")
        print("-" * 72)
        rows_today = db.query(
            WbatnglTripMirror.trip_id,
            WbatnglTripMirror.fleet_id,
            WbatnglTripMirror.source_lab,
            WbatnglTripMirror.destination,
            WbatnglTripMirror.s_l,
            WbatnglTripMirror.si_l,
            WbatnglTripMirror.temp,
            WbatnglTripMirror.closetime,
        ).filter(
            WbatnglTripMirror.closetime >= yesterday,
            WbatnglTripMirror.s_l.isnot(None),
            WbatnglTripMirror.si_l.isnot(None),
        ).all()
        offspec = []
        for r in rows_today:
            s, si = float(r.s_l), float(r.si_l)
            if s > 0.05 or si < 0.30 or si > 1.20:
                offspec.append((r, s, si))
        print(f"  total trips with chem in 24h: {len(rows_today)}")
        print(f"  off-spec (proposed bounds)  : {len(offspec)}")
        if offspec:
            print()
            print(f"  {'trip_id':<22} {'fleet':<8} {'src':<8} {'dst':<8} "
                  f"{'S':>8} {'Si':>8} {'temp':>7} {'why':<30}")
            for r, s, si in offspec[:20]:
                whys = []
                if s > 0.05: whys.append("S>0.05")
                if si < 0.30: whys.append("Si<0.30")
                if si > 1.20: whys.append("Si>1.20")
                why = "+".join(whys)
                temp_str = f"{float(r.temp):>7.1f}" if r.temp is not None else f"{'   —':>7}"
                print(f"  {r.trip_id:<22} {r.fleet_id or '':<8} "
                      f"{r.source_lab or '':<8} {r.destination or '':<8} "
                      f"{s:>8.4f} {si:>8.4f} {temp_str} {why:<30}")
        else:
            print("  (none — all 24h trips with chem are within proposed bounds)")
        print()

        # ── Section 8: per-source comparison (Si distribution by BF) ──
        print("-" * 72)
        print("SECTION 8 — Si distribution by source_lab (30d) — context for spec calibration")
        print("-" * 72)
        per_src = db.query(
            WbatnglTripMirror.source_lab,
            func.count(WbatnglTripMirror.si_l).label("n"),
            func.min(WbatnglTripMirror.si_l).label("mn"),
            func.max(WbatnglTripMirror.si_l).label("mx"),
            func.avg(WbatnglTripMirror.si_l).label("mean"),
        ).filter(
            WbatnglTripMirror.closetime >= thirty_days_ago,
            WbatnglTripMirror.si_l.isnot(None),
        ).group_by(WbatnglTripMirror.source_lab).order_by(
            func.count(WbatnglTripMirror.si_l).desc()
        ).all()
        print(f"  {'source':<12} {'n':>6} {'min':>8} {'max':>8} {'mean':>8}")
        for s, n, mn, mx, mean in per_src:
            print(f"  {(s or '(NULL)'):<12} {n:>6} {float(mn):>8.4f} "
                  f"{float(mx):>8.4f} {float(mean):>8.4f}")
        print()

    finally:
        db.close()


if __name__ == "__main__":
    main()
