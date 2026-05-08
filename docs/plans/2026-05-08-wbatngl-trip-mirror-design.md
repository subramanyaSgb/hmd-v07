# Design: WBATNGL Trip Mirror + Plant Live + JSW Tab

**Date:** 2026-05-08
**Sprint label:** Sprint 2 — JSW data integration (read-only)
**Status:** Design approved by user via brainstorm session 2026-05-08
**Brainstorm reference:** Resolved 8 topics in conversation; all decisions captured below.

---

## Goal

Surface JSW's WBATNGL trip data in HMD as **two new read-only views**, without altering any existing functionality:

1. A new **JSW tab** inside the existing Trip Management page — row-level browser of WBATNGL trips with filters and search.
2. A new **Plant Live** sidebar page — aggregate dashboard showing live plant flow.

Both surfaces are observational only. Manual trip-entry, drawer, capacity sync, and all current operator workflows remain untouched.

---

## Background

After Sprint 1 (Phases 1–3) shipped, we now have:
- Live torpedo positions (SuVeechi MySQL → 53 markers on the map, 10 s sync).
- Live torpedo capacities (WBATNGL Oracle → `fleet_management.capacity`, nightly 03:00 sync).

The 2026-05-08 WBATNGL probe (`db_test_v3.py`) revealed nine accessible tables in WBATNGL holding ~1.4 M rows of historical trip data — every weighbridge crossing for every torpedo across BF3, BF4, BF5. Each row contains producer, consumer, weights, timestamps, shift, AND chemistry (TEMP, Si, S). HTS being down is a non-issue: chemistry data flows into WBATNGL's ITRO tables already.

This means we can build trip-level visibility into HMD without:
- Asking JSW for new connections.
- Replacing the manual trip-entry workflow.
- Touching the existing weighbridge-modal UI.

---

## Brainstorm decisions (the 8 topics)

| # | Topic | Decision |
|---|-------|----------|
| 1 | Architecture | **Background sync into local PG mirror table.** Decouples HMD UI from WBATNGL availability. |
| 2 | Time window | **Sync 30 days rolling. Display default = Today.** Filter chips: `Today / 24h / 7d / 30d`. |
| 3 | Sidebar item | **"Plant Live"** with `Activity` icon, **after "Live Tracking"** in the sidebar. |
| 4 | Plant Live MVP layout | **4 sections:** KPI strip (4 cards) → Producer→Consumer flow → Chemistry snapshot → Live trip feed. |
| 5 | Reconciliation with HMD trips | **Strict separation.** No links, no FK, no joins. Two parallel tables. |
| 6 | Refresh cadence | **Backend sync every 60 s. Frontend poll every 15 s.** Worst-case lag ~75 s. |
| 7 | Filtering & search | **Standard filter bar:** search box + producer chips + consumer chips + shift chips + torpedo dropdown. 50 rows/page server pagination. |
| 8 | Permissions | **All authenticated roles.** No row-level scoping. |

---

## Architecture

```
                  ┌──────────────────────┐
                  │   JSW WBATNGL        │
                  │   (Oracle, prod)     │
                  └──────────┬───────────┘
                             │ READ-ONLY pull every 60 s
                             │ (incremental: WHERE UPDATED_DATE > MAX(mirror.updated_date),
                             │  filter LADLENO LIKE 'TLC%', no joins)
                             ▼
            ┌────────────────────────────────────┐
            │  backend/utils/wbatngl_trip_sync.py│  (NEW)
            │  • thick-mode oracledb conn        │
            │  • upsert by trip_id               │
            │  • prune rows >30 d daily 03:30    │
            └────────────────┬───────────────────┘
                             │ INSERT/UPDATE
                             ▼
        ┌──────────────────────────────────────────┐
        │  PostgreSQL  →  wbatngl_trip_mirror      │  (NEW)
        │  ~30 k rows, 4 indexes                   │
        └──────────────────┬───────────────────────┘
                           │ SELECT (5 s cache on dashboard)
                           ▼
        ┌──────────────────────────────────────────┐
        │  Two new endpoints (any auth role):      │
        │  GET /api/jsw/trips        (paginated)   │
        │  GET /api/jsw/dashboard    (aggregates)  │
        └──────────────────┬───────────────────────┘
                           │ HTTP, polled every 15 s
                           ▼
        ┌──────────────────┴───────────────────────┐
        │ Frontend (React)                         │
        │ • TripManagement.jsx → new "JSW" tab     │
        │ • New page: PlantLive.jsx (route /plant) │
        │ • Sidebar: "Plant Live" + Activity icon  │
        └──────────────────────────────────────────┘
```

