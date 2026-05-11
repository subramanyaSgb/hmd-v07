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


class TestDashboardKpiStrip:
    def test_production_today_sums_net_weight(
            self, db_session, client, auth_headers, trip_at):
        t = datetime.utcnow().replace(hour=10, minute=0, second=0, microsecond=0)
        trip_at("T1", "TLC-22", closetime=t, net_weight=300.0, updated_date=t)
        trip_at("T2", "TLC-23", closetime=t, net_weight=200.0, updated_date=t)
        # One trip outside today → should NOT be summed
        old = datetime.utcnow() - timedelta(days=2)
        trip_at("T_OLD", "TLC-24", closetime=old, net_weight=999.0,
                updated_date=old)

        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        kpis = r.json()["kpi_strip"]
        assert kpis["production_today_mt"] == 500.0

    def test_consumption_today_sums_hotmetal_qty(
            self, db_session, client, auth_headers, heat_at):
        t = datetime.utcnow().replace(hour=11, minute=0, second=0, microsecond=0)
        heat_at("D1", "TLC-22", torpedo_in_time=t, hotmetal_qty=126.0)
        heat_at("E1", "TLC-22", torpedo_in_time=t, hotmetal_qty=172.0)
        old = datetime.utcnow() - timedelta(days=2)
        heat_at("D_OLD", "TLC-22", torpedo_in_time=old, hotmetal_qty=500.0)

        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        kpis = r.json()["kpi_strip"]
        assert kpis["consumption_today_mt"] == 298.0

    def test_heats_in_progress_counts_null_torpedo_out_time(
            self, db_session, client, auth_headers, heat_at):
        t = datetime.utcnow()
        heat_at("D1", "TLC-22", torpedo_in_time=t,
                torpedo_out_time=None)                 # in progress
        heat_at("E1", "TLC-23", torpedo_in_time=t,
                torpedo_out_time=t + timedelta(minutes=10))  # done
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r.json()["kpi_strip"]["heats_in_progress"] == 1

    def test_active_trips_now_excludes_matched_trips(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow()
        trip_at("T1", "TLC-22", closetime=t)
        # Heat matches T1 → T1 should NOT count as active
        heat_at("D1", "TLC-22", torpedo_in_time=t + timedelta(minutes=5))
        # T2 has out_date but no matching heat → active
        trip_at("T2", "TLC-23", closetime=t)
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r.json()["kpi_strip"]["active_trips_now"] == 1

    def test_active_trips_now_excludes_in_flight_no_closetime(
            self, db_session, client, auth_headers, trip_at):
        # out_date set but closetime null → in-flight (no matching window yet)
        # design says active = "out_date NOT NULL and no matching heat" — so
        # this still counts as active.
        t = datetime.utcnow()
        trip_at("T1", "TLC-22", out_date=t, closetime=None, updated_date=t)
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r.json()["kpi_strip"]["active_trips_now"] == 1

    def test_idle_torpedoes_uses_latest_per_fleet(
            self, db_session, client, auth_headers):
        from backend.database.models import FleetLiveLocation
        now = datetime.utcnow()
        # Two snapshots for TLC-22: earlier=Moving, later=Idle → latest=Idle
        db_session.add_all([
            FleetLiveLocation(fleet_id="TLC-22", type="Idle",
                              x=1.0, y=1.0, last_updated=now),
            FleetLiveLocation(fleet_id="TLC-22", type="Moving",
                              x=1.0, y=1.0,
                              last_updated=now - timedelta(minutes=5)),
            FleetLiveLocation(fleet_id="TLC-23", type="Moving",
                              x=1.0, y=1.0, last_updated=now),
        ])
        db_session.commit()
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        # TLC-22 idle counts, TLC-23 moving does not
        assert r.json()["kpi_strip"]["idle_torpedoes"] == 1


def _converter_by(body, letter):
    return next(c for c in body["converters"] if c["converter_no"] == letter)


class TestDashboardConverters:
    def test_idle_state_when_no_heat_in_progress(
            self, db_session, client, auth_headers):
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        for c in r.json()["converters"]:
            assert c["state"] == "IDLE"
            assert c["heats_today"] == 0

    def test_heat_in_progress_state(
            self, db_session, client, auth_headers, heat_at):
        now = datetime.utcnow()
        heat_at("D1", "TLC-22",
                torpedo_in_time=now - timedelta(minutes=12),
                torpedo_out_time=None,
                hotmetal_qty=126.0,
                sms="SMS3")
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        d = _converter_by(r.json(), "D")
        assert d["state"] == "HEAT_IN_PROGRESS"
        assert d["current_heat_no"] == "D1"
        assert d["current_torpedo"] == "TLC-22"
        assert 11 <= d["elapsed_minutes"] <= 13
        assert d["hotmetal_received_mt"] == 126.0
        assert d["sms"] == "SMS3"

    def test_heats_today_counts_only_today(
            self, db_session, client, auth_headers, heat_at):
        now = datetime.utcnow().replace(hour=10)
        heat_at("D1", "TLC-22", torpedo_in_time=now)
        heat_at("D2", "TLC-23", torpedo_in_time=now + timedelta(minutes=20))
        # Yesterday
        heat_at("D_OLD", "TLC-22",
                torpedo_in_time=now - timedelta(days=1))
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert _converter_by(r.json(), "D")["heats_today"] == 2

    def test_last_heat_is_most_recent_completed(
            self, db_session, client, auth_headers, heat_at):
        now = datetime.utcnow()
        heat_at("D_OLD", "TLC-22",
                torpedo_in_time=now - timedelta(hours=4),
                torpedo_out_time=now - timedelta(hours=4) + timedelta(minutes=10))
        heat_at("D_NEW", "TLC-22",
                torpedo_in_time=now - timedelta(hours=1),
                torpedo_out_time=now - timedelta(hours=1) + timedelta(minutes=10))
        # in-progress heat — NOT to be reported as last_heat
        heat_at("D_NOW", "TLC-22",
                torpedo_in_time=now - timedelta(minutes=5),
                torpedo_out_time=None)
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        d = _converter_by(r.json(), "D")
        assert d["last_heat_no"] == "D_NEW"


class TestDashboardActiveTrips:
    def test_active_trips_includes_unmatched_with_out_date(
            self, db_session, client, auth_headers, trip_at):
        t = datetime.utcnow() - timedelta(minutes=30)
        trip_at("T1", "TLC-22", closetime=t, out_date=t - timedelta(minutes=10),
                source_lab="BF3", destination="SMS3", net_weight=368.0)
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        active = r.json()["active_trips"]
        assert len(active) == 1
        row = active[0]
        assert row["trip_id"] == "T1"
        assert row["torpedo_no"] == "TLC-22"
        assert row["source_lab"] == "BF3"
        assert row["destination"] == "SMS3"
        assert row["net_weight_mt"] == 368.0
        # elapsed since out_date, ~40 minutes (30 + 10)
        assert 38 <= row["elapsed_minutes"] <= 42

    def test_active_trips_excludes_matched(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow() - timedelta(minutes=10)
        trip_at("T1", "TLC-22", closetime=t)
        heat_at("D1", "TLC-22", torpedo_in_time=t + timedelta(minutes=5))
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r.json()["active_trips"] == []

    def test_active_trips_sorted_out_date_desc(
            self, db_session, client, auth_headers, trip_at):
        now = datetime.utcnow()
        trip_at("OLD", "TLC-22", closetime=now - timedelta(hours=3),
                out_date=now - timedelta(hours=3, minutes=10))
        trip_at("NEW", "TLC-23", closetime=now - timedelta(minutes=10),
                out_date=now - timedelta(minutes=20))
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        ids = [t["trip_id"] for t in r.json()["active_trips"]]
        assert ids == ["NEW", "OLD"]

    def test_active_trips_current_status_from_fleet_live(
            self, db_session, client, auth_headers, trip_at):
        from backend.database.models import FleetLiveLocation
        t = datetime.utcnow() - timedelta(minutes=10)
        trip_at("T1", "TLC-22", closetime=t,
                out_date=t - timedelta(minutes=10))
        db_session.add(FleetLiveLocation(
            fleet_id="TLC-22", type="Moving",
            x=1.0, y=1.0, last_updated=datetime.utcnow(),
        ))
        db_session.commit()
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r.json()["active_trips"][0]["current_status"] == "Moving"


class TestDashboardActivityFeed:
    def test_trip_close_event_appears(
            self, db_session, client, auth_headers, trip_at):
        t = datetime.utcnow() - timedelta(minutes=20)
        trip_at("T1", "TLC-22", closetime=t,
                source_lab="BF3", destination="SMS3", net_weight=368.0)
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        events = r.json()["activity_feed"]
        # at least one trip_completed event for T1
        completes = [e for e in events if e["type"] == "trip_completed"]
        assert any(e["ref_id"] == "T1" for e in completes)

    def test_heat_start_event_appears(
            self, db_session, client, auth_headers, heat_at):
        t = datetime.utcnow() - timedelta(minutes=15)
        heat_at("D1", "TLC-22", torpedo_in_time=t)
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        events = r.json()["activity_feed"]
        starts = [e for e in events if e["type"] == "heat_started"]
        assert any(e["ref_id"] == "D1" for e in starts)

    def test_feed_capped_at_20_reverse_chronological(
            self, db_session, client, auth_headers, trip_at, heat_at):
        base = datetime.utcnow() - timedelta(minutes=50)
        for i in range(15):
            trip_at(f"T{i}", f"TLC-{i:02d}",
                    closetime=base + timedelta(minutes=i))
        for i in range(15):
            heat_at(f"H{i}", f"TLC-{i:02d}",
                    torpedo_in_time=base + timedelta(minutes=i + 1))
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        events = r.json()["activity_feed"]
        assert len(events) == 20
        # Newest first
        ats = [e["at"] for e in events]
        assert ats == sorted(ats, reverse=True)


class TestDashboardCache:
    def test_second_call_is_cached(
            self, db_session, client, auth_headers, trip_at):
        t = datetime.utcnow()
        trip_at("T1", "TLC-22", closetime=t,
                source_lab="BF3", destination="SMS3", net_weight=300.0)
        r1 = client.get("/api/operations-live/dashboard", headers=auth_headers)
        # Add another trip — should NOT show up while cache is warm
        trip_at("T2", "TLC-23", closetime=t,
                source_lab="BF3", destination="SMS3", net_weight=200.0)
        r2 = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r1.json()["kpi_strip"]["production_today_mt"] == \
               r2.json()["kpi_strip"]["production_today_mt"]


class TestTripHistoryLiveBasic:
    def test_returns_paginated_shape(self, db_session, client, auth_headers, trip_at):
        for i in range(60):
            trip_at(f"T{i:02d}", f"TLC-{i % 53 + 1:02d}",
                    closetime=datetime.utcnow() - timedelta(minutes=i))
        r = client.get("/api/trip-history-live?time_window=30d",
                       headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["page"] == 1
        assert body["page_size"] == 50
        assert body["total"] == 60
        assert len(body["rows"]) == 50
        assert set(body["last_sync_at"]) == {"wbatngl", "hts"}

    def test_pagination(self, db_session, client, auth_headers, trip_at):
        for i in range(60):
            trip_at(f"T{i:02d}", f"TLC-{i % 53 + 1:02d}",
                    closetime=datetime.utcnow() - timedelta(minutes=i))
        r = client.get(
            "/api/trip-history-live?time_window=30d&page=2&page_size=25",
            headers=auth_headers,
        )
        body = r.json()
        assert body["page"] == 2
        assert body["page_size"] == 25
        assert len(body["rows"]) == 25

    def test_default_sort_out_date_desc(
            self, db_session, client, auth_headers, trip_at):
        t = datetime.utcnow()
        trip_at("OLD", "TLC-01", closetime=t - timedelta(hours=3),
                out_date=t - timedelta(hours=3, minutes=10))
        trip_at("NEW", "TLC-02", closetime=t - timedelta(minutes=10),
                out_date=t - timedelta(minutes=20))
        r = client.get("/api/trip-history-live?time_window=30d",
                       headers=auth_headers)
        ids = [r_["trip_id"] for r_ in r.json()["rows"]]
        assert ids.index("NEW") < ids.index("OLD")

    def test_unauthenticated_rejected(self, client):
        r = client.get("/api/trip-history-live")
        assert r.status_code == 401

    def test_invalid_sort_by_returns_400(
            self, db_session, client, auth_headers, trip_at):
        trip_at("T1", "TLC-01", closetime=datetime.utcnow())
        r = client.get("/api/trip-history-live?sort_by=DROP_TABLE",
                       headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_time_window_returns_400(
            self, db_session, client, auth_headers):
        r = client.get("/api/trip-history-live?time_window=banana",
                       headers=auth_headers)
        assert r.status_code == 400


class TestTripHistoryLiveEnrichment:
    def test_match_status_complete(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow() - timedelta(minutes=20)
        trip_at("T1", "TLC-22", closetime=t, net_weight=368.0)
        heat_at("D1", "TLC-22", torpedo_in_time=t + timedelta(minutes=5),
                hotmetal_qty=170.0)
        heat_at("E1", "TLC-22", torpedo_in_time=t + timedelta(minutes=15),
                hotmetal_qty=180.0)
        r = client.get("/api/trip-history-live?time_window=30d",
                       headers=auth_headers)
        row = next(r_ for r_ in r.json()["rows"] if r_["trip_id"] == "T1")
        assert row["match_status"] == "complete"
        assert row["first_heat_no"] == "D1"
        assert row["matched_heat_count"] == 2
        assert row["matched_hotmetal_total_mt"] == 350.0
        # (350 - 368)/368 ~= -4.9%
        assert -5.5 < row["weight_delta_pct"] < -4.0

    def test_match_status_awaiting_pour(
            self, db_session, client, auth_headers, trip_at):
        t = datetime.utcnow() - timedelta(minutes=20)
        trip_at("T1", "TLC-22", closetime=t, net_weight=368.0)
        r = client.get("/api/trip-history-live?time_window=30d",
                       headers=auth_headers)
        row = next(r_ for r_ in r.json()["rows"] if r_["trip_id"] == "T1")
        assert row["match_status"] == "awaiting_pour"
        assert row["first_heat_no"] is None
        assert row["matched_heat_count"] == 0

    def test_match_status_in_flight(
            self, db_session, client, auth_headers, trip_at):
        # closetime None → trip still in flight
        t = datetime.utcnow()
        trip_at("T1", "TLC-22", closetime=None, out_date=t,
                net_weight=368.0, updated_date=t)
        r = client.get("/api/trip-history-live?time_window=30d",
                       headers=auth_headers)
        row = next(r_ for r_ in r.json()["rows"] if r_["trip_id"] == "T1")
        assert row["match_status"] == "in_flight"

    def test_match_status_anomaly(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow() - timedelta(minutes=20)
        trip_at("T1", "TLC-22", closetime=t, net_weight=368.0)
        # +44 MT = +12% → anomaly
        heat_at("D1", "TLC-22", torpedo_in_time=t + timedelta(minutes=5),
                hotmetal_qty=412.0)
        r = client.get("/api/trip-history-live?time_window=30d",
                       headers=auth_headers)
        row = next(r_ for r_ in r.json()["rows"] if r_["trip_id"] == "T1")
        assert row["match_status"] == "anomaly"

    def test_status_filter_complete(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow() - timedelta(minutes=20)
        trip_at("T_DONE", "TLC-22", closetime=t, net_weight=368.0)
        heat_at("D1", "TLC-22", torpedo_in_time=t + timedelta(minutes=5),
                hotmetal_qty=350.0)
        trip_at("T_WAIT", "TLC-23", closetime=t, net_weight=368.0)
        r = client.get(
            "/api/trip-history-live?time_window=30d&status=complete",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert "T_DONE" in ids and "T_WAIT" not in ids

    def test_converter_filter(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow() - timedelta(minutes=20)
        trip_at("T_D", "TLC-22", closetime=t, net_weight=368.0)
        heat_at("D1", "TLC-22", torpedo_in_time=t + timedelta(minutes=5),
                hotmetal_qty=350.0, converter_no="D")
        trip_at("T_E", "TLC-23", closetime=t, net_weight=368.0)
        heat_at("E1", "TLC-23", torpedo_in_time=t + timedelta(minutes=5),
                hotmetal_qty=350.0, converter_no="E")
        r = client.get(
            "/api/trip-history-live?time_window=30d&converter=D",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert ids == {"T_D"}


class TestTripHistoryLiveFilters:
    @pytest.fixture
    def seeded(self, db_session, trip_at):
        t = datetime.utcnow() - timedelta(minutes=30)
        trip_at("BF3_SMS3", "TLC-22", closetime=t,
                source_lab="BF3", destination="SMS3", shift="A")
        trip_at("BF4_SMS2", "TLC-23",
                closetime=t + timedelta(minutes=1),
                source_lab="BF4", destination="SMS2", shift="B")
        trip_at("BF3_SMS2", "TLC-22",
                closetime=t + timedelta(minutes=2),
                source_lab="BF3", destination="SMS2", shift="C")
        return None

    def test_source_lab_filter(self, seeded, client, auth_headers):
        r = client.get(
            "/api/trip-history-live?time_window=30d&source_lab=BF3",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert ids == {"BF3_SMS3", "BF3_SMS2"}

    def test_destination_filter(self, seeded, client, auth_headers):
        r = client.get(
            "/api/trip-history-live?time_window=30d&destination=SMS2",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert ids == {"BF4_SMS2", "BF3_SMS2"}

    def test_shift_filter(self, seeded, client, auth_headers):
        r = client.get(
            "/api/trip-history-live?time_window=30d&shift=A",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert ids == {"BF3_SMS3"}

    def test_fleet_id_filter(self, seeded, client, auth_headers):
        r = client.get(
            "/api/trip-history-live?time_window=30d&fleet_id=TLC-22",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert ids == {"BF3_SMS3", "BF3_SMS2"}

    def test_search_matches_trip_id(self, seeded, client, auth_headers):
        r = client.get(
            "/api/trip-history-live?time_window=30d&q=BF4",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert "BF4_SMS2" in ids

    def test_all_value_treats_as_no_filter(self, seeded, client, auth_headers):
        r = client.get(
            "/api/trip-history-live?time_window=30d&source_lab=all",
            headers=auth_headers,
        )
        assert r.json()["total"] == 3
