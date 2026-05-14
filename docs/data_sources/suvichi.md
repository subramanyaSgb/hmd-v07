# SuVeechi (suvichi) — Data Source Reference

**Source system:** SuVeechi — third-party fleet GPS tracking platform deployed at JSW.
**Last verified:** 2026-05-13 — via DBeaver inspection from BF4 PC.
**Last updated by:** Subramanya Bellary

---

## 1. Connection details

| Field | Value |
|---|---|
| Database engine | **MySQL** |
| Server IP | `10.10.156.157` |
| Port | `3306` |
| Database name | `suvetracg` |
| Username | `view_user` |
| Password | `MyStV#124!` |
| Access type | Read-only, view-only — no base-table access, no DDL |
| View exposed | `vw_unit_status_ist` (only one) |
| Pulled by | `backend/utils/suveechi_sync.py` — APScheduler interval job |
| Pull cadence | Every 10 seconds (configurable via `SUVEECHI_SYNC_INTERVAL_SECONDS`) |
| Network requirement | JSW network reachable — confirmed working on BF4 PC; will NOT work from external networks |

### Source emails (proof / provenance)

1. **Connection details email** — Ganesha Sridhara `<ganesh.s@suveechi.in>` → Subramanya Bellary, 02 April 2026, 09:41 UTC (15:11 IST). Created the MySQL view and shared host/port/db/user/view-name. CCs: Pritam Saha (Accenture), Gagan Chopra (JSW IT), Hari Barki (JSW BF).
2. **Password email** — Ganesha Sridhara, 02 April 2026, 09:46 UTC (15:16 IST). Body verbatim: `"MySQL User Password:  MyStV#124!"`.

---

## 2. Schema — `vw_unit_status_ist`

The **only view** exposed to `view_user`. It's a **flat snapshot table — 53 rows, one per torpedo, UPSERT'd in place** (no history; SuVeechi rebuilds the view as torpedoes report new positions).

| # | Column | Type | Example | Description |
|---|---|---|---|---|
| 1 | `unitname` | varchar | `"TLC 01"` | Torpedo identifier as SuVeechi spells it — space-separated, NOT hyphenated. Our sync normalizes to `TLC-01`. |
| 2 | `status` | varchar | `"Idle"` | One of only THREE values: `Idle` / `Moving` / `Ign Off`. SuVeechi has NO `Maintenance` status — that's our derived concept. |
| 3 | `location` | text | `"At  SMS3* "` or `"0.10 KM E of Weigh Bridge HMY2* "` | Descriptive position relative to a known plant node. Note: double-space after `"At "`, asterisk-space terminator. Empty when torpedo is between known geofences. |
| 4 | `latitude` | decimal(10,7) | `15.1851633` | GPS latitude (7-decimal precision ≈ ±1.1 cm) |
| 5 | `longitude` | decimal(10,7) | `76.6731200` | GPS longitude |
| 6 | `reporttime_ist` | datetime | `2026-05-13 16:23:29` | When SuVeechi received this GPS sample — **IST wall-clock, NAIVE (no tzinfo)** |
| 7 | `reporttime_gmt` | datetime | `2026-05-13 10:53:29` | Same sample, in GMT/UTC — also **NAIVE**. Always exactly 5h30m before `reporttime_ist`. |

### Status value distribution (typical)

| `status` | Meaning | Mapped to in our `FleetManagement.status` |
|---|---|---|
| `Idle` | Torpedo is reporting GPS but engine off / not moving | `Operating` (via SuVeechi sync) |
| `Moving` | Torpedo's ignition is on / engine running (NOT strictly = physical motion — see notes) | `Moving` |
| `Ign Off` | Ignition off — operationally treated as Out of Service | `Maintenance` (via SuVeechi sync) |

> ⚠ **SuVeechi has no `Maintenance` status.** When we see a torpedo as `Maintenance` in `FleetManagement` while SuVeechi reports `Idle`, that flag was set manually by an operator via the Torpedo Management UI (see `backend/utils/suveechi_sync.py:196-200` — manual-override protection).

### What SuVeechi does NOT expose

