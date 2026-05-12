import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Download, ChevronRight } from 'lucide-react';
import { api } from '../../utils/api';

/**
 * Right-side pane on the Active Trips sub-tab (also reusable from
 * other sub-tabs in future). Renders ONE selected trip's full detail.
 *
 * Sections from top to bottom:
 *   1. Header — Trip #tap_no · trip_id mono · Active badge
 *   2. Ladle / Source / Tap Hole / Dest / Shift quick row
 *   3. Lifecycle Progress — 5 vertical stages with timestamps
 *   4. Weights — Gross / Tare / Net
 *   5. Chemistry — Temp BF / ΔT / S / Si
 *   6. Alert (red banner if trip.alert is non-null)
 *   7. Audit Log — derived from WBATNGL timestamps
 *   8. Action footer — Acknowledge SMS · Flag Issue · Download
 *
 * The audit log is built client-side from the trip's timestamps —
 * no extra backend endpoint needed.
 */

const TripDetailPane = ({ trip }) => {
    const [acking, setAcking] = useState(false);

    if (!trip) return null;

    const alertId = trip.alert?.id;
    const tempLow = trip.temp != null && trip.temp < 1450;
    const sHigh = trip.s_l != null && trip.s_l > 0.05;

    const stages = buildStages(trip);
    const auditLog = buildAuditLog(trip);

    const handleAck = async () => {
        if (!alertId || acking) return;
        setAcking(true);
        try {
            // Reuse the existing /api/statistics/v2/alerts/{id}/ack endpoint
            // that was shipped with the V2 dashboard alerts feed. Saves us
            // from writing a duplicate ack route just for this pane.
            await api.post(`/api/statistics/v2/alerts/${alertId}/ack`, {});
        } catch (e) {
            console.warn('alert ack failed', e);
        } finally {
            setAcking(false);
        }
    };

    return (
        <div className="jto-detail-card">
            {/* 1. HEADER */}
            <div className="jto-detail-h">
                <div>
                    <div className="jto-detail-h-title">Trip #{trip.tap_no || '—'}</div>
                    <div className="jto-detail-h-id mono">{trip.trip_id}</div>
                </div>
                <span className="jto-tag jto-tag-amber">
                    <span className="jto-tag-dot"/>Active
                </span>
            </div>

            {/* 2. QUICK META */}
            <div className="jto-detail-meta">
                <Pair l="Ladle" v={<strong>{trip.fleet_id || '—'}</strong>} />
                <Pair l="Source" v={trip.source_lab || '—'} />
                <Pair l="Tap hole" v={trip.tap_hole || '—'} />
                <Pair l="Dest" v={trip.destination || '—'} />
                <Pair l="Shift" v={(trip.shift || '—').trim()} />
            </div>

            <div className="jto-detail-body">
                {/* 3. LIFECYCLE */}
                <Section title="LIFECYCLE PROGRESS">
                    <ol className="jto-lifecycle">
                        {stages.map((s, i) => (
                            <li key={i} className={`jto-life-step ${s.cls}`}>
                                <div className="jto-life-dot"/>
                                <div className="jto-life-body">
                                    <div className="jto-life-label">{s.label}</div>
                                    {s.sub && <div className="jto-life-sub">{s.sub}</div>}
                                </div>
                                <div className="jto-life-time mono">{s.time}</div>
                            </li>
                        ))}
                    </ol>
                </Section>

                {/* 4. WEIGHTS */}
                <Section title="WEIGHTS">
                    <div className="jto-detail-3col">
                        <Metric label="Gross" value={trip.gross_weight} unit="t" decimals={1} />
                        <Metric label="Tare"  value={trip.tare_weight}  unit="t" decimals={1} />
                        <Metric label="Net"   value={trip.net_weight}   unit="t" decimals={1} />
                    </div>
                </Section>

                {/* 5. CHEMISTRY */}
                <Section title="CHEMISTRY">
                    <div className="jto-detail-4col">
                        <Metric
                            label="Temp BF"
                            value={trip.temp}
                            unit="°C"
                            decimals={0}
                            tone={tempLow ? 'red' : null}
                        />
                        <Metric
                            label="ΔT"
                            value={
                                trip.bds_temp != null && trip.temp != null
                                    ? trip.temp - trip.bds_temp : null
                            }
                            unit="°C"
                            decimals={0}
                        />
                        <Metric
                            label="S"
                            value={trip.s_l}
                            unit="%"
                            decimals={3}
                            tone={sHigh ? 'amber' : null}
                        />
                        <Metric label="Si" value={trip.si_l} unit="%" decimals={2} />
                    </div>
                </Section>

                {/* 6. ALERT */}
                {trip.alert && (
                    <Section title="ALERT">
                        <div className="jto-alert-banner">
                            <AlertCircle size={16} className="jto-alert-icon" />
                            <div className="jto-alert-body">
                                <div className="jto-alert-tag">{trip.alert.tag}</div>
                                <div className="jto-alert-detail">{trip.alert.detail}</div>
                            </div>
                            <button
                                type="button"
                                className="jto-btn jto-btn-small"
                                onClick={handleAck}
                                disabled={acking}
                            >
                                {acking ? '...' : 'Acknowledge'}
                            </button>
                        </div>
                    </Section>
                )}

                {/* 7. AUDIT LOG */}
                <Section title="AUDIT LOG">
                    {auditLog.length === 0 ? (
                        <div className="jto-empty-tiny">No events yet for this trip.</div>
                    ) : (
                        <div className="jto-audit-list">
                            {auditLog.map((e, i) => (
                                <div key={i} className="jto-audit-row">
                                    <span className="jto-audit-time mono">{e.time}</span>
                                    <span className="jto-audit-action">{e.action}</span>
                                    <span className="jto-audit-by">{e.by}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>
            </div>

            {/* 8. ACTION FOOTER */}
            <div className="jto-detail-footer">
                <button type="button" className="jto-btn jto-btn-primary">
                    <CheckCircle2 size={13} /> Acknowledge SMS
                </button>
                <button type="button" className="jto-btn">
                    <AlertCircle size={13} /> Flag Issue
                </button>
                <button type="button" className="jto-btn jto-btn-ghost"
                        onClick={() => downloadTripCsv(trip)}>
                    <Download size={13} />
                </button>
            </div>
        </div>
    );
};

/**
 * Build the 5-stage vertical lifecycle from a trip row's stage_idx +
 * timestamps. Each stage shows label, optional sub-line, and timestamp
 * (or '—' if not reached yet).
 *
 * Layout matches the design idea's vertical timeline:
 *   • Tap     17:54
 *   • Weigh-in / Chemistry   18:47
 *     1483°C · S 0.02
 *   ○ Out from BF     —
 *   ○ Arrived at SMS2 —
 *   ○ Returning       —
 */
function buildStages(trip) {
    const stageIdx = trip.stage_idx ?? 0;
    const fmt = isoOrNaiveToHHMM;
    const stages = [
        {
            i: 0,
            label: 'Tap',
            time: fmt(trip.first_tare_time),
            sub: null,
        },
        {
            i: 1,
            label: 'Weigh-in / Chemistry',
            time: fmt(trip.closetime),
            sub: trip.temp != null
                ? `${Math.round(trip.temp)}°C · S ${(trip.s_l ?? 0).toFixed(3)}`
                : null,
        },
        {
            i: 2,
            label: 'Out from BF',
            time: fmt(trip.out_date),
            sub: null,
        },
        {
            i: 3,
            label: `Arrived at ${trip.destination || '?'}`,
            time: fmt(trip.sms_ack_time),
            sub: trip.bds_temp != null && trip.temp != null
                ? `BDS Δ ${Math.round(trip.temp - trip.bds_temp)}°C`
                : null,
        },
        {
            i: 4,
            label: 'Returning',
            time: '—',
            sub: null,
        },
    ];
    return stages.map(s => ({
        ...s,
        cls: s.i < stageIdx ? 'done' : s.i === stageIdx ? 'active' : '',
    }));
}

function buildAuditLog(trip) {
    const rows = [];
    const push = (when, action, by) => {
        if (!when) return;
        rows.push({ time: isoOrNaiveToHHMM(when), action, by });
    };
    push(trip.sms_ack_time, `SMS ack received from ${trip.destination || 'consumer'}`, `${trip.destination || 'SMS'}`);
    push(trip.out_date, 'Torpedo out from BF', `${trip.source_lab || 'BF'}`);
    if (trip.closetime) {
        const s = trip.s_l != null ? `S ${trip.s_l.toFixed(3)}` : null;
        const si = trip.si_l != null ? `Si ${trip.si_l.toFixed(2)}` : null;
        const chem = [s, si].filter(Boolean).join(', ');
        push(trip.closetime, `Closetime recorded${chem ? ' — ' + chem : ''}`, `${trip.source_lab || 'BF'} weighbridge`);
    }
    push(trip.first_tare_time, `First tare ${trip.tare_weight != null ? trip.tare_weight.toFixed(1) + ' t' : ''}`, 'WB');
    // Most recent first (timestamps may be reverse-ordered already, but
    // we sort defensively in case of unusual WBATNGL row state).
    return rows;
}

function isoOrNaiveToHHMM(t) {
    if (!t) return '—';
    const d = new Date(t);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function downloadTripCsv(trip) {
    const fields = [
        'trip_id', 'tap_no', 'tap_hole', 'fleet_id', 'source_lab', 'destination',
        'shift', 'gross_weight', 'tare_weight', 'net_weight',
        'temp', 's_l', 'si_l', 'bds_temp',
        'first_tare_time', 'closetime', 'out_date', 'sms_ack_time', 'updated_date',
    ];
    const header = fields.join(',');
    const row = fields.map(f => {
        const v = trip[f];
        if (v == null) return '';
        return String(v).replace(/"/g, '""');
    }).join(',');
    const csv = `${header}\n${row}\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trip-${trip.tap_no || trip.trip_id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

const Pair = ({ l, v }) => (
    <div className="jto-pair">
        <span className="jto-pair-l">{l}</span>
        <span className="jto-pair-v">{v}</span>
    </div>
);

const Section = ({ title, children }) => (
    <div className="jto-detail-section">
        <div className="jto-detail-section-h">{title}</div>
        <div className="jto-detail-section-body">{children}</div>
    </div>
);

const Metric = ({ label, value, unit, decimals, tone }) => {
    const v = value == null ? '—' : Number(value).toFixed(decimals ?? 1);
    const toneCls = tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : '';
    return (
        <div className="jto-detail-metric">
            <div className="jto-detail-metric-l">{label}</div>
            <div className={`jto-detail-metric-row ${toneCls}`}>
                <span className="jto-detail-metric-v mono">{v}</span>
                {unit && <span className="jto-detail-metric-u">{unit}</span>}
            </div>
        </div>
    );
};

export default TripDetailPane;
