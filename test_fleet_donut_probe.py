"""
Card 7 (Torpedo Fleet Status donut) investigation probe.

Card currently has 7 buckets, 3 of which (Loading / In Transit / At SMS)
are always 0 because the classification reads V07's manual Trip table
(empty on BF4 — same root cause as Card 2 #174).

Plan: collapse to 3 buckets — MAINTENANCE / ACTIVE / IDLE — and use
WBATNGL for the in-flight check. This probe dumps the data needed to:
  1. Confirm the proposed 3-bucket counts make sense vs the current 7
  2. Surface edge cases (torpedoes with no FleetLiveLocation row, status
     "Maintenance" but no schedule, etc.)
  3. Verify MaintenanceSchedule usage on BF4 (is the table even used?)

Read-only. No DB writes.

Proposed classifier (first match wins):
  1. FleetManagement.status == "Maintenance"  →  MAINTENANCE
  2. has-in-flight-trip  OR  FleetManagement.status == "Moving"  →  ACTIVE
  3. else  →  IDLE

`has-in-flight-trip` = WbatnglTripMirror row exists for this torpedo where
out_date IS NOT NULL, sms_ack_time IS NULL, out_date >= now_ist - 6h.

Usage on BF4:
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_fleet_donut_probe.py
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func

from backend.database.engine import SessionLocal
from backend.database.models import (
    FleetManagement, FleetLiveLocation, MaintenanceSchedule,
    Trip, WbatnglTripMirror,
)
from backend.constants import TripStatus
from backend.routes.v2_dashboard import (
    _now_ist_naive, ACTIVE_TRIP_WINDOW_HOURS,
)


def main() -> None:
    db = SessionLocal()
    try:
        now_ist = _now_ist_naive()
        in_flight_floor = now_ist - timedelta(hours=ACTIVE_TRIP_WINDOW_HOURS)
        today_date = now_ist.date()

        print("=" * 74)
        print("Card 7 — Torpedo Fleet Status donut probe")
        print("=" * 74)
        print(f"now (IST naive)            : {now_ist}")
        print(f"in-flight floor (now - 6h) : {in_flight_floor}")
        print(f"today (IST date)           : {today_date}")
        print()

        # ── Section 1: FleetManagement.status distribution ─────────
        print("-" * 74)
        print("SECTION 1 — FleetManagement.status distribution (active fleet)")
        print("-" * 74)
        rows = db.query(
            FleetManagement.status,
            func.count(FleetManagement.id).label("n"),
        ).filter(
            FleetManagement.deleted_at.is_(None),
        ).group_by(FleetManagement.status).order_by(
            func.count(FleetManagement.id).desc()
        ).all()
        total_fleet = sum(int(r.n) for r in rows)
        print(f"  total fleet (non-deleted) : {total_fleet}")
        print(f"  {'status':<20} {'count':>6}")
        for r in rows:
            print(f"  {(r.status or '(NULL)'):<20} {r.n:>6}")
        print()

        # ── Section 2: MaintenanceSchedule usage ───────────────────
        print("-" * 74)
        print("SECTION 2 — MaintenanceSchedule usage")
        print("-" * 74)
        all_maint = db.query(func.count(MaintenanceSchedule.id)).scalar() or 0
        active_today = db.query(MaintenanceSchedule).filter(
            MaintenanceSchedule.start_date <= today_date,
            MaintenanceSchedule.end_date >= today_date,
        ).all()
        last_30d = db.query(func.count(MaintenanceSchedule.id)).filter(
            MaintenanceSchedule.start_date >= today_date - timedelta(days=30),
        ).scalar() or 0
        print(f"  total rows ever            : {all_maint}")
        print(f"  rows with start_date <30d  : {last_30d}")
        print(f"  rows ACTIVE today          : {len(active_today)}")
        if active_today:
            print()
            print(f"  {'node_id':<15} {'start_date':<12} {'end_date':<12} reason")
            for m in active_today:
                print(f"  {(m.node_id or ''):<15} {str(m.start_date):<12} "
                      f"{str(m.end_date):<12} {(getattr(m, 'reason', '') or '')[:50]}")
        else:
            print()
            print("  (no MaintenanceSchedule rows active today)")
            print("  This means: under current code, 'Hot Repair' bucket is always 0.")
            print("  Confirms collapsing Hot Repair + Ign Off into MAINTENANCE is correct.")
        print()

        # ── Section 3: Per-torpedo proposed bucket vs current bucket ──
        print("-" * 74)
        print("SECTION 3 — proposed bucket per torpedo (sorted by bucket then fleet_id)")
        print("-" * 74)

        # gather data once
        fleets = db.query(FleetManagement).filter(
            FleetManagement.deleted_at.is_(None),
        ).all()

        # in-flight WBATNGL trips set (proposed Active source #1)
        in_flight_rows = db.query(WbatnglTripMirror.fleet_id).filter(
            WbatnglTripMirror.out_date.isnot(None),
            WbatnglTripMirror.sms_ack_time.is_(None),
            WbatnglTripMirror.out_date >= in_flight_floor,
            WbatnglTripMirror.fleet_id.isnot(None),
        ).distinct().all()
        in_flight_set = {r[0] for r in in_flight_rows}

        # V07 native Trip active set (current Active source — for comparison)
        v07_active_rows = db.query(Trip.torpedo_id).filter(
            Trip.status.between(TripStatus.ASSIGNED, TripStatus.UNLOADING_ENDED),
            Trip.torpedo_id.isnot(None),
            Trip.deleted_at.is_(None),
        ).all()
        v07_active_set = {r[0] for r in v07_active_rows if r[0]}

        # maintenance active set today
        maint_active_set = {m.node_id for m in active_today if m.node_id}

        proposed_buckets = {"MAINTENANCE": 0, "ACTIVE": 0, "IDLE": 0}
        current_buckets = {"Loading": 0, "In Transit": 0, "At SMS": 0,
                           "Returning": 0, "Idle": 0, "Hot Repair": 0, "Ign Off": 0}
        proposed_per_fleet = {}

        for f in fleets:
            fid = f.fleet_id
            status = (f.status or "").strip()

            # Proposed
            if status == "Maintenance":
                proposed = "MAINTENANCE"
            elif fid in in_flight_set or status == "Moving":
                proposed = "ACTIVE"
            else:
                proposed = "IDLE"
            proposed_buckets[proposed] += 1
            proposed_per_fleet[fid] = proposed

            # Current (mirror of _fleet_breakdown logic, simplified)
            v07_trip_status = None  # we don't need exact status, just presence
            if status == "Maintenance":
                current = "Hot Repair" if fid in maint_active_set else "Ign Off"
            elif status == "Moving":
                if fid not in v07_active_set:
                    current = "Returning"
                else:
                    current = "In Transit"
            else:
                current = "Idle" if fid not in v07_active_set else "Loading"
            current_buckets[current] += 1

        print(f"  {'fleet':<8} {'fm.status':<15} {'proposed':<13} "
              f"{'in-flight':>9} {'v07-active':>11}")
        for f in sorted(fleets, key=lambda x: (proposed_per_fleet.get(x.fleet_id, ''), x.fleet_id or '')):
            fid = f.fleet_id
            in_flight = "yes" if fid in in_flight_set else "no"
            v07_active = "yes" if fid in v07_active_set else "no"
            print(f"  {(fid or '(NULL)'):<8} {(f.status or '(NULL)'):<15} "
                  f"{proposed_per_fleet.get(fid, '?'):<13} "
                  f"{in_flight:>9} {v07_active:>11}")
        print()

        # ── Section 4: Bucket summary comparison ───────────────────
        print("-" * 74)
        print("SECTION 4 — bucket count comparison")
        print("-" * 74)
        print(f"  TOTAL FLEET: {total_fleet}")
        print()
        print("  CURRENT (7 buckets):")
        for k, v in current_buckets.items():
            print(f"    {k:<14} {v:>4}")
        print(f"    sum: {sum(current_buckets.values())}")
        print()
        print("  PROPOSED (3 buckets):")
        for k, v in proposed_buckets.items():
            print(f"    {k:<14} {v:>4}")
        print(f"    sum: {sum(proposed_buckets.values())}")
        print()

        # ── Section 5: Edge cases ──────────────────────────────────
        print("-" * 74)
        print("SECTION 5 — edge cases worth knowing about")
        print("-" * 74)

        # 5a. Torpedoes with no FleetLiveLocation row (haven't reported)
        loc_set_rows = db.query(FleetLiveLocation.fleet_id).distinct().all()
        loc_set = {r[0] for r in loc_set_rows if r[0]}
        no_loc = [f.fleet_id for f in fleets if f.fleet_id not in loc_set]
        print(f"  Torpedoes with NO FleetLiveLocation row: {len(no_loc)}")
        if no_loc:
            print(f"    {', '.join(no_loc[:20])}{' ...' if len(no_loc) > 20 else ''}")
        print()

        # 5b. status="Maintenance" but no MaintenanceSchedule today
        maint_no_sched = [f.fleet_id for f in fleets
                          if (f.status or "").strip() == "Maintenance"
                          and f.fleet_id not in maint_active_set]
        print(f"  status='Maintenance' WITHOUT a MaintenanceSchedule today: {len(maint_no_sched)}")
        print(f"    (under current code these are 'Ign Off'. under proposed they are MAINTENANCE.)")
        if maint_no_sched:
            print(f"    {', '.join(maint_no_sched)}")
        print()

        # 5c. status="Moving" but no in-flight WBATNGL trip
        moving_no_trip = [f.fleet_id for f in fleets
                          if (f.status or "").strip() == "Moving"
                          and f.fleet_id not in in_flight_set]
        print(f"  status='Moving' WITHOUT an in-flight WBATNGL trip: {len(moving_no_trip)}")
        print(f"    (these are likely 'returning empty after unload'. proposed → ACTIVE.)")
        if moving_no_trip:
            print(f"    {', '.join(moving_no_trip)}")
        print()

        # 5d. in-flight WBATNGL trip but status not Moving
        inflight_not_moving = [fid for fid in in_flight_set
                               if not any((f.fleet_id == fid and (f.status or "").strip() == "Moving")
                                          for f in fleets)]
        print(f"  In-flight WBATNGL trip but status NOT 'Moving': {len(inflight_not_moving)}")
        print(f"    (torpedo is at SMS or stuck somewhere. proposed → ACTIVE either way.)")
        if inflight_not_moving:
            print(f"    {', '.join(inflight_not_moving)}")
        print()

        # 5e. Total in-flight WBATNGL count cross-check vs Card 2 KPI
        print(f"  In-flight WBATNGL trips (Card 2 KPI source): {len(in_flight_set)} torpedoes")
        print(f"    (Card 2 KPI counts the trips themselves; this counts distinct torpedoes.)")
        print()

    finally:
        db.close()


if __name__ == "__main__":
    main()
