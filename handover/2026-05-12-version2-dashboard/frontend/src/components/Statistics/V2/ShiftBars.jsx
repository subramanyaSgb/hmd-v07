import React from 'react';
import { useV2Endpoint } from '../Version2Dashboard';

/**
 * Shift Performance bars — 3 horizontal bars (A / B / C) showing trips
 * and tonnage for each shift, today. Active shift gets a LIVE pill.
 *
 * Source: /overview which already includes the shift breakdown so we
 * piggy-back on its 10s cadence.
 */
const ShiftBars = ({ tick }) => {
    const { data, loading } = useV2Endpoint('/api/statistics/v2/overview', {}, { tick, cadence: 1 });
    const shifts = data?.shifts || [];
    const maxTrips = Math.max(1, ...shifts.map(s => s.trips || 0));

    return (
        <div className="v2-card v2-shift-card">
            <div className="v2-card-h">
                <h3>Shift Performance</h3>
                <span className="v2-sub">trips · tonnes today</span>
            </div>
            <div className="v2-shift-body">
                {shifts.length === 0 && !loading && (
                    <div className="v2-empty">No shift data yet today</div>
                )}
                {shifts.map(s => {
                    const pct = (s.trips / maxTrips) * 100;
                    return (
                        <div className="v2-shift-row" key={s.id}>
                            <div className="v2-shift-head">
                                <div className="v2-shift-meta">
                                    <strong className="v2-shift-name">Shift {s.id}</strong>
                                    <span className="v2-dim v2-shift-range">{s.range}</span>
                                    {s.is_active && (
                                        <span className="v2-tag v2-tag-amber">
                                            <span className="v2-tag-dot" />LIVE
                                        </span>
                                    )}
                                </div>
                                <div className="v2-mono v2-shift-stats">
                                    <strong>{s.trips}</strong> trips · <span className="v2-dim">{s.tonnes.toLocaleString()} kg</span>
                                </div>
                            </div>
                            <div className="v2-shift-bar-track">
                                <div
                                    className={`v2-shift-bar-fill ${s.is_active ? 'v2-shift-bar-active' : ''}`}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ShiftBars;
