"""Tests for backend/routes/operations.py (/api/operations-live/* + /api/trip-history-live/*)."""
from datetime import datetime, timedelta

import pytest

from backend.routes.operations import _time_window_to_cutoff


class TestTimeWindow:
    def test_today(self):
        cutoff = _time_window_to_cutoff("today")
        now = datetime.utcnow()
        assert cutoff.date() == now.date()
        assert cutoff.hour == 0 and cutoff.minute == 0

    def test_24h(self):
        cutoff = _time_window_to_cutoff("24h")
        delta = datetime.utcnow() - cutoff
        assert timedelta(hours=23, minutes=59) <= delta <= timedelta(hours=24, minutes=1)

    def test_7d(self):
        cutoff = _time_window_to_cutoff("7d")
        delta = datetime.utcnow() - cutoff
        assert timedelta(days=6, hours=23) <= delta <= timedelta(days=7, hours=1)

    def test_30d(self):
        cutoff = _time_window_to_cutoff("30d")
        delta = datetime.utcnow() - cutoff
        assert timedelta(days=29, hours=23) <= delta <= timedelta(days=30, hours=1)

    def test_invalid_raises_400(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            _time_window_to_cutoff("banana")
        assert exc.value.status_code == 400


from backend.database.models import HtsHeatMirror, WbatnglTripMirror
from backend.routes.operations import find_matched_heats


@pytest.fixture
def trip_at(db_session):
    """Factory: insert one wbatngl trip with closetime at the given dt."""
    def _make(trip_id, fleet_id, closetime, **kw):
        defaults = dict(
            trip_id=trip_id, fleet_id=fleet_id,
            source_lab="BF3", destination="SMS3",
            net_weight=368.0,
            out_date=(closetime - timedelta(minutes=20)) if closetime else None,
            closetime=closetime,
            updated_date=closetime,
        )
        defaults.update(kw)
        row = WbatnglTripMirror(**defaults)
        db_session.add(row); db_session.commit(); db_session.refresh(row)
        return row
    return _make


@pytest.fixture
def heat_at(db_session):
    """Factory: insert one hts_heat_mirror row."""
    def _make(heat_no, torpedo_no, torpedo_in_time, **kw):
        defaults = dict(
            heat_no=heat_no, torpedo_no=torpedo_no,
            torpedo_no_raw=torpedo_no.replace("TLC-", "").lstrip("0") or "0",
            converter_no=heat_no[0],
            sms="SMS3",
            hotmetal_qty=170.0, torpedo_qty=340.0,
            torpedo_in_time=torpedo_in_time,
            torpedo_out_time=torpedo_in_time + timedelta(minutes=10),
            converter_life=350,
        )
        defaults.update(kw)
        row = HtsHeatMirror(**defaults)
        db_session.add(row); db_session.commit(); db_session.refresh(row)
        return row
    return _make


class TestFindMatchedHeats:
    def test_returns_heats_in_window(self, db_session, trip_at, heat_at):
        t0 = datetime(2026, 4, 1, 15, 0, 0)
        trip = trip_at("T1", "TLC-22", closetime=t0)
        h1 = heat_at("D1", "TLC-22", torpedo_in_time=t0 + timedelta(minutes=5))
        h2 = heat_at("E1", "TLC-22", torpedo_in_time=t0 + timedelta(minutes=80))
        assert {h.heat_no for h in find_matched_heats(db_session, trip)} == {"D1", "E1"}

    def test_excludes_heats_outside_window(self, db_session, trip_at, heat_at):
        t0 = datetime(2026, 4, 1, 15, 0, 0)
        trip = trip_at("T1", "TLC-22", closetime=t0)
        # 16 min before → outside the 15-min "before" cutoff
        heat_at("D1", "TLC-22", torpedo_in_time=t0 - timedelta(minutes=16))
        # 91 min after → outside the 90-min "after" cutoff
        heat_at("E1", "TLC-22", torpedo_in_time=t0 + timedelta(minutes=91))
        assert find_matched_heats(db_session, trip) == []

    def test_excludes_other_torpedoes(self, db_session, trip_at, heat_at):
        t0 = datetime(2026, 4, 1, 15, 0, 0)
        trip = trip_at("T1", "TLC-22", closetime=t0)
        heat_at("D1", "TLC-23", torpedo_in_time=t0 + timedelta(minutes=5))
        assert find_matched_heats(db_session, trip) == []

    def test_empty_when_trip_has_no_closetime(self, db_session, trip_at):
        trip = trip_at("T1", "TLC-22", closetime=None,
                       out_date=datetime(2026, 4, 1, 14, 0))
        assert find_matched_heats(db_session, trip) == []


from backend.routes.operations import compute_anomaly_flags


class TestComputeAnomalyFlags:
    def test_no_flags_when_within_tolerance(self):
        flags = compute_anomaly_flags(net_weight_mt=368.0,
                                       matched_total_mt=347.0)
        # |368 - 347| / 368 = 5.7% < 10% → no flag
        assert flags == []

    def test_weight_delta_flag_when_over_threshold(self):
        flags = compute_anomaly_flags(net_weight_mt=368.0,
                                       matched_total_mt=412.0)
        # +44 MT / 368 = +12% > 10% → flag
        assert len(flags) == 1
        f = flags[0]
        assert f["code"] == "weight_delta"
        assert f["severity"] == "warn"
        assert "WBATNGL" in f["message"] and "HTS" in f["message"]
        assert "+12" in f["message"] or "12.0" in f["message"]

    def test_skips_when_no_matched_heats(self):
        # matched_total_mt is None when no heats matched yet
        assert compute_anomaly_flags(net_weight_mt=368.0,
                                      matched_total_mt=None) == []

    def test_skips_when_no_net_weight(self):
        assert compute_anomaly_flags(net_weight_mt=None,
                                      matched_total_mt=347.0) == []

    def test_skips_when_net_weight_zero(self):
        # Defensive: division-by-zero must not crash
        assert compute_anomaly_flags(net_weight_mt=0.0,
                                      matched_total_mt=12.0) == []


class TestDashboardSkeleton:
    def test_returns_200_with_full_shape(self, db_session, client, auth_headers):
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("kpi_strip", "converters", "active_trips",
                    "activity_feed", "last_sync_at"):
            assert key in body, f"missing key {key!r}"
        # converters always returns exactly 6 entries (D..I), even if empty
        assert [c["converter_no"] for c in body["converters"]] == list("DEFGHI")
        # last_sync_at has both source labels
        assert set(body["last_sync_at"]) == {"wbatngl", "hts"}

    def test_unauthenticated_rejected(self, client):
        r = client.get("/api/operations-live/dashboard")
        assert r.status_code == 401

    def test_empty_db_kpis_all_zero(self, db_session, client, auth_headers):
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        kpis = r.json()["kpi_strip"]
        assert kpis["production_today_mt"] == 0.0
        assert kpis["consumption_today_mt"] == 0.0
        assert kpis["active_trips_now"] == 0
        assert kpis["heats_in_progress"] == 0
        assert kpis["idle_torpedoes"] == 0
