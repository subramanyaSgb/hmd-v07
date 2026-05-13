"""
Position-based "Moving" probe.

User decision (2026-05-13): donut "Moving" bucket should be based on
ACTUAL location changes, not SuVeechi's status tag.

Phase 1 of /systematic-debugging — gather evidence before defining the
rule. This probe shows:
  1. FleetLiveLocation row history per torpedo (how many rows over time,
     last N samples)
  2. Position deltas: distance between successive points, time gaps
  3. Three candidate rules for "Moving" — each one's classification of
     today's fleet:
        Rule X1: distance moved >  10 m in last  5 min
        Rule X2: distance moved >  30 m in last 10 min
        Rule X3: distance moved > 100 m in last 15 min
  4. Comparison vs SuVeechi-tag classification (FM.status="Moving")
     — tells us how often they disagree, and in which direction

Read-only. No DB writes.

Haversine distance in meters (great-circle on Earth radius 6371000).

Usage on BF4:
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_position_moving_probe.py
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import timedelta

from sqlalchemy import desc

from backend.database.engine import SessionLocal
from backend.database.models import FleetLiveLocation, FleetManagement
from backend.routes.v2_dashboard import _now_ist_naive


EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    """Great-circle distance between two (lat, lon) in meters."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return EARTH_RADIUS_M * c


