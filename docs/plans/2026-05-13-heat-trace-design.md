# Heat Trace — design (Tier 2 #1 of HTS analytics roadmap)

**Date:** 2026-05-13
**Status:** shipping
**Predecessor:** `docs/plans/2026-05-13-hts-analytics-tier1-design.md`

## Goal

Stitch the four data sources we wired in Tier 1 (WBATNGL, HtsHeatMirror, HCasterHeatProcess, HCasterConsumption) into a **single trace view** so an analyst drilling from "this heat had bad yield" can immediately see the BF tap that fed it — without jumping between Trip Management, Live Tracking, and SMS Performance.

## Surface (Option B from the offer)

Drawer triggered from **SMS Performance → Heats table → row click**. No new sidebar entry. Pattern: same as Trip Operations V2's TripDetailPane, but slides over the whole page instead of sitting in a column.

## Backend

```
GET /api/heat-trace/v1/by-heat/{heat_no}   — primary drill-down
GET /api/heat-trace/v1/by-trip/{trip_id}   — inverse (forward lookup)
```

Both return one payload:

```json
{
  "heat_no": "E2030590",
  "bf_side":     { trip_id, tap_no, source_lab, net_weight, temp, s_l, si_l, first_tare_time, out_date, ... },
  "hts_arrival": { torpedo_no, sms, converter_no, hotmetal_qty, torpedo_in_time, torpedo_out_time, ... },
  "caster":      { sequence_id, shift, p1_operator, cast_weight, no_of_slabs, final_grade, delay_minutes, remarks, ... },
  "consumption": { yield_pct, head_crop_loss_tons, tail_crop_tons, mbs_life, ... },
  "timeline":    [{ key, label, at, location, kind }, ...],   // sorted chronologically
  "gaps":        { transit_min, dwell_min, tap_to_cast_min, ladle_open_to_close_min },
  "anchor":      "heat" | "trip"
}
```

### BF-side match heuristic

`HtsHeatMirror` has `(torpedo_no, torpedo_in_time)`. `WbatnglTripMirror` has `(fleet_id, out_date)`. We pick the WBATNGL row where:

```
fleet_id == hts.torpedo_no
AND out_date > hts.torpedo_in_time - 6h
AND out_date <= hts.torpedo_in_time
ORDER BY out_date DESC
LIMIT 1
```

If no match, `bf_side` is `null` and the UI shows "no matching WBATNGL row" in that section — could be a heat fed by a torpedo we don't mirror, or older than the 6h window.

## Frontend

```
components/SMSPerformance/HeatTraceDrawer.jsx     420px slide-in, scoped to .smsperf-drawer*
pages/SMSPerformance.jsx                          lifts `traceHeatNo` state; passes onRowClick to HeatsTable
components/SMSPerformance/HeatsTable.jsx          row.onClick = onRowClick(heat_no)
components/SMSPerformance/SMSPerformance.css      drawer + outcome strip + stage cards + gap blocks + timeline styles
```

Drawer layout top → bottom:

1. **Header** — heat_no + close button (top-LEFT close, matching TorpedoDetailPanel).
2. **Outcome strip** — 4 cells: Yield · Grade · Cast weight · Delay. Yield tinted amber when below target.
3. **Stage cards** — 4 sections (BF tap / Torpedo trip / SMS-Caster / Losses & consumption). Each is a labelled card with key-value rows; warn tint on cold metal temp / high sulfur.
4. **Durations** — 4 gap blocks (Transit / SMS dwell / Tap→cast / Cast open→close). Pre-computed server-side from timeline so frontend doesn't re-parse dates.
5. **Timeline** — chronological event list, color-coded by stage (BF=indigo, WB=violet, SMS=accent, Caster=orange).
6. **REMARKS** — operator notes from `H_CASTER_HEAT_PROCESS.REMARKS` + `LIQUI_ROBOTIC_REMARKS`, only rendered when non-empty.

## Decisions

1. **Drawer not new page** — preserves the analyst's filtered view of the heats table. Closing the drawer keeps them right where they were.
2. **Anchor by heat_no, not trip_id** — drill-down direction matches the dominant workflow (bad-yield investigation starts from the heat).
3. **6h BF lookback window** — generous enough to cover congested transits + small Oracle clock skew. JSW actual transit is ~30 min.
4. **Server-side pre-computed gaps** — frontend stays date-math-free; UI can render synchronously.
5. **No edit affordance** — read-only audit view. Editing a heat's metadata is out of scope.

## Out of scope

- Bi-directional drill-down from Trip Management (`by-trip/...` endpoint exists but no UI hook yet — wire in a later sprint if asked).
- Lineage view spanning multiple heats per slab/sequence.
- Export trace as PDF.
