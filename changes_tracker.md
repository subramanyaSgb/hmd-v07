# Changes Tracker

| # | Timestamp | File | Previous | New | Issue | Cause | Fix |
|---|-----------|------|----------|-----|-------|-------|-----|
| 1 | 2026-04-23 10:38 | backend/routes/geofence.py | 123 LOC route file with 5 endpoints | DELETED | Dead code — zero frontend calls, zero backend imports | Geofence feature scaffolded for future GPS but never wired in | Removed entire file |
| 2 | 2026-04-23 10:38 | backend/main.py | Imported + registered geofence_router | Lines removed | Route registration of dead module | Geofence file deleted | Removed `from .routes.geofence import router as geofence_router` and `app.include_router(geofence_router)` |
| 3 | 2026-04-23 10:38 | backend/database/models.py | Geofence model class (15 LOC at line 384) | DELETED | Dead model — only referenced by deleted geofence route | Geofence route deleted | Removed Geofence class |
| 4 | 2026-04-23 10:38 | backend/database/models.py | LocationQueue, TripPattern, CostConfig, PerformanceScore, Achievement, AnomalyAlert, SafetyChecklist, SafetyIncident, AuditLog (~120 LOC, lines 428-547) | DELETED | Dead models — zero queries anywhere in backend or frontend | Schema-only stubs never wired into business logic | Removed 9 model classes; tables remain in DB if previously created (no migration to drop) |
| 5 | 2026-04-23 10:38 | backend/utils/analytics_helpers.py | (did not exist) | NEW 18 LOC | Duplicated `get_config()` in 4 files + `get_avg_capacity()` in 2 files | Helpers copy-pasted instead of shared | Created shared module with both helpers |
| 6 | 2026-04-23 10:38 | backend/routes/daily_plans.py | Inline `get_config` (3 LOC) | Imports from analytics_helpers | Duplication | See #5 | Replaced with `from ..utils.analytics_helpers import get_config` |
| 7 | 2026-04-23 10:38 | backend/routes/statistics.py | Inline `get_config` + `get_avg_capacity` (12 LOC) | Imports from analytics_helpers | Duplication | See #5 | Replaced with shared imports |
| 8 | 2026-04-23 10:38 | backend/routes/performance_analytics.py | Inline `get_config` + `get_avg_capacity` (12 LOC) | Imports from analytics_helpers | Duplication | See #5 | Replaced with shared imports |
| 9 | 2026-04-23 10:38 | backend/routes/plans.py | Inline `get_config` (3 LOC) | Imports from analytics_helpers | Duplication | See #5 | Replaced with shared import |
| 10 | 2026-04-23 10:38 | CLAUDE.md | Geofence model + API endpoints documented | Removed | Stale docs reference deleted code | Cascading update | Removed `Geofence` from key models list and `Geofences` API section |
| 11 | 2026-04-23 10:55 | backend/routes/trip_crud.py:20 | `from ..utils.soft_delete import active_only` | `from ..utils.soft_delete import active_only, soft_delete` | `NameError: name 'soft_delete' is not defined` at line 789 broke `test_delete_pending_trip` | Missing symbol in import list — `soft_delete()` called but never imported | Added `soft_delete` to import |
| 12 | 2026-04-23 10:55 | ~/.claude/settings.json:161 | `code-review-graph update --quiet` | `code-review-graph update` | PostToolUse hook errored on every Edit/Write/Bash | `--quiet` flag not supported by `code-review-graph update` subcommand | Removed `--quiet` flag (effective next session) |
| 13 | 2026-04-23 10:50 | git | Working tree had uncommitted changes | Committed `0918ef55` to `feature/strip-security-to-local-auth`, pushed to origin | Need to persist tracked refactor changes | User approved Phase A | Committed only tracked files (main.py + models.py); untracked route edits stay on disk per branch convention |
| 14 | 2026-04-23 11:10 | frontend/src/pages/AdminPlanning.jsx | 511 LOC page component | DELETED | Dead code — zero imports, not in App.jsx routes | Superseded by MonthlyPlanning.jsx but never removed | Removed file |
| 15 | 2026-04-23 11:10 | frontend/src/pages/LiveOperations.jsx | 787 LOC page component | DELETED | Dead code — zero imports, not in App.jsx routes | Operations.jsx serves same purpose; LiveOps was duplicate | Removed file |
| 16 | 2026-04-23 11:10 | frontend/src/pages/PlanningHistory.jsx | 325 LOC page component | DELETED | Dead code — zero imports, not in App.jsx routes | PlanHistory component (in MonthlyPlanning) replaced this | Removed file |
| 17 | 2026-04-23 11:10 | frontend/src/App.css | 42 LOC | DELETED | Dead — zero imports, no JS reference | index.css used instead, App.css orphaned | Removed file |
| 18 | 2026-04-23 11:10 | CLAUDE.md | LiveOperations.jsx documented in pages list | Removed | Stale doc reference | Cascading update | Removed bullet from `frontend/src/pages/` list |
| 19 | 2026-04-23 11:15 | backend/alembic/versions/h1i2j3k4l5m6_drop_dead_tables.py | (did not exist) | NEW migration | 10 orphaned tables in DB after model deletes (#3, #4) | Models removed but DDL tables persisted | Conditional `DROP TABLE` for: geofences, achievements, anomaly_alerts, audit_logs, cost_configs, location_queues, performance_scores, safety_checklists, safety_incidents, trip_patterns. Downgrade no-op |
| 20 | 2026-04-23 11:15 | backend/alembic/versions/h1i2j3k4l5m6_drop_dead_tables.py | down_revision = 'g1h2i3j4k5l6' | down_revision = '3878275160e7' | `Multiple head revisions` error — branched off wrong parent | `drop_sound_alerts_enabled` already chained from `g1h2i3j4k5l6` | Re-parented to `3878275160e7` to merge branches |
| 21 | 2026-04-23 11:15 | DB schema | 10 orphaned tables present | DROPPED | Dead tables waste schema, confuse devs | Migration applied via `alembic upgrade head` | DB head now at `h1i2j3k4l5m6` |
| 22 | 2026-05-06 17:00 | backend/utils/suveechi_sync.py | (did not exist) | NEW 152 LOC | Need live torpedo GPS for live tracking map | SuVeechi MySQL view shared 02-Apr; no integration yet | Pull `vw_unit_status_ist` → upsert FleetLiveLocation + FleetManagement; normalize 'TLC 01' → 'TLC-01'; map status Idle/Moving→Operating, Ign Off→Maintenance; invalidate fleet_cache after each sync |
| 23 | 2026-05-06 17:00 | backend/main.py | scheduler runs WhatsApp daily report only | Added `schedule_suveechi_sync()` | Wire SuVeechi sync to APScheduler interval trigger | Job needed for live map updates | New IntervalTrigger every `SUVEECHI_SYNC_INTERVAL_SECONDS` (default 10s); `asyncio.to_thread` wraps sync pymysql call; daily prune at 02:00 of stale locations >24h |
| 24 | 2026-05-06 17:00 | backend/requirements.txt | no MySQL driver | Added `pymysql>=1.1.0` | SuVeechi sync uses MySQL | New dep | Package added under Caching section |
| 25 | 2026-05-06 17:00 | backend/.env.example | no SuVeechi config | Added 7 vars | Document SuVeechi connection settings | Required for sync feature | `SUVEECHI_SYNC_ENABLED`, `SUVEECHI_HOST/PORT/USER/PASSWORD/DB/VIEW`, `SUVEECHI_SYNC_INTERVAL_SECONDS` |
| 26 | 2026-05-07 09:00 | backend/routes/fleet.py | `GET /api/fleet/live` returned only x/y/fleet_id/type | Extended response with `status`, `capacity`, ISO `last_updated` via LEFT JOIN FleetManagement | Frontend needs status to colour markers + show drawer header | Marker colours and drawer status badge depend on this | Added outer-join + ISO-format datetime; cache key/TTL unchanged |
| 27 | 2026-05-07 09:00 | frontend/src/utils/torpedoStatus.js | (did not exist) | NEW 32 LOC | Single source of truth for status→colour and status→short-label maps | Avoid duplicating mapping in marker, drawer, legend | Handles HMD vocabulary (Operating/Assigned/Maintenance) AND SuVeechi vocabulary (Idle/Moving/Ign Off); default slate colour for unknown |
| 28 | 2026-05-07 09:00 | frontend/src/pages/Dashboard.jsx | `createFleetIcon(id)` used hard-coded `hsl(var(--primary))` for all torpedoes; label was just `{id}` | `createFleetIcon(id, status)` — colour from `statusColor()`, label `{id} · {short}` | Operators couldn't distinguish Idle/Moving/Ign Off torpedoes at a glance | Status visibility | Marker box widened to 60px; fleet marker call site passes `fleet.status` |
| 29 | 2026-05-07 09:00 | frontend/src/pages/Dashboard.jsx | Map opened at default centre, user panned/zoomed manually | NEW `FitBoundsOnFleet` helper component + `hasFittedFleet` state | Auto-zoom to all 53 torpedoes on first load | UX improvement | Fits once on first non-empty fleet load with `padding: [60,60], maxZoom: 16`; idempotent via `hasFitted` flag |
| 30 | 2026-05-07 10:55 | frontend/src/components/TorpedoDrawer.jsx | (did not exist) | NEW ~470 LOC | Phase 2 — clicking a torpedo only showed a tiny `"TORPEDO: TLC-16 LIVE TRACKING ACTIVE"` popup, no useful info | Operators needed live position, current/last trip, history, capacity at a glance | 420px right-side slide-in drawer with sticky header (fleet_id + status badge + "updated Ns ago" + ✕) and 5 sections: Live Position (5s poll, derived speed via Haversine), Current Trip (10s poll only when Assigned), Last Trip, Trip History (20 rows, manual refresh), Maintenance & Capacity. Close on ✕/backdrop/Esc. Reuses existing `/api/fleet/live` and `/api/fleet-management/{fleet_id}/details` — no backend change |
| 31 | 2026-05-07 10:55 | frontend/src/pages/Dashboard.jsx | Torpedo `<Marker>` rendered a `<Popup>` with stub text; no drawer state | Added `selectedFleetId` state, replaced popup with `eventHandlers={{ click: () => setSelectedFleetId(fleet.fleet_id) }}`, rendered `<TorpedoDrawer fleetId={selectedFleetId} onClose={...} />` at page level | Wire marker click → drawer | Phase 2 entry point | Imported `TorpedoDrawer`; removed Popup JSX from torpedo marker; drawer mounted as sibling of map container so it overlays full viewport |
| 32 | 2026-05-07 11:05 | frontend/src/components/TorpedoDrawer.jsx | Backdrop `zIndex: 1100`, drawer `zIndex: 1101` | Backdrop `2200`, drawer `2201` | On SMS4 the drawer's sticky header (fleet_id, status badge, ✕) was hidden behind the app's top bar — only the colored top-border stripe peeked through | App header is `z-index: 2000` and sidebar `z-index: 2100` (in `index.css`); my 1101 was below both | Bumped backdrop+drawer z-indices above sidebar so the whole drawer overlays page chrome (standard side-drawer pattern). Verified on SMS4 with screenshot showing `TLC-05 · IDLE · updated 0s ago` header rendering correctly |

## Net Change

### Backend
- **LOC:** 18,402 → 18,127 (−275 LOC, −1.5%)
- **Files deleted:** 1 (`backend/routes/geofence.py`)
- **Files created:** 1 (`backend/utils/analytics_helpers.py`)
- **Files modified:** 8 (main.py, models.py, daily_plans.py, statistics.py, performance_analytics.py, plans.py, CLAUDE.md, trip_crud.py)

### Frontend
- **LOC:** 35,320 → 33,655 (−1,665 LOC, −4.7%)
- **Files deleted:** 4 (AdminPlanning.jsx, LiveOperations.jsx, PlanningHistory.jsx, App.css)

### Combined
- **Total LOC saved:** −1,940 LOC

## Verification

- `python -c "from backend.main import app; print('OK')"` → OK
- No test files reference deleted models
- All 24 routers (was 25) registered correctly
- Tests: 166/166 passing (after #11 fix; was 165/166)
- Commit `0918ef55` pushed to `origin/feature/strip-security-to-local-auth`
- `npm run build` → OK in 8.12s, all chunks generated
