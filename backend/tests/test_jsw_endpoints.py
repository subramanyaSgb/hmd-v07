"""Tests for /api/jsw/* endpoints (JSW tab + Plant Live)."""
from datetime import datetime, timedelta

import pytest

from backend.database.models import WbatnglTripMirror
from backend.tests.fixtures.wbatngl_sample import BF3_COLS, BF3_SAMPLE
from backend.utils.wbatngl_trip_sync import row_to_mirror_dict, upsert_rows


@pytest.fixture
def seeded_mirror(db_session):
    """Seed mirror with sample BF3 rows. Bumps updated_date to NOW so default
    'today'/'24h' time-window queries pick them up regardless of sample date."""
    rows = [row_to_mirror_dict(r, BF3_COLS, 'BF3."WB_TRANS_DATA_ITRO"')
            for r in BF3_SAMPLE]
    rows = [r for r in rows if r is not None]   # drop OTL
    # Anchor every row's updated_date to NOW so every test time_window
    # captures them; preserve the relative offsets within the sample so the
    # idle/typical/out-of-spec semantics still hold.
    now = datetime.utcnow()
    for i, row in enumerate(rows):
        row["updated_date"] = now - timedelta(minutes=i)
    upsert_rows(db_session, rows)
    return rows


# ───────────────────────── /api/jsw/trips ─────────────────────────


class TestJswTripsList:
    def test_returns_seeded_rows(self, seeded_mirror, client, auth_headers):
        r = client.get("/api/jsw/trips?time_window=30d", headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 5
        assert body["page"] == 1
        assert body["page_size"] == 50
        assert len(body["rows"]) == 5
        assert "last_sync_at" in body

    def test_filter_by_destination(self, seeded_mirror, client, auth_headers):
        r = client.get(
            "/api/jsw/trips?time_window=30d&destination=SMS4",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 1
        assert body["rows"][0]["destination"] == "SMS4"

    def test_search_matches_trip_id_and_fleet_id(
            self, seeded_mirror, client, auth_headers):
        r = client.get(
            "/api/jsw/trips?time_window=30d&q=TLC-19",
            headers=auth_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 1
        # Every returned row must contain the search term in some search field
        for row in body["rows"]:
            blob = " ".join(filter(None, [
                row.get("trip_id"), row.get("fleet_id"),
                row.get("ladleno_raw"),
            ]))
            assert "TLC-19" in blob.upper()

    def test_sort_by_whitelist_only(
            self, seeded_mirror, client, auth_headers):
        r = client.get("/api/jsw/trips?sort_by=DROP_TABLE", headers=auth_headers)
        assert r.status_code == 400

    def test_unauthenticated_rejected(self, seeded_mirror, client):
        r = client.get("/api/jsw/trips")
        assert r.status_code == 401

    def test_pagination(self, seeded_mirror, client, auth_headers):
        r = client.get(
            "/api/jsw/trips?time_window=30d&page=1&page_size=2",
            headers=auth_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 5
        assert body["page_size"] == 2
        assert len(body["rows"]) == 2

    def test_invalid_time_window_returns_400(
            self, seeded_mirror, client, auth_headers):
        r = client.get(
            "/api/jsw/trips?time_window=banana",
            headers=auth_headers,
        )
        assert r.status_code == 400


# ───────────────────────── /api/jsw/dashboard ─────────────────────


class TestJswDashboard:
    def test_kpis_sum_correctly(
            self, seeded_mirror, client, auth_headers):
        r = client.get(
            "/api/jsw/dashboard?time_window=30d",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        kpis = body["kpis"]
        # Sum of NET in 5 sample rows (after OTL filter):
        # 351 + 230.7 + 6750 + 357.6 + 340 = 8029.3
        assert kpis["trips_count"] == 5
        assert abs(kpis["tonnage_total_mt"] - 8029.3) < 0.1

    def test_chemistry_excludes_null_temps(
            self, seeded_mirror, client, auth_headers):
        r = client.get(
            "/api/jsw/dashboard?time_window=30d",
            headers=auth_headers,
        )
        body = r.json()
        chem = body["chemistry"]
        # Of 5 rows: row 1 (1500.42), row 2 (NULL after zero-coerce), row 4
        # (1500), row 5 (1479.7), row 6 (1440). Avg over 4 non-null = ~1480.
        assert chem["avg_temp_c"] is not None
        assert 1450 < chem["avg_temp_c"] < 1510
        assert chem["out_of_spec_count"] >= 2   # row 5 high S, row 6 low temp

    def test_flow_groups_by_route(
            self, seeded_mirror, client, auth_headers):
        r = client.get(
            "/api/jsw/dashboard?time_window=30d",
            headers=auth_headers,
        )
        body = r.json()
        flow = body["flow"]
        labels = {(f["source_lab"], f["destination"]) for f in flow}
        # Sample has BF4→SMS2 (rows 1,2,5), BF3→SMS2 (row 4), BF3→SMS4 (row 6)
        assert ("BF3", "SMS2") in labels
        assert ("BF4", "SMS2") in labels
        assert ("BF3", "SMS4") in labels

    def test_recent_trips_capped_at_15(
            self, seeded_mirror, client, auth_headers):
        r = client.get(
            "/api/jsw/dashboard?time_window=30d",
            headers=auth_headers,
        )
        body = r.json()
        assert len(body["recent_trips"]) <= 15

    def test_unauthenticated_rejected(self, seeded_mirror, client):
        r = client.get("/api/jsw/dashboard")
        assert r.status_code == 401
