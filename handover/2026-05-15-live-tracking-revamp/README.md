# 2026-05-15 — Live Tracking V2 Revamp

End-to-end revamp of the (now only) Live Tracking page after the V1 removal
in #196. Driven by a 21-decision brainstorming session — full design doc at
[docs/plans/2026-05-15-live-tracking-v2-revamp-design.md](docs/plans/2026-05-15-live-tracking-v2-revamp-design.md).

## Architecture rule locked (the foundational lock)

**HMD owns the trip workflow.** Source-of-truth:

| Data | Source | Used by |
|---|---|---|
| Trips | `Trip` table — via Trip Management → Dispatch Center | CURRENT TRIP, RECENT TRIPS, transit polylines, source/dest filter |
| GPS | `FleetLiveLocation` (SuVeechi mirror) | Map markers, location text, age |
| Heat | `hts_heat_mirror` | (no longer on this page — was FED INTO, now removed) |
| Chemistry | `wbatngl_trip_mirror` | (no longer on this page — was CHEMISTRY, now removed) |

## What changed

**Backend** — `backend/routes/tracking_v2.py` rewritten:
- Dropped 7-bucket `_derive_status()` — page now returns RAW SuVeechi status (Idle / Moving / Ign Off).
- Added `is_stale` field — `True` when `last_report_sec > 3600` (1 hour).
- `/torpedoes` returns `current_trip` from Trip table (None when no active trip).
- `/torpedoes/{id}` simplified — 4 sections (header, location, current_trip, recent_trips).
- `recent_trips` now reads from `Trip` table (NOT wbatngl_trip_mirror).
- NEW `/trip-routes` endpoint for source/destination dropdown values.
- Dropped HTS / WBATNGL imports — no longer feeds this page.

**Frontend** — 4 files rewritten:
- `LiveTrackingV2.jsx` — added source/dest filter state, /trip-routes fetch.
- `TorpedoListPanel.jsx` — 4 status pills (was 8), 2 dropdowns (Source / Dest), no temp column, stale row visual.
- `PlantMap.jsx` — auto-fit-bounds on first load, dropped hardcoded track edges, marker contrast (1px white outline + dark pill behind TLC number), 4 stat tiles overlay (Idle/Moving/Ign Off/Stale).
- `TorpedoDetailPanel.jsx` — 4 sections only (Header / Location / Current Trip / Recent Trips). Removed CHEMISTRY, ASSET, FED INTO.
- `LiveTrackingV2.css` — new styles for dropdowns, stale rows, breadcrumb, contrast.

**User-managed (NOT in this commit):**
- Delete or hide YARD + REPAIR rows in the location registry (per decision #20).

## Visible effects on BF4 after deploy

After `git pull` + frontend rebuild + uvicorn restart, navigate to `/`:

| Surface | Before | After |
|---|---|---|
| Status filter pills | 8 (All / Loading / In Transit / At SMS / Returning / Idle / Hot Repair / Ign Off) | 4 (All / Idle / Moving / Ign Off) — raw SuVeechi only |
| Source / Destination filter | none | 2 dropdowns (empty until operators dispatch trips) |
| List row content | TLC / status / **temp** / location / age | TLC / status / location / age (no temp) |
| Stale GPS row | rendered identical to live | 50% opacity + red "GPS stale" tag |
| Map header overlay | 0 Loading · 0 In Transit · 0 At SMS · Live | Idle · N / Moving · N / Ign Off · N / Stale · N · Live |
| Map auto-zoom | no | yes, one-shot on first load |
| Map pre-drawn dashed track edges | 11 BF→WB→YARD→SMS lines | gone |
| Map title subtitle | "JSW Vijaynagar · Hot Metal Track" | dropped — just "Plant Schematic" |
| Detail panel sections | Header / Location / Current Trip / FED INTO / Chemistry / Asset / Recent Trips | Header / Location / Current Trip / Recent Trips |
| Current Trip empty state | "No active trip — torpedo idle" | "No active trip — assign one via Trip Management → Dispatch Center" |
| Recent Trips source | wbatngl_trip_mirror | `Trip` table (HMD-owned) |

## BF4 deploy steps

```cmd
cd C:\Users\v_subramanya.gopal\Desktop\HMD
git pull origin sprint-3-operations-live

cd frontend
npm run build
cd ..

REM Restart uvicorn — Ctrl+C the running window, then:
.venv\Scripts\activate.bat
uvicorn backend.main:app --port 8000
```

Backend restart is required (tracking_v2.py changed). No DB migration. No `.env` change.

## Optional cleanup on BF4 (decision #20 — YARD / REPAIR)

If you want YARD + REPAIR to disappear from the map, mark them not-visible
in the location registry on BF4:

```sql
UPDATE locations_coordinates
   SET is_visible = false
 WHERE type IN ('yard', 'repair');
```

Or delete entirely:

```sql
DELETE FROM locations_coordinates WHERE type IN ('yard', 'repair');
```

`/plant-nodes` already filters by `is_visible=True`, so they'll vanish from
the map automatically once flipped. Cache TTL is 5 min — restart backend
for an immediate refresh, or just wait.

## Files in this handover (6 + design doc)

| File | Type |
|---|---|
| `backend/routes/tracking_v2.py` | rewritten |
| `frontend/src/pages/LiveTrackingV2.jsx` | rewritten |
| `frontend/src/components/LiveTrackingV2/TorpedoListPanel.jsx` | rewritten |
| `frontend/src/components/LiveTrackingV2/PlantMap.jsx` | rewritten |
| `frontend/src/components/LiveTrackingV2/TorpedoDetailPanel.jsx` | rewritten |
| `frontend/src/components/LiveTrackingV2/LiveTrackingV2.css` | edited |
| `docs/plans/2026-05-15-live-tracking-v2-revamp-design.md` | new design doc |

## Verification on BF4 after restart

1. Open `/` → map auto-zooms to all 53 torpedoes.
2. Header overlay shows 4 stat tiles + Live indicator.
3. Left panel shows 4 status pills + 2 dropdowns + list rows without temp.
4. Click any torpedo → detail panel has 4 sections only.
5. CURRENT TRIP section shows the breadcrumb to Trip Management → Dispatch Center.
6. Disable a SuVeechi feed for ~1 hour → that torpedo's row goes 50% opacity with "GPS stale" tag.
7. Dispatch a trip via Trip Management → within 5s, the relevant torpedo's CURRENT TRIP populates with the route + 5-stage strip.

## Cross-references

- Tracker entry: **#197**
- Companion sweeps: **#195** (trial-feature removal), **#196** (V1 removal)
- Strategic context: **#190** (donut "show raw SuVeechi" precedent), **#193** (JSW gap analysis — stop workarounds)
- Design doc: `docs/plans/2026-05-15-live-tracking-v2-revamp-design.md`
