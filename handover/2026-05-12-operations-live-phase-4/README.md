# Handover — Operations Live Phase 4 (Frontend Page 2 — Trip History Live)

**Date:** 2026-05-12
**Branch:** `sprint-3-operations-live`
**HEAD baseline before Phase 4:** `4ef9061` (Phase 3 wrap-up + handover)
**Phase:** 4 of 5 in the Operations Live sprint (Phase 1 = HTS sync backend; Phase 2 = API endpoints; Phase 3 = Page 1 React frontend; **Phase 4 = Page 2 React frontend (this handover)**; Phase 5 = polish + cross-page wiring)

---

## What's in this handover

The React frontend for the **Trip History (Live) page** — a paginated, filterable trip-history list with inline click-to-expand horizontal-stepper timeline that tells the full producer → torpedo → consumer story of any one trip, plus a deep-link route `/trip-history-live/:trip_id` that opens directly to a pre-expanded trip. Consumes `GET /api/operations-live/trips` (list) + `GET /api/operations-live/trips/:trip_id` (detail) shipped in Phase 2.

### New page + route

`/trip-history-live` — admin / trs / ppc / operator. Layout top-to-bottom:

1. **Header** — "Trip History (Live)" title + "Updated Ns ago" label that ticks every second using `last_sync_at.wbatngl` from the list payload.
2. **FilterBar** — 4 time-window chips (1h / 6h / 24h / 7d) + 5 dropdowns (source_lab, destination, fleet_id, status, shift) + search input. All controls drive the URL via `useSearchParams`.
3. **TripListTable** — paginated trip rows with `StatusBadge` per row. Sortable columns.
4. **Pagination** — page-size 25, prev/next + page indicator.
5. **TripStoryExpanded** — slides in below pagination when a row is clicked or when arriving via `/trip-history-live/:trip_id`. Renders horizontal stepper + chemistry summary + current torpedo position + matched HTS heats.

Also a deep-link route `/trip-history-live/:trip_id` that hydrates the page with the row already expanded.

Polling cadence: **30 s** for the list, **10 s** for the detail (when expanded), **1 s** tick for the relative-time label. All pause when `document.hidden`.

### New sub-units (under `frontend/src/components/TripHistoryLive/`)

5 React components + 1 hook:

- `StatusBadge.jsx` — coloured chip per trip status (uses `--success` / `--warning` / `--danger` / `--text-muted` tokens).
- `TripListTable.jsx` — table body + sortable headers; raises `onRowClick`, `onSort`.
- `Pagination.jsx` — page indicator + prev/next.
- `FilterBar.jsx` — time-chips + 5 dropdowns + search; raises `onChange` per control.
- `TripStoryExpanded.jsx` — stepper + chemistry + position + matched heats; renders below pagination.
- `useTripDetail.js` — hook that polls the detail endpoint at 10 s while a `trip_id` is set; backs off when `document.hidden`.

### Tests

- **54 sub-unit Vitest tests** (`frontend/src/components/TripHistoryLive/__tests__/`):
  - `StatusBadge.test.jsx`: 6
  - `TripListTable.test.jsx`: 11
  - `Pagination.test.jsx`: 8
  - `FilterBar.test.jsx`: 11
  - `useTripDetail.test.jsx`: 6
  - `TripStoryExpanded.test.jsx`: 12
- **16 page-integration tests** in `frontend/src/pages/__tests__/TripHistoryLive.test.jsx` (mocks `utils/api`).
- Frontend suite total after Phase 4: **126 passed** (was 91 after Phase 3).
- Backend suite unchanged at **334 passed** — no backend touches in Phase 4.

### Files in this folder (mirror of `Development/Version_07/`)

