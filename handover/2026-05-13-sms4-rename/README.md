# Handover — SMS Performance → SMS-4 Performance rename

**Date:** 2026-05-13
**Target machine:** BF4 PC
**changes_tracker.md entries:** #171

---

## What's new

Renamed the **SMS Performance** page to **SMS-4 Performance** and added a subtle scope note above the KPI strip.

### Why

Direct join analysis after Tier 1+2 deploy + hotmetal backfill confirmed (memory: `project_hts_caster_scope.md`):

```
caster_hp 15,574 heats ↔ hotmetal join:
  <NO_HOTMETAL_MATCH>: 14,007
  SMS-4              :  1,567
  (zero SMS-1/2/3)
```

`HTS.H_CASTER_HEAT_PROCESS` is the SMS-4 caster's process table only. SMS-2 (which has 33,562 hotmetal arrivals — 21× SMS-4's volume) routes through a different caster table not yet mirrored, likely in the `SPT001A` schema.

Rather than mislead users with a generic "SMS Performance" label, page is now honest: it's SMS-4 only.

### Scope note on the page

A subtle band above the KPI strip:

> Source: `HTS.H_CASTER_HEAT_PROCESS` — SMS-4 caster only. SMS-1/2/3 caster data lives in different upstream tables (not yet mirrored).

### What still works unchanged

- Heat Trace drawer (Tier 2 #1) still reads `hts_heat_mirror` for SMS attribution — so older SMS-2 heat traces still show "SMS-2" correctly in the Torpedo trip card. Just no yield aggregates.
- Live Tracking V2 "FED INTO" section likewise reads `hts_heat_mirror` for the live SMS-2 attribution.

---

## Files

- `frontend/src/components/Sidebar.jsx` — admin + TRS arrays: label `'SMS Performance'` → `'SMS-4 Performance'`
- `frontend/src/App.jsx` — ROUTE_CONFIG title `'SMS Performance'` → `'SMS-4 Performance'`
- `frontend/src/pages/SMSPerformance.jsx` — added `.smsperf-scope-note` band above KPIRow
- `frontend/src/components/SMSPerformance/SMSPerformance.css` — new `.smsperf-scope-note` styling

No backend changes. No DB migration. URL `/sms-performance` unchanged so existing bookmarks keep working.

---

## Deployment steps (on BF4 PC)

```cmd
cd C:\Users\v_subramanya.gopal\Desktop\HMD
git pull origin sprint-3-operations-live
cd frontend
npm run build
:: backend doesn't need restart — pure frontend change
```

## Sanity checklist

- [ ] Sidebar (admin/TRS): position 5 entry now reads **"SMS-4 Performance"** with Gauge icon
- [ ] Header title for the page reads **"SMS-4 Performance"**
- [ ] Scope note appears as a subtle band above the KPI cards
- [ ] All KPIs / charts / tables continue to work exactly as before
- [ ] Heat trace drawer + Live Tracking V2 FED INTO still show SMS attribution for non-SMS-4 heats (because they read `hts_heat_mirror` not `h_caster_heat_process_mirror`)
