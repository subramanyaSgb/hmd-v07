"""Tests for backend.utils.wbatngl_trip_sync."""
from datetime import datetime

import pytest

from backend.utils.wbatngl_trip_sync import normalize_ladleno, parse_wbatngl_date
from backend.utils.wbatngl_trip_sync import _zero_to_null


class TestNormalizeLadleno:
    @pytest.mark.parametrize("raw, expected", [
        ("TLC 01",  "TLC-01"),
        ("TLC-01",  "TLC-01"),
        ("TLC01",   "TLC-01"),
        ("TLC-1",   "TLC-01"),
        ("tlc 19",  "TLC-19"),
        ("  TLC 53 ", "TLC-53"),
        ("OTL 23",  None),    # not a torpedo
        ("",        None),
        (None,      None),
        ("TLC ABC", None),    # no digits
    ])
    def test_handles_all_known_inputs(self, raw, expected):
        assert normalize_ladleno(raw) == expected


class TestParseWbatnglDate:
    @pytest.mark.parametrize("raw, expected", [
        # Already a datetime → pass-through
        (datetime(2026, 5, 7, 5, 10, 36), datetime(2026, 5, 7, 5, 10, 36)),
        # DD/MM/YYYY HH:MM:SS — FIRST_TARE_TIME format in some tables
        ("07/05/2026 11:59:06", datetime(2026, 5, 7, 11, 59, 6)),
        # MM/DD/YYYY HH:MM:SS AM/PM — RECEIVED_DATE format
        ("05/07/2026 11:03:20 AM", datetime(2026, 5, 7, 11, 3, 20)),
        ("05/07/2026 02:23:18 PM", datetime(2026, 5, 7, 14, 23, 18)),
        # NULL / empty → None
        (None, None),
        ("", None),
        ("  ", None),
        # Garbage → None (and a warning, asserted in caplog elsewhere)
        ("not a date", None),
    ])
    def test_handles_all_formats(self, raw, expected):
        assert parse_wbatngl_date(raw) == expected


class TestZeroToNull:
    @pytest.mark.parametrize("raw, expected", [
        (1500.42, 1500.42),
        (0.0, None),
        (0, None),
        (None, None),
        (-0.0, None),
        (1e-10, None),    # treat near-zero as not-measured
        (0.001, 0.001),
        (-1.0, None),     # negative chemistry can't be real
    ])
    def test_treats_zero_and_below_as_unmeasured(self, raw, expected):
        assert _zero_to_null(raw) == expected


from backend.utils.wbatngl_trip_sync import row_to_mirror_dict
from backend.tests.fixtures.wbatngl_sample import BF3_COLS, BF3_SAMPLE


class TestRowToMirrorDict:
    def test_typical_row_maps_all_fields(self):
        d = row_to_mirror_dict(BF3_SAMPLE[0], BF3_COLS,
                               source_table='BF3."WB_TRANS_DATA_ITRO"')
        assert d["trip_id"] == "74558TLC 011070526"
        assert d["fleet_id"] == "TLC-01"
        assert d["ladleno_raw"] == "TLC 01"
        assert d["source_lab"] == "BF4"            # column says BF4, even from BF3 table
        assert d["destination"] == "SMS2"
        assert d["temp"] == 1500.42
        assert d["si_l"] == 0.64
        assert d["s_l"] == 0.028
        assert d["shift"] == "A"
        assert d["source_table"] == 'BF3."WB_TRANS_DATA_ITRO"'

    def test_idle_row_zeros_become_null(self):
        d = row_to_mirror_dict(BF3_SAMPLE[1], BF3_COLS,
                               source_table='BF3."WB_TRANS_DATA_ITRO"')
        assert d["temp"] is None
        assert d["s_l"] is None
        assert d["si_l"] is None

    def test_otl_row_returns_none(self):
        # OTL is filtered out at this layer (returns None → caller skips row).
        d = row_to_mirror_dict(BF3_SAMPLE[2], BF3_COLS,
                               source_table='BF3."WB_TRANS_DATA_ITRO"')
        assert d is None

    def test_received_date_varchar_parses(self):
        d = row_to_mirror_dict(BF3_SAMPLE[0], BF3_COLS,
                               source_table='BF3."WB_TRANS_DATA_ITRO"')
        assert d["received_date"] == datetime(2026, 5, 7, 11, 3, 20)


