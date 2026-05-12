# Handover — Operations Live Phase 2 (Backend API)

**Date:** 2026-05-12
**Branch:** `sprint-3-operations-live`
**HEAD at handover:** Phase 2 final commit (see `git log --oneline 2745c30..HEAD`)
**Phase:** 2 of 5 in the Operations Live sprint (Phase 1 = HTS sync backend; Phase 2 = API endpoints; Phases 3-5 = frontend)

---

## What's in this handover

Three new HTTP endpoints powering the Operations Live cockpit (Page 1) and Trip History Live (Page 2):

1. `GET /api/operations-live/dashboard` — 5s cached. Returns:
   `{ kpi_strip, converters[6], active_trips, activity_feed, last_sync_at }`.
   Drives the Page 1 real-time cockpit.

2. `GET /api/trip-history-live` — paginated, filtered (date range, status, converter, search). Drives the Page 2 trip-history table.

3. `GET /api/trip-history-live/:trip_id` — 10s cached. Returns trip detail + matched heats (closetime −15 min .. +90 min window) + current position. Drives the Page 2 detail drawer.

All endpoints behind `get_current_user_required` (JWT).

### Files in this folder (mirror of `Development/Version_07/`)

```
backend/
  main.py                              # router registered after jsw.router
  routes/operations.py                 # 594 LOC: 3 endpoints + helpers + constants
  tests/test_operations_endpoints.py   # 684 LOC: 60 tests across 11 classes
docs/plans/
  2026-05-12-operations-live-phase-2.md  # spec for Batches A-E of this phase
README.md                              # this file
```

### Commits in this handover (14 commits, baseline `2745c30`)

```
a016317  feat(ops-live): route file skeleton with shared constants
d8cdd1b  feat(ops-live): _time_window_to_cutoff + tests
94b9e8d  feat(ops-live): find_matched_heats + tests
e921228  feat(ops-live): compute_anomaly_flags + tests
6bbf04a  feat(ops-live): /api/operations-live/dashboard skeleton + 401 + empty-shape tests
723615e  feat(ops-live): populate kpi_strip — production/consumption/active/heats/idle + tests
f08938c  feat(ops-live): converters[6] — IDLE/HEAT_IN_PROGRESS + tests
a9d9031  feat(ops-live): active_trips section + current_status from fleet_live + tests
5aec3f5  feat(ops-live): activity_feed + cache test + completes dashboard endpoint
3526020  feat(ops-live): /api/trip-history-live basic listing + pagination + filter scaffolding
1004ec7  feat(ops-live): trip-history-live row enrichment + status/converter filters
374bbb9  test(ops-live): exhaustive filter tests for trip-history-live
8640dd2  feat(ops-live): /api/trip-history-live/:trip_id skeleton + 404 + auth
de2491f  test(ops-live): trip detail content tests — heats order, anomaly, position
```

Plus the tracker commit (`docs(tracker): #64-#66 — Phase 2 ops-live API endpoints`) and this handover commit (`handover: Phase 2 ops-live API endpoints`).

---

## Deploy steps (on SMS4)

```bat
cd C:\Users\v_subramanya.gopal\Desktop\HMD
git pull
.venv\Scripts\activate.bat

REM No new migration is strictly required — Phase 1 already created hts_heat_mirror
REM and v_trip_heat_story. BUT if `alembic current` is below c3e8d219a4b1, apply
REM the index hotfix from changes_tracker #63:
cd backend
python -m alembic current
python -m alembic upgrade head
cd ..

REM Restart backend: Ctrl+C the running uvicorn, then re-run your launch script.
```

No new tables. No new columns. Phase 2 is purely a code-level addition (route file + main.py router registration). The only DB dependency is the existing `hts_heat_mirror` and `wbatngl_trip_mirror` tables that Phase 1 already created.

---

## Verify (curl on SMS4 PC)

After restart, with a valid JWT in hand:

```bat
set TOKEN=<paste-jwt-here>

curl -H "Authorization: Bearer %TOKEN%" http://localhost:8000/api/operations-live/dashboard
```

**Expected:** HTTP 200 with JSON body shaped:

```json
{
  "kpi_strip": {
    "production_mt_today": ...,
    "consumption_mt_today": ...,
    "active_trips": ...,
    "heats_today": ...,
    "idle_torpedos": ...
  },
  "converters": [
    {"letter": "A", "status": "IDLE" | "HEAT_IN_PROGRESS", ...},
    ... 6 cards (A-F) ...
  ],
  "active_trips": [ ... ],
  "activity_feed": [ ... ],
  "last_sync_at": {
    "suveechi": "...",
    "wbatngl": "...",
    "hts": "..."
  }
}
```

Then the list and detail endpoints:

```bat
curl -H "Authorization: Bearer %TOKEN%" "http://localhost:8000/api/trip-history-live?page=1&page_size=20"

REM Expected: 200 with { items: [...], total, page, page_size, has_more }

curl -H "Authorization: Bearer %TOKEN%" http://localhost:8000/api/trip-history-live/<some-trip-id>

REM Expected: 200 with the trip detail object
REM A bogus trip_id returns 404
```

Without a JWT, all three return 401.

---

## Rollback

If anything goes wrong:

1. **Code-only rollback** (preferred): in `backend/main.py`, comment or remove the line
   `app.include_router(operations.router)` and restart. The 3 endpoints disappear; the rest of the app is untouched. The route file is harmless if left in place — it's just not registered.

