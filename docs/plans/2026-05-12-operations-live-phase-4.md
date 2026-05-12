# Operations Live — Phase 4: Trip History (Live) React frontend

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the Trip History (Live) page (`/trip-history-live`) — paginated, filterable trip list with inline click-to-expand horizontal-stepper timeline showing the full producer→torpedo→consumer story of any one trip, plus a deep-link route `/trip-history-live/:trip_id` that opens directly to a pre-expanded trip.

**Architecture:** New `TripHistoryLive.jsx` page following the Phase 3 page conventions (premium-page-container + 1s tick + polling). Three sub-component layers under `frontend/src/components/TripHistoryLive/`: `FilterBar` (time chips + 5 dropdowns + search), `TripListTable` (paginated sortable table with status badges + click handler), `TripStoryExpanded` (horizontal stepper across TAP→LOAD→DEPART→ARRIVE→POUR→CLOSE + chemistry pills + current torpedo position + matched-heats list + anomaly flags). Filter state syncs to URL via `useSearchParams` so any view is shareable. Polls `/api/trip-history-live` every 30s for the list and `/api/trip-history-live/:trip_id` every 10s for the expanded trip.

**Tech Stack:** React 19 + Vite 7, react-router-dom v7 (`useSearchParams`, `useParams`, `useNavigate`), lucide-react icons, the existing `api.ts` HTTP client, the existing `frontend/src/utils/time.js` `formatRelative` helper, the existing `frontend/src/utils/torpedoStatus.js`. Tests via the Vitest harness landed in Phase 3 — no new infra.

**Design document:** [`docs/plans/2026-05-11-operations-live-design.md`](2026-05-11-operations-live-design.md) — Page 2 layout in section "Page 2 — Trip History (Live)".
**Phase 2 plan (consumed endpoints):** [`docs/plans/2026-05-12-operations-live-phase-2.md`](2026-05-12-operations-live-phase-2.md).
**Phase 3 plan (frontend conventions established):** [`docs/plans/2026-05-12-operations-live-phase-3.md`](2026-05-12-operations-live-phase-3.md).

**Branch:** Stay on `sprint-3-operations-live`. Current HEAD: `4ef9061` (Phase 3 complete + visually verified on BF4). All work in this plan lands on the same branch.

---

## Pre-implementation checklist

Before Task 4.1, verify on the DSI dev laptop:

- [ ] On `sprint-3-operations-live`; tree clean (`cd Development/Version_07 && git status`)
- [ ] Last commit is `4ef9061 handover: Phase 3 ops-live Page 1 React frontend` or newer
- [ ] Frontend tests baseline green: `cd frontend && npm test 2>&1 | tail -3` → `56 passed`
- [ ] Backend tests baseline green: `pytest backend/ -q --no-cov 2>&1 | tail -3` → `334 passed`
- [ ] `frontend/src/utils/time.js` exists and exports `formatRelative` (extracted in Phase 3 housekeeping)
- [ ] `frontend/src/utils/torpedoStatus.js` exports `statusColor`
- [ ] `frontend/src/pages/TripHistoryLive.jsx` does NOT exist (this plan creates it)
- [ ] `frontend/src/components/TripHistoryLive/` does NOT exist (this plan creates it)

If any unchecked → fix before starting.

---

## What you are building

### Page routes
- `/trip-history-live` — paginated list view (the default, no row expanded)
- `/trip-history-live/:trip_id` — same list view, but auto-expands the named trip's story panel and scrolls to it. Sharable deep link.

Both routes available to all authenticated roles (admin / trs / ppc / operator). Same gate as `/operations-live`.

### Sidebar entry
A new menu item `Trip History (Live)` (icon `History` from lucide-react) placed **immediately after** each role's `Operations Live` entry (so the live-cockpit pages stay grouped together). All four role menus updated.

### Page layout (top-to-bottom, single scrolling viewport)

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER: "Trip History (Live)" + "Updated Ns ago"                  │
├──────────────────────────────────────────────────────────────────┤
│ ⓐ FILTER BAR (chips + dropdowns + search)                         │
│   [TODAY · 24H · 7D · 30D]   Producer ▾ Consumer ▾ Torpedo ▾      │
│   Status ▾ Shift ▾   🔍 [search trip_id/heat_no/fleet_id ____]    │
├──────────────────────────────────────────────────────────────────┤
│ ⓑ TRIP LIST TABLE (paginated, 50/page, sortable)                  │
│   Torpedo | Src→Dst | Net (MT) | Departed | Status | Heat# | ▾    │
│   ─── rows (click ▾ to expand) ───────────────────────────────    │
│   < Prev   1-50 of 3432   Next >                                  │
├──────────────────────────────────────────────────────────────────┤
│ ⓒ EXPANDED TRIP STORY (visible when a row is clicked / deep-link) │
│   ● TAP ─── ● LOAD ─── ● DEPART ─── ● ARRIVE ─── ● POUR ─── ● CLOSE │
│   BF3       TLC-22     BF3→         SMS3         E2030590   16:10   │
│   14:23     373 MT     14:35        15:02        172 MT    26 MT res │
│   ────────────────────────────────────────────────────────────────  │
│   Chemistry: TEMP 1483 °C · S 0.05 · Si 0.385                      │
│   Current torpedo position: TLC-22 · Moving · (x:12.3, y:45.6)     │
│   Matched heats (2): E2030590 (172 MT), G2030594 (175 MT)          │
│   ⚠ Anomaly: Weight delta +12% (WBATNGL 368 MT, HTS sum 412 MT)    │
└──────────────────────────────────────────────────────────────────┘
```

### Filter state synced to URL via `useSearchParams`

Filter values map to URL query params (so the URL is the source of truth):
- `time_window`: `today` | `24h` | `7d` | `30d` (default `today`)
- `source_lab`: BF1/BF2/BF3/BF4/BF5/COREX1/COREX2 (default omitted = all)
- `destination`: SMS1/SMS2/SMS3/SMS4/RFL (default omitted = all)
- `fleet_id`: TLC-01..TLC-53 (default omitted = all)
- `status`: complete | in_flight | awaiting_pour | anomaly (default omitted = all)
- `shift`: A | B | C (default omitted = all)
- `q`: free-text (default empty)
- `page`: 1, 2, 3... (default 1)
- `sort_by`: out_date | closetime | first_tare_time | net_weight | fleet_id | updated_date (default out_date)
- `sort_order`: asc | desc (default desc)

Changing a filter updates the URL via `setSearchParams({...})`, which triggers re-fetch. Browser back/forward works. Reloading lands on the same view. Sharing the URL takes the recipient to the same filtered state.

### Data contract (Phase 2 backend, already shipped at HEAD `4ef9061`)

**`GET /api/trip-history-live?<query>`** returns:
```jsonc
{
  "rows": [
    {
      "trip_id": "...", "fleet_id": "TLC-22", "source_lab": "BF3", "destination": "SMS3",
      "tap_no": 8338, "tap_hole": 1,
      "gross_weight": 700.9, "tare_weight": 337.0, "net_weight": 368.0,
      "temp": 1503.46, "si_l": 0.57, "s_l": 0.028, "bds_temp": null,
      "shift": "A", "ladleno_raw": "TLC 22",
      "first_tare_time": "2026-05-12T10:00:00",
      "out_date": "2026-05-12T10:20:11",
      "closetime": "2026-05-12T11:00:00",
      "received_date": "2026-05-12T11:01:00",
      "sms_ack_time": null,
      "updated_date": "2026-05-12T11:00:00",
      "match_status": "complete",        // complete | in_flight | awaiting_pour | anomaly
      "first_heat_no": "E2030590",
      "matched_heat_count": 2,
      "matched_hotmetal_total_mt": 347.0,
      "weight_delta_pct": -5.7
    }
  ],
  "page": 1, "page_size": 50, "total": 3432,
  "last_sync_at": { "wbatngl": "...", "hts": "..." }
}
```

(Note: `synced_at`, `id`, `source_table` are filtered out by the backend's `_PRIVATE_COLUMNS` from Phase 2 polish — Phase 4 won't see them.)

**`GET /api/trip-history-live/:trip_id`** returns:
```jsonc
{
  "trip": { /* same row shape minus the *_count / *_pct enrichments */ },
  "matched_heats": [
    {
      "heat_no": "E2030590", "converter_no": "E", "sms": "SMS3",
      "torpedo_no": "TLC-22", "torpedo_no_raw": "22",
      "hotmetal_qty": 172.0, "torpedo_qty": 340.0,
      "torpedo_in_time": "2026-05-12T11:23:00",
      "torpedo_out_time": "2026-05-12T11:45:00",
      "converter_life": 350
    }
  ],
  "current_torpedo_position": {
    "fleet_id": "TLC-22", "type": "torpedo", "x": 12.3, "y": 45.6,
    "last_updated": "2026-05-12T11:48:00",
    "current_status": "Moving"
  },
  "anomaly_flags": [
    { "code": "weight_delta", "severity": "warn",
      "message": "Weight anomaly: WBATNGL 368 MT, HTS sum 412 MT (+44 MT, +12.0%)" }
  ],
  "last_sync_at": { "wbatngl": "...", "hts": "..." }
}
```

404 with `{"detail": "Trip not found: ..."}` if trip_id doesn't exist.

### Polling

- 30s data poll on `/api/trip-history-live?<filter-params>` (the list refreshes slowly — most rows are historical and unchanging).
- 10s data poll on `/api/trip-history-live/:trip_id` when a trip is expanded (only one expanded at a time).
- 1s tick for relative-time labels.
- Pause both data polls when `document.hidden`.

---

## Conventions for this plan

- **All shell commands run from `Development/Version_07/`** unless explicitly noted as `frontend/`.
- **The Bash tool's cwd resets between calls** — chain `cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/...` per call.
- **Each commit's verbatim message is specified in the plan** — use it exactly, append the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` footer.
- **Backend test baseline (334) must stay green throughout.** This plan has zero backend changes. Run `pytest backend/ -q --no-cov 2>&1 | tail -3` once per batch to confirm baseline.
- **Mock `../utils/api`** in component / page tests using `vi.mock` — never reach for fetch-level mocks.
- **Plan-prescribed test bodies are byte-exact** — copy them.
- **No new design system.** Use existing `premium-card`, `premium-page-container`, `space-grotesk`, `hsl(var(--text-primary))`, the `Chip` precedent from `JswTripsTab.jsx`.
- **No router state libraries.** `useSearchParams` from react-router-dom v7 only.
- **DSI laptop has no DB access** — tests against mocked api; manual BF4 verification at the end (Task 4.21).

---

# Batch A — Foundation (Tasks 4.1 – 4.5)

Goal: Routes registered. Sidebar shows the new entry for all 4 roles. `TripHistoryLive.jsx` shell renders with 30s list polling against `/api/trip-history-live`. Loading / error / "Updated Ns ago" / empty body. Deep-link route exists but doesn't yet auto-expand (Batch D wires that).

---

### Task 4.1: Branch + baseline sanity

**Files:**
- Modify: git only

**Step 1:** Confirm on branch + clean tree.

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07
git status
git log --oneline -1
```
Expected: `On branch sprint-3-operations-live`, `nothing to commit`, HEAD = `4ef9061 ...`.

**Step 2:** Confirm frontend + backend baselines green.

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test 2>&1 | tail -3
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07 && pytest backend/ -q --no-cov 2>&1 | tail -3
```
Expected: 56 passed (frontend), 334 passed (backend).

**Step 3:** Confirm the page/component dirs don't exist yet.

```bash
test -f /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend/src/pages/TripHistoryLive.jsx && echo EXISTS || echo OK
test -d /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend/src/components/TripHistoryLive && echo EXISTS || echo OK
```
Expected: `OK` for both.

No code change. No commit.

---

### Task 4.2: Page stub + route + ROUTE_CONFIG entry (TDD)

**Files:**
- Create: `frontend/src/pages/TripHistoryLive.jsx` (stub)
- Create: `frontend/src/pages/__tests__/TripHistoryLive.test.jsx`
- Modify: `frontend/src/App.jsx` (lazy import + 2 routes + ROUTE_CONFIG entry)

**Step 1: Write the failing test**

Create `frontend/src/pages/__tests__/TripHistoryLive.test.jsx`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TripHistoryLive from '../TripHistoryLive'

