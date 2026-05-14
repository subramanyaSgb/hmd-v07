# HTS Oracle (JVMLPROD) — Data Source Reference

**Source system:** JSW HTS — Oracle database holding SMS-side hot metal receipts, caster lifecycle, breakdowns, costing.
**Last verified:** 2026-05-13 — via DBeaver inspection from BF4 PC.
**Last updated by:** Subramanya Bellary

---

## 1. Connection details

| Field | Value |
|---|---|
| Database engine | **Oracle** |
| Host (BF4 reachable) | **`10.10.70.227`** (different from WBATNGL's 10.10.1.67!) |
| Port | `1522` |
| Service name | `JVMLPROD.JSW.IN` (full FQDN; email refers to short `JVMLPROD`) |
| Username | `ICT_IFACE` |
| Password | `ICTIFACE` |
| Access type | Read-only on multiple schemas via `ICT_IFACE` user |
| Visible schemas with objects | **23+** (see §3 below) — HTS, SPT001A, SMS3, SMIS, BRM2MES, HSM2_L2, plus many ICT/IFACE/CRM/dev schemas |
| Driver mode | Oracle thick-client recommended (`C:\oracle\instantclient_23_0`). Same `0x939` legacy password verifier as WBATNGL |
| Pulled by | `backend/utils/hts_sync.py` — 5-stage sync covering 5 of 9 useful tables |
| Pull cadence | Every 5 minutes (slow-changing data — heats happen every 30-60 min) |
| Network requirement | JSW internal network — confirmed reachable from BF4 PC |

### Source provenance — fully email-traceable

Unlike WBATNGL (Teams chat), HTS credentials WERE shared by email. Two-step delivery from Hari Prasad B `<hariprasad.bariki@jsw.in>`, JSW IT-Dept:

**Email 1 — Connection details** (2026-04-03 06:27 UTC / 11:57 IST):

> *"Dear Subramanya, We have created the Oracle database view. Please find the details below to access and retrieve the data:*
> - *User: ICT_IFACE*
> - *Server IP: 10.10.70.227*
> - *Port: 1522*
> - *Database: JVMLPROD*
> - *View Name: HTS.VW_HTS_HOTMETAL_DATA*
>
> *The password will be shared with you in a separate email. If you are unable to connect to the server, please contact the network team (Mr. Pradeep) and request them to open port 1522 for IP address 10.10.70.227 on your system."*

**Email 2 — Password** (2026-04-03 06:39 UTC / 12:09 IST, 12 minutes later):

> *"Hi Subramanya, The password is ICTIFACE."*

**Network access** handled by Pradeep Jagaloor + Vasagerappa Murunni per `SOP_IT-OT_Networks_Integration_V4.pdf` (same as WBATNGL).

---

## 2. 🗺️ HTS schema contents — 9 tables, 1 view, 49 objects total

| Object type | Count | Names |
|---|---|---|
| **TABLE** | 9 | `ARC_COLOR_MASTER_ENTB`, `HTS_COSTING_DATA_UPDATE_INTB`, `H_CASTER_CONSUMPTION`, `H_CASTER_HEAT_PROCESS`, `H_CASTER_SEQUENCE`, `H_CONV_DELAY_DAYWISE_RPT`, `H_EQUP_BREAKDOWNS`, `H_UNIT_CODES`, `TOAD_PLAN_TABLE` |
| **VIEW** | 1 | `VW_HTS_HOTMETAL_DATA` ← the original view shared by Hari |
| **FUNCTION** | 26 | JSW custom chemistry helpers — `JSW_GET_FE_*`, `JSW_GET_SI*`, `JSW_GET_FEMN*`, `JSW_GET_HEAT_ROUTE`, etc. Called from inside PL/SQL — not directly useful to us |
| **INDEX** | 12 | DB-internal, not user-facing |
| **SEQUENCE** | 2 | `HOT_METAL_SEQ`, `MICROSOFTSEQDTPROPERTIES` |

### Our coverage — 6 of 9 useful tables mirrored

| HTS object | Mirrored in PG? | Our table | Notes |
|---|---|---|---|
| `VW_HTS_HOTMETAL_DATA` | ✅ | `hts_heat_mirror` | Original view shared by Hari. The "frozen at 123 rows" memory note is stale — view now has 35,231 rows (10 years of history). |
| `H_CASTER_HEAT_PROCESS` | ✅ | `h_caster_heat_process_mirror` | 108 upstream cols, we mirror 22 (heat lifecycle, operators, REMARKS) |
| `H_CASTER_CONSUMPTION` | ✅ | `h_caster_consumption_mirror` | 70 upstream cols, we mirror 22 (yield + 8 loss cols) |
| `H_EQUP_BREAKDOWNS` | ✅ | `h_equp_breakdown_mirror` | Full 8-col mirror, ~800 rows |
| `H_UNIT_CODES` | ✅ | `h_unit_code_mirror` | 2-col lookup, 36 rows |
| `H_CASTER_SEQUENCE` | ❌ Not mirrored | — | ~1,716 rows (Tier 3 deferred — sequence plan adherence) |
| `H_CONV_DELAY_DAYWISE_RPT` | ❌ Not mirrored | — | ~14,338 rows (Tier 3 deferred — pre-aggregated delays) |
| `HTS_COSTING_DATA_UPDATE_INTB` | ❌ Not mirrored | — | ~101,223 rows (Tier 3 deferred — finance/cost data) |
| `ARC_COLOR_MASTER_ENTB` | — Skip | — | 0 rows per memory — empty table |
| `TOAD_PLAN_TABLE` | — Skip | — | Oracle TOAD-tool plan dump, not business data |

---

## 3. 🆕 Other JVMLPROD schemas we can see (Query-C discovery)

23+ user schemas in JVMLPROD. Most-relevant for HMD:

| Schema | Objects | Likely purpose | HMD-relevance |
|---|---|---|---|
| **`HTS`** ✅ | 9 tables, 1 view, 26 functions | Hot metal + caster data | **Current source** |
| **`SPT001A`** 🆕 | **40 tables**, 1 view, 51 functions, 10 packages, 9 sequences | **Per memory: "SMS-2 caster lives in SPT001A (not mirrored)"** — the SMS-2 equivalent of HTS's SMS-4 data | **HIGH — unmirrored SMS-2 caster goldmine** |
| **`SMS3`** 🆕 | 5 tables, 5 indexes | SMS-3 schema (unknown contents) | LOW — SMS-3 out of HMD scope, but cheap to check |
| `SMS2_BOF_L2` | 7 sequences only | SMS-2 BOF Level-2 automation | None (only sequences visible) |
| `SMIS` | 5 tables, 1 view | Slab Management Info System | Out of HMD scope (downstream) |
| `BRM2MES` | 5 tables | BRM (Bar/Rod Mill?) → MES interface | Out of HMD scope |
| `HSM2_L2` | 5 tables | Hot Strip Mill 2 Level-2 | Out of HMD scope |
| `ICT_IFACE` | 5 tables, 24 sequences, 6 synonyms, 8 triggers | **Our user's private schema** — probably contains sync state / staging tables we don't know about | Worth checking |
| `PUBLIC` | 15,985 SYNONYMS | Oracle's cross-schema synonym pool | Not directly queryable |
| Dev / personal (`J_ANKIT`, `S_ARUN`, `CR_MGT`, `JSWCRM`, `CRM`, `APPS`, `TBP`, `UGL`, etc.) | mostly 5 tables each | Developer scratch / legacy / CRM / cost data | Ignore |

### 🎯 The two new schemas worth investigating later

1. **`SPT001A`** (40 tables) — would unlock SMS-2 caster yield / loss / equipment analytics. Currently our SMS-4 Performance page only covers SMS-4 because `HTS.H_CASTER_HEAT_PROCESS` is SMS-4-only.
2. **`SMS3`** (5 tables) — unknown contents; cheap probe to find out. Likely BOF or caster data for SMS-3.

---

## 4. 📊 VW_HTS_HOTMETAL_DATA — fully sampled

### Schema (9 columns)

```sql
CONVERTER_NO     VARCHAR     -- "D", "E", "F", "G", "H", "I"
HEAT_NO          VARCHAR     -- e.g., "D2000192" — converter prefix + serial
HOTMETAL_QTY     NUMBER      -- per-heat hot metal received (MT)
TORPEDO_NO       VARCHAR     -- INCONSISTENT formatting! "16", "09", "9" — needs zero-padding
TORPEDO_IN_TIME  DATE        -- when torpedo arrived at SMS (UTC)
TORPEDO_OUT_TIME DATE        -- when torpedo left SMS (UTC)
TORPEDO_QTY      NUMBER      -- torpedo capacity used this trip (MT)
CONVERTER_LIFE   NUMBER      -- campaign life — # heats since last reline
SMS_UNIT         VARCHAR     -- "SMS-2" or "SMS-4"
```

### Headline counts (2026-05-13 snapshot)

| Metric | Value |
|---|---|
| Total rows | **35,231** |
| Distinct converters | 6 (D, E, F, G, H, I) |
| Distinct SMS units | 2 (SMS-2, SMS-4) |
| Earliest heat | 2016-06-11 21:38 |
| Latest heat | 2026-05-13 12:09 |

### Per-converter / per-SMS distribution

| Converter | SMS | Heats | First heat | Last heat | Tonnes_kt | Status |
|---|---|---|---|---|---|---|
| **D** | SMS-2 | 8,192 | 2016-06-11 | 2026-05-13 10:29 | 1,450 | ✅ Live |
| **E** | SMS-2 | 8,749 | 2016-08-13 | **2026-04-06 21:29** | 1,546 | ⚠ **Quiet ~5 weeks** — likely relining |
| **F** | SMS-2 | 8,215 | 2018-11-30 | 2026-05-13 12:09 | 1,452 | ✅ Live |
| **G** | SMS-2 | 8,491 | 2019-01-30 | 2026-05-13 10:35 | 1,508 | ✅ Live |
| **H** | **SMS-4** | 849 | **2026-03-31** | 2026-05-13 11:04 | 276 | ✅ **NEW** — 6 weeks old |
| **I** | **SMS-4** | 735 | **2026-03-31** | 2026-05-13 11:22 | 239 | ✅ **NEW** — 6 weeks old |
| **TOTAL** | | **35,231** | 2016-2026 | live | **6,471 kt** | |

### Producer / SMS commissioning timeline

```
2016-06 ─── Converter D (SMS-2) commissioned
2016-08 ─── Converter E (SMS-2) commissioned
2018-11 ─── Converter F (SMS-2) commissioned
2019-01 ─── Converter G (SMS-2) commissioned     ← SMS-2 reaches 4-converter shop
   ...
2026-03-31 ── Converters H + I (SMS-4) commissioned together  ← NEW SMS shop
2026-04-06 ── Converter E goes quiet (likely relining)
```

### Data anomalies / quality issues

| Issue | Severity | Notes |
|---|---|---|
| **`TORPEDO_NO` inconsistent formatting** | 🟡 Medium | Same torpedo appears as `"9"` AND `"09"` — sometimes zero-padded, sometimes not. Our sync needs to zero-pad to 2 digits before adding `TLC-` prefix. Verify `normalize_fleet_id()` handles this. |
| **Converter E silent for 5+ weeks** | 🟡 Medium | Last heat 2026-04-06. Need to confirm with JSW ops — relining? Decommissioning? |
| **SMS-2 vs SMS-4 imbalance** | 🟢 Info | SMS-2: 33,647 heats (95.5%). SMS-4: 1,584 heats (4.5%). SMS-4 is new, ramping up — expected. |
| **VW_HTS_HOTMETAL_DATA was "frozen at 123 rows"** | 🟢 Resolved | Memory said this. Now has 35K rows. Hari's live feed IS delivering. |

### Heat-numbering pattern

Heat numbers follow `<converter><serial>`:
- D2000192, D2000197, D2000201, D2000205 — increments of 4-5 between heats
- Not a strict monotonic sequence — gaps exist
- Probably reflects SMS-side sequencing where some heats are tracked but not all delivered hot metal arrives

---

## 5. Sync pipeline

```
HTS.VW_HTS_HOTMETAL_DATA  ──┐
HTS.H_CASTER_HEAT_PROCESS ──┤
HTS.H_CASTER_CONSUMPTION  ──┤  (every 5 min by APScheduler)
HTS.H_EQUP_BREAKDOWNS     ──┤  hts_sync.py — 5-stage tx-isolated run
HTS.H_UNIT_CODES          ──┘
              │
              ├──► hts_heat_mirror              (hotmetal data)
              ├──► h_caster_heat_process_mirror (heat lifecycle)
              ├──► h_caster_consumption_mirror  (yield + losses)
              ├──► h_equp_breakdown_mirror      (downtime)
              └──► h_unit_code_mirror           (lookup)
                                       │
                                       └──► triggers alert_detector.scan_hts_breakdowns()
                                            → equipment-breakdown alerts feed
```

### Sync hardening (changes_tracker #167-170)

After Tier 1 deploy, several issues surfaced and were fixed:
1. **ON CONFLICT cardinality violation** on H_EQUP_BREAKDOWNS — upstream has duplicate `(unit_code, brk_date, reason)` tuples. Fixed by Python-side dedupe-by-key before upsert (last-write-wins).
2. **Reserved-word column quoting** on `SEQUENCE`, `SHIFT`, `DELAY`, `YIELD` — Oracle parser issues mitigated by explicit double-quoting.
3. **Oracle cursor-state bug** — reused cursor across multiple `execute()` calls in one connection caused 0-row returns despite valid data. Fixed by fresh cursor per pull function.
4. **SMS_UNIT was being read as `SMS`** (wrong column name) — fixed in `row_to_mirror_dict()` with fallback.

---

## 6. What HTS was supposed to give vs what we received

From the DEEVIA data requirements (`HMD_Data_Requirements.xlsx`, 25 Mar 2026):

| Requested view | Priority | Delivered? |
|---|---|---|
| `VW_HMD_HOTMETAL_RECEIPTS` (SMS receiving torpedoes) | P0 critical | ✅ Yes — covered by `VW_HTS_HOTMETAL_DATA` |
| `VW_HMD_CONSUMPTION_RATE` (heat-by-heat consumption) | P0 critical | ✅ Yes — covered by `H_CASTER_CONSUMPTION` |
| `VW_HMD_FILLING_EVENTS` (BOF charging events) | P0 critical | ⚠ Partial — `H_CASTER_HEAT_PROCESS` has heat lifecycle but not BOF-side charging detail |
| `VW_HMD_UNLOADING_EVENTS` (torpedo→BOF transfer) | P0 critical | ⚠ Partial — `TORPEDO_IN_TIME` / `TORPEDO_OUT_TIME` in HOTMETAL_DATA approximates this |
| `VW_HMD_CONVERTER_MASTER` | P1 high | ⚠ Partial — converter identity in HEAT_NO + CONVERTER_NO, no separate master |
| `VW_HMD_EQUIPMENT_ALERTS` | P1 high | ✅ Yes — `H_EQUP_BREAKDOWNS` |
| `VW_HMD_TAPHOLE_STATUS` | P1 high | ❌ No (BF-side, not HTS) |
| `VW_HMD_SHUTDOWN_SCHEDULE` | P2 medium | ❌ No |

---

## 7. Outstanding investigations (deferred from this session)

1. **`SPT001A` schema (40 tables)** — explore the SMS-2 caster data. Memory notes this is the SMS-2 equivalent of `HTS.H_CASTER_HEAT_PROCESS` (which is SMS-4-only). If we want plant-wide caster analytics instead of SMS-4-only, this is the source.
2. **`SMS3` schema (5 tables)** — unknown. Cheap to probe.
3. **`ICT_IFACE` schema (our user's own)** — has 5 tables + 24 sequences + 8 triggers. Probably scratch / staging used by upstream sync jobs. Worth seeing what's there.
4. **The 3 deferred HTS tables**:
   - `H_CASTER_SEQUENCE` — Tier 3 (sequence plan adherence) — 1,716 rows
   - `H_CONV_DELAY_DAYWISE_RPT` — Tier 3 (pre-aggregated daily delay reports) — 14,338 rows
   - `HTS_COSTING_DATA_UPDATE_INTB` — Tier 3 (cost data) — 101,223 rows (politically sensitive)
5. **Converter E's silence** — confirm with JSW operations whether it's relining, decommissioning, or data feed issue.
6. **`TORPEDO_NO` normalization** — verify our sync correctly zero-pads `"9"` → `TLC-09`. Audit recent rows in mirror.

---

## 8. Quick verification queries

### HTS direct — inspect upstream

```sql
-- A. Row count + freshness
SELECT COUNT(*) AS total_rows,
       COUNT(DISTINCT CONVERTER_NO) AS converters,
       MIN(TORPEDO_IN_TIME) AS earliest,
       MAX(TORPEDO_IN_TIME) AS latest
FROM HTS.VW_HTS_HOTMETAL_DATA;

-- B. Per-converter / per-SMS breakdown
SELECT CONVERTER_NO, SMS_UNIT, COUNT(*) AS heats
FROM HTS.VW_HTS_HOTMETAL_DATA
GROUP BY CONVERTER_NO, SMS_UNIT
ORDER BY CONVERTER_NO;

-- C. Today's heats
SELECT CONVERTER_NO, SMS_UNIT, COUNT(*) AS heats_today,
       ROUND(SUM(HOTMETAL_QTY)/1000, 2) AS tonnes_kt
FROM HTS.VW_HTS_HOTMETAL_DATA
WHERE TORPEDO_IN_TIME > TRUNC(SYSDATE)
GROUP BY CONVERTER_NO, SMS_UNIT
ORDER BY CONVERTER_NO;

-- D. Inconsistent torpedo formatting
SELECT TORPEDO_NO, LENGTH(TORPEDO_NO), COUNT(*) AS n
FROM HTS.VW_HTS_HOTMETAL_DATA
GROUP BY TORPEDO_NO, LENGTH(TORPEDO_NO)
HAVING COUNT(*) > 100
ORDER BY LENGTH(TORPEDO_NO), TORPEDO_NO;

-- E. SPT001A schema discovery (when ready)
SELECT object_type, object_name
FROM all_objects
WHERE owner = 'SPT001A'
ORDER BY object_type, object_name;
```

### PostgreSQL — compare against our mirror

```sql
-- A. Row count
SELECT COUNT(*) FROM hts_heat_mirror;

-- B. Latest sync vs latest upstream row
SELECT MAX(torpedo_in_time) AS local_max,
       MAX(synced_at) AS last_sync_tick
FROM hts_heat_mirror;

-- C. Distinct values
SELECT sms, COUNT(*) FROM hts_heat_mirror GROUP BY sms ORDER BY 2 DESC;
SELECT converter_no, COUNT(*) FROM hts_heat_mirror GROUP BY converter_no ORDER BY 2 DESC;
```

---

## 9. Network setup history

Same arc as WBATNGL:
- **2026-04-03:** Hari shared credentials by email (2 mails, 12 min apart).
- **2026-04-07:** Subramanya raised firewall request — `10.10.70.227:1522` was unreachable from our `192.168.150.100`.
- **2026-04-13 to 17:** Firewall + SecOps teams (V_Rohan.Pradhan, projectharmony@jsw.in, jaguar.secops, firewall.support) per `SOP_IT-OT_Networks_Integration_V4.pdf`.
- **2026-04-22:** Server hardware maintenance window confirmed (Divakar email msg 19db36dd) — BF4 PC chosen as the destination for sync deployment.
- **2026-05-11:** HTS sync went live (`changes_tracker #59-63` — Phase 1 of Operations Live sprint).
- **2026-05-13:** Tier 1 analytics (SMS-4 Performance page) deployed against HTS data + caster mirrors.

---

## 10. Reference card — quick lookup

| Need | Best query / table |
|---|---|
| Live + consolidated hot metal heats (all SMS) | `HTS.VW_HTS_HOTMETAL_DATA` |
| Heat lifecycle (ladle on/open/close, operators, REMARKS) | `HTS.H_CASTER_HEAT_PROCESS` (108 cols) |
| Yield % + loss breakdown per heat | `HTS.H_CASTER_CONSUMPTION` |
| Equipment downtime events | `HTS.H_EQUP_BREAKDOWNS` |
| Unit-code lookup | `HTS.H_UNIT_CODES` |
| SMS-2 caster equivalent of HEAT_PROCESS | `SPT001A.*` (NOT MIRRORED — exploration pending) |
| Sequence plan adherence | `HTS.H_CASTER_SEQUENCE` (NOT MIRRORED) |
| Daily pre-aggregated delays | `HTS.H_CONV_DELAY_DAYWISE_RPT` (NOT MIRRORED) |
| Cost data per heat | `HTS.HTS_COSTING_DATA_UPDATE_INTB` (NOT MIRRORED — politically sensitive) |
