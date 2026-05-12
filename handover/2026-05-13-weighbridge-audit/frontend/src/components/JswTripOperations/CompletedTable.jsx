import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../utils/api';

/**
 * Completed (today) sub-tab — full table view of WBATNGL trips with
 * sms_ack_time set today.
 *
 * Columns (from design idea):
 *   Tap · Ladle · TH · Route · Net · Temp BF · ΔT · S · Si ·
 *   Tap→Out · Out→Ack · Cycle · Shift
 *
 * Source: /api/jsw/trips?mode=completed&time_window=today.
 * Read-only. Pagination 50/page. Sort defaults to updated_date desc.
 */
const PAGE_SIZE = 50;

const CompletedTable = ({ tick, filters, setCount }) => {
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const inflightRef = useRef(false);

    // Filters → query params (same shape as ActiveTripBoard)
    const params = useMemo(() => {
        const out = {
            mode: 'completed',
            time_window: 'today',
            page,
            page_size: PAGE_SIZE,
        };
        if (filters?.shift && filters.shift !== 'All') out.shift = filters.shift;
        // 'All BFs' (legacy) and 'All' (post-Corex relabel 2026-05-13) both
        // mean "no source filter" — pass anything else straight through.
        if (filters?.source && filters.source !== 'All' && filters.source !== 'All BFs') {
            out.source_lab = filters.source;
        }
        if (filters?.destination && filters.destination !== 'All') out.destination = filters.destination;
        return out;
    }, [filters, page]);

    useEffect(() => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        api.get('/api/jsw/trips', params)
            .then(resp => {
                setRows(resp?.rows || []);
                setTotal(resp?.total || 0);
                setLoading(false);
                setError(null);
                if (setCount) setCount('completed', resp?.total || 0);
            })
            .catch(err => { setError(err); setLoading(false); })
            .finally(() => { inflightRef.current = false; });
    }, [tick, params, setCount]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="jto-card">
            <div className="jto-card-panel-h">
                <h3>Completed Trips Today</h3>
                <span className="jto-sub">
                    {total} {total === 1 ? 'trip' : 'trips'} · last SMS ack today
                </span>
            </div>

            <div className="jto-table-wrap">
                {error && <div className="jto-empty">Failed to load completed trips</div>}
                {!error && rows.length === 0 && !loading && (
                    <div className="jto-empty">No completed trips today yet.</div>
                )}
                {rows.length > 0 && (
                    <table className="jto-table">
                        <thead>
                            <tr>
                                <th>Tap</th>
                                <th>Ladle</th>
                                <th>TH</th>
                                <th>Route</th>
                                <th>Net</th>
                                <th>Temp BF</th>
                                <th>ΔT</th>
                                <th>S</th>
                                <th>Si</th>
                                <th>Tap → Out</th>
                                <th>Out → Ack</th>
                                <th>Cycle</th>
                                <th>Shift</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => {
                                const tapOut = diffMin(r.first_tare_time, r.out_date);
                                const outAck = diffMin(r.out_date, r.sms_ack_time);
                                const cycle = diffMin(r.first_tare_time, r.sms_ack_time);
                                const deltaT =
                                    r.temp != null && r.bds_temp != null
                                        ? Math.round(r.temp - r.bds_temp)
                                        : null;
                                return (
                                    <tr key={r.trip_id}>
                                        <td className="mono">#{r.tap_no || '—'}</td>
                                        <td><strong>{r.fleet_id || '—'}</strong></td>
                                        <td className="mono">{r.tap_hole || '—'}</td>
                                        <td>
                                            {r.source_lab || '?'} → {r.destination || '?'}
                                        </td>
                                        <td className="mono">
                                            {r.net_weight != null ? `${r.net_weight.toFixed(1)} t` : '—'}
                                        </td>
                                        <td className="mono">
                                            {r.temp != null ? `${Math.round(r.temp)}°C` : '—'}
                                        </td>
                                        <td className="mono">{deltaT != null ? `${deltaT}°C` : '—'}</td>
                                        <td className="mono">{r.s_l != null ? r.s_l.toFixed(3) : '—'}</td>
                                        <td className="mono">{r.si_l != null ? r.si_l.toFixed(2) : '—'}</td>
                                        <td className="mono">{tapOut != null ? `${tapOut} min` : '—'}</td>
                                        <td className="mono">{outAck != null ? `${outAck} min` : '—'}</td>
                                        <td className="mono">{cycle != null ? `${cycle} min` : '—'}</td>
                                        <td><span className="jto-tag">{(r.shift || '').trim() || '—'}</span></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {totalPages > 1 && (
                <div className="jto-table-foot">
                    <span className="jto-dim">
                        Page {page} of {totalPages} · {total} total
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button
                            type="button"
                            className="jto-btn jto-btn-small"
                            disabled={page <= 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                        >Prev</button>
                        <button
                            type="button"
                            className="jto-btn jto-btn-small"
                            disabled={page >= totalPages}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        >Next</button>
                    </div>
                </div>
            )}
        </div>
    );
};

function diffMin(a, b) {
    if (!a || !b) return null;
    const ma = new Date(a).getTime();
    const mb = new Date(b).getTime();
    if (isNaN(ma) || isNaN(mb)) return null;
    return Math.max(0, Math.floor((mb - ma) / 60_000));
}

export default CompletedTable;
