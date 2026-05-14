# WBATNGL Oracle — Data Source Reference

**Source system:** JSW WBATNGL — Oracle database holding BF-side weighbridge / torpedo-trip transactions.
**Last verified:** 2026-05-13 — via DBeaver inspection, 9 views fully mapped on BF4 PC.
**Last updated by:** Subramanya Bellary

---

## 1. Connection details

| Field | Value |
|---|---|
| Database engine | **Oracle** |
| Host (BF4 reachable) | `10.10.1.67` |
| Port | `1522` |
| Service name | `WBATNGL` |
| Username | `ITROSYSP` |
| Password | `ITROSYSP` (same as username) |
| Access type | Read-only on multiple BF schemas via `ITROSYSP` user |
| Visible schemas with views | Only **BF3** (5 views) and **BF5** (4 views). Other schemas (BF4, BF3_L2, CEMENTPLANT, CLM, COREXL2, DARWIN.*) exist as Oracle users but have no views ITROSYSP can SELECT from. |
| Driver mode | Oracle thick-client recommended (`C:\oracle\instantclient_23_0`). Thin works for read-only inspection but JSW uses legacy password verifier `0x939` which sometimes needs thick mode |
| Pulled by | `backend/utils/wbatngl_trip_sync.py` — primary trip sync<br>`backend/utils/wbatngl_capacity_sync.py` — nightly torpedo capacity backfill |
| Pull cadence | Every 60s (trip mirror); 03:00 IST daily (capacity backfill) |
| Network requirement | JSW internal network — confirmed reachable from BF4 PC |

### Source provenance — credentials shared via Teams chat, NOT email

Unlike SuVeechi, WBATNGL credentials were shared in Teams meeting chat after the 16-April-2026 meeting. From msg 31 of the "Hot Metal Distribution System and clarification on Torpedo data" thread:

> **From:** Kotaiah Katragadda `<v_kotaiah.katragadda@jsw.in>` — JSW Oracle DBA
> **Date:** 2026-04-16 07:02 UTC (12:32 IST)
> **Body:** *"Hi details shared in meeting chat. Pls check now"*

The owner / approver chain:
- **Requester:** Subramanya Bellary (Deevia) — original `HMD_Data_Requirements.xlsx` 25-Mar-2026
- **Approver:** Gagan Chopra (JSW IT) — 31-Mar-2026
- **DBA:** Kotaiah Katragadda — view access granted 16-Apr-2026
- **Network access:** sorted by V_Rohan.Pradhan + projectharmony + firewall.support during 14-17 April per `SOP_IT-OT_Networks_Integration_V4.pdf`

---

## 2. 🏗️ Architecture — `BF3.WB_TRANS_DATA_ITRO` is a UNION ALL of 3 sources

**This is the most important finding.** The "consolidated all-producer view" we sync from is **not a base table** — it's a `UNION ALL` of three underlying sources, one of which is across a **remote Oracle database** via DB Link.

```sql
-- Cleaned-up definition of BF3.WB_TRANS_DATA_ITRO
SELECT ... FROM (

    -- BRANCH 1 — Remote Oracle DB via DB Link
    SELECT a.*, 'LRS' AS loc, 0.0 AS si_l, a.hts_bds_temp AS bds_temp
    FROM wb_lrs_itro@bf3_to_lrs.regress.rdbms.dev.us.oracle.com a
    WHERE a.ladleno LIKE '%TLC%' AND a.first_tare_time IS NOT NULL

    UNION ALL

    -- BRANCH 2 — Local BF3 schema view
    SELECT b.*, 'BF3' AS loc, b.si_l, b.hts_bds_temp AS bds_temp
    FROM bf3_transaction_data_itro b
    WHERE b.ladleno LIKE '%TLC%'

    UNION ALL

    -- BRANCH 3 — Local BF5 schema view
    SELECT c.*, 'BF5' AS loc, c.si_l, c.hts_bds_temp AS bds_temp
    FROM bf5.BF5_TRANSACTION_DATA_ITRO c
    WHERE c.ladleno LIKE '%TLC%'

) SOURCE
GROUP BY ... -- (acts as DISTINCT)
ORDER BY ladleno, out_date DESC;
```

### Mapping branches → producers

