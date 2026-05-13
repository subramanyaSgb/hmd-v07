import React, { useEffect, useState } from 'react';
import { X, ChevronRight, Factory, Truck, Flame, Layers } from 'lucide-react';
import { api } from '../../utils/api';

/**
 * Heat Trace drawer — end-to-end BF → torpedo → SMS → caster trace
 * for one heat. Tier 2 #1 of the HTS analytics roadmap.
 *
 * Triggered by clicking a row in HeatsTable. Slides in from the right
 * over the page content (350px wide, content scrolls internally).
 *
 * Sections (top → bottom):
 *   1. Header — heat_no + close button
 *   2. Outcome strip — yield + grade + cast weight + delay
 *   3. Stage cards (4) — BF tap · Torpedo trip · SMS arrival · Caster
 *   4. Timeline — chronological events
 *   5. Gap summary — transit / dwell / tap→cast minutes
 *   6. Losses + consumption
 *   7. REMARKS (if any)
 */
const HeatTraceDrawer = ({ heatNo, onClose }) => {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);

    useEffect(() => {
        if (!heatNo) return;
        setLoading(true);
        setData(null);
        setError(null);
        api.get(`/api/heat-trace/v1/by-heat/${encodeURIComponent(heatNo)}`)
            .then(resp => { setData(resp); setLoading(false); })
            .catch(err => { setError(err); setLoading(false); });
    }, [heatNo]);

    if (!heatNo) return null;

    return (
        <>
            <div className="smsperf-drawer-backdrop" onClick={onClose} />
            <aside className="smsperf-drawer">
                <header className="smsperf-drawer-h">
                    <button
                        type="button"
                        className="smsperf-drawer-close"
                        onClick={onClose}
                        aria-label="Close trace drawer"
                    >
                        <X size={16} />
                    </button>
                    <div className="smsperf-drawer-h-meta">
                        <div className="smsperf-drawer-h-label">HEAT TRACE</div>
                        <div className="smsperf-drawer-h-id">{heatNo}</div>
                    </div>
                </header>

                <div className="smsperf-drawer-body">
                    {loading && <div className="smsperf-empty">Loading trace…</div>}
                    {error && (
                        <div className="smsperf-empty smsperf-cell-amber">
                            Could not load trace — {error.message || 'unknown error'}
                        </div>
                    )}
                    {data && <TraceBody t={data} />}
                </div>
            </aside>
        </>
    );
};

