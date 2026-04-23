import { Package, Target, Truck, Clock } from 'lucide-react';

const MyPerformanceCard = ({ data, userType }) => {
    if (!data) {
        return (
            <div className="my-performance-section">
                <h3>My Daily Performance</h3>
                <div className="performance-grid">
                    <div className="stat-card">Loading...</div>
                </div>
            </div>
        );
    }

    const StatCard = ({ icon: Icon, label, value, color }) => (
        <div className="stat-card" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="stat-icon" style={{ backgroundColor: `${color}15`, color }}>
                <Icon size={20} />
            </div>
            <div className="stat-content">
                <span className="stat-label">{label}</span>
                <span className="stat-value">{value}</span>
            </div>
        </div>
    );

    return (
        <div className="my-performance-section">
            <h3>My Daily Performance</h3>
            <div className="performance-grid">
                <StatCard icon={Package} label={userType === 'producer' ? 'Produced' : 'Received'} value={`${data.total_tonnage} MT`} color="#3b82f6" />
                <StatCard icon={Target} label="Fulfillment" value={`${data.fulfillment_rate}%`} color="#10b981" />
                <StatCard icon={Truck} label="Trips Completed" value={data.trips_completed} color="#f59e0b" />
                <StatCard icon={Clock} label="Avg Cycle Time" value={`${data.avg_cycle_time_minutes} min`} color="#8b5cf6" />
            </div>
        </div>
    );
};

export default MyPerformanceCard;
