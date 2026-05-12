import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { useV2Endpoint } from '../Version2Dashboard';

/**
 * Hot Metal Throughput area chart. 24h granularity by default (hourly
 * buckets), 7d / 30d show daily buckets. Pills are functional — clicking
 * one re-fetches with the new range.
 *
 * Cadence 6 ticks (≈60s) since trips don't complete fast enough for
 * 10s polling to show change; saves load on the WBATNGL mirror table.
 */
const RANGES = ['24h', '7d', '30d'];

const ThroughputChart = ({ tick }) => {
    const [range, setRange] = useState('24h');
    const { data, loading } = useV2Endpoint(
        '/api/statistics/v2/throughput',
        { range },
        { tick, cadence: 6 }
    );

    const points = data?.points || [];

    return (
        <div className="v2-card v2-throughput-card">
            <div className="v2-card-h">
                <h3>Hot Metal Throughput</h3>
                <span className="v2-sub">
                    {range === '24h' ? 'last 24 hours, tonnes / hour' :
                     range === '7d' ? 'last 7 days, tonnes / day' :
                     'last 30 days, tonnes / day'}
                </span>
                <div className="v2-card-actions">
                    {RANGES.map(r => (
                        <button
                            key={r}
                            type="button"
                            className={`v2-pill ${range === r ? 'v2-pill-active' : ''}`}
                            onClick={() => setRange(r)}
                        >
                            {r}
                        </button>
                    ))}
                </div>
            </div>
            <div className="v2-throughput-body">
                {points.length === 0 && !loading && (
                    <div className="v2-empty">No throughput data in this range</div>
                )}
                {points.length > 0 && (
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="v2-th-grad" x1="0" x2="0" y1="0" y2="1">
                                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-color))" opacity={0.4} />
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }}
                                axisLine={false}
                                tickLine={false}
                                minTickGap={20}
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }}
                                axisLine={false}
                                tickLine={false}
                                width={32}
                            />
                            <Tooltip
                                cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, opacity: 0.3 }}
                                contentStyle={{
                                    background: 'hsl(var(--card-bg))',
                                    border: '1px solid hsl(var(--border-color))',
                                    borderRadius: 6,
                                    fontSize: 12,
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="hsl(var(--primary))"
                                strokeWidth={2}
                                fill="url(#v2-th-grad)"
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
};

export default ThroughputChart;
