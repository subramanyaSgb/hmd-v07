# Operations Live — Phase 2: API endpoints

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three new authenticated REST endpoints under `/api/operations-live/*` and `/api/trip-history-live/*` that consolidate `wbatngl_trip_mirror` + `hts_heat_mirror` + `fleet_live_locations` into the payloads consumed by Page 1 (live cockpit) and Page 2 (trip-history list + expanded trip story). Zero touches to existing endpoints.

**Architecture:** New `backend/routes/operations.py` module mirroring the `backend/routes/jsw.py` pattern (`get_current_user_required` auth, `fleet_cache` for the dashboard payload, ORM-only queries — no PG-specific SQL for cross-dialect SQLite test compatibility). Trip↔heat matching done with a Python-side time-window query against `HtsHeatMirror` (15 min before / 90 min after `closetime`) so we don't depend on the PG-only `v_trip_heat_story` view inside endpoint code. The view stays in the migration as a future / DB-shell query convenience.

**Tech Stack:** Python 3.10+, FastAPI, SQLAlchemy ORM, pytest. No new dependencies.

**Design document:** [`docs/plans/2026-05-11-operations-live-design.md`](2026-05-11-operations-live-design.md) — read first for the full architecture context. Phase-1 plan: [`2026-05-11-operations-live-implementation.md`](2026-05-11-operations-live-implementation.md).

**Branch:** Stay on `sprint-3-operations-live` (Phase 1 already landed here).

---

## Pre-implementation checklist

Before Task 2.1, verify:

- [ ] On branch `sprint-3-operations-live`; working tree clean (`git status`)
- [ ] Last commit is the hotfix `2745c30 perf(sync): add composite index ...` or newer
- [ ] Backend tests baseline green: `pytest backend/ -q` → ~268 passed
- [ ] `backend/database/models.py` has both `WbatnglTripMirror` AND `HtsHeatMirror` classes (Phase 1 deliverable)
- [ ] `backend/alembic/versions/` contains `84b54339b4f5`, `bf02ec626f86`, `c3e8d219a4b1`
- [ ] `backend/routes/operations.py` does **NOT** exist yet (Phase 2 creates it)

If any unchecked → fix before starting.

---

## What you are building

### Endpoint #1 — `GET /api/operations-live/dashboard`

Single consolidated payload for Page 1. Returns:

```jsonc
{
  "kpi_strip": {
    "production_today_mt": 8429.3,        // SUM(net_weight) today, wbatngl_trip_mirror
    "consumption_today_mt": 7912.0,       // SUM(hotmetal_qty) today, hts_heat_mirror
    "active_trips_now": 4,                // wbatngl rows out_date NOT NULL, no matching heat in window
    "heats_in_progress": 2,               // hts_heat_mirror torpedo_out_time IS NULL
    "idle_torpedoes": 17                  // fleet_live_locations status='Idle' (latest per fleet)
  },
  "converters": [                         // exactly 6: D,E,F,G,H,I (alphabetical)
    {
      "converter_no": "D",
      "sms": "SMS3",                      // most recent non-null SMS for that converter, may be null
      "state": "HEAT_IN_PROGRESS",        // IDLE | HEAT_IN_PROGRESS | WAITING_TORPEDO
      "current_heat_no": "D2030595",
      "current_torpedo": "TLC-45",
      "elapsed_minutes": 32,
      "hotmetal_received_mt": 126.146,
      "last_heat_no": "D2030592",         // most recent COMPLETED (torpedo_out_time NOT NULL)
      "last_heat_at": "2026-04-01T17:20:00",
      "heats_today": 7
    },
    /* ... 5 more ... */
  ],
  "active_trips": [                       // out_date NOT NULL AND no matched heat yet
    {
      "trip_id": "...", "torpedo_no": "TLC-22",
      "source_lab": "BF3", "destination": "SMS3",
      "net_weight_mt": 368.0,
      "out_date": "2026-04-01T14:23:00",
      "elapsed_minutes": 32,
      "current_status": "Moving"         // from FleetLiveLocation, may be null
    },
    /* ... up to 50, sorted out_date DESC ... */
  ],
  "activity_feed": [                      // last 20 events, reverse-chronological
    {
      "type": "trip_completed",           // trip_completed | heat_started
      "at": "2026-04-01T15:10:00",
      "summary": "TLC-22 closed BF3 → SMS3 (368 MT)",
      "ref_id": "trip-id-or-heat-no"
    },
    /* ... 19 more ... */
  ],
  "last_sync_at": {
    "wbatngl": "...",
    "hts": "..."
  }
}
```

Auth: `get_current_user_required`. Cache: `fleet_cache` 5 s TTL (matches `jsw_dashboard` precedent).

### Endpoint #2 — `GET /api/trip-history-live`

Paginated, filterable trip list. Same query-string contract as `/api/jsw/trips` (`time_window`, `source_lab`, `destination`, `shift`, `fleet_id`, `q`, `page`, `page_size`, `sort_by`, `sort_order`) PLUS:

- `status` — `all` (default) | `complete` | `in_flight` | `awaiting_pour` | `anomaly`
- `converter` — `all` | `D` | `E` | `F` | `G` | `H` | `I` (filters to trips that have a matched heat on that converter)

Returns:

```jsonc
{
  "rows": [
    {
      // all WbatnglTripMirror columns + computed:
      "trip_id": "...", "fleet_id": "TLC-22", "source_lab": "BF3", ...,
      "match_status": "complete",         // complete | in_flight | awaiting_pour | anomaly
      "first_heat_no": "D2030595",        // first matched heat by torpedo_in_time ASC, or null
      "matched_heat_count": 2,
      "matched_hotmetal_total_mt": 347.0, // SUM(hotmetal_qty) of matched heats, or null
      "weight_delta_pct": -5.7            // (matched_total - net_weight)/net_weight*100, or null
    }
  ],
  "page": 1, "page_size": 50, "total": 187,
  "last_sync_at": { "wbatngl": "...", "hts": "..." }
}
```

Auth: `get_current_user_required`. No cache.

### Endpoint #3 — `GET /api/trip-history-live/:trip_id`

Single-trip detail for the expanded story panel.

```jsonc
{
  "trip": {  /* full WbatnglTripMirror row dict */ },
  "matched_heats": [
    {  /* full HtsHeatMirror row dict */ }
  ],
  "current_torpedo_position": {
    "fleet_id": "TLC-22", "x": 12.3, "y": 45.6,
    "status": "Moving", "type": "torpedo",
    "last_updated": "..."
  },
  "anomaly_flags": [
    {"code": "weight_delta", "severity": "warn", "message": "..."}
  ],
  "last_sync_at": { "wbatngl": "...", "hts": "..." }
}
```

Returns 404 if `trip_id` not found in `wbatngl_trip_mirror`. Auth: `get_current_user_required`. Cache: `fleet_cache` 10 s TTL.

---

# Task list

## Batch A — Route skeleton + shared helpers (5 tasks)

### Task 2.1: Pre-flight checks

**Files:**
- Modify: git only

**Step 1:** Verify branch + clean tree

Run:
```bash
cd Development/Version_07
git status
git log --oneline -1
```
Expected: `On branch sprint-3-operations-live`, working tree clean, head at `2745c30` (or newer).

**Step 2:** Baseline tests green

Run: `pytest backend/ -q 2>&1 | tail -3`
Expected: `268 passed` (or higher) — no failures.

**Step 3:** Confirm route file does NOT exist (otherwise the wrong branch is checked out):

Run: `test -f backend/routes/operations.py && echo EXISTS || echo OK`
Expected: `OK`.

No code change. No commit.

---

### Task 2.2: Create the route file skeleton

**Files:**
- Create: `backend/routes/operations.py`

**Step 1:** Create the file with module docstring, imports, router, and constants. No endpoints yet — just the scaffolding.

```python
"""
Operations Live + Trip History (Live) endpoints.

Consumed by the new /operations-live and /trip-history-live pages. Reads
from wbatngl_trip_mirror (producer-side), hts_heat_mirror (consumer-side),
and fleet_live_locations (live GPS). Strictly read-only — never mutates
any source table.

Auth: get_current_user_required for all endpoints (any authenticated role),
matching the read-side auth on /api/jsw/*.

See docs/plans/2026-05-11-operations-live-design.md for the full architecture
and docs/plans/2026-05-12-operations-live-phase-2.md for the per-task plan.
"""
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, func, or_, and_
from sqlalchemy.orm import Session

from ..database.engine import get_db
from ..database.models import (
    FleetLiveLocation,
    HtsHeatMirror,
    User,
    WbatnglTripMirror,
)
from ..logger import logger
from ..utils.cache import fleet_cache
from ..utils.security import get_current_user_required


router = APIRouter(tags=["operations-live"])

# Trip ↔ heat matching window (must match the v_trip_heat_story view).
MATCH_WINDOW_BEFORE = timedelta(minutes=15)
MATCH_WINDOW_AFTER = timedelta(minutes=90)

# Six SMS3 converters tracked on Page 1. Order is the display order.
CONVERTERS = ("D", "E", "F", "G", "H", "I")

# Weight-delta anomaly threshold: |WBATNGL net - SUM(HTS hotmetal)| / WBATNGL net > 10%.
WEIGHT_DELTA_ANOMALY_PCT = 10.0

# Sort whitelist for /api/trip-history-live — never let user input become ORDER BY.
TRIP_HISTORY_SORT_WHITELIST = {
    "updated_date", "first_tare_time", "out_date", "closetime",
    "net_weight", "fleet_id",
}

# Cache keys / TTLs.
CACHE_KEY_DASHBOARD = "ops_live_dashboard"
DASHBOARD_CACHE_TTL_SEC = 5
CACHE_KEY_TRIP_DETAIL = "ops_live_trip_detail"
TRIP_DETAIL_CACHE_TTL_SEC = 10
```

