import { useState, useEffect } from 'react'
import { Activity, Database, LogIn, LogOut, Truck, ClipboardCheck, AlertTriangle, Settings, RefreshCw, Eye, Layers, FileText, Package, MapPin, Users, Edit3, Trash2, Plus, Search, ChevronLeft, ChevronRight, User, Shield, Download, Calendar, ChevronDown, ChevronUp, Clock, Hash, Globe, ArrowRight, Mail, Loader2 } from 'lucide-react'
import { api, BASE_URL } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'
import { useHeader } from '../context/HeaderContext'
import { useTableSort } from '../hooks/useTableSort'
import ActivitySummaryCards from '../components/ActivitySummaryCards'

const ActivityMonitoring = () => {
    const { user: currentUser } = useAuth()
    const { showNotification } = useNotification()
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)
    const [pageSize] = useState(20)
    const [total, setTotal] = useState(0)
    const [expandedRow, setExpandedRow] = useState(null)

    const [usernameFilter, setUsernameFilter] = useState('')
    const [actionFilter, setActionFilter] = useState('')
    const [entityTypeFilter, setEntityTypeFilter] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')

    const [entityTypes, setEntityTypes] = useState([])

    const { items: sortedLogs, requestSort, sortConfig } = useTableSort(logs, { key: 'timestamp', direction: 'desc' })

    const fetchEntityTypes = async () => {
        try {
            const data = await api.get('/api/activity-logs/entity-types')
            setEntityTypes(data.entity_types || [])
        } catch (err) {
            console.error("Failed to fetch entity types:", err)
            showNotification('error', 'Failed to load filter options. Using defaults.')
            setEntityTypes(['trip', 'plan', 'config', 'user', 'fleet', 'location'])
        }
    }

    const fetchLogs = async () => {
        setLoading(true)
        try {
            const data = await api.get('/api/activity-logs', {
                page,
                page_size: pageSize,
                username: usernameFilter || undefined,
                action: actionFilter || undefined,
                entity_type: entityTypeFilter || undefined,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined
            })
            setLogs(data.logs)
            setTotal(data.total)
        } catch (err) {
            console.error("Failed to fetch activity logs:", err)
            showNotification('error', err.message || 'Failed to load activity logs')
            setLogs([])
            setTotal(0)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchEntityTypes()
    }, [])

    useEffect(() => {
        fetchLogs()
        const interval = setInterval(fetchLogs, 15000)
        return () => clearInterval(interval)
    }, [page, actionFilter, entityTypeFilter, dateFrom, dateTo])

    const { setHeaderContent } = useHeader()

    useEffect(() => {
        setHeaderContent({
            right: (
                <div className="header-live-badge">
                    <span className="live-pulse"></span>
                    <span className="live-label">LIVE</span>
                </div>
            ),
            forceLeftTitle: true
        })

        return () => setHeaderContent({ left: null, center: null, right: null, forceLeftTitle: false })
    }, [setHeaderContent])

    const handleSearch = (e) => {
        if (e.key === 'Enter') {
            setPage(1)
            fetchLogs()
        }
    }

    const totalPages = Math.ceil(total / pageSize)

    const getActionConfig = (action) => {
        const configs = {
            'USER_LOGIN': { icon: LogIn, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', label: 'Login' },
            'USER_LOGOUT': { icon: LogOut, color: '#6366f1', bg: 'rgba(99, 102, 241, 0.1)', label: 'Logout' },
            'TRIP_GENERATED': { icon: Truck, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', label: 'Trip Generated' },
            'TRIP_STATUS_UPDATED': { icon: RefreshCw, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', label: 'Status Update' },
            'DAILY_PLAN_COMMITTED': { icon: ClipboardCheck, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', label: 'Plan Committed' },
            'DISTRIBUTION_PLAN_COMMITTED': { icon: Layers, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', label: 'Distribution Committed' },
            'BREAKDOWN_INTERVENTION': { icon: AlertTriangle, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'Breakdown' },
            'FLEET_ASSET_REGISTERED': { icon: Database, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)', label: 'Asset Registered' },
            'NOTIFICATION_READ': { icon: Eye, color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)', label: 'Notification Read' },
            'SETTINGS_UPDATED': { icon: Settings, color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)', label: 'Settings' },
            'CREATE': { icon: Plus, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', label: 'Created' },
            'UPDATE': { icon: Edit3, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', label: 'Updated' },
            'DELETE': { icon: Trash2, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'Deleted' },
        }

        for (const [key, config] of Object.entries(configs)) {
            if (action?.includes(key)) return config
        }

        return { icon: Activity, color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)', label: action?.replace(/_/g, ' ') || 'Unknown' }
    }

    const getEntityIcon = (entityType) => {
        const icons = {
            'trip': Truck,
            'plan': ClipboardCheck,
            'config': Settings,
            'user': Users,
            'fleet': Package,
            'location': MapPin,
            'report': FileText
        }
        return icons[entityType] || Database
    }

    const clearFilters = () => {
        setUsernameFilter('')
        setActionFilter('')
        setEntityTypeFilter('')
        setDateFrom('')
        setDateTo('')
        setPage(1)
    }

    const hasActiveFilters = usernameFilter || actionFilter || entityTypeFilter || dateFrom || dateTo

    const [sendingEmail, setSendingEmail] = useState(false)
    const [showEmailDialog, setShowEmailDialog] = useState(false)
    const [emailAddress, setEmailAddress] = useState('')

    const handleExport = () => {
        const params = new URLSearchParams();
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        if (entityTypeFilter) params.append('entity_type', entityTypeFilter);
        window.open(`${BASE_URL}/api/activity-logs/export?${params.toString()}`, '_blank');
    }

    const openEmailDialog = () => {
        setEmailAddress(currentUser?.email || '')
        setShowEmailDialog(true)
    }

    const handleEmailLogs = async () => {
        const targetEmail = emailAddress.trim() || currentUser?.email
        if (!targetEmail || !targetEmail.includes('@')) {
            showNotification('error', 'Please enter a valid email address')
            return
        }

        setSendingEmail(true)
        try {
            const response = await api.post('/api/activity-logs/email', {
                email: targetEmail,
                username: usernameFilter || null,
                action: actionFilter || null,
                entity_type: entityTypeFilter || null,
                date_from: dateFrom || null,
                date_to: dateTo || null
            })

            if (response.status === 'success') {
                showNotification('success', `Activity logs sent to ${targetEmail}`)
                setShowEmailDialog(false)
            } else {
                throw new Error(response.message || 'Failed to send email')
            }
        } catch (err) {
            console.error('Email Error:', err)
            showNotification('error', 'Failed to send email')
        } finally {
            setSendingEmail(false)
        }
    }

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return 'neutral';
        return sortConfig.direction;
    }

    const toggleRowExpand = (logId) => {
        setExpandedRow(expandedRow === logId ? null : logId)
    }

    const parseJsonValue = (value) => {
        if (!value) return null
        try {
            return JSON.parse(value)
        } catch {
            return value
        }
    }

    const renderChanges = (log) => {
        const oldVal = parseJsonValue(log.old_value)
        const newVal = parseJsonValue(log.new_value)

        if (!oldVal && !newVal) {
            return (
                <div className="no-changes">
                    <span>No detailed changes recorded for this action</span>
                </div>
            )
        }

        const allKeys = new Set([
            ...(oldVal && typeof oldVal === 'object' ? Object.keys(oldVal) : []),
            ...(newVal && typeof newVal === 'object' ? Object.keys(newVal) : [])
        ])

        if (allKeys.size === 0) {
            return (
                <div className="changes-simple">
                    {oldVal && <div className="old-value"><strong>Previous:</strong> {String(oldVal)}</div>}
                    {newVal && <div className="new-value"><strong>New:</strong> {String(newVal)}</div>}
                </div>
            )
        }

        return (
            <div className="changes-table-wrapper">
                <table className="changes-table">
                    <thead>
                        <tr>
                            <th>Field</th>
                            <th>Previous Value</th>
                            <th></th>
                            <th>New Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from(allKeys).map(key => {
                            const oldValue = oldVal?.[key]
                            const newValue = newVal?.[key]
                            const hasChanged = JSON.stringify(oldValue) !== JSON.stringify(newValue)

                            return (
                                <tr key={key} className={hasChanged ? 'changed' : ''}>
                                    <td className="field-name">{key}</td>
                                    <td className="old-cell">{oldValue !== undefined ? String(oldValue) : '-'}</td>
                                    <td className="arrow-cell">{hasChanged && <ArrowRight size={14} />}</td>
                                    <td className="new-cell">{newValue !== undefined ? String(newValue) : '-'}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        )
    }

    return (
        <div className="activity-page">
            <section className="stats-section">
                <ActivitySummaryCards />
            </section>
            <section className="audit-section">
                <div className="audit-card">
                    <div className="audit-toolbar">
                        <div className="toolbar-left">
                            <div className="header-icon">
                                <Shield size={16} />
                            </div>
                            <span className="toolbar-title">Audit Trail</span>
                            <span className="event-count">{total.toLocaleString()}</span>
                        </div>

                        <div className="toolbar-filters">
                            <div className="search-box">
                                <Search size={13} aria-hidden="true" />
                                <input type="text" placeholder="Search users..." value={usernameFilter} onChange={(e) => setUsernameFilter(e.target.value)} onKeyDown={handleSearch} aria-label="Search by username" />
                            </div>

                            <div className="date-range-group" role="group" aria-label="Date range filter">
                                <div className="date-input-wrapper">
                                    <Calendar size={13} aria-hidden="true" />
                                    <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} aria-label="Filter from date" />
                                </div>
                                <span className="date-sep" aria-hidden="true">→</span>
                                <div className="date-input-wrapper">
                                    <Calendar size={13} aria-hidden="true" />
                                    <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} aria-label="Filter to date" />
                                </div>
                            </div>

                            <select className="filter-select" value={entityTypeFilter} onChange={(e) => { setEntityTypeFilter(e.target.value); setPage(1); }} aria-label="Filter by entity type">
                                <option value="">All Entities</option>
                                {entityTypes.map(et => (
                                    <option key={et} value={et}>{et.charAt(0).toUpperCase() + et.slice(1)}s</option>
                                ))}
                            </select>

                            <select className="filter-select" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} aria-label="Filter by action type">
                                <option value="">All Actions</option>
                                <option value="USER_LOGIN">User Logins</option>
                                <option value="USER_LOGOUT">User Logouts</option>
                                <option value="TRIP">Trip Events</option>
                                <option value="PLAN">Plan Events</option>
                                <option value="CREATE">Creates</option>
                                <option value="UPDATE">Updates</option>
                                <option value="DELETE">Deletes</option>
                            </select>
                        </div>

                        <div className="toolbar-actions">
                            {hasActiveFilters && (
                                <button onClick={clearFilters} className="clear-btn" aria-label="Clear all filters">
                                    <RefreshCw size={13} aria-hidden="true" />
                                </button>
                            )}
                            <button onClick={fetchLogs} className="refresh-btn" title="Refresh" aria-label="Refresh logs">
                                <RefreshCw size={13} className={loading ? 'spinning' : ''} aria-hidden="true" />
                            </button>
                            <button onClick={handleExport} className="export-btn" title="Export">
                                <Download size={13} />
                            </button>
                            <button onClick={openEmailDialog} className="email-btn" title="Email">
                                <Mail size={13} />
                            </button>
                        </div>
                    </div>
                    <div className="audit-table-wrapper">
                        <table className="audit-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}></th>
                                    <th onClick={() => requestSort('timestamp')} onKeyDown={(e) => e.key === 'Enter' && requestSort('timestamp')} className="sortable-col" tabIndex={0} role="columnheader" aria-sort={sortConfig.key === 'timestamp' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                        <div className="th-content">
                                            <Clock size={14} aria-hidden="true" />
                                            <span>Timestamp</span>
                                            <ChevronDown size={14} className={`sort-indicator ${getSortIcon('timestamp')}`} aria-hidden="true" />
                                        </div>
                                    </th>
                                    <th onClick={() => requestSort('username')} onKeyDown={(e) => e.key === 'Enter' && requestSort('username')} className="sortable-col" tabIndex={0} role="columnheader" aria-sort={sortConfig.key === 'username' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                        <div className="th-content">
                                            <User size={14} aria-hidden="true" />
                                            <span>User</span>
                                            <ChevronDown size={14} className={`sort-indicator ${getSortIcon('username')}`} aria-hidden="true" />
                                        </div>
                                    </th>
                                    <th onClick={() => requestSort('action')} onKeyDown={(e) => e.key === 'Enter' && requestSort('action')} className="sortable-col" tabIndex={0} role="columnheader" aria-sort={sortConfig.key === 'action' ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                                        <div className="th-content">
                                            <Activity size={14} aria-hidden="true" />
                                            <span>Action</span>
                                            <ChevronDown size={14} className={`sort-indicator ${getSortIcon('action')}`} aria-hidden="true" />
                                        </div>
                                    </th>
                                    <th>
                                        <div className="th-content">
                                            <Database size={14} />
                                            <span>Entity</span>
                                        </div>
                                    </th>
                                    <th>
                                        <div className="th-content">
                                            <Hash size={14} />
                                            <span>Details</span>
                                        </div>
                                    </th>
                                    <th>
                                        <div className="th-content">
                                            <Globe size={14} />
                                            <span>IP Address</span>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="7" className="state-cell">
                                            <div className="loading-state">
                                                <div className="loader"></div>
                                                <span>Loading audit trail...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : sortedLogs.length > 0 ? (
                                    sortedLogs.map((log, idx) => {
                                        const actionConfig = getActionConfig(log.action)
                                        const ActionIcon = actionConfig.icon
                                        const EntityIcon = getEntityIcon(log.entity_type)
                                        const isExpanded = expandedRow === log.id
                                        const hasChanges = log.old_value || log.new_value

                                        return (
                                            <>
                                                <tr key={log.id} style={{ '--row-delay': `${idx * 25}ms` }} className={`${isExpanded ? 'expanded' : ''} ${hasChanges ? 'has-changes' : ''}`} onClick={() => hasChanges && toggleRowExpand(log.id)}>
                                                    <td className="expand-col">
                                                        {hasChanges && (
                                                            <button className="expand-btn">
                                                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                            </button>
                                                        )}
                                                    </td>
                                                    <td className="timestamp-col">
                                                        <div className="date-text">
                                                            {new Date(log.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </div>
                                                        <div className="time-text">
                                                            {new Date(log.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                        </div>
                                                    </td>
                                                    <td className="user-col">
                                                        <div className="user-badge">
                                                            <div className="avatar">
                                                                {log.username?.charAt(0).toUpperCase() || '?'}
                                                            </div>
                                                            <div className="user-info">
                                                                <span className="username">{log.username}</span>
                                                                {log.user_role && (
                                                                    <span className="user-role">{log.user_role}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="action-col">
                                                        <div className="action-tag" style={{ background: actionConfig.bg, color: actionConfig.color, borderColor: `${actionConfig.color}30` }}>
                                                            <ActionIcon size={14} />
                                                            <span>{actionConfig.label}</span>
                                                        </div>
                                                    </td>
                                                    <td className="entity-col">
                                                        {log.entity_type && (
                                                            <div className="entity-badge">
                                                                <EntityIcon size={12} />
                                                                <span>{log.entity_type}</span>
                                                                {log.entity_id && (
                                                                    <code className="entity-id">{log.entity_id}</code>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="details-col">
                                                        <span className="details-text" title={log.details}>{log.details}</span>
                                                    </td>
                                                    <td className="ip-col">
                                                        <code className="ip-badge">{log.ip_address || '127.0.0.1'}</code>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr className="expanded-row">
                                                        <td colSpan="7">
                                                            <div className="changes-panel">
                                                                <div className="changes-header">
                                                                    <Edit3 size={14} />
                                                                    <span>Change Details</span>
                                                                </div>
                                                                {renderChanges(log)}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        )
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="7" className="state-cell">
                                            <div className="empty-state">
                                                <Database size={40} />
                                                <h3>No Events Found</h3>
                                                <p>No audit logs match your current filters</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="audit-pagination">
                        <div className="pagination-info">
                            Showing <strong>{((page - 1) * pageSize) + 1}</strong> to <strong>{Math.min(page * pageSize, total)}</strong> of <strong>{total.toLocaleString()}</strong> events
                        </div>
                        <div className="pagination-nav">
                            <button className="page-btn" disabled={page === 1} onClick={() => setPage(1)}>
                                First
                            </button>
                            <button className="page-btn" disabled={page === 1} onClick={() => setPage(prev => Math.max(1, prev - 1))}>
                                <ChevronLeft size={16} />
                            </button>
                            <div className="page-numbers">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                    let pageNum
                                    if (totalPages <= 5) {
                                        pageNum = i + 1
                                    } else if (page <= 3) {
                                        pageNum = i + 1
                                    } else if (page >= totalPages - 2) {
                                        pageNum = totalPages - 4 + i
                                    } else {
                                        pageNum = page - 2 + i
                                    }
                                    return (
                                        <button key={pageNum} className={`page-num ${page === pageNum ? 'active' : ''}`} onClick={() => setPage(pageNum)}>
                                            {pageNum}
                                        </button>
                                    )
                                })}
                            </div>
                            <button className="page-btn" disabled={page === totalPages || totalPages === 0} onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}>
                                <ChevronRight size={16} />
                            </button>
                            <button className="page-btn" disabled={page === totalPages || totalPages === 0} onClick={() => setPage(totalPages)}>
                                Last
                            </button>
                        </div>
                    </div>
                </div>
            </section>
            {showEmailDialog && (
                <div className="email-modal-overlay" onClick={() => setShowEmailDialog(false)}>
                    <div className="email-modal" onClick={e => e.stopPropagation()}>
                        <div className="email-modal-header">
                            <Mail size={20} />
                            <h3>Email Activity Logs</h3>
                        </div>
                        <div className="email-modal-body">
                            <label>Email Address</label>
                            <input type="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="Enter email address" autoFocus />
                            <p className="email-hint">
                                Activity logs will be sent as a detailed HTML report with statistics and breakdown.
                            </p>
                        </div>
                        <div className="email-modal-footer">
                            <button className="cancel-btn" onClick={() => setShowEmailDialog(false)}>
                                Cancel
                            </button>
                            <button className="send-btn" onClick={handleEmailLogs} disabled={sendingEmail}>
                                {sendingEmail ? <Loader2 size={14} className="spinning" /> : <Mail size={14} />}
                                {sendingEmail ? 'Sending...' : 'Send Email'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                /* ═══════ PAGE LAYOUT — flex chain must be unbroken ═══════ */
                .activity-page {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    padding: 16px;
                    gap: 16px;
                    overflow: hidden;  /* page does NOT scroll — table scrolls */
                    background: hsl(var(--bg-secondary));
                }

                /* Header Live Badge */
                .header-live-badge {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: rgba(16, 185, 129, 0.1);
                    padding: 6px 14px;
                    border-radius: 20px;
                    border: 1px solid rgba(16, 185, 129, 0.2);
                }

                .live-pulse {
                    width: 8px;
                    height: 8px;
                    background: #10b981;
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                }

                .live-label {
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: #10b981;
                    letter-spacing: 0.1em;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(1.2); }
                }

                /* Stats Section — fixed height, never grows */
                .stats-section {
                    flex-shrink: 0;
                }

                /* Audit Section — takes ALL remaining space */
                .audit-section {
                    flex: 1;
                    min-height: 0;    /* critical: allows flex child to shrink below content height */
                    display: flex;
                    flex-direction: column;
                }

                .audit-card {
                    flex: 1;
                    min-height: 0;    /* critical: propagate constraint down */
                    background: hsl(var(--card-bg, var(--bg-primary)));
                    border: 1px solid hsl(var(--border-subtle));
                    border-radius: 14px;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    box-shadow: 0 2px 12px -4px rgba(0, 0, 0, 0.08);
                }

                /* ═══════ SINGLE TOOLBAR — Title + Filters + Actions ═══════ */
                .audit-toolbar {
                    padding: 8px 16px;
                    border-bottom: 1px solid hsl(var(--border-subtle));
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex-shrink: 0;
                    background: hsl(var(--bg-secondary) / 0.3);
                }

                .toolbar-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0;
                }

                .header-icon {
                    width: 30px;
                    height: 30px;
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    flex-shrink: 0;
                }

                .toolbar-title {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: hsl(var(--text-primary));
                    white-space: nowrap;
                }

                .event-count {
                    font-size: 0.65rem;
                    color: hsl(var(--text-muted));
                    font-weight: 600;
                    background: hsl(var(--bg-primary));
                    border: 1px solid hsl(var(--border-subtle));
                    padding: 2px 7px;
                    border-radius: 10px;
                    white-space: nowrap;
                }

                .toolbar-filters {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex: 1;
                    min-width: 0;
                    justify-content: center;
                }

                .toolbar-actions {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    flex-shrink: 0;
                }

                .search-box {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: hsl(var(--bg-primary));
                    border: 1px solid hsl(var(--border-subtle));
                    border-radius: 7px;
                    padding: 0 10px;
                    height: 30px;
                    width: 150px;
                    transition: all 0.2s ease;
                }

                .search-box:focus-within {
                    border-color: #6366f1;
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
                }

                .search-box svg {
                    color: #6366f1;
                    flex-shrink: 0;
                }

                .search-box input {
                    background: transparent;
                    border: none;
                    outline: none;
                    color: hsl(var(--text-primary));
                    font-size: 0.75rem;
                    width: 100%;
                    font-weight: 500;
                }

                .search-box input::placeholder {
                    color: hsl(var(--text-muted));
                }

                .date-range-group {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    background: hsl(var(--bg-primary));
                    border: 1px solid hsl(var(--border-subtle));
                    border-radius: 7px;
                    padding: 3px 10px;
                }

                .date-input-wrapper {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }

                .date-input-wrapper svg {
                    color: #6366f1;
                    flex-shrink: 0;
                }

                .date-input-wrapper input[type="date"] {
                    border: none;
                    background: transparent;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: hsl(var(--text-primary));
                    cursor: pointer;
                    outline: none;
                    width: 105px;
                    padding: 3px 0;
                }

                .date-input-wrapper input[type="date"]::-webkit-calendar-picker-indicator {
                    opacity: 0;
                    position: absolute;
                    right: 0;
                    width: 100%;
                    height: 100%;
                    cursor: pointer;
                }

                .date-input-wrapper input[type="date"]::-webkit-datetime-edit {
                    padding: 0;
                }

                .date-input-wrapper input[type="date"]::-webkit-datetime-edit-fields-wrapper {
                    padding: 0;
                }

                .date-sep {
                    color: hsl(var(--border-default));
                    font-size: 0.85rem;
                    font-weight: 300;
                }

                .filter-select {
                    appearance: none;
                    background: hsl(var(--bg-primary));
                    border: 1px solid hsl(var(--border-subtle));
                    border-radius: 7px;
                    padding: 0 28px 0 10px;
                    height: 30px;
                    font-size: 0.72rem;
                    font-weight: 600;
                    color: hsl(var(--text-primary));
                    cursor: pointer;
                    outline: none;
                    transition: all 0.2s ease;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236366f1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 8px center;
                    min-width: 100px;
                }

                .filter-select:hover {
                    border-color: #6366f1;
                }

                .filter-select:focus {
                    border-color: #6366f1;
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
                }

                .filter-select option {
                    background: hsl(var(--bg-primary));
                    color: hsl(var(--text-primary));
                    font-weight: 500;
                }

                /* ═══════ ACTION BUTTONS (icon-only, compact) ═══════ */
                .toolbar-actions button {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 30px;
                    height: 30px;
                    border-radius: 7px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    padding: 0;
                }

                .clear-btn {
                    background: rgba(239, 68, 68, 0.08);
                    color: #ef4444;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                }

                .clear-btn:hover {
                    background: rgba(239, 68, 68, 0.15);
                }

                .refresh-btn {
                    background: hsl(var(--bg-primary));
                    border: 1px solid hsl(var(--border-subtle));
                    color: hsl(var(--text-secondary));
                }

                .refresh-btn:hover {
                    color: #6366f1;
                    border-color: #6366f1;
                }

                .refresh-btn .spinning {
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    to { transform: rotate(360deg); }
                }

                .export-btn {
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                    color: white;
                    border: none;
                    box-shadow: 0 2px 6px -2px rgba(99, 102, 241, 0.4);
                }

                .export-btn:hover {
                    box-shadow: 0 3px 10px -2px rgba(99, 102, 241, 0.5);
                }

                .email-btn {
                    background: hsl(var(--bg-primary));
                    color: hsl(var(--text-secondary));
                    border: 1px solid hsl(var(--border-subtle));
                }

                .email-btn:hover {
                    border-color: hsl(var(--border-default));
                    color: hsl(var(--text-primary));
                }

                /* ═══════ TABLE — scrollable area that fills remaining space ═══════ */
                .audit-table-wrapper {
                    flex: 1;
                    min-height: 0;    /* critical: allows this flex child to shrink and scroll */
                    overflow: auto;
                }

                .audit-table {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                }

                .audit-table thead {
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }

                .audit-table thead tr {
                    background: #f1f5f9;
                }

                .audit-table th {
                    padding: 10px 14px;
                    text-align: left;
                    font-size: 0.7rem;
                    font-weight: 700;
                    color: hsl(var(--text-secondary));
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    border-bottom: 2px solid hsl(var(--border-subtle));
                    white-space: nowrap;
                    background: #f1f5f9;
                    box-shadow: 0 1px 3px -1px rgba(0, 0, 0, 0.06);
                }

                .th-content {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .sortable-col {
                    cursor: pointer;
                    user-select: none;
                    transition: color 0.2s ease;
                }

                .sortable-col:hover {
                    color: hsl(var(--text-primary));
                }

                .sort-indicator {
                    opacity: 0.3;
                    transition: all 0.2s ease;
                }

                .sort-indicator.asc {
                    opacity: 1;
                    transform: rotate(180deg);
                    color: hsl(var(--primary));
                }

                .sort-indicator.desc {
                    opacity: 1;
                    color: hsl(var(--primary));
                }

                .audit-table tbody tr {
                    transition: all 0.2s ease;
                    animation: rowFadeIn 0.3s ease forwards;
                    animation-delay: var(--row-delay);
                    opacity: 0;
                    cursor: default;
                }

                .audit-table tbody tr.has-changes {
                    cursor: pointer;
                }

                .audit-table tbody tr.has-changes:hover {
                    background: hsl(var(--bg-secondary) / 0.7);
                }

                .audit-table tbody tr.expanded {
                    background: hsl(var(--primary) / 0.05);
                }

                @keyframes rowFadeIn {
                    to { opacity: 1; }
                }

                .audit-table tbody tr:hover {
                    background: hsl(var(--bg-secondary) / 0.5);
                }

                .audit-table td {
                    padding: 9px 14px;
                    border-bottom: 1px solid hsl(var(--border-subtle) / 0.5);
                    vertical-align: middle;
                }

                .expand-col {
                    width: 40px;
                    padding: 8px !important;
                }

                .expand-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    height: 28px;
                    background: hsl(var(--bg-secondary));
                    border: 1px solid hsl(var(--border-subtle));
                    border-radius: 6px;
                    color: hsl(var(--text-secondary));
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .expand-btn:hover {
                    background: hsl(var(--primary) / 0.1);
                    border-color: hsl(var(--primary));
                    color: hsl(var(--primary));
                }

                .timestamp-col {
                    white-space: nowrap;
                }

                .date-text {
                    font-size: 0.7rem;
                    color: hsl(var(--text-muted));
                    font-weight: 500;
                }

                .time-text {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: hsl(var(--text-primary));
                    font-family: 'Space Grotesk', monospace;
                }

                .user-col .user-badge {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .user-badge .avatar {
                    width: 32px;
                    height: 32px;
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 0.8rem;
                    font-weight: 700;
                }

                .user-info {
                    display: flex;
                    flex-direction: column;
                }

                .user-badge .username {
                    font-weight: 700;
                    color: hsl(var(--text-primary));
                    font-size: 0.85rem;
                }

                .user-badge .user-role {
                    font-size: 0.65rem;
                    color: hsl(var(--text-muted));
                    text-transform: capitalize;
                }

                .action-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 5px 10px;
                    border-radius: 6px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    border: 1px solid;
                    white-space: nowrap;
                }

                .entity-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.75rem;
                    color: hsl(var(--text-secondary));
                }

                .entity-badge svg {
                    color: hsl(var(--text-muted));
                }

                .entity-id {
                    font-family: 'SF Mono', 'Fira Code', monospace;
                    font-size: 0.65rem;
                    background: hsl(var(--bg-secondary));
                    padding: 2px 6px;
                    border-radius: 4px;
                    color: hsl(var(--text-muted));
                }

                .details-col .details-text {
                    font-size: 0.8rem;
                    color: hsl(var(--text-secondary));
                    max-width: 250px;
                    display: block;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .ip-badge {
                    font-family: 'SF Mono', 'Fira Code', monospace;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: hsl(var(--text-secondary));
                    background: hsl(var(--bg-secondary));
                    padding: 4px 8px;
                    border-radius: 5px;
                }

                /* Expanded Row - Changes Panel */
                .expanded-row td {
                    padding: 0 !important;
                    background: hsl(var(--bg-secondary) / 0.5);
                }

                .changes-panel {
                    padding: 16px 20px;
                    border-top: 1px dashed hsl(var(--border-subtle));
                }

                .changes-header {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: hsl(var(--text-secondary));
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 12px;
                }

                .changes-header svg {
                    color: hsl(var(--primary));
                }

                .no-changes {
                    font-size: 0.8rem;
                    color: hsl(var(--text-muted));
                    font-style: italic;
                }

                .changes-simple {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    font-size: 0.8rem;
                }

                .changes-simple .old-value {
                    color: #ef4444;
                }

                .changes-simple .new-value {
                    color: #10b981;
                }

                .changes-table-wrapper {
                    overflow-x: auto;
                }

                .changes-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.8rem;
                }

                .changes-table th {
                    padding: 8px 12px;
                    text-align: left;
                    font-weight: 600;
                    color: hsl(var(--text-secondary));
                    background: hsl(var(--bg-secondary));
                    border-bottom: 1px solid hsl(var(--border-subtle));
                }

                .changes-table td {
                    padding: 8px 12px;
                    border-bottom: 1px solid hsl(var(--border-subtle) / 0.5);
                }

                .changes-table tr.changed {
                    background: hsl(var(--primary) / 0.03);
                }

                .changes-table .field-name {
                    font-weight: 600;
                    color: hsl(var(--text-primary));
                }

                .changes-table .old-cell {
                    color: #ef4444;
                    background: rgba(239, 68, 68, 0.05);
                }

                .changes-table .arrow-cell {
                    width: 30px;
                    text-align: center;
                    color: hsl(var(--text-muted));
                }

                .changes-table .new-cell {
                    color: #10b981;
                    background: rgba(16, 185, 129, 0.05);
                }

                .state-cell {
                    text-align: center;
                    padding: 60px 20px !important;
                }

                .loading-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 14px;
                    color: hsl(var(--text-secondary));
                }

                .loader {
                    width: 36px;
                    height: 36px;
                    border: 3px solid hsl(var(--border-subtle));
                    border-top-color: hsl(var(--primary));
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 10px;
                    color: hsl(var(--text-muted));
                }

                .empty-state svg {
                    opacity: 0.3;
                }

                .empty-state h3 {
                    margin: 0;
                    font-size: 1rem;
                    font-weight: 700;
                    color: hsl(var(--text-secondary));
                }

                .empty-state p {
                    margin: 0;
                    font-size: 0.85rem;
                }

                /* ═══════ PAGINATION ═══════ */
                .audit-pagination {
                    padding: 10px 20px;
                    border-top: 1px solid hsl(var(--border-subtle));
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: hsl(var(--bg-secondary) / 0.4);
                    flex-shrink: 0;
                }

                .pagination-info {
                    font-size: 0.8rem;
                    color: hsl(var(--text-secondary));
                }

                .pagination-info strong {
                    color: hsl(var(--text-primary));
                    font-weight: 700;
                }

                .pagination-nav {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .page-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 32px;
                    height: 32px;
                    padding: 0 10px;
                    background: hsl(var(--bg-primary));
                    border: 1px solid hsl(var(--border-subtle));
                    border-radius: 8px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: hsl(var(--text-secondary));
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .page-btn:hover:not(:disabled) {
                    background: hsl(var(--bg-secondary));
                    border-color: hsl(var(--border-default));
                    color: hsl(var(--text-primary));
                }

                .page-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }

                .page-numbers {
                    display: flex;
                    gap: 4px;
                }

                .page-num {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: hsl(var(--bg-primary));
                    border: 1px solid hsl(var(--border-subtle));
                    border-radius: 8px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: hsl(var(--text-secondary));
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .page-num:hover {
                    background: hsl(var(--bg-secondary));
                    border-color: hsl(var(--border-default));
                }

                .page-num.active {
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                    border-color: transparent;
                    color: white;
                    box-shadow: 0 2px 8px -2px rgba(99, 102, 241, 0.4);
                }

                /* Scrollbar */
                .audit-table-wrapper::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }

                .audit-table-wrapper::-webkit-scrollbar-track {
                    background: hsl(var(--bg-secondary));
                }

                .audit-table-wrapper::-webkit-scrollbar-thumb {
                    background: hsl(var(--border-default));
                    border-radius: 3px;
                }

                .audit-table-wrapper::-webkit-scrollbar-thumb:hover {
                    background: hsl(var(--text-muted));
                }

                /* ═══════ Dark mode ═══════ */
                :root[data-theme="dark"] .audit-card {
                    background: hsl(var(--bg-secondary));
                }

                :root[data-theme="dark"] .audit-toolbar {
                    background: hsl(var(--bg-tertiary) / 0.3);
                }

                :root[data-theme="dark"] .audit-table thead tr,
                :root[data-theme="dark"] .audit-table th {
                    background: #1e293b;
                }

                :root[data-theme="dark"] .search-box,
                :root[data-theme="dark"] .date-range-group,
                :root[data-theme="dark"] .filter-select {
                    background: hsl(var(--bg-tertiary));
                    border-color: hsl(var(--border-default));
                }

                :root[data-theme="dark"] .search-box:focus-within,
                :root[data-theme="dark"] .filter-select:focus {
                    border-color: #8b5cf6;
                    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.15);
                }

                :root[data-theme="dark"] .search-box svg {
                    color: #8b5cf6;
                }

                :root[data-theme="dark"] .date-input-wrapper input[type="date"] {
                    color: hsl(var(--text-primary));
                    color-scheme: dark;
                }

                :root[data-theme="dark"] .filter-select {
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b5cf6' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 10px center;
                }

                :root[data-theme="dark"] .filter-select option {
                    background: hsl(var(--bg-secondary));
                    color: hsl(var(--text-primary));
                }

                :root[data-theme="dark"] .filter-select:hover {
                    border-color: #8b5cf6;
                }

                /* Email Modal */
                .email-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1000;
                    backdrop-filter: blur(4px);
                }

                .email-modal {
                    background: #ffffff;
                    border-radius: 16px;
                    width: 100%;
                    max-width: 420px;
                    box-shadow: 0 20px 60px -12px rgba(0, 0, 0, 0.3);
                    border: 1px solid hsl(var(--border-subtle));
                    overflow: hidden;
                }

                :root[data-theme="dark"] .email-modal {
                    background: #1e293b;
                }

                .email-modal-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 20px 24px;
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                    color: white;
                }

                .email-modal-header h3 {
                    margin: 0;
                    font-size: 1.1rem;
                    font-weight: 700;
                }

                .email-modal-body {
                    padding: 24px;
                    background: #ffffff;
                }

                :root[data-theme="dark"] .email-modal-body {
                    background: #1e293b;
                }

                .email-modal-body label {
                    display: block;
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: #475569;
                    margin-bottom: 8px;
                }

                :root[data-theme="dark"] .email-modal-body label {
                    color: #94a3b8;
                }

                .email-modal-body input {
                    width: 100%;
                    padding: 12px 16px;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    font-size: 0.9rem;
                    color: #1e293b;
                    background: #f8fafc;
                    outline: none;
                    transition: all 0.2s ease;
                }

                :root[data-theme="dark"] .email-modal-body input {
                    border-color: #475569;
                    color: #f1f5f9;
                    background: #334155;
                }

                .email-modal-body input:focus {
                    border-color: #6366f1;
                    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
                }

                .email-hint {
                    margin: 12px 0 0;
                    font-size: 0.75rem;
                    color: #64748b;
                }

                :root[data-theme="dark"] .email-hint {
                    color: #64748b;
                }

                .email-modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 12px;
                    padding: 16px 24px;
                    background: #f1f5f9;
                    border-top: 1px solid #e2e8f0;
                }

                :root[data-theme="dark"] .email-modal-footer {
                    background: #0f172a;
                    border-top-color: #334155;
                }

                .email-modal-footer .cancel-btn {
                    padding: 10px 20px;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    background: #ffffff;
                    color: #64748b;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .email-modal-footer .cancel-btn:hover {
                    background: #f8fafc;
                }

                :root[data-theme="dark"] .email-modal-footer .cancel-btn {
                    border-color: #475569;
                    background: #1e293b;
                    color: #94a3b8;
                }

                :root[data-theme="dark"] .email-modal-footer .cancel-btn:hover {
                    background: #334155;
                }

                .email-modal-footer .send-btn {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 20px;
                    background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 2px 8px -2px rgba(99, 102, 241, 0.4);
                }

                .email-modal-footer .send-btn:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px -2px rgba(99, 102, 241, 0.5);
                }

                .email-modal-footer .send-btn:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                }

                /* ═══════ Responsive ═══════ */
                @media (max-width: 1024px) {
                    .toolbar-filters { gap: 6px; }
                    .search-box { width: 130px; }
                    .filter-select { min-width: 90px; }
                    .toolbar-title { display: none; }
                }

                @media (max-width: 768px) {
                    .activity-page { padding: 10px; gap: 10px; }
                    .audit-toolbar { flex-wrap: wrap; padding: 8px 12px; }
                    .toolbar-filters { flex-wrap: wrap; justify-content: flex-start; }
                    .search-box { flex: 1; width: auto; min-width: 120px; }
                    .date-range-group { flex: 1; }
                    .audit-pagination { flex-direction: column; gap: 10px; }
                }
            `}</style>
        </div>
    )
}

export default ActivityMonitoring
