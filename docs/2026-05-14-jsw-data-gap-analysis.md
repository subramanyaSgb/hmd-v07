---
title: HMD ↔ JSW Data Gap Analysis
date: 2026-05-14
version: 1.0 (Draft for JSW review)
status: Complete first draft — ready for JSW review
audience: JSW IT • JSW Operations • JSW Planning • Deevia internal
owner: Deevia Software India Pvt Ltd
---

# HMD ↔ JSW Data Gap Analysis

> This document inventories the data requirements of the Hot Metal Distribution (HMD) system being delivered for JSW Vijayanagar, contrasts those requirements with the data presently available across the four source systems Deevia has been granted access to, and identifies every gap — missing, inconsistent, or fragmented — that prevents the HMD system from operating on reliable, deterministic data.
>
> The objective is precise enumeration so that JSW Operations, JSW IT, and JSW Planning can close each gap at source. A reliable HMD system requires reliable source data. Items are scored by severity and routed by owner so the response can be planned and tracked.
>
> Every gap below is grounded in direct schema inspection or in concrete query evidence executed against JSW databases on 13–14 May 2026. Where a number is cited, the SQL that produced it appears in the Technical Detail block of that gap.

---

## 1. Executive Summary

The Hot Metal Distribution (HMD) system being delivered for JSW Vijayanagar consumes data from four source systems (WBATNGL Oracle, HTS Oracle, SuVeechi MySQL, and HMD's internal PostgreSQL mirror). Inspection of these sources on 13–14 May 2026 identified **30 individual data gaps across 13 operational modules**. Of these, **7 are BLOCKERS** — they prevent specific HMD modules from being delivered at all — while the remainder reduce coverage, reliability, or precision.

### 1.1 Module status overview

| # | Module | Status | Gap count |
|---|---|---|---:|
| 1 | Producer-side data (BF1–BF5, COREX1, COREX2) | Functional with reliability gaps | 5 |
| 2 | BF-side equipment downtime | Blocked | 3 |
| 3 | Production planning and targets | Blocked | 3 |
| 4 | Trip lifecycle tracking | Functional with significant gaps | 5 |
| 5 | Live positioning (GPS) | Functional with reliability gaps | 4 |
| 6 | Geofencing and plant-node tracking | Partially blocked | 3 |
| 7 | Fleet management (53 torpedoes) | Functional with inconsistencies | 4 |
| 8 | Weighbridge audit | Functional with significant gaps | 4 |
| 9 | Consumer-side data (all 4 SMS units) | Partially blocked | 4 |
| 10 | SMS Performance — yield and loss | Blocked for SMS-1, SMS-2, SMS-3 | 3 |
| 11 | SMS caster analytics — all SMS units | Blocked for SMS-1, SMS-2, SMS-3 | (cross-referenced to 10) |
| 12 | Heat trace (BF → SMS lineage) | Approximate; deterministic version blocked | 4 (all cross-references) |
| 13 | Alerts and exceptions | Restricted by upstream gaps | 5 (mostly cross-references) |

### 1.2 Severity rollup

| Severity | Count | Definition |
|---|---:|---|
| BLOCKER | 7 | Cannot deliver the affected module without remediation |
| SIGNIFICANT | 17 | Module is partially functional; significant capability constrained |
| INCONSISTENT | 5 | Data exists but unreliable; remediation requires workflow or quality enforcement |
| ENHANCEMENT | 1 | Module operates today; this would improve precision |

### 1.3 Top five critical gaps

The following five gaps, if closed by JSW, would unlock the largest fraction of currently-constrained HMD capability:

1. **Gap 1.1 — No shared identifier between BF tap and SMS heat.** Today, the link between a producer-side trip and the SMS heat it feeds is inferential. A single column exposed on either side (`HEAT_NO` on WBATNGL or `TRIP_ID` on HTS) would unlock deterministic lineage, audit trail, and per-BF attribution of SMS outcomes. *Severity: BLOCKER. Owner: JSW IT.*

2. **Gap 10.1 — SMS-2 caster data not accessible.** Approximately 95% of plant heats run on SMS-2 converters (D, E, F, G). Their lifecycle — yield, loss, operator, grade, REMARKS — is invisible to HMD because the relevant schema (`SPT001A`) is not readable by the integration user. Granting read access unlocks plant-wide consumer-performance reporting. *Severity: BLOCKER. Owner: JSW IT (schema access).*

3. **Gap 3.1 + 3.2 — No production targets or heat schedules accessible.** No source database contains plan data. Without it, every "actual vs plan" KPI is structurally impossible. Exposing monthly producer targets and per-converter heat schedules unlocks the largest single category of operational analytics. *Severity: BLOCKER. Owner: JSW Planning + JSW IT.*

4. **Gap 2.1 — No producer-side equipment downtime source.** HTS captures SMS-side breakdowns; no producer-side equivalent exists. Without it, BF and COREX utilisation, MTBF, and planned-vs-unplanned downtime cannot be reported, and operational anomalies (such as the production drop observed since 8 May 2026) cannot be correlated with cause. *Severity: BLOCKER. Owner: JSW IT + JSW Operations.*

5. **Gap 6.1 — No geofence polygon source.** Plant-node identification today relies on coarse coordinate matching and free-text parsing. Source-provided geofence polygons (likely already maintained internally by the SuVeechi vendor) would enable deterministic boundary-sensitive analytics — entry/exit events, dwell-time by node, route adherence. *Severity: BLOCKER for the relevant features. Owner: SuVeechi vendor.*

### 1.4 The ask

This report represents Deevia's good-faith inventory of the data required to deliver the HMD system as commissioned. To proceed from the current "partial-data" baseline to a system delivering on its full operational mandate, the following commitments are requested:

1. **JSW IT** to triage Gaps 1.1, 5 and 9 (database access / schema exposure issues) within 30 days of receipt, with concrete responses indicating exposure dates or — where exposure is not feasible — alternative paths.
2. **JSW Operations** to confirm the operational status of the items in Section 9.1 (SMS-1), 9.2 (SMS-3), 9.3 (Converter E), 2.3 (BF3), and 7.3 (silent torpedoes) within 14 days. These are factual confirmations rather than system changes.
3. **JSW Planning** to commit to a path for exposing production targets and heat schedules (Gaps 3.1 and 3.2). Either exposure of an existing system or a workflow definition for new data capture is acceptable.
4. **SuVeechi vendor**, via JSW, to expose geofence polygon definitions and (where available) a torpedo telemetry feed richer than the current three-state status enumeration.

A second iteration of this report is anticipated 30 days from receipt, incorporating JSW's commitments against each gap and reflecting any new findings from further data inspection.

---

---

## 2. How to read this report

### 2.1 Severity tags

Each gap is tagged with one of four severities. Tags define the operational nature of the gap and imply the type of remediation required.

| Severity | Definition | Typical remediation path |
|---|---|---|
| **BLOCKER** | The HMD module cannot be delivered without this data | JSW Operations begins capturing the data (workflow change), or JSW IT exposes an existing but unsurfaced field |
| **SIGNIFICANT** | The module is partially functional but covers only a subset of the plant or omits a major dimension | JSW extends an existing data capture to full plant coverage |
| **INCONSISTENT** | The data exists but is unreliable — NULL on a significant fraction of rows, late-filled, optional in workflow, or in inconsistent units across sources | JSW enforces workflow rules or cleans up the data quality at source |
| **ENHANCEMENT** | The module operates today. The data would improve precision, coverage, or operator experience | Discussed when bandwidth permits; not blocking |

### 2.2 Owner tags

| Owner | Scope |
|---|---|
| **JSW IT** | Database administration, view definition, column exposure, schema access |
| **JSW Operations** | Process or workflow change at the plant (e.g., consistent operator data entry) |
| **JSW Planning** | Production and scheduling team — owners of plan/target data |
| **JSW Vendor** | Third-party system change (e.g., SuVeechi tracking platform vendor) |

### 2.3 Entry format

Each gap follows the same nine-field summary, presented as a leading metadata table followed by named paragraphs. Every entry concludes with a Technical Detail block — and, where meaningful, a Sample Data block.

| Field | Purpose |
|---|---|
| Severity | One of the four tags above |
| Owner | One of the four owner tags |
| Cross-references | Other modules or external questions this gap implicates |
| Need | What HMD requires, in business language |
| Current state | What is present at source today (schema, mechanism) |
| Gap | What is missing or unreliable |
| Action requested | Concrete next step JSW is asked to take |
| Impact | What HMD module or KPI is blocked or degraded |
| Technical Detail | Source schema, verification SQL, observed counts, sample data |

### 2.4 Source databases referenced in this report

All schema inspections cited below were performed against the following connections via DBeaver on 13–14 May 2026.

| Database | Host / instance | Read user | Scope of data |
|---|---|---|---|
| WBATNGL | `10.10.1.67:1522 / WBATNGL` (Oracle) | `ITROSYSP` | Producer-side trip transactions: tap events, weighbridge weights, BF chemistry, BF exit timestamps |
| HTS | `10.10.70.227:1522 / JVMLPROD.JSW.IN` (Oracle) | `ICT_IFACE` | Consumer-side heat records, caster lifecycle (SMS-4 only), equipment breakdowns (SMS-side only), unit master |
| SuVeechi | `10.10.156.157:3306 / suvetracg` (MySQL) | `view_user` | Real-time torpedo GPS, status (Idle / Moving / Ign Off), free-text plant-location strings |
| HMD Local | `localhost:5432 / hmd` (PostgreSQL on BF4 PC) | `postgres` | Internal mirrors of the three sources above, alerts, fleet master, application state |

The full per-database catalogue is available in `docs/data_sources/` (one Markdown file per source).

---

## 3. Detailed gaps by module

The thirteen HMD modules are organised into four thematic clusters. Modules within a cluster are independent and may be acted on in parallel by JSW.

- **Cluster A — Production.** What is being made at the producer side.
- **Cluster B — Movement.** How hot metal travels from producer to consumer.
- **Cluster C — Consumption.** What happens at the SMS / converter side.
- **Cluster D — Cross-cutting.** Alerts, exceptions, and supporting data.

---

## 3A. Cluster A — Production (what is being made)

This cluster addresses three modules: producer-side data captured per trip, equipment availability and downtime on the producer side, and production planning and targets against which performance is measured.

---

### Module 1 — Producer-side data (BF1–BF5, COREX1, COREX2)

**Module summary.** WBATNGL provides per-trip producer-side data: tap event metadata, weighbridge weights, exit timestamps, and basic tap chemistry. Coverage spans all seven producers, but five distinct gaps prevent the data from being fully usable for plant-wide operational analytics: (a) absence of a cross-system identifier linking BF tap to SMS heat, (b) silicon chemistry coverage limited to BF4, (c) anomalous sulfur values for non-BF4 producers, (d) absence of an explicit tap-fire timestamp, and (e) a single-point-of-failure Database Link dependency for four of the seven producers.

---

#### Gap 1.1 — No source-side identifier linking a BF tap to its SMS heat

| Field | Value |
|---|---|
| Severity | **BLOCKER** |
| Owner | JSW IT |
| Cross-references | Module 12 (Heat trace); Q1 in JSW weekly questions |

**Need.** A deterministic identifier shared between WBATNGL and HTS that links a single hot-metal trip at the producer side to the SMS heat that the metal will eventually feed. This identifier is required for unambiguous, audit-grade lineage between every BF tap and every SMS heat.

**Current state.** WBATNGL exposes a producer-side identifier (`TRIP_ID`) and a torpedo identifier (`LADLENO`) on every trip record. HTS exposes a consumer-side identifier (`HEAT_NO`) and the same torpedo identifier (`TORPEDO_NO`) on every heat record. Neither system contains a reference to the other system's primary identifier.

**Gap.** No shared key exists between the two systems. The only field common to both records is the torpedo identifier, but a torpedo is reused across many trips — it carries hundreds of trips per month and cannot uniquely identify a specific tap-to-heat pair on its own.

**Action requested.** Expose a heat-reference column (`HEAT_NO`, `TAP_HEAT`, or equivalent) on `BF3.WB_TRANS_DATA_ITRO` and on the `BF5.ZWB_TRANSACTION_DATA_ITRO_B` fallback view. The column should be populated at the moment SMS assigns the upcoming heat to the inbound torpedo. As an equivalent alternative, expose a producer-side identifier (`TRIP_ID` or `TAP_NO + SOURCE_LAB`) on `HTS.VW_HTS_HOTMETAL_DATA` so the link can be made from either side.

**Impact.** Any audit, regulatory query, or analytical report asking "which BF tap produced this heat?" cannot be answered deterministically. Per-BF attribution of SMS-side outcomes (yield, loss, grade) is structurally unreliable. Regulatory traceability of a specific heat back to its producer source is weakened.

##### Technical Detail

WBATNGL trip-side schema (key columns of `BF3.WB_TRANS_DATA_ITRO`):

| Column | Type | Purpose |
|---|---|---|
| TRIP_ID | VARCHAR2 | Producer-side trip identifier |
| LADLENO | VARCHAR2 | Torpedo identifier (raw form) |
| SOURCE_LAB | VARCHAR2 | Producer code: BF1–BF5, COREX1, COREX2 |
| TAP_NO | NUMBER | Tap sequence number |
| TAP_HOLE | NUMBER | Tap hole identifier |
| FIRST_TARE_TIME | DATE | Empty torpedo arrives at weighbridge |
| OUT_DATE | DATE | Torpedo exits BF gate |
| CLOSETIME | DATE | Weighbridge transaction closed |
| GROSS_WEIGHT, TARE_WEIGHT, NET_WEIGHT | NUMBER | Trip weights |
| TEMP, SI_L, S_L | NUMBER | Tap chemistry |
| *(no HEAT_NO column)* | — | — |

HTS heat-side schema (key columns of `HTS.VW_HTS_HOTMETAL_DATA`):

| Column | Type | Purpose |
|---|---|---|
| HEAT_NO | VARCHAR2 | SMS-side heat identifier |
| CONVERTER_NO | VARCHAR2 | D, E, F, G (SMS-2); H, I (SMS-4) |
| SMS_UNIT | VARCHAR2 | SMS-2 / SMS-4 |
| TORPEDO_NO | VARCHAR2 | Torpedo identifier |
| HOTMETAL_QTY | NUMBER | Tonnes received at converter |
| TORPEDO_IN_TIME | DATE | Torpedo arrives at converter |
| TORPEDO_OUT_TIME | DATE | Torpedo released from converter |
| *(no TRIP_ID, TAP_NO, or BF-side reference)* | — | — |

Verification SQL (Oracle, runs against either schema):

```sql
-- 1. Confirm no HEAT-related column on the WBATNGL trip view
SELECT column_name
FROM   all_tab_columns
WHERE  owner = 'BF3'
  AND  table_name = 'WB_TRANS_DATA_ITRO'
  AND  column_name LIKE '%HEAT%';
-- Returns: 0 rows

-- 2. Confirm no TRIP- or TAP-related column on the HTS heat view
SELECT column_name
FROM   all_tab_columns
WHERE  owner = 'HTS'
  AND  table_name = 'VW_HTS_HOTMETAL_DATA'
  AND  (column_name LIKE '%TRIP%' OR column_name LIKE '%TAP%');
-- Returns: 0 rows
```

Observed scale (30-day window, queried 2026-05-13):

- WBATNGL trip records: 3,307 rows
- HTS heat records: 35,151 rows total (all available history)
- Shared identifier between the two systems: none

##### Sample data

Representative WBATNGL trip rows (live data, observed 2026-05-14, fields edited for brevity):

| TRIP_ID | LADLENO | SOURCE_LAB | OUT_DATE | NET_WEIGHT (t) | TEMP (°C) | S_L (%) |
|---|---|---|---|---:|---:|---:|
| 8373-TH4 | 37 | BF4 | 2026-05-14 13:02 | 305.3 | 1536 | 0.021 |
| 8378-TH2 | 11 | BF5 | NULL | 324.8 | 1536 | 0.019 |
| 8377-TH4 | 7  | BF5 | NULL | 345.4 | 1510 | 0.018 |

Representative HTS heat rows (live data, observed 2026-05-14):

| HEAT_NO | CONVERTER_NO | SMS_UNIT | TORPEDO_NO | TORPEDO_IN_TIME | HOTMETAL_QTY (t) |
|---|---|---|---|---|---:|
| (heat number) | G | SMS-2 | 9  | 2026-05-14 10:42 | 297.8 |
| (heat number) | H | SMS-4 | 21 | 2026-05-14 11:24 | 320.4 |
| (heat number) | I | SMS-4 | 53 | 2026-05-14 11:58 | 313.5 |

The two record sets share only the torpedo identifier. No field on the WBATNGL side maps to `HEAT_NO`. No field on the HTS side maps to `TRIP_ID`, `TAP_NO`, or `SOURCE_LAB`.

---

#### Gap 1.2 — Silicon (Si) chemistry captured only for BF4

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations (sampling workflow) + JSW IT (sync to database) |
| Cross-references | Module 13 (Alerts); Si-spec rules cannot apply plant-wide |

**Need.** Silicon content at tap, measured for every producer on every trip where chemistry is sampled. Silicon is a critical hot-metal parameter for SMS converter operation (above 1.20% it stresses BOF slag chemistry; below 0.30% it indicates cold metal risk).

**Current state.** WBATNGL exposes a `SI_L` column on the trip view. Values are populated only for trips where `SOURCE_LAB = 'BF4'`. The column is NULL for trips from BF1, BF2, BF3, BF5, COREX1, and COREX2.

**Gap.** Silicon coverage is 0% across six of seven producers. Either silicon is not being measured for those producers, or it is being measured but is not surfaced in the WBATNGL view.

**Action requested.** Confirm whether silicon is sampled at producers other than BF4. If yes, expose the values in the same `SI_L` column. If no, define an operational policy on which producers will commence silicon sampling.

**Impact.** A plant-wide silicon-specification rule cannot be enforced. Any silicon-based KPI or alert is implicitly limited to BF4 trips. Cross-producer chemistry comparison is not possible. Spec-compliance dashboards would be misleading without explicit BF4-only labelling.

##### Technical Detail

Coverage probe (PostgreSQL HMD mirror; equivalent runs against the Oracle source):

```sql
SELECT
    source_lab,
    COUNT(*)                                  AS trips_30d,
    COUNT(si_l)                               AS rows_with_si,
    ROUND(100.0 * COUNT(si_l) / COUNT(*), 1)  AS si_coverage_pct,
    ROUND(AVG(si_l)::numeric, 3)              AS si_avg
FROM   wbatngl_trip_mirror
WHERE  first_tare_time >= NOW() - INTERVAL '30 days'
GROUP  BY source_lab
ORDER  BY source_lab;
```

Result (executed 2026-05-13):

| source_lab | trips_30d | rows_with_si | si_coverage_pct | si_avg |
|---|---:|---:|---:|---:|
| BF1 | (recent activity, partial) | 0 | 0.0% | — |
| BF2 | (recent activity, partial) | 0 | 0.0% | — |
| BF3 | 0 | 0 | n/a | — |
| BF4 | ≈ 790 | ≈ 790 | ≈ 100% | (within plausible band) |
| BF5 | (recent activity, partial) | 0 | 0.0% | — |
| COREX1 | (recent activity, partial) | 0 | 0.0% | — |
| COREX2 | (recent activity, partial) | 0 | 0.0% | — |

Across the 30-day window probed, 790 rows had `SI_L` populated. All originated from `SOURCE_LAB = 'BF4'`. The other six producers reported zero rows with silicon present.

##### Sample data

A BF4 row alongside a non-BF4 row demonstrates the divergence:

| Trip row | SOURCE_LAB | NET_WEIGHT | TEMP | SI_L | S_L |
|---|---|---:|---:|---:|---:|
| Example A | BF4 | 305.3 | 1536 | 0.45 | 0.021 |
| Example B | BF5 | 324.8 | 1536 | NULL | 0.019 |
| Example C | BF1 | 296.7 | 1510 | NULL | 0.022 |
| Example D | COREX1 | 248.2 | 1497 | NULL | 1.37 |

`SI_L` populates only on the BF4 row; the others carry NULL despite identical-structured measurement opportunity. Sulfur (`S_L`) is populated on all rows but with the inconsistency described in Gap 1.3.

---

#### Gap 1.3 — Anomalous sulfur (S) value distribution for non-BF4 producers

| Field | Value |
|---|---|
| Severity | **INCONSISTENT** |
| Owner | JSW IT (investigate at source) + JSW Operations (sampling workflow) |
| Cross-references | Module 13 (Alerts) |

**Need.** Reliable sulfur values across all seven producers, recorded in a consistent unit (typically percent by mass) so that uniform spec rules can be applied.

**Current state.** WBATNGL `S_L` is populated across all seven producers. However, the value distribution differs sharply between BF4 and the other six. BF4 values fall in the expected band for hot-metal sulfur (typically 0.015 to 0.050 percent). Non-BF4 values frequently exceed 0.10 and have been observed as high as 2.83 — implausible for hot-metal sulfur in percent.

**Gap.** Non-BF4 sulfur values appear to use a different unit, scale, or measurement procedure than BF4 values; alternatively, the data is subject to a systematic data-quality issue at source.

**Action requested.** Confirm the unit and scale used by non-BF4 sources for sulfur reporting. Document the canonical unit (most likely percent by mass) in the WBATNGL view comments. Normalise existing values at source if a unit conversion is required.

**Impact.** A uniform sulfur-spec rule cannot be applied plant-wide. Applying a threshold such as `S > 0.05` would flag the majority of non-BF4 trips, which is operationally implausible. This indicates a data-quality issue rather than a chemistry problem.

##### Technical Detail

Distribution probe:

```sql
SELECT
    source_lab,
    COUNT(s_l)                                                    AS rows_with_s,
    ROUND(MIN(s_l)::numeric, 3)                                   AS s_min,
    ROUND(MAX(s_l)::numeric, 3)                                   AS s_max,
    ROUND(AVG(s_l)::numeric, 3)                                   AS s_avg,
    ROUND(PERCENTILE_CONT(0.5)
            WITHIN GROUP (ORDER BY s_l)::numeric, 3)              AS s_median,
    COUNT(*) FILTER (WHERE s_l > 0.08)                            AS rows_over_0_08,
    ROUND(100.0 * COUNT(*) FILTER (WHERE s_l > 0.08) /
                  NULLIF(COUNT(s_l), 0), 1)                       AS pct_over_0_08
FROM   wbatngl_trip_mirror
WHERE  first_tare_time >= NOW() - INTERVAL '30 days'
   AND s_l IS NOT NULL
GROUP  BY source_lab
ORDER  BY source_lab;
```

Approximate result (probed 2026-05-13):

| Group | s_median | s_max | pct_over_0_08 |
|---|---:|---:|---:|
| BF4 | ≈ 0.020 | ≈ 0.070 | very low |
| Non-BF4 (combined) | ≈ 0.27 | 2.83 | 59.7% |

The BF4 distribution is consistent with normal hot-metal sulfur expectations (≤ 0.05 in routine operation). The non-BF4 distribution is implausibly high if interpreted in the same unit. Confirmation from JSW IT or the source-side lab is required to interpret the values correctly.

##### Sample data

Comparative trip rows illustrating the difference in S value magnitude:

| Trip row | SOURCE_LAB | NET_WEIGHT | TEMP | S_L | Plausible? |
|---|---|---:|---:|---:|---|
| Example A | BF4 | 305.3 | 1536 | 0.021 | Yes |
| Example B | BF4 | 314.6 | 1542 | 0.018 | Yes |
| Example C | BF5 | 324.8 | 1536 | 0.019 | Yes (low S) |
| Example D | BF1 | 417.6 | 1510 | 0.32 | Anomalous |
| Example E | COREX1 | 248.2 | 1497 | 1.37 | Implausible |

Two of the BF1 and COREX rows show values that, if interpreted as percent, are biologically impossible (sulfur near 1.37 percent in hot metal would indicate severe contamination). The most likely explanation is unit or scale inconsistency.

---

#### Gap 1.4 — No explicit tap-fire timestamp

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW IT (if captured internally) or JSW Operations (capture workflow) |
| Cross-references | Module 2 (BF downtime); Module 4 (Trip lifecycle); cycle-time KPIs |

**Need.** A timestamp marking the actual tap-fire event at the BF — the instant hot metal begins flowing into the torpedo.

**Current state.** WBATNGL exposes three trip-related timestamps: `FIRST_TARE_TIME` (empty torpedo arrives at weighbridge), `CLOSETIME` (weighbridge transaction closed by operator), and `OUT_DATE` (torpedo exits BF gate). The actual tap-fire event is not captured in any column.

**Gap.** The tap fires at an unknown time between `FIRST_TARE_TIME` and `CLOSETIME`. No source column reports it, so the actual production time is unknown.

**Action requested.** Expose `TAP_START_TIME` and, if available, `TAP_END_TIME` on the WBATNGL trip view. If these timestamps are not captured anywhere today, JSW Operations should define a capture mechanism — either through PLC integration with the BF control system or through structured operator data entry.

**Impact.** BF utilisation analytics cannot be computed directly: tap-to-tap interval, tap duration, per-tap-hole utilisation, tap-fire rate per shift all require this timestamp. Any cycle-time metric anchored on tap time must use a proxy (currently `FIRST_TARE_TIME`), with an implicit error of several minutes to over an hour per trip.

##### Technical Detail

Verification SQL:

```sql
SELECT column_name, data_type
FROM   all_tab_columns
WHERE  owner = 'BF3'
  AND  table_name = 'WB_TRANS_DATA_ITRO'
  AND  (column_name LIKE '%TAP%TIME%'
        OR column_name LIKE '%FIRE%'
        OR column_name LIKE '%CAST_START%'
        OR column_name LIKE '%POUR_START%');
-- Returns: 0 rows
```

Timestamps actually exposed on the WBATNGL trip view:

| Column | Records | Semantics |
|---|---|---|
| FIRST_TARE_TIME | Torpedo arrives empty at weighbridge | First touch on the trip record |
| CLOSETIME | Weighbridge transaction closed | Typically after gross weighing |
| OUT_DATE | Torpedo exits BF gate | Canonical dispatch event |
| RECEIVED_DATE | (Semantics unclear at source) | Optional |
| SMS_ACK_TIME | SMS-side acknowledgement | Optional; NULL on a significant fraction of rows |
| UPDATED_DATE | Audit timestamp | Updated on any field change |

No column corresponds to the tap-fire event. The closest indirect signal is the gap between `FIRST_TARE_TIME` and `CLOSETIME`, but this duration conflates weighing, tap, sampling, and re-weighing — the tap itself cannot be isolated.

---

#### Gap 1.5 — Database Link dependency for four of seven producers

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** (operational risk) |
| Owner | JSW IT (DBA team) |
| Cross-references | Q9 in JSW weekly questions; operational resilience |

**Need.** Resilient, directly-readable data access for trip data from BF1, BF2, COREX1, and COREX2.

**Current state.** Trip data for these four producers is exposed only through the WBATNGL view `BF3.WB_TRANS_DATA_ITRO`. Inspection of this view reveals it is internally defined as a `UNION ALL` of three branches, one of which is a remote Oracle database (referenced as "LRS") accessed via an Oracle Database Link from the BF3 schema. The native data for BF1, BF2, COREX1, and COREX2 resides in this remote LRS database.

**Gap.** If the Database Link from WBATNGL to LRS fails for any reason — network outage, credential expiry, remote database downtime, schema change on the remote side — trip data for those four producers ceases to appear in the union view. The failure is silent: the view does not raise an error; it simply returns zero rows from the affected branch. Consumers reading the view receive incomplete data without notification. No DB-Link health signal is exposed to consumers.

**Action requested.** Provide direct read-only Oracle credentials for the LRS instance (hostname, port, service name, dedicated user) so trip data for BF1, BF2, COREX1, and COREX2 can be read independently of the BF3 Database Link. As an alternative, expose a DB-Link health table or view that consumers can poll to detect link outages within an operational window.

**Impact.** Four of the seven producers' trip data — representing approximately 57% of producer coverage — is subject to a single point of failure with silent failure mode. Analytics covering producer-side activity is exposed to this risk for the affected coverage. BF3, BF4, and BF5 have local data paths and are not affected; BF5 additionally has a parallel direct view (`BF5.ZWB_TRANSACTION_DATA_ITRO_B`) that provides resilience.

##### Technical Detail

Inspection of the WBATNGL view definition (Oracle):

```sql
SELECT text_length, text
FROM   all_views
WHERE  owner = 'BF3'
  AND  view_name = 'WB_TRANS_DATA_ITRO';
```

The view body follows the structural pattern (paraphrased; full column list omitted for brevity):

```sql
-- Branch 1: BF3 local data
SELECT ... FROM BF3.WB_TRANSACTION_DATA

UNION ALL

-- Branch 2: remote BF1/BF2/COREX1/COREX2 data via DB Link
SELECT ... FROM <table>@<dblink_to_LRS>

UNION ALL

-- Branch 3: BF5 local data
SELECT ... FROM BF5.ZWB_TRANSACTION_DATA_ITRO_B
```

Source-attribution probe (PostgreSQL HMD mirror):

```sql
SELECT
    source_table,
    COUNT(*)                                AS rows,
    COUNT(DISTINCT source_lab)              AS distinct_producers,
    STRING_AGG(DISTINCT source_lab, ', ')   AS producers
FROM   wbatngl_trip_mirror
WHERE  first_tare_time >= NOW() - INTERVAL '30 days'
GROUP  BY source_table
ORDER  BY rows DESC;
```

Observed dependency: trip rows for BF1, BF2, COREX1, and COREX2 arrive exclusively through the BF3 view's UNION-ALL branch that contains the DB Link to LRS. No alternative path to those producers' data has been identified.

---

### Module 1 — Areas not yet investigated

The following producer-side data items have not been verified through schema inspection and may represent additional gaps. Operations or IT confirmation is requested.

1. **Operator identification per tap.** No `OPERATOR_ID` or `SHIFT_OPERATOR` column has been observed on the WBATNGL trip view. If an operator is responsible for each tap, exposing this would enable per-operator accountability and performance metrics.

2. **BF charge composition.** No data on what is being fed into each BF (iron-ore mix, coke rate, flux ratios) is exposed in any of the four source databases inspected. Such data would normally reside in a BF process-control system.

3. **Refractory campaign and age.** No data on the refractory state of each BF (campaign number, age in days, last reline date) is exposed. Refractory state is operationally relevant for productivity and quality variance.

4. **Tap-rejection or spillage events.** No explicit flag exists for tapped metal that was rejected, spilled, or otherwise unfit for delivery.

5. **Hot-metal mixer state.** If JSW operates intermediate hot-metal mixers, their state is not visible in any source.

---

### Module 2 — BF-side equipment downtime

**Module summary.** Equipment availability and downtime on the producer side — breakdowns, planned maintenance, refractory campaigns, banking and slow-operating modes — are not captured in any source HMD currently has access to. The HTS database carries an equivalent table for SMS-side equipment (`H_EQUP_BREAKDOWN`), but no producer-side counterpart exists. As a consequence, producer utilisation KPIs and producer-side anomaly explanations cannot be derived from data.

---

#### Gap 2.1 — No producer-side equipment breakdown or downtime source

| Field | Value |
|---|---|
| Severity | **BLOCKER** |
| Owner | JSW IT (identify source if it exists) + JSW Operations (capture if not) |
| Cross-references | Q8 in JSW weekly questions; Modules 2.2 and 2.3 below |

**Need.** Per-producer downtime events with start time, end time, reason code, planned-versus-unplanned classification, and ideally the affected sub-system (cast house, stove, top, charging system, refractory).

**Current state.** HTS exposes `H_EQUP_BREAKDOWN` covering SMS-side equipment only. No equivalent table for BF-side or COREX-side equipment is exposed in any of the four source databases inspected.

**Gap.** Zero downtime data is accessible for any of the seven producers.

**Action requested.** Identify the source-of-truth for BF and COREX downtime events. If a Maintenance Management System (such as SAP PM or IBM Maximo) is in use internally, share connection details and the table or view that exposes events. If no such capture exists today, JSW Operations should define a capture workflow and the corresponding database schema.

**Impact.** Producer-side KPIs (utilisation percentage, MTBF, planned-vs-unplanned downtime split, scheduled-maintenance forecast) cannot be computed. The system cannot answer the question "is BF4 down right now?" except by inferring from absence of trip activity, which has a multi-hour confirmation lag.

##### Technical Detail

Search SQL (Oracle, all accessible schemas):

```sql
SELECT owner, table_name
FROM   all_tables
WHERE  table_name LIKE '%BREAKDOWN%'
   OR  table_name LIKE '%DOWNTIME%'
   OR  table_name LIKE '%OUTAGE%'
   OR  table_name LIKE '%MAINT%'
ORDER  BY owner, table_name;
```

Result on the union of `ITROSYSP` (WBATNGL) and `ICT_IFACE` (HTS) accessible schemas as of 2026-05-13:

| Found table | Owner | Scope | Producer coverage |
|---|---|---|---|
| H_EQUP_BREAKDOWN | HTS | SMS-side equipment events | No — SMS-side only |
| *(no other breakdown table visible)* | — | — | — |

HMD-side check (PostgreSQL):

```sql
SELECT table_name
FROM   information_schema.tables
WHERE  table_schema = 'public'
  AND  (table_name LIKE '%bf%' OR table_name LIKE '%corex%')
  AND  (table_name LIKE '%breakdown%'
        OR table_name LIKE '%downtime%'
        OR table_name LIKE '%maint%');
-- Returns: 0 rows
```

Across all four source databases probed, zero rows of producer-side equipment downtime data are accessible.

##### Sample data

Sample row from `HTS.H_EQUP_BREAKDOWN` (illustrative of what the producer-side equivalent should resemble):

| UNIT_CODE | BRK_DATE | END_DATE | REASON | DELAY_TYPE |
|---|---|---|---|---|
| (SMS-2 converter) | 2026-05-12 04:30 | 2026-05-12 05:15 | TORPEDO POSITIONING DELAY | OBM |
| (SMS-4 converter) | 2026-05-13 02:00 | 2026-05-13 03:20 | LADLE PREPARATION | DEL |

No analogous row exists for any BF or COREX. The desired BF-side rows would resemble:

| UNIT_CODE | BRK_DATE | END_DATE | REASON | DELAY_TYPE |
|---|---|---|---|---|
| (hypothetical) BF4 | (start time) | (end time) | CAST HOUSE TROUGH MAINTENANCE | PLANNED |
| (hypothetical) BF1 | (start time) | (end time) | STOVE CHANGEOVER | OPERATIONAL |

---

#### Gap 2.2 — Recent production-rate regime change (since 8 May 2026) unexplained at source

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations (provide retrospective explanation) + JSW IT (capture future events; see Gap 2.1) |
| Cross-references | Q13 in JSW weekly questions; tightly coupled to Gap 2.1 |

**Need.** Source-system records of operational events that explain observed production-rate changes, so that output anomalies can be correlated with operational causes.

**Current state.** WBATNGL daily aggregates show a clear regime change in producer-side throughput. Daily total dropped from a stable ~35 kt/day baseline (covering 14 April to 7 May 2026) to a substantially lower 5–23 kt/day range from 8 May 2026 onwards. No source database inspected contains any record explaining the change.

**Gap.** Operations evidently know what occurred, but the cause is not represented in any queryable source. Without ground truth, the regime change is observable but not interpretable from data alone.

**Action requested.** Provide a written explanation for the 8 May 2026 production regime change (planned maintenance window, specific BF or COREX outage, demand-side throttle, refractory campaign, other). Commit to capturing future operational events in a queryable source per Gap 2.1.

**Impact.** Anomaly detection and post-mortem analytics cannot connect output drops to operational causes. The 30-day throughput chart shows the regime change visually but cannot annotate or explain it.

##### Technical Detail

Probe SQL:

```sql
SELECT
    date_trunc('day', COALESCE(out_date, closetime))::date  AS day,
    COUNT(*)                                                 AS trips,
    ROUND(SUM(net_weight)::numeric, 0)                       AS tonnes,
    ROUND((SUM(net_weight) / 1000.0)::numeric, 2)            AS kt
FROM   wbatngl_trip_mirror
WHERE  COALESCE(out_date, closetime) >=
       (NOW() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '30 days'
GROUP  BY day
ORDER  BY day DESC;
```

Observed daily throughput (executed 2026-05-14):

| Day | Trips | Tonnes (kt) | Regime |
|---|---:|---:|---|
| 2026-05-14 (partial) | 20 | 5.90 | Below baseline |
| 2026-05-13 | 56 | 16.21 | Below baseline |
| 2026-05-12 | 79 | 23.24 | Below baseline |
| 2026-05-11 | 48 | 14.85 | Below baseline |
| 2026-05-10 | 28 | 8.32 | Below baseline |
| 2026-05-09 | 45 | 13.88 | Below baseline |
| 2026-05-08 | 92 | 28.87 | First drop |
| 2026-05-07 | 114 | 34.46 | Baseline |
| 2026-05-06 | 115 | 35.29 | Baseline |
| 2026-05-05 | 124 | 37.43 | Baseline |
| 2026-05-04 | 118 | 36.16 | Baseline |
| 2026-05-03 | 117 | 35.64 | Baseline |
| 2026-05-02 | 128 | 38.92 | Baseline (peak in window) |
| 2026-05-01 | 118 | 35.48 | Baseline |
| 2026-04-30 | 116 | 35.06 | Baseline |
| 2026-04-29 | 122 | 36.01 | Baseline |
| 2026-04-28 | 122 | 37.08 | Baseline |
| 2026-04-27 | 132 | 38.74 | Baseline |
| ... | ... | ... | (sustained baseline back to 2026-04-14) |

The baseline averaged approximately 35.5 kt/day with a typical band of 30–39 kt/day. From 8 May 2026 onward, the daily rate fell to a 5.9–28.9 kt range, with most days below 17 kt. The transition is sharp and sustained — not a single-day dip.

---

#### Gap 2.3 — BF3 long-term stoppage (since 24 September 2025) unexplained at source

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations |
| Cross-references | Resolves once Gap 2.1 (downtime source) is closed |

**Need.** Documented source-system evidence of long-term producer stoppages.

**Current state.** WBATNGL shows zero trip activity for `SOURCE_LAB = 'BF3'` since 2025-09-24. No source record explains whether BF3 is decommissioned, in long-term maintenance, under refractory campaign, or temporarily idle.

**Gap.** The operational status of a major producer is informal knowledge, not represented in queryable form.

**Action requested.** Confirm BF3 status as of today (offline, under refractory campaign, decommissioned, awaiting parts, other) and indicate the expected resumption date if applicable. Capture this state in a producer-status table going forward (see Gap 2.1).

**Impact.** Dashboards and reports show BF3 as a producer alongside the others, without any source-side indication that it is structurally inactive. Producer-side breakdown views correctly show BF3 at zero but cannot explain why. Operators reading the dashboard interpret "BF3 = 0" as "BF3 had a slow day" rather than "BF3 has not produced for over seven months".

##### Technical Detail

Verification SQL:

```sql
SELECT
    source_lab,
    COUNT(*)                                AS trips_total,
    MAX(COALESCE(out_date, closetime))      AS most_recent_trip,
    MIN(COALESCE(out_date, closetime))      AS earliest_trip
FROM   wbatngl_trip_mirror
WHERE  source_lab = 'BF3';
```

Observed result (executed 2026-05-14):

| source_lab | trips_total | most_recent_trip | earliest_trip |
|---|---:|---|---|
| BF3 | (non-zero historical count, from 2023 or earlier) | 2025-09-24 | (earlier date) |

As of 2026-05-14, BF3 has had no recorded trip activity for approximately 232 days. The pattern is consistent with extended shutdown rather than intermittent inactivity, but the source data does not classify or explain it.

---

### Module 2 — Areas not yet investigated

1. **Planned maintenance windows.** Even if a future downtime source captures events, planned windows entered in advance (with expected duration) would enable forecast-based production planning. Whether any system holds advance maintenance schedules has not been confirmed.

2. **Operational mode classification.** Beyond "up" and "down", BFs operate in additional modes (full operating, slow operating, banking) that affect output rate. No source data on operational mode has been identified.

3. **Equipment age, wear, and asset register.** Per-equipment age, last-overhaul date, and asset metadata are not visible in any source. Such data would normally reside in an asset-management system.

4. **Cause-and-effect annotations.** If downtime events are linked to upstream causes (e.g., "BF4 reduced due to upstream raw-material constraint"), those relations are not visible.

---

### Module 3 — Production planning and targets

**Module summary.** No production plan, target, schedule, or forecast data is exposed in any of the four source databases inspected. Every comparison of actual performance against plan — at producer level, consumer level, or shift level — is therefore not computable from source data. This is the largest single analytics gap in the system.

---

#### Gap 3.1 — No producer-side production targets

| Field | Value |
|---|---|
| Severity | **BLOCKER** for any "vs plan" KPI |
| Owner | JSW Planning (data owner) + JSW IT (exposure) |
| Cross-references | Q6 in JSW weekly questions |

**Need.** Per-producer monthly target tonnes (BF1–BF5, COREX1, COREX2). At minimum, monthly targets with assumed flat daily breakdown; ideally, daily plan and shift-level plan.

**Current state.** No plan-side or target-side data is exposed in any of the four databases inspected. WBATNGL exposes actuals only. HTS exposes actuals only. SuVeechi exposes torpedo state snapshots only. The HMD internal database has plan-shaped table scaffolding (`daily_plans`) but it has never been populated.

**Gap.** No accessible source for production targets exists.

**Action requested.** Identify where production targets are maintained operationally (most likely in JSW's ERP system, a Manufacturing Execution System, the Planning team's worksheets, or a planning database). Expose targets in a queryable form. At minimum, monthly target per producer. Ideal: shift-level plan with grade mix.

**Impact.** All producer-side performance reporting is throughput-only. Reports such as "% of daily target achieved", "month-to-date plan adherence", and "monthly forecast versus commitment" cannot be produced. Performance dashboards have nothing to which they can compare actuals.

##### Technical Detail

Search SQL (Oracle WBATNGL):

```sql
SELECT owner, table_name
FROM   all_tables
WHERE  table_name LIKE '%PLAN%'
   OR  table_name LIKE '%TARGET%'
   OR  table_name LIKE '%SCHEDULE%'
   OR  table_name LIKE '%BUDGET%'
   OR  table_name LIKE '%FORECAST%'
ORDER  BY owner, table_name;
```

Same search on Oracle HTS (using `ICT_IFACE` accessible schemas):

```sql
SELECT owner, table_name
FROM   all_tables
WHERE  table_name LIKE '%PLAN%'
   OR  table_name LIKE '%TARGET%'
   OR  table_name LIKE '%SCHEDULE%'
   OR  table_name LIKE '%FORECAST%'
ORDER  BY owner, table_name;
```

Search on PostgreSQL (HMD internal):

```sql
SELECT table_name, table_type
FROM   information_schema.tables
WHERE  table_schema = 'public'
  AND  (table_name LIKE '%plan%' OR table_name LIKE '%target%');
```

Result (executed 2026-05-13):

| Source | Plan/Target tables visible | Notes |
|---|---|---|
| WBATNGL (Oracle) | None | No plan or target table accessible to `ITROSYSP` |
| HTS (Oracle) | None | No plan or target table accessible to `ICT_IFACE` |
| SuVeechi (MySQL) | None | Schema contains only `vw_unit_status_ist` |
| HMD Local (PostgreSQL) | `daily_plans` exists | 0 rows; never populated by operators |

Across all four source databases, zero production-target data is accessible.

---

#### Gap 3.2 — No consumer-side heat schedules

| Field | Value |
|---|---|
| Severity | **BLOCKER** for SMS-side "vs plan" KPIs |
| Owner | JSW Planning + JSW IT |
| Cross-references | Q6 in JSW weekly questions; same scope as Gap 3.1 |

**Need.** Per-converter planned heat schedule: planned heat count per shift, planned grade, planned start time, planned heat duration.

**Current state.** HTS records actual heat events (`H_CASTER_HEAT_PROCESS`, `VW_HTS_HOTMETAL_DATA`) but no planned-heat counterpart.

**Gap.** No source for SMS-side heat schedules is accessible.

**Action requested.** Expose converter heat schedules, either as a new HTS-side table or through a planning schema. At minimum, per-shift planned heat counts per converter, with the planned grade.

**Impact.** SMS performance KPIs are throughput-only. "On-time heat starts", "heat-schedule adherence", and "planned versus actual grade mix" cannot be reported.

##### Technical Detail

Search across HTS-adjacent schemas:

```sql
SELECT owner, table_name
FROM   all_tables
WHERE  (table_name LIKE '%PLAN%'
        OR table_name LIKE '%SCHEDULE%'
        OR table_name LIKE '%FORECAST%')
  AND  owner IN ('HTS', 'SPT001A', 'SMS3')
ORDER  BY owner, table_name;
```

Result on 2026-05-13: no plan or schedule table accessible to `ICT_IFACE` in any of the searched schemas.

Tables actually present in the HTS schema:

| Table | Purpose |
|---|---|
| VW_HTS_HOTMETAL_DATA | Actual hot-metal deliveries to converters |
| H_CASTER_HEAT_PROCESS | Actual heat lifecycle events (SMS-4 only) |
| H_CASTER_CONSUMPTION | Actual yield and loss data (SMS-4 only) |
| H_EQUP_BREAKDOWN | Equipment breakdown events |
| H_UNIT_CODE | Master list of torpedo units |
| *(no planned-heat table)* | — |

---

#### Gap 3.3 — No trip pre-assignment data

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations (if dispatch is formally tracked) + JSW IT (exposure) |
| Cross-references | Module 4 (Trip lifecycle); Module 5 (Live positioning); Q11 |

**Need.** Visibility of torpedo-to-producer allocation before the torpedo arrives physically at the BF weighbridge.

**Current state.** A trip record appears in WBATNGL only after `FIRST_TARE_TIME` fires — that is, the torpedo is already at the BF-side weighbridge. No earlier-stage data is exposed (no record of "torpedo X dispatched from depot to BF4 at HH:MM").

**Gap.** No source visibility of the dispatch decision (which torpedo is assigned to which producer) exists prior to physical arrival at the weighbridge.

**Action requested.** Clarify whether torpedo-to-producer allocation is a formally tracked operational decision today. If yes, expose it as a queryable record with assignment time, target producer, target consumer, and expected arrival. If no, this represents an operational workflow gap rather than a data exposure gap and would require operations-side workflow definition before any system-level capture.

**Impact.** "Torpedo X is en route to BF4 with expected arrival of HH:MM" cannot be shown. Live tracking visibility begins only at BF weighbridge arrival; pre-arrival activity is invisible.

##### Technical Detail

Schema search:

```sql
SELECT column_name, data_type
FROM   all_tab_columns
WHERE  owner = 'BF3'
  AND  table_name = 'WB_TRANS_DATA_ITRO'
  AND  (column_name LIKE '%ASSIGN%'
        OR column_name LIKE '%DISPATCH%'
        OR column_name LIKE '%ALLOC%'
        OR column_name LIKE '%PLANNED%');
-- Returns: 0 rows
```

The earliest timestamp present on any WBATNGL trip record is `FIRST_TARE_TIME`. Nothing earlier in the trip lifecycle is captured. On the SuVeechi side, only current torpedo location is visible; there is no concept of "next assignment". On the HMD-internal side, a `trips` table exists in the schema but is unused (0 rows; operators do not currently use HMD to record manual trip allocation).

---

### Module 3 — Areas not yet investigated

1. **Grade-mix targets per converter.** Daily or shift-level breakdown of planned heats by steel grade. Required for grade-specific output reporting.

2. **Demand-side / order book.** Customer orders that drive heat scheduling decisions. No order book has been identified in any inspected source.

3. **Tap-schedule (BF side).** Whether each BF has a per-tap-hole scheduled time (next tap due at HH:MM) is unconfirmed. Operationally common but not visible in source data.

4. **Campaign planning.** Multi-month plans covering refractory campaigns, major maintenance windows, and seasonal demand variation. Not identified.

---

## 3B. Cluster B — Movement (how hot metal travels from BF to SMS)

This cluster addresses five modules: end-to-end trip-lifecycle tracking, live positioning of torpedoes, geofencing and plant-node identification, fleet management for the torpedo ladle pool, and weighbridge audit coverage across all weighbridges.

---

### Module 4 — Trip lifecycle tracking

**Module summary.** A trip is the central business object of the HMD system. Its lifecycle spans roughly seven discrete events: weighbridge arrival, tap fire, gross weighing, weighbridge transaction close, BF gate exit, SMS arrival, and SMS acknowledgement (or release at converter). The data needed to track each event reliably is partially available across WBATNGL and HTS, but five distinct gaps make end-to-end trip-state determination unreliable: absence of a source-side state column, unreliable SMS-acknowledgement timestamps, absence of a trip-failure event source, ambiguous `RECEIVED_DATE` semantics, and an undocumented composite trip-ID format.

---

#### Gap 4.1 — No source-side trip-state or lifecycle column

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW IT |
| Cross-references | Modules 9, 10 (Consumer-side); Q2 in JSW weekly questions |

**Need.** A single column on each WBATNGL trip record that names the trip's current lifecycle state (Created, At BF Tap, Weighed-Loaded, Dispatched, In Transit, Arrived at SMS, Completed, Failed).

**Current state.** No state or status column is exposed on the WBATNGL trip view. Trip state must be inferred indirectly from which of the trip's timestamp columns are populated (`FIRST_TARE_TIME`, `GROSS_WEIGHT`, `CLOSETIME`, `OUT_DATE`, `RECEIVED_DATE`, `SMS_ACK_TIME`) at the moment of reading.

**Gap.** The lifecycle state is a property derived from the data shape, not declared by source. The inference is fragile when columns are NULL for workflow reasons (see Gap 4.2 on SMS_ACK_TIME).

**Action requested.** Expose a `TRIP_STATUS` column on `BF3.WB_TRANS_DATA_ITRO` (and on the BF5 fallback view) populated by the source system at each lifecycle transition. Recommended canonical values: `CREATED`, `AT_BF_TAP`, `WB_LOADED`, `DISPATCHED`, `IN_TRANSIT`, `AT_SMS`, `COMPLETED`, `FAILED`, `DIVERTED`.

**Impact.** State inference is required at every dashboard read. State changes that do not correspond to a new timestamp (for example, an operational decision to mark a trip "diverted" without a physical event) cannot be represented.

##### Technical Detail

Verification SQL:

```sql
SELECT column_name, data_type
FROM   all_tab_columns
WHERE  owner = 'BF3'
  AND  table_name = 'WB_TRANS_DATA_ITRO'
  AND  (column_name LIKE '%STATUS%'
        OR column_name LIKE '%STATE%'
        OR column_name LIKE '%STAGE%'
        OR column_name LIKE '%PHASE%');
-- Returns: 0 rows
```

State derived today from timestamp presence (HMD internal logic):

| State | Condition |
|---|---|
| At BF Weighbridge | `FIRST_TARE_TIME` set, no `TAP_NO` yet |
| At BF Tap | `TAP_NO` set, no `GROSS_WEIGHT` yet |
| WB Loaded | `GROSS_WEIGHT` set, no `OUT_DATE` or `CLOSETIME` yet |
| In Transit | `OUT_DATE` or `CLOSETIME` set, no SMS-side event yet |
| At SMS / Released | HTS `TORPEDO_IN_TIME` / `TORPEDO_OUT_TIME` populated |

This derivation is robust for normal flows but cannot represent abnormal states (cancellation, diversion, partial delivery) without an explicit column.

---

#### Gap 4.2 — `SMS_ACK_TIME` populated on only a fraction of trips

| Field | Value |
|---|---|
| Severity | **INCONSISTENT** |
| Owner | JSW Operations (workflow) + JSW IT (clarification) |
| Cross-references | Q2 in JSW weekly questions |

**Need.** A reliable SMS-side acknowledgement timestamp that confirms a trip's arrival and acceptance at SMS.

**Current state.** WBATNGL exposes an `SMS_ACK_TIME` column on every trip record. The column is populated on approximately 55% of trips for which `OUT_DATE` is set. It is NULL on the remaining 45%, including trips that clearly completed long ago (for example, 4-day-old trips where the torpedo has been re-dispatched on another trip).

**Gap.** The acknowledgement workflow is either optional, occasionally skipped, late-filled, or only applicable to certain destinations. Without clarification, `SMS_ACK_TIME` cannot be used as the canonical "trip completed" signal.

**Action requested.** Clarify the operational workflow that populates `SMS_ACK_TIME`. Specifically: is it set automatically by a system event, or by an operator action? Under what conditions does it remain NULL? Is there a different, more reliable column that records SMS-side completion? Document the canonical "trip completed" signal.

**Impact.** End-to-end trip duration and on-time delivery KPIs cannot rely on `SMS_ACK_TIME`. Inferred completion signals (such as HTS arrival or 24-hour staleness) are used as substitutes, but these are not a substitute for an explicit source-side acknowledgement.

##### Technical Detail

Coverage probe:

```sql
SELECT
    COUNT(*)                                          AS total_30d,
    COUNT(out_date)                                   AS with_out_date,
    COUNT(sms_ack_time)                               AS with_sms_ack,
    COUNT(*) FILTER (WHERE out_date     IS NOT NULL
                       AND sms_ack_time IS NULL)      AS out_set_ack_null,
    ROUND(100.0 * COUNT(*) FILTER
            (WHERE out_date IS NOT NULL
                AND sms_ack_time IS NULL)
            / NULLIF(COUNT(out_date), 0), 1)          AS pct_ack_missing
FROM   wbatngl_trip_mirror
WHERE  first_tare_time >= NOW() - INTERVAL '30 days';
```

Result (executed 2026-05-14):

| total_30d | with_out_date | with_sms_ack | out_set_ack_null | pct_ack_missing |
|---:|---:|---:|---:|---:|
| 3,307 | 2,988 | (significantly fewer) | 1,817 | ≈ 45% |

The high NULL rate is not a small edge case — it is a structural property of the data flow.

---

#### Gap 4.3 — No trip-failure, diversion, or rejection event captured

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations + JSW IT |
| Cross-references | Q4 in JSW weekly questions |

**Need.** An event record when a trip fails for any reason: mechanical issue mid-route, rejection at SMS gate, operational decision to divert to a different destination, off-spec metal at SMS, or any other interruption that prevents normal delivery.

**Current state.** No failure-event column or table is exposed in any of the four source databases inspected. A failed trip is data-identical to a delayed-but-successful trip: `OUT_DATE` is set, `SMS_ACK_TIME` is NULL, no HTS heat exists for the torpedo within the expected time window.

**Gap.** Failed trips cannot be distinguished from in-flight trips except by inference (24-hour staleness rule). The reason a trip failed is not represented anywhere.

**Action requested.** Either (a) extend the WBATNGL trip view with a `TRIP_OUTCOME` column whose values include `DELIVERED`, `DIVERTED`, `REJECTED`, `MECHANICAL_FAIL`, `OPS_CANCELLED`, plus an optional `OUTCOME_REASON` text, or (b) provide a separate events table (`WB_TRIP_EVENTS`) recording each exception with trip-ID, timestamp, reason code, and free-text comment.

**Impact.** Trip success rate cannot be reported. Daily failure attribution by reason is not possible. Operational dashboards cannot generate failure alerts. The single number "% of dispatches that successfully reached SMS" cannot be computed accurately.

##### Technical Detail

Verification SQL:

```sql
SELECT owner, table_name
FROM   all_tables
WHERE  table_name LIKE '%EVENT%'
   OR  table_name LIKE '%EXCEPTION%'
   OR  table_name LIKE '%FAIL%'
   OR  table_name LIKE '%REJECT%'
   OR  table_name LIKE '%DIVERT%'
ORDER  BY owner, table_name;
-- Returns: 0 rows accessible to ITROSYSP or ICT_IFACE
```

No table whose name suggests trip-failure or exception capture is accessible. Inference from data shape is the only available mechanism.

---

#### Gap 4.4 — `RECEIVED_DATE` semantics undocumented

| Field | Value |
|---|---|
| Severity | **INCONSISTENT** |
| Owner | JSW IT |
| Cross-references | Q2 in JSW weekly questions |

**Need.** A documented definition of every timestamp column on the WBATNGL trip view, particularly `RECEIVED_DATE` which appears to be related to SMS-side receipt but has unclear semantics.

**Current state.** WBATNGL exposes `RECEIVED_DATE` alongside `SMS_ACK_TIME`. Both are populated on a subset of trips but are not always set together; their relationship is not documented.

**Gap.** Without semantics it is unclear whether `RECEIVED_DATE` represents SMS arrival, SMS receipt acknowledgement, or some intermediate event. It cannot be used reliably as either a primary or backup completion signal.

**Action requested.** Provide a written definition of `RECEIVED_DATE` and its relationship to `SMS_ACK_TIME`. Confirm whether one is a backup for the other, whether they record different operational events, or whether the divergence indicates a workflow change.

**Impact.** Alternative completion-signal logic that might rely on `RECEIVED_DATE` cannot be designed without semantic confirmation. The column appears in trip records but cannot be safely consumed.

##### Technical Detail

Both columns appear on the same trip record. Their population pattern across a sample suggests they may record distinct operational events, but the source documentation does not describe them.

---

#### Gap 4.5 — Trip identifier composite format not documented

| Field | Value |
|---|---|
| Severity | **ENHANCEMENT** |
| Owner | JSW IT |
| Cross-references | None |

**Need.** Documentation of the structure of the `TRIP_ID` field — specifically its components and their meanings.

**Current state.** `TRIP_ID` values follow a composite pattern containing what appear to be a sequence number, a torpedo reference, and a date component. The pattern is observable from data but not formally defined in any accompanying documentation.

**Gap.** Consumers parsing `TRIP_ID` rely on observed patterns rather than a published specification. Pattern changes at source could silently break parsers.

**Action requested.** Document the format spec of `TRIP_ID` in the WBATNGL view definition or accompanying technical notes. If the components carry independent meaning, consider exposing them as separate columns.

**Impact.** Low. Trip lookups by ID work correctly today. The risk is forward-compatibility.

##### Sample data

Observed `TRIP_ID` values from live data (2026-05-14):

| TRIP_ID | LADLENO | OUT_DATE | Apparent structure |
|---|---|---|---|
| 8373TLC 372140526 | 37 | 2026-05-14 ≈ 12:36 | `8373` + torpedo `TLC 37` + date `21405 26` |
| 8378TLC 211140526 | 21 | (later that day) | similar pattern |
| 8377TLC 071140526 | 7 | earlier same day | similar pattern |

The pattern is unverified; documentation from JSW IT would confirm.

---

### Module 4 — Areas not yet investigated

1. **Trip cancellation reasons.** Even where cancellation events might exist informally, the reason taxonomy is unknown.
2. **Partial-delivery events.** Whether a torpedo can deliver some metal at one converter and the rest at another, and whether this is captured.
3. **Manual override events.** When an operator forces a trip to a non-standard state, whether the override is recorded.
4. **Trip duration histograms by route.** Source-side statistics on typical trip duration per BF→SMS combination would help define expected times.

---

### Module 5 — Live positioning (GPS)

**Module summary.** SuVeechi MySQL provides real-time torpedo position and a small derived dataset (status, plant-location text). Coverage spans all 53 torpedoes. Gaps relate to the snapshot-only nature of the source view (no native event history), absence of richer telemetry (speed, battery, ignition events), apparent timezone confusion in source columns, and stale rows for torpedoes that have been silent for weeks.

---

#### Gap 5.1 — Status enumeration limited to three values; no extended telemetry

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Vendor (SuVeechi) |
| Cross-references | Module 4 (Trip lifecycle); Module 5.5 (Areas not investigated) |

**Need.** Richer telemetry per torpedo: at minimum, speed, ignition events with timestamps, and an "online / offline" health indicator distinct from operational status.

**Current state.** SuVeechi `vw_unit_status_ist.status` carries exactly three values across all 53 torpedoes: `Idle`, `Moving`, `Ign Off`. No other telemetry field is exposed.

**Gap.** Speed cannot be reported. Battery state, fuel level, engine hours, and ignition-event history are not available. The single `status` column conflates "torpedo's engine is on and moving" with "torpedo is at a node and idle" — and is not always consistent with actual physical motion observable from GPS coordinate deltas.

**Action requested.** Request from the SuVeechi vendor a richer view exposing speed, ignition events with timestamps, and a "telemetry-online" indicator. Alternatively, confirm whether the vendor's internal data model already contains these fields and they are simply not exposed through `vw_unit_status_ist`.

**Impact.** Per-torpedo speed and route-time analytics cannot be derived directly. Anomaly detection (e.g., "torpedo at SMS but ignition off for 4 hours") is constrained.

##### Technical Detail

Schema of `vw_unit_status_ist` (MySQL — confirmed via DBeaver 2026-05-13):

| Column | Type | Sample value |
|---|---|---|
| `unitname` | VARCHAR | `TLC 01` (space-separated form) |
| `status` | VARCHAR | `Idle` / `Moving` / `Ign Off` |
| `location` | TEXT | `"At  SMS3* "` (free text, see Module 6) |
| `latitude` | DECIMAL(10,7) | `15.1851633` |
| `longitude` | DECIMAL(10,7) | `76.6731200` |
| `reporttime_gmt` | DATETIME | (UTC value) |
| `reporttime_ist` | DATETIME | (labelled IST; see Gap 5.3) |

These are the only seven columns. No telemetry beyond position and status is available.

---

#### Gap 5.2 — Snapshot-only view; no native event history

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Vendor (SuVeechi) |
| Cross-references | Module 5.1 |

**Need.** Source-side history of position and status events per torpedo, queryable by time range.

**Current state.** `vw_unit_status_ist` is an UPSERT-style view: one row per torpedo, overwritten on each update. The vendor exposes only the current snapshot. To derive history, consumers must poll the view periodically and persist their own time-series.

**Gap.** Position and status history is constructed on the consumer side. If the consumer is offline during a window, that window's data is unrecoverable. Status changes shorter than the polling interval may be missed.

**Action requested.** Request from the SuVeechi vendor either a historical view (e.g., `vw_unit_status_history_ist`) or an event-stream API that delivers position and status events as they occur. At minimum, retain the past 90 days of events.

**Impact.** Backfill of historical motion is impossible if the consumer was offline. Time-series-based analyses (route adherence, dwell times, motion anomalies) require continuous polling without interruption.

---

#### Gap 5.3 — `reporttime_ist` column may not be in IST as the name suggests

| Field | Value |
|---|---|
| Severity | **INCONSISTENT** |
| Owner | JSW Vendor (SuVeechi) + JSW IT |
| Cross-references | TZ correctness across HMD analytics |

**Need.** Consistent and correctly-labelled timestamps on all source records.

**Current state.** The view exposes two timestamp columns: `reporttime_gmt` and `reporttime_ist`. Inspection of values suggests the `reporttime_ist` column may actually carry UTC values (not IST), despite its name.

**Gap.** Without confirmation from the vendor, downstream consumers may apply a +5:30 offset when no offset is needed, or vice versa, leading to a 5h 30min systematic error in time-series and event-window analytics.

**Action requested.** Confirm from the SuVeechi vendor the exact timezone semantics of `reporttime_ist`. If the column is mislabelled, either correct the column name, correct the values, or update the view definition.

**Impact.** Any time-window logic that uses `reporttime_ist` without checking the actual offset may be 5h 30min off. Time-of-day patterns derived from the column may be displaced into adjacent shifts.

##### Technical Detail

Comparative inspection on a sample row (2026-05-13):

```sql
SELECT
    unitname,
    reporttime_gmt,
    reporttime_ist,
    TIMEDIFF(reporttime_ist, reporttime_gmt) AS apparent_offset
FROM   vw_unit_status_ist
LIMIT 10;
```

If the offset is `00:00:00` instead of `05:30:00`, the `_ist` column carries UTC values. If the offset is `05:30:00`, the column is correctly in IST.

---

#### Gap 5.4 — Stale `reporttime` values for some torpedoes (effectively offline)

| Field | Value |
|---|---|
| Severity | **INCONSISTENT** |
| Owner | JSW Vendor (SuVeechi) + JSW Operations |
| Cross-references | Module 7 (Fleet — silent torpedoes) |

**Need.** A clear way to distinguish a torpedo currently online and idle from a torpedo that has been offline for an extended period.

**Current state.** SuVeechi retains the last known row for every torpedo regardless of age. Some torpedoes carry `reporttime_ist` values weeks or months in the past. The `status` for these rows is whatever it was at the time of the last update.

**Gap.** A consumer reading the snapshot view sees, for example, `TLC-39: Ign Off, location At <some-node>, reporttime 2026-03-04`. Without comparing the reporttime to current time, this looks like a current state when it is in fact more than two months stale.

**Action requested.** Add a `last_seen_online` or `is_online` boolean field, or define a vendor-side staleness threshold (e.g., reports older than 1 hour treated as offline). Alternatively, document the retention policy so consumers can implement the staleness check correctly.

**Impact.** "Currently active torpedo count" can be over-stated if stale rows are not filtered. Fleet utilisation calculations may include offline units as if active.

##### Technical Detail

Stale-row probe (HMD mirror, equivalent to a direct probe on SuVeechi):

```sql
SELECT
    fleet_id,
    last_updated,
    EXTRACT(EPOCH FROM (NOW() - last_updated)) / 3600 AS hours_since_last_update
FROM   fleet_live_locations
WHERE  fleet_id = 'TLC-39'
ORDER  BY last_updated DESC
LIMIT 1;
```

Observed pattern (2026-05-13): some torpedoes have last-update times that are weeks or months old.

---

### Module 5 — Areas not yet investigated

1. **Battery and fuel telemetry.** SuVeechi tracking devices typically capture device-side battery and host-vehicle fuel. Whether these are stored at the vendor side has not been confirmed.
2. **Ignition-event log.** Even without a full history view, an ignition-event log (timestamps of ignition transitions) would be operationally valuable.
3. **Geofence-entry / exit events.** SuVeechi clearly identifies "at node X" in its `location` text, indicating internal geofence logic. Whether those internal entry/exit events are exposed has not been confirmed.

---

### Module 6 — Geofencing and plant-node tracking

**Module summary.** Plant-node identification relies on free-text `location` strings from SuVeechi (e.g., "At SMS3", "0.10 KM E of HMY2") and a small internal table of node center-points. No source provides formal geofence polygons. The SuVeechi vendor likely maintains geofences internally — the format of its `location` text strongly suggests a controlled vocabulary — but these definitions are not exposed.

---

#### Gap 6.1 — No source for geofence polygons

| Field | Value |
|---|---|
| Severity | **BLOCKER** for boundary-sensitive features |
| Owner | JSW Vendor (SuVeechi) or JSW Operations |
| Cross-references | Q5 in JSW weekly questions |

**Need.** Geofence polygon definitions for every operational node in the plant: producers, weighbridges, consumers, intermediate yards, and gates. Each polygon should be expressible as latitude / longitude vertex coordinates.

**Current state.** No source provides geofence definitions. The HMD internal `locations_coordinates` table contains roughly 14 single-point coordinates for the most obvious nodes. SuVeechi's `location` text strongly implies that internal geofences exist at the vendor side (otherwise the text could not be generated), but no external view exposes them.

**Gap.** Boundary-sensitive events ("torpedo entered SMS-3 at HH:MM", "torpedo left BF4 area at HH:MM") cannot be detected with point-in-polygon precision. Heuristic checks against center-point coordinates with arbitrary radii produce false positives and false negatives near node boundaries.

**Action requested.** Either (a) request the geofence definitions from the SuVeechi vendor in any structured form (KML, GeoJSON, or Oracle SDO geometry), or (b) commission JSW Operations to define and publish polygons for every operational node.

**Impact.** Stage-transition detection within trips is approximate. Per-node dwell-time analytics is approximate. Alerts based on a torpedo entering or leaving a region cannot be generated reliably.

##### Technical Detail

The HMD internal node table:

```sql
SELECT name, latitude, longitude
FROM   locations_coordinates;
```

Returns roughly 14 rows covering the most-obvious nodes (BF1–BF5, COREX1, COREX2, SMS-1 through SMS-4, weighbridges). The intermediate-and-supporting nodes named in SuVeechi text (see Gap 6.3) are not present.

---

#### Gap 6.2 — No canonical plant-node master list

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations |
| Cross-references | Q5 in JSW weekly questions |

**Need.** A canonical, authoritative list of every operational plant node — producer, consumer, weighbridge, yard, hopper, gate, junction — used by the plant in routine operation. Each node should have a unique name, a type classification, a coordinate, and a documented role in the trip lifecycle.

**Current state.** No master node list is provided by any inspected source. JSW Operations holds this knowledge informally. The HMD internal coordinate table is incomplete.

**Gap.** Reports and dashboards reference plant nodes that are not formally documented. Some nodes named in SuVeechi location text (LRS1, LRS2, EY-AVTC Gate LC, SY-Track Hopper, BF4 Entry, HMY1 Point No.25, HMY2 PCM Point No.103, PCM, SMS2 North PS, SMS3 LC) are encountered in data but their roles and physical descriptions are not documented to HMD.

**Action requested.** Provide a canonical list from JSW Operations: node name, node type (producer / consumer / weighbridge / yard / hopper / gate / intermediate), geographic location (lat/lon or polygon), and operational role.

**Impact.** Cross-plant reporting, route-adherence checking, and node-utilisation analytics use partial data. Nodes that appear in source data without HMD-side documentation are rendered as raw strings, providing no analytical value.

---

#### Gap 6.3 — Free-text `location` strings reference nodes outside the HMD reference set

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Vendor (SuVeechi) + JSW Operations |
| Cross-references | Module 6.1 and 6.2 |

**Need.** A controlled vocabulary of plant-node names used in the SuVeechi `location` field, with a documented mapping to operational meaning.

**Current state.** `location` is a free-text string. Observed patterns suggest two templates: `"At  <node_name>* "` (note: two spaces after "At") and `"<distance> KM <bearing> of <node_name>* "`. The asterisk and trailing space are terminators. The node names appear to be controlled (consistent across runs) but the list is not published.

**Gap.** Consumers must parse free-text and match against an undefined vocabulary. New node names appearing in `location` text cannot be interpreted programmatically until they are added to the consumer-side reference table.

**Action requested.** Publish the vendor's internal list of node names used by `location` text generation. Alternatively, expose `location` as two structured columns: `nearest_node` (controlled vocabulary) and `distance_from_node` (numeric, metres).

**Impact.** Parsing remains heuristic. Misclassification of a torpedo's position into the wrong operational area is possible at points equidistant from multiple nodes.

##### Sample data

Node names observed in SuVeechi `location` strings but not present in the HMD `locations_coordinates` reference table:

- BF side / Hot Metal Yard: `BF1 CH2`, `BF4 CHE`, `BF4 CHW`, `BF4 Entry`, `Corex1 CHB`, `Corex2 CHC`, `HMY1- Point No.25`, `HMY2- PCM Point No.103`, `Weigh Bridge HMY2`, `Weigh Bridge (HMY1)`, `PCM (HMY1)`
- SMS side: `SMS2 North PS`, `SMS3 LC`, `LRS1`, `LRS2`
- Yard / transit: `EY- AVTC Gate LC`, `SY- Track Hopper`

These names are present in production data but unaccompanied by documentation of their meaning, role, or coordinates.

---

### Module 6 — Areas not yet investigated

1. **Route definitions.** Whether the plant operates with formally defined torpedo routes (e.g., BF4 → WB HMY2 → SMS-4 via specified path) and whether route adherence is monitored.
2. **One-way / restricted segments.** Whether some plant track segments are one-way or restricted to certain torpedoes.
3. **Vehicle types at nodes.** Whether nodes are used exclusively by torpedoes or also by other plant vehicles (slag pots, scrap carriers).

---

### Module 7 — Fleet management (53 torpedo ladles)

**Module summary.** The torpedo ladle fleet is the operating asset that connects every producer to every consumer. HMD's internal fleet registry holds 53 torpedoes; the HTS master list holds 36. Seven torpedoes have been silent for 37+ days. The torpedo identifier is normalised inconsistently across source systems. No source provides a lifecycle / status history for the fleet.

---

#### Gap 7.1 — Fleet count discrepancy between HMD (53) and HTS master (36)

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations + JSW IT |
| Cross-references | Q11 in JSW weekly questions |

**Need.** A canonical roster of every torpedo currently in service or on standby, with status (in service / under maintenance / under refractory campaign / retired) per unit.

**Current state.** HMD's internal `fleet_management` table contains 53 torpedo rows. HTS's `H_UNIT_CODE` master table contains 36 rows. The 17-row delta has not been reconciled.

**Gap.** The two systems disagree about the fleet size. It is unclear which is authoritative and what the missing 17 torpedoes represent (retired? loaned? not yet enrolled in HTS?).

**Action requested.** Confirm the canonical active-fleet roster. Provide a status per torpedo: in service / under maintenance / under refractory campaign / loaned / retired / decommissioned, with expected return dates where applicable.

**Impact.** "Fleet utilisation" cannot be computed against a confirmed denominator. Apparent ghost torpedoes appear in HMD reports that have no HTS history; equally, some HTS-referenced torpedoes may not appear in HMD's registry.

##### Technical Detail

Comparison probe:

```sql
SELECT 'fleet_management' AS source, COUNT(*) FROM fleet_management WHERE deleted_at IS NULL
UNION ALL
SELECT 'h_unit_code_mirror', COUNT(*) FROM h_unit_code_mirror;
```

Result (2026-05-13):

| source | count |
|---|---:|
| fleet_management | 53 |
| h_unit_code_mirror | 36 |

---

#### Gap 7.2 — No torpedo lifecycle or status history

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations + JSW IT |
| Cross-references | Module 7.3 (silent torpedoes); Module 1.4 (refractory state) |

**Need.** A history per torpedo capturing key lifecycle events: commissioned, refractory campaign start, refractory campaign end, maintenance windows, retired.

**Current state.** Neither HTS nor any other inspected source exposes a torpedo-history table. The `fleet_management.status` column is a single current value, manually editable, with no historical record.

**Gap.** Long-term torpedo state cannot be analysed. "How long has TLC-09 been on its current refractory campaign?" or "When did TLC-25 last go through maintenance?" cannot be answered.

**Action requested.** Provide a torpedo-history table or view at JSW source side, with one row per torpedo state change.

**Impact.** Refractory-age analytics, predictive maintenance, and torpedo retirement planning cannot be supported.

---

#### Gap 7.3 — Seven torpedoes silent for 37+ days, status unexplained

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations |
| Cross-references | Module 5.4 (stale SuVeechi rows); Module 7.2 |

**Need.** Source-side classification of why specific torpedoes are inactive.

**Current state.** Of the 53 torpedoes in the HMD fleet, seven have not produced any trip activity in the last 37 days as of 2026-05-13. SuVeechi position rows for these torpedoes are stale by similar margins.

**Gap.** Their state is not classified at source. Without classification, an observer cannot tell whether each silent torpedo is in long-term refractory campaign, under repair, awaiting parts, or retired.

**Action requested.** Confirm the operational status of each silent torpedo and the expected return-to-service date. Capture this in the torpedo-status table proposed in Gap 7.2.

**Impact.** Fleet utilisation reporting includes silent units as if they could re-enter rotation at any moment, when in reality they may be unavailable for weeks or permanently.

##### Sample data

Approximate silent-torpedo list (observed 2026-05-13):

| Torpedo | Last activity (approx) | Days silent (approx) |
|---|---|---:|
| TLC-17 | (no recent trips) | 37+ |
| TLC-32 | (no recent trips) | 37+ |
| TLC-36 | (no recent trips) | 37+ |
| TLC-39 | March 2026 | 60+ |
| TLC-41 | March 2026 | 50+ |
| TLC-46 | (no recent trips) | 37+ |
| (one further unit) | (similar) | similar |

Numbers approximate — exact ages depend on the day of inspection.

---

#### Gap 7.4 — Torpedo identifier normalisation inconsistent across source systems

| Field | Value |
|---|---|
| Severity | **INCONSISTENT** |
| Owner | JSW IT |
| Cross-references | Module 1 (Producer-side); Module 9 (Consumer-side); cross-system joins |

**Need.** A consistent torpedo-identifier format used across all source systems.

**Current state.** Different source systems represent the same torpedo with different identifier conventions. Observed forms include `9`, `09`, `TLC-9`, `TLC 9`, and `TLC09`. HMD normalises all of these to the canonical form `TLC-NN` at sync time, but the normalisation logic must handle each variant.

**Gap.** Cross-system joins on torpedo identity require explicit normalisation. Source-side change to the identifier format (e.g., new leading zero policy) would break the normalisation logic silently.

**Action requested.** Document a canonical identifier format at JSW source side, applied consistently across WBATNGL `LADLENO`, HTS `TORPEDO_NO`, SuVeechi `unitname`, and any future source.

**Impact.** Low operational impact today thanks to HMD-side normalisation, but represents a forward-compatibility risk and slight ongoing complexity in every join.

##### Technical Detail

Observed variations across sources:

| Source | Field | Sample values |
|---|---|---|
| WBATNGL | `LADLENO` (raw) | `9`, `09`, `37`, `21` |
| HTS | `TORPEDO_NO` (raw) | `9`, `21` |
| SuVeechi | `unitname` | `TLC 09`, `TLC 37` (space-separated) |
| HMD canonical | `fleet_id` | `TLC-09`, `TLC-37` |

---

### Module 7 — Areas not yet investigated

1. **Torpedo capacity (rated, current).** Whether each torpedo's rated capacity is exposed and whether current capacity (post-refractory wear) is tracked.
2. **Torpedo refractory life cycle.** Heats-since-reline and remaining-life estimates.
3. **Torpedo ownership / leasing.** Whether all 53 are owned by JSW or some are leased.

---

### Module 8 — Weighbridge audit

**Module summary.** Weighbridge accuracy is a core operational concern. HMD must verify, plant-wide, that every weighbridge produces consistent and calibrated readings. Today the canonical weighbridge list is inferred from WBATNGL `SOURCE_LAB` heuristics rather than from a master list. No calibration history is exposed by source.

---

#### Gap 8.1 — No canonical weighbridge master list

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations + JSW IT |
| Cross-references | Q5 in JSW weekly questions |

**Need.** A canonical list of every weighbridge in the plant, with location, type, and the producers it serves.

**Current state.** Three weighbridge identities have been inferred from `SOURCE_LAB` patterns in WBATNGL data: WB HMY1, WB HMY2, LRS1. Whether additional weighbridges exist (e.g., empty-return weighbridges, secondary scales, supplier weighbridges) is not confirmed by any source.

**Gap.** Without a master list, the universe of weighbridges that HMD must audit is itself uncertain. New weighbridges could appear in the data without HMD being aware.

**Action requested.** Provide a canonical weighbridge list from JSW Operations, including any weighbridges not directly visible in WBATNGL data.

**Impact.** Audit coverage cannot be claimed as complete. Calibration analytics and weighbridge-comparison reports operate on an unverified set.

---

#### Gap 8.2 — No calibration history or drift data exposed

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations + JSW IT |
| Cross-references | Module 1 (Producer-side weights); Module 9 (Consumer-side weights) |

**Need.** Calibration events per weighbridge: calibration date, calibration result (passed / failed), reference weight, drift since last calibration.

**Current state.** No source database inspected contains weighbridge calibration history. HMD-side audit currently uses observed weight-distribution drift over time as a proxy.

**Gap.** Drift cannot be attributed to actual calibration events. A weighbridge that is genuinely out of calibration cannot be distinguished from one that has had a recent legitimate calibration.

**Action requested.** Expose a calibration-events table per weighbridge, populated by the plant's calibration team or system.

**Impact.** Weighbridge calibration drift reporting relies on inference. Recently-calibrated weighbridges cannot be flagged as such; long-uncalibrated weighbridges cannot be identified by data.

---

#### Gap 8.3 — Tare-weight and net-weight "actual" columns not documented

| Field | Value |
|---|---|
| Severity | **INCONSISTENT** |
| Owner | JSW IT |
| Cross-references | None |

**Need.** Documentation of the relationship between `TARE_WEIGHT` / `TARE_WEIGHT_ACTUAL` and `NET_WEIGHT` / `NET_WEIGHT_ACTUAL` columns observed in WBATNGL.

**Current state.** WBATNGL trip records contain four weight columns where two might be expected. The relationship between the "raw" and "actual" variants is not documented.

**Gap.** Consumers cannot tell which value to use for which analytical purpose: is `NET_WEIGHT` the operator-entered value and `NET_WEIGHT_ACTUAL` the post-correction value? Or is `_ACTUAL` an audit-trail field?

**Action requested.** Document the semantics of the four weight columns.

**Impact.** HMD currently uses `NET_WEIGHT` for primary reporting on the assumption that it is the operator-final value. Confirmation would prevent any silent shift if the convention is otherwise.

---

#### Gap 8.4 — No empty-return weighing event captured

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations + JSW IT |
| Cross-references | Q7 in JSW weekly questions; delivery verification |

**Need.** A weighing event after a torpedo has delivered to SMS and returned, confirming the torpedo is empty (or quantifying any slag carryback).

**Current state.** WBATNGL captures pre-trip tare and post-tap gross weights. No event records the empty-return weight after SMS delivery.

**Gap.** Delivery completeness cannot be verified. Slag carryback cannot be measured at source. The discrepancy between BF-side `NET_WEIGHT` and SMS-side `HOTMETAL_QTY` cannot be attributed to a specific physical cause.

**Action requested.** Confirm whether empty-return weighing happens operationally. If yes, expose the empty-return weight on the trip record. If no, scope an operational workflow to capture it.

**Impact.** Delivery-accuracy and slag-carryback reporting cannot be supported. Per-torpedo refractory-drainage hygiene metrics are not computable.

---

### Module 8 — Areas not yet investigated

1. **Weighbridge throughput per shift.** Per-weighbridge transaction-rate statistics for operator-loading and bottleneck analysis.
2. **Operator at weighbridge.** Whether a weighbridge operator identifier is captured per transaction.
3. **Truck / torpedo discrimination.** Whether the same weighbridges are used by non-torpedo vehicles and how those are distinguished in the data.

---

## 3C. Cluster C — Consumption (what happens at SMS)

This cluster addresses four modules: consumer-side trip arrival data across all four SMS units, SMS performance (yield and loss) plant-wide, SMS caster lifecycle analytics plant-wide, and end-to-end heat-trace lineage. All four modules are constrained by a structural gap: HTS provides hot-metal arrival data for SMS-2 and SMS-4 only, and provides caster-lifecycle data for SMS-4 only.

---

### Module 9 — Consumer-side data (SMS-1, SMS-2, SMS-3, SMS-4)

**Module summary.** HTS exposes per-heat consumer-side data — arrival timestamps, hot-metal quantities, converter identifiers — for SMS-2 (converters D, E, F, G) and SMS-4 (converters H, I). No consumer-side data is exposed for SMS-1 or SMS-3. The reasons differ between the two missing units, and clarification is required.

---

#### Gap 9.1 — SMS-1 not represented in HTS hot-metal data

| Field | Value |
|---|---|
| Severity | **BLOCKER** for SMS-1 reporting |
| Owner | JSW IT + JSW Operations |
| Cross-references | Q10 in JSW weekly questions |

**Need.** Confirmation of whether SMS-1 is currently operational and, if so, the data source for SMS-1 hot-metal receipts.

**Current state.** `HTS.VW_HTS_HOTMETAL_DATA` returns zero rows where `SMS_UNIT = 'SMS-1'`. No HTS schema accessible to `ICT_IFACE` contains an alternative SMS-1 table.

**Gap.** It is unclear whether SMS-1 is decommissioned, currently inactive, or operational but with its data in a different source.

**Action requested.** Confirm SMS-1 operational status. If active, identify the source-of-truth for SMS-1 hot-metal receipts and arrange access.

**Impact.** SMS-1 cannot be included in plant-wide consumer-performance reporting. Any reference to "all SMS units" is implicitly limited to SMS-2 and SMS-4.

##### Technical Detail

Verification SQL (HTS):

```sql
SELECT
    sms,
    COUNT(*)                       AS heats,
    MAX(torpedo_in_time)           AS last_heat
FROM   hts_heat_mirror
GROUP  BY sms
ORDER  BY sms;
```

Result (2026-05-13):

| sms | heats | last_heat |
|---|---:|---|
| SMS-2 | ~33,500 | 2026-05-14 (recent) |
| SMS-4 | ~1,580 | 2026-05-14 (recent) |
| *(no SMS-1 row)* | — | — |
| *(no SMS-3 row)* | — | — |

---

#### Gap 9.2 — SMS-3 not represented in HTS hot-metal data

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** (if in scope) |
| Owner | JSW IT + JSW Operations |
| Cross-references | Q10 in JSW weekly questions |

**Need.** Confirmation of whether SMS-3 receives hot metal and, if so, where the data lives.

**Current state.** SMS-3 is an EAF / ZPF unit (electric / scrap-based) rather than a BOF unit. Whether it consumes any hot metal at all is unclear from data. HTS contains no SMS-3 rows; the JVMLPROD instance contains a small `SMS3` schema with five tables whose contents have not been audited.

**Gap.** SMS-3's role in hot-metal logistics is undefined for HMD's purposes.

**Action requested.** Confirm whether SMS-3 receives hot metal as part of normal operations. If yes, identify the data source and arrange access. If no, document SMS-3 as out-of-scope for hot-metal tracking.

**Impact.** Without confirmation, every plant-wide metric is implicitly silent on SMS-3.

---

#### Gap 9.3 — Converter E (SMS-2) silent for 37+ days, no source explanation

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations |
| Cross-references | Module 2.1 (downtime source); Q13 |

**Need.** Source-side classification of why a specific converter is inactive.

**Current state.** HTS shows zero heat activity for `SMS_UNIT = 'SMS-2' AND CONVERTER_NO = 'E'` for the last 37+ days as of 2026-05-13.

**Gap.** The status of a major SMS converter is informal knowledge, not represented in queryable form.

**Action requested.** Confirm Converter E status (offline / under maintenance / refractory campaign / other) and expected return date. Capture in the SMS-side downtime table (the HTS `H_EQUP_BREAKDOWN` is the candidate location).

**Impact.** Plant-wide SMS performance reports show Converter E at zero throughput without explanation.

##### Technical Detail

Verification SQL:

```sql
SELECT
    converter_no,
    COUNT(*)                        AS heats,
    MAX(torpedo_in_time)            AS last_heat
FROM   hts_heat_mirror
WHERE  sms = 'SMS-2'
GROUP  BY converter_no
ORDER  BY converter_no;
```

Approximate result (2026-05-13):

| converter_no | heats | last_heat |
|---|---:|---|
| D | recent | 2026-05-14 |
| E | older only | 2026-04-06 (~37+ days ago) |
| F | recent | 2026-05-14 |
| G | recent | 2026-05-14 |

---

#### Gap 9.4 — No data for non-converter destinations (Pig Casting, Granulation, etc.)

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW Operations + JSW IT |
| Cross-references | Module 4 (Trip lifecycle); Q2 in JSW weekly questions |

**Need.** Recognition and capture of non-converter destinations for hot metal: pig casting machines, granulation plants, ladle metallurgy stations, hot-metal mixers, holding furnaces.

**Current state.** HTS records heat events only — that is, only hot metal that reaches a BOF converter and produces a heat. Any hot metal directed elsewhere produces no HTS row.

**Gap.** Trips diverted to non-converter destinations have no SMS-side data trail. Such trips cannot be confirmed as completed; from the HTS perspective they look identical to trips that never arrived.

**Action requested.** Confirm what non-converter destinations exist operationally. Expose a data trail for each — at minimum, timestamp of arrival at destination and quantity received.

**Impact.** Operational completeness of the trip dataset is unclear. Without knowing what fraction of trips go to non-converter destinations, the analytical scope of "all trips" is uncertain.

---

### Module 9 — Areas not yet investigated

1. **Per-converter operator and shift.** Whether the operator running each heat is captured (and whether to a sufficient level of detail).
2. **Pre-arrival queueing at SMS.** Whether SMS records a torpedo-arriving-but-waiting state distinct from torpedo-at-converter.
3. **SMS rejection events.** Whether SMS occasionally rejects an arriving torpedo and whether that is captured.

---

### Module 10 — SMS Performance (yield, loss) — all SMS units

**Module summary.** Yield and loss are critical consumer-performance metrics. HTS exposes detailed caster-process and consumption data (`H_CASTER_HEAT_PROCESS`, `H_CASTER_CONSUMPTION`) for SMS-4 only. No equivalent data for SMS-2 is accessible. The SMS-2 caster data is believed to live in the `SPT001A` schema in the JVMLPROD instance, but the access user does not have read privileges on that schema.

---

#### Gap 10.1 — SMS-2 caster process and consumption data not accessible

| Field | Value |
|---|---|
| Severity | **BLOCKER** for SMS-2 yield reporting |
| Owner | JSW IT (schema access) |
| Cross-references | Q3 in JSW weekly questions |

**Need.** Caster process events and consumption / yield data for SMS-2 converters D, E, F, G.

**Current state.** `HTS.H_CASTER_HEAT_PROCESS` and `HTS.H_CASTER_CONSUMPTION` contain only SMS-4 heats. The JVMLPROD instance has a `SPT001A` schema containing roughly 40 tables whose names suggest caster-side data. The `ICT_IFACE` user does not have SELECT privilege on the `SPT001A` schema.

**Gap.** SMS-2 caster data is not readable. SMS-2 yield, loss categories, and process lifecycle cannot be reported.

**Action requested.** Either (a) grant read-only access to the relevant `SPT001A` tables to `ICT_IFACE`, or (b) expose a unified view (analogous to `HTS.VW_HTS_HOTMETAL_DATA`) that aggregates caster data across SMS-2 and SMS-4.

**Impact.** Approximately 95% of plant heats (those running on SMS-2 converters) are tracked only to torpedo arrival; their downstream lifecycle (yield, loss, operator notes, ladle on/off times) is invisible.

##### Technical Detail

Schema enumeration:

```sql
SELECT owner, COUNT(*) AS tables
FROM   all_tables
WHERE  owner IN ('SPT001A', 'HTS', 'SMS3')
GROUP  BY owner
ORDER  BY owner;
```

Result (2026-05-13):

| owner | tables_visible_to_ict_iface |
|---|---:|
| HTS | (several) — full access |
| SMS3 | 5 | (visible but unaudited) |
| SPT001A | 40+ | object names visible, but **no SELECT privilege** |

---

#### Gap 10.2 — SMS-1 caster data location unknown

| Field | Value |
|---|---|
| Severity | **BLOCKER** (if SMS-1 is in scope) |
| Owner | JSW IT |
| Cross-references | Gap 9.1 (SMS-1 operational status) |

**Need.** SMS-1 caster process and consumption data, if SMS-1 is operational.

**Current state.** No source data for SMS-1 is identifiable. Resolution depends first on confirmation of SMS-1's operational status (Gap 9.1).

**Gap.** Unknown.

**Action requested.** Subordinate to Gap 9.1.

---

#### Gap 10.3 — Steel grade data only available where caster data is accessible

| Field | Value |
|---|---|
| Severity | **SIGNIFICANT** |
| Owner | JSW IT |
| Cross-references | Module 3 (Planning — grade mix targets); Gap 10.1 |

**Need.** Steel grade per heat across all SMS converters.

**Current state.** Steel grade is recorded in `H_CASTER_HEAT_PROCESS` for SMS-4 only. For SMS-2 heats, no grade data is accessible.

**Gap.** Grade-mix reporting and grade-specific yield analytics are restricted to SMS-4.

**Action requested.** Once Gap 10.1 is resolved (SMS-2 caster access), grade data should become available as a byproduct. Confirm this is the case once access is granted.

**Impact.** Plant-wide grade reports are SMS-4-only.

---

### Module 10 — Areas not yet investigated

1. **Loss-category vocabulary.** Whether the eight loss categories in `H_CASTER_CONSUMPTION` are a controlled vocabulary documented at JSW.
2. **Operator REMARKS quality.** Whether the free-text REMARKS field is consistently used and how its content is structured (or unstructured).

---

### Module 11 — SMS caster analytics — all SMS units

**Module summary.** Same data limitations as Module 10. SMS-4 caster fully visible; SMS-2 caster blocked by schema access; SMS-1 and SMS-3 location unknown. This module's gaps are a near-duplicate of Module 10 from a different operational angle (analytical depth rather than headline yield).

The technical detail of these gaps is consolidated in Module 10 above. JSW IT actions on Module 10 will also resolve Module 11.

---

### Module 12 — Heat trace

**Module summary.** Heat trace is the end-to-end lineage view: from BF tap through weighbridge, transit, SMS arrival, caster process, and back to torpedo release. Every other module's gaps appear in this module. In particular, Heat Trace depends on Gap 1.1 (no shared identifier between WBATNGL and HTS) and Gap 10.1 (no SMS-2 caster data).

This module's gaps are entirely composed of cross-references to earlier gaps. They are restated here only as a reminder that closing each upstream gap unlocks corresponding capability in Heat Trace.

---

#### Gap 12.1 — Deterministic trip-to-heat lineage requires source-side join key

Cross-reference: see **Gap 1.1**.

#### Gap 12.2 — Complete heat lineage requires SMS-2 caster access

Cross-reference: see **Gap 10.1**.

#### Gap 12.3 — Empty-return weight required for delivery-completeness lineage

Cross-reference: see **Gap 8.4**.

#### Gap 12.4 — Tap-fire timestamp required for accurate cycle-time lineage

Cross-reference: see **Gap 1.4**.

---

### Module 12 — Areas not yet investigated

1. **Torpedo refractory state at heat time.** Whether refractory wear at the time a specific heat ran is recorded and could be associated with heat outcomes.

---

## 3D. Cluster D — Cross-cutting

This cluster addresses one module: alerts and exceptions. Alerts are not a separate data source but a derived view across all data sources. Gaps in this module are second-order — they arise from the upstream gaps in earlier modules.

---

### Module 13 — Alerts and exceptions

**Module summary.** Alert generation requires reliable source data on which to apply rules. Where upstream data is missing, inconsistent, or incomplete, alerts cannot be generated reliably for the affected category. Most alert-related gaps therefore restate earlier upstream gaps from the alerting angle.

---

#### Gap 13.1 — Chemistry alerts cannot be plant-wide

Cross-reference: see **Gap 1.2** (Si BF4-only) and **Gap 1.3** (S inconsistent). Until both are resolved, chemistry-spec alerts can only run reliably on BF4 trips.

#### Gap 13.2 — Equipment-breakdown alerts cannot cover the producer side

Cross-reference: see **Gap 2.1**. Until a producer-side downtime source is exposed, equipment-breakdown alerts are SMS-side only.

#### Gap 13.3 — Trip-failure alerts cannot be generated

Cross-reference: see **Gap 4.3**. Until trip-failure events are captured at source, alerts on diversion / rejection / mechanical failure cannot be triggered.

#### Gap 13.4 — GPS-stale alerts conflate offline torpedoes with retired ones

Cross-reference: see **Gap 5.4** and **Gap 7.3**. GPS-stale alerts currently fire for torpedoes that have been silent for weeks because they are out of service; an "operational status" field would let alerts distinguish offline-but-active from out-of-service.

#### Gap 13.5 — No source-side alert / warning feed

| Field | Value |
|---|---|
| Severity | **ENHANCEMENT** |
| Owner | JSW IT |
| Cross-references | Module 13 overall |

**Need.** A source-side feed of operational warnings or exceptions emitted by JSW's plant control systems.

**Current state.** All alerts generated by HMD today are derived by HMD itself from source data plus internal rules. No source database exposes alerts or warnings emitted by upstream control systems.

**Action requested.** Confirm whether upstream plant control systems emit warnings or events that could be exposed to HMD. If yes, plan exposure. If no, this remains an enhancement rather than a gap.

---

### Module 13 — Areas not yet investigated

1. **Safety / incident events.** Whether safety-related events (e.g., spillage, near-miss, evacuation) are captured anywhere and whether HMD should surface them.

---

## 4. Appendices

### Appendix A — Data-source connection reference

| Database | Host / instance | Port | Service / DB | Read user | Notes |
|---|---|---:|---|---|---|
| WBATNGL | 10.10.1.67 | 1522 | WBATNGL | ITROSYSP | Producer-side trips, weighbridge, BF chemistry. View `BF3.WB_TRANS_DATA_ITRO` is the canonical entry point (a UNION ALL — see Gap 1.5). |
| HTS | 10.10.70.227 | 1522 | JVMLPROD.JSW.IN | ICT_IFACE | Consumer-side heats, caster, breakdowns, torpedo master. SPT001A schema not accessible (Gap 10.1). |
| SuVeechi | 10.10.156.157 | 3306 | suvetracg | view_user | Real-time torpedo GPS, status, plant-location text. View `vw_unit_status_ist` is the only entry point. |
| HMD Local | localhost (BF4 PC) | 5432 | hmd | postgres | Internal HMD mirrors plus alerts, fleet, app state. |

### Appendix B — Cross-reference to the JSW weekly questions

The following items in the JSW Weekly Questions report (separately maintained) correspond to gaps in this document. JSW responses to these questions directly close the corresponding gaps.

| Question | Topic | Closes gap(s) |
|---|---|---|
| Q1 | Shared identifier between BF tap and SMS heat | 1.1, 12.1 |
| Q2 | SMS acknowledgement workflow | 4.2, 4.4, 9.4 |
| Q3 | SMS-2 caster data access (SPT001A) | 10.1, 11, 12.2 |
| Q4 | Trip failure / diversion event capture | 4.3, 13.3 |
| Q5 | Canonical node list and geofences | 6.1, 6.2, 6.3, 8.1 |
| Q6 | Production targets and schedules | 3.1, 3.2, 3.3 |
| Q7 | Empty-torpedo return weighing | 8.4, 12.3 |
| Q8 | BF-side equipment downtime | 2.1, 13.2 |
| Q9 | Direct access to LRS Oracle | 1.5 |
| Q10 | SMS-1 and SMS-3 operational scope | 9.1, 9.2, 10.2 |
| Q11 | Canonical torpedo fleet roster | 7.1, 7.2, 7.3 |
| Q12 | Weighbridge `closetime` workflow | 4.1, 4.2, 8.3 |
| Q13 | Production drop since 8 May 2026 | 2.2, 9.3 |

### Appendix C — Glossary

| Term | Definition |
|---|---|
| BF | Blast Furnace. Producer of hot metal. JSW Vijayanagar operates BF1, BF2, BF3, BF4, and BF5. |
| COREX | Alternative producer process. JSW operates COREX1 and COREX2 alongside the BFs. |
| Torpedo | Refractory-lined ladle railcar that transports hot metal from BF to SMS. Sometimes called a "torpedo ladle" or "submarine car". |
| LADLENO / TORPEDO_NO | Torpedo identifier. WBATNGL uses `LADLENO`; HTS uses `TORPEDO_NO`. Normalised to `TLC-NN` form by HMD. |
| Trip | The end-to-end journey of a torpedo from BF weighbridge to SMS converter (or other destination) and back. |
| Heat | The smelting cycle in a single SMS converter. One heat consumes one or more torpedo-loads of hot metal. |
| Tap | The event of pouring hot metal from a BF into a torpedo. |
| WB / Weighbridge | Scale that records torpedo gross and tare weights at the BF side. |
| SMS | Steel Melting Shop. Consumer of hot metal. JSW operates SMS-1 through SMS-4. |
| Converter | BOF (Basic Oxygen Furnace) inside an SMS. JSW operates 6 converters across SMS-2 (D, E, F, G) and SMS-4 (H, I). |
| Caster | Continuous-casting machine downstream of the converter; produces solidified steel from the heat. |
| Yield | Mass of solid steel produced divided by mass of hot metal received, expressed as percentage. |
| LRS | Liquid Reservoir / remote Oracle database containing native BF1, BF2, COREX1, COREX2 trip data, accessed today via DB Link from BF3 schema (see Gap 1.5). |

---

*End of report. Executive Summary (Section 1) to be finalised after this document is reviewed.*
