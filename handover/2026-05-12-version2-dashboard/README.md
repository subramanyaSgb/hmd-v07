# Handover — Version 2 Dashboard

**Date:** 2026-05-12
**Target machine:** BF4 PC (the only machine with DB access)
**Design doc:** [`docs/plans/2026-05-12-version2-dashboard-design.md`](docs/plans/2026-05-12-version2-dashboard-design.md)
**changes_tracker.md entries:** #78 – #89

---

## What's in this handover

A new **VERSION 2** tab on `/statistics` (to the left of `PERFORMANCE` / `DEVIATION`) that renders a 1:1 layout port of `desing_idea/dashboard.jsx`, fully live, on V07's existing light theme. Admin / trs / ppc only (same role gate as the existing toggle).

### Sections rendered (top → bottom)

| Row | Cards | Source |
|---|---|---|
| 1 | 6 KPIs: Hot Metal Dispatched (+24h spark) · Active Trips · Avg Cycle · Temp Drop BF→SMS · On-Spec · Chem Alerts | `/api/statistics/v2/overview` |
| 2 | Fleet Donut (7 derived states) · Throughput area chart · BF→SMS Sankey | `/overview` · `/throughput` · `/sankey` |
| 3 | Active Trips table (7 rows) · Alerts & Exceptions feed | `/active-trips` · `/alerts` |
| 4 | Shift Performance bars · Chem Histogram · System Health (4 DBs) | `/overview` · `/chemistry-distribution` · `/system-health` |

---

## Files (drop-in mirrors)

### Backend

- `backend/database/models.py` — added the `Alert` model (~line 525, just above `HtsHeatMirror`).
- `backend/alembic/versions/v2dash001_add_alerts_table.py` — **NEW** migration creating the `alerts` table (down_revision = `h1i2j3k4l5m6`).
- `backend/utils/alert_detector.py` — **NEW**. 7 pure detector functions + 2 orchestrators (`scan_wbatngl_rows`, `scan_fleet_rows`).
- `backend/utils/wbatngl_trip_sync.py` — calls `scan_wbatngl_rows()` after `upsert_rows()` in `pull_and_upsert_from_source()`. `run_once()` accumulator now includes `alerts_added`.
- `backend/utils/suveechi_sync.py` — calls `scan_fleet_rows()` after `upsert_locations()` in `sync_once()`.
- `backend/routes/v2_dashboard.py` — **NEW**. 8 endpoints under `/api/statistics/v2/*`.
- `backend/main.py` — added `v2_dashboard` to the imports and `app.include_router(v2_dashboard.router)` after `performance_analytics`.

### Frontend

- `frontend/src/pages/Statistics.jsx` — added the `VERSION 2` toggle button to the LEFT of `PERFORMANCE`, plus the `activeTab === 'v2'` render branch.
- `frontend/src/components/Statistics/Version2Dashboard.jsx` — **NEW** container component + `useV2Endpoint` hook.
- `frontend/src/components/Statistics/Version2Dashboard.css` — **NEW** scoped styles (all V2 tokens live under `.v2-dashboard`).
- `frontend/src/components/Statistics/V2/*.jsx` — **NEW** 11 section components (KPIRow, KPICard, KPIBig, FleetDonut, ThroughputChart, FlowSankey, StageDots, ActiveTripsTable, AlertFeed, ShiftBars, ChemHistogram, SystemHealth).

### Docs

- `docs/plans/2026-05-12-version2-dashboard-design.md` — **NEW** approved design doc.

---

## Deployment steps on BF4

```cmd
:: 1. Stop the running services (use app.bat menu or kill the uvicorn / vite processes)
:: 2. Pull / sync files from this handover folder into the project root
:: 3. Activate venv
.venv\Scripts\activate.bat

:: 4. Apply the migration (creates the `alerts` table)
cd backend
python -m alembic upgrade head

:: 5. Smoke-test the new endpoints (auth as admin first)
::    GET  /api/statistics/v2/overview              → should return KPIs + fleet + shifts
::    GET  /api/statistics/v2/throughput?range=24h  → list of {label,value}
::    GET  /api/statistics/v2/sankey                → {sources, sinks, ribbons}
::    GET  /api/statistics/v2/active-trips?limit=7  → list of 7 trip rows
::    GET  /api/statistics/v2/alerts?window=60m     → recent alerts (may be empty on first run)
::    GET  /api/statistics/v2/chemistry-distribution → bins + mean/stddev
::    GET  /api/statistics/v2/system-health         → 4 connection rows

:: 6. Restart backend
uvicorn backend.main:app --reload --port 8000

:: 7. Frontend
cd ..\frontend
npm run build      :: confirm clean build
npm run dev        :: or whatever's running in prod

:: 8. Open /statistics, sign in as admin, click "VERSION 2"
```

---

## What to verify after deploy

- [ ] VERSION 2 button appears to the LEFT of PERFORMANCE on /statistics (admin only)
- [ ] Clicking it renders the 4-row dashboard with V07's existing light theme (white cards, blue accent)
- [ ] KPI Row shows 6 cards; the first card has a 24h sparkline
- [ ] Fleet Donut renders with 7 segments; center number matches total torpedo count
- [ ] Throughput chart renders area chart; pills `24h / 7d / 30d` re-fetch
- [ ] Sankey shows BF → SMS ribbons
- [ ] Active Trips table shows ladle / trip ID / chemistry / stage / age columns; alert tag appears for trips with breaches
- [ ] Alerts feed shows recent rows; clicking **Ack** dims the row
- [ ] Shift Performance shows A/B/C bars with **LIVE** pill on the current shift
- [ ] Chemistry histogram shows 9 bins with red bars below 1450 °C
- [ ] System Health shows 4 rows (SuVeechi, WBATNGL, HTS, Postgres) with status dots

---

## Rollback

If a section misbehaves:

- Frontend: switch to PERFORMANCE / DEVIATION — no impact on the existing tabs.
- Backend: alerts table can stay (detector hooks are try/excepted so they NEVER break the main sync). To fully unwind:
  ```cmd
  python -m alembic downgrade -1     :: drops the `alerts` table
  ```
  and revert `backend/main.py`, `backend/utils/{wbatngl_trip_sync,suveechi_sync}.py` to remove the detector imports.
