# Trip Operations V2 (JSW tab redesign) + Sidebar reorder

**Date:** 2026-05-12
**Author:** brainstorm session with Claude
**Status:** Approved, ready for implementation
**Reference design:** `c:/Users/DSI-LPT-081/Desktop/HMD/desing_idea/trips.jsx`
**Sister sprints (same day):** V2 Statistics Dashboard, V2 Live Tracking

---

## 1. Goal

Replace the JSW tab content on the Trip Management page (`/trips`) with a 1:1 layout port of `desing_idea/trips.jsx` — 4 sub-tabs (Active Trips / Exceptions / Completed today / Timeline), each adapted to V07's light theme with live WBATNGL + alerts data.

Plus three small workflow changes:
- Flip default tabs to "V2" across Statistics + Live Tracking + Trip Management
- Reorder the sidebar so Dashboard / Live Tracking / Trip Management sit in positions 1/2/3
- Hide Operations Live / Trip History (Live) / Plant Live from sidebar (per user — redesign pending)

## 2. Decisions log

| # | Decision | Choice |
|---|---|---|
| 1 | Backend endpoint shape | A — reuse `/api/jsw/trips` + add 2 new (`exceptions`, `timeline`) |
| 2 | JSW tab content swap | Replace `<JswTripsTab />` body; keep file in tree as fallback |
| 3 | Main Trip Management tabs | Unchanged (Overview / Dispatch / Live Monitor / History / JSW) |
| 4 | Default sub-tab on JSW | Active Trips |
| 5 | Default main tab on Trip Mgmt | JSW |
| 6 | Default tab on Statistics | V2 |
| 7 | Default tab on Live Tracking | V2 |
| 8 | Sidebar position 1 / 2 / 3 | Dashboard / Live Tracking / Trip Management |
| 9 | Hidden pages | Operations Live, Trip History (Live), Plant Live (routes stay, sidebar nav removed) |
| 10 | Data source | `WbatnglTripMirror` (matches JSW philosophy) — NOT the V07 `Trip` table |
| 11 | Stage derivation | Server-side `stage_idx` (0-4) computed from WBATNGL timestamps |
| 12 | Alert join | LEFT JOIN `alerts` on `trip_id`, latest unacked per trip |
| 13 | Audit log in detail pane | Client-side from row timestamps — no extra endpoint |
| 14 | Acknowledge SMS / Flag Issue buttons | Display toast for now — WBATNGL is read-only upstream |

## 3. Backend changes

### 3.1 Extend `GET /api/jsw/trips`

New query param: `mode ∈ {in_flight, completed}` (omitted = unchanged behavior).

| Mode | Filter |
|---|---|
| `in_flight` | `out_date IS NOT NULL AND sms_ack_time IS NULL` |
| `completed` | `sms_ack_time IS NOT NULL` (plus existing `time_window`) |

Each returned row also gets:
- **`stage_idx`** (0-4): server-derived from `first_tare_time` / `closetime` / `out_date` / `sms_ack_time`
- **`alert`** (object | null): latest unacked alert for this `trip_id`, shape `{ id, kind, severity, tag, detail }`

Existing callers (current `JswTripsTab.jsx`) ignore unknown fields — safe addition.

### 3.2 NEW `GET /api/jsw/v2/exceptions`

Joins `alerts` ↔ `wbatngl_trip_mirror` on `trip_id`, last 24h, returns enriched rows for the Exceptions queue.

### 3.3 NEW `GET /api/jsw/v2/timeline?hours=12`

Per-torpedo gantt aggregation. Returns `{ hours, now, lanes: [{ fleet_id, status, trips: [...] }] }`. Top 18 torpedoes by recent activity (the design idea shows 18 lanes).

## 4. Frontend changes

### 4.1 File structure

| Path | Status |
|---|---|
| `pages/TripManagement.jsx` | EDIT — default `activeTab='jsw'`, swap JSW branch render |
| `pages/Statistics.jsx` | EDIT — default `activeTab='v2'` |
| `pages/LiveTracking.jsx` | EDIT — default `activeTab='v2'` |
| `components/Sidebar.jsx` | EDIT — reorder + hide 3 paths |
| `components/JswTripsTab.jsx` | UNCHANGED — stays in tree as V1 fallback |
| `components/JswTripOperations/JswTripOperations.jsx` | NEW — container |
| `components/JswTripOperations/SubTabs.jsx` | NEW — 4 sub-tabs + filters |
| `components/JswTripOperations/ActiveTripBoard.jsx` | NEW |
| `components/JswTripOperations/TripDetailPane.jsx` | NEW |
| `components/JswTripOperations/ExceptionsQueue.jsx` | NEW |
| `components/JswTripOperations/CompletedTable.jsx` | NEW |
| `components/JswTripOperations/GanttView.jsx` | NEW |
| `components/JswTripOperations/JswTripOperations.css` | NEW — scoped under `.jsw-trip-ops` |

### 4.2 Sidebar order — per role (after edits)

**Admin (9):** Dashboard · Live Tracking · Trip Management · Strategic Planning · Torpedo Management · Reports · Audit Trail · Operations Control · Settings

**TRS (8):** Same as Admin minus Audit Trail

**PPC (4):** Dashboard · Live Tracking · Reports · Settings

**Operator (6):** Dashboard · Live Tracking · Trip Management · Daily Planning · Operations Control · Settings

(Operations Live / Trip History (Live) / Plant Live removed from all roles.)

### 4.3 Refresh cadence

- Master tick on `JswTripOperations` = 10s
- Each sub-tab fetches its own endpoint on tick
- Detail pane (when open) refetches on tick

## 5. Implementation phases

1. Backend (extend `/jsw/trips`, add `/jsw/v2/exceptions`, `/jsw/v2/timeline`)
2. Default-tab flips (3 one-liners) + Sidebar reorder + hide
3. `JswTripOperations` container + sub-tab shell
4. ActiveTripBoard + TripDetailPane
5. ExceptionsQueue
6. CompletedTable
7. GanttView
8. CSS polish + Vite build verify
9. `changes_tracker.md` entries + mirror to `handover/2026-05-12-trip-operations-v2/` + git push **BOTH** remotes

## 6. Risks + mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | Accidentally re-adding the 3 hidden pages | Memory note saved (`project_hidden_sidebar_pages.md`); explicit check after Sidebar edit |
| R2 | `stage_idx` derivation wrong on edge cases | Defensive switch, default to 0; tests on sample WBATNGL rows |
| R3 | GanttView with 53 lanes overflows | Top-18-by-recent + scrollable container |
| R4 | Alert JOIN performance | Filter to last 24h first; existing `idx_alerts_kind_torpedo_active` helps |
| R5 | Default-tab disorientation on first login post-deploy | One-time; toggle reverts; deploy README note |
| R6 | Forgetting `new-origin` push | Explicit dual-push command at the end. Logged in memory twice now. |
| R7 | Losing V1 JSW fallback | Keep `JswTripsTab.jsx` in tree, just unmount from UI |
