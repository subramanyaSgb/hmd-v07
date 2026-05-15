import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { Clock, CheckCircle2, AlertCircle, Truck, Play, History, Activity, AlertTriangle, XCircle, Zap, TrendingUp, Timer, ChevronRight, MapPin, Search, Filter, ArrowRight, Loader2, ChevronDown, ChevronUp, PlusCircle, Pencil, Trash2, CheckSquare, Square, X, RefreshCw, Download, FileText, FileSpreadsheet, Mail } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { useNotification } from '../context/NotificationContext'

import { api } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useTableSort } from '../hooks/useTableSort'
import { useHeader } from '../context/HeaderContext'
import CustomSelect from '../components/Common/CustomSelect'
import { BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, Legend, ResponsiveContainer } from 'recharts'
import IncomingTorpedoes from '../components/IncomingTorpedoes'
import WeighbridgeModal from '../components/WeighbridgeModal'

const LIVE_OPS_STATUS_CONFIG = {
    on_track: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', label: 'On Track', icon: CheckCircle2 },
    early: { color: '#16a34a', bg: 'rgba(22, 163, 74, 0.1)', label: 'Early', icon: TrendingUp },
    completed: { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)', label: 'Completed', icon: CheckCircle2 },
    warning: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', label: 'Warning', icon: AlertTriangle },
    alert: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.1)', label: 'Alert', icon: AlertCircle },
    critical: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', label: 'Critical', icon: XCircle },
    pending: { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)', label: 'Pending', icon: Clock },
    in_progress: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)', label: 'In Progress', icon: Activity }
}

const LIVE_OPS_PHASE_STEPS = [
    { status: 1,  label: 'Assigned',        short: 'ASN',   phase: 'assignment' },
    { status: 2,  label: 'WB Tare Entry',   short: 'WB-T',  phase: 'weighbridge_tare' },
    { status: 3,  label: 'Tare Recorded',   short: 'TARE',  phase: 'weighbridge_tare' },
    { status: 4,  label: 'Producer Entry',  short: 'P-IN',  phase: 'producer' },
    { status: 5,  label: 'Loading Start',   short: 'LD-S',  phase: 'producer' },
    { status: 6,  label: 'Loading End',     short: 'LD-E',  phase: 'producer' },
    { status: 7,  label: 'Producer Exit',   short: 'P-OUT', phase: 'producer' },
    { status: 8,  label: 'WB Gross Entry',  short: 'WB-G',  phase: 'weighbridge_gross' },
    { status: 9,  label: 'Gross Recorded',  short: 'GROSS', phase: 'weighbridge_gross' },
    { status: 10, label: 'Consumer Entry',  short: 'C-IN',  phase: 'consumer' },
    { status: 11, label: 'Unloading Start', short: 'UL-S',  phase: 'consumer' },
    { status: 12, label: 'Unloading End',   short: 'UL-E',  phase: 'consumer' },
    { status: 13, label: 'Completed',       short: 'DONE',  phase: 'consumer' },
]

