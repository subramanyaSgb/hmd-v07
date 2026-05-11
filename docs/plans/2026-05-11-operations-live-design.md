# Operations Live + Trip History (Live) — Design

**Date:** 2026-05-11
**Author:** Subramanya Bellary (with Claude)
**Status:** Validated — ready for implementation
**Branch:** to be created — `sprint-3-operations-live` off `sprint-2-wbatngl-trip-mirror`

---

## Why this exists

Today HMD has three live data sources but no single view that **tells the
end-to-end story of one trip across them**:

- **SuVeechi MySQL** — live GPS positions of all 53 torpedoes (10 s)
- **WBATNGL Oracle** — producer-side weighbridge transactions, every BF tap
  → torpedo load → BF exit, with weights and chemistry (60 s)
- **HTS Oracle** — consumer-side data: torpedo arrival at converter, hot
  metal poured to each heat (5 min cadence once Hari ships the live feed)

The story HMD is supposed to tell —

> *"Trip 74624 tapped at BF3 at 14:23 with 373 MT at 1483 °C; TLC-01 carried
> it to SMS3 (via SuVeechi GPS); 172 MT was poured to heat E2030590 at
> Converter D, 175 MT to heat E2030593 at Converter E; 26 MT residual; trip
> closed 16:10."*

— is currently invisible to operators. They can see each leg separately
(map = position; JSW Trip tab = producer-side trip; nothing for consumer
heats yet) but cannot follow one trip through.

These two new pages close that gap **without touching any existing page**.

---

## Goals (v1)

1. Surface live converter / heat data (HTS) in HMD for the first time.
2. Show operators a single "what is happening RIGHT NOW" cockpit unified
   across all three JSW data sources.
3. Show, for any individual trip, the full producer → torpedo → consumer
   timeline as one screen.

## Explicit non-goals (deferred)

- Mobile / tablet responsive layouts.
- WebSocket / SSE — polling is sufficient.
- Push notifications or alerting (only in-page visual ⚠ badges on Page 2).
- Cross-page filter persistence.
- Avg-cycle-time KPI — defer until trip ↔ heat matching is observed
  stable on real live data.
- Plan-vs-actual production deltas — blocked on DEP002 / DEP005.
- Anomaly-threshold tuning UI — hardcoded 10 % weight-delta for v1.
- Touching the existing Dashboard / Live Tracking / Plant Live / JSW Trip
  tab / Statistics pages. **Zero edits to old code.** Additive only.

---

## High-level architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          JSW data sources                        │
│                                                                  │
│   MySQL SuVeechi      Oracle WBATNGL       Oracle HTS            │
│        │                    │                  │                 │
│        │ (10 s)             │ (60 s)           │ (5 min) NEW     │
│        ▼                    ▼                  ▼                 │
│  ┌──────────────┐   ┌──────────────────┐  ┌─────────────────┐   │
│  │  suveechi    │   │   wbatngl_       │  │  hts_heat_      │   │
│  │  _sync.py    │   │   trip_sync.py   │  │  mirror_sync.py │   │
│  │  (existing)  │   │   (existing)     │  │     NEW         │   │
│  └──────┬───────┘   └────────┬─────────┘  └────────┬────────┘   │
└─────────┼────────────────────┼─────────────────────┼────────────┘
          │                    │                     │
          ▼                    ▼                     ▼
   fleet_live_locations  wbatngl_trip_mirror   hts_heat_mirror
   (PG, existing)        (PG, existing)        (PG, NEW)
          │                    │                     │
          └────────────────────┼─────────────────────┘
                               ▼
                  v_trip_heat_story  (PG view, NEW)
                  joins WBATNGL ↔ HTS on (torpedo_no, time-window)
                               │
                               ▼
            ┌──────────────────────────────────┐
            │  backend/routes/operations.py    │
            │  GET /api/operations-live/dashboard  (Page 1)
            │  GET /api/trip-history-live          (Page 2 list)
            │  GET /api/trip-history-live/:trip_id (Page 2 detail)
            └──────────────────────────────────┘
                               │
                               ▼
        ┌──────────────────────┴───────────────────────┐
        │                                              │
   /operations-live                            /trip-history-live
   OperationsLive.jsx                          TripHistoryLive.jsx
   (Page 1)                                    (Page 2)
