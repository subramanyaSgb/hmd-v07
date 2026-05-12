import React from 'react';
import { useV2Endpoint } from '../Version2Dashboard';

/**
 * System Health — bottom-right card. Shows the freshness/status of the
 * 4 data sources backing the dashboard: SuVeechi (MySQL), WBATNGL
 * (Oracle), HTS (Oracle), HMD (Postgres).
 *
 * Status is derived from the mirror tables' max(synced_at) — see
 * backend `_probe_*_freshness`. Cadence 3 ticks (≈30s).
 */
const SystemHealth = ({ tick }) => {
    const { data, loading } = useV2Endpoint('/api/statistics/v2/system-health', {}, { tick, cadence: 3 });
    const connections = data?.connections || [];

    return (
        <div className="v2-card v2-syshealth-card">
            <div className="v2-card-h">
                <h3>System Health</h3>
                <span className="v2-sub">data sources</span>
            </div>
            <div className="v2-syshealth-body">
                {connections.length === 0 && !loading && (
                    <div className="v2-empty">Health probe not yet warm</div>
                )}
                {connections.map(c => (
                    <SystemHealthRow key={c.id} c={c} />
                ))}
            </div>
        </div>
    );
};

const SystemHealthRow = ({ c }) => {
    const statusColor =
        c.status === 'online' ? 'var(--v2-green)' :
        c.status === 'degraded' ? 'var(--v2-amber)' :
                                  'var(--v2-red)';
    const ageLabel =
        c.last_sync_age_seconds == null
            ? (c.latency != null ? `${c.latency} ms` : '—')
            : c.last_sync_age_seconds < 60
                ? `${c.last_sync_age_seconds}s ago`
                : `${Math.floor(c.last_sync_age_seconds / 60)}m ago`;

    return (
        <div className="v2-syshealth-row">
            <div className="v2-syshealth-left">
                <div className="v2-syshealth-name-line">
                    <span
                        className="v2-syshealth-dot"
                        style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
                    />
                    <strong>{c.engine}</strong>
                    <span className="v2-dim">· {c.db}</span>
                </div>
                <div className="v2-syshealth-host v2-mono v2-dim">{c.host}</div>
            </div>
            <div className="v2-syshealth-right">
                <span className="v2-mono v2-syshealth-latency">
                    {c.latency != null ? `${c.latency} ms` : c.status}
                </span>
                <span className="v2-dim v2-syshealth-age">sync {ageLabel}</span>
            </div>
        </div>
    );
};

export default SystemHealth;
