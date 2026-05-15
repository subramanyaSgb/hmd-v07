---
title: Live Tracking V2 Revamp — Design Doc
date: 2026-05-15
status: locked
---

# Live Tracking V2 Revamp

## Context

The Live Tracking V2 page (now the only Live Tracking surface after tracker #196) was structurally compromised in production. Several sections read from a `Trip` table that's empty on BF4, several derived statuses had no real data feeding them, and the detail panel mixed HMD-owned data with mirror-sourced data with placeholder "no sensor" rows.

This design doc captures the revamp brainstorming session of 2026-05-15 — 19 locked decisions covering filter buckets, data sources, detail panel sections, map overlays, and visual polish. Follow-up to tracker entries #195 (trial-feature removal) and #196 (V1 removal).

## Architecture rule (the foundational lock)

**HMD owns the trip workflow.** Source-of-truth hierarchy:

| Data | Source | Used by |
|---|---|---|
| Trips (HMD-owned) | `Trip` table — managed via Trip Management → Dispatch Center | CURRENT TRIP, RECENT TRIPS, transit polylines, source/dest filter |
| GPS | `FleetLiveLocation` (SuVeechi mirror) | Map markers, location text, last-report age |
| Heat data | `hts_heat_mirror` | (was FED INTO — now removed from this page) |
| Chemistry / historical | `wbatngl_trip_mirror` | (was CHEMISTRY — now removed from this page) |

`wbatngl_trip_mirror` and `hts_heat_mirror` remain as the analytics / audit ground truth, but the operator's workflow on this page is: dispatch a trip in Trip Management → it lives in `Trip` → Live Tracking reads from there.

## 19 locked design decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Status filter pills | Pure SuVeechi raw: `All / Idle / Moving / Ign Off`. No derived buckets. |
| 2 | Stale GPS threshold | **1 hour.** Last report > 1h → row grayed out + stale tag. |
| 3 | Map overlay | 4 stat tiles: `Idle · N / Moving · N / Ign Off · N / Stale · N` + `Live · 5s` indicator. |
| 4 | Trip data source | **`Trip` table** (operator-driven via Trip Management). NOT `wbatngl_trip_mirror`. |
| 5 | CHEMISTRY & TEMP section in detail panel | **REMOVE.** |
| 6 | ASSET section in detail panel | **REMOVE.** |
| 7 | RECENT TRIPS source | **`Trip` table** (5 most recent completed/canceled trips per torpedo). |
| 8 | FED INTO section in detail panel | **REMOVE.** |
| 9 | Auto-fit-bounds on first load | **YES.** Map zooms to encompass all torpedoes with valid GPS, one-shot. |
| 10 | Temperature on list rows | **REMOVE.** List shows TLC id / age / status / location only. |
| 11 | Source + Destination filter dropdowns | **ADD.** Two dropdowns above the list, populated from distinct `Trip.producer_id` and `Trip.consumer_id` values. |
| 12 | Map marker visibility | 1px white outline around colored dot + darker semi-transparent pill behind TLC number. |
| 13 | Map title subtitle | Drop "JSW Vijaynagar · Hot Metal Track" — just "Plant Schematic". |
| 14 | "No active trip" empty state | Change to: `No active trip — assign one via Trip Management → Dispatch Center`. |
| 15 | Backend `raw_status` field | Remove from `/torpedoes` response (frontend doesn't use it). |
| 16 | Backend `destination` field on `/torpedoes` | Remove. Replaced by `current_trip.consumer_id` from Trip table. |
| 17 | Transit polyline animation on map | KEEP. Active when torpedo has a `Trip` in status `ASSIGNED..UNLOADING_ENDED`. |
| 18 | Live · 5s indicator location | KEEP in top-right overlay (alongside stat tiles from #3). |
| 19 | Stale row visual | 50% opacity row + gray status dot + small "GPS stale" label next to age. |
| 20 | YARD + REPAIR plant nodes | **User-managed.** Operator will delete or mark `is_visible=False` on the YARD and REPAIR rows in the location registry directly. No backend code change. The existing `/plant-nodes` endpoint already filters by `is_visible=True`, so they'll vanish from the map automatically. |
| 21 | Hardcoded dashed track edges between stations | **REMOVE entirely.** Drop the `TRACK_EDGES` array and Polyline rendering. Transit polylines from torpedo → trip destination (decision #17) STAY. |

## Component-by-component spec

### `pages/LiveTracking.jsx` and `pages/LiveTrackingV2.jsx`

LiveTracking.jsx stays as the thin Suspense wrapper (already simplified in tracker #196). LiveTrackingV2.jsx:

- Master tick: **5 s**.
- Polls `/api/tracking/v2/torpedoes` every tick.
- Polls `/api/tracking/v2/plant-nodes` once on mount.
- Owns state: `selectedFleetId`, `filter` (status), `sourceFilter`, `destFilter`, `search`, `tick`, `torpedoes`, `plantNodes`.
- Computes `filteredTorpedoes` (memo over torpedoes × all 4 filter dimensions).
- Passes counts to PlantMap for the overlay tiles.

### `components/LiveTrackingV2/TorpedoListPanel.jsx`

**Layout (top to bottom):**

1. Title row: `Torpedoes  N of M` (count reflects filtered/total).
2. Search input (matches `fleet_id` or `location_text`, case-insensitive).
3. Status pill row: `[All] [Idle] [Moving] [Ign Off]`.
4. Source dropdown: `All / BF1 / BF2 / BF3 / BF4 / BF5 / COREX1 / COREX2`.
5. Destination dropdown: `All / SMS-1 / SMS-2 / SMS-3 / SMS-4`.
6. Scrollable list of TorpedoRow cards.

**Each row shows:**

```
[icon] TLC-XX                          [age]
       ● [status_label]
       [location_text or '—']
```

**Stale visual:** when `last_report_sec > 3600`, apply opacity 0.5 to the entire row, status dot becomes gray, and a small `GPS stale` label renders next to the age.

**Status colors** (only 3 + stale):
- `Moving` → `#3b82f6` (blue)
- `Idle` → `#94a3b8` (slate)
- `Ign Off` → `#64748b` (slate-dark)
- `Stale` (any status with `last_report_sec > 3600`) → `#9ca3af` (gray) override

**Filter logic:**
- Status: `t.raw_status === filter` (or `All`).
- Source: matches `t.current_trip?.source` if present, else `null`. `All` always matches.
- Destination: same pattern with `t.current_trip?.destination`.
- Search: `fleet_id.includes(q) || location_text.includes(q)`.

### `components/LiveTrackingV2/PlantMap.jsx`

**Markers** — TLC number on top of a colored dot, with 1px white outline (decision #12). Cache by `(fleet_id, raw_status, isSelected, isStale)`. Stale markers render with the gray override color.

**Auto-fit-bounds (decision #9):** on first load (when `torpedoesWithCoords.length` first becomes > 0), call `map.fitBounds` over all valid coords with padding `[60, 60]` and `maxZoom: 16`. One-shot via a `hasFitted` ref. Subsequent ticks don't re-fit.

**Transit polylines:** unchanged from current — but now the `destination` is read from each torpedo's `current_trip.destination` field (which the backend hands down, see route spec below).

**Dropped (decision #21):** the `TRACK_EDGES` hardcoded array and its `<Polyline>` rendering loop. The map no longer pre-draws BF→WB→YARD→SMS connection lines. Only dynamic transit lines remain.

**YARD / REPAIR cleanup (decision #20):** Handled by the user via the location registry — they'll delete or hide the rows directly. No backend code change. Once those rows are gone / `is_visible=False`, the existing `/plant-nodes` endpoint won't return them.

**Overlay (decision #3 + #18):**
```
┌──────────────────────────────────┐
│  N        N        N        N    │   ← 4 stat tiles with counts
│ Idle    Moving  Ign Off  Stale   │
│         · Live · 5s              │
└──────────────────────────────────┘
```

**Header simplification (decision #13):** subtitle becomes just `Plant Schematic` (drop "JSW Vijaynagar · Hot Metal Track").

### `components/LiveTrackingV2/TorpedoDetailPanel.jsx`

**Sections after revamp:**

1. **Header** — close button + TLC id + status dot + raw status label + "Ns ago" / "GPS stale".
2. **LOCATION** — text + lat/lon (unchanged).
3. **CURRENT TRIP** — reads from `Trip` table:
   - Source → Destination (from `producer_id` → `consumer_id`)
   - Net weight (from `net_weight_kg`)
   - 5-stage strip (Tap / Weigh / Transit / SMS / Return) driven by `Trip.status`
   - Empty state: `No active trip — assign one via Trip Management → Dispatch Center`
4. **RECENT TRIPS** — reads from `Trip` table:
   - Last 5 trips per torpedo where `status IN (13, 14, 15)` (COMPLETED / CANCELED / ABORTED)
   - Columns: `#trip_id` · `producer_id → consumer_id` · `net_weight_kg t` · status badge · completion date
   - Empty state: `No completed trips yet.`
5. **Action footer** — Center on map · Export CSV (CSV now exports from the Trip-table source).

**DELETED sections** (decisions #5, #6, #8): CHEMISTRY & TEMP, ASSET, FED INTO.

### `backend/routes/tracking_v2.py`

**`/torpedoes` endpoint:**

Per-torpedo response after revamp:
```python
{
    "fleet_id":        "TLC-19",
    "status":          "Moving",       # raw SuVeechi (was raw_status, renamed)
    "is_stale":        False,          # last_report_sec > 3600
    "lat":             15.123456,
    "lon":             76.654321,
    "location_text":   "0.07 KM S of BF4 CH8",
    "last_report_sec": 12,
    "current_trip": {                   # null when no active Trip row
        "trip_id":     1234,
        "source":      "BF5",
        "destination": "SMS-4",
        "status":      8,
        "stage_idx":   2,
        "net_wt":      329.1,
        "assigned_at": "2026-05-15T11:42:00Z",
    },
    "capacity":        375.0,
}
```

**Removed fields** (decisions #15, #16): `raw_status` (renamed to `status`), `derived_status`, `destination` (now under `current_trip`).

**Removed code paths:**
- The `_derive_status()` 7-state function — replaced with a simple raw-status pass-through.
- The `WbatnglTripMirror` temp subquery (decision #10 means no more `last_temp` on the list).
- The `MaintenanceSchedule` overlay (it only fed the "Hot Repair" derived bucket, which is gone).

**Distinct sources / destinations** — new helper endpoint or inline aggregation for the dropdowns:
```python
@router.get("/trip-routes")
def trip_routes(db, current_user):
    sources = db.query(Trip.producer_id).filter(Trip.deleted_at.is_(None)).distinct().all()
    dests = db.query(Trip.consumer_id).filter(Trip.deleted_at.is_(None)).distinct().all()
    return {
        "sources":      sorted({s[0] for s in sources if s[0]}),
        "destinations": sorted({d[0] for d in dests if d[0]}),
    }
```

Frontend calls once on mount. Empty arrays mean operators haven't dispatched any trips yet — dropdowns show just `All`.

**`/torpedoes/{fleet_id}` endpoint:**

Per-torpedo detail response after revamp:
```python
{
    "fleet_id":        "TLC-19",
    "status":          "Moving",
    "is_stale":        False,
    "last_report_sec": 12,
    "location": { "text": ..., "lat": ..., "lon": ... },
    "current_trip": { ...same shape as list endpoint, or None... },
    "recent_trips": [                       # last 5 from Trip table
        {
            "trip_id":     1234,
            "source":      "BF5",
            "destination": "SMS-4",
            "status":      13,
            "status_label": "Completed",
            "net_wt":      329.1,
            "completed_at": "2026-05-15T11:42:00Z",
        },
        ...
    ],
}
```

**Removed fields:** `chemistry`, `asset`, `current_heat`, `derived_status`, `raw_status`.

**Removed code paths:** `_current_heat_for_fleet`, `_latest_wbatngl_for_fleet`, the life_cycles + campaign computations.

## Data flow contracts

```
Operator                Trip Management page         Live Tracking V2 page
   │                            │                            │
   │── dispatches trip ────────►│                            │
   │                            │── INSERT Trip row ────────►│ DB
   │                            │                            │
   │                                                         │
   │                                              ◄── 5s poll /torpedoes ──┤
   │                                                         │             │
   │                                              ◄─ shows trip in panel ──┘
   │
   │── status updates (Loading, Weighed, etc.) ──────────────►│ DB
   │                                                         │
   │                                              ◄── 5s poll /torpedoes ──┤
   │                                              ◄─ stage strip advances ─┘
```

## Acceptance criteria

After deploy, with **zero** operator trips dispatched yet (BF4 cold state):

- [ ] Map shows ONLY: 3 BFs, 4 SMSes, 3 weighbridges (no YARD, no REPAIR).
- [ ] Map shows NO hardcoded dashed connecting lines between stations.
- [ ] Left panel shows 4 status pills: `All / Idle / Moving / Ign Off`.
- [ ] Source dropdown shows just `All`.
- [ ] Destination dropdown shows just `All`.
- [ ] All 53 torpedoes render in list with TLC id / age / status / location only (no temp).
- [ ] Map overlay shows 4 counts (Idle / Moving / Ign Off / Stale) + `Live · 5s`.
- [ ] Map auto-fits to all 53 torpedoes on first load, one-shot.
- [ ] Rows with `last_report_sec > 3600` render at 50% opacity with `GPS stale` label.
- [ ] Map subtitle reads `Plant Schematic` only.
- [ ] Click any torpedo → detail panel shows 4 sections: Header / LOCATION / CURRENT TRIP / RECENT TRIPS / footer.
- [ ] CURRENT TRIP empty state reads: `No active trip — assign one via Trip Management → Dispatch Center`.
- [ ] RECENT TRIPS empty state reads: `No completed trips yet.`
- [ ] No CHEMISTRY, ASSET, or FED INTO sections visible anywhere.

After an operator dispatches a trip via Trip Management:

- [ ] Within 5s, the relevant torpedo's CURRENT TRIP section populates with route / weight / 5-stage strip.
- [ ] Map renders a dashed transit polyline from the torpedo to its destination station.
- [ ] Source / Destination dropdowns refresh to include the new producer / consumer values.
- [ ] As the operator advances the trip status, the 5-stage strip lights up phase by phase.
- [ ] When the trip is marked COMPLETED, it moves from CURRENT TRIP to the top of RECENT TRIPS.

## Out of scope (future work)

- Source/destination filter intelligent matching against `t.location_text` (heuristic — "torpedo near BF4 even though no trip assigned") — deferred until a need surfaces.
- Per-torpedo timeline drawer.
- Heat-trace / chemistry surface — separate page; would re-use wbatngl + HTS data sources.
- Maintenance schedule overlay on torpedo markers — would need a new icon strategy.

## Implementation order

1. **Backend** — rewrite `tracking_v2.py` to new contracts. Drop `_derive_status`, `_current_heat_for_fleet`, `_latest_wbatngl_for_fleet`, the temp subquery, the maintenance overlay. Add `/trip-routes` helper.
2. **Frontend — list panel** — rewrite TorpedoListPanel to 4 pills + 2 dropdowns + new row layout, stale visual.
3. **Frontend — map** — rewrite PlantMap overlay tiles, marker style, fit-bounds, subtitle.
4. **Frontend — detail panel** — strip down to 4 sections, rewire RECENT TRIPS to Trip table, helpful CURRENT TRIP empty state.
5. **Build + verify** — `npx vite build` + backend AST parse.
6. **Tracker + handover + push** — entry #197, handover folder, push to both remotes.

## References

- Tracker #186 (V2 active trips table — established 4-rule active-trip pattern, though now superseded for this page by Trip-table-as-source)
- Tracker #190 (V2 Dashboard Fleet Donut — same "show raw SuVeechi" philosophy applied there)
- Tracker #193 (JSW Data Gap Analysis — strategic context for "stop building workarounds")
- Tracker #195 (Trial feature removal — sibling cleanup)
- Tracker #196 (Live Tracking V1 removal — direct predecessor)
- Memory `project_suveechi_schema.md` — SuVeechi gives only 3 raw statuses
- Memory `project_postgres_hmd_inventory.md` — `Trip` table is the HMD source
- CLAUDE.md — 16-state TripStatus enum, role permissions, route patterns
