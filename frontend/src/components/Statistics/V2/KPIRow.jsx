import React from 'react';
import { Flame, Truck, Clock, Thermometer } from 'lucide-react';
import { useV2Endpoint } from '../Version2Dashboard';
import KPICard from './KPICard';
import KPIBig from './KPIBig';

/**
 * Row 1 of the V2 dashboard. Four KPI cards across — first card is the
 * "Hot Metal Dispatched" hero (KPIBig with 24h sparkline). Layout uses
 * CSS grid `repeat(4, 1fr)` defined in Version2Dashboard.css.
 *
 * Was six cards until 2026-05-13 — ON-SPEC and CHEM ALERTS were dropped
 * by user decision (changes_tracker #181). The backend stopped emitting
 * `on_spec_*` / `chem_alerts_total` / `cold_count` / `chem_count` in the
 * same commit; see v2_dashboard.py for context if reinstating later.
 *
 * Data comes from /overview which already returns all the KPI numbers
 * + the 24h sparkline. One round-trip per tick.
 */
const KPIRow = ({ tick }) => {
    const { data, loading, error } = useV2Endpoint('/api/statistics/v2/overview', {}, { tick, cadence: 1 });
    const k = data?.kpis;

    if (error) {
        return (
            <div className="v2-card v2-kpi-grid">
                <div className="v2-empty">Failed to load KPIs</div>
            </div>
        );
    }

    return (
        <div className="v2-kpi-grid">
            <KPIBig
                label="HOT METAL DISPATCHED"
                value={k ? k.hot_metal_dispatched_kt.toFixed(1) : '—'}
                unit="kt"
                sub="today · 00:00 IST onward"
                spark={k?.hot_metal_sparkline}
                loading={loading && !k}
                icon={<Flame size={14} />}
            />
            <KPICard
                label="ACTIVE TRIPS"
                value={k ? k.active_trips : '—'}
                unit=""
                sub="in flight right now"
                tone="amber"
                loading={loading && !k}
                icon={<Truck size={14} />}
            />
            <KPICard
                label="AVG CYCLE"
                value={k ? k.avg_cycle_min : '—'}
                unit="min"
                sub="BF arrival → SMS ack"
                loading={loading && !k}
                icon={<Clock size={14} />}
            />
            <KPICard
                label="BF TAP TEMP"
                value={k ? k.avg_bf_tap_temp_c : '—'}
                unit="°C"
                sub="last 24h avg"
                loading={loading && !k}
                icon={<Thermometer size={14} />}
            />
        </div>
    );
};

export default KPIRow;
