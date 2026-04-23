import { useState } from 'react';
import { CheckCircle, AlertTriangle, TrendingUp, Anchor, Clock, ChevronDown, ChevronUp, Circle, TrendingDown } from 'lucide-react';

const STATUS_STEPS = [
    { code: 0, label: 'Pending', short: 'PND', field: 'created_at', deviationKey: null, description: 'Trip created, awaiting assignment' },
    { code: 1, label: 'Assigned', short: 'ASN', field: 'assigned_at', deviationKey: null, description: 'Torpedo assigned to trip' },
    { code: 2, label: 'WB Tare Entry', short: 'WT-E', field: 'wb_tare_entry_at', deviationKey: null, description: 'Entered weighbridge for tare weight' },
    { code: 3, label: 'WB Tare Recorded', short: 'WT-R', field: 'wb_tare_recorded_at', deviationKey: null, description: 'Tare weight recorded' },
    { code: 4, label: 'Producer Entered', short: 'P-IN', field: 'p_entered_at', deviationKey: 'p_entered', description: 'Arrived at producer' },
    { code: 5, label: 'Loading Started', short: 'LD-S', field: 'p_loading_start_at', deviationKey: 'loading_start', description: 'Loading operation started' },
    { code: 6, label: 'Loading Ended', short: 'LD-E', field: 'p_loading_end_at', deviationKey: 'loading_end', description: 'Loading operation completed' },
    { code: 7, label: 'Producer Exited', short: 'P-OUT', field: 'p_exited_at', deviationKey: 'p_exited', description: 'Departed from producer' },
    { code: 8, label: 'WB Gross Entry', short: 'WG-E', field: 'wb_gross_entry_at', deviationKey: null, description: 'Entered weighbridge for gross weight' },
    { code: 9, label: 'WB Gross Recorded', short: 'WG-R', field: 'wb_gross_recorded_at', deviationKey: null, description: 'Gross weight recorded' },
    { code: 10, label: 'Consumer Entered', short: 'C-IN', field: 'c_entered_at', deviationKey: 'c_entered', description: 'Arrived at consumer' },
    { code: 11, label: 'Unloading Started', short: 'UL-S', field: 'c_unloading_start_at', deviationKey: 'unloading_start', description: 'Unloading operation started' },
    { code: 12, label: 'Unloading Ended', short: 'UL-E', field: 'c_unloading_end_at', deviationKey: 'unloading_end', description: 'Unloading operation completed' },
    { code: 13, label: 'Completed', short: 'DONE', field: 'c_exited_at', deviationKey: 'completed', description: 'Trip fully completed' }
];

const DeviationBadge = ({ deviation, compact = false }) => {
    if (!deviation) return null;

    const { deviation_minutes, status } = deviation;
    const minutes = deviation_minutes || 0;
    const sign = minutes > 0 ? '+' : '';

    const statusConfig = {
        on_track: { color: 'hsl(142 71% 40%)', bg: 'hsl(142 71% 40% / 0.15)', icon: CheckCircle, label: 'On Time' },
        early: { color: 'hsl(142 71% 35%)', bg: 'hsl(142 71% 35% / 0.15)', icon: TrendingUp, label: 'Early' },
        warning: { color: 'hsl(38 92% 50%)', bg: 'hsl(38 92% 50% / 0.15)', icon: AlertTriangle, label: 'Warning' },
        alert: { color: 'hsl(25 95% 53%)', bg: 'hsl(25 95% 53% / 0.15)', icon: AlertTriangle, label: 'Alert' },
        critical: { color: 'hsl(0 84% 60%)', bg: 'hsl(0 84% 60% / 0.15)', icon: AlertTriangle, label: 'Critical' }
    };

    const config = statusConfig[status] || statusConfig.on_track;
    const Icon = config.icon;

    if (compact) {
        return (
            <span title={`${config.label}: ${sign}${Math.round(minutes)}m`} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '2px 4px', borderRadius: '4px', background: config.bg, color: config.color, fontSize: '0.6rem', fontWeight: 700 }}>
                <Icon size={10} />
                {sign}{Math.round(minutes)}m
            </span>
        );
    }

    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '4px', background: config.bg, color: config.color, fontSize: '0.65rem', fontWeight: 700 }}>
            <Icon size={12} />
            {sign}{Math.round(minutes)}m
        </span>
    );
};

