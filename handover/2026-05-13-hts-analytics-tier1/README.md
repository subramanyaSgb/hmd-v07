# Handover — HTS Analytics Tier 1 (SMS Performance + Heat-to-Trip + Breakdown alerts)

**Date:** 2026-05-13
**Target machine:** BF4 PC
**Roadmap:** `MEMORY.md` → `project_hts_analytics_roadmap.md`
**changes_tracker.md entries:** #137 – #155

---

## What's new

Three HTS-data features that ship together as **Tier 1** of the HTS analytics roadmap. We had 7 HTS Oracle tables mirrored upstream but unused; this sprint wires the most valuable subset into the V2 frontend.

### 1. New page — **SMS Performance** at `/sms-performance` (admin/TRS sidebar slot 5)
- 5 KPI cards: Heats · Avg Yield · Best Yield · Below Target · Total Loss
- Yield trend line chart with target reference
- Loss Pareto bar chart (tonnage categories desc) + count-units chip strip
- Per-SMS table — click a row to filter the heats table below
- Paginated heats detail table with sms / shift / below-target-only filters

### 2. Heat-to-Trip live map — extends Live Tracking V2 detail panel
- New "FED INTO" section between CURRENT TRIP and CHEMISTRY & TEMP
- Renders only when HTS has recorded this torpedo within the last 90 min
- Shows SMS attribution, converter #, heat #, grade, shift, operator, yield (or "pouring" badge if heat still active)

### 3. Equipment breakdown feed — folds into V2 Dashboard Alerts
- New alert `kind="breakdown"` sourced from `H_EQUP_BREAKDOWNS`
- Severity heuristic: TORPEDO/LADLE/BOF/CONVERTER mentions → high; rest → medium
- Dedupe by exact message text within 12h (per-row deduper distinct from torpedo-keyed deduper)

### 4. Bonus fix — `hts_sync` was reading non-existent `SMS` column
The `hts_heat_mirror.sms` column had been NULL since launch because `hts_sync.row_to_mirror_dict()` read `r["SMS"]` while the upstream column is actually `SMS_UNIT`. Tier 1 fix in `hts_sync.py` will backfill on next tick (existing rows updated via UPSERT).

---

## New data captured

The HTS sync orchestrator now pulls **5 tables** per tick (was 1):

| Table | Mirror | Watermark | Notes |
|---|---|---|---|
| `VW_HTS_HOTMETAL_DATA` | `hts_heat_mirror` (existing) | `MAX(torpedo_in_time)` | + reads `SMS_UNIT` correctly now |
| `H_CASTER_HEAT_PROCESS` | **NEW** `h_caster_heat_process_mirror` | `MAX(caster_date)` | Curated 20-col subset of 108 upstream |
| `H_CASTER_CONSUMPTION` | **NEW** `h_caster_consumption_mirror` | join → process watermark | Curated 22-col subset of 70 upstream |
| `H_EQUP_BREAKDOWNS` | **NEW** `h_equp_breakdown_mirror` | `MAX(brk_date)` | Full mirror (8 cols) |
| `H_UNIT_CODES` | **NEW** `h_unit_code_mirror` | full refresh | 36-row lookup |

Migration `hts002` creates the 4 new tables (HtsHeatMirror unchanged — already has `sms` column).

---

## Files

### Backend
- `backend/database/models.py` — added 4 SQLAlchemy mirror models (HCasterHeatProcessMirror, HCasterConsumptionMirror, HEqupBreakdownMirror, HUnitCodeMirror)
- `backend/alembic/versions/hts002_add_caster_breakdown_mirrors.py` — **NEW** migration (down_revision = `wbaudit001`)
- `backend/utils/hts_sync.py` — added 4 per-table sync fns + orchestrator rewrite; fixed `SMS_UNIT` bug
- `backend/utils/alert_detector.py` — added `detect_hts_breakdown()` + `scan_hts_breakdowns()`
- `backend/routes/sms_performance.py` — **NEW** `/api/sms-performance/v1/{overview,loss-pareto,heats}` (3 endpoints)
- `backend/routes/tracking_v2.py` — `current_heat` section in `/torpedoes/{fleet_id}`
- `backend/main.py` — registered new router

### Frontend
- `frontend/src/App.jsx` — lazy import + route + ROUTE_CONFIG
- `frontend/src/components/Sidebar.jsx` — admin + TRS arrays insert at position 5 (+ `Gauge` icon import)
- `frontend/src/pages/SMSPerformance.jsx` — **NEW** container
- `frontend/src/components/SMSPerformance/` — **NEW**:
  - `KPIRow.jsx`
  - `YieldTrend.jsx`
  - `LossPareto.jsx`
  - `BySMSTable.jsx`
  - `HeatsTable.jsx`
  - `SMSPerformance.css`
- `frontend/src/components/LiveTrackingV2/TorpedoDetailPanel.jsx` — "FED INTO" section + `FedInto` component
- `frontend/src/components/LiveTrackingV2/LiveTrackingV2.css` — `.v2-track-detail-fedinto*` block

---

## Deployment steps (on BF4 PC)

1. `git pull origin main`
2. `conda activate hmd_test`
3. `cd Development/Version_07/backend && python -m alembic upgrade head`
   - If `DuplicateTable: relation "h_caster_heat_process_mirror" already exists`, run `python -m alembic stamp head` first (init_db auto-creates models on startup; migrations then redundantly try too).
4. `cd ../frontend && npm install && npm run build`
5. Restart backend service (`app.bat` menu → restart all)
6. Wait one 5-min HTS sync tick — verify `h_caster_heat_process_mirror` populated:
   ```
   psql -d hmd -c "select count(*) from h_caster_heat_process_mirror;"
   ```

## Sanity checklist

- [ ] Admin + TRS users see **SMS Performance** in sidebar (slot 5, below Weighbridge Audit, `Gauge` icon)
- [ ] PPC + Operator users do NOT see the entry
- [ ] Page header pills `[Shift A] [Today] [7d] [30d]` all work
- [ ] 5 KPI cards populate within 5-min window after first sync tick
- [ ] Yield trend chart renders with target reference line at 96.0
- [ ] Loss Pareto bars show in tonnes; count-only categories appear as chips below
- [ ] By-SMS row click filters heats table; click again clears
- [ ] Live Tracking V2 → select an active torpedo → "FED INTO" section appears IF the torpedo had an HTS row in the last 90 min (otherwise hidden, which is correct)
- [ ] V2 Dashboard Alerts feed now shows `BREAKDOWN` tag rows once an `H_EQUP_BREAKDOWNS` row syncs

## Rollback

If anything breaks:

- **Frontend** — admin can avoid the menu entry; no other pages affected.
- **Backend** — every new route + sync is additive:
  ```cmd
  python -m alembic downgrade -1   :: drops the 4 new mirror tables
  ```
  Then revert `hts_sync.py` to last commit. The existing hotmetal sync keeps working.

## Optional config

- **Yield target** — defaults to 96.0%. Override via SystemConfig:
  ```sql
  INSERT INTO system_configs (config_key, config_value, description)
  VALUES ('SMS_YIELD_TARGET_PCT', '95.5', 'Yield % below which heats are flagged below-target');
  ```
  Below-target KPI + line-chart reference + below-target-only filter all read this.
