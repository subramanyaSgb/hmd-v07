import React, { useMemo } from 'react';
import { useV2Endpoint } from '../Version2Dashboard';

/**
 * Producer → Consumer flow ribbon (BF → SMS) — hand-rolled SVG.
 *
 * The math is lifted from desing_idea/dashboard.jsx:FlowSankey verbatim
 * with the source colors recolored for the light theme. Recharts has no
 * native sankey for our layout (two stacked sides with proportional
 * ribbons), so we keep the design idea's implementation.
 *
 * Cadence 6 ticks (≈60s) since totals don't change every 10s.
 */
const SOURCE_COLORS = {
    BF3: '#3b82f6',                                                       // primary blue
    BF4: '#f59e0b',                                                       // amber
    BF5: '#a78bfa',                                                       // violet
};
const DEFAULT_SOURCE_COLOR = '#64748b';

const FlowSankey = ({ tick }) => {
    const { data, loading } = useV2Endpoint('/api/statistics/v2/sankey', {}, { tick, cadence: 6 });

    const layout = useMemo(() => computeLayout(data), [data]);

    return (
        <div className="v2-card v2-sankey-card">
            <div className="v2-card-h">
                <h3>Producer → Consumer flow</h3>
                <span className="v2-sub">trips today</span>
            </div>
            <div className="v2-sankey-body">
                {(!data || data.ribbons?.length === 0) && !loading && (
                    <div className="v2-empty">No flow data today</div>
                )}
                {layout && (
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="v2-sankey-svg">
                        {/* ribbons */}
                        {layout.ribbons.map((r, i) => (
                            <path
                                key={i}
                                d={r.path}
                                fill={r.color}
                                opacity={0.32}
                            />
                        ))}
                        {/* source bars + labels */}
                        {layout.sources.map(s => (
                            <g key={s.name}>
                                <rect x="9" y={s.y} width="3" height={s.h} fill={s.color} />
                                <text x="6" y={s.y + s.h / 2 + 1.6} textAnchor="end"
                                      className="v2-sankey-label">{s.name}</text>
                                <text x="6" y={s.y + s.h / 2 + 5.2} textAnchor="end"
                                      className="v2-sankey-count">{s.count}</text>
                            </g>
                        ))}
                        {/* sink bars + labels */}
                        {layout.sinks.map(d => (
                            <g key={d.name}>
                                <rect x="88" y={d.y} width="3" height={d.h} fill="#475569" />
                                <text x="94" y={d.y + d.h / 2 + 1.6} textAnchor="start"
                                      className="v2-sankey-label">{d.name}</text>
                                <text x="94" y={d.y + d.h / 2 + 5.2} textAnchor="start"
                                      className="v2-sankey-count">{d.count}</text>
                            </g>
                        ))}
                    </svg>
                )}
            </div>
        </div>
    );
};

/**
 * Build the SVG layout from the API payload. Returns null if there are
 * no ribbons (caller renders the empty state instead).
 *
 * Algorithm — same as the design idea:
 *   1. Vertically stack source bars proportionally to their share of total
 *   2. Same for sinks
 *   3. For each (src, dst) pair, slice a ribbon out of the source band
 *      proportional to dst's share of the source's outgoing flow
 *   4. Bezier-curve from left-y-band to right-y-band → returns a closed
 *      quadrilateral path
 */
function computeLayout(data) {
    if (!data || !data.sources || !data.sinks || !data.ribbons || data.ribbons.length === 0) {
        return null;
    }
    const H = 100;

    const totalSrc = data.sources.reduce((a, s) => a + s.count, 0) || 1;
    const totalSnk = data.sinks.reduce((a, s) => a + s.count, 0) || 1;

    // Stack source bars
    let sy = 3;
    const sources = data.sources.map(s => {
        const h = (s.count / totalSrc) * (H - 6);
        const out = { name: s.name, count: s.count, y: sy, h,
                      color: SOURCE_COLORS[s.name] || DEFAULT_SOURCE_COLOR };
        sy += h + 1.5;
        return out;
    });

    // Stack sink bars
    let ny = 3;
    const sinks = data.sinks.map(d => {
        const h = (d.count / totalSnk) * (H - 6);
        const out = { name: d.name, count: d.count, y: ny, h };
        ny += h + 1.5;
        return out;
    });

    // Build ribbons — for each source, walk its sinks in payload order
    // and slice off the proportional band. Match the design idea's
    // distribute-proportional logic so the layout is stable across reloads.
    const ribbons = [];
    const sourceConsumed = {};                                            // bytes already sliced from each source's band
    const sinkConsumed = {};                                              // bytes already added to each sink's band

    // Build a map of (src → ribbons) so we slice the source band in order
    const byBoth = {};
    for (const r of data.ribbons) {
        const key = `${r.source}__${r.destination}`;
        byBoth[key] = r.count;
    }

    for (const src of sources) {
        for (const dst of sinks) {
            const flow = byBoth[`${src.name}__${dst.name}`];
            if (!flow) continue;
            const yS = src.y + (sourceConsumed[src.name] || 0) / src.count * src.h;
            const hS = (flow / src.count) * src.h;
            sourceConsumed[src.name] = (sourceConsumed[src.name] || 0) + flow;

            const yD = dst.y + (sinkConsumed[dst.name] || 0) / dst.count * dst.h;
            const hD = (flow / dst.count) * dst.h;
            sinkConsumed[dst.name] = (sinkConsumed[dst.name] || 0) + flow;

            const path = `M 12 ${yS}
                          C 50 ${yS}, 50 ${yD}, 88 ${yD}
                          L 88 ${yD + hD}
                          C 50 ${yD + hD}, 50 ${yS + hS}, 12 ${yS + hS} Z`;
            ribbons.push({ path, color: src.color });
        }
    }

    return { sources, sinks, ribbons };
}

export default FlowSankey;
