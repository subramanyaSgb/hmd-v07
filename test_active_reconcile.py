"""
Reconciliation probe for Card 2 KPI (=6) vs Card 7 Donut ACTIVE (=9).

Hypothesis: Donut ACTIVE counts in-flight torpedoes UNION Moving torpedoes,
while Card 2 counts in-flight trip rows. The 9-6=3 gap should be exactly
the Moving-without-in-flight set.

Phase 1 of /systematic-debugging — gather evidence at the component
boundary before proposing fixes.

This probe runs the EXACT queries each card runs, then dumps the
set-theoretic decomposition.

Read-only. No DB writes.

Usage on BF4:
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_active_reconcile.py
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func

from backend.database.engine import SessionLocal
from backend.database.models import FleetManagement, WbatnglTripMirror
from backend.routes.v2_dashboard import (
    _now_ist_naive, ACTIVE_TRIP_WINDOW_HOURS,
)


def main() -> None:
    db = SessionLocal()
    try:
        now_ist = _now_ist_naive()
        floor = now_ist - timedelta(hours=ACTIVE_TRIP_WINDOW_HOURS)

        print("=" * 78)
        print("Active-trip reconciliation probe")
        print("=" * 78)
        print(f"now (IST naive)     : {now_ist}")
        print(f"6h floor            : {floor}")
        print()

        # ───────────────────────────────────────────────────────────
        # Run Card 2's EXACT query
        # ───────────────────────────────────────────────────────────
        card2_count = db.query(func.count(WbatnglTripMirror.id)).filter(
            WbatnglTripMirror.out_date.isnot(None),
            WbatnglTripMirror.sms_ack_time.is_(None),
            WbatnglTripMirror.out_date >= floor,
        ).scalar() or 0
        print(f"Card 2 KPI 'ACTIVE TRIPS' (count of trip ROWS): {card2_count}")
        print()

        # Pull the trip rows themselves so we can see fleet_ids
        card2_rows = db.query(
            WbatnglTripMirror.id,
            WbatnglTripMirror.trip_id,
            WbatnglTripMirror.fleet_id,
            WbatnglTripMirror.source_lab,
            WbatnglTripMirror.destination,
            WbatnglTripMirror.out_date,
        ).filter(
            WbatnglTripMirror.out_date.isnot(None),
            WbatnglTripMirror.sms_ack_time.is_(None),
            WbatnglTripMirror.out_date >= floor,
        ).all()

        print("  rows behind Card 2:")
        print(f"  {'id':<8} {'trip_id':<26} {'fleet':<10} {'src':<8} {'dst':<8} out_date")
        for r in card2_rows:
            print(f"  {r.id:<8} {r.trip_id:<26} "
                  f"{(r.fleet_id or '(NULL)'):<10} "
                  f"{(r.source_lab or ''):<8} {(r.destination or ''):<8} {r.out_date}")
        print()

        # Distinct fleet_ids in those rows
        in_flight_set = {r.fleet_id for r in card2_rows if r.fleet_id}
        null_fleet_rows = [r for r in card2_rows if not r.fleet_id]
        print(f"  distinct fleet_ids in Card 2 rows: {len(in_flight_set)}")
        print(f"  rows with NULL fleet_id          : {len(null_fleet_rows)}")
        if null_fleet_rows:
            print(f"    (these are counted by Card 2 but EXCLUDED from donut!)")
            for r in null_fleet_rows:
                print(f"    row id={r.id} trip_id={r.trip_id}")
        print()

        # ───────────────────────────────────────────────────────────
        # Donut classifier — replicate exactly
        # ───────────────────────────────────────────────────────────
        donut_in_flight_rows = db.query(WbatnglTripMirror.fleet_id).filter(
            WbatnglTripMirror.out_date.isnot(None),
            WbatnglTripMirror.sms_ack_time.is_(None),
            WbatnglTripMirror.out_date >= floor,
            WbatnglTripMirror.fleet_id.isnot(None),
        ).distinct().all()
        donut_in_flight_set = {r[0] for r in donut_in_flight_rows}

        fleets = db.query(FleetManagement).filter(
            FleetManagement.deleted_at.is_(None),
        ).all()
        moving_set = {f.fleet_id for f in fleets
                      if (f.status or "").strip() == "Moving"}
        maintenance_set = {f.fleet_id for f in fleets
                           if (f.status or "").strip() == "Maintenance"}

        donut_active_set = (donut_in_flight_set | moving_set) - maintenance_set
        donut_maintenance_set = maintenance_set
        donut_idle_set = ({f.fleet_id for f in fleets}
                          - donut_active_set
                          - donut_maintenance_set)

        # ───────────────────────────────────────────────────────────
        # Set-theoretic decomposition
        # ───────────────────────────────────────────────────────────
        print("-" * 78)
        print("SET DECOMPOSITION")
        print("-" * 78)
        print(f"  A = in-flight torpedoes (distinct fleet_id):  {len(donut_in_flight_set)}")
        print(f"      {sorted(donut_in_flight_set)}")
        print()
        print(f"  B = Moving torpedoes:                         {len(moving_set)}")
        print(f"      {sorted(moving_set)}")
        print()
        print(f"  M = Maintenance torpedoes:                    {len(maintenance_set)}")
        print(f"      {sorted(maintenance_set)}")
        print()
        print(f"  A ∩ B (in-flight AND Moving):                {len(donut_in_flight_set & moving_set)}")
        print(f"      {sorted(donut_in_flight_set & moving_set)}")
        print()
        print(f"  A − B (in-flight NOT Moving — at SMS, parked, etc.): "
              f"{len(donut_in_flight_set - moving_set)}")
        print(f"      {sorted(donut_in_flight_set - moving_set)}")
        print()
        print(f"  B − A (Moving NOT in-flight — likely returning empty): "
              f"{len(moving_set - donut_in_flight_set)}")
        print(f"      {sorted(moving_set - donut_in_flight_set)}")
        print()
        print(f"  A ∩ M (in-flight AND in Maintenance — stale trips): "
              f"{len(donut_in_flight_set & maintenance_set)}")
        print(f"      {sorted(donut_in_flight_set & maintenance_set)}")
        print()

        # ───────────────────────────────────────────────────────────
        # Final card-by-card comparison
        # ───────────────────────────────────────────────────────────
        print("-" * 78)
        print("FINAL COMPARISON")
        print("-" * 78)
        print(f"  Card 2 KPI 'ACTIVE TRIPS' (trip rows)  : {card2_count}")
        print(f"  Donut ACTIVE        (torpedoes)        : {len(donut_active_set)}")
        print(f"  Donut IDLE                             : {len(donut_idle_set)}")
        print(f"  Donut MAINTENANCE                      : {len(donut_maintenance_set)}")
        print(f"  Donut sum                              : "
              f"{len(donut_active_set) + len(donut_idle_set) + len(donut_maintenance_set)}")
        print(f"  Total fleet                            : {len(fleets)}")
        print()

        # ───────────────────────────────────────────────────────────
        # Hypothesis check
        # ───────────────────────────────────────────────────────────
        print("-" * 78)
        print("HYPOTHESIS CHECK")
        print("-" * 78)
        explain = []
        explain.append(f"Donut ACTIVE = (in-flight ∪ Moving) − Maintenance")
        explain.append(f"             = {len(donut_in_flight_set)} ∪ {len(moving_set)} "
                       f"− {len(maintenance_set)}")
        explain.append(f"             = {len(donut_in_flight_set | moving_set)} "
                       f"− |overlap with Maintenance|")
        explain.append(f"             = {len(donut_active_set)}")
        for line in explain:
            print(f"  {line}")
        print()
        gap = len(donut_active_set) - len(donut_in_flight_set)
        print(f"  Gap (Donut ACTIVE − in-flight distinct torpedoes): {gap}")
        print(f"  Moving-NOT-in-flight count                       : "
              f"{len(moving_set - donut_in_flight_set - maintenance_set)}")
        if gap == len(moving_set - donut_in_flight_set - maintenance_set):
            print()
            print("  ✅ Hypothesis CONFIRMED: the gap IS the Moving-without-in-flight set.")
            print("     These torpedoes are likely 'returning empty after unload'.")
            print("     Both cards are RIGHT — they measure different things.")
        else:
            print()
            print("  ⚠️  Gap does NOT match Moving-no-trip count — something else going on.")
            print("     Investigate further before proposing a fix.")

    finally:
        db.close()


if __name__ == "__main__":
    main()
