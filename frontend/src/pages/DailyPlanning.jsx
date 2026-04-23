import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { api } from '../utils/api';
import { useTableSort } from '../hooks/useTableSort';
import { Save, History, TrendingUp, ChevronDown, CheckCircle2, AlertCircle, Zap, Clock, Target } from 'lucide-react'

const DailyPlanning = () => {
    const { user } = useAuth();
    const { showNotification } = useNotification();
    const [loading, setLoading] = useState(false);
    const [nodeStatus, setNodeStatus] = useState('Operating');
    const [planStatus, setPlanStatus] = useState('Missing');
    const [history, setHistory] = useState([]);
    const [capacity, setCapacity] = useState('');

    const { items: sortedHistory, requestSort, sortConfig } = useTableSort(history, { key: 'date', direction: 'desc' });

    const isProducer = user?.role === 'producer';
    const label = isProducer ? 'Production Capacity' : 'Consumption Capacity';
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    useEffect(() => {
        fetchHistory();
    }, [user]);

    const fetchHistory = async () => {
        if (!user?.user_id) return;
        try {
            const data = await api.get(`/api/daily-plans/history/${user.user_id}`);
            setHistory(data);

            const loc = await api.get(`/api/locations/name/${user.user_id}`);
            setNodeStatus(loc.status || 'Operating');

            const todayIso = new Date().toISOString().split('T')[0];
            const todayPlan = data.find(p => p.date === todayIso);
            if (todayPlan) {
                setCapacity(todayPlan.capacity.toString());
                setPlanStatus(todayPlan.status || 'Primary');
            } else {
                setPlanStatus('Missing');
            }
        } catch (err) {
            console.error("Fetch Data Error:", err);
            showNotification('error', err.message || 'Failed to load planning data');
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();

        const capacityValue = parseFloat(capacity);
        if (!capacityValue || capacityValue <= 0) {
            showNotification('error', 'Please enter a valid capacity greater than 0');
            return;
        }

        setLoading(true);

        try {
            await api.post('/api/daily-plans', {
                user_id: user.user_id,
                role: user.role,
                capacity: parseFloat(capacity)
            });

            showNotification('success', 'Daily plan committed successfully!');
            fetchHistory();
        } catch (err) {
            showNotification('error', `Commit failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const getStatusConfig = (status) => {
        switch (status) {
            case 'Operating':
                return { color: 'var(--dp-success)', bg: 'var(--dp-success-bg)', icon: '●' };
            case 'Maintenance':
                return { color: 'var(--dp-warning)', bg: 'var(--dp-warning-bg)', icon: '◐' };
            default:
                return { color: 'var(--dp-danger)', bg: 'var(--dp-danger-bg)', icon: '○' };
        }
    };

    const statusConfig = getStatusConfig(nodeStatus);

    return (
        <div className="dp-container">
            <header className="dp-header">
                <div className="dp-header-left">
                    <div className="dp-title-block">
                        <h1 className="dp-title">Daily Planning</h1>
                        <span className="dp-subtitle">Commit your {isProducer ? 'production' : 'consumption'} targets</span>
                    </div>
                </div>
                <div className="dp-header-right">
                    <div className="dp-stat-chip">
                        <Clock size={14} />
                        <span className="dp-stat-label">Date</span>
                        <span className="dp-stat-value">{today}</span>
                    </div>
                    <div className="dp-stat-chip" style={{ '--chip-accent': statusConfig.color, '--chip-bg': statusConfig.bg }}>
                        <span className="dp-status-dot" style={{ color: statusConfig.color }}>{statusConfig.icon}</span>
                        <span className="dp-stat-label">Status</span>
                        <span className="dp-stat-value" style={{ color: statusConfig.color }}>{nodeStatus}</span>
                    </div>
                </div>
            </header>
            <div className="dp-grid">
                <div className="dp-card dp-entry-card">
                    <div className="dp-card-header">
                        <div className="dp-card-title">
                            <Target size={18} />
                            <span>Entry Terminal</span>
                        </div>
                        <div className={`dp-plan-badge ${planStatus.toLowerCase()}`}>
                            {planStatus === 'Confirmed' && <CheckCircle2 size={12} />}
                            {planStatus}
                        </div>
                    </div>

                    <div className="dp-card-body">
                        {nodeStatus !== 'Operating' && (
                            <div className="dp-alert">
                                <AlertCircle size={16} />
                                <span>Node in <strong>{nodeStatus}</strong> mode — plans may be ignored by optimizer</span>
                            </div>
                        )}

                        <form onSubmit={handleSave} className="dp-form">
                            <div className="dp-input-group">
                                <label className="dp-label">
                                    Current {label}
                                    <span className="dp-label-unit">(Metric Tons)</span>
                                </label>
                                <div className="dp-input-wrapper">
                                    <div className="dp-input-icon">
                                        <TrendingUp size={20} />
                                    </div>
                                    <input type="number" required step="any" placeholder="0" className="dp-input" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
                                    <span className="dp-input-suffix">MT</span>
                                </div>
                            </div>

                            <button type="submit" className="dp-submit-btn" disabled={loading}>
                                {loading ? (
                                    <>
                                        <Zap size={18} className="dp-spin" />
                                        <span>Synchronizing...</span>
                                    </>
                                ) : (
                                    <>
                                        <Save size={18} />
                                        <span>Commit Daily Plan</span>
                                    </>
                                )}
                            </button>
                        </form>
                    </div>
                </div>
                <div className="dp-card dp-history-card">
                    <div className="dp-card-header">
                        <div className="dp-card-title">
                            <History size={18} />
                            <span>Historical Ledger</span>
                        </div>
                        <span className="dp-record-count">{sortedHistory.length} records</span>
                    </div>

                    <div className="dp-table-container">
                        <table className="dp-table">
                            <thead>
                                <tr>
                                    <th onClick={() => requestSort('date')} className={sortConfig.key === 'date' ? 'active' : ''}>
                                        <span>Planning Date</span>
                                        <ChevronDown size={14} className={`dp-sort-icon ${sortConfig.key === 'date' ? sortConfig.direction : ''}`} />
                                    </th>
                                    <th onClick={() => requestSort('capacity')} className={`text-right ${sortConfig.key === 'capacity' ? 'active' : ''}`}>
                                        <span>Target</span>
                                        <ChevronDown size={14} className={`dp-sort-icon ${sortConfig.key === 'capacity' ? sortConfig.direction : ''}`} />
                                    </th>
                                    <th onClick={() => requestSort('last_updated')} className={`text-right ${sortConfig.key === 'last_updated' ? 'active' : ''}`}>
                                        <span>Commit Time</span>
                                        <ChevronDown size={14} className={`dp-sort-icon ${sortConfig.key === 'last_updated' ? sortConfig.direction : ''}`} />
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedHistory.length > 0 ? sortedHistory.map((item, index) => (
                                    <tr key={item.id} style={{ '--row-delay': `${index * 30}ms` }}>
                                        <td>
                                            <span className="dp-date">
                                                {new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <span className="dp-capacity">{item.capacity.toLocaleString()}</span>
                                            <span className="dp-capacity-unit">MT</span>
                                        </td>
                                        <td className="text-right">
                                            <span className="dp-time">
                                                {new Date(item.last_updated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr className="dp-empty-row">
                                        <td colSpan="3">
                                            <div className="dp-empty-state">
                                                <History size={32} />
                                                <span>No historical records found</span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <style>{`
                .dp-container {
                    --dp-accent: hsl(var(--accent));
                    --dp-accent-soft: hsl(var(--accent) / 0.1);
                    --dp-success: #10b981;
                    --dp-success-bg: rgba(16, 185, 129, 0.1);
                    --dp-warning: #f59e0b;
                    --dp-warning-bg: rgba(245, 158, 11, 0.1);
                    --dp-danger: #ef4444;
                    --dp-danger-bg: rgba(239, 68, 68, 0.1);

                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    padding: 24px 32px;
                    gap: 24px;
                    overflow: hidden;
                    background: hsl(var(--main-bg));
                }

                /* Header */
                .dp-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-shrink: 0;
                }

                .dp-header-left {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                }

                .dp-title-block {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .dp-title {
                    font-size: 1.75rem;
                    font-weight: 700;
                    color: hsl(var(--text-main));
                    margin: 0;
                    letter-spacing: -0.02em;
                    line-height: 1.2;
                }

                .dp-subtitle {
                    font-size: 0.875rem;
                    color: hsl(var(--text-muted));
                    font-weight: 500;
                }

                .dp-header-right {
                    display: flex;
                    gap: 12px;
                }

                .dp-stat-chip {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 16px;
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 12px;
                    font-size: 0.8rem;
                }

                .dp-stat-chip svg {
                    color: hsl(var(--text-muted));
                }

                .dp-stat-label {
                    color: hsl(var(--text-muted));
                    font-weight: 500;
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                    font-size: 0.7rem;
                }

                .dp-stat-value {
                    font-weight: 700;
                    color: hsl(var(--text-main));
                    font-family: 'Space Grotesk', monospace;
                }

                .dp-status-dot {
                    font-size: 10px;
                }

                /* Grid Layout */
                .dp-grid {
                    display: grid;
                    grid-template-columns: 400px 1fr;
                    gap: 24px;
                    flex: 1;
                    min-height: 0;
                }

                /* Cards */
                .dp-card {
                    display: flex;
                    flex-direction: column;
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 16px;
                    overflow: hidden;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                }

                .dp-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    background: hsl(var(--main-bg) / 0.5);
                    border-bottom: 1px solid hsl(var(--border-color));
                    flex-shrink: 0;
                }

                .dp-card-title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 0.95rem;
                    font-weight: 600;
                    color: hsl(var(--text-main));
                }

                .dp-card-title svg {
                    color: var(--dp-accent);
                }

                .dp-plan-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    padding: 5px 10px;
                    border-radius: 6px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .dp-plan-badge.missing {
                    background: var(--dp-warning-bg);
                    color: var(--dp-warning);
                }

                .dp-plan-badge.primary,
                .dp-plan-badge.confirmed {
                    background: var(--dp-success-bg);
                    color: var(--dp-success);
                }

                .dp-record-count {
                    font-size: 0.75rem;
                    color: hsl(var(--text-muted));
                    font-weight: 500;
                }

                /* Entry Card */
                .dp-entry-card .dp-card-body {
                    padding: 24px 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 24px;
                }

                .dp-alert {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    padding: 12px 14px;
                    background: var(--dp-warning-bg);
                    border: 1px solid rgba(245, 158, 11, 0.2);
                    border-radius: 10px;
                    font-size: 0.8rem;
                    color: hsl(var(--text-main));
                    line-height: 1.5;
                }

                .dp-alert svg {
                    color: var(--dp-warning);
                    flex-shrink: 0;
                    margin-top: 2px;
                }

                .dp-form {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }

                .dp-input-group {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .dp-label {
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: hsl(var(--text-main));
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    display: flex;
                    align-items: baseline;
                    gap: 6px;
                }

                .dp-label-unit {
                    font-weight: 400;
                    color: hsl(var(--text-muted));
                    text-transform: none;
                    font-size: 0.75rem;
                }

                .dp-input-wrapper {
                    position: relative;
                    display: flex;
                    align-items: center;
                }

                .dp-input-icon {
                    position: absolute;
                    left: 16px;
                    color: var(--dp-accent);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                }

                .dp-input {
                    width: 100%;
                    height: 64px;
                    padding: 0 60px 0 52px;
                    font-size: 1.75rem;
                    font-weight: 700;
                    font-family: 'Space Grotesk', monospace;
                    background: hsl(var(--main-bg));
                    border: 2px solid hsl(var(--border-color));
                    border-radius: 12px;
                    color: hsl(var(--text-main));
                    transition: all 0.2s ease;
                }

                .dp-input:focus {
                    outline: none;
                    border-color: var(--dp-accent);
                    box-shadow: 0 0 0 3px hsl(var(--accent) / 0.1);
                }

                .dp-input::placeholder {
                    color: hsl(var(--text-muted) / 0.5);
                }

                .dp-input-suffix {
                    position: absolute;
                    right: 16px;
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .dp-submit-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    height: 54px;
                    padding: 0 24px;
                    background: var(--dp-accent);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    font-size: 0.95rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .dp-submit-btn:hover:not(:disabled) {
                    filter: brightness(1.1);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px hsl(var(--accent) / 0.3);
                }

                .dp-submit-btn:active:not(:disabled) {
                    transform: translateY(0);
                }

                .dp-submit-btn:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                }

                @keyframes dp-spin {
                    to { transform: rotate(360deg); }
                }

                .dp-spin {
                    animation: dp-spin 1s linear infinite;
                }

                /* History Card */
                .dp-history-card {
                    min-height: 0;
                }

                .dp-table-container {
                    flex: 1;
                    overflow-y: auto;
                    overflow-x: hidden;
                }

                .dp-table {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                }

                .dp-table thead {
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }

                .dp-table th {
                    background: hsl(var(--card-bg));
                    padding: 14px 20px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    text-align: left;
                    border-bottom: 1px solid hsl(var(--border-color));
                    cursor: pointer;
                    user-select: none;
                    transition: all 0.15s ease;
                    white-space: nowrap;
                }

                .dp-table th:hover {
                    color: hsl(var(--text-main));
                }

                .dp-table th.active {
                    color: var(--dp-accent);
                }

                .dp-table th span {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }

                .dp-sort-icon {
                    opacity: 0.3;
                    transition: all 0.2s ease;
                }

                .dp-table th:hover .dp-sort-icon {
                    opacity: 0.6;
                }

                .dp-table th.active .dp-sort-icon {
                    opacity: 1;
                }

                .dp-sort-icon.asc {
                    transform: rotate(180deg);
                }

                .dp-table th.text-right,
                .dp-table td.text-right {
                    text-align: right;
                }

                .dp-table th.text-right span {
                    justify-content: flex-end;
                }

                .dp-table tbody tr {
                    transition: background 0.15s ease;
                    animation: dp-row-in 0.3s ease forwards;
                    animation-delay: var(--row-delay, 0ms);
                    opacity: 0;
                }

                @keyframes dp-row-in {
                    from {
                        opacity: 0;
                        transform: translateX(-8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }

                .dp-table tbody tr:hover {
                    background: hsl(var(--main-bg) / 0.5);
                }

                .dp-table td {
                    padding: 16px 20px;
                    border-bottom: 1px solid hsl(var(--border-color) / 0.5);
                    vertical-align: middle;
                }

                .dp-table tbody tr:last-child td {
                    border-bottom: none;
                }

                .dp-date {
                    font-weight: 600;
                    color: hsl(var(--text-main));
                    font-size: 0.9rem;
                }

                .dp-capacity {
                    font-family: 'Space Grotesk', monospace;
                    font-size: 1.15rem;
                    font-weight: 700;
                    color: hsl(var(--text-main));
                }

                .dp-capacity-unit {
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                    margin-left: 4px;
                    text-transform: uppercase;
                }

                .dp-time {
                    font-size: 0.8rem;
                    font-weight: 500;
                    color: hsl(var(--text-muted));
                    font-family: 'Space Grotesk', monospace;
                }

                .dp-empty-row td {
                    padding: 0 !important;
                    border: none !important;
                }

                .dp-empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    padding: 60px 20px;
                    color: hsl(var(--text-muted));
                }

                .dp-empty-state svg {
                    opacity: 0.3;
                }

                .dp-empty-state span {
                    font-size: 0.85rem;
                    font-weight: 500;
                }

                /* Scrollbar Styling */
                .dp-table-container::-webkit-scrollbar {
                    width: 6px;
                }

                .dp-table-container::-webkit-scrollbar-track {
                    background: transparent;
                }

                .dp-table-container::-webkit-scrollbar-thumb {
                    background: hsl(var(--border-color));
                    border-radius: 3px;
                }

                .dp-table-container::-webkit-scrollbar-thumb:hover {
                    background: hsl(var(--text-muted) / 0.3);
                }

                /* Dark Mode Overrides */
                [data-theme="dark"] .dp-container {
                    --dp-success: #34d399;
                    --dp-success-bg: rgba(52, 211, 153, 0.1);
                    --dp-warning: #fbbf24;
                    --dp-warning-bg: rgba(251, 191, 36, 0.1);
                    --dp-danger: #f87171;
                    --dp-danger-bg: rgba(248, 113, 113, 0.1);
                }

                [data-theme="dark"] .dp-card {
                    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                }

                [data-theme="dark"] .dp-table th {
                    background: hsl(var(--card-bg));
                    box-shadow: 0 1px 0 hsl(var(--border-color));
                }

                [data-theme="dark"] .dp-input {
                    background: hsl(var(--input-bg));
                }

                [data-theme="dark"] .dp-submit-btn {
                    background: hsl(var(--accent));
                    color: #000;
                }

                /* Responsive */
                @media (max-width: 1024px) {
                    .dp-container {
                        padding: 20px;
                    }

                    .dp-grid {
                        grid-template-columns: 1fr;
                        grid-template-rows: auto 1fr;
                    }

                    .dp-history-card {
                        min-height: 400px;
                    }
                }

                @media (max-width: 640px) {
                    .dp-container {
                        padding: 16px;
                        gap: 16px;
                    }

                    .dp-header {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 16px;
                    }

                    .dp-header-right {
                        width: 100%;
                    }

                    .dp-stat-chip {
                        flex: 1;
                        justify-content: center;
                    }

                    .dp-title {
                        font-size: 1.5rem;
                    }

                    .dp-input {
                        height: 56px;
                        font-size: 1.5rem;
                    }

                    .dp-table td,
                    .dp-table th {
                        padding: 12px 16px;
                    }
                }
            `}</style>
        </div>
    );
};

export default DailyPlanning;
