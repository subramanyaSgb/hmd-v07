"""
Heat Trace V1 — end-to-end BF→torpedo→SMS→caster trace for a single heat.

Tier 2 #1 of the HTS analytics roadmap (project_hts_analytics_roadmap.md).
Stitches all four mirror tables into one payload so an analyst drilling
into "why did heat X have bad yield" can see the BF tap that fed it.

Endpoints under `/api/heat-trace/v1/*`:
    GET /by-heat/{heat_no}    full 4-way join keyed by HTS heat_no
    GET /by-trip/{trip_id}    inverse: keyed by WBATNGL trip_id

The BF-side row is matched to the HTS row via the torpedo + a 6h time
window: the torpedo's BF exit (`wbatngl.out_date`) must fall within the
6h before its SMS arrival (`hts.torpedo_in_time`). One torpedo can feed
multiple heats per shift, so there's no 1-to-1 mapping — we pick the
WBATNGL row whose `out_date` is most recent within the window.

Design doc: docs/plans/2026-05-13-heat-trace-design.md
"""
from __future__ import annotations

from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database.engine import get_db
from ..database.models import (
    HCasterConsumptionMirror,
    HCasterHeatProcessMirror,
    HtsHeatMirror,
    User,
    WbatnglTripMirror,
)
from ..logger import logger
from ..utils.security import get_current_user_required


router = APIRouter(prefix="/api/heat-trace/v1", tags=["heat_trace"])


# How far back to look for the BF-side WBATNGL trip relative to the HTS
# torpedo_in_time. JSW's actual transit is ~30 min; 6h covers congested
# trips + any small clock skew between the two upstream DBs.
WBATNGL_LOOKBACK_HOURS = 6


# ── Helpers ──────────────────────────────────────────────────────

def _f(v):
    """Float coerce-or-None — repeated all over the place."""
    return float(v) if v is not None else None


def _iso(v):
    """isoformat-or-None — for datetimes."""
    return v.isoformat() if v is not None else None


def _find_bf_trip(db: Session, hts: HtsHeatMirror) -> Optional[WbatnglTripMirror]:
    """
    Match the BF-side trip that fed this heat.
    Window: WBATNGL out_date in (torpedo_in_time - 6h, torpedo_in_time].
    Picks the most recent such row (typical case: only one match anyway).
    """
    if not hts.torpedo_no or not hts.torpedo_in_time:
        return None
    window_start = hts.torpedo_in_time - timedelta(hours=WBATNGL_LOOKBACK_HOURS)
    return (
        db.query(WbatnglTripMirror)
        .filter(WbatnglTripMirror.fleet_id == hts.torpedo_no)
        .filter(WbatnglTripMirror.out_date.isnot(None))
        .filter(WbatnglTripMirror.out_date > window_start)
        .filter(WbatnglTripMirror.out_date <= hts.torpedo_in_time)
        .order_by(WbatnglTripMirror.out_date.desc())
        .first()
    )


def _build_bf_block(wb: Optional[WbatnglTripMirror]) -> Optional[dict]:
    if not wb:
        return None
    return {
        "trip_id":            wb.trip_id,
        "tap_no":             wb.tap_no,
        "tap_hole":           wb.tap_hole,
        "ladleno_raw":        wb.ladleno_raw,
        "source_lab":         wb.source_lab,
        "destination":        wb.destination,
        "shift":              wb.shift,
        "first_tare_time":    _iso(wb.first_tare_time),
        "out_date":           _iso(wb.out_date),
        "sms_ack_time":       _iso(wb.sms_ack_time),
        "closetime":          _iso(wb.closetime),
        "gross_weight":       _f(wb.gross_weight),
        "tare_weight":        _f(wb.tare_weight),
        "net_weight":         _f(wb.net_weight),
        "net_weight_actual":  _f(wb.net_weight_actual),
        "tare_weight_actual": _f(wb.tare_weight_actual),
        "temp":               _f(wb.temp),
        "s_l":                _f(wb.s_l),
        "si_l":               _f(wb.si_l),
        "bds_temp":           _f(wb.bds_temp),
    }