| UNION branch | Underlying source | Database | `LOC` literal | Producers | Si data | Trip row count |
|---|---|---|---|---|---|---|
| **1** | `wb_lrs_itro` | **Remote LRS DB** (via DB Link `bf3_to_lrs.regress.rdbms.dev.us.oracle.com`) | `'LRS'` | **BF1, BF2, COREX1, COREX2** | ❌ Hardcoded `0.0` (not real) | 35,138 |
| **2** | `bf3_transaction_data_itro` | Local WBATNGL — BF3 schema | `'BF3'` | **BF3, BF4** | ✅ Real values | 164,339 |
| **3** | `bf5.BF5_TRANSACTION_DATA_ITRO` | Local WBATNGL — BF5 schema | `'BF5'` | **BF5** | ✅ Real values | 17,703 |
| (typos) | — | — | — | `"BF 3"`, `"BF 4"` (spaces) | — | 25 |
| **TOTAL** | | | | All 7 producers | partial | **217,205** ✓ |

### Why `si_l = 0.0` is hardcoded in Branch 1

The remote LRS DB **doesn't have an SI_L column at all** for its weighbridge data. So when the consolidated view UNIONs it in, it explicitly sets `si_l = 0.0` as a placeholder. Our sync's `_zero_to_null` helper then converts that `0.0` to NULL, which is why **Si is "missing" for BF1/BF2/COREX1/COREX2 rows in our mirror**. This is correct behavior — we never had real Si for those producers.

### Other notes from the view definition

- All 3 branches filter `WHERE ladleno LIKE '%TLC%'` — restricts to torpedo ladles only (excludes 5MT ladles etc.)
- Commented-out reference to `-- wb_lrs_5mt@bf3_to_lrs c,` — there's a separate 5MT-ladle table in LRS DB we don't pull (out of scope for HMD)
- `RECEIVED_DATE` aliased to `ack_time` inside the subquery, then aliased back to `ack_time` in the outer SELECT (which then becomes our `received_date` mirror column — confusing but functional)
- `GROUP BY` over all columns acts as DISTINCT — deduplicates rows that might appear in multiple branches
- DB Link name `bf3_to_lrs.regress.rdbms.dev.us.oracle.com` — the suffix `.regress.rdbms.dev.us.oracle.com` is the default Oracle global DB domain. The link itself is named `bf3_to_lrs`.

---

## 3. 🗺️ All 9 WBATNGL views — fully mapped

| # | View | Cols | Rows | History | Source(s) inside | Has Si? | Has BDS_TEMP? | Use case |
|---|---|---|---|---|---|---|---|---|
| 1 | `BF3.BF3_TRANSACTION_DATA_ITRO` | 22 | 164,339 | 2017-06-24 → 2026-05-13 | BF3, BF4 native | ✅ | ✅ (named `HTS_BDS_TEMP`) | Base table feeding Branch 2 |
| 2 | `BF3.WB_TRANSACTION_DATA` | 16 | ~277K | 2009-03-20 → 2026-05-13 | BF3, BF4 + NULL/garbage | ❌ | ❌ | Legacy view (pre-chemistry era) — has 8yr extra history but messier |
| 3 | **`BF3.WB_TRANS_DATA_ITRO`** ✅ | 23 | 217,205 | 2017-06-24 → 2026-05-13 | **UNION ALL of all 3 branches** = all 7 producers | ✅ (BF3/4/5 only) | ✅ (named `BDS_TEMP`) | **OUR SYNC SOURCE** — comprehensive |
| 4 | `BF3.ZWB_TRANSACTION_DATA_ITRO` | 20 | ~194K | 2013-08-05 → 2026-05-13 | BF3, BF4 long history | ❌ | ❌ | Longer BF3+BF4 history; no Si/BDS |
| 5 | `BF3.ZWB_TRANSACTION_DATA_ITRO_B` | 20 | ~194K | identical to #4 | (replica) | ❌ | ❌ | Exact copy of #4 |
| 6 | `BF5.BF5_TRANSACTION_DATA_ITRO` | 22 | 17,704 | 2024-12-13 → 2026-05-13 | BF5 only | ✅ | ✅ (named `HTS_BDS_TEMP`) | Base table feeding Branch 3 |
| 7 | `BF5.WB_TRANS_DATA_ITRO` | — | — | — | — | — | — | **⚠ BROKEN** — `ORA-04063: view has errors`. Likely a defunct mirror of the BF3.WB_TRANS_DATA_ITRO concept; never repaired |
| 8 | `BF5.ZWB_TRANSACTION_DATA_ITRO` | 20 | 17,722 | 2024-12-13 → 2026-05-13 | BF5 only (looser filter) | ❌ | ❌ | 18 more rows than #6 — keeps rows where Si/BDS columns are absent |
| 9 | `BF5.ZWB_TRANSACTION_DATA_ITRO_B` | 20 | 17,722 | identical to #8 | (replica) | ❌ | ❌ | Exact copy of #8. **Our BF5 fallback sync uses this view.** |

