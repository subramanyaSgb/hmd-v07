import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { api } from '../utils/api';
import { Plus, Edit2, Trash2, AlertCircle, Clock, Wrench, Activity } from 'lucide-react'

const STATUS_COLORS = {
    Running: '#22c55e',
    Standby: '#3b82f6',
    Maintenance: '#f59e0b',
    Shutdown: '#ef4444',
};

const LINING_COLORS = {
    good: '#22c55e',
    normal: '#22c55e',
    warning: '#f59e0b',
    critical: '#ef4444',
    overdue: '#ef4444',
};

const MaintenanceScheduling = () => {
    const { user } = useAuth();
    const { showNotification } = useNotification();
    const [loading, setLoading] = useState(true);
    const [schedules, setSchedules] = useState([]);
    const [nodes, setNodes] = useState([]);
    const [converters, setConverters] = useState([]);
    const [convertersLoading, setConvertersLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(null);
    const [formData, setFormData] = useState({
        node_id: '',
        start_date: '',
        end_date: '',
        reason: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (user?.role === 'admin' || user?.role === 'trs') {
            fetchConverters();
        }
    }, [user]);

    const fetchConverters = async () => {
        setConvertersLoading(true);
        try {
            const data = await api.get('/api/converters/admin/all');
            
            const sorted = (data || []).sort((a, b) => {
                const cmp = (a.consumer_id || '').localeCompare(b.consumer_id || '');
                if (cmp !== 0) return cmp;
                return (a.name || '').localeCompare(b.name || '');
            });
            setConverters(sorted);
        } catch (err) {
            console.error('Failed to fetch converters:', err);
        } finally {
            setConvertersLoading(false);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [schedulesData, nodesData] = await Promise.all([
                api.get('/api/maintenance'),
                api.get('/api/locations')
            ]);
            setSchedules(schedulesData);
            setNodes(nodesData);
        } catch (err) {
            showNotification('error', 'Failed to fetch data');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingSchedule) {
                await api.put(`/api/maintenance/${editingSchedule.id}`, formData);
                showNotification('success', 'Maintenance schedule updated');
            } else {
                await api.post('/api/maintenance', formData);
                showNotification('success', 'Maintenance schedule created');
            }
            setShowModal(false);
            setEditingSchedule(null);
            setFormData({ node_id: '', start_date: '', end_date: '', reason: '' });
            fetchData();
        } catch (err) {
            showNotification('error', err.message || 'Failed to save schedule');
        }
    };

    const handleEdit = (schedule) => {
        setEditingSchedule(schedule);
        setFormData({
            node_id: schedule.node_id,
            start_date: schedule.start_date,
            end_date: schedule.end_date,
            reason: schedule.reason
        });
        setShowModal(true);
    };

    const handleDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this maintenance schedule?')) return;

        try {
            await api.delete(`/api/maintenance/${id}`);
            showNotification('success', 'Maintenance schedule deleted');
            fetchData();
        } catch (err) {
            showNotification('error', 'Failed to delete schedule');
        }
    };

    const getStatusBadge = (schedule) => {
        const today = new Date().toISOString().split('T')[0];
        const start = schedule.start_date;
        const end = schedule.end_date;

        if (today >= start && today <= end) {
            return <span className="premium-badge status-danger">ONGOING</span>;
        } else if (today < start) {
            return <span className="premium-badge status-warning">SCHEDULED</span>;
        } else {
            return <span className="premium-badge status-muted">COMPLETED</span>;
        }
    };

    if (loading) {
        return (
            <div className="premium-page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
                <div className="premium-loader"></div>
            </div>
        );
    }

    return (
        <div className="premium-page-container">
            <div className="premium-header-row">
                <div className="premium-title-group">
                    <div className="premium-icon-box" style={{ background: 'hsl(var(--warning))', color: 'white' }}>
                        <Wrench size={24} />
                    </div>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800 }}>Maintenance Scheduling</h1>
                        <p style={{ margin: '4px 0 0 0', color: 'hsl(var(--text-muted))', fontSize: '0.9rem' }}>
                            Manage planned downtime for production nodes
                        </p>
                    </div>
                </div>

                <button
                    className="premium-btn primary"
                    onClick={() => {
                        setEditingSchedule(null);
                        setFormData({ node_id: '', start_date: '', end_date: '', reason: '' });
                        setShowModal(true);
                    }}
                >
                    <Plus size={18} />
                    Schedule Maintenance
                </button>
            </div>
            <div className="premium-card">
                <div className="premium-card-header">
                    <h3>Maintenance Schedules</h3>
                </div>
                <div style={{ padding: 0 }}>
                    <table className="dashboard-monitor-table">
                        <thead>
                            <tr>
                                <th>Node</th>
                                <th>Start Date</th>
                                <th>End Date</th>
                                <th>Duration</th>
                                <th>Reason</th>
                                <th>Status</th>
                                <th className="text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {schedules.length > 0 ? schedules.map(schedule => {
                                const start = new Date(schedule.start_date);
                                const end = new Date(schedule.end_date);
                                const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

                                return (
                                    <tr key={schedule.id}>
                                        <td>
                                            <span className="space-grotesk" style={{ fontWeight: 800, color: 'hsl(var(--primary))' }}>
                                                {schedule.node_id}
                                            </span>
                                        </td>
                                        <td>
                                            {new Date(schedule.start_date).toLocaleDateString('en-GB', {
                                                day: '2-digit', month: 'short', year: 'numeric'
                                            })}
                                        </td>
                                        <td>
                                            {new Date(schedule.end_date).toLocaleDateString('en-GB', {
                                                day: '2-digit', month: 'short', year: 'numeric'
                                            })}
                                        </td>
                                        <td>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Clock size={14} color="hsl(var(--text-muted))" />
                                                {duration} day{duration > 1 ? 's' : ''}
                                            </span>
                                        </td>
                                        <td>{schedule.reason}</td>
                                        <td>{getStatusBadge(schedule)}</td>
                                        <td className="text-center">
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                <button className="icon-btn" onClick={() => handleEdit(schedule)} title="Edit">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button className="icon-btn danger" onClick={() => handleDelete(schedule.id)} title="Delete">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: '60px', color: 'hsl(var(--text-muted))' }}>
                                        No maintenance schedules found. Click "Schedule Maintenance" to add one.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            {(user?.role === 'admin' || user?.role === 'trs') && (
                <div className="premium-card" style={{ marginTop: '24px' }}>
                    <div className="premium-card-header" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Activity size={20} color="#3b82f6" />
                        <h3 style={{ margin: 0 }}>Converter Health</h3>
                        <span style={{
                            marginLeft: 'auto',
                            fontSize: '0.8rem',
                            color: 'hsl(var(--text-muted))',
                            fontWeight: 500
                        }}>
                            {converters.length} converter{converters.length !== 1 ? 's' : ''} across all consumers
                        </span>
                    </div>
                    <div style={{ padding: 0 }}>
                        {convertersLoading ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px' }}>
                                <div className="premium-loader"></div>
                            </div>
                        ) : converters.length > 0 ? (
                            <table className="dashboard-monitor-table">
                                <thead>
                                    <tr>
                                        <th>Consumer</th>
                                        <th>Converter</th>
                                        <th>Status</th>
                                        <th>Capacity (t)</th>
                                        <th>Heats</th>
                                        <th>Lining</th>
                                        <th>Level</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {converters.map(conv => {
                                        const isCritical = conv.lining_level === 'critical' || conv.lining_level === 'overdue';
                                        const liningColor = LINING_COLORS[conv.lining_level] || '#22c55e';
                                        const statusColor = STATUS_COLORS[conv.status] || '#6b7280';

                                        return (
                                            <tr key={conv.id} style={isCritical ? { background: 'rgba(239, 68, 68, 0.06)', } : {}}>
                                                <td>
                                                    <span className="space-grotesk" style={{ fontWeight: 800, color: 'hsl(var(--primary))' }}>
                                                        {conv.consumer_id}
                                                    </span>
                                                </td>
                                                <td style={{ fontWeight: 600, color: 'hsl(var(--text-primary))' }}>
                                                    {conv.name}
                                                </td>
                                                <td>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}30`, }}>
                                                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: statusColor, }} />
                                                        {conv.status}
                                                    </span>
                                                </td>
                                                <td style={{ color: 'hsl(var(--text-primary))' }}>
                                                    {conv.capacity_tons ?? '-'}
                                                </td>
                                                <td>
                                                    <span style={{ color: 'hsl(var(--text-primary))', fontWeight: 600 }}>
                                                        {conv.current_heats ?? 0}
                                                    </span>
                                                    <span style={{ color: 'hsl(var(--text-muted))' }}>
                                                        {' / '}{conv.max_heats ?? '-'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
                                                        <div style={{
                                                            flex: 1,
                                                            height: '8px',
                                                            borderRadius: '4px',
                                                            background: 'hsl(var(--border-color))',
                                                            overflow: 'hidden',
                                                        }}>
                                                            <div style={{ width: `${Math.min(100, Math.max(0, conv.lining_percentage ?? 0))}%`, height: '100%', borderRadius: '4px', background: liningColor, transition: 'width 0.3s ease', }} />
                                                        </div>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: liningColor, minWidth: '42px', textAlign: 'right', }}>
                                                            {conv.lining_percentage != null ? `${conv.lining_percentage}%` : '-'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', background: `${liningColor}18`, color: liningColor, border: `1px solid ${liningColor}30`, }}>
                                                        {isCritical && (
                                                            <AlertCircle size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                                                        )}
                                                        {conv.lining_level || '-'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '60px', color: 'hsl(var(--text-muted))' }}>
                                No converters found across consumers.
                            </div>
                        )}
                    </div>
                </div>
            )}
            {showModal && (
                <div className="premium-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
                    <div className="premium-modal" style={{ maxWidth: '500px' }} role="dialog" aria-modal="true" aria-labelledby="maintenance-modal-title">
                        <div className="premium-modal-header">
                            <h3 id="maintenance-modal-title">{editingSchedule ? 'Edit Maintenance Schedule' : 'Schedule Maintenance'}</h3>
                            <button onClick={() => setShowModal(false)} className="close-btn" aria-label="Close modal">×</button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="premium-modal-body">
                                <div className="form-group">
                                    <label className="premium-label">Node</label>
                                    <select className="premium-input" value={formData.node_id} onChange={(e) => setFormData({ ...formData, node_id: e.target.value })} required disabled={editingSchedule !== null}>
                                        <option value="">Select Node...</option>
                                        {nodes.map(node => (
                                            <option key={node.user_id} value={node.user_id}>
                                                {node.user_id} ({node.type})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div className="form-group">
                                        <label className="premium-label">Start Date</label>
                                        <input type="date" className="premium-input" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} required />
                                    </div>

                                    <div className="form-group">
                                        <label className="premium-label">End Date</label>
                                        <input type="date" className="premium-input" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} required />
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="premium-label">Reason</label>
                                    <input type="text" className="premium-input" placeholder="e.g., Annual Maintenance, Equipment Upgrade" value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} required />
                                </div>
                            </div>
                            <div className="premium-modal-footer">
                                <button type="button" className="premium-btn secondary" onClick={() => setShowModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="premium-btn primary">
                                    {editingSchedule ? 'Update Schedule' : 'Create Schedule'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MaintenanceScheduling;
