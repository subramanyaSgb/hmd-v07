import React, { useEffect, useState, useRef } from 'react';
import { api } from '../../utils/api';
import KPIRow from './V2/KPIRow';
import ProducerBreakdown from './V2/ProducerBreakdown';
import FleetDonut from './V2/FleetDonut';
import ThroughputChart from './V2/ThroughputChart';
import ActiveTripsTable from './V2/ActiveTripsTable';
import ShiftBars from './V2/ShiftBars';
import ChemHistogram from './V2/ChemHistogram';
import SystemHealth from './V2/SystemHealth';
import './Version2Dashboard.css';

/**
 * Version 2 Dashboard.
 *
 * Layout (4 rows):
 *   Row 1 — KPIRow (4 cards — was 6 until ON-SPEC + CHEM ALERTS dropped
 *           2026-05-13, changes_tracker #181)
 *   Row 2 — Fleet donut · Throughput  (1fr / 2fr — was 3 cols with
 *           Producer→Consumer Sankey until dropped 2026-05-13 #181)
 *   Row 3 — Active Trips (FULL WIDTH) — Alerts panel removed 2026-05-14
 *           (changes_tracker #186) to give the trip table the room it
 *           needs for 12 columns + pagination + filters. Alerts feed
 *           remains in the alerts table and is surfaced via the header
 *           bell; a dedicated Alerts page may follow.
 *   Row 4 — Shift bars · Chem histogram · System health (1.4 / 1 / 1 fr)
 *
 * Master tick cadence is 30s (was 10s) — matches the redesigned active
 * trips table's refresh rate. Sections that need finer-grained refresh
 * can opt in via cadence: 1.
 *
 * Backend contract: /api/statistics/v2/* — see backend/routes/v2_dashboard.py
 */
const REFRESH_MS = 30_000;

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

            <div className="v2-row v2-row-producer">
                <ProducerBreakdown tick={tick} />
            </div>

            <div className="v2-row v2-row-middle">
                <FleetDonut tick={tick} />
                <ThroughputChart tick={tick} />
            </div>

            <div className="v2-row v2-row-trips v2-row-trips-full">
                <ActiveTripsTable tick={tick} />
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