### View-to-base relationships

```
BF3.WB_TRANS_DATA_ITRO  (the consolidated view ── 3 branches)
    │
    ├── Branch 1 ──► wb_lrs_itro@bf3_to_lrs (DB Link — REMOTE Oracle DB)
    │                    └── BF1, BF2, COREX1, COREX2 native data lives here
    │
    ├── Branch 2 ──► BF3.BF3_TRANSACTION_DATA_ITRO  (View #1 above)
    │                    └── BF3, BF4 native data
    │                    └── ZWB_TRANSACTION_DATA_ITRO is a long-history alt of this
    │
    └── Branch 3 ──► BF5.BF5_TRANSACTION_DATA_ITRO  (View #6 above)
                         └── BF5 native data
                         └── ZWB_TRANSACTION_DATA_ITRO_B is our fallback alt of this
```

---

## 4. 📊 Source distribution (across all producers)

From `BF3.WB_TRANS_DATA_ITRO` snapshot 2026-05-13:

| `SOURCE_LAB` | Rows | First seen | Last update | Tonnes_kt | Status | Branch |
|---|---|---|---|---|---|---|
| `BF4` | **88,458** | 2017-06-24 | 2026-05-13 12:36 | 30,425 | ✅ **LIVE** | 2 (BF3 local) |
| `BF3` | **75,881** | 2017-06-24 | **2025-09-24** | 26,134 | ⚠ **Stopped ~8 mo ago** | 2 (BF3 local) |
| `BF5` | 17,703 | 2024-12-13 | 2026-05-13 12:35 | 5,688 | ✅ **LIVE** | 3 (BF5 local) |
| `BF1` | 15,565 | 2024-05-31 | 2026-05-13 09:53 | 4,108 | ✅ **LIVE** | 1 (LRS link) |
| `BF2` | 7,700 | 2024-05-31 | 2026-05-13 10:33 | 2,388 | ✅ **LIVE** | 1 (LRS link) |
| `COREX2` | 6,049 | 2024-05-31 | 2026-05-13 09:32 | 1,284 | ✅ **LIVE** | 1 (LRS link) |
| `COREX1` | 5,824 | 2024-05-31 | 2026-05-13 10:24 | 1,265 | ✅ **LIVE** | 1 (LRS link) |
| `"BF 4"` (with space typo) | 13 | 2023-12-07 | 2023-12-08 | 4.5 | — | 2 |
| `"BF 3"` (with space typo) | 12 | 2023-12-07 | 2023-12-08 | 4.3 | — | 2 |
| **TOTAL** | **217,205** | 2017-2026 | 2026-05-13 | **71,304 kt** | | |

### Producer integration waves

Three waves became visible in our data:

| Wave | Date | New producers added | How added |
|---|---|---|---|
| **W1 — 2017-06-24** | ~9 years ago | BF3, BF4 | Local WBATNGL schema (BF3) created |
| **W2 — 2024-05-31** | ~1 year ago | BF1, BF2, COREX1, COREX2 | DB Link to LRS DB enabled |
| **W3 — 2024-12-13** | ~5 months ago | BF5 | BF5 schema created in local WBATNGL |

### BF3 stopped on 2025-09-24

BF3's last record in **every view that contains BF3 data** is exactly `2025-09-24 23:37:49`. This is a **structural shutdown**, not a glitch — confirmed across views 1, 2, 3, 4, 5. Worth asking JSW operations: relining? decommissioning? data feed rerouted?

---

## 5. Upstream column schema (`BF3.WB_TRANS_DATA_ITRO`, 23 columns)

The full schema we sync from. Column names UPPERCASE as Oracle returns them.