```
frontend/
  src/
    App.jsx                                  # MODIFIED — added <Route path="/trip-history-live"> + <Route path="/trip-history-live/:trip_id">; ROUTE_CONFIG entries for /operations-live (Phase 3 carry-over fix) and /trip-history-live
    pages/
      TripHistoryLive.jsx                    # NEW — the page (~189 LOC)
      __tests__/
        TripHistoryLive.test.jsx             # NEW — 16 page-integration tests
    components/
      Sidebar.jsx                            # MODIFIED — "Trip History (Live)" entry for all 4 role menus, placed right after Operations Live (History lucide icon)
      TripHistoryLive/
        StatusBadge.jsx                      # NEW
        TripListTable.jsx                    # NEW
        Pagination.jsx                       # NEW
        FilterBar.jsx                        # NEW
        TripStoryExpanded.jsx                # NEW
        useTripDetail.js                     # NEW
        __tests__/
          StatusBadge.test.jsx               # 6 tests
          TripListTable.test.jsx             # 11 tests
          Pagination.test.jsx                # 8 tests
          FilterBar.test.jsx                 # 11 tests
          TripStoryExpanded.test.jsx         # 12 tests
          useTripDetail.test.jsx             # 6 tests
docs/plans/
  2026-05-12-operations-live-phase-4.md      # the spec this phase was built from
README.md                                    # this file
```

**Not included** (already on BF4 from Phase 3 handover, unchanged in Phase 4):
- `frontend/vitest.config.js`, `frontend/src/test/setup.js` — Vitest harness landed in Phase 3.
- `frontend/src/utils/time.js`, `frontend/src/utils/torpedoStatus.js` — shared utils landed in Phase 3.
- `frontend/package.json`, `frontend/package-lock.json` — no new npm deps in Phase 4.

### Commits in this handover (15 commits total, baseline `4ef9061`)

13 feature commits across Batches A–D:

```
def8e7b  feat(trip-history): /trip-history-live route + deep-link route + page stub + first test
d189569  feat(trip-history): sidebar entries for all 4 roles
fbb0e11  feat(trip-history): 30s list polling + URL-state sync + Updated label + 6 tests
e12e6b0  feat(trip-history): StatusBadge component + 6 tests
0861c71  feat(trip-history): TripListTable + 11 tests
10e862e  feat(trip-history): Pagination component + 8 tests
f227d8b  feat(trip-history): wire TripListTable + Pagination + URL sort/page handlers
64baace  feat(trip-history): FilterBar — time chips + 5 dropdowns + search + 11 tests
5bb74da  feat(trip-history): wire FilterBar — chips/dropdowns/search drive the URL
15c18c5  test(trip-history): URL-restore + page-reset edge cases (regression coverage)
9830a04  feat(trip-history): useTripDetail hook + 6 tests
fc44c6d  feat(trip-history): TripStoryExpanded — stepper + chemistry + position + heats + 12 tests
992bef4  feat(trip-history): wire TripStoryExpanded + useTripDetail into the page
```

Plus 2 Batch E commits:

```
b75d4d0  docs(tracker): #76-#77 — Phase 4 frontend (Trip History Live page)
<HEAD>   handover: Phase 4 ops-live Page 2 React frontend (Trip History Live)
```

Range after push: `git log --oneline 4ef9061..HEAD` → 15 commits.

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

Then restart whatever serves the frontend (Vite dev server via `npm run dev` for dev mode, or your static server / `npm run preview`). **The backend does not need to restart** — no backend changes in this phase. **No migrations.** **No env changes.** **No new npm dependencies** (no `package.json` change in Phase 4, but `npm install` is a no-op safety net).

---

## Verify (browser, after deploy)

Open the app and log in as **admin** (then repeat for trs / ppc / operator):

1. Sidebar should show a new **Trip History (Live)** entry (History lucide icon) placed right after **Operations Live** and before the next item. Visible for all four roles.
2. Click it. URL becomes `/trip-history-live`.
3. The page renders. Expected within ~1 s:
   - Header reads "Trip History (Live)" + an "Updated Ns ago" label that ticks every second.
   - **FilterBar** shows 4 time-window chips (1h / 6h / 24h / 7d, default 6h) + 5 dropdowns (Source Lab, Destination, Fleet ID, Status, Shift) + a search input.
   - **TripListTable** renders trip rows with status badges; sortable column headers.
   - **Pagination** controls below the table (default page size 25).
4. Click any trip row. The row should highlight and a **TripStoryExpanded** panel slides in below the pagination, showing:
   - Horizontal stepper (producer → torpedo → consumer with timestamps for each visited step),
   - Chemistry summary (S / P / Si / Mn / C / Temp from matched heats),
   - Current torpedo position chip (uses `current_torpedo_position.current_status` from the Phase 2 hotfix),
   - Matched HTS heats list.
