# Live Tracking V2 — Design Doc

**Date:** 2026-05-12
**Author:** brainstorm session with Claude
**Status:** Approved, ready for implementation
**Reference design:** `c:/Users/DSI-LPT-081/Desktop/HMD/desing_idea/tracking.jsx`
**Related sprint:** Sister to the Version 2 Dashboard shipped earlier today (`2026-05-12-version2-dashboard-design.md`).

---

## 1. Goal

Add a second "VERSION 2" view to the existing Live Tracking page (route `/`). The current page becomes "VERSION 1" — kept byte-for-byte intact. V2 is a 1:1 layout port of `desing_idea/tracking.jsx`, adapted to V07's light theme, fully live.

## 2. Decisions log

| # | Decision | Choice |
|---|---|---|
| 1 | Asset section data gap (Shell temp / Heel / GPS battery) | D — capture SuVeechi `location` text, derive life_cycles + campaign, render "—" for the 3 truly-missing fields |
| 2 | Layout when no torpedo selected | List + map only (2-col); detail panel hidden, map fills the right side |
| 3 | Layout when torpedo selected | 3-col (list / map shrinks / detail) |
| 4 | Detail panel close | X button at **top-LEFT** of the panel |
| 5 | Re-click same torpedo | Nothing happens (panel stays open, content unchanged) |
| 6 | Selected torpedo highlight | Blue stripe + tint in list AND pulsing ring on map |
| 7 | Torpedo marker visual | Colored dot (status color) + TLC number label — matches design idea |
| 8 | Map engine | Keep Leaflet; add design-idea visuals on top |
| 9 | File split | New `pages/LiveTracking.jsx` wrapper; `pages/Dashboard.jsx` UNCHANGED |
| 10 | Header toggle pattern | Same as Statistics page — HeaderContext center toggle, title moved to left |
| 11 | YARD/REPAIR plant nodes | Seeded with design-idea coords via migration; admin editable later |
| 12 | `/torpedoes` filter | Server returns all 53; frontend filters by 7-state |
| 13 | Refresh cadence | 5s master tick. Detail panel polls every other tick (10s) when open |

## 3. Architecture

### File structure

```
backend/
├── database/
│   └── models.py             # extend FleetLiveLocation: + location_text
├── alembic/versions/
│   └── livetrack001_…py      # NEW migration
├── utils/
│   └── suveechi_sync.py      # capture & persist location_text
├── routes/
│   └── tracking_v2.py        # NEW — 3 endpoints under /api/tracking/v2/*
└── main.py                   # register new router

frontend/src/
├── pages/
│   ├── Dashboard.jsx          # UNCHANGED — stays V1
│   ├── LiveTracking.jsx       # NEW — wrapper with V1/V2 toggle
│   └── LiveTrackingV2.jsx     # NEW — 3-column container
├── components/
│   └── LiveTrackingV2/
│       ├── TorpedoListPanel.jsx
│       ├── PlantMap.jsx
│       ├── TorpedoDetailPanel.jsx
│       └── LiveTrackingV2.css
└── App.jsx                    # one-line route change: / → <LiveTracking />
```

### Route + toggle behaviour

- Route `/` now renders `<LiveTracking />`. Default tab `'v1'` so existing operators see V1 unchanged on first load.
- HeaderContext injects: page title on LEFT (`Live Tracking`) + toggle in CENTER (`[VERSION 1] [VERSION 2]`).
- No role gate — same access as today.

## 4. Backend plan

### 4.1 Schema change

```python
# database/models.py
class FleetLiveLocation(Base):
    ...
    location_text = Column(String(255), nullable=True)
```

### 4.2 Alembic migration `livetrack001_add_location_text_and_seed_nodes.py`
- `down_revision = 'v2dash001'` (alerts table migration we shipped earlier today)
- `ADD COLUMN location_text VARCHAR(255)` (nullable)
- Seed `LocationCoordinate` rows for `YARD` (type=`yard`) and `REPAIR` (type=`repair`) — coords from design idea PLANT_GEO if not already present (`INSERT … ON CONFLICT DO NOTHING`).
- Seed coords on `Weighbridge` rows for WB_HMY1/HMY2/LRS1 IF currently null (`UPDATE … WHERE x IS NULL`).

### 4.3 SuVeechi sync update
- Extend `SELECT` clause: add `location`.
- Strip trailing `*` and whitespace (sample rows in `report.txt` show `"At HMY2 - Corex Point No.125*"`).
- Persist on every upsert. Backwards-compatible.

### 4.4 New routes — `routes/tracking_v2.py`
Prefix `/api/tracking/v2`. All require authenticated user.

| Endpoint | Returns |
|---|---|
| `GET /torpedoes` | `[{ fleet_id, derived_status, last_temp, last_report_sec, location_text, lat, lon, raw_status }]` for all 53 torpedoes. `derived_status` = same 7-state mapping as V2 dashboard donut. |
| `GET /torpedoes/{fleet_id}` | `{ header, location, current_trip, chemistry, asset, recent_trips }`. Asset: `life_cycles` = COUNT(WbatnglTripMirror where fleet_id matches), `campaign` = floor(life_cycles/80). Shell temp / heel / battery returned as `null`. |
| `GET /plant-nodes` | `[{ id, label, kind, lat, lon }]` for BFs + SMSs + WBs + YARD + REPAIR. `kind ∈ {bf, sms, wb, yard, repair}`. Cached 5 min. |

