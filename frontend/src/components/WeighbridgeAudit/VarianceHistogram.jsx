import React, { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { api } from '../../utils/api';

/**
 * 11-bin variance distribution from -0.6% to +0.6% (step 0.2).
 *
 * Source: /api/weighbridge-audit/v2/overview (shared with KPIRow +
 * CalibrationCard — server caches for 60s).
 *
 * Bar color from server's `tone` field:
 *   |label| ≤ 0.2  → green (in-spec)
 *   |label| 0.3-0.4 → amber
 *   |label| ≥ 0.5  → red
 *
 * Bin counts rendered above each bar via LabelList.
 */

const TONE_COLORS = {
    green: '#15803d',
    amber: '#f59e0b',
    red:   '#ef4444',
};

const VarianceHistogram = ({ tick, range }) => {
    const [data, setData]   = useState(null);
    const [loading, setLoading] = useState(true);
    const inflightRef = useRef(false);

    useEffect(() => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        api.get('/api/weighbridge-audit/v2/overview', { range })
            .then(resp => { setData(resp); setLoading(false); })
            .catch(() => { setLoading(false); })
            .finally(() => { inflightRef.current = false; });
    }, [tick, range]);

    const bins = data?.variance_histogram?.bins || [];
    const hasData = bins.some(b => b.count > 0);

    const rangeLabel =
        range === 'today'   ? 'today' :
        range === 'shift_a' ? 'this shift' :
                              'last 7 days';

    return (
        <div className="wb-card">
            <div className="wb-card-h">
                <h3>Variance distribution</h3>
                <span className="wb-sub">{rangeLabel}</span>
            </div>
            <div className="wb-hist-body">
                {!hasData && !loading && (
                    <div className="wb-empty wb-empty-tiny">
                        No reconciled trips yet for this range.
                    </div>
                )}
                {hasData && (
                    <ResponsiveContainer width="100%" height={170}>
                        <BarChart data={bins} margin={{ top: 18, right: 4, left: 0, bottom: 4 }}>
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 9.5, fill: 'hsl(var(--text-muted))' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis hide />
                            <Bar dataKey="count" isAnimationActive={false} radius={[2, 2, 0, 0]}>
                                {bins.map((b, i) => (
                                    <Cell key={i} fill={TONE_COLORS[b.tone] || TONE_COLORS.green} />
                                ))}
                                <LabelList
                                    dataKey="count"
                                    position="top"
                                    style={{ fontSize: 9.5, fill: 'hsl(var(--text-muted))' }}
                                    formatter={v => v > 0 ? v : ''}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
};

export default VarianceHistogram;