**Five new pieces. Zero schema changes to existing tables.** Existing systems (`fleet_management`, `trips`, `weighbridge_records`, manual trip entry, drawer, capacity sync) are untouched.

---

## Backend specification

### New table — `wbatngl_trip_mirror`

| Column | Type | Notes |
|--------|------|-------|
| `id` | SERIAL PK | |
| `trip_id` | VARCHAR(50) UNIQUE | JSW's TRIP_ID, e.g. `"74558TLC 011070526"`. UPSERT key. |
| `tap_no` | INTEGER | JSW's tap number |
| `ladleno_raw` | VARCHAR(15) | JSW's `LADLENO` exactly as stored: `"TLC 01"` |
| `fleet_id` | VARCHAR(15) | Normalised: `"TLC-01"` (joins to `fleet_management`) |
| `source_lab` | VARCHAR(10) | `"BF3"` / `"BF4"` / `"BF5"` |
| `destination` | VARCHAR(50) | `"SMS2"` / `"SMS4"` / `"RFL"` |
| `tap_hole` | INTEGER | Which tap hole at the BF |
| `gross_weight` | FLOAT | MT |
| `tare_weight` | FLOAT | MT |
| `net_weight` | FLOAT | MT |
| `temp` | FLOAT | °C; NULL when raw value is 0 |
| `si_l` | FLOAT | Si %; NULL when raw value is 0 |
| `s_l` | FLOAT | S %; NULL when raw value is 0 |
| `bds_temp` | FLOAT | °C |
| `shift` | CHAR(2) | `"A"` / `"B"` / `"C"` |
| `source_table` | VARCHAR(60) | Audit: `"BF3.WB_TRANS_DATA_ITRO"` etc. |
| `first_tare_time` | TIMESTAMP | |
| `out_date` | TIMESTAMP | |
| `closetime` | TIMESTAMP | |
| `received_date` | TIMESTAMP | Parsed from VARCHAR2 in source |
| `sms_ack_time` | TIMESTAMP | |
| `updated_date` | TIMESTAMP | WBATNGL's `UPDATED_DATE` — drives incremental sync |
| `synced_at` | TIMESTAMP DEFAULT NOW() | HMD bookkeeping |

**Indexes:**
- `(updated_date DESC)` — for sync watermark + UI default sort.
- `(fleet_id)` — torpedo filter.
- `(source_lab, destination)` — route filter.
- Partial: `WHERE temp IS NOT NULL OR si_l IS NOT NULL OR s_l IS NOT NULL` — for chemistry aggregates.

### New module — `backend/utils/wbatngl_trip_sync.py`