def _build_hts_block(hts: HtsHeatMirror) -> dict:
    return {
        "heat_no":          hts.heat_no,
        "torpedo_no":       hts.torpedo_no,
        "torpedo_no_raw":   hts.torpedo_no_raw,
        "sms":              hts.sms,
        "converter_no":     hts.converter_no,
        "hotmetal_qty":     _f(hts.hotmetal_qty),
        "torpedo_qty":      _f(hts.torpedo_qty),
        "torpedo_in_time":  _iso(hts.torpedo_in_time),
        "torpedo_out_time": _iso(hts.torpedo_out_time),
        "converter_life":   hts.converter_life,
    }


def _build_caster_block(proc: Optional[HCasterHeatProcessMirror]) -> Optional[dict]:
    if not proc:
        return None
    return {
        "sequence_id":      proc.sequence_id,
        "caster_date":      _iso(proc.caster_date),
        "shift":            proc.shift,
        "shift_incharge":   proc.shift_incharge,
        "p1_operator":      proc.p1_operator,
        "mould_operator":   proc.mould_operator,
        "tcm_operator":     proc.tcm_operator,
        "ladle_on_turret":  _iso(proc.ladle_on_turret),
        "ladle_open":       _iso(proc.ladle_open),
        "ladle_close":      _iso(proc.ladle_close),
        "cast_size":        _f(proc.cast_size),
        "cast_length":      _f(proc.cast_length),
        "cast_weight":      _f(proc.cast_weight),
        "no_of_slabs":      proc.no_of_slabs,
        "final_grade":      proc.final_grade,
        "delay_minutes":    _f(proc.delay_minutes),
        "remarks":          proc.remarks,
        "liqui_robotic_remarks": proc.liqui_robotic_remarks,
        "td_slag_depth":    _f(proc.td_slag_depth),
    }


def _build_consumption_block(cons: Optional[HCasterConsumptionMirror]) -> Optional[dict]:
    if not cons:
        return None
    return {
        "yield_pct":           _f(cons.yield_pct),
        "prime_slab":          _f(cons.prime_slab),
        "ladle_loss":          _f(cons.ladle_loss),
        "tun_loss":            _f(cons.tun_loss),
        "head_crop":           _f(cons.head_crop),
        "tail_crop":           _f(cons.tail_crop),
        "other_loss":          _f(cons.other_loss),
        "sample_loss":         _f(cons.sample_loss),
        "cut_loss":            _f(cons.cut_loss),
        "mill_scale_loss":     _f(cons.mill_scale_loss),
        "head_crop_loss_tons": _f(cons.head_crop_loss_tons),
        "tail_crop_tons":      _f(cons.tail_crop_tons),
        "sample_loss_tons":    _f(cons.sample_loss_tons),
        "other_loss_tons":     _f(cons.other_loss_tons),
        "casting_powder":      cons.casting_powder,
        "cp_consumed":         _f(cons.cp_consumed),
        "tun_powder":          _f(cons.tun_powder),
        "mbs_life":            cons.mbs_life,
        "sen_life":            cons.sen_life,
        "shrd_life":           cons.shrd_life,
    }


