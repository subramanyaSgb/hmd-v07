import React, { useEffect, useRef, useState } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ReferenceLine,
} from 'recharts';
import { api } from '../../utils/api';

/**
 * Daily yield-trend chart. Reads `overview.yield_trend` array.
 * Reference line at the configured target % so analysts see at a
 * glance whether the trend dips below.
 */
const YieldTrend = ({ tick, range }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const inflightRef = useRef(false);

    useEffect(() => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        api.get('/api/sms-performance/v1/overview', { range })
            .then(resp => { setData(resp); setLoading(false); })
            .catch(() => { setLoading(false); })
            .finally(() => { inflightRef.current = false; });
    }, [tick, range]);

    const trend = data?.yield_trend || [];
    const target = data?.kpis?.yield_target_pct ?? 96;
    const hasData = trend.length > 0;

    return (
        <div className="smsperf-card">
            <div className="smsperf-card-h">
                <h3>Yield trend</h3>
                <span className="smsperf-sub">avg yield % per day</span>
            </div>
            <div className="smsperf-chart-body">
                {!hasData && !loading && (
                    <div className="smsperf-empty">No heats in this range.</div>
                )}
                {hasData && (
                    <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={trend} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
                            <CartesianGrid stroke="hsl(214 32% 95%)" strokeDasharray="3 3" />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                domain={[
                                    dataMin => Math.floor(Math.min(dataMin - 0.5, target - 1)),
                                    dataMax => Math.ceil(Math.max(dataMax + 0.5, target + 1)),
                                ]}
                                tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }}
                                axisLine={false}
                                tickLine={false}
                                width={32}
                            />
                            <Tooltip
                                contentStyle={{
                                    fontSize: 11,
                                    background: 'hsl(var(--card-bg))',
                                    border: '1px solid hsl(var(--border-color))',
                                    borderRadius: 6,
                                }}
                                formatter={(v, name) =>
                                    name === 'avg_yield' ? [`${Number(v).toFixed(2)}%`, 'Avg yield']
                                                         : [v, 'Heats']
                                }
                            />
                            <ReferenceLine y={target} stroke="#f59e0b" strokeDasharray="4 4"
                                label={{ value: `Target ${target}%`, position: 'insideTopRight',
                                         fill: '#f59e0b', fontSize: 10 }} />
                            <Line
                                type="monotone"
                                dataKey="avg_yield"
                                stroke="hsl(var(--accent))"
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
};

export default YieldTrend;