const TraceBody = ({ t }) => {
    const c = t.caster;
    const k = t.consumption;
    return (
        <>
            {/* OUTCOME STRIP */}
            <div className="smsperf-trace-outcome">
                <Outcome label="Yield" value={k?.yield_pct != null ? `${k.yield_pct.toFixed(2)}%` : '—'}
                         tone={k?.yield_pct != null && k.yield_pct < 96 ? 'amber' : 'green'} />
                <Outcome label="Grade" value={c?.final_grade || '—'} />
                <Outcome label="Cast" value={c?.cast_weight != null ? `${c.cast_weight.toFixed(1)} t` : '—'} />
                <Outcome label="Delay" value={c?.delay_minutes != null ? `${c.delay_minutes.toFixed(0)}m` : '—'}
                         tone={c?.delay_minutes != null && c.delay_minutes > 10 ? 'amber' : null} />
            </div>

            {/* STAGE CARDS */}
            <StageCard
                icon={<Factory size={14} />}
                title="BF tap"
                empty={!t.bf_side}
                emptyText="No matching WBATNGL row (heat fed by torpedo outside the 6h window)"
            >
                {t.bf_side && (
                    <>
                        <Row k="Source"   v={t.bf_side.source_lab || '—'} />
                        <Row k="Tap #"    v={t.bf_side.tap_no != null ? `${t.bf_side.tap_no} · TH ${t.bf_side.tap_hole || '?'}` : '—'} />
                        <Row k="First tare" v={fmtTime(t.bf_side.first_tare_time)} />
                        <Row k="Exit BF"  v={fmtTime(t.bf_side.out_date)} />
                        <Row k="Net wt"   v={t.bf_side.net_weight != null ? `${t.bf_side.net_weight.toFixed(1)} t` : '—'} />
                        <Row k="Temp"     v={t.bf_side.temp != null ? `${Math.round(t.bf_side.temp)} °C` : '—'}
                             warn={t.bf_side.temp != null && t.bf_side.temp < 1450} />
                        <Row k="S / Si"   v={`${t.bf_side.s_l != null ? t.bf_side.s_l.toFixed(3) : '—'} / ${t.bf_side.si_l != null ? t.bf_side.si_l.toFixed(2) : '—'}`}
                             warn={t.bf_side.s_l != null && t.bf_side.s_l > 0.05} />
                    </>
                )}
            </StageCard>

            <StageCard
                icon={<Truck size={14} />}
                title="Torpedo trip"
                empty={!t.hts_arrival.torpedo_no}
            >
                <Row k="Torpedo"  v={t.hts_arrival.torpedo_no || '—'} />
                <Row k="To"       v={`${t.hts_arrival.sms || 'SMS'} · Conv ${t.hts_arrival.converter_no || '?'}`} />
                <Row k="Arrive"   v={fmtTime(t.hts_arrival.torpedo_in_time)} />
                <Row k="Empty"    v={fmtTime(t.hts_arrival.torpedo_out_time)} />
                <Row k="HM qty"   v={t.hts_arrival.hotmetal_qty != null ? `${t.hts_arrival.hotmetal_qty.toFixed(1)} t` : '—'} />
                <Row k="Torp qty" v={t.hts_arrival.torpedo_qty != null ? `${t.hts_arrival.torpedo_qty.toFixed(1)} t` : '—'} />
            </StageCard>

            <StageCard
                icon={<Flame size={14} />}
                title="SMS / Caster"
                empty={!t.caster}
                emptyText="No caster process row mirrored yet"
            >
                {t.caster && (
                    <>
                        <Row k="Sequence" v={t.caster.sequence_id || '—'} />
                        <Row k="Shift"    v={`${t.caster.shift || '—'} · ${t.caster.shift_incharge || '—'}`} />
                        <Row k="P1 Op"    v={t.caster.p1_operator || '—'} />
                        <Row k="Ladle on"   v={fmtTime(t.caster.ladle_on_turret)} />
                        <Row k="Ladle open" v={fmtTime(t.caster.ladle_open)} />
                        <Row k="Ladle close" v={fmtTime(t.caster.ladle_close)} />
                        <Row k="Slabs"    v={t.caster.no_of_slabs != null ? `${t.caster.no_of_slabs}` : '—'} />
                        <Row k="Cast size" v={t.caster.cast_size != null ? `${t.caster.cast_size.toFixed(0)}` : '—'} />
                    </>
                )}
            </StageCard>

            <StageCard
                icon={<Layers size={14} />}
                title="Losses & consumption"
                empty={!t.consumption}
            >
                {t.consumption && (
                    <>
                        <Row k="Head crop" v={t.consumption.head_crop_loss_tons != null ? `${t.consumption.head_crop_loss_tons.toFixed(2)} t` : '—'} />
                        <Row k="Tail crop" v={t.consumption.tail_crop_tons != null ? `${t.consumption.tail_crop_tons.toFixed(2)} t` : '—'} />
                        <Row k="Sample"    v={t.consumption.sample_loss_tons != null ? `${t.consumption.sample_loss_tons.toFixed(2)} t` : '—'} />
                        <Row k="Other"     v={t.consumption.other_loss_tons != null ? `${t.consumption.other_loss_tons.toFixed(2)} t` : '—'} />
                        <Row k="Prime slab" v={t.consumption.prime_slab != null ? `${t.consumption.prime_slab.toFixed(2)} t` : '—'} />
                        <Row k="Powder"    v={t.consumption.casting_powder || '—'} />
                        <Row k="CP cons."  v={t.consumption.cp_consumed != null ? `${t.consumption.cp_consumed.toFixed(2)}` : '—'} />
                        <Row k="MBS / SEN / SHRD"
                             v={`${t.consumption.mbs_life ?? '—'} / ${t.consumption.sen_life ?? '—'} / ${t.consumption.shrd_life ?? '—'}`} />
                    </>
                )}
            </StageCard>

            {/* GAP SUMMARY */}
            <div className="smsperf-trace-section">
                <div className="smsperf-trace-section-h">DURATIONS</div>
                <div className="smsperf-trace-gaps">
                    <GapBlock label="Transit"    value={t.gaps?.transit_min} unit="min" />
                    <GapBlock label="SMS dwell"  value={t.gaps?.dwell_min} unit="min" />
                    <GapBlock label="Tap → cast" value={t.gaps?.tap_to_cast_min} unit="min" />
                    <GapBlock label="Cast (open→close)" value={t.gaps?.ladle_open_to_close_min} unit="min" />
                </div>
            </div>

            {/* TIMELINE */}
            <div className="smsperf-trace-section">
                <div className="smsperf-trace-section-h">TIMELINE</div>
                <ol className="smsperf-trace-timeline">
                    {(t.timeline || []).map((e, i) => (
                        <li key={i} className={`smsperf-trace-event smsperf-trace-event-${e.kind}`}>
                            <span className="smsperf-trace-event-time smsperf-mono">
                                {fmtTime(e.at)}
                            </span>
                            <span className="smsperf-trace-event-label">
                                {e.label}
                                {e.location && (
                                    <span className="smsperf-dim"> · {e.location}</span>
                                )}
                            </span>
                        </li>
                    ))}
                    {(!t.timeline || t.timeline.length === 0) && (
                        <li className="smsperf-empty-row">No timestamped events.</li>
                    )}
                </ol>
            </div>

            {/* REMARKS */}
            {(c?.remarks || c?.liqui_robotic_remarks) && (
                <div className="smsperf-trace-section">
                    <div className="smsperf-trace-section-h">REMARKS</div>
                    {c.remarks && (
                        <p className="smsperf-trace-remark">{c.remarks}</p>
                    )}
                    {c.liqui_robotic_remarks && (
                        <p className="smsperf-trace-remark smsperf-dim">
                            <strong>Robotic:</strong> {c.liqui_robotic_remarks}
                        </p>
                    )}
                </div>
            )}
        </>
    );
};

