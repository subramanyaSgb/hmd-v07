# WBATNGL Trip Mirror + Plant Live + JSW Tab — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface JSW WBATNGL trip data in HMD via two new read-only views (a JSW tab inside Trip Management and a Plant Live sidebar page), driven by a 60-second background sync into a local PostgreSQL mirror table.

**Architecture:** Background sync (`wbatngl_trip_sync.py`) pulls deltas from `BF3.WB_TRANS_DATA_ITRO` and `BF5.ZWB_TRANSACTION_DATA_ITRO_B` every 60 seconds, UPSERTs into the new `wbatngl_trip_mirror` PG table by `trip_id`. Two new endpoints (`/api/jsw/trips` paginated list, `/api/jsw/dashboard` aggregates) feed two new frontend surfaces. Existing manual trip flow, weighbridge UI, drawer, and capacity sync are completely untouched.

**Tech Stack:** Python 3.11 / FastAPI / SQLAlchemy / Alembic / oracledb (thick mode) / pytest / React 19 / Vite / lucide-react / leaflet (existing).

**Design reference:** [docs/plans/2026-05-08-wbatngl-trip-mirror-design.md](./2026-05-08-wbatngl-trip-mirror-design.md) — read this first for context on every architectural decision.

---

## Pre-flight checks

Before Task 1:

```bash
cd c:/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07
git status              # → expect clean working tree on main
git log --oneline -1    # → expect 5390fb2 docs(plans): … Sprint 2 design
.venv\Scripts\activate.bat   # DSI laptop has venv at repo root; BF4 same name, different path
pytest backend/ -q      # → expect existing 187 tests pass before we add anything
```

If anything fails, **stop and resolve** before starting.

---

## Task 1: Alembic migration for `wbatngl_trip_mirror` table

**Files:**
- Create: `backend/alembic/versions/<auto-rev>_add_wbatngl_trip_mirror.py`

**Step 1:** Generate migration skeleton with autogenerate disabled (we want explicit DDL).

```bash
cd backend
python -m alembic revision -m "add wbatngl_trip_mirror"
```

Note the generated revision ID. Open the new file at `backend/alembic/versions/<rev>_add_wbatngl_trip_mirror.py`.

**Step 2:** Replace `upgrade()` and `downgrade()` with explicit DDL.

```python
"""add wbatngl_trip_mirror

Revision ID: <auto>
Revises: h1i2j3k4l5m6
Create Date: 2026-05-08 …
"""
from alembic import op
import sqlalchemy as sa


revision = "<auto>"
down_revision = "h1i2j3k4l5m6"  # current head — confirm with `alembic current`
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wbatngl_trip_mirror",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("trip_id", sa.String(50), nullable=False),
        sa.Column("tap_no", sa.Integer),
        sa.Column("ladleno_raw", sa.String(15)),
        sa.Column("fleet_id", sa.String(15)),
        sa.Column("source_lab", sa.String(10)),
        sa.Column("destination", sa.String(50)),
        sa.Column("tap_hole", sa.Integer),
        sa.Column("gross_weight", sa.Float),
        sa.Column("tare_weight", sa.Float),
        sa.Column("net_weight", sa.Float),
        sa.Column("temp", sa.Float),
        sa.Column("si_l", sa.Float),
        sa.Column("s_l", sa.Float),
        sa.Column("bds_temp", sa.Float),
        sa.Column("shift", sa.String(2)),
        sa.Column("source_table", sa.String(60)),
        sa.Column("first_tare_time", sa.DateTime(timezone=False)),
        sa.Column("out_date", sa.DateTime(timezone=False)),
        sa.Column("closetime", sa.DateTime(timezone=False)),
        sa.Column("received_date", sa.DateTime(timezone=False)),
        sa.Column("sms_ack_time", sa.DateTime(timezone=False)),
        sa.Column("updated_date", sa.DateTime(timezone=False)),
        sa.Column("synced_at", sa.DateTime(timezone=False),
                  server_default=sa.func.now()),
        sa.UniqueConstraint("trip_id", name="uq_wbatngl_trip_mirror_trip_id"),
    )
    op.create_index(
        "ix_wbatngl_trip_mirror_updated_date_desc",
        "wbatngl_trip_mirror",
        [sa.text("updated_date DESC")],
    )
    op.create_index(
        "ix_wbatngl_trip_mirror_fleet_id",
        "wbatngl_trip_mirror",
        ["fleet_id"],
    )
    op.create_index(
        "ix_wbatngl_trip_mirror_source_destination",
        "wbatngl_trip_mirror",
        ["source_lab", "destination"],
    )
    op.create_index(
        "ix_wbatngl_trip_mirror_chemistry_partial",
        "wbatngl_trip_mirror",
        ["updated_date"],
        postgresql_where=sa.text(
            "temp IS NOT NULL OR si_l IS NOT NULL OR s_l IS NOT NULL"
        ),
    )


def downgrade() -> None:
    op.drop_index("ix_wbatngl_trip_mirror_chemistry_partial",
                  table_name="wbatngl_trip_mirror")
    op.drop_index("ix_wbatngl_trip_mirror_source_destination",
                  table_name="wbatngl_trip_mirror")
    op.drop_index("ix_wbatngl_trip_mirror_fleet_id",
                  table_name="wbatngl_trip_mirror")
    op.drop_index("ix_wbatngl_trip_mirror_updated_date_desc",
                  table_name="wbatngl_trip_mirror")
    op.drop_table("wbatngl_trip_mirror")
```

**Step 3:** Verify `down_revision` matches current head.

```bash
python -m alembic current
```

If output is not `h1i2j3k4l5m6 (head)`, replace the placeholder above with whatever `alembic current` reports, **without** the `(head)` suffix.

**Step 4:** Apply the migration locally.

```bash
python -m alembic upgrade head
```

Expected output ends with: `Running upgrade h1i2j3k4l5m6 -> <auto>, add wbatngl_trip_mirror`.

**Step 5:** Verify table exists.

```bash
python -c "from backend.database.engine import engine; \
import sqlalchemy as sa; \
print(sa.inspect(engine).get_columns('wbatngl_trip_mirror'))"
```

Expected: a list of 24 column dicts.

**Step 6:** Commit.

```bash
git add backend/alembic/versions/<rev>_add_wbatngl_trip_mirror.py
git commit -m "feat(db): add wbatngl_trip_mirror table + 4 indexes"
```

---

## Task 2: SQLAlchemy `WbatnglTripMirror` model

**Files:**
- Modify: `backend/database/models.py` (append at end, before any helper functions)

**Step 1:** Add the model class at the end of `backend/database/models.py`.