5. Navigate directly to `/trip-history-live/<some-real-trip-id>` in a new tab. The page should hydrate with that trip already expanded; the URL deep-link works.
6. Change a filter / page / sort — the URL query-string should update accordingly **and** the list should re-fetch with the new params. Browser back/forward should restore prior filter state. Sharing a URL with filter params should reproduce the same view.
7. Open DevTools → Network. Expected: `/api/operations-live/trips` polling every 30 s; while a trip is expanded, additional `/api/operations-live/trips/<trip_id>` calls every 10 s. Switch to another browser tab for ~30 s — polling should pause; return to it — polling resumes.

If anything looks off, paste a screenshot + the browser console output (`F12 → Console`).

---

## Behavioural notes

- **URL is the source of truth for filter/page/sort state.** All filter controls write through `useSearchParams`, so the URL is shareable and browser back/forward works. Reloading the page restores the same view.
- **Search submits on Enter** (no debounce). Whitespace is trimmed on submit (`updateParams` trim was added in Batch B's I1 fix and folded into Batch C's wiring commit).
- **Page resets to 1** whenever a filter or sort changes — prevents "page N of empty" states.
- **The 6 h IST active-trips window from Phase 2 still applies to the Operations Live dashboard** but does NOT apply to this trip-history list — the list shows the full `time_window` range selected in the FilterBar (1h / 6h / 24h / 7d).
- **No new design tokens.** Re-uses `--success / --warning / --danger / --primary / --text-muted` from existing `:root`, including the same `hsl(var(--token) / 0.1)` alpha syntax Phase 3 Batch E established.
- **No new shared utilities** — `time.js` and `torpedoStatus.js` from Phase 3 are reused.
- **`useTripDetail` test cadence** — uses `vi.useFakeTimers({ shouldAdvanceTime: true })` so `@testing-library/react`'s `waitFor` (which depends on `queueMicrotask`) does not hang while we advance the 10 s detail-poll cadence.

---

## Rollback

If anything goes wrong on BF4:

1. **Code-only rollback** (preferred): in `frontend/src/App.jsx`, remove the two `<Route path="/trip-history-live*">` lines and the `/trip-history-live` entry from `ROUTE_CONFIG`. In `frontend/src/components/Sidebar.jsx`, remove the four "Trip History (Live)" entries from the role menus. Re-run `npm run build`. The page becomes unreachable; the rest of the app is untouched. The page + component files can stay — without the route + sidebar wiring they're orphaned but harmless.
2. **Hard rollback:** `git revert` the 15-commit range, or `git reset --hard 4ef9061` (the Phase 3-finish baseline).

No DB rollback. No backend rollback.

---

## Test counts

- **New frontend tests in Phase 4:** 70 (54 sub-unit + 16 page-integration) across 7 new test files.
- **Frontend total after Phase 4:** **126 passed** (was 91 after Phase 3).
- **Backend total:** **334 passed** (unchanged from Phase 3 — no backend touches in Phase 4).
- **Run locally:** `cd frontend && npm test` / `pytest backend/ -q --no-cov`.
- **Production build:** `cd frontend && npm run build` → green in ~8 s.

---

## Notes for the deploy engineer

- **No new npm dependencies.** `package.json` / `package-lock.json` are unchanged from Phase 3; the `npm install` step on BF4 is a safety no-op.
- The page uses inline styles + the existing `premium-card` / `premium-page-container` classes from `index.css`. No new CSS files. No new design system.
- The deep-link route `/trip-history-live/:trip_id` is registered as a separate `<Route>` so React Router resolves the `useParams()` correctly. Both routes converge on the same `TripHistoryLive` page component.
- The Phase 2 hotfix's renamed key `current_torpedo_position.current_status` is consumed here for the first time — `TripStoryExpanded` reads it via the `useTripDetail` hook.

---

## Next phase

Phase 5 = polish + cross-page wiring (click-from-Operations-Live → Trip History pre-filter, final design review). Plan not yet written — will be drafted after user confirms Phase 4 on BF4 (Task 4.21, user-driven).
