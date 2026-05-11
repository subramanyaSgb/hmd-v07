# Operations Live + Trip History (Live) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build two new pages — `/operations-live` (single live cockpit) and `/trip-history-live` (paginated trip list with click-to-expand horizontal-stepper timeline) — combining all 3 JSW data sources, with zero touches to existing pages.

**Architecture:** New HTS sync mirrors the existing WBATNGL trip-sync pattern. New Postgres table `hts_heat_mirror` + view `v_trip_heat_story` (left-joining trips to heats on torpedo_no + ±15/+90 min time window). Three new API endpoints under `/api/operations-live/*` and `/api/trip-history-live/*`. Two new React pages reusing existing premium-card / overlay-glass-box style.

**Tech Stack:** Python 3.10+, FastAPI, SQLAlchemy ORM, Alembic, oracledb (thick mode), APScheduler, pytest. React 19 + Vite 7, Recharts, react-router v7.

**Design document:** [`docs/plans/2026-05-11-operations-live-design.md`](2026-05-11-operations-live-design.md) — read first for full architecture context.

**Branch:** `sprint-3-operations-live` off `sprint-2-wbatngl-trip-mirror`.

---

## Pre-implementation checklist

Before Task 1.1, verify:

- [ ] HTS env vars present in SMS4 `.env` (verified 11-May; `HTS_USER=ICT_IFACE`, `HTS_PASSWORD=ICTIFACE`, `HTS_SERVICE=JVMLPROD.JSW.IN`)
- [ ] HTS connectivity confirmed via `test_all_db_connections.py` (verified 11-May — all 3 PASS)
- [ ] On `sprint-2-wbatngl-trip-mirror` branch with clean working tree
- [ ] Backend tests currently passing: `pytest backend/` baseline green

If any unchecked → fix before starting.

---

# Phase 1 — HTS Sync Backend  (target: 0.5 day, ~16 tasks)

Goal of Phase 1: HTS data flowing into local Postgres mirror table, queryable, with zero impact on existing functionality. By end of Phase 1, `SELECT COUNT(*) FROM hts_heat_mirror` returns rows and `MAX(synced_at)` advances every 5 minutes when feed is alive.

---

### Task 1.1: Create the feature branch

**Files:**
- Modify: git branch only

**Step 1:** Confirm on parent branch with clean tree

Run: `git status`
Expected: `On branch sprint-2-wbatngl-trip-mirror` and `nothing to commit, working tree clean` (or only the harmless `package-lock.json` modifications).

**Step 2:** Create and switch to the feature branch

Run: `git checkout -b sprint-3-operations-live`
Expected: `Switched to a new branch 'sprint-3-operations-live'`

**Step 3:** Push the branch upstream to both remotes

Run:
```bash
git push -u new-origin sprint-3-operations-live
git push -u origin sprint-3-operations-live
```
Expected: branch tracking set up on both remotes.

---

### Task 1.2: Alembic migration — create `hts_heat_mirror` table

**Files:**
- Create: `backend/alembic/versions/<auto-id>_add_hts_heat_mirror.py`

**Step 1:** Generate the migration skeleton

Run: `cd backend && python -m alembic revision -m "add hts_heat_mirror table"`
Expected: new file in `backend/alembic/versions/` created, prints the file path.

**Step 2:** Write the migration body

Replace the auto-generated `upgrade()` and `downgrade()` with:

```python
def upgrade():
    op.create_table(
        'hts_heat_mirror',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('heat_no', sa.String(20), nullable=False, unique=True),
        sa.Column('converter_no', sa.String(1)),
        sa.Column('sms', sa.String(10)),
        sa.Column('torpedo_no', sa.String(15)),
        sa.Column('torpedo_no_raw', sa.String(15)),
        sa.Column('hotmetal_qty', sa.Numeric(10, 3)),
        sa.Column('torpedo_qty', sa.Numeric(10, 3)),
        sa.Column('torpedo_in_time', sa.DateTime),
        sa.Column('torpedo_out_time', sa.DateTime),
        sa.Column('converter_life', sa.Integer),
        sa.Column('synced_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_hts_heat_mirror_torpedo_in_time',
                    'hts_heat_mirror', ['torpedo_in_time'])
    op.create_index('ix_hts_heat_mirror_torpedo_out_time',
                    'hts_heat_mirror', ['torpedo_out_time'])
    op.create_index('ix_hts_heat_mirror_torpedo_no_in_time',
                    'hts_heat_mirror', ['torpedo_no', 'torpedo_in_time'])


def downgrade():
    op.drop_index('ix_hts_heat_mirror_torpedo_no_in_time')
    op.drop_index('ix_hts_heat_mirror_torpedo_out_time')
    op.drop_index('ix_hts_heat_mirror_torpedo_in_time')
    op.drop_table('hts_heat_mirror')
```

