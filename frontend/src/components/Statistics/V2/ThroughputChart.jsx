import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, Legend } from 'recharts';
import { useV2Endpoint } from '../Version2Dashboard';

/**
 * Hot Metal Throughput — stacked area by producer.
 *
 * 2026-05-14 (#192) full rewrite. Prior version filtered on `closetime`
 * only (probe revealed this missed ~42% of tonnage), used a UTC `now`
 * against IST timestamps (window shifted by 5.5h), and dropped sparse
 * hours via SQL GROUP BY (chart connected dots across zero-production
 * gaps). Backend now returns per-producer + total per bucket so this
 * component can render a stacked area with 7 producer bands.
 *
 * Range options: Today | 7d | 30d (calendar-aligned).
 * Unit: auto — tonnes for Today, kt for 7d/30d.
 *
 * Colors keep alphabetical stack order so BF1 is always at the bottom
 * of the stack and COREX2 at the top. BF3 currently silent (see memory
 * note "BF3 stopped 2025-09-24") — its band will be flat at zero across
 * the entire window, which is operationally meaningful.
 */

const RANGES = [
    { value: 'today', label: 'Today' },
    { value: '7d',    label: '7d'    },
    { value: '30d',   label: '30d'   },
];

// Producer color palette. Aligned with the Producer Breakdown strip's
// visual language: distinct hues, all saturated enough to read on a
// light background, alphabetical = stack order.
const PRODUCER_COLOR = {
    BF1:    'hsl(214 78% 56%)',     // blue
    BF2:    'hsl(190 70% 48%)',     // cyan
    BF3:    'hsl(150 55% 42%)',     // green
    BF4:    'hsl(40  90% 55%)',     // gold
    BF5:    'hsl(20  78% 55%)',     // orange
    COREX1: 'hsl(270 55% 60%)',     // purple
    COREX2: 'hsl(320 60% 55%)',     // pink
};

const FALLBACK_COLOR = 'hsl(220 14% 56%)';

const ThroughputChart = ({ tick }) => {
    const [range, setRange] = useState('today');

    const { data, loading } = useV2Endpoint(
        '/api/statistics/v2/throughput',
        { range },
        { tick, cadence: 6 }                                             // ~60s
    );

    const buckets   = data?.buckets   || [];
    const producers = data?.producers || ['BF1','BF2','BF3','BF4','BF5','COREX1','COREX2'];
    const unit      = data?.unit      || (range === 'today' ? 'tonnes' : 'kt');

    const totalForWindow = buckets.reduce((acc, b) => acc + (Number(b.total) || 0), 0);
    const totalLabel = unit === 'kt'
        ? `${totalForWindow.toFixed(1)} kt`
        : `${Math.round(totalForWindow).toLocaleString()} t`;

    const subLabel = (() => {
        if (range === 'today') return `today · tonnes / hour · total ${totalLabel}`;
        if (range === '7d')    return `last 7 days · kt / day · total ${totalLabel}`;
        return                       `last 30 days · kt / day · total ${totalLabel}`;
    })();

    return (
        <div className="v2-card v2-throughput-card">
            <div className="v2-card-h">
                <h3>Hot Metal Throughput</h3>
                <span className="v2-sub">{subLabel}</span>
                <div className="v2-card-actions">
                    {RANGES.map(r => (
                        <button
                            key={r.value}
                            type="button"
                            className={`v2-pill ${range === r.value ? 'v2-pill-active' : ''}`}
                            onClick={() => setRange(r.value)}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="v2-throughput-body">
                {buckets.length === 0 && !loading && (
                    <div className="v2-empty">No throughput data in this range</div>
                )}
                {buckets.length > 0 && (
                    <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-color))" opacity={0.4} />
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }}
                                axisLine={false}
                                tickLine={false}
                                minTickGap={range === 'today' ? 30 : 12}
                            />
                            <YAxis
                                tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }}
                                axisLine={false}
                                tickLine={false}
                                width={38}
                                tickFormatter={(v) => unit === 'kt' ? `${v}` : `${v}`}
                            />
                            <Tooltip
                                content={<ThroughputTooltip unit={unit} producers={producers} />}
                                cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, opacity: 0.3 }}
                            />
                            {producers.map(p => (
                                <Area
                                    key={p}
                                    type="monotone"
                                    dataKey={p}
                                    stackId="producers"
                                    stroke={PRODUCER_COLOR[p] || FALLBACK_COLOR}
                                    fill={PRODUCER_COLOR[p] || FALLBACK_COLOR}
                                    fillOpacity={0.55}
                                    strokeWidth={1}
                                    isAnimationActive={false}
                                />
                            ))}
                            <Legend
                                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                                iconSize={8}
                                iconType="square"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
};

/**
 * Custom tooltip: shows label + per-producer breakdown sorted by value
 * desc + total. Skips producers whose value is 0 so the tooltip only
 * lists who actually contributed in that bucket.
 */
const ThroughputTooltip = ({ active, payload, label, unit, producers }) => {
    if (!active || !payload || payload.length === 0) return null;
    const datum = payload[0]?.payload || {};
    const unitLabel = unit === 'kt' ? 'kt' : 't';

    // Build sorted list of producers with non-zero values
    const rows = producers
        .map(p => ({ key: p, value: Number(datum[p]) || 0, color: PRODUCER_COLOR[p] || FALLBACK_COLOR }))
        .filter(r => r.value > 0)
        .sort((a, b) => b.value - a.value);

    return (
        <div className="v2-throughput-tooltip">
            <div className="v2-throughput-tooltip-h">{label}</div>
            {rows.length === 0 && (
                <div className="v2-throughput-tooltip-empty">No production</div>
            )}
            {rows.map(r => (
                <div className="v2-throughput-tooltip-row" key={r.key}>
                    <span className="v2-throughput-tooltip-swatch" style={{ background: r.color }} />
                    <span className="v2-throughput-tooltip-name">{r.key}</span>
                    <span className="v2-throughput-tooltip-val">
                        {unit === 'kt' ? r.value.toFixed(2) : r.value.toFixed(1)} {unitLabel}
                    </span>
                </div>
            ))}
            {rows.length > 0 && (
                <div className="v2-throughput-tooltip-total">
                    <span className="v2-throughput-tooltip-name">Total</span>
                    <span className="v2-throughput-tooltip-val">
                        {unit === 'kt'
                            ? Number(datum.total || 0).toFixed(2)
                            : Number(datum.total || 0).toFixed(1)} {unitLabel}
                    </span>
                </div>
            )}
        </div>
    );
};

export default ThroughputChart;