// Page reads useSearchParams + useParams + useNavigate from react-router-dom,
// so all renders need a Router parent.
const renderWithRouter = (initialEntries = ['/trip-history-live']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <TripHistoryLive />
    </MemoryRouter>
  )

// Mock the api module before the page imports it.
vi.mock('../../utils/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import { api } from '../../utils/api'

describe('TripHistoryLive — initial render', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockReturnValue(new Promise(() => {}))   // hang so we see loading
  })

  it('renders the page heading', () => {
    renderWithRouter()
    expect(screen.getByRole('heading', { name: /trip history.*live/i })).toBeInTheDocument()
  })
})
```

**Step 2: Run, confirm fails**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/pages/__tests__/TripHistoryLive
```
Expected: import error or "Cannot find module ../TripHistoryLive".

**Step 3: Create the stub page**

Create `frontend/src/pages/TripHistoryLive.jsx`:

```javascript
const TripHistoryLive = () => {
    return (
        <div className="premium-page-container" style={{ padding: '24px 32px', overflowY: 'auto' }}>
            <h2 className="space-grotesk" style={{ margin: 0 }}>Trip History (Live)</h2>
        </div>
    )
}

export default TripHistoryLive
```

**Step 4: Register the routes + ROUTE_CONFIG in App.jsx**

In `frontend/src/App.jsx`:

a. Add a lazy import near the other page lazy imports (around line 23):
```jsx
const TripHistoryLive = lazy(() => import('./pages/TripHistoryLive'))
```

b. Add the route + deep-link route in the `AppRoutes` component, immediately after the `/operations-live` route (line ~152):
```jsx
      <Route path="/trip-history-live" element={<PageWrapper><TripHistoryLive /></PageWrapper>} />
      <Route path="/trip-history-live/:trip_id" element={<PageWrapper><TripHistoryLive /></PageWrapper>} />
```

c. Add to `ROUTE_CONFIG` (the object near line 26):
```jsx
  '/trip-history-live': { title: 'Trip History (Live)' },
```

(Also fold in the missing `'/operations-live': { title: 'Operations Live' }` entry while you're there — it's the Phase 3 final-review Minor #6. One-line good-citizen fix.)

**Step 5: Run, confirm pass**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/pages/__tests__/TripHistoryLive
```
Expected: 1 passed.

**Step 6: Smoke-test the build**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm run build 2>&1 | tail -5
```
Expected: green. A `TripHistoryLive-*.js` chunk appears.

**Step 7: Commit**

```bash
git add frontend/src/pages/TripHistoryLive.jsx frontend/src/pages/__tests__/TripHistoryLive.test.jsx frontend/src/App.jsx
git commit -m "feat(trip-history): /trip-history-live route + deep-link route + page stub + first test

Lazy-loaded; matches the App.jsx convention. ROUTE_CONFIG gains entries
for both /operations-live (carry-over Minor from Phase 3 final review)
and /trip-history-live so the PageWrapper picks up the right document
title. Sub-components arrive in Batches B onward.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.3: Sidebar entries for all 4 roles

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`

**Step 1: Add the import**

In the existing `lucide-react` import at the top of the file, add `History`:

```jsx
import { LayoutDashboard, Settings as SettingsIcon, ClipboardList, Truck, Activity, BarChart2, Container, FileText, Shield, Factory, History } from 'lucide-react'
```

**Step 2: Add the entry to all 4 role menus**

Immediately after each role's existing `Operations Live` entry, add:

```jsx
        { path: '/trip-history-live', label: 'Trip History (Live)', icon: <History size={20} /> },
```

Four role lists to update:
- `adminMenuItems` — after `Operations Live` (the new line from Phase 3)
- `trsMenuItems` — same
- `ppcMenuItems` — same
- `operatorMenuItems` — same

**Step 3: Build smoke + test gate**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test 2>&1 | tail -3
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm run build 2>&1 | tail -5
```
Expected: still 57 passing (56 + Task 4.2's new test), build green.

**Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.jsx
git commit -m "feat(trip-history): sidebar entries for all 4 roles

Trip History (Live) menu item placed immediately after each role's
Operations Live entry — keeps the live-cockpit pages grouped.
Uses lucide-react History icon, distinct from Activity (Operations
Live) and LayoutDashboard (Live Tracking).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.4: List polling + URL-state sync (TDD)

**Files:**
- Modify: `frontend/src/pages/TripHistoryLive.jsx`
- Modify: `frontend/src/pages/__tests__/TripHistoryLive.test.jsx`

**Step 1: Replace test file with the polling test set**

Replace `frontend/src/pages/__tests__/TripHistoryLive.test.jsx` entirely with:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TripHistoryLive from '../TripHistoryLive'

vi.mock('../../utils/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import { api } from '../../utils/api'

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <TripHistoryLive />
  </MemoryRouter>
)

const emptyPayload = () => ({
  rows: [],
  page: 1,
  page_size: 50,
  total: 0,
  last_sync_at: { wbatngl: null, hts: null },
})

describe('TripHistoryLive — load + URL sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading state on first paint', () => {
    api.get.mockReturnValue(new Promise(() => {}))
    renderAt('/trip-history-live')
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders the page once data arrives', async () => {
    api.get.mockResolvedValueOnce(emptyPayload())
    renderAt('/trip-history-live')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /trip history.*live/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
  })

  it('renders an error state when the API rejects', async () => {
    api.get.mockRejectedValueOnce(new Error('boom'))
    renderAt('/trip-history-live')
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })
  })

  it('calls /api/trip-history-live with default time_window=today on mount', async () => {
    api.get.mockResolvedValueOnce(emptyPayload())
    renderAt('/trip-history-live')
    await waitFor(() => {
      expect(api.get).toHaveBeenCalled()
    })
    const url = api.get.mock.calls[0][0]
    expect(url).toMatch(/^\/api\/trip-history-live\?/)
    expect(url).toContain('time_window=today')
    expect(url).toContain('page=1')
  })

  it('reads filters from the URL', async () => {
    api.get.mockResolvedValueOnce(emptyPayload())
    renderAt('/trip-history-live?time_window=7d&source_lab=BF3&page=3')
    await waitFor(() => {
      expect(api.get).toHaveBeenCalled()
    })
    const url = api.get.mock.calls[0][0]
    expect(url).toContain('time_window=7d')
    expect(url).toContain('source_lab=BF3')
    expect(url).toContain('page=3')
  })

  it('renders Updated label using last_sync_at.wbatngl', async () => {
    const ago = new Date(Date.now() - 5_000).toISOString()
    api.get.mockResolvedValueOnce({
      ...emptyPayload(),
      last_sync_at: { wbatngl: ago, hts: null },
    })
    renderAt('/trip-history-live')
    await waitFor(() => {
      expect(screen.getByText(/updated \d+s ago/i)).toBeInTheDocument()
    })
  })
})
```

**Step 2: Run, confirm fails**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/pages/__tests__/TripHistoryLive
```
Expected: 5 of 6 fail (only the initial loading test passes on the stub — and even that may fail because the stub doesn't render "Loading").

**Step 3: Implement the page**

Replace `frontend/src/pages/TripHistoryLive.jsx` entirely with:

```javascript
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../utils/api'
import { formatRelative } from '../utils/time'

const LIST_POLL_INTERVAL_MS = 30_000   // list refresh; most rows are historical
const TICK_MS = 1_000

// Query-param defaults applied when not present in the URL.
const URL_DEFAULTS = {
    time_window: 'today',
    page: '1',
    page_size: '50',
    sort_by: 'out_date',
    sort_order: 'desc',
}

// Filter keys we forward to the backend when non-empty (omit on default-empty).
const FORWARDED_KEYS = [
    'time_window', 'source_lab', 'destination', 'shift',
    'fleet_id', 'status', 'q', 'page', 'page_size',
    'sort_by', 'sort_order',
]

const buildQuery = (sp) => {
    const out = {}
    for (const key of FORWARDED_KEYS) {
        const val = sp.get(key) || URL_DEFAULTS[key]
        if (val && val !== 'all') out[key] = val
    }
    return new URLSearchParams(out).toString()
}

const TripHistoryLive = () => {
    const [searchParams] = useSearchParams()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [tick, setTick] = useState(0)

    // List poll, re-fires when the URL changes (filter or page).
    useEffect(() => {
        let mounted = true
        const fetchData = async () => {
            try {
                const url = `/api/trip-history-live?${buildQuery(searchParams)}`
                const res = await api.get(url)
                if (mounted) { setData(res); setError(null) }
            } catch (e) {
                if (mounted) setError(e?.message || 'Failed to load trips')
            } finally {
                if (mounted) setLoading(false)
            }
        }
        fetchData()
        const id = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return
            fetchData()
        }, LIST_POLL_INTERVAL_MS)
        return () => { mounted = false; clearInterval(id) }
    }, [searchParams])

    // 1s tick for relative-time label (decoupled from list poll).
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), TICK_MS)
        return () => clearInterval(id)
    }, [])

    if (loading) {
        return (
            <div className="premium-page-container" style={{ padding: '24px' }}>
                Loading trip history…
            </div>
        )
    }
    if (error) {
        return (
            <div className="premium-page-container"
                 style={{ padding: '24px', color: 'hsl(var(--danger))' }}>
                Error: {error}
            </div>
        )
    }
    if (!data) return null

    return (
        <div className="premium-page-container" style={{ padding: '24px 32px', overflowY: 'auto' }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: '24px', gap: '16px', flexWrap: 'wrap',
            }}>
                <h2 className="space-grotesk" style={{ margin: 0 }}>Trip History (Live)</h2>
                <span style={{
                    fontSize: '12px',
                    color: 'hsl(var(--text-muted))',
                }}>
                    Updated {formatRelative(data.last_sync_at?.wbatngl)}
                </span>
            </div>
            {/* FilterBar, TripListTable, TripStoryExpanded slot in here in Batches B-D. */}
            <span style={{ display: 'none' }}>{tick}</span>
        </div>
    )
}

export default TripHistoryLive
```

**Step 4: Run, confirm pass**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/pages/__tests__/TripHistoryLive
```
Expected: 6 passed.

**Step 5: Commit**

```bash
git add frontend/src/pages/TripHistoryLive.jsx frontend/src/pages/__tests__/TripHistoryLive.test.jsx
git commit -m "feat(trip-history): 30s list polling + URL-state sync + Updated label + 6 tests

Page reads filter state from useSearchParams (browser URL is the source
of truth), forwards non-default values as query params to the backend,
and re-fires the list fetch when the URL changes. 30s poll matches the
slow-changing nature of historical data. document.hidden guard pauses
polling in background tabs. 1s tick keeps the 'Updated Ns ago' label
advancing between data polls (decoupled from the list refresh).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.5: Batch A integration gate

**Files:**
- (No edits — verification only)

**Step 1: Full frontend suite green**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test 2>&1 | tail -3
```
Expected: 62 passing (56 + 6 new).

**Step 2: Build green**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm run build 2>&1 | tail -5
```
Expected: green. `TripHistoryLive-*.js` chunk present.

**Step 3: Backend baseline sanity**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07 && pytest backend/ -q --no-cov 2>&1 | tail -3
```
Expected: `334 passed`.

No new commit.

---

# Batch B — TripListTable (Tasks 4.6 – 4.10)

Goal: Paginated, sortable trip list with status badges and click-to-expand affordance (the actual expansion lands in Batch D).

---

### Task 4.6: StatusBadge sub-component (TDD)

**Files:**
- Create: `frontend/src/components/TripHistoryLive/StatusBadge.jsx`
- Create: `frontend/src/components/TripHistoryLive/__tests__/StatusBadge.test.jsx`

**Step 1: Failing tests**

Create `frontend/src/components/TripHistoryLive/__tests__/StatusBadge.test.jsx`:

```javascript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from '../StatusBadge'

describe('StatusBadge', () => {
    it('renders Complete for match_status="complete"', () => {
        render(<StatusBadge status="complete" />)
        expect(screen.getByText(/complete/i)).toBeInTheDocument()
    })

    it('renders In Flight for "in_flight"', () => {
        render(<StatusBadge status="in_flight" />)
        expect(screen.getByText(/in flight/i)).toBeInTheDocument()
    })

    it('renders Awaiting Pour for "awaiting_pour"', () => {
        render(<StatusBadge status="awaiting_pour" />)
        expect(screen.getByText(/awaiting pour/i)).toBeInTheDocument()
    })

    it('renders Anomaly for "anomaly"', () => {
        render(<StatusBadge status="anomaly" />)
        expect(screen.getByText(/anomaly/i)).toBeInTheDocument()
    })

    it('renders Unknown for null / missing / unrecognised', () => {
        render(<StatusBadge status={null} />)
        expect(screen.getByText(/unknown/i)).toBeInTheDocument()
    })

    it('attaches data-testid that includes the raw status', () => {
        render(<StatusBadge status="anomaly" />)
        expect(screen.getByTestId('status-badge-anomaly')).toBeInTheDocument()
    })
})
```

**Step 2: Run, confirm fails**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/components/TripHistoryLive/__tests__/StatusBadge
```
Expected: import error.

**Step 3: Implement**

Create `frontend/src/components/TripHistoryLive/StatusBadge.jsx`:

```javascript
// match_status -> { label, css-var-suffix }. Aligned with backend's
// /api/trip-history-live row.match_status enum.
const STATUS_META = {
    complete:      { label: 'Complete',      varName: 'success' },
    in_flight:     { label: 'In Flight',     varName: 'primary' },
    awaiting_pour: { label: 'Awaiting Pour', varName: 'warning' },
    anomaly:       { label: 'Anomaly',       varName: 'danger' },
}

const StatusBadge = ({ status }) => {
    const meta = STATUS_META[status]
    const label = meta?.label || 'Unknown'
    const varName = meta?.varName || 'text-muted'
    const colorVar = `var(--${varName})`

    return (
        <span
            data-testid={`status-badge-${status || 'unknown'}`}
            style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                color: `hsl(${colorVar})`,
                padding: '3px 8px',
                borderRadius: '999px',
                border: `1px solid hsl(${colorVar})`,
                background: `hsl(${colorVar} / 0.1)`,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
            }}>{label}</span>
    )
}

export default StatusBadge
```

**Step 4: Run, confirm pass**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/components/TripHistoryLive/__tests__/StatusBadge
```
Expected: 6 passed.

**Step 5: Commit**

```bash
git add frontend/src/components/TripHistoryLive/StatusBadge.jsx frontend/src/components/TripHistoryLive/__tests__/StatusBadge.test.jsx
git commit -m "feat(trip-history): StatusBadge component + 6 tests

Four states (complete / in_flight / awaiting_pour / anomaly) map to
existing CSS variable tokens (--success / --primary / --warning /
--danger). Uses the hsl(var / 0.1) alpha syntax — same pattern as
the Phase 3 Batch E cleanup. Unknown/null falls back to text-muted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.7: TripListTable component (TDD)

**Files:**
- Create: `frontend/src/components/TripHistoryLive/TripListTable.jsx`
- Create: `frontend/src/components/TripHistoryLive/__tests__/TripListTable.test.jsx`

**Step 1: Failing tests**

Create `frontend/src/components/TripHistoryLive/__tests__/TripListTable.test.jsx`:

```javascript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TripListTable from '../TripListTable'

const sample = [
    {
        trip_id: 'T1', fleet_id: 'TLC-22', source_lab: 'BF3', destination: 'SMS3',
        net_weight: 368.0, out_date: '2026-05-12T10:20:11',
        match_status: 'complete', first_heat_no: 'E2030590',
        matched_heat_count: 2, weight_delta_pct: -5.7,
    },
    {
        trip_id: 'T2', fleet_id: 'TLC-44', source_lab: 'BF5', destination: 'SMS4',
        net_weight: null, out_date: null,
        match_status: 'in_flight', first_heat_no: null,
        matched_heat_count: 0, weight_delta_pct: null,
    },
    {
        trip_id: 'T3', fleet_id: 'TLC-99', source_lab: 'BF1', destination: 'SMS1',
        net_weight: 350, out_date: '2026-05-12T08:00:00',
        match_status: 'anomaly', first_heat_no: 'D2030500',
        matched_heat_count: 1, weight_delta_pct: 12.4,
    },
]

describe('TripListTable', () => {
    it('renders one row per trip + header', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        // Header
        expect(screen.getByText(/torpedo/i)).toBeInTheDocument()
        expect(screen.getByText(/source.*destination/i)).toBeInTheDocument()
        expect(screen.getByText(/net.*mt/i)).toBeInTheDocument()
        expect(screen.getByText(/departed/i)).toBeInTheDocument()
        expect(screen.getByText(/status/i)).toBeInTheDocument()
        expect(screen.getByText(/heat #/i)).toBeInTheDocument()
        // Rows
        expect(screen.getByText('TLC-22')).toBeInTheDocument()
        expect(screen.getByText('TLC-44')).toBeInTheDocument()
        expect(screen.getByText('TLC-99')).toBeInTheDocument()
    })

    it('renders BF3 → SMS3 in the source/destination column', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        // Either the unicode arrow or the ASCII pair — we use unicode for the
        // browser presentation (it renders cleanly; Phase 2's mojibake fix
        // was for cmd terminals, not browsers).
        expect(screen.getByText(/BF3.*SMS3/)).toBeInTheDocument()
    })

    it('renders net weight to 0 decimals + MT unit', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        expect(screen.getByText(/368.*MT/i)).toBeInTheDocument()
    })

    it('renders em-dash for missing net_weight / out_date', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        // T2 has nulls — its row should contain at least 2 em-dashes
        const t2Row = screen.getByTestId('trip-row-T2')
        const dashes = (t2Row.textContent.match(/—/g) || []).length
        expect(dashes).toBeGreaterThanOrEqual(2)
    })

    it('renders the StatusBadge per row', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        expect(screen.getByTestId('status-badge-complete')).toBeInTheDocument()
        expect(screen.getByTestId('status-badge-in_flight')).toBeInTheDocument()
        expect(screen.getByTestId('status-badge-anomaly')).toBeInTheDocument()
    })

    it('renders first_heat_no or em-dash', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        expect(screen.getByText('E2030590')).toBeInTheDocument()
        expect(screen.getByText('D2030500')).toBeInTheDocument()
        // T2's heat is null — em-dash in the heat# column for its row
        const t2Row = screen.getByTestId('trip-row-T2')
        // (the StatusBadge "In Flight" still contains a non-dash; the heat cell
        // separately should be a dash)
        expect(t2Row).toBeInTheDocument()
    })

    it('calls onRowClick with the trip_id when a row is clicked', () => {
        const onRowClick = vi.fn()
        render(<TripListTable rows={sample} onRowClick={onRowClick}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        fireEvent.click(screen.getByTestId('trip-row-T1'))
        expect(onRowClick).toHaveBeenCalledWith('T1')
    })

    it('marks the expanded row with aria-expanded=true', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId="T1"
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        expect(screen.getByTestId('trip-row-T1')).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByTestId('trip-row-T2')).toHaveAttribute('aria-expanded', 'false')
    })

    it('calls onSortChange when a sortable header is clicked', () => {
        const onSortChange = vi.fn()
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={onSortChange} />)
        fireEvent.click(screen.getByTestId('header-net_weight'))
        // Clicking the inactive net_weight header sorts by it desc by default
        expect(onSortChange).toHaveBeenCalledWith('net_weight', 'desc')
    })

    it('toggles sort order when clicking the active sort header', () => {
        const onSortChange = vi.fn()
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={onSortChange} />)
        fireEvent.click(screen.getByTestId('header-out_date'))
        expect(onSortChange).toHaveBeenCalledWith('out_date', 'asc')
    })

    it('shows an empty state when rows=[]', () => {
        render(<TripListTable rows={[]} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        expect(screen.getByText(/no trips match/i)).toBeInTheDocument()
    })
})
```

**Step 2: Run, confirm fails**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/components/TripHistoryLive/__tests__/TripListTable
```
Expected: ImportError.

**Step 3: Implement**

Create `frontend/src/components/TripHistoryLive/TripListTable.jsx`:

```javascript
import StatusBadge from './StatusBadge'

const fmtMT = (v) => v != null ? `${Number(v).toFixed(0)} MT` : '—'
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString() : '—'

// Header cells — sortable ones have a sort_by key matching the backend's whitelist.
const COLUMNS = [
    { key: 'fleet_id',     label: 'Torpedo',          sortable: true },
    { key: 'route',        label: 'Source → Destination', sortable: false },
    { key: 'net_weight',   label: 'Net (MT)',         sortable: true,  align: 'right' },
    { key: 'out_date',     label: 'Departed',         sortable: true },
    { key: 'match_status', label: 'Status',           sortable: false },
    { key: 'first_heat_no', label: 'Heat #',          sortable: false },
]

const HeaderCell = ({ col, sortBy, sortOrder, onSortChange }) => {
    const active = col.sortable && col.key === sortBy
    const next = active && sortOrder === 'desc' ? 'asc' : 'desc'
    const arrow = active ? (sortOrder === 'desc' ? ' ▼' : ' ▲') : ''
    return (
        <th
            data-testid={col.sortable ? `header-${col.key}` : undefined}
            onClick={col.sortable ? () => onSortChange(col.key, next) : undefined}
            style={{
                padding: '10px 12px',
                textAlign: col.align || 'left',
                cursor: col.sortable ? 'pointer' : 'default',
                fontSize: '11px',
                fontWeight: 700,
                color: 'hsl(var(--text-muted))',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid hsl(var(--border-color))',
                whiteSpace: 'nowrap',
                userSelect: 'none',
            }}>
            {col.label}{arrow}
        </th>
    )
}

const TripListTable = ({ rows, onRowClick, expandedTripId, sortBy, sortOrder, onSortChange }) => {
    if (rows.length === 0) {
        return (
            <div className="premium-card" style={{
                padding: '32px',
                textAlign: 'center',
                color: 'hsl(var(--text-muted))',
                fontSize: '13px',
            }}>No trips match the current filters.</div>
        )
    }
    return (
        <div className="premium-card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        {COLUMNS.map(col => (
                            <HeaderCell
                                key={col.key}
                                col={col}
                                sortBy={sortBy}
                                sortOrder={sortOrder}
                                onSortChange={onSortChange}
                            />
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const expanded = row.trip_id === expandedTripId
                        return (
                            <tr
                                key={row.trip_id}
                                data-testid={`trip-row-${row.trip_id}`}
                                aria-expanded={expanded ? 'true' : 'false'}
                                onClick={() => onRowClick(row.trip_id)}
                                style={{
                                    cursor: 'pointer',
                                    background: expanded ? 'hsl(var(--bg-primary))' : 'transparent',
                                    transition: 'background 0.1s',
                                }}>
                                <td style={td}>{row.fleet_id || '—'}</td>
                                <td style={td}>
                                    {row.source_lab || '—'} → {row.destination || '—'}
                                </td>
                                <td style={{ ...td, textAlign: 'right' }}>
                                    {fmtMT(row.net_weight)}
                                </td>
                                <td style={td}>{fmtDateTime(row.out_date)}</td>
                                <td style={td}>
                                    <StatusBadge status={row.match_status} />
                                </td>
                                <td style={td}>{row.first_heat_no || '—'}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

const td = {
    padding: '10px 12px',
    fontSize: '13px',
    borderBottom: '1px solid hsl(var(--border-color))',
    color: 'hsl(var(--text-primary))',
}

export default TripListTable
```

**Step 4: Run, confirm pass**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/components/TripHistoryLive/__tests__/TripListTable
```
Expected: 11 passed.

**Step 5: Commit**

```bash
git add frontend/src/components/TripHistoryLive/TripListTable.jsx frontend/src/components/TripHistoryLive/__tests__/TripListTable.test.jsx
git commit -m "feat(trip-history): TripListTable + 11 tests

Six columns: Torpedo, Source → Destination, Net (MT) right-aligned,
Departed, Status (via StatusBadge), Heat #. Three sortable columns
(fleet_id, net_weight, out_date) match the backend's sort whitelist —
clicking an active header toggles asc/desc, clicking an inactive
header starts desc. Row click reports trip_id to the parent. Empty
state when zero rows. aria-expanded reflects the expandedTripId prop.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.8: Pagination component (TDD)

