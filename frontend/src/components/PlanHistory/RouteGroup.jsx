import { TrendingUp, AlertTriangle, ChevronDown, ChevronRight, ArrowRight, CheckCircle, Clock, TrendingDown } from 'lucide-react';
import TripTimeline from './TripTimeline'

const RouteDeviationBadge = ({ avgDeviation, deviationStatus }) => {
    if (avgDeviation === null || avgDeviation === undefined) return null;

    const sign = avgDeviation > 0 ? '+' : '';

    const statusConfig = {
        on_track: { color: 'hsl(142 71% 40%)', bg: 'hsl(142 71% 40% / 0.15)', icon: TrendingUp },
        early: { color: 'hsl(142 71% 35%)', bg: 'hsl(142 71% 35% / 0.15)', icon: TrendingUp },
        warning: { color: 'hsl(38 92% 50%)', bg: 'hsl(38 92% 50% / 0.15)', icon: AlertTriangle },
        alert: { color: 'hsl(25 95% 53%)', bg: 'hsl(25 95% 53% / 0.15)', icon: AlertTriangle },
        critical: { color: 'hsl(0 84% 60%)', bg: 'hsl(0 84% 60% / 0.15)', icon: AlertTriangle }
    };

    const config = statusConfig[deviationStatus] || statusConfig.on_track;
    const Icon = config.icon;

    return (
        <span title={`Average Deviation: ${sign}${Math.round(avgDeviation)} minutes`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', background: config.bg, color: config.color, fontSize: '0.7rem', fontWeight: 700 }}>
            {avgDeviation <= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {sign}{Math.round(avgDeviation)}m avg
        </span>
    );
};

const RouteGroup = ({ route, isExpanded, onToggle }) => {
    const completionRate = route.planned_trips > 0
        ? Math.round((route.completed_trips / route.planned_trips) * 100)
        : 0;

    const getCompletionClass = (rate) => {
        if (rate >= 90) return 'high';
        if (rate >= 50) return 'medium';
        return 'low';
    };

    const calculateRouteDeviation = () => {
        const completedTrips = route.trips.filter(t => t.status === 13 && t.total_deviation_minutes !== null && t.total_deviation_minutes !== undefined);
        if (completedTrips.length === 0) return { avgDeviation: null, status: 'on_track', onTimeCount: 0, delayedCount: 0, earlyCount: 0 };

        const totalDeviation = completedTrips.reduce((sum, t) => sum + (t.total_deviation_minutes || 0), 0);
        const avgDeviation = totalDeviation / completedTrips.length;

        let onTimeCount = 0, delayedCount = 0, earlyCount = 0;
        completedTrips.forEach(t => {
            const dev = t.total_deviation_minutes || 0;
            if (dev < 0) earlyCount++;
            else if (dev <= 10) onTimeCount++;
            else delayedCount++;
        });

        let status = 'on_track';
        if (avgDeviation < 0) status = 'early';
        else if (avgDeviation > 30) status = 'critical';
        else if (avgDeviation > 20) status = 'alert';
        else if (avgDeviation > 10) status = 'warning';

        return { avgDeviation, status, onTimeCount, delayedCount, earlyCount };
    };

    const routeDeviation = calculateRouteDeviation();

    return (
        <div className={`route-group ${isExpanded ? 'expanded' : ''}`}>
            <div className="route-group-header" onClick={onToggle}>
                <div className="route-toggle">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>

                <div className="route-info">
                    <span className="route-producer">{route.producer_id}</span>
                    <ArrowRight size={14} className="route-arrow" />
                    <span className="route-consumer">{route.consumer_id}</span>
                </div>

                <div className="route-stats">
                    <div className="route-stat">
                        <Clock size={12} />
                        <span>{route.trips.length} trips</span>
                    </div>
                    <div className="route-stat">
                        <CheckCircle size={12} />
                        <span>{route.completed_trips} done</span>
                    </div>
                    {routeDeviation.avgDeviation !== null && (
                        <RouteDeviationBadge avgDeviation={routeDeviation.avgDeviation} deviationStatus={routeDeviation.status} />
                    )}
                    <div className={`route-completion-badge ${getCompletionClass(completionRate)}`}>
                        {completionRate}%
                    </div>
                </div>
            </div>
            {isExpanded && (
                <div className="route-trips-container">
                    {route.trips.length === 0 ? (
                        <div className="no-trips-message">
                            No trips generated yet for this route
                        </div>
                    ) : (
                        <div className="trips-list">
                            {route.trips.map((trip, idx) => (
                                <TripTimeline key={trip.trip_id || idx} trip={trip} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default RouteGroup;
