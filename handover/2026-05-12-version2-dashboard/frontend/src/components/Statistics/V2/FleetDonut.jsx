import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useV2Endpoint } from '../Version2Dashboard';

/**
 * Torpedo Fleet Status donut. 7 segments derived from FleetManagement
 * + active-Trip phase + maintenance schedule (see backend
 * `_fleet_breakdown`). Uses Recharts PieChart for accessibility (free
 * tooltips, keyboard nav) — donut hole renders the total number with
 * a centered "TORPEDOES" label.
 *
 * Color order matches desing_idea/dashboard.jsx exactly so the visual
 * reference holds.
 */
const SEGMENTS = [
    { key: 'Loading',     color: '#f59e0b' },
    { key: 'In Transit',  color: '#3b82f6' },
    { key: 'At SMS',      color: '#06b6d4' },
    { key: 'Returning',   color: '#a78bfa' },
    { key: 'Idle',        color: '#94a3b8' },
    { key: 'Hot Repair',  color: '#ef4444' },
    { key: 'Ign Off',     color: '#64748b' },
];

const FleetDonut = ({ tick }) => {
    const { data, loading } = useV2Endpoint('/api/statistics/v2/overview', {}, { tick, cadence: 1 });
    const breakdown = data?.fleet?.breakdown || {};
    const total = data?.fleet?.total || 0;

    const chartData = SEGMENTS
        .map(s => ({ ...s, value: breakdown[s.key] || 0 }))
        .filter(s => s.value > 0);

    return (
        <div className="v2-card v2-fleet-card">
            <div className="v2-card-h">
                <h3>Torpedo Fleet Status</h3>
                <span className="v2-sub">{total} units</span>
            </div>
            <div className="v2-fleet-body">
                <div className="v2-fleet-donut">
                    {chartData.length === 0 && !loading && (
                        <div className="v2-empty">No fleet data</div>
                    )}
                    {chartData.length > 0 && (
                        <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={80}
                                    paddingAngle={1}
                                    dataKey="value"
                                    isAnimationActive={false}
                                    stroke="hsl(var(--card-bg))"
                                    strokeWidth={2}
                                >
                                    {chartData.map(s => (
                                        <Cell key={s.key} fill={s.color} />
                                    ))}
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                    <div className="v2-fleet-center">
                        <div className="v2-fleet-center-num">{total}</div>
                        <div className="v2-fleet-center-lbl">TORPEDOES</div>
                    </div>
                </div>
                <div className="v2-fleet-legend">
                    {SEGMENTS.map(s => (
                        <div className="v2-fleet-legend-row" key={s.key}>
                            <span className="v2-fleet-legend-dot" style={{ background: s.color }} />
                            <span className="v2-fleet-legend-lbl">{s.key}</span>
                            <span className="v2-fleet-legend-count">{breakdown[s.key] || 0}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default FleetDonut;