```

---

## Page 1 — Operations Live

**Route:** `/operations-live`
**Sidebar:** new entry placed under Live Tracking, label `Operations Live`
**Poll interval:** 10 s (matches existing Dashboard map cadence)
**Visual style:** existing `premium-card`, `dashboard-wrapper`,
`overlay-glass-box`, Space Grotesk typography — no new design system.

### Layout

```
┌──────────────────────────────────────────────────────┐
│             ⓐ  TOP KPI STRIP  (5 tiles)               │
├─────────────────────────────┬────────────────────────┤
│   ⓑ  LIVE HEATS  (~60 %)    │  ⓒ  ACTIVE TRIPS (~40%)│
├─────────────────────────────┴────────────────────────┤
│             ⓓ  RECENT ACTIVITY FEED                   │
└──────────────────────────────────────────────────────┘
```

### ⓐ Top KPI strip — 5 tiles

| Tile | Source |
|---|---|
| Production today (MT) | `SUM(NET_WEIGHT)` of `wbatngl_trip_mirror` where `OUT_DATE >= today00:00` |
| Consumption today (MT) | `SUM(HOTMETAL_QTY)` of `hts_heat_mirror` where `TORPEDO_IN_TIME >= today00:00` |
| Active trips now | `wbatngl_trip_mirror` with `OUT_DATE NOT NULL` and no matching heat in `hts_heat_mirror` within the matching window |
| Heats in progress | `hts_heat_mirror` rows where `TORPEDO_OUT_TIME IS NULL` (heat hasn't completed) |
| Idle torpedoes | `fleet_live_locations` where `status = 'Idle'` |

"Avg cycle time" tile — explicitly **deferred** (requires the trip↔heat
matching to be observed stable on live data first; we will add it once we
have a week's data to validate the matching window).

### ⓑ Live Heats panel (left, ~60 % width)

6 mini-cards in a 2 × 3 grid, one per converter `D / E / F / G / H / I`:

- Header: `<letter> · <SMS>` using the new `sms` column from Hari
- State badge: `IDLE` (grey) · `HEAT IN PROGRESS` (green, pulsing) ·
  `WAITING TORPEDO` (yellow)
- If active: current `HEAT_NO`, torpedo, elapsed minutes,
  hot metal received so far
- Last completed heat: timestamp + Heat#
- Today's heat count
- Click card → navigates to `/trip-history-live` with the `converter`
  filter pre-applied

### ⓒ Active Trips panel (right, ~40 % width)

Vertical scrollable list. Each row:

```
TLC-22 · BF3 → SMS3 · 368 MT · departed 14:23 · 32 m elapsed
```

- Live-updated from `wbatngl_trip_mirror` JOIN `fleet_live_locations`
- Sorted by `OUT_DATE DESC` (newest first)
- Click row → opens that trip's full timeline on Page 2

### ⓓ Recent Activity feed (bottom, full width)

Reverse-chronological scrolling list of last 20 events. Events sourced
from a UNION of:

- Trip completions (WBATNGL `CLOSETIME` in last hour)
- Heat starts (HTS `TORPEDO_IN_TIME` in last hour)
- SuVeechi status changes (Moving → Idle, etc.) — best-effort, lower
  priority for v1

Auto-scrolls newest to top, pause-on-hover, manual scroll for history.

---

## Page 2 — Trip History (Live)

**Route:** `/trip-history-live` (list) · `/trip-history-live/:trip_id`
(deep-link to expanded story)
**Sidebar:** new entry placed under Live Tracking, label `Trip History (Live)`
**Poll interval:** 30 s on the list (cheap, doesn't need to flicker) ·
10 s when a single trip story is expanded

### Layout — 3 vertical sections

```
┌──────────────────────────────────────────────────────┐
│  ⓐ  FILTER BAR  (chips + dropdowns + search)         │
├──────────────────────────────────────────────────────┤
│  ⓑ  TRIP LIST TABLE  (paginated, 50 / page)          │
├──────────────────────────────────────────────────────┤
│  ⓒ  EXPANDED TRIP STORY  (visible when a row opens)  │
└──────────────────────────────────────────────────────┘
```

### ⓐ Filter bar

- Time chips: `TODAY` · `24H` · `7D` · `30D` · `CUSTOM` (date-range picker)
- Producer dropdown: `All` / BF1 / BF2 / BF3 / BF4 / BF5 / Corex1 / Corex2
- Consumer dropdown: `All` / SMS1 / SMS2 / SMS3 / SMS4 / per-converter D-I
- Torpedo dropdown: `All` / TLC-01 … TLC-53
- Status: `Complete` ✅ · `In flight` 🚚 · `Awaiting pour` ⏳ · `Anomaly` ⚠
- Shift: `All` · A · B · C
- Search box: matches `trip_id` or `heat_no`

### ⓑ Trip list table

Columns:

| Column | Source |
|---|---|
| Torpedo | `wbatngl_trip_mirror.fleet_id` (already normalized to `TLC-NN`) |
| Source → Destination | `SOURCE_LAB → DESTINATION` |
| Net Weight (MT) | `NET_WEIGHT` |
| Departed | `OUT_DATE` |
| Status | computed: matched HTS heat → ✅ · in-flight → 🚚 · closed with no match → ⏳ · weight delta > 10 % → ⚠ |
| Heat # | first matched HTS `HEAT_NO`, or `—` |
| Actions | expand ▾ · open in new tab · copy deep link |

- 50 rows per page · `OUT_DATE DESC` default sort · click a column
  header to sort

### ⓒ Expanded trip story

Click any row → row expands inline below it with a **horizontal stepper
timeline visualization**:

```
●───────●───────●───────●───────●───────●
TAP    LOAD    DEPART  ARRIVE  POUR    CLOSE
BF3    TLC-22  BF3     SMS3    E2030590 16:10
14:23  373 MT  14:35   15:02   172 MT   26 MT residual
1483°C                         14:23 IN
S=0.05                         14:45 OUT
Si=0.385
```

- Each node is clickable — opens a small popover with that step's raw
  data
- Chemistry chart (TEMP, S, Si) shown to the right
- Torpedo current position (from SuVeechi) — short text + GPS, no map
- "Matched heats" section: if torpedo poured to multiple heats, all
  listed (saw this in HTS sample data — TLC-22 poured to both E2030590
  and G2030594 same minute)

**Status callouts** at top of expanded panel:

- ✅ `Trip matched cleanly: BF3 → 368 MT → 2 heats totalling 347 MT, 21 MT residual`
- ⚠ `Weight anomaly: WBATNGL 368 MT, HTS sum 412 MT (+44 MT, +12%)`

---

## Data layer

### New Postgres table — `hts_heat_mirror`

```sql
id              SERIAL  PK
heat_no         VARCHAR(20)  UNIQUE  NOT NULL    -- HTS HEAT_NO (e.g. "E2030590")
converter_no    CHAR(1)                          -- D/E/F/G/H/I
sms             VARCHAR(10)                      -- "SMS3" etc. (Hari's new column)
torpedo_no      VARCHAR(15)                      -- normalized "TLC-22"
torpedo_no_raw  VARCHAR(15)                      -- original "22" for traceability
hotmetal_qty    NUMERIC(10, 3)
torpedo_qty     NUMERIC(10, 3)
torpedo_in_time TIMESTAMP    INDEXED
torpedo_out_time TIMESTAMP   INDEXED
converter_life  INTEGER
synced_at       TIMESTAMP    DEFAULT NOW()
```

Indexes:
- `heat_no` UNIQUE (natural PK; confirmed unique in 11-May report — 123/123 distinct)
- `(torpedo_no, torpedo_in_time)` — for trip↔heat matching joins
- `torpedo_in_time DESC` — newest-first queries

### New view — `v_trip_heat_story`

```sql
CREATE OR REPLACE VIEW v_trip_heat_story AS
SELECT
    t.trip_id,
    t.fleet_id            AS torpedo_no,
    t.source_lab,
    t.destination,
    t.net_weight,
    t.first_tare_time,
    t.out_date,
    t.closetime,
    t.temp,
    t.s_l,
    t.si_l,
    t.shift,
    h.heat_no,
    h.converter_no,
    h.sms,
    h.hotmetal_qty,
    h.torpedo_in_time,
    h.torpedo_out_time,
    h.converter_life
FROM   wbatngl_trip_mirror t
LEFT   JOIN hts_heat_mirror h
       ON   h.torpedo_no = t.fleet_id
       AND  h.torpedo_in_time BETWEEN
                t.closetime - INTERVAL '15 minutes'
            AND t.closetime + INTERVAL '90 minutes';
```

- LEFT JOIN so unmatched trips appear with NULL heat columns.
- Window: −15 min before WBATNGL CLOSETIME (accounts for SuVeechi /
  weighbridge clock drift) and +90 min after (accounts for torpedo waiting
  at SMS before pour — observed TORPEDO_QTY up to 425 MT means torpedoes
  may hold their load for a while).
- One trip may match 0..N heats (UI must handle multi-row case).

### New sync module — `backend/utils/hts_sync.py`

- Same pattern as `wbatngl_trip_sync.py`.
- Polls every `HTS_SYNC_INTERVAL_SECONDS` (default 300 = 5 min).
- Watermark: `MAX(torpedo_in_time)` from `hts_heat_mirror`.
- Pull: `SELECT * FROM HTS.VW_HTS_HOTMETAL_DATA WHERE TORPEDO_IN_TIME > :wm`.
- Normalize: `TORPEDO_NO` "22" → "TLC-22"; trim CONVERTER_NO and SMS;
  strip nulls.
- UPSERT: on conflict (`heat_no`) update all columns including `synced_at = NOW()`.
- Scheduled in `backend/main.py` via APScheduler, gated by
  `HTS_SYNC_ENABLED=true`.
- Reads HTS credentials from existing `.env` `HTS_*` block (already in
  `.env.example`).

### New API endpoints — `backend/routes/operations.py`

| Endpoint | Returns | Cache |
|---|---|---|
| `GET /api/operations-live/dashboard` | All four Page 1 sections in one response: `{ kpi_strip, converters[6], active_trips[], activity_feed[] }` | `ThreadSafeCache` 5 s TTL |
| `GET /api/trip-history-live?...filters...&page=&page_size=50` | `{ rows[], total, page, page_size, last_sync_at }` | none |
| `GET /api/trip-history-live/:trip_id` | Single trip with all matched heats: `{ trip, matched_heats[], current_torpedo_position, anomaly_flags[] }` | 10 s |

All three reuse `get_current_user_required` auth (same as `/api/jsw/*` —
no admin gating, all authenticated users).

### Alembic migration

One migration `add_hts_heat_mirror_and_trip_heat_story_view`:

1. `CREATE TABLE hts_heat_mirror` + indexes
2. `CREATE OR REPLACE VIEW v_trip_heat_story`
3. Downgrade: `DROP VIEW`, `DROP TABLE`

---

## Implementation phases

| # | Phase | Effort | Deliverable | Blocker |
|---|---|---|---|---|
| 1 | HTS sync backend | 0.5 d | Migration + `hts_sync.py` + scheduler hook + sync/upsert/normalization tests | None — works against frozen view; will pick up live data when Hari ships |
| 2 | API endpoints | 1.0 d | `operations.py` + matching SQL + cache + endpoint tests | Phase 1 |
| 3 | Page 1 — Operations Live | 1.0 d | `OperationsLive.jsx` + 4 sub-components + sidebar + route + polling | Phase 2 |
| 4 | Page 2 — Trip History (Live) | 1.5 d | `TripHistoryLive.jsx` + FilterBar + TripListTable + TripStoryExpanded (horizontal stepper) + deep-link | Phase 2 |
| 5 | Polish + handover | 0.5 d | Empty states, loading skeletons, edge cases, perf check, handover folder, `changes_tracker.md` | All prior |

**Total: ~4.5 days of focused work.**

Each phase committed separately to `sprint-3-operations-live` branch
and pushed to both remotes (`origin` + `new-origin`).

---

## Testing strategy

- **Backend unit:** `test_hts_sync.py` — mirror `test_wbatngl_trip_sync.py`
  pattern. Covers: normalization, watermark advance, UPSERT idempotency,
  malformed-row tolerance.
- **Backend integration:** `test_operations_endpoints.py` — mirror
  `test_jsw_endpoints.py`. Covers: each endpoint with fixture data
  including unmatched trips, multi-heat trips, anomalous trips, pagination,
  filters, auth.
- **Backend SQL view test:** verify the matching window logic with hand-
  crafted fixture data (trip closes, heat 5 min later → matched; heat
  120 min later → unmatched).
- **Frontend component:** existing patterns from `JswTripsTab` work for
  the trip list and filter bar; `TripStoryExpanded` is new and gets its
  own unit test.
- **Manual E2E on SMS4 PC** after each phase merge.

## Rollout

1. Feature branch `sprint-3-operations-live` off `sprint-2-wbatngl-trip-mirror`.
2. Each phase committed + pushed separately (atomic, reviewable).
3. Handover folder `handover/2026-05-DD-operations-live-sprint/` mirrors
   all new files + README + alembic migration with deploy steps.
4. Deploy on SMS4: `git pull`, `npm run build`, `alembic upgrade head`,
   restart backend.
5. Flip `HTS_SYNC_ENABLED=true` in SMS4 `.env` when Hari confirms live
   feed is wired.
6. Verify on `/operations-live` — KPIs populate, converter cards light up,
   trips appear with status badges.

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| HTS feed never goes live | Phases 1-2 still ship the plumbing; UI gracefully shows "no HTS data yet" empty state on Page 1 converter cards and Page 2 status column |
| New SMS column has different name / format than expected | `sms` column extraction is in the sync module; trivial adjustment if Hari names it differently |
| Trip ↔ heat matching window too tight or too wide | Window constants in the SQL view file — single-line change to retune. Will validate on first week of live data |
| 90-min upper bound misses long-waiting torpedoes | Can widen later; for v1 a 90-min wait already covers >95 % based on operational norms |
| Existing pages break | Zero touches to existing code — only additions. New pages don't import from old. New routes added at end of `App.jsx` route list. |
| Sync floods Oracle | 5-min cadence is well below HTS update frequency. Has same `_sync_in_flight` guard pattern as WBATNGL sync |

---

## References

- Inventory report (11-May-2026): all 11 JSW tables, their structure, and
  data freshness — see `report.txt` generated by `test_db_inventory.py`
  (git-ignored; SMS4-local).
- HTS freshness probe (11-May-2026): `check_hts_freshness.py` confirmed
  frozen at 01-Apr; Hari agreed to enable live feed + add SMS column.
- WBATNGL trip mirror design (08-May-2026):
  `docs/plans/2026-05-08-wbatngl-trip-mirror-design.md` — same patterns
  reused here.
- DEP007 closure: thread message `19e162fae2e9805f` (11-May) — HTS
  connectivity established.

---

## Open follow-ups (not blocking v1)

- Wait for Hari's live feed before flipping `HTS_SYNC_ENABLED=true` on SMS4.
- Wait for new `sms` column from Hari; align sync module to actual column
  name once received.
- Consider closing DEP010 (BF5.WB_TRANS_DATA_ITRO) — Kotaiah still needs
  to grant SELECT on the underlying table; workaround active. Unrelated
  to this sprint.

---

*Validated 2026-05-11 via brainstorming session with Claude. Implementation begins on user's go-ahead.*
