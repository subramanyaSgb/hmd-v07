import React from 'react';
import { Factory } from 'lucide-react';
import { useV2Endpoint } from '../Version2Dashboard';

/**
 * Producer Breakdown — per-BF/COREX dispatched tonnes today.
 *
 * 2026-05-14 (#191): new row between the 4 KPI cards and the
 * Donut+Throughput row. Reads `producer_breakdown` from /overview
 * (extension added in v2_dashboard.py same commit) which uses the
 * exact same filter as the HOT METAL DISPATCHED KPI so the sum of
 * the 7 cells always equals Card 1's big number.
 *
 * Decisions (user, 2026-05-14):
 *   - Alphabetical order: BF1, BF2, BF3, BF4, BF5, COREX1, COREX2
 *   - All 7 slots always rendered (zero-trip producers grayed out)
 *     so operators see at a glance who's silent
 *   - Cell shows: producer name (big), kt (medium), trips count (dim),
 *     small green dot if dispatched in last hour
 */

const FALLBACK_LIST = [                                                  // shown while loading or on error
    'BF1', 'BF2', 'BF3', 'BF4', 'BF5', 'COREX1', 'COREX2',
];

const ProducerBreakdown = ({ tick }) => {
    const { data, loading } = useV2Endpoint(
        '/api/statistics/v2/overview',
        {},
        { tick, cadence: 1 }
    );
    const breakdown = data?.producer_breakdown;

    // Skeleton on first paint so the row doesn't pop in
    const items = breakdown && breakdown.length > 0
        ? breakdown
        : FALLBACK_LIST.map(src => ({
            source: src,
            trips: 0,
            tonnes: 0,
            kt: 0,
            pct_of_total: 0,
            active_last_hour: false,
        }));

    return (
        <div className="v2-producer-strip" role="region" aria-label="Producer breakdown">
            {items.map(p => {
                const isZero   = p.trips === 0;
                const isLive   = p.active_last_hour;
                const ktLabel  = isZero ? '—' : `${p.kt.toFixed(2)} kt`;
                const tripsLbl = `${p.trips} ${p.trips === 1 ? 'trip' : 'trips'}`;
                return (
                    <div
                        key={p.source}
                        className={
                            'v2-producer-card'
                            + (isZero ? ' v2-producer-card--zero' : '')
                            + (isLive ? ' v2-producer-card--live' : '')
                        }
                        title={
                            isZero
                              ? `${p.source}: no dispatch today`
                              : `${p.source}: ${p.tonnes} t · ${tripsLbl} · ${p.pct_of_total}% of total`
                        }
                    >
                        <div className="v2-producer-head">
                            <Factory size={11} className="v2-producer-icon" />
                            <span className="v2-producer-name">{p.source}</span>
                            {isLive && <span className="v2-producer-live-dot" aria-label="active in last hour" />}
                        </div>
                        <div className="v2-producer-value">{ktLabel}</div>
                        <div className="v2-producer-sub">{tripsLbl}</div>
                        {!isZero && (
                            <div className="v2-producer-bar" aria-hidden="true">
                                <div
                                    className="v2-producer-bar-fill"
                                    style={{ width: `${Math.min(100, p.pct_of_total)}%` }}
                                />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default ProducerBreakdown;
