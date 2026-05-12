# Version 2 Dashboard — Design Doc

**Date:** 2026-05-12
**Author:** brainstorm session with Claude
**Status:** Approved, ready for implementation
**Reference design:** `c:/Users/DSI-LPT-081/Desktop/HMD/desing_idea/dashboard.jsx`

---

## 1. Goal

Add a third toggle option **"VERSION 2"** on the `/statistics` page (to the left of `PERFORMANCE`). When active, render a new dashboard that is a **1:1 layout match** of the design-idea dashboard, using **V07's existing light theme** and **live data** from the V07 backend.

## 2. Decisions log

| # | Decision | Choice |
|---|---|---|
| 1 | Handle missing data | Build new FastAPI endpoints for everything that doesn't exist |
| 2 | Fleet donut buckets | Derive 7 states from `FleetManagement.status` + `Trip` phase |
| 3 | Alerts feed source | New persistent `alerts` table populated during sync |
| 4 | Endpoint structure | Hybrid — one fast aggregated endpoint + separate heavy endpoints |
| 5 | Layout | 1:1 from `desing_idea/dashboard.jsx` (4 rows, same fr proportions) |
| 6 | Charts | Recharts everywhere except the Sankey (hand-rolled SVG) |
| 7 | Theme | V07 light theme — white cards, `#3b82f6` accent, Inter + Space Grotesk |
| 8 | Role gate | Same as existing toggle (admin / trs / ppc) |
| 9 | Refresh rate | 10 s default (matches AdminStatistics) |

## 3. Layout grid (matches design idea)

```
Row 1 — 6 KPI cards · grid-template-columns: repeat(6, 1fr) · gap 12
  [Hot Metal Dispatched·BIG] [Active Trips] [Avg Cycle] [Temp Drop] [On-Spec] [Chem Alerts]

Row 2 — 3 cards · grid-template-columns: 1.05fr 1.45fr 1.35fr · gap 14
  [Fleet Donut] [Throughput Chart] [Sankey Flow]

Row 3 — 2 cards · grid-template-columns: 1.7fr 1fr · gap 14
  [Active Trips table (7 rows)] [Alerts & Exceptions feed]

Row 4 — 3 cards · grid-template-columns: 1.4fr 1fr 1fr · gap 14
  [Shift Performance bars] [Chem Histogram] [System Health]
```

## 4. Section → data source map

### Section 1 — KPI Row (6 cards)
| # | Card | Source |
|---|---|---|
| 1 | Hot Metal Dispatched (big + 24h sparkline) | `SUM(WbatnglTripMirror.net_weight)` today; sparkline = sum per hour |
| 2 | Active Trips · of 53 | `COUNT(Trip WHERE status BETWEEN 1 AND 14)` / `COUNT(FleetManagement)` |
| 3 | Avg Cycle (min) | `AVG(sms_ack_time − first_tare_time)` for trips closed today |
| 4 | Temp Drop BF→SMS | `AVG(WbatnglTripMirror.temp − HtsHeatMirror.bds_temp)` via torpedo match |
| 5 | On-Spec % | `(COUNT where s_l ≤ 0.05 AND si_l ≤ 1.2) / COUNT(all)` × 100, last 24 h |
| 6 | Chem Alerts | `COUNT(Alert WHERE created_at > now()-24h)` grouped by kind |

### Section 2 — Fleet Donut (7 derived states)
```
Loading     = Fleet.status='Operating' AND Trip.status IN (loading at producer)
In Transit  = Fleet.status='Moving'    AND Trip going producer→consumer
At SMS      = Fleet.status='Operating' AND Trip.status IN (at consumer)
Returning   = Fleet.status='Moving'    AND Trip going consumer→producer
Idle        = Fleet.status='Operating' AND no active Trip
Hot Repair  = Fleet.status='Maintenance' AND active MaintenanceSchedule
Ign Off     = Fleet.status='Maintenance' AND no MaintenanceSchedule
```
Center number = `COUNT(FleetManagement)`.

### Section 3 — Throughput chart
- Recharts `AreaChart`
- 24-hour view: x = hour, y = tonnes/hour
- Data: `WbatnglTripMirror` grouped by `date_trunc('hour', closetime)`, `SUM(net_weight)`
- Pills `24h / 7d / 30d` re-fetch with different granularity

### Section 4 — Sankey Flow (hand-rolled SVG)
- Left bars: `BF3 · BF4 · BF5` from `WbatnglTripMirror.source_lab`
- Right bars: `SMS1 · SMS2 · SMS3 · SMS4 · RFL` from `WbatnglTripMirror.destination`
- Ribbon widths = trip count flowing between each pair, today

### Section 5 — Active Trips table (7 rows visible)
Columns: `Ladle · Trip ID · Source · Dest · Net wt · Temp · S · Stage · Age · Alert`
- All from `Trip` JOIN `WbatnglTripMirror` (by tap_no / fleet_id)
- Stage dots from `Trip.status` mapped to 5 phases
- Age = `now() − tap_time`

