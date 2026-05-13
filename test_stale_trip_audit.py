"""
Stale-trip audit — find torpedoes with an in-flight WBATNGL trip while
their FleetManagement.status is "Maintenance".

Discovered during Card 7 probe (2026-05-13): TLC-36 had an open in-flight
WBATNGL trip (out_date set, sms_ack_time null, within last 6h) while
SuVeechi reported the torpedo as "Maintenance" / Ign Off. Likely scenario:
trip got dispatched, torpedo went into unplanned maintenance mid-trip,
the trip was never properly closed at SMS so no sms_ack_time was logged.

This audit dumps the full trip + location history for ALL such torpedoes
so we can decide how to handle them (auto-close stale trips? alert?
require operator action?).

Read-only. No DB writes.

Usage on BF4:
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_stale_trip_audit.py
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import desc

from backend.database.engine import SessionLocal
from backend.database.models import (
    FleetLiveLocation, FleetManagement, HtsHeatMirror, WbatnglTripMirror,
)
from backend.routes.v2_dashboard import (
    _now_ist_naive, ACTIVE_TRIP_WINDOW_HOURS,
)


def _iso(ts):
    return ts.isoformat() if ts else "—"


def main() -> None:
    db = SessionLocal()
    try:
        now_ist = _now_ist_naive()
        in_flight_floor = now_ist - timedelta(hours=ACTIVE_TRIP_WINDOW_HOURS)

        print("=" * 78)
        print("Stale-trip audit — open WBATNGL trips on Maintenance torpedoes")
        print("=" * 78)
        print(f"now (IST naive)            : {now_ist}")
        print(f"in-flight floor (now - 6h) : {in_flight_floor}")
        print()

        # ── Find offending torpedoes: status=Maintenance + in-flight trip ──
        maint_fleets = db.query(FleetManagement).filter(
            FleetManagement.deleted_at.is_(None),
            FleetManagement.status == "Maintenance",
        ).all()
        maint_ids = {f.fleet_id for f in maint_fleets if f.fleet_id}

        in_flight_rows = db.query(WbatnglTripMirror).filter(
            WbatnglTripMirror.out_date.isnot(None),
            WbatnglTripMirror.sms_ack_time.is_(None),
            WbatnglTripMirror.out_date >= in_flight_floor,
            WbatnglTripMirror.fleet_id.in_(maint_ids) if maint_ids else False,
        ).order_by(WbatnglTripMirror.out_date.desc()).all()

        if not in_flight_rows:
            print("No stale trips found. Good — every Maintenance torpedo has a")
            print("clean trip history (no dangling in-flight rows).")
            print()
            print(f"  Maintenance fleet IDs checked: {sorted(maint_ids)}")
            return

        # group offending trips by torpedo
        by_fleet = {}
        for t in in_flight_rows:
            by_fleet.setdefault(t.fleet_id, []).append(t)

        print(f"Found {len(in_flight_rows)} stale trip(s) across {len(by_fleet)} torpedo(es):")
        print()

        # ── per-torpedo deep dive ──
        for fid in sorted(by_fleet.keys()):
            trips = by_fleet[fid]
            print("=" * 78)
            print(f"TORPEDO {fid}")
            print("=" * 78)

            # Current FleetManagement row
            fm = next((f for f in maint_fleets if f.fleet_id == fid), None)
            if fm:
                print(f"  FleetManagement.status        : {fm.status}")
                print(f"  FleetManagement.capacity (MT) : {fm.capacity}")
                print(f"  FleetManagement.updated_at    : {_iso(getattr(fm, 'updated_at', None))}")

            # Last 3 FleetLiveLocation rows
            locs = db.query(FleetLiveLocation).filter(
                FleetLiveLocation.fleet_id == fid,
            ).order_by(desc(FleetLiveLocation.id)).limit(3).all()
            print()
            print(f"  Last 3 FleetLiveLocation rows:")
            for loc in locs:
                print(f"    id={loc.id} x={loc.x} y={loc.y} "
                      f"last_updated={_iso(loc.last_updated)} "
                      f"type={loc.type}")

            # The stale trip(s)
            print()
            print(f"  Open in-flight WBATNGL trip(s) ({len(trips)}):")
            for t in trips:
                print(f"    trip_id        : {t.trip_id}")
                print(f"    source -> dest : {t.source_lab} -> {t.destination}")
                print(f"    tap_no         : {t.tap_no}")
                print(f"    net_weight     : {t.net_weight}")
                print(f"    temp           : {t.temp}")
                print(f"    first_tare_time: {_iso(t.first_tare_time)}")
                print(f"    closetime      : {_iso(t.closetime)}")
                print(f"    out_date       : {_iso(t.out_date)}")
                print(f"    received_date  : {_iso(t.received_date)}")
                print(f"    sms_ack_time   : {_iso(t.sms_ack_time)}  ← NULL = unclosed")
                print(f"    updated_date   : {_iso(t.updated_date)}")
                print(f"    age since out  : "
                      f"{(now_ist - t.out_date).total_seconds()/3600:.1f} hours")

                # Did HTS match the heat?
                if t.fleet_id:
                    hts_matches = db.query(HtsHeatMirror).filter(
                        HtsHeatMirror.torpedo_no == fid,
                        HtsHeatMirror.torpedo_in_time >= (t.closetime - timedelta(minutes=15)
                                                          if t.closetime else t.out_date - timedelta(hours=1)),
                        HtsHeatMirror.torpedo_in_time <= (t.closetime + timedelta(minutes=90)
                                                          if t.closetime else t.out_date + timedelta(hours=2)),
                    ).all()
                    if hts_matches:
                        print(f"    HTS matched heats: "
                              f"{[h.heat_no for h in hts_matches]}")
                        for h in hts_matches:
                            print(f"      heat_no={h.heat_no} converter={h.converter_no} "
                                  f"sms={h.sms} torpedo_in={_iso(h.torpedo_in_time)} "
                                  f"qty={h.hotmetal_qty}")
                    else:
                        print(f"    HTS matched heats: none "
                              f"(could mean SMS didn't process this delivery)")

            print()

        # ── Recovery options summary ──
        print("=" * 78)
        print("RECOVERY OPTIONS")
        print("=" * 78)
        print()
        print("For each stale trip above, possible actions:")
        print("  A) Manual close: set sms_ack_time = updated_date in WBATNGL")
        print("     upstream so the row stops appearing as in-flight.")
        print("  B) Auto-close in mirror: add a column or write a maintenance")
        print("     job that sets sms_ack_time after N hours of no update.")
        print("  C) Ignore: accept that these rows linger and don't pollute")
        print("     KPIs (the Card 2 6h cap already handles this — they")
        print("     drop off after 6h naturally).")
        print()
        print("Recommendation: C for now. If pattern grows, revisit.")
        print()

    finally:
        db.close()


if __name__ == "__main__":
    main()