| # | Oracle column | Our mirror column | Type | Notes |
|---|---|---|---|---|
| 1 | `TAPNO` | `tap_no` | NUMBER | BF tap number (note: NO underscore in Oracle col name) |
| 2 | `LADLENO` | `ladleno_raw` | VARCHAR | Torpedo identifier — raw as upstream sends (`"TLC 01"` / `"TLC01"` / `"TLC-1"`). Our sync normalizes. |
| — | (derived) | `fleet_id` | VARCHAR | Normalized `"TLC-01"` by our sync |
| 3 | `TAPHOLE` | `tap_hole` | NUMBER | BF tap hole number |
| 4 | `GROSS_WEIGHT` | `gross_weight` | NUMBER | Loaded torpedo weight (MT) |
| 5 | `TARE_WEIGHT` | `tare_weight` | NUMBER | Empty torpedo weight (MT) |
| 6 | `NET_WEIGHT` | `net_weight` | NUMBER | Hot metal weight = gross − tare |
| 7 | `DESTINATION` | `destination` | VARCHAR | Target SMS: `SMS1`/`SMS2`/`SMS3`/`SMS4`/`RFL` |
| 8 | `FIRST_TARE_TIME` | `first_tare_time` | DATE | Empty torpedo first weighed at BF (start of trip) |
| 9 | `OUT_DATE` | `out_date` | DATE | BF gate exit timestamp (canonical "dispatched") |
| 10 | `TRIP_ID` | `trip_id` | VARCHAR | Trip identifier — 2 formats: `74656TLC 111130526` or `67171341130526` |
| 11 | `UPDATED_DATE` | `updated_date` | DATE | Last update — used for change detection |
| 12 | `SHIFT` | `shift` | VARCHAR | Shift code: `A` / `B` / `C` |
| 13 | `TARE_WEIGHT_ACTUAL` | `tare_weight_actual` | NUMBER | SMS-side tare reading (reconciliation) |
| 14 | `NET_WEIGHT_ACTUAL` | `net_weight_actual` | NUMBER | SMS-side net reading (reconciliation) |
| 15 | **`SOURCE_LAB`** | `source_lab` | VARCHAR | Producer: `BF1`/`BF2`/`BF3`/`BF4`/`BF5`/`COREX1`/`COREX2` |
| 16 | `RECEIVED_DATE` | `received_date` | DATE | SMS received timestamp — often the **2014-03-08 11:52:33 sentinel** |
| 17 | `CLOSETIME` | `closetime` | DATE | Trip closed in WBATNGL (chemistry done) |
| 18 | `TEMP` | `temp` | NUMBER | Hot metal temperature at chemistry sample (°C) |
| 19 | `S_L` | `s_l` | NUMBER | Sulfur % |
| 20 | `SMS_ACK_TIME` | `sms_ack_time` | DATE | SMS operator confirmed receipt — only ~25% populated |
| 21 | **`LOC`** | (not mirrored) | VARCHAR | Branch tag: `'LRS'` / `'BF3'` / `'BF5'`. **Always populated** but we don't store it. |
| 22 | `SI_L` | `si_l` | NUMBER | Silicon % — **hardcoded `0.0` (→ NULL after sync) for Branch 1 producers (BF1/BF2/COREX1/COREX2)** |
| 23 | `BDS_TEMP` | `bds_temp` | NUMBER | SMS-receive temp — **NEVER populated** (0 / 2,314 rows in 30d probe — Card 4 was repurposed to BF tap temp instead) |

### Timestamp lifecycle (canonical order)

```
first_tare_time   →    closetime    →    out_date    →   received_date  →   sms_ack_time
(empty torpedo                              (BF gate         (at SMS,
 weighs in at BF)        (chem sampled,      exit,            often "2014"
                          weighing done)     "dispatched")    sentinel)
```

Populated rate (30-day probe sample):
- `first_tare_time`: ~100% • `closetime`: ~57% • `out_date`: ~46%
- `received_date`: ~31% (contaminated with 2014 sentinel — 24/84 rows)
- `sms_ack_time`: ~25%

---

## 6. 🚨 Known data quirks (catalogued across probes)

1. **`2014-03-08 11:52:33` sentinel** in `received_date` — ~29% of rows. Oracle null-sentinel that survived our sync's parsing. Should be translated to NULL at sync time (deferred fix).
2. **`closetime` before `first_tare`** anomalies (~10% of rows) — timestamps out of order. Upstream data-quality issue (BF clock drift or backdated entry). Can't fix at our side.
3. **`SI_L` is hardcoded `0.0` → NULL for BF1/BF2/COREX1/COREX2** — explained by the LRS DB Link branch (Branch 1) which doesn't carry Si data.
4. **`BDS_TEMP` / `HTS_BDS_TEMP` never populated** — 0/2,314 rows over 30d. JSW does not capture SMS-receive temp in this DB.
5. **Only ~25% of trips get `sms_ack_time`** — 75% never close the loop. Operator hygiene, not a data bug.
6. **Two `trip_id` formats coexist** — `74656TLC 111130526` (76%) vs `67171341130526` (24%). Both unique.
7. **`"BF 4"` and `"BF 3"` with space typos** — 25 rows total from Dec 2023. Real DB rows, negligible (~9 kt out of 71,000 kt).
8. **`LOC` column has 3 known values** — `'LRS'` / `'BF3'` / `'BF5'`. The earlier WHERE filter `LOC != ''` returning "no data" was likely because Oracle padded the values with trailing spaces — would need `TRIM(LOC)` to be sure.