from sqlalchemy.orm import Session
from backend.database.models import WbatnglTripMirror
from backend.utils.wbatngl_trip_sync import upsert_rows


class TestUpsertRows:
    def test_inserts_new_rows(self, db_session: Session):
        rows = [row_to_mirror_dict(r, BF3_COLS,
                                    'BF3."WB_TRANS_DATA_ITRO"')
                for r in BF3_SAMPLE]
        rows = [r for r in rows if r is not None]   # drop OTL
        n = upsert_rows(db_session, rows)
        assert n == 5     # 6 sample rows minus 1 OTL
        assert db_session.query(WbatnglTripMirror).count() == 5

    def test_upsert_is_idempotent(self, db_session: Session):
        rows = [row_to_mirror_dict(r, BF3_COLS,
                                    'BF3."WB_TRANS_DATA_ITRO"')
                for r in BF3_SAMPLE if r[1] != "OTL 23"]
        upsert_rows(db_session, rows)
        upsert_rows(db_session, rows)   # second pass — should not duplicate
        assert db_session.query(WbatnglTripMirror).count() == 5

    def test_upsert_updates_changed_fields(self, db_session: Session):
        d = row_to_mirror_dict(BF3_SAMPLE[0], BF3_COLS,
                               'BF3."WB_TRANS_DATA_ITRO"')
        upsert_rows(db_session, [d])
        d["temp"] = 1495.0     # imagine WBATNGL revised the temp
        upsert_rows(db_session, [d])
        row = db_session.query(WbatnglTripMirror).filter_by(
            trip_id=d["trip_id"]).first()
        assert row.temp == 1495.0

    def test_empty_input_returns_zero(self, db_session: Session):
        assert upsert_rows(db_session, []) == 0
        assert db_session.query(WbatnglTripMirror).count() == 0


from backend.utils.wbatngl_trip_sync import watermark_for_source


class TestWatermark:
    def test_no_rows_returns_default_floor(self, db_session: Session):
        wm = watermark_for_source(db_session, 'BF3."WB_TRANS_DATA_ITRO"')
        # Default floor when mirror is empty: epoch-ish (a fixed sentinel)
        assert wm == datetime(1970, 1, 1)

    def test_returns_max_updated_date_for_that_source(
            self, db_session: Session):
        rows = [row_to_mirror_dict(r, BF3_COLS,
                                    'BF3."WB_TRANS_DATA_ITRO"')
                for r in BF3_SAMPLE if r[1] != "OTL 23"]
        upsert_rows(db_session, rows)

        wm = watermark_for_source(db_session, 'BF3."WB_TRANS_DATA_ITRO"')
        assert wm == datetime(2026, 5, 7, 14, 59, 33)   # row 5

    def test_isolates_by_source_table(self, db_session: Session):
        # Only BF5-tagged rows should affect BF5 watermark
        rows = [row_to_mirror_dict(r, BF3_COLS,
                                    'BF5."ZWB_TRANSACTION_DATA_ITRO_B"')
                for r in BF3_SAMPLE[:1]]
        upsert_rows(db_session, rows)
        bf5_wm = watermark_for_source(
            db_session, 'BF5."ZWB_TRANSACTION_DATA_ITRO_B"')
        bf3_wm = watermark_for_source(
            db_session, 'BF3."WB_TRANS_DATA_ITRO"')
        assert bf5_wm == datetime(2026, 5, 7, 9, 26, 13)
        assert bf3_wm == datetime(1970, 1, 1)


from unittest.mock import MagicMock
from backend.utils.wbatngl_trip_sync import pull_and_upsert_from_source