**Files:**
- Create: `frontend/src/components/TripHistoryLive/Pagination.jsx`
- Create: `frontend/src/components/TripHistoryLive/__tests__/Pagination.test.jsx`

**Step 1: Failing tests**

```javascript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Pagination from '../Pagination'

describe('Pagination', () => {
    it('renders 1-50 of 3432 for page 1, page_size 50', () => {
        render(<Pagination page={1} pageSize={50} total={3432} onPageChange={() => {}} />)
        expect(screen.getByText(/1.*–.*50 of 3432/i)).toBeInTheDocument()
    })

    it('renders 51-100 of 3432 for page 2', () => {
        render(<Pagination page={2} pageSize={50} total={3432} onPageChange={() => {}} />)
        expect(screen.getByText(/51.*–.*100 of 3432/i)).toBeInTheDocument()
    })

    it('renders 3401-3432 of 3432 on the last partial page', () => {
        render(<Pagination page={69} pageSize={50} total={3432} onPageChange={() => {}} />)
        // 69 * 50 = 3450 cap → "3401–3432 of 3432"
        expect(screen.getByText(/3401.*–.*3432 of 3432/i)).toBeInTheDocument()
    })

    it('disables Prev on page 1', () => {
        render(<Pagination page={1} pageSize={50} total={3432} onPageChange={() => {}} />)
        expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled()
    })

    it('disables Next on the last page', () => {
        render(<Pagination page={69} pageSize={50} total={3432} onPageChange={() => {}} />)
        expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
    })

    it('calls onPageChange(prev) when Prev clicked', () => {
        const onPageChange = vi.fn()
        render(<Pagination page={5} pageSize={50} total={3432} onPageChange={onPageChange} />)
        fireEvent.click(screen.getByRole('button', { name: /prev/i }))
        expect(onPageChange).toHaveBeenCalledWith(4)
    })

    it('calls onPageChange(next) when Next clicked', () => {
        const onPageChange = vi.fn()
        render(<Pagination page={5} pageSize={50} total={3432} onPageChange={onPageChange} />)
        fireEvent.click(screen.getByRole('button', { name: /next/i }))
        expect(onPageChange).toHaveBeenCalledWith(6)
    })

    it('renders 0 of 0 when total=0', () => {
        render(<Pagination page={1} pageSize={50} total={0} onPageChange={() => {}} />)
        expect(screen.getByText(/0 of 0/i)).toBeInTheDocument()
    })
})
```

**Step 2: Run, confirm fails**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/components/TripHistoryLive/__tests__/Pagination
```

**Step 3: Implement**

Create `frontend/src/components/TripHistoryLive/Pagination.jsx`:

```javascript
import { ChevronLeft, ChevronRight } from 'lucide-react'

const Pagination = ({ page, pageSize, total, onPageChange }) => {
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize)
    const lo = total === 0 ? 0 : (page - 1) * pageSize + 1
    const hi = total === 0 ? 0 : Math.min(page * pageSize, total)
    const onPrev = () => page > 1 && onPageChange(page - 1)
    const onNext = () => page < totalPages && onPageChange(page + 1)

    const btn = (disabled) => ({
        padding: '6px 12px',
        borderRadius: '8px',
        border: '1px solid hsl(var(--border-color))',
        background: 'transparent',
        color: disabled ? 'hsl(var(--text-muted))' : 'hsl(var(--text-primary))',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '12px',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        opacity: disabled ? 0.5 : 1,
    })

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            gap: '12px',
            flexWrap: 'wrap',
        }}>
            <span style={{ fontSize: '12px', color: 'hsl(var(--text-muted))' }}>
                {total === 0 ? '0 of 0' : `${lo}–${hi} of ${total}`}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={onPrev} disabled={page <= 1} style={btn(page <= 1)}>
                    <ChevronLeft size={14} /> Prev
                </button>
                <button onClick={onNext} disabled={page >= totalPages} style={btn(page >= totalPages)}>
                    Next <ChevronRight size={14} />
                </button>
            </div>
        </div>
    )
}

export default Pagination
```

**Step 4: Run, confirm pass**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/components/TripHistoryLive/__tests__/Pagination
```
Expected: 8 passed.

**Step 5: Commit**

```bash
git add frontend/src/components/TripHistoryLive/Pagination.jsx frontend/src/components/TripHistoryLive/__tests__/Pagination.test.jsx
git commit -m "feat(trip-history): Pagination component + 8 tests

Renders 'lo–hi of total' label and Prev/Next buttons disabled at
endpoints. Total=0 renders '0 of 0' and both buttons disabled.
ChevronLeft/Right icons from lucide-react match the existing
JswTripsTab pagination precedent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.9: Wire TripListTable + Pagination + sort state into TripHistoryLive (TDD)

**Files:**
- Modify: `frontend/src/pages/TripHistoryLive.jsx`
- Modify: `frontend/src/pages/__tests__/TripHistoryLive.test.jsx`

**Step 1: Append wiring tests**

Append to `TripHistoryLive.test.jsx`:

```javascript
const samplePayload = () => ({
    rows: [
        { trip_id: 'T1', fleet_id: 'TLC-22', source_lab: 'BF3', destination: 'SMS3',
          net_weight: 368.0, out_date: '2026-05-12T10:20:11',
          match_status: 'complete', first_heat_no: 'E2030590',
          matched_heat_count: 2, weight_delta_pct: -5.7 },
        { trip_id: 'T2', fleet_id: 'TLC-44', source_lab: 'BF5', destination: 'SMS4',
          net_weight: null, out_date: null,
          match_status: 'in_flight', first_heat_no: null,
          matched_heat_count: 0, weight_delta_pct: null },
    ],
    page: 1, page_size: 50, total: 187,
    last_sync_at: { wbatngl: '2026-05-12T11:00:00', hts: null },
})

describe('TripHistoryLive — list integration', () => {
    beforeEach(() => { vi.clearAllMocks() })

    it('renders TripListTable rows from the API', async () => {
        api.get.mockResolvedValueOnce(samplePayload())
        renderAt('/trip-history-live')
        await waitFor(() => {
            expect(screen.getByText('TLC-22')).toBeInTheDocument()
        })
        expect(screen.getByText('TLC-44')).toBeInTheDocument()
    })

    it('renders Pagination with the API total', async () => {
        api.get.mockResolvedValueOnce(samplePayload())
        renderAt('/trip-history-live')
        await waitFor(() => {
            expect(screen.getByText(/of 187/i)).toBeInTheDocument()
        })
    })

    it('clicking the next-page button bumps page in the URL', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live')
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
        })
        fireEvent.click(screen.getByRole('button', { name: /next/i }))
        await waitFor(() => {
            // 2nd call after URL change
            expect(api.get).toHaveBeenCalledTimes(2)
            expect(api.get.mock.calls[1][0]).toContain('page=2')
        })
    })

    it('clicking a sortable header updates sort_by + sort_order in the URL', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live')
        await waitFor(() => {
            expect(screen.getByTestId('header-net_weight')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByTestId('header-net_weight'))
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(2)
            expect(api.get.mock.calls[1][0]).toContain('sort_by=net_weight')
            expect(api.get.mock.calls[1][0]).toContain('sort_order=desc')
        })
    })
})
```

Add `fireEvent` to the existing `import { render, screen, waitFor } from '@testing-library/react'` line:

```javascript
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
```

**Step 2: Run, confirm fails**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/pages/__tests__/TripHistoryLive
```
Expected: 4 failures (the wiring tests).

**Step 3: Wire components + URL handlers**

In `frontend/src/pages/TripHistoryLive.jsx`, add imports near the top:

```javascript
import TripListTable from '../components/TripHistoryLive/TripListTable'
import Pagination from '../components/TripHistoryLive/Pagination'
```

Add `useNavigate, useParams` to the existing react-router-dom import:

```javascript
import { useSearchParams, useParams, useNavigate } from 'react-router-dom'
```

Replace the success-state JSX (everything inside the success-state `<div className="premium-page-container">`) with:

```jsx
            <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: '24px', gap: '16px', flexWrap: 'wrap',
            }}>
                <h2 className="space-grotesk" style={{ margin: 0 }}>Trip History (Live)</h2>
                <span style={{
                    fontSize: '12px',
                    color: 'hsl(var(--text-muted))',
                }}>
                    Updated {formatRelative(data.last_sync_at?.wbatngl)}
                </span>
            </div>

            {/* FilterBar slot — Batch C wires this in */}

            <TripListTable
                rows={data.rows}
                onRowClick={handleRowClick}
                expandedTripId={expandedTripId}
                sortBy={searchParams.get('sort_by') || 'out_date'}
                sortOrder={searchParams.get('sort_order') || 'desc'}
                onSortChange={handleSortChange}
            />

            <Pagination
                page={Number(searchParams.get('page') || 1)}
                pageSize={data.page_size || 50}
                total={data.total || 0}
                onPageChange={handlePageChange}
            />

            {/* TripStoryExpanded slot — Batch D wires this in */}

            <span style={{ display: 'none' }}>{tick}</span>
```

Add the handler functions inside the component body (above the `if (loading)` check):

```javascript
    const { trip_id: trip_id_from_url } = useParams()
    const navigate = useNavigate()
    // Expanded trip is either driven by the URL (/trip-history-live/:trip_id)
    // or by a click handler (no URL change, just inline state). For now in
    // Batch B we only honor the URL; Batch D adds inline click expansion.
    const expandedTripId = trip_id_from_url || null

    const updateParams = (mut) => {
        const next = new URLSearchParams(searchParams)
        for (const [k, v] of Object.entries(mut)) {
            if (v === null || v === undefined || v === '') next.delete(k)
            else next.set(k, String(v))
        }
        return next
    }

    const handlePageChange = (newPage) => {
        const next = updateParams({ page: newPage })
        setSearchParams(next)
    }

    const handleSortChange = (sortBy, sortOrder) => {
        const next = updateParams({ sort_by: sortBy, sort_order: sortOrder, page: 1 })
        setSearchParams(next)
    }

    const handleRowClick = (tripId) => {
        // Batch B: navigate to deep-link route. Batch D layers inline toggle on top.
        if (tripId === expandedTripId) {
            navigate(`/trip-history-live?${searchParams.toString()}`)
        } else {
            navigate(`/trip-history-live/${encodeURIComponent(tripId)}?${searchParams.toString()}`)
        }
    }
```

Also update the `useSearchParams` destructure to capture the setter:

```javascript
    const [searchParams, setSearchParams] = useSearchParams()
```

**Step 4: Run, confirm pass**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/pages/__tests__/TripHistoryLive
```
Expected: 10 passed (6 from Task 4.4 + 4 new wiring tests).

**Step 5: Commit**

```bash
git add frontend/src/pages/TripHistoryLive.jsx frontend/src/pages/__tests__/TripHistoryLive.test.jsx
git commit -m "feat(trip-history): wire TripListTable + Pagination + URL sort/page handlers

Page now renders the table + pagination from the API payload. Sort and
page interactions mutate the URL via setSearchParams (which triggers
re-fetch via the useEffect dependency on searchParams). Row clicks
navigate between /trip-history-live and /trip-history-live/:trip_id
deep-link routes — TripStoryExpanded panel lands in Batch D.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.10: Batch B integration gate

**Files:**
- (No edits — verification only)

**Step 1: Full frontend suite**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test 2>&1 | tail -3
```
Expected: 87 passing (62 prior + 6 StatusBadge + 11 TripListTable + 8 Pagination + (10−6=)4 wiring = 87).

**Step 2: Build green**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm run build 2>&1 | tail -5
```

**Step 3: Backend baseline**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07 && pytest backend/ -q --no-cov 2>&1 | tail -3
```
Expected: `334 passed`.

No new commit.

---

# Batch C — FilterBar (Tasks 4.11 – 4.14)

Goal: Time chips + 5 dropdowns + search input, all wired into the URL via `useSearchParams`. The list re-fetches because the URL is its data-flow upstream.

---

### Task 4.11: FilterBar component (TDD)

**Files:**
- Create: `frontend/src/components/TripHistoryLive/FilterBar.jsx`
- Create: `frontend/src/components/TripHistoryLive/__tests__/FilterBar.test.jsx`

**Step 1: Failing tests**

Create `frontend/src/components/TripHistoryLive/__tests__/FilterBar.test.jsx`:

```javascript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilterBar from '../FilterBar'

