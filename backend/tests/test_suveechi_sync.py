"""
Regression tests for backend.utils.suveechi_sync.

These exist because of a 2026-05-08 SMS4 production incident: every torpedo
on the Live Tracking page was stuck on yesterday's GPS reading. Backend log
showed `TypeError: can't compare offset-naive and offset-aware datetimes`
firing every 10 seconds inside upsert_locations() — silently killing the
GPS sync.

Root cause:
  * MySQL `vw_unit_status_ist` returned NULL for both reporttime fields, so
    line 122 fell through to `datetime.utcnow()` → naive datetime.
  * `FleetLiveLocation.last_updated` is `DateTime(timezone=True)` so PG read
    back aware-UTC.
  * Comparison naive < aware → TypeError → sync aborts mid-batch.

Fix: `_to_aware_utc` normalizes both sides before comparison.
"""
from datetime import datetime, timezone, timedelta

import pytest
from sqlalchemy.orm import Session

from backend.database.models import FleetLiveLocation, FleetManagement
from backend.utils.suveechi_sync import _to_aware_utc, map_status, upsert_locations


class TestToAwareUtc:
    def test_passes_through_aware_utc(self):
        dt = datetime(2026, 5, 8, 12, 0, tzinfo=timezone.utc)
        assert _to_aware_utc(dt) == dt

    def test_converts_aware_offset_to_utc(self):
        ist = timezone(timedelta(hours=5, minutes=30))
        dt = datetime(2026, 5, 8, 17, 30, tzinfo=ist)   # 12:00 UTC
        out = _to_aware_utc(dt)
        assert out.tzinfo is not None
        assert out == datetime(2026, 5, 8, 12, 0, tzinfo=timezone.utc)

    def test_naive_treated_as_utc(self):
        dt = datetime(2026, 5, 8, 14, 19, 18)
        out = _to_aware_utc(dt)
        assert out == datetime(2026, 5, 8, 14, 19, 18, tzinfo=timezone.utc)

    def test_none_passes_through(self):
        assert _to_aware_utc(None) is None


class TestUpsertLocationsTimezoneSafety:
    """The actual incident: aware row already in DB + naive `reported`
    coming in must NOT raise."""

    def _seed_aware_row(self, db: Session, fleet_id: str, when: datetime):
        # Match the production state: a FleetLiveLocation row stored with
        # aware-UTC last_updated (this is what TIMESTAMPTZ returns).
        db.add(FleetManagement(fleet_id=fleet_id, type="torpedo", status="Idle"))
        db.add(FleetLiveLocation(
            fleet_id=fleet_id, type="torpedo",
            x=15.18, y=76.94, last_updated=when,
        ))
        db.commit()

    def test_naive_reported_against_aware_existing_row_does_not_crash(
            self, db_session: Session):
        """Reproduces the 2026-05-08 SMS4 traceback exactly."""
        yesterday_aware = datetime(2026, 5, 7, 14, 32, 21, tzinfo=timezone.utc)
        self._seed_aware_row(db_session, "TLC-11", yesterday_aware)

        # SuVeechi tick where reporttime fields are NULL: produces a naive
        # `reported` via the datetime.utcnow() fallback.
        rows = [{
            "unitname": "TLC 11",
            "status": "Idle",
            "location": "Some bay",
            "latitude": 15.183308,
            "longitude": 76.94,
            "reporttime_ist": None,
            "reporttime_gmt": None,
        }]

        # Pre-fix this raised TypeError. Post-fix it must complete and insert
        # one row (because "now" > yesterday).
        stats = upsert_locations(db_session, rows)
        assert stats["fetched"] == 1
        assert stats["locations_inserted"] == 1

    def test_aware_reported_against_aware_existing_works(
            self, db_session: Session):
        # Sanity: the happy path still inserts when reported > existing.
        yesterday = datetime(2026, 5, 7, 12, 0, tzinfo=timezone.utc)
        self._seed_aware_row(db_session, "TLC-12", yesterday)

        today = datetime(2026, 5, 8, 12, 0, tzinfo=timezone(timedelta(hours=5, minutes=30)))
        rows = [{
            "unitname": "TLC 12", "status": "Idle", "location": "x",
            "latitude": 15.18, "longitude": 76.94,
            "reporttime_ist": today, "reporttime_gmt": None,
        }]
        stats = upsert_locations(db_session, rows)
        assert stats["locations_inserted"] == 1

    def test_skips_insert_when_reported_not_newer(
            self, db_session: Session):
        # If MySQL keeps returning the same timestamp for an idle torpedo we
        # must not append a duplicate row — that's the original reason the
        # comparison exists.
        same = datetime(2026, 5, 8, 12, 0, tzinfo=timezone.utc)
        self._seed_aware_row(db_session, "TLC-13", same)

        rows = [{
            "unitname": "TLC 13", "status": "Idle", "location": "x",
            "latitude": 15.18, "longitude": 76.94,
            "reporttime_ist": same, "reporttime_gmt": None,
        }]
        stats = upsert_locations(db_session, rows)
        assert stats["locations_inserted"] == 0


