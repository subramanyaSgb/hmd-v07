# Handover — HTS Analytics Tier 2 #1 (Heat Trace drawer)

**Date:** 2026-05-13
**Target machine:** BF4 PC
**Predecessor sprint:** `handover/2026-05-13-hts-analytics-tier1/`
**Roadmap:** `MEMORY.md` → `project_hts_analytics_roadmap.md`
**Design doc:** `docs/2026-05-13-heat-trace-design.md`
**changes_tracker.md entries:** #160 – #165

---

## What's new

Tier 2 #1 of the HTS analytics roadmap — **end-to-end heat trace**. Click any row in the **SMS Performance → Heats** table and a 420px drawer slides in showing the full BF→torpedo→SMS→caster journey for that heat.

### Sections in the drawer

1. **Outcome strip** — Yield · Grade · Cast weight · Delay (yield tinted amber when below target).
2. **BF tap card** — WBATNGL trip that fed this heat (source, tap_no, tap_hole, net_weight, temp, S, Si, first_tare_time, out_date). Auto-warn on cold temp (<1450°C) or high S (>0.05).
3. **Torpedo trip card** — HTS arrival row (torpedo, SMS, converter, HM qty, torpedo in/out times).
4. **SMS / Caster card** — heat lifecycle (sequence, shift, operators, ladle times, slabs, cast size).
5. **Losses & consumption card** — per-loss tonnages, prime slab, powder type, equipment life.
6. **Durations** — 4 gap blocks: Transit · SMS dwell · Tap→cast · Cast open→close.
7. **Timeline** — chronological event list, color-coded by stage (BF=indigo, WB=violet, SMS=accent, Caster=orange).
8. **REMARKS** — operator notes from caster, only rendered when non-empty.

### No DB schema changes

This sprint is purely an **endpoint + UI overlay** on the mirror tables already created in Tier 1. **No Alembic migration required.**

---

## Files

### Backend
- `backend/routes/heat_trace.py` — **NEW** `/api/heat-trace/v1/by-heat/{heat_no}` and `/by-trip/{trip_id}` endpoints (~280 LOC). Performs the 4-way join + computes timeline + gap-summary helpers.
- `backend/main.py` — imported + registered `heat_trace.router`

### Frontend
- `frontend/src/pages/SMSPerformance.jsx` — lifts `traceHeatNo` state; passes `onRowClick` to HeatsTable; mounts `HeatTraceDrawer` when set
- `frontend/src/components/SMSPerformance/HeatsTable.jsx` — rows now `smsperf-row-clickable`, fire `onRowClick(heat_no)`
- `frontend/src/components/SMSPerformance/HeatTraceDrawer.jsx` — **NEW** drawer component (~270 LOC)
- `frontend/src/components/SMSPerformance/SMSPerformance.css` — appended `.smsperf-drawer*` + `.smsperf-trace-*` blocks (~250 LOC)

### Docs
- `docs/plans/2026-05-13-heat-trace-design.md` — **NEW** design doc

---

## Deployment steps (on BF4 PC)

```cmd
cd C:\Users\v_subramanya.gopal\Desktop\HMD
git pull origin sprint-3-operations-live
.venv\Scripts\activate.bat
cd frontend
npm run build
:: Restart backend service (app.bat menu -> restart all)
```

**No migration needed** — this sprint is purely additive at the route+UI level. The Tier 1 mirror tables (`hts002`) already exist.

## Sanity checklist

- [ ] Open SMS Performance — heats table now says "click any row for full trace" in subheader
- [ ] Click any row — drawer slides in from right
- [ ] Outcome strip populated (yield/grade/cast/delay)
- [ ] BF tap card shows WBATNGL data if torpedo had a recent BF trip; otherwise "No matching WBATNGL row..." message
- [ ] Torpedo trip card shows HTS in/out times + converter
- [ ] SMS / Caster card shows lifecycle times + operator(s) + slab count
- [ ] Durations row: Transit + SMS dwell populated; Tap→cast populated if BF side matched
- [ ] Timeline lists events in chronological order with color-coded left borders
- [ ] REMARKS section appears only when caster row has remarks text
- [ ] Click backdrop OR `X` button — drawer closes; table filter state preserved

## API verify

```cmd
curl http://localhost:8000/api/heat-trace/v1/by-heat/<some_heat_no> -H "Authorization: Bearer <token>"
```

Should return a JSON body with all the section keys above; `bf_side` may be `null` if the heat's torpedo trip predates the 6h match window.

## Rollback

Fully additive — removing the sidebar entry isn't even necessary since there's no sidebar entry.

To unwire:
- Revert `frontend/src/pages/SMSPerformance.jsx` + `HeatsTable.jsx` to drop the `onRowClick` plumbing.
- Drop `backend/routes/heat_trace.py` and the matching `app.include_router` line in `main.py`.

No DB changes, no data shape changes. The 4 mirror tables stay in place serving the existing Tier 1 features.