Fields we wanted but didn't get:
- ❌ `speed` / `velocity`
- ❌ `battery`
- ❌ `ignition_state` (separate from `status`)
- ❌ `engine_hours`
- ❌ GPS history / trail (only the latest snapshot survives)
- ❌ Geofence event log (enter/exit zones)
- ❌ Alarms / events
- ❌ Torpedo master attributes (capacity, type, etc. — we maintain those ourselves)

---

## 3. Latest data snapshot (2026-05-13, ~16:23 IST)

Pulled directly from SuVeechi via DBeaver. **53 rows** (full fleet):

| Torpedo | Status | Latitude | Longitude | `reporttime_ist` | Location |
|---|---|---|---|---|---|
| TLC 01 | Idle | 15.1793933 | 76.6775550 | 2026-05-13 16:23:29 | _(empty)_ |
| TLC 02 | Idle | 15.1740017 | 76.6635167 | 2026-05-13 16:23:40 | 0.10 KM E of Weigh Bridge HMY2 |
| TLC 03 | Idle | 15.1852500 | 76.6738033 | 2026-05-13 16:22:50 | _(empty)_ |
| TLC 04 | Idle | 15.1787633 | 76.6561767 | **2026-05-08 11:33:04** ⚠ | At SMS2 North PS CAR LC |
| TLC 05 | Idle | 15.1832883 | 76.6418950 | 2026-05-13 16:22:31 | 0.04 KM NW of BF1 CH2 |
| TLC 06 | Idle | 15.1856600 | 76.6730300 | 2026-05-13 16:23:07 | 0.45 KM E of EY- AVTC Gate LC |
| TLC 07 | Idle | 15.1790650 | 76.6793050 | 2026-05-13 16:22:59 | _(empty)_ |
| TLC 08 | Idle | 15.1706733 | 76.6675700 | 2026-05-13 16:22:49 | 0.02 KM NE of BF4 CHW |
| TLC 09 | Idle | 15.1745400 | 76.6626383 | 2026-05-13 16:23:12 | 0.07 KM SW of Weigh Bridge HMY2 |
| TLC 10 | Idle | 15.1787300 | 76.6703200 | 2026-05-13 16:23:05 | _(empty)_ |
| TLC 11 | Idle | 15.1746450 | 76.6624366 | 2026-05-13 16:23:28 | 0.08 KM W of Weigh Bridge HMY2 |
| TLC 12 | Idle | 15.1880450 | 76.6606233 | 2026-05-13 16:23:18 | At SMS2 North PS |
| TLC 13 | Idle | 15.1832083 | 76.6419983 | 2026-05-13 16:23:38 | At BF1 CH2 |
| TLC 14 | Idle | 15.1707533 | 76.6676267 | 2026-05-13 16:23:32 | 0.03 KM NE of BF4 CHW |
| TLC 15 | Idle | 15.1823883 | 76.6424333 | 2026-05-13 16:23:25 | 0.07 KM SW of Corex2 CHC |
| TLC 16 | Idle | 15.1767550 | 76.6817133 | **2026-05-04 05:28:26** ⚠ | 0.35 KM NW of SY- Track Hopper |
| TLC 17 | Idle | 15.1749417 | 76.6616950 | 2026-05-13 16:22:50 | 0.16 KM W of Weigh Bridge HMY2 |
| **TLC 18** | **Moving** | 15.1776600 | 76.6582533 | 2026-05-13 16:19:18 | 0.12 KM NW of TRS Rear side, Point No.122A |
| TLC 19 | Idle | 15.1822983 | 76.6429166 | 2026-05-13 16:23:30 | 0.05 KM S of Corex2 CHC |
| TLC 20 | Idle | 15.1856600 | 76.6404483 | 2026-05-13 16:23:23 | 0.09 KM SW of HMY1- Point No.25 |
| TLC 21 | Idle | 15.1851433 | 76.6728350 | 2026-05-13 16:22:55 | _(empty)_ |
| TLC 22 | Idle | 15.1881050 | 76.6603117 | 2026-05-13 16:23:24 | At SMS2 North PS |
| **TLC 23** | **Moving** | 15.1725466 | 76.6674950 | 2026-05-13 16:23:45 | 0.12 KM NW of HMY2- PCM Point No.103 |
| TLC 24 | Idle | 15.1819667 | 76.6534833 | 2026-05-13 16:22:58 | At SMS1 |
| TLC 25 | Idle | 15.1776150 | 76.6646500 | 2026-05-13 15:53:00 | At SMS3 |
| TLC 26 | Idle | 15.1741117 | 76.6631517 | 2026-05-13 16:23:06 | 0.08 KM S of Weigh Bridge HMY2 |
| **TLC 27** | **Moving** | 15.1832950 | 76.6430883 | 2026-05-13 16:23:25 | 0.07 KM N of Corex2 CHC |
| TLC 28 | Idle | 15.1839933 | 76.6458733 | 2026-05-13 16:22:59 | At LRS1 |
| TLC 29 | Idle | 15.1835150 | 76.6462283 | 2026-05-13 16:23:32 | At Inspection Bridge |
| TLC 30 | Idle | 15.1745800 | 76.6624050 | 2026-05-13 16:23:26 | 0.09 KM W of Weigh Bridge HMY2 |
| TLC 31 | Idle | 15.1851067 | 76.6393150 | 2026-05-13 16:22:57 | 0.18 KM S of PCM (HMY1) |
| **TLC 32** | **Ign Off** | 15.1808550 | 76.6736167 | **2026-04-18 07:45:01** ⚠ | _(empty)_ |
| TLC 33 | Idle | 15.1698783 | 76.6672283 | 2026-05-13 16:23:13 | 0.04 KM W of BF4 CHE |
| TLC 34 | Idle | 15.1855066 | 76.6564150 | 2026-05-13 16:23:33 | At SMS2 |
| TLC 35 | Idle | 15.1706683 | 76.6709283 | **2026-05-11 16:42:43** ⚠ | At BF4 Entry |
| TLC 36 | Idle | 15.1707150 | 76.6678300 | **2026-05-13 08:57:32** ⚠ | At BF4 CHW Point No.138 |
| TLC 37 | Idle | 15.1860583 | 76.6730100 | 2026-05-13 16:23:30 | 0.41 KM E of EY- AVTC Gate LC |
| TLC 38 | Idle | 15.1815266 | 76.6526733 | 2026-05-13 16:23:29 | At SMS1 |
| **TLC 39** | **Ign Off** | 15.1744917 | 76.6626133 | **2026-03-04 06:16:36** ⚠ | 0.07 KM SW of Weigh Bridge HMY2 |
| TLC 40 | Idle | 15.1841650 | 76.6454350 | 2026-05-13 16:22:50 | 0.07 KM NW of LRS1 |
| TLC 41 | Idle | 15.1819100 | 76.6713617 | **2026-03-17 17:13:45** ⚠ | _(empty)_ |
| TLC 42 | Idle | 15.1848700 | 76.6401850 | 2026-05-13 16:23:27 | 0.18 KM SW of HMY1- Point No.25 |
| TLC 43 | Idle | 15.1792533 | 76.6550533 | 2026-05-13 16:23:08 | At HMY2- Corex Point No.125 |
| TLC 44 | Idle | 15.1801083 | 76.6794833 | 2026-05-13 14:26:41 | _(empty)_ |
| TLC 45 | Idle | 15.1699017 | 76.6677417 | 2026-05-13 16:22:50 | At BF4 CHE |
| TLC 46 | Idle | 15.1742733 | 76.6629067 | **2026-05-10 16:24:21** ⚠ | 0.07 KM S of Weigh Bridge HMY2 |
| TLC 47 | Idle | 15.1745233 | 76.6627850 | 2026-05-13 16:22:46 | 0.05 KM SW of Weigh Bridge HMY2 |
| **TLC 48** | **Moving** | 15.1834450 | 76.6462967 | 2026-05-13 16:23:16 | At Inspection Bridge |
| TLC 49 | Idle | 15.1698933 | 76.6674016 | 2026-05-13 13:02:34 | 0.02 KM W of BF4 CHE |
| TLC 50 | Idle | 15.1768900 | 76.6804033 | 2026-05-13 16:23:11 | 0.47 KM NW of SY- Track Hopper |
| TLC 51 | Idle | 15.1749667 | 76.6621583 | 2026-05-13 16:23:35 | 0.11 KM W of Weigh Bridge HMY2 |
| TLC 52 | Idle | 15.1741483 | 76.6634600 | 2026-05-13 16:23:35 | 0.08 KM E of Weigh Bridge HMY2 |
| **TLC 53** | **Moving** | 15.1794167 | 76.6750733 | 2026-05-13 16:22:23 | _(empty)_ |

