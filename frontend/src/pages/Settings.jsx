import { useState, useEffect } from 'react'
import { Plus, Trash2, MapPin, Factory, Minus, Edit2, X, Settings as SettingsIcon, Globe, Map as MapIcon, Users, User, Shield, Key, ChevronDown, Bell, LogOut, Check, Timer, Unlink, Lock, CheckCircle2, RefreshCw, MessageSquare, Phone, Calendar, Send, Loader2, AlertTriangle, RotateCcw } from 'lucide-react'
import wbridgeIcon from '../assets/wbridge.jpg'

const WbIcon = ({ size = 16, style = {} }) => (
    <img src={wbridgeIcon} alt="" style={{ width: size, height: size, objectFit: 'contain', mixBlendMode: 'multiply', ...style }} />
)
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'
import { useHeader } from '../context/HeaderContext'
import { api } from '../utils/api'
import { useTableSort } from '../hooks/useTableSort'

const Settings = () => {
    const { user: currentUser, logout } = useAuth()
    const { showNotification } = useNotification()
    const isAdmin = currentUser?.role === 'admin'
    const isTRS = currentUser?.role === 'trs'
    const isPPC = currentUser?.role === 'ppc'
    const isAdminOrTRS = isAdmin || isTRS

    const getDefaultTab = () => {
        if (isAdmin) return 'users'
        if (isTRS) return 'locations'
        return 'security'
    }
    const [activeTab, setActiveTab] = useState(getDefaultTab())
    const [locations, setLocations] = useState([])
    const [users, setUsers] = useState([])
    const [showForm, setShowForm] = useState(false)
    const [showUserForm, setShowUserForm] = useState(false)
    const [loading, setLoading] = useState(true)

    const [formData, setFormData] = useState({
        location_name: '',
        user_id: '',
        type: 'producer',
        x: '',
        y: '',
        is_visible: true
    })

    const [userFormData, setUserFormData] = useState({
        username: '',
        password: '',
        role: 'consumer',
        user_id: ''
    })

    const [defaultZoom, setDefaultZoom] = useState(parseInt(localStorage.getItem('hmd_map_zoom')) || 13)
    const [defaultStyle, setDefaultStyle] = useState(localStorage.getItem('hmd_map_style') || 'road')
    const [showTorpedoLegend, setShowTorpedoLegend] = useState(
        // default ON unless user explicitly disabled it
        localStorage.getItem('hmd_show_torpedo_legend') !== 'false'
    )
    const [editingId, setEditingId] = useState(null)
    const [editingUserId, setEditingUserId] = useState(null)
    const [systemStats, setSystemStats] = useState({
        backend: 'loading',
        db: 'loading',
        db_latency: '...',
        cpu: 0,
        memory: 0,
        uptime: '...',
        timestamp: null
    })

    const [showPasswordModal, setShowPasswordModal] = useState(false)
    const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
    const [passwordLoading, setPasswordLoading] = useState(false)

    const [weighbridges, setWeighbridges] = useState([])
    const [wbLoading, setWbLoading] = useState(false)
    const [showWbModal, setShowWbModal] = useState(false)
    const [editingWb, setEditingWb] = useState(null)
    const [wbForm, setWbForm] = useState({ name: '', location_name: '', x: '', y: '' })

    const [alertSettings, setAlertSettings] = useState(() => {
        const saved = localStorage.getItem('hmd_alert_settings')
        return saved ? JSON.parse(saved) : {
            warningThreshold: 10,
            alertThreshold: 20,
            criticalThreshold: 30,
            refreshInterval: 5
        }
    })
    const [thresholdsLoaded, setThresholdsLoaded] = useState(false)

    const [whatsappPrefs, setWhatsappPrefs] = useState({
        whatsapp_enabled: false,
        whatsapp_phone: '',
        whatsapp_language: 'en',
        whatsapp_trip_alerts: true,
        whatsapp_daily_report: true,
        whatsapp_deviation_alerts: true
    })
    const [whatsappLoading, setWhatsappLoading] = useState(true)
    const [whatsappSaving, setWhatsappSaving] = useState(false)

    const [whatsappStatus, setWhatsappStatus] = useState({ connected: false, state: 'unknown', loading: true })
    const [whatsappConfig, setWhatsappConfig] = useState({})
    const [whatsappConfigOriginal, setWhatsappConfigOriginal] = useState({})
    const [whatsappConfigLoading, setWhatsappConfigLoading] = useState(true)
    const [whatsappConfigSaving, setWhatsappConfigSaving] = useState(false)

    const hasWhatsappConfigChanges = JSON.stringify(whatsappConfig) !== JSON.stringify(whatsappConfigOriginal)
    const [groupMappings, setGroupMappings] = useState([])
    const [availableGroups, setAvailableGroups] = useState([])
    const [showQrModal, setShowQrModal] = useState(false)
    const [qrCode, setQrCode] = useState(null)
    const [qrLoading, setQrLoading] = useState(false)
    const [showAddGroupModal, setShowAddGroupModal] = useState(false)
    const [newGroupMapping, setNewGroupMapping] = useState({
        group_jid: '',
        group_name: '',
        mapping_type: 'producer',
        node_id: '',
        language_code: 'en',
        is_active: true,
        notifications_enabled: true,
        notify_trip_assigned: true,
        notify_trip_started: true,
        notify_trip_completed: true,
        notify_deviations: true,
        notify_daily_report: true
    })
    const [sendingTest, setSendingTest] = useState(false)
    const [producers, setProducers] = useState([])
    const [consumers, setConsumers] = useState([])
    const [dailyReportSchedule, setDailyReportSchedule] = useState({ scheduled: false, next_run: null, loading: true })
    const [sendingDailyReport, setSendingDailyReport] = useState(false)

    const [resetModalStep, setResetModalStep] = useState(0);
    const [resetCounts, setResetCounts] = useState(null);
    const [resetConfirmText, setResetConfirmText] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

    const [heatResetLoading, setHeatResetLoading] = useState(false);
    const [heatResetConfirm, setHeatResetConfirm] = useState(false);

    const [notifClearConfirm, setNotifClearConfirm] = useState(false);
    const [notifClearLoading, setNotifClearLoading] = useState(false);

    const [showDisconnectModal, setShowDisconnectModal] = useState(false)
    const [disconnecting, setDisconnecting] = useState(false)

    const SUPPORTED_LANGUAGES = {
        en: 'English',
        hi: 'Hindi',
        kn: 'Kannada',
        te: 'Telugu',
        ta: 'Tamil',
        mr: 'Marathi',
        gu: 'Gujarati',
        bn: 'Bengali'
    }

    const { items: sortedUsers, requestSort: requestUserSort, sortConfig: userSortConfig } = useTableSort(users, { key: 'username', direction: 'asc' })
    const { items: sortedLocations, requestSort: requestLocationSort, sortConfig: locationSortConfig } = useTableSort(locations, { key: 'location_name', direction: 'asc' })

    const fetchLocations = async () => {
        try {
            const data = await api.get('/api/locations')
            setLocations(Array.isArray(data) ? data : [])
        } catch (err) {
            showNotification('error', `Failed to fetch locations: ${err.message}`)
        }
    }

    const fetchUsers = async () => {
        if (!isAdmin) return
        try {
            const data = await api.get('/api/users')
            setUsers(Array.isArray(data) ? data : [])
        } catch (err) {
            showNotification('error', `Failed to fetch users: ${err.message}`)
        }
    }

    const fetchResetCounts = async () => {
        try {
            const data = await api.get('/api/system/plans-data-counts');
            setResetCounts(data);
            setResetModalStep(1);
        } catch (err) {
            showNotification('error', 'Failed to fetch data counts');
        }
    };

    const executeReset = async () => {
        setResetLoading(true);
        try {
            const result = await api.delete('/api/system/reset-plans-data');
            if (result.success) {
                showNotification('success',
                    `Reset complete: ${result.deleted.trips} trips, ${result.deleted.daily_plans} plans, ${result.deleted.distribution_assignments} distributions deleted. ${result.torpedoes_reset} torpedoes reset.`
                );
            }
            setResetModalStep(0);
            setResetConfirmText('');
            setResetCounts(null);
        } catch (err) {
            showNotification('error', err.message || 'Reset failed');
        } finally {
            setResetLoading(false);
        }
    };

    const executeHeatReset = async () => {
        setHeatResetLoading(true);
        try {
            const result = await api.post('/api/system/reset-converter-heats');
            if (result.success) {
                showNotification('success',
                    `Heat counts reset for ${result.converters_reset} converters.`
                );
            }
            setHeatResetConfirm(false);
        } catch (err) {
            showNotification('error', err.message || 'Heat reset failed');
        } finally {
            setHeatResetLoading(false);
        }
    };

    const executeClearNotifications = async () => {
        setNotifClearLoading(true);
        try {
            const result = await api.delete('/api/notifications/all');
            showNotification('success',
                `Cleared ${result.deleted_count} notifications for all users.`
            );
            setNotifClearConfirm(false);
        } catch (err) {
            showNotification('error', err.message || 'Failed to clear notifications');
        } finally {
            setNotifClearLoading(false);
        }
    };

    const fetchWeighbridges = async () => {
        setWbLoading(true)
        try {
            const res = await api.get('/api/weighbridges')
            if (res.success) setWeighbridges(res.data || [])
        } catch (err) {
            showNotification('error', 'Failed to fetch weighbridges')
        } finally {
            setWbLoading(false)
        }
    }

    const handleSaveWb = async () => {
        try {
            if (editingWb) {
                await api.put(`/api/weighbridges/${editingWb.id}`, wbForm)
                showNotification('success', 'Weighbridge updated')
            } else {
                await api.post('/api/weighbridges', wbForm)
                showNotification('success', 'Weighbridge created')
            }
            setShowWbModal(false)
            setEditingWb(null)
            fetchWeighbridges()
        } catch (err) {
            showNotification('error', err.message || 'Failed to save weighbridge')
        }
    }

    const handleWbStatusChange = async (wbId, newStatus) => {
        try {
            await api.put(`/api/weighbridges/${wbId}/status`, { status: newStatus })
            showNotification('success', `Weighbridge status changed to ${newStatus}`)
            fetchWeighbridges()
        } catch (err) {
            showNotification('error', 'Failed to update status')
        }
    }

    const { setHeaderContent } = useHeader()

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const data = await api.get('/api/system/stats')
                setSystemStats(data)
            } catch (err) {
                console.error("Failed to fetch system stats:", err)
                setSystemStats(prev => ({ ...prev, backend: 'offline', db: 'offline' }))
            }
        }

        const fetchThresholds = async () => {
            try {
                const data = await api.get('/api/live-ops/thresholds')
                if (data) {
                    const synced = {
                        ...alertSettings,
                        warningThreshold: data.warning_threshold_minutes ?? alertSettings.warningThreshold,
                        alertThreshold: data.alert_threshold_minutes ?? alertSettings.alertThreshold,
                        criticalThreshold: data.critical_threshold_minutes ?? alertSettings.criticalThreshold,
                        refreshInterval: data.auto_refresh_interval_seconds ?? alertSettings.refreshInterval,
                    }
                    setAlertSettings(synced)
                    localStorage.setItem('hmd_alert_settings', JSON.stringify(synced))
                    setThresholdsLoaded(true)
                }
            } catch (err) {
                console.error('Failed to fetch thresholds from backend:', err)
                setThresholdsLoaded(true)
            }
        }

        const loadData = async () => {
            setLoading(true)
            await Promise.all([fetchLocations(), fetchUsers(), fetchStats(), fetchThresholds()])
            setLoading(false)
        }
        loadData()
        const statsInterval = setInterval(fetchStats, 5000)
        return () => clearInterval(statsInterval)
    }, [isAdmin])

    useEffect(() => {
        if (activeTab === 'weighbridge') {
            fetchWeighbridges()
        }
    }, [activeTab])

    useEffect(() => {
        if (activeTab !== 'alerts') return
        fetchWhatsappPreferences()
    }, [activeTab])

    const fetchWhatsappPreferences = async () => {
        setWhatsappLoading(true)
        try {
            const data = await api.get('/api/whatsapp/user-preferences')
            setWhatsappPrefs(prev => ({
                ...prev,
                whatsapp_enabled: data.whatsapp_enabled || false,
                whatsapp_phone: data.whatsapp_phone || '',
                whatsapp_language: data.whatsapp_language || 'en',
                whatsapp_trip_alerts: data.whatsapp_trip_alerts ?? true,
                whatsapp_daily_report: data.whatsapp_daily_report ?? true,
                whatsapp_deviation_alerts: data.whatsapp_deviation_alerts ?? true
            }))
        } catch (error) {
            console.log('WhatsApp preferences not available:', error.message)
        } finally {
            setWhatsappLoading(false)
        }
    }

    const saveWhatsappPreferences = async () => {
        setWhatsappSaving(true)
        try {
            await api.put('/api/whatsapp/user-preferences', whatsappPrefs)
            showNotification('success', 'WhatsApp preferences saved successfully!')
        } catch (error) {
            showNotification('error', `Failed to save: ${error.message}`)
        } finally {
            setWhatsappSaving(false)
        }
    }

    const handleWhatsappPrefChange = (key, value) => {
        setWhatsappPrefs(prev => ({ ...prev, [key]: value }))
    }

    const fetchWhatsAppStatus = async () => {
        try {
            const data = await api.get('/api/whatsapp/status')
            setWhatsappStatus({
                connected: data.service?.connected || false,
                state: data.service?.state || 'unknown',
                phoneNumber: data.service?.phoneNumber,
                enabled: data.enabled,
                loading: false
            })
        } catch (error) {
            console.log('WhatsApp status not available:', error.message)
            setWhatsappStatus({ connected: false, state: 'error', loading: false })
        }
    }

    const fetchWhatsAppConfig = async () => {
        setWhatsappConfigLoading(true)
        try {
            const data = await api.get('/api/whatsapp/config')
            const configMap = {}
            ;(data.configs || []).forEach(c => {
                configMap[c.config_key] = c.config_value
            })
            setWhatsappConfig(configMap)
            setWhatsappConfigOriginal(configMap) 
        } catch (error) {
            console.log('WhatsApp config not available:', error.message)
        } finally {
            setWhatsappConfigLoading(false)
        }
    }

    const fetchGroupMappings = async () => {
        try {
            const data = await api.get('/api/whatsapp/group-mappings')
            setGroupMappings(data.mappings || [])
        } catch (error) {
            console.log('Group mappings not available:', error.message)
        }
    }

    const fetchAvailableGroups = async () => {
        try {
            const data = await api.get('/api/whatsapp/groups')
            setAvailableGroups(data.groups || [])
        } catch (error) {
            showNotification('error', 'Failed to fetch WhatsApp groups. Make sure WhatsApp is connected.')
        }
    }

    const fetchProducersConsumers = async () => {
        try {
            const data = await api.get('/api/config/trip-times')
            setProducers(data.producers || [])
            setConsumers(data.consumers || [])
        } catch (error) {
            console.log('Failed to fetch producers/consumers:', error.message)
        }
    }

    const fetchDailyReportSchedule = async () => {
        setDailyReportSchedule(prev => ({ ...prev, loading: true }))
        try {
            const data = await api.get('/api/whatsapp/daily-report/schedule')
            setDailyReportSchedule({
                scheduled: data.scheduled || false,
                next_run: data.next_run,
                configured_time: data.configured_time,
                loading: false
            })
        } catch (error) {
            console.log('Failed to fetch schedule:', error.message)
            setDailyReportSchedule({ scheduled: false, next_run: null, loading: false })
        }
    }

    const handleSendDailyReportNow = async () => {
        setSendingDailyReport(true)
        try {
            const result = await api.post('/api/whatsapp/daily-report/send')
            if (result.success) {
                showNotification('success', `Daily report sent: ${result.sent || 0} messages delivered`)
            } else {
                showNotification('warning', result.error || 'No messages were sent')
            }
        } catch (error) {
            showNotification('error', `Failed to send: ${error.message}`)
        } finally {
            setSendingDailyReport(false)
        }
    }

    const handleWhatsAppConfigToggle = (key, value) => {
        setWhatsappConfig(prev => ({ ...prev, [key]: value }))
    }

    const handleSaveWhatsAppConfig = async () => {
        setWhatsappConfigSaving(true)
        try {
            const configs = Object.entries(whatsappConfig).map(([key, value]) => ({
                config_key: key,
                config_value: String(value)
            }))
            await api.post('/api/whatsapp/config/bulk', { configs })
            showNotification('success', 'WhatsApp settings saved successfully!')
            setWhatsappConfigOriginal({ ...whatsappConfig }) 
            fetchWhatsAppStatus()
            
            fetchDailyReportSchedule()
        } catch (error) {
            showNotification('error', `Failed to save: ${error.message}`)
        } finally {
            setWhatsappConfigSaving(false)
        }
    }

    const handleGetQRCode = async () => {
        setQrLoading(true)
        setShowQrModal(true)
        setQrCode(null) 

        const maxAttempts = 10
        let attempts = 0

        const pollForQR = async () => {
            try {
                const data = await api.get('/api/whatsapp/qr')
                if (data.connected) {
                    showNotification('info', 'WhatsApp is already connected!')
                    setShowQrModal(false)
                    setQrLoading(false)
                    return true
                } else if (data.qrCode) {
                    setQrCode(data.qrCode)
                    setQrLoading(false)
                    return true
                } else if (['connecting', 'disconnected', 'waiting_for_scan'].includes(data.state)) {
                    attempts++
                    if (attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 1500))
                        return pollForQR()
                    } else {
                        showNotification('warning', 'Service is still initializing. Please try again in a moment.')
                        setShowQrModal(false)
                        setQrLoading(false)
                        return false
                    }
                } else {
                    showNotification('warning', data.message || 'QR code not available. Please try again.')
                    setShowQrModal(false)
                    setQrLoading(false)
                    return false
                }
            } catch (error) {
                showNotification('error', `Failed to get QR code: ${error.message}`)
                setShowQrModal(false)
                setQrLoading(false)
                return false
            }
        }

        await pollForQR()
    }

    const handleWhatsAppLogoutClick = () => {
        setShowDisconnectModal(true)
    }

    const handleWhatsAppLogoutConfirm = async () => {
        setDisconnecting(true)
        try {
            await api.post('/api/whatsapp/logout')
            showNotification('success', 'WhatsApp disconnected successfully!')
            setWhatsappStatus({ connected: false, state: 'disconnected', loading: false })
            setQrCode(null)
            setShowDisconnectModal(false)
        } catch (error) {
            showNotification('error', `Failed to disconnect: ${error.message}`)
        } finally {
            setDisconnecting(false)
        }
    }

    const handleAddGroupMapping = async () => {
        try {
            await api.post('/api/whatsapp/group-mappings', newGroupMapping)
            showNotification('success', 'Group mapping added successfully!')
            setShowAddGroupModal(false)
            setNewGroupMapping({
                group_jid: '',
                group_name: '',
                mapping_type: 'producer',
                node_id: '',
                language_code: 'en',
                is_active: true,
                notifications_enabled: true,
                notify_trip_assigned: true,
                notify_trip_started: true,
                notify_trip_completed: true,
                notify_deviations: true,
                notify_daily_report: true
            })
            fetchGroupMappings()
        } catch (error) {
            showNotification('error', `Failed to add mapping: ${error.message}`)
        }
    }

    const handleDeleteGroupMapping = async (id) => {
        if (!window.confirm('Are you sure you want to delete this group mapping?')) return
        try {
            await api.delete(`/api/whatsapp/group-mappings/${id}`)
            showNotification('success', 'Group mapping deleted')
            fetchGroupMappings()
        } catch (error) {
            showNotification('error', `Failed to delete: ${error.message}`)
        }
    }

    const handleToggleGroupMapping = async (id, field, value) => {
        try {
            await api.put(`/api/whatsapp/group-mappings/${id}`, { [field]: value })
            fetchGroupMappings()
        } catch (error) {
            showNotification('error', `Failed to update: ${error.message}`)
        }
    }

    const handleSendTestMessage = async (groupJid, groupName) => {
        setSendingTest(true)
        try {
            await api.post('/api/whatsapp/send-test', {
                recipient_type: 'group',
                recipient_id: groupJid,
                message: `Test message from HMD System at ${new Date().toLocaleTimeString()}`
            })
            showNotification('success', `Test message sent to ${groupName}!`)
        } catch (error) {
            showNotification('error', `Failed to send test: ${error.message}`)
        } finally {
            setSendingTest(false)
        }
    }

    useEffect(() => {
        if (activeTab !== 'whatsapp' || !isAdmin) return
        fetchWhatsAppStatus()
        fetchWhatsAppConfig()
        fetchGroupMappings()
        fetchProducersConsumers()
        fetchDailyReportSchedule()
    }, [activeTab, isAdmin])

    useEffect(() => {
        if (!showQrModal || !qrCode) return

        const pollInterval = setInterval(async () => {
            try {
                const data = await api.get('/api/whatsapp/status')
                
                if (data.service?.connected) {
                    setWhatsappStatus({
                        connected: true,
                        state: data.service?.state || 'connected',
                        phoneNumber: data.service?.phoneNumber,
                        enabled: data.enabled,
                        loading: false
                    })
                    setShowQrModal(false)
                    setQrCode(null)
                    showNotification('success', 'WhatsApp connected successfully!')
                    clearInterval(pollInterval)
                }
            } catch (error) {
                
            }
        }, 2000) 

        return () => clearInterval(pollInterval)
    }, [showQrModal, qrCode])

    useEffect(() => {
        setHeaderContent({
            center: (
                <div className="switcher-tabs">
                    {isAdmin && (
                        <button className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
                            <Users size={16} />
                            USERS
                        </button>
                    )}
                    {isAdminOrTRS && (
                        <>
                            <button className={`tab-btn ${activeTab === 'locations' ? 'active' : ''}`} onClick={() => setActiveTab('locations')}>
                                <MapPin size={14} />
                                LOCATIONS
                            </button>
                            <button className={`tab-btn ${activeTab === 'weighbridge' ? 'active' : ''}`} onClick={() => setActiveTab('weighbridge')}>
                                <WbIcon size={14} />
                                WEIGHBRIDGE
                            </button>
                        </>
                    )}
                    <button className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>
                        <Key size={14} />
                        SECURITY
                    </button>
                    {isAdmin && (
                        <button className={`tab-btn ${activeTab === 'whatsapp' ? 'active' : ''}`} onClick={() => setActiveTab('whatsapp')}>
                            <MessageSquare size={14} />
                            WHATSAPP
                        </button>
                    )}
                    {isAdminOrTRS && (
                        <button className={`tab-btn ${activeTab === 'system' ? 'active' : ''}`} onClick={() => setActiveTab('system')}>
                            <Shield size={14} />
                            SYSTEM
                        </button>
                    )}
                    {isAdmin && (
                        <button
                            className={`tab-btn ${activeTab === 'danger' ? 'active' : ''}`}
                            onClick={() => setActiveTab('danger')}
                            style={activeTab === 'danger' ? { background: 'hsl(var(--danger))', color: '#fff' } : { color: 'hsl(var(--danger))' }}
                        >
                            <AlertTriangle size={14} />
                            DANGER
                        </button>
                    )}
                </div>
            ),
            forceLeftTitle: true
        })

        return () => setHeaderContent({ left: null, center: null, right: null, forceLeftTitle: false })
    }, [activeTab, isAdmin, isTRS, isPPC, isAdminOrTRS, setHeaderContent])

    const handleSaveLocation = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            if (editingId) {
                await api.put(`/api/locations/${editingId}`, formData)
                showNotification('success', 'Location updated successfully')
            } else {
                await api.post('/api/locations', formData)
                showNotification('success', 'Location registered successfully')
            }
            setShowForm(false)
            setEditingId(null)
            setFormData({ location_name: '', user_id: '', type: 'producer', x: '', y: '', is_visible: true })
            fetchLocations()
        } catch (err) {
            showNotification('error', `Save failed: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    const handleSaveUser = async (e) => {
        e.preventDefault()
        setLoading(true)
        try {
            if (editingUserId) {
                await api.put(`/api/users/${editingUserId}`, userFormData)
                showNotification('success', 'User updated successfully')
            } else {
                await api.post('/api/users', userFormData)
                showNotification('success', 'User registered successfully')
            }
            setShowUserForm(false)
            setEditingUserId(null)
            setUserFormData({ username: '', password: '', role: 'consumer', user_id: '' })
            fetchUsers()
        } catch (err) {
            showNotification('error', `Save failed: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteUser = async (id) => {
        if (!window.confirm("Are you sure you want to delete this user?")) return
        try {
            await api.delete(`/api/users/${id}`)
            showNotification('success', 'User deleted successfully')
            fetchUsers()
        } catch (err) {
            showNotification('error', `Delete failed: ${err.message}`)
        }
    }

    const handleEditUser = (u) => {
        setUserFormData({
            username: u.username,
            password: u.password,
            role: u.role,
            user_id: u.user_id || ''
        })
        setEditingUserId(u.id)
        setShowUserForm(true)
    }

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this location?")) return
        try {
            await api.delete(`/api/locations/${id}`)
            showNotification('success', 'Location deleted successfully')
            fetchLocations()
        } catch (err) {
            showNotification('error', `Delete failed: ${err.message}`)
        }
    }

    const handleEdit = (loc) => {
        setFormData({
            location_name: loc.location_name,
            user_id: loc.user_id || '',
            type: loc.type,
            x: loc.x,
            y: loc.y,
            is_visible: loc.is_visible
        })
        setEditingId(loc.id)
        setShowForm(true)
    }

    const toggleVisibility = async (loc) => {
        try {
            await api.put(`/api/locations/${loc.id}`, { ...loc, is_visible: !loc.is_visible })
            fetchLocations()
        } catch (err) {
            showNotification('error', `Failed to toggle visibility: ${err.message}`)
        }
    }

    const updateAlertSettings = async (key, value) => {
        const newSettings = { ...alertSettings, [key]: value }
        setAlertSettings(newSettings)
        localStorage.setItem('hmd_alert_settings', JSON.stringify(newSettings))

        const thresholdKeys = ['warningThreshold', 'alertThreshold', 'criticalThreshold', 'refreshInterval']
        if (thresholdKeys.includes(key)) {
            try {
                await api.post('/api/live-ops/thresholds', {
                    warning_threshold_minutes: newSettings.warningThreshold,
                    alert_threshold_minutes: newSettings.alertThreshold,
                    critical_threshold_minutes: newSettings.criticalThreshold,
                    auto_refresh_interval_seconds: newSettings.refreshInterval,
                })
            } catch (err) {
                console.error('Failed to sync thresholds to backend:', err)
            }
        }
        showNotification('success', 'Alert settings updated')
    }

    const handlePasswordChange = async () => {
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            showNotification('error', 'New passwords do not match')
            return
        }
        if (passwordForm.newPassword.length < 6) {
            showNotification('error', 'Password must be at least 6 characters')
            return
        }
        setPasswordLoading(true)
        try {
            await api.put('/api/auth/change-password', {
                current_password: passwordForm.currentPassword,
                new_password: passwordForm.newPassword
            })
            showNotification('success', 'Password changed successfully')
            setShowPasswordModal(false)
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
        } catch (err) {
            showNotification('error', err.message || 'Failed to change password')
        } finally {
            setPasswordLoading(false)
        }
    }

    return (
        <div className="strategic-command-center animate-in fade-in duration-700" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <style>{`
                /* Premium Card Enhancements */
                .settings-premium-card {
                    background: hsl(var(--card-bg, var(--bg-secondary)));
                    backdrop-filter: blur(20px);
                    border-radius: 20px;
                    border: 1px solid hsl(var(--border-color) / 0.5);
                    box-shadow: 0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    min-height: 0;
                    transition: box-shadow 0.3s ease, transform 0.2s ease;
                }
                .settings-premium-card:hover {
                    box-shadow: 0 8px 32px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06);
                }

                /* Premium Card Header */
                .settings-card-header {
                    background: linear-gradient(135deg, hsl(var(--bg-secondary)) 0%, hsl(var(--main-bg)) 100%);
                    border-bottom: 1px solid hsl(var(--border-color) / 0.5);
                    padding: 20px 24px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }

                /* Premium Icon Box */
                .settings-icon-box {
                    width: 48px;
                    height: 48px;
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }
                .settings-icon-box:hover {
                    transform: scale(1.05);
                }

                /* Premium Title */
                .settings-title {
                    margin: 0;
                    font-size: 1.15rem;
                    font-weight: 700;
                    letter-spacing: -0.01em;
                }
                .settings-subtitle {
                    margin: 2px 0 0 0;
                    font-size: 0.72rem;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                /* Premium Button Styles */
                .settings-btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 10px 20px;
                    border-radius: 10px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    border: none;
                }
                .settings-btn.primary {
                    background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(220, 80%, 45%) 100%);
                    color: white;
                    box-shadow: 0 2px 8px hsl(var(--primary) / 0.3);
                }
                .settings-btn.primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 16px hsl(var(--primary) / 0.4);
                }
                .settings-btn.secondary {
                    background: hsl(var(--bg-secondary));
                    color: hsl(var(--text-primary));
                    border: 1px solid hsl(var(--border-color));
                }
                .settings-btn.secondary:hover {
                    background: hsl(var(--main-bg));
                    border-color: hsl(var(--primary) / 0.5);
                }
                .settings-btn.danger {
                    background: transparent;
                    color: hsl(var(--danger));
                    border: 1px solid hsl(var(--danger) / 0.3);
                }
                .settings-btn.danger:hover {
                    background: hsl(var(--danger) / 0.1);
                }

                /* Premium Table Styles */
                .settings-table {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                }
                .settings-table thead th {
                    padding: 14px 16px;
                    text-align: left;
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: hsl(var(--text-muted));
                    background: hsl(var(--bg-secondary));
                    border-bottom: 1px solid hsl(var(--border-color));
                    white-space: nowrap;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                .settings-table tbody tr {
                    transition: background 0.15s ease;
                }
                .settings-table tbody tr:hover {
                    background: hsl(var(--primary) / 0.03);
                }
                .settings-table tbody td {
                    padding: 16px;
                    border-bottom: 1px solid hsl(var(--border-color) / 0.5);
                    vertical-align: middle;
                }
                .settings-table tbody tr:last-child td {
                    border-bottom: none;
                }

                /* Premium Form Inputs */
                .settings-input {
                    width: 100%;
                    height: 52px;
                    padding: 0 16px;
                    border-radius: 12px;
                    border: 1.5px solid hsl(var(--border-color));
                    background: hsl(var(--main-bg));
                    font-size: 0.95rem;
                    transition: all 0.2s ease;
                    outline: none;
                }
                .settings-input:focus {
                    border-color: hsl(var(--primary));
                    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
                }
                .settings-select {
                    width: 100%;
                    height: 52px;
                    padding: 0 16px;
                    border-radius: 12px;
                    border: 1.5px solid hsl(var(--border-color));
                    background: hsl(var(--main-bg));
                    font-size: 0.95rem;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    outline: none;
                }
                .settings-select:focus {
                    border-color: hsl(var(--primary));
                    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.1);
                }

                /* Premium Form Label */
                .settings-label {
                    display: block;
                    margin-bottom: 10px;
                    font-size: 0.72rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: hsl(var(--text-muted));
                }

                /* Premium Badge */
                .settings-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .settings-badge.admin {
                    background: linear-gradient(135deg, hsl(var(--danger) / 0.15) 0%, hsl(var(--danger) / 0.05) 100%);
                    color: hsl(var(--danger));
                }
                .settings-badge.producer {
                    background: linear-gradient(135deg, hsl(var(--warning) / 0.15) 0%, hsl(var(--warning) / 0.05) 100%);
                    color: hsl(var(--warning));
                }
                .settings-badge.consumer {
                    background: linear-gradient(135deg, hsl(var(--primary) / 0.15) 0%, hsl(var(--primary) / 0.05) 100%);
                    color: hsl(var(--primary));
                }
                .settings-badge.ppc {
                    background: linear-gradient(135deg, hsl(var(--chart-purple) / 0.15) 0%, hsl(var(--chart-purple) / 0.05) 100%);
                    color: hsl(var(--chart-purple));
                }
                .settings-badge.trs {
                    background: linear-gradient(135deg, hsl(var(--chart-cyan) / 0.15) 0%, hsl(var(--chart-cyan) / 0.05) 100%);
                    color: hsl(var(--chart-cyan));
                }

                /* Premium Info Row */
                .settings-info-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 18px 0;
                    border-bottom: 1px solid hsl(var(--border-color) / 0.5);
                }
                .settings-info-row:last-child {
                    border-bottom: none;
                }
                .settings-info-label {
                    font-size: 0.72rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: hsl(var(--text-muted));
                }
                .settings-info-value {
                    font-weight: 700;
                    font-size: 1.1rem;
                    color: hsl(var(--primary));
                }

                /* Premium Stat Card */
                .settings-stat-card {
                    background: linear-gradient(145deg, hsl(var(--main-bg)) 0%, hsl(var(--bg-secondary) / 0.3) 100%);
                    padding: 18px;
                    border-radius: 14px;
                    border: 1px solid hsl(var(--border-color) / 0.5);
                    transition: all 0.2s ease;
                }
                .settings-stat-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.06);
                }

                /* Premium Progress Bar */
                .settings-progress {
                    width: 100%;
                    height: 8px;
                    background: hsl(var(--border-color) / 0.5);
                    border-radius: 4px;
                    overflow: hidden;
                }
                .settings-progress-bar {
                    height: 100%;
                    border-radius: 4px;
                    transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
                }

                /* Premium Toggle for Settings */
                .settings-toggle {
                    width: 52px;
                    height: 28px;
                    border-radius: 14px;
                    border: none;
                    position: relative;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
                }
                .settings-toggle:hover {
                    transform: scale(1.02);
                }
                .settings-toggle-knob {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%);
                    position: absolute;
                    top: 2px;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.1);
                    transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                /* Threshold Card */
                .settings-threshold-card {
                    padding: 18px;
                    border-radius: 14px;
                    border: 1px solid;
                    transition: all 0.2s ease;
                }
                .settings-threshold-card:hover {
                    transform: translateY(-1px);
                }
                .settings-threshold-card.warning {
                    background: linear-gradient(145deg, hsl(45, 93%, 97%) 0%, hsl(45, 93%, 95%) 100%);
                    border-color: hsl(45, 93%, 85%);
                }
                .settings-threshold-card.alert {
                    background: linear-gradient(145deg, hsl(24, 95%, 97%) 0%, hsl(24, 95%, 95%) 100%);
                    border-color: hsl(24, 95%, 85%);
                }
                .settings-threshold-card.critical {
                    background: linear-gradient(145deg, hsl(0, 85%, 97%) 0%, hsl(0, 85%, 95%) 100%);
                    border-color: hsl(0, 85%, 90%);
                }

                /* Slider Enhancement */
                .settings-slider {
                    width: 100%;
                    height: 6px;
                    border-radius: 3px;
                    -webkit-appearance: none;
                    appearance: none;
                    background: hsl(var(--border-color) / 0.5);
                    outline: none;
                    cursor: pointer;
                }
                .settings-slider::-webkit-slider-runnable-track {
                    height: 6px;
                    border-radius: 3px;
                    background: hsl(var(--border-color) / 0.5);
                }
                .settings-slider::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    appearance: none;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: hsl(var(--text-primary));
                    border: 3px solid hsl(var(--bg-secondary));
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
                    transition: transform 0.15s ease, box-shadow 0.15s ease;
                    margin-top: -7px;
                }
                .settings-slider::-webkit-slider-thumb:hover {
                    transform: scale(1.15);
                    box-shadow: 0 3px 12px rgba(0,0,0,0.3);
                }
                .settings-slider::-moz-range-track {
                    height: 6px;
                    border-radius: 3px;
                    background: hsl(var(--border-color) / 0.5);
                    border: none;
                }
                .settings-slider::-moz-range-thumb {
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: hsl(var(--text-primary));
                    border: 3px solid hsl(var(--bg-secondary));
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
                }

                /* Action Button Group */
                .settings-action-group {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                }
                .settings-action-btn {
                    width: 38px;
                    height: 38px;
                    border-radius: 10px;
                    border: 1px solid hsl(var(--border-color));
                    background: hsl(var(--main-bg));
                    color: hsl(var(--text-muted));
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .settings-action-btn:hover {
                    background: hsl(var(--primary) / 0.05);
                    border-color: hsl(var(--primary) / 0.3);
                    color: hsl(var(--primary));
                }
                .settings-action-btn.danger:hover {
                    background: hsl(var(--danger) / 0.05);
                    border-color: hsl(var(--danger) / 0.3);
                    color: hsl(var(--danger));
                }

                /* Card Body Padding */
                .settings-card-body {
                    padding: 24px;
                    flex: 1;
                    overflow: hidden;
                    min-height: 0;
                    display: flex;
                    flex-direction: column;
                }

                /* Table Scroll Container */
                .settings-table-container {
                    flex: 1;
                    overflow: auto;
                    min-height: 0;
                    border-radius: 8px;
                }

                /* Pulse Animation for Status */
                @keyframes settingsPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                .settings-pulse {
                    animation: settingsPulse 2s ease-in-out infinite;
                }

                /* ═══════ Dark Mode Overrides ═══════ */
                :root[data-theme="dark"] .settings-premium-card {
                    background: hsl(var(--bg-secondary));
                    box-shadow: 0 4px 24px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
                }
                :root[data-theme="dark"] .settings-premium-card:hover {
                    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
                }
                :root[data-theme="dark"] .settings-card-header {
                    background: hsl(var(--bg-secondary));
                    border-color: hsl(var(--border-color) / 0.3);
                }
                :root[data-theme="dark"] .settings-card-body {
                    background: hsl(var(--bg-secondary));
                }
                :root[data-theme="dark"] .settings-stat-card {
                    background: hsl(var(--bg-primary));
                    border-color: hsl(var(--border-color) / 0.3);
                }
                :root[data-theme="dark"] .settings-table thead th {
                    background: hsl(var(--bg-primary));
                    color: hsl(var(--text-muted));
                }
                /* Option card selector (map style, sound type) */
                .settings-option-card {
                    flex: 1;
                    padding: 12px 10px;
                    border-radius: 12px;
                    border: 1.5px solid hsl(var(--border-color));
                    background: hsl(var(--main-bg));
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                .settings-option-card:hover {
                    border-color: hsl(var(--primary) / 0.4);
                }
                .settings-option-card.active {
                    border: 2px solid hsl(var(--primary));
                    background: hsl(var(--primary) / 0.06);
                }
                :root[data-theme="dark"] .settings-option-card {
                    border-color: rgba(255, 255, 255, 0.15);
                    background: rgba(255, 255, 255, 0.04);
                }
                :root[data-theme="dark"] .settings-option-card:hover {
                    border-color: rgba(255, 255, 255, 0.3);
                }
                :root[data-theme="dark"] .settings-option-card.active {
                    border-color: hsl(var(--primary));
                    background: hsl(var(--primary) / 0.12);
                }

                :root[data-theme="dark"] .settings-input,
                :root[data-theme="dark"] .settings-select {
                    background: hsl(var(--bg-primary));
                    border-color: hsl(var(--border-color) / 0.5);
                    color: hsl(var(--text-primary));
                }
                :root[data-theme="dark"] .settings-threshold-card.warning {
                    background: linear-gradient(145deg, rgba(245, 158, 11, 0.1) 0%, rgba(245, 158, 11, 0.05) 100%);
                    border-color: rgba(245, 158, 11, 0.25);
                }
                :root[data-theme="dark"] .settings-threshold-card.alert {
                    background: linear-gradient(145deg, rgba(249, 115, 22, 0.1) 0%, rgba(249, 115, 22, 0.05) 100%);
                    border-color: rgba(249, 115, 22, 0.25);
                }
                :root[data-theme="dark"] .settings-threshold-card.critical {
                    background: linear-gradient(145deg, rgba(239, 68, 68, 0.1) 0%, rgba(239, 68, 68, 0.05) 100%);
                    border-color: rgba(239, 68, 68, 0.25);
                }
                :root[data-theme="dark"] .settings-progress {
                    background: hsl(var(--border-color) / 0.3);
                }
                :root[data-theme="dark"] .settings-slider {
                    background: rgba(255, 255, 255, 0.12);
                }
                :root[data-theme="dark"] .settings-slider::-webkit-slider-runnable-track {
                    background: rgba(255, 255, 255, 0.12);
                }
                :root[data-theme="dark"] .settings-slider::-webkit-slider-thumb {
                    background: #e2e8f0;
                    border-color: #334155;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                }
                :root[data-theme="dark"] .settings-slider::-moz-range-track {
                    background: rgba(255, 255, 255, 0.12);
                }
                :root[data-theme="dark"] .settings-slider::-moz-range-thumb {
                    background: #e2e8f0;
                    border-color: #334155;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                }
                :root[data-theme="dark"] .settings-toggle-knob {
                    background: linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 100%);
                }
            `}</style>

            <main className="command-content" style={{ flex: 1, padding: '24px', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'hsl(var(--main-bg))', minHeight: 0 }}>
                {isAdmin && activeTab === 'users' && (
                    <div className="settings-premium-card">
                        <div className="settings-card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div className="settings-icon-box" style={{
                                    background: 'linear-gradient(135deg, hsl(var(--accent) / 0.15) 0%, hsl(var(--accent) / 0.05) 100%)',
                                    border: '1px solid hsl(var(--accent) / 0.2)'
                                }}>
                                    <Users size={24} color="hsl(var(--accent))" />
                                </div>
                                <div>
                                    <h3 className="settings-title">User Directory</h3>
                                    <p className="settings-subtitle">Manage system access credentials</p>
                                </div>
                            </div>
                            {!showUserForm && (
                                <button className="settings-btn primary" onClick={() => { setEditingUserId(null); setUserFormData({ username: '', password: '', role: 'consumer', user_id: '' }); setShowUserForm(true); }}>
                                    <Plus size={18} /> New User
                                </button>
                            )}
                        </div>
                        <div className="settings-card-body">
                            {showUserForm ? (
                                <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px' }}>
                                        <div>
                                            <label className="settings-label">Username</label>
                                            <input type="text" required className="settings-input" value={userFormData.username} onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })} placeholder="Enter username" />
                                        </div>
                                        <div>
                                            <label className="settings-label">Password</label>
                                            <div style={{ position: 'relative' }}>
                                                <input type="password" required className="settings-input" style={{ paddingRight: '50px' }} value={userFormData.password} onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })} placeholder="Enter secure password" />
                                                <Key size={18} style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--text-muted))' }} />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="settings-label">System Role</label>
                                            <select className="settings-select" value={userFormData.role} onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}>
                                                <option value="consumer">Consumer</option>
                                                <option value="producer">Producer</option>
                                                <option value="admin">Administrator</option>
                                                <option value="ppc">PPC</option>
                                                <option value="trs">TRS</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="settings-label">Asset ID (Optional)</label>
                                            <input type="text" placeholder="e.g., BF-01" className="settings-input" value={userFormData.user_id} onChange={(e) => setUserFormData({ ...userFormData, user_id: e.target.value })} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid hsl(var(--border-color) / 0.5)', paddingTop: '24px' }}>
                                        <button type="button" className="settings-btn secondary" onClick={() => setShowUserForm(false)}>Cancel</button>
                                        <button type="submit" className="settings-btn primary">{editingUserId ? 'Update User' : 'Create User'}</button>
                                    </div>
                                </form>
                            ) : (
                                <div className="settings-table-container">
                                    <table className="settings-table">
                                        <thead>
                                            <tr>
                                                <th onClick={() => requestUserSort('username')} style={{ cursor: 'pointer' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        User <ChevronDown size={12} style={{ opacity: userSortConfig.key === 'username' ? 1 : 0.3 }} />
                                                    </div>
                                                </th>
                                                <th onClick={() => requestUserSort('role')} style={{ cursor: 'pointer' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        Role <ChevronDown size={12} style={{ opacity: userSortConfig.key === 'role' ? 1 : 0.3 }} />
                                                    </div>
                                                </th>
                                                <th onClick={() => requestUserSort('user_id')} style={{ cursor: 'pointer' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        Asset ID <ChevronDown size={12} style={{ opacity: userSortConfig.key === 'user_id' ? 1 : 0.3 }} />
                                                    </div>
                                                </th>
                                                <th style={{ textAlign: 'right' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedUsers.map(u => (
                                                <tr key={u.id}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                            <div style={{
                                                                width: '42px',
                                                                height: '42px',
                                                                borderRadius: '12px',
                                                                background: u.role === 'admin'
                                                                    ? 'linear-gradient(135deg, hsl(var(--danger) / 0.1) 0%, hsl(var(--danger) / 0.05) 100%)'
                                                                    : u.role === 'producer'
                                                                    ? 'linear-gradient(135deg, hsl(var(--warning) / 0.1) 0%, hsl(var(--warning) / 0.05) 100%)'
                                                                    : u.role === 'ppc'
                                                                    ? 'linear-gradient(135deg, hsl(var(--chart-purple) / 0.1) 0%, hsl(var(--chart-purple) / 0.05) 100%)'
                                                                    : u.role === 'trs'
                                                                    ? 'linear-gradient(135deg, hsl(var(--chart-cyan) / 0.1) 0%, hsl(var(--chart-cyan) / 0.05) 100%)'
                                                                    : 'linear-gradient(135deg, hsl(var(--primary) / 0.1) 0%, hsl(var(--primary) / 0.05) 100%)',
                                                                border: `1px solid ${u.role === 'admin' ? 'hsl(var(--danger) / 0.2)' : u.role === 'producer' ? 'hsl(var(--warning) / 0.2)' : u.role === 'ppc' ? 'hsl(var(--chart-purple) / 0.2)' : u.role === 'trs' ? 'hsl(var(--chart-cyan) / 0.2)' : 'hsl(var(--primary) / 0.2)'}`,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}>
                                                                <User size={18} color={u.role === 'admin' ? 'hsl(var(--danger))' : u.role === 'producer' ? 'hsl(var(--warning))' : u.role === 'ppc' ? 'hsl(var(--chart-purple))' : u.role === 'trs' ? 'hsl(var(--chart-cyan))' : 'hsl(var(--primary))'} />
                                                            </div>
                                                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{u.username}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className={`settings-badge ${u.role}`}>
                                                            {u.role}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: u.user_id ? 'hsl(var(--text-primary))' : 'hsl(var(--text-muted))' }}>
                                                            {u.user_id || '—'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="settings-action-group">
                                                            <button className="settings-action-btn" onClick={() => handleEditUser(u)} title="Edit">
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button className="settings-action-btn danger" onClick={() => handleDeleteUser(u.id)} title="Delete">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {isAdminOrTRS && activeTab === 'locations' && (
                    <div className="settings-premium-card">
                        <div className="settings-card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div className="settings-icon-box" style={{
                                    background: 'linear-gradient(135deg, hsl(var(--success) / 0.15) 0%, hsl(var(--success) / 0.05) 100%)',
                                    border: '1px solid hsl(var(--success) / 0.2)'
                                }}>
                                    <MapPin size={24} color="hsl(var(--success))" />
                                </div>
                                <div>
                                    <h3 className="settings-title">Location Registry</h3>
                                    <p className="settings-subtitle">Manage facilities and GPS coordinates</p>
                                </div>
                            </div>
                            {!showForm && (
                                <button className="settings-btn primary" onClick={() => { setEditingId(null); setShowForm(true); }}>
                                    <Plus size={18} /> Add Location
                                </button>
                            )}
                        </div>
                        <div className="settings-card-body">
                            {showForm ? (
                                <form onSubmit={handleSaveLocation} style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px' }}>
                                        <div>
                                            <label className="settings-label">Location Name</label>
                                            <input type="text" required className="settings-input" value={formData.location_name} onChange={(e) => setFormData({ ...formData, location_name: e.target.value })} placeholder="Enter location name" />
                                        </div>
                                        <div>
                                            <label className="settings-label">Linked User</label>
                                            <select className="settings-select" value={formData.user_id} onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}>
                                                <option value="">Unlinked</option>
                                                {users.filter(u => u.role === 'producer' || u.role === 'consumer').map(u => (
                                                    <option key={u.user_id} value={u.user_id}>{u.user_id} ({u.username})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="settings-label">Type</label>
                                            <select className="settings-select" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                                                <option value="producer">Producer</option>
                                                <option value="consumer">Consumer</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="settings-label">Latitude</label>
                                            <input type="number" step="any" required className="settings-input" value={formData.x} onChange={(e) => setFormData({ ...formData, x: e.target.value })} placeholder="e.g., 15.3456" />
                                        </div>
                                        <div>
                                            <label className="settings-label">Longitude</label>
                                            <input type="number" step="any" required className="settings-input" value={formData.y} onChange={(e) => setFormData({ ...formData, y: e.target.value })} placeholder="e.g., 76.7890" />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', borderTop: '1px solid hsl(var(--border-color) / 0.5)', paddingTop: '24px' }}>
                                        <button type="button" className="settings-btn secondary" onClick={() => setShowForm(false)}>Cancel</button>
                                        <button type="submit" className="settings-btn primary">{editingId ? 'Update Location' : 'Create Location'}</button>
                                    </div>
                                </form>
                            ) : (
                                <div className="settings-table-container">
                                    <table className="settings-table">
                                        <thead>
                                            <tr>
                                                <th onClick={() => requestLocationSort('location_name')} style={{ cursor: 'pointer' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        Location <ChevronDown size={12} style={{ opacity: locationSortConfig.key === 'location_name' ? 1 : 0.3 }} />
                                                    </div>
                                                </th>
                                                <th onClick={() => requestLocationSort('user_id')} style={{ cursor: 'pointer' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        Linked User <ChevronDown size={12} style={{ opacity: locationSortConfig.key === 'user_id' ? 1 : 0.3 }} />
                                                    </div>
                                                </th>
                                                <th onClick={() => requestLocationSort('type')} style={{ cursor: 'pointer' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        Type <ChevronDown size={12} style={{ opacity: locationSortConfig.key === 'type' ? 1 : 0.3 }} />
                                                    </div>
                                                </th>
                                                <th>Coordinates</th>
                                                <th style={{ textAlign: 'right' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedLocations.map(loc => (
                                                <tr key={loc.id}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                            <div style={{
                                                                width: '42px',
                                                                height: '42px',
                                                                borderRadius: '12px',
                                                                background: loc.type === 'producer'
                                                                    ? 'linear-gradient(135deg, hsl(var(--warning) / 0.15) 0%, hsl(var(--warning) / 0.05) 100%)'
                                                                    : 'linear-gradient(135deg, hsl(var(--primary) / 0.15) 0%, hsl(var(--primary) / 0.05) 100%)',
                                                                border: `1px solid ${loc.type === 'producer' ? 'hsl(var(--warning) / 0.2)' : 'hsl(var(--primary) / 0.2)'}`,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}>
                                                                <Factory size={18} color={loc.type === 'producer' ? 'hsl(var(--warning))' : 'hsl(var(--primary))'} />
                                                            </div>
                                                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{loc.location_name}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            fontWeight: 600,
                                                            fontSize: '0.9rem',
                                                            color: loc.user_id ? 'hsl(var(--primary))' : 'hsl(var(--text-muted))'
                                                        }}>
                                                            {loc.user_id || '—'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span className={`settings-badge ${loc.type}`}>
                                                            {loc.type}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontWeight: 500, fontSize: '0.85rem', color: 'hsl(var(--text-muted))', fontFamily: 'monospace' }}>
                                                            {loc.x.toFixed(4)}, {loc.y.toFixed(4)}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div className="settings-action-group">
                                                            <button className="settings-action-btn" onClick={() => handleEdit(loc)} title="Edit">
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button className="settings-action-btn danger" onClick={() => handleDelete(loc.id)} title="Delete">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {isAdminOrTRS && activeTab === 'weighbridge' && (
                    <div className="settings-premium-card">
                        <div className="settings-card-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div className="settings-icon-box" style={{
                                    background: 'linear-gradient(135deg, hsl(var(--warning) / 0.15) 0%, hsl(var(--warning) / 0.05) 100%)',
                                    border: '1px solid hsl(var(--warning) / 0.2)'
                                }}>
                                    <WbIcon size={24} />
                                </div>
                                <div>
                                    <h3 className="settings-title">Weighbridge Management</h3>
                                    <p className="settings-subtitle">Manage plant weighbridge units</p>
                                </div>
                            </div>
                            <button className="settings-btn primary" onClick={() => { setEditingWb(null); setWbForm({ name: '', location_name: '', x: '', y: '' }); setShowWbModal(true); }}>
                                <Plus size={18} /> Add Weighbridge
                            </button>
                        </div>
                        <div className="settings-card-body">
                            {wbLoading ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'hsl(var(--text-muted))' }}>
                                    <Loader2 size={32} className="animate-spin" style={{ marginBottom: '12px' }} />
                                    <p>Loading weighbridges...</p>
                                </div>
                            ) : weighbridges.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'hsl(var(--text-muted))' }}>
                                    <WbIcon size={48} style={{ marginBottom: '12px', opacity: 0.3 }} />
                                    <p>No weighbridges configured yet</p>
                                </div>
                            ) : (
                                <div className="settings-table-container">
                                    <table className="settings-table">
                                        <thead>
                                            <tr>
                                                <th>Weighbridge</th>
                                                <th>Location</th>
                                                <th>Coordinates</th>
                                                <th>Status</th>
                                                <th style={{ textAlign: 'right' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {weighbridges.map(wb => (
                                                <tr key={wb.id}>
                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                            <div style={{
                                                                width: '42px',
                                                                height: '42px',
                                                                borderRadius: '12px',
                                                                background: 'linear-gradient(135deg, hsl(var(--warning) / 0.15) 0%, hsl(var(--warning) / 0.05) 100%)',
                                                                border: '1px solid hsl(var(--warning) / 0.2)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center'
                                                            }}>
                                                                <WbIcon size={18} />
                                                            </div>
                                                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{wb.name}</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: wb.location_name ? 'var(--text-primary)' : 'hsl(var(--text-muted))' }}>
                                                            {wb.location_name || '—'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {wb.x && wb.y ? (
                                                            <span style={{ fontWeight: 500, fontSize: '0.85rem', color: 'hsl(var(--text-muted))', fontFamily: 'monospace' }}>
                                                                {wb.x.toFixed(4)}, {wb.y.toFixed(4)}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'hsl(var(--text-muted))' }}>—</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <select value={wb.status} onChange={(e) => handleWbStatusChange(wb.id, e.target.value)} className="settings-select" style={{ width: 'auto', padding: '4px 10px', fontSize: '0.8rem', fontWeight: 700, color: wb.status === 'Operating' ? '#22c55e' : wb.status === 'Maintenance' ? '#f59e0b' : '#ef4444', borderColor: wb.status === 'Operating' ? 'rgba(34,197,94,0.3)' : wb.status === 'Maintenance' ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)', }}>
                                                            <option value="Operating">Operating</option>
                                                            <option value="Maintenance">Maintenance</option>
                                                            <option value="Shutdown">Shutdown</option>
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <div className="settings-action-group">
                                                            <button className="settings-action-btn" onClick={() => { setEditingWb(wb); setWbForm({ name: wb.name, location_name: wb.location_name || '', x: wb.x || '', y: wb.y || '' }); setShowWbModal(true); }} title="Edit">
                                                                <Edit2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {showWbModal && (
                    <div className="premium-modal-overlay animate-in fade-in duration-300">
                        <div className="premium-modal glass-morphism animate-in zoom-in-95" style={{ maxWidth: '480px' }}>
                            <div className="premium-modal-header">
                                <div className="title-group">
                                    <WbIcon size={20} />
                                    <h3>{editingWb ? 'Edit Weighbridge' : 'Add Weighbridge'}</h3>
                                </div>
                                <button className="close-btn" onClick={() => setShowWbModal(false)}>✕</button>
                            </div>
                            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label className="settings-label">Name *</label>
                                    <input type="text" className="settings-input" value={wbForm.name} onChange={e => setWbForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., WB-1" />
                                </div>
                                <div>
                                    <label className="settings-label">Location Name</label>
                                    <input type="text" className="settings-input" value={wbForm.location_name} onChange={e => setWbForm(p => ({ ...p, location_name: e.target.value }))} placeholder="e.g., Main Gate Weighbridge" />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    <div>
                                        <label className="settings-label">Latitude (X)</label>
                                        <input type="number" step="any" className="settings-input" value={wbForm.x} onChange={e => setWbForm(p => ({ ...p, x: e.target.value }))} placeholder="0.0" />
                                    </div>
                                    <div>
                                        <label className="settings-label">Longitude (Y)</label>
                                        <input type="number" step="any" className="settings-input" value={wbForm.y} onChange={e => setWbForm(p => ({ ...p, y: e.target.value }))} placeholder="0.0" />
                                    </div>
                                </div>
                            </div>
                            <div style={{ padding: '16px 24px', borderTop: '1px solid hsl(var(--border-color))', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <button className="settings-btn secondary" onClick={() => setShowWbModal(false)}>Cancel</button>
                                <button className="settings-btn primary" onClick={handleSaveWb} disabled={!wbForm.name}>{editingWb ? 'Update' : 'Create'}</button>
                            </div>
                        </div>
                    </div>
                )}
                {isAdminOrTRS && activeTab === 'system' && (<>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '24px' }}>
                        <div className="settings-premium-card">
                            <div className="settings-card-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div className="settings-icon-box" style={{
                                        background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15) 0%, hsl(var(--primary) / 0.05) 100%)',
                                        border: '1px solid hsl(var(--primary) / 0.2)'
                                    }}>
                                        <MapIcon size={24} color="hsl(var(--primary))" />
                                    </div>
                                    <div>
                                        <h3 className="settings-title">Map Configuration</h3>
                                        <p className="settings-subtitle">Display preferences</p>
                                    </div>
                                </div>
                            </div>
                            <div className="settings-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                                <div>
                                    <label className="settings-label">Default Zoom Level</label>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '16px',
                                        background: 'linear-gradient(145deg, hsl(var(--main-bg)) 0%, hsl(var(--bg-secondary) / 0.3) 100%)',
                                        padding: '10px',
                                        borderRadius: '14px',
                                        border: '1px solid hsl(var(--border-color) / 0.5)',
                                        width: 'fit-content'
                                    }}>
                                        <button
                                            style={{
                                                width: '42px',
                                                height: '42px',
                                                borderRadius: '10px',
                                                background: 'linear-gradient(145deg, hsl(var(--primary) / 0.1) 0%, hsl(var(--primary) / 0.05) 100%)',
                                                border: '1px solid hsl(var(--primary) / 0.2)',
                                                color: 'hsl(var(--primary))',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'all 0.2s'
                                            }}
                                            onClick={() => { const next = Math.max(1, defaultZoom - 1); setDefaultZoom(next); localStorage.setItem('hmd_map_zoom', next); }}
                                            disabled={defaultZoom <= 1}
                                        >
                                            <Minus size={18} />
                                        </button>
                                        <span style={{ fontSize: '1.5rem', fontWeight: 800, minWidth: '50px', textAlign: 'center', color: 'hsl(var(--primary))' }}>{defaultZoom}</span>
                                        <button
                                            style={{
                                                width: '42px',
                                                height: '42px',
                                                borderRadius: '10px',
                                                background: 'linear-gradient(145deg, hsl(var(--primary) / 0.1) 0%, hsl(var(--primary) / 0.05) 100%)',
                                                border: '1px solid hsl(var(--primary) / 0.2)',
                                                color: 'hsl(var(--primary))',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'all 0.2s'
                                            }}
                                            onClick={() => { const next = Math.min(20, defaultZoom + 1); setDefaultZoom(next); localStorage.setItem('hmd_map_zoom', next); }}
                                            disabled={defaultZoom >= 20}
                                        >
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="settings-label">Base Map Style</label>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        {[
                                            { value: 'road', label: 'Road Map', sub: 'OpenStreetMap', icon: '🗺️' },
                                            { value: 'satellite', label: 'Satellite', sub: 'ESRI', icon: '🛰️' }
                                        ].map(opt => {
                                            const active = defaultStyle === opt.value;
                                            return (
                                                <button key={opt.value} className={`settings-option-card${active ? ' active' : ''}`} onClick={() => { setDefaultStyle(opt.value); localStorage.setItem('hmd_map_style', opt.value); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px' }}>
                                                    <span style={{ fontSize: '1.25rem' }}>{opt.icon}</span>
                                                    <div style={{ textAlign: 'left' }}>
                                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: active ? 'hsl(var(--primary))' : 'hsl(var(--text-primary))' }}>{opt.label}</div>
                                                        <div style={{ fontWeight: 500, fontSize: '0.7rem', color: 'hsl(var(--text-muted))', marginTop: '1px' }}>{opt.sub}</div>
                                                    </div>
                                                    {active && (
                                                        <div style={{ marginLeft: 'auto', width: '18px', height: '18px', borderRadius: '50%', background: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4.5 7.5L8 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <label className="settings-label">Torpedo Status Legend</label>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '16px',
                                        background: 'linear-gradient(145deg, hsl(var(--main-bg)) 0%, hsl(var(--bg-secondary) / 0.3) 100%)',
                                        padding: '14px 16px',
                                        borderRadius: '14px',
                                        border: '1px solid hsl(var(--border-color) / 0.5)',
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'hsl(var(--text-primary))' }}>
                                                Show torpedo legend on map
                                            </div>
                                            <div style={{ fontWeight: 500, fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                                                Total + breakdown (Idle / Moving / Assigned / Maintenance)
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="settings-toggle"
                                            onClick={() => {
                                                const next = !showTorpedoLegend;
                                                setShowTorpedoLegend(next);
                                                localStorage.setItem('hmd_show_torpedo_legend', String(next));
                                                window.dispatchEvent(new CustomEvent('hmd:settings-changed', { detail: { key: 'hmd_show_torpedo_legend', value: next } }));
                                            }}
                                            style={{
                                                background: showTorpedoLegend
                                                    ? 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 100%)'
                                                    : 'hsl(var(--border-color))',
                                            }}
                                            aria-pressed={showTorpedoLegend}
                                            aria-label="Toggle torpedo legend on map"
                                        >
                                            <div className="settings-toggle-knob" style={{ left: showTorpedoLegend ? '26px' : '2px' }} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="settings-premium-card">
                            <div className="settings-card-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div className="settings-icon-box" style={{
                                        background: 'linear-gradient(135deg, hsl(var(--success) / 0.15) 0%, hsl(var(--success) / 0.05) 100%)',
                                        border: '1px solid hsl(var(--success) / 0.2)'
                                    }}>
                                        <Globe size={24} color="hsl(var(--success))" />
                                    </div>
                                    <div>
                                        <h3 className="settings-title">System Health</h3>
                                        <p className="settings-subtitle">Real-time monitoring</p>
                                    </div>
                                </div>
                            </div>
                            <div className="settings-card-body">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                        <div className="settings-stat-card">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                                <div className="settings-pulse" style={{
                                                    width: '10px',
                                                    height: '10px',
                                                    borderRadius: '50%',
                                                    background: systemStats.backend === 'online' ? 'hsl(var(--success))' : 'hsl(var(--danger))',
                                                    boxShadow: `0 0 10px ${systemStats.backend === 'online' ? 'hsl(var(--success))' : 'hsl(var(--danger))'}`
                                                }} />
                                                <span className="settings-label" style={{ margin: 0 }}>Backend</span>
                                            </div>
                                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: systemStats.backend === 'online' ? 'hsl(var(--success))' : 'hsl(var(--danger))' }}>
                                                {systemStats.backend.toUpperCase()}
                                            </div>
                                        </div>
                                        <div className="settings-stat-card">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                                <div className="settings-pulse" style={{
                                                    width: '10px',
                                                    height: '10px',
                                                    borderRadius: '50%',
                                                    background: systemStats.db === 'online' ? 'hsl(var(--success))' : 'hsl(var(--danger))',
                                                    boxShadow: `0 0 10px ${systemStats.db === 'online' ? 'hsl(var(--success))' : 'hsl(var(--danger))'}`
                                                }} />
                                                <span className="settings-label" style={{ margin: 0 }}>Database</span>
                                            </div>
                                            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: systemStats.db === 'online' ? 'hsl(var(--success))' : 'hsl(var(--danger))' }}>
                                                {systemStats.db.toUpperCase()}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                <span className="settings-label" style={{ margin: 0 }}>CPU Load</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'hsl(var(--primary))' }}>{systemStats.cpu.toFixed(1)}%</span>
                                            </div>
                                            <div className="settings-progress">
                                                <div className="settings-progress-bar" style={{
                                                    width: `${systemStats.cpu}%`,
                                                    background: `linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(220, 80%, 55%) 100%)`
                                                }} />
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                <span className="settings-label" style={{ margin: 0 }}>Memory Usage</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'hsl(var(--accent))' }}>{systemStats.memory.toFixed(1)}%</span>
                                            </div>
                                            <div className="settings-progress">
                                                <div className="settings-progress-bar" style={{
                                                    width: `${systemStats.memory}%`,
                                                    background: `linear-gradient(90deg, hsl(var(--accent)) 0%, hsl(24, 95%, 55%) 100%)`
                                                }} />
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ paddingTop: '16px', borderTop: '1px solid hsl(var(--border-color) / 0.5)', display: 'flex', justifyContent: 'space-between' }}>
                                        <div>
                                            <span className="settings-label" style={{ marginBottom: '4px' }}>DB Latency</span>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'hsl(var(--primary))' }}>{systemStats.db_latency}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <span className="settings-label" style={{ marginBottom: '4px' }}>Uptime</span>
                                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'hsl(var(--success))' }}>{systemStats.uptime}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="settings-premium-card">
                            <div className="settings-card-header">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div className="settings-icon-box" style={{
                                        background: 'linear-gradient(135deg, hsl(var(--danger) / 0.15) 0%, hsl(var(--danger) / 0.05) 100%)',
                                        border: '1px solid hsl(var(--danger) / 0.2)'
                                    }}>
                                        <Timer size={24} color="hsl(var(--danger))" />
                                    </div>
                                    <div>
                                        <h3 className="settings-title">Deviation Thresholds</h3>
                                        <p className="settings-subtitle">Trip delay classification</p>
                                    </div>
                                </div>
                            </div>
                            <div className="settings-card-body">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <p style={{ fontSize: '0.85rem', color: 'hsl(var(--text-muted))', lineHeight: 1.6, margin: 0 }}>
                                        Set when trips are classified as Warning, Alert, or Critical.
                                    </p>
                                    <div className="settings-threshold-card warning">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: '#f59e0b' }}></div>
                                                <span style={{ fontWeight: 700, color: 'hsl(var(--text-primary))' }}>Warning</span>
                                            </div>
                                            <span style={{ fontWeight: 800, color: '#f59e0b', fontSize: '1.1rem' }}>{alertSettings.warningThreshold} min</span>
                                        </div>
                                        <input type="range" min="5" max="30" value={alertSettings.warningThreshold}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value)
                                                if (val < alertSettings.alertThreshold) updateAlertSettings('warningThreshold', val)
                                            }}
                                            className="settings-slider" style={{ accentColor: '#f59e0b' }}
                                        />
                                    </div>
                                    <div className="settings-threshold-card alert">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: '#f97316' }}></div>
                                                <span style={{ fontWeight: 700, color: 'hsl(var(--text-primary))' }}>Alert</span>
                                            </div>
                                            <span style={{ fontWeight: 800, color: '#f97316', fontSize: '1.1rem' }}>{alertSettings.alertThreshold} min</span>
                                        </div>
                                        <input type="range" min="10" max="45" value={alertSettings.alertThreshold}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value)
                                                if (val > alertSettings.warningThreshold && val < alertSettings.criticalThreshold) updateAlertSettings('alertThreshold', val)
                                            }}
                                            className="settings-slider" style={{ accentColor: '#f97316' }}
                                        />
                                    </div>
                                    <div className="settings-threshold-card critical">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ width: '14px', height: '14px', borderRadius: '4px', background: '#ef4444' }}></div>
                                                <span style={{ fontWeight: 700, color: 'hsl(var(--text-primary))' }}>Critical</span>
                                            </div>
                                            <span style={{ fontWeight: 800, color: '#ef4444', fontSize: '1.1rem' }}>{alertSettings.criticalThreshold} min</span>
                                        </div>
                                        <input type="range" min="20" max="60" value={alertSettings.criticalThreshold}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value)
                                                if (val > alertSettings.alertThreshold) updateAlertSettings('criticalThreshold', val)
                                            }}
                                            className="settings-slider" style={{ accentColor: '#ef4444' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </>)}
                {isAdmin && activeTab === 'danger' && (
                    <div style={{ width: '100%' }}>
                        <div style={{
                            border: '1px solid hsl(var(--danger) / 0.25)',
                            borderRadius: '20px',
                            padding: '28px',
                            background: 'hsl(var(--card-bg))',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
                            position: 'relative',
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                                background: 'linear-gradient(90deg, hsl(var(--danger)), hsl(var(--danger) / 0.3))',
                            }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '10px',
                                    background: 'hsl(var(--danger) / 0.1)',
                                    border: '1px solid hsl(var(--danger) / 0.2)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <AlertTriangle size={18} color="hsl(var(--danger))" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, color: 'hsl(var(--danger))', fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.01em' }}>Danger Zone</h3>
                                    <p style={{ margin: 0, color: 'hsl(var(--text-muted))', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Irreversible actions that affect operational data
                                    </p>
                                </div>
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '18px 22px', marginTop: '20px',
                                border: '1px solid hsl(var(--danger) / 0.15)', borderRadius: '14px',
                                background: 'linear-gradient(145deg, hsl(var(--main-bg)) 0%, hsl(var(--card-bg) / 0.5) 100%)',
                            }}>
                                <div style={{ flex: 1, marginRight: '20px' }}>
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 600, color: 'hsl(var(--text-main))' }}>
                                        Reset Plans Data
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'hsl(var(--text-muted))', lineHeight: 1.5 }}>
                                        Delete all plans, distributions, trips, and weighbridge records. Resets torpedo fleet to available status.
                                    </p>
                                </div>
                                <button className="settings-btn danger" onClick={fetchResetCounts} style={{ padding: '10px 22px', borderRadius: '10px', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                    Reset Plans Data
                                </button>
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '18px 22px', marginTop: '12px',
                                border: '1px solid hsl(var(--danger) / 0.15)', borderRadius: '14px',
                                background: 'linear-gradient(145deg, hsl(var(--main-bg)) 0%, hsl(var(--card-bg) / 0.5) 100%)',
                            }}>
                                <div style={{ flex: 1, marginRight: '20px' }}>
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 600, color: 'hsl(var(--text-main))' }}>
                                        Reset Converter Heats
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'hsl(var(--text-muted))', lineHeight: 1.5 }}>
                                        Reset heat counts to zero for all BOF converters across all consumers. Does not affect ZPF/EAF equipment.
                                    </p>
                                </div>
                                {!heatResetConfirm ? (
                                    <button className="settings-btn danger" onClick={() => setHeatResetConfirm(true)} style={{ padding: '10px 22px', borderRadius: '10px', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                        <RotateCcw size={14} style={{ marginRight: '6px' }} />
                                        Reset Heats
                                    </button>
                                ) : (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="settings-btn secondary" onClick={() => setHeatResetConfirm(false)} style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '0.82rem' }}>
                                            Cancel
                                        </button>
                                        <button
                                            onClick={executeHeatReset}
                                            disabled={heatResetLoading}
                                            style={{
                                                padding: '8px 16px', borderRadius: '10px', border: 'none',
                                                background: 'linear-gradient(135deg, hsl(var(--danger)) 0%, hsl(0, 70%, 45%) 100%)',
                                                color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                                                opacity: heatResetLoading ? 0.7 : 1,
                                            }}
                                        >
                                            {heatResetLoading ? 'Resetting...' : 'Confirm Reset'}
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '18px 22px', marginTop: '12px',
                                border: '1px solid hsl(var(--danger) / 0.15)', borderRadius: '14px',
                                background: 'linear-gradient(145deg, hsl(var(--main-bg)) 0%, hsl(var(--card-bg) / 0.5) 100%)',
                            }}>
                                <div style={{ flex: 1, marginRight: '20px' }}>
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 600, color: 'hsl(var(--text-main))' }}>
                                        Delete All Notifications
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'hsl(var(--text-muted))', lineHeight: 1.5 }}>
                                        Permanently delete all notifications for all users from the system. This cannot be undone.
                                    </p>
                                </div>
                                {!notifClearConfirm ? (
                                    <button className="settings-btn danger" onClick={() => setNotifClearConfirm(true)} style={{ padding: '10px 22px', borderRadius: '10px', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                        <Trash2 size={14} style={{ marginRight: '6px' }} />
                                        Delete Notifications
                                    </button>
                                ) : (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button className="settings-btn secondary" onClick={() => setNotifClearConfirm(false)} style={{ padding: '8px 16px', borderRadius: '10px', fontSize: '0.82rem' }}>
                                            Cancel
                                        </button>
                                        <button
                                            onClick={executeClearNotifications}
                                            disabled={notifClearLoading}
                                            style={{
                                                padding: '8px 16px', borderRadius: '10px', border: 'none',
                                                background: 'linear-gradient(135deg, hsl(var(--danger)) 0%, hsl(0, 70%, 45%) 100%)',
                                                color: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                                                opacity: notifClearLoading ? 0.7 : 1,
                                            }}
                                        >
                                            {notifClearLoading ? 'Deleting...' : 'Confirm Delete'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {isAdmin && activeTab === 'whatsapp' && (
                    <div style={{ width: '100%' }}>
                        <style>{`
                            @keyframes pulse {
                                0%, 100% { opacity: 1; transform: scale(1); }
                                50% { opacity: 0.7; transform: scale(1.1); }
                            }
                            .wa-status-banner {
                                background: linear-gradient(135deg, #075E54 0%, #128C7E 50%, #25D366 100%);
                                border-radius: 20px;
                                padding: 28px 32px;
                                margin-bottom: 24px;
                                position: relative;
                                overflow: hidden;
                            }
                            .wa-status-banner::before {
                                content: '';
                                position: absolute;
                                top: -50%;
                                right: -20%;
                                width: 400px;
                                height: 400px;
                                background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
                                pointer-events: none;
                            }
                            .wa-status-banner::after {
                                content: '';
                                position: absolute;
                                bottom: -30%;
                                left: -10%;
                                width: 300px;
                                height: 300px;
                                background: radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%);
                                pointer-events: none;
                            }
                            .wa-stat-card {
                                background: hsl(var(--card-bg));
                                border-radius: 16px;
                                padding: 20px 24px;
                                border: 1px solid hsl(var(--border-color));
                                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                                position: relative;
                                overflow: hidden;
                            }
                            .wa-stat-card:hover {
                                transform: translateY(-2px);
                                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
                                border-color: hsl(var(--accent) / 0.3);
                            }
                            .wa-stat-card::before {
                                content: '';
                                position: absolute;
                                top: 0;
                                left: 0;
                                right: 0;
                                height: 3px;
                                background: linear-gradient(90deg, var(--stat-color) 0%, transparent 100%);
                                opacity: 0;
                                transition: opacity 0.3s ease;
                            }
                            .wa-stat-card:hover::before {
                                opacity: 1;
                            }
                            .wa-config-panel {
                                background: hsl(var(--card-bg));
                                border-radius: 20px;
                                border: 1px solid hsl(var(--border-color));
                                overflow: hidden;
                            }
                            .wa-config-header {
                                background: linear-gradient(135deg, hsl(var(--bg-secondary)) 0%, hsl(var(--main-bg)) 100%);
                                padding: 20px 28px;
                                border-bottom: 1px solid hsl(var(--border-color));
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                            }
                            .wa-config-row {
                                display: flex;
                                align-items: center;
                                justify-content: space-between;
                                padding: 20px 28px;
                                border-bottom: 1px solid hsl(var(--border-color) / 0.5);
                                transition: background 0.2s ease;
                            }
                            .wa-config-row:last-child {
                                border-bottom: none;
                            }
                            .wa-config-row:hover {
                                background: hsl(var(--main-bg) / 0.5);
                            }
                            .wa-icon-box {
                                width: 44px;
                                height: 44px;
                                border-radius: 12px;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                transition: transform 0.2s ease;
                            }
                            .wa-config-row:hover .wa-icon-box {
                                transform: scale(1.05);
                            }
                            .wa-group-card {
                                background: hsl(var(--card-bg));
                                border-radius: 16px;
                                border: 1px solid hsl(var(--border-color));
                                padding: 20px 24px;
                                transition: all 0.3s ease;
                            }
                            .wa-group-card:hover {
                                border-color: hsl(var(--accent) / 0.3);
                                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
                            }
                            .wa-btn-primary {
                                background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                                color: white;
                                border: none;
                                padding: 10px 20px;
                                border-radius: 10px;
                                font-weight: 600;
                                font-size: 0.85rem;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                gap: 8px;
                                transition: all 0.2s ease;
                            }
                            .wa-btn-primary:hover {
                                transform: translateY(-1px);
                                box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3);
                            }
                            .wa-btn-primary:disabled {
                                opacity: 0.6;
                                cursor: not-allowed;
                                transform: none;
                            }
                            .wa-btn-secondary {
                                background: hsl(var(--main-bg));
                                color: hsl(var(--text-primary));
                                border: 1px solid hsl(var(--border-color));
                                padding: 10px 20px;
                                border-radius: 10px;
                                font-weight: 600;
                                font-size: 0.85rem;
                                cursor: pointer;
                                display: flex;
                                align-items: center;
                                gap: 8px;
                                transition: all 0.2s ease;
                            }
                            .wa-btn-secondary:hover {
                                background: hsl(var(--bg-secondary));
                                border-color: hsl(var(--accent) / 0.3);
                            }
                            .wa-toggle {
                                width: 52px;
                                height: 28px;
                                border-radius: 14px;
                                border: none;
                                position: relative;
                                cursor: pointer;
                                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                                box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
                            }
                            .wa-toggle .toggle-knob {
                                width: 24px;
                                height: 24px;
                                border-radius: 50%;
                                background: linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%);
                                position: absolute;
                                top: 2px;
                                box-shadow: 0 2px 6px rgba(0,0,0,0.2);
                                transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                            }
                            .wa-section-title {
                                font-size: 1.1rem;
                                font-weight: 700;
                                display: flex;
                                align-items: center;
                                gap: 10px;
                                margin: 0;
                            }
                            .wa-badge {
                                padding: 4px 12px;
                                border-radius: 20px;
                                font-size: 0.7rem;
                                font-weight: 700;
                                text-transform: uppercase;
                                letter-spacing: 0.5px;
                            }
                        `}</style>
                        <div className="wa-status-banner">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                    <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <MessageSquare size={32} color="white" />
                                    </div>
                                    <div>
                                        <h2 style={{ margin: 0, color: 'white', fontSize: '1.5rem', fontWeight: 700 }}>WhatsApp Notifications</h2>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: whatsappStatus.connected ? 'rgba(255,255,255,0.2)' : 'rgba(255,100,100,0.3)', padding: '6px 14px', borderRadius: '20px' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: whatsappStatus.connected ? '#7FFF7F' : '#FF6B6B', boxShadow: whatsappStatus.connected ? '0 0 8px #7FFF7F' : 'none' }} />
                                                <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: 600 }}>
                                                    {whatsappStatus.connected ? 'Connected' : 'Disconnected'}
                                                </span>
                                            </div>
                                            {whatsappStatus.connected && whatsappStatus.phoneNumber && (
                                                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.9rem', fontWeight: 500 }}>
                                                    +{whatsappStatus.phoneNumber}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    {whatsappStatus.connected ? (
                                        <button onClick={handleWhatsAppLogoutClick} className="wa-btn-secondary" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white' }}>
                                            <X size={18} />
                                            <span>Disconnect</span>
                                        </button>
                                    ) : (
                                        <button onClick={handleGetQRCode} className="wa-btn-secondary" style={{ background: 'rgba(255,255,255,0.95)', color: '#075E54' }}>
                                            <Phone size={18} />
                                            <span>Connect WhatsApp</span>
                                        </button>
                                    )}
                                    {hasWhatsappConfigChanges && (
                                        <button onClick={handleSaveWhatsAppConfig} disabled={whatsappConfigSaving || whatsappConfigLoading} className="wa-btn-secondary" style={{ background: '#25D366', color: 'white', animation: 'pulse 2s ease-in-out infinite' }}>
                                            {whatsappConfigSaving ? <RefreshCw className="animate-spin" size={18} /> : <Check size={18} />}
                                            <span>{whatsappConfigSaving ? 'Saving...' : 'Save Settings'}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {whatsappConfigLoading ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px', color: 'hsl(var(--text-muted))' }}>
                                <RefreshCw className="animate-spin" size={32} style={{ marginRight: '16px' }} />
                                Loading WhatsApp settings...
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '24px' }}>
                                    <div className="wa-stat-card" style={{
                                        '--stat-color': whatsappConfig.WHATSAPP_ENABLED === 'true' ? '#25D366' : 'hsl(var(--danger))',
                                        background: whatsappConfig.WHATSAPP_ENABLED === 'true'
                                            ? 'linear-gradient(135deg, hsl(var(--card-bg)) 0%, rgba(37, 211, 102, 0.08) 100%)'
                                            : 'hsl(var(--card-bg))',
                                        borderColor: whatsappConfig.WHATSAPP_ENABLED === 'true' ? 'rgba(37, 211, 102, 0.3)' : 'hsl(var(--border-color))'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <div style={{ color: 'hsl(var(--text-muted))', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Service Status</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{
                                                        width: '12px',
                                                        height: '12px',
                                                        borderRadius: '50%',
                                                        background: whatsappConfig.WHATSAPP_ENABLED === 'true' ? '#25D366' : 'hsl(var(--danger))',
                                                        boxShadow: whatsappConfig.WHATSAPP_ENABLED === 'true' ? '0 0 12px rgba(37, 211, 102, 0.6)' : 'none',
                                                        animation: whatsappConfig.WHATSAPP_ENABLED === 'true' ? 'pulse 2s ease-in-out infinite' : 'none'
                                                    }} />
                                                    <span style={{
                                                        fontSize: '1.25rem',
                                                        fontWeight: 700,
                                                        color: whatsappConfig.WHATSAPP_ENABLED === 'true' ? '#25D366' : 'hsl(var(--danger))'
                                                    }}>
                                                        {whatsappConfig.WHATSAPP_ENABLED === 'true' ? 'Active' : 'Inactive'}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '6px' }}>
                                                    {whatsappConfig.WHATSAPP_ENABLED === 'true' ? 'Notifications enabled' : 'Notifications disabled'}
                                                </div>
                                            </div>
                                            <div style={{
                                                width: '52px',
                                                height: '52px',
                                                borderRadius: '14px',
                                                background: whatsappConfig.WHATSAPP_ENABLED === 'true'
                                                    ? 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)'
                                                    : 'hsl(var(--border-color))',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: whatsappConfig.WHATSAPP_ENABLED === 'true' ? '0 4px 12px rgba(37, 211, 102, 0.3)' : 'none'
                                            }}>
                                                {whatsappConfig.WHATSAPP_ENABLED === 'true'
                                                    ? <CheckCircle2 size={26} color="white" />
                                                    : <X size={26} color="hsl(var(--text-muted))" />
                                                }
                                            </div>
                                        </div>
                                    </div>
                                    <div className="wa-stat-card" style={{ '--stat-color': 'hsl(var(--accent))' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <div style={{ color: 'hsl(var(--text-muted))', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Configured Groups</div>
                                                <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>{groupMappings.length}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '6px' }}>
                                                    {groupMappings.filter(g => g.is_active).length} active
                                                </div>
                                            </div>
                                            <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'linear-gradient(135deg, hsl(var(--accent)) 0%, hsl(var(--accent) / 0.7) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px hsl(var(--accent) / 0.3)' }}>
                                                <Users size={26} color="white" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="wa-stat-card" style={{ '--stat-color': 'hsl(var(--warning))' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <div style={{ color: 'hsl(var(--text-muted))', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Daily Report</div>
                                                <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>{whatsappConfig.WHATSAPP_DAILY_REPORT_TIME || '18:00'}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '6px' }}>
                                                    Auto-send time
                                                </div>
                                            </div>
                                            <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'linear-gradient(135deg, hsl(var(--warning)) 0%, hsl(var(--warning) / 0.7) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px hsl(var(--warning) / 0.3)' }}>
                                                <Timer size={26} color="white" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="wa-stat-card" style={{ '--stat-color': 'hsl(var(--success))' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div>
                                                <div style={{ color: 'hsl(var(--text-muted))', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Default Language</div>
                                                <div style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.2 }}>{SUPPORTED_LANGUAGES[whatsappConfig.WHATSAPP_DEFAULT_LANGUAGE] || 'English'}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'hsl(var(--text-muted))', marginTop: '6px' }}>
                                                    For messages
                                                </div>
                                            </div>
                                            <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'linear-gradient(135deg, hsl(var(--success)) 0%, hsl(var(--success) / 0.7) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px hsl(var(--success) / 0.3)' }}>
                                                <Globe size={26} color="white" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '24px' }}>
                                    <div className="wa-config-panel">
                                        <div className="wa-config-header">
                                            <h3 className="wa-section-title">
                                                <SettingsIcon size={20} />
                                                Configuration
                                            </h3>
                                        </div>
                                        <div className="wa-config-row">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                <div className="wa-icon-box" style={{ background: '#25D366' }}>
                                                    <MessageSquare size={20} color="white" />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Enable WhatsApp</div>
                                                    <div style={{ color: 'hsl(var(--text-muted))', fontSize: '0.8rem' }}>System-wide notifications</div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleWhatsAppConfigToggle('WHATSAPP_ENABLED', whatsappConfig.WHATSAPP_ENABLED === 'true' ? 'false' : 'true')}
                                                className="wa-toggle"
                                                style={{ background: whatsappConfig.WHATSAPP_ENABLED === 'true' ? '#25D366' : 'hsl(var(--border-color))' }}
                                            >
                                                <div className="toggle-knob" style={{ left: whatsappConfig.WHATSAPP_ENABLED === 'true' ? '26px' : '2px' }} />
                                            </button>
                                        </div>
                                        <div className="wa-config-row">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                <div className="wa-icon-box" style={{ background: 'hsl(var(--accent) / 0.15)' }}>
                                                    <Timer size={20} color="hsl(var(--accent))" />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Daily Report Time</div>
                                                    <div style={{ color: 'hsl(var(--text-muted))', fontSize: '0.8rem' }}>Auto-send summary</div>
                                                </div>
                                            </div>
                                            <input
                                                type="time"
                                                value={whatsappConfig.WHATSAPP_DAILY_REPORT_TIME || '18:00'}
                                                onChange={(e) => handleWhatsAppConfigToggle('WHATSAPP_DAILY_REPORT_TIME', e.target.value)}
                                                style={{
                                                    padding: '8px 14px',
                                                    borderRadius: '10px',
                                                    border: '1px solid hsl(var(--border-color))',
                                                    background: 'hsl(var(--main-bg))',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer'
                                                }}
                                            />
                                        </div>
                                        <div className="wa-config-row">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                <div className="wa-icon-box" style={{ background: 'hsl(var(--warning) / 0.15)' }}>
                                                    <Globe size={20} color="hsl(var(--warning))" />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Default Language</div>
                                                    <div style={{ color: 'hsl(var(--text-muted))', fontSize: '0.8rem' }}>Message language</div>
                                                </div>
                                            </div>
                                            <select
                                                value={whatsappConfig.WHATSAPP_DEFAULT_LANGUAGE || 'en'}
                                                onChange={(e) => handleWhatsAppConfigToggle('WHATSAPP_DEFAULT_LANGUAGE', e.target.value)}
                                                style={{
                                                    padding: '8px 14px',
                                                    borderRadius: '10px',
                                                    border: '1px solid hsl(var(--border-color))',
                                                    background: 'hsl(var(--main-bg))',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 600,
                                                    cursor: 'pointer',
                                                    minWidth: '120px'
                                                }}
                                            >
                                                {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
                                                    <option key={code} value={code}>{name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="wa-config-row" style={{ borderBottom: 'none' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                <div className="wa-icon-box" style={{ background: 'hsl(var(--success) / 0.15)' }}>
                                                    <Calendar size={20} color="hsl(var(--success))" />
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Next Report</div>
                                                    <div style={{ color: 'hsl(var(--text-muted))', fontSize: '0.8rem' }}>
                                                        {dailyReportSchedule.loading ? 'Loading...' :
                                                            dailyReportSchedule.scheduled && dailyReportSchedule.next_run ?
                                                                new Date(dailyReportSchedule.next_run).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) :
                                                                'Not scheduled'}
                                                    </div>
                                                </div>
                                            </div>
                                            <button onClick={handleSendDailyReportNow} disabled={sendingDailyReport || whatsappConfig.WHATSAPP_ENABLED !== 'true'} className="wa-btn-primary" style={{ padding: '8px 16px' }}>
                                                {sendingDailyReport ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                                                <span>{sendingDailyReport ? 'Sending...' : 'Send Now'}</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="wa-config-panel">
                                        <div className="wa-config-header">
                                            <h3 className="wa-section-title">
                                                <Users size={20} />
                                                Group Mappings
                                                <span className="wa-badge" style={{ background: 'hsl(var(--accent) / 0.15)', color: 'hsl(var(--accent))' }}>
                                                    {groupMappings.length} Groups
                                                </span>
                                            </h3>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                {whatsappStatus.connected && (
                                                    <button onClick={fetchAvailableGroups} className="wa-btn-secondary" style={{ padding: '8px 14px' }}>
                                                        <RefreshCw size={16} />
                                                        <span>Refresh Groups</span>
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => { setShowAddGroupModal(true); if (whatsappStatus.connected) fetchAvailableGroups(); }}
                                                    className="wa-btn-primary"
                                                    style={{ padding: '8px 14px' }}
                                                >
                                                    <Plus size={16} />
                                                    <span>Add Mapping</span>
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ padding: '20px', maxHeight: '400px', overflowY: 'auto' }}>
                                            {groupMappings.length === 0 ? (
                                                <div style={{
                                                    padding: '60px 40px',
                                                    textAlign: 'center',
                                                    background: 'hsl(var(--main-bg))',
                                                    borderRadius: '16px',
                                                    border: '2px dashed hsl(var(--border-color))'
                                                }}>
                                                    <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'hsl(var(--border-color) / 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                                        <MessageSquare size={28} color="hsl(var(--text-muted))" />
                                                    </div>
                                                    <p style={{ margin: 0, fontWeight: 600, color: 'hsl(var(--text-primary))' }}>No Group Mappings Yet</p>
                                                    <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>Link WhatsApp groups with producers and consumers</p>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    {groupMappings.map(mapping => (
                                                        <div key={mapping.id} className="wa-group-card" style={{ opacity: mapping.is_active ? 1 : 0.6 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                                    <div style={{
                                                                        width: '48px',
                                                                        height: '48px',
                                                                        borderRadius: '12px',
                                                                        background: mapping.mapping_type === 'producer' ? 'linear-gradient(135deg, hsl(var(--warning) / 0.2) 0%, hsl(var(--warning) / 0.05) 100%)' :
                                                                                   mapping.mapping_type === 'consumer' ? 'linear-gradient(135deg, hsl(var(--accent) / 0.2) 0%, hsl(var(--accent) / 0.05) 100%)' :
                                                                                   'linear-gradient(135deg, hsl(var(--danger) / 0.2) 0%, hsl(var(--danger) / 0.05) 100%)',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        border: `1px solid ${mapping.mapping_type === 'producer' ? 'hsl(var(--warning) / 0.3)' : mapping.mapping_type === 'consumer' ? 'hsl(var(--accent) / 0.3)' : 'hsl(var(--danger) / 0.3)'}`
                                                                    }}>
                                                                        {mapping.mapping_type === 'producer' ? <Factory size={22} color="hsl(var(--warning))" /> :
                                                                         mapping.mapping_type === 'consumer' ? <MapPin size={22} color="hsl(var(--accent))" /> :
                                                                         <Shield size={22} color="hsl(var(--danger))" />}
                                                                    </div>
                                                                    <div>
                                                                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{mapping.group_name}</div>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                                                                            <span className="wa-badge" style={{
                                                                                background: mapping.mapping_type === 'producer' ? 'hsl(var(--warning) / 0.15)' :
                                                                                           mapping.mapping_type === 'consumer' ? 'hsl(var(--accent) / 0.15)' :
                                                                                           'hsl(var(--danger) / 0.15)',
                                                                                color: mapping.mapping_type === 'producer' ? 'hsl(var(--warning))' :
                                                                                       mapping.mapping_type === 'consumer' ? 'hsl(var(--accent))' :
                                                                                       'hsl(var(--danger))'
                                                                            }}>
                                                                                {mapping.mapping_type}
                                                                            </span>
                                                                            {mapping.node_id && (
                                                                                <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', fontWeight: 600 }}>{mapping.node_id}</span>
                                                                            )}
                                                                            <span style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>• {SUPPORTED_LANGUAGES[mapping.language_code] || mapping.language_code}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                    <button
                                                                        onClick={() => handleToggleGroupMapping(mapping.id, 'is_active', !mapping.is_active)}
                                                                        className="wa-toggle"
                                                                        style={{ width: '44px', height: '24px', background: mapping.is_active ? '#25D366' : 'hsl(var(--border-color))' }}
                                                                        title={mapping.is_active ? 'Enabled' : 'Disabled'}
                                                                    >
                                                                        <div className="toggle-knob" style={{ width: '20px', height: '20px', left: mapping.is_active ? '22px' : '2px' }} />
                                                                    </button>
                                                                    <button onClick={() => handleSendTestMessage(mapping.group_jid, mapping.group_name)} disabled={sendingTest || !whatsappStatus.connected} className="wa-btn-secondary" style={{ padding: '8px 12px', minWidth: 'auto' }} title="Send test message">
                                                                        <Bell size={16} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleDeleteGroupMapping(mapping.id)}
                                                                        style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: 'hsl(var(--danger) / 0.1)', color: 'hsl(var(--danger))', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                                        title="Delete mapping"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                        {showQrModal && (
                            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                                <div style={{
                                    background: 'hsl(var(--card-bg))',
                                    borderRadius: '16px',
                                    padding: '32px',
                                    maxWidth: '400px',
                                    width: '90%',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <MessageSquare size={20} color="#25D366" />
                                            Scan QR Code
                                        </h3>
                                        <button onClick={() => { setShowQrModal(false); setQrCode(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                            <X size={20} />
                                        </button>
                                    </div>
                                    {qrLoading ? (
                                        <div style={{ padding: '60px', color: 'hsl(var(--text-muted))' }}>
                                            <RefreshCw className="animate-spin" size={32} style={{ marginBottom: '16px' }} />
                                            <p>Preparing WhatsApp connection...</p>
                                            <p style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '8px' }}>This may take a moment if the service was recently disconnected</p>
                                        </div>
                                    ) : qrCode ? (
                                        <>
                                            <img src={qrCode} alt="WhatsApp QR Code" style={{ width: '250px', height: '250px', borderRadius: '12px', border: '4px solid #25D366' }} />
                                            <p style={{ marginTop: '16px', color: 'hsl(var(--text-muted))', fontSize: '0.9rem' }}>
                                                Open WhatsApp on your phone, go to Settings → Linked Devices → Link a Device
                                            </p>
                                            <button onClick={handleGetQRCode} className="settings-btn secondary" style={{ marginTop: '16px' }}>
                                                <RefreshCw size={16} />
                                                <span>Refresh QR</span>
                                            </button>
                                        </>
                                    ) : (
                                        <div style={{ padding: '40px', color: 'hsl(var(--text-muted))' }}>
                                            <Bell size={32} style={{ marginBottom: '16px' }} />
                                            <p>QR code not available. The service may be initializing.</p>
                                            <button onClick={handleGetQRCode} className="settings-btn primary" style={{ marginTop: '16px' }}>
                                                <RefreshCw size={16} />
                                                <span>Try Again</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {showDisconnectModal && (
                            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                                <div style={{
                                    background: 'hsl(var(--card-bg))',
                                    borderRadius: '16px',
                                    padding: '32px',
                                    maxWidth: '450px',
                                    width: '90%'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#e74c3c' }}>
                                            <Unlink size={20} />
                                            Disconnect WhatsApp
                                        </h3>
                                        <button onClick={() => setShowDisconnectModal(false)} disabled={disconnecting} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <p style={{ color: 'hsl(var(--text-muted))', marginBottom: '16px' }}>
                                        Are you sure you want to disconnect WhatsApp?
                                    </p>

                                    <div style={{ background: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.3)', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                                        <p style={{ margin: '0 0 12px 0', fontWeight: 600, color: '#e74c3c', fontSize: '0.9rem' }}>
                                            IMPORTANT: After disconnecting, also do this on your phone:
                                        </p>
                                        <ol style={{ margin: 0, paddingLeft: '20px', color: 'hsl(var(--text-muted))', fontSize: '0.85rem', lineHeight: 1.7 }}>
                                            <li>Open WhatsApp → Settings → Linked Devices</li>
                                            <li>Tap on <strong>"HMD System"</strong> device</li>
                                            <li>Select <strong>"Log Out"</strong></li>
                                        </ol>
                                        <p style={{ margin: '12px 0 0 0', fontSize: '0.85rem', color: 'hsl(var(--text-muted))' }}>
                                            This ensures a clean disconnection and prevents issues when reconnecting.
                                        </p>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                        <button onClick={() => setShowDisconnectModal(false)} disabled={disconnecting} className="settings-btn secondary">
                                            Cancel
                                        </button>
                                        <button onClick={handleWhatsAppLogoutConfirm} disabled={disconnecting} className="settings-btn" style={{ background: '#e74c3c', borderColor: '#e74c3c' }}>
                                            {disconnecting ? (
                                                <>
                                                    <RefreshCw className="animate-spin" size={16} />
                                                    <span>Disconnecting...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Unlink size={16} />
                                                    <span>Disconnect</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {showAddGroupModal && (
                            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                                <div style={{
                                    background: 'hsl(var(--card-bg))',
                                    borderRadius: '16px',
                                    padding: '32px',
                                    maxWidth: '500px',
                                    width: '90%'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                        <h3 style={{ margin: 0 }}>Add Group Mapping</h3>
                                        <button onClick={() => setShowAddGroupModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem' }}>WhatsApp Group</label>
                                            {availableGroups.length > 0 ? (
                                                <select
                                                    value={newGroupMapping.group_jid}
                                                    onChange={(e) => {
                                                        const group = availableGroups.find(g => g.jid === e.target.value)
                                                        setNewGroupMapping(prev => ({
                                                            ...prev,
                                                            group_jid: e.target.value,
                                                            group_name: group?.name || ''
                                                        }))
                                                    }}
                                                    className="settings-input"
                                                    style={{ width: '100%' }}
                                                >
                                                    <option value="">Select a group...</option>
                                                    {availableGroups.map(group => (
                                                        <option key={group.jid} value={group.jid}>{group.name}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input type="text" value={newGroupMapping.group_jid} onChange={(e) => setNewGroupMapping(prev => ({ ...prev, group_jid: e.target.value }))} placeholder="Enter Group JID (e.g., 120363xxx@g.us)" className="settings-input" style={{ width: '100%' }} />
                                            )}
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem' }}>Group Name</label>
                                            <input type="text" value={newGroupMapping.group_name} onChange={(e) => setNewGroupMapping(prev => ({ ...prev, group_name: e.target.value }))} placeholder="Display name for this group" className="settings-input" style={{ width: '100%' }} />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem' }}>Mapping Type</label>
                                            <select value={newGroupMapping.mapping_type} onChange={(e) => setNewGroupMapping(prev => ({ ...prev, mapping_type: e.target.value }))} className="settings-input" style={{ width: '100%' }}>
                                                <option value="producer">Producer</option>
                                                <option value="consumer">Consumer</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        </div>
                                        {newGroupMapping.mapping_type !== 'admin' && (
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem' }}>
                                                    {newGroupMapping.mapping_type === 'producer' ? 'Producer ID' : 'Consumer ID'}
                                                </label>
                                                <select value={newGroupMapping.node_id} onChange={(e) => setNewGroupMapping(prev => ({ ...prev, node_id: e.target.value }))} className="settings-input" style={{ width: '100%' }}>
                                                    <option value="">Select {newGroupMapping.mapping_type}...</option>
                                                    {(newGroupMapping.mapping_type === 'producer' ? producers : consumers).map(item => (
                                                        <option key={item.user_id} value={item.user_id}>{item.user_id}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '0.85rem' }}>Language</label>
                                            <select value={newGroupMapping.language_code} onChange={(e) => setNewGroupMapping(prev => ({ ...prev, language_code: e.target.value }))} className="settings-input" style={{ width: '100%' }}>
                                                {Object.entries(SUPPORTED_LANGUAGES).map(([code, name]) => (
                                                    <option key={code} value={code}>{name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                            <button onClick={() => setShowAddGroupModal(false)} className="settings-btn secondary" style={{ flex: 1 }}>
                                                Cancel
                                            </button>
                                            <button onClick={handleAddGroupMapping} disabled={!newGroupMapping.group_jid || !newGroupMapping.group_name} className="settings-btn primary" style={{ flex: 1 }}>
                                                <Check size={18} />
                                                <span>Add Mapping</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'security' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        <div style={{
                            background: 'var(--bg-secondary)',
                            borderRadius: '16px',
                            border: '1px solid hsl(var(--border-color))',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                padding: '20px 24px',
                                borderBottom: '1px solid hsl(var(--border-color))',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '10px',
                                    background: 'hsl(var(--primary) / 0.1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <User size={18} color="hsl(var(--primary))" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Account</h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Your profile details</p>
                                </div>
                            </div>
                            <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                <div>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>USERNAME</div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{currentUser?.username}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>ROLE</div>
                                    <span style={{
                                        padding: '4px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700,
                                        background: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))', textTransform: 'uppercase'
                                    }}>{currentUser?.role}</span>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>HOST ID</div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{currentUser?.user_id || 'Central Admin'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'hsl(var(--text-muted))', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>EMAIL</div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{currentUser?.email || 'Not set'}</div>
                                </div>
                            </div>
                        </div>
                        <div style={{
                            background: 'var(--bg-secondary)',
                            borderRadius: '16px',
                            border: '1px solid hsl(var(--border-color))',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                padding: '20px 24px',
                                borderBottom: '1px solid hsl(var(--border-color))',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                            }}>
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '10px',
                                    background: 'hsl(var(--warning) / 0.1)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Lock size={18} color="hsl(var(--warning))" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Password</h3>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>Manage your account password</p>
                                </div>
                            </div>
                            <div style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Change Password</div>
                                    <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))', marginTop: '4px' }}>Update your account password regularly for security</div>
                                </div>
                                <button className="premium-btn primary" style={{ padding: '10px 20px', height: 'auto', fontSize: '0.85rem' }} onClick={() => setShowPasswordModal(true)}>
                                    Change Password
                                </button>
                            </div>
                        </div>
                        <div style={{
                            background: 'var(--bg-secondary)',
                            borderRadius: '16px',
                            border: '1px solid hsl(var(--border-color))',
                            overflow: 'hidden'
                        }}>
                            <div style={{ padding: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '10px',
                                        background: 'hsl(var(--danger) / 0.1)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <LogOut size={18} color="hsl(var(--danger))" />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Sign Out</div>
                                        <div style={{ fontSize: '0.8rem', color: 'hsl(var(--text-muted))' }}>End your current session</div>
                                    </div>
                                </div>
                                <button
                                    className="premium-btn"
                                    style={{
                                        padding: '10px 20px', height: 'auto', fontSize: '0.85rem',
                                        background: 'hsl(var(--danger) / 0.1)', color: 'hsl(var(--danger))',
                                        border: '1px solid hsl(var(--danger) / 0.2)'
                                    }}
                                    onClick={logout}
                                >
                                    Sign Out
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {showPasswordModal && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                        <div style={{
                            background: 'hsl(var(--bg-secondary))',
                            borderRadius: '16px',
                            width: '100%', maxWidth: '420px',
                            boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                padding: '20px 24px',
                                borderBottom: '1px solid hsl(var(--border-color))',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '36px', height: '36px', borderRadius: '10px',
                                        background: 'hsl(var(--warning) / 0.1)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Lock size={18} color="hsl(var(--warning))" />
                                    </div>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Change Password</h3>
                                </div>
                                <button onClick={() => setShowPasswordModal(false)} style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    padding: '4px', borderRadius: '6px', color: 'hsl(var(--text-muted))'
                                }}>
                                    <X size={18} />
                                </button>
                            </div>
                            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '6px', textTransform: 'uppercase' }}>Current Password</label>
                                    <input type="password" className="premium-input" style={{ width: '100%', height: '44px' }} value={passwordForm.currentPassword} onChange={e => setPasswordForm(p => ({ ...p, currentPassword: e.target.value }))} placeholder="Enter current password" />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '6px', textTransform: 'uppercase' }}>New Password</label>
                                    <input type="password" className="premium-input" style={{ width: '100%', height: '44px' }} value={passwordForm.newPassword} onChange={e => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))} placeholder="Enter new password (min 6 characters)" />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'hsl(var(--text-muted))', marginBottom: '6px', textTransform: 'uppercase' }}>Confirm New Password</label>
                                    <input type="password" className="premium-input" style={{ width: '100%', height: '44px' }} value={passwordForm.confirmPassword} onChange={e => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))} placeholder="Re-enter new password" />
                                </div>
                            </div>
                            <div style={{
                                padding: '16px 24px',
                                borderTop: '1px solid hsl(var(--border-color))',
                                display: 'flex', justifyContent: 'flex-end', gap: '12px'
                            }}>
                                <button className="premium-btn" style={{ padding: '10px 20px', height: 'auto' }} onClick={() => { setShowPasswordModal(false); setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' }) }}>
                                    Cancel
                                </button>
                                <button className="premium-btn primary" style={{ padding: '10px 20px', height: 'auto' }} onClick={handlePasswordChange} disabled={passwordLoading}>
                                    {passwordLoading ? 'Changing...' : 'Change Password'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {resetModalStep > 0 && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, animation: 'fadeInUp 0.2s ease-out', }} onClick={() => { setResetModalStep(0); setResetConfirmText(''); }}>
                        <div style={{
                            background: 'hsl(var(--card-bg))', borderRadius: '20px',
                            padding: '36px', maxWidth: '460px', width: '90%',
                            boxShadow: '0 25px 60px rgba(0,0,0,0.35), 0 0 0 1px hsl(var(--border-color) / 0.5)',
                            border: '1px solid hsl(var(--border-color) / 0.3)',
                        }} onClick={e => e.stopPropagation()}>

                            {resetModalStep === 1 && (
                                <>
                                    <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                                        <div style={{
                                            width: '60px', height: '60px', borderRadius: '16px',
                                            background: 'hsl(var(--danger) / 0.1)',
                                            border: '1px solid hsl(var(--danger) / 0.2)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            margin: '0 auto 18px',
                                        }}>
                                            <svg width="28" height="28" viewBox="0 0 20 20" fill="none">
                                                <path d="M10 2L1 18h18L10 2z" stroke="hsl(var(--danger))" strokeWidth="2" fill="none"/>
                                                <path d="M10 8v4M10 14h.01" stroke="hsl(var(--danger))" strokeWidth="2" strokeLinecap="round"/>
                                            </svg>
                                        </div>
                                        <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 700, color: 'hsl(var(--text-main))', letterSpacing: '-0.01em' }}>
                                            Are you sure?
                                        </h3>
                                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'hsl(var(--text-muted))', lineHeight: 1.5 }}>
                                            This action cannot be undone. The following data will be permanently deleted:
                                        </p>
                                    </div>

                                    {resetCounts && (
                                        <div style={{
                                            background: 'hsl(var(--main-bg))', borderRadius: '14px',
                                            padding: '6px 18px', marginBottom: '28px',
                                            border: '1px solid hsl(var(--border-color) / 0.5)',
                                        }}>
                                            {[
                                                { label: 'Daily Plans', count: resetCounts.daily_plans, color: 'hsl(var(--accent))' },
                                                { label: 'Distribution Assignments', count: resetCounts.distribution_assignments, color: '#8b5cf6' },
                                                { label: 'Trips', count: resetCounts.trips, color: 'hsl(var(--warning))' },
                                                { label: 'Weighbridge Records', count: resetCounts.weighbridge_records, color: 'hsl(var(--success))' },
                                                { label: 'Torpedoes to Reset', count: resetCounts.torpedoes_to_reset, color: 'hsl(var(--danger))' },
                                            ].map((item, i) => (
                                                <div key={i} style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '11px 0',
                                                    borderBottom: i < 4 ? '1px solid hsl(var(--border-color) / 0.4)' : 'none',
                                                }}>
                                                    <span style={{ fontSize: '0.82rem', color: 'hsl(var(--text-muted))', fontWeight: 500 }}>{item.label}</span>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: item.color, minWidth: '36px', textAlign: 'center', }}>{item.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button className="settings-btn secondary" onClick={() => { setResetModalStep(0); setResetConfirmText(''); }} style={{ flex: 1, padding: '12px', borderRadius: '12px' }}>Cancel</button>
                                        <button
                                            onClick={() => setResetModalStep(2)}
                                            style={{
                                                flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
                                                background: 'linear-gradient(135deg, hsl(var(--danger)) 0%, hsl(0, 70%, 45%) 100%)',
                                                color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                                boxShadow: '0 2px 8px hsl(var(--danger) / 0.3)',
                                                transition: 'all 0.2s',
                                            }}
                                        >Continue</button>
                                    </div>
                                </>
                            )}

                            {resetModalStep === 2 && (
                                <>
                                    <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                                        <div style={{
                                            width: '60px', height: '60px', borderRadius: '16px',
                                            background: 'hsl(var(--danger) / 0.1)',
                                            border: '1px solid hsl(var(--danger) / 0.2)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            margin: '0 auto 18px',
                                        }}>
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--danger))" strokeWidth="2" strokeLinecap="round">
                                                <path d="M12 9v4M12 17h.01"/>
                                                <path d="M3.6 15.4 10.3 3.1a2 2 0 0 1 3.4 0l6.7 12.3A2 2 0 0 1 18.7 18H5.3a2 2 0 0 1-1.7-2.6z"/>
                                            </svg>
                                        </div>
                                        <h3 style={{ margin: '0 0 8px', fontSize: '1.2rem', fontWeight: 700, color: 'hsl(var(--text-main))', letterSpacing: '-0.01em' }}>
                                            Type RESET to confirm
                                        </h3>
                                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'hsl(var(--text-muted))', lineHeight: 1.5 }}>
                                            This will permanently delete all plan and trip data.
                                        </p>
                                    </div>

                                    <input
                                        type="text"
                                        className="settings-input"
                                        value={resetConfirmText}
                                        onChange={e => setResetConfirmText(e.target.value)}
                                        placeholder="Type RESET here"
                                        autoFocus
                                        style={{
                                            textAlign: 'center', letterSpacing: '3px',
                                            fontWeight: 700, marginBottom: '24px',
                                            fontSize: '1rem',
                                            borderColor: resetConfirmText === 'RESET' ? 'hsl(var(--danger))' : undefined,
                                            boxShadow: resetConfirmText === 'RESET' ? '0 0 0 3px hsl(var(--danger) / 0.15)' : undefined,
                                        }}
                                    />

                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <button className="settings-btn secondary" onClick={() => { setResetModalStep(1); setResetConfirmText(''); }} style={{ flex: 1, padding: '12px', borderRadius: '12px' }}>Back</button>
                                        <button
                                            onClick={executeReset}
                                            disabled={resetConfirmText !== 'RESET' || resetLoading}
                                            style={{
                                                flex: 1, padding: '12px', borderRadius: '12px', border: 'none',
                                                background: resetConfirmText === 'RESET'
                                                    ? 'linear-gradient(135deg, hsl(var(--danger)) 0%, hsl(0, 70%, 45%) 100%)'
                                                    : 'hsl(var(--text-muted) / 0.3)',
                                                color: '#fff', fontSize: '0.85rem', fontWeight: 600,
                                                cursor: resetConfirmText === 'RESET' ? 'pointer' : 'not-allowed',
                                                opacity: resetLoading ? 0.7 : 1,
                                                transition: 'all 0.2s',
                                                boxShadow: resetConfirmText === 'RESET' ? '0 2px 8px hsl(var(--danger) / 0.3)' : 'none',
                                            }}
                                        >{resetLoading ? 'Resetting...' : 'Reset All Data'}</button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </main>

            <style>{`
                .command-header {
                    background: #0f172a;
                    color: white;
                    height: 80px;
                    padding: 0 24px;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    border-bottom: 1px solid #1e293b;
                }

                .command-brand {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .brand-icon {
                    background: hsl(var(--accent));
                    color: #0f172a;
                    padding: 6px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .brand-text h1 {
                    font-size: 1rem;
                    font-weight: 900;
                    margin: 0;
                    letter-spacing: 0.05em;
                }

                .brand-sub {
                    font-size: 0.6rem;
                    font-weight: 700;
                    opacity: 0.6;
                    text-transform: uppercase;
                }

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
                    background: hsl(var(--bg-secondary));
                    color: hsl(var(--text-primary));
                    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
                }

                .header-meta {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                }

                .premium-card {
                    display: flex !important;
                    flex-direction: column !important;
                    flex: 1 !important;
                    min-height: 0 !important;
                    background: hsl(var(--bg-secondary)) !important;
                    border-radius: 20px !important;
                    overflow: hidden !important;
                    box-shadow: 0 4px 20px -5px rgba(0,0,0,0.1) !important;
                }

                .premium-card-header {
                    flex-shrink: 0 !important;
                }

                .premium-card-body {
                    flex: 1 !important;
                    display: flex !important;
                    flex-direction: column !important;
                    overflow: hidden !important;
                    padding: 24px !important;
                    min-height: 0 !important;
                }

                .table-scroll-wrapper {
                    flex: 1;
                    overflow-y: auto;
                    min-height: 0;
                    margin-top: 12px;
                }

                /* Sticky Header for Tables - Fix for text showing through */
                .table-scroll-wrapper .dashboard-monitor-table {
                    border-collapse: collapse !important;
                    border-spacing: 0 !important;
                }

                .table-scroll-wrapper .dashboard-monitor-table thead {
                    position: sticky !important;
                    top: 0 !important;
                    z-index: 20 !important;
                }

                .table-scroll-wrapper .dashboard-monitor-table thead tr {
                    background: hsl(var(--bg-secondary)) !important;
                }

                .table-scroll-wrapper .dashboard-monitor-table thead th {
                    position: sticky !important;
                    top: 0 !important;
                    background: hsl(var(--bg-secondary)) !important;
                    z-index: 20 !important;
                    box-shadow: 0 2px 8px -2px rgba(0,0,0,0.15) !important;
                    border-bottom: 2px solid #e2e8f0 !important;
                    padding-top: 16px !important;
                    padding-bottom: 16px !important;
                }

                /* Re-add spacing for body rows only */
                .table-scroll-wrapper .dashboard-monitor-table tbody tr {
                    margin-top: 4px !important;
                }

                .table-scroll-wrapper .dashboard-monitor-table tbody tr td:first-child {
                    border-radius: 12px 0 0 12px !important;
                }

                .table-scroll-wrapper .dashboard-monitor-table tbody tr td:last-child {
                    border-radius: 0 12px 12px 0 !important;
                }

                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                /* Custom Scrollbar */
                .table-scroll-wrapper::-webkit-scrollbar {
                    width: 6px;
                }
                .table-scroll-wrapper::-webkit-scrollbar-thumb {
                    background: #e2e8f0;
                    border-radius: 10px;
                }
                .table-scroll-wrapper::-webkit-scrollbar-thumb:hover {
                    background: #cbd5e1;
                }
            `}</style>
        </div>
    );
}

export default Settings