const Outcome = ({ label, value, tone }) => (
    <div className="smsperf-trace-outcome-cell">
        <div className="smsperf-trace-outcome-l">{label}</div>
        <div className={`smsperf-trace-outcome-v ${tone ? 'smsperf-trace-' + tone : ''}`}>{value}</div>
    </div>
);

const StageCard = ({ icon, title, empty, emptyText, children }) => (
    <section className="smsperf-trace-card">
        <header className="smsperf-trace-card-h">
            {icon}
            <span>{title}</span>
        </header>
        <div className="smsperf-trace-card-body">
            {empty
                ? <div className="smsperf-empty-row">{emptyText || 'No data'}</div>
                : children}
        </div>
    </section>
);

const Row = ({ k, v, warn }) => (
    <div className="smsperf-trace-kv">
        <span className="smsperf-trace-kv-k">{k}</span>
        <span className={`smsperf-trace-kv-v smsperf-mono ${warn ? 'smsperf-cell-amber' : ''}`}>{v}</span>
    </div>
);

const GapBlock = ({ label, value, unit }) => (
    <div className="smsperf-trace-gap">
        <div className="smsperf-trace-gap-v smsperf-mono">
            {value != null ? value : '—'}
            {value != null && unit && <span className="smsperf-trace-gap-u"> {unit}</span>}
        </div>
        <div className="smsperf-trace-gap-l">{label}</div>
    </div>
);

function fmtTime(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleString([], {
            month: 'short', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

export default HeatTraceDrawer;