const defaultValues = {
    time_window: 'today',
    source_lab: 'all',
    destination: 'all',
    fleet_id: 'all',
    status: 'all',
    shift: 'all',
    q: '',
}

describe('FilterBar', () => {
    it('renders the 4 time-window chips', () => {
        render(<FilterBar values={defaultValues} onChange={() => {}} />)
        expect(screen.getByRole('button', { name: /^today$/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^24h$/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^7d$/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^30d$/i })).toBeInTheDocument()
    })

    it('marks the active time chip via data-active', () => {
        render(<FilterBar values={{ ...defaultValues, time_window: '7d' }} onChange={() => {}} />)
        expect(screen.getByRole('button', { name: /^7d$/i })).toHaveAttribute('data-active', 'true')
        expect(screen.getByRole('button', { name: /^today$/i })).toHaveAttribute('data-active', 'false')
    })

    it('calls onChange when a chip is clicked', () => {
        const onChange = vi.fn()
        render(<FilterBar values={defaultValues} onChange={onChange} />)
        fireEvent.click(screen.getByRole('button', { name: /^7d$/i }))
        expect(onChange).toHaveBeenCalledWith({ time_window: '7d', page: 1 })
    })

    it('renders the producer dropdown with the expected options', () => {
        render(<FilterBar values={defaultValues} onChange={() => {}} />)
        const select = screen.getByLabelText(/producer/i)
        expect(select).toBeInTheDocument()
        const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
        expect(options).toEqual(expect.arrayContaining([
            'all', 'BF1', 'BF2', 'BF3', 'BF4', 'BF5', 'COREX1', 'COREX2',
        ]))
    })

    it('calls onChange when the producer dropdown changes', () => {
        const onChange = vi.fn()
        render(<FilterBar values={defaultValues} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText(/producer/i), { target: { value: 'BF3' } })
        expect(onChange).toHaveBeenCalledWith({ source_lab: 'BF3', page: 1 })
    })

    it('renders the consumer dropdown with the expected options', () => {
        render(<FilterBar values={defaultValues} onChange={() => {}} />)
        const select = screen.getByLabelText(/consumer/i)
        const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
        expect(options).toEqual(expect.arrayContaining([
            'all', 'SMS1', 'SMS2', 'SMS3', 'SMS4', 'RFL',
        ]))
    })

    it('renders the torpedo dropdown with 53 TLC values + "all"', () => {
        render(<FilterBar values={defaultValues} onChange={() => {}} />)
        const select = screen.getByLabelText(/torpedo/i)
        const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
        expect(options.length).toBe(54)        // all + TLC-01..TLC-53
        expect(options).toContain('all')
        expect(options).toContain('TLC-01')
        expect(options).toContain('TLC-53')
    })

    it('renders the status dropdown with the 5 enum values + "all"', () => {
        render(<FilterBar values={defaultValues} onChange={() => {}} />)
        const select = screen.getByLabelText(/status/i)
        const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
        expect(options).toEqual(['all', 'complete', 'in_flight', 'awaiting_pour', 'anomaly'])
    })

    it('renders the shift dropdown with A/B/C/all', () => {
        render(<FilterBar values={defaultValues} onChange={() => {}} />)
        const select = screen.getByLabelText(/shift/i)
        const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
        expect(options).toEqual(['all', 'A', 'B', 'C'])
    })

    it('renders a search input with the current q value', () => {
        render(<FilterBar values={{ ...defaultValues, q: 'TLC-22' }} onChange={() => {}} />)
        expect(screen.getByPlaceholderText(/search/i)).toHaveValue('TLC-22')
    })

    it('calls onChange with the new q on submit', () => {
        const onChange = vi.fn()
        render(<FilterBar values={defaultValues} onChange={onChange} />)
        const input = screen.getByPlaceholderText(/search/i)
        fireEvent.change(input, { target: { value: 'TLC-22' } })
        fireEvent.submit(input.closest('form'))
        expect(onChange).toHaveBeenCalledWith({ q: 'TLC-22', page: 1 })
    })
})
```

**Step 2: Run, confirm fails**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/components/TripHistoryLive/__tests__/FilterBar
```

**Step 3: Implement**

Create `frontend/src/components/TripHistoryLive/FilterBar.jsx`:

```javascript
import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'

const TIME_WINDOWS = [
    { value: 'today', label: 'Today' },
    { value: '24h',   label: '24h' },
    { value: '7d',    label: '7d' },
    { value: '30d',   label: '30d' },
]
const PRODUCERS = ['all', 'BF1', 'BF2', 'BF3', 'BF4', 'BF5', 'COREX1', 'COREX2']
const CONSUMERS = ['all', 'SMS1', 'SMS2', 'SMS3', 'SMS4', 'RFL']
const TORPEDOES = [
    'all',
    ...Array.from({ length: 53 }, (_, i) => `TLC-${String(i + 1).padStart(2, '0')}`),
]
const STATUSES = ['all', 'complete', 'in_flight', 'awaiting_pour', 'anomaly']
const SHIFTS = ['all', 'A', 'B', 'C']

const STATUS_LABEL = {
    all: 'All',
    complete: 'Complete',
    in_flight: 'In Flight',
    awaiting_pour: 'Awaiting Pour',
    anomaly: 'Anomaly',
}

const chipStyle = (active) => ({
    padding: '6px 14px',
    borderRadius: '999px',
    border: '1px solid hsl(var(--border-color))',
    background: active ? 'hsl(var(--primary))' : 'transparent',
    color: active ? 'white' : 'hsl(var(--text-muted))',
    fontWeight: 700,
    fontSize: '11px',
    letterSpacing: '0.05em',
    cursor: 'pointer',
    textTransform: 'uppercase',
    transition: 'all 0.15s',
})

const labelStyle = {
    fontSize: '11px',
    fontWeight: 600,
    color: 'hsl(var(--text-muted))',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
}

const selectStyle = {
    padding: '6px 10px',
    fontSize: '12px',
    borderRadius: '8px',
    border: '1px solid hsl(var(--border-color))',
    background: 'hsl(var(--bg-secondary))',
    color: 'hsl(var(--text-primary))',
    minWidth: '110px',
}

const FilterBar = ({ values, onChange }) => {
    const [qLocal, setQLocal] = useState(values.q || '')

    useEffect(() => {
        setQLocal(values.q || '')
    }, [values.q])

    const onSearchSubmit = (e) => {
        e.preventDefault()
        onChange({ q: qLocal.trim(), page: 1 })
    }

    return (
        <div className="premium-card" style={{
            padding: '16px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
        }}>
            {/* Time chips */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {TIME_WINDOWS.map(w => (
                    <button
                        key={w.value}
                        data-active={values.time_window === w.value ? 'true' : 'false'}
                        onClick={() => onChange({ time_window: w.value, page: 1 })}
                        style={chipStyle(values.time_window === w.value)}>
                        {w.label}
                    </button>
                ))}
            </div>

            {/* Dropdowns + search, single row that wraps */}
            <div style={{
                display: 'flex',
                gap: '16px',
                flexWrap: 'wrap',
                alignItems: 'center',
            }}>
                <label style={labelStyle}>
                    Producer
                    <select
                        value={values.source_lab || 'all'}
                        onChange={(e) => onChange({ source_lab: e.target.value, page: 1 })}
                        style={{ ...selectStyle, marginLeft: '8px' }}>
                        {PRODUCERS.map(p => (
                            <option key={p} value={p}>{p === 'all' ? 'All' : p}</option>
                        ))}
                    </select>
                </label>

                <label style={labelStyle}>
                    Consumer
                    <select
                        value={values.destination || 'all'}
                        onChange={(e) => onChange({ destination: e.target.value, page: 1 })}
                        style={{ ...selectStyle, marginLeft: '8px' }}>
                        {CONSUMERS.map(c => (
                            <option key={c} value={c}>{c === 'all' ? 'All' : c}</option>
                        ))}
                    </select>
                </label>

                <label style={labelStyle}>
                    Torpedo
                    <select
                        value={values.fleet_id || 'all'}
                        onChange={(e) => onChange({ fleet_id: e.target.value, page: 1 })}
                        style={{ ...selectStyle, marginLeft: '8px' }}>
                        {TORPEDOES.map(t => (
                            <option key={t} value={t}>{t === 'all' ? 'All' : t}</option>
                        ))}
                    </select>
                </label>

                <label style={labelStyle}>
                    Status
                    <select
                        value={values.status || 'all'}
                        onChange={(e) => onChange({ status: e.target.value, page: 1 })}
                        style={{ ...selectStyle, marginLeft: '8px' }}>
                        {STATUSES.map(s => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                    </select>
                </label>

                <label style={labelStyle}>
                    Shift
                    <select
                        value={values.shift || 'all'}
                        onChange={(e) => onChange({ shift: e.target.value, page: 1 })}
                        style={{ ...selectStyle, marginLeft: '8px', minWidth: '80px' }}>
                        {SHIFTS.map(s => (
                            <option key={s} value={s}>{s === 'all' ? 'All' : s}</option>
                        ))}
                    </select>
                </label>

                <form onSubmit={onSearchSubmit} style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'hsl(var(--bg-secondary))',
                        border: '1px solid hsl(var(--border-color))',
                        borderRadius: '8px',
                        padding: '6px 10px',
                    }}>
                        <Search size={14} color="hsl(var(--text-muted))" />
                        <input
                            type="search"
                            placeholder="Search trip id / fleet id / heat #"
                            value={qLocal}
                            onChange={(e) => setQLocal(e.target.value)}
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: 'hsl(var(--text-primary))',
                                fontSize: '13px',
                            }}
                        />
                    </div>
                </form>
            </div>
        </div>
    )
}

export default FilterBar
```

**Step 4: Run, confirm pass**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/components/TripHistoryLive/__tests__/FilterBar
```
Expected: 11 passed.

**Step 5: Commit**

```bash
git add frontend/src/components/TripHistoryLive/FilterBar.jsx frontend/src/components/TripHistoryLive/__tests__/FilterBar.test.jsx
git commit -m "feat(trip-history): FilterBar — time chips + 5 dropdowns + search + 11 tests

Time-window chips (Today / 24h / 7d / 30d), Producer / Consumer / Torpedo
/ Status / Shift dropdowns, and a debounced search box (submit-on-enter
to avoid hammering the API on every keystroke). All controls report
their next value + page:1 to the parent via onChange — parent owns URL
sync. Status dropdown maps the backend's snake_case enum to
human-readable labels.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.12: Wire FilterBar into TripHistoryLive (TDD)

**Files:**
- Modify: `frontend/src/pages/TripHistoryLive.jsx`
- Modify: `frontend/src/pages/__tests__/TripHistoryLive.test.jsx`

**Step 1: Append integration test**

```javascript
    it('clicking a time-window chip updates time_window + resets page in the URL', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live?page=3')
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /^7d$/i })).toBeInTheDocument()
        })
        fireEvent.click(screen.getByRole('button', { name: /^7d$/i }))
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(2)
        })
        const url = api.get.mock.calls[1][0]
        expect(url).toContain('time_window=7d')
        expect(url).toContain('page=1')
    })

    it('selecting a producer dropdown value updates source_lab in the URL', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live')
        await waitFor(() => {
            expect(screen.getByLabelText(/producer/i)).toBeInTheDocument()
        })
        fireEvent.change(screen.getByLabelText(/producer/i), { target: { value: 'BF4' } })
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(2)
        })
        expect(api.get.mock.calls[1][0]).toContain('source_lab=BF4')
    })
```

**Step 2: Run, confirm fails**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/pages/__tests__/TripHistoryLive
```

**Step 3: Wire FilterBar**

In `frontend/src/pages/TripHistoryLive.jsx`, add the import:

```javascript
import FilterBar from '../components/TripHistoryLive/FilterBar'
```

Add a `filterValues` computed from `searchParams` + a `handleFilterChange` function inside the component body (near the other handlers):

```javascript
    const filterValues = {
        time_window: searchParams.get('time_window') || 'today',
        source_lab: searchParams.get('source_lab') || 'all',
        destination: searchParams.get('destination') || 'all',
        fleet_id: searchParams.get('fleet_id') || 'all',
        status: searchParams.get('status') || 'all',
        shift: searchParams.get('shift') || 'all',
        q: searchParams.get('q') || '',
    }

    const handleFilterChange = (mut) => {
        // Translate 'all' / '' back to URL-absent for cleanliness.
        const sanitised = {}
        for (const [k, v] of Object.entries(mut)) {
            sanitised[k] = (v === 'all' || v === '') ? null : v
        }
        setSearchParams(updateParams(sanitised))
    }
