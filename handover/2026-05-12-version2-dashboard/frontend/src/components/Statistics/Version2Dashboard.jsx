import React, { useEffect, useState, useRef } from 'react';
import { api } from '../../utils/api';
import KPIRow from './V2/KPIRow';
import FleetDonut from './V2/FleetDonut';
import ThroughputChart from './V2/ThroughputChart';
import FlowSankey from './V2/FlowSankey';
import ActiveTripsTable from './V2/ActiveTripsTable';
import AlertFeed from './V2/AlertFeed';
import ShiftBars from './V2/ShiftBars';
import ChemHistogram from './V2/ChemHistogram';
import SystemHealth from './V2/SystemHealth';
import './Version2Dashboard.css';

/**
 * Version 2 Dashboard.
 *
 * 1:1 layout port of desing_idea/dashboard.jsx, adapted to V07's light
 * theme. Owns the master refresh tick (10s); heavy sections opt in to
 * slower cadences via the `tickEvery` prop.
 *
 * Sections render the 4-row grid:
 *   Row 1 — KPIRow (6 cards)
 *   Row 2 — Fleet donut · Throughput · Sankey  (1.05 / 1.45 / 1.35 fr)
 *   Row 3 — Active trips · Alerts              (1.7 / 1 fr)
 *   Row 4 — Shift bars · Chem histogram · System health (1.4 / 1 / 1 fr)
 *
 * Backend contract: /api/statistics/v2/* — see backend/routes/v2_dashboard.py
 */
const REFRESH_MS = 10_000;

const Version2Dashboard = () => {
    const [tick, setTick] = useState(0);
    const timerRef = useRef(null);

    useEffect(() => {
        timerRef.current = setInterval(() => setTick(t => t + 1), REFRESH_MS);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    return (
        <div className="v2-dashboard">
            <div className="v2-row v2-row-kpis">
                <KPIRow tick={tick} />
            </div>

            <div className="v2-row v2-row-middle">
                <FleetDonut tick={tick} />
                <ThroughputChart tick={tick} />
                <FlowSankey tick={tick} />
            </div>

            <div className="v2-row v2-row-trips">
                <ActiveTripsTable tick={tick} />
                <AlertFeed tick={tick} />
            </div>

            <div className="v2-row v2-row-bottom">
                <ShiftBars tick={tick} />
                <ChemHistogram tick={tick} />
                <SystemHealth tick={tick} />
            </div>
        </div>
    );
};

/**
 * Tiny hook used by every V2 section. Pulls JSON from the given endpoint
 * whenever `tick % cadence === 0` AND on mount. Returns `{data, loading,
 * error}` so each section can render its own loading / empty state.
 *
 * Why not React Query? The rest of V07 uses bare fetch + useState (see
 * AdminStatistics line ~316). Matching the codebase convention keeps the
 * V2 dashboard reviewable in isolation.
 */
export const useV2Endpoint = (endpoint, params = {}, opts = {}) => {
    const { tick = 0, cadence = 1, enabled = true } = opts;
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const inflightRef = useRef(false);

    useEffect(() => {
        if (!enabled) return;
        if (tick % cadence !== 0) return;
        if (inflightRef.current) return;
        inflightRef.current = true;
        setError(null);
        api.get(endpoint, params)
            .then(resp => {
                setData(resp);
                setLoading(false);
            })
            .catch(err => {
                setError(err);
                setLoading(false);
            })
            .finally(() => {
                inflightRef.current = false;
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tick, endpoint, JSON.stringify(params), cadence, enabled]);

    return { data, loading, error };
};

export default Version2Dashboard;