**Step 2:** Smoke-test the import.

Run: `python -c "from backend.routes import operations; print(operations.router.routes)"`
Expected: prints `[]` (router exists, no routes yet).

**Step 3:** Commit.

```bash
git add backend/routes/operations.py
git commit -m "feat(ops-live): route file skeleton with shared constants"
```

---

### Task 2.3: TDD — `_time_window_to_cutoff` helper

The existing `jsw.py._time_window_to_cutoff` is private to that module. We replicate (don't import — keep modules decoupled per design Topic 5 "strict separation"). Same `today/24h/7d/30d` contract.

**Files:**
- Create: `backend/tests/test_operations_endpoints.py`

**Step 1:** Create the test file with the first failing test:

```python
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
```

**Step 2:** Run, confirm fails

Run: `pytest backend/tests/test_operations_endpoints.py -v`
Expected: `ImportError: cannot import name '_time_window_to_cutoff'`.

**Step 3:** Implement in `backend/routes/operations.py` (append after the constants block):

```python
def _time_window_to_cutoff(time_window: str) -> datetime:
    """today / 24h / 7d / 30d → UTC cutoff datetime. Raises 400 otherwise."""
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
```

**Step 4:** Run again, confirm pass.

Run: `pytest backend/tests/test_operations_endpoints.py::TestTimeWindow -v`
Expected: 5 passed.

**Step 5:** Commit.

```bash
git add backend/routes/operations.py backend/tests/test_operations_endpoints.py
git commit -m "feat(ops-live): _time_window_to_cutoff + tests"
```

---

### Task 2.4: TDD — `find_matched_heats` helper

Returns the `HtsHeatMirror` rows that match a given trip via (torpedo, time-window) — used by both endpoints #1 (active-vs-pending classification) and #2 (matched-heat enrichment per row) and #3 (full detail).

**Files:**
- Modify: `backend/tests/test_operations_endpoints.py`
- Modify: `backend/routes/operations.py`

**Step 1:** Append fixtures + tests:

```python
from backend.database.models import HtsHeatMirror, WbatnglTripMirror
from backend.routes.operations import find_matched_heats


@pytest.fixture
def trip_at(db_session):
    """Factory: insert one wbatngl trip with closetime at the given dt."""
    def _make(trip_id, fleet_id, closetime, **kw):
        defaults = dict(
            trip_id=trip_id, fleet_id=fleet_id,
            source_lab="BF3", destination="SMS3",
            net_weight=368.0,
            out_date=closetime - timedelta(minutes=20),
            closetime=closetime,
            updated_date=closetime,
        )
        defaults.update(kw)
        row = WbatnglTripMirror(**defaults)
        db_session.add(row); db_session.commit(); db_session.refresh(row)
        return row
    return _make


@pytest.fixture
def heat_at(db_session):
    """Factory: insert one hts_heat_mirror row."""
    def _make(heat_no, torpedo_no, torpedo_in_time, **kw):
        defaults = dict(
            heat_no=heat_no, torpedo_no=torpedo_no,
            torpedo_no_raw=torpedo_no.replace("TLC-", "").lstrip("0") or "0",
            converter_no=heat_no[0],
            sms="SMS3",
            hotmetal_qty=170.0, torpedo_qty=340.0,
            torpedo_in_time=torpedo_in_time,
            torpedo_out_time=torpedo_in_time + timedelta(minutes=10),
            converter_life=350,
        )
        defaults.update(kw)
        row = HtsHeatMirror(**defaults)
        db_session.add(row); db_session.commit(); db_session.refresh(row)
        return row
    return _make


class TestFindMatchedHeats:
    def test_returns_heats_in_window(self, db_session, trip_at, heat_at):
        t0 = datetime(2026, 4, 1, 15, 0, 0)
        trip = trip_at("T1", "TLC-22", closetime=t0)
        h1 = heat_at("D1", "TLC-22", torpedo_in_time=t0 + timedelta(minutes=5))
        h2 = heat_at("E1", "TLC-22", torpedo_in_time=t0 + timedelta(minutes=80))
        assert {h.heat_no for h in find_matched_heats(db_session, trip)} == {"D1", "E1"}

    def test_excludes_heats_outside_window(self, db_session, trip_at, heat_at):
        t0 = datetime(2026, 4, 1, 15, 0, 0)
        trip = trip_at("T1", "TLC-22", closetime=t0)
        # 16 min before → outside the 15-min "before" cutoff
        heat_at("D1", "TLC-22", torpedo_in_time=t0 - timedelta(minutes=16))
        # 91 min after → outside the 90-min "after" cutoff
        heat_at("E1", "TLC-22", torpedo_in_time=t0 + timedelta(minutes=91))
        assert find_matched_heats(db_session, trip) == []

    def test_excludes_other_torpedoes(self, db_session, trip_at, heat_at):
        t0 = datetime(2026, 4, 1, 15, 0, 0)
        trip = trip_at("T1", "TLC-22", closetime=t0)
        heat_at("D1", "TLC-23", torpedo_in_time=t0 + timedelta(minutes=5))
        assert find_matched_heats(db_session, trip) == []

    def test_empty_when_trip_has_no_closetime(self, db_session, trip_at):
        trip = trip_at("T1", "TLC-22", closetime=None,
                       out_date=datetime(2026, 4, 1, 14, 0))
        assert find_matched_heats(db_session, trip) == []
```

**Step 2:** Run, confirm fails.

Run: `pytest backend/tests/test_operations_endpoints.py::TestFindMatchedHeats -v`
Expected: ImportError.

**Step 3:** Implement (append to `operations.py`):

```python
def find_matched_heats(db: Session, trip: WbatnglTripMirror) -> list[HtsHeatMirror]:
    """
    Return HTS heats that match this trip via the (torpedo, ±window) rule.

    Window: closetime - 15 min  ..  closetime + 90 min.
    Empty list if trip.closetime is null (in-flight, no destination ETA).
    Cross-dialect: uses Python-side timedelta arithmetic instead of the
    PG-only `v_trip_heat_story` view's INTERVAL syntax so SQLite tests pass.
    """
    if trip.closetime is None or trip.fleet_id is None:
        return []
    lo = trip.closetime - MATCH_WINDOW_BEFORE
    hi = trip.closetime + MATCH_WINDOW_AFTER
    return (
        db.query(HtsHeatMirror)
        .filter(
            HtsHeatMirror.torpedo_no == trip.fleet_id,
            HtsHeatMirror.torpedo_in_time.between(lo, hi),
        )
        .order_by(HtsHeatMirror.torpedo_in_time.asc())
        .all()
    )
```

**Step 4:** Run, confirm 4 passed.

Run: `pytest backend/tests/test_operations_endpoints.py::TestFindMatchedHeats -v`
Expected: 4 passed.

**Step 5:** Commit.

```bash
git add backend/routes/operations.py backend/tests/test_operations_endpoints.py
git commit -m "feat(ops-live): find_matched_heats + tests"
```

---

### Task 2.5: TDD — `compute_anomaly_flags` helper

Computes the `anomaly_flags` array used by endpoint #3 and the `match_status="anomaly"` classification used by endpoint #2. For v1 the only flag is `weight_delta` > 10%.

**Files:**
- Modify: `backend/tests/test_operations_endpoints.py`
- Modify: `backend/routes/operations.py`

**Step 1:** Append tests:

```python
from backend.routes.operations import compute_anomaly_flags


class TestComputeAnomalyFlags:
    def test_no_flags_when_within_tolerance(self):
        flags = compute_anomaly_flags(net_weight_mt=368.0,
                                       matched_total_mt=347.0)
        # |368 - 347| / 368 = 5.7% < 10% → no flag
        assert flags == []

    def test_weight_delta_flag_when_over_threshold(self):
        flags = compute_anomaly_flags(net_weight_mt=368.0,
                                       matched_total_mt=412.0)
        # +44 MT / 368 = +12% > 10% → flag
        assert len(flags) == 1
        f = flags[0]
        assert f["code"] == "weight_delta"
        assert f["severity"] == "warn"
        assert "WBATNGL" in f["message"] and "HTS" in f["message"]
        assert "+12" in f["message"] or "12.0" in f["message"]

    def test_skips_when_no_matched_heats(self):
        # matched_total_mt is None when no heats matched yet
        assert compute_anomaly_flags(net_weight_mt=368.0,
                                      matched_total_mt=None) == []

    def test_skips_when_no_net_weight(self):
        assert compute_anomaly_flags(net_weight_mt=None,
                                      matched_total_mt=347.0) == []

    def test_skips_when_net_weight_zero(self):
        # Defensive: division-by-zero must not crash
        assert compute_anomaly_flags(net_weight_mt=0.0,
                                      matched_total_mt=12.0) == []
```

**Step 2:** Run, confirm fails (ImportError).

Run: `pytest backend/tests/test_operations_endpoints.py::TestComputeAnomalyFlags -v`

**Step 3:** Implement (append):

```python
def compute_anomaly_flags(net_weight_mt: Optional[float],
                          matched_total_mt: Optional[float]) -> list[dict]:
    """
    Compute anomaly flags for one trip.

    For v1 the only flag is `weight_delta` — fires when |HTS sum - WBATNGL
    net| / WBATNGL net exceeds WEIGHT_DELTA_ANOMALY_PCT. Returns [] when
    either side is missing (matched_total_mt is None when no heats matched
    yet; net_weight_mt may be null on torpedoes that depart without weight).
    """
    flags: list[dict] = []
    if net_weight_mt and matched_total_mt is not None:
        delta_mt = matched_total_mt - net_weight_mt
        delta_pct = (delta_mt / net_weight_mt) * 100.0
        if abs(delta_pct) > WEIGHT_DELTA_ANOMALY_PCT:
            sign = "+" if delta_mt >= 0 else "-"
            flags.append({
                "code": "weight_delta",
                "severity": "warn",
                "message": (
                    f"Weight anomaly: WBATNGL {net_weight_mt:.0f} MT, "
                    f"HTS sum {matched_total_mt:.0f} MT "
                    f"({sign}{abs(delta_mt):.0f} MT, {sign}{abs(delta_pct):.1f}%)"
                ),
            })
    return flags
```

**Step 4:** Run, confirm 5 passed.

**Step 5:** Commit.

```bash
git add backend/routes/operations.py backend/tests/test_operations_endpoints.py
git commit -m "feat(ops-live): compute_anomaly_flags + tests"
```

---

## Batch B — Dashboard endpoint (5 tasks)

### Task 2.6: TDD — `GET /api/operations-live/dashboard` skeleton

Auth-gated, returns the correct top-level shape with all five sections present (most still empty). Then later tasks fill each section.

**Files:**
- Modify: `backend/tests/test_operations_endpoints.py`
- Modify: `backend/routes/operations.py`
- Modify: `backend/main.py` — register router (we do this **early** so the endpoint is reachable from `TestClient` for every endpoint test below)

**Step 1:** Register the router in `backend/main.py`. Find the line `app.include_router(jsw.router)` and immediately after it add:

```python
from .routes import operations  # add to the imports block at top of main.py
# (then in the routers section)
app.include_router(operations.router)
```

Actual placement:
- Top imports: add `operations` to the existing `from .routes import auth, locations, ...` line (or as its own import) — keep alphabetical-ish.
- Bottom registrations: `app.include_router(operations.router)` immediately after `app.include_router(jsw.router)`.

**Step 2:** Append the endpoint test:

```python
class TestDashboardSkeleton:
    def test_returns_200_with_full_shape(self, db_session, client, auth_headers):
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("kpi_strip", "converters", "active_trips",
                    "activity_feed", "last_sync_at"):
            assert key in body, f"missing key {key!r}"
        # converters always returns exactly 6 entries (D..I), even if empty
        assert [c["converter_no"] for c in body["converters"]] == list("DEFGHI")
        # last_sync_at has both source labels
        assert set(body["last_sync_at"]) == {"wbatngl", "hts"}

    def test_unauthenticated_rejected(self, client):
        r = client.get("/api/operations-live/dashboard")
        assert r.status_code == 401

    def test_empty_db_kpis_all_zero(self, db_session, client, auth_headers):
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        kpis = r.json()["kpi_strip"]
        assert kpis["production_today_mt"] == 0.0
        assert kpis["consumption_today_mt"] == 0.0
        assert kpis["active_trips_now"] == 0
        assert kpis["heats_in_progress"] == 0
        assert kpis["idle_torpedoes"] == 0
```

**Step 3:** Run, confirm fails (404 — endpoint doesn't exist yet).

Run: `pytest backend/tests/test_operations_endpoints.py::TestDashboardSkeleton -v`

**Step 4:** Implement the skeleton endpoint (append to `operations.py`):

```python
def _last_sync_at(db: Session) -> dict:
    return {
        "wbatngl": db.query(func.max(WbatnglTripMirror.synced_at)).scalar(),
        "hts":     db.query(func.max(HtsHeatMirror.synced_at)).scalar(),
    }


def _build_empty_converter_card(letter: str) -> dict:
    return {
        "converter_no": letter, "sms": None, "state": "IDLE",
        "current_heat_no": None, "current_torpedo": None,
        "elapsed_minutes": None, "hotmetal_received_mt": None,
        "last_heat_no": None, "last_heat_at": None,
        "heats_today": 0,
    }


@router.get("/api/operations-live/dashboard")
async def operations_live_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    cached = fleet_cache.get(CACHE_KEY_DASHBOARD)
    if cached is not None:
        return cached

    payload = {
        "kpi_strip": {
            "production_today_mt": 0.0,
            "consumption_today_mt": 0.0,
            "active_trips_now": 0,
            "heats_in_progress": 0,
            "idle_torpedoes": 0,
        },
        "converters": [_build_empty_converter_card(c) for c in CONVERTERS],
        "active_trips": [],
        "activity_feed": [],
        "last_sync_at": _last_sync_at(db),
    }
    try:
        fleet_cache.set(CACHE_KEY_DASHBOARD, payload, DASHBOARD_CACHE_TTL_SEC)
    except Exception:
        logger.exception("ops-live dashboard: cache set failed (non-fatal)")
    return payload
```

**Step 5:** Run, confirm pass.

Run: `pytest backend/tests/test_operations_endpoints.py::TestDashboardSkeleton -v`
Expected: 3 passed.

**Step 6:** Commit.

```bash
git add backend/main.py backend/routes/operations.py backend/tests/test_operations_endpoints.py
git commit -m "feat(ops-live): /api/operations-live/dashboard skeleton + 401 + empty-shape tests"
```

---

### Task 2.7: TDD — `kpi_strip` populated

**Files:**
- Modify: `backend/tests/test_operations_endpoints.py`
- Modify: `backend/routes/operations.py`

**Step 1:** Append tests:

```python
class TestDashboardKpiStrip:
    def test_production_today_sums_net_weight(
            self, db_session, client, auth_headers, trip_at):
        t = datetime.utcnow().replace(hour=10, minute=0, second=0, microsecond=0)
        trip_at("T1", "TLC-22", closetime=t, net_weight=300.0, updated_date=t)
        trip_at("T2", "TLC-23", closetime=t, net_weight=200.0, updated_date=t)
        # One trip outside today → should NOT be summed
        old = datetime.utcnow() - timedelta(days=2)
        trip_at("T_OLD", "TLC-24", closetime=old, net_weight=999.0,
                updated_date=old)

        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        kpis = r.json()["kpi_strip"]
        assert kpis["production_today_mt"] == 500.0

    def test_consumption_today_sums_hotmetal_qty(
            self, db_session, client, auth_headers, heat_at):
        t = datetime.utcnow().replace(hour=11, minute=0, second=0, microsecond=0)
        heat_at("D1", "TLC-22", torpedo_in_time=t, hotmetal_qty=126.0)
        heat_at("E1", "TLC-22", torpedo_in_time=t, hotmetal_qty=172.0)
        old = datetime.utcnow() - timedelta(days=2)
        heat_at("D_OLD", "TLC-22", torpedo_in_time=old, hotmetal_qty=500.0)

        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        kpis = r.json()["kpi_strip"]
        assert kpis["consumption_today_mt"] == 298.0

    def test_heats_in_progress_counts_null_torpedo_out_time(
            self, db_session, client, auth_headers, heat_at):
        t = datetime.utcnow()
        heat_at("D1", "TLC-22", torpedo_in_time=t,
                torpedo_out_time=None)                 # in progress
        heat_at("E1", "TLC-23", torpedo_in_time=t,
                torpedo_out_time=t + timedelta(minutes=10))  # done
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r.json()["kpi_strip"]["heats_in_progress"] == 1

    def test_active_trips_now_excludes_matched_trips(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow()
        trip_at("T1", "TLC-22", closetime=t)
        # Heat matches T1 → T1 should NOT count as active
        heat_at("D1", "TLC-22", torpedo_in_time=t + timedelta(minutes=5))
        # T2 has out_date but no matching heat → active
        trip_at("T2", "TLC-23", closetime=t)
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r.json()["kpi_strip"]["active_trips_now"] == 1

    def test_active_trips_now_excludes_in_flight_no_closetime(
            self, db_session, client, auth_headers, trip_at):
        # out_date set but closetime null → in-flight (no matching window yet)
        # design says active = "out_date NOT NULL and no matching heat" — so
        # this still counts as active.
        t = datetime.utcnow()
        trip_at("T1", "TLC-22", out_date=t, closetime=None, updated_date=t)
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r.json()["kpi_strip"]["active_trips_now"] == 1

    def test_idle_torpedoes_uses_latest_per_fleet(
            self, db_session, client, auth_headers):
        from backend.database.models import FleetLiveLocation
        now = datetime.utcnow()
        # Two snapshots for TLC-22: earlier=Moving, later=Idle → latest=Idle
        db_session.add_all([
            FleetLiveLocation(fleet_id="TLC-22", type="Idle",
                              x=1.0, y=1.0, last_updated=now),
            FleetLiveLocation(fleet_id="TLC-22", type="Moving",
                              x=1.0, y=1.0,
                              last_updated=now - timedelta(minutes=5)),
            FleetLiveLocation(fleet_id="TLC-23", type="Moving",
                              x=1.0, y=1.0, last_updated=now),
        ])
        db_session.commit()
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        # TLC-22 idle counts, TLC-23 moving does not
        assert r.json()["kpi_strip"]["idle_torpedoes"] == 1
```

**Note:** FleetLiveLocation has `type` (not `status`) per the model — this is the "status" string the SuVeechi sync populates ("Idle", "Moving", etc.). Verify in `models.py:68`.

**Step 2:** Run, confirm fails (kpis still all 0).

Run: `pytest backend/tests/test_operations_endpoints.py::TestDashboardKpiStrip -v`

**Step 3:** Replace the placeholder KPI block in `operations_live_dashboard` with real computation. Insert before the `payload = {...}` line:

```python
    today_cutoff = datetime.utcnow().replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    # KPI strip
    production_today = db.query(
        func.coalesce(func.sum(WbatnglTripMirror.net_weight), 0.0)
    ).filter(WbatnglTripMirror.updated_date >= today_cutoff).scalar()

    consumption_today = db.query(
        func.coalesce(func.sum(HtsHeatMirror.hotmetal_qty), 0.0)
    ).filter(HtsHeatMirror.torpedo_in_time >= today_cutoff).scalar()

    heats_in_progress = db.query(HtsHeatMirror).filter(
        HtsHeatMirror.torpedo_out_time.is_(None),
    ).count()

    # Active trips = out_date NOT NULL AND no matched heat in window.
    # Compute in Python — small N (typically <20 active trips at a time).
    candidate_trips = (
        db.query(WbatnglTripMirror)
        .filter(WbatnglTripMirror.out_date.isnot(None))
        .order_by(WbatnglTripMirror.out_date.desc())
        .limit(200)
        .all()
    )
    active_trip_rows = [t for t in candidate_trips
                        if not find_matched_heats(db, t)]
    active_trips_now = len(active_trip_rows)

    # Idle torpedoes — latest FleetLiveLocation per fleet_id where type='Idle'.
    # Cross-dialect "row_number()-style" via correlated subquery.
    latest_per_fleet = (
        db.query(
            FleetLiveLocation.fleet_id,
            func.max(FleetLiveLocation.last_updated).label("mx"),
        )
        .group_by(FleetLiveLocation.fleet_id)
        .subquery()
    )
    idle_torpedoes = (
        db.query(FleetLiveLocation)
        .join(
            latest_per_fleet,
            and_(
                FleetLiveLocation.fleet_id == latest_per_fleet.c.fleet_id,
                FleetLiveLocation.last_updated == latest_per_fleet.c.mx,
            ),
        )
        .filter(FleetLiveLocation.type == "Idle")
        .count()
    )
```

Then replace the placeholder `kpi_strip` block:

```python
        "kpi_strip": {
            "production_today_mt": float(production_today or 0.0),
            "consumption_today_mt": float(consumption_today or 0.0),
            "active_trips_now": active_trips_now,
            "heats_in_progress": heats_in_progress,
            "idle_torpedoes": idle_torpedoes,
        },
```

Stash the `active_trip_rows` list — we'll reuse it in Task 2.9 for the `active_trips` section so we don't re-query.

**Step 4:** Run, confirm pass.

Run: `pytest backend/tests/test_operations_endpoints.py::TestDashboardKpiStrip -v`
Expected: 6 passed.

**Step 5:** Commit.

```bash
git add backend/routes/operations.py backend/tests/test_operations_endpoints.py
git commit -m "feat(ops-live): populate kpi_strip — production/consumption/active/heats/idle + tests"
```

---

### Task 2.8: TDD — `converters[6]` populated

**Files:**
- Modify: `backend/tests/test_operations_endpoints.py`
- Modify: `backend/routes/operations.py`

**Step 1:** Append tests:

```python
def _converter_by(body, letter):
    return next(c for c in body["converters"] if c["converter_no"] == letter)


class TestDashboardConverters:
    def test_idle_state_when_no_heat_in_progress(
            self, db_session, client, auth_headers):
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        for c in r.json()["converters"]:
            assert c["state"] == "IDLE"
            assert c["heats_today"] == 0

    def test_heat_in_progress_state(
            self, db_session, client, auth_headers, heat_at):
        now = datetime.utcnow()
        heat_at("D1", "TLC-22",
                torpedo_in_time=now - timedelta(minutes=12),
                torpedo_out_time=None,
                hotmetal_qty=126.0,
                sms="SMS3")
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        d = _converter_by(r.json(), "D")
        assert d["state"] == "HEAT_IN_PROGRESS"
        assert d["current_heat_no"] == "D1"
        assert d["current_torpedo"] == "TLC-22"
        assert 11 <= d["elapsed_minutes"] <= 13
        assert d["hotmetal_received_mt"] == 126.0
        assert d["sms"] == "SMS3"

    def test_heats_today_counts_only_today(
            self, db_session, client, auth_headers, heat_at):
        now = datetime.utcnow().replace(hour=10)
        heat_at("D1", "TLC-22", torpedo_in_time=now)
        heat_at("D2", "TLC-23", torpedo_in_time=now + timedelta(minutes=20))
        # Yesterday
        heat_at("D_OLD", "TLC-22",
                torpedo_in_time=now - timedelta(days=1))
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert _converter_by(r.json(), "D")["heats_today"] == 2

    def test_last_heat_is_most_recent_completed(
            self, db_session, client, auth_headers, heat_at):
        now = datetime.utcnow()
        heat_at("D_OLD", "TLC-22",
                torpedo_in_time=now - timedelta(hours=4),
                torpedo_out_time=now - timedelta(hours=4) + timedelta(minutes=10))
        heat_at("D_NEW", "TLC-22",
                torpedo_in_time=now - timedelta(hours=1),
                torpedo_out_time=now - timedelta(hours=1) + timedelta(minutes=10))
        # in-progress heat — NOT to be reported as last_heat
        heat_at("D_NOW", "TLC-22",
                torpedo_in_time=now - timedelta(minutes=5),
                torpedo_out_time=None)
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        d = _converter_by(r.json(), "D")
        assert d["last_heat_no"] == "D_NEW"
```

**Step 2:** Run, confirm fails.

**Step 3:** Implement. Add to `operations.py` after the KPI block in `operations_live_dashboard`:

```python
    # Converter cards — one row per letter; data sourced from hts_heat_mirror.
    converter_cards = []
    for letter in CONVERTERS:
        base = db.query(HtsHeatMirror).filter(
            HtsHeatMirror.converter_no == letter
        )

        in_progress = (
            base.filter(HtsHeatMirror.torpedo_out_time.is_(None))
                .order_by(HtsHeatMirror.torpedo_in_time.desc())
                .first()
        )
        last_completed = (
            base.filter(HtsHeatMirror.torpedo_out_time.isnot(None))
                .order_by(HtsHeatMirror.torpedo_out_time.desc())
                .first()
        )
        heats_today = (
            base.filter(HtsHeatMirror.torpedo_in_time >= today_cutoff).count()
        )
        # SMS label: prefer the in-progress heat's value, then most recent
        # non-null SMS overall.
        sms_value = None
        if in_progress and in_progress.sms:
            sms_value = in_progress.sms
        else:
            recent_with_sms = (
                base.filter(HtsHeatMirror.sms.isnot(None))
                    .order_by(HtsHeatMirror.torpedo_in_time.desc())
                    .first()
            )
            if recent_with_sms:
                sms_value = recent_with_sms.sms

        if in_progress:
            elapsed_min = int(
                (datetime.utcnow() - in_progress.torpedo_in_time).total_seconds() // 60
            )
            card = {
                "converter_no": letter,
                "sms": sms_value,
                "state": "HEAT_IN_PROGRESS",
                "current_heat_no": in_progress.heat_no,
                "current_torpedo": in_progress.torpedo_no,
                "elapsed_minutes": elapsed_min,
                "hotmetal_received_mt": (
                    float(in_progress.hotmetal_qty)
                    if in_progress.hotmetal_qty is not None else None
                ),
                "last_heat_no": last_completed.heat_no if last_completed else None,
                "last_heat_at": (
                    last_completed.torpedo_out_time if last_completed else None
                ),
                "heats_today": heats_today,
            }
        else:
            card = {
                "converter_no": letter,
                "sms": sms_value,
                "state": "IDLE",
                "current_heat_no": None,
                "current_torpedo": None,
                "elapsed_minutes": None,
                "hotmetal_received_mt": None,
                "last_heat_no": last_completed.heat_no if last_completed else None,
                "last_heat_at": (
                    last_completed.torpedo_out_time if last_completed else None
                ),
                "heats_today": heats_today,
            }
        converter_cards.append(card)
```

Then replace the `"converters": [...]` line with `"converters": converter_cards,`.

**Note:** The design doc also mentions a `WAITING_TORPEDO` state. For v1 we can't distinguish "converter idle and waiting for a specific incoming torpedo" without consumer-side scheduling data. Keep `WAITING_TORPEDO` out of the state machine; UI will only see `IDLE | HEAT_IN_PROGRESS`. Document this in the function docstring.

**Step 4:** Run, confirm pass.

Run: `pytest backend/tests/test_operations_endpoints.py::TestDashboardConverters -v`
Expected: 4 passed.

**Step 5:** Commit.

```bash
git add backend/routes/operations.py backend/tests/test_operations_endpoints.py
git commit -m "feat(ops-live): converters[6] — IDLE/HEAT_IN_PROGRESS + tests"
```

---

### Task 2.9: TDD — `active_trips` populated

**Files:**
- Modify: `backend/tests/test_operations_endpoints.py`
- Modify: `backend/routes/operations.py`

**Step 1:** Append tests:

```python
class TestDashboardActiveTrips:
    def test_active_trips_includes_unmatched_with_out_date(
            self, db_session, client, auth_headers, trip_at):
        t = datetime.utcnow() - timedelta(minutes=30)
        trip_at("T1", "TLC-22", closetime=t, out_date=t - timedelta(minutes=10),
                source_lab="BF3", destination="SMS3", net_weight=368.0)
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        active = r.json()["active_trips"]
        assert len(active) == 1
        row = active[0]
        assert row["trip_id"] == "T1"
        assert row["torpedo_no"] == "TLC-22"
        assert row["source_lab"] == "BF3"
        assert row["destination"] == "SMS3"
        assert row["net_weight_mt"] == 368.0
        # elapsed since out_date, ~40 minutes (30 + 10)
        assert 38 <= row["elapsed_minutes"] <= 42

    def test_active_trips_excludes_matched(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow() - timedelta(minutes=10)
        trip_at("T1", "TLC-22", closetime=t)
        heat_at("D1", "TLC-22", torpedo_in_time=t + timedelta(minutes=5))
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r.json()["active_trips"] == []

    def test_active_trips_sorted_out_date_desc(
            self, db_session, client, auth_headers, trip_at):
        now = datetime.utcnow()
        trip_at("OLD", "TLC-22", closetime=now - timedelta(hours=3),
                out_date=now - timedelta(hours=3, minutes=10))
        trip_at("NEW", "TLC-23", closetime=now - timedelta(minutes=10),
                out_date=now - timedelta(minutes=20))
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        ids = [t["trip_id"] for t in r.json()["active_trips"]]
        assert ids == ["NEW", "OLD"]

    def test_active_trips_current_status_from_fleet_live(
            self, db_session, client, auth_headers, trip_at):
        from backend.database.models import FleetLiveLocation
        t = datetime.utcnow() - timedelta(minutes=10)
        trip_at("T1", "TLC-22", closetime=t,
                out_date=t - timedelta(minutes=10))
        db_session.add(FleetLiveLocation(
            fleet_id="TLC-22", type="Moving",
            x=1.0, y=1.0, last_updated=datetime.utcnow(),
        ))
        db_session.commit()
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r.json()["active_trips"][0]["current_status"] == "Moving"
```

**Step 2:** Run, confirm fails.

**Step 3:** Reuse the `active_trip_rows` we already computed in Task 2.7. Build the `active_trips` list by looking up current `FleetLiveLocation` per torpedo:

Append in `operations_live_dashboard` after the converter block:

```python
    # active_trip_rows was computed during KPI strip — reuse, don't re-query.
    # Build a per-torpedo lookup of latest FleetLiveLocation.type.
    torpedo_ids = [t.fleet_id for t in active_trip_rows if t.fleet_id]
    latest_status_by_fleet = {}
    if torpedo_ids:
        latest_per_fleet_sq = (
            db.query(
                FleetLiveLocation.fleet_id,
                func.max(FleetLiveLocation.last_updated).label("mx"),
            )
            .filter(FleetLiveLocation.fleet_id.in_(torpedo_ids))
            .group_by(FleetLiveLocation.fleet_id)
            .subquery()
        )
        rows = (
            db.query(FleetLiveLocation)
            .join(
                latest_per_fleet_sq,
                and_(
                    FleetLiveLocation.fleet_id == latest_per_fleet_sq.c.fleet_id,
                    FleetLiveLocation.last_updated == latest_per_fleet_sq.c.mx,
                ),
            )
            .all()
        )
        latest_status_by_fleet = {r.fleet_id: r.type for r in rows}

    active_trips_payload = []
    now = datetime.utcnow()
    for t in active_trip_rows[:50]:                     # cap at 50 for UI
        elapsed_min = (
            int((now - t.out_date).total_seconds() // 60)
            if t.out_date else None
        )
        active_trips_payload.append({
            "trip_id": t.trip_id,
            "torpedo_no": t.fleet_id,
            "source_lab": t.source_lab,
            "destination": t.destination,
            "net_weight_mt": (
                float(t.net_weight) if t.net_weight is not None else None
            ),
            "out_date": t.out_date,
            "elapsed_minutes": elapsed_min,
            "current_status": latest_status_by_fleet.get(t.fleet_id),
        })
```

Replace the placeholder `"active_trips": [],` with `"active_trips": active_trips_payload,`.

**Step 4:** Run, confirm pass.

Run: `pytest backend/tests/test_operations_endpoints.py::TestDashboardActiveTrips -v`
Expected: 4 passed.

**Step 5:** Commit.

```bash
git add backend/routes/operations.py backend/tests/test_operations_endpoints.py
git commit -m "feat(ops-live): active_trips section + current_status from fleet_live + tests"
```

---

### Task 2.10: TDD — `activity_feed` + cache verification

**Files:**
- Modify: `backend/tests/test_operations_endpoints.py`
- Modify: `backend/routes/operations.py`

**Step 1:** Append tests:

```python
class TestDashboardActivityFeed:
    def test_trip_close_event_appears(
            self, db_session, client, auth_headers, trip_at):
        t = datetime.utcnow() - timedelta(minutes=20)
        trip_at("T1", "TLC-22", closetime=t,
                source_lab="BF3", destination="SMS3", net_weight=368.0)
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        events = r.json()["activity_feed"]
        # at least one trip_completed event for T1
        completes = [e for e in events if e["type"] == "trip_completed"]
        assert any(e["ref_id"] == "T1" for e in completes)

    def test_heat_start_event_appears(
            self, db_session, client, auth_headers, heat_at):
        t = datetime.utcnow() - timedelta(minutes=15)
        heat_at("D1", "TLC-22", torpedo_in_time=t)
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        events = r.json()["activity_feed"]
        starts = [e for e in events if e["type"] == "heat_started"]
        assert any(e["ref_id"] == "D1" for e in starts)

    def test_feed_capped_at_20_reverse_chronological(
            self, db_session, client, auth_headers, trip_at, heat_at):
        base = datetime.utcnow() - timedelta(minutes=50)
        for i in range(15):
            trip_at(f"T{i}", f"TLC-{i:02d}",
                    closetime=base + timedelta(minutes=i))
        for i in range(15):
            heat_at(f"H{i}", f"TLC-{i:02d}",
                    torpedo_in_time=base + timedelta(minutes=i + 1))
        r = client.get("/api/operations-live/dashboard", headers=auth_headers)
        events = r.json()["activity_feed"]
        assert len(events) == 20
        # Newest first
        ats = [e["at"] for e in events]
        assert ats == sorted(ats, reverse=True)


class TestDashboardCache:
    def test_second_call_is_cached(
            self, db_session, client, auth_headers, trip_at):
        t = datetime.utcnow()
        trip_at("T1", "TLC-22", closetime=t,
                source_lab="BF3", destination="SMS3", net_weight=300.0)
        r1 = client.get("/api/operations-live/dashboard", headers=auth_headers)
        # Add another trip — should NOT show up while cache is warm
        trip_at("T2", "TLC-23", closetime=t,
                source_lab="BF3", destination="SMS3", net_weight=200.0)
        r2 = client.get("/api/operations-live/dashboard", headers=auth_headers)
        assert r1.json()["kpi_strip"]["production_today_mt"] == \
               r2.json()["kpi_strip"]["production_today_mt"]
```

**Step 2:** Run, confirm fails.

**Step 3:** Implement. Append in `operations_live_dashboard` after the active-trips block:

```python
    # Activity feed — last 20 events from the union of trip_close + heat_start.
    feed_horizon = datetime.utcnow() - timedelta(hours=2)

    recent_closes = (
        db.query(WbatnglTripMirror)
        .filter(WbatnglTripMirror.closetime.isnot(None),
                WbatnglTripMirror.closetime >= feed_horizon)
        .order_by(WbatnglTripMirror.closetime.desc())
        .limit(20)
        .all()
    )
    recent_heats = (
        db.query(HtsHeatMirror)
        .filter(HtsHeatMirror.torpedo_in_time >= feed_horizon)
        .order_by(HtsHeatMirror.torpedo_in_time.desc())
        .limit(20)
        .all()
    )
    events = []
    for t in recent_closes:
        events.append({
            "type": "trip_completed",
            "at": t.closetime,
            "summary": (
                f"{t.fleet_id or '?'} closed {t.source_lab or '?'} → "
                f"{t.destination or '?'}"
                + (f" ({float(t.net_weight):.0f} MT)" if t.net_weight else "")
            ),
            "ref_id": t.trip_id,
        })
    for h in recent_heats:
        events.append({
            "type": "heat_started",
            "at": h.torpedo_in_time,
            "summary": (
                f"Heat {h.heat_no} started"
                + (f" @ {h.converter_no}" if h.converter_no else "")
                + (f" (torpedo {h.torpedo_no})" if h.torpedo_no else "")
            ),
            "ref_id": h.heat_no,
        })
    events.sort(key=lambda e: e["at"], reverse=True)
    events = events[:20]
```

Then replace `"activity_feed": []` with `"activity_feed": events`.

**Step 4:** Run all dashboard tests.

Run: `pytest backend/tests/test_operations_endpoints.py -k "Dashboard" -v`
Expected: all pass (skeleton 3 + kpi 6 + converters 4 + active 4 + feed 3 + cache 1 = 21).

**Step 5:** Commit.

```bash
git add backend/routes/operations.py backend/tests/test_operations_endpoints.py
git commit -m "feat(ops-live): activity_feed + cache test + completes dashboard endpoint"
```

---

## Batch C — Trip history list endpoint (4 tasks)

### Task 2.11: TDD — `GET /api/trip-history-live` basic listing + pagination

**Files:**
- Modify: `backend/tests/test_operations_endpoints.py`
- Modify: `backend/routes/operations.py`

**Step 1:** Append tests:

```python
class TestTripHistoryLiveBasic:
    def test_returns_paginated_shape(self, db_session, client, auth_headers, trip_at):
        for i in range(60):
            trip_at(f"T{i:02d}", f"TLC-{i % 53 + 1:02d}",
                    closetime=datetime.utcnow() - timedelta(minutes=i))
        r = client.get("/api/trip-history-live?time_window=30d",
                       headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["page"] == 1
        assert body["page_size"] == 50
        assert body["total"] == 60
        assert len(body["rows"]) == 50
        assert set(body["last_sync_at"]) == {"wbatngl", "hts"}

    def test_pagination(self, db_session, client, auth_headers, trip_at):
        for i in range(60):
            trip_at(f"T{i:02d}", f"TLC-{i % 53 + 1:02d}",
                    closetime=datetime.utcnow() - timedelta(minutes=i))
        r = client.get(
            "/api/trip-history-live?time_window=30d&page=2&page_size=25",
            headers=auth_headers,
        )
        body = r.json()
        assert body["page"] == 2
        assert body["page_size"] == 25
        assert len(body["rows"]) == 25

    def test_default_sort_out_date_desc(
            self, db_session, client, auth_headers, trip_at):
        t = datetime.utcnow()
        trip_at("OLD", "TLC-01", closetime=t - timedelta(hours=3),
                out_date=t - timedelta(hours=3, minutes=10))
        trip_at("NEW", "TLC-02", closetime=t - timedelta(minutes=10),
                out_date=t - timedelta(minutes=20))
        r = client.get("/api/trip-history-live?time_window=30d",
                       headers=auth_headers)
        ids = [r_["trip_id"] for r_ in r.json()["rows"]]
        assert ids.index("NEW") < ids.index("OLD")

    def test_unauthenticated_rejected(self, client):
        r = client.get("/api/trip-history-live")
        assert r.status_code == 401

    def test_invalid_sort_by_returns_400(
            self, db_session, client, auth_headers, trip_at):
        trip_at("T1", "TLC-01", closetime=datetime.utcnow())
        r = client.get("/api/trip-history-live?sort_by=DROP_TABLE",
                       headers=auth_headers)
        assert r.status_code == 400

    def test_invalid_time_window_returns_400(
            self, db_session, client, auth_headers):
        r = client.get("/api/trip-history-live?time_window=banana",
                       headers=auth_headers)
        assert r.status_code == 400
```

**Step 2:** Run, confirm fails.

**Step 3:** Implement. Append to `operations.py`:

```python
def _row_to_dict(row, model) -> dict:
    return {c.name: getattr(row, c.name) for c in model.__table__.columns}


@router.get("/api/trip-history-live")
async def trip_history_live(
    time_window: str = Query("today"),
    source_lab: Optional[str] = Query(None),
    destination: Optional[str] = Query(None),
    shift: Optional[str] = Query(None),
    fleet_id: Optional[str] = Query(None),
    status: str = Query("all"),
    converter: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: str = Query("out_date"),
    sort_order: str = Query("desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    if sort_by not in TRIP_HISTORY_SORT_WHITELIST:
        raise HTTPException(
            400, f"sort_by must be one of {sorted(TRIP_HISTORY_SORT_WHITELIST)}"
        )

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
        ))

    total = qry.count()
    col = getattr(WbatnglTripMirror, sort_by)
    order = col.desc() if sort_order == "desc" else col.asc()
    trips = (qry.order_by(order)
                .offset((page - 1) * page_size)
                .limit(page_size)
                .all())

    # No per-row enrichment yet — Task 2.12 adds it.
    rows = [{
        **_row_to_dict(t, WbatnglTripMirror),
        "match_status": None,
        "first_heat_no": None,
        "matched_heat_count": 0,
        "matched_hotmetal_total_mt": None,
        "weight_delta_pct": None,
    } for t in trips]

    return {
        "rows": rows,
        "page": page,
        "page_size": page_size,
        "total": total,
        "last_sync_at": _last_sync_at(db),
    }
```

**Step 4:** Run, confirm pass.

Run: `pytest backend/tests/test_operations_endpoints.py::TestTripHistoryLiveBasic -v`
Expected: 6 passed.

**Step 5:** Commit.

```bash
git add backend/routes/operations.py backend/tests/test_operations_endpoints.py
git commit -m "feat(ops-live): /api/trip-history-live basic listing + pagination + filter scaffolding"
```

---

### Task 2.12: TDD — match_status + heat enrichment per row

**Files:**
- Modify: `backend/tests/test_operations_endpoints.py`
- Modify: `backend/routes/operations.py`

**Step 1:** Append tests:

```python
class TestTripHistoryLiveEnrichment:
    def test_match_status_complete(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow() - timedelta(minutes=20)
        trip_at("T1", "TLC-22", closetime=t, net_weight=368.0)
        heat_at("D1", "TLC-22", torpedo_in_time=t + timedelta(minutes=5),
                hotmetal_qty=170.0)
        heat_at("E1", "TLC-22", torpedo_in_time=t + timedelta(minutes=15),
                hotmetal_qty=180.0)
        r = client.get("/api/trip-history-live?time_window=30d",
                       headers=auth_headers)
        row = next(r_ for r_ in r.json()["rows"] if r_["trip_id"] == "T1")
        assert row["match_status"] == "complete"
        assert row["first_heat_no"] == "D1"
        assert row["matched_heat_count"] == 2
        assert row["matched_hotmetal_total_mt"] == 350.0
        # (350 - 368)/368 ~= -4.9%
        assert -5.5 < row["weight_delta_pct"] < -4.0

    def test_match_status_awaiting_pour(
            self, db_session, client, auth_headers, trip_at):
        t = datetime.utcnow() - timedelta(minutes=20)
        trip_at("T1", "TLC-22", closetime=t, net_weight=368.0)
        r = client.get("/api/trip-history-live?time_window=30d",
                       headers=auth_headers)
        row = next(r_ for r_ in r.json()["rows"] if r_["trip_id"] == "T1")
        assert row["match_status"] == "awaiting_pour"
        assert row["first_heat_no"] is None
        assert row["matched_heat_count"] == 0

    def test_match_status_in_flight(
            self, db_session, client, auth_headers, trip_at):
        # closetime None → trip still in flight
        t = datetime.utcnow()
        trip_at("T1", "TLC-22", closetime=None, out_date=t,
                net_weight=368.0, updated_date=t)
        r = client.get("/api/trip-history-live?time_window=30d",
                       headers=auth_headers)
        row = next(r_ for r_ in r.json()["rows"] if r_["trip_id"] == "T1")
        assert row["match_status"] == "in_flight"

    def test_match_status_anomaly(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow() - timedelta(minutes=20)
        trip_at("T1", "TLC-22", closetime=t, net_weight=368.0)
        # +44 MT = +12% → anomaly
        heat_at("D1", "TLC-22", torpedo_in_time=t + timedelta(minutes=5),
                hotmetal_qty=412.0)
        r = client.get("/api/trip-history-live?time_window=30d",
                       headers=auth_headers)
        row = next(r_ for r_ in r.json()["rows"] if r_["trip_id"] == "T1")
        assert row["match_status"] == "anomaly"

    def test_status_filter_complete(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow() - timedelta(minutes=20)
        trip_at("T_DONE", "TLC-22", closetime=t, net_weight=368.0)
        heat_at("D1", "TLC-22", torpedo_in_time=t + timedelta(minutes=5),
                hotmetal_qty=350.0)
        trip_at("T_WAIT", "TLC-23", closetime=t, net_weight=368.0)
        r = client.get(
            "/api/trip-history-live?time_window=30d&status=complete",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert "T_DONE" in ids and "T_WAIT" not in ids

    def test_converter_filter(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow() - timedelta(minutes=20)
        trip_at("T_D", "TLC-22", closetime=t, net_weight=368.0)
        heat_at("D1", "TLC-22", torpedo_in_time=t + timedelta(minutes=5),
                hotmetal_qty=350.0, converter_no="D")
        trip_at("T_E", "TLC-23", closetime=t, net_weight=368.0)
        heat_at("E1", "TLC-23", torpedo_in_time=t + timedelta(minutes=5),
                hotmetal_qty=350.0, converter_no="E")
        r = client.get(
            "/api/trip-history-live?time_window=30d&converter=D",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert ids == {"T_D"}
```

**Step 2:** Run, confirm fails (match_status still None).

**Step 3:** Implement the enrichment + status/converter filtering. Refactor the rows building in `trip_history_live`:

```python
    # Per-row enrichment — pull matched heats once per page; small N (≤200).
    enriched_rows = []
    for t in trips:
        heats = find_matched_heats(db, t)
        match_count = len(heats)
        matched_total = (
            sum(float(h.hotmetal_qty) for h in heats if h.hotmetal_qty is not None)
            if heats else None
        )
        anomaly = bool(compute_anomaly_flags(
            net_weight_mt=float(t.net_weight) if t.net_weight is not None else None,
            matched_total_mt=matched_total,
        ))
        if t.closetime is None:
            ms = "in_flight"
        elif match_count == 0:
            ms = "awaiting_pour"
        elif anomaly:
            ms = "anomaly"
        else:
            ms = "complete"
        weight_delta_pct = None
        if matched_total is not None and t.net_weight:
            weight_delta_pct = ((matched_total - float(t.net_weight))
                                / float(t.net_weight)) * 100.0
        enriched_rows.append({
            **_row_to_dict(t, WbatnglTripMirror),
            "match_status": ms,
            "first_heat_no": heats[0].heat_no if heats else None,
            "matched_heat_count": match_count,
            "matched_hotmetal_total_mt": matched_total,
            "weight_delta_pct": (
                round(weight_delta_pct, 2)
                if weight_delta_pct is not None else None
            ),
            "_matched_converters": {h.converter_no for h in heats if h.converter_no},
        })

    # Post-filter by status / converter (could be pushed down to SQL later,
    # but small N + correctness-first for v1).
    if status != "all":
        enriched_rows = [r for r in enriched_rows if r["match_status"] == status]
    if converter and converter != "all":
        enriched_rows = [r for r in enriched_rows
                         if converter in r["_matched_converters"]]
    for r in enriched_rows:
        r.pop("_matched_converters", None)
```

Replace `"rows": rows,` with `"rows": enriched_rows,` and update `total` to `total = len(enriched_rows)` only when post-filtering is active — but careful: pagination already applied. For v1 simplicity, when `status` or `converter` filter is used we recompute `total` after enrichment:

```python
    final_total = total if (status == "all" and (not converter or converter == "all")) else len(enriched_rows)

    return {
        "rows": enriched_rows,
        "page": page,
        "page_size": page_size,
        "total": final_total,
        "last_sync_at": _last_sync_at(db),
    }
```

**Caveat to document in the code:** `status` and `converter` filters narrow the *current page* (because we enrich post-pagination). For v1 this is acceptable — the page size cap of 200 keeps the visible window large enough; we'll move filtering down to SQL in Phase 5 if it becomes pain.

**Step 4:** Run, confirm pass.

Run: `pytest backend/tests/test_operations_endpoints.py::TestTripHistoryLiveEnrichment -v`
Expected: 6 passed.

**Step 5:** Commit.

```bash
git add backend/routes/operations.py backend/tests/test_operations_endpoints.py
git commit -m "feat(ops-live): trip-history-live row enrichment + status/converter filters"
```

---

### Task 2.13: TDD — filter params (producer/consumer/shift/torpedo/search)

The basic `source_lab` / `destination` / `shift` / `fleet_id` / `q` filters were scaffolded in 2.11 but not exercised. Add tests now.

**Files:**
- Modify: `backend/tests/test_operations_endpoints.py`

**Step 1:** Append:

```python
class TestTripHistoryLiveFilters:
    @pytest.fixture
    def seeded(self, db_session, trip_at):
        t = datetime.utcnow() - timedelta(minutes=30)
        trip_at("BF3_SMS3", "TLC-22", closetime=t,
                source_lab="BF3", destination="SMS3", shift="A")
        trip_at("BF4_SMS2", "TLC-23",
                closetime=t + timedelta(minutes=1),
                source_lab="BF4", destination="SMS2", shift="B")
        trip_at("BF3_SMS2", "TLC-22",
                closetime=t + timedelta(minutes=2),
                source_lab="BF3", destination="SMS2", shift="C")
        return None

    def test_source_lab_filter(self, seeded, client, auth_headers):
        r = client.get(
            "/api/trip-history-live?time_window=30d&source_lab=BF3",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert ids == {"BF3_SMS3", "BF3_SMS2"}

    def test_destination_filter(self, seeded, client, auth_headers):
        r = client.get(
            "/api/trip-history-live?time_window=30d&destination=SMS2",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert ids == {"BF4_SMS2", "BF3_SMS2"}

    def test_shift_filter(self, seeded, client, auth_headers):
        r = client.get(
            "/api/trip-history-live?time_window=30d&shift=A",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert ids == {"BF3_SMS3"}

    def test_fleet_id_filter(self, seeded, client, auth_headers):
        r = client.get(
            "/api/trip-history-live?time_window=30d&fleet_id=TLC-22",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert ids == {"BF3_SMS3", "BF3_SMS2"}

    def test_search_matches_trip_id(self, seeded, client, auth_headers):
        r = client.get(
            "/api/trip-history-live?time_window=30d&q=BF4",
            headers=auth_headers,
        )
        ids = {r_["trip_id"] for r_ in r.json()["rows"]}
        assert "BF4_SMS2" in ids

    def test_all_value_treats_as_no_filter(self, seeded, client, auth_headers):
        r = client.get(
            "/api/trip-history-live?time_window=30d&source_lab=all",
            headers=auth_headers,
        )
        assert r.json()["total"] == 3
```

**Step 2:** Run, confirm pass (no new implementation — the scaffolding in 2.11 already covers these).

Run: `pytest backend/tests/test_operations_endpoints.py::TestTripHistoryLiveFilters -v`
Expected: 6 passed. If any fail, the 2.11 scaffolding has a bug.

**Step 3:** Commit (test-only).

```bash
git add backend/tests/test_operations_endpoints.py
git commit -m "test(ops-live): exhaustive filter tests for trip-history-live"
```

---

## Batch D — Trip detail endpoint (3 tasks)

### Task 2.14: TDD — `GET /api/trip-history-live/:trip_id` skeleton

**Files:**
- Modify: `backend/tests/test_operations_endpoints.py`
- Modify: `backend/routes/operations.py`

**Step 1:** Append tests:

```python
class TestTripDetailSkeleton:
    def test_returns_shape(self, db_session, client, auth_headers, trip_at):
        trip_at("T1", "TLC-22",
                closetime=datetime.utcnow() - timedelta(minutes=10))
        r = client.get("/api/trip-history-live/T1", headers=auth_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("trip", "matched_heats", "current_torpedo_position",
                    "anomaly_flags", "last_sync_at"):
            assert key in body
        assert body["trip"]["trip_id"] == "T1"

    def test_404_for_unknown_trip(self, db_session, client, auth_headers):
        r = client.get("/api/trip-history-live/NOPE", headers=auth_headers)
        assert r.status_code == 404

    def test_unauthenticated_rejected(self, client):
        r = client.get("/api/trip-history-live/T1")
        assert r.status_code == 401
```

**Step 2:** Run, confirm fails (404 routing).

**Step 3:** Implement (append to `operations.py`):

```python
@router.get("/api/trip-history-live/{trip_id}")
async def trip_history_live_detail(
    trip_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    cache_key = f"{CACHE_KEY_TRIP_DETAIL}:{trip_id}"
    cached = fleet_cache.get(cache_key)
    if cached is not None:
        return cached

    trip = (
        db.query(WbatnglTripMirror)
        .filter(WbatnglTripMirror.trip_id == trip_id)
        .first()
    )
    if trip is None:
        raise HTTPException(404, f"Trip not found: {trip_id}")

    heats = find_matched_heats(db, trip)
    matched_total = (
        sum(float(h.hotmetal_qty) for h in heats if h.hotmetal_qty is not None)
        if heats else None
    )
    flags = compute_anomaly_flags(
        net_weight_mt=float(trip.net_weight) if trip.net_weight is not None else None,
        matched_total_mt=matched_total,
    )

    # Latest fleet_live_locations row for the torpedo.
    current_pos = None
    if trip.fleet_id:
        latest = (
            db.query(FleetLiveLocation)
            .filter(FleetLiveLocation.fleet_id == trip.fleet_id)
            .order_by(FleetLiveLocation.last_updated.desc())
            .first()
        )
        if latest:
            current_pos = _row_to_dict(latest, FleetLiveLocation)

    payload = {
        "trip": _row_to_dict(trip, WbatnglTripMirror),
        "matched_heats": [_row_to_dict(h, HtsHeatMirror) for h in heats],
        "current_torpedo_position": current_pos,
        "anomaly_flags": flags,
        "last_sync_at": _last_sync_at(db),
    }
    try:
        fleet_cache.set(cache_key, payload, TRIP_DETAIL_CACHE_TTL_SEC)
    except Exception:
        logger.exception(
            "ops-live trip detail: cache set failed (non-fatal)"
        )
    return payload
```

**Step 4:** Run, confirm pass.

Run: `pytest backend/tests/test_operations_endpoints.py::TestTripDetailSkeleton -v`
Expected: 3 passed.

**Step 5:** Commit.

```bash
git add backend/routes/operations.py backend/tests/test_operations_endpoints.py
git commit -m "feat(ops-live): /api/trip-history-live/:trip_id skeleton + 404 + auth"
```

---

### Task 2.15: TDD — matched heats, anomaly flags, position

**Files:**
- Modify: `backend/tests/test_operations_endpoints.py`

**Step 1:** Append:

```python
class TestTripDetailContent:
    def test_matched_heats_in_order(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow() - timedelta(minutes=30)
        trip_at("T1", "TLC-22", closetime=t)
        heat_at("E_LATER", "TLC-22",
                torpedo_in_time=t + timedelta(minutes=20))
        heat_at("D_EARLIER", "TLC-22",
                torpedo_in_time=t + timedelta(minutes=5))
        r = client.get("/api/trip-history-live/T1", headers=auth_headers)
        heats = r.json()["matched_heats"]
        assert [h["heat_no"] for h in heats] == ["D_EARLIER", "E_LATER"]

    def test_anomaly_flag_present_when_threshold_exceeded(
            self, db_session, client, auth_headers, trip_at, heat_at):
        t = datetime.utcnow() - timedelta(minutes=20)
        trip_at("T1", "TLC-22", closetime=t, net_weight=368.0)
        heat_at("D1", "TLC-22", torpedo_in_time=t + timedelta(minutes=5),
                hotmetal_qty=412.0)
        r = client.get("/api/trip-history-live/T1", headers=auth_headers)
        flags = r.json()["anomaly_flags"]
        assert len(flags) == 1
        assert flags[0]["code"] == "weight_delta"

    def test_current_position_when_present(
            self, db_session, client, auth_headers, trip_at):
        from backend.database.models import FleetLiveLocation
        t = datetime.utcnow() - timedelta(minutes=10)
        trip_at("T1", "TLC-22", closetime=t)
        db_session.add(FleetLiveLocation(
            fleet_id="TLC-22", type="Moving", x=12.3, y=45.6,
            last_updated=datetime.utcnow(),
        ))
        db_session.commit()
        r = client.get("/api/trip-history-live/T1", headers=auth_headers)
        pos = r.json()["current_torpedo_position"]
        assert pos["fleet_id"] == "TLC-22"
        assert pos["type"] == "Moving"

    def test_current_position_null_when_absent(
            self, db_session, client, auth_headers, trip_at):
        t = datetime.utcnow() - timedelta(minutes=10)
        trip_at("T1", "TLC-NO-LOC", closetime=t)
        r = client.get("/api/trip-history-live/T1", headers=auth_headers)
        assert r.json()["current_torpedo_position"] is None
```

**Step 2:** Run, confirm pass (logic was implemented in 2.14 — these just verify it).

Run: `pytest backend/tests/test_operations_endpoints.py::TestTripDetailContent -v`
Expected: 4 passed.

**Step 3:** Commit (test-only).

```bash
git add backend/tests/test_operations_endpoints.py
git commit -m "test(ops-live): trip detail content tests — heats order, anomaly, position"
```

---

### Task 2.16: TDD — full test sweep + integration smoke

**Files:**
- Modify: git only

**Step 1:** Run the entire ops-live test file:

Run: `pytest backend/tests/test_operations_endpoints.py -v`
Expected: all green (~30+ tests).

**Step 2:** Run the full backend suite to confirm no regressions:

Run: `pytest backend/ -q 2>&1 | tail -5`
Expected: previous baseline (~268) + new ops-live tests, all passing.

**Step 3:** Smoke-test the app starts:

Run: `python -c "from backend.main import app; print(len(app.routes))"`
Expected: prints an integer larger than before (3 new routes added). No traceback.

No commit needed unless a regression is found and fixed.

---

## Batch E — Docs, handover, push (3 tasks)

### Task 2.17: Update `changes_tracker.md`

**Files:**
- Modify: `Development/Version_07/changes_tracker.md`

**Step 1:** Append entries #64-#66 (or whatever the next free numbers are — check the current max):

```markdown
| 64 | 2026-05-12 ... | backend/routes/operations.py + backend/main.py | (did not exist) | New module: route file + 3 endpoints. Registered in main.py after jsw.router. | Phase 2 of operations-live sprint — backend API layer for the new pages | Per implementation plan 2026-05-12-operations-live-phase-2.md | Skeleton + helpers (_time_window_to_cutoff, find_matched_heats, compute_anomaly_flags) + 3 endpoints (dashboard, trip-history-live list, trip-history-live detail). All endpoints behind get_current_user_required. Dashboard payload cached 5s (fleet_cache, matches jsw_dashboard precedent); trip detail cached 10s |
| 65 | 2026-05-12 ... | backend/tests/test_operations_endpoints.py | (did not exist) | New test file: ~30 tests across helpers + 3 endpoints | Coverage for Phase 2 | TDD-driven from the implementation plan | Tests use the conftest db_session/auth_headers fixtures + new trip_at/heat_at row-factory fixtures local to this file. Cross-dialect (no PG-only SQL); SQLite-compatible match-window via Python timedelta arithmetic |
| 66 | 2026-05-12 ... | (no file change) | n/a | Baseline test count goes from 268 → ~300 with the new ops-live tests | Phase 2 completion checkpoint | n/a | n/a |
```

**Step 2:** Commit.

```bash
git add Development/Version_07/changes_tracker.md
git commit -m "docs(tracker): #64-#66 — Phase 2 ops-live API endpoints"
```

---

### Task 2.18: Handover folder + push (together)

**Files:**
- Create: `handover/2026-05-12-operations-live-phase-2/` mirror

**Step 1:** Create the directory structure and copy files:

```bash
mkdir -p handover/2026-05-12-operations-live-phase-2/backend/routes
mkdir -p handover/2026-05-12-operations-live-phase-2/backend/tests
mkdir -p handover/2026-05-12-operations-live-phase-2/docs/plans

cp Development/Version_07/backend/routes/operations.py    handover/2026-05-12-operations-live-phase-2/backend/routes/
cp Development/Version_07/backend/main.py                 handover/2026-05-12-operations-live-phase-2/backend/
cp Development/Version_07/backend/tests/test_operations_endpoints.py  handover/2026-05-12-operations-live-phase-2/backend/tests/
cp Development/Version_07/docs/plans/2026-05-12-operations-live-phase-2.md  handover/2026-05-12-operations-live-phase-2/docs/plans/
```

**Step 2:** Write `handover/2026-05-12-operations-live-phase-2/README.md`. Match the format of `handover/2026-05-12-operations-live-phase-1/README.md`. Cover:

- **What's in this handover** — 3 new endpoints, the route file, the test file, the main.py edit, the plan doc
- **Deploy steps** — `git pull` on SMS4 → no migration needed (Phase 1 already added the tables) → restart backend
- **Verify** — `curl http://localhost:8000/api/operations-live/dashboard` with a valid JWT, should return 200 with the documented shape
- **Rollback** — remove the `app.include_router(operations.router)` line from `main.py`; the route file is harmless if left in place

**Step 3:** Commit + push (handover + push happen together per the user-feedback workflow):

```bash
git add handover/2026-05-12-operations-live-phase-2/
git commit -m "handover: Phase 2 ops-live API endpoints"
git push new-origin sprint-3-operations-live
git push origin sprint-3-operations-live
```

---

### Task 2.19: SMS4 deploy verification (user-driven)

**This task is user-driven** — you (the assistant) cannot SSH to SMS4 from the DSI laptop. Hand off to the user with:

> "Phase 2 pushed. To deploy on SMS4:
>
> ```
> cd C:\Users\v_subramanya.gopal\Desktop\HMD
> git pull
> .venv\Scripts\activate.bat
> # No new migration required — Phase 1 already added the tables.
> # If alembic current is bf02ec626f86, also apply the hotfix:
> cd backend && python -m alembic upgrade head && cd ..
> # Restart backend (Ctrl+C the existing uvicorn, restart)
> ```
>
> Then verify:
> ```
> curl -H "Authorization: Bearer <your-jwt>" http://localhost:8000/api/operations-live/dashboard
> ```
> Expected: 200 with `{kpi_strip, converters[6], active_trips, activity_feed, last_sync_at}`.
>
> Paste the output back and I'll confirm or troubleshoot."

End of Phase 2. Phase 3 plan (Page 1 frontend) gets written next, after user confirms Phase 2 endpoints work on SMS4.

---

## Done-Definition for Phase 2

- [ ] `backend/routes/operations.py` exists with 3 endpoints
- [ ] All ~30 new tests in `test_operations_endpoints.py` pass
- [ ] Full backend suite passes (~268 prior + new ≈ 300)
- [ ] Router registered in `backend/main.py`
- [ ] `changes_tracker.md` entries #64-#66 added
- [ ] Handover folder created with README
- [ ] Pushed to `new-origin` AND `origin`
- [ ] User confirms 200 response from `/api/operations-live/dashboard` on SMS4

---

## Notes for the implementer

- **Cross-dialect rule**: the test conftest uses SQLite in-memory, production is PostgreSQL. NEVER use `INTERVAL '...minutes'` syntax in endpoint code (only allowed in alembic migrations targeting PG). Use Python `timedelta` arithmetic, which both dialects accept as parameter binding.
- **Cache invalidation**: dashboard cache TTL is intentionally short (5s) — no manual invalidation needed for v1. If we add a manual `POST /api/operations-live/refresh` later (like `/api/jsw/sync-now`), it should `fleet_cache.invalidate_pattern(CACHE_KEY_DASHBOARD)`.
- **`FleetLiveLocation.type` vs `.status`**: the model's `type` column carries the SuVeechi status string ("Idle", "Moving", etc.). Don't be confused by the name — that's just how SuVeechi presents it. See `backend/utils/suveechi_sync.py` for the upsert.
- **Performance**: `active_trip_rows` is capped at 200 candidate trips; in production the steady-state active count is <20, so this is comfortable headroom. If the cap is ever hit, log a warning and revisit.
- **`v_trip_heat_story` view**: not used by endpoint code in this phase. The view stays in the migration for future use cases (DB shells, ad-hoc reporting). Endpoint code does the join in Python so SQLite tests work.