### Section 6 — Alerts & Exceptions feed
- From new `alerts` table
- Shows last 60 min, sev high/med/low
- Each row has an **Acknowledge** button → writes `acknowledged_at` and `acknowledged_by`

### Section 7 — Shift Performance bars (A/B/C)
- `WbatnglTripMirror` grouped by `shift`, today only
- Active shift derived from `ShiftConfig` and current time → `LIVE` pill on it

### Section 8 — Chemistry Distribution histogram
- Recharts `BarChart`
- Bins of `WbatnglTripMirror.temp` over last 24 h
- Header stats: Mean · σ · Below cutoff
- Red bars for bins below 1450 °C cutoff

### Section 9 — System Health
- 3 rows from new `/api/statistics/v2/system-health` endpoint
- Pings SuVeechi (MySQL), WBATNGL (Oracle), HTS (Oracle)
- Reports engine, host, db, latency, last sync, status (online/degraded)

## 5. Backend plan

### 5.1 New model — `Alert`
```python
class Alert(Base):
    __tablename__ = 'alerts'
    id              = Column(Integer, primary_key=True)
    kind            = Column(String(20))    # cold|chem|dwell|gps|sms_ack|battery
    severity        = Column(String(10))    # high|med|low
    tag             = Column(String(40))    # display label
    message         = Column(Text)
    location        = Column(String(80))
    torpedo_id      = Column(String(20),  nullable=True, index=True)
    trip_id         = Column(String(40),  nullable=True, index=True)
    source          = Column(String(20),  nullable=True)   # BF3/BF4/BF5
    destination     = Column(String(20),  nullable=True)
    raw_value       = Column(Float,       nullable=True)   # 1432 (°C) etc.
    threshold       = Column(Float,       nullable=True)
    detected_at     = Column(DateTime,    default=datetime.utcnow, index=True)
    acknowledged_at = Column(DateTime,    nullable=True)
    acknowledged_by = Column(String(40),  nullable=True)
```
+ Alembic migration `<id>_add_alerts_table.py`.

### 5.2 New module — `utils/alert_detector.py`
Functions:
- `detect_cold_metal(wbatngl_row)` — temp < 1450 °C
- `detect_high_sulfur(wbatngl_row)` — s_l > 0.05 %
- `detect_high_silicon(wbatngl_row)` — si_l > 1.2 %
- `detect_dwell(trip_row)` — dwell > threshold from `DeviationThresholdConfig`
- `detect_gps_stale(fleet_row)` — `last_updated` > 5 min ago
- `detect_battery_low(fleet_row)` — battery < 60 %
- `detect_no_sms_ack(wbatngl_row)` — out_date > 1 h ago AND sms_ack_time is null

Hooks:
- `wbatngl_trip_sync.py` calls cold/high-S/high-Si/no-sms-ack after each upsert
- `suveechi_sync.py` calls gps-stale/battery on each fleet row

Dedupe rule: skip if a non-acknowledged alert of the same `(kind, torpedo_id)` exists in the last 30 min.

### 5.3 New route module — `routes/v2_dashboard.py`
Mounted under prefix `/api/statistics/v2`.

| Endpoint | Purpose | Polling cadence (frontend) |
|---|---|---|
| `GET /overview` | Fast aggregated: KPIs + fleet donut + shift bars + system health | every 10 s |
| `GET /throughput?range=24h\|7d\|30d` | Throughput area chart | on pill click + every 60 s |
| `GET /sankey` | BF→SMS flow today | every 60 s |
| `GET /active-trips?limit=7` | Live trip table | every 10 s |
| `GET /alerts?window=60m` | Alerts feed | every 10 s |
| `POST /alerts/{id}/ack` | Acknowledge an alert | on click |
| `GET /chemistry-distribution` | Histogram bins of temp over last 24 h | every 60 s |
| `GET /system-health` | Probe 3 DBs | every 30 s |

### 5.4 Register in `main.py`
Add `app.include_router(v2_dashboard.router)` next to the other routers.

## 6. Frontend plan

### 6.1 New files
```
frontend/src/
├── components/Statistics/
│   ├── Version2Dashboard.jsx          # main container, owns refresh state
│   └── V2/
│       ├── KPIRow.jsx                 # 6 KPI cards
│       ├── KPICard.jsx                # single card (label/value/unit/sub/delta)
│       ├── KPIBig.jsx                 # the first card with sparkline
│       ├── FleetDonut.jsx             # Recharts PieChart (7 segments)
│       ├── ThroughputChart.jsx        # Recharts AreaChart
│       ├── FlowSankey.jsx             # hand-rolled SVG ribbon
│       ├── ActiveTripsTable.jsx       # trip rows with stage dots
│       ├── StageDots.jsx              # 5-dot lifecycle indicator
│       ├── AlertFeed.jsx              # alert rows with ack button
│       ├── ShiftBars.jsx              # 3 horizontal bars
│       ├── ChemHistogram.jsx          # Recharts BarChart
│       └── SystemHealth.jsx           # 3 DB rows
└── styles/
    └── version2-dashboard.css         # scoped to .v2-dashboard
```

