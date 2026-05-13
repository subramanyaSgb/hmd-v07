# HTS Analytics Tier 1 — design

**Date:** 2026-05-13
**Status:** approved (user-confirmed Tier 1 ships first, then Tier 2, Tier 3 deferred)
**Roadmap memory:** `project_hts_analytics_roadmap.md`

## Context

A deep audit of the 27 Oracle schemas visible to `ICT_IFACE` (see
`db_discovery_deep.txt`) confirmed that 7 HTS tables are mirrored upstream
but **only `VW_HTS_HOTMETAL_DATA` is being used** on the HMD side. The
other 6 — caster heat-process, caster consumption, breakdown log, unit
codes — hold ~32K rows of operational data that the V2 frontend was
ignoring.

The user approved a 3-tier rollout. This design covers **Tier 1**, which
unlocks the highest-leverage analytics with the smallest blast radius:

| # | Feature | Where it lives | Source |
|---|---|---|---|
| #2 | Heat-to-Trip live map | Live Tracking V2 detail panel — new section | `HtsHeatMirror` + caster mirrors |
| #4 | Yield trends | NEW `/sms-performance` page | `HCasterConsumptionMirror.yield_pct` |
| #5 | Loss Pareto | NEW `/sms-performance` page | `HCasterConsumptionMirror` loss cols |
| #7 | Equipment breakdown feed | V2 Dashboard Alerts (folded in) | `HEqupBreakdownMirror` + `HUnitCodeMirror` |

## Decisions

1. **New page vs extending existing page** → NEW page `/sms-performance`. Trip Operations V2 already owns the "in-flight ops" view; SMS Performance owns the "completed-heat analytics" view. Different cadence (60s vs 10s) and different mental model (heats vs trips).
2. **Sidebar slot** → position 5 (admin/TRS only). Sits directly below Weighbridge Audit at slot 4. The two pages share an "analyst-facing aggregation" theme, so consecutive slots help discoverability.
3. **Sync orchestrator** → keep ONE module (`hts_sync.py`), one Oracle connection per tick, 5 tables in sequence. Per-table try/except with rollback between so a stale upstream table doesn't cascade.
4. **Watermark strategy** → per-table:
   - hotmetal → `MAX(torpedo_in_time)` (existing)
   - caster_hp → `MAX(caster_date)` on this mirror
   - caster_cn → joined to caster_hp's `CASTER_DATE` via an Oracle-side JOIN. No standalone date column upstream.
   - breakdowns → `MAX(brk_date)`
   - unit_codes → full refresh (36 rows; cheaper than incremental)
5. **Curated col subsets** vs full mirrors → upstream `H_CASTER_HEAT_PROCESS` has 108 cols and `H_CASTER_CONSUMPTION` has 70. We curate ~20 each — the ones the planned UI actually reads. Full-fidelity mirror is unnecessary and trades sync time for unused width.
6. **Yield target** → 96.0% default, overridable via SystemConfig key `SMS_YIELD_TARGET_PCT`. Below-target KPI + line-chart reference line + below-target-only filter all read this single value.
7. **SMS attribution** — the existing `hts_heat_mirror.sms` column was always NULL because the sync read upstream column `SMS` when it's actually `SMS_UNIT`. Fix is one-line; backfills automatically on next UPSERT.
8. **Heat-to-Trip live map window** → 90 minutes. Torpedo dwell at SMS is typically <60 min; 90 covers the typical case + grace period after torpedo_out_time.
9. **Breakdown alerts dedupe** → by exact message text within 12h. Unlike wbatngl alerts (which dedupe by `kind + torpedo_id`), breakdown rows aren't keyed to a torpedo; the message embeds unit+date+reason and is effectively unique.
10. **Severity heuristic for breakdowns** — keyword scan in REASON: TORPEDO/LADLE/BOF/CONVERTER → high; else use DELAY_TYPE (DEL→med, OBM→low, default→med).

## Schema

### New tables (migration `hts002`, down_revision=`wbaudit001`)

```
h_caster_heat_process_mirror   20 cols, PK id, unique heat_no, idx caster_date+sequence_id
h_caster_consumption_mirror    22 cols, PK id, unique heatno, idx sequence_id
h_equp_breakdown_mirror         9 cols, PK id, unique (unit_code, brk_date, reason)
h_unit_code_mirror              2 cols, PK unit_code
```

### Endpoints

```
GET /api/sms-performance/v1/overview?range=today|shift_a|7d|30d
GET /api/sms-performance/v1/loss-pareto?range=...
GET /api/sms-performance/v1/heats?range=&sms=&shift=&below_target_only=&limit=&offset=

GET /api/tracking/v2/torpedoes/{fleet_id}        # adds `current_heat` key
```

### Frontend

```
pages/SMSPerformance.jsx                    container + tick + range + sms-filter state
components/SMSPerformance/
  KPIRow.jsx                                 5 KPI cards
  YieldTrend.jsx                             Recharts LineChart + target reference
  LossPareto.jsx                             Recharts BarChart + count-units chip strip
  BySMSTable.jsx                             clickable rows (lift filter)
  HeatsTable.jsx                             paginated, filterable detail
  SMSPerformance.css                         scoped under .smsperf, --sp-* tokens
components/LiveTrackingV2/TorpedoDetailPanel.jsx
  FedInto component + new section between CURRENT TRIP and CHEMISTRY
```

## Trade-offs accepted

- **Curated cols mean we can't surface every upstream field on demand.** If a future feature needs e.g. `FLUC_POS5`, it's a one-line model + migration addition. Acceptable cost.
- **Consumption sync joins to caster_hp on the Oracle side.** If caster_hp falls behind, consumption falls behind too. This is intentional — the two tables are pair-meaningful (a consumption row without its process row is harder to interpret).
- **Breakdown severity heuristic is keyword-based.** A breakdown reason like "PLATFORM CLEANING" will incorrectly route to medium even though it's low. Easy to tune later by extending `_HIGH_SEV_KEYWORDS` / `_DELAY_TYPE_SEV`.

## Out of Tier 1 (Tier 2, deferred)

- #1 Full heat trace (end-to-end BF→torpedo→SMS→BOF→caster→slab)
- #6 Per-converter scorecard (heats/converter, dwell, yield, delay)
- #3 Operator REMARKS feed in Trip Operations V2 Exceptions queue
