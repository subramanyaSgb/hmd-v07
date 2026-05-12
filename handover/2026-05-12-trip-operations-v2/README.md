# Handover — Trip Operations V2 + Sidebar reorder + Default flips

**Date:** 2026-05-12
**Target machine:** BF4 PC
**Design doc:** [`docs/plans/2026-05-12-trip-operations-v2-design.md`](docs/plans/2026-05-12-trip-operations-v2-design.md)
**changes_tracker.md entries:** #106 – #121

---

## What changed

### 1. JSW tab on Trip Management page (`/trips`) — content replaced

Old: a single table view of WBATNGL trips (377 LOC `JswTripsTab.jsx`).
New: **4-sub-tab Trip Operations board** (1:1 with `desing_idea/trips.jsx`):

| Sub-tab | What it shows | Source |
|---|---|---|
| **Active Trips** (default) | Cards grid (in-flight WBATNGL trips) + right detail pane | `/api/jsw/trips?mode=in_flight` |
| **Exceptions** | Alerts joined with trip rows, severity-tagged, Acknowledge button | `/api/jsw/v2/exceptions` (NEW) |
| **Completed (today)** | Full row table with cycle metrics | `/api/jsw/trips?mode=completed&time_window=today` |
| **Timeline** | 12h per-torpedo gantt (top 18 fleets by activity) | `/api/jsw/v2/timeline?hours=12` (NEW) |

Old `JswTripsTab.jsx` file kept in tree as a fallback — just not mounted.

### 2. Default tab changes (3 one-line edits)

- `/statistics` → default tab `'v2'` (was `'performance'`)
- `/` → default tab `'v2'` (was `'v1'`)
- `/trips` → default tab `'jsw'` (was `'overview'`)

Everyone lands on the new design first. Old tabs still one click away.

### 3. Sidebar reorder + 3 pages hidden

New order (per role):

| Role | Items (was → now) |
|---|---|
| Admin | 12 → 9 |
| TRS | 11 → 8 |
| PPC | 7 → 4 |
| Operator | 8 → 6 |

**Top 3 across all roles:** Dashboard · Live Tracking · Trip Management (where each role has them).

**Hidden from sidebar (routes still resolvable):**
- `/operations-live` (Operations Live)
- `/trip-history-live` (Trip History (Live))
- `/plant` (Plant Live)

User said these are pending a redesign decision (reuse or remove entirely). Files NOT deleted.

---

## Files in this handover

### Backend (1 file modified — no new migration)
- `backend/routes/jsw.py` — extended with `mode` param + `stage_idx` + `alert`; new `/api/jsw/v2/exceptions` + `/api/jsw/v2/timeline`

### Frontend
- `frontend/src/pages/Statistics.jsx` — default flip
- `frontend/src/pages/LiveTracking.jsx` — default flip
- `frontend/src/pages/TripManagement.jsx` — default flip + JSW render swap + import
- `frontend/src/components/Sidebar.jsx` — reordered all 4 role arrays + hidden 3 paths
- `frontend/src/components/JswTripOperations/` — 6 NEW files (container, 4 sub-tabs, TripDetailPane, scoped CSS)

### Docs
- `docs/plans/2026-05-12-trip-operations-v2-design.md` — NEW design doc

---

## Deployment steps on BF4

```cmd
:: 1. Stop running services
:: 2. Pull latest
git pull

:: 3. NO migration needed this sprint — purely additive frontend
::    plus backend endpoint extensions (no new tables, no schema change)

:: 4. Restart backend so /api/jsw/v2/* endpoints register
:: (uvicorn --reload picks this up automatically)

:: 5. Rebuild frontend
cd frontend
npm run build

:: 6. Hard-refresh the browser to drop the old chunk
```

---

## Verify after deploy

- [ ] Sidebar shows 9 items for admin (Dashboard, Live Tracking, Trip Management, Strategic Planning, Torpedo Management, Reports, Audit Trail, Operations Control, Settings)
- [ ] Operations Live / Trip History (Live) / Plant Live NOT in sidebar
- [ ] `/statistics` lands on **VERSION 2** tab by default
- [ ] `/` (Live Tracking) lands on **VERSION 2** tab by default
- [ ] `/trips` lands on **JSW** main tab by default
- [ ] JSW tab now shows 4 sub-tabs (Active Trips / Exceptions / Completed today / Timeline) with filter chips (Shift / Source / Destination) + Export button
- [ ] **Active Trips** — cards visible, click a card → detail pane on right shows full trip
- [ ] **Exceptions** — alerts queue table; "Acknowledge" button dims the row
- [ ] **Completed (today)** — paginated table; 13 columns; pagination works
- [ ] **Timeline** — gantt with up to 18 lanes; 6h/12h/24h pills re-fetch

---

## Smoke-test endpoints

```bash
# (sign in as admin first to get a token, then add Authorization header)
curl -H "Authorization: Bearer <token>" 'http://localhost:8000/api/jsw/trips?mode=in_flight&page_size=10'
curl -H "Authorization: Bearer <token>" 'http://localhost:8000/api/jsw/trips?mode=completed&time_window=today&page_size=10'
curl -H "Authorization: Bearer <token>" 'http://localhost:8000/api/jsw/v2/exceptions'
curl -H "Authorization: Bearer <token>" 'http://localhost:8000/api/jsw/v2/timeline?hours=12'
```

---

## Rollback

If anything breaks:
- **JSW tab content** — revert `pages/TripManagement.jsx` to render `<JswTripsTab />` instead of `<JswTripOperations />`. Old component is still in `components/JswTripsTab.jsx`.
- **Default tabs** — revert 3 one-line `useState(...)` defaults.
- **Sidebar** — restore the original 4 role arrays in `components/Sidebar.jsx`.
- **Backend** — `mode` param is additive (omitting it returns legacy behavior). `/api/jsw/v2/*` endpoints unused if frontend reverts — no harm.
- **No database changes** — nothing to migrate down.
