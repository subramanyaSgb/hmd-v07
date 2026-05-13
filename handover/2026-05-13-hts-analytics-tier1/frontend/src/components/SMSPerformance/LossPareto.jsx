import React, { useEffect, useRef, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList, Tooltip,
} from 'recharts';
import { api } from '../../utils/api';

/**
 * Loss Pareto chart. Reads /api/sms-performance/v1/loss-pareto.
 *
 * Tonnage categories shown left-to-right desc by value. Count-only
 * categories (units = "count") are listed below the chart in a small
 * key=value table because they aren't directly comparable.
 */

const BAR_COLOR = '#ef4444';
const BAR_COLOR_DIM = '#fca5a5';

const LossPareto = ({ tick, range }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const inflightRef = useRef(false);

    useEffect(() => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        api.get('/api/sms-performance/v1/loss-pareto', { range })
            .then(resp => { setData(resp); setLoading(false); })
            .catch(() => { setLoading(false); })
            .finally(() => { inflightRef.current = false; });
    }, [tick, range]);

    const cats = data?.categories || [];
    const tonsCats = cats.filter(c => c.units === 'tonnes');
    const cntCats  = cats.filter(c => c.units === 'count');
    const hasData = tonsCats.some(c => (c.tonnes || 0) > 0);

    return (
        <div className="smsperf-card">
            <div className="smsperf-card-h">
                <h3>Loss Pareto</h3>
                <span className="smsperf-sub">
                    {data ? `total ${(data.total_loss_tons || 0).toFixed(1)} t / ${data.heats_count} heats` : ''}
                </span>
            </div>
            <div className="smsperf-chart-body">
                {!hasData && !loading && (
                    <div className="smsperf-empty">No loss data in range.</div>
                )}
                {hasData && (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={tonsCats} margin={{ top: 18, right: 4, left: 0, bottom: 4 }}>
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }}
                                axisLine={false}
                                tickLine={false}
                                interval={0}
                            />
                            <YAxis hide />
                            <Tooltip
                                contentStyle={{
                                    fontSize: 11,
                                    background: 'hsl(var(--card-bg))',
                                    border: '1px solid hsl(var(--border-color))',
                                    borderRadius: 6,
                                }}
                                formatter={(v, name, props) => {
                                    const pct = props?.payload?.pct_of_total;
                                    return [`${Number(v).toFixed(2)} t${pct != null ? ` (${pct}%)` : ''}`, 'Loss'];
                                }}
                            />
                            <Bar dataKey="tonnes" isAnimationActive={false} radius={[3, 3, 0, 0]}>
                                {tonsCats.map((c, i) => (
                                    <Cell key={i} fill={i === 0 ? BAR_COLOR : BAR_COLOR_DIM} />
                                ))}
                                <LabelList
                                    dataKey="tonnes"
                                    position="top"
                                    style={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }}
                                    formatter={v => v > 0 ? Number(v).toFixed(1) : ''}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
                {cntCats.length > 0 && (
                    <div className="smsperf-pareto-counts">
                        <span className="smsperf-sub">Count-units (raw):</span>
                        {cntCats.map(c => (
                            <span key={c.label} className="smsperf-pareto-chip">
                                <span className="smsperf-dim">{c.label}</span>
                                <span className="smsperf-mono">{Number(c.count_value || 0).toFixed(0)}</span>
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LossPareto;