Sibling of `wbatngl_capacity_sync.py`. Pulls from **two source tables only** (avoids replica dupes):
- `BF3."WB_TRANS_DATA_ITRO"` (richest schema; `SOURCE_LAB` ∈ {BF3, BF4})
- `BF5."ZWB_TRANSACTION_DATA_ITRO_B"` (BF5's primary live table)

Per tick (every 60 s):
1. For each source table: read watermark = `MAX(updated_date) FROM wbatngl_trip_mirror WHERE source_table = ?`.
2. `SELECT * FROM <source> WHERE UPDATED_DATE > :watermark AND LADLENO LIKE 'TLC%'`.
3. For each row: normalise LADLENO, parse VARCHAR dates with format-ladder + try/except, treat zero chemistry as NULL, UPSERT by `trip_id`.
4. After the batch, invalidate `fleet_cache["jsw_dashboard"]`.
5. Log: `WBATNGL trip sync OK: new=N updated=M errors=K`.

Daily 03:30 IST: `DELETE FROM wbatngl_trip_mirror WHERE updated_date < NOW() - INTERVAL '30 days'`.

`run_once()` is the entry point. APScheduler registers it via `schedule_wbatngl_trip_sync()` in `main.py`, gated by env var `WBATNGL_TRIP_SYNC_ENABLED=true`.

A separate one-shot mode `python -m backend.utils.wbatngl_trip_sync --backfill-days=30` performs initial backfill so the recurring job doesn't have to handle a 30 k-row first tick.

### New endpoints

```
GET /api/jsw/trips
Query params:
  time_window     today | 24h | 7d | 30d   (default: today)
  source_lab      BF3 | BF4 | BF5 | all    (default: all)
  destination     SMS2 | SMS4 | RFL | all  (default: all)
  shift           A | B | C | all          (default: all)
  fleet_id        TLC-XX | all             (default: all)
  q               <free-text search>       (matches trip_id, tap_no, fleet_id, ladleno_raw via ILIKE)
  page            int                       (default: 1)
  page_size       int 1-200                 (default: 50)
  sort_by         WHITELIST                 (default: updated_date)
                  Allowed: updated_date, first_tare_time, out_date, net_weight, temp, fleet_id
  sort_order      asc | desc                (default: desc)

Response:
  {
    "rows": [...],
    "page": 1,
    "page_size": 50,
    "total": 142,
    "last_sync_at": "2026-05-08T16:18:07+05:30"
  }


GET /api/jsw/dashboard
Query params:
  time_window     today | 24h | 7d | 30d   (default: today)

Response:
  {
    "kpis": {
      "trips_count": 142,
      "tonnage_total_mt": 51300.5,
      "avg_cycle_min": 87,
      "active_torpedoes": 47,
      "trips_count_prior": 130,           // same-window-length immediately before
      "tonnage_total_prior_mt": 47200.0,
      "fleet_size": 53                    // for utilisation %
    },
    "flow": [
      {"source_lab": "BF3", "destination": "SMS2", "trips": 52, "tonnage_mt": 18100.0, "avg_net_mt": 348.1},
      ...
    ],
    "chemistry": {
      "avg_temp_c": 1502,
      "avg_si_pct": 0.62,
      "avg_s_pct": 0.034,
      "out_of_spec_count": 3,
      "out_of_spec_breakdown": {"high_s": 2, "low_temp": 1},
      "thresholds": {
        "temp_min": 1450, "temp_max": 1530,
        "s_max": 0.05, "si_min": 0.2, "si_max": 1.0
      }
    },
    "recent_trips": [...last 15 rows...],
    "last_sync_at": "2026-05-08T16:18:07+05:30"
  }
```

Both wrapped by `Depends(get_current_user_required)`. No CSRF (GET only). 5-second `fleet_cache` TTL on the dashboard endpoint to absorb rapid polls.

`sort_by` is whitelisted explicitly (no `getattr` on user input). `q` is parameter-bound, never string-concatenated.

---

## Frontend specification

### JSW tab in `TripManagement.jsx`

Adds a 5th tab after the existing **Overview · Dispatch Center · Live Monitor · History** strip.

**Layout when active:**
- Top: time-window chips (`Today` / `24h` / `7d` / `30d`) + "Updated Ns ago" + manual `↻` button.
- Filter bar: search box, producer chips (BF3 / BF4 / BF5 / All), consumer chips (SMS2 / SMS4 / RFL / All), shift chips (A / B / C / All), torpedo multi-select dropdown.
- Active-filters summary line: `BF5 + Shift B • 18 of 142 trips • Clear all`.
- Table: 8 columns (Trip ID truncated, Time, Torpedo badge, Route, Net MT, Temp, Si %, S %), sortable, out-of-spec values colored.
- Click a row → expandable detail row revealing all WBATNGL columns.
- Pagination: 50/page server-side; `◀ Page 1 of 3 ▶ • 50/page▾`.
- Auto-refresh every 15 s (silent refetch with same params; no scroll jump).
- WBATNGL outage banner (yellow at >5 min, red at >15 min).

### Plant Live page — `frontend/src/pages/PlantLive.jsx` (new)

- Route: `/plant`.
- Sidebar entry "Plant Live" with `Activity` (lucide-react) icon, inserted right after "Live Tracking" in `Sidebar.jsx`.
- Single-page layout (no internal tabs):
  - Top: time-window chips + "Updated Ns ago".
  - **KPI strip** (4 cards): Trips Today / Tonnage Today / Avg Cycle / Active Torpedoes. Each card has a delta line vs the prior same-length window.
  - **Producer → Consumer Flow:** sorted list of `BF → SMS` routes with tonnage, trip count, avg NET.
  - **Chemistry Snapshot:** averages of TEMP / Si / S today + out-of-spec count with sub-breakdown. Thresholds shown in tooltip.
  - **Live Trip Feed:** last 15 rows; click → same expandable detail row used in the JSW tab.
- Auto-refresh every 15 s. KPI delta uses **prior window of same length** (today vs yesterday, 7d vs prior 7d, etc.).

### Visual style

Reuses existing CSS variables (`hsl(var(--primary))`, `hsl(var(--success))`, `hsl(var(--warning))`, `hsl(var(--danger))`). KPI cards mimic the Trip Management Overview's. No new CSS framework.

### Re-render hygiene (lesson from Phase 2 perf hotfix)

- The "Updated Ns ago" timer ticks every second but only re-renders the timestamp string, not the whole page (memoised dependency).
- Live Trip Feed list uses `React.memo` with custom equality so unchanged rows skip re-render on each poll (same pattern as `<FleetMarker>` from Sprint 1).
- Filter changes are debounced 250 ms before triggering a refetch.

---

## Error handling & edge cases

| Scenario | Handling |
|----------|----------|
| WBATNGL connection refused / slow | `logger.exception`, return silently; mirror keeps last good snapshot |
| `last_sync_at` > 5 min | Yellow banner in UI |
| `last_sync_at` > 15 min | Red banner |
| Sync takes > 30 s | Warning logged; APScheduler `coalesce=True, max_instances=1` prevents pile-up |
| VARCHAR date parsing fails | Format-ladder with try/except; on fail store NULL + warn; never crash batch |
| `TEMP=0` / `Si=0` / `S=0` in source | Stored as NULL; aggregates use `AVG(...) FILTER (WHERE x IS NOT NULL)` |
| New torpedo (TLC-54) appears in WBATNGL before SuVeechi seeds it | Display as-is; future drawer drill-through must handle missing `fleet_management` row |
| New consumer (`RFL`) | Display as-is; **add `RFL` to HMD `locations` table as a deployment seed** |
| Initial 30-day backfill | Use `--backfill-days=30` one-shot; recurring job skips it |
| Sync interrupted mid-batch | Watermark-from-data is restart-safe; UPSERT is idempotent |

---

## Testing

### Backend

`backend/tests/test_wbatngl_trip_sync.py`:
- `test_normalize_ladleno` — `"TLC 01"` / `"TLC-1"` / `"OTL 23"` (filter)
- `test_parse_date_varchar_formats` — DD/MM, MM/DD AM/PM, malformed → None
- `test_zero_temp_becomes_null`
- `test_upsert_idempotent`
- `test_incremental_watermark`
- `test_filter_excludes_otl`
- `test_prune_removes_old`

`backend/tests/test_jsw_endpoints.py`:
- `test_trips_list_pagination`
- `test_trips_list_filters`
- `test_trips_list_search`
- `test_trips_list_sort_whitelist` (rejects malicious column names)
- `test_dashboard_kpis` (incl. NULL chemistry handling)
- `test_dashboard_caching`
- `test_auth_required`

Oracle is mocked via fixture returning canned rows from `backend/tests/fixtures/wbatngl_sample.csv`.

### Frontend

No automated tests (no Jest/Vitest in current frontend setup). Manual smoke test on SMS4 covers the surfaces.

### SMS4 verification flow

1. `python -m backend.utils.wbatngl_trip_sync --backfill-days=30` → ~30 k rows + summary line.
2. `SELECT count(*) FROM wbatngl_trip_mirror;` matches log.
3. Wait 60 s; logs show `WBATNGL trip sync OK: new=N updated=M`.
4. `/trips` → click **JSW** tab → expect filtered rows, working chips.
5. `/plant` → expect 4 sections populated; KPI deltas appear after a few minutes.
6. Sanity-check existing Live Tracking page (legend toggle still works, capacities still show).

---

## Deployment

### Migration

Alembic auto-generated:
- `wbatngl_trip_mirror` table.
- 4 indexes (3 b-tree + 1 partial).
- No downgrade required (additive only, downgrade is a no-op).

### Files shipped (handover)

`handover/2026-05-08-wbatngl-trip-mirror-sprint/` containing:
- `backend/database/models.py` (new `WbatnglTripMirror` model class)
- `backend/utils/wbatngl_trip_sync.py` (new)
- `backend/routes/jsw.py` (new — both endpoints)
- `backend/main.py` (registers new sync job + new route)
- `backend/alembic/versions/<rev>_add_wbatngl_trip_mirror.py` (new migration)
- `backend/.env.example` (note `WBATNGL_TRIP_SYNC_ENABLED` flag)
- `frontend/src/pages/PlantLive.jsx` (new)
- `frontend/src/pages/TripManagement.jsx` (modified — adds JSW tab)
- `frontend/src/components/Sidebar.jsx` (modified — adds "Plant Live" item)
- `frontend/src/App.jsx` (modified — registers `/plant` route)
- `README.md` (deploy steps + verification)

### Deployment steps on SMS4

1. Stop backend.
2. Copy files; replace existing where applicable.
3. `python -m alembic upgrade head` → creates `wbatngl_trip_mirror` table + indexes.
4. Add `RFL` to `locations` table (one-row seed).
5. Set `WBATNGL_TRIP_SYNC_ENABLED=true` in `.env`.
6. Run one-shot: `python -m backend.utils.wbatngl_trip_sync --backfill-days=30`.
7. Restart backend; confirm `WBATNGL trip sync scheduled every 60 s` in startup log.
8. `npm run build` (or hot-reload) on frontend.
9. Hard-refresh browser; verify JSW tab + Plant Live.

### Rollback

- `WBATNGL_TRIP_SYNC_ENABLED=false` + restart → recurring sync stops.
- Drop the table: `DROP TABLE wbatngl_trip_mirror;` (no FK cascades — safe).
- Revert frontend files; sidebar item disappears, JSW tab hides.
- Manual trip-entry flow continues unaffected throughout.

---

## Out of scope (deferred to next sprint)

- Drill-through from JSW row → torpedo drawer → HMD trip detail.
- Sankey / chord diagram for Producer→Consumer flow (current MVP uses sorted list).
- 30-day trend line chart on Plant Live.
- Shift A/B/C performance comparison widget.
- Top torpedoes leaderboard widget.
- Export to PDF/Excel from JSW tab.
- Linking a JSW trip to its corresponding HMD trip (Topic 5 — strict separation chosen).
- Auto-creating HMD `Trip` records from WBATNGL (would replace manual entry; bigger scope).
- HTS direct connection (chemistry already in WBATNGL; HTS down is a non-issue).

---

## Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| WBATNGL Oracle goes down | Medium | Medium | Background sync logs and continues; UI shows staleness banner; no user-facing crash |
| 30-day backfill takes too long | Low | Low | One-shot script runs separately from recurring 60 s job |
| Sync running > 60 s | Low | Low | `coalesce=True, max_instances=1` prevents overlap |
| New WBATNGL column added by JSW | Low | Low | Sync ignores unknown columns; mirror schema is explicit |
| RFL not in HMD `locations` | Certain | Low | Add as deployment seed |
| Mirror grows beyond 30 d | Low (bug only) | Low | Daily prune; alembic-tracked schema |

---

## Approval

This design was developed via structured brainstorm on 2026-05-08, with explicit user approval at every section boundary (architecture, schema, JSW tab, Plant Live page, error handling, deployment). Implementation can begin once approved.
