# Handover — Operations Live Phase 3 (Frontend Page 1)

**Date:** 2026-05-12
**Branch:** `sprint-3-operations-live`
**HEAD at handover:** Phase 3 final commit (see `git log --oneline 577187d..HEAD`)
**Phase:** 3 of 5 in the Operations Live sprint (Phase 1 = HTS sync backend; Phase 2 = API endpoints; Phase 3 = Page 1 React frontend; Phases 4-5 = Page 2 frontend + polish)

---

## What's in this handover

The React frontend for the **Operations Live cockpit (Page 1)** — a single-pane real-time dashboard consuming `GET /api/operations-live/dashboard` (shipped in Phase 2). One new page, five sub-components, a brand-new Vitest test stack, sidebar entry for all four roles, route registration.

### New page

`/operations-live` route — admin / trs / ppc / operator. Layout top-to-bottom:

1. **Header** — "Operations Live" title + "Updated Ns ago" label that ticks every second using `last_sync_at.wbatngl`.
2. **TopKpiStrip** — 5 KPI tiles (production_today_mt, consumption_today_mt, active_trips_now, heats_in_progress, idle_torpedoes).
3. **2-column grid** — `LiveHeatsPanel` (2×3 grid of `ConverterCard`s for converters D/E/F/G/H/I) on the left (~60%), `ActiveTripsPanel` on the right (~40%).
4. **RecentActivityFeed** — chronological list of recent `trip_completed` + `heat_started` events with relative-time labels.

