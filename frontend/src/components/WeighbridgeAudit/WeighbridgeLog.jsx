import React, { memo, useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';

/**
 * Left-side log table on the Weighbridge Audit page.
 *
 * Columns from design idea:
 *   Time · WB · Trip · Ladle · Gross · Tare · Net (WB) · Net (SMS) · Var · Status
 *
 * Top-right filter pills: All / Variance ≥ 0.3% / Pending recon.
 * Source: /api/weighbridge-audit/v2/log.
 *
 * Rows are React.memo'd with custom equality (matches the
 * Trip Operations V2 card pattern) — only re-renders when the displayed
 * fields change.
 */

const FILTERS = [
    { id: 'all',      label: 'All' },
    { id: 'variance', label: 'Variance ≥ 0.3%' },
    { id: 'pending',  label: 'Pending recon' },
];

const LogRow = memo(
    function LogRow({ row }) {
        const variance = row.variance_pct;
        const varStr = variance == null
            ? '—'
            : `${variance > 0 ? '+' : ''}${variance.toFixed(2)}%`;
        const varCls = variance != null && Math.abs(variance) >= 0.3
            ? 'wb-cell-amber' : variance != null && Math.abs(variance) < 0.3
                ? 'wb-cell-dim' : 'wb-cell-dim';
        const timeShort = row.time
            ? new Date(row.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            : '—';
        const statusCls = row.status === 'OK' ? 'wb-tag wb-tag-green' : 'wb-tag wb-tag-amber';
        return (
            <tr>
                <td className="wb-mono wb-dim">{timeShort}</td>
                <td className="wb-mono">{row.wb || row.source_lab || '—'}</td>
                <td className="wb-mono">#{row.tap_no ?? '—'}</td>
                <td><strong>{row.fleet_id || '—'}</strong></td>
                <td className="wb-mono">{fmt(row.gross_weight, 1)} t</td>
                <td className="wb-mono">{fmt(row.tare_weight, 1)} t</td>
                <td className="wb-mono">{fmt(row.net_weight, 1)} t</td>
                <td className="wb-mono">{fmt(row.net_weight_actual, 1)} t</td>
                <td className={`wb-mono ${varCls}`}>{varStr}</td>
                <td>
                    <span className={statusCls}>
                        <span className="wb-tag-dot" />{row.status}
                    </span>
                </td>
            </tr>
        );
    },
    (prev, next) =>
        prev.row.trip_id === next.row.trip_id &&
        prev.row.variance_pct === next.row.variance_pct &&
        prev.row.status === next.row.status &&
        prev.row.net_weight_actual === next.row.net_weight_actual
);

function fmt(v, decimals) {
    return v == null ? '—' : Number(v).toFixed(decimals);
}

const WeighbridgeLog = ({ tick, range, filter, setFilter }) => {
    const [rows, setRows]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    const inflightRef = useRef(false);

    useEffect(() => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        api.get('/api/weighbridge-audit/v2/log', { range, filter, limit: 24 })
            .then(resp => { setRows(resp?.rows || []); setLoading(false); setError(null); })
            .catch(err => { setError(err); setLoading(false); })
            .finally(() => { inflightRef.current = false; });
    }, [tick, range, filter]);

    return (
        <div className="wb-card">
            <div className="wb-card-h">
                <h3>Weighbridge log</h3>
                <span className="wb-sub">last 24 weighings</span>
                <div className="wb-card-actions">
                    {FILTERS.map(f => (
                        <button
                            key={f.id}
                            type="button"
                            className={`wb-pill ${filter === f.id ? 'wb-pill-active' : ''}`}
                            onClick={() => setFilter(f.id)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="wb-table-wrap">
                {error && <div className="wb-empty">Failed to load weighbridge log</div>}
                {!error && rows.length === 0 && !loading && (
                    <div className="wb-empty">No weighings match this filter.</div>
                )}
                {rows.length > 0 && (
                    <table className="wb-table">
                        <thead>
                            <tr>
                                <th>Time</th><th>WB</th><th>Trip</th><th>Ladle</th>
                                <th>Gross</th><th>Tare</th>
                                <th>Net (WB)</th><th>Net (SMS)</th>
                                <th>Var</th><th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => <LogRow key={r.trip_id} row={r} />)}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default WeighbridgeLog;
