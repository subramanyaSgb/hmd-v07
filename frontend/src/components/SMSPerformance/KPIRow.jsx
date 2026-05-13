import React, { useEffect, useRef, useState } from 'react';
import { TrendingUp, Layers, AlertTriangle, Award, Activity } from 'lucide-react';
import { api } from '../../utils/api';

/**
 * Top 5 KPI cards for SMS Performance.
 *
 * HEATS         — total heats in range
 * AVG YIELD     — avg yield_pct
 * BEST YIELD    — single best heat in range
 * BELOW TARGET  — heats < SMS_YIELD_TARGET_PCT (default 96.0)
 * TOTAL LOSS    — sum of the 4 tonnage loss columns
 */
const KPIRow = ({ tick, range }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const inflightRef = useRef(false);

    useEffect(() => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        api.get('/api/sms-performance/v1/overview', { range })
            .then(resp => { setData(resp); setLoading(false); setError(null); })
            .catch(err => { setError(err); setLoading(false); })
            .finally(() => { inflightRef.current = false; });
    }, [tick, range]);

    const k = data?.kpis;
    const fmt = (v, d=2) => (v == null ? '—' : Number(v).toFixed(d));

    return (
        <div className="smsperf-kpi-grid">
            <KPICard
                label="HEATS"
                value={loading || !k ? '—' : k.heats_total}
                sub={k ? `in window` : ''}
                icon={<Layers size={14} />}
            />
            <KPICard
                label="AVG YIELD"
                value={loading || !k ? '—' : fmt(k.avg_yield_pct, 2)}
                unit="%"
                sub={k ? `target ${fmt(k.yield_target_pct, 1)}%` : ''}
                icon={<TrendingUp size={14} />}
                tone={k && k.avg_yield_pct != null && k.avg_yield_pct < k.yield_target_pct ? 'amber' : 'green'}
            />
            <KPICard
                label="BEST YIELD"
                value={loading || !k ? '—' : fmt(k.best_yield_pct, 2)}
                unit="%"
                sub=" "
                icon={<Award size={14} />}
                tone="green"
            />
            <KPICard
                label="BELOW TARGET"
                value={loading || !k ? '—' : k.heats_below_target}
                sub={k ? `of ${k.heats_total} heats` : ''}
                icon={<AlertTriangle size={14} />}
                tone={k && k.heats_below_target > 0 ? 'amber' : null}
            />
            <KPICard
                label="TOTAL LOSS"
                value={loading || !k ? '—' : fmt(k.total_loss_tons, 1)}
                unit="t"
                sub="head+tail+sample+other"
                icon={<Activity size={14} />}
            />
            {error && (
                <div className="smsperf-kpi-error">Failed to load KPIs</div>
            )}
        </div>
    );
};

const KPICard = ({ label, value, unit, sub, icon, tone }) => {
    const toneCls = tone ? `smsperf-kpi-value smsperf-kpi-${tone}` : 'smsperf-kpi-value';
    return (
        <div className="smsperf-kpi-card">
            <div className="smsperf-kpi-head">
                <span className="smsperf-kpi-label">{label}</span>
                {icon && <span className="smsperf-kpi-icon">{icon}</span>}
            </div>
            <div className="smsperf-kpi-row">
                <div className={toneCls}>{value}</div>
                {unit && <div className="smsperf-kpi-unit">{unit}</div>}
            </div>
            <div className="smsperf-kpi-sub">{sub || ' '}</div>
        </div>
    );
};

export default KPIRow;