const TripManagement = () => {
    const { user } = useAuth()
    const { showNotification } = useNotification()
    const [trips, setTrips] = useState([])
    const [loading, setLoading] = useState(true)
    const [generating, setGenerating] = useState(false)
    const [assets, setAssets] = useState({ torpedoes: [] })
    const [selectedTrip, setSelectedTrip] = useState(null)
    const [statusUpdating, setStatusUpdating] = useState(false)
    const [showManageModal, setShowManageModal] = useState(false)
    // 2026-05-15 — JSW tab removed per user direction (trial feature, not part
    // of V07 baseline). Default reverts to 'overview'.
    const [activeTab, setActiveTab] = useState('overview')
    const [progressData, setProgressData] = useState([])
    const [searchQuery, setSearchQuery] = useState('')
    const [showManualModal, setShowManualModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [locations, setLocations] = useState({ producers: [], consumers: [] })
    const [manualForm, setManualForm] = useState({ producer_id: '', consumer_id: '', torpedo_id: '' })
    const [editForm, setEditForm] = useState({ trip_id: '', producer_id: '', consumer_id: '', torpedo_id: '' })
    const [creatingManual, setCreatingManual] = useState(false)
    const [updatingTrip, setUpdatingTrip] = useState(false)
    const [expandedTripId, setExpandedTripId] = useState(null)

    const [converterModalTrip, setConverterModalTrip] = useState(null)
    const [converterModalStatus, setConverterModalStatus] = useState(null)
    const [converters, setConverters] = useState([])
    const [loadingConverters, setLoadingConverters] = useState(false)
    const [distributionMode, setDistributionMode] = useState('equal')
    const [distributions, setDistributions] = useState({})

    const [showWBModal, setShowWBModal] = useState(false)
    const [wbModalData, setWBModalData] = useState({ recordType: 'tare', tripId: '', torpedoId: '', producerId: '', consumerId: '' })

    const [liveOpsData, setLiveOpsData] = useState({ trips: [], summary: {} })
    const [liveOpsLoading, setLiveOpsLoading] = useState(false)
    const [liveStatusFilter, setLiveStatusFilter] = useState('all')
    const [expandedLiveTripId, setExpandedLiveTripId] = useState(null)
    const getAlertSettings = () => {
        const saved = localStorage.getItem('hmd_alert_settings')
        return saved ? JSON.parse(saved) : {
            warningThreshold: 10,
            alertThreshold: 20,
            criticalThreshold: 30,
            refreshInterval: 5,
        }
    }
    const [alertSettings, setAlertSettings] = useState(getAlertSettings)

    useEffect(() => {
        const handleStorageChange = () => {
            setAlertSettings(getAlertSettings())
        }
        window.addEventListener('storage', handleStorageChange)
        return () => window.removeEventListener('storage', handleStorageChange)
    }, [])

    const [selectedTrips, setSelectedTrips] = useState(new Set())
    const [dispatchSearch, setDispatchSearch] = useState('')
    const [dispatchFilters, setDispatchFilters] = useState({ source: '', target: '' })
    const [assigningTripId, setAssigningTripId] = useState(null) 
    const [autoAssigning, setAutoAssigning] = useState(false) 
    const [autoAssignProgress, setAutoAssignProgress] = useState({ current: 0, total: 0 })

    const [historyDateRange, setHistoryDateRange] = useState({ date_from: '', date_to: '' })
    const [historyDatePreset, setHistoryDatePreset] = useState('all')
    const [showDatePicker, setShowDatePicker] = useState(false)
    const [exportingPDF, setExportingPDF] = useState(false)
    const [exportingCSV, setExportingCSV] = useState(false)
    const [sendingEmail, setSendingEmail] = useState(false)
    const [showExportMenu, setShowExportMenu] = useState(false)
    const [showEmailDialog, setShowEmailDialog] = useState(false)
    const [emailAddress, setEmailAddress] = useState('')

    const [dashboardData, setDashboardData] = useState(null)
    const [dashboardLoading, setDashboardLoading] = useState(false)
    const [dashboardPeriod, setDashboardPeriod] = useState('week')

    const { items: sortedTrips, requestSort, sortConfig } = useTableSort(trips, { key: 'status', direction: 'asc' })

    const { setHeaderContent } = useHeader()

    const filteredPendingTrips = useMemo(() => {
        let pending = sortedTrips.filter(t => t.status === 0)

        if (dispatchSearch) {
            const lowerSearch = dispatchSearch.toLowerCase()
            pending = pending.filter(t =>
                t.trip_id.toLowerCase().includes(lowerSearch) ||
                t.producer_id.toLowerCase().includes(lowerSearch) ||
                t.consumer_id.toLowerCase().includes(lowerSearch)
            )
        }
        if (dispatchFilters.source) pending = pending.filter(t => t.producer_id === dispatchFilters.source)
        if (dispatchFilters.target) pending = pending.filter(t => t.consumer_id === dispatchFilters.target)

        return pending
    }, [sortedTrips, dispatchSearch, dispatchFilters.source, dispatchFilters.target])

    const filteredLiveTrips = useMemo(() => {
        const liveTrips = liveOpsData.trips?.length > 0
            ? liveOpsData.trips
            : sortedTrips.filter(t => t.status > 0 && t.status < 13)

        return liveTrips.filter(t => {
            const matchesSearch = searchQuery === '' ||
                t.trip_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.producer_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.consumer_id?.toLowerCase().includes(searchQuery.toLowerCase())

            let matchesStatus = false
            if (liveStatusFilter === 'all') {
                matchesStatus = true
            } else if (liveStatusFilter === 'on_track') {
                matchesStatus = !t.deviation_status || t.deviation_status === 'on_track' || t.deviation_status === 'early'
            } else {
                matchesStatus = t.deviation_status === liveStatusFilter
            }

            return matchesSearch && matchesStatus
        })
    }, [liveOpsData.trips, sortedTrips, searchQuery, liveStatusFilter])

    const SortHeader = ({ label, sortKey, style = {} }) => {
        const isActive = sortConfig.key === sortKey;
        return (
            <th onClick={() => requestSort(sortKey)} className={`sortable-header ${isActive ? 'active' : ''}`} style={{ cursor: 'pointer', userSelect: 'none', ...style }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '20px 24px' }}>
                    <span style={{ fontWeight: 900, fontSize: '0.72rem' }}>{label}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 0 }}>
                        <ChevronUp size={11} strokeWidth={3} style={{ marginBottom: '-1px', color: isActive && sortConfig.direction === 'asc' ? 'white' : 'currentColor', opacity: isActive && sortConfig.direction === 'asc' ? 1 : 0.3 }} />
                        <ChevronDown size={11} strokeWidth={3} style={{ color: isActive && sortConfig.direction === 'desc' ? 'white' : 'currentColor', opacity: isActive && sortConfig.direction === 'desc' ? 1 : 0.3 }} />
                    </div>
                </div>
            </th>
        );
    };

    useEffect(() => {
        setHeaderContent({
            center: (
                <div className="switcher-tabs">
                    <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
                        <Filter size={16} />
                        OVERVIEW
                    </button>
                    {(user.role === 'admin' || user.role === 'trs') && (
                        <button className={`tab-btn ${activeTab === 'dispatch' ? 'active' : ''}`} onClick={() => setActiveTab('dispatch')}>
                            <PlusCircle size={14} />
                            DISPATCH CENTER
                        </button>
                    )}
                    <button className={`tab-btn ${activeTab === 'tracking' ? 'active' : ''}`} onClick={() => setActiveTab('tracking')}>
                        <Play size={14} />
                        LIVE MONITOR
                    </button>
                    <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>
                        <History size={14} />
                        HISTORY
                    </button>
                </div>
            ),
            forceLeftTitle: true
        })

        return () => setHeaderContent({ left: null, center: null, right: null, forceLeftTitle: false })
    }, [activeTab, user.role, setHeaderContent])

    const fetchTrips = useCallback(async () => {
        try {
            const endpoint = activeTab === 'history' ? '/api/trips/history' : '/api/trips/active'
            const response = await api.get(`${endpoint}?user_id=${user.user_id}&role=${user.role}`)

            if (activeTab === 'history' && response.data) {
                setTrips(Array.isArray(response.data) ? response.data : [])
            } else {
                
                setTrips(Array.isArray(response) ? response : [])
            }
        } catch (err) {
            console.error("Trips fetch error:", err)
            setTrips([]) 
        } finally {
            setLoading(false)
        }
    }, [user, activeTab])

    const fetchProgress = useCallback(async () => {
        try {
            const data = await api.get('/api/trips/progress-summary')
            setProgressData(Array.isArray(data) ? data : [])
        } catch (err) {
            console.error("Progress fetch error:", err)
            setProgressData([])
        }
    }, [])

    const fetchAssets = useCallback(async () => {
        if (user.role !== 'admin' && user.role !== 'trs') return
        try {
            const data = await api.get('/api/trips/available-assets')
            
            if (data.torpedoes) {
                data.torpedoes.sort((a, b) =>
                    (a.fleet_id || '').localeCompare(b.fleet_id || '', undefined, { numeric: true, sensitivity: 'base' })
                )
            }
            setAssets(data)
        } catch (err) {
            console.error("Asset fetch error:", err)
        }
    }, [user.role])

    const fetchLocations = useCallback(async () => {
        try {
            const data = await api.get('/api/locations')
            setLocations({
                producers: data.filter(l => l.type === 'producer').sort((a, b) => (a.user_id || '').localeCompare(b.user_id || '', undefined, { numeric: true })),
                consumers: data.filter(l => l.type === 'consumer').sort((a, b) => (a.user_id || '').localeCompare(b.user_id || '', undefined, { numeric: true }))
            })
        } catch (err) {
            console.error("Locations fetch error:", err)
        }
    }, [])

    const fetchLiveOps = useCallback(async () => {
        if (activeTab !== 'tracking') return
        try {
            setLiveOpsLoading(true)
            const data = await api.get(`/api/live-ops/trips?user_id=${user.user_id}&role=${user.role}&include_completed=false`)
            setLiveOpsData(data)
        } catch (err) {
            console.error("Live ops fetch error:", err)
        } finally {
            setLiveOpsLoading(false)
        }
    }, [activeTab, user.user_id, user.role])

    const fetchDashboardData = useCallback(async () => {
        if (activeTab !== 'overview') return
        try {
            setDashboardLoading(true)
            const data = await api.get(`/api/live-ops/executive-dashboard?period=${dashboardPeriod}`)
            setDashboardData(data)
        } catch (err) {
            console.error("Dashboard fetch error:", err)
            setDashboardData(null)
        } finally {
            setDashboardLoading(false)
        }
    }, [activeTab, dashboardPeriod])

    useEffect(() => {
        fetchTrips()
        fetchProgress()
        fetchLocations()
        if (activeTab === 'tracking') {
            fetchLiveOps()
        }
        if (activeTab === 'overview') {
            fetchDashboardData()
        }
        const refreshMs = (alertSettings.refreshInterval || 5) * 1000
        const interval = setInterval(() => {
            fetchTrips()
            fetchProgress()
            if (activeTab === 'tracking') {
                fetchLiveOps()
            }
            if (activeTab === 'overview') {
                fetchDashboardData()
            }
        }, refreshMs)
        return () => clearInterval(interval)
    }, [fetchTrips, fetchProgress, fetchLocations, fetchLiveOps, fetchDashboardData, activeTab, alertSettings.refreshInterval])

    useEffect(() => {
        if (selectedTrip) {
            const liveTrip = trips.find(t => t.trip_id === selectedTrip.trip_id)
            if (liveTrip) setSelectedTrip(liveTrip)
        }
    }, [trips, selectedTrip?.trip_id])

    useEffect(() => {
        if ((user.role === 'admin' || user.role === 'trs')) fetchAssets()
    }, [user.role, fetchAssets])

    const historyTrips = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        return sortedTrips.filter(t => {
            if (t.status !== 13) return false;

            if (historyDateRange.date_from || historyDateRange.date_to) {
                const tripDate = t.c_exited_at ? new Date(t.c_exited_at) : null;
                if (!tripDate) return false;

                if (historyDateRange.date_from) {
                    const fromDate = new Date(historyDateRange.date_from);
                    fromDate.setHours(0, 0, 0, 0);
                    if (tripDate < fromDate) return false;
                }
                if (historyDateRange.date_to) {
                    const toDate = new Date(historyDateRange.date_to);
                    toDate.setHours(23, 59, 59, 999);
                    if (tripDate > toDate) return false;
                }
            }

            if (!query) return true;
            return (
                (t.trip_id && t.trip_id.toLowerCase().includes(query)) ||
                (t.producer_id && t.producer_id.toLowerCase().includes(query)) ||
                (t.consumer_id && t.consumer_id.toLowerCase().includes(query)) ||
                (t.torpedo_id && t.torpedo_id.toLowerCase().includes(query))
            );
        });
    }, [sortedTrips, historyDateRange, searchQuery]);

    const emailTripHistory = async () => {
        const targetEmail = emailAddress.trim() || user?.email;

        if (!targetEmail || !targetEmail.includes('@')) {
            showNotification('error', 'Please enter a valid email address');
            return;
        }

        setSendingEmail(true);

        try {
            const response = await api.post('/api/trips/history/email', {
                email: targetEmail,
                date_from: historyDateRange.date_from || null,
                date_to: historyDateRange.date_to || null
            });

            if (response.status === 'success') {
                showNotification('success', `Trip history sent to ${targetEmail}`);
                setShowEmailDialog(false);
                setEmailAddress('');
            } else {
                throw new Error(response.message || 'Failed to send email');
            }
        } catch (error) {
            console.error('Email Error:', error);
            showNotification('error', 'Failed to send email');
        } finally {
            setSendingEmail(false);
        }
    };

    const openEmailDialog = () => {
        if (historyTrips.length === 0) {
            showNotification('warning', 'No trips to email');
            return;
        }
        setEmailAddress(user?.email || '');
        setShowExportMenu(false);
        setShowEmailDialog(true);
    };

    const handleGenerate = async () => {
        setGenerating(true)
        try {
            await api.post('/api/trips/generate')
            fetchTrips()
        } catch (err) {
            showNotification('error', err.message || "Failed to generate trips")
        } finally {
            setGenerating(false)
        }
    }

    const handleCreateManual = async (e) => {
        e.preventDefault()
        if (!manualForm.producer_id || !manualForm.consumer_id) return
        setCreatingManual(true)
        try {
            await api.post('/api/trips/manual', manualForm)
            showNotification('success', 'Manual trip created successfully')
            setShowManualModal(false)
            setManualForm({ producer_id: '', consumer_id: '', torpedo_id: '' })
            fetchTrips()
            if ((user.role === 'admin' || user.role === 'trs')) fetchAssets()
        } catch (err) {
            showNotification('error', err.message || "Manual creation failed")
        } finally {
            setCreatingManual(false)
        }
    }

    const handleEdit = (trip) => {
        setEditForm({
            trip_id: trip.trip_id,
            producer_id: trip.producer_id,
            consumer_id: trip.consumer_id,
            torpedo_id: trip.torpedo_id || ''
        })
        setShowEditModal(true)
    }

    const handleUpdateSubmit = async (e) => {
        e.preventDefault()
        setUpdatingTrip(true)
        try {
            await api.put(`/api/trips/${editForm.trip_id}`, editForm)
            showNotification('success', 'Trip updated successfully')
            setShowEditModal(false)
            fetchTrips()
            if ((user.role === 'admin' || user.role === 'trs')) fetchAssets()
        } catch (err) {
            showNotification('error', err.message || "Update failed")
        } finally {
            setUpdatingTrip(false)
        }
    }

    const handleDelete = async (tripId) => {
        if (!window.confirm(`Are you sure you want to delete trip ${tripId}?`)) return
        try {
            await api.delete(`/api/trips/${tripId}`)
            showNotification('success', 'Trip deleted successfully')
            fetchTrips()
            if ((user.role === 'admin' || user.role === 'trs')) fetchAssets()
        } catch (err) {
            showNotification('error', err.message || "Deletion failed")
        }
    }

    const handleAssign = async (tripId, torpedoId) => {
        if (!torpedoId || assigningTripId) return
        setAssigningTripId(tripId)
        try {
            await api.post('/api/trips/assign', { trip_id: tripId, torpedo_id: torpedoId })
            showNotification('success', `Torpedo ${torpedoId} assigned to ${tripId}`)
            fetchTrips()
            if ((user.role === 'admin' || user.role === 'trs')) fetchAssets()
        } catch (err) {
            showNotification('error', err.message || "Assignment failed")
        } finally {
            setAssigningTripId(null)
        }
    }

    const handleAutoAssign = async () => {
        if (autoAssigning) return

        const pendingTrips = trips.filter(t => t.status === 0)
        const availableTorpedoes = [...assets.torpedoes]

        if (pendingTrips.length === 0) {
            showNotification('info', 'No pending trips to assign')
            return
        }

        if (availableTorpedoes.length === 0) {
            showNotification('warning', 'No available torpedoes')
            return
        }

        const assignCount = Math.min(pendingTrips.length, availableTorpedoes.length)
        setAutoAssigning(true)
        setAutoAssignProgress({ current: 0, total: assignCount })

        let successCount = 0
        let failCount = 0

        for (let i = 0; i < assignCount; i++) {
            const trip = pendingTrips[i]
            const torpedo = availableTorpedoes[i]

            setAutoAssignProgress({ current: i + 1, total: assignCount })
            setAssigningTripId(trip.trip_id)

            try {
                await api.post('/api/trips/assign', { trip_id: trip.trip_id, torpedo_id: torpedo.fleet_id })
                successCount++
            } catch (err) {
                failCount++
            }

            await new Promise(resolve => setTimeout(resolve, 300))
        }

        setAssigningTripId(null)
        setAutoAssigning(false)
        setAutoAssignProgress({ current: 0, total: 0 })

        fetchTrips()
        if ((user.role === 'admin' || user.role === 'trs')) fetchAssets()

        if (failCount === 0) {
            showNotification('success', `Successfully assigned ${successCount} trips`)
        } else {
            showNotification('warning', `Assigned ${successCount} trips, ${failCount} failed`)
        }
    }

    const updateStatus = async (tripId, nextStatus, converterId = null, weighbridgeData = null) => {
        if (statusUpdating) return

        if ((nextStatus === 3 || nextStatus === 9) && !weighbridgeData) {
            const trip = trips.find(t => t.trip_id === tripId) || selectedTrip
            if (trip) {
                setWBModalData({
                    recordType: nextStatus === 3 ? 'tare' : 'gross',
                    tripId: trip.trip_id,
                    torpedoId: trip.torpedo_id || '',
                    producerId: trip.producer_id || '',
                    consumerId: trip.consumer_id || ''
                })
                setShowWBModal(true)
                return 
            }
        }

        if (nextStatus === 11) {
            const trip = trips.find(t => t.trip_id === tripId) || selectedTrip
            if (trip) {
                setConverterModalTrip(trip)
                setConverterModalStatus(nextStatus)
                setDistributionMode('equal')
                setDistributions({})
                setLoadingConverters(true)
                try {
                    const data = await api.get(`/api/converters/${trip.consumer_id}`)
                    const running = (data || []).filter(c => c.status === 'Running')
                    setConverters(running)
                    if (running.length > 0 && trip.net_weight_kg) {
                        const perConverter = Math.round((trip.net_weight_kg / 1000 / running.length) * 1000) / 1000
                        const eq = {}
                        running.forEach(c => { eq[c.id] = perConverter })
                        setDistributions(eq)
                    }
                } catch (err) {
                    setConverters([])
                }
                setLoadingConverters(false)
                return
            }
        }

        setStatusUpdating(true)
        try {
            const payload = { trip_id: tripId, status: nextStatus }
            if (converterId) payload.converter_id = converterId
            if (weighbridgeData) {
                payload.weight_kg = weighbridgeData.weight_kg
                payload.weighbridge_id = weighbridgeData.weighbridge_id
                if (weighbridgeData.cast_id) payload.cast_id = weighbridgeData.cast_id
                if (weighbridgeData.furnace_id) payload.furnace_id = weighbridgeData.furnace_id
            }
            const result = await api.post('/api/trips/update-status', payload)
            if (nextStatus === 13) {
                setShowManageModal(false)
                showNotification('success', `Trip ${tripId} completed successfully`)
                setActiveTab('history')
            } else {
                await fetchTrips()
                
                if (selectedTrip && selectedTrip.trip_id === tripId) {
                    setSelectedTrip(prev => prev ? { ...prev, status: result.trip_status } : prev)
                }
            }
        } catch (err) {
            showNotification('error', err.message || "Status update failed")
        } finally {
            setStatusUpdating(false)
        }
    }

    const handleWBModalSubmit = (weighbridgeData) => {
        const tripId = wbModalData.tripId
        const nextStatus = wbModalData.recordType === 'tare' ? 3 : 9
        setShowWBModal(false)
        updateStatus(tripId, nextStatus, null, weighbridgeData)
    }

    const handleConverterConfirm = () => {
        if (!converterModalTrip) return
        const distArray = Object.entries(distributions)
            .filter(([_, qty]) => qty > 0)
            .map(([id, qty]) => ({ converter_id: parseInt(id), quantity_tons: qty }))

        if (distArray.length === 0) {
            updateStatusDirect(converterModalTrip.trip_id, converterModalStatus)
        } else {
            updateStatusDirect(converterModalTrip.trip_id, converterModalStatus, null, null, distArray)
        }
        setConverterModalTrip(null)
        setConverters([])
        setDistributions({})
    }

    const handleConverterCancel = () => {
        setConverterModalTrip(null)
        setConverters([])
        setDistributions({})
    }

    const updateStatusDirect = async (tripId, nextStatus, converterId = null, weighbridgeData = null, converterDistributions = null) => {
        setStatusUpdating(true)
        try {
            const payload = { trip_id: tripId, status: nextStatus }
            if (converterId) payload.converter_id = converterId
            if (converterDistributions) payload.converter_distributions = converterDistributions
            if (weighbridgeData) {
                payload.weight_kg = weighbridgeData.weight_kg
                payload.weighbridge_id = weighbridgeData.weighbridge_id
                if (weighbridgeData.cast_id) payload.cast_id = weighbridgeData.cast_id
                if (weighbridgeData.furnace_id) payload.furnace_id = weighbridgeData.furnace_id
            }
            const result = await api.post('/api/trips/update-status', payload)
            if (nextStatus === 13) {
                setShowManageModal(false)
                showNotification('success', `Trip ${tripId} completed successfully`)
                setActiveTab('history')
            } else {
                await fetchTrips()
                if (selectedTrip && selectedTrip.trip_id === tripId) {
                    setSelectedTrip(prev => prev ? { ...prev, status: result.trip_status } : prev)
                }
            }
        } catch (err) {
            showNotification('error', err.message || "Status update failed")
        } finally {
            setStatusUpdating(false)
        }
    }

    const getStatusLabel = (status) => {
        const labels = {
            0: "Pending Assignment",
            1: "Assigned (Torpedo Linked)",
            2: "WB Tare Entry",
            3: "Tare Recorded",
            4: "Entered Producer",
            5: "Loading Started",
            6: "Loading Ended",
            7: "Exited Producer (In Transit)",
            8: "WB Gross Entry",
            9: "Gross Recorded",
            10: "Entered Consumer",
            11: "Unloading Started",
            12: "Unloading Ended",
            13: "Completed (Trip Closed)",
            14: "Canceled",
            15: "Aborted"
        }
        return labels[status] || "Unknown Stage"
    }

    const formatCycleTime = (totalMinutes) => {
        if (!totalMinutes) return '0 MIN 0 SEC'
        const mins = Math.floor(totalMinutes)
        const secs = Math.round((totalMinutes - mins) * 60)
        return `${mins} MIN ${secs} SEC`
    }

    const getStatusColor = (status) => {
        if (status === 0) return 'hsl(var(--text-muted))'
        if (status === 1) return 'hsl(var(--primary))'
        if (status <= 3) return 'hsl(var(--accent))'   
        if (status <= 7) return 'hsl(var(--accent))'    
        if (status <= 9) return 'hsl(var(--warning))'   
        if (status <= 12) return 'hsl(var(--warning))'  
        if (status === 13) return 'hsl(var(--success))' 
        if (status === 14 || status === 15) return 'hsl(var(--danger, 0 84% 60%))' 
        return 'hsl(var(--success))'
    }

    const LifecycleTimeline = ({ trip }) => {
        if (!trip) return null;

        const actualDuration = trip.cycle_time_minutes || 0;
        const expectedDuration = trip.expected_duration_minutes || 0;

        let totalDeviation = 0;
        let deviationStatus = 'on_track';
        if (trip.total_deviation_minutes !== null && trip.total_deviation_minutes !== undefined) {
            totalDeviation = trip.total_deviation_minutes;
            deviationStatus = trip.deviation_status || (totalDeviation <= 0 ? 'early' : totalDeviation <= 10 ? 'on_track' : totalDeviation <= 20 ? 'warning' : totalDeviation <= 30 ? 'alert' : 'critical');
        } else if (expectedDuration) {
            totalDeviation = actualDuration - expectedDuration;
            deviationStatus = totalDeviation <= 0 ? 'early' : totalDeviation <= 10 ? 'on_track' : totalDeviation <= 20 ? 'warning' : totalDeviation <= 30 ? 'alert' : 'critical';
        }
        const deviationConfig = LIVE_OPS_STATUS_CONFIG[deviationStatus] || LIVE_OPS_STATUS_CONFIG.on_track;

        const calculatePhaseDuration = (start, end) => {
            if (!start || !end) return null;
            return (new Date(end) - new Date(start)) / 60000; 
        };

        const now = new Date();

        const loadingActual = calculatePhaseDuration(trip.assigned_at, trip.p_exited_at);
        const loadingExpected = calculatePhaseDuration(trip.assigned_at, trip.expected_p_exited_at);
        
        const loadingElapsed = trip.assigned_at && !trip.p_exited_at ? calculatePhaseDuration(trip.assigned_at, now) : null;
        const loadingDeviation = loadingActual !== null && loadingExpected
            ? loadingActual - loadingExpected
            : (loadingElapsed !== null && loadingExpected ? loadingElapsed - loadingExpected : null);
        const loadingInProgress = trip.assigned_at && !trip.p_exited_at;

        const transitActual = calculatePhaseDuration(trip.p_exited_at, trip.c_entered_at);
        const transitExpected = calculatePhaseDuration(trip.expected_p_exited_at, trip.expected_c_entered_at);
        
        const transitElapsed = trip.p_exited_at && !trip.c_entered_at ? calculatePhaseDuration(trip.p_exited_at, now) : null;
        const transitDeviation = transitActual !== null && transitExpected
            ? transitActual - transitExpected
            : (transitElapsed !== null && transitExpected ? transitElapsed - transitExpected : null);
        const transitInProgress = trip.p_exited_at && !trip.c_entered_at;

        const unloadingActual = calculatePhaseDuration(trip.c_entered_at, trip.c_exited_at);
        const unloadingExpected = calculatePhaseDuration(trip.expected_c_entered_at, trip.expected_c_exited_at);
        
        const unloadingElapsed = trip.c_entered_at && !trip.c_exited_at ? calculatePhaseDuration(trip.c_entered_at, now) : null;
        const unloadingDeviation = unloadingActual !== null && unloadingExpected
            ? unloadingActual - unloadingExpected
            : (unloadingElapsed !== null && unloadingExpected ? unloadingElapsed - unloadingExpected : null);
        const unloadingInProgress = trip.c_entered_at && !trip.c_exited_at;

        const getPhaseStatus = (deviation, inProgress, hasStarted) => {
            
            if (!hasStarted) return 'pending';
            
            if (deviation === null && inProgress) return 'in_progress';
            if (deviation === null) return 'on_track';
            if (deviation <= 0) return 'early';
            if (deviation <= 10) return 'on_track';
            if (deviation <= 20) return 'warning';
            if (deviation <= 30) return 'alert';
            return 'critical';
        };

        const phases = [
            {
                name: 'Loading',
                actual: loadingActual,
                elapsed: loadingElapsed,
                expected: loadingExpected,
                deviation: loadingDeviation,
                status: getPhaseStatus(loadingDeviation, loadingInProgress, !!trip.assigned_at),
                inProgress: loadingInProgress
            },
            {
                name: 'Transit',
                actual: transitActual,
                elapsed: transitElapsed,
                expected: transitExpected,
                deviation: transitDeviation,
                status: getPhaseStatus(transitDeviation, transitInProgress, !!trip.p_exited_at),
                inProgress: transitInProgress
            },
            {
                name: 'Unloading',
                actual: unloadingActual,
                elapsed: unloadingElapsed,
                expected: unloadingExpected,
                deviation: unloadingDeviation,
                status: getPhaseStatus(unloadingDeviation, unloadingInProgress, !!trip.c_entered_at),
                inProgress: unloadingInProgress
            }
        ];

        const steps = [
            { status: 1, label: 'ASN', timestamp: trip.assigned_at },
            { status: 2, label: 'WB-T', timestamp: trip.wb_tare_entry_at },
            { status: 3, label: 'TARE', timestamp: trip.wb_tare_recorded_at, weight: trip.tare_weight_kg, weightUnit: 'kg' },
            { status: 4, label: 'P-IN', timestamp: trip.p_entered_at },
            { status: 5, label: 'LD-S', timestamp: trip.p_loading_start_at },
            { status: 6, label: 'LD-E', timestamp: trip.p_loading_end_at },
            { status: 7, label: 'P-OUT', timestamp: trip.p_exited_at },
            { status: 8, label: 'WB-G', timestamp: trip.wb_gross_entry_at },
            { status: 9, label: 'GROSS', timestamp: trip.wb_gross_recorded_at, weight: trip.gross_weight_kg, weightUnit: 'kg' },
            { status: 10, label: 'C-IN', timestamp: trip.c_entered_at },
            { status: 11, label: 'UL-S', timestamp: trip.c_unloading_start_at },
            { status: 12, label: 'UL-E', timestamp: trip.c_unloading_end_at },
            { status: 13, label: 'DONE', timestamp: trip.c_exited_at }
        ];

        const formatTime = (ts) => {
            if (!ts) return '—';
            const date = new Date(ts);
            const day = date.getDate().toString().padStart(2, '0');
            const month = date.toLocaleString('en-GB', { month: 'short' }).toUpperCase();
            const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            return `${day} ${month} ${time}`;
        };

        return (
            <div className="lifecycle-dropdown-card animate-in fade-in slide-in-from-top-2 duration-300" style={{ padding: '16px 24px' }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: '16px',
                    marginBottom: '20px',
                    padding: '12px',
                    background: 'hsl(var(--card-bg))',
                    borderRadius: '8px',
                    border: '1px solid hsl(var(--border-color))'
                }}>
                    <div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '4px', textTransform: 'uppercase' }}>Actual Duration</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'hsl(var(--primary))' }}>
                            {actualDuration ? `${Math.round(actualDuration)} min` : '---'}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '4px', textTransform: 'uppercase' }}>Expected Duration</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'hsl(var(--primary))' }}>
                            {expectedDuration ? `${Math.round(expectedDuration)} min` : '---'}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '4px', textTransform: 'uppercase' }}>Total Deviation</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: deviationConfig.color }}>
                            {expectedDuration ? `${totalDeviation > 0 ? '+' : ''}${Math.round(totalDeviation)} min` : '---'}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '4px', textTransform: 'uppercase' }}>Converter</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: trip.converter_name ? 'hsl(var(--primary))' : 'hsl(var(--text-muted))' }}>
                            {trip.converter_name || '---'}
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '4px', textTransform: 'uppercase' }}>Status</div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '12px', background: deviationConfig.bg, color: deviationConfig.color, fontSize: '0.7rem', fontWeight: 700 }}>
                            <CheckCircle2 size={12} />
                            {totalDeviation <= 0 ? 'Early/On Time' : deviationConfig.label}
                        </div>
                    </div>
                </div>
                <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '12px', textTransform: 'uppercase' }}>Trip Progress</h4>
                    <div style={{ position: 'relative', padding: '0 10px' }}>
                        <div style={{
                            position: 'absolute',
                            top: '14px',
                            left: '30px',
                            right: '30px',
                            height: '4px',
                            background: 'hsl(var(--border-color))',
                            borderRadius: '2px',
                            zIndex: 0
                        }}>
                            <div style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, #22c55e 0%, #22c55e 100%)', borderRadius: '2px' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                            {steps.map((step, idx) => (
                                <div key={step.status} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                    <div style={{
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        background: step.timestamp ? '#22c55e' : 'hsl(var(--border-color))',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: step.timestamp ? 'white' : 'hsl(var(--text-muted))',
                                        fontSize: '0.6rem',
                                        fontWeight: 700,
                                        border: '2px solid white',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                    }}>
                                        {step.timestamp ? <CheckCircle2 size={14} /> : idx + 1}
                                    </div>
                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: step.timestamp ? '#22c55e' : 'hsl(var(--text-muted))' }}>{step.label}</span>
                                    <span style={{
                                        fontSize: '0.6rem',
                                        fontWeight: 600,
                                        color: step.timestamp ? 'hsl(var(--text-primary))' : 'hsl(var(--text-muted))',
                                        background: step.timestamp ? 'hsl(var(--main-bg))' : 'transparent',
                                        padding: step.timestamp ? '2px 6px' : '0',
                                        borderRadius: '4px',
                                        marginTop: '2px'
                                    }}>{formatTime(step.timestamp)}</span>
                                    {step.weight != null && (
                                        <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#3b82f6', background: 'rgba(59,130,246,0.1)', padding: '1px 5px', borderRadius: '4px', marginTop: '1px' }}>{step.weight.toFixed(1)}{step.weightUnit}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div>
                    <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '12px', textTransform: 'uppercase' }}>Phase Performance</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                        {phases.map(phase => {
                            const phaseConfig = LIVE_OPS_STATUS_CONFIG[phase.status] || LIVE_OPS_STATUS_CONFIG.on_track;
                            const isCompleted = phase.actual !== null;
                            const isInProgress = phase.inProgress;
                            const hasData = isCompleted || isInProgress;
                            return (
                                <div key={phase.name} style={{
                                    padding: '12px',
                                    background: 'hsl(var(--card-bg))',
                                    borderRadius: '8px',
                                    border: hasData ? `1px solid ${phaseConfig.color}30` : '1px solid hsl(var(--border-color))',
                                    opacity: hasData ? 1 : 0.6
                                }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', marginBottom: '8px' }}>{phase.name} Phase</div>
                                    {hasData ? (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                                <span style={{ padding: '2px 6px', borderRadius: '4px', background: phase.deviation !== null && phase.deviation < -5 ? LIVE_OPS_STATUS_CONFIG.early.bg : phaseConfig.bg, color: phase.deviation !== null && phase.deviation < -5 ? LIVE_OPS_STATUS_CONFIG.early.color : phaseConfig.color, fontSize: '0.65rem', fontWeight: 700 }}>
                                                    {isInProgress
                                                        ? (phase.deviation !== null && phase.deviation > 10 ? phaseConfig.label : 'In Progress')
                                                        : (phase.deviation !== null
                                                            ? (phase.deviation < -5 ? 'Early' : phase.deviation <= 10 ? 'On Time' : phaseConfig.label)
                                                            : 'Completed')}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                {phase.deviation !== null && (
                                                    <div style={{ fontSize: '0.75rem' }}>
                                                        <span style={{ color: 'hsl(var(--text-muted))' }}>{isInProgress ? 'Current Delay: ' : 'Deviation: '}</span>
                                                        <span style={{ color: phaseConfig.color, fontWeight: 700 }}>
                                                            {phase.deviation > 0 ? '+' : ''}{Math.round(phase.deviation)}m
                                                        </span>
                                                    </div>
                                                )}
                                                {phase.expected !== null && (
                                                    <div style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>
                                                        Expected: {Math.round(phase.expected)}m
                                                    </div>
                                                )}
                                                {isInProgress && phase.elapsed !== null && (
                                                    <div style={{ fontSize: '0.7rem', color: phaseConfig.color, fontWeight: 600 }}>
                                                        Elapsed: {Math.round(phase.elapsed)}m
                                                    </div>
                                                )}
                                                {isCompleted && phase.actual !== null && (
                                                    <div style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>
                                                        Actual: {Math.round(phase.actual)}m
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <span style={{ padding: '2px 6px', borderRadius: '4px', background: phaseConfig.bg, color: phaseConfig.color, fontSize: '0.65rem', fontWeight: 700, display: 'inline-block', width: 'fit-content' }}>
                                                Pending
                                            </span>
                                            {phase.expected !== null && (
                                                <div style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>
                                                    Expected: {Math.round(phase.expected)}m
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
                {(trip.tare_weight_kg != null || trip.gross_weight_kg != null || trip.net_weight_kg != null) && (
                    <div style={{ marginTop: '16px' }}>
                        <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '12px', textTransform: 'uppercase' }}>Weighbridge Records</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                            <div style={{ padding: '10px 14px', background: 'hsl(var(--card-bg))', borderRadius: '8px', border: '1px solid hsl(var(--border-color))' }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '4px', textTransform: 'uppercase' }}>Tare Weight (Empty)</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: trip.tare_weight_kg ? '#f59e0b' : 'hsl(var(--text-muted))' }}>
                                    {trip.tare_weight_kg != null ? `${trip.tare_weight_kg.toFixed(1)} kg` : '—'}
                                </div>
                            </div>
                            <div style={{ padding: '10px 14px', background: 'hsl(var(--card-bg))', borderRadius: '8px', border: '1px solid hsl(var(--border-color))' }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '4px', textTransform: 'uppercase' }}>Gross Weight (Full)</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: trip.gross_weight_kg ? '#3b82f6' : 'hsl(var(--text-muted))' }}>
                                    {trip.gross_weight_kg != null ? `${trip.gross_weight_kg.toFixed(1)} kg` : '—'}
                                </div>
                            </div>
                            <div style={{ padding: '10px 14px', background: 'hsl(var(--card-bg))', borderRadius: '8px', border: `1px solid ${trip.net_weight_kg ? '#22c55e40' : 'hsl(var(--border-color))'}` }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '4px', textTransform: 'uppercase' }}>Net Weight (Hot Metal)</div>
                                <div style={{ fontSize: '1rem', fontWeight: 800, color: trip.net_weight_kg ? '#22c55e' : 'hsl(var(--text-muted))' }}>
                                    {trip.net_weight_kg != null ? `${trip.net_weight_kg.toFixed(1)} kg` : '—'}
                                </div>
                                {trip.net_weight_kg != null && (
                                    <div style={{ fontSize: '0.65rem', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                                        {(trip.net_weight_kg / 1000).toFixed(2)} T
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (loading && trips.length === 0) {
        return (
            <div className="premium-page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
                <Loader2 className="animate-spin" size={48} color="hsl(var(--primary))" />
            </div>
        )
    }

    const EmptyState = ({ icon: Icon, title, description, action }) => (
        <div className="empty-state-card animate-in fade-in zoom-in duration-500" style={{
            padding: '80px 40px',
            textAlign: 'center',
            background: 'white',
            borderRadius: '24px',
            border: '2px dashed hsl(var(--border-color))',
            margin: '20px auto',
            maxWidth: '600px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px'
        }}>
            <div style={{
                background: 'hsl(var(--main-bg))',
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'hsl(var(--text-muted))',
                opacity: 0.8
            }}>
                <Icon size={40} />
            </div>
            <div>
                <h3 style={{ margin: '0 0 8px', fontSize: '1.25rem', fontWeight: 900, color: 'hsl(var(--primary))' }}>{title}</h3>
                <p style={{ color: 'hsl(var(--text-muted))', margin: 0, fontSize: '0.9rem', maxWidth: '320px', lineHeight: 1.5 }}>{description}</p>
            </div>
            {action && (
                <div style={{ marginTop: '8px' }}>
                    {action}
                </div>
            )}
        </div>
    )

    const renderOverview = () => {
        
        const kpi = dashboardData?.kpi_summary || {}
        const trends = dashboardData?.daily_trends || []
        const queues = dashboardData?.queue_status || []
        const shifts = dashboardData?.shift_performance || []
        const routes = dashboardData?.route_performance || []
        const torpedoes = dashboardData?.torpedo_performance || []

        const getDeviationColor = (deviation) => {
            if (deviation === undefined || deviation === null) return 'hsl(var(--text-muted))'
            if (deviation < 0) return 'hsl(142, 71%, 40%)'
            if (deviation <= 10) return 'hsl(142, 71%, 40%)'
            if (deviation <= 20) return 'hsl(38, 92%, 50%)'
            return 'hsl(0, 84%, 60%)'
        }

        const getOnTimeColor = (rate) => {
            if (rate >= 90) return 'hsl(142, 71%, 40%)'
            if (rate >= 70) return 'hsl(38, 92%, 50%)'
            return 'hsl(0, 84%, 60%)'
        }

        const KPICard = ({ icon: Icon, label, value, subValue, color, iconBg }) => (
            <div style={{
                background: 'hsl(var(--card-bg))',
                borderRadius: '10px',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                border: '1px solid hsl(var(--border-color))'
            }}>
                <div style={{
                    background: iconBg || 'hsl(var(--primary) / 0.1)',
                    color: color || 'hsl(var(--primary))',
                    padding: '8px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <Icon size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', marginBottom: '2px' }}>{label}</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: color || 'hsl(var(--primary))', lineHeight: 1 }}>
                        {value}
                        {subValue && <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'hsl(var(--text-muted))', marginLeft: '4px' }}>{subValue}</span>}
                    </div>
                </div>
            </div>
        )

        return (
            <div className="tab-pane active" style={{ padding: '0', display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 100%)',
                    borderRadius: '10px',
                    color: 'white'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Activity size={18} />
                        <div>
                            <span style={{ fontSize: '1rem', fontWeight: 800 }}>Executive Dashboard</span>
                            <span style={{ fontSize: '0.7rem', opacity: 0.8, marginLeft: '12px' }}>
                                Updated: {dashboardData?.last_updated ? new Date(dashboardData.last_updated).toLocaleTimeString() : '--'}
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {['today', 'week', 'month', 'all'].map(period => (
                            <button
                                key={period}
                                onClick={() => setDashboardPeriod(period)}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: dashboardPeriod === period ? 'white' : 'rgba(255,255,255,0.15)',
                                    color: dashboardPeriod === period ? 'hsl(var(--primary))' : 'white',
                                    fontWeight: 700,
                                    fontSize: '0.65rem',
                                    textTransform: 'uppercase',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {period === 'today' ? 'Today' : period === 'week' ? '7D' : period === 'month' ? '30D' : 'All'}
                            </button>
                        ))}
                    </div>
                </div>

                {dashboardLoading && !dashboardData ? (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                        <Loader2 className="animate-spin" size={24} />
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
                            <KPICard
                                icon={CheckCircle2}
                                label="Completed"
                                value={kpi.completed_trips || 0}
                                subValue={`${kpi.active_trips || 0} active`}
                                color="hsl(var(--success))"
                                iconBg="hsl(var(--success) / 0.1)"
                            />
                            <KPICard icon={Timer} label="On-Time" value={`${kpi.on_time_rate || 0}%`} subValue={`${kpi.on_time_count || 0} trips`} color={getOnTimeColor(kpi.on_time_rate || 0)} iconBg={`${getOnTimeColor(kpi.on_time_rate || 0)}20`} />
                            <KPICard
                                icon={Clock}
                                label="Avg Cycle"
                                value={`${kpi.avg_cycle_time_minutes || 0}m`}
                                subValue={`exp: ${kpi.avg_expected_cycle_minutes || 0}m`}
                                color="hsl(var(--primary))"
                                iconBg="hsl(var(--primary) / 0.1)"
                            />
                            <KPICard icon={TrendingUp} label="Deviation" value={`${kpi.avg_deviation_minutes> 0 ? '+' : ''}${kpi.avg_deviation_minutes || 0}m`} subValue={`${kpi.delayed_count || 0} delayed`} color={getDeviationColor(kpi.avg_deviation_minutes)} iconBg={`${getDeviationColor(kpi.avg_deviation_minutes)}20`} />
                            <KPICard
                                icon={Truck}
                                label="Fleet"
                                value={`${kpi.fleet_utilization || 0}%`}
                                subValue={`${kpi.assigned_torpedoes || 0}/${kpi.total_torpedoes || 0}`}
                                color="hsl(var(--warning))"
                                iconBg="hsl(var(--warning) / 0.1)"
                            />
                            <KPICard icon={Zap} label="Delivered" value={`${((kpi.total_mt_delivered || 0) / 1000).toFixed(1)}k`} subValue="MT" color="hsl(142, 71%, 40%)" iconBg="hsl(142, 71%, 40%, 0.1)" />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', flex: 1, minHeight: 0 }}>
                            <div style={{
                                gridRow: 'span 2',
                                background: 'hsl(var(--card-bg))',
                                borderRadius: '10px',
                                padding: '12px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                border: '1px solid hsl(var(--border-color))',
                                display: 'flex',
                                flexDirection: 'column'
                            }}>
                                <h4 style={{ fontSize: '0.75rem', fontWeight: 800, margin: '0 0 8px 0', color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Activity size={14} /> Performance Trends
                                </h4>
                                {trends.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%" minHeight={150}>
                                        <ReBarChart data={trends.slice(-7)} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-color))" />
                                            <XAxis dataKey="display_date" tick={{ fontSize: 9, fill: 'hsl(var(--text-muted))' }} />
                                            <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--text-muted))' }} />
                                            <ReTooltip contentStyle={{ background: 'hsl(var(--card-bg))', border: '1px solid hsl(var(--border-color))', borderRadius: '6px', fontSize: '0.7rem' }} />
                                            <Legend wrapperStyle={{ fontSize: '0.6rem' }} />
                                            <Bar dataKey="completed" name="Done" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
                                            <Bar dataKey="on_time" name="On Time" fill="hsl(142, 71%, 40%)" radius={[2, 2, 0, 0]} />
                                            <Bar dataKey="delayed" name="Delayed" fill="hsl(0, 84%, 60%)" radius={[2, 2, 0, 0]} />
                                        </ReBarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'hsl(var(--text-muted))', fontSize: '0.75rem' }}>No trend data</div>
                                )}
                            </div>
                            <div style={{
                                background: 'hsl(var(--card-bg))',
                                borderRadius: '10px',
                                padding: '12px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                border: '1px solid hsl(var(--border-color))',
                                overflow: 'auto'
                            }}>
                                <h4 style={{ fontSize: '0.75rem', fontWeight: 800, margin: '0 0 8px 0', color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <MapPin size={14} /> Queue Status
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {queues.filter(q => q.queue_count > 0 || q.waiting_count > 0).length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '12px', color: 'hsl(var(--text-muted))', fontSize: '0.7rem' }}>
                                            <CheckCircle2 size={20} style={{ opacity: 0.5, marginBottom: '4px' }} />
                                            <p style={{ margin: 0 }}>All clear</p>
                                        </div>
                                    ) : (
                                        queues.filter(q => q.queue_count > 0 || q.waiting_count > 0).map(q => (
                                            <div key={q.location_id} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '6px 8px',
                                                background: 'hsl(var(--main-bg))',
                                                borderRadius: '6px',
                                                borderLeft: `3px solid ${q.location_type === 'producer' ? 'hsl(var(--accent))' : 'hsl(var(--success))'}`,
                                            }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.7rem', color: 'hsl(var(--primary))' }}>{q.location_id}</div>
                                                <div style={{ display: 'flex', gap: '8px', fontSize: '0.65rem' }}>
                                                    <span style={{ fontWeight: 800, color: 'hsl(var(--primary))' }}>{q.queue_count}</span>
                                                    <span style={{ color: 'hsl(var(--text-muted))' }}>~{q.estimated_wait_minutes}m</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            <div style={{
                                background: 'hsl(var(--card-bg))',
                                borderRadius: '10px',
                                padding: '12px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                border: '1px solid hsl(var(--border-color))',
                                overflow: 'auto'
                            }}>
                                <h4 style={{ fontSize: '0.75rem', fontWeight: 800, margin: '0 0 8px 0', color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Clock size={14} /> Shift Performance
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {shifts.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '12px', color: 'hsl(var(--text-muted))', fontSize: '0.7rem' }}>No shift data</div>
                                    ) : (
                                        shifts.slice(0, 3).map(s => (
                                            <div key={s.shift_name} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '6px 8px',
                                                background: 'hsl(var(--main-bg))',
                                                borderRadius: '6px',
                                            }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.7rem', color: 'hsl(var(--primary))' }}>{s.shift_name}</div>
                                                <div style={{ display: 'flex', gap: '8px', fontSize: '0.65rem' }}>
                                                    <span style={{ fontWeight: 800, color: getOnTimeColor(s.on_time_rate) }}>{s.on_time_rate}%</span>
                                                    <span style={{ color: getDeviationColor(s.avg_deviation) }}>{s.avg_deviation > 0 ? '+' : ''}{s.avg_deviation}m</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            <div style={{
                                background: 'hsl(var(--card-bg))',
                                borderRadius: '10px',
                                padding: '12px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                border: '1px solid hsl(var(--border-color))',
                                overflow: 'auto'
                            }}>
                                <h4 style={{ fontSize: '0.75rem', fontWeight: 800, margin: '0 0 8px 0', color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <ArrowRight size={14} /> Top Routes
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {routes.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '12px', color: 'hsl(var(--text-muted))', fontSize: '0.7rem' }}>No data</div>
                                    ) : (
                                        routes.slice(0, 4).map((r, i) => (
                                            <div key={r.route} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '5px 8px',
                                                background: 'hsl(var(--main-bg))',
                                                borderRadius: '5px',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{
                                                        width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: i === 0 ? 'hsl(var(--accent))' : 'hsl(var(--border-color))',
                                                        color: i === 0 ? 'white' : 'hsl(var(--text-muted))',
                                                        borderRadius: '4px', fontSize: '0.55rem', fontWeight: 800
                                                    }}>{i + 1}</span>
                                                    <span style={{ fontWeight: 600, fontSize: '0.65rem', color: 'hsl(var(--primary))' }}>{r.route}</span>
                                                </div>
                                                <span style={{ padding: '2px 6px', borderRadius: '4px', background: `${getOnTimeColor(r.on_time_rate)}20`, color: getOnTimeColor(r.on_time_rate), fontWeight: 700, fontSize: '0.6rem' }}>{r.on_time_rate}%</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            <div style={{
                                background: 'hsl(var(--card-bg))',
                                borderRadius: '10px',
                                padding: '12px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                border: '1px solid hsl(var(--border-color))',
                                overflow: 'auto'
                            }}>
                                <h4 style={{ fontSize: '0.75rem', fontWeight: 800, margin: '0 0 8px 0', color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Truck size={14} /> Top Torpedoes
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {torpedoes.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '12px', color: 'hsl(var(--text-muted))', fontSize: '0.7rem' }}>No data</div>
                                    ) : (
                                        torpedoes.slice(0, 4).map((t, i) => (
                                            <div key={t.torpedo_id} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '5px 8px',
                                                background: 'hsl(var(--main-bg))',
                                                borderRadius: '5px',
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{
                                                        width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        background: i === 0 ? 'hsl(var(--accent))' : 'hsl(var(--border-color))',
                                                        color: i === 0 ? 'white' : 'hsl(var(--text-muted))',
                                                        borderRadius: '4px', fontSize: '0.55rem', fontWeight: 800
                                                    }}>{i + 1}</span>
                                                    <span style={{ fontWeight: 600, fontSize: '0.65rem', color: 'hsl(var(--primary))' }}>{t.torpedo_id}</span>
                                                </div>
                                                <span style={{ padding: '2px 6px', borderRadius: '4px', background: `${getOnTimeColor(t.on_time_rate)}20`, color: getOnTimeColor(t.on_time_rate), fontWeight: 700, fontSize: '0.6rem' }}>{t.on_time_rate}%</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    }

    const renderDispatch = () => {
        
        const pendingTrips = filteredPendingTrips;

        const toggleSelection = (id) => {
            const newSet = new Set(selectedTrips);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            setSelectedTrips(newSet);
        };

        const toggleAll = () => {
            if (selectedTrips.size === pendingTrips.length) setSelectedTrips(new Set());
            else setSelectedTrips(new Set(pendingTrips.map(t => t.trip_id)));
        };

        const handleBulkDelete = async () => {
            if (!window.confirm(`Delete ${selectedTrips.size} selected trips?`)) return;
            
            for (const id of selectedTrips) {
                try { await api.delete(`/api/trips/${id}`); } catch (e) { console.error(e); }
            }
            fetchTrips();
            setSelectedTrips(new Set());
            showNotification('success', 'Bulk deletion processed');
        };

        return (
            <div className="tab-pane active animate-in slide-in-from-bottom-4 duration-500" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div className="dispatch-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, margin: 0, color: 'hsl(var(--primary))' }}>Dispatch Control</h2>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>{trips.filter(t => t.status === 0).length} Trips awaiting torpedo assignment</p>
                    </div>
                    {(user.role === 'admin' || user.role === 'trs') && (
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <button className="premium-btn secondary" onClick={() => setShowManualModal(true)}>
                                <PlusCircle size={16} /> CREATE MANUAL
                            </button>
                            {user.role === 'admin' && (
                                <button
                                    className="premium-btn"
                                    onClick={handleAutoAssign}
                                    disabled={autoAssigning || assets.torpedoes.length === 0}
                                    style={{
                                        background: autoAssigning
                                            ? 'linear-gradient(135deg, hsl(var(--success)) 0%, hsl(145, 70%, 35%) 100%)'
                                            : 'linear-gradient(135deg, hsl(var(--success) / 0.9) 0%, hsl(145, 70%, 40%) 100%)',
                                        minWidth: autoAssigning ? '180px' : 'auto'
                                    }}
                                >
                                    {autoAssigning ? (
                                        <>
                                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                            {autoAssignProgress.current}/{autoAssignProgress.total}
                                        </>
                                    ) : (
                                        <>
                                            <Zap size={16} /> AUTO ASSIGN
                                        </>
                                    )}
                                </button>
                            )}
                            <button className="premium-btn primary" onClick={handleGenerate} disabled={generating}>
                                {generating ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
                                START AUTO-GENERATION
                            </button>
                        </div>
                    )}
                </div>
                <div className="dispatch-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '16px' }}>
                    <div style={{ display: 'flex', gap: '12px', flex: 1, alignItems: 'center' }}>
                        <div className="premium-search-box" style={{ width: '320px' }}>
                            <Search size={16} />
                            <input type="text" placeholder="Search trips..." value={dispatchSearch} onChange={(e) => setDispatchSearch(e.target.value)} />
                        </div>
                        <div style={{ height: '24px', width: '1px', background: 'hsl(var(--border-color))' }}></div>

                        <div className="filter-group">
                            <CustomSelect size="small" style={{ width: '120px' }} options={[ { value: '', label: 'Source: All' }, ...locations.producers.map(p => ({ value: p.user_id, label: p.user_id })) ]} value={dispatchFilters.source} onChange={(val) => setDispatchFilters(prev => ({ ...prev, source: val }))} />
                            <CustomSelect size="small" style={{ width: '120px' }} options={[ { value: '', label: 'Target: All' }, ...locations.consumers.map(c => ({ value: c.user_id, label: c.user_id })) ]} value={dispatchFilters.target} onChange={(val) => setDispatchFilters(prev => ({ ...prev, target: val }))} />
                            <CustomSelect size="small" style={{ width: '140px' }} disabled options={[{ value: '0', label: 'Stage: 0 (Queue)' }]} value="0" onChange={() => { }} />
                            {(dispatchSearch || dispatchFilters.source || dispatchFilters.target) && (
                                <button className="icon-btn xs" onClick={() => { setDispatchSearch(''); setDispatchFilters({ source: '', target: '' }); }} title="Clear Filters" style={{ width: '32px' }}>
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                </div>

                <div className="dispatch-content" style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                    {pendingTrips.length === 0 ? (
                        <div className="empty-state-card" style={{ gridColumn: '1/-1', padding: '64px', textAlign: 'center', background: 'white', borderRadius: '24px', border: '2px dashed hsl(var(--border-color))', marginTop: '20px' }}>
                            <div style={{ background: 'hsl(var(--main-bg))', width: '64px', height: '64px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                <CheckCircle2 size={32} color="hsl(var(--success))" />
                            </div>
                            <h3 style={{ margin: '0 0 8px' }}>Queue Empty</h3>
                            <p style={{ color: 'hsl(var(--text-muted))', margin: 0 }}>All scheduled trips have been successfully dispatched.</p>
                        </div>
                    ) : (
                        <div className="table-container" style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', background: 'white', borderRadius: '16px', border: '1px solid hsl(var(--border-color))', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <table className="dispatch-table">
                                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' }}>
                                    <tr>
                                        <th style={{ width: '40px' }} className="checkbox-cell">
                                            <button onClick={toggleAll} className="checkbox-btn">
                                                {selectedTrips.size > 0 && selectedTrips.size === pendingTrips.length ?
                                                    <CheckSquare size={16} color="hsl(var(--primary))" /> :
                                                    <Square size={16} color="hsl(var(--text-muted))" />
                                                }
                                            </button>
                                        </th>
                                        <SortHeader label="TRIP ID" sortKey="trip_id" />
                                        <SortHeader label="SOURCE" sortKey="producer_id" />
                                        <SortHeader label="TARGET" sortKey="consumer_id" />
                                        <th>QUEUE STAGE</th>
                                        <SortHeader label="TORPEDO ASSIGNMENT" sortKey="torpedo_id" />
                                        <th className="text-right">ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingTrips.map(trip => {
                                        const isSelected = selectedTrips.has(trip.trip_id);
                                        return (
                                            <tr key={trip.id} className={isSelected ? 'selected' : ''}>
                                                <td className="checkbox-cell">
                                                    <button onClick={() => toggleSelection(trip.trip_id)} className="checkbox-btn">
                                                        {isSelected ?
                                                            <CheckSquare size={16} color="hsl(var(--primary))" /> :
                                                            <Square size={16} color="hsl(var(--text-muted))" />
                                                        }
                                                    </button>
                                                </td>
                                                <td><span className="monospace-id">{trip.trip_id}</span></td>
                                                <td><span className="badge-pill source">{trip.producer_id}</span></td>
                                                <td><span className="badge-pill target">{trip.consumer_id}</span></td>
                                                <td style={{ color: 'hsl(var(--text-muted))', fontSize: '0.75rem', fontWeight: 600 }}>QUEUE • STAGE 0</td>
                                                <td>
                                                    {assigningTripId === trip.trip_id ? (
                                                        <div style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '8px',
                                                            padding: '8px 12px',
                                                            background: 'linear-gradient(135deg, hsl(var(--primary) / 0.1) 0%, hsl(var(--primary) / 0.05) 100%)',
                                                            borderRadius: '8px',
                                                            border: '1px solid hsl(var(--primary) / 0.3)',
                                                            animation: 'pulse 1.5s ease-in-out infinite'
                                                        }}>
                                                            <Loader2 size={14} style={{ color: 'hsl(var(--primary))', animation: 'spin 1s linear infinite' }} />
                                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'hsl(var(--primary))' }}>Assigning...</span>
                                                        </div>
                                                    ) : (
                                                        <CustomSelect size="small" options={assets.torpedoes.map(t => ({ value: t.fleet_id, label: t.fleet_id }))} value="" onChange={(val) => handleAssign(trip.trip_id, val)} placeholder="Select torpedo..." disabled={assigningTripId !== null} />
                                                    )}
                                                </td>
                                                <td className="text-right">
                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                        <button className="icon-btn xs" onClick={() => handleEdit(trip)} title="Edit"><Pencil size={14} /></button>
                                                        <button className="icon-btn danger xs" onClick={() => handleDelete(trip.trip_id)} title="Delete"><Trash2 size={14} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {selectedTrips.size > 0 && (
                        <div className="bulk-action-bar animate-in slide-in-from-bottom-2">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div className="selected-count">
                                    <span style={{ fontWeight: 900, color: 'hsl(var(--primary))' }}>{selectedTrips.size}</span>
                                    <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', fontWeight: 700 }}>SELECTED</span>
                                </div>
                                <div style={{ height: '24px', width: '1px', background: 'hsl(var(--border-color))' }}></div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button className="premium-btn danger small" onClick={handleBulkDelete}>
                                        <Trash2 size={14} /> DELETE
                                    </button>
                                    <button className="premium-btn secondary small" onClick={() => setSelectedTrips(new Set())}>
                                        CANCEL
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div >
        );
    };

    const renderTracking = () => {
        
        const filteredTrips = filteredLiveTrips;

        const liveTrips = liveOpsData.trips?.length > 0
            ? liveOpsData.trips
            : sortedTrips.filter(t => t.status > 0 && t.status < 13);

        const summary = liveOpsData.summary || {
            total_active: liveTrips.length,
            on_track: liveTrips.filter(t => !t.deviation_status || t.deviation_status === 'on_track').length,
            warning: 0,
            alert: 0,
            critical: 0
        };

        const KPICard = ({ label, value, color, icon: Icon, isActive, onClick }) => (
            <div
                onClick={onClick}
                style={{
                    background: isActive ? `${color}15` : 'hsl(var(--card-bg))',
                    border: isActive ? `2px solid ${color}` : '1px solid hsl(var(--border-color))',
                    borderRadius: '10px',
                    padding: '14px 20px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    flex: 1,
                    minWidth: 0
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <Icon size={16} style={{ color }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            </div>
        );

        const LiveStatusBadge = ({ status, minutes }) => {
            const config = LIVE_OPS_STATUS_CONFIG[status] || LIVE_OPS_STATUS_CONFIG.on_track;
            const Icon = config.icon;
            const sign = minutes > 0 ? '+' : '';

            return (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', background: config.bg, color: config.color, fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    <Icon size={12} />
                    {config.label}
                    {minutes !== undefined && minutes !== null && (
                        <span>({sign}{Math.round(minutes)}m)</span>
                    )}
                </span>
            );
        };

        const LiveProgressStepper = ({ trip }) => {
            const currentStatus = trip.status;
            const progressPercent = Math.min(100, (currentStatus / 13) * 100);

            const getStepTimestamp = (stepStatus) => {
                const timestampMap = {
                    1: trip.assigned_at,
                    2: trip.wb_tare_entry_at,
                    3: trip.wb_tare_recorded_at,
                    4: trip.p_entered_at,
                    5: trip.p_loading_start_at,
                    6: trip.p_loading_end_at,
                    7: trip.p_exited_at,
                    8: trip.wb_gross_entry_at,
                    9: trip.wb_gross_recorded_at,
                    10: trip.c_entered_at,
                    11: trip.c_unloading_start_at,
                    12: trip.c_unloading_end_at,
                    13: trip.c_exited_at || trip.completed_at
                };
                const ts = timestampMap[stepStatus];
                if (!ts) return null;
                const date = new Date(ts);
                const day = date.getDate().toString().padStart(2, '0');
                const month = date.toLocaleString('en-GB', { month: 'short' }).toUpperCase();
                const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                return `${day} ${month} ${time}`;
            };

            return (
                <div style={{ width: '100%' }}>
                    <div style={{
                        position: 'relative',
                        height: '6px',
                        background: 'hsl(var(--border-color))',
                        borderRadius: '3px',
                        marginBottom: '12px',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${progressPercent}%`, background: 'linear-gradient(90deg, #22c55e 0%, #3b82f6 100%)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '2px' }}>
                        {LIVE_OPS_PHASE_STEPS.map((step) => {
                            const isCompleted = currentStatus > step.status;
                            const isCurrent = currentStatus === step.status;
                            const timestamp = getStepTimestamp(step.status);

                            return (
                                <div key={step.status} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                    <div style={{
                                        width: '24px',
                                        height: '24px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: isCompleted ? '#22c55e' : isCurrent ? '#3b82f6' : 'hsl(var(--card-bg))',
                                        border: isCompleted || isCurrent ? 'none' : '2px solid hsl(var(--border-color))',
                                        color: (isCompleted || isCurrent) ? 'white' : 'hsl(var(--text-muted))',
                                        fontSize: '0.6rem',
                                        fontWeight: 700,
                                        boxShadow: isCurrent ? '0 0 0 3px rgba(59, 130, 246, 0.2)' : 'none'
                                    }}>
                                        {isCompleted ? <CheckCircle2 size={12} /> : step.status}
                                    </div>
                                    <span style={{
                                        fontSize: '0.55rem',
                                        fontWeight: 600,
                                        color: isCurrent ? '#3b82f6' : isCompleted ? '#22c55e' : 'hsl(var(--text-muted))',
                                        textAlign: 'center'
                                    }}>
                                        {step.short}
                                    </span>
                                    <span style={{
                                        fontSize: '0.55rem',
                                        fontWeight: 600,
                                        color: (isCompleted || isCurrent) ? 'hsl(var(--text-primary))' : 'hsl(var(--text-muted))',
                                        textAlign: 'center',
                                        opacity: timestamp ? 1 : 0.4,
                                        minHeight: '24px',
                                        background: timestamp ? 'hsl(var(--main-bg))' : 'transparent',
                                        padding: timestamp ? '2px 4px' : '0',
                                        borderRadius: '4px',
                                        lineHeight: '1.4'
                                    }}>
                                        {timestamp || '—'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        };

        const LiveTripRow = ({ trip, isExpanded, onToggle }) => {
            const formatTime = (timestamp) => {
                if (!timestamp) return '--:--';
                return new Date(timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            };

            const formatDateTime = (timestamp) => {
                if (!timestamp) return '---';
                const d = new Date(timestamp);
                return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
            };

            const config = LIVE_OPS_STATUS_CONFIG[trip.deviation_status] || LIVE_OPS_STATUS_CONFIG.on_track;

            const getPhaseDeviations = () => {
                if (!trip.phase_deviations) return {};
                if (Array.isArray(trip.phase_deviations)) {
                    const result = {};
                    trip.phase_deviations.forEach(p => {
                        if (p.phase_name) {
                            result[p.phase_name] = p;
                        }
                    });
                    return result;
                }
                return trip.phase_deviations;
            };

            const phaseDeviations = getPhaseDeviations();

            return (
                <div style={{
                    background: 'hsl(var(--card-bg))',
                    borderRadius: '10px',
                    border: '1px solid hsl(var(--border-color))',
                    marginBottom: '8px',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                    boxShadow: isExpanded ? '0 4px 16px rgba(0,0,0,0.06)' : 'none'
                }}>
                    <div onClick={onToggle} style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1.2fr 50px', alignItems: 'center', padding: '14px 20px', cursor: 'pointer', borderLeft: `4px solid ${config.color}`, gap: '16px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'hsl(var(--primary))' }}>{trip.trip_id}</span>
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'hsl(var(--text-muted))' }}>
                                {trip.elapsed_minutes
                                    ? `Elapsed: ${Math.round(trip.elapsed_minutes)}m`
                                    : `Updated ${formatTime(trip.updated_at || trip.assigned_at)}`
                                }
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ padding: '4px 8px', borderRadius: '4px', background: 'hsl(var(--accent) / 0.1)', color: 'hsl(var(--accent))', fontSize: '0.7rem', fontWeight: 700 }}>{trip.producer_id}</span>
                            <ArrowRight size={12} style={{ color: 'hsl(var(--text-muted))' }} />
                            <span style={{ padding: '4px 8px', borderRadius: '4px', background: 'hsl(var(--success) / 0.1)', color: 'hsl(var(--success))', fontSize: '0.7rem', fontWeight: 700 }}>{trip.consumer_id}</span>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.8rem' }}>🚂 {trip.torpedo_id || 'N/A'}</div>
                        <div>
                            <div style={{ padding: '4px 10px', borderRadius: '12px', background: `${getStatusColor(trip.status)}15`, color: getStatusColor(trip.status), fontSize: '0.65rem', fontWeight: 700, display: 'inline-block' }}>
                                {trip.status_label || getStatusLabel(trip.status).split(' ')[0]}
                            </div>
                        </div>
                        <div>
                            <LiveStatusBadge status={trip.deviation_status || 'on_track'} minutes={trip.total_deviation_minutes} />
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </div>
                    </div>
                    {isExpanded && (
                        <div style={{ padding: '16px 24px', borderTop: '1px solid hsl(var(--border-color))', background: 'hsl(var(--main-bg))' }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: '16px',
                                marginBottom: '20px',
                                padding: '12px',
                                background: 'hsl(var(--card-bg))',
                                borderRadius: '8px',
                                border: '1px solid hsl(var(--border-color))'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '4px', textTransform: 'uppercase' }}>Elapsed</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'hsl(var(--primary))' }}>
                                        {trip.elapsed_minutes ? `${Math.round(trip.elapsed_minutes)} min` : '---'}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '4px', textTransform: 'uppercase' }}>Remaining</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: trip.remaining_minutes <= 0 ? '#ef4444' : '#22c55e' }}>
                                        {trip.remaining_minutes !== null && trip.remaining_minutes !== undefined ? `${Math.round(trip.remaining_minutes)} min` : '---'}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '4px', textTransform: 'uppercase' }}>Expected Duration</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'hsl(var(--primary))' }}>
                                        {trip.expected_duration_minutes ? `${Math.round(trip.expected_duration_minutes)} min` : '---'}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '4px', textTransform: 'uppercase' }}>Expected Completion</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'hsl(var(--primary))' }}>
                                        {formatDateTime(trip.expected_completion_at || trip.dynamic_eta)}
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginBottom: '20px' }}>
                                <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '12px', textTransform: 'uppercase' }}>Trip Progress</h4>
                                <LiveProgressStepper trip={trip} />
                            </div>
                            {Object.keys(phaseDeviations).length > 0 && (
                                <div style={{ marginBottom: '16px' }}>
                                    <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '12px', textTransform: 'uppercase' }}>Phase Performance</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                        {['loading', 'transit', 'unloading'].map(phase => {
                                            const phaseData = phaseDeviations[phase];
                                            if (!phaseData) {
                                                return (
                                                    <div key={phase} style={{ padding: '12px', background: 'hsl(var(--card-bg))', borderRadius: '8px', border: '1px solid hsl(var(--border-color))', opacity: 0.5 }}>
                                                        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', marginBottom: '8px' }}>{phase} Phase</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))' }}>Pending</div>
                                                    </div>
                                                );
                                            }
                                            const phaseConfig = LIVE_OPS_STATUS_CONFIG[phaseData.status] || LIVE_OPS_STATUS_CONFIG.on_track;
                                            return (
                                                <div key={phase} style={{ padding: '12px', background: 'hsl(var(--card-bg))', borderRadius: '8px', border: `1px solid ${phaseConfig.color}30` }}>
                                                    <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', marginBottom: '8px' }}>{phase} Phase</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                                        <span style={{ padding: '2px 6px', borderRadius: '4px', background: phaseConfig.bg, color: phaseConfig.color, fontSize: '0.65rem', fontWeight: 700 }}>
                                                            {phaseConfig.label}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        {phaseData.deviation_minutes !== null && phaseData.deviation_minutes !== undefined && (
                                                            <div style={{ fontSize: '0.75rem' }}>
                                                                <span style={{ color: 'hsl(var(--text-muted))' }}>Deviation: </span>
                                                                <span style={{ color: phaseConfig.color, fontWeight: 700 }}>
                                                                    {phaseData.deviation_minutes > 0 ? '+' : ''}{Math.round(phaseData.deviation_minutes)}m
                                                                </span>
                                                            </div>
                                                        )}
                                                        {phaseData.expected_duration_minutes && (
                                                            <div style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>
                                                                Expected: {Math.round(phaseData.expected_duration_minutes)}m
                                                            </div>
                                                        )}
                                                        {phaseData.actual_duration_minutes && (
                                                            <div style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>
                                                                Actual: {Math.round(phaseData.actual_duration_minutes)}m
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="premium-btn primary small" onClick={(e) => { e.stopPropagation(); setSelectedTrip(trip); setShowManageModal(true); }} style={{ padding: '8px 20px', borderRadius: '8px' }}>
                                    MANAGE TRIP
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            );
        };

        if (filteredTrips.length === 0 && liveTrips.length === 0) {
            return (
                <EmptyState icon={Play} title="No Live Trips" description="There are no torpedoes currently in transit. You can track their status here once they are dispatched." action={ (user.role === 'admin' || user.role === 'trs') && ( <button className="premium-btn primary small" onClick={() => setActiveTab('dispatch')}> DISPATCH A TRIP </button> ) } />
            );
        }

        return (
            <div className="tab-pane active animate-in fade-in duration-300" style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, overflow: 'auto', minHeight: 0 }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                    <KPICard label="Total Active" value={summary.total_active || 0} color="#3b82f6" icon={Activity} isActive={liveStatusFilter === 'all'} onClick={() => setLiveStatusFilter('all')} />
                    <KPICard label="On Track" value={(summary.on_track || 0) + (summary.early || 0)} color="#22c55e" icon={CheckCircle2} isActive={liveStatusFilter === 'on_track'} onClick={() => setLiveStatusFilter('on_track')} />
                    <KPICard label="Warning" value={summary.warning || 0} color="#f59e0b" icon={AlertTriangle} isActive={liveStatusFilter === 'warning'} onClick={() => setLiveStatusFilter('warning')} />
                    <KPICard label="Alert" value={summary.alert || 0} color="#f97316" icon={AlertCircle} isActive={liveStatusFilter === 'alert'} onClick={() => setLiveStatusFilter('alert')} />
                    <KPICard label="Critical" value={summary.critical || 0} color="#ef4444" icon={XCircle} isActive={liveStatusFilter === 'critical'} onClick={() => setLiveStatusFilter('critical')} />
                </div>
                {user?.role === 'consumer' && (
                    <div style={{ marginBottom: '16px' }}>
                        <IncomingTorpedoes consumerId={user.user_id} />
                    </div>
                )}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'hsl(var(--card-bg))',
                    borderRadius: '10px',
                    border: '1px solid hsl(var(--border-color))'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }}></div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'hsl(var(--primary))' }}>LIVE OPERATIONS MONITOR</span>
                        <span style={{ fontSize: '0.7rem', color: 'hsl(var(--text-muted))' }}>Auto-refresh: {alertSettings.refreshInterval}s</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="premium-search-box" style={{ maxWidth: '250px' }}>
                            <Search size={14} />
                            <input type="text" placeholder="Search trips..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ fontSize: '0.75rem' }} />
                        </div>

                        <button
                            onClick={() => fetchLiveOps()}
                            disabled={liveOpsLoading}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid hsl(var(--border-color))',
                                background: 'transparent',
                                color: 'hsl(var(--text-muted))',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                fontWeight: 600
                            }}
                            title="Refresh now"
                        >
                            <RefreshCw size={14} className={liveOpsLoading ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
                <div style={{ flex: 1, minHeight: '300px', overflowY: 'auto' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1.2fr 50px',
                        padding: '12px 24px',
                        background: 'hsl(var(--main-bg))',
                        borderRadius: '8px',
                        marginBottom: '8px',
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        color: 'hsl(var(--text-muted))',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        gap: '16px'
                    }}>
                        <div>Trip ID</div>
                        <div>Route</div>
                        <div>Torpedo</div>
                        <div>Stage</div>
                        <div>Deviation</div>
                        <div></div>
                    </div>
                    {filteredTrips.map(trip => (
                        <LiveTripRow key={trip.trip_id || trip.id} trip={trip} isExpanded={expandedLiveTripId === (trip.trip_id || trip.id)} onToggle={() => setExpandedLiveTripId( expandedLiveTripId === (trip.trip_id || trip.id) ? null : (trip.trip_id || trip.id) )} />
                    ))}

                    {filteredTrips.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'hsl(var(--text-muted))' }}>
                            <Filter size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                            <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>No trips match your filter</div>
                            <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Try adjusting your search or filter criteria</div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderHistory = () => {
        const query = searchQuery.toLowerCase().trim();

        const DATE_PRESETS = [
            { id: 'all', label: 'All Time' },
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' },
            { id: 'year', label: 'This Year' },
            { id: 'custom', label: 'Custom Range' }
        ];

        const applyDatePreset = (presetId) => {
            setHistoryDatePreset(presetId);
            const today = new Date();
            today.setHours(23, 59, 59, 999);

            let fromDate = null;

            switch (presetId) {
                case 'today':
                    fromDate = new Date(today);
                    fromDate.setHours(0, 0, 0, 0);
                    break;
                case 'week':
                    fromDate = new Date(today);
                    fromDate.setDate(today.getDate() - 7);
                    fromDate.setHours(0, 0, 0, 0);
                    break;
                case 'month':
                    fromDate = new Date(today);
                    fromDate.setMonth(today.getMonth() - 1);
                    fromDate.setHours(0, 0, 0, 0);
                    break;
                case 'year':
                    fromDate = new Date(today);
                    fromDate.setFullYear(today.getFullYear() - 1);
                    fromDate.setHours(0, 0, 0, 0);
                    break;
                case 'custom':
                    setShowDatePicker(true);
                    return;
                case 'all':
                default:
                    setHistoryDateRange({ date_from: '', date_to: '' });
                    setShowDatePicker(false);
                    return;
            }

            setHistoryDateRange({
                date_from: fromDate ? fromDate.toISOString().split('T')[0] : '',
                date_to: today.toISOString().split('T')[0]
            });
            setShowDatePicker(false);
        };

        const exportHistoryToPDF = () => {
            if (historyTrips.length === 0) {
                showNotification('warning', 'No trips to export');
                return;
            }

            setExportingPDF(true);

            try {
                const doc = new jsPDF();
                const pageWidth = doc.internal.pageSize.getWidth();
                const pageHeight = doc.internal.pageSize.getHeight();
                const margin = 14;
                const bottomMargin = 28;
                let yPos = 20;

                const formatTime = (dateStr) => {
                    if (!dateStr) return '-';
                    const d = new Date(dateStr);
                    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                };

                const formatDate = (dateStr) => {
                    if (!dateStr) return '-';
                    const d = new Date(dateStr);
                    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                };

                const formatDateTime = (dateStr) => {
                    if (!dateStr) return '-';
                    const d = new Date(dateStr);
                    return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
                };

                const getDeviationStatus = (deviation) => {
                    if (deviation === null || deviation === undefined) return { label: '-', color: [100, 100, 100] };
                    if (deviation <= 0) return { label: 'Early', color: [22, 163, 74] };
                    if (deviation <= 10) return { label: 'On Track', color: [34, 197, 94] };
                    if (deviation <= 20) return { label: 'Warning', color: [245, 158, 11] };
                    if (deviation <= 30) return { label: 'Alert', color: [249, 115, 22] };
                    return { label: 'Critical', color: [239, 68, 68] };
                };

                const checkPageBreak = (requiredHeight) => {
                    if (yPos + requiredHeight > pageHeight - bottomMargin) {
                        doc.addPage();
                        yPos = 20;
                        return true;
                    }
                    return false;
                };

                const addHeader = () => {
                    doc.setFillColor(23, 37, 84);
                    doc.rect(0, 0, pageWidth, 32, 'F');

                    doc.setFontSize(16);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(255, 255, 255);
                    doc.text('DEEVIA', margin, 14);

                    doc.setFontSize(5);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(150, 180, 255);
                    doc.text('DEEP VISION ANALYTICS', margin, 19);

                    doc.setFontSize(13);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(255, 255, 255);
                    doc.text('Trip History Report - Detailed', pageWidth / 2, 12, { align: 'center' });

                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(200, 220, 255);
                    const dateRangeLabel = historyDateRange.date_from && historyDateRange.date_to
                        ? `${formatDate(historyDateRange.date_from)} - ${formatDate(historyDateRange.date_to)}`
                        : 'All Time';
                    doc.text(dateRangeLabel, pageWidth / 2, 19, { align: 'center' });

                    doc.setFontSize(5);
                    doc.setTextColor(180, 200, 255);
                    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 20, { align: 'right' });
                };

                addHeader();
                yPos = 38;

                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(23, 37, 84);
                doc.text('SUMMARY METRICS', margin, yPos);
                yPos += 4;

                const summaryData = [
                    ['Total Completed', String(historyStats.total), 'On Time / Early', String(historyStats.onTimeEarly)],
                    ['Delayed', String(historyStats.delayed), 'Success Rate', `${onTimeRate}%`],
                    ['Avg Deviation', `${avgDeviation}m`, 'Avg Cycle Time', `${avgCycleTime}m`]
                ];

                autoTable(doc, {
                    startY: yPos,
                    body: summaryData,
                    theme: 'plain',
                    styles: { fontSize: 7, cellPadding: 2 },
                    columnStyles: {
                        0: { fontStyle: 'bold', cellWidth: 35, textColor: [100, 100, 100] },
                        1: { cellWidth: 30, fontStyle: 'bold', textColor: [23, 37, 84] },
                        2: { fontStyle: 'bold', cellWidth: 35, textColor: [100, 100, 100] },
                        3: { cellWidth: 30, fontStyle: 'bold', textColor: [23, 37, 84] }
                    },
                    margin: { left: margin, right: margin }
                });

                yPos = doc.lastAutoTable.finalY + 12;

                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(23, 37, 84);
                doc.text('ROUTE-WISE SUMMARY', margin, yPos);
                yPos += 4;

                const routeGroups = {};
                historyTrips.forEach(trip => {
                    const routeKey = `${trip.producer_id || '-'} → ${trip.consumer_id || '-'}`;
                    if (!routeGroups[routeKey]) {
                        routeGroups[routeKey] = {
                            trips: [],
                            totalCycleTime: 0,
                            totalDeviation: 0,
                            onTimeCount: 0,
                            deviationCount: 0,
                            cycleTimeCount: 0
                        };
                    }
                    routeGroups[routeKey].trips.push(trip);

                    if (trip.cycle_time_minutes) {
                        routeGroups[routeKey].totalCycleTime += trip.cycle_time_minutes;
                        routeGroups[routeKey].cycleTimeCount++;
                    }

                    let deviation = null;
                    if (trip.cycle_time_minutes && trip.expected_duration_minutes) {
                        deviation = trip.cycle_time_minutes - trip.expected_duration_minutes;
                        routeGroups[routeKey].totalDeviation += deviation;
                        routeGroups[routeKey].deviationCount++;
                        if (deviation <= 10) routeGroups[routeKey].onTimeCount++;
                    }
                });

                const routeSummaryData = Object.entries(routeGroups).map(([route, data]) => {
                    const avgCycle = data.cycleTimeCount > 0 ? Math.round(data.totalCycleTime / data.cycleTimeCount) : '-';
                    const avgDev = data.deviationCount > 0 ? (data.totalDeviation / data.deviationCount).toFixed(1) : '-';
                    const onTimeRate = data.deviationCount > 0 ? Math.round((data.onTimeCount / data.deviationCount) * 100) : '-';
                    return [
                        route,
                        String(data.trips.length),
                        avgCycle !== '-' ? `${avgCycle}m` : '-',
                        avgDev !== '-' ? `${avgDev > 0 ? '+' : ''}${avgDev}m` : '-',
                        `${data.onTimeCount}/${data.deviationCount > 0 ? data.deviationCount : data.trips.length}`,
                        onTimeRate !== '-' ? `${onTimeRate}%` : '-'
                    ];
                });

                autoTable(doc, {
                    startY: yPos,
                    head: [['Route', 'Trips', 'Avg Cycle', 'Avg Dev', 'On-Time', 'Rate']],
                    body: routeSummaryData,
                    theme: 'striped',
                    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 7 },
                    styles: { fontSize: 7, cellPadding: 2 },
                    columnStyles: {
                        0: { fontStyle: 'bold', cellWidth: 50 },
                        1: { cellWidth: 20, halign: 'center' },
                        2: { cellWidth: 25, halign: 'center' },
                        3: { cellWidth: 25, halign: 'center' },
                        4: { cellWidth: 25, halign: 'center' },
                        5: { cellWidth: 20, halign: 'center' }
                    },
                    margin: { left: margin, right: margin }
                });

                yPos = doc.lastAutoTable.finalY + 12;

                doc.setFontSize(9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(23, 37, 84);
                doc.text('DETAILED TRIP RECORDS', margin, yPos);
                yPos += 8;

                const TIMELINE_STAGES = [
                    { key: 'assigned_at', label: 'Assigned', short: 'ASN' },
                    { key: 'p_entered_at', label: 'Producer Entered', short: 'P.IN' },
                    { key: 'p_loading_start_at', label: 'Loading Started', short: 'L.ST' },
                    { key: 'p_loading_end_at', label: 'Loading Ended', short: 'L.EN' },
                    { key: 'p_exited_at', label: 'Producer Exited', short: 'P.OUT' },
                    { key: 'c_entered_at', label: 'Consumer Entered', short: 'C.IN' },
                    { key: 'c_unloading_start_at', label: 'Unloading Started', short: 'U.ST' },
                    { key: 'c_unloading_end_at', label: 'Unloading Ended', short: 'U.EN' },
                    { key: 'c_exited_at', label: 'Completed', short: 'DONE' }
                ];

                historyTrips.forEach((trip, tripIndex) => {
                    
                    checkPageBreak(75);

                    let tripDeviation = null;
                    if (trip.cycle_time_minutes && trip.expected_duration_minutes) {
                        tripDeviation = trip.cycle_time_minutes - trip.expected_duration_minutes;
                    }
                    const deviationInfo = getDeviationStatus(tripDeviation);

                    doc.setFillColor(59, 130, 246);
                    doc.rect(margin, yPos - 3, pageWidth - margin * 2, 10, 'F');

                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(255, 255, 255);
                    doc.text(`#${tripIndex + 1}  ${trip.trip_id || '-'}`, margin + 4, yPos + 3);

                    doc.setFontSize(7);
                    doc.text(`${trip.producer_id || '-'} → ${trip.consumer_id || '-'}`, pageWidth / 2, yPos + 3, { align: 'center' });
                    doc.text(`Asset: ${trip.torpedo_id || '-'}`, pageWidth - margin - 4, yPos + 3, { align: 'right' });

                    yPos += 12;

                    const summaryRowData = [[
                        `Actual: ${trip.cycle_time_minutes ? Math.round(trip.cycle_time_minutes) + 'm' : '-'}`,
                        `Expected: ${trip.expected_duration_minutes ? Math.round(trip.expected_duration_minutes) + 'm' : '-'}`,
                        `Deviation: ${tripDeviation !== null ? (tripDeviation > 0 ? '+' : '') + Math.round(tripDeviation) + 'm' : '-'}`,
                        `Status: ${deviationInfo.label}`,
                        `Completed: ${formatDateTime(trip.c_exited_at)}`
                    ]];

                    autoTable(doc, {
                        startY: yPos,
                        body: summaryRowData,
                        theme: 'plain',
                        styles: { fontSize: 6, cellPadding: 1.5 },
                        columnStyles: {
                            0: { fontStyle: 'bold', textColor: [23, 37, 84] },
                            1: { textColor: [100, 100, 100] },
                            2: { fontStyle: 'bold', textColor: deviationInfo.color },
                            3: { fontStyle: 'bold', textColor: deviationInfo.color },
                            4: { textColor: [100, 100, 100] }
                        },
                        margin: { left: margin, right: margin }
                    });

                    yPos = doc.lastAutoTable.finalY + 2;

                    const timelineData = TIMELINE_STAGES.map(stage => [
                        stage.short,
                        formatTime(trip[stage.key])
                    ]);

                    autoTable(doc, {
                        startY: yPos,
                        head: [['Stage', 'ASN', 'P.IN', 'L.ST', 'L.EN', 'P.OUT', 'C.IN', 'U.ST', 'U.EN', 'DONE']],
                        body: [[
                            'Time',
                            formatTime(trip.assigned_at),
                            formatTime(trip.p_entered_at),
                            formatTime(trip.p_loading_start_at),
                            formatTime(trip.p_loading_end_at),
                            formatTime(trip.p_exited_at),
                            formatTime(trip.c_entered_at),
                            formatTime(trip.c_unloading_start_at),
                            formatTime(trip.c_unloading_end_at),
                            formatTime(trip.c_exited_at)
                        ]],
                        theme: 'grid',
                        headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: 'bold', fontSize: 5, cellPadding: 1 },
                        styles: { fontSize: 5, cellPadding: 1, halign: 'center' },
                        columnStyles: { 0: { fontStyle: 'bold', halign: 'left' } },
                        margin: { left: margin, right: margin }
                    });

                    yPos = doc.lastAutoTable.finalY + 2;

                    const calcPhaseDuration = (start, end) => {
                        if (!start || !end) return null;
                        return Math.round((new Date(end) - new Date(start)) / 60000);
                    };

                    const loadingDuration = calcPhaseDuration(trip.assigned_at, trip.p_exited_at);
                    const transitDuration = calcPhaseDuration(trip.p_exited_at, trip.c_entered_at);
                    const unloadingDuration = calcPhaseDuration(trip.c_entered_at, trip.c_exited_at);

                    const expectedLoading = calcPhaseDuration(trip.assigned_at, trip.expected_p_exited_at);
                    const expectedTransit = calcPhaseDuration(trip.expected_p_exited_at, trip.expected_c_entered_at);
                    const expectedUnloading = calcPhaseDuration(trip.expected_c_entered_at, trip.expected_c_exited_at);

                    const phaseData = [[
                        'Loading Phase',
                        loadingDuration !== null ? `${loadingDuration}m` : '-',
                        expectedLoading !== null ? `${expectedLoading}m` : '-',
                        loadingDuration !== null && expectedLoading !== null
                            ? `${(loadingDuration - expectedLoading) > 0 ? '+' : ''}${loadingDuration - expectedLoading}m`
                            : '-'
                    ], [
                        'Transit Phase',
                        transitDuration !== null ? `${transitDuration}m` : '-',
                        expectedTransit !== null ? `${expectedTransit}m` : '-',
                        transitDuration !== null && expectedTransit !== null
                            ? `${(transitDuration - expectedTransit) > 0 ? '+' : ''}${transitDuration - expectedTransit}m`
                            : '-'
                    ], [
                        'Unloading Phase',
                        unloadingDuration !== null ? `${unloadingDuration}m` : '-',
                        expectedUnloading !== null ? `${expectedUnloading}m` : '-',
                        unloadingDuration !== null && expectedUnloading !== null
                            ? `${(unloadingDuration - expectedUnloading) > 0 ? '+' : ''}${unloadingDuration - expectedUnloading}m`
                            : '-'
                    ]];

                    autoTable(doc, {
                        startY: yPos,
                        head: [['Phase', 'Actual', 'Expected', 'Deviation']],
                        body: phaseData,
                        theme: 'striped',
                        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 5.5, cellPadding: 1 },
                        styles: { fontSize: 5.5, cellPadding: 1.5 },
                        columnStyles: {
                            0: { fontStyle: 'bold', cellWidth: 35 },
                            1: { cellWidth: 25, halign: 'center' },
                            2: { cellWidth: 25, halign: 'center' },
                            3: { cellWidth: 25, halign: 'center' }
                        },
                        margin: { left: margin, right: margin }
                    });

                    yPos = doc.lastAutoTable.finalY + 10;
                });

                const pageCount = doc.internal.getNumberOfPages();
                for (let i = 1; i <= pageCount; i++) {
                    doc.setPage(i);
                    const footerY = pageHeight - 8;

                    doc.setFillColor(248, 250, 252);
                    doc.rect(0, pageHeight - 18, pageWidth, 18, 'F');

                    doc.setDrawColor(23, 37, 84);
                    doc.setLineWidth(0.5);
                    doc.line(0, pageHeight - 18, pageWidth, pageHeight - 18);

                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(23, 37, 84);
                    doc.text('DEEVIA SOFTWARE INDIA PVT LTD', pageWidth / 2, footerY - 4, { align: 'center' });

                    doc.setFontSize(6);
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(100, 100, 100);
                    doc.text('Advanced Logistics Control & Operational Intelligence System', pageWidth / 2, footerY, { align: 'center' });

                    doc.setFontSize(7);
                    doc.setTextColor(80, 80, 80);
                    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, footerY - 2, { align: 'right' });
                }

                const fileName = `TripHistory_Detailed_${historyDateRange.date_from || 'all'}_${historyDateRange.date_to || 'time'}.pdf`;
                doc.save(fileName);
                showNotification('success', 'PDF exported successfully');
            } catch (error) {
                console.error('PDF Export Error:', error);
                showNotification('error', 'Failed to export PDF');
            } finally {
                setExportingPDF(false);
            }
        };

        const exportHistoryToCSV = () => {
            if (historyTrips.length === 0) {
                showNotification('warning', 'No trips to export');
                return;
            }

            setExportingCSV(true);

            try {
                
                const formatTimeCSV = (dateStr) => {
                    if (!dateStr) return '';
                    const d = new Date(dateStr);
                    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                };

                const formatDateTimeCSV = (dateStr) => {
                    if (!dateStr) return '';
                    const d = new Date(dateStr);
                    return d.toLocaleString('en-GB');
                };

                const getDeviationStatusLabel = (deviation) => {
                    if (deviation === null || deviation === undefined) return '';
                    if (deviation <= 0) return 'Early';
                    if (deviation <= 10) return 'On Track';
                    if (deviation <= 20) return 'Warning';
                    if (deviation <= 30) return 'Alert';
                    return 'Critical';
                };

                const headers = [
                    'Trip ID',
                    'Producer',
                    'Consumer',
                    'Route',
                    'Torpedo ID',
                    'Converter',
                    'Status',
                    'Assigned At',
                    'WB Tare Entry',
                    'Tare Recorded',
                    'Producer Entered',
                    'Loading Started',
                    'Loading Ended',
                    'Producer Exited',
                    'WB Gross Entry',
                    'Gross Recorded',
                    'Consumer Entered',
                    'Unloading Started',
                    'Unloading Ended',
                    'Completed At',
                    'Tare Weight (kg)',
                    'Gross Weight (kg)',
                    'Net Weight (kg)',
                    'Actual Cycle Time (min)',
                    'Expected Duration (min)',
                    'Deviation (min)',
                    'Deviation Status',
                    'Loading Phase (min)',
                    'Transit Phase (min)',
                    'Unloading Phase (min)'
                ];

                const rows = historyTrips.map(trip => {
                    
                    let deviation = null;
                    if (trip.cycle_time_minutes && trip.expected_duration_minutes) {
                        deviation = Math.round(trip.cycle_time_minutes - trip.expected_duration_minutes);
                    }

                    const calcPhaseDuration = (start, end) => {
                        if (!start || !end) return '';
                        return Math.round((new Date(end) - new Date(start)) / 60000);
                    };

                    const loadingDuration = calcPhaseDuration(trip.assigned_at, trip.p_exited_at);
                    const transitDuration = calcPhaseDuration(trip.p_exited_at, trip.c_entered_at);
                    const unloadingDuration = calcPhaseDuration(trip.c_entered_at, trip.c_exited_at);

                    return [
                        trip.trip_id || '',
                        trip.producer_id || '',
                        trip.consumer_id || '',
                        `${trip.producer_id || ''} → ${trip.consumer_id || ''}`,
                        trip.torpedo_id || '',
                        trip.converter_name || '',
                        trip.status === 13 ? 'Completed' : `Status ${trip.status}`,
                        formatDateTimeCSV(trip.assigned_at),
                        formatDateTimeCSV(trip.wb_tare_entry_at),
                        formatDateTimeCSV(trip.wb_tare_recorded_at),
                        formatDateTimeCSV(trip.p_entered_at),
                        formatDateTimeCSV(trip.p_loading_start_at),
                        formatDateTimeCSV(trip.p_loading_end_at),
                        formatDateTimeCSV(trip.p_exited_at),
                        formatDateTimeCSV(trip.wb_gross_entry_at),
                        formatDateTimeCSV(trip.wb_gross_recorded_at),
                        formatDateTimeCSV(trip.c_entered_at),
                        formatDateTimeCSV(trip.c_unloading_start_at),
                        formatDateTimeCSV(trip.c_unloading_end_at),
                        formatDateTimeCSV(trip.c_exited_at),
                        trip.tare_weight_kg ? trip.tare_weight_kg.toFixed(1) : '',
                        trip.gross_weight_kg ? trip.gross_weight_kg.toFixed(1) : '',
                        trip.net_weight_kg ? trip.net_weight_kg.toFixed(1) : '',
                        trip.cycle_time_minutes ? Math.round(trip.cycle_time_minutes) : '',
                        trip.expected_duration_minutes ? Math.round(trip.expected_duration_minutes) : '',
                        deviation !== null ? deviation : '',
                        getDeviationStatusLabel(deviation),
                        loadingDuration,
                        transitDuration,
                        unloadingDuration
                    ];
                });

                const escapeCSV = (value) => {
                    if (value === null || value === undefined) return '';
                    const str = String(value);
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                };

                const csvContent = [
                    headers.map(escapeCSV).join(','),
                    ...rows.map(row => row.map(escapeCSV).join(','))
                ].join('\n');

                // Add BOM for Excel compatibility
                const BOM = '\uFEFF';
                const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);

                const link = document.createElement('a');
                link.href = url;
                link.download = `TripHistory_${historyDateRange.date_from || 'all'}_${historyDateRange.date_to || 'time'}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                showNotification('success', 'CSV exported successfully');
            } catch (error) {
                console.error('CSV Export Error:', error);
                showNotification('error', 'Failed to export CSV');
            } finally {
                setExportingCSV(false);
                setShowExportMenu(false);
            }
        };

        // Calculate history statistics
        const historyStats = {
            total: historyTrips.length,
            onTimeEarly: 0,
            delayed: 0,
            totalDeviation: 0,
            totalCycleTime: 0,
            deviationCount: 0,
            cycleTimeCount: 0
        };

        historyTrips.forEach(trip => {
            // Use pre-calculated deviation from API if available, otherwise calculate
            let deviation = null;
            if (trip.total_deviation_minutes !== null && trip.total_deviation_minutes !== undefined) {
                deviation = trip.total_deviation_minutes;
            } else if (trip.cycle_time_minutes && trip.expected_duration_minutes) {
                deviation = trip.cycle_time_minutes - trip.expected_duration_minutes;
            } else if (trip.c_exited_at && trip.expected_c_exited_at) {
                deviation = (new Date(trip.c_exited_at) - new Date(trip.expected_c_exited_at)) / 60000;
            }

            if (deviation !== null) {
                historyStats.totalDeviation += deviation;
                historyStats.deviationCount++;
                if (deviation <= 10) { // On time or early (within 10 min threshold)
                    historyStats.onTimeEarly++;
                } else {
                    historyStats.delayed++;
                }
            }

            // Cycle time
            if (trip.cycle_time_minutes) {
                historyStats.totalCycleTime += trip.cycle_time_minutes;
                historyStats.cycleTimeCount++;
            }
        });

        const avgDeviation = historyStats.deviationCount > 0
            ? (historyStats.totalDeviation / historyStats.deviationCount).toFixed(1)
            : 0;
        const avgCycleTime = historyStats.cycleTimeCount > 0
            ? (historyStats.totalCycleTime / historyStats.cycleTimeCount).toFixed(0)
            : 0;
        const onTimeRate = historyStats.total > 0
            ? ((historyStats.onTimeEarly / historyStats.total) * 100).toFixed(0)
            : 0;

        // Compact KPI Card for History - full width distribution
        const HistoryKPICard = ({ label, value, subtext, color, icon: Icon }) => (
            <div style={{
                background: 'hsl(var(--card-bg))',
                border: '1px solid hsl(var(--border-color))',
                borderRadius: '10px',
                padding: '14px 20px',
                flex: 1,
                minWidth: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <Icon size={16} style={{ color }} />
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</span>
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                {subtext && <div style={{ fontSize: '0.65rem', color: 'hsl(var(--text-muted))', marginTop: '6px' }}>{subtext}</div>}
            </div>
        );

        if (historyTrips.length === 0) {
            return (
                <EmptyState icon={History} title="Archive Empty" description="No completed trips were found in the archive. Completed shipments will appear here for record-keeping." />
            )
        }

        return (
            <div className="tab-pane active animate-in fade-in duration-300" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* History KPI Summary Cards */}
                <div style={{ display: 'flex', gap: '16px' }}>
                    <HistoryKPICard label="Total Completed" value={historyStats.total} color="#3b82f6" icon={CheckCircle2} />
                    <HistoryKPICard label="On Time / Early" value={historyStats.onTimeEarly} subtext={`${onTimeRate}% success`} color="#22c55e" icon={TrendingUp} />
                    <HistoryKPICard label="Delayed" value={historyStats.delayed} color={historyStats.delayed> 0 ? '#f59e0b' : '#22c55e'} icon={AlertTriangle} />
                    <HistoryKPICard label="Avg Deviation" value={`${avgDeviation> 0 ? '+' : ''}${avgDeviation}m`} color={avgDeviation> 10 ? '#f59e0b' : avgDeviation> 0 ? '#3b82f6' : '#22c55e'} icon={Clock} />
                    <HistoryKPICard label="Avg Cycle Time" value={`${avgCycleTime}m`} color="#6366f1" icon={Timer} />
                </div>

                <div className="premium-card history-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, marginBottom: 0 }}>
                    <div className="premium-card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <History size={18} style={{ color: 'hsl(var(--accent))' }} />
                            <h3 style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>History</h3>
                        </div>
                        <div className="premium-action-bar" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            {/* Date Range Presets */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                                {DATE_PRESETS.map(preset => (
                                    <button
                                        key={preset.id}
                                        onClick={() => applyDatePreset(preset.id)}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '6px',
                                            border: historyDatePreset === preset.id ? '1px solid hsl(var(--accent))' : '1px solid hsl(var(--border-color))',
                                            background: historyDatePreset === preset.id ? 'hsl(var(--accent) / 0.1)' : 'transparent',
                                            color: historyDatePreset === preset.id ? 'hsl(var(--accent))' : 'hsl(var(--text-muted))',
                                            fontSize: '0.7rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        {preset.label}
                                    </button>
                                ))}

                                {/* Custom Date Picker Dropdown */}
                                {showDatePicker && (
                                    <>
                                        <div onClick={() => setShowDatePicker(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} />
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            right: 0,
                                            marginTop: '8px',
                                            background: 'hsl(var(--card-bg))',
                                            borderRadius: '12px',
                                            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                                            padding: '16px',
                                            zIndex: 100,
                                            minWidth: '280px',
                                            border: '1px solid hsl(var(--border-color))'
                                        }}>
                                            <div style={{ marginBottom: '12px', fontWeight: 700, color: 'hsl(var(--primary))', fontSize: '0.8rem' }}>
                                                Custom Date Range
                                            </div>
                                            <div style={{ marginBottom: '12px' }}>
                                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.7rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>
                                                    From Date
                                                </label>
                                                <input
                                                    type="date"
                                                    value={historyDateRange.date_from || ''}
                                                    onChange={(e) => setHistoryDateRange(prev => ({ ...prev, date_from: e.target.value }))}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px 12px',
                                                        border: '1px solid hsl(var(--border-color))',
                                                        borderRadius: '6px',
                                                        fontSize: '0.85rem',
                                                        background: 'hsl(var(--main-bg))'
                                                    }}
                                                />
                                            </div>
                                            <div style={{ marginBottom: '16px' }}>
                                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.7rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>
                                                    To Date
                                                </label>
                                                <input
                                                    type="date"
                                                    value={historyDateRange.date_to || ''}
                                                    onChange={(e) => setHistoryDateRange(prev => ({ ...prev, date_to: e.target.value }))}
                                                    style={{
                                                        width: '100%',
                                                        padding: '10px 12px',
                                                        border: '1px solid hsl(var(--border-color))',
                                                        borderRadius: '6px',
                                                        fontSize: '0.85rem',
                                                        background: 'hsl(var(--main-bg))'
                                                    }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button
                                                    onClick={() => {
                                                        setHistoryDateRange({ date_from: '', date_to: '' });
                                                        setHistoryDatePreset('all');
                                                        setShowDatePicker(false);
                                                    }}
                                                    style={{
                                                        flex: 1,
                                                        padding: '10px',
                                                        background: 'hsl(var(--main-bg))',
                                                        border: '1px solid hsl(var(--border-color))',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        color: 'hsl(var(--text-muted))'
                                                    }}
                                                >
                                                    Clear
                                                </button>
                                                <button
                                                    onClick={() => setShowDatePicker(false)}
                                                    style={{
                                                        flex: 1,
                                                        padding: '10px',
                                                        background: 'hsl(var(--accent))',
                                                        border: 'none',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600,
                                                        color: 'white'
                                                    }}
                                                >
                                                    Apply
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Search Box */}
                            <div className="premium-search-box">
                                <Search size={14} />
                                <input type="text" placeholder="Search history..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            </div>

                            {/* Export Dropdown */}
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={() => setShowExportMenu(!showExportMenu)}
                                    disabled={(exportingPDF || exportingCSV) || historyTrips.length === 0}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: historyTrips.length > 0 ? 'hsl(var(--accent))' : 'hsl(var(--border-color))',
                                        color: historyTrips.length > 0 ? 'white' : 'hsl(var(--text-muted))',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        cursor: historyTrips.length > 0 ? 'pointer' : 'not-allowed',
                                        transition: 'all 0.2s',
                                        opacity: (exportingPDF || exportingCSV) ? 0.7 : 1
                                    }}
                                >
                                    {(exportingPDF || exportingCSV) ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                    Export
                                    <ChevronDown size={14} style={{ marginLeft: '2px' }} />
                                </button>

                                {/* Export Menu Dropdown */}
                                {showExportMenu && (
                                    <>
                                        <div onClick={() => setShowExportMenu(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }} />
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            right: 0,
                                            marginTop: '4px',
                                            background: 'hsl(var(--card-bg))',
                                            borderRadius: '8px',
                                            boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                                            border: '1px solid hsl(var(--border-color))',
                                            zIndex: 100,
                                            minWidth: '160px',
                                            overflow: 'hidden'
                                        }}>
                                            <button
                                                onClick={() => { exportHistoryToPDF(); setShowExportMenu(false); }}
                                                disabled={exportingPDF}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '10px',
                                                    width: '100%',
                                                    padding: '12px 16px',
                                                    border: 'none',
                                                    background: 'transparent',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    color: 'hsl(var(--text-primary))',
                                                    textAlign: 'left',
                                                    transition: 'background 0.15s'
                                                }}
                                                onMouseOver={(e) => e.target.style.background = 'hsl(var(--accent) / 0.1)'}
                                                onMouseOut={(e) => e.target.style.background = 'transparent'}
                                            >
                                                <FileText size={16} style={{ color: '#ef4444' }} />
                                                Export as PDF
                                            </button>
                                            <div style={{ height: '1px', background: 'hsl(var(--border-color))' }} />
                                            <button
                                                onClick={exportHistoryToCSV}
                                                disabled={exportingCSV}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '10px',
                                                    width: '100%',
                                                    padding: '12px 16px',
                                                    border: 'none',
                                                    background: 'transparent',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    color: 'hsl(var(--text-primary))',
                                                    textAlign: 'left',
                                                    transition: 'background 0.15s'
                                                }}
                                                onMouseOver={(e) => e.target.style.background = 'hsl(var(--accent) / 0.1)'}
                                                onMouseOut={(e) => e.target.style.background = 'transparent'}
                                            >
                                                <FileSpreadsheet size={16} style={{ color: '#22c55e' }} />
                                                Export as CSV
                                            </button>
                                            <div style={{ height: '1px', background: 'hsl(var(--border-color))' }} />
                                            <button
                                                onClick={openEmailDialog}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '10px',
                                                    width: '100%',
                                                    padding: '12px 16px',
                                                    border: 'none',
                                                    background: 'transparent',
                                                    cursor: 'pointer',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    color: 'hsl(var(--text-primary))',
                                                    textAlign: 'left',
                                                    transition: 'background 0.15s'
                                                }}
                                                onMouseOver={(e) => e.target.style.background = 'hsl(var(--accent) / 0.1)'}
                                                onMouseOut={(e) => e.target.style.background = 'transparent'}
                                            >
                                                <Mail size={16} style={{ color: '#3b82f6' }} />
                                                Send via Email
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="table-scroll-wrapper" style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-secondary)' }}>
                        <table className="premium-archive-table">
                            <thead>
                                <tr>
                                    <th className="col-id"><SortHeader label="TRIP IDENTITY" sortKey="trip_id" /></th>
                                    <th className="col-route"><div className="header-label">ROUTE TRANSIT</div></th>
                                    <th className="col-asset"><SortHeader label="ASSET" sortKey="torpedo_id" /></th>
                                    <th className="col-converter"><SortHeader label="CONVERTER" sortKey="converter_name" /></th>
                                    <th className="col-weight"><SortHeader label="TARE (kg)" sortKey="tare_weight_kg" /></th>
                                    <th className="col-weight"><SortHeader label="GROSS (kg)" sortKey="gross_weight_kg" /></th>
                                    <th className="col-weight"><SortHeader label="NET (kg)" sortKey="net_weight_kg" /></th>
                                    <th className="col-dest"><SortHeader label="DESTINATION REACHED" sortKey="c_exited_at" /></th>
                                    <th className="col-cycle"><SortHeader label="CYCLE TIME" sortKey="cycle_time_minutes" style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }} /></th>
                                </tr>
                            </thead>
                            <tbody>
                                {historyTrips.length === 0 ? (
                                    <tr>
                                        <td colSpan="10" style={{ height: '300px', textAlign: 'center', background: '#f8fafc' }}>
                                            <div style={{ opacity: 0.5, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                                                <History size={48} strokeWidth={1} />
                                                <div style={{ fontWeight: 600 }}>No archive records found</div>
                                                <div style={{ fontSize: '0.8rem' }}>Try adjusting your search or check back later.</div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    historyTrips.map((trip, idx) => {
                                        const isExpanded = expandedTripId === trip.trip_id;
                                        const cycleTime = trip.cycle_time_minutes || 0;
                                        const cycleClass = cycleTime < 60 ? 'good' : cycleTime < 120 ? 'warning' : 'critical';

                                        return (
                                            <Fragment key={trip.id}>
                                                <tr className={`archive-row ${isExpanded ? 'active' : ''} ${idx % 2 === 0 ? 'even' : 'odd'}`} onClick={() => setExpandedTripId(isExpanded ? null : trip.trip_id)}>
                                                    <td>
                                                        <div className="trip-id-flex">
                                                            <ChevronRight size={14} className={`expand-icon ${isExpanded ? 'active' : ''}`} />
                                                            <span className="ref-id">{trip.trip_id}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="route-ref">
                                                            <span className="node-pill producer larg">{trip.producer_id}</span>
                                                            <ArrowRight size={12} className="flow-arrow" />
                                                            <span className="node-pill consumer larg">{trip.consumer_id}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="asset-ref">
                                                            <span className="asset-icon">🚂</span>
                                                            <span className="asset-name">{trip.torpedo_id || '---'}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <div className="asset-ref">
                                                            {trip.converter_name ? (
                                                                <span className="asset-name">{trip.converter_name}</span>
                                                            ) : (
                                                                <span className="asset-name" style={{ opacity: 0.4 }}>---</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="weight-value">{trip.tare_weight_kg ? trip.tare_weight_kg.toFixed(1) : '—'}</span>
                                                    </td>
                                                    <td>
                                                        <span className="weight-value">{trip.gross_weight_kg ? trip.gross_weight_kg.toFixed(1) : '—'}</span>
                                                    </td>
                                                    <td>
                                                        <span className="weight-value" style={{ fontWeight: trip.net_weight_kg ? 700 : 400 }}>{trip.net_weight_kg ? trip.net_weight_kg.toFixed(1) : '—'}</span>
                                                    </td>
                                                    <td>
                                                        <div className="timestamp-ref">
                                                            {trip.c_exited_at
                                                                ? new Date(trip.c_exited_at).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '')
                                                                : '---'}
                                                        </div>
                                                    </td>
                                                    <td className="text-right">
                                                        <div className={`cycle-ref ${cycleClass}`} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: '3px' }}>
                                                            <strong>{Math.floor(cycleTime)}</strong>
                                                            <span className="unit">MIN</span>
                                                            <strong style={{ fontSize: '0.9rem', opacity: 0.9 }}>{Math.round((cycleTime % 1) * 60)}</strong>
                                                            <span className="unit">SEC</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr className="detail-reveal-row">
                                                        <td colSpan="10">
                                                            <div className="timeline-reveal-container">
                                                                <LifecycleTimeline trip={trip} />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                        {historyTrips.length > 0 && (
                            <div style={{ padding: '24px', display: 'flex', justifyContent: 'center', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                                <button className="load-more-btn">
                                    LOAD MORE COLLECTIONS
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="strategic-command-center animate-in fade-in duration-700" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <main className="main-content-workspace" style={{ flex: 1, padding: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'hsl(var(--main-bg))', minHeight: 0 }}>
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'dispatch' && renderDispatch()}
                {activeTab === 'tracking' && renderTracking()}
                {activeTab === 'history' && renderHistory()}
            </main>

            <style>{`
                .switcher-tabs {
                    display: flex;
                    background: #1e293b;
                    padding: 3px;
                    border-radius: 10px;
                    gap: 4px;
                }

                .tab-btn {
                    padding: 6px 14px;
                    border-radius: 6px;
                    border: none;
                    background: transparent;
                    color: #94a3b8;
                    font-size: 0.65rem;
                    font-weight: 800;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s;
                }

                .tab-btn.active {
                    background: var(--bg-secondary);
                    color: hsl(var(--primary));
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
                }

                .strategic-command-center {
                    display: flex !important;
                    flex-direction: column !important;
                    background: hsl(var(--main-bg));
                    height: 100vh;
                    overflow: hidden;
                }

                .main-content-workspace {
                    background: hsl(var(--main-bg));
                }

                .premium-card.dispatch-card {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .premium-card.dispatch-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 12px 24px rgba(0,0,0,0.05);
                }

                .icon-btn {
                    width: 32px;
                    height: 32px;
                    border-radius: 8px;
                    border: 1px solid hsl(var(--border-color));
                    background: var(--bg-secondary);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    color: hsl(var(--text-muted));
                    transition: all 0.2s;
                }

                .icon-btn:hover {
                    background: hsl(var(--main-bg));
                    color: hsl(var(--primary));
                    border-color: hsl(var(--primary) / 0.3);
                }

                .icon-btn.danger:hover {
                    background: hsl(var(--destructive) / 0.05);
                    color: hsl(var(--destructive));
                    border-color: hsl(var(--destructive) / 0.3);
                }

                .premium-select {
                    appearance: none;
                    padding: 0 16px;
                    background: hsl(var(--main-bg));
                    border: 1px solid hsl(var(--border-color));
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: hsl(var(--primary));
                }

                .premium-select:focus {
                    outline: none;
                    border-color: hsl(var(--accent));
                    box-shadow: 0 0 0 4px hsl(var(--accent) / 0.1);
                }

                .hover-glow:hover {
                    box-shadow: 0 0 20px hsl(var(--accent) / 0.1) !important;
                }

                @keyframes pulse {
                    0% { transform: scale(0.95); opacity: 0.8; }
                    50% { transform: scale(1.05); opacity: 1; }
                    100% { transform: scale(0.95); opacity: 0.8; }
                }

                .table-scroll-wrapper::-webkit-scrollbar {
                    width: 8px;
                }
                .table-scroll-wrapper::-webkit-scrollbar-thumb {
                    background: hsl(var(--primary) / 0.1);
                    border-radius: 4px;
                }
                .table-scroll-wrapper::-webkit-scrollbar-thumb:hover {
                    background: hsl(var(--primary) / 0.2);
                }

                .dispatch-table {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                }

                .dispatch-table th {
                    text-align: left;
                    padding: 12px 16px;
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    color: #64748b;
                    font-weight: 800;
                    letter-spacing: 0.05em;
                    border-bottom: 1px solid hsl(var(--border-color));
                }

                .sortable-header {
                    transition: all 0.2s;
                }
                .sortable-header:hover {
                    background: hsl(var(--main-bg)) !important;
                    color: hsl(var(--accent)) !important;
                }
                .sortable-header.active {
                    color: hsl(var(--accent)) !important;
                    background: hsl(var(--accent) / 0.05) !important;
                }

                .dispatch-table td {
                    padding: 12px 16px;
                    border-bottom: 1px solid hsl(var(--border-color));
                    font-size: 0.85rem;
                    vertical-align: middle;
                    transition: background 0.2s;
                }

                .dispatch-table tr:hover td {
                    background: var(--bg-primary);
                }

                .dispatch-table tr.selected td {
                    background: hsl(var(--accent) / 0.08);
                }
                
                .dispatch-table tr.selected td:first-child {
                    border-left: 3px solid #3b82f6; 
                }
                
                .dispatch-table tr:not(.selected) td:first-child {
                    border-left: 3px solid transparent; 
                }

                .checkbox-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    padding: 0;
                }

                .monospace-id {
                    font-family: 'JetBrains Mono', 'Fira Code', monospace;
                    font-weight: 600;
                    color: hsl(var(--primary));
                    font-size: 0.8rem;
                }

                .badge-pill {
                    padding: 4px 10px;
                    border-radius: 99px;
                    font-size: 0.7rem;
                    font-weight: 800;
                }
                .badge-pill.source { background: hsl(var(--accent) / 0.1); color: hsl(var(--accent)); }
                .badge-pill.target { background: hsl(var(--success) / 0.1); color: hsl(var(--success)); }

                .table-select {
                    appearance: none;
                    background: var(--bg-secondary);
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 8px;
                    padding: 8px 32px 8px 12px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: hsl(var(--primary));
                    width: 100%;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .table-select:hover { border-color: hsl(var(--accent)); }
                .table-select:focus { outline: none; border-color: hsl(var(--accent)); box-shadow: 0 0 0 3px hsl(var(--accent) / 0.1); }
                
                .select-wrapper { position: relative; width: 180px; }
                .select-arrow { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; opacity: 0.5; }

                .view-toggle-btn {
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: none;
                    background: transparent;
                    border-radius: 6px;
                    cursor: pointer;
                    color: hsl(var(--text-muted));
                    transition: all 0.2s;
                }
                .view-toggle-btn.active {
                    background: var(--bg-secondary);
                    color: hsl(var(--primary));
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }

                .view-toggle-btn.active {
                    background: var(--bg-secondary);
                    color: hsl(var(--primary));
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }

                .history-container {
                    background: var(--bg-secondary);
                }

                .premium-archive-table {
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                    background: var(--bg-secondary);
                }

                .premium-archive-table thead th {
                    text-align: left;
                    padding: 0;
                    background: var(--bg-primary);
                    color: hsl(var(--text-main));
                    border-bottom: 2px solid hsl(var(--border-color) / 0.5);
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }

                .header-label {
                    padding: 16px 24px;
                    color: hsl(var(--accent));
                    font-family: 'Space Grotesk', sans-serif;
                    font-size: 0.7rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                }

                .col-id { width: 18%; }
                .col-route { width: 14%; }
                .col-asset { width: 8%; }
                .col-converter { width: 9%; }
                .col-weight { width: 7%; }
                .col-dest { width: 14%; }
                .col-cycle { width: 9%; }

                .weight-value {
                    font-size: 0.82rem;
                    color: hsl(var(--text-main));
                    font-variant-numeric: tabular-nums;
                }

                .archive-row td {
                    height: 52px;
                    padding: 0 24px;
                    border-bottom: 1px solid hsl(var(--border-color) / 0.2);
                    color: hsl(var(--text-main));
                    font-size: 0.88rem;
                    vertical-align: middle;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    transition: background 0.15s ease;
                }

                .archive-row.even td { background: var(--bg-secondary); }
                .archive-row.odd td { background: var(--bg-primary); }

                .archive-row:hover td {
                    background: hsl(var(--accent) / 0.02) !important;
                }

                .archive-row.active td {
                    background: hsl(var(--accent) / 0.05) !important;
                    border-bottom: 1px solid transparent;
                }

                .node-pill.larg {
                    padding: 5px 12px;
                    font-size: 13px;
                    font-weight: 800;
                    border-radius: 6px;
                }

                .node-pill.producer { background: hsl(var(--accent) / 0.08); color: hsl(var(--accent)); }
                .node-pill.consumer { background: hsl(var(--success) / 0.08); color: hsl(var(--success)); }

                .expand-icon {
                    transition: transform 0.2s ease;
                    color: hsl(var(--text-muted));
                    opacity: 0.5;
                    margin-right: 8px;
                }
                .expand-icon.active { transform: rotate(90deg); color: hsl(var(--accent)); opacity: 1; }

                .ref-id {
                    font-family: 'JetBrains Mono', monospace;
                    font-weight: 700;
                    color: hsl(var(--primary));
                    font-size: 0.82rem;
                }

                .cycle-ref {
                    display: flex;
                    align-items: baseline;
                    gap: 4px;
                    justify-content: flex-end;
                    font-weight: 800;
                }
                .cycle-ref.good { color: hsl(var(--success)); }
                .cycle-ref.warning { color: #f59e0b; }
                .cycle-ref.critical { color: #ef4444; }
                .cycle-ref strong { font-family: 'Space Grotesk', sans-serif; font-size: 1.1rem; }
                .cycle-ref .unit { font-size: 0.6rem; opacity: 0.6; }

                .premium-action-bar {
                    display: flex;
                    gap: 12px;
                    align-items: center;
                }

                .premium-search-box {
                    position: relative;
                    display: flex;
                    align-items: center;
                    background: hsl(var(--main-bg) / 0.3);
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: 1px solid hsl(var(--border-color));
                    width: 280px;
                }

                .premium-search-box input {
                    background: none;
                    border: none;
                    margin-left: 10px;
                    font-size: 0.85rem;
                    width: 100%;
                    outline: none;
                }

                .load-more-btn {
                    padding: 10px 24px;
                    border-radius: 6px;
                    border: 1px solid hsl(var(--border-color));
                    background: var(--bg-secondary);
                    color: hsl(var(--text-muted));
                    font-size: 0.7rem;
                    font-weight: 800;
                    letter-spacing: 0.05em;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .load-more-btn:hover {
                    background: hsl(var(--main-bg));
                    color: hsl(var(--primary));
                    border-color: hsl(var(--accent) / 0.3);
                }

                .ref-id {
                    font-family: 'JetBrains Mono', monospace;
                    font-weight: 700;
                    color: hsl(var(--text-main));
                    font-size: 0.85rem;
                    letter-spacing: -0.01em;
                }

                .archive-row.active .ref-id {
                    color: hsl(var(--accent));
                }

                .route-ref {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .node-pill {
                    padding: 3px 10px;
                    border-radius: 6px;
                    font-weight: 800;
                    font-size: 0.7rem;
                    letter-spacing: 0.03em;
                }

                .node-pill.producer {
                    background: hsl(var(--accent) / 0.08);
                    color: hsl(var(--accent));
                }

                .node-pill.consumer {
                    background: hsl(var(--success) / 0.08);
                    color: hsl(var(--success));
                }

                .flow-arrow {
                    opacity: 0.2;
                    color: hsl(var(--text-main));
                }

                .asset-ref {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 700;
                    color: hsl(var(--primary));
                    font-size: 0.9rem;
                }

                .asset-icon { opacity: 0.8; }

                .timestamp-ref {
                    font-weight: 700;
                    color: hsl(var(--primary));
                    font-size: 0.85rem;
                    font-family: 'Inter', sans-serif;
                }

                .cycle-ref {
                    display: flex;
                    align-items: baseline;
                    gap: 6px;
                    justify-content: flex-end;
                }

                .cycle-ref strong {
                    font-size: 1.15rem;
                    font-weight: 900;
                    color: hsl(var(--primary));
                    font-family: 'Space Grotesk', sans-serif;
                }

                .cycle-ref .unit {
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: hsl(var(--text-muted));
                    letter-spacing: 0.05em;
                }

                .timeline-reveal-container {
                    padding: 8px 32px 32px 80px;
                    background: linear-gradient(to bottom, var(--bg-secondary), hsl(var(--accent) / 0.02));
                    border-bottom: 2px solid hsl(var(--accent) / 0.1);
                    animation: slideDown 0.3s ease-out;
                }

                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-5px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .timeline-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
                    gap: 12px;
                    position: relative;
                }

                .timeline-step {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    position: relative;
                }

                .step-marker {
                    display: flex;
                    align-items: center;
                    width: 100%;
                }

                .marker-dot {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: var(--bg-secondary);
                    border: 2px solid hsl(var(--border-color));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: hsl(var(--text-muted));
                    z-index: 2;
                }

                .timeline-step.completed .marker-dot {
                    border-color: hsl(var(--success));
                    background: hsl(var(--success) / 0.1);
                    color: hsl(var(--success));
                }

                .step-line {
                    flex: 1;
                    height: 2px;
                    background: hsl(var(--border-color));
                    margin-left: -2px;
                    z-index: 1;
                }

                .timeline-step.completed .step-line {
                    background: hsl(var(--success));
                }

                .step-details {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .step-label {
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: hsl(var(--primary));
                    text-transform: uppercase;
                    letter-spacing: 0.02em;
                }

                .step-time {
                    font-size: 0.75rem;
                    font-weight: 700;
                    font-family: 'JetBrains Mono', monospace;
                    color: hsl(var(--text-main));
                }

                .monospace-id {
                    font-family: 'JetBrains Mono', monospace;
                    letter-spacing: -0.02em;
                }

                .bulk-action-bar {
                    position: absolute;
                    bottom: 24px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: var(--bg-secondary);
                    padding: 12px 24px;
                    borderRadius: 16px;
                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 0 0 1px hsl(var(--border-color));
                    z-index: 100;
                }
                
                .filter-group { display: flex; gap: 8px; align-items: center; }
                .filter-select {
                    appearance: none;
                    background: var(--bg-secondary);
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 8px;
                    padding: 6px 12px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    cursor: pointer;
                }
                .filter-select:hover { color: hsl(var(--primary)); border-color: hsl(var(--primary)); }

                .workflow-modal {
                    border-radius: 24px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                    max-height: calc(100vh - var(--header-height) - 48px);
                }

                .workflow-timeline-item {
                    display: flex;
                    gap: 16px;
                    min-height: 60px;
                }

                .timeline-connector {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 24px;
                }

                .timeline-dot {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    border: 2px solid hsl(var(--border-color));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--bg-secondary);
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: hsl(var(--text-muted));
                    z-index: 2;
                    flex-shrink: 0;
                }

                .timeline-line {
                    width: 2px;
                    flex: 1;
                    background: hsl(var(--border-color));
                    margin-top: -2px;
                    margin-bottom: -2px;
                }

                .workflow-timeline-item.completed .timeline-dot {
                    background: hsl(var(--success));
                    border-color: hsl(var(--success));
                    color: white;
                }

                .workflow-timeline-item.completed .timeline-line {
                    background: hsl(var(--success));
                }

                .workflow-timeline-item.next .timeline-dot {
                    background: hsl(var(--accent) / 0.1);
                    border-color: hsl(var(--accent));
                    color: hsl(var(--accent));
                    box-shadow: 0 0 0 4px hsl(var(--accent) / 0.1);
                }

                .timeline-content {
                    flex: 1;
                    padding-bottom: 24px;
                }

                .step-label-main {
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: hsl(var(--text-main));
                }

                .workflow-timeline-item.completed .step-label-main {
                    color: hsl(var(--text-muted));
                    text-decoration: line-through;
                    opacity: 0.7;
                }

                .step-timestamp {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.75rem;
                    font-weight: 800;
                    color: hsl(var(--success));
                    background: hsl(var(--success) / 0.08);
                    padding: 2px 10px;
                    border-radius: 6px;
                    font-family: 'JetBrains Mono', monospace;
                }

                .action-btn-workflow {
                    margin-top: 8px;
                    width: 100%;
                    padding: 10px;
                    border-radius: 12px;
                    background: hsl(var(--accent));
                    color: white;
                    border: none;
                    font-size: 0.8rem;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 4px 12px hsl(var(--accent) / 0.3);
                }

                .action-btn-workflow:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 16px hsl(var(--accent) / 0.4);
                    background: hsl(217 91% 55%);
                }

                .waiting-badge {
                    margin-top: 8px;
                    padding: 8px;
                    border-radius: 10px;
                    background: hsl(var(--main-bg));
                    border: 1px dashed hsl(var(--border-color));
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .admin-footer-note {
                    padding: 16px;
                    background: hsl(var(--main-bg));
                    border-top: 1px solid hsl(var(--border-color));
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    opacity: 0.8;
                }
            `}</style>

            {
                showManageModal && selectedTrip && (
                    <div className="premium-modal-overlay">
                        <div className="premium-modal workflow-modal" style={{ maxWidth: '500px', width: '90%' }}>
                            <div className="premium-modal-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div className="pulse-dot"></div>
                                    <h3 style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800 }}>Trip Workflow</h3>
                                </div>
                                <button onClick={() => setShowManageModal(false)} className="close-btn">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="premium-modal-body" style={{ padding: '0', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                                {/* Trip Header Info */}
                                <div style={{ padding: '20px', background: 'hsl(var(--main-bg) / 0.5)', borderBottom: '1px solid hsl(var(--border-color))' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.02em' }}>{selectedTrip.trip_id}</div>
                                        <div className="premium-badge" style={{ background: `${getStatusColor(selectedTrip.status)}15`, color: getStatusColor(selectedTrip.status), border: `1px solid ${getStatusColor(selectedTrip.status)}30` }}>
                                            {getStatusLabel(selectedTrip.status)}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', fontWeight: 700, opacity: 0.7, flexWrap: 'wrap' }}>
                                        <span>🚂 <span style={{ color: 'hsl(var(--text-main))' }}>{selectedTrip.torpedo_id}</span></span>
                                        <span>📍 <span style={{ color: 'hsl(var(--text-main))' }}>{selectedTrip.producer_id} → {selectedTrip.consumer_id}</span></span>
                                        {selectedTrip.converter_name && (
                                            <span><span style={{ color: 'hsl(var(--primary))' }}>{selectedTrip.converter_name}</span></span>
                                        )}
                                    </div>
                                </div>

                                {/* Vertical Timeline UI */}
                                <div className="workflow-timeline-container" style={{ padding: '24px' }}>
                                    {[
                                        { id: 2, label: "WB Tare Entry", time: selectedTrip.wb_tare_entry_at, roles: ['admin', 'trs'] },
                                        { id: 3, label: "Tare Weight Recorded", time: selectedTrip.wb_tare_recorded_at, roles: ['admin', 'trs'] },
                                        { id: 4, label: "Entered Producer", time: selectedTrip.p_entered_at, roles: ['producer'] },
                                        { id: 5, label: "Start Loading", time: selectedTrip.p_loading_start_at, roles: ['producer'] },
                                        { id: 6, label: "Loading Done (Exit Cargo)", time: selectedTrip.p_loading_end_at, roles: ['producer'] },
                                        { id: 7, label: "Exit Producer (To Mainline)", time: selectedTrip.p_exited_at, roles: ['producer'] },
                                        { id: 8, label: "WB Gross Entry", time: selectedTrip.wb_gross_entry_at, roles: ['admin', 'trs'] },
                                        { id: 9, label: "Gross Weight Recorded", time: selectedTrip.wb_gross_recorded_at, roles: ['admin', 'trs'] },
                                        { id: 10, label: "Entered Consumer", time: selectedTrip.c_entered_at, roles: ['consumer'] },
                                        { id: 11, label: "Start Unloading", time: selectedTrip.c_unloading_start_at, roles: ['consumer'] },
                                        { id: 12, label: "Unloading Done", time: selectedTrip.c_unloading_end_at, roles: ['consumer'] },
                                        { id: 13, label: "Complete & Exit Consumer", time: selectedTrip.c_exited_at, roles: ['consumer'] }
                                    ].map((step, idx, arr) => {
                                        const isCompleted = !!step.time;
                                        const isNext = selectedTrip.status === step.id - 1;
                                        const isFuture = selectedTrip.status < step.id - 1;
                                        const canAction = isNext && step.roles.includes(user.role);

                                        return (
                                            <div key={step.id} className={`workflow-timeline-item ${isCompleted ? 'completed' : isNext ? 'next' : 'future'}`}>
                                                <div className="timeline-connector">
                                                    <div className="timeline-dot">
                                                        {isCompleted ? <CheckCircle2 size={14} /> : <span>{step.id - 1}</span>}
                                                    </div>
                                                    {idx !== arr.length - 1 && <div className="timeline-line"></div>}
                                                </div>

                                                <div className="timeline-content">
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div className="step-label-main">{step.label}</div>
                                                        {isCompleted && (
                                                            <div className="step-timestamp">
                                                                <Clock size={10} />
                                                                {new Date(step.time).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} {new Date(step.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {canAction && (
                                                        <button className="action-btn-workflow animate-pulse" onClick={() => updateStatus(selectedTrip.trip_id, step.id)} disabled={statusUpdating}>
                                                            {statusUpdating ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />}
                                                            Update to {step.label}
                                                        </button>
                                                    )}

                                                    {isNext && !canAction && (
                                                        <div className="waiting-badge">
                                                            <Clock size={12} />
                                                            Waiting for {step.roles.includes('producer') ? 'Producer' : step.roles.includes('consumer') ? 'Consumer' : 'Weighbridge Operator'} Action
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {(user.role === 'admin' || user.role === 'trs') && (
                                <div className="admin-footer-note">
                                    <AlertCircle size={14} />
                                    <span>Administrator: View-only status monitoring enabled.</span>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Weighbridge Modal */}
            {showWBModal && (
                <WeighbridgeModal isOpen={showWBModal} onClose={() => setShowWBModal(false)} onSubmit={handleWBModalSubmit} recordType={wbModalData.recordType} tripId={wbModalData.tripId} torpedoId={wbModalData.torpedoId} producerId={wbModalData.producerId} consumerId={wbModalData.consumerId} />
            )}

            {/* Converter Distribution Modal */}
            {converterModalTrip && (
                <div className="premium-modal-overlay">
                    <div className="premium-modal" style={{ maxWidth: '560px' }}>
                        <div className="premium-modal-header">
                            <h3 style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800 }}>
                                Distribute Load
                            </h3>
                            <button onClick={handleConverterCancel} className="close-btn"><X size={18} /></button>
                        </div>
                        <div className="premium-modal-body" style={{ padding: '24px' }}>
                            {/* Trip info */}
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '14px 18px', borderRadius: '12px', marginBottom: '20px',
                                background: 'linear-gradient(145deg, hsl(var(--main-bg)) 0%, hsl(var(--card-bg) / 0.5) 100%)',
                                border: '1px solid hsl(var(--border-color) / 0.5)',
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Torpedo</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>{converterModalTrip.torpedo_id}</div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Consumer</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>{converterModalTrip.consumer_id}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Weight</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'hsl(var(--primary))' }}>
                                        {converterModalTrip.net_weight_kg ? `${(converterModalTrip.net_weight_kg / 1000).toFixed(3)}T` : 'N/A'}
                                    </div>
                                </div>
                            </div>

                            {/* Mode Toggle */}
                            <div style={{
                                display: 'flex', borderRadius: '10px', overflow: 'hidden', marginBottom: '20px',
                                border: '1px solid hsl(var(--border-color) / 0.5)',
                            }}>
                                {['equal', 'manual'].map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => {
                                            setDistributionMode(mode)
                                            if (mode === 'equal' && converters.length > 0 && converterModalTrip.net_weight_kg) {
                                                const perConv = Math.round((converterModalTrip.net_weight_kg / 1000 / converters.length) * 1000) / 1000
                                                const eq = {}
                                                converters.forEach(c => { eq[c.id] = perConv })
                                                setDistributions(eq)
                                            }
                                        }}
                                        style={{
                                            flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
                                            fontWeight: 600, fontSize: '0.82rem', transition: 'all 0.15s',
                                            background: distributionMode === mode ? 'hsl(var(--primary))' : 'hsl(var(--card-bg))',
                                            color: distributionMode === mode ? '#fff' : 'hsl(var(--text-muted))',
                                        }}
                                    >
                                        {mode === 'equal' ? 'Equal Distribution' : 'Manual Distribution'}
                                    </button>
                                ))}
                            </div>

                            {/* Remaining indicator for manual mode */}
                            {distributionMode === 'manual' && converterModalTrip.net_weight_kg && (
                                <div style={{
                                    padding: '10px 16px', borderRadius: '8px', marginBottom: '16px',
                                    background: (() => {
                                        const totalAllocated = Object.values(distributions).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
                                        const totalLoad = converterModalTrip.net_weight_kg / 1000
                                        const remaining = Math.round((totalLoad - totalAllocated) * 1000) / 1000
                                        return remaining === 0 ? 'hsl(var(--success) / 0.1)' : remaining < 0 ? 'hsl(var(--danger) / 0.1)' : 'hsl(var(--warning) / 0.1)'
                                    })(),
                                    fontSize: '0.82rem', fontWeight: 600, textAlign: 'center',
                                    color: (() => {
                                        const totalAllocated = Object.values(distributions).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
                                        const totalLoad = converterModalTrip.net_weight_kg / 1000
                                        const remaining = Math.round((totalLoad - totalAllocated) * 1000) / 1000
                                        return remaining === 0 ? 'hsl(var(--success))' : remaining < 0 ? 'hsl(var(--danger))' : 'hsl(var(--warning))'
                                    })(),
                                }}>
                                    {(() => {
                                        const totalAllocated = Object.values(distributions).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
                                        const totalLoad = converterModalTrip.net_weight_kg / 1000
                                        const remaining = Math.round((totalLoad - totalAllocated) * 1000) / 1000
                                        return remaining === 0 ? 'Fully allocated' : remaining > 0 ? `Remaining: ${remaining}T` : `Over-allocated by ${Math.abs(remaining)}T`
                                    })()}
                                </div>
                            )}

                            {/* Converter list */}
                            {loadingConverters ? (
                                <div style={{ textAlign: 'center', padding: '20px' }}>
                                    <Loader2 className="animate-spin" size={24} style={{ color: 'hsl(var(--primary))' }} />
                                </div>
                            ) : converters.length === 0 ? (
                                <div style={{ padding: '16px', borderRadius: '8px', background: 'hsl(var(--warning) / 0.1)', color: 'hsl(var(--warning))', fontSize: '0.85rem', marginBottom: '16px' }}>
                                    No running converters found. The system will auto-assign if you proceed.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                                    {converters.map(conv => (
                                        <div
                                            key={conv.id}
                                            style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '14px 16px', borderRadius: '10px',
                                                border: '1px solid hsl(var(--border-color) / 0.5)',
                                                background: 'hsl(var(--card-bg))',
                                            }}
                                        >
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{conv.name}</div>
                                                <div style={{ fontSize: '0.73rem', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                                                    {conv.equipment_type} · {conv.current_heats?.toLocaleString()}/{conv.max_heats?.toLocaleString()} heats
                                                    {conv.capacity_tons > 0 && ` · ${conv.capacity_tons}T capacity`}
                                                </div>
                                            </div>
                                            <div style={{ width: '110px', textAlign: 'right' }}>
                                                {distributionMode === 'equal' ? (
                                                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'hsl(var(--primary))' }}>
                                                        {(distributions[conv.id] || 0).toFixed(3)}T
                                                    </span>
                                                ) : (
                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        min="0"
                                                        value={distributions[conv.id] || ''}
                                                        onChange={e => setDistributions(prev => ({
                                                            ...prev,
                                                            [conv.id]: parseFloat(e.target.value) || 0
                                                        }))}
                                                        placeholder="0"
                                                        style={{
                                                            width: '100px', padding: '8px 10px', borderRadius: '8px',
                                                            border: '1px solid hsl(var(--border-color))',
                                                            background: 'hsl(var(--main-bg))', color: 'hsl(var(--text-main))',
                                                            fontSize: '0.9rem', fontWeight: 600, textAlign: 'right',
                                                            outline: 'none',
                                                        }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button onClick={handleConverterCancel} className="premium-btn secondary">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConverterConfirm}
                                    disabled={(() => {
                                        if (converters.length === 0) return false
                                        if (distributionMode === 'manual' && converterModalTrip.net_weight_kg) {
                                            const totalAllocated = Object.values(distributions).reduce((sum, v) => sum + (parseFloat(v) || 0), 0)
                                            const totalLoad = converterModalTrip.net_weight_kg / 1000
                                            return Math.abs(totalAllocated - totalLoad) > 0.1
                                        }
                                        return false
                                    })()}
                                    className="premium-btn primary"
                                >
                                    {converters.length === 0 ? 'Skip (Auto-assign)' : 'Confirm Distribution'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {
                showEditModal && (
                    <div className="premium-modal-overlay">
                        <div className="premium-modal" style={{ maxWidth: '500px' }}>
                            <div className="premium-modal-header">
                                <h3 style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800 }}>Edit Trip: <span style={{ color: 'hsl(var(--accent))' }}>{editForm.trip_id}</span></h3>
                                <button onClick={() => setShowEditModal(false)} className="close-btn">
                                    <X size={18} />
                                </button>
                            </div>
                            <form onSubmit={handleUpdateSubmit}>
                                <div className="premium-modal-body">
                                    <div style={{ display: 'grid', gap: '20px' }}>
                                        <div className="form-group">
                                            <CustomSelect label="Producer (BF)" required options={locations.producers.map(p => ({ value: p.user_id, label: `${p.user_id} - ${p.location_name}` }))} value={editForm.producer_id} onChange={val => setEditForm({ ...editForm, producer_id: val })} placeholder="Select Producer..." />
                                        </div>
                                        <div className="form-group">
                                            <CustomSelect label="Consumer (SMS)" required options={locations.consumers.map(c => ({ value: c.user_id, label: `${c.user_id} - ${c.location_name}` }))} value={editForm.consumer_id} onChange={val => setEditForm({ ...editForm, consumer_id: val })} placeholder="Select Consumer..." />
                                        </div>
                                        <div className="form-group">
                                            <CustomSelect label="Assign Torpedo" options={[ { value: '', label: 'No Torpedo (Pending)' }, ...assets.torpedoes.map(t => ({ value: t.fleet_id, label: t.fleet_id })), ...(editForm.torpedo_id && !assets.torpedoes.find(t => t.fleet_id === editForm.torpedo_id) ? [{ value: editForm.torpedo_id, label: `${editForm.torpedo_id} (Current)` }] : []) ]} value={editForm.torpedo_id} onChange={val => setEditForm({ ...editForm, torpedo_id: val })} placeholder="Select Torpedo..." />
                                        </div>
                                    </div>
                                </div>
                                <div className="premium-modal-footer">
                                    <button type="button" className="premium-btn secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
                                    <button type="submit" className="premium-btn primary" disabled={updatingTrip}>
                                        {updatingTrip ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                                        Update Details
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {
                showManualModal && (
                    <div className="premium-modal-overlay">
                        <div className="premium-modal" style={{ maxWidth: '500px' }}>
                            <div className="premium-modal-header">
                                <h3 style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800 }}>Create Manual Trip</h3>
                                <button onClick={() => setShowManualModal(false)} className="close-btn">
                                    <X size={18} />
                                </button>
                            </div>
                            <form onSubmit={handleCreateManual}>
                                <div className="premium-modal-body">
                                    <div style={{ display: 'grid', gap: '20px' }}>
                                        <div className="form-group">
                                            <CustomSelect label="Select Producer (BF)" required options={locations.producers.map(p => ({ value: p.user_id, label: `${p.user_id} - ${p.location_name}` }))} value={manualForm.producer_id} onChange={val => setManualForm({ ...manualForm, producer_id: val })} placeholder="Select Producer..." />
                                        </div>
                                        <div className="form-group">
                                            <CustomSelect label="Select Consumer (SMS)" required options={locations.consumers.map(c => ({ value: c.user_id, label: `${c.user_id} - ${c.location_name}` }))} value={manualForm.consumer_id} onChange={val => setManualForm({ ...manualForm, consumer_id: val })} placeholder="Select Consumer..." />
                                        </div>
                                        <div className="form-group">
                                            <CustomSelect label="Assign Torpedo (Optional)" options={[ { value: '', label: 'No Torpedo (Pending)' }, ...assets.torpedoes.map(t => ({ value: t.fleet_id, label: t.fleet_id })) ]} value={manualForm.torpedo_id} onChange={val => setManualForm({ ...manualForm, torpedo_id: val })} placeholder="Select Torpedo..." />
                                        </div>
                                    </div>
                                </div>
                                <div className="premium-modal-footer">
                                    <button type="button" className="premium-btn secondary" onClick={() => setShowManualModal(false)}>Cancel</button>
                                    <button type="submit" className="premium-btn primary" disabled={creatingManual}>
                                        {creatingManual ? <Loader2 className="animate-spin" size={16} /> : <PlusCircle size={16} />}
                                        Create Trip
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Email Dialog */}
            {
                showEmailDialog && (
                    <div className="premium-modal-overlay">
                        <div className="premium-modal" style={{ maxWidth: '450px' }}>
                            <div className="premium-modal-header">
                                <h3 style={{ margin: 0, fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800 }}>Send Trip History via Email</h3>
                                <button onClick={() => setShowEmailDialog(false)} className="close-btn">
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="premium-modal-body">
                                <p style={{ color: 'hsl(var(--text-secondary))', marginBottom: '20px', fontSize: '0.9rem' }}>
                                    The trip history report will be sent to the email address below.
                                </p>
                                <div className="form-group">
                                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.85rem' }}>
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        value={emailAddress}
                                        onChange={(e) => setEmailAddress(e.target.value)}
                                        placeholder="Enter email address..."
                                        style={{
                                            width: '100%',
                                            padding: '12px 16px',
                                            border: '1px solid hsl(var(--border-color))',
                                            borderRadius: '8px',
                                            fontSize: '0.9rem',
                                            background: 'hsl(var(--bg-primary))',
                                            color: 'hsl(var(--text-primary))'
                                        }}
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="premium-modal-footer">
                                <button type="button" className="premium-btn secondary" onClick={() => setShowEmailDialog(false)} disabled={sendingEmail}>
                                    Cancel
                                </button>
                                <button type="button" className="premium-btn primary" onClick={emailTripHistory} disabled={sendingEmail}>
                                    {sendingEmail ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />}
                                    {sendingEmail ? 'Sending...' : 'Send Email'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    )
}

export default TripManagement
