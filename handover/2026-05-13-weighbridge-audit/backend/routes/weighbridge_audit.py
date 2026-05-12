"""
Weighbridge Audit V2 — backend for the new Weighbridge Audit page.

Two endpoints under `/api/weighbridge-audit/v2/*`:
    GET /overview      — KPIs + 11-bin variance histogram + per-WB drift
    GET /log           — per-trip table rows for the left side of the page

Source: `wbatngl_trip_mirror` (extended in migration wbaudit001 to capture
`net_weight_actual` + `tare_weight_actual` from the upstream Oracle).
Variance = ((net_weight − net_weight_actual) / net_weight) × 100.
Threshold for "Open variance" / "Review" status = 0.3%.

WB derivation (source_lab → physical weighbridge): hardcoded mapping
matches the design idea's track edges + JSW Vijaynagar plant layout:
    BF3 → WB HMY1
    BF4 → WB HMY2
    BF5 → WB LRS1

Design doc: docs/plans/2026-05-13-weighbridge-audit-design.md
"""
from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from ..database.engine import get_db
from ..database.models import User, WbatnglTripMirror
from ..logger import logger
from ..utils.security import get_current_user_required


router = APIRouter(prefix="/api/weighbridge-audit/v2", tags=["weighbridge_audit"])


VARIANCE_THRESHOLD_PCT = 0.3
DRIFT_WINDOW_DAYS      = 30


# ── Helpers ──────────────────────────────────────────────────────

def _cutoff(range_param: str) -> datetime:
    """today / shift_a / 7d → start-of-window UTC datetime."""
    now = datetime.utcnow()
    if range_param == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if range_param == "shift_a":
        # Shift A is 06:00-14:00 IST. UTC = IST - 5:30, so 00:30 UTC.
        # We render the analyst's local "Today's Shift A" view — if it's
        # past 14:00 IST, the shift just ended; if it's before 06:00 IST,
        # we look at YESTERDAY's shift A.
        ist_now = now + timedelta(hours=5, minutes=30)
        if ist_now.hour >= 6:
            ist_start = ist_now.replace(hour=6, minute=0, second=0, microsecond=0)
        else:
            ist_start = (ist_now - timedelta(days=1)).replace(
                hour=6, minute=0, second=0, microsecond=0
            )
        return ist_start - timedelta(hours=5, minutes=30)
    if range_param == "7d":
        return now - timedelta(days=7)
    raise HTTPException(400, f"Invalid range: {range_param!r}")


def _wb_from_source(source_lab: Optional[str]) -> Optional[str]:
    """
    Map a producer source_lab to its physical weighbridge name. Heuristic
    convention matching the design idea + JSW Vijaynagar plant track edges.
    Inline comment intentional — if an admin reports the wrong WB on a
    trip, this is the single source of truth to revise.

    COREX mapping added 2026-05-13 after data audit confirmed `COREX1` /
    `COREX2` show up in `source_lab` (~12K trips historical). Corex is
    physically located in the HMY area — one sample row's `location`
    field literally said "At HMY2 - Corex Point No.125". Split evenly
    across HMY1/HMY2 until JSW confirms the actual routing.
    """
    if not source_lab:
        return None
    s = source_lab.strip().upper().replace(" ", "")
    if s in ("BF3", "BF03"):
        return "WB HMY1"
    if s in ("BF4", "BF04"):
        return "WB HMY2"
    if s in ("BF5", "BF05"):
        return "WB LRS1"
    if s in ("COREX1", "COREX01", "COREX-1"):
        return "WB HMY1"
    if s in ("COREX2", "COREX02", "COREX-2"):
        return "WB HMY2"
    return None


def _variance_pct(net_wb: Optional[float], net_sms: Optional[float]) -> Optional[float]:
    """(NET_WB - NET_SMS) / NET_WB * 100. Returns None on missing / zero."""
    if net_wb is None or net_sms is None:
        return None
    if not net_wb or net_wb <= 0:
        return None
    return round((float(net_wb) - float(net_sms)) / float(net_wb) * 100.0, 2)