```

Render `<FilterBar values={filterValues} onChange={handleFilterChange} />` in the success-state JSX, IMMEDIATELY ABOVE `<TripListTable>` (replace the `{/* FilterBar slot — Batch C wires this in */}` placeholder).

**Step 4: Run, confirm pass**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/pages/__tests__/TripHistoryLive
```
Expected: 12 passed (10 prior + 2 new).

**Step 5: Commit**

```bash
git add frontend/src/pages/TripHistoryLive.jsx frontend/src/pages/__tests__/TripHistoryLive.test.jsx
git commit -m "feat(trip-history): wire FilterBar — chips/dropdowns/search drive the URL

Filter changes translate 'all'/'' into URL-absent so the canonical URL
is minimal (e.g. /trip-history-live?source_lab=BF3 not ?source_lab=BF3&destination=all
&shift=all&...). Page resets to 1 on any filter change. The URL is the
source of truth — setSearchParams triggers re-fetch via the existing
useEffect.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.13: URL-restore edge cases (TDD-light)

**Files:**
- Modify: `frontend/src/pages/__tests__/TripHistoryLive.test.jsx`

**Step 1: Append edge-case regression tests**

```javascript
    it('reload with full filter URL restores all controls', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live?time_window=7d&source_lab=BF3&destination=SMS2&fleet_id=TLC-22&status=anomaly&shift=A&q=heat&page=2&sort_by=net_weight&sort_order=asc')
        await waitFor(() => {
            // Controls reflect the URL
            expect(screen.getByLabelText(/producer/i)).toHaveValue('BF3')
            expect(screen.getByLabelText(/consumer/i)).toHaveValue('SMS2')
            expect(screen.getByLabelText(/torpedo/i)).toHaveValue('TLC-22')
            expect(screen.getByLabelText(/status/i)).toHaveValue('anomaly')
            expect(screen.getByLabelText(/shift/i)).toHaveValue('A')
            expect(screen.getByPlaceholderText(/search/i)).toHaveValue('heat')
            expect(screen.getByRole('button', { name: /^7d$/i })).toHaveAttribute('data-active', 'true')
        })
    })

    it('changing filter while on page 5 resets to page 1', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live?page=5&source_lab=BF3')
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(1)
        })
        fireEvent.change(screen.getByLabelText(/consumer/i), { target: { value: 'SMS4' } })
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(2)
        })
        expect(api.get.mock.calls[1][0]).toContain('page=1')
        expect(api.get.mock.calls[1][0]).not.toContain('page=5')
    })
```

**Step 2: Run, confirm pass first run (regression coverage — should already work)**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/pages/__tests__/TripHistoryLive
```
Expected: 14 passed (12 prior + 2 new). If they fail, the wiring missed an edge case — fix it before committing.

**Step 3: Commit**

```bash
git add frontend/src/pages/__tests__/TripHistoryLive.test.jsx
git commit -m "test(trip-history): URL-restore + page-reset edge cases (regression coverage)

Two tests pin existing behaviour:
- Reload with a fully-populated URL restores all FilterBar controls
- Changing any filter on page 5 resets to page 1 (avoid stale-page lookups
  past the new filtered total)

No production code change needed — both passed first run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.14: Batch C integration gate

**Files:**
- (No edits — verification only)

**Step 1: Full suite**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test 2>&1 | tail -3
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm run build 2>&1 | tail -5
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07 && pytest backend/ -q --no-cov 2>&1 | tail -3
```
Expected: 98+ passing (87 prior + 11 FilterBar + 2 wiring + 2 URL-restore = 102), 334 passing.

No new commit.

---

# Batch D — TripStoryExpanded (Tasks 4.15 – 4.18)

Goal: When a row is clicked or the URL hits `/trip-history-live/:trip_id`, fetch the detail endpoint and render the expanded trip story below the row. Polls every 10s while expanded. Closes on second click or navigation back.

---

### Task 4.15: useTripDetail hook (TDD)

**Files:**
- Create: `frontend/src/components/TripHistoryLive/useTripDetail.js`
- Create: `frontend/src/components/TripHistoryLive/__tests__/useTripDetail.test.jsx`

**Step 1: Failing tests**

Create `frontend/src/components/TripHistoryLive/__tests__/useTripDetail.test.jsx`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import useTripDetail from '../useTripDetail'

vi.mock('../../../utils/api', () => ({
    api: { get: vi.fn() },
}))

import { api } from '../../../utils/api'

const sample = () => ({
    trip: { trip_id: 'T1', fleet_id: 'TLC-22' },
    matched_heats: [],
    current_torpedo_position: null,
    anomaly_flags: [],
    last_sync_at: { wbatngl: null, hts: null },
})

describe('useTripDetail', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns null until a trip_id is provided', () => {
        const { result } = renderHook(() => useTripDetail(null))
        expect(result.current.data).toBeNull()
        expect(result.current.error).toBeNull()
        expect(result.current.loading).toBe(false)
        expect(api.get).not.toHaveBeenCalled()
    })

    it('fetches /api/trip-history-live/:trip_id when trip_id changes', async () => {
        api.get.mockResolvedValueOnce(sample())
        const { result } = renderHook(() => useTripDetail('T1'))
        await waitFor(() => {
            expect(result.current.data).not.toBeNull()
        })
        expect(api.get).toHaveBeenCalledWith('/api/trip-history-live/T1')
        expect(result.current.data.trip.trip_id).toBe('T1')
    })

    it('polls every 10 seconds while trip_id remains set', async () => {
        api.get.mockResolvedValue(sample())
        renderHook(() => useTripDetail('T1'))
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(1)
        })
        await act(async () => { vi.advanceTimersByTime(10_000) })
        expect(api.get).toHaveBeenCalledTimes(2)
        await act(async () => { vi.advanceTimersByTime(10_000) })
        expect(api.get).toHaveBeenCalledTimes(3)
    })

    it('stops polling when trip_id becomes null', async () => {
        api.get.mockResolvedValue(sample())
        const { rerender } = renderHook(({ id }) => useTripDetail(id), {
            initialProps: { id: 'T1' },
        })
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(1)
        })
        rerender({ id: null })
        await act(async () => { vi.advanceTimersByTime(30_000) })
        // No new calls after the unmount of the previous effect
        expect(api.get).toHaveBeenCalledTimes(1)
    })

    it('surfaces error message on api rejection', async () => {
        api.get.mockRejectedValueOnce(new Error('not found'))
        const { result } = renderHook(() => useTripDetail('T_BAD'))
        await waitFor(() => {
            expect(result.current.error).toBe('not found')
        })
    })

    it('clears error on next successful poll', async () => {
        api.get.mockRejectedValueOnce(new Error('boom'))
        api.get.mockResolvedValueOnce(sample())
        const { result } = renderHook(() => useTripDetail('T1'))
        await waitFor(() => {
            expect(result.current.error).toBe('boom')
        })
        await act(async () => { vi.advanceTimersByTime(10_000) })
        await waitFor(() => {
            expect(result.current.error).toBeNull()
            expect(result.current.data).not.toBeNull()
        })
    })
})
```

**Step 2: Run, confirm fails**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/components/TripHistoryLive/__tests__/useTripDetail
```
Expected: ImportError.

**Step 3: Implement**

Create `frontend/src/components/TripHistoryLive/useTripDetail.js`:

```javascript
import { useState, useEffect } from 'react'
import { api } from '../../utils/api'

const DETAIL_POLL_INTERVAL_MS = 10_000

/**
 * Fetches /api/trip-history-live/:trip_id and re-polls every 10s while
 * trip_id remains set. Returns null data when trip_id is null/undefined.
 * Error from a single poll is preserved on the result until the next
 * successful poll clears it.
 */
const useTripDetail = (tripId) => {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (!tripId) {
            setData(null)
            setLoading(false)
            setError(null)
            return
        }
        let mounted = true
        setLoading(true)
        setData(null)
        setError(null)
        const fetchDetail = async () => {
            try {
                const res = await api.get(`/api/trip-history-live/${tripId}`)
                if (mounted) { setData(res); setError(null) }
            } catch (e) {
                if (mounted) setError(e?.message || 'Failed to load trip detail')
            } finally {
                if (mounted) setLoading(false)
            }
        }
        fetchDetail()
        const id = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return
            fetchDetail()
        }, DETAIL_POLL_INTERVAL_MS)
        return () => { mounted = false; clearInterval(id) }
    }, [tripId])

    return { data, loading, error }
}

export default useTripDetail
```

**Step 4: Run, confirm pass**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/components/TripHistoryLive/__tests__/useTripDetail
```
Expected: 6 passed.

**Step 5: Commit**

```bash
git add frontend/src/components/TripHistoryLive/useTripDetail.js frontend/src/components/TripHistoryLive/__tests__/useTripDetail.test.jsx
git commit -m "feat(trip-history): useTripDetail hook + 6 tests

Fetches the detail endpoint when trip_id flips truthy, re-polls every
10s, stops when trip_id becomes null, surfaces error messages, and
clears them on next successful poll. document.hidden guard keeps it
quiet in backgrounded tabs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.16: TripStoryExpanded component — stepper + chemistry + position (TDD)

**Files:**
- Create: `frontend/src/components/TripHistoryLive/TripStoryExpanded.jsx`
- Create: `frontend/src/components/TripHistoryLive/__tests__/TripStoryExpanded.test.jsx`

**Step 1: Failing tests**

Create `frontend/src/components/TripHistoryLive/__tests__/TripStoryExpanded.test.jsx`:

