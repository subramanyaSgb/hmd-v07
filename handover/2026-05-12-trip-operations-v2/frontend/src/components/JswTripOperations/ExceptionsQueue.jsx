import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { api } from '../../utils/api';

/**
 * Exceptions sub-tab — flat table of WBATNGL trips joined with alerts.
 *
 * Source: /api/jsw/v2/exceptions (LEFT JOIN alerts ↔ wbatngl_trip_mirror).
 *
 * Columns: severity icon · Trip · Ladle · Route · Issue tag · Detail ·
 * Net · Temp · Dwell · Acknowledge button.
 *
 * Acknowledge action reuses /api/statistics/v2/alerts/{id}/ack (shipped
 * with V2 dashboard) — same write path means no schema drift.
 */

const KIND_FILTERS = [
    { id: 'all',       label: 'All' },
    { id: 'cold',      label: 'Cold metal' },
    { id: 'chem_s',    label: 'Chemistry (S)' },
    { id: 'chem_si',   label: 'Chemistry (Si)' },
    { id: 'dwell',     label: 'Dwell' },
    { id: 'gps_stale', label: 'GPS' },
];

const ExceptionsQueue = ({ tick, setCount }) => {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterKind, setFilterKind] = useState('all');
    const [acking, setAcking] = useState({});                            // {alert_id: true}
    const inflightRef = useRef(false);

    useEffect(() => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        const params = filterKind !== 'all' ? { kind: filterKind } : {};
        api.get('/api/jsw/v2/exceptions', params)
            .then(resp => {
                const data = resp?.rows || [];
                setRows(data);
                setLoading(false);
                setError(null);
                if (setCount) setCount('exceptions', data.filter(r => !r.acknowledged_at).length);
            })
            .catch(err => { setError(err); setLoading(false); })
            .finally(() => { inflightRef.current = false; });
    }, [tick, filterKind, setCount]);

    const handleAck = async (alertId) => {
        setAcking(prev => ({ ...prev, [alertId]: true }));
        try {
            await api.post(`/api/statistics/v2/alerts/${alertId}/ack`, {});
            // Optimistic local update — mark this row acked so the
            // button disappears without waiting for the next 10s tick.
            setRows(prev => prev.map(r =>
                r.alert_id === alertId
                    ? { ...r, acknowledged_at: new Date().toISOString() }
                    : r
            ));
        } catch (e) {
            console.warn('ack failed', e);
        } finally {
            setAcking(prev => {
                const n = { ...prev };
                delete n[alertId];
                return n;
            });
        }
    };

    return (
        <div className="jto-card">
            <div className="jto-card-panel-h">
                <h3>Exceptions Queue</h3>
                <span className="jto-sub">{rows.length} {rows.length === 1 ? 'row' : 'rows'} · ordered by severity & time</span>
                <div className="jto-card-panel-actions">
                    {KIND_FILTERS.map(f => (
                        <button
                            key={f.id}
                            type="button"
                            className={`jto-pill ${filterKind === f.id ? 'jto-pill-active' : ''}`}
                            onClick={() => setFilterKind(f.id)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="jto-table-wrap">
                {error && <div className="jto-empty">Failed to load exceptions</div>}
                {!error && rows.length === 0 && !loading && (
                    <div className="jto-empty">No exceptions in the last 24 h.</div>
                )}
                {rows.length > 0 && (
                    <table className="jto-table">
                        <thead>
                            <tr>
                                <th style={{ width: 36 }}></th>
                                <th>Trip</th>
                                <th>Ladle</th>
                                <th>Route</th>
                                <th>Issue</th>
                                <th>Detail</th>
                                <th>Net</th>
                                <th>Temp</th>
                                <th>Dwell</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => {
                                const tone = severityTone(r.severity);
                                const dwell = computeDwellMin(r);
                                const tempLow = r.temp != null && r.temp < 1450;
                                const isAcked = !!r.acknowledged_at;
                                return (
                                    <tr key={r.alert_id} className={isAcked ? 'jto-row-acked' : ''}>
                                        <td>
                                            <AlertCircle
                                                size={14}
                                                style={{ color: tone === 'red' ? 'var(--jto-red)' :
                                                                tone === 'amber' ? 'var(--jto-amber)' :
                                                                                   'var(--jto-cyan)' }}
                                            />
                                        </td>
                                        <td className="mono">#{r.tap_no || '—'}</td>
                                        <td><strong>{r.torpedo_id || '—'}</strong></td>
                                        <td className="jto-dim">{r.source_lab || '?'} → {r.destination || '?'}</td>
                                        <td>
                                            <span className={`jto-tag jto-tag-${tone}`}>
                                                {r.tag || r.kind}
                                            </span>
                                        </td>
                                        <td className="jto-dim small">{r.message || '—'}</td>
                                        <td className="mono">
                                            {r.net_weight != null ? `${r.net_weight.toFixed(1)} t` : '—'}
                                        </td>
                                        <td className={`mono ${tempLow ? 'jto-text-red' : ''}`}>
                                            {r.temp != null ? `${Math.round(r.temp)}°C` : '—'}
                                        </td>
                                        <td className="mono">
                                            {dwell != null ? `${dwell}m` : '—'}
                                        </td>
                                        <td>
                                            {isAcked ? (
                                                <span className="jto-dim small">acked</span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="jto-btn jto-btn-small"
                                                    onClick={() => handleAck(r.alert_id)}
                                                    disabled={!!acking[r.alert_id]}
                                                >
                                                    {acking[r.alert_id] ? '...' : 'Acknowledge'}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

function severityTone(sev) {
    if (sev === 'high') return 'red';
    if (sev === 'med' || sev === 'medium') return 'amber';
    return 'cyan';
}

function computeDwellMin(row) {
    if (!row.first_tare_time) return null;
    const end = row.sms_ack_time
        ? new Date(row.sms_ack_time).getTime()
        : Date.now();
    const start = new Date(row.first_tare_time).getTime();
    if (isNaN(start) || isNaN(end)) return null;
    return Math.max(0, Math.floor((end - start) / 60_000));
}

export default ExceptionsQueue;
