# Local PostgreSQL — `hmd` database

**Last verified:** 2026-05-13 (live inspection via DBeaver on BF4 PC)

This is **our own** database — the destination for every upstream sync (SuVeechi, WBATNGL, HTS) plus all application-owned state (alerts, configs, users, fleet, …). Unlike the three source databases (SuVeechi, WBATNGL, HTS), where we have read-only views, here we **own** the schema and can DDL freely.

---

## 1. Connection details

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `hmd` |
| User | `postgres` |
| Password | (in BF4 `backend/.env`) |
| Session TZ | `Asia/Calcutta` (= `Asia/Kolkata`, IST +05:30) — fixed 2026-05-12 |
| Server | Local PostgreSQL on BF4 PC, `C:\Users\v_subramanya.gopal\Desktop\HMD\backend\.env` |
| Network reach | localhost-only (not exposed beyond BF4) |
| Backups | None automated yet — manual `pg_dump` only |

**DBeaver connection setup:**
- Driver: PostgreSQL
- URL: `jdbc:postgresql://localhost:5432/hmd`
- User: `postgres`, password from BF4 `.env`
- TZ: leave default (the driver respects the server's `TimeZone` GUC)

**Verify TZ after any restart:**
```sql
SHOW TIMEZONE;   -- must return Asia/Calcutta (or Asia/Kolkata)
SELECT NOW();    -- the JDBC display may normalize to UTC; the GUC is what matters
```

If TZ ever shows UTC again, re-apply:
```sql
ALTER DATABASE hmd SET TIMEZONE TO 'Asia/Kolkata';
-- Then restart backend so the SQLAlchemy pool flushes.
```

---

## 2. Schema overview — 38 tables in 3 tiers

| Tier | Count | Description |
|---|---:|---|
| **Live data** | 10 | Mirrors of upstream sources + active app state |
| **Config / seed** | 9 | Small reference tables, users, configs |
| **Dead / scaffolding** | 19 | Zero rows, never touched since creation |

Total: **38 tables**, ~71 MB on disk (`fleet_live_locations` alone is 53 MB).

---

## 3. Tier 1 — LIVE data tables

### 3.1 `fleet_live_locations` — SuVeechi GPS history (235,769 rows / 53 MB)

| Aspect | Value |
|---|---|
| Source | SuVeechi `vw_unit_status_ist` snapshots |
| Cadence | Sync runs every 10 s, but **only inserts when position changes** (dedup at sync time) |
| Effective row rate | ~63 rows/torpedo/day average (one every ~23 min) |
| Retention | **Unbounded** — no pruning policy. Oldest row 2026-03-04 (~70 days back). At current rate: ~3.4 MB/day, ~100 MB/month |
| Used for | Trip drawer position trail, current map markers, position-derivative "physically moving" detection |
| TZ | `last_updated` is tz-aware (`+05:30`) — careful when joining with naive timestamps |

**Stale-row stats (live):**
- Total: 235,769
- Fresh (<1 hour): 23,516 (= 53 torpedoes × ~7 minutes × 60 ≈ expected)
- Stale (>24 hours): 170,670 (72%) — full history retained

**Recommendation**: add a 90-day pruning job before the table reaches ~500 MB.

### 3.2 `hts_heat_mirror` — HTS hot-metal heats (35,151 rows / 10 MB)

| Aspect | Value |
|---|---|
| Source | Oracle `HTS.VW_HTS_HOTMETAL_DATA` |
| Cadence | Frequent (`last_sync` always within last minute) |
| Drift vs source | SMS-2: behind by 13–29 heats per converter (~80 total / 0.3%). SMS-4: in sync |
| Coverage | 6 converters across SMS-2 (D, E, F, G) and SMS-4 (H, I) |
| Time range | 2025-04-04 → 2026-05-13 (10 years deep on SMS-2; SMS-4 only since 2026-03-31) |
| Identifier | `heat_no` (varchar, unique) |
| Torpedo normalisation | `torpedo_no` (clean, e.g. `TLC-09`) + `torpedo_no_raw` (source-format fallback, e.g. `9`) |

**Per-converter snapshot** (verified 2026-05-13 20:11 IST):

| SMS | Converter | Heats in mirror | First heat | Latest heat | Status |
|---|---|---:|---|---|---|
| SMS-2 | D | 8,178 | 2025-04-07 | 2026-05-13 15:59 IST | ✅ Live |
| SMS-2 | E | 8,736 | 2025-04-04 | 2026-04-06 02:59 IST | ⚠ Silent ~37 days |
| SMS-2 | F | 8,186 | 2025-04-05 | 2026-05-13 17:39 IST | ✅ Live |
| SMS-2 | G | 8,469 | 2025-04-05 | 2026-05-13 19:16 IST | ✅ Live |
| SMS-4 | H | 846 | 2026-03-31 | 2026-05-13 16:34 IST | ✅ Live |
| SMS-4 | I | 732 | 2026-03-31 | 2026-05-13 16:52 IST | ✅ Live |
| *(NULL)* | H | 3 | 2026-03-31 | 2026-03-31 | 🟡 Uncategorised heats (sms=NULL) |
| *(NULL)* | I | 2 | 2026-03-31 | 2026-03-31 | 🟡 Uncategorised heats (sms=NULL) |

5 heats with `sms = NULL` (all on SMS-4 launch day) — backfill candidate.

### 3.3 `h_caster_heat_process_mirror` — SMS-4 caster heat-process (15,582 rows / 5 MB)

| Aspect | Value |
|---|---|
| Source | Oracle `HTS.H_CASTER_HEAT_PROCESS` |
| Scope | **SMS-4 only** (verified — H_CASTER schema is SMS-4 caster; SMS-2 caster lives in SPT001A schema, not mirrored) |
| Cadence | Active, last sync ~minutes ago |
| Used for | SMS-4 Performance page (yield, loss pareto) |

### 3.4 `h_caster_consumption_mirror` — SMS-4 caster consumption (15,582 rows / 3.6 MB)

| Aspect | Value |
|---|---|
| Source | Oracle `HTS.H_CASTER_CONSUMPTION` (paired with heat_process — same row count) |
| Note | **Newly discovered 2026-05-13** — not yet documented in earlier memory entries |
| Used for | TBD — appears mirrored but no explicit V2 dashboard consumer yet |

### 3.5 `wbatngl_trip_mirror` — BF-side trip transactions (4,018 rows / 2.4 MB)

| Aspect | Value |
|---|---|
| Sources | 2 BF-side views (sync uses UNION-ALL strategy): |
|  | • `BF3."WB_TRANS_DATA_ITRO"` (2,637 rows, 65.6%) — itself a UNION of BF3 local + LRS DB Link + BF5 inside Oracle |
|  | • `BF5."ZWB_TRANSACTION_DATA_ITRO_B"` (1,381 rows, 34.4%) — direct BF5 fallback |
| Cadence | Last sync 20:11 IST (~live). Only 4 sync events in last hour — slow trickle |
| Time range | 2026-04-06 → 2026-05-13 (~37 days) |
| Torpedoes seen | 46 of 53 (7 torpedoes inactive in this window) |
| **Open trips (`sms_ack_time IS NULL`)** | **1,817 (45%)** — see warning below |

⚠ **Critical: `sms_ack_time` is NULL on 45% of all rows.** This cannot be interpreted as "1,817 active in-flight trips." Either SMS acknowledgements are unreliable at source, or our sync isn't picking up `sms_ack_time` updates. Any V2 dashboard logic using `sms_ack_time IS NULL` as "trip in flight" must additionally gate on `out_date >= now - 6h` (already done for Card 2).

⚠ **`source_table` values are quoted Oracle-style**: `BF3."WB_TRANS_DATA_ITRO"` (with literal double-quotes) — important for any WHERE filter.

### 3.6 `h_equp_breakdown_mirror` — converter breakdowns (799 rows / 448 kB)

| Aspect | Value |
|---|---|
| Source | Oracle `HTS.H_EQUP_BREAKDOWN` |
| Cadence | **Daily bulk replace** — all 799 rows share identical `synced_at`. Today's sync was 11:11 IST |
| Note | Earlier suspicion that this was "stalled" was wrong — daily cadence is by design |
| Used for | Alerts & Exceptions feed on V2 dashboard |

### 3.7 `alerts` — application-generated alert events (209 rows / 192 kB)

| Aspect | Value |
|---|---|
| Owner | Our own — generated by `alert_detector.py` |
| Schema | `id, kind, severity, tag, message, location, torpedo_id, trip_id, source, destination, raw_value, threshold, detected_at, acknowledged_at, acknowledged_by` |
| TZ | `detected_at`, `acknowledged_at` are `timestamp with time zone` |

**Active alert distribution (verified 2026-05-13 20:11 IST):**

| `kind` | `severity` | Total | Last 24h | Open |
|---|---|---:|---:|---:|
| `gps_stale` | high | 188 | 188 | 188 |
| `chem_s` | med | 25 | 25 | 25 |
| `dwell` | low | 18 | 18 | 18 |
| `sms_ack` | med | 2 | 2 | 2 |
| `gps_stale` | med | 1 | 1 | 1 |

**All 234 alerts are open** (none acknowledged). Newest alert detected 2 sec before sample. Engine is alive.

Known alert kinds:
- `gps_stale` — torpedo's `reporttime_ist` older than threshold
- `chem_s` — hot metal sulfur exceeds `SPEC_S_MAX = 0.05%`
- `dwell` — torpedo dwelling too long at a node
- `sms_ack` — `sms_ack_time` not received within expected window

### 3.8 `fleet_management` — torpedo master + manual status (53 rows / 120 kB)

| Aspect | Value |
|---|---|
| Schema | `id, fleet_id, type, status, capacity, created_at, last_updated, deleted_at` |
| Status distribution | Operating: 44, Maintenance: 5, Moving: 4 |
| Sync source | Status auto-mapped from SuVeechi (Idle→Operating, Moving→Moving, Ign Off→Maintenance) |
| **Manual override** | UI at `/fleet` can set status manually; sync does NOT auto-clear manual overrides |

### 3.9 `h_unit_code_mirror` — torpedo master list from HTS (36 rows / 56 kB)

| Aspect | Value |
|---|---|
| Source | Oracle `HTS.H_UNIT_CODE` |
| Cadence | Active — last sync at the moment of inspection |
| Use | Reference table for torpedo IDs |

### 3.10 `user_activities` + `login_attempts` (35 + 35 rows)

Application audit log; small.

---

## 4. Tier 2 — Config / seed tables

### 4.1 `system_configs` — global runtime knobs (20 rows)

Schema: `id, config_key, config_value, description` (note: `config_key` / `config_value`, **not** `key` / `value`).

| `config_key` | Value | Description |
|---|---|---|
| `DEFAULT_FILL_TIME` | 30 | Default fill/loading time (min) if not configured per producer |
| `DEFAULT_TRAVEL_TIME` | 30 | Fallback travel time (min) |
| `DEFAULT_UNLOAD_TIME` | 20 | Default unload time (min) |
| `DEFAULT_WAIT_TIME` | 10 | Default queue wait time (min) |
| `EXIT_BUFFER_MINUTES` | 5 | Buffer after loading/unloading before exit |
| `NOMINAL_CAPACITY` | 150.0 | Fallback torpedo capacity in MT |
| `SPEC_S_MAX` | 0.05 | Hot metal sulfur upper limit (%) |
| `SPEC_SI_MAX` | 1.20 | Hot metal silicon upper limit (%) |
| `SPEC_SI_MIN` | 0.30 | Hot metal silicon lower limit (%) |
| `TRAVEL_PRODUCER_TO_WB_MINUTES` | 10 | Producer → weighbridge |
| `TRAVEL_TO_PRODUCER_MINUTES` | 15 | Depot → producer |
| `TRAVEL_TO_WEIGHBRIDGE_MINUTES` | 10 | Assignment → weighbridge |
| `TRAVEL_WB_TO_CONSUMER_MINUTES` | 15 | Weighbridge → consumer |
| `TRAVEL_WB_TO_PRODUCER_MINUTES` | 10 | Weighbridge → producer (return) |
| `WEIGHBRIDGE_PROCESS_TIME_MINUTES` | 10 | Weighing process duration |
| `WHATSAPP_DAILY_REPORT_TIME` | 18:00 | Daily report send time |
| `WHATSAPP_DEFAULT_LANGUAGE` | en | Default WhatsApp language |
| `WHATSAPP_ENABLED` | **false** | WhatsApp not yet active |
| `WHATSAPP_RATE_LIMIT` | 20 | Max msgs/min |
| `WHATSAPP_SERVICE_URL` | http://localhost:3002 | WhatsApp microservice URL |

⚠ All 20 configs are at **defaults** — no per-producer/consumer overrides have been added yet. Spec limits drive `chem_s` alerts.

### 4.2 Other config / seed tables

| Table | Rows | Purpose |
|---|---:|---|
| `users` | 12 | Application logins |
| `trip_time_configs` | 28 | Per-route trip time estimates |
| `routing_constraints` | 14 | Allowed-route rules |
| `locations_coordinates` | 14 | Plant node lat/lon |
| `weighbridges` | 2 | WB1 + WB2 metadata |
| `deviation_threshold_configs` | 1 | Single row, never updated |
| `alembic_version` | 1 (8 updates) | Schema-migration tracker — 8 migrations applied to date |

---

## 5. Tier 3 — DEAD tables (19 zero-row scaffolding)

These tables exist in the schema but have **never been written to** (verified via `pg_stat_user_tables`: `n_tup_ins = 0`, no vacuum/analyze events). They are leftover from earlier V05/V06 designs:

```
trips                          (the active business table is wbatngl_trip_mirror — `trips` is dead)
weighbridge_records            (replaced by wbatngl_trip_mirror weights)
converters                     (replaced by hts_heat_mirror grouping)
daily_plans                    (planning feature never built)
distribution_assignments       ↓
maintenance_schedules          ↓
converter_status_history       ↓  All planning / history features that were
node_status_history            ↓  designed but never implemented
trip_converter_distributions   ↓
consumer_configs               ↓
producer_configs               ↓
shift_configs                  ↓
notifications                  (notification framework never wired)
notification_preferences       ↓
report_history                 (report-history feature never built)
saved_reports                  ↓
scheduled_reports              ↓
whatsapp_message_logs          (WhatsApp not yet enabled)
whatsapp_group_mappings        ↓
```

**Cleanup recommendation**: future migration to drop these 19 tables. Will reduce schema noise and prevent confusion about which `trip*`-named table is authoritative.

⚠ Before dropping, verify no model class in `backend/models/` still references them, and no `app.py` route imports them.

---

## 6. Schema-correction reference card

Real column names (some differ from earlier guesses):

| Table | Real columns of note |
|---|---|
| `wbatngl_trip_mirror` | `first_tare_time` (NOT `in_date`), `out_date`, `closetime`, `received_date`, `sms_ack_time`, `updated_date`, `synced_at`, **`net_weight_actual`**, **`tare_weight_actual`** (raw-vs-actual pair), `source_table`, `fleet_id`, `ladleno_raw` |
| `hts_heat_mirror` | `torpedo_in_time` (NOT `received_date`), `torpedo_out_time`, `torpedo_no` + `torpedo_no_raw`, `converter_no`, `sms`, `hotmetal_qty`, `torpedo_qty`, `converter_life` |
| `alerts` | `kind` (NOT `alert_type`), `severity`, `tag`, `detected_at` (NOT `created_at`), `acknowledged_at`, `raw_value`, `threshold` |
| `system_configs` | `config_key` / `config_value` (NOT `key` / `value`) |
| `fleet_management` | `fleet_id`, `type`, `status`, `capacity`, `last_updated` |

---

## 7. Mirror-vs-source drift summary

| Mirror | Source | Mirror rows | Source rows | Drift |
|---|---|---:|---:|---|
| `hts_heat_mirror` (SMS-2 D) | HTS source | 8,178 | 8,192 | -14 |
| `hts_heat_mirror` (SMS-2 E) | HTS source | 8,736 | 8,749 | -13 |
| `hts_heat_mirror` (SMS-2 F) | HTS source | 8,186 | 8,215 | -29 |
| `hts_heat_mirror` (SMS-2 G) | HTS source | 8,469 | 8,491 | -22 |
| `hts_heat_mirror` (SMS-4 H) | HTS source | 849 (846+3) | 849 | 0 |
| `hts_heat_mirror` (SMS-4 I) | HTS source | 734 (732+2) | 735 | -1 |
| `wbatngl_trip_mirror` | UNION of BF3 + BF5 | 4,018 | unknown | TBD |
| `fleet_live_locations` | SuVeechi (53 rows snapshot) | 235,769 history | 53 latest | We KEEP history; source is UPSERT |

**Conclusions**:
- SMS-2 converters lag source by ~80 heats total (0.3%) — likely a backfill or filter quirk in `hts_sync.py`. Not urgent.
- SMS-4 fully in sync.
- WBATNGL drift not measurable without re-running source-side count.

---

## 8. Sync schedule observations

| Mirror | Observed interval | Last sync (IST) |
|---|---|---|
| SuVeechi → `fleet_live_locations` | 10s (with dedup) | continuous |
| HTS → `hts_heat_mirror` | ~minute | 20:11 IST 2026-05-13 |
| HTS → `h_caster_heat_process_mirror` | ~minute | 19:31 IST |
| HTS → `h_caster_consumption_mirror` | ~minute | 19:32 IST |
| HTS → `h_unit_code_mirror` | ~minute | 20:04 IST |
| HTS → `h_equp_breakdown_mirror` | **Daily bulk replace** (verified by identical synced_at on all rows) | 11:11 IST |
| WBATNGL → `wbatngl_trip_mirror` | ~minute (4 trips synced last hour — low traffic) | 20:11 IST |

---

## 9. Outstanding investigations

1. **`sms_ack_time` is NULL on 45% of WBATNGL rows.** Need to confirm whether:
   - SMS ack is genuinely missing at source
   - OR our sync isn't capturing it
   - OR the field semantics are different from what we assume
   Affects every "is-this-trip-still-in-flight" rule on the V2 dashboard.

2. **BF5 fallback sync IS contributing 34% of WBATNGL rows** — earlier project memory said it might be redundant. Update memory: BF5 fallback is doing useful work, particularly because BF3's `WB_TRANS_DATA_ITRO` union appears to lag (latest BF3 trip = 15:13 IST vs BF5 = 20:04 IST). Don't remove it.

3. **SMS-2 mirror is 80 heats behind HTS source.** Probably a sync filter — investigate `hts_sync.py` and decide whether to backfill.

4. **5 heats with `sms = NULL`** on SMS-4 launch day (2026-03-31). Backfill candidate — all are converter H/I.

5. **`fleet_live_locations` is growing unbounded.** Add a 90-day retention prune before it crosses ~500 MB.

6. **Converter E silent for 37 days** — confirmed in our mirror, matches HTS source. Needs operations explanation from JSW.

7. **No automated backups.** `pg_dump` schedule is a deployment TODO.

8. **19 dead tables** — cleanup migration to drop them.

9. **`h_caster_consumption_mirror` has no documented consumer.** Was mirrored but no V2 dashboard or backend route references it yet — verify whether it's used or planned.

---

## 10. Verification queries — appendix

Full reproducible set for re-running this audit:

```sql
-- Inventory + sizes
SELECT schemaname, relname AS table_name, n_live_tup AS approx_rows,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) AS total_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC;

-- Mirror freshness (run each separately)
SELECT 'h_caster_heat_process_mirror' tbl, COUNT(*), MAX(synced_at) FROM h_caster_heat_process_mirror
UNION ALL SELECT 'h_caster_consumption_mirror', COUNT(*), MAX(synced_at) FROM h_caster_consumption_mirror
UNION ALL SELECT 'h_equp_breakdown_mirror', COUNT(*), MAX(synced_at) FROM h_equp_breakdown_mirror
UNION ALL SELECT 'h_unit_code_mirror', COUNT(*), MAX(synced_at) FROM h_unit_code_mirror;

-- WBATNGL state
SELECT COUNT(*), MAX(first_tare_time) latest_start, MAX(out_date) latest_out,
       COUNT(*) FILTER (WHERE sms_ack_time IS NULL AND out_date IS NOT NULL) open_trips
FROM wbatngl_trip_mirror;

-- HTS per-converter
SELECT sms, converter_no, COUNT(*) heats, MAX(torpedo_in_time) latest
FROM hts_heat_mirror GROUP BY sms, converter_no ORDER BY 1,2;

-- Fleet status
SELECT status, COUNT(*) FROM fleet_management GROUP BY status;

-- Active alerts
SELECT kind, severity, COUNT(*), COUNT(*) FILTER (WHERE acknowledged_at IS NULL) open
FROM alerts GROUP BY kind, severity ORDER BY 3 DESC;

-- TZ sanity
SHOW TIMEZONE;
SELECT NOW();
```

---

## 11. Reference card

| Question | Answer |
|---|---|
| Where do I look for "latest GPS"? | `fleet_live_locations` ORDER BY `last_updated` DESC (it's tz-aware) |
| Where do I look for "active trips"? | `wbatngl_trip_mirror` WHERE `sms_ack_time IS NULL AND out_date IS NOT NULL AND out_date >= NOW() - INTERVAL '6 hours'` |
| Where do I look for "today's heats"? | `hts_heat_mirror` WHERE `torpedo_in_time >= CURRENT_DATE` |
| Where do I look for "today's hot metal kt"? | SUM(`hotmetal_qty`) / 1000 from `hts_heat_mirror` filtered by date |
| Where do I look for "SMS-4 caster"? | `h_caster_heat_process_mirror` + `h_caster_consumption_mirror` |
| What's the canonical torpedo list? | `fleet_management` (53 rows, owned) or `h_unit_code_mirror` (36, source-of-truth from HTS) |
| Why does TZ show `Asia/Calcutta`? | Same as `Asia/Kolkata` — older IANA alias; PG accepts both |
| Why is `trips` table empty? | Dead scaffolding — actual trip data is in `wbatngl_trip_mirror` |