⚠ = `reporttime_ist` is more than 1 hour old at time of snapshot. Effectively "GPS stale" — torpedo hasn't reported in a while.

### Snapshot summary

| Status | Count |
|---|---|
| Idle | 46 |
| Moving | 5 (TLC 18, 23, 27, 48, 53) |
| Ign Off | 2 (TLC 32, TLC 39) |
| **Total** | **53** |

| Reporttime age | Count |
|---|---|
| Fresh (< 1 h) | 41 |
| Stale (1-24 h) | 3 (TLC 36, 44, 49) |
| Very stale (> 24 h) | 9 (TLC 04, 16, 25 borderline, 32, 35, 39, 41, 46, ~) |

### Empty `location` field

These torpedoes report GPS coords but no descriptive position text — they are between known geofences:
TLC 01, 03, 07, 10, 21, 32, 41, 44, 53

---

## 4. Known plant node tokens (extracted from `location` field)

Tokens seen in the `location` text, useful for stage detection or geofence inference:

### BF-side (Producer)
- `BF1 CH2`
- `BF4 CHE`
- `BF4 CHW`, `BF4 CHW Point No.138`
- `BF4 Entry`
- `Corex2 CHC`

### SMS-side (Consumer)
- `SMS1`
- `SMS2`, `SMS2 North PS`, `SMS2 North PS CAR LC`
- `SMS3`