class TestPullAndUpsertFromSource:
    def test_filters_otl_and_returns_count(self, db_session: Session):
        # Mock oracle cursor to return BF3_SAMPLE
        cursor = MagicMock()
        cursor.description = [(c,) for c in BF3_COLS]
        cursor.fetchall.return_value = BF3_SAMPLE

        stats = pull_and_upsert_from_source(
            db=db_session,
            cursor=cursor,
            source_table='BF3."WB_TRANS_DATA_ITRO"',
            watermark=datetime(1970, 1, 1),
        )
        assert stats["fetched"] == 6
        assert stats["upserted"] == 5      # 6 - 1 OTL
        assert stats["skipped_non_torpedo"] == 1
        assert db_session.query(WbatnglTripMirror).count() == 5

        # Verify cursor was called with the watermark in SQL
        called_sql = cursor.execute.call_args[0][0]
        assert "UPDATED_DATE >" in called_sql.upper()
        assert "LADLENO LIKE" in called_sql.upper()

    def test_no_rows_returns_empty_stats(self, db_session: Session):
        cursor = MagicMock()
        cursor.description = [(c,) for c in BF3_COLS]
        cursor.fetchall.return_value = []

        stats = pull_and_upsert_from_source(
            db=db_session,
            cursor=cursor,
            source_table='BF5."ZWB_TRANSACTION_DATA_ITRO_B"',
            watermark=datetime(2026, 5, 1),
        )
        assert stats == {"fetched": 0, "upserted": 0,
                         "skipped_non_torpedo": 0, "errors": 0}


from backend.utils.wbatngl_trip_sync import (
    run_once, SOURCE_TABLES, CACHE_KEY_JSW_DASHBOARD,
)
from backend.utils.cache import fleet_cache as _fleet_cache


class TestRunOnce:
    def test_source_tables_constant_is_correct(self):
        # Locked-in audit string matches what writes into mirror.source_table.
        assert SOURCE_TABLES == [
            'BF3."WB_TRANS_DATA_ITRO"',
            'BF5."ZWB_TRANSACTION_DATA_ITRO_B"',
        ]

    def test_returns_error_dict_when_oracle_unreachable(
            self, db_session: Session, monkeypatch):
        # Force connect failure (no password set ⇒ RuntimeError).
        monkeypatch.delenv("WBATNGL_PASSWORD", raising=False)
        result = run_once()
        assert "error" in result
        assert "WBATNGL_PASSWORD" in result["error"]

    def test_iterates_every_source_table_and_invalidates_cache(
            self, db_session: Session, monkeypatch):
        # Mock _connect_oracle to return a fake connection whose cursor returns
        # BF3_SAMPLE for the first source and an empty list for the second.
        import sys
        from backend.utils import wbatngl_trip_sync as sync_mod
        # backend.database/__init__.py re-exports `engine` (the SQLAlchemy
        # Engine instance) as backend.database.engine, shadowing the submodule
        # attribute. Pull the actual module from sys.modules.
        engine_mod = sys.modules["backend.database.engine"]

        cursor = MagicMock()
        cursor.description = [(c,) for c in BF3_COLS]
        # alternate fetchall return per source-table call
        cursor.fetchall.side_effect = [BF3_SAMPLE, []]

        fake_conn = MagicMock()
        fake_conn.cursor.return_value = cursor

        monkeypatch.setattr(sync_mod, "_connect_oracle", lambda: fake_conn)
        # Force run_once to bind SessionLocal to our test session's engine so
        # commits land in the same in-memory SQLite database the fixture used.
        from backend.tests.conftest import TestingSessionLocal
        monkeypatch.setattr(engine_mod, "SessionLocal", TestingSessionLocal)

        # Seed cache so we can prove invalidation runs.
        _fleet_cache.set(f"{CACHE_KEY_JSW_DASHBOARD}:today", {"x": 1}, ttl=60)
        assert _fleet_cache.get(f"{CACHE_KEY_JSW_DASHBOARD}:today") is not None

        total = run_once()

        # Both source tables iterated; first yielded 6 rows (5 upserted).
        assert total["fetched"] == 6
        assert total["upserted"] == 5
        assert total["skipped_non_torpedo"] == 1
        assert total["errors"] == 0

        # Cursor was invoked twice — once per source table.
        assert cursor.execute.call_count == 2

        # Cache key was invalidated.
        assert _fleet_cache.get(f"{CACHE_KEY_JSW_DASHBOARD}:today") is None