```python
class WbatnglTripMirror(Base):
    """
    Read-only mirror of JSW WBATNGL trip-transaction data. Populated by the
    `wbatngl_trip_sync` background job, consumed by `/api/jsw/*` endpoints.

    NOT to be joined to or mutated from the existing manual-trip flow — see
    docs/plans/2026-05-08-wbatngl-trip-mirror-design.md (Topic 5: strict
    separation).
    """
    __tablename__ = "wbatngl_trip_mirror"

    id = Column(Integer, primary_key=True)
    trip_id = Column(String(50), unique=True, nullable=False, index=True)
    tap_no = Column(Integer)
    ladleno_raw = Column(String(15))
    fleet_id = Column(String(15), index=True)
    source_lab = Column(String(10))
    destination = Column(String(50))
    tap_hole = Column(Integer)

    gross_weight = Column(Float)
    tare_weight = Column(Float)
    net_weight = Column(Float)

    temp = Column(Float)
    si_l = Column(Float)
    s_l = Column(Float)
    bds_temp = Column(Float)

    shift = Column(String(2))
    source_table = Column(String(60))

    first_tare_time = Column(DateTime)
    out_date = Column(DateTime)
    closetime = Column(DateTime)
    received_date = Column(DateTime)
    sms_ack_time = Column(DateTime)
    updated_date = Column(DateTime, index=True)

    synced_at = Column(DateTime, server_default=func.now())
```

**Step 2:** Verify the model imports cleanly.

```bash
python -c "from backend.database.models import WbatnglTripMirror; \
print(WbatnglTripMirror.__tablename__, len(WbatnglTripMirror.__table__.columns))"
```

Expected: `wbatngl_trip_mirror 24`.

**Step 3:** Commit.

```bash
git add backend/database/models.py
git commit -m "feat(models): add WbatnglTripMirror SQLAlchemy model"
```

---

## Task 3: Test fixture — sample WBATNGL rows

**Files:**
- Create: `backend/tests/fixtures/wbatngl_sample.py`

**Step 1:** Create the fixture module with 6 representative rows (a healthy mix: typical, idle-no-temp, OTL-to-be-filtered, malformed-date, zero-chemistry, junk-net-weight).

```python
"""
Canned sample of rows shaped exactly like Oracle cursor.fetchall() returns
from BF3.WB_TRANS_DATA_ITRO and BF5.ZWB_TRANSACTION_DATA_ITRO_B.

Used by test_wbatngl_trip_sync.py to mock the Oracle round-trip without
needing a live JSW connection.
"""
from datetime import datetime


# Schema for BF3.WB_TRANS_DATA_ITRO (23 cols)
BF3_COLS = [
    "TAPNO", "LADLENO", "TAPHOLE", "GROSS_WEIGHT", "TARE_WEIGHT", "NET_WEIGHT",
    "DESTINATION", "FIRST_TARE_TIME", "OUT_DATE", "TRIP_ID", "UPDATED_DATE",
    "SHIFT", "TARE_WEIGHT_ACTUAL", "NET_WEIGHT_ACTUAL", "SOURCE_LAB",
    "RECEIVED_DATE", "CLOSETIME", "TEMP", "S_L", "SMS_ACK_TIME", "LOC",
    "SI_L", "BDS_TEMP",
]

# Schema for BF5.ZWB_TRANSACTION_DATA_ITRO_B (20 cols, no SI_L/HTS_BDS_TEMP/LOC)
BF5_COLS = [
    "TAPNO", "LADLENO", "TAPHOLE", "GROSS_WEIGHT", "TARE_WEIGHT", "NET_WEIGHT",
    "DESTINATION", "FIRST_TARE_TIME", "OUT_DATE", "TRIP_ID", "UPDATED_DATE",
    "SHIFT", "TARE_WEIGHT_ACTUAL", "NET_WEIGHT_ACTUAL", "SOURCE_LAB",
    "RECEIVED_DATE", "CLOSETIME", "TEMP", "S_L", "SMS_ACK_TIME",
]


# Six rows, each as a tuple in BF3_COLS order
BF3_SAMPLE = [
    # 1. Typical good row
    (74558, "TLC 01", 3, 688.5, 337.5, 351.0,
     "SMS2", datetime(2026, 5, 7, 5, 10, 36), datetime(2026, 5, 7, 12, 31, 15),
     "74558TLC 011070526", datetime(2026, 5, 7, 9, 26, 13),
     "A", 349.8, 338.7, "BF4",
     "05/07/2026 11:03:20 AM", datetime(2026, 5, 7, 9, 52, 0),
     1500.42, 0.028, None, "BF3",
     0.64, None),

    # 2. Idle row — TEMP=0 (must become NULL), zero chemistry
    (74553, "TLC 01", 2, 682.9, 452.2, 230.7,
     "SMS2", datetime(2026, 5, 6, 19, 51, 38), datetime(2026, 5, 7, 5, 10, 36),
     "74553TLC 011070526", datetime(2026, 5, 7, 1, 25, 5),
     "C", 337.5, 345.4, "BF4",
     None, datetime(2026, 5, 7, 2, 9, 15),
     0.0, 0.0, None, "BF3",   # <-- TEMP=0, S_L=0
     0.0, None),               # <-- SI_L=0

    # 3. OTL ladle (must be filtered out)
    (20965, "OTL 23", 2, 188.9, 105.65, 83.25,
     "SMS2", None, datetime(2013, 7, 18, 14, 55, 0),
     "20965OTL 231", datetime(2013, 7, 18, 12, 55, 0),
     "B", 96.3, 92.6, "BF3",
     None, None,
     None, None, None, "BF3",
     None, None),

    # 4. Junk NET_WEIGHT (huge number — sync still stores it; aggregate
    #    queries should be defensive, not the sync)
    (74400, "TLC 19", 1, 7050.0, 300.0, 6750.0,
     "SMS2", datetime(2026, 5, 6, 10, 0, 0), datetime(2026, 5, 6, 11, 0, 0),
     "74400TLC 191060526", datetime(2026, 5, 6, 11, 0, 0),
     "A", 300.0, 6750.0, "BF3",
     None, None,
     1500.0, 0.03, None, "BF3",
     0.5, None),

    # 5. Out-of-spec chemistry: high S
    (74559, "TLC 21", 1, 691.2, 333.6, 357.6,
     "SMS2", datetime(2026, 5, 7, 6, 55, 57), datetime(2026, 5, 7, 14, 0, 0),
     "74559TLC 211070526", datetime(2026, 5, 7, 14, 59, 33),
     "B", 0.0, 0.0, "BF4",
     None, datetime(2026, 5, 7, 11, 30, 56),
     1479.7, 0.07, None, "BF3",  # <-- S_L 0.07 (out of spec)
     0.39, None),

    # 6. Out-of-spec: low temp
    (74600, "TLC 02", 4, 660.0, 320.0, 340.0,
     "SMS4", datetime(2026, 5, 7, 8, 0, 0), datetime(2026, 5, 7, 9, 0, 0),
     "74600TLC 021070526", datetime(2026, 5, 7, 9, 30, 0),
     "B", 0.0, 0.0, "BF3",
     None, datetime(2026, 5, 7, 9, 45, 0),
     1440.0, 0.025, None, "BF3",  # <-- TEMP 1440 (out of spec)
     0.55, None),
]


# Reduced view for BF5 (drops cols BF5 schema doesn't have)
BF5_SAMPLE = [
    (8261, "TLC 51", 3, 736.0, 399.0, 337.0,
     "SMS4", "07/05/2026 11:22:11", None,
     "8261TLC 511070526", datetime(2026, 5, 7, 16, 18, 7),
     "B", 0.0, 0.0, "BF5",
     None, None,
     0.0, 0.022, None),  # TEMP=0 -> NULL after sync
]
```

**Step 2:** Verify the fixture imports.

```bash
python -c "from backend.tests.fixtures.wbatngl_sample import BF3_SAMPLE, BF5_SAMPLE; \
print(f'BF3={len(BF3_SAMPLE)} BF5={len(BF5_SAMPLE)}')"
```

Expected: `BF3=6 BF5=1`.

**Step 3:** Commit.

```bash
git add backend/tests/fixtures/wbatngl_sample.py
git commit -m "test(wbatngl): add sample row fixtures for sync tests"
```

---

## Task 4: `normalize_ladleno` helper + tests

**Files:**
- Create: `backend/tests/test_wbatngl_trip_sync.py`
- Create: `backend/utils/wbatngl_trip_sync.py`

**Step 1:** Write the failing test (do this BEFORE creating the source module).

`backend/tests/test_wbatngl_trip_sync.py`:

```python
"""Tests for backend.utils.wbatngl_trip_sync."""
import pytest

from backend.utils.wbatngl_trip_sync import normalize_ladleno


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
```

**Step 2:** Run; expect ImportError.

```bash
pytest backend/tests/test_wbatngl_trip_sync.py -q
```

Expected: `ModuleNotFoundError: No module named 'backend.utils.wbatngl_trip_sync'`.

**Step 3:** Create minimal `backend/utils/wbatngl_trip_sync.py`.

```python
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
```

**Step 4:** Run the tests; expect PASS.

```bash
pytest backend/tests/test_wbatngl_trip_sync.py::TestNormalizeLadleno -v
```

Expected: 10 passed.

**Step 5:** Commit.

```bash
git add backend/tests/test_wbatngl_trip_sync.py backend/utils/wbatngl_trip_sync.py
git commit -m "feat(wbatngl): normalize_ladleno helper + tests"
```

---

## Task 5: `parse_wbatngl_date` helper + tests

**Files:**
- Modify: `backend/tests/test_wbatngl_trip_sync.py`
- Modify: `backend/utils/wbatngl_trip_sync.py`

**Step 1:** Append to the test file.

```python
from datetime import datetime
from backend.utils.wbatngl_trip_sync import parse_wbatngl_date


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
```

**Step 2:** Run; expect ImportError.

```bash
pytest backend/tests/test_wbatngl_trip_sync.py::TestParseWbatnglDate -q
```

Expected: ImportError on `parse_wbatngl_date`.

**Step 3:** Append to `backend/utils/wbatngl_trip_sync.py`:

```python
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


_DATE_FORMATS = [
    "%d/%m/%Y %H:%M:%S",        # FIRST_TARE_TIME varchar form (DD/MM/YYYY)
    "%m/%d/%Y %I:%M:%S %p",     # RECEIVED_DATE form (MM/DD/YYYY 12-hour AM/PM)
    "%Y-%m-%d %H:%M:%S",        # ISO-like, in case Oracle returns this
]


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
```

**Step 4:** Run; expect 8 passed.

```bash
pytest backend/tests/test_wbatngl_trip_sync.py::TestParseWbatnglDate -v
```

**Step 5:** Commit.

```bash
git add backend/tests/test_wbatngl_trip_sync.py backend/utils/wbatngl_trip_sync.py
git commit -m "feat(wbatngl): parse_wbatngl_date with format-ladder + None on fail"
```

---

## Task 6: `_zero_to_null` chemistry helper + tests

**Step 1:** Append to test file.

```python
from backend.utils.wbatngl_trip_sync import _zero_to_null


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
```

**Step 2:** Run; expect ImportError.

**Step 3:** Append to `wbatngl_trip_sync.py`:

```python
def _zero_to_null(value):
    """
    WBATNGL stores TEMP=0 / S_L=0 / SI_L=0 to mean "not measured." Storing
    those as 0 in the mirror would bias chemistry averages downward, so we
    coerce to None. Treats any value ≤ 1e-9 (and negatives) as unmeasured.
    """
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v <= 1e-9:
        return None
    return v
```

**Step 4:** Run; expect 8 passed.

**Step 5:** Commit.

```bash
git commit -am "feat(wbatngl): _zero_to_null treats 0 / negative as unmeasured"
```

---

## Task 7: `row_to_mirror_dict` mapper + tests

This converts one Oracle row tuple into a dict ready for UPSERT.

**Step 1:** Append to test file.

```python
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
```

**Step 2:** Run; expect ImportError.

**Step 3:** Append to `wbatngl_trip_sync.py`:

```python
def row_to_mirror_dict(row, cols, source_table):
    """
    Map an Oracle row tuple to a dict shaped for `wbatngl_trip_mirror` UPSERT.

    Returns None for rows that should be skipped (e.g., non-torpedo LADLENOs).
    """
    r = dict(zip(cols, row))
    fleet_id = normalize_ladleno(r.get("LADLENO"))
    if fleet_id is None:
        return None    # not a torpedo; caller increments skipped counter

    return {
        "trip_id": r.get("TRIP_ID"),
        "tap_no": r.get("TAPNO"),
        "ladleno_raw": r.get("LADLENO"),
        "fleet_id": fleet_id,
        "source_lab": r.get("SOURCE_LAB"),
        "destination": (r.get("DESTINATION") or "").strip() or None,
        "tap_hole": r.get("TAPHOLE"),

        "gross_weight": r.get("GROSS_WEIGHT"),
        "tare_weight": r.get("TARE_WEIGHT"),
        "net_weight": r.get("NET_WEIGHT"),

        "temp": _zero_to_null(r.get("TEMP")),
        "si_l": _zero_to_null(r.get("SI_L")),
        "s_l":  _zero_to_null(r.get("S_L")),
        "bds_temp": _zero_to_null(r.get("BDS_TEMP") or r.get("HTS_BDS_TEMP")),

        "shift": (r.get("SHIFT") or "").strip() or None,
        "source_table": source_table,

        "first_tare_time": parse_wbatngl_date(r.get("FIRST_TARE_TIME")),
        "out_date":        parse_wbatngl_date(r.get("OUT_DATE")),
        "closetime":       parse_wbatngl_date(r.get("CLOSETIME")),
        "received_date":   parse_wbatngl_date(r.get("RECEIVED_DATE")),
        "sms_ack_time":    parse_wbatngl_date(r.get("SMS_ACK_TIME")),
        "updated_date":    parse_wbatngl_date(r.get("UPDATED_DATE")),
    }
```

**Step 4:** Run; expect 4 passed.

**Step 5:** Commit.

```bash
git commit -am "feat(wbatngl): row_to_mirror_dict maps oracle row to upsert dict"
```

---

## Task 8: `upsert_rows` against PostgreSQL + tests

**Step 1:** Append to test file. Uses real PG via the existing test conftest (which runs against a fresh DB schema per test).

```python
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
```

**Step 2:** Run; expect ImportError on `upsert_rows`.

**Step 3:** Append to `wbatngl_trip_sync.py`:

```python
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from ..database.models import WbatnglTripMirror


def upsert_rows(db: Session, rows: list[dict]) -> int:
    """
    UPSERT a batch of mirror dicts into wbatngl_trip_mirror.
    Conflict target: trip_id (unique constraint).
    Update columns: everything except id and trip_id.
    Returns count of rows successfully UPSERTed.
    """
    if not rows:
        return 0

    update_cols = {
        c.name for c in WbatnglTripMirror.__table__.columns
        if c.name not in ("id", "trip_id", "synced_at")
    }
    stmt = pg_insert(WbatnglTripMirror).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["trip_id"],
        set_={col: stmt.excluded[col] for col in update_cols},
    )
    db.execute(stmt)
    db.commit()
    return len(rows)
```

**Step 4:** Run; expect 3 passed.

**Step 5:** Commit.

```bash
git commit -am "feat(wbatngl): upsert_rows with ON CONFLICT DO UPDATE on trip_id"
```

---

## Task 9: `watermark_for_source` + tests

The recurring sync uses this to know "where did we leave off."

**Step 1:** Append to test file.

```python
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
```

**Step 2:** Run; expect ImportError.

**Step 3:** Append to `wbatngl_trip_sync.py`:

```python
from sqlalchemy import func, select


_WATERMARK_FLOOR = datetime(1970, 1, 1)


def watermark_for_source(db: Session, source_table: str) -> datetime:
    """
    Return MAX(updated_date) for the given source_table, or the epoch floor
    if the mirror has no rows for that source yet (used as the WHERE > value
    in the next incremental pull).
    """
    result = db.execute(
        select(func.max(WbatnglTripMirror.updated_date))
        .where(WbatnglTripMirror.source_table == source_table)
    ).scalar()
    return result or _WATERMARK_FLOOR
```

**Step 4:** Run; expect 3 passed.

**Step 5:** Commit.

```bash
git commit -am "feat(wbatngl): watermark_for_source for incremental sync"
```

---

## Task 10: Sync-loop scaffolding (`pull_and_upsert_from_source`)

Combines the helpers into one source-table pull. Mocks Oracle so we don't need a real connection in tests.

**Step 1:** Append to test file.

```python
from unittest.mock import MagicMock
from backend.utils.wbatngl_trip_sync import pull_and_upsert_from_source


class TestPullAndUpsertFromSource:
    def test_filters_otl_and_returns_count(self, db_session: Session, monkeypatch):
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
```

**Step 2:** Run; expect ImportError.

**Step 3:** Append to `wbatngl_trip_sync.py`:

```python
def pull_and_upsert_from_source(
    db: Session,
    cursor,
    source_table: str,
    watermark: datetime,
) -> dict:
    """
    Execute the incremental SELECT against `source_table`, run each row
    through row_to_mirror_dict, UPSERT the surviving torpedo rows.

    `cursor` is an oracledb cursor (already connected by the caller).
    `source_table` is "BF3.<NAME>" or "BF5.<NAME>" (used for WHERE in SQL
    and for the source_table audit column).
    """
    owner, table = source_table.split(".", 1)
    qualified = f'"{owner}".{table}' if not table.startswith('"') else f'"{owner}".{table}'

    sql = (
        f"SELECT * FROM {qualified} "
        f"WHERE UPDATED_DATE > :wm "
        f"  AND LADLENO LIKE 'TLC%' "
        f"  AND TRIP_ID IS NOT NULL"
    )
    cursor.execute(sql, wm=watermark)
    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]

    stats = {"fetched": len(rows),
             "upserted": 0,
             "skipped_non_torpedo": 0,
             "errors": 0}

    mirror_rows = []
    for r in rows:
        try:
            d = row_to_mirror_dict(r, cols, source_table)
        except Exception:
            logger.exception(f"row_to_mirror_dict failed for {r!r}")
            stats["errors"] += 1
            continue
        if d is None:
            stats["skipped_non_torpedo"] += 1
            continue
        mirror_rows.append(d)

    stats["upserted"] = upsert_rows(db, mirror_rows)
    return stats
```

**Step 4:** Run; expect PASS (1 test).

**Step 5:** Commit.

```bash
git commit -am "feat(wbatngl): pull_and_upsert_from_source — one source-table tick"
```

---

## Task 11: `run_once` + `run_backfill` + cache invalidation

**Step 1:** Append to test file.

```python
from backend.utils.wbatngl_trip_sync import (
    run_once, SOURCE_TABLES,
)


class TestRunOnce:
    def test_iterates_all_source_tables(self, monkeypatch):
        # Mock oracledb.connect to return a fake connection that yields different
        # cursors per source table.
        # … (full test body in module) …
        pass
```

(The full test body is straightforward but verbose — implementation detail. The point is `run_once` should call `pull_and_upsert_from_source` once per entry in `SOURCE_TABLES`, aggregate stats, and invalidate the cache.)

**Step 2:** Append to `wbatngl_trip_sync.py`:

```python
import os
import oracledb

from .cache import fleet_cache


SOURCE_TABLES = [
    'BF3."WB_TRANS_DATA_ITRO"',
    'BF5."ZWB_TRANSACTION_DATA_ITRO_B"',
]

CACHE_KEY_JSW_DASHBOARD = "jsw_dashboard"


_ORACLE_THICK_INITIALIZED = False


def _ensure_thick_mode(client_dir: str) -> bool:
    global _ORACLE_THICK_INITIALIZED
    if _ORACLE_THICK_INITIALIZED:
        return True
    if not os.path.isdir(client_dir):
        logger.warning(f"WBATNGL: Oracle Instant Client not found at {client_dir}")
        return False
    try:
        oracledb.init_oracle_client(lib_dir=client_dir)
        _ORACLE_THICK_INITIALIZED = True
        return True
    except Exception as e:
        if "DPI-1047" in str(e) or "already" in str(e).lower():
            _ORACLE_THICK_INITIALIZED = True
            return True
        return False


def _connect_oracle():
    cfg = {
        "host":     os.getenv("WBATNGL_HOST", "10.10.1.67"),
        "port":     int(os.getenv("WBATNGL_PORT", "1522")),
        "user":     os.getenv("WBATNGL_USER", "ITROSYSP"),
        "password": os.getenv("WBATNGL_PASSWORD", ""),
        "service":  os.getenv("WBATNGL_SERVICE", "WBATNGL"),
        "client":   os.getenv("ORACLE_INSTANT_CLIENT_DIR",
                              r"C:\oracle\instantclient_23_0"),
    }
    if not cfg["password"]:
        raise RuntimeError("WBATNGL_PASSWORD not set")
    _ensure_thick_mode(cfg["client"])
    return oracledb.connect(
        user=cfg["user"], password=cfg["password"],
        dsn=f"{cfg['host']}:{cfg['port']}/{cfg['service']}",
    )


def run_once(backfill_days: int = 0) -> dict:
    """
    One scheduler tick. If `backfill_days > 0`, the watermark is overridden
    to NOW - backfill_days (used for initial CLI backfill).

    Returns aggregated stats across all source tables.
    """
    from ..database.engine import SessionLocal
    from datetime import timedelta

    logger.info("WBATNGL trip sync: starting")
    total = {"fetched": 0, "upserted": 0,
             "skipped_non_torpedo": 0, "errors": 0}

    try:
        conn = _connect_oracle()
    except Exception as e:
        logger.exception(f"WBATNGL connect failed: {e}")
        return {"error": str(e)}

    db = SessionLocal()
    try:
        cursor = conn.cursor()
        for src in SOURCE_TABLES:
            if backfill_days > 0:
                wm = datetime.utcnow() - timedelta(days=backfill_days)
            else:
                wm = watermark_for_source(db, src)

            try:
                stats = pull_and_upsert_from_source(db, cursor, src, wm)
            except Exception as e:
                logger.exception(f"WBATNGL source {src} failed: {e}")
                total["errors"] += 1
                continue
            for k in total:
                total[k] += stats.get(k, 0)
            logger.info(
                f"WBATNGL {src}: fetched={stats['fetched']} "
                f"upserted={stats['upserted']} "
                f"skipped={stats['skipped_non_torpedo']} "
                f"watermark_was={wm}"
            )

        if fleet_cache is not None:
            try:
                fleet_cache.invalidate(CACHE_KEY_JSW_DASHBOARD)
            except Exception:
                pass

        logger.info(
            f"WBATNGL trip sync OK: fetched={total['fetched']} "
            f"upserted={total['upserted']} errors={total['errors']}"
        )
    finally:
        db.close()
        conn.close()
    return total


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--backfill-days", type=int, default=0,
                   help="If >0, ignore watermark and pull last N days")
    args = p.parse_args()
    print(run_once(backfill_days=args.backfill_days))
```

**Step 3:** Run all sync tests.

```bash
pytest backend/tests/test_wbatngl_trip_sync.py -v
```

Expected: all green.

**Step 4:** Commit.

```bash
git commit -am "feat(wbatngl): run_once orchestrator + --backfill-days CLI"
```

---

## Task 12: Wire scheduler in `main.py`

**Files:**
- Modify: `backend/main.py` (add `schedule_wbatngl_trip_sync()`, call it from `startup_event`)

**Step 1:** Find the existing `schedule_wbatngl_capacity_sync` function and append the new function right after it.

```python
def schedule_wbatngl_trip_sync():
    """Register interval job that mirrors WBATNGL trip rows every 60 s."""
    if os.getenv("WBATNGL_TRIP_SYNC_ENABLED", "false").lower() != "true":
        logger.info("WBATNGL trip sync disabled (set WBATNGL_TRIP_SYNC_ENABLED=true)")
        return

    interval_sec = int(os.getenv("WBATNGL_TRIP_SYNC_INTERVAL_SECONDS", "60"))

    import asyncio
    from .utils.wbatngl_trip_sync import run_once as wbatngl_trip_run_once

    async def _run_trip_sync():
        try:
            await asyncio.to_thread(wbatngl_trip_run_once)
        except Exception as e:
            logger.exception(f"WBATNGL trip sync job error: {e}")

    scheduler.add_job(
        _run_trip_sync, IntervalTrigger(seconds=interval_sec),
        id="wbatngl_trip_sync", name="WBATNGL Trip Mirror",
        replace_existing=True, max_instances=1, coalesce=True,
    )
    logger.info(f"WBATNGL trip sync scheduled every {interval_sec}s")
```

**Step 2:** In `startup_event`, add the call (next to the other `schedule_*` calls).

```python
    schedule_daily_report()
    schedule_suveechi_sync()
    schedule_wbatngl_capacity_sync()
    schedule_wbatngl_trip_sync()           # <-- NEW
```

**Step 3:** Smoke-test the import.

```bash
python -c "from backend.main import schedule_wbatngl_trip_sync; print('ok')"
```

**Step 4:** Commit.

```bash
git commit -am "feat(main): wire WBATNGL trip sync scheduler (60s interval)"
```

---

## Task 13: `.env.example` — document the new env flag

**Files:**
- Modify: `backend/.env.example` (add `WBATNGL_TRIP_SYNC_ENABLED` near the existing WBATNGL block)

**Step 1:** Append to the WBATNGL block.

```bash
# Trip mirror sync — pulls every WBATNGL trip row into local PostgreSQL
# every 60 s. See docs/plans/2026-05-08-wbatngl-trip-mirror-design.md.
WBATNGL_TRIP_SYNC_ENABLED=false
WBATNGL_TRIP_SYNC_INTERVAL_SECONDS=60
```

**Step 2:** Commit.

```bash
git commit -am "docs(env): document WBATNGL_TRIP_SYNC_ENABLED flag"
```

---

## Task 14: New routes module `backend/routes/jsw.py` — `/api/jsw/trips`

**Files:**
- Create: `backend/routes/jsw.py`
- Create: `backend/tests/test_jsw_endpoints.py`
- Modify: `backend/main.py` (register the new router)

**Step 1:** Write the failing test.

`backend/tests/test_jsw_endpoints.py`:

```python
"""Tests for /api/jsw/* endpoints."""
import pytest
from datetime import datetime
from fastapi.testclient import TestClient

from backend.main import app
from backend.tests.fixtures.wbatngl_sample import BF3_COLS, BF3_SAMPLE
from backend.utils.wbatngl_trip_sync import row_to_mirror_dict, upsert_rows


@pytest.fixture
def seeded_mirror(db_session, auth_admin_token):
    """Seed mirror with sample BF3 rows for endpoint tests."""
    rows = [row_to_mirror_dict(r, BF3_COLS, 'BF3."WB_TRANS_DATA_ITRO"')
            for r in BF3_SAMPLE if r[1] != "OTL 23"]
    upsert_rows(db_session, rows)
    return rows


class TestJswTripsList:
    def test_returns_seeded_rows(self, seeded_mirror, client, auth_admin_token):
        r = client.get(
            "/api/jsw/trips?time_window=30d",
            headers={"Authorization": f"Bearer {auth_admin_token}"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 5
        assert body["page"] == 1
        assert body["page_size"] == 50
        assert len(body["rows"]) == 5
        assert "last_sync_at" in body

    def test_filter_by_destination(self, seeded_mirror, client, auth_admin_token):
        r = client.get(
            "/api/jsw/trips?time_window=30d&destination=SMS4",
            headers={"Authorization": f"Bearer {auth_admin_token}"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 1
        assert body["rows"][0]["destination"] == "SMS4"

    def test_search_matches_trip_id_and_fleet_id(
            self, seeded_mirror, client, auth_admin_token):
        r = client.get(
            "/api/jsw/trips?time_window=30d&q=TLC-19",
            headers={"Authorization": f"Bearer {auth_admin_token}"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 1

    def test_sort_by_whitelist_only(
            self, seeded_mirror, client, auth_admin_token):
        # malicious sort_by should be rejected
        r = client.get(
            "/api/jsw/trips?sort_by=DROP_TABLE",
            headers={"Authorization": f"Bearer {auth_admin_token}"},
        )
        assert r.status_code == 400

    def test_unauthenticated_rejected(self, client):
        r = client.get("/api/jsw/trips")
        assert r.status_code == 401
```

**Step 2:** Run; expect ImportError because `backend.routes.jsw` doesn't exist yet.

**Step 3:** Create `backend/routes/jsw.py`.

```python
"""
GET /api/jsw/trips      — paginated list with filters
GET /api/jsw/dashboard  — aggregates for Plant Live page

Both read from wbatngl_trip_mirror only. Designed to be cheap on PG.
Auth: any authenticated role (Topic 8 of Sprint 2 brainstorm).
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session

from ..database.engine import get_db
from ..database.models import User, WbatnglTripMirror
from ..logger import logger
from ..utils.cache import fleet_cache
from ..utils.security import get_current_user_required


router = APIRouter(tags=["jsw"])


SORT_WHITELIST = {
    "updated_date", "first_tare_time", "out_date",
    "net_weight", "temp", "fleet_id",
}


def _time_window_to_cutoff(time_window: str) -> datetime:
    """today / 24h / 7d / 30d → datetime cutoff."""
    now = datetime.utcnow()
    if time_window == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if time_window == "24h":
        return now - timedelta(hours=24)
    if time_window == "7d":
        return now - timedelta(days=7)
    if time_window == "30d":
        return now - timedelta(days=30)
    raise HTTPException(400, f"Invalid time_window: {time_window!r}")


def _last_sync_at(db: Session) -> Optional[datetime]:
    return db.query(func.max(WbatnglTripMirror.synced_at)).scalar()


@router.get("/api/jsw/trips")
async def jsw_trips(
    time_window: str = Query("today"),
    source_lab: Optional[str] = Query(None),
    destination: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    fleet_id: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: str = Query("updated_date"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    if sort_by not in SORT_WHITELIST:
        raise HTTPException(400, f"sort_by must be one of {sorted(SORT_WHITELIST)}")

    cutoff = _time_window_to_cutoff(time_window)
    qry = db.query(WbatnglTripMirror).filter(
        WbatnglTripMirror.updated_date >= cutoff
    )

    if source_lab and source_lab != "all":
        qry = qry.filter(WbatnglTripMirror.source_lab == source_lab)
    if destination and destination != "all":
        qry = qry.filter(WbatnglTripMirror.destination == destination)
    if shift and shift != "all":
        qry = qry.filter(WbatnglTripMirror.shift == shift)
    if fleet_id and fleet_id != "all":
        qry = qry.filter(WbatnglTripMirror.fleet_id == fleet_id)
    if q:
        like = f"%{q}%"
        qry = qry.filter(or_(
            WbatnglTripMirror.trip_id.ilike(like),
            WbatnglTripMirror.fleet_id.ilike(like),
            WbatnglTripMirror.ladleno_raw.ilike(like),
            func.cast(WbatnglTripMirror.tap_no, func.text).ilike(like),
        ))

    total = qry.count()

    col = getattr(WbatnglTripMirror, sort_by)
    order = col.desc() if sort_order == "desc" else col.asc()
    rows = qry.order_by(order).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "rows": [
            {c.name: getattr(r, c.name)
             for c in WbatnglTripMirror.__table__.columns}
            for r in rows
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
        "last_sync_at": _last_sync_at(db),
    }
```

**Step 4:** Register the router in `backend/main.py` (next to other route registrations).

```python
from .routes import jsw  # add to imports
app.include_router(jsw.router)
```

**Step 5:** Run.

```bash
pytest backend/tests/test_jsw_endpoints.py::TestJswTripsList -v
```

Expected: 5 passed.

**Step 6:** Commit.

```bash
git commit -am "feat(jsw): GET /api/jsw/trips with filters, search, sort whitelist"
```

---

## Task 15: `/api/jsw/dashboard` endpoint + tests

**Step 1:** Append to test file.

```python
class TestJswDashboard:
    def test_kpis_sum_correctly(
            self, seeded_mirror, client, auth_admin_token):
        r = client.get(
            "/api/jsw/dashboard?time_window=30d",
            headers={"Authorization": f"Bearer {auth_admin_token}"},
        )
        assert r.status_code == 200
        body = r.json()
        kpis = body["kpis"]
        # Sum of NET in 5 sample rows (after OTL filter): 351 + 230.7 + 6750 + 357.6 + 340 = 8029.3
        assert kpis["trips_count"] == 5
        assert abs(kpis["tonnage_total_mt"] - 8029.3) < 0.1
        assert kpis["fleet_size"] == 53      # default; from FleetManagement count or const

    def test_chemistry_excludes_null_temps(
            self, seeded_mirror, client, auth_admin_token):
        r = client.get(
            "/api/jsw/dashboard?time_window=30d",
            headers={"Authorization": f"Bearer {auth_admin_token}"},
        )
        body = r.json()
        chem = body["chemistry"]
        # Of 5 rows: row 1 (1500.42), row 2 (NULL after zero-coerce), row 4 (1500),
        # row 5 (1479.7), row 6 (1440). Avg over 4 non-null = ~1480.
        assert 1470 < chem["avg_temp_c"] < 1500
        assert chem["out_of_spec_count"] >= 2   # row 5 high S, row 6 low temp

    def test_flow_groups_by_route(
            self, seeded_mirror, client, auth_admin_token):
        r = client.get(
            "/api/jsw/dashboard?time_window=30d",
            headers={"Authorization": f"Bearer {auth_admin_token}"},
        )
        body = r.json()
        flow = body["flow"]
        # Sample has BF3→SMS2, BF4→SMS2, BF3→SMS4 routes
        labels = {(f["source_lab"], f["destination"]) for f in flow}
        assert ("BF3", "SMS2") in labels
        assert ("BF4", "SMS2") in labels
        assert ("BF3", "SMS4") in labels

    def test_recent_trips_capped_at_15(
            self, seeded_mirror, client, auth_admin_token):
        r = client.get(
            "/api/jsw/dashboard",
            headers={"Authorization": f"Bearer {auth_admin_token}"},
        )
        body = r.json()
        assert len(body["recent_trips"]) <= 15
```

**Step 2:** Run; expect failures (endpoint doesn't exist).

**Step 3:** Append to `backend/routes/jsw.py`.

```python
from ..database.models import FleetManagement


CHEM_THRESHOLDS = {
    "temp_min": 1450, "temp_max": 1530,
    "s_max": 0.05, "si_min": 0.2, "si_max": 1.0,
}

DASHBOARD_CACHE_TTL_SEC = 5
CACHE_KEY_DASHBOARD = "jsw_dashboard"


@router.get("/api/jsw/dashboard")
async def jsw_dashboard(
    time_window: str = Query("today"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    cache_key = f"{CACHE_KEY_DASHBOARD}:{time_window}"
    cached = fleet_cache.get(cache_key)
    if cached is not None:
        return cached

    cutoff = _time_window_to_cutoff(time_window)
    window_length = datetime.utcnow() - cutoff
    prior_cutoff_start = cutoff - window_length

    base = db.query(WbatnglTripMirror).filter(
        WbatnglTripMirror.updated_date >= cutoff
    )
    prior = db.query(WbatnglTripMirror).filter(
        WbatnglTripMirror.updated_date >= prior_cutoff_start,
        WbatnglTripMirror.updated_date < cutoff,
    )

    # KPIs
    trips_count = base.count()
    tonnage = db.query(func.coalesce(func.sum(WbatnglTripMirror.net_weight), 0)
                       ).filter(WbatnglTripMirror.updated_date >= cutoff).scalar()
    cycle_avg = db.query(func.avg(
        func.extract("epoch",
                     WbatnglTripMirror.closetime - WbatnglTripMirror.first_tare_time
                     ) / 60.0
    )).filter(
        WbatnglTripMirror.updated_date >= cutoff,
        WbatnglTripMirror.first_tare_time.isnot(None),
        WbatnglTripMirror.closetime.isnot(None),
    ).scalar()
    active = db.query(func.count(func.distinct(WbatnglTripMirror.fleet_id))
                      ).filter(WbatnglTripMirror.updated_date >= cutoff).scalar()

    fleet_size = db.query(FleetManagement).filter(
        FleetManagement.type == "torpedo",
        FleetManagement.deleted_at.is_(None),
    ).count() or 53

    # Prior window
    prior_trips = prior.count()
    prior_tonnage = db.query(
        func.coalesce(func.sum(WbatnglTripMirror.net_weight), 0)
    ).filter(
        WbatnglTripMirror.updated_date >= prior_cutoff_start,
        WbatnglTripMirror.updated_date < cutoff,
    ).scalar()

    # Producer→Consumer flow
    flow_rows = (db.query(
        WbatnglTripMirror.source_lab,
        WbatnglTripMirror.destination,
        func.count().label("trips"),
        func.coalesce(func.sum(WbatnglTripMirror.net_weight), 0).label("tonnage"),
        func.avg(WbatnglTripMirror.net_weight).label("avg_net"),
    ).filter(WbatnglTripMirror.updated_date >= cutoff)
     .group_by(WbatnglTripMirror.source_lab, WbatnglTripMirror.destination)
     .order_by(func.sum(WbatnglTripMirror.net_weight).desc())
     .all())

    # Chemistry — only non-null
    chem = db.query(
        func.avg(WbatnglTripMirror.temp).label("temp"),
        func.avg(WbatnglTripMirror.si_l).label("si"),
        func.avg(WbatnglTripMirror.s_l).label("s"),
    ).filter(
        WbatnglTripMirror.updated_date >= cutoff,
        or_(WbatnglTripMirror.temp.isnot(None),
            WbatnglTripMirror.si_l.isnot(None),
            WbatnglTripMirror.s_l.isnot(None)),
    ).first()

    high_s = base.filter(WbatnglTripMirror.s_l > CHEM_THRESHOLDS["s_max"]).count()
    low_temp = base.filter(WbatnglTripMirror.temp < CHEM_THRESHOLDS["temp_min"]).count()
    high_temp = base.filter(WbatnglTripMirror.temp > CHEM_THRESHOLDS["temp_max"]).count()

    # Recent (last 15)
    recent = base.order_by(WbatnglTripMirror.updated_date.desc()).limit(15).all()

    payload = {
        "kpis": {
            "trips_count": trips_count,
            "tonnage_total_mt": float(tonnage or 0),
            "avg_cycle_min": round(cycle_avg, 1) if cycle_avg else None,
            "active_torpedoes": active or 0,
            "fleet_size": fleet_size,
            "trips_count_prior": prior_trips,
            "tonnage_total_prior_mt": float(prior_tonnage or 0),
        },
        "flow": [
            {"source_lab": s, "destination": d,
             "trips": t, "tonnage_mt": float(ton),
             "avg_net_mt": float(avg) if avg else None}
            for s, d, t, ton, avg in flow_rows
        ],
        "chemistry": {
            "avg_temp_c": round(chem.temp, 1) if chem.temp else None,
            "avg_si_pct": round(chem.si, 3) if chem.si else None,
            "avg_s_pct": round(chem.s, 4) if chem.s else None,
            "out_of_spec_count": high_s + low_temp + high_temp,
            "out_of_spec_breakdown": {
                "high_s": high_s, "low_temp": low_temp, "high_temp": high_temp,
            },
            "thresholds": CHEM_THRESHOLDS,
        },
        "recent_trips": [
            {c.name: getattr(r, c.name)
             for c in WbatnglTripMirror.__table__.columns}
            for r in recent
        ],
        "last_sync_at": _last_sync_at(db),
    }
    fleet_cache.set(cache_key, payload, DASHBOARD_CACHE_TTL_SEC)
    return payload
```

**Step 4:** Run all jsw endpoint tests.

```bash
pytest backend/tests/test_jsw_endpoints.py -v
```

Expected: all green.

**Step 5:** Commit.

```bash
git commit -am "feat(jsw): GET /api/jsw/dashboard with KPIs/flow/chemistry/recent"
```

---

## Task 16: Frontend — `PlantLive.jsx` page

**Files:**
- Create: `frontend/src/pages/PlantLive.jsx`

No frontend test framework is in place; manual smoke-test via SMS4 is the verification (see Task 19).

**Step 1:** Create `frontend/src/pages/PlantLive.jsx`. Full code (one go, since the page is one component with sub-renders):

```jsx
import { useState, useEffect, useMemo } from 'react'
import { Activity, Factory, FlaskConical, Truck, Clock } from 'lucide-react'
import { api } from '../utils/api'
import { statusColor } from '../utils/torpedoStatus'

const TIME_WINDOWS = [
    { value: 'today', label: 'TODAY' },
    { value: '24h',   label: '24H' },
    { value: '7d',    label: '7D' },
    { value: '30d',   label: '30D' },
]

const formatRelative = (iso) => {
    if (!iso) return '—'
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
    if (diffSec < 60) return `${diffSec}s ago`
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    return `${Math.floor(diffSec / 3600)}h ago`
}

const PlantLive = () => {
    const [timeWindow, setTimeWindow] = useState('today')
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [tick, setTick] = useState(0)

    // 1-second tick for relative timer (memoised consumer to avoid full repaint)
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1000)
        return () => clearInterval(id)
    }, [])

    // 15s data poll
    useEffect(() => {
        let mounted = true
        const fetchData = async () => {
            try {
                const res = await api.get(`/api/jsw/dashboard?time_window=${timeWindow}`)
                if (mounted) { setData(res); setError(null) }
            } catch (e) {
                if (mounted) setError(e.message)
            } finally {
                if (mounted) setLoading(false)
            }
        }
        fetchData()
        const id = setInterval(fetchData, 15000)
        return () => { mounted = false; clearInterval(id) }
    }, [timeWindow])

    const updatedRel = useMemo(() => {
        void tick   // keep useMemo dependent on tick
        return formatRelative(data?.last_sync_at)
    }, [data?.last_sync_at, tick])

    if (loading) return <div className="premium-page-container">Loading plant data…</div>
    if (error)   return <div className="premium-page-container">Error: {error}</div>
    if (!data)   return null

    const { kpis, flow, chemistry, recent_trips } = data
    const tonnageDelta = kpis.tonnage_total_mt - (kpis.tonnage_total_prior_mt || 0)
    const tonnageDeltaPct = kpis.tonnage_total_prior_mt
        ? (tonnageDelta / kpis.tonnage_total_prior_mt) * 100
        : null

    return (
        <div className="premium-page-container">
            {/* Header strip */}
            <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: '24px' }}>
                <h2 className="space-grotesk" style={{ margin: 0 }}>Plant Live</h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {TIME_WINDOWS.map(w => (
                        <button key={w.value}
                            onClick={() => setTimeWindow(w.value)}
                            className={`time-chip ${timeWindow === w.value ? 'active' : ''}`}>
                            {w.label}
                        </button>
                    ))}
                    <span style={{ fontSize: '12px', color: 'hsl(var(--text-muted))', marginLeft: '12px' }}>
                        Updated {updatedRel}
                    </span>
                </div>
            </div>

            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: '16px', marginBottom: '24px' }}>
                <KpiCard label="Trips"           value={kpis.trips_count}
                         delta={kpis.trips_count - (kpis.trips_count_prior || 0)}
                         icon={<Truck size={18} />} />
                <KpiCard label="Tonnage (MT)"    value={kpis.tonnage_total_mt.toFixed(1)}
                         delta={tonnageDeltaPct !== null ? `${tonnageDeltaPct.toFixed(0)}%` : null}
                         icon={<Factory size={18} />} />
                <KpiCard label="Avg Cycle (min)" value={kpis.avg_cycle_min ?? '—'}
                         icon={<Clock size={18} />} />
                <KpiCard label="Active Torpedos" value={`${kpis.active_torpedoes}/${kpis.fleet_size}`}
                         icon={<Activity size={18} />} />
            </div>

            {/* Producer → Consumer Flow */}
            <Section title="Producer → Consumer Flow">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                        <th style={th}>Producer</th><th style={th}>Consumer</th>
                        <th style={th}>Trips</th><th style={th}>Tonnage (MT)</th>
                        <th style={th}>Avg Net (MT)</th>
                    </tr></thead>
                    <tbody>
                        {flow.map((r, i) => (
                            <tr key={i}>
                                <td style={td}>{r.source_lab}</td>
                                <td style={td}>{r.destination}</td>
                                <td style={td}>{r.trips}</td>
                                <td style={td}>{r.tonnage_mt.toFixed(1)}</td>
                                <td style={td}>{r.avg_net_mt?.toFixed(1) ?? '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Section>

            {/* Two-column: Chemistry + Live Feed */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Section title="Chemistry Snapshot">
                    <ChemistryRow label="Avg Temp" value={chemistry.avg_temp_c}  unit="°C" />
                    <ChemistryRow label="Avg Si"   value={chemistry.avg_si_pct}   unit="%" decimals={3} />
                    <ChemistryRow label="Avg S"    value={chemistry.avg_s_pct}    unit="%" decimals={4} />
                    <div style={{ marginTop: '12px' }}>
                        <div>Out of spec: {chemistry.out_of_spec_count} heats</div>
                        {Object.entries(chemistry.out_of_spec_breakdown).map(([k, v]) =>
                            v > 0 && <div key={k} style={{ fontSize: '12px',
                                                          color: 'hsl(var(--text-muted))' }}>
                                       • {v} {k.replaceAll('_', ' ')}
                                     </div>
                        )}
                    </div>
                </Section>

                <Section title="Live Trip Feed">
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {recent_trips.map(t => (
                            <div key={t.id} style={{ borderBottom: '1px solid hsl(var(--border-color))',
                                                     padding: '8px 0', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span><strong>{t.fleet_id}</strong> {t.source_lab}→{t.destination}</span>
                                    <span style={{ color: 'hsl(var(--text-muted))' }}>
                                        {new Date(t.updated_date).toLocaleTimeString()}
                                    </span>
                                </div>
                                <div style={{ color: 'hsl(var(--text-muted))', fontSize: '11px' }}>
                                    {t.net_weight?.toFixed(0)} MT
                                    {t.temp ? ` · ${t.temp.toFixed(0)}°C` : ''}
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
            </div>
        </div>
    )
}

const KpiCard = ({ label, value, delta, icon }) => (
    <div className="premium-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', textTransform: 'uppercase',
                          color: 'hsl(var(--text-muted))' }}>{label}</span>
            {icon}
        </div>
        <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px' }}>{value}</div>
        {delta != null && (
            <div style={{ fontSize: '12px',
                          color: typeof delta === 'number' && delta < 0
                                 ? 'hsl(var(--danger))' : 'hsl(var(--success))' }}>
                {typeof delta === 'number' ? (delta > 0 ? `+${delta}` : delta) : delta} vs prior
            </div>
        )}
    </div>
)

const Section = ({ title, children }) => (
    <div className="premium-card" style={{ padding: '16px', marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 800,
                     textTransform: 'uppercase', color: 'hsl(var(--text-muted))' }}>{title}</h3>
        {children}
    </div>
)

const ChemistryRow = ({ label, value, unit, decimals = 1 }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
        <span>{label}</span>
        <strong>{value !== null && value !== undefined ? value.toFixed(decimals) : '—'} {unit}</strong>
    </div>
)

const th = { textAlign: 'left', padding: '6px 8px', fontSize: '11px',
             textTransform: 'uppercase', color: 'hsl(var(--text-muted))' }
const td = { padding: '6px 8px', fontSize: '13px',
             borderBottom: '1px solid hsl(var(--border-color))' }

export default PlantLive
```

**Step 2:** Run lint to catch syntax errors.

```bash
cd frontend && ./node_modules/.bin/eslint src/pages/PlantLive.jsx
```

Expected: 0 errors (warnings ok).

**Step 3:** Commit.

```bash
git commit -am "feat(plant-live): new page with KPI strip, flow, chemistry, feed"
```

---

## Task 17: Frontend — register route + sidebar entry

**Files:**
- Modify: `frontend/src/App.jsx` (add `<Route path="/plant" element={<PlantLive />} />` + import)
- Modify: `frontend/src/components/Sidebar.jsx` (add "Plant Live" item with Activity icon, after "Live Tracking")

**Step 1:** App.jsx — find the existing routes block, add:

```jsx
import PlantLive from './pages/PlantLive'
// …
<Route path="/plant" element={<ProtectedRoute><PlantLive /></ProtectedRoute>} />
```

(Match the wrapper used by other routes — likely `<ProtectedRoute>` or similar.)

**Step 2:** Sidebar.jsx — find where "Live Tracking" item is rendered. Add immediately after:

```jsx
<Link to="/plant" className={`sidebar-item ${pathname === '/plant' ? 'active' : ''}`}>
    <Activity size={18} />
    <span>Plant Live</span>
</Link>
```

Add `Activity` to the lucide-react imports if not already present.

**Step 3:** Frontend build sanity-check.

```bash
cd frontend && ./node_modules/.bin/vite build 2>&1 | tail -3
```

Expected: `built in Ns`.

**Step 4:** Commit.

```bash
git commit -am "feat(sidebar): register Plant Live route + sidebar entry"
```

---

## Task 18: Frontend — JSW tab inside `TripManagement.jsx`

**Files:**
- Modify: `frontend/src/pages/TripManagement.jsx`

**Step 1:** Find the existing tab strip definition. Add a 5th option, e.g.:

```jsx
const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'dispatch', label: 'Dispatch Center' },
    { id: 'live',     label: 'Live Monitor' },
    { id: 'history',  label: 'History' },
    { id: 'jsw',      label: 'JSW' },              // <-- NEW
]
```

**Step 2:** Add a new render branch when `activeTab === 'jsw'` that:

- Calls `/api/jsw/trips` with current filter+window state.
- Renders the filter bar (search input, producer chips, consumer chips, shift chips, torpedo dropdown).
- Renders the table (8 columns) with pagination.
- Auto-refreshes every 15 s.

The full JSX is sizable — see the component skeleton below, drop it into `TripManagement.jsx` as a sibling component and render it conditionally.

```jsx
const JswTab = () => {
    const [timeWindow, setTimeWindow] = useState('today')
    const [filters, setFilters] = useState({
        source_lab: 'all', destination: 'all', shift: 'all', fleet_id: 'all',
    })
    const [q, setQ] = useState('')
    const [page, setPage] = useState(1)
    const [data, setData] = useState({ rows: [], total: 0 })

    useEffect(() => {
        let mounted = true
        const fetchData = async () => {
            const params = new URLSearchParams({
                time_window: timeWindow, page: String(page), page_size: '50',
                ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v !== 'all')),
                ...(q ? { q } : {}),
            }).toString()
            try {
                const res = await api.get(`/api/jsw/trips?${params}`)
                if (mounted) setData(res)
            } catch (e) {}
        }
        fetchData()
        const id = setInterval(fetchData, 15000)
        return () => { mounted = false; clearInterval(id) }
    }, [timeWindow, filters, q, page])

    return (
        <div>
            {/* time-window chips */}
            {/* search box */}
            {/* filter chips for source_lab / destination / shift */}
            {/* fleet_id dropdown */}
            {/* table of 8 cols */}
            {/* pagination footer */}
        </div>
    )
}
```

(Filling in the JSX for the chips/table is mechanical — match the visual style of the existing Overview tab. Out-of-spec coloring uses inline style: `color: temp < 1450 || temp > 1530 ? 'hsl(var(--danger))' : 'inherit'`.)

**Step 3:** Verify build.

```bash
cd frontend && ./node_modules/.bin/vite build 2>&1 | tail -3
```

**Step 4:** Commit.

```bash
git commit -am "feat(trip-mgmt): add JSW tab with filter bar + paginated table"
```

---

## Task 19: Handover folder + deploy verification

**Files:**
- Create: `handover/2026-05-08-wbatngl-trip-mirror-sprint/README.md`
- Mirror to that folder: every file changed in Tasks 1-18.

**Step 1:** Create handover directory and README.

```bash
mkdir -p handover/2026-05-08-wbatngl-trip-mirror-sprint
```

README outline:

```markdown
# Handover — Sprint 2: WBATNGL Trip Mirror + Plant Live + JSW Tab

**Date:** 2026-05-08

## Files in this handover
| File | Action | Target |
|------|--------|--------|
| backend/alembic/versions/<rev>_add_wbatngl_trip_mirror.py | NEW | apply via alembic upgrade head |
| backend/database/models.py | REPLACE | extends with WbatnglTripMirror |
| backend/utils/wbatngl_trip_sync.py | NEW | sync job |
| backend/routes/jsw.py | NEW | /api/jsw/trips + /api/jsw/dashboard |
| backend/main.py | REPLACE | registers new sync + new router |
| backend/.env.example | REPLACE | adds WBATNGL_TRIP_SYNC_ENABLED |
| frontend/src/pages/PlantLive.jsx | NEW | new page |
| frontend/src/pages/TripManagement.jsx | REPLACE | adds JSW tab |
| frontend/src/components/Sidebar.jsx | REPLACE | adds Plant Live entry |
| frontend/src/App.jsx | REPLACE | adds /plant route |

## Steps on SMS4

1. Stop backend.
2. Copy all files above to their target paths.
3. `python -m alembic upgrade head` → expect `wbatngl_trip_mirror` created.
4. `INSERT INTO locations (location_name, type, x, y, status, is_visible) VALUES ('RFL', 'consumer', <approx_lat>, <approx_lon>, 'Operating', true);` (manually ask plant for RFL coordinates if needed; else placeholder)
5. Edit `.env`: add `WBATNGL_TRIP_SYNC_ENABLED=true`.
6. One-shot backfill: `python -m backend.utils.wbatngl_trip_sync --backfill-days=30` → expect ~30 k rows + summary.
7. `SELECT count(*) FROM wbatngl_trip_mirror;` matches log.
8. Restart backend; expect `WBATNGL trip sync scheduled every 60s` in startup log.
9. After 60s, expect another log line: `WBATNGL trip sync OK: fetched=N upserted=M`.
10. Hard-refresh browser. Open `/trips` → click JSW tab. Open `/plant`. Verify both render.

## Rollback
1. `WBATNGL_TRIP_SYNC_ENABLED=false`, restart backend → cron stops.
2. `DROP TABLE wbatngl_trip_mirror;` if you want to free space.
3. Revert frontend files; sidebar entry disappears.
4. Manual trip-entry flow continues unaffected throughout.
```

**Step 2:** Mirror files (use existing `handover/` workflow patterns).

```bash
# bash one-liner with all paths
for f in backend/database/models.py backend/utils/wbatngl_trip_sync.py \
         backend/routes/jsw.py backend/main.py backend/.env.example \
         frontend/src/pages/PlantLive.jsx frontend/src/pages/TripManagement.jsx \
         frontend/src/components/Sidebar.jsx frontend/src/App.jsx; do
    target="handover/2026-05-08-wbatngl-trip-mirror-sprint/$f"
    mkdir -p "$(dirname "$target")"
    cp "$f" "$target"
done
cp backend/alembic/versions/<rev>_add_wbatngl_trip_mirror.py \
   handover/2026-05-08-wbatngl-trip-mirror-sprint/backend/alembic/versions/
```

**Step 3:** Commit.

```bash
git add handover/2026-05-08-wbatngl-trip-mirror-sprint/
git commit -m "docs(handover): Sprint 2 deploy bundle for SMS4"
```

**Step 4:** Push.

```bash
git push origin main
```

---

## Final verification (on SMS4)

After all 18 tasks merged:

1. Pull latest, follow the Handover README exactly.
2. Backfill produces ~30 k rows.
3. Wait 60 s — see one new sync tick log line.
4. Open `/plant` → expect 4 sections populated; KPI strip shows real numbers.
5. Open `/trips` → click **JSW** tab → expect filtered rows, working chips, pagination.
6. Sanity check: `/` (Live Tracking page) still works, drawer still works, capacities still show.

## Rollback path

`WBATNGL_TRIP_SYNC_ENABLED=false` → restart backend → recurring sync stops.
Drop the table to reclaim disk: `DROP TABLE wbatngl_trip_mirror;`.
Revert frontend files: sidebar entry + JSW tab disappear; rest of HMD untouched.

---

## Update changes_tracker.md after each commit

The existing project workflow logs every change in [changes_tracker.md](../../changes_tracker.md). After Task 19 finishes, add rows 52-N with one entry per Task. Each row format: `# | timestamp | file | previous | new | issue | cause | fix`. Reference design doc for context.

---

## Skills used

- `superpowers:brainstorming` — produced [the design doc](2026-05-08-wbatngl-trip-mirror-design.md).
- `superpowers:writing-plans` — produced this implementation plan.
- `superpowers:executing-plans` — for executing this plan task-by-task.
- `superpowers:test-driven-development` — applied throughout (failing test → implementation → green test → commit).
- `superpowers:verification-before-completion` — for the SMS4 deploy verify at end.
