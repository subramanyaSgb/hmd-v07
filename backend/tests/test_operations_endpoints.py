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
