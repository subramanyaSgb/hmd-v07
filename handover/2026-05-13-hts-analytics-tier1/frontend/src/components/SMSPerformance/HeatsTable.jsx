import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';

/**
 * Paginated per-heat detail table — the analyst's drill-down for
 * "explain a bad yield day". Server-side paginated (limit 50/page)
 * with optional sms / below-target filters.
 */
const PAGE_SIZE = 50;

const HeatsTable = ({ tick, range, sms }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [offset, setOffset] = useState(0);
    const [belowOnly, setBelowOnly] = useState(false);
    const inflightRef = useRef(false);

    // Reset to page 1 whenever range or filters change
    useEffect(() => { setOffset(0); }, [range, sms, belowOnly]);

    useEffect(() => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        const params = { range, limit: PAGE_SIZE, offset };
        if (sms) params.sms = sms;
        if (belowOnly) params.below_target_only = 'true';
        api.get('/api/sms-performance/v1/heats', params)
            .then(resp => { setData(resp); setLoading(false); })
            .catch(() => { setLoading(false); })
            .finally(() => { inflightRef.current = false; });
    }, [tick, range, sms, belowOnly, offset]);

    const heats = data?.heats || [];
    const total = data?.total || 0;
    const hasNext = offset + heats.length < total;
    const hasPrev = offset > 0;

    return (
        <div className="smsperf-card">
            <div className="smsperf-card-h">
                <h3>Heats</h3>
                <span className="smsperf-sub">
                    {sms ? `${sms} · ` : ''}
                    {total} total{belowOnly ? ' below target' : ''}
                </span>
                <div className="smsperf-card-actions">
                    <button
                        type="button"
                        className={`smsperf-pill ${belowOnly ? 'smsperf-pill-active' : ''}`}
                        onClick={() => setBelowOnly(v => !v)}
                    >
                        Below target only
                    </button>
                </div>
            </div>
            <div className="smsperf-table-wrap">
                <table className="smsperf-table">
                    <thead>
                        <tr>
                            <th>Heat</th>
                            <th>When</th>
                            <th>SMS</th>
                            <th>Conv</th>
                            <th>Shift</th>
                            <th>Grade</th>
                            <th>Incharge</th>
                            <th className="num">Cast t</th>
                            <th className="num">Yield %</th>
                            <th className="num">Head t</th>
                            <th className="num">Tail t</th>
                            <th className="num">Delay (m)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!loading && heats.length === 0 && (
                            <tr><td colSpan={12} className="smsperf-empty-row">No heats match.</td></tr>
                        )}
                        {heats.map(h => (
                            <tr key={h.heat_no} className={h.below_target ? 'smsperf-row-warn' : ''}>
                                <td className="smsperf-mono">{h.heat_no}</td>
                                <td className="smsperf-mono smsperf-dim">
                                    {h.caster_date ? h.caster_date.slice(0, 16).replace('T', ' ') : '—'}
                                </td>
                                <td>{h.sms || <span className="smsperf-dim">—</span>}</td>
                                <td>{h.converter_no || <span className="smsperf-dim">—</span>}</td>
                                <td>{h.shift || <span className="smsperf-dim">—</span>}</td>
                                <td>{h.grade || <span className="smsperf-dim">—</span>}</td>
                                <td className="smsperf-dim">{h.shift_incharge || '—'}</td>
                                <td className="num smsperf-mono">
                                    {h.cast_weight != null ? h.cast_weight.toFixed(1) : '—'}
                                </td>
                                <td className={`num smsperf-mono ${h.below_target ? 'smsperf-cell-amber' : ''}`}>
                                    {h.yield_pct != null ? h.yield_pct.toFixed(2) : '—'}
                                </td>
                                <td className="num smsperf-mono">
                                    {h.head_crop_loss_tons != null ? h.head_crop_loss_tons.toFixed(2) : '—'}
                                </td>
                                <td className="num smsperf-mono">
                                    {h.tail_crop_tons != null ? h.tail_crop_tons.toFixed(2) : '—'}
                                </td>
                                <td className="num smsperf-mono">
                                    {h.delay_minutes != null ? h.delay_minutes.toFixed(0) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="smsperf-pager">
                <button
                    type="button"
                    className="smsperf-btn"
                    disabled={!hasPrev}
                    onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
                >
                    ← Prev
                </button>
                <span className="smsperf-sub">
                    {total === 0 ? '0' : `${offset + 1}–${offset + heats.length}`} of {total}
                </span>
                <button
                    type="button"
                    className="smsperf-btn"
                    disabled={!hasNext}
                    onClick={() => setOffset(o => o + PAGE_SIZE)}
                >
                    Next →
                </button>
            </div>
        </div>
    );
};

export default HeatsTable;
