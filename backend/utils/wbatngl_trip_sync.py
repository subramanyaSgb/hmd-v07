"""
WBATNGL → HMD wbatngl_trip_mirror sync.

Pulls trip-transaction rows from JSW's WBATNGL Oracle every 60 s, UPSERTs
into local PostgreSQL `wbatngl_trip_mirror`. Decoupled from the manual
trip flow — see docs/plans/2026-05-08-wbatngl-trip-mirror-design.md.

Env vars (read at runtime):
    WBATNGL_TRIP_SYNC_ENABLED   default false
    WBATNGL_HOST/PORT/USER/PASSWORD/SERVICE   shared with capacity sync
    ORACLE_INSTANT_CLIENT_DIR
"""
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


_DATE_FORMATS = [
    "%d/%m/%Y %H:%M:%S",        # FIRST_TARE_TIME varchar form (DD/MM/YYYY)
    "%m/%d/%Y %I:%M:%S %p",     # RECEIVED_DATE form (MM/DD/YYYY 12-hour AM/PM)
    "%Y-%m-%d %H:%M:%S",        # ISO-like, in case Oracle returns this
]


def normalize_ladleno(raw: Optional[str]) -> Optional[str]:
    """
    Normalize a WBATNGL `LADLENO` string to HMD's canonical fleet_id form.

    "TLC 01" / "TLC-01" / "TLC01" / "TLC-1" → "TLC-01".
    Returns None for anything that isn't a torpedo (OTL, empty, etc.).

    Note: this duplicates wbatngl_capacity_sync.normalize_ladleno() to keep
    this module free of the oracledb import. If you change one, change both.
    """
    if not raw:
        return None
    s = str(raw).strip().upper()
    if not s.startswith("TLC"):
        return None
    digits = "".join(c for c in s[3:] if c.isdigit())
    if not digits:
        return None
    return f"TLC-{int(digits):02d}"


def parse_wbatngl_date(raw):
    """
    Parse a WBATNGL date that might already be a datetime, or a VARCHAR2
    in one of the formats JSW uses. Returns None for empty/garbage input
    (with a debug log) instead of raising — never crash the sync batch.
    """
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw
    s = str(raw).strip()
    if not s:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    logger.debug(f"parse_wbatngl_date: unparseable value {s!r}")
    return None