**Step 3:** Verify the migration applies clean against a SQLite test DB (we don't need Postgres for the schema-validity check)

Run: `python -m pytest backend/tests/test_health.py -v`
Expected: passes (this exercises `init_db` which creates all ORM tables in SQLite for the test session).

**Step 4:** Commit

```bash
git add backend/alembic/versions/<auto-id>_add_hts_heat_mirror.py
git commit -m "feat(hts): alembic migration — create hts_heat_mirror table"
```

---

### Task 1.3: Alembic migration — create `v_trip_heat_story` view

**Files:**
- Create: `backend/alembic/versions/<auto-id>_add_v_trip_heat_story.py`

**Step 1:** Generate the migration

Run: `cd backend && python -m alembic revision -m "add v_trip_heat_story view"`

**Step 2:** Write the migration body

```python
def upgrade():
    op.execute("""
        CREATE OR REPLACE VIEW v_trip_heat_story AS
        SELECT
            t.trip_id, t.fleet_id AS torpedo_no, t.source_lab, t.destination,
            t.net_weight, t.first_tare_time, t.out_date, t.closetime,
            t.temp, t.s_l, t.si_l, t.shift,
            h.heat_no, h.converter_no, h.sms, h.hotmetal_qty,
            h.torpedo_in_time, h.torpedo_out_time, h.converter_life
        FROM wbatngl_trip_mirror t
        LEFT JOIN hts_heat_mirror h
            ON h.torpedo_no = t.fleet_id
            AND h.torpedo_in_time BETWEEN
                t.closetime - INTERVAL '15 minutes'
                AND t.closetime + INTERVAL '90 minutes'
    """)


def downgrade():
    op.execute("DROP VIEW IF EXISTS v_trip_heat_story")
```

**Step 3:** Commit

```bash
git add backend/alembic/versions/<auto-id>_add_v_trip_heat_story.py
git commit -m "feat(hts): alembic migration — v_trip_heat_story view"
```

---

### Task 1.4: Add `HtsHeatMirror` ORM model

**Files:**
- Modify: `backend/database/models.py` — add new class after `WbatnglTripMirror`

**Step 1:** Add the model class. Place it immediately after the `WbatnglTripMirror` class definition:

```python
class HtsHeatMirror(Base):
    """
    Mirror of HTS.VW_HTS_HOTMETAL_DATA from JSW Oracle HTS DB.
    Populated by hts_sync.py every 5 minutes.

    HEAT_NO is the natural primary key (confirmed unique in 11-May inventory:
    123 distinct heat_nos / 123 rows). One torpedo can pour to multiple
    heats — see HTS sample rows where TLC-22 fed both E2030590 and G2030594.
    """
    __tablename__ = "hts_heat_mirror"

    id = Column(Integer, primary_key=True)
    heat_no = Column(String(20), unique=True, nullable=False, index=True)
    converter_no = Column(String(1))
    sms = Column(String(10))                # Hari's new column once shipped
    torpedo_no = Column(String(15), index=True)        # normalized "TLC-22"
    torpedo_no_raw = Column(String(15))                # original "22"
    hotmetal_qty = Column(Numeric(10, 3))
    torpedo_qty = Column(Numeric(10, 3))
    torpedo_in_time = Column(DateTime, index=True)
    torpedo_out_time = Column(DateTime, index=True)
    converter_life = Column(Integer)
    synced_at = Column(DateTime, server_default=func.now())
```

**Step 2:** Verify it imports clean

Run: `python -c "from backend.database.models import HtsHeatMirror; print(HtsHeatMirror.__tablename__)"`
Expected: prints `hts_heat_mirror`.

**Step 3:** Commit

```bash
git add backend/database/models.py
git commit -m "feat(hts): HtsHeatMirror ORM model"
```

---

### Task 1.5: Write failing test — `normalize_torpedo_no`

**Files:**
- Create: `backend/tests/test_hts_sync.py`

**Step 1:** Create the test file with the first failing test:

```python
"""Tests for backend.utils.hts_sync."""
import pytest

from backend.utils.hts_sync import normalize_torpedo_no


class TestNormalizeTorpedoNo:
    @pytest.mark.parametrize("raw, expected", [
        ("22",      "TLC-22"),
        ("07",      "TLC-07"),
        ("1",       "TLC-01"),
        ("53",      "TLC-53"),
        (" 22 ",    "TLC-22"),       # whitespace tolerant
        ("",        None),
        (None,      None),
        ("abc",     None),            # non-numeric
        ("99",      "TLC-99"),        # accept any 2-digit (validation elsewhere)
    ])
    def test_normalize_handles_all_observed_forms(self, raw, expected):
        assert normalize_torpedo_no(raw) == expected
```

**Step 2:** Run to confirm it fails

Run: `pytest backend/tests/test_hts_sync.py::TestNormalizeTorpedoNo -v`
Expected: `ImportError` or `ModuleNotFoundError: No module named 'backend.utils.hts_sync'`.

---

### Task 1.6: Implement `normalize_torpedo_no`

**Files:**
- Create: `backend/utils/hts_sync.py`

**Step 1:** Create the file with module docstring and the function:

```python
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
```

**Step 2:** Run the tests

Run: `pytest backend/tests/test_hts_sync.py::TestNormalizeTorpedoNo -v`
Expected: 9 passed.

**Step 3:** Commit

```bash
git add backend/tests/test_hts_sync.py backend/utils/hts_sync.py
git commit -m "feat(hts): normalize_torpedo_no + tests"
```

---

### Task 1.7: Write failing test — `row_to_mirror_dict`

**Files:**
- Modify: `backend/tests/test_hts_sync.py` — add new test class

**Step 1:** Append to the test file:

```python
from backend.utils.hts_sync import row_to_mirror_dict


# Schema matching HTS.VW_HTS_HOTMETAL_DATA (8 cols)
HTS_COLS = [
    "CONVERTER_NO", "HEAT_NO", "HOTMETAL_QTY", "TORPEDO_NO",
    "TORPEDO_IN_TIME", "TORPEDO_OUT_TIME", "TORPEDO_QTY", "CONVERTER_LIFE",
]

# Sample row (mirrors what we saw in check_hts_freshness output 11-May)
import datetime as _dt
SAMPLE_ROW = (
    "D",                                    # CONVERTER_NO
    "D2030595",                             # HEAT_NO
    126.146,                                # HOTMETAL_QTY
    "45",                                   # TORPEDO_NO
    _dt.datetime(2026, 4, 1, 17, 38, 14),   # TORPEDO_IN_TIME
    _dt.datetime(2026, 4, 1, 18, 14, 3),    # TORPEDO_OUT_TIME
    369.6,                                  # TORPEDO_QTY
    354,                                    # CONVERTER_LIFE
)


class TestRowToMirrorDict:
    def test_typical_row_maps_all_fields(self):
        d = row_to_mirror_dict(SAMPLE_ROW, HTS_COLS)
        assert d["heat_no"] == "D2030595"
        assert d["converter_no"] == "D"
        assert d["torpedo_no"] == "TLC-45"           # normalized
        assert d["torpedo_no_raw"] == "45"           # preserved
        assert d["hotmetal_qty"] == 126.146
        assert d["torpedo_qty"] == 369.6
        assert d["torpedo_in_time"] == _dt.datetime(2026, 4, 1, 17, 38, 14)
        assert d["torpedo_out_time"] == _dt.datetime(2026, 4, 1, 18, 14, 3)
        assert d["converter_life"] == 354
        # sms is null until Hari ships the column — must be tolerated
        assert d.get("sms") is None

    def test_unparseable_torpedo_returns_none_dict(self):
        bad = list(SAMPLE_ROW)
        bad[3] = "garbage"           # TORPEDO_NO position
        d = row_to_mirror_dict(tuple(bad), HTS_COLS)
        # Row is still mapped, but torpedo_no is None (filter upstream if needed)
        assert d["torpedo_no"] is None
        assert d["torpedo_no_raw"] == "garbage"

    def test_missing_heat_no_returns_none(self):
        bad = list(SAMPLE_ROW)
        bad[1] = None
        d = row_to_mirror_dict(tuple(bad), HTS_COLS)
        # heat_no is the natural PK — None means skip this row
        assert d is None

    def test_sms_column_when_present(self):
        cols = HTS_COLS + ["SMS"]
        row = SAMPLE_ROW + ("SMS3",)
        d = row_to_mirror_dict(row, cols)
        assert d["sms"] == "SMS3"
```

**Step 2:** Run to confirm fails

Run: `pytest backend/tests/test_hts_sync.py::TestRowToMirrorDict -v`
Expected: `ImportError: cannot import name 'row_to_mirror_dict'`.

---

### Task 1.8: Implement `row_to_mirror_dict`

**Files:**
- Modify: `backend/utils/hts_sync.py`

**Step 1:** Add the function:

```python
def row_to_mirror_dict(row: tuple, cols: list[str]) -> Optional[dict]:
    """
    Map an Oracle row tuple to a dict shaped for hts_heat_mirror UPSERT.
    Returns None if heat_no (the natural PK) is missing.
    """
    r = dict(zip(cols, row))
    heat_no = r.get("HEAT_NO")
    if not heat_no:
        return None
    raw_torpedo = r.get("TORPEDO_NO")
    return {
        "heat_no": heat_no,
        "converter_no": (r.get("CONVERTER_NO") or "").strip() or None,
        "sms": (r.get("SMS") or "").strip() or None if r.get("SMS") else None,
        "torpedo_no": normalize_torpedo_no(raw_torpedo),
        "torpedo_no_raw": str(raw_torpedo) if raw_torpedo is not None else None,
        "hotmetal_qty": r.get("HOTMETAL_QTY"),
        "torpedo_qty": r.get("TORPEDO_QTY"),
        "torpedo_in_time": r.get("TORPEDO_IN_TIME"),
        "torpedo_out_time": r.get("TORPEDO_OUT_TIME"),
        "converter_life": r.get("CONVERTER_LIFE"),
    }
```

**Step 2:** Run

Run: `pytest backend/tests/test_hts_sync.py::TestRowToMirrorDict -v`
Expected: 4 passed.

**Step 3:** Commit

```bash
git add backend/utils/hts_sync.py backend/tests/test_hts_sync.py
git commit -m "feat(hts): row_to_mirror_dict + tests"
```

---

### Task 1.9: Write failing test — `upsert_rows`

**Files:**
- Modify: `backend/tests/test_hts_sync.py` — new class

**Step 1:** Append:

```python
from backend.utils.hts_sync import upsert_rows


class TestUpsertRows:
    def test_insert_new_rows(self, db_session):
        rows = [row_to_mirror_dict(SAMPLE_ROW, HTS_COLS)]
        n = upsert_rows(db_session, rows)
        assert n == 1
        # Verify it landed
        from backend.database.models import HtsHeatMirror
        got = db_session.query(HtsHeatMirror).filter_by(heat_no="D2030595").first()
        assert got is not None
        assert got.torpedo_no == "TLC-45"
        assert got.hotmetal_qty == 126.146

    def test_upsert_updates_existing(self, db_session):
        rows = [row_to_mirror_dict(SAMPLE_ROW, HTS_COLS)]
        upsert_rows(db_session, rows)

        # Now upsert the same heat_no with a changed value
        modified = list(SAMPLE_ROW)
        modified[2] = 200.0       # HOTMETAL_QTY changed
        rows2 = [row_to_mirror_dict(tuple(modified), HTS_COLS)]
        upsert_rows(db_session, rows2)

        from backend.database.models import HtsHeatMirror
        got = db_session.query(HtsHeatMirror).filter_by(heat_no="D2030595").one()
        assert got.hotmetal_qty == 200.0   # updated
        # synced_at should advance on UPDATE too (same pattern as wbatngl)
        # (synced_at assertion would need timing precision; skip exact check)

    def test_empty_input_is_noop(self, db_session):
        assert upsert_rows(db_session, []) == 0

    def test_none_rows_are_filtered(self, db_session):
        # row_to_mirror_dict returns None for bad rows; upsert must tolerate
        rows = [None, row_to_mirror_dict(SAMPLE_ROW, HTS_COLS), None]
        n = upsert_rows(db_session, rows)
        assert n == 1
```

**Step 2:** Run, confirm fails

Run: `pytest backend/tests/test_hts_sync.py::TestUpsertRows -v`
Expected: `ImportError: cannot import name 'upsert_rows'`.

---

### Task 1.10: Implement `upsert_rows`

**Files:**
- Modify: `backend/utils/hts_sync.py`

**Step 1:** Add imports near top of file:

```python
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database.models import HtsHeatMirror
from ..logger import logger

UPSERT_CHUNK_SIZE = 500
```

**Step 2:** Add the function. Pattern is identical to `wbatngl_trip_sync.upsert_rows` — copy that pattern but for `HtsHeatMirror` and conflict-target `heat_no`:

```python
def upsert_rows(db: Session, rows: list) -> int:
    """
    UPSERT a batch of mirror dicts into hts_heat_mirror.
    Conflict target: heat_no (unique).
    synced_at is bumped to NOW() on every upsert (insert OR update) so the
    UI's "last sync" label reflects sync activity (see wbatngl_trip_sync
    upsert_rows for the same pattern + rationale).

    Filters out None values (row_to_mirror_dict returns None for invalid rows).
    """
    rows = [r for r in rows if r is not None]
    if not rows:
        return 0

    update_cols = [
        c.name for c in HtsHeatMirror.__table__.columns
        if c.name not in ("id", "heat_no", "synced_at")
    ]

    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as dialect_insert
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert as dialect_insert
    else:
        raise RuntimeError(f"upsert_rows: unsupported dialect {dialect!r}")

    persisted = 0
    for i in range(0, len(rows), UPSERT_CHUNK_SIZE):
        chunk = rows[i:i + UPSERT_CHUNK_SIZE]
        stmt = dialect_insert(HtsHeatMirror).values(chunk)
        set_dict = {col: stmt.excluded[col] for col in update_cols}
        set_dict["synced_at"] = func.now()
        stmt = stmt.on_conflict_do_update(
            index_elements=["heat_no"],
            set_=set_dict,
        )
        db.execute(stmt)
        persisted += len(chunk)
    db.commit()
    return persisted
```

**Step 3:** Run

Run: `pytest backend/tests/test_hts_sync.py::TestUpsertRows -v`
Expected: 4 passed.

**Step 4:** Commit

```bash
git add backend/utils/hts_sync.py backend/tests/test_hts_sync.py
git commit -m "feat(hts): upsert_rows with synced_at bump + tests"
```

---

### Task 1.11: Write failing test — `watermark_for_view`

**Files:**
- Modify: `backend/tests/test_hts_sync.py` — new class

**Step 1:** Append:

```python
from backend.utils.hts_sync import watermark_for_view, _WATERMARK_FLOOR
import datetime as _dt


class TestWatermark:
    def test_empty_mirror_returns_floor(self, db_session):
        wm = watermark_for_view(db_session)
        assert wm == _WATERMARK_FLOOR

    def test_returns_max_torpedo_in_time(self, db_session):
        # Seed two rows
        upsert_rows(db_session, [
            row_to_mirror_dict(SAMPLE_ROW, HTS_COLS),
        ])
        # second row, later timestamp
        later = list(SAMPLE_ROW)
        later[1] = "D2030600"      # different heat_no
        later[4] = _dt.datetime(2026, 4, 1, 20, 0, 0)
        upsert_rows(db_session, [row_to_mirror_dict(tuple(later), HTS_COLS)])

        wm = watermark_for_view(db_session)
        assert wm == _dt.datetime(2026, 4, 1, 20, 0, 0)
```

**Step 2:** Run, confirm fails

Run: `pytest backend/tests/test_hts_sync.py::TestWatermark -v`
Expected: ImportError.

---

### Task 1.12: Implement `watermark_for_view`

**Files:**
- Modify: `backend/utils/hts_sync.py`

**Step 1:** Add datetime import + function:

```python
from datetime import datetime

_WATERMARK_FLOOR = datetime(1970, 1, 1)


def watermark_for_view(db: Session) -> datetime:
    """
    Return MAX(torpedo_in_time) from hts_heat_mirror, or the epoch floor
    if empty. Used as the WHERE > value in the next incremental pull.
    """
    result = db.execute(
        select(func.max(HtsHeatMirror.torpedo_in_time))
    ).scalar()
    return result or _WATERMARK_FLOOR
```

**Step 2:** Run

Run: `pytest backend/tests/test_hts_sync.py::TestWatermark -v`
Expected: 2 passed.

**Step 3:** Commit

```bash
git add backend/utils/hts_sync.py backend/tests/test_hts_sync.py
git commit -m "feat(hts): watermark_for_view + tests"
```

---

### Task 1.13: Write failing test — `pull_and_upsert`

**Files:**
- Modify: `backend/tests/test_hts_sync.py`

**Step 1:** Append (this test mocks the Oracle cursor since we cannot connect from CI):

```python
from unittest.mock import MagicMock
from backend.utils.hts_sync import pull_and_upsert


class TestPullAndUpsert:
    def test_fetches_rows_and_returns_stats(self, db_session):
        cur = MagicMock()
        # Simulate Oracle returning two rows with the same column ordering
        cur.description = [(c, None, None, None, None, None, None) for c in HTS_COLS]
        cur.fetchall.return_value = [SAMPLE_ROW]

        from datetime import datetime as dt
        wm = dt(1970, 1, 1)
        stats = pull_and_upsert(db_session, cur, watermark=wm)

        # Verify Oracle was queried with the right SQL fragment
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
        bad[1] = None       # HEAT_NO
        cur.fetchall.return_value = [tuple(bad), SAMPLE_ROW]

        stats = pull_and_upsert(db_session, cur, watermark=_WATERMARK_FLOOR)
        assert stats["fetched"] == 2
        assert stats["upserted"] == 1
        assert stats["skipped_no_heat_no"] == 1
```

**Step 2:** Run, confirm fails

Run: `pytest backend/tests/test_hts_sync.py::TestPullAndUpsert -v`

---

### Task 1.14: Implement `pull_and_upsert` + `run_once` + `_connect_oracle`

**Files:**
- Modify: `backend/utils/hts_sync.py`

**Step 1:** Add the three functions. The Oracle-connect logic mirrors `wbatngl_trip_sync._connect_oracle` (copy that pattern). The `run_once` is shorter than WBATNGL's because we have only one source table (HTS view).

```python
import os
from datetime import timedelta


def _ensure_thick_mode(client_dir: str) -> bool:
    """Idempotent oracledb thick-mode init. Same pattern as wbatngl_trip_sync."""
    if not os.path.isdir(client_dir):
        logger.warning(f"HTS: Oracle Instant Client not found at {client_dir}")
        return False
    try:
        import oracledb
        oracledb.init_oracle_client(lib_dir=client_dir)
        return True
    except Exception as e:
        if "DPI-1047" in str(e) or "already" in str(e).lower():
            return True
        logger.warning(f"HTS: thick-mode init failed: {e}")
        return False


def _connect_oracle():
    """Open an HTS Oracle connection."""
    cfg = {
        "host":     os.getenv("HTS_HOST", "10.10.70.227"),
        "port":     int(os.getenv("HTS_PORT", "1522")),
        "user":     os.getenv("HTS_USER", "ICT_IFACE"),
        "password": os.getenv("HTS_PASSWORD", ""),
        "service":  os.getenv("HTS_SERVICE", "JVMLPROD.JSW.IN"),
        "client":   os.getenv("ORACLE_INSTANT_CLIENT_DIR",
                              r"C:\oracle\instantclient_23_0"),
    }
    if not cfg["password"]:
        raise RuntimeError("HTS_PASSWORD not set")
    import oracledb
    _ensure_thick_mode(cfg["client"])
    return oracledb.connect(
        user=cfg["user"], password=cfg["password"],
        dsn=f"{cfg['host']}:{cfg['port']}/{cfg['service']}",
    )


def pull_and_upsert(db: Session, cursor, watermark: datetime) -> dict:
    """
    Run the incremental SELECT against HTS view, upsert into mirror.
    Returns stats dict: fetched / upserted / skipped_no_heat_no / errors.
    """
    view = os.getenv("HTS_VIEW", "HTS.VW_HTS_HOTMETAL_DATA")
    sql = f"SELECT * FROM {view} WHERE TORPEDO_IN_TIME > :wm"
    cursor.execute(sql, wm=watermark)
    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]

    stats = {"fetched": len(rows), "upserted": 0,
             "skipped_no_heat_no": 0, "errors": 0}

    mirror_rows = []
    for r in rows:
        try:
            d = row_to_mirror_dict(r, cols)
        except Exception:
            logger.exception(f"row_to_mirror_dict failed for {r!r}")
            stats["errors"] += 1
            continue
        if d is None:
            stats["skipped_no_heat_no"] += 1
            continue
        mirror_rows.append(d)

    stats["upserted"] = upsert_rows(db, mirror_rows)
    return stats


def run_once() -> dict:
    """
    One scheduler tick. Pulls all heat rows newer than the local
    watermark, UPSERTs into hts_heat_mirror.
    Returns aggregated stats, or {"error": "..."} on Oracle failure.
    """
    from ..database.engine import SessionLocal

    logger.info("HTS sync: starting")

    try:
        conn = _connect_oracle()
    except Exception as e:
        logger.exception(f"HTS connect failed: {e}")
        return {"error": str(e)}

    db = SessionLocal()
    try:
        cur = conn.cursor()
        wm = watermark_for_view(db)
        stats = pull_and_upsert(db, cur, wm)
        logger.info(
            f"HTS sync OK: fetched={stats['fetched']} "
            f"upserted={stats['upserted']} "
            f"skipped={stats['skipped_no_heat_no']} "
            f"errors={stats['errors']} watermark_was={wm}"
        )
        cur.close()
    finally:
        db.close()
        try:
            conn.close()
        except Exception:
            pass
    return stats


if __name__ == "__main__":
    print(run_once())
```

**Step 2:** Run

Run: `pytest backend/tests/test_hts_sync.py::TestPullAndUpsert -v`
Expected: 2 passed.

**Step 3:** Run the full test file

Run: `pytest backend/tests/test_hts_sync.py -v`
Expected: all tests passed (normalize: 9, row_to_mirror_dict: 4, upsert: 4, watermark: 2, pull_and_upsert: 2 = 21 total).

**Step 4:** Commit

```bash
git add backend/utils/hts_sync.py backend/tests/test_hts_sync.py
git commit -m "feat(hts): pull_and_upsert + run_once + Oracle connect + tests"
```

---

### Task 1.15: Wire HTS sync into APScheduler

**Files:**
- Modify: `backend/main.py` — add `schedule_hts_sync()` and invoke from startup

**Step 1:** Read the existing `schedule_wbatngl_trip_sync` block to find the right place to add the new scheduler. The new one follows the same pattern.

Run: `grep -n "schedule_wbatngl_trip_sync\|WBATNGL_TRIP_SYNC_ENABLED" backend/main.py`

**Step 2:** Add `schedule_hts_sync()` immediately after `schedule_wbatngl_trip_sync()`. Pattern:

```python
def schedule_hts_sync(scheduler):
    """
    APScheduler hook for HTS sync. Pulls heat-pour rows from
    HTS.VW_HTS_HOTMETAL_DATA every HTS_SYNC_INTERVAL_SECONDS into the local
    hts_heat_mirror table. Gated by HTS_SYNC_ENABLED=true.
    """
    if os.getenv("HTS_SYNC_ENABLED", "false").lower() != "true":
        logger.info("HTS sync disabled (HTS_SYNC_ENABLED=false)")
        return

    from .utils.hts_sync import run_once as hts_run_once

    interval = int(os.getenv("HTS_SYNC_INTERVAL_SECONDS", "300"))

    async def _hts_tick():
        await asyncio.to_thread(hts_run_once)

    scheduler.add_job(
        _hts_tick,
        trigger=IntervalTrigger(seconds=interval),
        id="hts_sync",
        name="HTS Heat Mirror Sync",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    logger.info(f"HTS sync scheduled (interval={interval}s)")
```

**Step 3:** Invoke from the startup block where the other schedulers are invoked. Find the line that calls `schedule_wbatngl_trip_sync(scheduler)` and add `schedule_hts_sync(scheduler)` on the next line.

**Step 4:** Smoke-test import

Run: `python -c "from backend.main import app; print('OK')"`
Expected: prints `OK` (or warns about DB, which is unrelated).

**Step 5:** Commit

```bash
git add backend/main.py
git commit -m "feat(hts): wire HTS sync into APScheduler"
```

---

### Task 1.16: Confirm `.env.example` is current

**Files:**
- Read: `backend/.env.example` — already has the HTS block from 11-May (verify it's still present)

**Step 1:**

Run: `grep -A 8 "HTS Oracle" backend/.env.example`
Expected: the existing HTS block shows up. If missing, restore from `handover/2026-05-11-hts-unblock/backend/.env.example`.

No code change. No commit unless missing.

---

### Task 1.17: Full backend test run

**Step 1:** Run the full backend test suite to confirm no regressions in existing tests

Run: `pytest backend/ -v --tb=short 2>&1 | tail -30`
Expected: all green. Existing tests should still pass (~62 known passing on `sprint-2-...`). New `test_hts_sync.py` adds 21 more → ~83 passing.

**Step 2:** If anything fails that wasn't failing before — investigate before proceeding.

No code change. No commit.

---

### Task 1.18: Update `changes_tracker.md`

**Files:**
- Modify: `Development/Version_07/changes_tracker.md`

**Step 1:** Append a row to the table (entry #59 — next number after the 11-May entries):

```markdown
| 59 | 2026-05-12 ... | backend/utils/hts_sync.py + backend/database/models.py + 2 alembic migrations + scheduler hook + tests | (did not exist) | Phase 1 of operations-live sprint: HTS sync into hts_heat_mirror PG table every 5 min (gated by HTS_SYNC_ENABLED). New HtsHeatMirror ORM. New v_trip_heat_story view (LEFT JOIN wbatngl_trip_mirror ↔ hts_heat_mirror on torpedo_no + ±15/+90 min window). 21 new tests | Need HTS data in HMD for the new operations-live + trip-history-live pages | Per design doc 2026-05-11-operations-live-design.md | Same pattern as wbatngl_trip_sync. synced_at-on-update fix applied from #52. Heat_no is natural PK (confirmed unique 123/123 in 11-May inventory). HTS_SYNC_ENABLED defaults false; flip true after Hari's live feed lands |
```

(Pre-set the timestamp to whatever real date Phase 1 lands.)

**Step 2:** Commit

```bash
git add Development/Version_07/changes_tracker.md
git commit -m "docs(tracker): #59 — Phase 1 HTS sync backend"
```

---

### Task 1.19: Push everything + handover folder

**Files:**
- Create: `handover/<YYYY-MM-DD>-operations-live-phase-1/...` mirroring new files

**Step 1:** Push to both remotes

```bash
git push new-origin sprint-3-operations-live
git push origin sprint-3-operations-live
```

**Step 2:** Create handover folder mirror (same pattern as previous handovers):

```bash
mkdir -p handover/2026-05-12-operations-live-phase-1/backend/utils
mkdir -p handover/2026-05-12-operations-live-phase-1/backend/database
mkdir -p handover/2026-05-12-operations-live-phase-1/backend/alembic/versions
mkdir -p handover/2026-05-12-operations-live-phase-1/backend/tests

cp Development/Version_07/backend/utils/hts_sync.py handover/2026-05-12-operations-live-phase-1/backend/utils/
cp Development/Version_07/backend/database/models.py handover/2026-05-12-operations-live-phase-1/backend/database/
cp Development/Version_07/backend/alembic/versions/<hts-mirror-migration>.py handover/2026-05-12-operations-live-phase-1/backend/alembic/versions/
cp Development/Version_07/backend/alembic/versions/<view-migration>.py handover/2026-05-12-operations-live-phase-1/backend/alembic/versions/
cp Development/Version_07/backend/main.py handover/2026-05-12-operations-live-phase-1/backend/
cp Development/Version_07/backend/tests/test_hts_sync.py handover/2026-05-12-operations-live-phase-1/backend/tests/
```

**Step 3:** Write the handover README — same format as `handover/2026-05-11-hts-unblock/README.md`. Cover: Phase 1 deliverable, files changed, deploy steps (pull → alembic upgrade → restart backend → flip `HTS_SYNC_ENABLED=true`), verification (`SELECT COUNT(*) FROM hts_heat_mirror;` after one sync tick).

**Step 4:** Commit

```bash
git add handover/2026-05-12-operations-live-phase-1/
git commit -m "handover: Phase 1 operations-live (HTS sync backend)"
git push new-origin sprint-3-operations-live
git push origin sprint-3-operations-live
```

---

### Task 1.20: SMS4 deploy + verify

**On SMS4 PC:**

```cmd
cd C:\Users\v_subramanya.gopal\Desktop\HMD
git fetch
git checkout sprint-3-operations-live
git pull

.venv\Scripts\activate.bat

# Apply both alembic migrations
cd backend
python -m alembic upgrade head
cd ..

# Flip flag in .env (just this one line)
# Open backend\.env, change HTS_SYNC_ENABLED=false to =true, save

# Restart backend (stop existing uvicorn, start again — pattern in app.bat)
```

**Verify:**

```cmd
python -c "from dotenv import load_dotenv; import os; load_dotenv('backend/.env'); print(os.getenv('HTS_SYNC_ENABLED'))"
```
Expected: `true`

After 5 minutes, check PG:
```sql
SELECT COUNT(*), MIN(torpedo_in_time), MAX(torpedo_in_time), MAX(synced_at)
FROM hts_heat_mirror;
```
Expected: 123 rows (the frozen sample) + whatever has come in via Hari's live feed if it's live.

Backend log should show: `HTS sync OK: fetched=N upserted=N skipped=0 errors=0 watermark_was=...`

**End of Phase 1.**

---

# Phase 2 — API endpoints  (target: 1.0 day)

*Phase 2 detailed task plan will be written after Phase 1 deploys and verifies clean.*

High-level checkpoints:

- **2.1** Create `backend/routes/operations.py` skeleton with router + dependency wiring
- **2.2** Test + implement `GET /api/operations-live/dashboard` returning consolidated payload (5 KPIs + 6 converter cards + active trips + activity feed)
- **2.3** Test + implement `GET /api/trip-history-live` with all filter params + pagination
- **2.4** Test + implement `GET /api/trip-history-live/:trip_id` (single trip + matched heats + anomaly flags)
- **2.5** Wire router in `backend/main.py`
- **2.6** Full endpoint tests pass
- **2.7** Manual SMS4 verification of all 3 endpoints

# Phase 3 — Page 1 (Operations Live frontend)  (target: 1.0 day)

- **3.1** Create `frontend/src/pages/OperationsLive.jsx` page shell
- **3.2** Sub-components: `TopKpiStrip.jsx`, `LiveHeatsPanel.jsx`, `ActiveTripsPanel.jsx`, `RecentActivityFeed.jsx`
- **3.3** Polling hook (10s interval), error/loading states
- **3.4** Add sidebar entry in `Sidebar.jsx`, route in `App.jsx`
- **3.5** Visual polish, empty states
- **3.6** Manual SMS4 verification

# Phase 4 — Page 2 (Trip History Live frontend)  (target: 1.5 day)

- **4.1** Create `frontend/src/pages/TripHistoryLive.jsx`
- **4.2** Sub-components: `FilterBar.jsx`, `TripListTable.jsx`, `TripStoryExpanded.jsx` (horizontal stepper)
- **4.3** Filter state + URL-sync, pagination
- **4.4** Deep-link route `/trip-history-live/:trip_id`
- **4.5** Anomaly badges + status callouts
- **4.6** Sidebar entry, route
- **4.7** Manual SMS4 verification

# Phase 5 — Polish + handover  (target: 0.5 day)

- **5.1** Empty states, loading skeletons, error toasts
- **5.2** Performance check (no full-page re-renders on 10s polls)
- **5.3** Edge-case tests (anomaly trips, multi-heat trips, unmatched trips)
- **5.4** Final handover folder + README
- **5.5** Final `changes_tracker.md` summary entry
- **5.6** Merge `sprint-3-operations-live` back to `sprint-2-wbatngl-trip-mirror` (or to a release branch — TBD)

---

## Re-planning trigger

After Phase 1 completes and deploys, re-invoke `superpowers:writing-plans` to expand Phase 2 into detailed tasks. Same for Phases 3-5. Each phase becomes its own detailed plan as we reach it.

---

*Implementation plan for Phase 1 ready. Plans for Phases 2-5 will be written as we reach them.*
