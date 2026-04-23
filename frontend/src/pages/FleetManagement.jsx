import { useState, useEffect, useMemo } from 'react'
import { Container, Truck, Wrench, CheckCircle2, Plus, Trash2, Edit2, Save, X, Database, ChevronDown, Search, Filter, BarChart3, RefreshCw, Eye, Clock, ArrowRight, Calendar, Activity, TrendingUp, Loader2 } from 'lucide-react'
import { useNotification } from '../context/NotificationContext'
import { api } from '../utils/api'
import { useTableSort } from '../hooks/useTableSort'

const FleetManagement = () => {
    const { showNotification } = useNotification()
    const [fleet, setFleet] = useState([])
    const [loading, setLoading] = useState(true)
    const [editingId, setEditingId] = useState(null)
    const [newId, setNewId] = useState('')
    const [newStatus, setNewStatus] = useState('Operating')
    const [newCapacity, setNewCapacity] = useState('')
    const [editValue, setEditValue] = useState('')
    const [editStatus, setEditStatus] = useState('')
    const [editCapacity, setEditCapacity] = useState('')
    const [searchTerm, setSearchTerm] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const [showDetailModal, setShowDetailModal] = useState(false)
    const [selectedTorpedo, setSelectedTorpedo] = useState(null)
    const [torpedoDetails, setTorpedoDetails] = useState(null)
    const [loadingDetails, setLoadingDetails] = useState(false)

    const [fleetStats, setFleetStats] = useState({
        total: 0,
        operating: 0,
        assigned: 0,
        maintenance: 0,
        utilization: 0,
        totalCapacity: 0,
        available: 0,
        assigned_torpedo_ids: []
    })

    const filteredFleet = useMemo(() => {
        return fleet.filter(item => {
            if (item.type !== 'torpedo') return false
            if (searchTerm && !item.fleet_id.toLowerCase().includes(searchTerm.toLowerCase())) return false
            
            const isInActiveTrip = fleetStats.assigned_torpedo_ids?.includes(item.fleet_id)
            const displayStatus = isInActiveTrip ? 'Assigned' : (item.status === 'Maintenance' ? 'Maintenance' : 'Operating')
            if (statusFilter !== 'all' && displayStatus !== statusFilter) return false
            return true
        })
    }, [fleet, searchTerm, statusFilter, fleetStats.assigned_torpedo_ids])

    const { items: sortedFleet, requestSort, sortConfig } = useTableSort(filteredFleet, { key: 'fleet_id', direction: 'asc' })

    const fetchFleetStats = async () => {
        try {
            const stats = await api.get('/api/fleet-management/stats')
            setFleetStats({
                total: stats.total || 0,
                operating: stats.operating || 0,
                assigned: stats.assigned || 0,
                maintenance: stats.maintenance || 0,
                utilization: stats.utilization || 0,
                totalCapacity: stats.total_capacity || 0,
                available: stats.available || 0,
                assigned_torpedo_ids: stats.assigned_torpedo_ids || []
            })
        } catch (err) {
            console.error('Failed to fetch fleet stats:', err)
        }
    }

    const fetchFleet = async (showRefresh = false) => {
        if (showRefresh) setIsRefreshing(true)
        try {
            const data = await api.get('/api/fleet-management')
            setFleet(data)
            
            await fetchFleetStats()
        } catch (err) {
            showNotification('error', `Failed to fetch fleet: ${err.message}`)
        } finally {
            setLoading(false)
            setIsRefreshing(false)
        }
    }

    useEffect(() => {
        fetchFleet()
        fetchFleetStats()
    }, [])

    const handleCreate = async () => {
        if (!newId.trim()) {
            showNotification('error', 'Asset ID is required')
            return
        }
        const capacityValue = parseFloat(newCapacity)
        if (newCapacity && (isNaN(capacityValue) || capacityValue < 0)) {
            showNotification('error', 'Capacity must be a positive number')
            return
        }
        setIsSubmitting(true)
        try {
            await api.post('/api/fleet-management', {
                fleet_id: newId,
                type: 'torpedo',
                status: newStatus,
                capacity: capacityValue || 0
            })
            setNewId('')
            setNewStatus('Operating')
            setNewCapacity('')
            showNotification('success', `Asset ${newId} registered successfully`)
            fetchFleet()
        } catch (err) {
            showNotification('error', `Registration failed: ${err.message}`)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleUpdate = async (id) => {
        const capacityValue = parseFloat(editCapacity)
        if (editCapacity && (isNaN(capacityValue) || capacityValue < 0)) {
            showNotification('error', 'Capacity must be a positive number')
            return
        }
        try {
            await api.put(`/api/fleet-management/${id}`, {
                fleet_id: editValue,
                type: 'torpedo',
                status: editStatus,
                capacity: capacityValue || 0
            })
            setEditingId(null)
            showNotification('success', 'Asset updated successfully')
            fetchFleet()
        } catch (err) {
            showNotification('error', `Update failed: ${err.message}`)
        }
    }

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to decommission this asset?")) return
        try {
            await api.delete(`/api/fleet-management/${id}`)
            showNotification('success', 'Asset decommissioned successfully')
            fetchFleet()
        } catch (err) {
            showNotification('error', `Decommission failed: ${err.message}`)
        }
    }

    const fetchTorpedoDetails = async (fleetId) => {
        setLoadingDetails(true)
        setShowDetailModal(true)
        try {
            const data = await api.get(`/api/fleet-management/${fleetId}/details`)
            setTorpedoDetails(data)
        } catch (err) {
            showNotification('error', `Failed to fetch torpedo details: ${err.message}`)
            setShowDetailModal(false)
        } finally {
            setLoadingDetails(false)
        }
    }

    const handleViewDetails = (item) => {
        setSelectedTorpedo(item)
        fetchTorpedoDetails(item.fleet_id)
    }

    const closeDetailModal = () => {
        setShowDetailModal(false)
        setSelectedTorpedo(null)
        setTorpedoDetails(null)
    }

    const formatDateTime = (isoString) => {
        if (!isoString) return '—'
        const date = new Date(isoString)
        return date.toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const formatDate = (isoString) => {
        if (!isoString) return '—'
        const date = new Date(isoString)
        return date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        })
    }

    const StatCard = ({ icon: Icon, label, value, subValue, color }) => (
        <div className="fleet-stat-card" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="stat-card-icon" style={{ background: `${color}15`, color }}>
                <Icon size={18} />
            </div>
            <div className="stat-card-content">
                <span className="stat-card-label">{label}</span>
                <div className="stat-card-value-row">
                    <span className="stat-card-value space-grotesk">{value}</span>
                    {subValue && <span className="stat-card-sub">{subValue}</span>}
                </div>
            </div>
        </div>
    )

    const UtilizationBar = ({ percentage }) => (
        <div className="utilization-bar-container">
            <div className="utilization-bar-track">
                <div
                    className="utilization-bar-fill"
                    style={{
                        width: `${percentage}%`,
                        background: percentage >= 80 ? 'hsl(var(--success))' : percentage >= 50 ? 'hsl(var(--warning))' : 'hsl(var(--danger))'
                    }}
                />
            </div>
            <span className="utilization-bar-text space-grotesk">{percentage}%</span>
        </div>
    )

    if (loading) {
        return (
            <div className="fleet-loading">
                <div className="loading-spinner" />
                <span>Loading fleet data...</span>
            </div>
        )
    }

    return (
        <div className="fleet-management-page">
            <div className="fleet-stats-grid">
                <StatCard
                    icon={Container}
                    label="Total Assets"
                    value={fleetStats.total}
                    subValue="torpedoes"
                    color="hsl(var(--accent))"
                />
                <StatCard
                    icon={CheckCircle2}
                    label="Operating"
                    value={fleetStats.operating}
                    subValue="available"
                    color="hsl(var(--success))"
                />
                <StatCard
                    icon={Truck}
                    label="Assigned"
                    value={fleetStats.assigned}
                    subValue="in transit"
                    color="hsl(var(--primary))"
                />
                <StatCard
                    icon={Wrench}
                    label="Maintenance"
                    value={fleetStats.maintenance}
                    subValue="under repair"
                    color="hsl(var(--warning))"
                />
                <div className="fleet-stat-card utilization-card" style={{ borderLeft: '3px solid hsl(var(--chart-purple))' }}>
                    <div className="stat-card-icon" style={{ background: 'hsl(var(--chart-purple) / 0.15)', color: 'hsl(var(--chart-purple))' }}>
                        <BarChart3 size={18} />
                    </div>
                    <div className="stat-card-content">
                        <span className="stat-card-label">Fleet Utilization</span>
                        <UtilizationBar percentage={fleetStats.utilization} />
                    </div>
                </div>
            </div>
            <div className="fleet-card registration-card">
                <div className="fleet-card-header">
                    <div className="card-header-title">
                        <Plus size={16} />
                        <span>Register New Asset</span>
                    </div>
                </div>
                <div className="fleet-card-body">
                    <div className="registration-form">
                        <div className="form-field flex-1">
                            <label>Torpedo ID</label>
                            <input className="fleet-input" placeholder="e.g. TLC-08" value={newId} onChange={(e) => setNewId(e.target.value)} />
                        </div>
                        <div className="form-field" style={{ width: '160px' }}>
                            <label>Status</label>
                            <select className="fleet-select" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                                <option value="Operating">Operating</option>
                                <option value="Maintenance">Maintenance</option>
                            </select>
                        </div>
                        <div className="form-field" style={{ width: '140px' }}>
                            <label>Capacity (t)</label>
                            <input type="number" min="0" step="0.1" className="fleet-input" placeholder="e.g. 360" value={newCapacity} onChange={(e) => setNewCapacity(e.target.value)} />
                        </div>
                        <button className="fleet-btn primary" onClick={handleCreate} disabled={isSubmitting}>
                            {isSubmitting ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={2.5} />}
                            <span>{isSubmitting ? 'Registering...' : 'Register Asset'}</span>
                        </button>
                    </div>
                </div>
            </div>
            <div className="fleet-card inventory-card">
                <div className="fleet-card-header">
                    <div className="card-header-title">
                        <Database size={16} />
                        <span>Fleet Inventory</span>
                        <span className="count-badge">{filteredFleet.length}</span>
                    </div>
                    <div className="card-header-actions">
                        <div className="search-box">
                            <Search size={14} aria-hidden="true" />
                            <input type="text" placeholder="Search by ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label="Search fleet by ID" />
                        </div>
                        <div className="filter-dropdown">
                            <Filter size={14} aria-hidden="true" />
                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
                                <option value="all">All Status</option>
                                <option value="Operating">Operating</option>
                                <option value="Assigned">Assigned</option>
                                <option value="Maintenance">Maintenance</option>
                            </select>
                        </div>
                        <button className="refresh-btn" onClick={() => fetchFleet(true)} disabled={isRefreshing} aria-label="Refresh fleet data" title="Refresh">
                            <RefreshCw size={14} className={isRefreshing ? 'spinning' : ''} aria-hidden="true" />
                        </button>
                    </div>
                </div>
                <div className="fleet-card-body">
                    <div className="fleet-table-container">
                        <table className="fleet-table">
                            <thead>
                                <tr>
                                    <th onClick={() => requestSort('fleet_id')} onKeyDown={(e) => e.key === 'Enter' && requestSort('fleet_id')} className={`sortable ${sortConfig.key === 'fleet_id' ? 'active' : ''}`} tabIndex={0} role="columnheader" aria-sort={sortConfig.key === 'fleet_id' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                        <span>Asset ID</span>
                                        <ChevronDown size={12} className={`sort-icon ${sortConfig.key === 'fleet_id' ? sortConfig.direction : ''}`} aria-hidden="true" />
                                    </th>
                                    <th onClick={() => requestSort('status')} onKeyDown={(e) => e.key === 'Enter' && requestSort('status')} className={`sortable ${sortConfig.key === 'status' ? 'active' : ''}`} tabIndex={0} role="columnheader" aria-sort={sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                        <span>Status</span>
                                        <ChevronDown size={12} className={`sort-icon ${sortConfig.key === 'status' ? sortConfig.direction : ''}`} aria-hidden="true" />
                                    </th>
                                    <th onClick={() => requestSort('capacity')} onKeyDown={(e) => e.key === 'Enter' && requestSort('capacity')} className={`sortable ${sortConfig.key === 'capacity' ? 'active' : ''}`} tabIndex={0} role="columnheader" aria-sort={sortConfig.key === 'capacity' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                        <span>Capacity</span>
                                        <ChevronDown size={12} className={`sort-icon ${sortConfig.key === 'capacity' ? sortConfig.direction : ''}`} aria-hidden="true" />
                                    </th>
                                    <th onClick={() => requestSort('created_at')} onKeyDown={(e) => e.key === 'Enter' && requestSort('created_at')} className={`sortable ${sortConfig.key === 'created_at' ? 'active' : ''}`} tabIndex={0} role="columnheader" aria-sort={sortConfig.key === 'created_at' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                        <span>Registered</span>
                                        <ChevronDown size={12} className={`sort-icon ${sortConfig.key === 'created_at' ? sortConfig.direction : ''}`} aria-hidden="true" />
                                    </th>
                                    <th className="actions-col">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedFleet.length > 0 ? (
                                    sortedFleet.map((item, index) => (
                                        <tr key={item.id} style={{ animationDelay: `${index * 30}ms` }}>
                                            <td>
                                                {editingId === item.id ? (
                                                    <input className="edit-input" value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                                                ) : (
                                                    <div className="asset-id-cell">
                                                        <div className="asset-icon">
                                                            <Truck size={16} />
                                                        </div>
                                                        <span className="asset-id space-grotesk">{item.fleet_id}</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td>
                                                {editingId === item.id ? (
                                                    <select className="edit-select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                                                        <option value="Operating">Operating</option>
                                                        <option value="Maintenance">Maintenance</option>
                                                    </select>
                                                ) : (() => {
                                                    
                                                    const isInActiveTrip = fleetStats.assigned_torpedo_ids?.includes(item.fleet_id)
                                                    const displayStatus = isInActiveTrip ? 'Assigned' : (item.status === 'Maintenance' ? 'Maintenance' : 'Operating')
                                                    const statusClass = displayStatus === 'Operating' ? 'operating' : displayStatus === 'Assigned' ? 'assigned' : 'maintenance'
                                                    return (
                                                        <div className={`status-badge ${statusClass}`}>
                                                            <div className="status-dot" />
                                                            <span>{displayStatus}</span>
                                                        </div>
                                                    )
                                                })()}
                                            </td>
                                            <td>
                                                {editingId === item.id ? (
                                                    <input type="number" className="edit-input capacity" value={editCapacity} onChange={(e) => setEditCapacity(e.target.value)} />
                                                ) : (
                                                    <span className="capacity-value space-grotesk">{item.capacity || 0} <small>t</small></span>
                                                )}
                                            </td>
                                            <td>
                                                <span className="date-value">
                                                    {new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </span>
                                            </td>
                                            <td className="actions-col">
                                                <div className="action-buttons">
                                                    {editingId === item.id ? (
                                                        <>
                                                            <button className="action-btn save" onClick={() => handleUpdate(item.id)} title="Save">
                                                                <Save size={14} />
                                                            </button>
                                                            <button className="action-btn cancel" onClick={() => setEditingId(null)} title="Cancel">
                                                                <X size={14} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button className="action-btn view" onClick={() => handleViewDetails(item)} title="View Details">
                                                                <Eye size={14} />
                                                            </button>
                                                            <button className="action-btn edit" onClick={() => {
                                                                setEditingId(item.id)
                                                                setEditValue(item.fleet_id)
                                                                setEditStatus(item.status || 'Operating')
                                                                setEditCapacity(item.capacity !== undefined && item.capacity !== null ? item.capacity : '')
                                                            }} title="Edit">
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button className="action-btn delete" onClick={() => handleDelete(item.id)} title="Decommission">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="5" className="empty-state">
                                            <Database size={40} />
                                            <span>No torpedo assets found</span>
                                            <small>{searchTerm || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Register your first asset above'}</small>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            {showDetailModal && (
                <div className="torpedo-detail-modal-overlay" onClick={closeDetailModal}>
                    <div className="torpedo-detail-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div className="modal-title">
                                <Truck size={24} />
                                <div>
                                    <h2>{selectedTorpedo?.fleet_id || 'Torpedo Details'}</h2>
                                    <span className="modal-subtitle">LIFECYCLE & TRIP HISTORY</span>
                                </div>
                            </div>
                            <button className="modal-close-btn" onClick={closeDetailModal}>
                                <X size={20} />
                            </button>
                        </div>

                        {loadingDetails ? (
                            <div className="modal-loading">
                                <Loader2 size={32} className="spinning" />
                                <span>Loading torpedo details...</span>
                            </div>
                        ) : torpedoDetails ? (
                            <div className="modal-content">
                                <div className="detail-section">
                                    <div className="detail-cards-grid">
                                        <div className="detail-stat-card">
                                            <div className="stat-icon" style={{ background: 'hsl(var(--success) / 0.1)', color: 'hsl(var(--success))' }}>
                                                <CheckCircle2 size={20} />
                                            </div>
                                            <div className="stat-info">
                                                <span className="stat-label">Status</span>
                                                <span className={`stat-value status-${torpedoDetails.torpedo.status?.toLowerCase()}`}>
                                                    {torpedoDetails.torpedo.status}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="detail-stat-card">
                                            <div className="stat-icon" style={{ background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))' }}>
                                                <Activity size={20} />
                                            </div>
                                            <div className="stat-info">
                                                <span className="stat-label">Total Trips</span>
                                                <span className="stat-value">{torpedoDetails.statistics.total_trips}</span>
                                            </div>
                                        </div>
                                        <div className="detail-stat-card">
                                            <div className="stat-icon" style={{ background: 'hsl(var(--accent) / 0.1)', color: 'hsl(var(--accent))' }}>
                                                <TrendingUp size={20} />
                                            </div>
                                            <div className="stat-info">
                                                <span className="stat-label">Completed</span>
                                                <span className="stat-value">{torpedoDetails.statistics.completed_trips}</span>
                                            </div>
                                        </div>
                                        <div className="detail-stat-card">
                                            <div className="stat-icon" style={{ background: 'hsl(var(--warning) / 0.1)', color: 'hsl(var(--warning))' }}>
                                                <Clock size={20} />
                                            </div>
                                            <div className="stat-info">
                                                <span className="stat-label">Avg Cycle Time</span>
                                                <span className="stat-value">{torpedoDetails.statistics.avg_cycle_time_minutes} min</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="torpedo-meta">
                                        <div className="meta-item">
                                            <Calendar size={14} />
                                            <span>Registered: {formatDate(torpedoDetails.torpedo.created_at)}</span>
                                        </div>
                                        <div className="meta-item">
                                            <Container size={14} />
                                            <span>Capacity: {torpedoDetails.torpedo.capacity || 0} t</span>
                                        </div>
                                        <div className="meta-item">
                                            <Clock size={14} />
                                            <span>Total Cycle Time: {torpedoDetails.statistics.total_cycle_time_minutes} min</span>
                                        </div>
                                    </div>
                                </div>
                                {torpedoDetails.current_trip && (
                                    <div className="detail-section">
                                        <h3 className="section-title">
                                            <Activity size={16} />
                                            Current Active Trip
                                        </h3>
                                        <div className="current-trip-card">
                                            <div className="trip-route">
                                                <span className="route-node producer">{torpedoDetails.current_trip.producer_id}</span>
                                                <ArrowRight size={16} />
                                                <span className="route-node consumer">{torpedoDetails.current_trip.consumer_id}</span>
                                            </div>
                                            <div className="trip-details">
                                                <div className="trip-detail-item">
                                                    <span className="label">Trip ID</span>
                                                    <span className="value">{torpedoDetails.current_trip.trip_id}</span>
                                                </div>
                                                <div className="trip-detail-item">
                                                    <span className="label">Status</span>
                                                    <span className="value status-badge">{torpedoDetails.current_trip.status_name}</span>
                                                </div>
                                                <div className="trip-detail-item">
                                                    <span className="label">Assigned At</span>
                                                    <span className="value">{formatDateTime(torpedoDetails.current_trip.assigned_at)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div className="detail-section">
                                    <h3 className="section-title">
                                        <Database size={16} />
                                        Recent Trip History ({torpedoDetails.recent_trips.length})
                                    </h3>
                                    {torpedoDetails.recent_trips.length > 0 ? (
                                        <div className="trip-history-table-container">
                                            <table className="trip-history-table">
                                                <thead>
                                                    <tr>
                                                        <th>Trip ID</th>
                                                        <th>Route</th>
                                                        <th>Cycle Time</th>
                                                        <th>Completed</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {torpedoDetails.recent_trips.map((trip, index) => (
                                                        <tr key={trip.trip_id} style={{ animationDelay: `${index * 30}ms` }}>
                                                            <td className="trip-id">{trip.trip_id}</td>
                                                            <td>
                                                                <div className="route-cell">
                                                                    <span className="producer">{trip.producer_id}</span>
                                                                    <ArrowRight size={12} />
                                                                    <span className="consumer">{trip.consumer_id}</span>
                                                                </div>
                                                            </td>
                                                            <td className="cycle-time">
                                                                {trip.cycle_time_minutes ? `${trip.cycle_time_minutes} min` : '—'}
                                                            </td>
                                                            <td className="date">{formatDateTime(trip.completed_at)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="no-history">
                                            <Database size={32} />
                                            <span>No completed trips yet</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="modal-error">
                                <span>Failed to load torpedo details</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                .fleet-management-page {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    padding: 20px 32px;
                    gap: 16px;
                    overflow-y: auto;
                    background: linear-gradient(135deg, hsl(var(--main-bg)) 0%, hsl(var(--main-bg) / 0.95) 100%);
                }

                /* Fleet Stats Grid */
                .fleet-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(5, 1fr);
                    gap: 16px;
                }

                .fleet-stat-card {
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 12px;
                    padding: 16px 20px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    transition: all 0.2s ease;
                }

                .fleet-stat-card:hover {
                    transform: translateY(-2px);
                    box-shadow: var(--shadow-md);
                }

                .stat-card-icon {
                    width: 44px;
                    height: 44px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .stat-card-content {
                    flex: 1;
                    min-width: 0;
                }

                .stat-card-label {
                    font-size: 0.7rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                }

                .stat-card-value-row {
                    display: flex;
                    align-items: baseline;
                    gap: 6px;
                    margin-top: 4px;
                }

                .stat-card-value {
                    font-size: 1.5rem;
                    font-weight: 800;
                    color: hsl(var(--text-main));
                }

                .stat-card-sub {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                }

                .utilization-bar-container {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-top: 8px;
                }

                .utilization-bar-track {
                    flex: 1;
                    height: 8px;
                    background: hsl(var(--border-color));
                    border-radius: 4px;
                    overflow: hidden;
                }

                .utilization-bar-fill {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 0.5s ease;
                }

                .utilization-bar-text {
                    font-size: 1.1rem;
                    font-weight: 800;
                    color: hsl(var(--text-main));
                    min-width: 45px;
                }

                /* Fleet Cards */
                .fleet-card {
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 12px;
                    overflow: hidden;
                }

                .fleet-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 14px 20px;
                    border-bottom: 1px solid hsl(var(--border-color) / 0.5);
                    background: hsl(var(--main-bg) / 0.3);
                }

                .card-header-title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: hsl(var(--text-main));
                }

                .card-header-title svg {
                    color: hsl(var(--accent));
                }

                .count-badge {
                    background: hsl(var(--accent) / 0.1);
                    color: hsl(var(--accent));
                    padding: 2px 8px;
                    border-radius: 10px;
                    font-size: 0.7rem;
                    font-weight: 800;
                }

                .card-header-actions {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .search-box {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 12px;
                    background: hsl(var(--main-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 8px;
                    transition: all 0.2s ease;
                }

                .search-box:focus-within {
                    border-color: hsl(var(--accent));
                    box-shadow: 0 0 0 3px hsl(var(--accent) / 0.1);
                }

                .search-box svg {
                    color: hsl(var(--text-muted));
                }

                .search-box input {
                    border: none;
                    background: transparent;
                    outline: none;
                    font-size: 0.8rem;
                    width: 140px;
                    color: hsl(var(--text-main));
                }

                .filter-dropdown {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 10px;
                    background: hsl(var(--main-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 8px;
                }

                .filter-dropdown svg {
                    color: hsl(var(--text-muted));
                }

                .filter-dropdown select {
                    border: none;
                    background: transparent;
                    outline: none;
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: hsl(var(--text-main));
                    cursor: pointer;
                }

                .refresh-btn {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: hsl(var(--main-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 8px;
                    cursor: pointer;
                    color: hsl(var(--text-muted));
                    transition: all 0.2s ease;
                }

                .refresh-btn:hover {
                    background: hsl(var(--accent) / 0.1);
                    color: hsl(var(--accent));
                    border-color: hsl(var(--accent));
                }

                .refresh-btn .spinning {
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                .fleet-card-body {
                    padding: 20px;
                }

                /* Registration Form */
                .registration-form {
                    display: flex;
                    gap: 14px;
                    align-items: flex-end;
                }

                .form-field {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .form-field.flex-1 {
                    flex: 1;
                }

                .form-field label {
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .fleet-input, .fleet-select {
                    height: 42px;
                    padding: 0 14px;
                    border: 1.5px solid hsl(var(--border-color));
                    border-radius: 8px;
                    font-size: 0.9rem;
                    font-weight: 600;
                    background: hsl(var(--card-bg));
                    color: hsl(var(--text-main));
                    transition: all 0.2s ease;
                }

                .fleet-input:focus, .fleet-select:focus {
                    outline: none;
                    border-color: hsl(var(--accent));
                    box-shadow: 0 0 0 3px hsl(var(--accent) / 0.1);
                }

                .fleet-btn {
                    height: 42px;
                    padding: 0 20px;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.8rem;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .fleet-btn.primary {
                    background: hsl(var(--primary));
                    color: white;
                }

                .fleet-btn.primary:hover {
                    background: hsl(var(--primary) / 0.9);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px hsl(var(--primary) / 0.3);
                }

                /* Fleet Table */
                .fleet-table-container {
                    overflow-x: auto;
                    border-radius: 8px;
                    border: 1px solid hsl(var(--border-color));
                }

                .fleet-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .fleet-table thead {
                    background: hsl(var(--main-bg));
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }

                .fleet-table th {
                    padding: 12px 16px;
                    text-align: left;
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    border-bottom: 1px solid hsl(var(--border-color));
                    white-space: nowrap;
                }

                .fleet-table th.sortable {
                    cursor: pointer;
                    user-select: none;
                    transition: color 0.2s ease;
                }

                .fleet-table th.sortable:hover {
                    color: hsl(var(--accent));
                }

                .fleet-table th.sortable.active {
                    color: hsl(var(--accent));
                }

                .fleet-table th span {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }

                .sort-icon {
                    opacity: 0.3;
                    transition: all 0.2s ease;
                }

                .fleet-table th.sortable.active .sort-icon {
                    opacity: 1;
                }

                .sort-icon.desc {
                    transform: rotate(0deg);
                }

                .sort-icon.asc {
                    transform: rotate(180deg);
                }

                .fleet-table th.actions-col {
                    text-align: right;
                    width: 100px;
                }

                .fleet-table td {
                    padding: 14px 16px;
                    border-bottom: 1px solid hsl(var(--border-color) / 0.5);
                    vertical-align: middle;
                }

                .fleet-table tbody tr {
                    animation: fadeInUp 0.3s ease forwards;
                    opacity: 0;
                    transition: background 0.15s ease;
                }

                .fleet-table tbody tr:hover {
                    background: hsl(var(--main-bg) / 0.5);
                }

                .asset-id-cell {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .asset-icon {
                    width: 36px;
                    height: 36px;
                    border-radius: 8px;
                    background: hsl(var(--accent) / 0.08);
                    color: hsl(var(--accent));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .asset-id {
                    font-size: 0.95rem;
                    font-weight: 800;
                    color: hsl(var(--text-main));
                }

                .status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 5px 12px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.02em;
                }

                .status-badge.operating {
                    background: hsl(var(--success) / 0.12);
                    color: hsl(var(--success));
                }

                .status-badge.maintenance {
                    background: hsl(var(--warning) / 0.12);
                    color: hsl(var(--warning));
                }

                .status-badge.assigned {
                    background: hsl(var(--primary) / 0.12);
                    color: hsl(var(--primary));
                }

                .status-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: currentColor;
                    box-shadow: 0 0 6px currentColor;
                }

                .capacity-value {
                    font-size: 0.95rem;
                    font-weight: 700;
                    color: hsl(var(--text-main));
                }

                .capacity-value small {
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                    margin-left: 2px;
                }

                .date-value {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                }

                .actions-col {
                    text-align: right;
                }

                .action-buttons {
                    display: flex;
                    gap: 8px;
                    justify-content: flex-end;
                }

                .action-btn {
                    width: 32px;
                    height: 32px;
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 6px;
                    background: hsl(var(--card-bg));
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: hsl(var(--text-muted));
                    transition: all 0.2s ease;
                }

                .action-btn:hover {
                    transform: translateY(-1px);
                }

                .action-btn.edit:hover {
                    background: hsl(var(--accent) / 0.1);
                    color: hsl(var(--accent));
                    border-color: hsl(var(--accent));
                }

                .action-btn.delete:hover {
                    background: hsl(var(--danger) / 0.1);
                    color: hsl(var(--danger));
                    border-color: hsl(var(--danger));
                }

                .action-btn.save:hover {
                    background: hsl(var(--success) / 0.1);
                    color: hsl(var(--success));
                    border-color: hsl(var(--success));
                }

                .action-btn.cancel:hover {
                    background: hsl(var(--text-muted) / 0.1);
                }

                .action-btn.view:hover {
                    background: hsl(var(--primary) / 0.1);
                    color: hsl(var(--primary));
                    border-color: hsl(var(--primary));
                }

                .edit-input, .edit-select {
                    height: 36px;
                    padding: 0 10px;
                    border: 1.5px solid hsl(var(--accent));
                    border-radius: 6px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    background: hsl(var(--card-bg));
                    color: hsl(var(--text-main));
                }

                .edit-input.capacity {
                    width: 80px;
                }

                .empty-state {
                    text-align: center;
                    padding: 60px 20px !important;
                    color: hsl(var(--text-muted));
                }

                .empty-state svg {
                    opacity: 0.2;
                    margin-bottom: 12px;
                }

                .empty-state span {
                    display: block;
                    font-size: 0.95rem;
                    font-weight: 700;
                    margin-bottom: 4px;
                }

                .empty-state small {
                    font-size: 0.8rem;
                    font-weight: 500;
                    opacity: 0.7;
                }

                /* Inventory Card */
                .inventory-card {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    min-height: 0;
                }

                .inventory-card .fleet-card-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: 0;
                }

                .inventory-card .fleet-table-container {
                    border: none;
                    border-radius: 0;
                }

                /* Loading State */
                .fleet-loading {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    gap: 16px;
                    color: hsl(var(--text-muted));
                }

                .loading-spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid hsl(var(--border-color));
                    border-top-color: hsl(var(--accent));
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                /* Responsive */
                @media (max-width: 1400px) {
                    .fleet-stats-grid {
                        grid-template-columns: repeat(3, 1fr);
                    }
                }

                @media (max-width: 1100px) {
                    .fleet-stats-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }
                }

                @media (max-width: 768px) {
                    .fleet-management-page {
                        padding: 16px;
                    }

                    .fleet-stats-grid {
                        grid-template-columns: 1fr;
                    }

                    .registration-form {
                        flex-wrap: wrap;
                    }

                    .form-field {
                        width: 100% !important;
                        flex: none !important;
                    }

                    .fleet-btn {
                        width: 100%;
                        justify-content: center;
                    }

                    .card-header-actions {
                        flex-wrap: wrap;
                    }

                    .search-box input {
                        width: 100px;
                    }
                }

                /* Torpedo Detail Modal */
                .torpedo-detail-modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    padding: 20px;
                    animation: fadeIn 0.2s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .torpedo-detail-modal {
                    background: hsl(var(--card-bg));
                    border-radius: 16px;
                    width: 100%;
                    max-width: 800px;
                    max-height: 90vh;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                    animation: slideUp 0.3s ease;
                }

                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }

                .modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 20px 24px;
                    border-bottom: 1px solid hsl(var(--border-color));
                    background: linear-gradient(135deg, hsl(var(--primary) / 0.05) 0%, transparent 100%);
                }

                .modal-title {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                }

                .modal-title svg {
                    color: hsl(var(--primary));
                }

                .modal-title h2 {
                    margin: 0;
                    font-size: 1.25rem;
                    font-weight: 800;
                    letter-spacing: -0.02em;
                }

                .modal-subtitle {
                    display: block;
                    font-size: 0.7rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    letter-spacing: 0.1em;
                    margin-top: 2px;
                }

                .modal-close-btn {
                    width: 36px;
                    height: 36px;
                    border-radius: 10px;
                    border: 1px solid hsl(var(--border-color));
                    background: transparent;
                    color: hsl(var(--text-muted));
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }

                .modal-close-btn:hover {
                    background: hsl(var(--danger) / 0.1);
                    color: hsl(var(--danger));
                    border-color: hsl(var(--danger));
                }

                .modal-content {
                    padding: 24px;
                    overflow-y: auto;
                    flex: 1;
                }

                .modal-loading, .modal-error {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 60px;
                    gap: 16px;
                    color: hsl(var(--text-muted));
                }

                .modal-loading .spinning {
                    animation: spin 1s linear infinite;
                }

                .detail-section {
                    margin-bottom: 24px;
                }

                .section-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.85rem;
                    font-weight: 800;
                    color: hsl(var(--text-main));
                    margin: 0 0 16px 0;
                    letter-spacing: 0.02em;
                }

                .section-title svg {
                    color: hsl(var(--primary));
                }

                .detail-cards-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 12px;
                    margin-bottom: 16px;
                }

                .detail-stat-card {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 16px;
                    background: hsl(var(--main-bg));
                    border-radius: 12px;
                    border: 1px solid hsl(var(--border-color));
                }

                .stat-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .stat-info {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .stat-label {
                    font-size: 0.7rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .stat-value {
                    font-size: 1.1rem;
                    font-weight: 800;
                    color: hsl(var(--text-main));
                }

                .stat-value.status-operating { color: hsl(var(--success)); }
                .stat-value.status-assigned { color: hsl(var(--primary)); }
                .stat-value.status-maintenance { color: hsl(var(--warning)); }

                .torpedo-meta {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 16px;
                }

                .meta-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.8rem;
                    color: hsl(var(--text-muted));
                }

                .meta-item svg {
                    opacity: 0.6;
                }

                .current-trip-card {
                    padding: 20px;
                    background: linear-gradient(135deg, hsl(var(--primary) / 0.08) 0%, hsl(var(--primary) / 0.02) 100%);
                    border: 1px solid hsl(var(--primary) / 0.2);
                    border-radius: 12px;
                }

                .trip-route {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    margin-bottom: 16px;
                }

                .route-node {
                    padding: 8px 16px;
                    border-radius: 8px;
                    font-weight: 800;
                    font-size: 0.85rem;
                }

                .route-node.producer {
                    background: hsl(var(--warning) / 0.15);
                    color: hsl(var(--warning));
                }

                .route-node.consumer {
                    background: hsl(var(--accent) / 0.15);
                    color: hsl(var(--accent));
                }

                .trip-route svg {
                    color: hsl(var(--text-muted));
                }

                .trip-details {
                    display: flex;
                    gap: 24px;
                    flex-wrap: wrap;
                }

                .trip-detail-item {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .trip-detail-item .label {
                    font-size: 0.7rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .trip-detail-item .value {
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: hsl(var(--text-main));
                }

                .trip-detail-item .value.status-badge {
                    display: inline-block;
                    padding: 4px 10px;
                    background: hsl(var(--primary) / 0.1);
                    color: hsl(var(--primary));
                    border-radius: 6px;
                    font-size: 0.75rem;
                    font-weight: 800;
                }

                .trip-history-table-container {
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 12px;
                    overflow: hidden;
                    max-height: 300px;
                    overflow-y: auto;
                }

                .trip-history-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.85rem;
                }

                .trip-history-table th {
                    background: hsl(var(--main-bg));
                    padding: 12px 16px;
                    text-align: left;
                    font-weight: 800;
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: hsl(var(--text-muted));
                    position: sticky;
                    top: 0;
                    z-index: 1;
                }

                .trip-history-table td {
                    padding: 12px 16px;
                    border-top: 1px solid hsl(var(--border-color));
                }

                .trip-history-table tbody tr {
                    transition: background 0.15s;
                    animation: fadeInRow 0.3s ease forwards;
                    opacity: 0;
                }

                @keyframes fadeInRow {
                    to { opacity: 1; }
                }

                .trip-history-table tbody tr:hover {
                    background: hsl(var(--main-bg));
                }

                .trip-history-table .trip-id {
                    font-weight: 700;
                    color: hsl(var(--primary));
                }

                .route-cell {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-weight: 600;
                }

                .route-cell .producer {
                    color: hsl(var(--warning));
                }

                .route-cell .consumer {
                    color: hsl(var(--accent));
                }

                .route-cell svg {
                    color: hsl(var(--text-muted));
                    opacity: 0.5;
                }

                .trip-history-table .cycle-time {
                    font-weight: 700;
                    font-variant-numeric: tabular-nums;
                }

                .trip-history-table .date {
                    color: hsl(var(--text-muted));
                    font-size: 0.8rem;
                }

                .no-history {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 40px;
                    gap: 12px;
                    color: hsl(var(--text-muted));
                    background: hsl(var(--main-bg));
                    border-radius: 12px;
                    border: 1px dashed hsl(var(--border-color));
                }

                .no-history svg {
                    opacity: 0.3;
                }

                @media (max-width: 768px) {
                    .detail-cards-grid {
                        grid-template-columns: repeat(2, 1fr);
                    }

                    .torpedo-detail-modal {
                        max-height: 95vh;
                    }

                    .modal-content {
                        padding: 16px;
                    }

                    .trip-details {
                        gap: 12px;
                    }
                }
            `}</style>
        </div>
    )
}

export default FleetManagement