2. **Hard rollback:** `git revert` the handover commit + the 14 feature commits, or `git reset --hard 2745c30` (the baseline).

No DB rollback is required for Phase 2 alone.

---

## Test counts

- **New tests in this phase:** 60 (in `backend/tests/test_operations_endpoints.py`, 11 test classes)
- **Full backend suite at HEAD `de2491f`:** **328 passed** (was 268 baseline + 60 new = 328)
- **Run locally:** `cd backend && python -m pytest -q --no-cov`
- **Known flakes:** two tests in `test_trip_validation.py` are occasionally flaky due to test-collection ordering. Pre-existing, pass in isolation, unrelated to this sprint. Ignore.

---

## Cross-dialect notes

- Endpoint code uses Python `timedelta` arithmetic only — no `INTERVAL '...minutes'` SQL. SQLite (test conftest) and PostgreSQL (production) both accept `timedelta` as a parameter binding.
- The `v_trip_heat_story` view (from Phase 1 migration `bf02ec626f86`) uses PG-only INTERVAL syntax and is **not** used by Phase 2 endpoint code. Endpoint code does the join in Python so SQLite tests pass.

---

## Tunables (constants at top of `backend/routes/operations.py`)

| Constant | Value | Meaning |
|---|---|---|
| `MATCH_WINDOW_BEFORE` | `timedelta(minutes=15)` | Heats may start up to 15 min before trip closetime |
| `MATCH_WINDOW_AFTER`  | `timedelta(minutes=90)` | Heats may start up to 90 min after trip closetime |
| `WEIGHT_ANOMALY_THRESHOLD` | `0.10` | 10% over/under-weight flags a trip as anomalous |
| `DASHBOARD_CACHE_TTL` | `5` (seconds) | Dashboard payload cache TTL |
| `TRIP_DETAIL_CACHE_TTL` | `10` (seconds) | Per-trip detail cache TTL |
| `ACTIVE_TRIPS_CAP` | `200` | Max candidate active-trip rows scanned per dashboard request (steady-state <20 in production) |

If a tunable needs to change, edit the constant and redeploy. No DB change required.

---

## Next phase

Phase 3 = Page 1 frontend (Operations Live cockpit). Plan not yet written — will be drafted after user confirms Phase 2 endpoints work on SMS4 (Task 2.19, user-driven).

---

## Update 2026-05-12 — Hotfix applied

After Phase 2 deploy on SMS4, five issues were spotted during verification and fixed in this branch. The snapshots of `backend/routes/operations.py`, `backend/main.py`, and `backend/tests/test_operations_endpoints.py` in this handover folder reflect the fixed HEAD. See `changes_tracker.md` entries #67-#71 for the full audit trail.

### Behavioural changes ops will see

- **`idle_torpedoes`** now counts from `FleetManagement.status="Operating"` (was always 0; the old query looked at `FleetLiveLocation.type`, which is hardcoded to the string `"torpedo"` and is an entity-type marker, not an operational state).
- **`active_trips[].current_status`** now reflects `FleetManagement.status` (was always `"torpedo"` for the same reason).
- **`active_trips_now` KPI** is bounded to the last 6 h IST via a new module-level constant `ACTIVE_TRIP_WINDOW_HOURS = 6` (was capped at 200 candidate rows, which would always report 200 whenever HTS was frozen because every WBATNGL trip is unmatched in that state).
- **`elapsed_minutes`** is computed in IST via a new `_now_ist_naive()` helper (`_IST_OFFSET = timedelta(hours=5, minutes=30)`). Previously the endpoint anchored "now" on `datetime.utcnow()` while WBATNGL/HTS source timestamps are IST-naive wall-clock, producing -290 min for IST-recent trips. The same helper now also drives `today_cutoff`, `feed_horizon`, the converter card's elapsed display, and `_time_window_to_cutoff`.
- **`activity_feed`** `trip_completed` summaries use ASCII `->` (was Unicode `→` U+2192, which renders as `ΓåÆ` mojibake under Windows cmd code pages CP437/CP850 — the activity feed is plain text in the SMS4 operator console).
- **`current_torpedo_position.current_status`** key on the detail endpoint — renamed from `.status` so it matches `active_trips[].current_status` (one consistent field for "what is this torpedo doing right now" across both endpoints). Added two regression tests for the new FM-lookup branch.

### Hotfix commits (5)

```
5d106a8  fix(ops-live): _now_ist_naive() helper + use IST for elapsed/today/feed_horizon
526406d  fix(ops-live): pull current_status + idle_torpedoes from FleetManagement
ba94dff  fix(ops-live): bound active_trips candidates to last 6h (ACTIVE_TRIP_WINDOW_HOURS)
5190e30  fix(ops-live): activity feed uses ASCII '->' (Windows cmd safe)
a909e38  fix(ops-live): rename position.status -> current_status + cover new FM status field with tests
```

### Deploy

Same as the Phase 2 deploy steps above: `git pull && restart backend`. No migrations, no env changes. The behaviour change is transparent to the API contract — the renamed key on the detail endpoint is effectively a NEW key because Phase 2 only just shipped, so there are no prior consumers to break.

### Test counts (post-hotfix)

- `backend/tests/test_operations_endpoints.py`: **65 tests** (was 60 at Phase 2 finish — net +5: -2 deleted in #68, +3 in #68, +1 in #69, +1 in #70, +2 in #71)
- Full backend suite: **333 passed** (was 328 at Phase 2 finish)
- App route count: **162** (unchanged)
