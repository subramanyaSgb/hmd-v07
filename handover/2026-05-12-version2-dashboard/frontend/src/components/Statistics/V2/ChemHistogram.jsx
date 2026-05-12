import React from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';
import { useV2Endpoint } from '../Version2Dashboard';

/**
 * Chemistry Distribution — temperature histogram for the last 24 h.
 *
 * Bins are computed server-side (9 bins, 20 °C wide, 1420…1580) so the
 * frontend just plots them. Bars whose lower edge is < 1450 are colored
 * red (below cutoff); rest are amber.
 *
 * Cadence 6 ticks (≈60s) — temperatures don't oscillate fast.
 */
const ChemHistogram = ({ tick }) => {
    const { data, loading } = useV2Endpoint('/api/statistics/v2/chemistry-distribution', {}, { tick, cadence: 6 });

    const bins = data?.bins || [];
    const labels = data?.labels || [];
    const cutoff = data?.cutoff ?? 1450;
    const chartData = bins.map((count, i) => ({
        label: labels[i],
        count,
        isLow: parseInt(labels[i], 10) < cutoff,
    }));

    return (
        <div className="v2-card v2-chem-card">
            <div className="v2-card-h">
                <h3>Chemistry Distribution</h3>
                <span className="v2-sub">last 24h, °C</span>
            </div>
            <div className="v2-chem-body">
                <div className="v2-chem-stats">
                    <div className="v2-chem-stat">
                        <span className="v2-dim">Mean</span>
                        <span className="v2-mono">{data?.mean ?? '—'} °C</span>
                    </div>
                    <div className="v2-chem-stat">
                        <span className="v2-dim">σ</span>
                        <span className="v2-mono">{data?.stddev ?? '—'}</span>
                    </div>
                    <div className="v2-chem-stat">
                        <span className="v2-dim">Below cutoff</span>
                        <span className="v2-mono v2-text-red">{data?.below_cutoff ?? 0}</span>
                    </div>
                </div>
                {chartData.length === 0 && !loading && (
                    <div className="v2-empty">No chemistry samples in last 24h</div>
                )}
                {chartData.length > 0 && (
                    <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 9, fill: 'hsl(var(--text-muted))' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis hide />
                            <Tooltip
                                cursor={{ fill: 'hsl(var(--main-bg))' }}
                                contentStyle={{
                                    background: 'hsl(var(--card-bg))',
                                    border: '1px solid hsl(var(--border-color))',
                                    borderRadius: 6,
                                    fontSize: 12,
                                }}
                                formatter={(v) => [`${v} trips`, 'Count']}
                            />
                            <Bar dataKey="count" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                                {chartData.map((d, i) => (
                                    <Cell key={i} fill={d.isLow ? 'var(--v2-red)' : 'var(--v2-amber)'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
};

export default ChemHistogram;
