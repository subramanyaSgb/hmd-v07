# Weighbridge Audit page

**Date:** 2026-05-13
**Author:** brainstorm session with Claude
**Status:** Approved, ready for implementation
**Reference design:** `c:/Users/DSI-LPT-081/Desktop/HMD/desing_idea/reports.jsx` (the `WeighbridgeAudit` component)
**Slot:** Sidebar position 4 (admin/TRS, after Trip Management) — same slot previously planned for Chemistry Analytics (deferred)

---

## 1. Goal

Add a new Weighbridge Audit page that cross-checks BF-side weighbridge readings (`gross / tare / net`) against the SMS-side actual receipt (`net_weight_actual`) to surface variance, drift per weighbridge, and out-of-spec trips. 1:1 layout port of `desing_idea/reports.jsx:WeighbridgeAudit`, light theme.

## 2. Decisions log

| # | Decision | Choice |
|---|---|---|
| 1 | Handle the data gap (`net_weight_actual` not yet mirrored) | A — extend `wbatngl_trip_mirror` to capture it via migration + sync change |
| 2 | "Last calibration date" per WB | Render `—` with "no calibration log yet" tooltip; Recalibrate button fires toast only (no persistence) |
| 3 | Sidebar slot | Position 4 (admin/TRS), after Trip Management |
| 4 | Role gate | admin / TRS only (excludes PPC, Operator) |
| 5 | Default range | `today` |
| 6 | Refresh cadence | 60s tick (weighbridge data doesn't change rapidly) |
| 7 | Source-lab → WB derivation | `BF3 → WB HMY1`, `BF4 → WB HMY2`, `BF5 → WB LRS1` (matches design + JSW track edges) |
| 8 | Recalibrate workflow | Toast-only for now; follow-up sprint can add `weighbridge_calibrations` table |
| 9 | Variance threshold | 0.3% (matches design's "Open Variances ≥ 0.3%") |
| 10 | Variance distribution bins | 11 bins from -0.6 to +0.6 (0.2 step) |

## 3. Backend changes

### 3.1 Schema

```python
class WbatnglTripMirror(Base):
    ...
    net_weight_actual  = Column(Float, nullable=True)
    tare_weight_actual = Column(Float, nullable=True)
```

### 3.2 Migration `wbaudit001`

- `down_revision = 'livetrack001'`
- `op.add_column('wbatngl_trip_mirror', sa.Column('net_weight_actual', sa.Float(), nullable=True))`
- `op.add_column('wbatngl_trip_mirror', sa.Column('tare_weight_actual', sa.Float(), nullable=True))`
- Downgrade drops the two columns

### 3.3 Sync update

In `utils/wbatngl_trip_sync.py:row_to_mirror_dict()` extend the dict with the 2 new columns (Oracle field names: `NET_WEIGHT_ACTUAL` / `TARE_WEIGHT_ACTUAL`). Already present in the upstream Oracle table — we're just stopping the drop.

### 3.4 Endpoints

**`GET /api/weighbridge-audit/v2/overview?range=today|shift_a|7d`** — fast aggregate:
- `kpis`: trips_reconciled, open_variances, avg_variance_pct, total_dispatched_kt
- `variance_histogram`: 11 bins {label, count, tone}
- `calibrations`: 3 WB rows {wb, drift_pct, tone}

**`GET /api/weighbridge-audit/v2/log?range=today&filter=all|variance|pending&limit=24`** — table rows:
- One row per WBATNGL trip in the range, sorted by `closetime DESC`
- Each row: `time, wb, trip_id, tap_no, fleet_id, gross, tare, net_weight, net_weight_actual, variance_pct, status`

Cache: 60s on `/overview`, 30s on `/log`.

## 4. Frontend changes

### 4.1 Files

| Path | Status |
|---|---|
| `pages/WeighbridgeAudit.jsx` | NEW container |
| `components/WeighbridgeAudit/KPIRow.jsx` | NEW |
| `components/WeighbridgeAudit/WeighbridgeLog.jsx` | NEW |
| `components/WeighbridgeAudit/VarianceHistogram.jsx` | NEW (Recharts BarChart) |
| `components/WeighbridgeAudit/CalibrationCard.jsx` | NEW |
| `components/WeighbridgeAudit/WeighbridgeAudit.css` | NEW (scoped `.wb-audit`) |
| `App.jsx` | EDIT — lazy import + route + ROUTE_CONFIG |
| `Sidebar.jsx` | EDIT — insert in admin + TRS arrays |

### 4.2 Layout

Grid 2-col: `1.6fr 1fr`. Left = WeighbridgeLog (full-height card). Right = stacked VarianceHistogram on top + CalibrationCard below.

Header: title left (auto), `[Shift A] [Today] [7d]` + Export button on right via `HeaderContext`.

## 5. Phases

1. Backend (model + migration + sync + 2 endpoints + register)
2. Frontend (page + 4 components + CSS + route + sidebar)
3. Build verify
4. `changes_tracker.md` + handover mirror + push BOTH remotes

## 6. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | DuplicateTable on BF4 (V2 dashboard pattern) | This sprint adds columns, not tables. `init_db().create_all()` doesn't add columns — Alembic is the only path |
| R2 | Empty state until next sync tick re-populates `net_weight_actual` on recent rows | Frontend renders "—" + falls back to "Review" status |
| R3 | Division-by-zero on variance | Server returns `null` if `net_weight is None or <= 0`; frontend "—" |
| R4 | Source-lab → WB heuristic mismatch | Inline comment; admin can override via Plant Layout later |
| R5 | Recalibrate button is toast-only | README + tracker entry note follow-up sprint scope |
| R6 | Forgetting `new-origin` push | Explicit dual-push at the end |
