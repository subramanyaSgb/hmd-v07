import { Factory, Users, Truck, CheckCircle, TrendingUp, TrendingDown, Clock, Anchor, BarChart3, Plus, AlertTriangle, Timer } from 'lucide-react';

const SummaryStats = ({ summary }) => {
    
    const getDeviationColor = (deviation) => {
        if (deviation === undefined || deviation === null) return 'neutral';
        if (deviation < 0) return 'success'; 
        if (deviation <= 10) return 'success'; 
        if (deviation <= 20) return 'warning';
        return 'danger';
    };

    const getOnTimeColor = (rate) => {
        if (rate >= 90) return 'success';
        if (rate >= 70) return 'warning';
        return 'danger';
    };

    const stats = [
        {
            icon: Factory,
            label: 'Production',
            value: `${summary.total_production_mt.toLocaleString()} MT`,
            color: 'producer'
        },
        {
            icon: Users,
            label: 'Consumption',
            value: `${summary.total_consumption_mt.toLocaleString()} MT`,
            color: 'consumer'
        },
        {
            icon: Truck,
            label: 'Planned Trips',
            value: summary.planned_trips ?? summary.total_trips,
            color: 'neutral'
        },
        {
            icon: Plus,
            label: 'Manual Trips',
            value: summary.manual_trips ?? 0,
            color: 'accent'
        },
        {
            icon: CheckCircle,
            label: 'Completed',
            value: summary.completed_trips,
            color: 'success'
        },
        {
            icon: TrendingUp,
            label: 'Fulfillment',
            value: `${summary.fulfillment_rate}%`,
            color: summary.fulfillment_rate >= 90 ? 'success' : summary.fulfillment_rate >= 70 ? 'warning' : 'danger'
        },
        {
            icon: Clock,
            label: 'Avg Cycle',
            value: `${summary.avg_cycle_time_minutes} min`,
            subValue: summary.avg_expected_cycle_time_minutes ? `/ ${summary.avg_expected_cycle_time_minutes} exp` : null,
            color: 'neutral'
        },
        {
            icon: summary.avg_deviation_minutes > 0 ? TrendingDown : TrendingUp,
            label: 'Avg Deviation',
            value: summary.avg_deviation_minutes !== undefined ? `${summary.avg_deviation_minutes > 0 ? '+' : ''}${summary.avg_deviation_minutes} min` : 'N/A',
            color: getDeviationColor(summary.avg_deviation_minutes)
        },
        {
            icon: Timer,
            label: 'On-Time Rate',
            value: summary.on_time_rate !== undefined ? `${summary.on_time_rate}%` : 'N/A',
            subValue: summary.on_time_count !== undefined ? `${summary.on_time_count} on-time` : null,
            color: getOnTimeColor(summary.on_time_rate ?? 0)
        },
        {
            icon: AlertTriangle,
            label: 'Delayed',
            value: summary.delayed_count ?? 0,
            subValue: summary.early_count ? `${summary.early_count} early` : null,
            color: summary.delayed_count > 0 ? 'warning' : 'success'
        },
        {
            icon: Anchor,
            label: 'Torpedoes Used',
            value: summary.torpedoes_used,
            color: 'accent'
        },
        {
            icon: BarChart3,
            label: 'Fleet Util.',
            value: `${summary.fleet_utilization}%`,
            color: summary.fleet_utilization >= 80 ? 'success' : summary.fleet_utilization >= 60 ? 'warning' : 'neutral'
        }
    ];

    return (
        <div className="summary-stats-section">
            <h4 className="section-title">Summary Metrics</h4>
            <div className="summary-stats-grid">
                {stats.map((stat, index) => (
                    <div key={index} className={`summary-stat-card ${stat.color}`}>
                        <div className="stat-icon">
                            <stat.icon size={18} />
                        </div>
                        <div className="stat-content">
                            <span className="stat-value">
                                {stat.value}
                                {stat.subValue && (
                                    <span style={{ fontSize: '0.7em', opacity: 0.7, marginLeft: '4px', fontWeight: 500 }}>
                                        {stat.subValue}
                                    </span>
                                )}
                            </span>
                            <span className="stat-label">{stat.label}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SummaryStats;
