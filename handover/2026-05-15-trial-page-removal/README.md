# 2026-05-15 — Trial Page Removal

Removes four trial-stage features from the BF4 deployment per user direction
on 2026-05-15. The features were built between 2026-05-12 and 2026-05-14 as
workarounds on incomplete source data; the 2026-05-14 JSW data gap analysis
(see `docs/2026-05-14-jsw-data-gap-analysis.md`) made the workaround approach
obsolete — the V07 baseline should not include these surfaces.

## What is removed (frontend)

1. **SMS-4 Performance page** — sidebar entry, route, page, components.
2. **Weighbridge Audit page** — sidebar entry, route, page, components.
3. **Dashboard VERSION 2 tab** — the V2 toggle on the `/statistics` page
   (the "Dashboard" sidebar item). Page now defaults to PERFORMANCE
   (AdminStatistics). DEVIATION tab still present.
4. **JSW tab in Trip Management** — the 4-sub-tab board (Active /
   Exceptions / Completed today / Timeline) is gone. Page now defaults
   to OVERVIEW.

## What is preserved

- **Live Tracking V1/V2 toggle.** User explicitly asked to keep the
  Version 2 surface on this page only. `pages/LiveTracking.jsx`,
  `pages/LiveTrackingV2.jsx`, `components/LiveTrackingV2/`, and
  `backend/routes/tracking_v2.py` are unchanged.
- **`backend/routes/jsw.py`** — PlantLive page still hits
  `/api/jsw/dashboard`; PlantLive is hidden from the sidebar but its
  route is reachable, and `backend/routes/operations.py` shares auth
  helpers from this file.

## Files in this handover (5 edited)

| File | Change |
|---|---|
| `frontend/src/components/Sidebar.jsx` | Removed 2 menu entries from admin + trs menus; dropped unused lucide-react icon imports |
| `frontend/src/App.jsx` | Removed SMSPerformance + WeighbridgeAudit lazy imports, ROUTE_CONFIG entries, Route elements |
| `frontend/src/pages/Statistics.jsx` | Dropped Version2Dashboard import + V2 button + render branch; default tab `'v2'` → `'performance'` |
| `frontend/src/pages/TripManagement.jsx` | Dropped JswTripsTab + JswTripOperations imports + JSW button + render branch; default tab `'jsw'` → `'overview'` |
| `backend/main.py` | Removed 4 route imports (v2_dashboard, weighbridge_audit, sms_performance, heat_trace) + 4 `include_router` calls |

## Files deleted (13 files / folders on the local repo — must be removed on BF4 too)

**Frontend pages:**
- `frontend/src/pages/SMSPerformance.jsx`
- `frontend/src/pages/WeighbridgeAudit.jsx`

**Frontend component folders:**
- `frontend/src/components/SMSPerformance/` (7 files: KPIRow.jsx, YieldTrend.jsx, LossPareto.jsx, BySMSTable.jsx, HeatsTable.jsx, HeatTraceDrawer.jsx, SMSPerformance.css)
- `frontend/src/components/WeighbridgeAudit/` (5 files: KPIRow.jsx, WeighbridgeLog.jsx, VarianceHistogram.jsx, CalibrationCard.jsx, WeighbridgeAudit.css)
- `frontend/src/components/JswTripOperations/` (7 files: JswTripOperations.jsx, ActiveTripBoard.jsx, ExceptionsQueue.jsx, GanttView.jsx, CompletedTable.jsx, TripDetailPane.jsx, JswTripOperations.css)
- `frontend/src/components/Statistics/V2/` (13 files: KPIRow, KPICard, KPIBig, FleetDonut, ProducerBreakdown, ThroughputChart, ActiveTripsTable, AlertFeed, FlowSankey, ChemHistogram, ShiftBars, SystemHealth, StageDots)

**Frontend single component:**
- `frontend/src/components/JswTripsTab.jsx`
- `frontend/src/components/Statistics/Version2Dashboard.jsx`
- `frontend/src/components/Statistics/Version2Dashboard.css`

**Backend routes:**
- `backend/routes/sms_performance.py`
- `backend/routes/weighbridge_audit.py`
- `backend/routes/heat_trace.py`
- `backend/routes/v2_dashboard.py`

## BF4 deploy steps

```cmd
cd C:\Users\v_subramanya.gopal\Desktop\HMD\Development\Version_07
git pull

REM Delete the orphaned files on BF4 (mirror local repo state)
del frontend\src\pages\SMSPerformance.jsx
del frontend\src\pages\WeighbridgeAudit.jsx
rmdir /S /Q frontend\src\components\SMSPerformance
rmdir /S /Q frontend\src\components\WeighbridgeAudit
rmdir /S /Q frontend\src\components\JswTripOperations
del frontend\src\components\JswTripsTab.jsx
rmdir /S /Q frontend\src\components\Statistics\V2
del frontend\src\components\Statistics\Version2Dashboard.jsx
del frontend\src\components\Statistics\Version2Dashboard.css
del backend\routes\sms_performance.py
del backend\routes\weighbridge_audit.py
del backend\routes\heat_trace.py
del backend\routes\v2_dashboard.py

REM Rebuild frontend
cd frontend
npm run build
cd ..

REM Restart backend (PowerShell window running uvicorn) — Ctrl+C, re-launch
```

## Verification on BF4 after restart

1. Sidebar should show **9 items** for admin/trs: Dashboard / Live Tracking / Trip Management / Strategic Planning / Torpedo Management / Reports / Audit Trail / Operations Control / Settings (Weighbridge Audit and SMS-4 Performance gone).
2. `/statistics` (Dashboard) — header tab strip shows only **PERFORMANCE** + **DEVIATION**. Lands on PERFORMANCE.
3. `/trips` (Trip Management) — header tab strip shows **OVERVIEW** / **DISPATCH CENTER** / **LIVE MONITOR** / **HISTORY**. Lands on OVERVIEW. JSW button gone.
4. `/` (Live Tracking) — VERSION 1 / VERSION 2 toggle still present. UNCHANGED.
5. `/sms-performance` and `/weighbridge-audit` URLs should fall through to the default route (`/statistics`) — no crash.
6. Backend `/health` returns 200 with `database: connected`.

## No DB / config / env change

- No Alembic migration required.
- No `.env` change.
- No `system_configs` row added/removed.
- No data migration.
