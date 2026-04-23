import { Calendar, TrendingUp, Target, RefreshCw } from 'lucide-react'

const MonthlyPlanOverview = ({ data, userType, userId, lastUpdated, onRefresh, isRefreshing }) => {
    if (!data) {
        return (
            <div className="monthly-plan-section">
                <h3>Monthly Plan Overview</h3>
                <div className="no-data">
                    <p>Loading monthly plan data...</p>
                </div>
            </div>
        );
    }

    const progressPercentage = data.planned > 0 ? Math.round((data.actual / data.planned) * 100) : 0;
    const remaining = Math.max(0, data.planned - data.actual);
    const daysInMonth = new Date(data.year, data.month, 0).getDate();
    const currentDay = new Date().getDate();
    const daysRemaining = daysInMonth - currentDay;

    const dailyRateNeeded = daysRemaining > 0 ? Math.round(remaining / daysRemaining) : 0;
    const currentDailyRate = currentDay > 0 ? Math.round(data.actual / currentDay) : 0;

    const getProgressColor = (percentage) => {
        if (percentage >= 90) return '#10b981'; 
        if (percentage >= 70) return '#f59e0b'; 
        return '#ef4444'; 
    };

    const getStatusText = (percentage) => {
        if (percentage >= 90) return 'On Track';
        if (percentage >= 70) return 'Behind Schedule';
        return 'Critical';
    };

    return (
        <div className="monthly-plan-section compact">
            <div className="monthly-plan-header">
                <div className="header-left">
                    <Calendar size={20} />
                    <h3>Monthly Plan Overview</h3>
                    <span className="user-badge-inline">{userType === 'producer' ? 'Producer' : 'Consumer'}: {userId}</span>
                </div>
                <div className="header-right">
                    <div className="month-badge">
                        {new Date(data.year, data.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                    <span className="last-updated">
                        {lastUpdated && `Updated: ${lastUpdated.toLocaleTimeString()}`}
                    </span>
                    <button onClick={onRefresh} className="btn-icon-refresh" title="Refresh">
                        <RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            <div className="monthly-plan-content">
                <div className="plan-progress-card">
                    <div className="progress-header">
                        <div className="progress-label">
                            <span>{userType === 'producer' ? 'Production' : 'Consumption'} Progress</span>
                            <span className="progress-status" style={{ color: getProgressColor(progressPercentage) }}>
                                {getStatusText(progressPercentage)}
                            </span>
                        </div>
                        <div className="progress-percentage" style={{ color: getProgressColor(progressPercentage) }}>
                            {progressPercentage}%
                        </div>
                    </div>

                    <div className="progress-bar-container">
                        <div className="progress-bar-track">
                            <div className="progress-bar-fill" style={{ width: `${Math.min(progressPercentage, 100)}%`, backgroundColor: getProgressColor(progressPercentage) }} />
                        </div>
                    </div>

                    <div className="progress-values">
                        <div className="value-item">
                            <span className="value-label">Actual</span>
                            <span className="value-number">{data.actual.toLocaleString()} MT</span>
                        </div>
                        <div className="value-divider">/</div>
                        <div className="value-item">
                            <span className="value-label">Planned</span>
                            <span className="value-number">{data.planned.toLocaleString()} MT</span>
                        </div>
                    </div>
                </div>
                <div className="monthly-stats-grid">
                    <div className="monthly-stat-card">
                        <div className="stat-icon-wrapper" style={{ backgroundColor: '#3b82f615' }}>
                            <Target size={20} style={{ color: '#3b82f6' }} />
                        </div>
                        <div className="stat-details">
                            <span className="stat-label">Remaining</span>
                            <span className="stat-value">{remaining.toLocaleString()} MT</span>
                        </div>
                    </div>

                    <div className="monthly-stat-card">
                        <div className="stat-icon-wrapper" style={{ backgroundColor: '#10b98115' }}>
                            <TrendingUp size={20} style={{ color: '#10b981' }} />
                        </div>
                        <div className="stat-details">
                            <span className="stat-label">Current Daily Avg</span>
                            <span className="stat-value">{currentDailyRate.toLocaleString()} MT/day</span>
                        </div>
                    </div>

                    <div className="monthly-stat-card">
                        <div className="stat-icon-wrapper" style={{ backgroundColor: '#f59e0b15' }}>
                            <Calendar size={20} style={{ color: '#f59e0b' }} />
                        </div>
                        <div className="stat-details">
                            <span className="stat-label">Days Remaining</span>
                            <span className="stat-value">{daysRemaining} days</span>
                        </div>
                    </div>

                    {remaining > 0 && (
                        <div className="monthly-stat-card highlight">
                            <div className="stat-icon-wrapper" style={{ backgroundColor: '#8b5cf615' }}>
                                <Target size={20} style={{ color: '#8b5cf6' }} />
                            </div>
                            <div className="stat-details">
                                <span className="stat-label">Daily Target Needed</span>
                                <span className="stat-value">{dailyRateNeeded.toLocaleString()} MT/day</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MonthlyPlanOverview;
