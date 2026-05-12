import React, { useState } from 'react';
import { api } from '../../../utils/api';
import { useV2Endpoint } from '../Version2Dashboard';

/**
 * Alerts & Exceptions feed — right-column section in row 3.
 *
 * Source: /api/statistics/v2/alerts (the new persistent `alerts` table
 * populated by utils/alert_detector.py during sync). Default window is
 * 60 min — matches the demo design.
 *
 * Each non-acknowledged row has an "Ack" button that POSTs to
 * /alerts/{id}/ack. After ack, the row stays in the feed but renders
 * dimmed so it's clear it's resolved.
 */
const AlertFeed = ({ tick }) => {
    const { data, loading } = useV2Endpoint(
        '/api/statistics/v2/alerts',
        { window: '60m', limit: 25 },
        { tick, cadence: 1 }
    );
    const alerts = data?.alerts || [];
    const [acking, setAcking] = useState(new Set());

    const onAck = async (id) => {
        setAcking(prev => new Set([...prev, id]));
        try {
            await api.post(`/api/statistics/v2/alerts/${id}/ack`, {});
        } catch (e) {
            console.warn('ack failed', e);
        } finally {
            setAcking(prev => {
                const n = new Set(prev);
                n.delete(id);
                return n;
            });
        }
    };

    return (
        <div className="v2-card v2-alerts-card">
            <div className="v2-card-h">
                <h3>Alerts & Exceptions</h3>
                <span className="v2-sub">last 60 min</span>
                <div className="v2-card-actions">
                    <span className="v2-pill v2-pill-active">All</span>
                </div>
            </div>
            <div className="v2-alerts-body">
                {alerts.length === 0 && !loading && (
                    <div className="v2-empty">No alerts in this window</div>
                )}
                {alerts.map(a => (
                    <AlertRow key={a.id} alert={a} onAck={onAck} acking={acking.has(a.id)} />
                ))}
            </div>
        </div>
    );
};

const AlertRow = ({ alert, onAck, acking }) => {
    const sevColor =
        alert.severity === 'high' ? 'var(--v2-red)' :
        alert.severity === 'med'  ? 'var(--v2-amber)' :
                                    'var(--v2-cyan)';
    const acked = !!alert.acknowledged_at;
    const time = alert.detected_at
        ? new Date(alert.detected_at).toLocaleTimeString('en-GB', {
            hour: '2-digit', minute: '2-digit',
        })
        : '—';
    return (
        <div className={`v2-alert-row ${acked ? 'v2-alert-row-acked' : ''}`}>
            <div className="v2-alert-bar" style={{ background: sevColor }} />
            <div className="v2-alert-content">
                <div className="v2-alert-head">
                    <span className="v2-alert-tag" style={{ color: sevColor }}>{alert.tag}</span>
                    <span className="v2-alert-time v2-mono v2-dim">{time}</span>
                </div>
                <div className="v2-alert-msg">{alert.message}</div>
                <div className="v2-alert-loc">{alert.location || ' '}</div>
            </div>
            {!acked && (
                <button
                    type="button"
                    className="v2-btn v2-btn-small"
                    onClick={() => onAck(alert.id)}
                    disabled={acking}
                >
                    {acking ? '...' : 'Ack'}
                </button>
            )}
            {acked && <span className="v2-alert-acked-lbl">acked</span>}
        </div>
    );
};

export default AlertFeed;
