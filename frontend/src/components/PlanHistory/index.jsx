import { useState, useEffect, useCallback } from 'react';
import { api } from '../../utils/api';
import { Calendar, RefreshCw, ChevronDown } from 'lucide-react'
import PlanCard from './PlanCard'

const PlanHistory = () => {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedPlans, setExpandedPlans] = useState(new Set());

    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

    const fetchPlanHistory = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.get(`/api/daily-plans/history-detailed?start_date=${startDate}&end_date=${endDate}`);
            setPlans(data.plans || []);
        } catch (err) {
            console.error('Failed to fetch plan history:', err);
            setError(err.message || 'Failed to load plan history. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [startDate, endDate]);

    useEffect(() => {
        fetchPlanHistory();
    }, [fetchPlanHistory]);

    const handleTogglePlan = (planId) => {
        setExpandedPlans(prev => {
            const next = new Set(prev);
            if (next.has(planId)) {
                next.delete(planId);
            } else {
                next.add(planId);
            }
            return next;
        });
    };

    const handleExpandAll = () => {
        setExpandedPlans(new Set(plans.map(p => p.plan_id)));
    };

    const handleCollapseAll = () => {
        setExpandedPlans(new Set());
    };

    return (
        <div className="plan-history-container animate-in slide-in-from-bottom-4">
            <div className="plan-history-header premium-card glass-morphism">
                <div className="plan-history-header-left">
                    <h3 className="plan-history-title">
                        <Calendar size={20} />
                        Operational Planning Archive
                    </h3>
                    <span className="plan-count-badge">{plans.length} Plans</span>
                </div>

                <div className="plan-history-header-right">
                    <div className="date-filters">
                        <div className="date-input-group">
                            <label>From</label>
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="date-input" />
                        </div>
                        <div className="date-input-group">
                            <label>To</label>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="date-input" />
                        </div>
                    </div>

                    <div className="header-actions">
                        <button className="btn-icon" onClick={fetchPlanHistory} title="Refresh">
                            <RefreshCw size={16} className={loading ? 'spin' : ''} />
                        </button>
                        <button className="btn-secondary-sm" onClick={expandedPlans.size === plans.length ? handleCollapseAll : handleExpandAll}>
                            <ChevronDown size={14} />
                            {expandedPlans.size === plans.length ? 'Collapse All' : 'Expand All'}
                        </button>
                    </div>
                </div>
            </div>
            <div className="plan-history-content">
                {loading && (
                    <div className="plan-history-loading">
                        <div className="loading-spinner"></div>
                        <span>Loading plan history...</span>
                    </div>
                )}

                {error && (
                    <div className="plan-history-error">
                        <span>{error}</span>
                        <button onClick={fetchPlanHistory} className="btn-primary-sm">
                            Retry
                        </button>
                    </div>
                )}

                {!loading && !error && plans.length === 0 && (
                    <div className="plan-history-empty">
                        <Calendar size={48} strokeWidth={1} />
                        <h4>No Plans Found</h4>
                        <p>No distribution plans have been created in the selected date range.</p>
                    </div>
                )}

                {!loading && !error && plans.length > 0 && (
                    <div className="plan-cards-list">
                        {plans.map(plan => (
                            <PlanCard key={plan.plan_id} plan={plan} isExpanded={expandedPlans.has(plan.plan_id)} onToggle={() => handleTogglePlan(plan.plan_id)} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlanHistory;
