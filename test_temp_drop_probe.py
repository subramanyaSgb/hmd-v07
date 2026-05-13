"""
Card 4 (TEMP DROP BF -> SMS) investigation probe.

Card shows 0 C. We need to know whether:
  (a) `bds_temp` column is NULL on most/all rows (upstream not filling it
      or _zero_to_null killing valid zeros)
  (b) `bds_temp` is populated and the dashboard math is wrong
  (c) `bds_temp` is the wrong column entirely

Read-only. No DB writes. No side effects.

Usage on BF4:
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_temp_drop_probe.py
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func

from backend.database.engine import SessionLocal
from backend.database.models import WbatnglTripMirror
from backend.routes.v2_dashboard import _now_ist_naive, _hours_ago


def main() -> None:
    db = SessionLocal()
    try:
        now_ist = _now_ist_naive()
        yesterday = _hours_ago(24)
        thirty_days_ago = now_ist - timedelta(days=30)

        print("=" * 72)
        print("Card 4 — TEMP DROP BF -> SMS probe")
        print("=" * 72)
        print(f"now (IST naive)        : {now_ist}")
        print(f"24h window cutoff      : {yesterday}")
        print(f"30d window cutoff      : {thirty_days_ago}")
        print()

        # ── Section 1: row counts and NULL-rate in 24h ─────────────
        print("-" * 72)
        print("SECTION 1 — counts in last 24h (the dashboard's window)")
        print("-" * 72)
        total_24h = db.query(func.count(WbatnglTripMirror.id)).filter(
            WbatnglTripMirror.closetime >= yesterday,
        ).scalar() or 0
        with_temp_24h = db.query(func.count(WbatnglTripMirror.id)).filter(
            WbatnglTripMirror.closetime >= yesterday,
            WbatnglTripMirror.temp.isnot(None),
        ).scalar() or 0
        with_bds_24h = db.query(func.count(WbatnglTripMirror.id)).filter(
            WbatnglTripMirror.closetime >= yesterday,
            WbatnglTripMirror.bds_temp.isnot(None),
        ).scalar() or 0
        both_24h = db.query(func.count(WbatnglTripMirror.id)).filter(
            WbatnglTripMirror.closetime >= yesterday,
            WbatnglTripMirror.temp.isnot(None),
            WbatnglTripMirror.bds_temp.isnot(None),
        ).scalar() or 0
        print(f"  rows in last 24h            : {total_24h}")
        print(f"    with temp not null        : {with_temp_24h:5d}  "
              f"({with_temp_24h*100/max(total_24h,1):5.1f}%)")
        print(f"    with bds_temp not null    : {with_bds_24h:5d}  "
              f"({with_bds_24h*100/max(total_24h,1):5.1f}%)")
        print(f"    with BOTH not null        : {both_24h:5d}  "
              f"({both_24h*100/max(total_24h,1):5.1f}%)  <-- "
              f"dashboard reads from this")
        print()

        # ── Section 2: ever-populated check (30 days) ──────────────
        print("-" * 72)
        print("SECTION 2 — bds_temp populated rate in last 30 days")
        print("-" * 72)
        total_30d = db.query(func.count(WbatnglTripMirror.id)).filter(
            WbatnglTripMirror.closetime >= thirty_days_ago,
        ).scalar() or 0
        with_bds_30d = db.query(func.count(WbatnglTripMirror.id)).filter(
            WbatnglTripMirror.closetime >= thirty_days_ago,
            WbatnglTripMirror.bds_temp.isnot(None),
        ).scalar() or 0
        print(f"  rows in last 30 days        : {total_30d}")
        print(f"  with bds_temp not null      : {with_bds_30d:5d}  "
              f"({with_bds_30d*100/max(total_30d,1):5.1f}%)")
        if with_bds_30d == 0:
            print("  ** bds_temp has NEVER been populated in any row we've synced **")
        elif with_bds_30d < total_30d * 0.05:
            print("  ** bds_temp is rarely populated (< 5% of rows) **")
        print()

        # ── Section 3: per-source breakdown ────────────────────────
        print("-" * 72)
        print("SECTION 3 — by source_lab (which BF reports bds_temp?)")
        print("-" * 72)
        rows_src = db.query(
            WbatnglTripMirror.source_lab,
            func.count(WbatnglTripMirror.id).label("total"),
            func.count(WbatnglTripMirror.bds_temp).label("with_bds"),
        ).filter(
            WbatnglTripMirror.closetime >= thirty_days_ago,
        ).group_by(WbatnglTripMirror.source_lab).order_by(
            func.count(WbatnglTripMirror.id).desc()
        ).all()
        print(f"  {'source_lab':<12}  {'total_30d':>9}  {'with_bds':>9}  {'pct':>7}")
        for s, total, with_bds in rows_src:
            pct = (with_bds or 0) * 100.0 / max(total, 1)
            print(f"  {(s or '(NULL)'):<12}  {total:>9}  {with_bds or 0:>9}  {pct:>6.1f}%")
        print()

        # ── Section 4: by source_table ─────────────────────────────
        print("-" * 72)
        print("SECTION 4 — by source_table (which upstream Oracle view?)")
        print("-" * 72)
        rows_tbl = db.query(
            WbatnglTripMirror.source_table,
            func.count(WbatnglTripMirror.id).label("total"),
            func.count(WbatnglTripMirror.bds_temp).label("with_bds"),
        ).filter(
            WbatnglTripMirror.closetime >= thirty_days_ago,
        ).group_by(WbatnglTripMirror.source_table).order_by(
            func.count(WbatnglTripMirror.id).desc()
        ).all()
        for st, total, with_bds in rows_tbl:
            pct = (with_bds or 0) * 100.0 / max(total, 1)
            print(f"  {(st or '(NULL)'):<60} total={total:>5} bds={with_bds or 0:>5} ({pct:.1f}%)")
        print()

        # ── Section 5: numeric range of bds_temp where populated ───
        print("-" * 72)
        print("SECTION 5 — bds_temp value distribution (where not NULL, 30d)")
        print("-" * 72)
        agg = db.query(
            func.min(WbatnglTripMirror.bds_temp),
            func.max(WbatnglTripMirror.bds_temp),
            func.avg(WbatnglTripMirror.bds_temp),
            func.count(WbatnglTripMirror.bds_temp),
        ).filter(
            WbatnglTripMirror.closetime >= thirty_days_ago,
            WbatnglTripMirror.bds_temp.isnot(None),
        ).first()
        if agg and agg[3]:
            print(f"  count        : {agg[3]}")
            print(f"  min          : {float(agg[0]):.1f}")
            print(f"  max          : {float(agg[1]):.1f}")
            print(f"  mean         : {float(agg[2]):.1f}")
        else:
            print("  (no non-null bds_temp values in last 30 days)")
        print()

        # ── Section 6: sample rows where both temp and bds_temp set ─
        print("-" * 72)
        print("SECTION 6 — sample rows with BOTH temp and bds_temp (30d, up to 10)")
        print("-" * 72)
        samples = db.query(
            WbatnglTripMirror.trip_id,
            WbatnglTripMirror.fleet_id,
            WbatnglTripMirror.source_lab,
            WbatnglTripMirror.destination,
            WbatnglTripMirror.temp,
            WbatnglTripMirror.bds_temp,
            WbatnglTripMirror.closetime,
            WbatnglTripMirror.source_table,
        ).filter(
            WbatnglTripMirror.closetime >= thirty_days_ago,
            WbatnglTripMirror.temp.isnot(None),
            WbatnglTripMirror.bds_temp.isnot(None),
        ).order_by(WbatnglTripMirror.closetime.desc()).limit(10).all()
        if not samples:
            print("  (no rows have BOTH temp and bds_temp populated in last 30 days)")
        else:
            print(f"  {'trip_id':<24} {'fleet':<8} {'src':<8} {'dst':<8} "
                  f"{'temp':>7} {'bds':>7} {'drop':>7} {'closetime':<19}")
            for r in samples:
                drop = float(r.temp) - float(r.bds_temp) if r.bds_temp else None
                print(
                    f"  {r.trip_id:<24} {r.fleet_id or '':<8} "
                    f"{r.source_lab or '':<8} {r.destination or '':<8} "
                    f"{float(r.temp):>7.1f} {float(r.bds_temp):>7.1f} "
                    f"{drop:>+7.1f} {str(r.closetime):<19}"
                )
        print()

        # ── Section 7: temp column sanity (BF-side) ────────────────
        print("-" * 72)
        print("SECTION 7 — temp column distribution (BF-side, 30d, where not NULL)")
        print("-" * 72)
        agg_t = db.query(
            func.min(WbatnglTripMirror.temp),
            func.max(WbatnglTripMirror.temp),
            func.avg(WbatnglTripMirror.temp),
            func.count(WbatnglTripMirror.temp),
        ).filter(
            WbatnglTripMirror.closetime >= thirty_days_ago,
            WbatnglTripMirror.temp.isnot(None),
        ).first()
        if agg_t and agg_t[3]:
            print(f"  count        : {agg_t[3]}")
            print(f"  min          : {float(agg_t[0]):.1f}")
            print(f"  max          : {float(agg_t[1]):.1f}")
            print(f"  mean         : {float(agg_t[2]):.1f}")
        else:
            print("  (no non-null temp values)")
        print()

    finally:
        db.close()


if __name__ == "__main__":
    main()