### Yard / transit / weighing
- `LRS1` (Ladle Repair Shed 1)
- `HMY1- Point No.25`, `PCM (HMY1)`
- `HMY2- PCM Point No.103`, `HMY2- Corex Point No.125`
- `Weigh Bridge HMY2`
- `Inspection Bridge`
- `EY- AVTC Gate LC` (East Yard - AVTC gate)
- `SY- Track Hopper` (South Yard)
- `TRS Rear side, Point No.122A`

`location` text format patterns:
- **"At  <node>* "** (double-space, asterisk-space terminator) — torpedo is at this known node
- **"<distance> <bearing> of <node>* "** — torpedo is near but not at; e.g., `0.10 KM E of Weigh Bridge HMY2*`
- **""** (empty) — torpedo is somewhere SuVeechi can't pin to a named node

---

## 5. How we use this data — sync pipeline

```
MySQL: vw_unit_status_ist
       (snapshot, 53 rows, UPSERT, no history)
              │
              │  (read every 10s by APScheduler)
              ▼
backend/utils/suveechi_sync.py
              │
              ├── normalize_fleet_id():   "TLC 01" → "TLC-01"
              ├── map_status():           Idle→Operating, Moving→Moving, Ign Off→Maintenance
              ├── clean location_text:    strip trailing "* "
              │
              ├──────►  fleet_management
              │         UPSERT — protects manual Maintenance flag
              │
              └──────►  fleet_live_locations
                        APPEND — new row only if reporttime_ist is newer
                        than the latest stored row for this fleet_id
                        (prevents tick-by-tick duplicate rows for idle torpedoes)
```

### Status mapping (current)

| SuVeechi `status` | Our `FleetManagement.status` |
|---|---|
| `Idle` | `Operating` |
| `Moving` | `Moving` |
| `Ign Off` | `Maintenance` |

### Manual-override protection ([`suveechi_sync.py:196-200`](../../backend/utils/suveechi_sync.py))

If a torpedo is already `Maintenance` or `Assigned` in our DB, the SuVeechi sync does NOT touch it — UNLESS SuVeechi explicitly reports `Ign Off`. This lets operators flag a torpedo as Maintenance via the Torpedo Management UI, and the flag persists across SuVeechi ticks.

**Side effect:** once flagged Maintenance manually, only a manual UI action can clear it back to Operating. SuVeechi reporting `Idle` or `Moving` will NOT clear it.

### Known bugs / quirks (audit 2026-05-13)

