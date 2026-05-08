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
from typing import Optional


def normalize_ladleno(raw: Optional[str]) -> Optional[str]:
    """
    Normalize a WBATNGL `LADLENO` string to HMD's canonical fleet_id form.

    "TLC 01" / "TLC-01" / "TLC01" / "TLC-1" → "TLC-01".
    Returns None for anything that isn't a torpedo (OTL, empty, etc.).
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
