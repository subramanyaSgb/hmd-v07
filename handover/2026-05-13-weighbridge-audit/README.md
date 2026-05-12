# Handover — Weighbridge Audit page

**Date:** 2026-05-13
**Target machine:** BF4 PC
**Design doc:** [`docs/plans/2026-05-13-weighbridge-audit-design.md`](docs/plans/2026-05-13-weighbridge-audit-design.md)
**changes_tracker.md entries:** #122 – #136

---

## What's new

A new **Weighbridge Audit** page at `/weighbridge-audit`, accessible from the admin/TRS sidebar at **position 4 (directly under Trip Management)**.

The page cross-checks BF-side weighbridge readings against SMS-side actuals to surface variance, drift per weighbridge, and out-of-spec trips. 1:1 layout port of `desing_idea/reports.jsx:WeighbridgeAudit`.

### Sections

| Section | What | Source |
|---|---|---|
| 4 KPI cards | Trips Reconciled · Open Variances · Avg Variance · Total Dispatched | `/api/weighbridge-audit/v2/overview` |
| Weighbridge log | Per-trip table w/ filter pills (All / Variance ≥ 0.3% / Pending) | `/api/weighbridge-audit/v2/log` |
| Variance histogram | 11 bins from -0.6% to +0.6% (green / amber / red) | `/overview` |
| Per-weighbridge calibration | 3 rows (WB HMY1 / HMY2 / LRS1) with 30-day drift % | `/overview` |

### New data captured

The WBATNGL upstream Oracle has `NET_WEIGHT_ACTUAL` and `TARE_WEIGHT_ACTUAL` columns (SMS-side actual readings) — we were fetching them but dropping on ingest. This sprint adds them to the local `wbatngl_trip_mirror` table. Migration `wbaudit001` adds the 2 columns; next sync tick fills them in.

### Known limitations (intentional, per design)

- **"last cal" date** shows `—` — no `weighbridge_calibrations` table yet. Follow-up sprint can add one.
- **Recalibrate button** fires a toast for now. No persistence.
- **WB derivation** is heuristic: `BF3 → HMY1`, `BF4 → HMY2`, `BF5 → LRS1`. If JSW's actual routing differs in edge cases, the mapping is one line in `_wb_from_source()` to fix.

---

## Files

### Backend
- `backend/database/models.py` — added 2 columns to `WbatnglTripMirror`
- `backend/alembic/versions/wbaudit001_add_actual_weights_to_wbatngl_mirror.py` — **NEW** migration (down_revision = `livetrack001`)
- `backend/utils/wbatngl_trip_sync.py` — capture `NET_WEIGHT_ACTUAL` + `TARE_WEIGHT_ACTUAL`
- `backend/routes/weighbridge_audit.py` — **NEW**. 2 endpoints
- `backend/main.py` — registered new router

### Frontend
- `frontend/src/App.jsx` — lazy import + route + ROUTE_CONFIG
- `frontend/src/components/Sidebar.jsx` — admin + TRS arrays insert at position 4 (+ `Scale` icon import)
- `frontend/src/pages/WeighbridgeAudit.jsx` — **NEW** container
- `frontend/src/components/WeighbridgeAudit/` — **NEW**:
  - `KPIRow.jsx`
  - `WeighbridgeLog.jsx`
  - `VarianceHistogram.jsx`
  - `CalibrationCard.jsx`
  - `WeighbridgeAudit.css`

### Docs
- `docs/plans/2026-05-13-weighbridge-audit-design.md` — **NEW** design doc

---

## Deployment steps on BF4

```cmd
:: 1. Stop running services
:: 2. Pull latest
git pull

:: 3. Activate venv
.venv\Scripts\activate.bat

:: 4. Apply migration (adds 2 columns to wbatngl_trip_mirror)
cd backend
python -m alembic upgrade head
:: Expected: INFO Running upgrade livetrack001 -> wbaudit001
:: If you get DuplicateTable, run `python -m alembic stamp livetrack001` first,
:: then `upgrade head` — but THIS sprint adds COLUMNS not tables so it should NOT
:: trigger the duplicate-table dance like the V2 dashboard sprint did.

:: 5. Restart backend so the new columns + new routes register
::    (Ctrl+C the uvicorn, restart it)
uvicorn backend.main:app --reload --port 8000

:: 6. Wait 60s for one WBATNGL sync tick — recent trips will have
::    net_weight_actual filled in. The variance math needs that.

:: 7. Rebuild frontend
cd ..\frontend
npm run build

:: 8. Open /weighbridge-audit in the browser (admin or TRS account)
```

---

## Smoke-test endpoints

```bash
# (sign in as admin first, then add Authorization header)
curl -H "Authorization: Bearer <token>" 'http://localhost:8000/api/weighbridge-audit/v2/overview?range=today'
curl -H "Authorization: Bearer <token>" 'http://localhost:8000/api/weighbridge-audit/v2/overview?range=7d'
curl -H "Authorization: Bearer <token>" 'http://localhost:8000/api/weighbridge-audit/v2/log?range=today&filter=all&limit=24'
curl -H "Authorization: Bearer <token>" 'http://localhost:8000/api/weighbridge-audit/v2/log?range=today&filter=variance'
curl -H "Authorization: Bearer <token>" 'http://localhost:8000/api/weighbridge-audit/v2/log?range=today&filter=pending'
```

---

## Verify after deploy

- [ ] Sidebar shows **Weighbridge Audit** at position 4 (between Trip Management and Strategic Planning) for admin/TRS users
- [ ] PPC + Operator users do NOT see the entry
- [ ] Page loads cleanly — header shows title left + `[Shift A] [Today] [7d]` pills + `Export` button on right
- [ ] 4 KPI cards populate (after 60s of new sync data)
- [ ] Weighbridge log table populates; filter pills (All / Variance ≥ 0.3% / Pending) all work
- [ ] Variance histogram renders 11 bars with green/amber/red coloring
- [ ] Calibration card shows 3 rows (HMY1 / HMY2 / LRS1) with drift %; "last cal —"
- [ ] Recalibrate button fires a toast (doesn't crash)

---

## Rollback

If anything breaks:

- **Frontend** — admin can simply avoid the menu entry. No other pages affected.
- **Backend** — `weighbridge_audit.py` route is additive; no other code calls it. To fully unwind:
  ```cmd
  python -m alembic downgrade -1     :: drops the 2 new columns
  ```
  And revert `backend/utils/wbatngl_trip_sync.py` to drop the 2 dict keys.
