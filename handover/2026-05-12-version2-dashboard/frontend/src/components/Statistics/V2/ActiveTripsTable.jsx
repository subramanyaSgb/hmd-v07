import React from 'react';
import { Filter, Maximize2 } from 'lucide-react';
import { useV2Endpoint } from '../Version2Dashboard';
import StageDots from './StageDots';

/**
 * Active Trips table — 7 rows visible, matching the design idea exactly:
 *   Ladle · Trip ID · Source · Dest · Net wt · Temp · S · Stage · Age · Alert
 *
 * Data comes from /active-trips which joins V07 Trip + WBATNGL mirror
 * server-side. We just render. Cadence 1 tick (10s) — this is the
 * busiest live element on the page.
 *
 * Temp < 1450 → red text. Sulfur > 0.05 → amber. Alert from joined
 * `alerts` table (unacked latest) → red/amber tag in last column.
 */
const ActiveTripsTable = ({ tick }) => {
    const { data, loading } = useV2Endpoint(
        '/api/statistics/v2/active-trips',
        { limit: 7 },
        { tick, cadence: 1 }
    );
    const trips = data?.trips || [];

    return (
        <div className="v2-card v2-trips-card">
            <div className="v2-card-h">
                <h3>Active Trips</h3>
                <span className="v2-sub">{trips.length} in view</span>
                <div className="v2-card-actions">
                    <button type="button" className="v2-btn v2-btn-ghost">
                        <Filter size={13} /> Filter
                    </button>
                    <button type="button" className="v2-btn v2-btn-ghost">
                        <Maximize2 size={13} /> Open page
                    </button>
                </div>
            </div>
            <div className="v2-trips-body">
                {trips.length === 0 && !loading && (
                    <div className="v2-empty">No active trips</div>
                )}
                {trips.length > 0 && (
                    <table className="v2-table">
                        <thead>
                            <tr>
                                <th>Ladle</th>
                                <th>Trip ID</th>
                                <th>Source</th>
                                <th>Dest</th>
                                <th>Net wt</th>
                                <th>Temp</th>
                                <th>S</th>
                                <th>Stage</th>
                                <th>Age</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {trips.map(t => {
                                const tempCls = t.temp != null && t.temp < 1450 ? 'v2-text-red' : '';
                                const sCls = t.sulfur != null && t.sulfur > 0.05 ? 'v2-text-amber' : '';
                                const alertCls = t.alert
                                    ? (t.alert.kind === 'cold' || t.alert.kind === 'gps_stale'
                                        ? 'v2-tag v2-tag-red'
                                        : 'v2-tag v2-tag-amber')
                                    : '';
                                return (
                                    <tr key={t.trip_id}>
                                        <td><strong>{t.ladle || '—'}</strong></td>
                                        <td className="v2-mono v2-dim">
                                            {t.tap_no ? `${t.tap_no}·TH${t.tap_hole || '?'}` : '—'}
                                        </td>
                                        <td>{t.source || '—'}</td>
                                        <td>{t.destination || '—'}</td>
                                        <td className="v2-mono">{t.net_wt ? `${t.net_wt} t` : '—'}</td>
                                        <td className={`v2-mono ${tempCls}`}>
                                            {t.temp != null ? `${t.temp}°C` : '—'}
                                        </td>
                                        <td className={`v2-mono ${sCls}`}>
                                            {t.sulfur != null ? t.sulfur : '—'}
                                        </td>
                                        <td><StageDots stageIdx={t.stage_idx ?? 0} /></td>
                                        <td className="v2-mono v2-dim">
                                            {t.age_min != null ? `${t.age_min}m` : '—'}
                                        </td>
                                        <td>
                                            {t.alert && (
                                                <span className={alertCls}>
                                                    <span className="v2-tag-dot" />
                                                    {t.alert.tag}
                                                </span>
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

export default ActiveTripsTable;
