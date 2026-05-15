# 2026-05-15 — Live Tracking V1 Removal

Removes VERSION 1 from the Live Tracking page per user direction. The page
is now V2-only — no V1/V2 toggle, no header tab strip. V2 has been the
default since 2026-05-12 and is now field-stable on BF4.

Companion sweep to #195 (the trial-feature removal earlier today).

## What is removed

- **VERSION 1 / VERSION 2 toggle** on the `/` Live Tracking page.
- **`frontend/src/pages/Dashboard.jsx`** (~728 LOC) — the V1 implementation
  with leaflet map + plant-node markers + FleetMarker memo + fleet
  status legend + torpedo polling.
- **`frontend/src/components/TorpedoDrawer.jsx`** (~470 LOC) — the V1-only
  right-side slide-in detail panel (V2 has its own equivalent at
  `components/LiveTrackingV2/TorpedoDetailPanel.jsx`).

## What is preserved

- **`pages/LiveTrackingV2.jsx`** + **`components/LiveTrackingV2/`** —
  the V2 implementation, now the only Live Tracking surface.
- **`backend/routes/tracking_v2.py`** — V2 backend route.
- **`utils/torpedoStatus.js`** — still used by
  `components/OperationsLive/ActiveTripsPanel.jsx` (OperationsLive page is
  hidden from sidebar but its route still resolves).

## Files in this handover (2 edited)

| File | Change |
|---|---|
| `frontend/src/pages/LiveTracking.jsx` | Full rewrite — was 73-LOC V1/V2 toggle wrapper, now 18-LOC Suspense around LiveTrackingV2. No HeaderContext call, no activeTab state, no icon imports |
| `frontend/src/App.jsx` | Removed `const Dashboard = lazy(() => import('./pages/Dashboard'))` — Dashboard was lazy-imported but never directly routed |

## Files deleted (mirror these in any environment)

- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/components/TorpedoDrawer.jsx`

## BF4 deploy steps

> **Path note.** BF4 git repo is at `C:\Users\v_subramanya.gopal\Desktop\HMD\` flat — no `Development\Version_07\` subfolder. `git pull` brings down the 2 deletions automatically.

```cmd
cd C:\Users\v_subramanya.gopal\Desktop\HMD
git pull origin sprint-3-operations-live

cd frontend
npm run build
cd ..

REM Restart backend — Ctrl+C the uvicorn window, then re-launch:
.venv\Scripts\activate.bat
uvicorn backend.main:app --port 8000
```

Note: backend doesn't actually need to restart for this change (frontend-only),
but if uvicorn is running with `--reload` it'll pick up no changes anyway.

## Verification on BF4 after rebuild

1. Navigate to `/` (Live Tracking). The page should load directly into V2
   layout — left-side torpedo list, plant satellite map, no top tab strip
   with VERSION 1 / VERSION 2 buttons.
2. Page header shows only "LIVE TRACKING" (no center tabs).
3. Clicking a torpedo opens the V2 right-side detail panel
   (`TorpedoDetailPanel.jsx`) — not the old V1 `TorpedoDrawer`.
4. Other pages unchanged.

## Cross-references

- Tracker entry: **#196** (this).
- Companion sweep: **#195** (trial-feature removal earlier today —
  SMS-4 Performance, Weighbridge Audit, Dashboard V2 tab, JSW tab).
- V2 baseline shipped: tracker #145+ (the LiveTrackingV2 sprint).

## No DB / config / env change

- No Alembic migration.
- No `.env` change.
- No backend code change.
