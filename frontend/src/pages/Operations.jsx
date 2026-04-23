import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { api } from '../utils/api';
import { Power, Settings, CheckCircle2, Clock, AlertTriangle, History, ChevronDown, ChevronUp, Timer, Calendar, Zap, TrendingUp, Plus, Trash2, Edit3, Activity, X, Pause, Play, Wrench, Factory, Building2 } from 'lucide-react'

const StatusBanner = ({ operationData, currentStatus }) => {
    const [time, setTime] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

    const isAdminScheduled = operationData?.status_source === 'admin_scheduled';
    const isShutdown = currentStatus === 'Shutdown';

    useEffect(() => {
        if (!operationData || currentStatus === 'Operating') return;

        const calculateTime = () => {
            if (isAdminScheduled && operationData?.scheduled_maintenance) {
                const endDate = new Date(operationData.scheduled_maintenance.end_date + 'T23:59:59');
                const now = new Date();
                const diff = endDate - now;

                if (diff <= 0) {
                    setTime({ days: 0, hours: 0, minutes: 0, seconds: 0 });
                    return;
                }

                setTime({
                    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
                    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
                    seconds: Math.floor((diff % (1000 * 60)) / 1000)
                });
            } else if (operationData?.self_set_info?.status_since) {
                const startDate = new Date(operationData.self_set_info.status_since);
                const now = new Date();
                const diff = now - startDate;

                setTime({
                    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
                    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
                    seconds: Math.floor((diff % (1000 * 60)) / 1000)
                });
            }
        };

        calculateTime();
        const interval = setInterval(calculateTime, 1000);
        return () => clearInterval(interval);
    }, [operationData, currentStatus, isAdminScheduled]);

    if (!operationData || currentStatus === 'Operating') return null;

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const config = {
        admin_scheduled: { label: 'Scheduled Maintenance', color: '#f59e0b', icon: <Settings size={16} /> },
        self_maintenance: { label: 'Self-Initiated Maintenance', color: '#f59e0b', icon: <AlertTriangle size={16} /> },
        self_shutdown: { label: 'Node Shutdown', color: '#ef4444', icon: <Power size={16} /> }
    };

    const style = isAdminScheduled ? config.admin_scheduled : isShutdown ? config.self_shutdown : config.self_maintenance;

    return (
        <div style={{
            background: 'hsl(var(--card-bg))',
            borderRadius: '16px',
            padding: '20px 28px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '32px',
            flexWrap: 'wrap'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${style.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: style.color }}>
                    {style.icon}
                </div>
                <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: style.color, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        {style.label}
                    </div>
                    <div style={{
                        fontSize: '0.85rem',
                        color: 'hsl(var(--text-muted))',
                        marginTop: '2px'
                    }}>
                        {operationData.scheduled_maintenance?.reason || operationData.self_set_info?.reason || 'Planned'}
                    </div>
                </div>
            </div>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                padding: '12px 24px',
                background: 'hsl(var(--main-bg))',
                borderRadius: '12px'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'hsl(var(--text-muted))'
                }}>
                    <Timer size={16} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                        {isAdminScheduled ? 'Time Left' : 'Duration'}
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {[
                        { value: time.days, label: 'DAYS' },
                        { value: time.hours, label: 'HRS' },
                        { value: time.minutes, label: 'MIN' },
                        { value: time.seconds, label: 'SEC' }
                    ].map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{
                                    fontSize: '1.5rem',
                                    fontWeight: 700,
                                    color: 'hsl(var(--text-primary))',
                                    fontFamily: 'system-ui, -apple-system, sans-serif',
                                    lineHeight: 1
                                }}>
                                    {String(item.value).padStart(2, '0')}
                                </div>
                                <div style={{
                                    fontSize: '0.6rem',
                                    fontWeight: 600,
                                    color: 'hsl(var(--text-muted))',
                                    marginTop: '4px'
                                }}>
                                    {item.label}
                                </div>
                            </div>
                            {i < 3 && (
                                <span style={{
                                    fontSize: '1.25rem',
                                    color: 'hsl(var(--text-muted))',
                                    opacity: 0.3,
                                    marginBottom: '12px'
                                }}>:</span>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            {isAdminScheduled && operationData.scheduled_maintenance?.end_date && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 20px',
                    background: 'hsl(var(--primary) / 0.08)',
                    borderRadius: '10px'
                }}>
                    <Calendar size={18} style={{ color: 'hsl(var(--primary))' }} />
                    <div>
                        <div style={{
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            color: 'hsl(var(--text-muted))',
                            textTransform: 'uppercase'
                        }}>
                            Return Date
                        </div>
                        <div style={{
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            color: 'hsl(var(--primary))'
                        }}>
                            {formatDate(operationData.scheduled_maintenance.end_date)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const StatusHistoryCard = ({ operationData }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!operationData) return null;

    const history = operationData.status_history || [];
    const summary = operationData.summary || {};
    const displayHistory = isExpanded ? history : history.slice(0, 5);

    const getStatusStyles = (status) => {
        switch (status) {
            case 'Operating': return { color: '#22c55e', bg: '#22c55e18' };
            case 'Maintenance': return { color: '#f59e0b', bg: '#f59e0b18' };
            case 'Shutdown': return { color: '#ef4444', bg: '#ef444418' };
            default: return { color: 'hsl(var(--text-muted))', bg: 'hsl(var(--main-bg))' };
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'Operating': return <CheckCircle2 size={14} />;
            case 'Maintenance': return <Settings size={14} />;
            case 'Shutdown': return <Power size={14} />;
            default: return <Clock size={14} />;
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    return (
        <div className="ops-card" style={{ height: '100%' }}>
            <div className="ops-card-header">
                <div className="ops-icon-box" style={{ background: 'hsl(var(--accent) / 0.1)', color: 'hsl(var(--accent))' }}>
                    <History size={20} />
                </div>
                <div>
                    <h3 className="ops-card-title">Operation History</h3>
                    <span className="ops-card-subtitle">Last 90 days performance</span>
                </div>
            </div>

            <div style={{ padding: '0 28px 28px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                    {[
                        { value: summary.total_maintenance_days_90d || 0, label: 'Maintenance Days', color: '#f59e0b' },
                        { value: summary.total_shutdown_hours_90d || 0, label: 'Shutdown Hours', color: '#ef4444' },
                        { value: summary.last_maintenance_days_ago ?? '-', label: 'Days Since Last', color: 'hsl(var(--primary))' }
                    ].map((stat, i) => (
                        <div key={i} style={{
                            padding: '20px',
                            background: 'hsl(var(--main-bg))',
                            borderRadius: '12px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '2rem', fontWeight: 700, color: stat.color, lineHeight: 1 }}>
                                {stat.value}
                            </div>
                            <div style={{
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                color: 'hsl(var(--text-muted))',
                                marginTop: '8px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.02em'
                            }}>
                                {stat.label}
                            </div>
                        </div>
                    ))}
                </div>
                <div style={{ flex: 1 }}>
                    {history.length === 0 ? (
                        <div style={{
                            padding: '48px 24px',
                            textAlign: 'center',
                            background: 'hsl(var(--main-bg))',
                            borderRadius: '12px',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <div style={{
                                width: '56px',
                                height: '56px',
                                borderRadius: '14px',
                                background: 'hsl(var(--card-bg))',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '16px'
                            }}>
                                <TrendingUp size={24} style={{ color: 'hsl(var(--text-muted))', opacity: 0.5 }} />
                            </div>
                            <p style={{
                                margin: 0,
                                color: 'hsl(var(--text-primary))',
                                fontSize: '0.95rem',
                                fontWeight: 500
                            }}>
                                No status changes recorded yet
                            </p>
                            <p style={{
                                margin: '8px 0 0',
                                color: 'hsl(var(--text-muted))',
                                fontSize: '0.85rem'
                            }}>
                                History will appear here when status changes
                            </p>
                        </div>
                    ) : (
                        <div style={{
                            background: 'hsl(var(--main-bg))',
                            borderRadius: '12px',
                            overflow: 'hidden'
                        }}>
                            {displayHistory.map((record, index) => {
                                const statusStyle = getStatusStyles(record.status);
                                return (
                                    <div
                                        key={index}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '16px 20px',
                                            borderBottom: index < displayHistory.length - 1 ? '1px solid hsl(var(--border-color))' : 'none'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: statusStyle.bg, color: statusStyle.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {getStatusIcon(record.status)}
                                            </div>
                                            <div>
                                                <div style={{
                                                    fontSize: '0.9rem',
                                                    fontWeight: 600,
                                                    color: 'hsl(var(--text-primary))'
                                                }}>
                                                    {record.status}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.8rem',
                                                    color: 'hsl(var(--text-muted))'
                                                }}>
                                                    {formatDate(record.start)}
                                                    {record.end && record.end !== record.start && ` - ${formatDate(record.end)}`}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                color: 'hsl(var(--primary))'
                                            }}>
                                                {record.duration || 'Ongoing'}
                                            </div>
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: 'hsl(var(--text-muted))'
                                            }}>
                                                {record.changed_by || '-'}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {history.length > 5 && (
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        style={{
                            width: '100%',
                            marginTop: '16px',
                            padding: '14px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            color: 'hsl(var(--primary))',
                            fontSize: '0.85rem',
                            fontWeight: 600
                        }}
                    >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        {isExpanded ? 'Show Less' : `Show ${history.length - 5} More`}
                    </button>
                )}
            </div>
        </div>
    );
};

const ProducerOperations = ({ nodeId: nodeIdProp }) => {
    const { user } = useAuth();
    const { showNotification } = useNotification();
    const [currentStatus, setCurrentStatus] = useState('Operating');
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [operationData, setOperationData] = useState(null);

    const nodeId = nodeIdProp || user?.user_id;
    const isAdminControlling = (user?.role === 'admin' || user?.role === 'trs') && nodeIdProp;

    const fetchOperationStatus = useCallback(async () => {
        if (!nodeId) return;
        try {
            const data = await api.get(`/api/locations/operation-status/${nodeId}`);
            setOperationData(data);
            setCurrentStatus(data.current_status || 'Operating');
        } catch (err) {
            console.error("Failed to fetch operation status:", err);
            try {
                const locData = await api.get(`/api/locations/name/${nodeId}`);
                setCurrentStatus(locData.status || 'Operating');
            } catch (e) {
                console.error("Fallback status fetch also failed:", e);
            }
        } finally {
            setFetching(false);
        }
    }, [nodeId]);

    useEffect(() => {
        setFetching(true);
        setOperationData(null);
        fetchOperationStatus();
        const interval = setInterval(fetchOperationStatus, 30000);
        return () => clearInterval(interval);
    }, [fetchOperationStatus]);

    const handleStatusUpdate = async (newStatus) => {
        if (newStatus === currentStatus) return;

        setLoading(true);
        try {
            await api.put(`/api/locations/status/${nodeId}`, { status: newStatus });
            setCurrentStatus(newStatus);
            showNotification('success', `Status updated to ${newStatus}`);
            await fetchOperationStatus();
        } catch (err) {
            showNotification('error', `Update failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const statusOptions = [
        {
            key: 'Operating',
            label: 'Operating',
            desc: 'Node active and participating in distribution',
            icon: <CheckCircle2 size={18} />,
            color: '#22c55e'
        },
        {
            key: 'Maintenance',
            label: 'Maintenance',
            desc: 'Scheduled downtime, skipped in optimization',
            icon: <Settings size={18} />,
            color: '#f59e0b'
        },
        {
            key: 'Shutdown',
            label: 'Shutdown',
            desc: 'Critical halt, unavailable for logistics',
            icon: <Power size={18} />,
            color: '#ef4444'
        }
    ];

    return (
        <div style={{ padding: '8px 16px 16px 16px', maxWidth: '1400px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
            <PulseStyle />
            <StatusBanner operationData={operationData} currentStatus={currentStatus} />

            <div className="ops-producer-grid">
                <div className="ops-card">
                    <div className="ops-card-header">
                        <div className="ops-icon-box" style={{ background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}>
                            <Zap size={20} />
                        </div>
                        <div>
                            <h3 className="ops-card-title">Availability Control</h3>
                            <span className="ops-card-subtitle">Broadcast state to network</span>
                        </div>
                    </div>

                    <div style={{ padding: '0 28px 28px', flex: 1 }}>
                        <p style={{
                            color: 'hsl(var(--text-muted))',
                            fontSize: '0.85rem',
                            marginBottom: '20px',
                            lineHeight: 1.6
                        }}>
                            {isAdminControlling
                                ? 'Override this node\'s operational status. Changes are logged and broadcast to the central optimizer.'
                                : 'Your selection immediately updates the central optimizer and all monitoring terminals.'
                            }
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {statusOptions.map((option) => {
                                const isActive = currentStatus === option.key;
                                return (
                                    <button
                                        key={option.key}
                                        onClick={() => handleStatusUpdate(option.key)}
                                        disabled={loading || fetching}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '16px',
                                            padding: '16px 18px',
                                            borderRadius: '12px',
                                            background: isActive ? `${option.color}10` : 'transparent',
                                            border: isActive ? `2px solid ${option.color}` : '1.5px solid hsl(var(--border-color))',
                                            textAlign: 'left',
                                            transition: 'all 0.2s ease',
                                            cursor: (loading || fetching) ? 'not-allowed' : 'pointer',
                                            opacity: (loading || fetching) ? 0.6 : 1
                                        }}
                                    >
                                        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: `${option.color}18`, color: option.color, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', flexShrink: 0 }}>
                                            {option.icon}
                                        </div>

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: '0.95rem',
                                                fontWeight: 700,
                                                color: isActive ? option.color : 'hsl(var(--text-primary))'
                                            }}>
                                                {option.label}
                                            </div>
                                            <div style={{
                                                fontSize: '0.78rem',
                                                color: 'hsl(var(--text-muted))',
                                                marginTop: '2px'
                                            }}>
                                                {option.desc}
                                            </div>
                                        </div>

                                        {isActive && (
                                            <span style={{ padding: '5px 10px', borderRadius: '20px', background: `${option.color}20`, color: option.color, fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', border: `1px solid ${option.color}40`, flexShrink: 0 }}>
                                                Active
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <StatusHistoryCard operationData={operationData} />
            </div>
        </div>
    );
};

const CONVERTER_STATUS_COLORS = {
    Running: '#22c55e',
    Standby: '#3b82f6',
    Maintenance: '#f59e0b',
    Shutdown: '#ef4444'
};

const CONVERTER_STATUS_ICONS = {
    Running: <Play size={14} />,
    Standby: <Pause size={14} />,
    Maintenance: <Wrench size={14} />,
    Shutdown: <Power size={14} />
};

const getLiningBarColor = (pct) => {
    if (pct > 95) return '#ef4444';
    if (pct > 85) return '#ef4444';
    if (pct > 70) return '#f59e0b';
    return '#22c55e';
};

const getLiningLevel = (pct) => {
    if (pct > 95) return 'overdue';
    if (pct > 85) return 'critical';
    if (pct > 70) return 'warning';
    return 'normal';
};

const ConsumerAutoStatusBanner = ({ converters, isSMS3 }) => {
    const activeCount = converters.filter(c => c.status === 'Running' || c.status === 'Standby').length;
    const total = converters.length;
    const isOperating = activeCount > 0;
    const unitLabel = isSMS3 ? 'Equipment' : 'Converters';

    return (
        <div className="ops-status-banner" style={{
            background: 'hsl(var(--card-bg))',
            borderRadius: '14px',
            padding: '18px 24px',
            marginBottom: '20px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: 1 }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: isOperating ? '#22c55e18' : '#ef444418', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isOperating ? '#22c55e' : '#ef4444', flexShrink: 0 }}>
                    {isOperating ? <CheckCircle2 size={18} /> : <Power size={18} />}
                </div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: isOperating ? '#22c55e' : '#ef4444', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        Node Status: {isOperating ? 'Operating' : 'Shutdown'}
                    </div>
                    <div style={{
                        fontSize: '0.82rem',
                        color: 'hsl(var(--text-muted))',
                        marginTop: '2px'
                    }}>
                        {isOperating
                            ? `At least one ${isSMS3 ? 'unit' : 'converter'} is active and ready to receive hot metal`
                            : `All ${isSMS3 ? 'equipment' : 'converters'} offline — node excluded from distribution`}
                    </div>
                </div>
            </div>

            <div style={{ padding: '8px 16px', background: isOperating ? '#22c55e14' : '#ef444414', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <Activity size={16} style={{ color: isOperating ? '#22c55e' : '#ef4444' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: isOperating ? '#22c55e' : '#ef4444', whiteSpace: 'nowrap' }}>
                    {activeCount}/{total} {unitLabel} Active
                </span>
            </div>
        </div>
    );
};

const AggregateStatsBar = ({ stats, isSMS3 }) => {
    const avgLiningColor = (stats.avg_lining_pct ?? 0) > 85 ? '#ef4444' : (stats.avg_lining_pct ?? 0) > 70 ? '#f59e0b' : '#22c55e';
    const unitLabel = isSMS3 ? 'Equipment' : 'Converters';

    const items = [
        { label: `Total ${unitLabel}`, value: stats.total_converters ?? 0, icon: <Settings size={20} />, color: 'hsl(var(--primary))' },
        { label: `Active ${unitLabel}`, value: stats.active_converters ?? 0, icon: <Play size={20} />, color: '#22c55e' },
        { label: 'Avg Lining Life', value: isSMS3 ? 'N/A' : `${(stats.avg_lining_pct ?? 0).toFixed(0)}%`, icon: <TrendingUp size={20} />, color: isSMS3 ? 'hsl(var(--text-muted))' : avgLiningColor },
        { label: 'Need Relining', value: isSMS3 ? 'N/A' : (stats.converters_needing_relining ?? 0), icon: <AlertTriangle size={20} />, color: isSMS3 ? 'hsl(var(--text-muted))' : ((stats.converters_needing_relining ?? 0) > 0 ? '#ef4444' : '#22c55e') }
    ];

    return (
        <div className="ops-stats-grid">
            {items.map((item, i) => (
                <div key={i} style={{
                    background: 'hsl(var(--card-bg))',
                    borderRadius: '14px',
                    padding: '20px 22px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    cursor: 'default'
                }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
                >
                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${item.color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.color, flexShrink: 0 }}>
                        {item.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: item.color, lineHeight: 1 }}>
                            {item.value}
                        </div>
                        <div style={{
                            fontSize: '0.72rem',
                            fontWeight: 500,
                            color: 'hsl(var(--text-muted))',
                            marginTop: '4px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {item.label}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const EQUIPMENT_TYPE_COLORS = {
    BOF: '#6366f1',
    ZPF: '#0ea5e9',
    EAF: '#f97316'
};

const ConverterCard = ({ converter, onStatusChange, onEdit, onDelete, onHistory }) => {
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    const [statusReason, setStatusReason] = useState('');
    const [pendingStatus, setPendingStatus] = useState(null);
    const [hovering, setHovering] = useState(false);
    const menuRef = useRef(null);

    const equipmentType = converter.equipment_type || 'BOF';
    const isNonBOF = equipmentType !== 'BOF';
    const statusColor = CONVERTER_STATUS_COLORS[converter.status] || '#6b7280';
    const liningPct = isNonBOF ? 0 : (converter.lining_percentage ?? ((converter.current_heats / converter.max_heats) * 100));
    const barColor = isNonBOF ? '#6b7280' : getLiningBarColor(liningPct);
    const liningLvl = isNonBOF ? 'normal' : (converter.lining_level || getLiningLevel(liningPct));
    const isPulse = liningLvl === 'overdue';
    const eqColor = EQUIPMENT_TYPE_COLORS[equipmentType] || '#6b7280';

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                setShowStatusMenu(false);
                setPendingStatus(null);
                setStatusReason('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const confirmStatusChange = () => {
        if (pendingStatus) {
            onStatusChange(converter.id, pendingStatus, statusReason);
            setShowStatusMenu(false);
            setPendingStatus(null);
            setStatusReason('');
        }
    };

    return (
        <div
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            style={{
                background: 'hsl(var(--card-bg))',
                borderRadius: '14px',
                padding: '20px',
                position: 'relative',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                transform: hovering ? 'translateY(-2px)' : 'none',
                boxShadow: hovering ? '0 8px 24px rgba(0,0,0,0.08)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        color: 'hsl(var(--text-primary))'
                    }}>
                        {converter.name}
                    </span>
                    {isNonBOF && (
                        <span style={{ padding: '2px 8px', borderRadius: '5px', background: `${eqColor}18`, color: eqColor, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {equipmentType}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', background: `${statusColor}14`, }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor, boxShadow: `0 0 6px ${statusColor}60` }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {converter.status}
                    </span>
                </div>
            </div>
            {!isNonBOF && (liningLvl === 'critical' || liningLvl === 'overdue') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#ef444414', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, color: '#ef4444' }}>
                    <AlertTriangle size={14} />
                    {liningLvl === 'overdue' ? 'Overdue for relining — immediate action required' : 'Approaching lining lifecycle limit'}
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {equipmentType !== 'BOF' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                        <span style={{ color: 'hsl(var(--text-muted))' }}>Type</span>
                        <span style={{ fontWeight: 700, color: eqColor, padding: '1px 8px', borderRadius: '4px', background: `${eqColor}14`, fontSize: '0.82rem' }}>{equipmentType}</span>
                    </div>
                )}
                {converter.capacity_tons > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                        <span style={{ color: 'hsl(var(--text-muted))' }}>Capacity</span>
                        <span style={{ fontWeight: 600, color: 'hsl(var(--text-primary))' }}>{converter.capacity_tons} T</span>
                    </div>
                )}
                {!isNonBOF && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                        <span style={{ color: 'hsl(var(--text-muted))' }}>Heats</span>
                        <span style={{ fontWeight: 600, color: 'hsl(var(--text-primary))' }}>
                            {(converter.current_heats ?? 0).toLocaleString()} / {(converter.max_heats ?? 3000).toLocaleString()}
                        </span>
                    </div>
                )}
                {isNonBOF && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                        <span style={{ color: 'hsl(var(--text-muted))' }}>Lining / Heats</span>
                        <span style={{ fontWeight: 500, color: 'hsl(var(--text-muted))' }}>N/A</span>
                    </div>
                )}
            </div>
            {!isNonBOF && (
            <div>
                <div style={{
                    width: '100%',
                    height: '10px',
                    background: 'hsl(var(--main-bg))',
                    borderRadius: '5px',
                    overflow: 'hidden',
                    position: 'relative'
                }}>
                    <div style={{ width: `${Math.min(liningPct, 100)}%`, height: '100%', background: barColor, borderRadius: '5px', transition: 'width 0.5s ease', animation: isPulse ? 'converterPulse 1.5s ease-in-out infinite' : 'none' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '0.78rem' }}>
                    <span style={{ color: 'hsl(var(--text-muted))' }}>Lining used</span>
                    <span style={{ fontWeight: 700, color: barColor }}>{liningPct.toFixed(0)}%</span>
                </div>
            </div>
            )}
            {converter.status_days != null && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.82rem',
                    color: 'hsl(var(--text-muted))'
                }}>
                    <Clock size={14} />
                    {converter.status === 'Running' ? 'Running' : converter.status} for: <span style={{ fontWeight: 600, color: 'hsl(var(--text-primary))' }}>{converter.status_days} days</span>
                </div>
            )}
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px', position: 'relative' }} ref={menuRef}>
                <button
                    onClick={() => { setShowStatusMenu(!showStatusMenu); setPendingStatus(null); setStatusReason(''); }}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        padding: '9px 10px',
                        borderRadius: '10px',
                        border: '1px solid hsl(var(--border-color))',
                        background: 'hsl(var(--main-bg))',
                        color: 'hsl(var(--text-primary))',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <ChevronDown size={13} /> Status
                </button>
                <button
                    onClick={() => onHistory(converter)}
                    style={{
                        padding: '9px 10px',
                        borderRadius: '10px',
                        border: '1px solid hsl(var(--border-color))',
                        background: 'hsl(var(--main-bg))',
                        color: 'hsl(var(--text-primary))',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                        whiteSpace: 'nowrap'
                    }}
                >
                    <History size={13} /> History
                </button>
                <button
                    onClick={() => onEdit(converter)}
                    style={{
                        padding: '9px',
                        borderRadius: '10px',
                        border: '1px solid hsl(var(--border-color))',
                        background: 'hsl(var(--main-bg))',
                        color: 'hsl(var(--text-muted))',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                        flexShrink: 0
                    }}
                >
                    <Edit3 size={13} />
                </button>
                <button
                    onClick={() => onDelete(converter)}
                    style={{
                        padding: '9px',
                        borderRadius: '10px',
                        border: '1px solid hsl(var(--border-color))',
                        background: 'hsl(var(--main-bg))',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease',
                        flexShrink: 0
                    }}
                >
                    <Trash2 size={13} />
                </button>
                {showStatusMenu && (
                    <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: 0,
                        right: 0,
                        marginBottom: '8px',
                        background: 'hsl(var(--card-bg))',
                        borderRadius: '12px',
                        border: '1px solid hsl(var(--border-color))',
                        boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
                        zIndex: 20,
                        overflow: 'hidden'
                    }}>
                        <div style={{ padding: '12px 16px 8px', fontSize: '0.72rem', fontWeight: 700, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Select New Status
                        </div>
                        <div style={{ padding: '4px 10px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {['Running', 'Standby', 'Maintenance', 'Shutdown'].filter(s => s !== converter.status).map(s => {
                            const isSelected = pendingStatus === s;
                            const color = CONVERTER_STATUS_COLORS[s];
                            return (
                            <button
                                key={s}
                                onClick={() => setPendingStatus(s)}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    border: isSelected ? `2px solid ${color}` : '2px solid transparent',
                                    borderRadius: '8px',
                                    background: isSelected ? `${color}20` : 'hsl(var(--main-bg))',
                                    color: isSelected ? color : 'hsl(var(--text-primary))',
                                    fontSize: '0.85rem',
                                    fontWeight: isSelected ? 700 : 500,
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.background = `${color}10`; e.currentTarget.style.borderColor = `${color}50`; }}}
                                onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.background = 'hsl(var(--main-bg))'; e.currentTarget.style.borderColor = 'transparent'; }}}
                            >
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, boxShadow: isSelected ? `0 0 8px ${color}80` : 'none', flexShrink: 0 }} />
                                {s}
                                {isSelected && (
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 'auto' }}>
                                        <path d="M3 8.5L6.5 12L13 4" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                )}
                            </button>
                            );
                        })}
                        </div>
                        {pendingStatus && (
                            <div style={{ padding: '12px 16px', borderTop: '1px solid hsl(var(--border-color))' }}>
                                <input
                                    type="text"
                                    placeholder="Reason (optional)"
                                    value={statusReason}
                                    onChange={e => setStatusReason(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid hsl(var(--border-color))',
                                        background: 'hsl(var(--main-bg))',
                                        color: 'hsl(var(--text-primary))',
                                        fontSize: '0.82rem',
                                        outline: 'none',
                                        marginBottom: '8px',
                                        boxSizing: 'border-box'
                                    }}
                                />
                                <button onClick={confirmStatusChange} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: 'none', background: CONVERTER_STATUS_COLORS[pendingStatus], color: 'white', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.15s ease' }}>
                                    Confirm {pendingStatus}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const AddConverterCard = ({ onAdd, isSMS3 }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [form, setForm] = useState({ name: '', capacity_tons: '', max_heats: 3000, equipment_type: 'BOF' });
    const [submitting, setSubmitting] = useState(false);

    const isNonBOF = form.equipment_type !== 'BOF';

    const handleSubmit = async () => {
        if (!form.name.trim()) return;
        setSubmitting(true);
        const payload = {
            name: form.name.trim(),
            capacity_tons: form.capacity_tons ? Number(form.capacity_tons) : 0,
            max_heats: isNonBOF ? 0 : (Number(form.max_heats) || 3000),
            equipment_type: form.equipment_type
        };
        await onAdd(payload);
        setForm({ name: '', capacity_tons: '', max_heats: 3000, equipment_type: 'BOF' });
        setIsOpen(false);
        setSubmitting(false);
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                style={{
                    background: 'transparent',
                    borderRadius: '14px',
                    border: '2px dashed hsl(var(--border-color))',
                    padding: '32px 24px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    minHeight: '140px',
                    color: 'hsl(var(--text-muted))'
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'hsl(var(--primary))';
                    e.currentTarget.style.color = 'hsl(var(--primary))';
                    e.currentTarget.style.background = 'hsl(var(--primary) / 0.04)';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'hsl(var(--border-color))';
                    e.currentTarget.style.color = 'hsl(var(--text-muted))';
                    e.currentTarget.style.background = 'transparent';
                }}
            >
                <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '16px',
                    background: 'hsl(var(--main-bg))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <Plus size={24} />
                </div>
                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{isSMS3 ? 'Add Equipment' : 'Add Converter'}</span>
            </button>
        );
    }

    return (
        <div style={{
            background: 'hsl(var(--card-bg))',
            borderRadius: '16px',
            padding: '24px',
            border: '2px solid hsl(var(--primary))',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'hsl(var(--text-primary))' }}>{isSMS3 ? 'New Equipment' : 'New Converter'}</span>
                <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text-muted))', padding: '4px' }}>
                    <X size={18} />
                </button>
            </div>
            <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '6px', display: 'block' }}>
                    Equipment Type
                </label>
                <select
                    name="equipment_type"
                    value={form.equipment_type}
                    onChange={e => setForm(prev => ({ ...prev, equipment_type: e.target.value }))}
                    style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid hsl(var(--border-color))',
                        background: 'hsl(var(--main-bg))',
                        color: 'hsl(var(--text-primary))',
                        fontSize: '0.88rem',
                        outline: 'none',
                        boxSizing: 'border-box',
                        cursor: 'pointer'
                    }}
                >
                    <option value="BOF">BOF (Converter)</option>
                    <option value="ZPF">ZPF</option>
                    <option value="EAF">EAF</option>
                </select>
            </div>

            {[
                { label: 'Name', key: 'name', type: 'text', placeholder: form.equipment_type === 'BOF' ? 'e.g. BOF-4' : `e.g. ${form.equipment_type}-1` },
                { label: 'Capacity (Tonnes) — Optional', key: 'capacity_tons', type: 'number', placeholder: 'Optional' },
                ...(!isNonBOF ? [{ label: 'Max Heats / Lifecycle', key: 'max_heats', type: 'number', placeholder: '3000' }] : [])
            ].map(f => (
                <div key={f.key}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '6px', display: 'block' }}>
                        {f.label}
                    </label>
                    <input
                        type={f.type}
                        placeholder={f.placeholder}
                        value={form[f.key]}
                        onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1px solid hsl(var(--border-color))',
                            background: 'hsl(var(--main-bg))',
                            color: 'hsl(var(--text-primary))',
                            fontSize: '0.88rem',
                            outline: 'none',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>
            ))}

            <button
                onClick={handleSubmit}
                disabled={submitting || !form.name.trim()}
                style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: !form.name.trim() ? 'hsl(var(--border-color))' : 'hsl(var(--primary))',
                    color: 'white',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    cursor: !form.name.trim() ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
                    marginTop: '4px'
                }}
            >
                {submitting ? 'Adding...' : (isSMS3 ? 'Add Equipment' : 'Add Converter')}
            </button>
        </div>
    );
};

const ConverterHistoryModal = ({ converter, onClose }) => {
    const [history, setHistory] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const data = await api.get(`/api/converters/${converter.id}/history`, { days: 90 });
                setHistory(data);
            } catch (err) {
                console.error('Failed to fetch converter history:', err);
                setHistory({ summary: {}, timeline: [] });
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [converter.id]);

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                background: 'hsl(var(--card-bg))',
                borderRadius: '20px',
                width: '90%',
                maxWidth: '620px',
                maxHeight: '80vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 24px 64px rgba(0,0,0,0.2)'
            }}>
                <div style={{
                    padding: '24px 28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid hsl(var(--border-color))'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '12px',
                            background: 'hsl(var(--primary) / 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'hsl(var(--primary))'
                        }}>
                            <History size={20} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'hsl(var(--text-primary))' }}>
                                {converter.name} History
                            </h3>
                            <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Last 90 days</span>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text-muted))', padding: '8px' }}>
                        <X size={20} />
                    </button>
                </div>

                <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '48px', color: 'hsl(var(--text-muted))' }}>Loading history...</div>
                    ) : (
                        <>
                            {history?.summary && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '24px' }}>
                                    {[
                                        { label: 'Running Hours', value: history.summary.running_hours ?? '-', color: '#22c55e' },
                                        { label: 'Maintenance Hours', value: history.summary.maintenance_hours ?? '-', color: '#f59e0b' },
                                        { label: 'Shutdown Hours', value: history.summary.shutdown_hours ?? '-', color: '#ef4444' },
                                        { label: 'Availability', value: history.summary.availability_pct != null ? `${history.summary.availability_pct.toFixed(1)}%` : '-', color: 'hsl(var(--primary))' }
                                    ].map((s, i) => (
                                        <div key={i} style={{
                                            padding: '16px',
                                            background: 'hsl(var(--main-bg))',
                                            borderRadius: '12px',
                                            textAlign: 'center'
                                        }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
                                            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'hsl(var(--text-muted))', marginTop: '6px', textTransform: 'uppercase' }}>{s.label}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px' }}>
                                Status Changes
                            </div>
                            {(!history?.timeline || history.timeline.length === 0) ? (
                                <div style={{ padding: '32px', textAlign: 'center', color: 'hsl(var(--text-muted))', background: 'hsl(var(--main-bg))', borderRadius: '12px' }}>
                                    No status changes recorded
                                </div>
                            ) : (
                                <div style={{ background: 'hsl(var(--main-bg))', borderRadius: '12px', overflow: 'hidden' }}>
                                    {history.timeline.map((entry, idx) => {
                                        const sColor = CONVERTER_STATUS_COLORS[entry.status] || '#6b7280';
                                        return (
                                            <div key={idx} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '14px 18px',
                                                borderBottom: idx < history.timeline.length - 1 ? '1px solid hsl(var(--border-color))' : 'none'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: `${sColor}18`, color: sColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        {CONVERTER_STATUS_ICONS[entry.status] || <Clock size={14} />}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'hsl(var(--text-primary))' }}>{entry.status}</div>
                                                        <div style={{ fontSize: '0.78rem', color: 'hsl(var(--text-muted))' }}>{formatDate(entry.timestamp || entry.start)}</div>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    {entry.duration && <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'hsl(var(--primary))' }}>{entry.duration}</div>}
                                                    {entry.reason && <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.reason}</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const EditConverterModal = ({ converter, onClose, onSave }) => {
    const eqType = converter.equipment_type || 'BOF';
    const [form, setForm] = useState({
        name: converter.name,
        capacity_tons: converter.capacity_tons,
        max_heats: converter.max_heats,
        equipment_type: eqType
    });
    const [submitting, setSubmitting] = useState(false);

    const isNonBOF = form.equipment_type !== 'BOF';

    const handleSave = async () => {
        setSubmitting(true);
        await onSave(converter.id, {
            name: form.name.trim(),
            capacity_tons: form.capacity_tons ? Number(form.capacity_tons) : 0,
            max_heats: isNonBOF ? 0 : Number(form.max_heats),
            equipment_type: form.equipment_type
        });
        setSubmitting(false);
        onClose();
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                background: 'hsl(var(--card-bg))',
                borderRadius: '20px',
                width: '90%',
                maxWidth: '440px',
                overflow: 'hidden',
                boxShadow: '0 24px 64px rgba(0,0,0,0.2)'
            }}>
                <div style={{ padding: '24px 28px', borderBottom: '1px solid hsl(var(--border-color))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'hsl(var(--text-primary))' }}>Edit {converter.name}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'hsl(var(--text-muted))', padding: '4px' }}><X size={20} /></button>
                </div>
                <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '6px', display: 'block' }}>Equipment Type</label>
                        <select
                            value={form.equipment_type}
                            onChange={e => setForm(prev => ({ ...prev, equipment_type: e.target.value }))}
                            style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                border: '1px solid hsl(var(--border-color))',
                                background: 'hsl(var(--main-bg))',
                                color: 'hsl(var(--text-primary))',
                                fontSize: '0.88rem',
                                outline: 'none',
                                boxSizing: 'border-box',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="BOF">BOF (Converter)</option>
                            <option value="ZPF">ZPF</option>
                            <option value="EAF">EAF</option>
                        </select>
                    </div>
                    {[
                        { label: 'Name', key: 'name', type: 'text' },
                        { label: 'Capacity (Tonnes) — Optional', key: 'capacity_tons', type: 'number' },
                        ...(!isNonBOF ? [{ label: 'Max Heats / Lifecycle', key: 'max_heats', type: 'number' }] : [])
                    ].map(f => (
                        <div key={f.key}>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '6px', display: 'block' }}>{f.label}</label>
                            <input
                                type={f.type}
                                value={form[f.key]}
                                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    borderRadius: '10px',
                                    border: '1px solid hsl(var(--border-color))',
                                    background: 'hsl(var(--main-bg))',
                                    color: 'hsl(var(--text-primary))',
                                    fontSize: '0.88rem',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>
                    ))}
                    <button
                        onClick={handleSave}
                        disabled={submitting}
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '10px',
                            border: 'none',
                            background: 'hsl(var(--primary))',
                            color: 'white',
                            fontSize: '0.88rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            marginTop: '4px',
                            transition: 'opacity 0.15s ease'
                        }}
                    >
                        {submitting ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const DeleteConfirmModal = ({ converter, onClose, onConfirm }) => {
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        setDeleting(true);
        await onConfirm(converter.id);
        setDeleting(false);
        onClose();
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                background: 'hsl(var(--card-bg))',
                borderRadius: '20px',
                width: '90%',
                maxWidth: '400px',
                padding: '32px',
                textAlign: 'center',
                boxShadow: '0 24px 64px rgba(0,0,0,0.2)'
            }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: '#ef444418', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#ef4444' }}>
                    <Trash2 size={24} />
                </div>
                <h3 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontWeight: 700, color: 'hsl(var(--text-primary))' }}>Delete {converter.name}?</h3>
                <p style={{ margin: '0 0 24px', fontSize: '0.88rem', color: 'hsl(var(--text-muted))' }}>This action cannot be undone. All history for this converter will be removed.</p>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={onClose} style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '10px',
                        border: '1px solid hsl(var(--border-color))',
                        background: 'hsl(var(--main-bg))',
                        color: 'hsl(var(--text-primary))',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                    }}>Cancel</button>
                    <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#ef4444', color: 'white', fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer' }}>{deleting ? 'Deleting...' : 'Delete'}</button>
                </div>
            </div>
        </div>
    );
};

const GanttTimeline = ({ ganttData, days = 30 }) => {
    const isEmpty = !ganttData || ganttData.length === 0;

    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days);
    const totalMs = now - startDate;

    const dayLabels = [];
    for (let i = 0; i <= days; i += Math.max(1, Math.floor(days / 6))) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + i);
        dayLabels.push({ pct: (i / days) * 100, label: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) });
    }

    return (
        <div style={{
            background: 'hsl(var(--card-bg))',
            borderRadius: '14px',
            overflow: 'hidden'
        }}>
            <div style={{ padding: '20px 24px 14px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'hsl(var(--primary) / 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'hsl(var(--primary))'
                }}>
                    <Calendar size={20} />
                </div>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'hsl(var(--text-primary))' }}>Status Timeline</h3>
                    <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Last {days} days — all converters</span>
                </div>
            </div>

            <div style={{ padding: '0 24px 20px' }}>
                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    {Object.entries(CONVERTER_STATUS_COLORS).map(([status, color]) => (
                        <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: color }} />
                            {status}
                        </div>
                    ))}
                </div>

                {isEmpty ? (
                    <div style={{
                        padding: '40px 24px',
                        textAlign: 'center',
                        background: 'hsl(var(--main-bg))',
                        borderRadius: '12px'
                    }}>
                        <Calendar size={28} style={{ color: 'hsl(var(--text-muted))', opacity: 0.4, marginBottom: '10px' }} />
                        <p style={{ margin: 0, color: 'hsl(var(--text-muted))', fontSize: '0.88rem' }}>
                            No timeline data available yet
                        </p>
                    </div>
                ) : (
                <>
                <div style={{ position: 'relative' }}>
                    <div className="ops-gantt-axis" style={{ display: 'flex', marginBottom: '8px', position: 'relative', height: '20px' }}>
                        {dayLabels.map((d, i) => (
                            <div key={i} style={{
                                position: 'absolute',
                                left: `${d.pct}%`,
                                transform: 'translateX(-50%)',
                                fontSize: '0.68rem',
                                color: 'hsl(var(--text-muted))',
                                whiteSpace: 'nowrap'
                            }}>
                                {d.label}
                            </div>
                        ))}
                    </div>
                    {ganttData.map((row, rowIdx) => (
                        <div key={rowIdx} style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                            <div className="ops-gantt-name" style={{
                                flexShrink: 0,
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                color: 'hsl(var(--text-primary))',
                                paddingRight: '12px',
                                textAlign: 'right',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>
                                {row.name}
                            </div>
                            <div style={{
                                flex: 1,
                                height: '28px',
                                background: 'hsl(var(--main-bg))',
                                borderRadius: '6px',
                                position: 'relative',
                                overflow: 'hidden'
                            }}>
                                {(row.segments || []).map((seg, segIdx) => {
                                    const segStart = new Date(seg.start);
                                    const segEnd = seg.end ? new Date(seg.end) : now;
                                    const leftPct = Math.max(0, ((segStart - startDate) / totalMs) * 100);
                                    const widthPct = Math.max(0.5, ((segEnd - segStart) / totalMs) * 100);

                                    return (
                                        <div key={segIdx} title={`${seg.status}: ${segStart.toLocaleDateString('en-GB')} - ${seg.end ? new Date(seg.end).toLocaleDateString('en-GB') : 'Now'}`} style={{ position: 'absolute', left: `${leftPct}%`, width: `${widthPct}%`, height: '100%', background: CONVERTER_STATUS_COLORS[seg.status] || '#6b7280', opacity: 0.85, borderRadius: segIdx === 0 ? '6px 0 0 6px' : segIdx === (row.segments || []).length - 1 ? '0 6px 6px 0' : '0', transition: 'opacity 0.15s ease' }} onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }} onMouseLeave={e => { e.currentTarget.style.opacity = '0.85'; }} />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
                </>
                )}
            </div>
        </div>
    );
};

const PulseStyle = () => (
    <style>{`
        @keyframes converterPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        /* ── Premium Card Styles for Operations ── */
        .ops-card {
            background: hsl(var(--card-bg));
            border-radius: 20px;
            border: 1px solid hsl(var(--border-color));
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
            transition: box-shadow 0.3s ease, transform 0.2s ease;
        }
        .ops-card:hover {
            box-shadow: 0 8px 32px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06);
        }
        .ops-card-header {
            padding: 24px 28px 20px;
            display: flex;
            align-items: center;
            gap: 16px;
            border-bottom: 1px solid hsl(var(--border-color) / 0.5);
        }
        .ops-icon-box {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .ops-card-title {
            margin: 0;
            font-size: 1.05rem;
            font-weight: 700;
            color: hsl(var(--text-primary));
            letter-spacing: -0.01em;
        }
        .ops-card-subtitle {
            font-size: 0.75rem;
            font-weight: 600;
            color: hsl(var(--text-muted));
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        /* ── Responsive layout for Operations Control ── */
        .ops-producer-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            align-items: stretch;
        }
        .ops-stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin-bottom: 24px;
        }
        .ops-converter-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 24px;
        }
        .ops-status-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            flex-wrap: wrap;
        }
        .ops-gantt-axis {
            margin-left: 100px;
        }
        .ops-gantt-name {
            width: 100px;
        }
        @media (max-width: 1200px) {
            .ops-stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            .ops-converter-grid {
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            }
        }
        @media (max-width: 768px) {
            .ops-producer-grid {
                grid-template-columns: 1fr;
            }
            .ops-stats-grid {
                grid-template-columns: 1fr;
            }
            .ops-converter-grid {
                grid-template-columns: 1fr;
            }
            .ops-status-banner {
                flex-direction: column;
                align-items: flex-start;
            }
            .ops-gantt-axis {
                margin-left: 72px;
            }
            .ops-gantt-name {
                width: 72px;
                font-size: 0.72rem !important;
            }
        }
    `}</style>
);

const ConverterManagement = ({ nodeId: nodeIdProp }) => {
    const { user } = useAuth();
    const { showNotification } = useNotification();
    const [converters, setConverters] = useState([]);
    const [stats, setStats] = useState({});
    const [ganttData, setGanttData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [historyConverter, setHistoryConverter] = useState(null);
    const [editConverter, setEditConverter] = useState(null);
    const [deleteConverter, setDeleteConverter] = useState(null);

    const userId = nodeIdProp || user?.user_id;
    const isSMS3 = userId === 'SMS-3';

    const fetchData = useCallback(async () => {
        if (!userId) return;
        try {
            const [convRes, statsRes, ganttRes] = await Promise.allSettled([
                api.get(`/api/converters/${userId}`),
                api.get(`/api/converters/stats/${userId}`),
                api.get(`/api/converters/gantt/${userId}`, { days: 30 })
            ]);
            if (convRes.status === 'fulfilled') setConverters(Array.isArray(convRes.value) ? convRes.value : []);
            if (statsRes.status === 'fulfilled') setStats(statsRes.value || {});
            if (ganttRes.status === 'fulfilled') {
                const raw = Array.isArray(ganttRes.value) ? ganttRes.value : [];
                
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                setGanttData(raw.map(r => {
                    const segments = r.segments || [];
                    
                    if (segments.length > 0) {
                        const firstStart = new Date(segments[0].start);
                        if (firstStart > thirtyDaysAgo) {
                            segments[0] = { ...segments[0], start: thirtyDaysAgo.toISOString() };
                        }
                    }
                    return { name: r.converter_name || r.name, segments };
                }));
            }
        } catch (err) {
            console.error('Failed to fetch converter data:', err);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        setLoading(true);
        setConverters([]);
        setStats({});
        setGanttData([]);
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleStatusChange = async (converterId, newStatus, reason) => {
        try {
            await api.put(`/api/converters/${converterId}/status`, { status: newStatus, reason });
            showNotification('success', `Converter status updated to ${newStatus}`);
            if (newStatus === 'Running') {
                
                const conv = converters.find(c => c.id === converterId);
                if (conv?.status === 'Maintenance') {
                    showNotification('info', 'Heats reset after relining');
                }
            }
            await fetchData();
        } catch (err) {
            showNotification('error', `Status change failed: ${err.message}`);
        }
    };

    const handleAddConverter = async (data) => {
        try {
            await api.post(`/api/converters/${userId}`, data);
            showNotification('success', `Converter "${data.name}" added`);
            await fetchData();
        } catch (err) {
            showNotification('error', `Failed to add converter: ${err.message}`);
        }
    };

    const handleEditConverter = async (converterId, data) => {
        try {
            await api.put(`/api/converters/${converterId}`, data);
            showNotification('success', 'Converter updated');
            await fetchData();
        } catch (err) {
            showNotification('error', `Failed to update converter: ${err.message}`);
        }
    };

    const handleDeleteConverter = async (converterId) => {
        try {
            await api.delete(`/api/converters/${converterId}`);
            showNotification('success', 'Converter removed');
            await fetchData();
        } catch (err) {
            showNotification('error', `Failed to delete converter: ${err.message}`);
        }
    };

    if (loading) {
        return (
            <div style={{
                padding: '12px 24px 24px',
                maxWidth: '1400px',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '400px',
                color: 'hsl(var(--text-muted))',
                fontSize: '0.95rem'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <Activity size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <div>Loading converter data...</div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: '12px 24px 24px', maxWidth: '1400px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
            <PulseStyle />
            <ConsumerAutoStatusBanner converters={converters} isSMS3={isSMS3} />
            <AggregateStatsBar stats={stats} isSMS3={isSMS3} />
            <div className="ops-converter-grid">
                {converters.map(conv => (
                    <ConverterCard key={conv.id} converter={conv} onStatusChange={handleStatusChange} onEdit={setEditConverter} onDelete={setDeleteConverter} onHistory={setHistoryConverter} />
                ))}
                <AddConverterCard onAdd={handleAddConverter} isSMS3={isSMS3} />
            </div>
            <GanttTimeline ganttData={ganttData} days={30} />
            {historyConverter && (
                <ConverterHistoryModal converter={historyConverter} onClose={() => setHistoryConverter(null)} />
            )}
            {editConverter && (
                <EditConverterModal converter={editConverter} onClose={() => setEditConverter(null)} onSave={handleEditConverter} />
            )}
            {deleteConverter && (
                <DeleteConfirmModal converter={deleteConverter} onClose={() => setDeleteConverter(null)} onConfirm={handleDeleteConverter} />
            )}
        </div>
    );
};

const AdminOperations = () => {
    const [nodes, setNodes] = useState([]);
    const [activeTab, setActiveTab] = useState('producer');
    const [selectedNode, setSelectedNode] = useState(null);
    const [loadingNodes, setLoadingNodes] = useState(true);

    useEffect(() => {
        const fetchNodes = async () => {
            try {
                const data = await api.get('/api/locations');
                const sorted = (Array.isArray(data) ? data : []).sort((a, b) =>
                    (a.name || a.user_id || '').localeCompare(b.name || b.user_id || '')
                );
                setNodes(sorted);
                const firstProducer = sorted.find(n => n.type === 'producer');
                if (firstProducer) setSelectedNode(firstProducer);
            } catch (err) {
                console.error('Failed to fetch nodes:', err);
            } finally {
                setLoadingNodes(false);
            }
        };
        fetchNodes();
    }, []);

    const producers = nodes.filter(n => n.type === 'producer');
    const consumers = nodes.filter(n => n.type === 'consumer');
    const visibleNodes = activeTab === 'producer' ? producers : consumers;

    const getStatusColor = (status) => {
        switch (status) {
            case 'Operating': return '#22c55e';
            case 'Maintenance': return '#f59e0b';
            case 'Shutdown': return '#ef4444';
            default: return 'hsl(var(--text-muted))';
        }
    };

    const handleTabSwitch = (tab) => {
        setActiveTab(tab);
        const list = tab === 'producer' ? producers : consumers;
        if (list.length > 0) {
            
            if (!selectedNode || selectedNode.type !== tab) {
                setSelectedNode(list[0]);
            }
        }
    };

    if (loadingNodes) {
        return (
            <div style={{
                padding: '12px 24px 24px',
                maxWidth: '1400px',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '400px',
                color: 'hsl(var(--text-muted))',
                fontSize: '0.95rem'
            }}>
                <div style={{ textAlign: 'center' }}>
                    <Activity size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <div>Loading nodes...</div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: '8px 16px 16px 16px', maxWidth: '1400px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
            <PulseStyle />
            <div style={{
                background: 'hsl(var(--card-bg))',
                borderRadius: '16px',
                marginBottom: '20px',
                overflow: 'hidden'
            }}>
                <div style={{
                    display: 'flex',
                    borderBottom: '1px solid hsl(var(--border-color) / 0.5)'
                }}>
                    {[
                        { key: 'producer', label: 'Producer', icon: <Factory size={16} />, count: producers.length, onlineCount: producers.filter(p => p.status === 'Operating').length },
                        { key: 'consumer', label: 'Consumer', icon: <Building2 size={16} />, count: consumers.length, onlineCount: consumers.filter(c => c.status === 'Operating').length }
                    ].map(tab => {
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => handleTabSwitch(tab.key)}
                                style={{
                                    flex: 1,
                                    padding: '16px 20px',
                                    background: 'transparent',
                                    border: 'none',
                                    borderBottom: isActive ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '10px',
                                    transition: 'all 0.2s ease',
                                    marginBottom: '-1px'
                                }}
                            >
                                <span style={{
                                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--text-muted))',
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'color 0.2s ease'
                                }}>
                                    {tab.icon}
                                </span>
                                <span style={{
                                    fontSize: '0.9rem',
                                    fontWeight: isActive ? 700 : 500,
                                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--text-muted))',
                                    transition: 'color 0.2s ease'
                                }}>
                                    {tab.label}
                                </span>
                                <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--text-muted))',
                                    opacity: isActive ? 0.7 : 0.4,
                                    transition: 'all 0.2s ease'
                                }}>
                                    {tab.onlineCount}/{tab.count}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div style={{ padding: '16px 20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {visibleNodes.map(node => {
                        const isSelected = selectedNode?.user_id === node.user_id;
                        const statusColor = getStatusColor(node.status);
                        return (
                            <button
                                key={node.user_id}
                                onClick={() => setSelectedNode(node)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: isSelected ? '1.5px solid hsl(var(--primary))' : '1.5px solid hsl(var(--border-color) / 0.6)',
                                    background: isSelected ? 'hsl(var(--primary) / 0.07)' : 'transparent',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={e => {
                                    if (!isSelected) e.currentTarget.style.background = 'hsl(var(--main-bg))';
                                }}
                                onMouseLeave={e => {
                                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                                }}
                            >
                                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusColor, boxShadow: `0 0 5px ${statusColor}50`, flexShrink: 0 }} />
                                <span style={{
                                    fontSize: '0.88rem',
                                    fontWeight: isSelected ? 700 : 500,
                                    color: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--text-primary))',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {node.name || node.user_id}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
            {selectedNode && (
                <div key={selectedNode.user_id}>
                    {selectedNode.type === 'consumer'
                        ? <ConverterManagement nodeId={selectedNode.user_id} />
                        : <ProducerOperations nodeId={selectedNode.user_id} />
                    }
                </div>
            )}
        </div>
    );
};

const Operations = () => {
    const { user } = useAuth();

    if (user?.role === 'admin' || user?.role === 'trs') {
        return <AdminOperations />;
    }

    if (user?.role === 'consumer') {
        return <ConverterManagement />;
    }

    return <ProducerOperations />;
};

export default Operations;