def _status_for(variance_pct: Optional[float]) -> str:
    """OK if |variance| < 0.3, else Review. None (no SMS reading yet) = Review."""
    if variance_pct is None:
        return "Review"
    if abs(variance_pct) < VARIANCE_THRESHOLD_PCT:
        return "OK"
    return "Review"


# ── Cache (60s overview, 30s log) ────────────────────────────────

_CACHE: dict = {}
_OVERVIEW_TTL_SEC = 60.0
_LOG_TTL_SEC = 30.0


def _cache_get(key: str, ttl: float) -> Optional[dict]:
    entry = _CACHE.get(key)
    if not entry:
        return None
    if (time.monotonic() - entry["at"]) >= ttl:
        return None
    return entry["data"]


def _cache_set(key: str, data: dict) -> None:
    _CACHE[key] = {"at": time.monotonic(), "data": data}


# ── /overview ────────────────────────────────────────────────────

@router.get("/overview")
def overview(
    range: str = Query("today", regex="^(today|shift_a|7d)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    cache_key = f"wbaudit:overview:{range}"
    cached = _cache_get(cache_key, _OVERVIEW_TTL_SEC)
    if cached:
        return cached

    cutoff = _cutoff(range)

    # All in-window rows that have both BF and SMS readings (the
    # reconciliation universe). Trips with no SMS ack yet are excluded
    # from variance math but counted separately as "pending".
    rows = db.query(
        WbatnglTripMirror.id,
        WbatnglTripMirror.source_lab,
        WbatnglTripMirror.net_weight,
        WbatnglTripMirror.net_weight_actual,
    ).filter(
        WbatnglTripMirror.closetime >= cutoff,
        WbatnglTripMirror.net_weight.isnot(None),
    ).all()

    total_in_window = len(rows)
    reconciled = []
    pending = 0
    for _id, src, nwb, nsms in rows:
        if nsms is None:
            pending += 1
            continue
        v = _variance_pct(nwb, nsms)
        if v is not None:
            reconciled.append((src, v, float(nwb)))

    n_recon = len(reconciled)
    n_open = sum(1 for _, v, _ in reconciled if abs(v) >= VARIANCE_THRESHOLD_PCT)
    avg_var = (
        sum(v for _, v, _ in reconciled) / n_recon if n_recon else 0.0
    )
    total_dispatched_t = sum(nwb for _, _, nwb in reconciled)
    total_dispatched_kt = round(total_dispatched_t / 1000.0, 1)

    # 11 bins from -0.6 to +0.6 (step 0.2). Tone:
    #   |label| <= 0.2 → green (in spec, low drift)
    #   |label| == 0.3 / 0.4 → amber
    #   |label| >= 0.5 → red
    edges = [-0.6, -0.4, -0.3, -0.2, -0.1, 0.0, 0.1, 0.2, 0.3, 0.4, 0.6]
    bin_counts = [0] * len(edges)
    for _, v, _ in reconciled:
        if v <= edges[0]:
            bin_counts[0] += 1
        elif v >= edges[-1]:
            bin_counts[-1] += 1
        else:
            # find the closest edge
            for i, e in enumerate(edges):
                if v < e:
                    bin_counts[max(0, i - 1)] += 1
                    break
    def _tone(label: float) -> str:
        a = abs(label)
        if a >= 0.5: return "red"
        if a >= 0.3: return "amber"
        return "green"
    histogram = [
        {
            "label": f"{'+' if e > 0 else ''}{e:g}",
            "count": bin_counts[i],
            "tone":  _tone(e),
        }
        for i, e in enumerate(edges)
    ]

    # Per-WB drift over last DRIFT_WINDOW_DAYS days (independent of `range`)
    drift_cutoff = datetime.utcnow() - timedelta(days=DRIFT_WINDOW_DAYS)
    drift_rows = db.query(
        WbatnglTripMirror.source_lab,
        WbatnglTripMirror.net_weight,
        WbatnglTripMirror.net_weight_actual,
    ).filter(
        WbatnglTripMirror.closetime >= drift_cutoff,
        WbatnglTripMirror.net_weight.isnot(None),
        WbatnglTripMirror.net_weight_actual.isnot(None),
    ).all()
    by_wb: dict[str, list[float]] = {"WB HMY1": [], "WB HMY2": [], "WB LRS1": []}
    for src, nwb, nsms in drift_rows:
        wb = _wb_from_source(src)
        if wb is None or wb not in by_wb:
            continue
        v = _variance_pct(nwb, nsms)
        if v is not None:
            by_wb[wb].append(v)
    calibrations = []
    for wb, vals in by_wb.items():
        drift = (sum(vals) / len(vals)) if vals else None
        tone = "green"
        if drift is not None and abs(drift) >= 0.15:
            tone = "amber"
        if drift is not None and abs(drift) >= 0.30:
            tone = "red"
        calibrations.append({
            "wb": wb,
            "drift_pct": round(drift, 2) if drift is not None else None,
            "tone": tone,
            "last_cal_date": None,                                       # no source — Option A per design doc
            "sample_size": len(vals),
        })

    payload = {
        "range": range,
        "kpis": {
            "trips_reconciled": {"value": n_recon, "total": total_in_window},
            "open_variances":   {"value": n_open, "threshold_pct": VARIANCE_THRESHOLD_PCT},
            "avg_variance_pct": round(avg_var, 2),
            "total_dispatched_kt": total_dispatched_kt,
            "pending": pending,
        },
        "variance_histogram": {"bins": histogram},
        "calibrations": calibrations,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
    _cache_set(cache_key, payload)
    return payload


# ── /log ─────────────────────────────────────────────────────────

@router.get("/log")
def log(
    range: str = Query("today", regex="^(today|shift_a|7d)$"),
    filter: str = Query("all", regex="^(all|variance|pending)$"),
    limit: int = Query(24, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    cache_key = f"wbaudit:log:{range}:{filter}:{limit}"
    cached = _cache_get(cache_key, _LOG_TTL_SEC)
    if cached:
        return cached

    cutoff = _cutoff(range)

    qry = db.query(WbatnglTripMirror).filter(
        WbatnglTripMirror.closetime >= cutoff,
        WbatnglTripMirror.net_weight.isnot(None),
    ).order_by(WbatnglTripMirror.closetime.desc())

    # Pre-filter by status (so the row count matches the visible page)
    if filter == "pending":
        qry = qry.filter(WbatnglTripMirror.net_weight_actual.is_(None))
    # `variance` filter requires the variance computation; do it in Python
    # below since SQL would re-do the same divide-by-zero guard.

    raw_rows = qry.limit(limit * 3 if filter == "variance" else limit).all()

    out_rows = []
    for r in raw_rows:
        v = _variance_pct(r.net_weight, r.net_weight_actual)
        status = _status_for(v)
        if filter == "variance" and (v is None or abs(v) < VARIANCE_THRESHOLD_PCT):
            continue
        out_rows.append({
            "time":     r.closetime.isoformat() if r.closetime else None,
            "wb":       _wb_from_source(r.source_lab) or r.source_lab,
            "trip_id":  r.trip_id,
            "tap_no":   r.tap_no,
            "fleet_id": r.fleet_id,
            "source_lab": r.source_lab,
            "gross_weight": float(r.gross_weight) if r.gross_weight is not None else None,
            "tare_weight":  float(r.tare_weight)  if r.tare_weight  is not None else None,
            "net_weight":   float(r.net_weight)   if r.net_weight   is not None else None,
            "net_weight_actual": (
                float(r.net_weight_actual) if r.net_weight_actual is not None else None
            ),
            "variance_pct": v,
            "status": status,
        })
        if len(out_rows) >= limit:
            break

    payload = {
        "range": range,
        "filter": filter,
        "rows": out_rows,
        "limit": limit,
    }
    _cache_set(cache_key, payload)
    return payload
