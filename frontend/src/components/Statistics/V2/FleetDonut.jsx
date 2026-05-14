import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useV2Endpoint } from '../Version2Dashboard';

/**
 * Torpedo Fleet Status donut.
 *
 * 2026-05-14 (#190) rewrite: now renders WHATEVER raw SuVeechi statuses
 * the backend returns. No hardcoded segment list, no name remapping,
 * no calculation. Backend (`_fleet_breakdown` in v2_dashboard.py) is a
 * pure GROUP BY on `FleetManagement.suveechi_status` which is mirrored
 * unchanged from `vw_unit_status_ist.status`.
 *
 * Current SuVeechi values seen in the data: `Idle`, `Moving`, `Ign Off`.
 * If JSW upstream ever adds a new status, it automatically becomes a
 * new segment with the fallback color — no code change needed.
 *
 * Color map below is the only piece of "translation" we keep: known
 * statuses get an intentional color (green/gray/red); unknown ones use
 * a neutral fallback so the donut still renders correctly.
 */

// Color assignment by status name (no name mapping — colors only)
const STATUS_COLOR = {
    'Moving':  '#15803d',  // green  — productive / actively moving
    'Idle':    '#94a3b8',  // gray   — running but parked
    'Ign Off': '#dc2626',  // red    — ignition off / out of service
    'Unknown': '#6b7280',  // neutral gray — no status mirrored yet
};
const FALLBACK_COLOR = '#6b7280';

const FleetDonut = ({ tick }) => {
    const { data, loading } = useV2Endpoint('/api/statistics/v2/overview', {}, { tick, cadence: 1 });
    const breakdown = data?.fleet?.breakdown || {};
    const total = data?.fleet?.total || 0;

    // Build chart data dynamically from whatever SuVeechi returned. Sort
    // by count desc so the largest slice anchors visually.
    const chartData = Object.entries(breakdown)
        .map(([key, value]) => ({
            key,
            value,
            color: STATUS_COLOR[key] || FALLBACK_COLOR,
        }))
        .filter(s => s.value > 0)
        .sort((a, b) => b.value - a.value);

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
                    {chartData.map(s => (
                        <div className="v2-fleet-legend-row" key={s.key}>
                            <span className="v2-fleet-legend-dot" style={{ background: s.color }} />
                            <span className="v2-fleet-legend-lbl">{s.key}</span>
                            <span className="v2-fleet-legend-count">{s.value}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default FleetDonut;