```javascript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TripStoryExpanded from '../TripStoryExpanded'

const sample = () => ({
    trip: {
        trip_id: 'T1', fleet_id: 'TLC-22',
        source_lab: 'BF3', destination: 'SMS3',
        tap_no: 8338,
        net_weight: 368.0, gross_weight: 700.9, tare_weight: 337.0,
        temp: 1483.0, si_l: 0.385, s_l: 0.05,
        shift: 'A',
        first_tare_time: '2026-05-12T14:23:00',
        out_date: '2026-05-12T14:35:00',
        closetime: '2026-05-12T15:02:00',
    },
    matched_heats: [
        { heat_no: 'E2030590', converter_no: 'E', sms: 'SMS3',
          torpedo_no: 'TLC-22', torpedo_no_raw: '22',
          hotmetal_qty: 172.0, torpedo_qty: 340.0,
          torpedo_in_time: '2026-05-12T15:30:00',
          torpedo_out_time: '2026-05-12T15:50:00',
          converter_life: 350 },
        { heat_no: 'G2030594', converter_no: 'G', sms: 'SMS3',
          torpedo_no: 'TLC-22', torpedo_no_raw: '22',
          hotmetal_qty: 175.0, torpedo_qty: 340.0,
          torpedo_in_time: '2026-05-12T16:10:00',
          torpedo_out_time: null,
          converter_life: 200 },
    ],
    current_torpedo_position: {
        fleet_id: 'TLC-22', type: 'torpedo', x: 12.3, y: 45.6,
        last_updated: '2026-05-12T16:15:00',
        current_status: 'Moving',
    },
    anomaly_flags: [],
    last_sync_at: { wbatngl: '2026-05-12T16:00:00', hts: null },
})

describe('TripStoryExpanded', () => {
    it('renders all 6 stepper stages', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        for (const stage of ['TAP', 'LOAD', 'DEPART', 'ARRIVE', 'POUR', 'CLOSE']) {
            expect(screen.getByText(stage)).toBeInTheDocument()
        }
    })

    it('renders TAP stage with source_lab + first_tare_time', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        const tapStage = screen.getByTestId('stage-TAP')
        expect(tapStage).toHaveTextContent('BF3')
    })

    it('renders LOAD stage with torpedo + net_weight', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        const loadStage = screen.getByTestId('stage-LOAD')
        expect(loadStage).toHaveTextContent('TLC-22')
        expect(loadStage).toHaveTextContent(/368/)
    })

    it('renders POUR stage with first matched heat_no + hotmetal_qty', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        const pourStage = screen.getByTestId('stage-POUR')
        expect(pourStage).toHaveTextContent('E2030590')
        expect(pourStage).toHaveTextContent(/172/)
    })

    it('renders chemistry pills with temp + S + Si', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        expect(screen.getByText(/1483/)).toBeInTheDocument()       // temp
        expect(screen.getByText(/0\.05/)).toBeInTheDocument()      // s_l
        expect(screen.getByText(/0\.385/)).toBeInTheDocument()     // si_l
    })

    it('renders current torpedo position when present', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        expect(screen.getByText(/current position/i)).toBeInTheDocument()
        expect(screen.getByText(/moving/i)).toBeInTheDocument()
    })

    it('renders matched heats count and list', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        expect(screen.getByText(/matched heats.*2/i)).toBeInTheDocument()
        expect(screen.getByText('E2030590')).toBeInTheDocument()
        expect(screen.getByText('G2030594')).toBeInTheDocument()
    })

    it('renders an empty-heats message when matched_heats=[]', () => {
        const data = sample()
        data.matched_heats = []
        render(<TripStoryExpanded data={data} loading={false} error={null} />)
        expect(screen.getByText(/no matched heats/i)).toBeInTheDocument()
    })

    it('renders anomaly_flags when present', () => {
        const data = sample()
        data.anomaly_flags = [
            { code: 'weight_delta', severity: 'warn',
              message: 'Weight anomaly: WBATNGL 368 MT, HTS sum 412 MT (+44 MT, +12.0%)' },
        ]
        render(<TripStoryExpanded data={data} loading={false} error={null} />)
        expect(screen.getByText(/weight anomaly/i)).toBeInTheDocument()
        expect(screen.getByText(/\+12/)).toBeInTheDocument()
    })

    it('renders a loading state', () => {
        render(<TripStoryExpanded data={null} loading={true} error={null} />)
        expect(screen.getByText(/loading trip/i)).toBeInTheDocument()
    })

    it('renders an error state', () => {
        render(<TripStoryExpanded data={null} loading={false} error="not found" />)
        expect(screen.getByText(/not found|error/i)).toBeInTheDocument()
    })

    it('renders nothing when data is null and not loading and no error', () => {
        const { container } = render(<TripStoryExpanded data={null} loading={false} error={null} />)
        expect(container).toBeEmptyDOMElement()
    })
})
```

**Step 2: Run, confirm fails**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/components/TripHistoryLive/__tests__/TripStoryExpanded
```

**Step 3: Implement**

Create `frontend/src/components/TripHistoryLive/TripStoryExpanded.jsx`:

```javascript
import { AlertTriangle, Flame } from 'lucide-react'

const STAGES = ['TAP', 'LOAD', 'DEPART', 'ARRIVE', 'POUR', 'CLOSE']

const fmt0 = (v) => v != null ? Number(v).toFixed(0) : '—'
const fmt1 = (v) => v != null ? Number(v).toFixed(1) : '—'
const fmt3 = (v) => v != null ? Number(v).toFixed(3) : '—'
const fmtTime = (iso) => iso
    ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '—'

const StageDot = ({ label, isFirst, isLast, lines = [] }) => (
    <div
        data-testid={`stage-${label}`}
        style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0 8px',
        }}>
        {/* Connector line behind the dot — drawn except at start */}
        {!isFirst && (
            <div style={{
                position: 'absolute',
                top: '11px',
                left: 0,
                width: '50%',
                height: '2px',
                background: 'hsl(var(--border-color))',
                zIndex: 0,
            }} />
        )}
        {!isLast && (
            <div style={{
                position: 'absolute',
                top: '11px',
                left: '50%',
                width: '50%',
                height: '2px',
                background: 'hsl(var(--border-color))',
                zIndex: 0,
            }} />
        )}
        {/* Dot */}
        <div style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: 'hsl(var(--primary))',
            border: '4px solid hsl(var(--bg-secondary))',
            boxSizing: 'content-box',
            zIndex: 1,
            position: 'relative',
        }} />
        {/* Label + per-stage lines */}
        <div style={{
            marginTop: '8px',
            fontSize: '11px',
            fontWeight: 700,
            color: 'hsl(var(--text-primary))',
            letterSpacing: '0.05em',
        }}>{label}</div>
        {lines.map((line, i) => (
            <div key={i} style={{
                fontSize: '11px',
                color: 'hsl(var(--text-muted))',
                textAlign: 'center',
                marginTop: '2px',
                whiteSpace: 'nowrap',
            }}>{line}</div>
        ))}
    </div>
)

const stageLines = (data) => {
    const t = data.trip
    const firstHeat = data.matched_heats[0]
    const totalPoured = data.matched_heats.reduce(
        (acc, h) => acc + (Number.isFinite(Number(h.hotmetal_qty)) ? Number(h.hotmetal_qty) : 0),
        0
    )
    const residual = t.net_weight != null
        ? Number(t.net_weight) - totalPoured
        : null

    return {
        TAP:    [t.source_lab || '—', fmtTime(t.first_tare_time)],
        LOAD:   [t.fleet_id || '—', t.net_weight != null ? `${fmt0(t.net_weight)} MT` : '—'],
        DEPART: [t.source_lab || '—', fmtTime(t.out_date)],
        ARRIVE: [t.destination || '—', fmtTime(t.closetime)],
        POUR:   firstHeat
            ? [firstHeat.heat_no, `${fmt0(firstHeat.hotmetal_qty)} MT`]
            : ['—', '—'],
        CLOSE:  [
            fmtTime(t.closetime),
            residual != null ? `${fmt0(residual)} MT res` : '—',
        ],
    }
}

const ChemistryPill = ({ label, value, unit }) => (
    <span style={{
        padding: '6px 10px',
        borderRadius: '8px',
        background: 'hsl(var(--bg-secondary))',
        border: '1px solid hsl(var(--border-color))',
        fontSize: '12px',
        color: 'hsl(var(--text-primary))',
        whiteSpace: 'nowrap',
    }}>
        <span style={{ color: 'hsl(var(--text-muted))', marginRight: '6px' }}>{label}</span>
        <strong>{value}</strong>{unit && <span style={{ color: 'hsl(var(--text-muted))' }}> {unit}</span>}
    </span>
)