class TestMapStatus:
    """Regression for SMS4 2026-05-08: torpedoes visibly moving on the map
    but every label showed "Idle" because backend collapsed SuVeechi's
    "Moving" signal into "Operating" before it ever reached the database."""

    @pytest.mark.parametrize("suveechi_status, expected_hmd_status", [
        # Common case: parked with engine on → "Idle" in UI display.
        ("Idle",     "Operating"),
        # Bug fix: actively driving → preserve as "Moving" so UI counter
        # picks it up. Pre-fix this returned "Operating".
        ("Moving",   "Moving"),
        # Engine off → temporarily unavailable → shown as "Maint".
        ("Ign Off",  "Maintenance"),
        # Whitespace tolerance.
        ("  Moving  ", "Moving"),
        # Unknown / future status → safe default.
        ("Unknown",  "Operating"),
        ("",         "Operating"),
        (None,       "Operating"),
    ])
    def test_maps_each_suveechi_status(
            self, suveechi_status, expected_hmd_status):
        assert map_status(suveechi_status) == expected_hmd_status

    def test_moving_status_persists_through_upsert(
            self, db_session: Session):
        """End-to-end: SuVeechi sends Moving → FleetManagement.status = Moving."""
        rows = [{
            "unitname": "TLC 53", "status": "Moving",
            "location": "BF3 → SMS2",
            "latitude": 15.18, "longitude": 76.94,
            "reporttime_ist": datetime(2026, 5, 8, 12, 0, tzinfo=timezone.utc),
            "reporttime_gmt": None,
        }]
        upsert_locations(db_session, rows)

        fleet = db_session.query(FleetManagement).filter_by(
            fleet_id="TLC-53").first()
        assert fleet is not None
        assert fleet.status == "Moving"   # not "Operating"!

    def test_status_flips_back_to_operating_when_moving_stops(
            self, db_session: Session):
        """Tick 1: torpedo Moving → status=Moving.
           Tick 2: torpedo parks (Idle) → status=Operating again."""
        when1 = datetime(2026, 5, 8, 12, 0, tzinfo=timezone.utc)
        when2 = datetime(2026, 5, 8, 12, 0, 30, tzinfo=timezone.utc)

        rows1 = [{
            "unitname": "TLC 7", "status": "Moving", "location": "BF3",
            "latitude": 15.18, "longitude": 76.94,
            "reporttime_ist": when1, "reporttime_gmt": None,
        }]
        upsert_locations(db_session, rows1)

        rows2 = [{
            "unitname": "TLC 7", "status": "Idle", "location": "BF3",
            "latitude": 15.18, "longitude": 76.94,
            "reporttime_ist": when2, "reporttime_gmt": None,
        }]
        upsert_locations(db_session, rows2)

        fleet = db_session.query(FleetManagement).filter_by(
            fleet_id="TLC-7").first()
        assert fleet.status == "Operating"

    def test_maintenance_state_not_overwritten_by_gps(
            self, db_session: Session):
        """If a torpedo was manually set to Maintenance, GPS sync must not
        flip it back to Operating/Moving even if SuVeechi says Idle/Moving."""
        db_session.add(FleetManagement(
            fleet_id="TLC-99", type="torpedo", status="Maintenance"))
        db_session.commit()

        rows = [{
            "unitname": "TLC 99", "status": "Moving", "location": "x",
            "latitude": 15.18, "longitude": 76.94,
            "reporttime_ist": datetime(2026, 5, 8, 12, 0, tzinfo=timezone.utc),
            "reporttime_gmt": None,
        }]
        upsert_locations(db_session, rows)

        fleet = db_session.query(FleetManagement).filter_by(
            fleet_id="TLC-99").first()
        assert fleet.status == "Maintenance"   # preserved