### 6.2 Files modified
- `pages/Statistics.jsx` — add `'v2'` to `activeTab`, add the leftmost toggle button (icon = `Sparkles` from lucide-react), render `<Version2Dashboard />` when active.
- No other existing files touched.

### 6.3 Theme adaptation rules
The design idea is dark; V07 is light. Map values when porting styles:
| Design idea token | V07 equivalent |
|---|---|
| `--bg-0` / `--bg-1` (`#070a10` / `#0d121b`) | `hsl(0 0% 100%)` (white card) on `hsl(210 40% 98%)` page |
| `--ink-1` (`#e6ecf5`) | `hsl(224 71% 4%)` (deep midnight text) |
| `--ink-2` / `--ink-3` (grays) | `hsl(215 16% 47%)` muted |
| `--amber` (`#f5a524` accent) | `hsl(217 91% 60%)` (electric blue, V07 accent) |
| `--green` / `--red` / `--cyan` | unchanged (semantic) |
| `Sora` / `Geist` fonts | `Space Grotesk` / `Inter` (V07 fonts) |
| Drop shadows | softer V07 shadow `0 1px 2px rgba(0,0,0,0.05)` |

### 6.4 Refresh strategy
- `Version2Dashboard` owns a top-level `lastTick` state that ticks every 10 s
- Each child component receives `lastTick` as a prop and re-fetches its endpoint when it changes
- Heavy endpoints (`/throughput`, `/sankey`, `/chemistry-distribution`) refresh only every **6th tick** (≈60 s)
- `/system-health` refreshes every **3rd tick** (≈30 s)

### 6.5 Role gate
Statistics.jsx already does `if (user.role in ['admin', 'trs', 'ppc'])` before setting the toggle. The V2 button appears under the same condition. Non-admin users do not see it.

## 7. Implementation phases (suggested order)

1. **Backend foundation**
   1. Create `Alert` model + Alembic migration
   2. Run migration on dev DB
   3. Implement `alert_detector.py` functions (unit-testable, pure)
   4. Wire detector hooks into `wbatngl_trip_sync.py` and `suveechi_sync.py`
2. **Backend endpoints**
   1. Create `routes/v2_dashboard.py` with all 8 routes
   2. Register in `main.py`
   3. Smoke-test each endpoint via curl / FastAPI docs UI
3. **Frontend skeleton**
   1. Add VERSION 2 toggle button to `Statistics.jsx`
   2. Create empty `Version2Dashboard.jsx` rendering the 4-row grid skeleton
   3. Verify the toggle correctly routes between the 3 tabs
4. **Frontend sections (parallel-friendly)**
   1. KPIRow + KPIBig + KPICard
   2. FleetDonut (Recharts PieChart)
   3. ThroughputChart (Recharts AreaChart)
   4. FlowSankey (hand-rolled SVG, port from design idea)
   5. ActiveTripsTable + StageDots
   6. AlertFeed + ack button
   7. ShiftBars
   8. ChemHistogram (Recharts BarChart)
   9. SystemHealth
5. **Polish**
   1. CSS pass on `version2-dashboard.css` to match light theme exactly
   2. Empty / loading / error states for each section
   3. Refresh strategy implementation (tick fan-out)
   4. PDF export hook (reuse existing `AdminStatistics` PDF lib)
6. **Workflow tasks (per user's standing rules)**
   1. Verify it works locally
   2. Update CLAUDE.md / docs
   3. Append to `changes_tracker.md` with date/file/before/after
   4. Mirror everything to `handover/version2-dashboard/`
   5. `git push` (mirror + repo together)
   6. User tests on BF4 PC

## 8. Risks & open items

| # | Risk | Mitigation |
|---|---|---|
| R1 | Trip.status enum (0–15) → 5 stage dots mapping needs a concrete table | Document the mapping in the StageDots component header; verify with sample data before shipping |
| R2 | `FlowSankey` ribbon math is non-trivial in light theme | Lift the working math from `desing_idea/dashboard.jsx:218-279` verbatim; only recolor |
| R3 | Sync hooks could double-insert alerts on sync retries | Dedupe rule in `alert_detector.py` (30-min window per `(kind, torpedo_id)`) |
| R4 | Slow Oracle queries (HTS at 612 ms in current snapshot) could stall the donut | Heavy queries live behind their own endpoints + slower polling cadence; `/overview` only hits fast Postgres |
| R5 | System-health endpoint pinging Oracle adds load | Cache result for 30 s server-side; don't ping on every request |
| R6 | PDF export of the V2 board hasn't been spec'd | Phase 5.4 — reuse existing jsPDF setup; defer fancy formatting |
