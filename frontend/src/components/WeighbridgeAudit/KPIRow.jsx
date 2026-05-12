import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Activity, Layers } from 'lucide-react';
import { api } from '../../utils/api';

/**
 * 4 KPI cards across the top of the Weighbridge Audit page:
 *   TRIPS RECONCILED (92 of 96)
 *   OPEN VARIANCES   (4 ≥ 0.3%)
 *   AVG VARIANCE     (0.18 %)
 *   TOTAL DISPATCHED (32.4 kt)
 *
 * Shares the same fetch endpoint as VarianceHistogram + CalibrationCard
 * (/api/weighbridge-audit/v2/overview) — but each calls it independently.
 * Server caches for 60s, so a triple-fetch on the same tick is cheap.
 */
const KPIRow = ({ tick, range }) => {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    const inflightRef = useRef(false);

    useEffect(() => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        api.get('/api/weighbridge-audit/v2/overview', { range })
            .then(resp => { setData(resp); setLoading(false); setError(null); })
            .catch(err => { setError(err); setLoading(false); })
            .finally(() => { inflightRef.current = false; });
    }, [tick, range]);

    const k = data?.kpis;

    return (
        <div className="wb-kpi-grid">
            <KPICard
                label="TRIPS RECONCILED"
                value={loading || !k ? '—' : k.trips_reconciled.value}
                sub={k ? `of ${k.trips_reconciled.total}` : ''}
                icon={<CheckCircle2 size={14} />}
                tone="green"
            />
            <KPICard
                label="OPEN VARIANCES"
                value={loading || !k ? '—' : k.open_variances.value}
                sub={k ? `≥ ${k.open_variances.threshold_pct}%` : ''}
                icon={<AlertTriangle size={14} />}
                tone={k && k.open_variances.value > 0 ? 'amber' : null}
            />
            <KPICard
                label="AVG VARIANCE"
                value={loading || !k ? '—' : k.avg_variance_pct}
                unit="%"
                icon={<Activity size={14} />}
            />
            <KPICard
                label="TOTAL DISPATCHED"
                value={loading || !k ? '—' : k.total_dispatched_kt}
                unit="kt"
                icon={<Layers size={14} />}
            />
            {error && (
                <div className="wb-kpi-error">Failed to load KPIs</div>
            )}
        </div>
    );
};

const KPICard = ({ label, value, unit, sub, icon, tone }) => {
    const toneCls = tone ? `wb-kpi-value wb-kpi-${tone}` : 'wb-kpi-value';
    return (
        <div className="wb-kpi-card">
            <div className="wb-kpi-head">
                <span className="wb-kpi-label">{label}</span>
                {icon && <span className="wb-kpi-icon">{icon}</span>}
            </div>
            <div className="wb-kpi-row">
                <div className={toneCls}>{value}</div>
                {unit && <div className="wb-kpi-unit">{unit}</div>}
            </div>
            <div className="wb-kpi-sub">{sub || ' '}</div>
        </div>
    );
};

export default KPIRow;
