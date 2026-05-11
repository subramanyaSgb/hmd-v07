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