---

## 7. 🔧 Implications for our sync architecture

### What's correct

- `wbatngl_trip_sync.py` reads from `BF3.WB_TRANS_DATA_ITRO` ✓ — the optimal consolidated view
- Captures all 7 producers correctly ✓
- Normalizes `LADLENO` formats ✓
- `_zero_to_null` correctly handles the Branch-1 fake Si zeros ✓

### Possible cleanup

- **Why we ALSO sync from `BF5.ZWB_TRANSACTION_DATA_ITRO_B`** is now suspicious. Since Dec 2024, BF5 data IS already in `BF3.WB_TRANS_DATA_ITRO` (Branch 3). The dual-sync may be **legacy / belt-and-braces** that's no longer needed. Worth investigating + removing if redundant.
- **`LOC` column** — currently not mirrored. Could be useful as a quick branch indicator without re-reading the view definition. Trivial to add if needed.

### Open architectural questions

1. **Where is the remote LRS Oracle DB?** Host? Service name? Credentials? Currently we don't know — we just consume via DB Link. To inspect upstream BF1/BF2/COREX1/COREX2 data directly, we'd need to ask Kotaiah for LRS DB credentials.
2. **Does the LRS DB have a real Si column we could enrich into our pipeline?** If yes, we could replace the `0.0` hardcode with a JOIN.
3. **What's in `wb_lrs_5mt`?** Commented-out reference — 5MT ladle equivalent. Probably out-of-scope for torpedo HMD, but JSW might need it later.
4. **Should we be reading `BF3.BF3_TRANSACTION_DATA_ITRO` directly for BF3/BF4 data** instead of going through the UNION view? Pro: faster, simpler. Con: misses BF5 + LRS-branch data. Net: stick with the consolidated view.

---

## 8. 🔍 Verification queries

### Oracle WBATNGL — directly inspect upstream

```sql
-- A. List all source labs (= producers)
SELECT DISTINCT SOURCE_LAB FROM BF3.WB_TRANS_DATA_ITRO ORDER BY 1;

-- B. List all destinations (= consumer SMS / RFL)
SELECT DISTINCT DESTINATION FROM BF3.WB_TRANS_DATA_ITRO ORDER BY 1;

-- C. Trips dispatched today (SYSDATE = Oracle server time, IST)
SELECT COUNT(*) AS trips_today,
       ROUND(SUM(NET_WEIGHT)/1000, 2) AS tonnes_today_kt
FROM BF3.WB_TRANS_DATA_ITRO
WHERE OUT_DATE >= TRUNC(SYSDATE);

-- D. Average chemistry per source
SELECT SOURCE_LAB,
       ROUND(AVG(TEMP), 1) AS avg_temp,
       ROUND(AVG(S_L), 4)  AS avg_s,
       ROUND(AVG(SI_L), 3) AS avg_si,
       COUNT(*) AS n
FROM BF3.WB_TRANS_DATA_ITRO
WHERE UPDATED_DATE > SYSDATE - 7
GROUP BY SOURCE_LAB
ORDER BY SOURCE_LAB;

-- E. Sentinel-date check
SELECT TRIP_ID, LADLENO, RECEIVED_DATE
FROM BF3.WB_TRANS_DATA_ITRO
WHERE RECEIVED_DATE = TO_DATE('2014-03-08 11:52:33', 'YYYY-MM-DD HH24:MI:SS')
FETCH FIRST 10 ROWS ONLY;

-- F. Verify LOC branch distribution (after TRIM)
SELECT TRIM(LOC) AS loc_branch, COUNT(*) AS n
FROM BF3.WB_TRANS_DATA_ITRO
GROUP BY TRIM(LOC)
ORDER BY n DESC;

-- G. Re-read the view definition
SELECT text FROM all_views
WHERE owner = 'BF3' AND view_name = 'WB_TRANS_DATA_ITRO';
```

### PostgreSQL — compare against our mirror