def _build_timeline(
    wb: Optional[WbatnglTripMirror],
    hts: HtsHeatMirror,
    proc: Optional[HCasterHeatProcessMirror],
) -> list[dict]:
    """
    Chronological list of stage events for the trace timeline UI.
    Each event: {key, label, at, location, kind}. Missing timestamps
    drop out — UI renders only present rows.
    """
    events = []
    if wb:
        if wb.first_tare_time:
            events.append({
                "key": "bf_tap",
                "label": "BF tap (first tare)",
                "at": _iso(wb.first_tare_time),
                "location": wb.source_lab,
                "kind": "bf",
            })
        if wb.out_date:
            events.append({
                "key": "bf_exit",
                "label": "BF exit",
                "at": _iso(wb.out_date),
                "location": wb.source_lab,
                "kind": "bf",
            })
        if wb.sms_ack_time:
            events.append({
                "key": "sms_ack",
                "label": "SMS ack",
                "at": _iso(wb.sms_ack_time),
                "location": wb.destination,
                "kind": "wb",
            })
    if hts.torpedo_in_time:
        events.append({
            "key": "hts_in",
            "label": "Torpedo arrived at SMS",
            "at": _iso(hts.torpedo_in_time),
            "location": f"{hts.sms or 'SMS'} converter {hts.converter_no or '?'}",
            "kind": "sms",
        })
    if hts.torpedo_out_time:
        events.append({
            "key": "hts_out",
            "label": "Torpedo emptied",
            "at": _iso(hts.torpedo_out_time),
            "location": f"{hts.sms or 'SMS'} converter {hts.converter_no or '?'}",
            "kind": "sms",
        })
    if proc:
        if proc.ladle_on_turret:
            events.append({
                "key": "ladle_on",
                "label": "Ladle on turret",
                "at": _iso(proc.ladle_on_turret),
                "location": "Caster",
                "kind": "caster",
            })
        if proc.ladle_open:
            events.append({
                "key": "ladle_open",
                "label": "Ladle open",
                "at": _iso(proc.ladle_open),
                "location": "Caster",
                "kind": "caster",
            })
        if proc.ladle_close:
            events.append({
                "key": "ladle_close",
                "label": "Ladle close",
                "at": _iso(proc.ladle_close),
                "location": "Caster",
                "kind": "caster",
            })
    # Sort by `at` to handle any clock-skew edge cases gracefully
    events.sort(key=lambda e: e["at"] or "")
    return events


def _gaps_summary(events: list[dict]) -> dict:
    """
    Compute key duration gaps from the timeline so the UI can render
    them without re-parsing dates. All gaps in minutes, None on missing
    endpoints.
    """
    from datetime import datetime as _dt
    by_key = {e["key"]: _dt.fromisoformat(e["at"]) for e in events if e.get("at")}

    def diff_min(k1, k2):
        a, b = by_key.get(k1), by_key.get(k2)
        if a and b:
            return round((b - a).total_seconds() / 60.0, 1)
        return None

    return {
        "transit_min":    diff_min("bf_exit", "hts_in"),   # BF exit → SMS arrival
        "dwell_min":      diff_min("hts_in",  "hts_out"),  # torpedo dwell at SMS
        "tap_to_cast_min": diff_min("bf_tap", "ladle_open"),
        "ladle_open_to_close_min": diff_min("ladle_open", "ladle_close"),
    }


# ── Endpoints ────────────────────────────────────────────────────

@router.get("/by-heat/{heat_no}")
def trace_by_heat(
    heat_no: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
):
    """
    Full BF→torpedo→SMS→caster trace anchored at a heat number.

    Returns 404 if the HTS row isn't in the mirror. Returns the trace
    payload with `bf_side=null` if no matching WBATNGL trip — that's a
    real condition (heat fed by an earlier WBATNGL row outside our
    6h window, or by a torpedo we don't currently mirror).
    """
    hts = (
        db.query(HtsHeatMirror)
        .filter(HtsHeatMirror.heat_no == heat_no)
        .first()
    )
    if not hts:
        raise HTTPException(404, f"No HTS row for heat {heat_no!r}")

    proc = (
        db.query(HCasterHeatProcessMirror)
        .filter(HCasterHeatProcessMirror.heat_no == heat_no)
        .first()
    )
    cons = (
        db.query(HCasterConsumptionMirror)
        .filter(HCasterConsumptionMirror.heatno == heat_no)
        .first()
    )
    wb = _find_bf_trip(db, hts)

    timeline = _build_timeline(wb, hts, proc)
    gaps     = _gaps_summary(timeline)

    return {
        "heat_no":     heat_no,
        "bf_side":     _build_bf_block(wb),
        "hts_arrival": _build_hts_block(hts),
        "caster":      _build_caster_block(proc),
        "consumption": _build_consumption_block(cons),
        "timeline":    timeline,
        "gaps":        gaps,
        "anchor":      "heat",
    }


