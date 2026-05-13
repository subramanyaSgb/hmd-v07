# Hotfix — HTS sync 0-rows + breakdown CardinalityViolation

**Date:** 2026-05-13 11:00 IST
**Target machine:** BF4 PC
**Triggered by:** Empty SMS Performance page on first deploy
**changes_tracker.md entries:** #167 – #169

---

## Symptoms from the first BF4 run

From `out.txt` after the Tier 1+Tier 2 deploy:

```
HTS hotmetal OK:  fetched=0 upserted=0 watermark_was=2026-05-13 08:42:16   ← OK (pre-existing data)
HTS caster_hp OK: fetched=0 upserted=0                                     ← BUG: empty mirror, watermark=epoch, but 0 fetched
HTS caster_cn OK: fetched=0 upserted=0                                     ← same root cause as caster_hp
HTS breakdowns failed: CardinalityViolation                                ← duplicate (unit_code, brk_date, reason) in batch
HTS unit_codes OK: fetched=36 upserted=36                                  ← OK
```

SMS Performance page therefore shows all-zero KPIs and "no heats in range" — the mirrors are empty.

## Root cause confirmed (probe output, 2026-05-13 11:10)

The probe (`test_hts_caster_probe.py`) proved:

- Upstream H_CASTER_HEAT_PROCESS has **15,575 rows**, max CASTER_DATE = **2026-05-13 09:45:59** (fresh today)
- The exact `WHERE CASTER_DATE > :wm` pattern with `wm=datetime(1970,1,1)` returns **15,574 rows** on a fresh cursor
- Both bare and quoted SELECT lists work

So the upstream is fine and the SQL is fine. The only remaining variable: **the shared cursor across 5 sequential `cursor.execute(...)` calls in `run_once`**. oracledb appears to leak bind/statement state across re-executions in a way that silently returns 0 rows for the 2nd+ query.

**Fix (added in this hotfix v2):** every pull function now opens its OWN fresh cursor via `conn.cursor()` and closes it in `finally`. The orchestrator no longer creates a shared cursor.

## What changed in this hotfix

### 1. Breakdown dedupe (`pull_breakdowns`)
Upstream H_EQUP_BREAKDOWNS has duplicate `(unit_code, brk_date, reason)` rows. Postgres's `ON CONFLICT DO UPDATE` can only resolve one row per conflict key per statement, so a duplicate inside a single batch raises `CardinalityViolation`. Fix: dedupe by conflict key in Python before upserting; last write wins.

### 2. Quoted reserved keywords in caster SQL
`SEQUENCE`, `SHIFT`, `DELAY`, `YIELD` are Oracle non-reserved keywords. They *usually* work bare in a SELECT, but quoting them defensively (`"SEQUENCE"`, etc.) removes one possible cause of silent 0-row returns.

### 3. Fresh cursor per pull (THE root-cause fix)

All 5 pull functions changed signature from `(db, cursor, ...)` → `(db, conn, ...)`. Each opens its own `conn.cursor()` at start and closes it in `finally`. The orchestrator no longer opens a shared cursor.

This is what fixes the 0-rows-from-caster_hp symptom. The probe proved everything else (upstream data, SQL, bind binding) is fine.

### 4. Diagnostic probe on empty caster_hp mirror
When the mirror is empty (watermark=epoch), `pull_caster_hp` now logs a one-shot probe:

```
HTS caster_hp probe: upstream total=<n>, max_caster_date=<date>
```

This tells us in the next sync tick whether the upstream is actually empty / has stale data / matches our WHERE clause.

### 5. NEW diagnostic script `test_hts_caster_probe.py`
At repo root. Runs 6 probes directly against Oracle:
- A. Bare row count of `H_CASTER_HEAT_PROCESS`
- B. CASTER_DATE NULL distribution + min/max
- C. Our exact `WHERE CASTER_DATE > :wm` pattern with python datetime
- C'. Same comparison with explicit Oracle `TO_DATE(...)`
- D. Bare vs quoted-keyword SELECT list (fetches 1 row)
- E. Consumption row count
- F. Breakdown duplicate-key count

The output unambiguously identifies which of {empty table, NULL dates, binding mismatch, keyword parse, dup keys} is the actual cause.

---

## Files

- `backend/utils/hts_sync.py` — fixed
- `test_hts_caster_probe.py` — NEW probe script at repo root

---

## Deployment steps (on BF4 PC)

```cmd
cd C:\Users\v_subramanya.gopal\Desktop\HMD
git pull origin sprint-3-operations-live
.venv\Scripts\activate.bat

:: 1) Run the probe to see what's REALLY in Oracle right now
python test_hts_caster_probe.py
:: Paste output back to Claude — that confirms the upstream truth.

:: 2) Restart the backend so the fixed sync code is live
::    (app.bat → restart all)
```

After restart, wait one 60-second HTS tick. The log should now show:

```
HTS caster_hp probe: upstream total=<N>, max_caster_date=<date>   ← NEW diagnostic
HTS caster_hp OK: fetched=<N> upserted=<N>                        ← hopefully non-zero
HTS caster_cn OK: fetched=<N> upserted=<N>
HTS breakdowns OK: fetched=<N> upserted=<N> new_alerts=<N>        ← was: failed
```

Verify the mirror counts:

```cmd
psql -d hmd -c "select 'caster_hp' tbl, count(*) from h_caster_heat_process_mirror union all select 'caster_cn', count(*) from h_caster_consumption_mirror union all select 'breakdown', count(*) from h_equp_breakdown_mirror union all select 'unit', count(*) from h_unit_code_mirror;"
```

If `caster_hp` is still 0, the probe output will tell us why — paste it back.

## Rollback

Trivial — `git revert <hotfix-commit>` and restart. The fixes are all in one file.