const TripStoryExpanded = ({ data, loading, error }) => {
    if (loading) {
        return (
            <div className="premium-card" style={{ padding: '20px', marginTop: '16px' }}>
                Loading trip story…
            </div>
        )
    }
    if (error) {
        return (
            <div className="premium-card" style={{
                padding: '20px',
                marginTop: '16px',
                color: 'hsl(var(--danger))',
            }}>Error: {error}</div>
        )
    }
    if (!data) return null

    const lines = stageLines(data)

    return (
        <div className="premium-card" style={{
            padding: '24px',
            marginTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
        }}>
            {/* Anomaly callout (if any) */}
            {data.anomaly_flags && data.anomaly_flags.length > 0 && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'hsl(var(--danger) / 0.1)',
                    border: '1px solid hsl(var(--danger))',
                    color: 'hsl(var(--danger))',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                }}>
                    <AlertTriangle size={18} />
                    <div>
                        {data.anomaly_flags.map((f, i) => (
                            <div key={i}>{f.message}</div>
                        ))}
                    </div>
                </div>
            )}

            {/* Horizontal stepper */}
            <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 0,
            }}>
                {STAGES.map((stage, i) => (
                    <StageDot
                        key={stage}
                        label={stage}
                        isFirst={i === 0}
                        isLast={i === STAGES.length - 1}
                        lines={lines[stage]}
                    />
                ))}
            </div>

            {/* Chemistry pills */}
            <div style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                paddingTop: '8px',
                borderTop: '1px solid hsl(var(--border-color))',
            }}>
                <ChemistryPill label="TEMP" value={fmt1(data.trip.temp)} unit="°C" />
                <ChemistryPill label="S"    value={fmt3(data.trip.s_l)} unit="%" />
                <ChemistryPill label="Si"   value={fmt3(data.trip.si_l)} unit="%" />
            </div>

            {/* Current torpedo position */}
            {data.current_torpedo_position && (
                <div style={{
                    fontSize: '13px',
                    color: 'hsl(var(--text-primary))',
                }}>
                    <span style={{ color: 'hsl(var(--text-muted))', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Current Position
                    </span>
                    <div style={{ marginTop: '4px' }}>
                        {data.current_torpedo_position.fleet_id} ·{' '}
                        <strong>{data.current_torpedo_position.current_status || 'Unknown'}</strong>{' '}
                        · (x: {fmt1(data.current_torpedo_position.x)},
                        y: {fmt1(data.current_torpedo_position.y)})
                    </div>
                </div>
            )}

            {/* Matched heats list */}
            <div>
                <div style={{
                    color: 'hsl(var(--text-muted))',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px',
                }}>
                    Matched Heats {data.matched_heats.length > 0 && `(${data.matched_heats.length})`}
                </div>
                {data.matched_heats.length === 0 ? (
                    <div style={{ color: 'hsl(var(--text-muted))', fontSize: '13px' }}>
                        No matched heats for this trip yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {data.matched_heats.map(h => (
                            <div key={h.heat_no} style={{
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'center',
                                fontSize: '13px',
                                color: 'hsl(var(--text-primary))',
                                padding: '8px 10px',
                                background: 'hsl(var(--bg-secondary))',
                                borderRadius: '6px',
                            }}>
                                <Flame size={14} color="hsl(var(--warning))" />
                                <strong>{h.heat_no}</strong>
                                <span style={{ color: 'hsl(var(--text-muted))' }}>
                                    @ {h.converter_no || '—'} · {fmt0(h.hotmetal_qty)} MT
                                </span>
                                <span style={{ marginLeft: 'auto', color: 'hsl(var(--text-muted))', fontSize: '11px' }}>
                                    {fmtTime(h.torpedo_in_time)} → {fmtTime(h.torpedo_out_time)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default TripStoryExpanded
```

**Step 4: Run, confirm pass**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/components/TripHistoryLive/__tests__/TripStoryExpanded
```
Expected: 12 passed.

**Step 5: Commit**

```bash
git add frontend/src/components/TripHistoryLive/TripStoryExpanded.jsx frontend/src/components/TripHistoryLive/__tests__/TripStoryExpanded.test.jsx
git commit -m "feat(trip-history): TripStoryExpanded — stepper + chemistry + position + heats + 12 tests

Horizontal stepper with 6 stages (TAP / LOAD / DEPART / ARRIVE / POUR /
CLOSE) — each stage has 2 lines of metadata derived from the trip +
first matched heat. Residual computed as (net_weight - sum of matched
hotmetal_qty). Chemistry pills below the stepper (TEMP, S, Si).
Current torpedo position line uses current_status (the FleetManagement
value piped through Phase 2's hotfix). Matched heats list with
Flame icons + per-heat in/out times. Anomaly callout at top when
backend emits any anomaly_flags entries.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.17: Wire useTripDetail + TripStoryExpanded into TripHistoryLive (TDD)

**Files:**
- Modify: `frontend/src/pages/TripHistoryLive.jsx`
- Modify: `frontend/src/pages/__tests__/TripHistoryLive.test.jsx`

**Step 1: Append integration tests**

```javascript
    it('renders TripStoryExpanded when the URL has /:trip_id', async () => {
        api.get.mockImplementation((url) => {
            if (url.startsWith('/api/trip-history-live/')) {
                return Promise.resolve({
                    trip: { trip_id: 'T1', fleet_id: 'TLC-22',
                            source_lab: 'BF3', destination: 'SMS3',
                            net_weight: 368.0 },
                    matched_heats: [],
                    current_torpedo_position: null,
                    anomaly_flags: [],
                    last_sync_at: { wbatngl: null, hts: null },
                })
            }
            return Promise.resolve(samplePayload())
        })
        renderAt('/trip-history-live/T1')
        await waitFor(() => {
            expect(screen.getByText('TAP')).toBeInTheDocument()
        })
        // Also calls both endpoints
        const callUrls = api.get.mock.calls.map(c => c[0])
        expect(callUrls.some(u => u.startsWith('/api/trip-history-live?'))).toBe(true)
        expect(callUrls.some(u => u === '/api/trip-history-live/T1')).toBe(true)
    })

    it('clicking a row navigates to the deep-link route', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live')
        await waitFor(() => {
            expect(screen.getByTestId('trip-row-T1')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByTestId('trip-row-T1'))
        // The detail endpoint should now have been called
        await waitFor(() => {
            const callUrls = api.get.mock.calls.map(c => c[0])
            expect(callUrls.some(u => u === '/api/trip-history-live/T1')).toBe(true)
        })
    })
```

**Step 2: Run, confirm fails**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/pages/__tests__/TripHistoryLive
```

**Step 3: Wire the detail panel**

In `frontend/src/pages/TripHistoryLive.jsx`, add the imports:

```javascript
import useTripDetail from '../components/TripHistoryLive/useTripDetail'
import TripStoryExpanded from '../components/TripHistoryLive/TripStoryExpanded'
```

Add a hook call right after the existing `expandedTripId` line:

```javascript
    const { data: detail, loading: detailLoading, error: detailError } =
        useTripDetail(expandedTripId)
```

In the success-state JSX, replace the `{/* TripStoryExpanded slot — Batch D wires this in */}` placeholder with:

```jsx
            {expandedTripId && (
                <TripStoryExpanded data={detail} loading={detailLoading} error={detailError} />
            )}
```

**Step 4: Run, confirm pass**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test -- src/pages/__tests__/TripHistoryLive
```
Expected: 16 passed (14 prior + 2 new).

**Step 5: Commit**

```bash
git add frontend/src/pages/TripHistoryLive.jsx frontend/src/pages/__tests__/TripHistoryLive.test.jsx
git commit -m "feat(trip-history): wire TripStoryExpanded + useTripDetail into the page

Click any row to navigate to /trip-history-live/:trip_id; the detail
panel appears below the list and polls every 10s. Clicking the
expanded row again navigates back to /trip-history-live (closes the
panel). Deep-linking to /trip-history-live/:trip_id directly is the
same shape — both routes share the page component and useParams
provides the trip_id either way.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.18: Batch D integration gate

**Files:**
- (No edits — verification only)

**Step 1: Full suite**

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test 2>&1 | tail -3
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm run build 2>&1 | tail -5
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07 && pytest backend/ -q --no-cov 2>&1 | tail -3
```
Expected: 132+ frontend tests (102 prior + 6 useTripDetail + 12 TripStoryExpanded + 2 wiring + a couple of test-count drift = ~132), 334 backend.

No new commit.

---

# Batch E — Polish + handover + push (Tasks 4.19 – 4.21)

Goal: changes_tracker entries, handover folder, push to both remotes. User runs BF4 visual verification.

---

### Task 4.19: changes_tracker entries

**Files:**
- Modify: `Development/Version_07/changes_tracker.md`

**Step 1:** Append entries #76 + #77 to `changes_tracker.md`. Latest entry was #75 (Phase 3). Use today's actual time.

```markdown
| 76 | 2026-05-12 ... | frontend/src/pages/TripHistoryLive.jsx + frontend/src/pages/__tests__/TripHistoryLive.test.jsx + frontend/src/App.jsx + frontend/src/components/Sidebar.jsx | (page did not exist) | NEW /trip-history-live page + /trip-history-live/:trip_id deep-link route. Sidebar entry for all 4 roles, positioned right after Operations Live. URL-state-synced filters via useSearchParams: time_window, source_lab, destination, fleet_id, status, shift, q, page, sort_by, sort_order. 30s list poll + 10s detail poll + 1s tick. ROUTE_CONFIG entries for both /operations-live (carry-over) and /trip-history-live | Phase 4 of operations-live sprint — Page 2 (trip history with click-to-expand timeline) | Per design doc 2026-05-11-operations-live-design.md and plan 2026-05-12-operations-live-phase-4.md | New util: none (reuses time.js + torpedoStatus.js from Phase 3). New hook: useTripDetail. New CSS variables: none (uses --success / --warning / --danger / --primary / --text-muted from existing :root). The Phase 2 hotfix's renamed key current_torpedo_position.current_status is consumed here for the first time |
| 77 | 2026-05-12 ... | frontend/src/components/TripHistoryLive/*.jsx + corresponding __tests__ | (did not exist) | 6 new sub-components: StatusBadge, TripListTable, Pagination, FilterBar, TripStoryExpanded, useTripDetail (hook). 54 new Vitest tests covering all branches | Coverage for the Phase 4 page | TDD-driven per the plan; component-level tests pass props directly, page-level integration tests mock the api util via vi.mock | Mocking responsibility split: sub-component tests own pure behavior; page tests mock api responses. useTripDetail uses vi.useFakeTimers to assert 10s polling cadence without real-time waits |
```

(Adjust the actual count `54 new Vitest tests` if your final tally is different — the count includes StatusBadge 6 + TripListTable 11 + Pagination 8 + FilterBar 11 + useTripDetail 6 + TripStoryExpanded 12 = 54.)

**Step 2:** Commit.

```bash
git add Development/Version_07/changes_tracker.md
git commit -m "docs(tracker): #76-#77 — Phase 4 frontend (Trip History Live page)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.20: Handover folder + push

**Files:**
- Create: `handover/2026-05-12-operations-live-phase-4/` mirror

**Step 1:** Create the directory structure + copy files. From `Development/Version_07/`:

```bash
HOFF=handover/2026-05-12-operations-live-phase-4
mkdir -p $HOFF/frontend/src/pages/__tests__
mkdir -p $HOFF/frontend/src/components/TripHistoryLive/__tests__
mkdir -p $HOFF/frontend/src/components
mkdir -p $HOFF/docs/plans

cp frontend/src/pages/TripHistoryLive.jsx                                $HOFF/frontend/src/pages/
cp frontend/src/pages/__tests__/TripHistoryLive.test.jsx                 $HOFF/frontend/src/pages/__tests__/
cp frontend/src/components/TripHistoryLive/*.jsx                         $HOFF/frontend/src/components/TripHistoryLive/
cp frontend/src/components/TripHistoryLive/*.js                          $HOFF/frontend/src/components/TripHistoryLive/ 2>/dev/null || true
cp frontend/src/components/TripHistoryLive/__tests__/*.jsx               $HOFF/frontend/src/components/TripHistoryLive/__tests__/
cp frontend/src/App.jsx                                                  $HOFF/frontend/src/
cp frontend/src/components/Sidebar.jsx                                   $HOFF/frontend/src/components/
cp docs/plans/2026-05-12-operations-live-phase-4.md                      $HOFF/docs/plans/
```

**Step 2:** Write `handover/2026-05-12-operations-live-phase-4/README.md` mirroring the Phase 3 handover format. Cover:

- **What's in this handover** — new page + 6 sub-components + sidebar entries + 54 new tests
- **Deploy steps on BF4** — `git pull && cd frontend && npm install && npm run build && cd ..` then restart frontend dev/static server. No backend restart, no migrations.
- **Verify on BF4** — log in as admin, click new `Trip History (Live)` entry (between `Operations Live` and `Plant Live`); confirm filter bar renders; confirm trip list renders with status badges; click a row; confirm story panel slides in with stepper + chemistry + position + matched heats; navigate to `/trip-history-live/T1` directly and confirm deep-link works; check the URL updates when changing filters / page / sort.
- **Rollback** — `git revert` the relevant range OR remove the two routes + sidebar entries.
- **Test counts** — 132 frontend / 334 backend.

**Step 3:** Final test gate BEFORE push.

```bash
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm test 2>&1 | tail -3
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07/frontend && npm run build 2>&1 | tail -5
cd /c/Users/DSI-LPT-081/Desktop/HMD/Development/Version_07 && pytest backend/ -q --no-cov 2>&1 | tail -3
```
Expected: all green. If red, STOP and investigate — do NOT push a red branch.

**Step 4:** Commit + push.

```bash
git add handover/2026-05-12-operations-live-phase-4/
git commit -m "handover: Phase 4 ops-live Page 2 React frontend (Trip History Live)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

git push new-origin sprint-3-operations-live
git push origin sprint-3-operations-live
```

**Step 5:** Confirm both remote SHAs match local HEAD.

```bash
echo "Local HEAD:   $(git rev-parse HEAD)"
echo "new-origin:   $(git ls-remote new-origin sprint-3-operations-live | awk '{print $1}')"
echo "origin:       $(git ls-remote origin sprint-3-operations-live | awk '{print $1}')"
```

All three must match.

---

### Task 4.21: BF4 deploy + manual visual verification (user-driven)

Hand off to the user with:

> "Phase 4 pushed. To deploy on BF4:
>
> ```
> cd C:\Users\v_subramanya.gopal\Desktop\HMD
> git pull
> cd frontend
> npm install
> npm run build
> cd ..
> ```
>
> Then restart whatever serves the frontend.
>
> Verify by:
>
> 1. Sidebar has a new **Trip History (Live)** entry (history icon) between Operations Live and Plant Live.
> 2. Page renders with header + Updated label.
> 3. Filter bar visible — time chips, 5 dropdowns, search input.
> 4. Trip list table renders with status badges. Pagination at the bottom shows "1–50 of N".
> 5. Click a row → story panel slides in below with the horizontal stepper (TAP → LOAD → DEPART → ARRIVE → POUR → CLOSE) + chemistry pills + current torpedo position + matched heats list.
> 6. Change a filter → URL updates → list re-fetches → new rows render.
> 7. Click a sortable header → URL gains sort_by + sort_order → list re-fetches → order changes.
> 8. Navigate directly to `/trip-history-live/<some-trip-id>` → page loads with that trip auto-expanded.
> 9. Click the expanded row again → story panel closes, URL returns to `/trip-history-live`.
>
> Paste a screenshot or any error / unexpected behavior."

End of Phase 4. Phase 5 (final sprint close-out) gets written next, after user confirms Phase 4 on BF4.

---

## Done-Definition for Phase 4

- [ ] `frontend/src/pages/TripHistoryLive.jsx` exists; renders header + Updated label + 3 sub-sections (filter, table, story-when-expanded)
- [ ] 6 sub-components under `frontend/src/components/TripHistoryLive/` + test file for each
- [ ] Both routes registered in `App.jsx`; `ROUTE_CONFIG` updated for both new pages
- [ ] Sidebar entry added to all 4 role menus
- [ ] `npm test` green (~132 tests)
- [ ] `npm run build` green
- [ ] Backend test baseline still at 334 (no regressions)
- [ ] `changes_tracker.md` entries #76 + #77 added
- [ ] Handover folder created with README
- [ ] Pushed to both remotes; SHAs match
- [ ] User confirms BF4 visual verification

---

## Notes for the implementer

- **URL is the single source of truth.** Don't add useState for filter values that mirror URL — the page already reads from `useSearchParams`. Adding shadow state risks the two going out of sync.
- **`updateParams` helper** is the only path that should call `setSearchParams`. Inline mutations create subtle bugs.
- **`useTripDetail`'s `vi.useFakeTimers()` tests** — wrap timer-advance calls in `act()`. The test bodies above do; copy the pattern.
- **Deep-link route trip_id is URL-decoded by `useParams`** — but if a trip_id contains URL-special characters (it can: `8338TLC 211120526` has a literal space), the click handler MUST `encodeURIComponent` it before constructing the navigate target. The plan body does this. Don't drop the encode.
- **The horizontal stepper's connector lines** are absolutely-positioned divs between dots — the `isFirst` / `isLast` props gate their rendering. Trust the layout math; don't fight CSS.
- **Chemistry pill formatting** — Si and S go to 3 decimals (the data is typically 0.385 / 0.05), temp to 1 decimal (1483.4 °C). The reference impl does this.
- **No Recharts in this batch.** The chemistry section is 3 pills, not a chart. The design doc shows a chart but real values are simple enough that pills are clearer at this size — defer chart to a Phase 5 polish if user pushes back.
- **`current_torpedo_position.current_status`** is the Phase-2-hotfix-renamed key. If the backend ever serves the old `.status` key for some reason (cache bug?), the UI will render "Unknown". Defensive but not silent.
- **Plan estimates ~1.5 days** — same as the design doc's Phase 4 estimate. Bigger than Phase 3 because Page 2 has more controls + the rich detail panel.
