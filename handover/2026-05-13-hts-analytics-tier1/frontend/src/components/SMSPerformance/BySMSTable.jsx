import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';

/**
 * Per-SMS row table (SMS-1, SMS-2, SMS-3, SMS-4, Unattributed).
 * Click a row to set the parent's smsFilter; clicking the active
 * row again clears it. Drives the HeatsTable below.
 */
const BySMSTable = ({ tick, range, smsFilter, onFilterSMS }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const inflightRef = useRef(false);

    useEffect(() => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        api.get('/api/sms-performance/v1/overview', { range })
            .then(resp => { setData(resp); setLoading(false); })
            .catch(() => { setLoading(false); })
            .finally(() => { inflightRef.current = false; });
    }, [tick, range]);

    const rows = data?.by_sms || [];
    const target = data?.kpis?.yield_target_pct ?? 96;

    return (
        <div className="smsperf-card">
            <div className="smsperf-card-h">
                <h3>By SMS</h3>
                <span className="smsperf-sub">click row to filter heats below</span>
            </div>
            <div className="smsperf-table-wrap">
                <table className="smsperf-table">
                    <thead>
                        <tr>
                            <th>SMS</th>
                            <th className="num">Heats</th>
                            <th className="num">Avg yield</th>
                            <th className="num">Loss (t)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && !loading && (
                            <tr>
                                <td colSpan={4} className="smsperf-empty-row">
                                    No SMS attribution in range.
                                </td>
                            </tr>
                        )}
                        {rows.map(r => {
                            const active = smsFilter === r.sms;
                            const below  = r.avg_yield != null && r.avg_yield < target;
                            return (
                                <tr
                                    key={r.sms}
                                    className={`smsperf-row-clickable ${active ? 'smsperf-row-active' : ''}`}
                                    onClick={() => onFilterSMS(active ? null : r.sms)}
                                >
                                    <td>{r.sms}</td>
                                    <td className="num smsperf-mono">{r.heats}</td>
                                    <td className={`num smsperf-mono ${below ? 'smsperf-cell-amber' : ''}`}>
                                        {r.avg_yield != null ? r.avg_yield.toFixed(2) : '—'}
                                    </td>
                                    <td className="num smsperf-mono">
                                        {r.total_loss_tons != null ? r.total_loss_tons.toFixed(1) : '—'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default BySMSTable;
