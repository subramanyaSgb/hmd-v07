"""Tests for backend.utils.hts_sync."""
import pytest

from backend.utils.hts_sync import normalize_torpedo_no


class TestNormalizeTorpedoNo:
    @pytest.mark.parametrize("raw, expected", [
        ("22",      "TLC-22"),
        ("07",      "TLC-07"),
        ("1",       "TLC-01"),
        ("53",      "TLC-53"),
        (" 22 ",    "TLC-22"),
        ("",        None),
        (None,      None),
        ("abc",     None),
        ("99",      "TLC-99"),
    ])
    def test_normalize_handles_all_observed_forms(self, raw, expected):
        assert normalize_torpedo_no(raw) == expected


from backend.utils.hts_sync import row_to_mirror_dict


HTS_COLS = [
    "CONVERTER_NO", "HEAT_NO", "HOTMETAL_QTY", "TORPEDO_NO",
    "TORPEDO_IN_TIME", "TORPEDO_OUT_TIME", "TORPEDO_QTY", "CONVERTER_LIFE",
]

import datetime as _dt
SAMPLE_ROW = (
    "D",
    "D2030595",
    126.146,
    "45",
    _dt.datetime(2026, 4, 1, 17, 38, 14),
    _dt.datetime(2026, 4, 1, 18, 14, 3),
    369.6,
    354,
)


class TestRowToMirrorDict:
    def test_typical_row_maps_all_fields(self):
        d = row_to_mirror_dict(SAMPLE_ROW, HTS_COLS)
        assert d["heat_no"] == "D2030595"
        assert d["converter_no"] == "D"
        assert d["torpedo_no"] == "TLC-45"
        assert d["torpedo_no_raw"] == "45"
        assert d["hotmetal_qty"] == 126.146
        assert d["torpedo_qty"] == 369.6
        assert d["torpedo_in_time"] == _dt.datetime(2026, 4, 1, 17, 38, 14)
        assert d["torpedo_out_time"] == _dt.datetime(2026, 4, 1, 18, 14, 3)
        assert d["converter_life"] == 354
        assert d.get("sms") is None

    def test_unparseable_torpedo_returns_none_dict(self):
        bad = list(SAMPLE_ROW)
        bad[3] = "garbage"
        d = row_to_mirror_dict(tuple(bad), HTS_COLS)
        assert d["torpedo_no"] is None
        assert d["torpedo_no_raw"] == "garbage"

    def test_missing_heat_no_returns_none(self):
        bad = list(SAMPLE_ROW)
        bad[1] = None
        d = row_to_mirror_dict(tuple(bad), HTS_COLS)
        assert d is None

    def test_sms_column_when_present(self):
        cols = HTS_COLS + ["SMS"]
        row = SAMPLE_ROW + ("SMS3",)
        d = row_to_mirror_dict(row, cols)
        assert d["sms"] == "SMS3"


from backend.utils.hts_sync import upsert_rows


class TestUpsertRows:
    def test_insert_new_rows(self, db_session):
        rows = [row_to_mirror_dict(SAMPLE_ROW, HTS_COLS)]
        n = upsert_rows(db_session, rows)
        assert n == 1
        from backend.database.models import HtsHeatMirror
        got = db_session.query(HtsHeatMirror).filter_by(heat_no="D2030595").first()
        assert got is not None
        assert got.torpedo_no == "TLC-45"
        assert float(got.hotmetal_qty) == 126.146

    def test_upsert_updates_existing(self, db_session):
        rows = [row_to_mirror_dict(SAMPLE_ROW, HTS_COLS)]
        upsert_rows(db_session, rows)
        modified = list(SAMPLE_ROW)
        modified[2] = 200.0
        rows2 = [row_to_mirror_dict(tuple(modified), HTS_COLS)]
        upsert_rows(db_session, rows2)
        from backend.database.models import HtsHeatMirror
        got = db_session.query(HtsHeatMirror).filter_by(heat_no="D2030595").one()
        assert float(got.hotmetal_qty) == 200.0

    def test_empty_input_is_noop(self, db_session):
        assert upsert_rows(db_session, []) == 0

    def test_none_rows_are_filtered(self, db_session):
        rows = [None, row_to_mirror_dict(SAMPLE_ROW, HTS_COLS), None]
        n = upsert_rows(db_session, rows)
        assert n == 1


from backend.utils.hts_sync import watermark_for_view, _WATERMARK_FLOOR


class TestWatermark:
    def test_empty_mirror_returns_floor(self, db_session):
        wm = watermark_for_view(db_session)
        assert wm == _WATERMARK_FLOOR

    def test_returns_max_torpedo_in_time(self, db_session):
        upsert_rows(db_session, [row_to_mirror_dict(SAMPLE_ROW, HTS_COLS)])
        later = list(SAMPLE_ROW)
        later[1] = "D2030600"
        later[4] = _dt.datetime(2026, 4, 1, 20, 0, 0)
        upsert_rows(db_session, [row_to_mirror_dict(tuple(later), HTS_COLS)])
        wm = watermark_for_view(db_session)
        assert wm == _dt.datetime(2026, 4, 1, 20, 0, 0)


from unittest.mock import MagicMock
from backend.utils.hts_sync import pull_and_upsert


class TestPullAndUpsert:
    def test_fetches_rows_and_returns_stats(self, db_session):
        cur = MagicMock()
        cur.description = [(c, None, None, None, None, None, None) for c in HTS_COLS]
        cur.fetchall.return_value = [SAMPLE_ROW]

        wm = _dt.datetime(1970, 1, 1)
        stats = pull_and_upsert(db_session, cur, watermark=wm)

        assert cur.execute.called
        sql = cur.execute.call_args[0][0]
        assert "HTS.VW_HTS_HOTMETAL_DATA" in sql
        assert "TORPEDO_IN_TIME > :wm" in sql

        assert stats["fetched"] == 1
        assert stats["upserted"] == 1
        assert stats["errors"] == 0

    def test_skips_rows_with_no_heat_no(self, db_session):
        cur = MagicMock()
        cur.description = [(c, None, None, None, None, None, None) for c in HTS_COLS]
        bad = list(SAMPLE_ROW)
        bad[1] = None
        cur.fetchall.return_value = [tuple(bad), SAMPLE_ROW]

        stats = pull_and_upsert(db_session, cur, watermark=_WATERMARK_FLOOR)
        assert stats["fetched"] == 2
        assert stats["upserted"] == 1
        assert stats["skipped_no_heat_no"] == 1