1. **Timezone shift bug (confirmed)** — sync reads `reporttime_ist` first and tags it as UTC, storing `fleet_live_locations.last_updated` **+5h30m ahead** of reality. Pending fix.
2. **`Moving` ≠ physical motion** — SuVeechi's `Moving` indicates ignition-on / engine running, not GPS-position-changing. Operators may want to use position deltas instead.
3. **`location_text` is captured but never parsed for analytics** — currently only displayed in the Live Tracking V2 detail panel. The `"At <node>"` text could feed cheap node-detection logic.
4. **No GPS jitter filter at sync time** — every SuVeechi tick with a new `reporttime_ist` produces a new `fleet_live_locations` row, even if the position barely changed. Inflates the table.
5. **Manual `Maintenance` never auto-clears** — no TTL, no UI indicator that it was set manually.

---

## 6. What SuVeechi was supposed to give vs what we received

From the original DEEVIA data-requirements spec (Subramanya → JSW, 25 March 2026):

| Requested view (in `HMD_Data_Requirements.xlsx`) | Priority | Delivered? |
|---|---|---|
| `VW_HMD_TORPEDO_GPS_LIVE` (Real-time GPS positions) | P0 critical | ✅ Yes — covered by `vw_unit_status_ist` |
| Torpedo Master (asset attributes: capacity, type, status, etc.) | P1 high | ❌ No — we maintain in our own `fleet_management` table |
| Geofence event log (enter/exit zones) | — | ❌ No — only "where it is right now" via `location` text |
| Speed / velocity per torpedo | — | ❌ No |
| Battery / health / ignition state | — | ❌ No |
| GPS history trail | — | ❌ No (only latest snapshot) |
| Alarms / equipment events | — | ❌ No |

**Bottom line:** SuVeechi delivered the P0 GPS-live requirement (1 view, 7 columns, snapshot). Everything else they did not expose. We had to build any history (`fleet_live_locations`) and any enrichment (`fleet_management`) ourselves.

---

## 7. Network setup history

- **April 7-8, 2026:** Initial request raised — pings to `10.10.156.157` were 100% packet loss from our system.
- **April 13-17, 2026:** Firewall + SecOps teams (V_Rohan.Pradhan, projectharmony, jaguar.secops, firewall.support) worked through the IT-OT network integration per `SOP_IT-OT_Networks_Integration_V4.pdf`.
- **By May 6, 2026:** SuVeechi sync working in production on BF4 PC.

---

## 8. Quick verification queries

### MySQL — directly inspect SuVeechi
```sql
-- 1. Full snapshot
SELECT * FROM vw_unit_status_ist;

-- 2. Status distribution
SELECT status, COUNT(*) AS n
FROM vw_unit_status_ist
GROUP BY status
ORDER BY n DESC;

-- 3. Torpedoes with stale reporttime (>1 hour old)
SELECT unitname, status, reporttime_ist,
       TIMESTAMPDIFF(MINUTE, reporttime_ist, NOW()) AS minutes_stale
FROM vw_unit_status_ist
WHERE TIMESTAMPDIFF(MINUTE, reporttime_ist, NOW()) > 60
ORDER BY minutes_stale DESC;

-- 4. Unique "At <node>" locations
SELECT DISTINCT location
FROM vw_unit_status_ist
WHERE location LIKE 'At %'
ORDER BY location;
```

### PostgreSQL — compare against our mirror
```sql
-- 1. Compare row counts (should match — 53)
SELECT COUNT(*) FROM fleet_management WHERE deleted_at IS NULL;

-- 2. Compare status mapping
SELECT status, COUNT(*) AS n
FROM fleet_management
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY n DESC;

-- 3. Inspect FleetLiveLocation freshness
SELECT fleet_id, last_updated, NOW() - last_updated AS age
FROM fleet_live_locations
WHERE id IN (SELECT MAX(id) FROM fleet_live_locations GROUP BY fleet_id)
ORDER BY age DESC;
```

---

## 9. Open questions for next session

- Does SuVeechi also have a "trip event" view or a "geofence enter/exit" view that `view_user` can't see, but JSW could request access for?
- Does the `location` text use a controlled vocabulary upstream (i.e., is the list of node names finite and stable)?
- Can we negotiate exposure of `speed` / `ignition_state` if needed?
- Should the sync apply a GPS-jitter filter (only INSERT new `fleet_live_locations` row when position delta > N meters)?
- Should manual `Maintenance` flags have a TTL or audit log?