Polling cadence: **10 s** (matches the dashboard endpoint's 5 s cache TTL × 2), paused when `document.hidden`.

### New test stack

First frontend tests in the repo. Vitest + React Testing Library + jsdom; `npm test` / `npm run test:watch` scripts; `frontend/vitest.config.js` + `frontend/src/test/setup.js`. Backend has 334 pytest tests; this is the matching frontend bar.

### Files in this folder (mirror of `Development/Version_07/`)

```
frontend/
  package.json + package-lock.json    # +5 devDependencies (vitest, @testing-library/react, jsdom, etc.)
  vitest.config.js                    # NEW — jsdom env, setup file, css: true
  src/
    App.jsx                           # MODIFIED — added <Route path="/operations-live"...>
    pages/
      OperationsLive.jsx              # NEW — the page (~85 LOC)
      PlantLive.jsx                   # MODIFIED — switched local formatRelative to shared utils/time.js
      __tests__/
        OperationsLive.test.jsx       # NEW — 12 integration tests
    components/
      Sidebar.jsx                     # MODIFIED — Operations Live entry for all 4 role menus
      OperationsLive/
        TopKpiStrip.jsx               # NEW — 5-tile KPI strip
        RecentActivityFeed.jsx        # NEW — activity list
        ConverterCard.jsx             # NEW — single converter card (IDLE / HEAT_IN_PROGRESS states)
        LiveHeatsPanel.jsx            # NEW — 2×3 grid wrapper
        ActiveTripsPanel.jsx          # NEW — trip list w/ status chip
        __tests__/
          TopKpiStrip.test.jsx        # 5 tests
          RecentActivityFeed.test.jsx # 6 tests
          ConverterCard.test.jsx      # 9 tests
          LiveHeatsPanel.test.jsx     # 6 tests
          ActiveTripsPanel.test.jsx   # 7 tests
    test/
      setup.js                        # NEW — Vitest jest-dom matchers + cleanup
      smoke.test.jsx                  # NEW — 2 sanity tests
    utils/
      time.js                         # NEW — shared formatRelative() (extracted in 41ddb72)
      __tests__/time.test.js          # NEW — 9 tests
docs/plans/
  2026-05-12-operations-live-phase-3.md   # spec for Batches A-E of this phase
README.md                             # this file
```

### Commits in this handover (18 commits, baseline `577187d`)

```
9760b01  test(frontend): install Vitest + RTL + jsdom + smoke test
6ebfc90  feat(ops-live): /operations-live route + page stub + first test
96b1228  feat(ops-live): sidebar entries for all 4 roles
f6adf46  feat(ops-live): polling hook + loading/error states + 4 tests
4b1efc4  feat(ops-live): 'Updated Ns ago' label + 1s tick
46bc204  feat(ops-live): TopKpiStrip component + 4 tests
688041d  feat(ops-live): wire TopKpiStrip into the page
b83bb9a  feat(ops-live): RecentActivityFeed component + 6 tests
53d34ee  feat(ops-live): wire RecentActivityFeed into the page + integration test
41ddb72  refactor(frontend): extract formatRelative to shared util + tighten KPI test + fix activity-feed key
ad87162  feat(ops-live): ConverterCard component + 9 tests
15ef9b1  feat(ops-live): LiveHeatsPanel (2×3 grid) + 6 tests
653e060  feat(ops-live): wire LiveHeatsPanel into the page + integration test
ec47be0  feat(ops-live): ActiveTripsPanel component + 7 tests
972cc55  feat(ops-live): wire ActiveTripsPanel + 2-column heats+trips layout
9c80343  refactor(ops-live): converge hardcoded colors to CSS variables + simplify StatusChip
909a924  test(ops-live): regression coverage for empty-payload + stale-data-during-refresh
a9194d5  docs(tracker): #74-#75 — Phase 3 frontend (Vitest stack + Operations Live page)
```

Plus this handover commit (`handover: Phase 3 ops-live Page 1 React frontend`).

---

## Deploy steps (on BF4)

```cmd
cd C:\Users\v_subramanya.gopal\Desktop\HMD
git pull
cd frontend
npm install
npm run build
cd ..
```

Then restart whatever serves the frontend (Vite dev server via `npm run dev` for dev mode, or your static server / `npm run preview`). **The backend does not need to restart** — no backend changes in this phase. **No migrations.** **No env changes.**

---

## Verify (browser, after deploy)

Open the app and log in as **admin** (then repeat for trs / ppc / operator):

1. Look at the sidebar. There should be a new **Operations Live** entry placed after **Live Tracking** and before the next item. Visible for all four roles.
2. Click it. The URL becomes `/operations-live`.
3. The page renders. Expected within ~1 s:
   - Header reads "Operations Live" + an "Updated Ns ago" label that **ticks every second** using `last_sync_at.wbatngl` from the API. The first tick after page load should read close to "Updated 0s ago" then advance.
   - Five KPI tiles populated with real numbers (production_today_mt, consumption_today_mt, active_trips_now, heats_in_progress, idle_torpedoes). The values should match a fresh `curl -H "Authorization: Bearer <jwt>" http://localhost:8000/api/operations-live/dashboard` against the same instance.
   - **Live Heats** panel (left, ~60% width) shows 6 cards for converters D/E/F/G/H/I in 2 rows × 3 columns. While HTS feed is frozen all six will be IDLE — that's expected. The state badge should have a **visible 10%-opacity background tint** (slate for IDLE, forest green for HEAT_IN_PROGRESS).
   - **Active Trips** panel (right, ~40% width) shows real trip rows. The status chips should display **real values** like `Operating`, `Moving`, `Maintenance` (from `FleetManagement.status` via the Phase 2 hotfix in #69) — **not** the literal string "Unknown" for torpedoes that have a row in `FleetManagement`. Unknown chips should only appear for torpedoes with no FM row.
   - **Recent Activity Feed** at the bottom shows the last ~30 events. `trip_completed` rows use the **ASCII arrow `->`** (no mojibake — fixed by Phase 2 hotfix #70). `heat_started` rows show the orange flame icon now using the `--warning` CSS token (theme-consistent, replaced the hardcoded `#f97316` in the refactor commit `9c80343`).
4. Open DevTools → Console. Expected: zero errors. Network tab should show `/api/operations-live/dashboard` polling every 10 s.
5. Switch to another browser tab for ~30 s, then return. Polling should pause while hidden (verify by watching the Network tab) and resume on return.

If anything looks off, paste a screenshot + the browser console output (`F12 → Console`).

---

## Behavioural changes ops will see

This phase landed two design polishes via the final refactor commit `9c80343` that operators will perceive:

- **Converter IDLE badge now has a visible background tint.** Pre-refactor, ConverterCard's IDLE state badge composed its 10%-opacity background using the `${color}1A` 8-digit-hex alpha trick — invalid CSS when `color` is `hsl(var(--text-muted))`. The background silently dropped to transparent. Switched to `hsl(var(--text-muted) / 0.1)` proper HSL syntax, so the badge now shows a soft slate halo (matches the HEAT_IN_PROGRESS badge's green halo for visual consistency).
- **HEAT_IN_PROGRESS green now matches the rest of the codebase.** Pre-refactor used the Tailwind hex `#22c55e`; post-refactor uses `var(--success)` (forest green `142 71% 40%`), the same token that drives the LIVE badge in AdminStatistics and the "Operating" status chip pattern across the app.
- **Activity feed heat icon now uses the `--warning` token instead of a hardcoded `#f97316`.** Functionally identical orange, but no longer falls outside the design-token system.

No other functional changes — purely visual polish + theme consistency.

---

## Rollback

If anything goes wrong:

1. **Code-only rollback** (preferred): in `frontend/src/App.jsx`, remove the `<Route path="/operations-live" ...>` line. In `frontend/src/components/Sidebar.jsx`, remove the four "Operations Live" entries from the role menus. Re-run `npm run build`. The `/operations-live` page becomes unreachable; the rest of the app is untouched. The component files can stay — without the route + sidebar wiring they're orphaned but harmless.
2. **Hard rollback:** `git revert` the handover commit + the 18 feature commits, or `git reset --hard 577187d` (the Phase 2-finish baseline).

No DB rollback. No backend rollback.

---

## Test counts

- **New frontend tests in this phase:** 56 (across 8 test files in `frontend/src/...`)
  - `src/test/smoke.test.jsx`: 2
  - `src/utils/__tests__/time.test.js`: 9
  - `src/components/OperationsLive/__tests__/TopKpiStrip.test.jsx`: 5
  - `src/components/OperationsLive/__tests__/RecentActivityFeed.test.jsx`: 6
  - `src/components/OperationsLive/__tests__/ConverterCard.test.jsx`: 9
  - `src/components/OperationsLive/__tests__/LiveHeatsPanel.test.jsx`: 6
  - `src/components/OperationsLive/__tests__/ActiveTripsPanel.test.jsx`: 7
  - `src/pages/__tests__/OperationsLive.test.jsx`: 12
- **Run locally:** `cd frontend && npm test`
- **Backend suite unchanged at 334 passed** — no backend touches in Phase 3.

---

## Notes for the deploy engineer

- The new Vitest devDependencies (vitest, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom) are devDependencies, so `npm install` will pull them. They do **not** ship in the production bundle.
- The page uses **inline styles** plus the existing `premium-card` / `premium-page-container` classes from `index.css`. No new CSS files. No new design system.
- `formatRelative` is now shared via `src/utils/time.js` — three callers (`PlantLive.jsx`, `OperationsLive.jsx`, `RecentActivityFeed.jsx`) all consume the same helper. The util has 9 of its own tests.
- The `current_status` chip uses `statusColor` from `src/utils/torpedoStatus.js` — existing helper, no changes here.
- Click-to-expand on converter cards and click-to-detail on active trips both land in Phase 4 (TripHistoryLive page), not here.

---

## Next phase

Phase 4 = `TripHistoryLive` React page (Page 2 frontend). Plan not yet written — will be drafted after user confirms Phase 3 on BF4 (Task 3.20, user-driven).
