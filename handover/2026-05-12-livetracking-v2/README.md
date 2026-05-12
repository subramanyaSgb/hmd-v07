# Handover — Live Tracking V2

**Date:** 2026-05-12
**Target machine:** BF4 PC
**Design doc:** [`docs/plans/2026-05-12-livetracking-v2-design.md`](docs/plans/2026-05-12-livetracking-v2-design.md)
**changes_tracker.md entries:** #90 – #103
**Sister sprint:** V2 Statistics dashboard shipped earlier today (entries #78–#89)

---

## What's in this handover

A new **VERSION 2** tab on the Live Tracking page (route `/`). Existing V1 stays unchanged. V2 is a 1:1 layout port of `desing_idea/tracking.jsx`, adapted to V07's light theme.

### Layout

```
DEFAULT (no torpedo selected):
[Torpedoes list 270px] [Plant map 1fr]

USER CLICKS A TORPEDO:
[Torpedoes list 270px] [Plant map 1fr] [Detail panel 360px]

USER CLICKS X (top-LEFT of panel):
→ Back to DEFAULT
```

### What V2 shows

- **Left** — torpedo list with search + 7 filter pills (Loading / In Transit / At SMS / Returning / Idle / Hot Repair / Ign Off + All). Selected torpedo gets a blue stripe and tinted background.
- **Center** — Leaflet map with: labelled station rectangles (BFs, SMSs, weighbridges, YARD, REPAIR), dashed amber track edges connecting them, colored-dot torpedo markers with TLC numbers above, pulsing ring on selected, animated dashed line from "In Transit" torpedoes to their destination station.
- **Right** (slide-in) — 7 sections: header (X top-LEFT + status), Location (text + lat/lon), Current Trip (with 5-stage strip), Chemistry & Temp (Last temp / Sulfur / Silicon with red/amber tones), Asset (life cycles, campaign, plus 3 sensor-placeholder rows), Recent Trips (last 5 WBATNGL rows), Center on map + Export CSV.

### What's NEW data-wise

- The **SuVeechi `location` text** (e.g. `"At HMY2 - Corex Point No.125"`) — was being dropped, now captured. New `location_text` column on `fleet_live_locations`.
- **YARD + REPAIR** plant nodes seeded into `locations_coordinates`.
- **WB_HMY1 / WB_HMY2 / WB_LRS1** weighbridge coords backfilled where null.

### What's still **"—"** (no source data exists)

- Shell temp (no IR sensor)
- Heel residual (not in WBATNGL/HTS)
- GPS battery % (not in current SuVeechi `vw_unit_status_ist` view)

These render with an `AlertCircle` icon + "(no sensor / not in feed)" tooltip.

---

## Files

### Backend

- `backend/database/models.py` — added `location_text VARCHAR(255)` to `FleetLiveLocation`
- `backend/alembic/versions/livetrack001_add_location_text_and_seed_nodes.py` — **NEW** migration (down_revision = `v2dash001`)
- `backend/utils/suveechi_sync.py` — capture `location` field, strip trailing `*` and whitespace, persist
- `backend/routes/tracking_v2.py` — **NEW**. 3 endpoints under `/api/tracking/v2/*`
- `backend/main.py` — registered new router

### Frontend

- `frontend/src/App.jsx` — route `/` → `<LiveTracking />` (was `<Dashboard />`)
- `frontend/src/pages/LiveTracking.jsx` — **NEW** wrapper with V1/V2 toggle
- `frontend/src/pages/LiveTrackingV2.jsx` — **NEW** 3-column container
- `frontend/src/components/LiveTrackingV2/TorpedoListPanel.jsx` — **NEW**
- `frontend/src/components/LiveTrackingV2/PlantMap.jsx` — **NEW**
- `frontend/src/components/LiveTrackingV2/TorpedoDetailPanel.jsx` — **NEW**
- `frontend/src/components/LiveTrackingV2/LiveTrackingV2.css` — **NEW** scoped styles
- `frontend/src/pages/Dashboard.jsx` — **UNCHANGED** (V1 stays byte-for-byte identical)

### Docs

- `docs/plans/2026-05-12-livetracking-v2-design.md` — **NEW** approved design doc

---

## Deployment steps on BF4

```cmd
:: 1. Stop running services
:: 2. Pull latest
git pull

:: 3. Activate venv
.venv\Scripts\activate.bat

:: 4. Apply migration (adds location_text + seeds YARD/REPAIR + backfills WB coords)
cd backend
python -m alembic upgrade head

:: 5. Smoke-test endpoints (sign in as admin first)
::    GET  /api/tracking/v2/torpedoes              → 53 rows with derived_status + location_text
::    GET  /api/tracking/v2/torpedoes/TLC-19       → full detail payload (replace 19 with any active TLC)
::    GET  /api/tracking/v2/plant-nodes            → BFs + SMSs + 3 WBs + YARD + REPAIR

:: 6. Restart backend
uvicorn backend.main:app --reload --port 8000

:: 7. Frontend
cd ..\frontend
npm run build          :: confirm clean build
npm run dev            :: or whatever's running in prod

:: 8. Open / (Live Tracking page), click "VERSION 2" in the header
```

---

## Verify after deploy

- [ ] Header shows "Live Tracking" on LEFT + `[VERSION 1] [VERSION 2]` toggle in center
- [ ] Default tab is V1 — looks identical to before
- [ ] Click VERSION 2 → 3-column layout appears (list + map only, no detail panel)
- [ ] List shows 53 torpedoes with status dots, locations, last temp
- [ ] Filter pills work (try "In Transit", "Idle", etc.)
- [ ] Search box filters by TLC id and location text
- [ ] Map shows station rectangles + dashed track edges + dot+number torpedo markers
- [ ] Click any torpedo → detail panel slides in from right; list row + map marker get highlighted
- [ ] X button (top-LEFT of panel) closes it; map expands back
- [ ] Click "Center on map" → map flies to torpedo position
- [ ] Click "Export" → CSV downloads with last 5 trips
- [ ] If any torpedo is "In Transit", you should see an animated dashed line to its destination SMS
- [ ] location text appears in the Location section ("At HMY2 - …") — confirms #91/#93 wired correctly

---

## Rollback

If anything breaks:

- **Frontend** — operators just switch the toggle back to VERSION 1. No impact on V1 muscle memory.
- **Backend** — V2 endpoints are additive; V1 doesn't call them. If detector regression or other issue:
  ```cmd
  python -m alembic downgrade -1     :: drops location_text column + YARD/REPAIR seed rows
  ```
  Then revert `backend/utils/suveechi_sync.py`, `backend/main.py`, and remove `backend/routes/tracking_v2.py` if needed.

---

## Risks logged in design doc

| # | Risk | Mitigation in code |
|---|---|---|
| R1 | Marker re-render storm (V1's tracker #32–#36) | `TorpedoMarker` and `TorpedoRow` are both `React.memo`'d with custom equality + `_torpedoIconCache` keyed by `(fleet_id, status, isSelected)` |
| R2 | Leaflet tile/marker stretch on grid 2→3 column morph | `InvalidateOnResize` calls `map.invalidateSize()` 320ms after `panelOpen` toggle |
| R3 | SuVeechi `location` has `*` suffix or whitespace | Stripped in `suveechi_sync.py` |
| R4 | YARD/REPAIR seed collides with admin-added rows | `INSERT … WHERE NOT EXISTS` in migration |
| R5 | Pulse animation CPU if applied to all torpedoes | CSS class only renders when `isSelected = true` |
| R6 | Forgetting `new-origin` push (BF4 remote) — happened on V2 dashboard | Explicit dual-push at the end |
