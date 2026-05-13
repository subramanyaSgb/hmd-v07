"""
SMS Performance V1 — backend for the new SMS Performance page.

Endpoints under `/api/sms-performance/v1/*`:
    GET /overview     — KPIs + yield trend + per-SMS / per-shift / per-grade breakdowns
    GET /loss-pareto  — loss-category Pareto (tonnes) + per-grade loss breakdown
    GET /heats        — paginated per-heat detail (for the bottom table)

Sources (populated by extended hts_sync.py):
    - h_caster_consumption_mirror   — yield_pct + loss columns
    - h_caster_heat_process_mirror  — caster_date, shift, final_grade (join key: heatno = heat_no)
    - hts_heat_mirror               — sms attribution (join: heatno = heat_no)

Yield target is configurable via SystemConfig key `SMS_YIELD_TARGET_PCT`
(default 96.0). Below-target counts in the KPI strip use this.

Roadmap: project_hts_analytics_roadmap.md (Tier 1 ships first)
Design doc: docs/plans/2026-05-13-sms-performance-design.md
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, cast, func
from sqlalchemy.orm import Session
from sqlalchemy.types import Numeric

from ..database.engine import get_db
from ..database.models import (
    HCasterConsumptionMirror,
    HCasterHeatProcessMirror,
    HtsHeatMirror,
    SystemConfig,
    User,
)
from ..logger import logger
from ..utils.security import get_current_user_required


router = APIRouter(prefix="/api/sms-performance/v1", tags=["sms_performance"])


DEFAULT_YIELD_TARGET_PCT = 96.0

# Loss categories presented in the Pareto. Mapped to the tonnage columns
# where they exist; otherwise we use the count column raw (units are
# upstream-defined — admins read both). Order chosen to match the
# typical operational story (top crops first, then secondary losses).
LOSS_CATEGORIES = [
    ("Head Crop",     "head_crop_loss_tons", "head_crop"),
    ("Tail Crop",     "tail_crop_tons",      "tail_crop"),
    ("Sample Loss",   "sample_loss_tons",    "sample_loss"),
    ("Other Loss",    "other_loss_tons",     "other_loss"),
    ("Ladle Loss",    None,                  "ladle_loss"),
    ("Tundish Loss",  None,                  "tun_loss"),
    ("Cut Loss",      None,                  "cut_loss"),
    ("Mill Scale",    None,                  "mill_scale_loss"),
]


# ── Helpers ──────────────────────────────────────────────────────

def _cutoff(range_param: str) -> datetime:
    """today / shift_a / 7d / 30d → start-of-window UTC datetime.

    Same window helper as weighbridge_audit, kept duplicated locally
    because the two pages may diverge on supported ranges and we want
    them independently editable.
    """
    now = datetime.utcnow()
    if range_param == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if range_param == "shift_a":
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
    if range_param == "30d":
        return now - timedelta(days=30)
    raise HTTPException(400, f"Invalid range: {range_param!r}")


def _yield_target(db: Session) -> float:
    """Read SMS_YIELD_TARGET_PCT from SystemConfig, falling back to 96.0.

    Defensive: SystemConfig schema varies slightly across DB ages in this
    codebase. If lookup fails we log + return the default — operators
    still see a working KPI strip rather than a 500.
    """
    try:
        row = db.query(SystemConfig).filter(
            SystemConfig.config_key == "SMS_YIELD_TARGET_PCT"
        ).first()
        if row and row.config_value is not None:
            return float(row.config_value)
    except Exception as e:
        logger.debug(f"SMS perf: yield-target lookup fell back to default ({e})")
    return DEFAULT_YIELD_TARGET_PCT


def _base_join(db: Session, since: datetime):
    """
    Common heat+consumption join filtered by caster_date >= since.
    Returns a Query that downstream endpoints aggregate on.
    """
    return (
        db.query(
            HCasterConsumptionMirror,
            HCasterHeatProcessMirror,
        )
        .join(
            HCasterHeatProcessMirror,
            HCasterConsumptionMirror.heatno == HCasterHeatProcessMirror.heat_no,
        )
        .filter(HCasterHeatProcessMirror.caster_date >= since)
    )


# ── Endpoints ────────────────────────────────────────────────────

@router.get("/overview")
def overview(
    range: str = Query("today", regex="^(today|shift_a|7d|30d)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
):
    """
    KPI strip + yield trend + per-SMS / per-shift / per-grade tables.

    Notes:
    - "avg_yield" is the simple mean of `yield_pct` per heat. Upstream
      stores it as a percentage (95.x–97.x typical).
    - "total_loss_tons" sums the four tonnage columns we have direct
      from upstream (head_crop, tail_crop, sample, other). Ladle/tundish
      and other count-based losses are surfaced separately in the
      Pareto endpoint because their units aren't tonnes.
    - "heats_below_target" counts heats where yield_pct < target. This
      is the leading indicator JSW operators watch first.
    """
    since = _cutoff(range)
    target = _yield_target(db)

    # KPI strip
    base_q = (
        db.query(
            func.count(HCasterConsumptionMirror.id).label("heats_total"),
            func.avg(HCasterConsumptionMirror.yield_pct).label("avg_yield"),
            func.max(HCasterConsumptionMirror.yield_pct).label("best_yield"),
            func.min(HCasterConsumptionMirror.yield_pct).label("worst_yield"),
            func.sum(
                func.coalesce(HCasterConsumptionMirror.head_crop_loss_tons, 0)
                + func.coalesce(HCasterConsumptionMirror.tail_crop_tons, 0)
                + func.coalesce(HCasterConsumptionMirror.sample_loss_tons, 0)
                + func.coalesce(HCasterConsumptionMirror.other_loss_tons, 0)
            ).label("total_loss_tons"),
            func.sum(
                case(
                    (HCasterConsumptionMirror.yield_pct < target, 1),
                    else_=0,
                )
            ).label("below_target"),
        )
        .join(
            HCasterHeatProcessMirror,
            HCasterConsumptionMirror.heatno == HCasterHeatProcessMirror.heat_no,
        )
        .filter(HCasterHeatProcessMirror.caster_date >= since)
    )
    k = base_q.one()
    heats_total = int(k.heats_total or 0)
    kpis = {
        "heats_total":         heats_total,
        "avg_yield_pct":       float(k.avg_yield)   if k.avg_yield   is not None else None,
        "best_yield_pct":      float(k.best_yield)  if k.best_yield  is not None else None,
        "worst_yield_pct":     float(k.worst_yield) if k.worst_yield is not None else None,
        "yield_target_pct":    target,
        "heats_below_target":  int(k.below_target or 0),
        "total_loss_tons":     float(k.total_loss_tons) if k.total_loss_tons is not None else 0.0,
    }

    # Yield trend — bucket by date
    trend_rows = (
        db.query(
            func.date(HCasterHeatProcessMirror.caster_date).label("d"),
            func.avg(HCasterConsumptionMirror.yield_pct).label("avg_y"),
            func.count(HCasterConsumptionMirror.id).label("heats"),
        )
        .join(
            HCasterHeatProcessMirror,
            HCasterConsumptionMirror.heatno == HCasterHeatProcessMirror.heat_no,
        )
        .filter(HCasterHeatProcessMirror.caster_date >= since)
        .group_by(func.date(HCasterHeatProcessMirror.caster_date))
        .order_by(func.date(HCasterHeatProcessMirror.caster_date))
        .all()
    )
    yield_trend = [
        {
            "date": r.d.isoformat() if hasattr(r.d, "isoformat") else str(r.d),
            "avg_yield": float(r.avg_y) if r.avg_y is not None else None,
            "heats": int(r.heats or 0),
        }
        for r in trend_rows
    ]

    # By SMS — join in hts_heat_mirror for SMS attribution
    by_sms_rows = (
        db.query(
            HtsHeatMirror.sms.label("sms"),
            func.count(HCasterConsumptionMirror.id).label("heats"),
            func.avg(HCasterConsumptionMirror.yield_pct).label("avg_y"),
            func.sum(
                func.coalesce(HCasterConsumptionMirror.head_crop_loss_tons, 0)
                + func.coalesce(HCasterConsumptionMirror.tail_crop_tons, 0)
                + func.coalesce(HCasterConsumptionMirror.sample_loss_tons, 0)
                + func.coalesce(HCasterConsumptionMirror.other_loss_tons, 0)
            ).label("loss_tons"),
        )
        .join(
            HCasterHeatProcessMirror,
            HCasterConsumptionMirror.heatno == HCasterHeatProcessMirror.heat_no,
        )
        .outerjoin(
            HtsHeatMirror,
            HCasterConsumptionMirror.heatno == HtsHeatMirror.heat_no,
        )
        .filter(HCasterHeatProcessMirror.caster_date >= since)
        .group_by(HtsHeatMirror.sms)
        .order_by(HtsHeatMirror.sms)
        .all()
    )
    by_sms = [
        {
            "sms":             r.sms or "Unattributed",
            "heats":           int(r.heats or 0),
            "avg_yield":       float(r.avg_y) if r.avg_y is not None else None,
            "total_loss_tons": float(r.loss_tons) if r.loss_tons is not None else 0.0,
        }
        for r in by_sms_rows
    ]

    # By shift
    by_shift_rows = (
        db.query(
            HCasterHeatProcessMirror.shift.label("shift"),
            func.count(HCasterConsumptionMirror.id).label("heats"),
            func.avg(HCasterConsumptionMirror.yield_pct).label("avg_y"),
        )
        .join(
            HCasterHeatProcessMirror,
            HCasterConsumptionMirror.heatno == HCasterHeatProcessMirror.heat_no,
        )
        .filter(HCasterHeatProcessMirror.caster_date >= since)
        .group_by(HCasterHeatProcessMirror.shift)
        .order_by(HCasterHeatProcessMirror.shift)
        .all()
    )
    by_shift = [
        {
            "shift":     r.shift or "Unknown",
            "heats":     int(r.heats or 0),
            "avg_yield": float(r.avg_y) if r.avg_y is not None else None,
        }
        for r in by_shift_rows
    ]

    # By grade (top 8 by heat count)
    by_grade_rows = (
        db.query(
            HCasterHeatProcessMirror.final_grade.label("grade"),
            func.count(HCasterConsumptionMirror.id).label("heats"),
            func.avg(HCasterConsumptionMirror.yield_pct).label("avg_y"),
        )
        .join(
            HCasterHeatProcessMirror,
            HCasterConsumptionMirror.heatno == HCasterHeatProcessMirror.heat_no,
        )
        .filter(HCasterHeatProcessMirror.caster_date >= since)
        .filter(HCasterHeatProcessMirror.final_grade.isnot(None))
        .group_by(HCasterHeatProcessMirror.final_grade)
        .order_by(func.count(HCasterConsumptionMirror.id).desc())
        .limit(8)
        .all()
    )
    by_grade = [
        {
            "grade":     r.grade,
            "heats":     int(r.heats or 0),
            "avg_yield": float(r.avg_y) if r.avg_y is not None else None,
        }
        for r in by_grade_rows
    ]

    return {
        "range":        range,
        "since":        since.isoformat(),
        "kpis":         kpis,
        "yield_trend":  yield_trend,
        "by_sms":       by_sms,
        "by_shift":     by_shift,
        "by_grade":     by_grade,
    }


@router.get("/loss-pareto")
def loss_pareto(
    range: str = Query("today", regex="^(today|shift_a|7d|30d)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
):
    """
    Pareto of loss categories (sorted desc by tonnage or count fallback).

    Two kinds of loss columns upstream:
      - tonnage cols (e.g. head_crop_loss_tons) — directly summable
      - count cols   (e.g. ladle_loss) — units unclear, surfaced as-is
        with note=`count` so the frontend can render them in a second
        section / different units label.

    Heats with NULL on a given column contribute 0; missing-data noise
    won't artificially inflate any category.
    """
    since = _cutoff(range)

    base = (
        db.query(HCasterConsumptionMirror)
        .join(
            HCasterHeatProcessMirror,
            HCasterConsumptionMirror.heatno == HCasterHeatProcessMirror.heat_no,
        )
        .filter(HCasterHeatProcessMirror.caster_date >= since)
    )
    heats_count = base.count()

    categories = []
    total_tons = 0.0
    for label, tons_col, count_col in LOSS_CATEGORIES:
        if tons_col:
            # Sum the tonnage column for this category.
            col_attr = getattr(HCasterConsumptionMirror, tons_col)
            total = (
                db.query(func.sum(func.coalesce(col_attr, 0)))
                .join(
                    HCasterHeatProcessMirror,
                    HCasterConsumptionMirror.heatno == HCasterHeatProcessMirror.heat_no,
                )
                .filter(HCasterHeatProcessMirror.caster_date >= since)
                .scalar()
            )
            val = float(total or 0.0)
            categories.append({
                "label": label,
                "tonnes": val,
                "count_value": None,
                "units": "tonnes",
            })
            total_tons += val
        else:
            # No tonnage column — surface the raw count sum with note.
            col_attr = getattr(HCasterConsumptionMirror, count_col)
            total = (
                db.query(func.sum(func.coalesce(col_attr, 0)))
                .join(
                    HCasterHeatProcessMirror,
                    HCasterConsumptionMirror.heatno == HCasterHeatProcessMirror.heat_no,
                )
                .filter(HCasterHeatProcessMirror.caster_date >= since)
                .scalar()
            )
            categories.append({
                "label": label,
                "tonnes": None,
                "count_value": float(total or 0.0),
                "units": "count",
            })

    # Compute % share for tonnes-class categories
    for c in categories:
        if c["units"] == "tonnes" and total_tons > 0:
            c["pct_of_total"] = round(100.0 * c["tonnes"] / total_tons, 2)
        else:
            c["pct_of_total"] = None

    # Sort tonnes-class desc by value; count-class trails behind in
    # original definition order (so the UI naturally groups them).
    tons_cats = [c for c in categories if c["units"] == "tonnes"]
    cnt_cats  = [c for c in categories if c["units"] == "count"]
    tons_cats.sort(key=lambda c: (c["tonnes"] or 0), reverse=True)
    sorted_cats = tons_cats + cnt_cats

    # Per-grade Pareto (top 6 by total loss tonnes)
    by_grade_rows = (
        db.query(
            HCasterHeatProcessMirror.final_grade.label("grade"),
            func.count(HCasterConsumptionMirror.id).label("heats"),
            func.sum(
                func.coalesce(HCasterConsumptionMirror.head_crop_loss_tons, 0)
                + func.coalesce(HCasterConsumptionMirror.tail_crop_tons, 0)
                + func.coalesce(HCasterConsumptionMirror.sample_loss_tons, 0)
                + func.coalesce(HCasterConsumptionMirror.other_loss_tons, 0)
            ).label("loss_tons"),
        )
        .join(
            HCasterHeatProcessMirror,
            HCasterConsumptionMirror.heatno == HCasterHeatProcessMirror.heat_no,
        )
        .filter(HCasterHeatProcessMirror.caster_date >= since)
        .filter(HCasterHeatProcessMirror.final_grade.isnot(None))
        .group_by(HCasterHeatProcessMirror.final_grade)
        .order_by(func.sum(
            func.coalesce(HCasterConsumptionMirror.head_crop_loss_tons, 0)
            + func.coalesce(HCasterConsumptionMirror.tail_crop_tons, 0)
            + func.coalesce(HCasterConsumptionMirror.sample_loss_tons, 0)
            + func.coalesce(HCasterConsumptionMirror.other_loss_tons, 0)
        ).desc())
        .limit(6)
        .all()
    )
    by_grade = [
        {
            "grade":           r.grade,
            "heats":           int(r.heats or 0),
            "total_loss_tons": float(r.loss_tons) if r.loss_tons is not None else 0.0,
        }
        for r in by_grade_rows
    ]

    return {
        "range":           range,
        "since":           since.isoformat(),
        "heats_count":     heats_count,
        "total_loss_tons": round(total_tons, 3),
        "categories":      sorted_cats,
        "by_grade":        by_grade,
    }


@router.get("/heats")
def heats(
    range: str = Query("today", regex="^(today|shift_a|7d|30d)$"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    sms: Optional[str] = Query(None, description="Filter by SMS (e.g. 'SMS-2')"),
    shift: Optional[str] = Query(None, regex="^[ABCD]$"),
    below_target_only: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
):
    """
    Paginated per-heat detail rows for the bottom-of-page table.

    Returns one row per heat with combined process + consumption +
    sms columns. Frontend lets analyst sort/filter for "explain a bad
    yield day" workflow.
    """
    since = _cutoff(range)
    target = _yield_target(db)

    q = (
        db.query(
            HCasterHeatProcessMirror.heat_no.label("heat_no"),
            HCasterHeatProcessMirror.caster_date.label("caster_date"),
            HCasterHeatProcessMirror.shift.label("shift"),
            HCasterHeatProcessMirror.final_grade.label("grade"),
            HCasterHeatProcessMirror.shift_incharge.label("shift_incharge"),
            HCasterHeatProcessMirror.cast_weight.label("cast_weight"),
            HCasterHeatProcessMirror.delay_minutes.label("delay_minutes"),
            HCasterConsumptionMirror.yield_pct.label("yield_pct"),
            HCasterConsumptionMirror.head_crop_loss_tons.label("head_crop_loss_tons"),
            HCasterConsumptionMirror.tail_crop_tons.label("tail_crop_tons"),
            HCasterConsumptionMirror.sample_loss_tons.label("sample_loss_tons"),
            HCasterConsumptionMirror.other_loss_tons.label("other_loss_tons"),
            HtsHeatMirror.sms.label("sms"),
            HtsHeatMirror.converter_no.label("converter_no"),
        )
        .join(
            HCasterConsumptionMirror,
            HCasterConsumptionMirror.heatno == HCasterHeatProcessMirror.heat_no,
        )
        .outerjoin(
            HtsHeatMirror,
            HtsHeatMirror.heat_no == HCasterHeatProcessMirror.heat_no,
        )
        .filter(HCasterHeatProcessMirror.caster_date >= since)
    )

    if sms:
        q = q.filter(HtsHeatMirror.sms == sms)
    if shift:
        q = q.filter(HCasterHeatProcessMirror.shift == shift)
    if below_target_only:
        q = q.filter(HCasterConsumptionMirror.yield_pct < target)

    total = q.count()
    rows = (
        q.order_by(HCasterHeatProcessMirror.caster_date.desc())
        .offset(offset).limit(limit).all()
    )

    return {
        "range":  range,
        "since":  since.isoformat(),
        "total":  total,
        "limit":  limit,
        "offset": offset,
        "target_pct": target,
        "heats": [
            {
                "heat_no":             r.heat_no,
                "caster_date":         r.caster_date.isoformat() if r.caster_date else None,
                "shift":               r.shift,
                "grade":               r.grade,
                "shift_incharge":      r.shift_incharge,
                "cast_weight":         float(r.cast_weight)   if r.cast_weight   is not None else None,
                "delay_minutes":       float(r.delay_minutes) if r.delay_minutes is not None else None,
                "yield_pct":           float(r.yield_pct)     if r.yield_pct     is not None else None,
                "head_crop_loss_tons": float(r.head_crop_loss_tons) if r.head_crop_loss_tons is not None else None,
                "tail_crop_tons":      float(r.tail_crop_tons)      if r.tail_crop_tons      is not None else None,
                "sample_loss_tons":    float(r.sample_loss_tons)    if r.sample_loss_tons    is not None else None,
                "other_loss_tons":     float(r.other_loss_tons)     if r.other_loss_tons     is not None else None,
                "sms":                 r.sms,
                "converter_no":        r.converter_no,
                "below_target":        (r.yield_pct is not None and float(r.yield_pct) < target),
            }
            for r in rows
        ],
    }