@router.get("/by-trip/{trip_id}")
def trace_by_trip(
    trip_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user_required),
):
    """
    Inverse view — anchored at a WBATNGL trip_id. Finds the HTS row
    the torpedo fed into after this trip's `out_date`, then forwards
    to the same trace shape.

    A single trip can feed multiple heats if the SMS unloads the
    torpedo into more than one converter — we return the FIRST heat
    chronologically and include `additional_heats` for the rest.
    """
    wb = (
        db.query(WbatnglTripMirror)
        .filter(WbatnglTripMirror.trip_id == trip_id)
        .first()
    )
    if not wb:
        raise HTTPException(404, f"No WBATNGL trip {trip_id!r}")

    if not wb.fleet_id or not wb.out_date:
        # Trip is too early-stage to have a matching HTS heat yet
        return {
            "trip_id":  trip_id,
            "bf_side":  _build_bf_block(wb),
            "hts_arrival": None,
            "caster":   None,
            "consumption": None,
            "timeline": _build_timeline(wb, _NullHts(), None),
            "gaps":     {},
            "additional_heats": [],
            "anchor":   "trip",
        }

    # Forward window: heats arriving within 6h after this trip's BF exit
    window_end = wb.out_date + timedelta(hours=WBATNGL_LOOKBACK_HOURS)
    hts_rows = (
        db.query(HtsHeatMirror)
        .filter(HtsHeatMirror.torpedo_no == wb.fleet_id)
        .filter(HtsHeatMirror.torpedo_in_time.isnot(None))
        .filter(HtsHeatMirror.torpedo_in_time >= wb.out_date)
        .filter(HtsHeatMirror.torpedo_in_time <= window_end)
        .order_by(HtsHeatMirror.torpedo_in_time.asc())
        .all()
    )
    if not hts_rows:
        return {
            "trip_id":  trip_id,
            "bf_side":  _build_bf_block(wb),
            "hts_arrival": None,
            "caster":   None,
            "consumption": None,
            "timeline": _build_timeline(wb, _NullHts(), None),
            "gaps":     {},
            "additional_heats": [],
            "anchor":   "trip",
        }

    primary = hts_rows[0]
    proc = (
        db.query(HCasterHeatProcessMirror)
        .filter(HCasterHeatProcessMirror.heat_no == primary.heat_no)
        .first()
    )
    cons = (
        db.query(HCasterConsumptionMirror)
        .filter(HCasterConsumptionMirror.heatno == primary.heat_no)
        .first()
    )
    timeline = _build_timeline(wb, primary, proc)
    gaps     = _gaps_summary(timeline)

    additional = [
        {
            "heat_no":         h.heat_no,
            "sms":             h.sms,
            "converter_no":    h.converter_no,
            "torpedo_in_time": _iso(h.torpedo_in_time),
            "hotmetal_qty":    _f(h.hotmetal_qty),
        }
        for h in hts_rows[1:]
    ]

    return {
        "trip_id":     trip_id,
        "heat_no":     primary.heat_no,
        "bf_side":     _build_bf_block(wb),
        "hts_arrival": _build_hts_block(primary),
        "caster":      _build_caster_block(proc),
        "consumption": _build_consumption_block(cons),
        "timeline":    timeline,
        "gaps":        gaps,
        "additional_heats": additional,
        "anchor":      "trip",
    }


class _NullHts:
    """Stand-in for _build_timeline when there's no HTS row yet."""
    torpedo_in_time = None
    torpedo_out_time = None
    sms = None
    converter_no = None