def main() -> None:
    db = SessionLocal()
    try:
        now_ist = _now_ist_naive()
        # Working notes — SuVeechi insert rate observed ~10s/torpedo when moving.
        # We sample windows: 5min, 10min, 15min.
        window_short = now_ist - timedelta(minutes=5)
        window_med   = now_ist - timedelta(minutes=10)
        window_long  = now_ist - timedelta(minutes=15)

        print("=" * 80)
        print("Position-based 'Moving' probe — candidate rule comparison")
        print("=" * 80)
        print(f"now (IST naive) : {now_ist}")
        print(f"5-min floor     : {window_short}")
        print(f"10-min floor    : {window_med}")
        print(f"15-min floor    : {window_long}")
        print()

        # All fleet (active)
        fleets = db.query(FleetManagement).filter(
            FleetManagement.deleted_at.is_(None),
        ).all()
        fm_status_by_fid = {f.fleet_id: (f.status or "").strip() for f in fleets}

        # Per-torpedo classification
        suveechi_moving = set()
        rule_x1_moving = set()                                               # 10m in 5 min
        rule_x2_moving = set()                                               # 30m in 10 min
        rule_x3_moving = set()                                               # 100m in 15 min
        sample_details = []

        # ── Collect deltas per torpedo ─────────────────────────────
        for f in fleets:
            fid = f.fleet_id
            if not fid:
                continue
            if (f.status or "").strip() == "Moving":
                suveechi_moving.add(fid)

            # Pull most recent location rows from last 20 minutes (cushion)
            window_cushion = now_ist - timedelta(minutes=20)
            locs = db.query(FleetLiveLocation).filter(
                FleetLiveLocation.fleet_id == fid,
                FleetLiveLocation.last_updated >= window_cushion,
            ).order_by(desc(FleetLiveLocation.last_updated)).limit(20).all()

            if not locs:
                # No recent samples → can't say either way
                continue

            latest = locs[0]

            # For each window, find the farthest sample within that window
            # from the latest sample. If max distance > threshold → Moving.
            def max_delta(window_floor):
                max_d = 0.0
                for older in locs[1:]:
                    if older.last_updated < window_floor:
                        break
                    if (older.x is None or older.y is None or
                        latest.x is None or latest.y is None):
                        continue
                    # Note: in plant CCS — x=lat, y=lon
                    d = haversine_m(float(latest.x), float(latest.y),
                                    float(older.x), float(older.y))
                    if d > max_d:
                        max_d = d
                return max_d

            d_5  = max_delta(window_short)
            d_10 = max_delta(window_med)
            d_15 = max_delta(window_long)

            if d_5  > 10:  rule_x1_moving.add(fid)
            if d_10 > 30:  rule_x2_moving.add(fid)
            if d_15 > 100: rule_x3_moving.add(fid)

            sample_details.append({
                "fid": fid,
                "fm_status": fm_status_by_fid.get(fid),
                "samples_20min": len(locs),
                "latest": latest,
                "d_5":  d_5,
                "d_10": d_10,
                "d_15": d_15,
            })

        # ── SECTION 1: per-torpedo position deltas (only torpedoes with
        #    samples in last 20min, sorted by max delta) ──
        print("-" * 80)
        print("SECTION 1 — per-torpedo position deltas (last 20 min of samples)")
        print("-" * 80)
        sample_details.sort(key=lambda r: -max(r["d_5"], r["d_10"], r["d_15"]))
        print(f"  {'fleet':<8} {'fm.status':<13} {'n':>3}  "
              f"{'d_5min':>8} {'d_10min':>9} {'d_15min':>9}  "
              f"{'X1':>3} {'X2':>3} {'X3':>3}  latest pos")
        for r in sample_details:
            fid = r["fid"]
            in_x1 = "Y" if fid in rule_x1_moving else "·"
            in_x2 = "Y" if fid in rule_x2_moving else "·"
            in_x3 = "Y" if fid in rule_x3_moving else "·"
            pos = f"({r['latest'].x:.5f},{r['latest'].y:.5f})"
            print(f"  {fid:<8} {(r['fm_status'] or ''):<13} {r['samples_20min']:>3}  "
                  f"{r['d_5']:>7.1f}m {r['d_10']:>8.1f}m {r['d_15']:>8.1f}m  "
                  f"{in_x1:>3} {in_x2:>3} {in_x3:>3}  {pos}")
        print()

        # ── SECTION 2: rule comparison summary ─────────────────────
        print("-" * 80)
        print("SECTION 2 — rule comparison")
        print("-" * 80)
        print(f"  total fleet samples in last 20 min : {len(sample_details)}")
        print()
        print(f"  SuVeechi-tag MOVING set            : {len(suveechi_moving)}")
        print(f"    {sorted(suveechi_moving)}")
        print()
        print(f"  Rule X1 (10m / 5 min)  MOVING set  : {len(rule_x1_moving)}")
        print(f"    {sorted(rule_x1_moving)}")
        print()
        print(f"  Rule X2 (30m / 10 min) MOVING set  : {len(rule_x2_moving)}")
        print(f"    {sorted(rule_x2_moving)}")
        print()
        print(f"  Rule X3 (100m / 15 min) MOVING set : {len(rule_x3_moving)}")
        print(f"    {sorted(rule_x3_moving)}")
        print()

        # ── SECTION 3: agreement matrix vs SuVeechi tag ────────────
        print("-" * 80)
        print("SECTION 3 — agreement vs SuVeechi tag (per rule)")
        print("-" * 80)
        for name, rule_set in [
            ("X1 (10m/5min)", rule_x1_moving),
            ("X2 (30m/10min)", rule_x2_moving),
            ("X3 (100m/15min)", rule_x3_moving),
        ]:
            both = rule_set & suveechi_moving
            rule_only = rule_set - suveechi_moving
            suveechi_only = suveechi_moving - rule_set
            print(f"  {name}:")
            print(f"    both agree (Moving)    : {len(both)} {sorted(both)}")
            print(f"    rule says Moving, tag says NOT: "
                  f"{len(rule_only)} {sorted(rule_only)}")
            print(f"    tag says Moving, rule says NOT: "
                  f"{len(suveechi_only)} {sorted(suveechi_only)}")
            print()

        # ── SECTION 4: torpedoes with NO recent samples ────────────
        print("-" * 80)
        print("SECTION 4 — torpedoes with NO samples in last 20 min")
        print("-" * 80)
        sampled_fids = {r["fid"] for r in sample_details}
        unsampled = [f.fleet_id for f in fleets
                     if f.fleet_id and f.fleet_id not in sampled_fids]
        print(f"  count: {len(unsampled)}")
        if unsampled:
            print(f"  {', '.join(unsampled[:30])}{'  ...' if len(unsampled) > 30 else ''}")
        print()
        print("  These torpedoes have stale GPS — under position-rule they")
        print("  CANNOT be classified Moving (no fresh deltas). They default")
        print("  to IDLE (or MAINTENANCE if FM.status='Maintenance').")
        print()

    finally:
        db.close()


if __name__ == "__main__":
    main()
