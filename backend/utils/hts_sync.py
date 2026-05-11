"""
HTS → HMD hts_heat_mirror sync.

Pulls heat-pour rows from JSW's HTS Oracle (HTS.VW_HTS_HOTMETAL_DATA)
every HTS_SYNC_INTERVAL_SECONDS (default 300 = 5 min), UPSERTs into the
local Postgres hts_heat_mirror table. Decoupled from the existing
WBATNGL sync — see docs/plans/2026-05-11-operations-live-design.md.

Env vars (read at runtime):
    HTS_SYNC_ENABLED         default false
    HTS_HOST/PORT/USER/PASSWORD/SERVICE   shared with WBATNGL pattern
    HTS_VIEW                 default HTS.VW_HTS_HOTMETAL_DATA
    HTS_SYNC_INTERVAL_SECONDS default 300
    ORACLE_INSTANT_CLIENT_DIR shared with WBATNGL sync
"""
from typing import Optional


def normalize_torpedo_no(raw: Optional[str]) -> Optional[str]:
    """
    Normalize HTS TORPEDO_NO ("22") to HMD canonical fleet_id ("TLC-22").
    Mirrors normalize_ladleno() from wbatngl_trip_sync but for the
    plain-integer form HTS uses.

    Returns None for empty / non-numeric input (validation upstream).
    """
    if not raw:
        return None
    s = str(raw).strip()
    if not s.isdigit():
        return None
    return f"TLC-{int(s):02d}"