### 4.5 Track edges
Hardcoded in the frontend (`PlantMap.jsx`). They're topological connections, not geographic.

## 5. Frontend plan

### 5.1 `LiveTracking.jsx` wrapper
```jsx
const [activeTab, setActiveTab] = useState('v1');
// HeaderContext: left title + center toggle (same .switcher-tabs CSS as Statistics)
return activeTab === 'v1' ? <Dashboard /> : <LiveTrackingV2 />;
```

### 5.2 `LiveTrackingV2.jsx` container
- State: `selectedFleetId`, `filter`, `search`, `tick` (5s)
- Fetches `/torpedoes` once per tick; passes data down to both list and map (single source of truth, avoids double-fetch).
- CSS: `.v2-tracking` grid morphs `270px 1fr` → `270px 1fr 360px` when `selectedFleetId` non-null. `ResizeObserver` on the grid → `map.invalidateSize()` after CSS transition.

### 5.3 `TorpedoListPanel`
- Title row with count "X of 53"
- Search box (filters by `fleet_id` OR `location_text`)
- 7 filter pills (one active; default "All")
- Scrollable list of `TorpedoRow` — each row: SVG torpedo icon + TLC + age + status dot + temp + truncated location text. Selected → blue stripe + tint background.

### 5.4 `PlantMap`
- Reuse V1's Leaflet base (ESRI satellite default, OSM toggle from Settings).
- **Stations** — `L.divIcon` HTML rectangles with colored stroke (amber BF, blue SMS, gray WB, green YARD, red REPAIR) and label text.
- **Track edges** — `L.polyline` with `dashArray: '6 5'`, soft amber stroke.
- **Torpedo markers** — `L.divIcon` (dot + number above), memoized cache keyed by `(fleet_id, status, isSelected)` — same pattern as V1's `_fleetIconCache` to prevent re-render storm.
- **Selected pulse** — CSS keyframe on the divIcon only when `fleet_id === selectedFleetId`.
- **In Transit animation** — for any torpedo with `derived_status === 'In Transit'`, draw a polyline torpedo→destination station with animated `dashOffset` (CSS keyframe).
- **Top-right** — live stats chips (Loading / In Transit / At SMS counts + "Live · 5s" dot).
- **Bottom-left** — station legend.

### 5.5 `TorpedoDetailPanel`
360px wide. Hidden by default. Slides in when `selectedFleetId` set.
- **Header bar** — `[✕]` top-LEFT + `TLC 19` (Space Grotesk) + status dot + label + age
- **Location** — `location_text` + `lat / lon` mono
- **Current Trip** — if Trip active: src→dst, net wt, vertical 5-stage timeline (reuse StageDots from V2 dashboard, vertical variant); else: "No active trip"
- **Chemistry & Temp** — Last temp (color: red <1450, amber 1450-1470, normal else) · Sulfur · Silicon
- **Asset** — Life cycles · Campaign # · Shell temp ("—" + tooltip "no sensor") · Heel ("—") · GPS battery ("—") · Last report (sec ago)
- **Recent Trips** — last 5 rows from `recent_trips` (compact)
- **Footer** — `[Center on map]` button (calls Leaflet `panTo([lat, lon])`) + `[Export]` button (client-side CSV of recent_trips)

## 6. Refresh cadences

| Resource | Cadence | Triggered by |
|---|---|---|
| `/torpedoes` | 5s | master tick |
| `/torpedoes/{id}` | 10s | tick % 2 === 0, only when panel open |
| `/plant-nodes` | once | mount |

## 7. Implementation phases

1. Backend: migration, models, SuVeechi sync, 3 endpoints, register router
2. Frontend wrapper: `LiveTracking.jsx` + App.jsx route change
3. V2 container skeleton (3-col grid, empty children)
4. `TorpedoListPanel`
5. `PlantMap` (Leaflet enrichments)
6. `TorpedoDetailPanel`
7. CSS polish, empty/loading states, Leaflet `invalidateSize` hook
8. Wrap: `changes_tracker.md` entries, mirror to `handover/2026-05-12-livetracking-v2/`, **git push to BOTH `origin` and `new-origin`** (BF4 pulls from `new-origin`)

## 8. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Marker re-render storm (V1's #32–#36 perf regression) | Copy exact memo + icon cache pattern from V1's FleetMarker |
| R2 | Tile/marker stretch on grid 2→3 column morph | `ResizeObserver` → `map.invalidateSize()` after 300ms transition |
| R3 | SuVeechi `location` text has `*` and whitespace | Strip in sync; render "—" if empty |
| R4 | YARD/REPAIR seed collides with admin-added rows | `INSERT … ON CONFLICT DO NOTHING` |
| R5 | Pulse animation CPU if applied to all torpedoes | CSS class scoped to selected only; divIcon cache keyed by isSelected |
| R6 | Forgetting `new-origin` push (BF4 remote) — happened on V2 dashboard ship | Explicit `git push origin … && git push new-origin …` at the end |
