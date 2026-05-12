import React from 'react';

/**
 * Single KPI card — label, big value+unit, sub-text. `tone` colors the
 * value (amber / red / green). Optional `icon` shows top-right.
 *
 * The light-theme color tokens are scoped in Version2Dashboard.css —
 * stick to the `--v2-*` palette so this card doesn't drift from the rest
 * of the V2 board if the global theme is ever swapped.
 */
const KPICard = ({ label, value, unit, sub, tone, icon, loading }) => {
    const toneClass = tone ? `v2-kpi-value v2-kpi-${tone}` : 'v2-kpi-value';
    return (
        <div className="v2-card v2-kpi-card">
            <div className="v2-kpi-head">
                <span className="v2-kpi-label">{label}</span>
                {icon && <span className="v2-kpi-icon">{icon}</span>}
            </div>
            <div className="v2-kpi-row">
                <div className={toneClass}>{loading ? '—' : value}</div>
                {unit && <div className="v2-kpi-unit">{unit}</div>}
            </div>
            <div className="v2-kpi-sub">{sub || ' '}</div>
        </div>
    );
};

export default KPICard;
