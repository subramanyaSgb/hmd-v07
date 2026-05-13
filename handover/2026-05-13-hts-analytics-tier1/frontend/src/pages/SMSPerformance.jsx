import React, { useEffect, useState, useRef } from 'react';
import { useHeader } from '../context/HeaderContext';
import KPIRow      from '../components/SMSPerformance/KPIRow';
import YieldTrend  from '../components/SMSPerformance/YieldTrend';
import LossPareto  from '../components/SMSPerformance/LossPareto';
import BySMSTable  from '../components/SMSPerformance/BySMSTable';
import HeatsTable  from '../components/SMSPerformance/HeatsTable';
import '../components/SMSPerformance/SMSPerformance.css';

/**
 * SMS Performance — yield trends + loss-Pareto + per-heat detail.
 *
 * Backed by /api/sms-performance/v1/* (Tier 1 of the HTS analytics
 * roadmap). 1:1 sister page to WeighbridgeAudit in layout primitives —
 * same pill/card/table vocab so it inherits look-and-feel for free.
 *
 * Layout:
 *   [ KPI strip — 5 cards ]
 *   [ Yield trend (line)  ][ Loss Pareto (bar)  ]
 *   [ By-SMS table        ][ By-Shift mini      ]
 *   [ Heats table (paginated, filterable)        ]
 *
 * Master 60s tick — HTS sync runs every 5 min upstream, so anything
 * faster is wasted polling.
 *
 * Roadmap: project_hts_analytics_roadmap.md
 */

const RANGES = [
    { id: 'shift_a', label: 'Shift A' },
    { id: 'today',   label: 'Today'   },
    { id: '7d',      label: '7d'      },
    { id: '30d',     label: '30d'     },
];

const REFRESH_MS = 60_000;

const SMSPerformance = () => {
    const { setHeaderContent } = useHeader();
    const [range, setRange] = useState('today');
    const [tick, setTick]   = useState(0);
    const [smsFilter, setSmsFilter] = useState(null);

    // Master 60s tick
    const timerRef = useRef(null);
    useEffect(() => {
        timerRef.current = setInterval(() => setTick(t => t + 1), REFRESH_MS);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    // HeaderContext — range pills on the right
    useEffect(() => {
        setHeaderContent({
            right: (
                <div className="smsperf-header-right">
                    {RANGES.map(r => (
                        <button
                            key={r.id}
                            type="button"
                            className={`smsperf-pill ${range === r.id ? 'smsperf-pill-active' : ''}`}
                            onClick={() => setRange(r.id)}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            ),
        });
        return () => setHeaderContent({ left: null, center: null, right: null, forceLeftTitle: false });
    }, [range, setHeaderContent]);

    return (
        <div className="smsperf">
            <KPIRow tick={tick} range={range} />

            <div className="smsperf-grid-2col">
                <YieldTrend tick={tick} range={range} />
                <LossPareto tick={tick} range={range} />
            </div>

            <div className="smsperf-grid-2col">
                <BySMSTable
                    tick={tick}
                    range={range}
                    smsFilter={smsFilter}
                    onFilterSMS={setSmsFilter}
                />
                <div className="smsperf-card">
                    <div className="smsperf-card-h">
                        <h3>Filter</h3>
                        <span className="smsperf-sub">
                            {smsFilter ? `Showing ${smsFilter}` : 'All SMS'}
                        </span>
                    </div>
                    <div className="smsperf-filter-body">
                        <p className="smsperf-dim smsperf-help">
                            Click an SMS row on the left to filter the heats
                            table below; click again to clear.
                        </p>
                        {smsFilter && (
                            <button
                                type="button"
                                className="smsperf-btn"
                                onClick={() => setSmsFilter(null)}
                            >
                                Clear filter
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <HeatsTable
                tick={tick}
                range={range}
                sms={smsFilter}
            />
        </div>
    );
};

export default SMSPerformance;