const TripDeviationBadge = ({ deviationMinutes, deviationStatus }) => {
    if (deviationMinutes === null || deviationMinutes === undefined) return null;

    const sign = deviationMinutes > 0 ? '+' : '';

    const statusConfig = {
        on_track: { color: 'hsl(142 71% 40%)', bg: 'hsl(142 71% 40% / 0.15)', label: 'On Time' },
        early: { color: 'hsl(142 71% 35%)', bg: 'hsl(142 71% 35% / 0.15)', label: 'Early' },
        warning: { color: 'hsl(38 92% 50%)', bg: 'hsl(38 92% 50% / 0.15)', label: 'Warning' },
        alert: { color: 'hsl(25 95% 53%)', bg: 'hsl(25 95% 53% / 0.15)', label: 'Alert' },
        critical: { color: 'hsl(0 84% 60%)', bg: 'hsl(0 84% 60% / 0.15)', label: 'Critical' }
    };

    const config = statusConfig[deviationStatus] || statusConfig.on_track;

    return (
        <span className="deviation-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', background: config.bg, color: config.color, fontSize: '0.7rem', fontWeight: 700, marginLeft: '8px' }}>
            {deviationMinutes <= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {sign}{Math.round(deviationMinutes)}m
        </span>
    );
};

const TripTimeline = ({ trip }) => {
    const [showDetails, setShowDetails] = useState(false);

    const formatTime = (isoString) => {
        if (!isoString) return '--:--';
        return new Date(isoString).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDateTime = (isoString) => {
        if (!isoString) return '---';
        const d = new Date(isoString);
        return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    };

    const getStatusClass = (stepCode) => {
        if (trip.status > stepCode) return 'completed';
        if (trip.status === stepCode) return 'current';
        return 'pending';
    };

    const getStepDeviation = (step) => {
        if (!step.deviationKey || !trip.deviations) return null;
        return trip.deviations[step.deviationKey];
    };

    const getExpectedTime = (step) => {
        if (!trip.expected_timeline || !step.field) return null;
        
        const fieldMap = {
            'wb_tare_entry_at': 'wb_tare_entry_at',
            'wb_tare_recorded_at': 'wb_tare_recorded_at',
            'p_entered_at': 'p_entered_at',
            'p_loading_start_at': 'p_loading_start_at',
            'p_loading_end_at': 'p_loading_end_at',
            'p_exited_at': 'p_exited_at',
            'wb_gross_entry_at': 'wb_gross_entry_at',
            'wb_gross_recorded_at': 'wb_gross_recorded_at',
            'c_entered_at': 'c_entered_at',
            'c_unloading_start_at': 'c_unloading_start_at',
            'c_unloading_end_at': 'c_unloading_end_at',
            'c_exited_at': 'c_exited_at'
        };
        return trip.expected_timeline?.[fieldMap[step.field]];
    };

    const hasDeviationData = trip.deviations || trip.total_deviation_minutes !== undefined;

    return (
        <div className={`trip-timeline-card status-${trip.status}`}>
            <div className="trip-timeline-header">
                <div className="trip-id-section">
                    <span className="trip-id">{trip.trip_id}</span>
                    <span className={`trip-status-badge status-${trip.status}`}>
                        {trip.status_label}
                    </span>
                    {trip.status === 13 && trip.total_deviation_minutes !== undefined && (
                        <TripDeviationBadge deviationMinutes={trip.total_deviation_minutes} deviationStatus={trip.deviation_status} />
                    )}
                </div>

                <div className="trip-meta">
                    {trip.torpedo_id && (
                        <span className="torpedo-badge">
                            <Anchor size={12} />
                            {trip.torpedo_id}
                        </span>
                    )}
                    {trip.cycle_time_minutes && (
                        <span className="cycle-time-badge">
                            <Clock size={12} />
                            {Math.round(trip.cycle_time_minutes)} min
                            {trip.expected_duration_minutes && (
                                <span style={{ opacity: 0.7, marginLeft: '4px' }}>
                                    / {Math.round(trip.expected_duration_minutes)} exp
                                </span>
                            )}
                        </span>
                    )}
                    {trip.shift && (
                        <span className="shift-badge" style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: 'hsl(var(--accent) / 0.1)',
                            color: 'hsl(var(--accent))',
                            fontSize: '0.7rem',
                            fontWeight: 600
                        }}>
                            {trip.shift}
                        </span>
                    )}
                </div>

                <button className="btn-timeline-toggle" onClick={() => setShowDetails(!showDetails)} title={showDetails ? 'Hide details' : 'Show details'}>
                    {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
            </div>
            {trip.status === 13 && trip.phase_deviations && (
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '8px 16px',
                    borderTop: '1px solid hsl(var(--border-color))',
                    background: 'hsl(var(--main-bg))'
                }}>
                    {trip.phase_deviations.loading && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            color: 'hsl(var(--text-muted))'
                        }}>
                            <span>Loading:</span>
                            <DeviationBadge deviation={trip.phase_deviations.loading} compact />
                        </div>
                    )}
                    {trip.phase_deviations.transit && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            color: 'hsl(var(--text-muted))'
                        }}>
                            <span>Transit:</span>
                            <DeviationBadge deviation={trip.phase_deviations.transit} compact />
                        </div>
                    )}
                    {trip.phase_deviations.unloading && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            color: 'hsl(var(--text-muted))'
                        }}>
                            <span>Unloading:</span>
                            <DeviationBadge deviation={trip.phase_deviations.unloading} compact />
                        </div>
                    )}
                </div>
            )}
            <div className="timeline-track-compact">
                {STATUS_STEPS.map((step, idx) => {
                    const statusClass = getStatusClass(step.code);
                    const timestamp = trip.timeline?.[step.field];
                    const deviation = getStepDeviation(step);

                    return (
                        <div key={step.code} className={`timeline-step-compact ${statusClass}`}>
                            <div className="step-marker-compact">
                                {statusClass === 'completed' ? (
                                    <CheckCircle size={14} />
                                ) : statusClass === 'current' ? (
                                    <div className="current-pulse"></div>
                                ) : (
                                    <Circle size={14} />
                                )}
                            </div>
                            {idx < STATUS_STEPS.length - 1 && (
                                <div className={`step-connector ${statusClass}`}></div>
                            )}
                            <span className="step-label-compact">{step.short}</span>
                            {timestamp && (
                                <span className="step-time-compact">{formatTime(timestamp)}</span>
                            )}
                            {deviation && statusClass === 'completed' && (
                                <DeviationBadge deviation={deviation} compact />
                            )}
                        </div>
                    );
                })}
            </div>
            {showDetails && (
                <div className="timeline-details">
                    <h5 className="timeline-details-title">Full Timeline</h5>
                    <div className="timeline-details-list">
                        {STATUS_STEPS.map((step) => {
                            const statusClass = getStatusClass(step.code);
                            const timestamp = trip.timeline?.[step.field];
                            const expectedTimestamp = getExpectedTime(step);
                            const deviation = getStepDeviation(step);

                            return (
                                <div key={step.code} className={`timeline-detail-row ${statusClass}`}>
                                    <div className="detail-marker">
                                        {statusClass === 'completed' ? (
                                            <CheckCircle size={16} />
                                        ) : statusClass === 'current' ? (
                                            <div className="current-indicator"></div>
                                        ) : (
                                            <Circle size={16} />
                                        )}
                                    </div>
                                    <div className="detail-content">
                                        <div className="detail-header">
                                            <span className="detail-label">{step.label}</span>
                                            <span className="detail-code">Status {step.code}</span>
                                            {deviation && statusClass === 'completed' && (
                                                <DeviationBadge deviation={deviation} />
                                            )}
                                        </div>
                                        <span className="detail-description">{step.description}</span>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
                                            <span className="detail-timestamp">
                                                <strong>Actual:</strong> {timestamp ? formatDateTime(timestamp) : 'Not yet reached'}
                                            </span>
                                            {expectedTimestamp && (
                                                <span className="detail-timestamp" style={{ opacity: 0.7 }}>
                                                    <strong>Expected:</strong> {formatDateTime(expectedTimestamp)}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TripTimeline;
