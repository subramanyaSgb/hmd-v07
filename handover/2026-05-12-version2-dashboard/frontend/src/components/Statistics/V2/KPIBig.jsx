import React from 'react';

/**
 * Hero KPI card — same shape as KPICard but bigger value text and a
 * 24-hour sparkline at the bottom. Hand-rolled SVG (no Recharts) — the
 * chart is decorative so we don't need tooltips / axes / responsive
 * container, just a smooth area + line at fixed height.
 */
const KPIBig = ({ label, value, unit, sub, spark, loading, icon }) => {
    return (
        <div className="v2-card v2-kpi-card v2-kpi-card-big">
            <div className="v2-kpi-head">
                <span className="v2-kpi-label">{label}</span>
                {icon && <span className="v2-kpi-icon">{icon}</span>}
            </div>
            <div className="v2-kpi-row">
                <div className="v2-kpi-value v2-kpi-big-value">{loading ? '—' : value}</div>
                {unit && <div className="v2-kpi-unit">{unit}</div>}
            </div>
            <div className="v2-kpi-sub">{sub || ' '}</div>
            <Spark data={spark || []} />
        </div>
    );
};

const Spark = ({ data }) => {
    if (!data || data.length < 2) {
        return <div className="v2-kpi-spark v2-kpi-spark-empty" />;
    }
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const points = data.map((v, i) =>
        `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 100}`
    ).join(' ');
    return (
        <svg className="v2-kpi-spark" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={`0,100 ${points} 100,100`} className="v2-spark-area" />
            <polyline points={points} className="v2-spark-line" vectorEffect="non-scaling-stroke" />
        </svg>
    );
};

export default KPIBig;