```sql
SELECT COUNT(*) FROM wbatngl_trip_mirror;
-- vs Oracle SELECT COUNT(*) FROM BF3.WB_TRANS_DATA_ITRO; — should be within a few rows

SELECT COUNT(*) FROM wbatngl_trip_mirror WHERE received_date = '2014-03-08 11:52:33';
-- The 2014 sentinel — confirm it's coming through unchanged

SELECT MAX(updated_date) AS local_max, MAX(synced_at) AS last_sync_tick
FROM wbatngl_trip_mirror;
```

---

## 9. Network setup history

- **2026-04-03:** Pritam Saha forwarded the original DEEVIA data-requirements to Kotaiah (Oracle DBA), asking for Oracle view access.
- **2026-04-07:** Subramanya raised firewall request — system at `192.168.150.100` could not reach `10.10.1.67:1522` (WBATNGL) or `10.10.70.227:1522` (HTS).
- **2026-04-13 to 17:** Firewall + SecOps teams (V_Rohan.Pradhan, projectharmony@jsw.in, jaguar.secops, firewall.support) per `SOP_IT-OT_Networks_Integration_V4.pdf`.
- **2026-04-15:** Kotaiah confirmed Oracle view access provisioned ("Sir we already provided to Suveechi Team. Please review once and confirm" — msg 28).
- **2026-04-16:** Kotaiah shared connection details via Teams chat ("Hi details shared in meeting chat" — msg 31).
- **2026-05-06:** WBATNGL capacity sync deployed (Phase 3 of Live Tracking sprint, per `changes_tracker #45-46`).
- **2026-05-12:** WBATNGL trip mirror sync deployed (Sprint 2, `changes_tracker #22+`).

---

## 10. What WBATNGL was supposed to give vs what we received

From the DEEVIA data requirements (`HMD_Data_Requirements.xlsx`, 25 Mar 2026):

| Requested view | Priority | Delivered? |
|---|---|---|
| `VW_HMD_WEIGHBRIDGE_RECORDS` (Weighbridge trip records) | **P0** critical | ✅ Yes — covered by `BF3.WB_TRANS_DATA_ITRO` (UNION of 3 sources, includes all 7 producers) |
| `VW_HMD_WEIGHBRIDGE_MASTER` (master list of WB units) | P2 medium | ❓ Not delivered |
| `VW_HMD_METAL_QUALITY` (chemistry — S, Si, P, C, etc.) | P2 medium | ⚠ Partial — S+Si only (no P, C), and Si is BF3/4/5 only |
| WB Geofence definitions | P1 high | ❌ No |
| Production rate / Filling events / Consumption rate | P0 critical | ❌ No (those come from HTS, not WBATNGL) |

---

## 11. Open questions / follow-ups for next session

1. Get credentials for the **remote LRS Oracle DB** (where BF1/BF2/COREX1/COREX2 native data lives) — would unlock real Si data for those producers
2. Confirm **why BF3 stopped on 2025-09-24** — operations question
3. Investigate **`BF5.WB_TRANS_DATA_ITRO`'s ORA-04063** — abandoned view? Worth asking Kotaiah to drop or repair
4. Decide whether to **remove the BF5 fallback sync** — BF3.WB_TRANS_DATA_ITRO's Branch 3 already includes BF5 since Dec 2024
5. Consider **mirroring the `LOC` column** — cheap branch indicator
6. Fix the **2014-03-08 sentinel** at sync time — translate Oracle null-sentinel to PG NULL

---

## 12. View-level reference card (quick lookup)

If you ever forget which view to use:

| Need | Best view |
|---|---|
| Live + consolidated all 7 producers | `BF3.WB_TRANS_DATA_ITRO` ✅ |
| BF3 + BF4 history with chemistry | `BF3.BF3_TRANSACTION_DATA_ITRO` (2017+) |
| BF3 + BF4 history without chemistry (2013-2017) | `BF3.ZWB_TRANSACTION_DATA_ITRO` |
| BF3 + BF4 history pre-2013 (no chemistry, messy data) | `BF3.WB_TRANSACTION_DATA` (2009+) |
| BF5 only with chemistry | `BF5.BF5_TRANSACTION_DATA_ITRO` |
| BF5 only with Si-NULL tolerance | `BF5.ZWB_TRANSACTION_DATA_ITRO` |
| BF1, BF2, COREX1, COREX2 directly | **Only accessible via DB Link** through `BF3.WB_TRANS_DATA_ITRO` — no direct access from ITROSYSP |
