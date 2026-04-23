import { useState, useEffect, useCallback } from 'react'

import { api } from '../utils/api'
import { useNotification } from '../context/NotificationContext'
import { useAuth } from '../context/AuthContext'
import { useHeader } from '../context/HeaderContext'
import { generateMonthlyTemplate, transformToMonthlyDataFormat, ExcelUploadModal } from '../components/ExcelImport'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Save, Plus, Filter, Clock, CheckCircle2, AlertCircle, Loader2, MapPin, Database, History, Zap, RefreshCw, Users, XCircle, Search, ChevronDown, ChevronUp, Wrench, Edit2, Trash2, ArrowRightLeft, Factory, Settings, Download, Upload, Mail, Truck, Timer, Droplets, ArrowDownToLine, Route } from 'lucide-react'
import PlanHistory from '../components/PlanHistory'

const MonthlyPlanning = () => {
    const { user } = useAuth()
    const { showNotification } = useNotification()
    const { setHeaderContent } = useHeader()
    const [currentDate, setCurrentDate] = useState(new Date())
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [users, setUsers] = useState([])
    const [monthlyData, setMonthlyData] = useState({}) 
    const [selectedDate, setSelectedDate] = useState(null)
    const [showDayModal, setShowDayModal] = useState(false)
    const [dayForm, setDayForm] = useState({})
    const [viewMode, setViewMode] = useState('strategic') 
    const [maintenanceSchedules, setMaintenanceSchedules] = useState([])
    const [historyData, setHistoryData] = useState({ plans: [] })

    const [dailySummary, setDailySummary] = useState({ summary: {}, individual: [], assignments: [] })
    const [generating, setGenerating] = useState(false)
    const [committing, setCommitting] = useState(false)
    const [resetting, setResetting] = useState(false)
    const [generatedPlan, setGeneratedPlan] = useState(null)
    const [showResetModal, setShowResetModal] = useState(false)
    const [resetConfirmation, setResetConfirmation] = useState('')
    const [isConfirmed, setIsConfirmed] = useState(false)
    const [showBreakdownModal, setShowBreakdownModal] = useState(false)
    const [brokenNode, setBrokenNode] = useState(null)
    const [rePlanning, setRePlanning] = useState(false)
    const [executiveSubView, setExecutiveSubView] = useState('monitoring') 
    const [nodeSearch, setNodeSearch] = useState('')
    const [nodeFilterRole, setNodeFilterRole] = useState('all') 
    const [nodeFilterStatus, setNodeFilterStatus] = useState('all')
    const [nodeSortConfig, setNodeSortConfig] = useState({ key: 'user_id', direction: 'asc' })
    const [planSortConfig, setPlanSortConfig] = useState({ key: null, direction: 'asc' })

    const [schedules, setSchedules] = useState([])
    const [showMaintenanceModal, setShowMaintenanceModal] = useState(false)
    const [editingMaintenance, setEditingMaintenance] = useState(null)
    const [maintenanceFormData, setMaintenanceFormData] = useState({
        node_id: '',
        start_date: '',
        end_date: '',
        reason: ''
    })
    const [sendingEmail, setSendingEmail] = useState(false)
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [emailAddress, setEmailAddress] = useState('')

    const [travelProducers, setTravelProducers] = useState([])
    const [travelConsumers, setTravelConsumers] = useState([])
    const [travelMatrix, setTravelMatrix] = useState({})
    const [hoveredRow, setHoveredRow] = useState(null)
    const [hoveredCol, setHoveredCol] = useState(null)
    const [savingMatrix, setSavingMatrix] = useState(false)

    const [ttmSubTab, setTtmSubTab] = useState('travel-time') 

    const [consumerConfigs, setConsumerConfigs] = useState([])
    const [consumerEdits, setConsumerEdits] = useState({})
    const [savingConsumer, setSavingConsumer] = useState(false)

    const [producerConfigs, setProducerConfigs] = useState([])
    const [producerEdits, setProducerEdits] = useState({})
    const [savingProducer, setSavingProducer] = useState(false)

    const [hmMatrix, setHmMatrix] = useState({})

    const [systemSettings, setSystemSettings] = useState([])
    const [systemSettingsEdits, setSystemSettingsEdits] = useState({})
    const [savingSystemSettings, setSavingSystemSettings] = useState(false)

    const [showExcelModal, setShowExcelModal] = useState(false)

    const fetchMonthlyPlans = useCallback(async (dateObj) => {
        try {
            const year = dateObj.getFullYear()
            const month = dateObj.getMonth() + 1
            const [plans, maintenance] = await Promise.all([
                api.get(`/api/daily-plans/month/${year}/${month}`),
                api.get(`/api/maintenance/calendar/${year}/${month}`)
            ])
            setMonthlyData(plans || {})
            setMaintenanceSchedules(maintenance || [])
        } catch (err) {
            console.error("Failed to fetch monthly data:", err)
        }
    }, [])

    const fetchTargets = useCallback(async () => {
        try {
            
            const todayStr = new Date().toLocaleDateString('en-CA')
            const [nodes, summary] = await Promise.all([
                api.get('/api/locations'),
                api.get(`/api/daily-plans/dashboard-summary?date_str=${todayStr}`)
            ])
            setUsers(nodes)
            setDailySummary(summary)
            setIsConfirmed(summary.individual?.every(p => p.status === 'Confirmed') || false)
            await fetchMonthlyPlans(currentDate)
        } catch (err) {
            showNotification('error', 'Failed to fetch planning data')
        } finally {
            setLoading(false)
        }
    }, [showNotification, fetchMonthlyPlans, currentDate])

    useEffect(() => {
        fetchTargets()
    }, [fetchTargets])

    const fetchHistory = async () => {
        try {
            const today = new Date()
            const threeMonthsAgo = new Date()
            threeMonthsAgo.setMonth(today.getMonth() - 3)

            const startDate = threeMonthsAgo.toISOString().split('T')[0]
            const endDate = today.toISOString().split('T')[0]

            const data = await api.get(`/api/daily-plans/history-detailed?start_date=${startDate}&end_date=${endDate}`)
            setHistoryData(data)
        } catch (err) {
            showNotification('error', 'Failed to fetch planning history')
        }
    }

    useEffect(() => {
        if (viewMode === 'history') {
            fetchHistory()
        }
    }, [viewMode])

    const fetchTravelTimeConfig = async () => {
        try {
            const data = await api.get('/api/config/trip-times');
            const sortedProducers = (data.producers || []).sort((a, b) => a.user_id.localeCompare(b.user_id, undefined, { numeric: true, sensitivity: 'base' }));
            const sortedConsumers = (data.consumers || []).sort((a, b) => a.user_id.localeCompare(b.user_id, undefined, { numeric: true, sensitivity: 'base' }));

            setTravelProducers(sortedProducers);
            setTravelConsumers(sortedConsumers);
            const initialMatrix = {};
            if (data.configs) {
                data.configs.forEach(config => {
                    initialMatrix[`${config.source}_${config.destination}`] = config.time;
                });
            }
            setTravelMatrix(initialMatrix);
        } catch (error) {
            console.error('Failed to load travel time config:', error);
        }
    };

    const fetchConsumerConfig = async () => {
        try {
            const data = await api.get('/api/config/consumer-times');
            setConsumerConfigs(data.consumers || []);
            
            const edits = {};
            (data.consumers || []).forEach(c => {
                edits[c.user_id] = {
                    avg_unload_time: c.avg_unload_time || 0,
                    estimated_wait_time: c.estimated_wait_time || 0
                };
            });
            setConsumerEdits(edits);
        } catch (error) {
            console.error('Failed to load consumer config:', error);
        }
    };

    const fetchProducerConfig = async () => {
        try {
            const data = await api.get('/api/config/producer-times');
            setProducerConfigs(data.producers || []);
            
            const edits = {};
            (data.producers || []).forEach(p => {
                edits[p.user_id] = {
                    avg_fill_time: p.avg_fill_time || 0,
                    estimated_wait_time: p.estimated_wait_time || 0
                };
            });
            setProducerEdits(edits);
        } catch (error) {
            console.error('Failed to load producer config:', error);
        }
    };

    const fetchHmMatrix = async () => {
        try {
            const data = await api.get('/api/config/hm-matrix');
            setHmMatrix(data.matrix || {});
        } catch (error) {
            console.error('Failed to load HM matrix:', error);
        }
    };

    const fetchSystemSettings = async () => {
        try {
            const data = await api.get('/api/config/system-settings');
            setSystemSettings(data.settings || []);
            
            const edits = {};
            (data.settings || []).forEach(s => {
                edits[s.config_key] = s.config_value;
            });
            setSystemSettingsEdits(edits);
        } catch (error) {
            console.error('Failed to load system settings:', error);
        }
    };

    const handleSystemSettingChange = (key, value) => {
        setSystemSettingsEdits(prev => ({ ...prev, [key]: value }));
    };

    const saveSystemSettings = async () => {
        setSavingSystemSettings(true);
        try {
            const configs = Object.entries(systemSettingsEdits).map(([key, value]) => ({
                config_key: key,
                config_value: String(value)
            }));
            await api.post('/api/config/system-settings/bulk', { configs });
            showNotification('success', 'System settings saved successfully');
            fetchSystemSettings(); 
        } catch (error) {
            showNotification('error', 'Failed to save system settings');
        } finally {
            setSavingSystemSettings(false);
        }
    };

    useEffect(() => {
        if (viewMode === 'logistics') {
            fetchTravelTimeConfig();
            fetchConsumerConfig();
            fetchProducerConfig();
        }
    }, [viewMode]);

    useEffect(() => {
        if (viewMode === 'logistics' && ttmSubTab === 'hm-matrix') {
            fetchHmMatrix();
        }
    }, [viewMode, ttmSubTab]);

    useEffect(() => {
        if (viewMode === 'logistics' && ttmSubTab === 'system-settings') {
            fetchSystemSettings();
        }
    }, [viewMode, ttmSubTab]);

    const commitMonthToDB = useCallback(async () => {
        
        if (Object.keys(monthlyData).length === 0) {
            showNotification('warning', 'No changes to save.')
            return
        }

        setSaving(true)
        try {
            
            const savePromises = users.map(node => {
                const nodePlans = Object.entries(monthlyData)
                    .filter(([date, values]) => values[node.user_id] !== undefined && values[node.user_id] !== '')
                    .map(([date, values]) => ({
                        date,
                        capacity: values[node.user_id]
                    }))

                if (nodePlans.length > 0) {
                    return api.post('/api/daily-plans/monthly', {
                        user_id: node.user_id,
                        role: node.type,
                        plans: nodePlans
                    })
                }
                return null
            }).filter(p => p !== null)

            if (savePromises.length === 0) {
                showNotification('warning', 'No valid data points found to commit.')
                return
            }

            await Promise.all(savePromises)

            showNotification('success', 'Monthly Strategic Plan committed to database!')

            await fetchMonthlyPlans(currentDate)

            await fetchTargets()
        } catch (err) {
            console.error("Commit Error:", err)
            showNotification('error', `Failed to commit plan: ${err.message}`)
        } finally {
            setSaving(false)
        }
    }, [monthlyData, users, currentDate, fetchMonthlyPlans, fetchTargets, showNotification])

    const handleDownloadTemplate = useCallback(() => {
        if (users.length === 0) {
            showNotification('warning', 'No nodes loaded. Please wait for data to load.')
            return
        }
        generateMonthlyTemplate(currentDate, users)
        showNotification('success', 'Excel template downloaded!')
    }, [currentDate, users, showNotification])

    const handleExcelConfirm = useCallback((parsedData) => {
        
        const importedData = transformToMonthlyDataFormat(parsedData, users)

        setMonthlyData(prev => {
            const merged = { ...prev }
            for (const [dateStr, nodeValues] of Object.entries(importedData)) {
                if (!merged[dateStr]) {
                    merged[dateStr] = {}
                }
                for (const [nodeId, capacity] of Object.entries(nodeValues)) {
                    merged[dateStr][nodeId] = capacity
                }
            }
            return merged
        })

        const dayCount = Object.keys(importedData).length
        showNotification('success', `Imported ${dayCount} days of data. Click COMMIT PLAN to save to database.`)
    }, [users, showNotification])

    const handleMatrixInputChange = (producerId, consumerId, value) => {
        setTravelMatrix(prev => ({
            ...prev,
            [`${producerId}_${consumerId}`]: value === '' ? 0 : parseInt(value, 10)
        }))
    }

    const handleSaveMatrix = useCallback(async () => {
        setSavingMatrix(true)
        try {
            const configs = Object.entries(travelMatrix).map(([key, time]) => {
                const [source, destination] = key.split('_')
                return { source, destination, time: parseInt(time, 10) || 0 }
            })
            await api.post('/api/config/trip-times/bulk', { configs })
            showNotification('success', 'Travel time matrix saved successfully!')
        } catch (err) {
            console.error('Failed to save travel time matrix:', err)
            showNotification('error', 'Failed to save travel time matrix')
        } finally {
            setSavingMatrix(false)
        }
    }, [travelMatrix, showNotification])

    const handleConsumerConfigChange = (userId, field, value) => {
        setConsumerEdits(prev => ({
            ...prev,
            [userId]: {
                ...prev[userId],
                [field]: value === '' ? 0 : parseInt(value, 10)
            }
        }));
    };

    const handleProducerConfigChange = (userId, field, value) => {
        setProducerEdits(prev => ({
            ...prev,
            [userId]: {
                ...prev[userId],
                [field]: value === '' ? 0 : parseInt(value, 10)
            }
        }));
    };

    const handleSaveConsumerConfig = useCallback(async () => {
        setSavingConsumer(true);
        try {
            const configs = Object.entries(consumerEdits).map(([userId, config]) => ({
                consumer_user_id: userId,
                avg_unload_time: config.avg_unload_time || 0,
                estimated_wait_time: config.estimated_wait_time || 0
            }));
            await api.post('/api/config/consumer-times/bulk', configs);
            showNotification('success', 'Consumer configurations saved successfully!');
        } catch (err) {
            console.error('Failed to save consumer config:', err);
            showNotification('error', 'Failed to save consumer configurations');
        } finally {
            setSavingConsumer(false);
        }
    }, [consumerEdits, showNotification]);

    const handleSaveProducerConfig = useCallback(async () => {
        setSavingProducer(true);
        try {
            const configs = Object.entries(producerEdits).map(([userId, config]) => ({
                producer_user_id: userId,
                avg_fill_time: config.avg_fill_time || 0,
                estimated_wait_time: config.estimated_wait_time || 0
            }));
            await api.post('/api/config/producer-times/bulk', configs);
            showNotification('success', 'Producer configurations saved successfully!');
        } catch (err) {
            console.error('Failed to save producer config:', err);
            showNotification('error', 'Failed to save producer configurations');
        } finally {
            setSavingProducer(false);
        }
    }, [producerEdits, showNotification]);

    const getCurrentSaveHandler = useCallback(() => {
        switch (ttmSubTab) {
            case 'travel-time':
                return handleSaveMatrix;
            case 'consumer':
                return handleSaveConsumerConfig;
            case 'producer':
                return handleSaveProducerConfig;
            case 'hm-matrix':
                return null; 
            default:
                return handleSaveMatrix;
        }
    }, [ttmSubTab, handleSaveMatrix, handleSaveConsumerConfig, handleSaveProducerConfig]);

    const isCurrentlySaving = () => {
        switch (ttmSubTab) {
            case 'travel-time':
                return savingMatrix;
            case 'consumer':
                return savingConsumer;
            case 'producer':
                return savingProducer;
            case 'hm-matrix':
                return false;
            default:
                return savingMatrix;
        }
    };

    useEffect(() => {
        setHeaderContent({
            center: (
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div className="switcher-tabs">
                        <button className={`tab-btn ${viewMode === 'strategic' ? 'active' : ''}`} onClick={() => setViewMode('strategic')}>
                            <CalendarIcon size={16} />
                            STRATEGIC
                        </button>
                        <button className={`tab-btn ${viewMode === 'executive' ? 'active' : ''}`} onClick={() => setViewMode('executive')}>
                            <Zap size={16} />
                            EXECUTIVE
                        </button>
                        <button className={`tab-btn ${viewMode === 'history' ? 'active' : ''}`} onClick={() => setViewMode('history')}>
                            <History size={16} />
                            HISTORY
                        </button>
                    </div>
                    <div className="switcher-tabs">
                        <button className={`tab-btn ${viewMode === 'maintenance' ? 'active' : ''}`} onClick={() => setViewMode('maintenance')}>
                            <Wrench size={16} />
                            MAINTENANCE
                        </button>
                        <button className={`tab-btn ${viewMode === 'logistics' ? 'active' : ''}`} onClick={() => setViewMode('logistics')}>
                            <ArrowRightLeft size={16} />
                            TTM
                        </button>
                    </div>
                </div>
            ),
            right: viewMode === 'strategic' ? (
                <button className="premium-btn primary shadow-glow" onClick={commitMonthToDB} disabled={saving} style={{ height: '36px', padding: '0 20px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800 }}>
                    {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    COMMIT PLAN
                </button>
            ) : viewMode === 'maintenance' ? (
                <button
                    className="premium-btn primary"
                    onClick={() => {
                        setEditingMaintenance(null);
                        setMaintenanceFormData({ node_id: '', start_date: '', end_date: '', reason: '' });
                        setShowMaintenanceModal(true);
                    }}
                    style={{ height: '36px', padding: '0 20px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800 }}
                >
                    <Plus size={18} />
                    SCHEDULE
                </button>
            ) : viewMode === 'logistics' ? (
                (ttmSubTab !== 'hm-matrix' && ttmSubTab !== 'system-settings') ? (
                    <button className="premium-btn dark-action shadow-glow" onClick={getCurrentSaveHandler()} disabled={isCurrentlySaving()} style={{ height: '38px', padding: '0 24px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 900, background: '#0f172a', color: 'white', border: '1px solid #1e293b' }}>
                        {isCurrentlySaving() ? <Loader2 className="animate-spin" size={18} /> : <Database size={18} />}
                        COMMIT CHANGES
                    </button>
                ) : null
            ) : null,
            forceLeftTitle: true
        })

        return () => setHeaderContent({ center: null, right: null, forceLeftTitle: false })
    }, [viewMode, saving, savingMatrix, savingConsumer, savingProducer, ttmSubTab, setHeaderContent, commitMonthToDB, getCurrentSaveHandler])

    const fetchMaintenanceData = async () => {
        try {
            const data = await api.get('/api/maintenance')
            setSchedules(data)
        } catch (err) {
            console.error("Failed to fetch maintenance schedules:", err)
        }
    }

    useEffect(() => {
        if (viewMode === 'maintenance') {
            fetchMaintenanceData()
        }
    }, [viewMode])

    const handleMaintenanceSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingMaintenance) {
                await api.put(`/api/maintenance/${editingMaintenance.id}`, maintenanceFormData);
                showNotification('success', 'Maintenance schedule updated');
            } else {
                await api.post('/api/maintenance', maintenanceFormData);
                showNotification('success', 'Maintenance schedule created');
            }
            setShowMaintenanceModal(false);
            setEditingMaintenance(null);
            setMaintenanceFormData({ node_id: '', start_date: '', end_date: '', reason: '' });
            fetchMaintenanceData();
            fetchMonthlyPlans(currentDate);
        } catch (err) {
            showNotification('error', err.response?.data?.detail || 'Failed to save schedule');
        }
    };

    const handleMaintenanceEdit = (schedule) => {
        setEditingMaintenance(schedule);
        setMaintenanceFormData({
            node_id: schedule.node_id,
            start_date: schedule.start_date,
            end_date: schedule.end_date,
            reason: schedule.reason
        });
        setShowMaintenanceModal(true);
    };

    const handleMaintenanceDelete = async (id) => {
        if (!confirm('Are you sure you want to delete this maintenance schedule?')) return;
        try {
            await api.delete(`/api/maintenance/${id}`);
            showNotification('success', 'Maintenance schedule deleted');
            fetchMaintenanceData();
            fetchMonthlyPlans(currentDate);
        } catch (err) {
            showNotification('error', 'Failed to delete schedule');
        }
    };

    const getMaintenanceStatusBadge = (schedule) => {
        const today = new Date().toISOString().split('T')[0];
        const start = schedule.start_date;
        const end = schedule.end_date;

        if (today >= start && today <= end) {
            return (
                <span className="premium-badge-v2 ongoing">
                    <Zap size={10} className="pulse-icon" />
                    ONGOING
                </span>
            );
        } else if (today < start) {
            return (
                <span className="premium-badge-v2 scheduled">
                    <Clock size={10} />
                    SCHEDULED
                </span>
            );
        } else {
            return (
                <span className="premium-badge-v2 completed">
                    <CheckCircle2 size={10} />
                    COMPLETED
                </span>
            );
        }
    };

    const exportMaintenanceData = () => {
        if (schedules.length === 0) {
            showNotification('warning', 'No maintenance data to export');
            return;
        }

        const getStatusText = (schedule) => {
            const today = new Date().toISOString().split('T')[0];
            const start = schedule.start_date;
            const end = schedule.end_date;
            if (today >= start && today <= end) return 'ONGOING';
            if (today < start) return 'SCHEDULED';
            return 'COMPLETED';
        };

        const headers = ['Node ID', 'Node Type', 'Start Date', 'End Date', 'Duration (Days)', 'Reason', 'Status'];
        const rows = schedules.map(schedule => {
            const node = users.find(u => u.user_id === schedule.node_id);
            const nodeType = node?.type === 'producer' ? 'PRODUCER' : 'CONSUMER';
            const start = new Date(schedule.start_date);
            const end = new Date(schedule.end_date);
            const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
            const startFormatted = start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const endFormatted = end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const status = getStatusText(schedule);

            return [schedule.node_id, nodeType, startFormatted, endFormatted, duration, `"${schedule.reason}"`, status];
        });

        const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `maintenance_schedules_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showNotification('success', `Exported ${schedules.length} maintenance record${schedules.length > 1 ? 's' : ''}`);
    };

    const openEmailModal = useCallback(() => {
        setEmailAddress(user?.email || '')
        setShowEmailModal(true)
    }, [user])

    const emailMaintenanceSchedule = async () => {
        const targetEmail = emailAddress.trim()
        if (!targetEmail || !targetEmail.includes('@')) {
            showNotification('error', 'Please enter a valid email address')
            return
        }

        setSendingEmail(true);
        try {
            const response = await api.post('/api/maintenance/email', {
                email: targetEmail
            });

            if (response.status === 'success') {
                showNotification('success', `Maintenance schedule sent to ${targetEmail}`);
                setShowEmailModal(false)
                setEmailAddress('')
            } else {
                throw new Error(response.message || 'Failed to send email');
            }
        } catch (err) {
            console.error('Email Error:', err);
            showNotification('error', err.response?.data?.detail || 'Failed to send email');
        } finally {
            setSendingEmail(false);
        }
    };

    const handleGeneratePlan = async () => {
        setGenerating(true)
        setGeneratedPlan(null)
        try {
            const result = await api.post('/api/daily-plans/generate')
            if (result.status === 'success') {
                setGeneratedPlan(result)
                showNotification('success', "Distribution plan generated successfully!")
            }
        } catch (err) {
            showNotification('error', `Generation failed: ${err.message}`)
        } finally {
            setGenerating(false)
        }
    }

    const handleCommitPlan = async () => {
        if (!generatedPlan) return
        setCommitting(true)
        try {
            await api.post('/api/daily-plans/commit', { assignments: generatedPlan.assignments })
            showNotification('success', "Logistics plan committed and saved successfully.")
            setGeneratedPlan(null)
            fetchTargets()
        } catch (err) {
            showNotification('error', `Commit failed: ${err.message}`)
        } finally {
            setCommitting(false)
        }
    }

    const handleResetPlan = async () => {
        setResetting(true)
        try {
            const result = await api.post('/api/daily-plans/reset-today')
            showNotification('success', result.message || "Logistics plan reset successfully.")
            setShowResetModal(false)
            setResetConfirmation('')
            fetchTargets()
        } catch (err) {
            showNotification('error', `Reset failed: ${err.message}`)
        } finally {
            setResetting(false)
        }
    }

    const handleConfirmDailyRoutine = async () => {
        setLoading(true)
        try {
            
            const today = new Date().toLocaleDateString('en-CA')
            await api.post('/api/daily-plans/confirm-day', { date: today })
            showNotification('success', "Daily plan confirmed for today's routine.")
            setIsConfirmed(true)
            fetchTargets()
        } catch (err) {
            showNotification('error', `Confirmation failed: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    const handleEmergencyRePlan = async () => {
        if (!brokenNode) return
        setRePlanning(true)
        try {
            const res = await api.post('/api/daily-plans/re-plan', { node_id: brokenNode })
            showNotification('success', res.message)
            setShowBreakdownModal(false)
            fetchTargets()
        } catch (err) {
            showNotification('error', `Re-plan failed: ${err.message}`)
        } finally {
            setRePlanning(false)
        }
    }

    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()
    const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay()

    const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth())
    const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth())

    const prevMonth = () => {
        const next = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
        setCurrentDate(next)
        fetchMonthlyPlans(next)
    }
    const nextMonth = () => {
        const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
        setCurrentDate(next)
        fetchMonthlyPlans(next)
    }

    const handleDateClick = (day) => {
        const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        setSelectedDate(dateStr)

        const initialForm = {}
        users.forEach(u => {
            initialForm[u.user_id] = monthlyData[dateStr]?.[u.user_id] || ''
        })
        setDayForm(initialForm)
        setShowDayModal(true)
    }

    const saveDayPlan = () => {
        
        setMonthlyData(prev => ({
            ...prev,
            [selectedDate]: { ...dayForm }
        }))
        setShowDayModal(false)
        showNotification('success', `Targets saved for ${selectedDate} (Local Cache - Click COMMIT to save to database)`)
    }

    const isNodeUnderMaintenance = (nodeId, dateStr) => {
        return maintenanceSchedules.some(schedule => {
            return schedule.node_id === nodeId &&
                dateStr >= schedule.start_date &&
                dateStr <= schedule.end_date
        })
    }

    const renderExecutiveView = () => {
        const assignments = dailySummary.assignments || []

        const filteredNodes = (dailySummary.individual?.filter(node => {
            const matchesSearch = node.user_id.toLowerCase().includes(nodeSearch.toLowerCase())
            const matchesRole = nodeFilterRole === 'all' || node.role === nodeFilterRole
            const matchesStatus = nodeFilterStatus === 'all' || (node.status || 'Operating').toLowerCase() === nodeFilterStatus.toLowerCase()
            return matchesSearch && matchesRole && matchesStatus
        }) || []).sort((a, b) => {
            if (!nodeSortConfig.key) return 0
            let aVal = a[nodeSortConfig.key]
            let bVal = b[nodeSortConfig.key]

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return nodeSortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
            }

            aVal = (aVal || '').toString().toLowerCase()
            bVal = (bVal || '').toString().toLowerCase()
            if (aVal < bVal) return nodeSortConfig.direction === 'asc' ? -1 : 1
            if (aVal > bVal) return nodeSortConfig.direction === 'asc' ? 1 : -1
            return 0
        })

        const handleSort = (key) => {
            setNodeSortConfig(prev => ({
                key,
                direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
            }))
        }

        const viewSwitcher = (
            <div className="switcher-tabs" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', background: '#f1f5f9', padding: '3px', borderRadius: '10px' }}>
                <button className={`tab-btn ${executiveSubView === 'monitoring' ? 'active' : ''}`} onClick={() => setExecutiveSubView('monitoring')} style={{ fontSize: '0.65rem', padding: '6px 12px', boxShadow: executiveSubView === 'monitoring' ? '0 2px 8px -2px rgba(0,0,0,0.1)' : 'none' }}>
                    MONITORING
                </button>
                <button className={`tab-btn ${executiveSubView === 'distribution' ? 'active' : ''}`} onClick={() => setExecutiveSubView('distribution')} style={{ fontSize: '0.65rem', padding: '6px 12px', boxShadow: executiveSubView === 'distribution' ? '0 2px 8px -2px rgba(0,0,0,0.1)' : 'none' }}>
                    DISTRIBUTION
                </button>
            </div>
        );

        return (
            <div className="executive-view-container animate-in fade-in duration-500" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div className="executive-view-grid">
                    <div className="performance-matrix-section">
                        {executiveSubView === 'monitoring' && (
                            <div className="premium-card glass-morphism">
                                <div className="premium-card-header" style={{ padding: '12px 24px', position: 'relative' }}>
                                    <div className="title-with-icon">
                                        <Users size={20} className="icon-accent" />
                                        <h3 style={{ fontSize: '0.9rem' }}>Node Monitoring</h3>
                                    </div>

                                    {viewSwitcher}

                                    <div className={`status-tag ${isConfirmed ? 'confirmed' : 'pending'}`}>
                                        {isConfirmed ? 'CONFIRMED' : '7 AM FALLBACK'}
                                    </div>
                                </div>
                                <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <div style={{ display: 'flex', gap: '12px' }}>
                                        <div className="input-with-unit" style={{ flex: 1, background: 'white', border: '1px solid #cbd5e1' }}>
                                            <Search size={14} style={{ marginLeft: '12px', color: '#64748b' }} />
                                            <input className="premium-input" placeholder="Search by Node ID (e.g. BF-1, Corex)..." value={nodeSearch} onChange={(e) => setNodeSearch(e.target.value)} style={{ width: '100%', textAlign: 'left', fontWeight: '500' }} />
                                        </div>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <Filter size={14} style={{ position: 'absolute', left: '12px', color: '#64748b', pointerEvents: 'none' }} />
                                            <select className="premium-input" style={{ background: 'white', borderRadius: '10px', border: '1px solid #cbd5e1', minWidth: '160px', paddingLeft: '34px', textAlign: 'left', fontWeight: '600', fontSize: '0.8rem' }} value={nodeFilterRole} onChange={(e) => setNodeFilterRole(e.target.value)}>
                                                <option value="all">All Node Roles</option>
                                                <option value="producer">Producers Only</option>
                                                <option value="consumer">Consumers Only</option>
                                            </select>
                                        </div>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <Clock size={14} style={{ position: 'absolute', left: '12px', color: '#64748b', pointerEvents: 'none' }} />
                                            <select className="premium-input" style={{ background: 'white', borderRadius: '10px', border: '1px solid #cbd5e1', minWidth: '160px', paddingLeft: '34px', textAlign: 'left', fontWeight: '600', fontSize: '0.8rem' }} value={nodeFilterStatus} onChange={(e) => setNodeFilterStatus(e.target.value)}>
                                                <option value="all">All Statuses</option>
                                                <option value="operating">Operating</option>
                                                <option value="pending">Pending</option>
                                                <option value="breakdown">Breakdown</option>
                                                <option value="offline">Offline</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em' }}>
                                            SHOWING <span style={{ color: '#0f172a' }}>{filteredNodes.length}</span> OF <span style={{ color: '#0f172a' }}>{dailySummary.individual?.length || 0}</span> NODES
                                        </div>
                                    </div>
                                </div>
                                <div className="premium-card-body no-padding" style={{ flex: 1, minHeight: 0 }}>
                                    <div className="table-scroll-wrapper" style={{ height: '100%', overflowY: 'auto' }}>
                                        <table className="premium-table">
                                            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white' }}>
                                                <tr>
                                                    <th onClick={() => handleSort('user_id')} style={{ cursor: 'pointer' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            Node ID {nodeSortConfig.key === 'user_id' && (nodeSortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                                        </div>
                                                    </th>
                                                    <th onClick={() => handleSort('role')} style={{ cursor: 'pointer' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            Role {nodeSortConfig.key === 'role' && (nodeSortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                                        </div>
                                                    </th>
                                                    <th className="text-right" onClick={() => handleSort('capacity')} style={{ cursor: 'pointer' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                                                            Planned (MT) {nodeSortConfig.key === 'capacity' && (nodeSortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                                        </div>
                                                    </th>
                                                    <th className="text-right" onClick={() => handleSort('actual')} style={{ cursor: 'pointer' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                                                            Actual (MT) {nodeSortConfig.key === 'actual' && (nodeSortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                                        </div>
                                                    </th>
                                                    <th className="text-center">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                                            Status
                                                        </div>
                                                    </th>
                                                    <th className="text-center">Progress</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredNodes.map(node => {
                                                    const progress = Math.min(node.capacity > 0 ? (node.actual / node.capacity) * 100 : 0, 100);
                                                    const progressClass = progress <= 0 ? 'zero' : progress < 40 ? 'low' : progress < 85 ? 'medium' : 'high';

                                                    return (
                                                        <tr key={node.user_id}>
                                                            <td className="font-heavy text-primary" style={{ letterSpacing: '-0.01em' }}>{node.user_id}</td>
                                                            <td>
                                                                <span className={`role-badge ${node.role}`}>
                                                                    {node.role.toUpperCase()}
                                                                </span>
                                                            </td>
                                                            <td className="text-right font-medium tabular-nums">{node.capacity.toLocaleString()}</td>
                                                            <td className="text-right font-heavy text-accent tabular-nums">
                                                                {node.actual > 0 ? node.actual.toLocaleString() : '0'}
                                                            </td>
                                                            <td className="text-center">
                                                                <span className={`status-tag sm ${node.status?.toLowerCase() || 'operating'}`}>
                                                                    {node.status || 'OPERATING'}
                                                                </span>
                                                            </td>
                                                            <td className="text-center">
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-end' }}>
                                                                    <div className="mini-progress-track">
                                                                        <div className={`mini-progress-fill ${progressClass}`} style={{ width: `${progress}%` }}></div>
                                                                    </div>
                                                                    <span className="tabular-nums" style={{ fontSize: '0.75rem', fontWeight: '800', minWidth: '40px', textAlign: 'right', color: node.actual === 0 ? '#ef4444' : '#64748b' }}>
                                                                        {Math.round(progress)}%
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {executiveSubView === 'distribution' && generatedPlan && (
                            <div className="premium-card glass-morphism generated-plan-card animate-in slide-in-from-bottom-5">
                                <div className="premium-card-header" style={{ padding: '12px 24px', position: 'relative' }}>
                                    <div className="title-with-icon">
                                        <Zap size={20} className="icon-success" />
                                        <h3 style={{ fontSize: '0.9rem' }}>Distribution Plan</h3>
                                    </div>

                                    {viewSwitcher}

                                    <div className="header-actions" style={{ display: 'flex', gap: '8px' }}>
                                        <button className="premium-btn primary-success sm" onClick={handleCommitPlan} disabled={committing} style={{ padding: '6px 12px' }}>
                                            {committing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                            <span style={{ fontSize: '0.65rem' }}>COMMIT</span>
                                        </button>
                                        <button className="premium-btn ghost sm" onClick={() => setGeneratedPlan(null)} style={{ padding: '6px 12px', fontSize: '0.65rem' }}>DISCARD</button>
                                    </div>
                                </div>
                                <div className="premium-card-body no-padding">
                                    <div className="table-scroll-wrapper" style={{ height: '100%', overflowY: 'auto' }}>
                                        <table className="premium-table">
                                            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white' }}>
                                                <tr>
                                                    <th onClick={() => {
                                                        const direction = planSortConfig.key === 'producer_id' && planSortConfig.direction === 'asc' ? 'desc' : 'asc';
                                                        setPlanSortConfig({ key: 'producer_id', direction });
                                                    }} style={{ cursor: 'pointer' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            Source {planSortConfig.key === 'producer_id' && (planSortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                                        </div>
                                                    </th>
                                                    <th onClick={() => {
                                                        const direction = planSortConfig.key === 'consumer_id' && planSortConfig.direction === 'asc' ? 'desc' : 'asc';
                                                        setPlanSortConfig({ key: 'consumer_id', direction });
                                                    }} style={{ cursor: 'pointer' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            Destination {planSortConfig.key === 'consumer_id' && (planSortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                                        </div>
                                                    </th>
                                                    <th className="text-center" onClick={() => {
                                                        const direction = planSortConfig.key === 'trips' && planSortConfig.direction === 'asc' ? 'desc' : 'asc';
                                                        setPlanSortConfig({ key: 'trips', direction });
                                                    }} style={{ cursor: 'pointer' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                                            Trips {planSortConfig.key === 'trips' && (planSortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                                        </div>
                                                    </th>
                                                    <th className="text-right" onClick={() => {
                                                        const direction = planSortConfig.key === 'quantity' && planSortConfig.direction === 'asc' ? 'desc' : 'asc';
                                                        setPlanSortConfig({ key: 'quantity', direction });
                                                    }} style={{ cursor: 'pointer' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                                                            Tonnage {planSortConfig.key === 'quantity' && (planSortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[...generatedPlan.assignments].sort((a, b) => {
                                                    if (!planSortConfig.key) return 0;
                                                    let aVal = a[planSortConfig.key];
                                                    let bVal = b[planSortConfig.key];
                                                    if (typeof aVal === 'number' && typeof bVal === 'number') {
                                                        return planSortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
                                                    }
                                                    aVal = (aVal || '').toString().toLowerCase();
                                                    bVal = (bVal || '').toString().toLowerCase();
                                                    if (aVal < bVal) return planSortConfig.direction === 'asc' ? -1 : 1;
                                                    if (aVal > bVal) return planSortConfig.direction === 'asc' ? 1 : -1;
                                                    return 0;
                                                }).map((asgn, i) => (
                                                    <tr key={i}>
                                                        <td className="font-heavy text-primary">{asgn.producer_id}</td>
                                                        <td className="font-heavy text-primary">{asgn.consumer_id}</td>
                                                        <td className="text-center font-heavy tabular-nums">{asgn.trips}</td>
                                                        <td className="text-right font-medium tabular-nums">{asgn.quantity.toLocaleString()} MT</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {executiveSubView === 'distribution' && !generatedPlan && assignments.length > 0 && (
                            <div className="premium-card glass-morphism generated-plan-card animate-in slide-in-from-bottom-5">
                                <div className="premium-card-header" style={{ padding: '12px 24px', position: 'relative' }}>
                                    <div className="title-with-icon">
                                        <CheckCircle2 size={20} className="icon-success" />
                                        <h3 style={{ fontSize: '0.9rem' }}>Active Distribution Plan (Committed)</h3>
                                    </div>

                                    {viewSwitcher}

                                    <div className="header-actions" style={{ display: 'flex', gap: '8px' }}>
                                        <div className="premium-badge-v2 ongoing">
                                            <Zap size={10} className="pulse-icon" />
                                            LIVE
                                        </div>
                                    </div>
                                </div>
                                <div className="premium-card-body no-padding">
                                    <div className="table-scroll-wrapper" style={{ height: '100%', overflowY: 'auto' }}>
                                        <table className="premium-table">
                                            <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'white' }}>
                                                <tr>
                                                    <th onClick={() => {
                                                        const direction = planSortConfig.key === 'producer_id' && planSortConfig.direction === 'asc' ? 'desc' : 'asc';
                                                        setPlanSortConfig({ key: 'producer_id', direction });
                                                    }} style={{ cursor: 'pointer' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            Source {planSortConfig.key === 'producer_id' && (planSortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                                        </div>
                                                    </th>
                                                    <th onClick={() => {
                                                        const direction = planSortConfig.key === 'consumer_id' && planSortConfig.direction === 'asc' ? 'desc' : 'asc';
                                                        setPlanSortConfig({ key: 'consumer_id', direction });
                                                    }} style={{ cursor: 'pointer' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            Destination {planSortConfig.key === 'consumer_id' && (planSortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                                        </div>
                                                    </th>
                                                    <th className="text-center" onClick={() => {
                                                        const direction = planSortConfig.key === 'trips' && planSortConfig.direction === 'asc' ? 'desc' : 'asc';
                                                        setPlanSortConfig({ key: 'trips', direction });
                                                    }} style={{ cursor: 'pointer' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                                            Planned Trips {planSortConfig.key === 'trips' && (planSortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                                        </div>
                                                    </th>
                                                    <th className="text-center">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                                            Actual Trips
                                                        </div>
                                                    </th>
                                                    <th className="text-right" onClick={() => {
                                                        const direction = planSortConfig.key === 'quantity' && planSortConfig.direction === 'asc' ? 'desc' : 'asc';
                                                        setPlanSortConfig({ key: 'quantity', direction });
                                                    }} style={{ cursor: 'pointer' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                                                            Tonnage {planSortConfig.key === 'quantity' && (planSortConfig.direction === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[...assignments].sort((a, b) => {
                                                    if (!planSortConfig.key) return 0;
                                                    let aVal = a[planSortConfig.key];
                                                    let bVal = b[planSortConfig.key];
                                                    if (typeof aVal === 'number' && typeof bVal === 'number') {
                                                        return planSortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
                                                    }
                                                    aVal = (aVal || '').toString().toLowerCase();
                                                    bVal = (bVal || '').toString().toLowerCase();
                                                    if (aVal < bVal) return planSortConfig.direction === 'asc' ? -1 : 1;
                                                    if (aVal > bVal) return planSortConfig.direction === 'asc' ? 1 : -1;
                                                    return 0;
                                                }).map((asgn, i) => (
                                                    <tr key={i}>
                                                        <td className="font-heavy text-primary">{asgn.producer_id}</td>
                                                        <td className="font-heavy text-primary">{asgn.consumer_id}</td>
                                                        <td className="text-center font-heavy tabular-nums">{asgn.trips}</td>
                                                        <td className="text-center font-heavy text-accent tabular-nums">{asgn.actual_trips !== undefined ? asgn.actual_trips : '-'}</td>
                                                        <td className="text-right font-medium tabular-nums">{asgn.quantity.toLocaleString()} MT</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {executiveSubView === 'distribution' && !generatedPlan && assignments.length === 0 && (
                            <div className="premium-card glass-morphism">
                                <div className="premium-card-header" style={{ padding: '12px 24px', position: 'relative' }}>
                                    <div className="title-with-icon">
                                        <Zap size={20} className="icon-accent" />
                                        <h3 style={{ fontSize: '0.9rem' }}>Distribution Plan</h3>
                                    </div>
                                    {viewSwitcher}
                                    <div style={{ width: '80px' }}></div> {}
                                </div>
                                <div className="premium-card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
                                    <div style={{ textAlign: 'center', color: 'hsl(var(--text-muted))' }}>
                                        <Zap size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                                        <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>No distribution plan generated yet</p>
                                        <p style={{ fontSize: '0.75rem', marginTop: '8px' }}>Run optimization to generate a plan</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="control-center-section">
                        <div className="premium-card glass-morphism command-panel">
                            <div className="premium-card-header">
                                <h3>Operations Control</h3>
                            </div>
                            <div className="premium-card-body">
                                <div className="control-group">
                                    {!isConfirmed && (
                                        <button className="premium-btn" onClick={handleConfirmDailyRoutine} style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', boxShadow: '0 4px 15px -3px rgba(16, 185, 129, 0.4)', border: 'none', height: '48px', transition: 'all 0.3s ease' }} onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
                                            <CheckCircle2 size={20} />
                                            CONFIRM 7AM ROUTINE
                                        </button>
                                    )}
                                    <div style={{ marginBottom: '8px' }}>
                                        <button className="premium-btn action-optimize" onClick={handleGeneratePlan} disabled={generating || !isConfirmed} style={{ width: '100%', height: '52px', fontSize: '0.85rem', letterSpacing: '0.02em' }}>
                                            {generating ? <Loader2 size={22} className="animate-spin" /> : <Zap size={22} />}
                                            RUN OPTIMIZATION
                                        </button>
                                        <p style={{ fontSize: '0.65rem', color: '#94a3b8', textAlign: 'center', marginTop: '10px', fontWeight: '600' }}>
                                            Calculates optimal distribution based on current status
                                        </p>
                                    </div>

                                    {assignments.length > 0 && (
                                        <div className="emergency-actions" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #1e293b' }}>
                                            <div style={{ fontSize: '0.65rem', fontWeight: '900', color: '#ef4444', marginBottom: '12px', letterSpacing: '0.1em', textAlign: 'center' }}>EMERGENCY INTERVENTIONS</div>
                                            <button className="premium-btn action-breakdown" onClick={() => setShowBreakdownModal(true)} style={{ width: '100%', marginBottom: '8px' }}>
                                                <AlertCircle size={18} />
                                                BREAKDOWN INTERVENTION
                                            </button>
                                            <div style={{ marginTop: '12px' }}>
                                                <button className="premium-btn action-reset" onClick={() => setShowResetModal(true)} style={{ width: '100%', opacity: 0.8 }}>
                                                    <RefreshCw size={16} />
                                                    EMERGENCY RESET
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        )
    }

    const renderCalendar = () => {
        const days = []
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>)
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            const dayData = monthlyData[dateStr]
            const hasMaintenance = maintenanceSchedules.some(s =>
                dateStr >= s.start_date && dateStr <= s.end_date
            )
            const maintenanceNodesOnDay = maintenanceSchedules
                .filter(s => dateStr >= s.start_date && dateStr <= s.end_date)
                .map(s => s.node_id)

            const hasData = dayData && Object.values(dayData).some(v => v !== '')
            const isCommitted = dayData && dayData._committed === true
            const isToday = new Date().toDateString() === new Date(currentDate.getFullYear(), currentDate.getMonth(), d).toDateString()

            days.push(
                <div key={d} className={`calendar-day ${hasData ? 'has-data' : ''} ${isToday ? 'is-today' : ''} ${isCommitted ? 'is-committed' : ''} ${hasMaintenance ? 'has-maintenance' : ''}`} onClick={() => handleDateClick(d)}>
                    <div className="day-header">
                        <span className="day-number">{d}</span>
                        {isCommitted && <CheckCircle2 size={12} className="committed-icon" />}
                        {hasMaintenance && <Wrench size={10} className="maintenance-icon-calendar" title={`Maintenance: ${maintenanceNodesOnDay.join(', ')}`} />}
                    </div>
                    {hasData && (
                        <div className="day-data-preview">
                            <div className="preview-item">
                                <div className="preview-dot"></div>
                                <span>{Object.keys(dayData).filter(k => k !== '_committed').length} Targets</span>
                            </div>
                        </div>
                    )}
                </div>
            )
        }
        return days
    }

    return (
        <div className="strategic-command-center animate-in fade-in duration-700">

            <main className="command-content">
                {viewMode === 'strategic' && (
                    <div className="strategic-panel animate-in slide-in-from-top-4">
                        <div className="panel-header-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                            <div className="panel-title">
                                <h2>Monthly Target Allocation</h2>
                                <p>Defining primary throughput for nodes</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <button className="premium-btn ghost" onClick={handleDownloadTemplate} style={{ height: '38px', padding: '0 16px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700 }} title="Download Excel template for this month">
                                    <Download size={16} />
                                    TEMPLATE
                                </button>
                                <button className="premium-btn secondary" onClick={() => setShowExcelModal(true)} style={{ height: '38px', padding: '0 16px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 700 }} title="Upload Excel file with monthly data">
                                    <Upload size={16} />
                                    UPLOAD
                                </button>
                            </div>
                        </div>

                        <div className="calendar-panel-container glass-morphism">
                            <div className="calendar-controls">
                                <button className="nav-icon-btn" onClick={prevMonth}><ChevronLeft size={24} /></button>
                                <h3 className="month-display">
                                    {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase()}
                                </h3>
                                <button className="nav-icon-btn" onClick={nextMonth}><ChevronRight size={24} /></button>
                            </div>

                            <div className="calendar-grid-premium">
                                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                                    <div key={day} className="weekday-header">{day}</div>
                                ))}
                                {renderCalendar()}
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'executive' && renderExecutiveView()}

                {viewMode === 'history' && (
                    <PlanHistory />
                )}
                {viewMode === 'maintenance' && (
                    <div className="maintenance-panel animate-in slide-in-from-bottom-4">
                        <div className="premium-card glass-morphism shadow-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.4)' }}>
                            <div className="premium-card-header" style={{ background: 'white', padding: '24px 32px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Wrench size={20} className="text-primary" />
                                        <h3 style={{ margin: 0, letterSpacing: '-0.02em', fontWeight: 900 }}>Node Downtime Management</h3>
                                    </div>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', fontWeight: 800, color: 'hsl(var(--text-muted))', letterSpacing: '0.1em' }}>
                                        SYSTEM INTEGRITY & PLANNED INTERRUPTIONS
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button
                                        className="premium-btn secondary"
                                        onClick={exportMaintenanceData}
                                        disabled={schedules.length === 0}
                                        style={{
                                            height: '40px',
                                            padding: '0 20px',
                                            borderRadius: '14px',
                                            fontSize: '0.75rem',
                                            fontWeight: 900,
                                            background: schedules.length === 0 ? 'hsl(var(--muted))' : 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                                            color: 'white',
                                            border: 'none',
                                            cursor: schedules.length === 0 ? 'not-allowed' : 'pointer',
                                            opacity: schedules.length === 0 ? 0.5 : 1,
                                            boxShadow: schedules.length === 0 ? 'none' : '0 8px 16px -4px rgba(5, 150, 105, 0.35)'
                                        }}
                                    >
                                        <Download size={16} />
                                        EXPORT
                                    </button>
                                    <button
                                        className="premium-btn secondary"
                                        onClick={openEmailModal}
                                        disabled={sendingEmail}
                                        style={{
                                            height: '40px',
                                            padding: '0 20px',
                                            borderRadius: '14px',
                                            fontSize: '0.75rem',
                                            fontWeight: 900,
                                            background: sendingEmail ? 'hsl(var(--muted))' : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                                            color: 'white',
                                            border: 'none',
                                            cursor: sendingEmail ? 'wait' : 'pointer',
                                            opacity: sendingEmail ? 0.7 : 1,
                                            boxShadow: sendingEmail ? 'none' : '0 8px 16px -4px rgba(59, 130, 246, 0.35)'
                                        }}
                                    >
                                        {sendingEmail ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                                        {sendingEmail ? 'SENDING...' : 'EMAIL'}
                                    </button>
                                    <button
                                        className="premium-btn primary"
                                        onClick={() => {
                                            setEditingMaintenance(null);
                                            setMaintenanceFormData({ node_id: '', start_date: '', end_date: '', reason: '' });
                                            setShowMaintenanceModal(true);
                                        }}
                                        style={{ height: '40px', padding: '0 24px', borderRadius: '14px', fontSize: '0.75rem', fontWeight: 900, boxShadow: '0 8px 16px -4px hsl(224 71% 4% / 0.2)' }}
                                    >
                                        <Plus size={18} />
                                        SCHEDULE DOWNTIME
                                    </button>
                                </div>
                            </div>
                            <div className="premium-card-body no-padding">
                                <table className="premium-table-v2">
                                    <thead>
                                        <tr>
                                            <th>NODE IDENTITY</th>
                                            <th>STARTING</th>
                                            <th>ENDING</th>
                                            <th className="text-center">DURATION</th>
                                            <th>CLASSIFICATION/REASON</th>
                                            <th>CURRENT STATUS</th>
                                            <th className="text-center">DAYS LEFT</th>
                                            <th className="text-center">MANAGEMENT</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {schedules.length > 0 ? schedules.map(schedule => {
                                            const start = new Date(schedule.start_date);
                                            const end = new Date(schedule.end_date);
                                            const today = new Date();
                                            today.setHours(0, 0, 0, 0);
                                            start.setHours(0, 0, 0, 0);
                                            end.setHours(0, 0, 0, 0);
                                            const duration = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                                            const node = users.find(u => u.user_id === schedule.node_id);
                                            const isProducer = node?.type === 'producer';

                                            let daysLeftText = '—';
                                            let daysLeftStyle = {};
                                            const todayStr = today.toISOString().split('T')[0];
                                            const startStr = schedule.start_date;
                                            const endStr = schedule.end_date;

                                            if (todayStr < startStr) {
                                                
                                                const daysUntilStart = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
                                                daysLeftText = `${daysUntilStart}d to start`;
                                                daysLeftStyle = {
                                                    background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                                                    color: '#1e40af',
                                                    padding: '6px 12px',
                                                    borderRadius: '8px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 800,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                };
                                            } else if (todayStr >= startStr && todayStr <= endStr) {
                                                
                                                const daysRemaining = Math.ceil((end - today) / (1000 * 60 * 60 * 24)) + 1;
                                                daysLeftText = `${daysRemaining}d left`;
                                                daysLeftStyle = {
                                                    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                                                    color: '#92400e',
                                                    padding: '6px 12px',
                                                    borderRadius: '8px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 800,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                };
                                            }
                                            
                                            return (
                                                <tr key={schedule.id}>
                                                    <td>
                                                        <div className="maintenance-node-identity">
                                                            <div className={`node-icon-box ${isProducer ? 'producer' : 'consumer'}`}>
                                                                {isProducer ? <Factory size={14} /> : <MapPin size={14} />}
                                                            </div>
                                                            <div className="node-info">
                                                                <span className="node-id">{schedule.node_id}</span>
                                                                <span className="node-type">{isProducer ? 'PRODUCER' : 'CONSUMER'}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="tabular-nums font-medium">
                                                        {new Date(schedule.start_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </td>
                                                    <td className="tabular-nums font-medium">
                                                        {new Date(schedule.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </td>
                                                    <td className="text-center">
                                                        <div className="duration-pill">
                                                            <Clock size={12} style={{ opacity: 0.6 }} />
                                                            <span>{duration} DAYS</span>
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <span className="maintenance-reason">{schedule.reason}</span>
                                                    </td>
                                                    <td>{getMaintenanceStatusBadge(schedule)}</td>
                                                    <td className="text-center">
                                                        <span style={daysLeftStyle}>{daysLeftText}</span>
                                                    </td>
                                                    <td className="text-center">
                                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                            <button className="icon-btn-v2" onClick={() => handleMaintenanceEdit(schedule)}>
                                                                <Edit2 size={15} />
                                                            </button>
                                                            <button className="icon-btn-v2 danger" onClick={() => handleMaintenanceDelete(schedule.id)}>
                                                                <Trash2 size={15} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        }) : (
                                            <tr>
                                                <td colSpan="8">
                                                    <div className="empty-maintenance-state">
                                                        <div className="empty-icon-ring">
                                                            <Wrench size={32} />
                                                        </div>
                                                        <h4>No Maintenance Active</h4>
                                                        <p>System is running at full theoretical capacity with no scheduled interruptions.</p>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
                {viewMode === 'logistics' && (
                    <div className="logistics-panel animate-in slide-in-from-bottom-4" style={{ height: '100%', display: 'flex', flexDirection: 'row', gap: '16px' }}>
                        <div className="ttm-vertical-tabs">
                            <button className={`ttm-vtab ${ttmSubTab === 'travel-time' ? 'active' : ''}`} onClick={() => setTtmSubTab('travel-time')}>
                                <ArrowRightLeft size={18} />
                                <span>Travel Time</span>
                            </button>
                            <button className={`ttm-vtab ${ttmSubTab === 'consumer' ? 'active' : ''}`} onClick={() => setTtmSubTab('consumer')}>
                                <MapPin size={18} />
                                <span>Consumer</span>
                            </button>
                            <button className={`ttm-vtab ${ttmSubTab === 'producer' ? 'active' : ''}`} onClick={() => setTtmSubTab('producer')}>
                                <Factory size={18} />
                                <span>Producer</span>
                            </button>
                            <button className={`ttm-vtab ${ttmSubTab === 'hm-matrix' ? 'active' : ''}`} onClick={() => setTtmSubTab('hm-matrix')}>
                                <Database size={18} />
                                <span>HM Matrix</span>
                            </button>
                            <button className={`ttm-vtab ${ttmSubTab === 'system-settings' ? 'active' : ''}`} onClick={() => setTtmSubTab('system-settings')}>
                                <Settings size={18} />
                                <span>System</span>
                            </button>
                        </div>
                        <div className="premium-card glass-morphism shadow-xl overflow-hidden" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, border: '1px solid rgba(255,255,255,0.4)' }}>
                            {ttmSubTab === 'travel-time' && (
                                <>
                                    <div className="premium-card-header" style={{ padding: '24px 32px' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <ArrowRightLeft size={20} className="text-primary" />
                                                <h3 style={{ margin: 0, letterSpacing: '-0.02em', fontWeight: 900 }}>Travel Time Matrix</h3>
                                            </div>
                                            <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', fontWeight: 800, color: 'hsl(var(--text-muted))', letterSpacing: '0.1em' }}>
                                                UNIT-TO-UNIT PERFORMANCE METRICS
                                            </p>
                                        </div>
                                        <div className="ttm-legend-box">
                                            <div className="ttm-legend-item">
                                                <div className="ttm-legend-dot producer"></div>
                                                PRODUCER (ROW)
                                            </div>
                                            <div className="ttm-legend-item">
                                                <div className="ttm-legend-dot consumer"></div>
                                                CONSUMER (COL)
                                            </div>
                                        </div>
                                    </div>
                                    <div className="premium-card-body" style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
                                        <div className="ttm-matrix-wrapper">
                                            <table className="ttm-matrix-table">
                                                <thead>
                                                    <tr>
                                                        <th className="ttm-corner-cell">
                                                            <div className="ttm-corner-content">
                                                                <ArrowRightLeft size={18} className="text-primary" />
                                                                <span>MATRIX</span>
                                                            </div>
                                                        </th>
                                                        {travelConsumers.map((c, idx) => (
                                                            <th key={c.user_id} className={`ttm-consumer-header ${hoveredCol === idx ? 'active' : ''}`}>
                                                                <div className="ttm-header-content">
                                                                    <MapPin size={12} className="header-icon" />
                                                                    <div className="node-id">{c.user_id}</div>
                                                                    <div className="node-label">CONSUMER</div>
                                                                </div>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {travelProducers.map((p, rowIdx) => (
                                                        <tr key={p.user_id}>
                                                            <td className={`ttm-producer-header ${hoveredRow === rowIdx ? 'active' : ''}`}>
                                                                <div className="ttm-header-content">
                                                                    <Factory size={16} className="header-icon" />
                                                                    <span className="node-id">{p.user_id}</span>
                                                                </div>
                                                            </td>
                                                            {travelConsumers.map((c, colIdx) => (
                                                                <td key={`${p.user_id}_${c.user_id}`} onMouseEnter={() => { setHoveredRow(rowIdx); setHoveredCol(colIdx); }} onMouseLeave={() => { setHoveredRow(null); setHoveredCol(null); }} className={`ttm-data-cell ${(hoveredRow === rowIdx || hoveredCol === colIdx) ? 'highlight' : ''}`}>
                                                                    <div className={`ttm-input-pill ${hoveredRow === rowIdx && hoveredCol === colIdx ? 'focused' : ''}`}>
                                                                        <input type="number" value={travelMatrix[`${p.user_id}_${c.user_id}`] ?? 0} onChange={(e) => handleMatrixInputChange(p.user_id, c.user_id, e.target.value)} />
                                                                        <span className="ttm-unit">MIN</span>
                                                                    </div>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}
                            {ttmSubTab === 'consumer' && (
                                <>
                                    <div className="premium-card-header" style={{ padding: '24px 32px' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <MapPin size={20} className="text-primary" />
                                                <h3 style={{ margin: 0, letterSpacing: '-0.02em', fontWeight: 900 }}>Consumer Configuration</h3>
                                            </div>
                                            <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', fontWeight: 800, color: 'hsl(var(--text-muted))', letterSpacing: '0.1em' }}>
                                                UNLOAD & WAIT TIME SETTINGS
                                            </p>
                                        </div>
                                    </div>
                                    <div className="premium-card-body" style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
                                        <div className="ttm-matrix-wrapper">
                                            <table className="ttm-config-table">
                                                <thead>
                                                    <tr>
                                                        <th className="ttm-config-header-cell">
                                                            <div className="ttm-config-header-content">
                                                                <MapPin size={16} />
                                                                <span>CONSUMER ID</span>
                                                            </div>
                                                        </th>
                                                        <th className="ttm-config-header-cell">
                                                            <span>AVG UNLOAD TIME (MIN)</span>
                                                        </th>
                                                        <th className="ttm-config-header-cell">
                                                            <span>EST. WAIT TIME (MIN)</span>
                                                        </th>
                                                        <th className="ttm-config-header-cell calculated">
                                                            <span>TOTAL TIME/CYCLE (MIN)</span>
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {travelConsumers.map((c) => {
                                                        const config = consumerEdits[c.user_id] || {};
                                                        const total = (parseInt(config.avg_unload_time) || 0) + (parseInt(config.estimated_wait_time) || 0);
                                                        return (
                                                            <tr key={c.user_id}>
                                                                <td className="ttm-config-row-header">
                                                                    <div className="ttm-config-node">
                                                                        <MapPin size={16} />
                                                                        <span className="node-id">{c.user_id}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="ttm-config-data-cell">
                                                                    <div className="ttm-input-pill">
                                                                        <input type="number" value={config.avg_unload_time ?? 0} onChange={(e) => handleConsumerConfigChange(c.user_id, 'avg_unload_time', e.target.value)} />
                                                                        <span className="ttm-unit">MIN</span>
                                                                    </div>
                                                                </td>
                                                                <td className="ttm-config-data-cell">
                                                                    <div className="ttm-input-pill">
                                                                        <input type="number" value={config.estimated_wait_time ?? 0} onChange={(e) => handleConsumerConfigChange(c.user_id, 'estimated_wait_time', e.target.value)} />
                                                                        <span className="ttm-unit">MIN</span>
                                                                    </div>
                                                                </td>
                                                                <td className="ttm-config-data-cell calculated">
                                                                    <div className="ttm-calculated-pill">
                                                                        <span className="ttm-value">{total}</span>
                                                                        <span className="ttm-unit">MIN</span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}
                            {ttmSubTab === 'producer' && (
                                <>
                                    <div className="premium-card-header" style={{ padding: '24px 32px' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Factory size={20} className="text-primary" />
                                                <h3 style={{ margin: 0, letterSpacing: '-0.02em', fontWeight: 900 }}>Producer Configuration</h3>
                                            </div>
                                            <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', fontWeight: 800, color: 'hsl(var(--text-muted))', letterSpacing: '0.1em' }}>
                                                FILL & WAIT TIME SETTINGS
                                            </p>
                                        </div>
                                    </div>
                                    <div className="premium-card-body" style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
                                        <div className="ttm-matrix-wrapper">
                                            <table className="ttm-config-table">
                                                <thead>
                                                    <tr>
                                                        <th className="ttm-config-header-cell">
                                                            <div className="ttm-config-header-content">
                                                                <Factory size={16} />
                                                                <span>PRODUCER ID</span>
                                                            </div>
                                                        </th>
                                                        <th className="ttm-config-header-cell">
                                                            <span>AVG FILL TIME (MIN)</span>
                                                        </th>
                                                        <th className="ttm-config-header-cell">
                                                            <span>EST. WAIT TIME (MIN)</span>
                                                        </th>
                                                        <th className="ttm-config-header-cell calculated">
                                                            <span>TOTAL TIME/CYCLE (MIN)</span>
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {travelProducers.map((p) => {
                                                        const config = producerEdits[p.user_id] || {};
                                                        const total = (parseInt(config.avg_fill_time) || 0) + (parseInt(config.estimated_wait_time) || 0);
                                                        return (
                                                            <tr key={p.user_id}>
                                                                <td className="ttm-config-row-header">
                                                                    <div className="ttm-config-node">
                                                                        <Factory size={16} />
                                                                        <span className="node-id">{p.user_id}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="ttm-config-data-cell">
                                                                    <div className="ttm-input-pill">
                                                                        <input type="number" value={config.avg_fill_time ?? 0} onChange={(e) => handleProducerConfigChange(p.user_id, 'avg_fill_time', e.target.value)} />
                                                                        <span className="ttm-unit">MIN</span>
                                                                    </div>
                                                                </td>
                                                                <td className="ttm-config-data-cell">
                                                                    <div className="ttm-input-pill">
                                                                        <input type="number" value={config.estimated_wait_time ?? 0} onChange={(e) => handleProducerConfigChange(p.user_id, 'estimated_wait_time', e.target.value)} />
                                                                        <span className="ttm-unit">MIN</span>
                                                                    </div>
                                                                </td>
                                                                <td className="ttm-config-data-cell calculated">
                                                                    <div className="ttm-calculated-pill">
                                                                        <span className="ttm-value">{total}</span>
                                                                        <span className="ttm-unit">MIN</span>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}
                            {ttmSubTab === 'hm-matrix' && (
                                <>
                                    <div className="premium-card-header" style={{ padding: '24px 32px' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Database size={20} className="text-primary" />
                                                <h3 style={{ margin: 0, letterSpacing: '-0.02em', fontWeight: 900 }}>HM Matrix</h3>
                                            </div>
                                            <p style={{ margin: '4px 0 0 0', fontSize: '0.7rem', fontWeight: 800, color: 'hsl(var(--text-muted))', letterSpacing: '0.1em' }}>
                                                TOTAL CYCLE TIME = PRODUCER + CONSUMER + TRAVEL TIME
                                            </p>
                                        </div>
                                        <div className="ttm-legend-box">
                                            <div className="ttm-legend-item readonly">
                                                <CheckCircle2 size={14} />
                                                READ-ONLY
                                            </div>
                                        </div>
                                    </div>
                                    <div className="premium-card-body" style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
                                        <div className="ttm-matrix-wrapper">
                                            <table className="ttm-matrix-table hm-matrix">
                                                <thead>
                                                    <tr>
                                                        <th className="ttm-corner-cell hm">
                                                            <div className="ttm-corner-content">
                                                                <Database size={18} className="text-primary" />
                                                                <span>HM MATRIX</span>
                                                            </div>
                                                        </th>
                                                        {travelConsumers.map((c, idx) => (
                                                            <th key={c.user_id} className={`ttm-consumer-header ${hoveredCol === idx ? 'active' : ''}`}>
                                                                <div className="ttm-header-content">
                                                                    <MapPin size={12} className="header-icon" />
                                                                    <div className="node-id">{c.user_id}</div>
                                                                    <div className="node-label">CONSUMER</div>
                                                                </div>
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {travelProducers.map((p, rowIdx) => (
                                                        <tr key={p.user_id}>
                                                            <td className={`ttm-producer-header ${hoveredRow === rowIdx ? 'active' : ''}`}>
                                                                <div className="ttm-header-content">
                                                                    <Factory size={16} className="header-icon" />
                                                                    <span className="node-id">{p.user_id}</span>
                                                                </div>
                                                            </td>
                                                            {travelConsumers.map((c, colIdx) => (
                                                                <td key={`${p.user_id}_${c.user_id}`} onMouseEnter={() => { setHoveredRow(rowIdx); setHoveredCol(colIdx); }} onMouseLeave={() => { setHoveredRow(null); setHoveredCol(null); }} className={`ttm-data-cell readonly ${(hoveredRow === rowIdx || hoveredCol === colIdx) ? 'highlight' : ''}`}>
                                                                    <div className="ttm-calculated-pill hm">
                                                                        <span className="ttm-value">{hmMatrix[`${p.user_id}_${c.user_id}`] ?? 0}</span>
                                                                        <span className="ttm-unit">MIN</span>
                                                                    </div>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}
                            {ttmSubTab === 'system-settings' && (
                                <div className="sys-settings-panel">
                                    <div className="sys-settings-header">
                                        <div className="sys-header-left">
                                            <div className="sys-icon-badge">
                                                <Settings size={22} />
                                                <div className="sys-icon-pulse"></div>
                                            </div>
                                            <div className="sys-header-text">
                                                <h2>System Settings</h2>
                                                <p>GLOBAL TIMING PARAMETERS FOR TRIP CALCULATIONS</p>
                                            </div>
                                        </div>
                                        {(user?.role === 'admin' || user?.role === 'trs') && (
                                            <button className="sys-save-btn" onClick={saveSystemSettings} disabled={savingSystemSettings}>
                                                <span className="sys-save-icon">
                                                    {savingSystemSettings ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                                </span>
                                                <span className="sys-save-text">{savingSystemSettings ? 'Saving...' : 'Save Changes'}</span>
                                            </button>
                                        )}
                                    </div>
                                    <div className="sys-settings-body">
                                        {systemSettings.length > 0 ? (
                                            <div className="sys-settings-grid">
                                                {systemSettings.map((setting, idx) => {
                                                    const currentValue = systemSettingsEdits[setting.config_key] ?? setting.config_value;
                                                    const isModified = systemSettingsEdits[setting.config_key] !== undefined &&
                                                                       String(systemSettingsEdits[setting.config_key]) !== String(setting.config_value);
                                                    const icons = {
                                                        'TRAVEL_TO_PRODUCER_MINUTES': <Truck size={20} />,
                                                        'EXIT_BUFFER_MINUTES': <Clock size={20} />,
                                                        'DEFAULT_WAIT_TIME': <Timer size={20} />,
                                                        'DEFAULT_FILL_TIME': <Droplets size={20} />,
                                                        'DEFAULT_UNLOAD_TIME': <ArrowDownToLine size={20} />,
                                                        'DEFAULT_TRAVEL_TIME': <Route size={20} />
                                                    };
                                                    return (
                                                        <div key={setting.config_key} className={`sys-setting-card ${isModified ? 'modified' : ''}`} style={{ animationDelay: `${idx * 50}ms` }}>
                                                            <div className="sys-card-accent"></div>
                                                            <div className="sys-card-content">
                                                                <div className="sys-card-header">
                                                                    <div className="sys-card-icon">
                                                                        {icons[setting.config_key] || <Settings size={20} />}
                                                                    </div>
                                                                    <div className="sys-card-title">
                                                                        <h4>{setting.config_key.replace(/_/g, ' ')}</h4>
                                                                        <p>{setting.description}</p>
                                                                    </div>
                                                                </div>

                                                                <div className="sys-card-controls">
                                                                    <div className="sys-value-display">
                                                                        {(user?.role === 'admin' || user?.role === 'trs') ? (
                                                                            <div className="sys-input-group">
                                                                                <input type="number" value={currentValue} onChange={(e) => handleSystemSettingChange(setting.config_key, e.target.value)} min="0" className="sys-input" />
                                                                                <span className="sys-input-unit">MIN</span>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="sys-readonly-value">
                                                                                <span className="sys-value">{currentValue}</span>
                                                                                <span className="sys-unit">MIN</span>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    <div className="sys-default-badge">
                                                                        <span className="sys-default-label">Default</span>
                                                                        <span className="sys-default-value">{setting.default_value} min</span>
                                                                    </div>
                                                                </div>

                                                                {isModified && (
                                                                    <div className="sys-modified-indicator">
                                                                        <span className="sys-mod-dot"></span>
                                                                        <span>Modified</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="sys-loading-state">
                                                <div className="sys-loading-spinner">
                                                    <Loader2 size={32} className="animate-spin" />
                                                </div>
                                                <p>Loading system settings...</p>
                                            </div>
                                        )}
                                    </div>

                                    <style>{`
                                        .sys-settings-panel {
                                            display: flex;
                                            flex-direction: column;
                                            height: 100%;
                                            background: hsl(var(--main-bg));
                                            position: relative;
                                            overflow: hidden;
                                        }

                                        .sys-settings-header {
                                            display: flex;
                                            align-items: center;
                                            justify-content: space-between;
                                            padding: 24px 32px;
                                            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                                            position: relative;
                                            overflow: hidden;
                                        }

                                        .sys-settings-header::after {
                                            content: '';
                                            position: absolute;
                                            top: 0;
                                            right: 0;
                                            width: 400px;
                                            height: 100%;
                                            background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.08));
                                            pointer-events: none;
                                        }

                                        .sys-header-left {
                                            display: flex;
                                            align-items: center;
                                            gap: 16px;
                                            position: relative;
                                            z-index: 1;
                                        }

                                        .sys-icon-badge {
                                            width: 48px;
                                            height: 48px;
                                            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                                            border-radius: 14px;
                                            display: flex;
                                            align-items: center;
                                            justify-content: center;
                                            color: white;
                                            position: relative;
                                            box-shadow: 0 8px 24px -6px rgba(59, 130, 246, 0.4);
                                        }

                                        .sys-icon-pulse {
                                            position: absolute;
                                            inset: -3px;
                                            border-radius: 16px;
                                            border: 2px solid rgba(59, 130, 246, 0.4);
                                            animation: sys-pulse 2s ease-in-out infinite;
                                        }

                                        @keyframes sys-pulse {
                                            0%, 100% { opacity: 0; transform: scale(1); }
                                            50% { opacity: 1; transform: scale(1.05); }
                                        }

                                        .sys-header-text h2 {
                                            margin: 0;
                                            font-size: 1.25rem;
                                            font-weight: 800;
                                            color: white;
                                            letter-spacing: -0.02em;
                                        }

                                        .sys-header-text p {
                                            margin: 4px 0 0 0;
                                            font-size: 0.65rem;
                                            font-weight: 700;
                                            color: #94a3b8;
                                            letter-spacing: 0.15em;
                                        }

                                        .sys-save-btn {
                                            display: flex;
                                            align-items: center;
                                            gap: 10px;
                                            padding: 12px 24px;
                                            background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                                            border: none;
                                            border-radius: 12px;
                                            color: white;
                                            font-size: 0.8rem;
                                            font-weight: 700;
                                            cursor: pointer;
                                            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                                            box-shadow: 0 8px 20px -6px rgba(34, 197, 94, 0.4);
                                            position: relative;
                                            z-index: 1;
                                            overflow: hidden;
                                        }

                                        .sys-save-btn::before {
                                            content: '';
                                            position: absolute;
                                            inset: 0;
                                            background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
                                            opacity: 0;
                                            transition: opacity 0.3s ease;
                                        }

                                        .sys-save-btn:hover:not(:disabled)::before {
                                            opacity: 1;
                                        }

                                        .sys-save-btn:hover:not(:disabled) {
                                            transform: translateY(-2px);
                                            box-shadow: 0 12px 28px -6px rgba(34, 197, 94, 0.5);
                                        }

                                        .sys-save-btn:disabled {
                                            opacity: 0.6;
                                            cursor: not-allowed;
                                        }

                                        .sys-save-icon, .sys-save-text {
                                            position: relative;
                                            z-index: 1;
                                        }

                                        .sys-settings-body {
                                            flex: 1;
                                            overflow: auto;
                                            padding: 32px;
                                        }

                                        .sys-settings-grid {
                                            display: grid;
                                            grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
                                            gap: 20px;
                                            max-width: 1200px;
                                            margin: 0 auto;
                                        }

                                        .sys-setting-card {
                                            background: hsl(var(--card-bg));
                                            border-radius: 20px;
                                            position: relative;
                                            overflow: hidden;
                                            box-shadow: 0 1px 3px hsl(var(--shadow-color, 0 0% 0%) / 0.04),
                                                        0 4px 12px hsl(var(--shadow-color, 0 0% 0%) / 0.03);
                                            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                                            animation: sys-card-in 0.5s ease backwards;
                                            border: 1px solid hsl(var(--border-color));
                                        }

                                        @keyframes sys-card-in {
                                            from {
                                                opacity: 0;
                                                transform: translateY(20px);
                                            }
                                        }

                                        .sys-setting-card:hover {
                                            transform: translateY(-4px);
                                            box-shadow: 0 4px 8px hsl(var(--shadow-color, 0 0% 0%) / 0.04),
                                                        0 12px 32px hsl(var(--shadow-color, 0 0% 0%) / 0.08);
                                        }

                                        .sys-setting-card.modified {
                                            border-color: hsl(217 91% 60% / 0.4);
                                        }

                                        .sys-setting-card.modified .sys-card-accent {
                                            background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
                                        }

                                        .sys-card-accent {
                                            position: absolute;
                                            top: 0;
                                            left: 0;
                                            right: 0;
                                            height: 4px;
                                            background: hsl(var(--border-color));
                                        }

                                        .sys-card-content {
                                            padding: 24px;
                                        }

                                        .sys-card-header {
                                            display: flex;
                                            align-items: flex-start;
                                            gap: 16px;
                                            margin-bottom: 20px;
                                        }

                                        .sys-card-icon {
                                            width: 44px;
                                            height: 44px;
                                            background: hsl(var(--bg-secondary));
                                            border-radius: 12px;
                                            display: flex;
                                            align-items: center;
                                            justify-content: center;
                                            color: hsl(var(--text-muted));
                                            flex-shrink: 0;
                                            transition: all 0.3s ease;
                                        }

                                        .sys-setting-card:hover .sys-card-icon {
                                            background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                                            color: white;
                                        }

                                        .sys-card-title {
                                            flex: 1;
                                            min-width: 0;
                                        }

                                        .sys-card-title h4 {
                                            margin: 0;
                                            font-size: 0.9rem;
                                            font-weight: 700;
                                            color: hsl(var(--text-main));
                                            text-transform: uppercase;
                                            letter-spacing: 0.02em;
                                            line-height: 1.3;
                                        }

                                        .sys-card-title p {
                                            margin: 6px 0 0 0;
                                            font-size: 0.75rem;
                                            color: hsl(var(--text-muted));
                                            line-height: 1.4;
                                        }

                                        .sys-card-controls {
                                            display: flex;
                                            align-items: center;
                                            justify-content: space-between;
                                            gap: 16px;
                                            padding-top: 16px;
                                            border-top: 1px solid hsl(var(--border-color));
                                        }

                                        .sys-input-group {
                                            display: flex;
                                            align-items: center;
                                            background: hsl(var(--bg-secondary));
                                            border: 2px solid hsl(var(--border-color));
                                            border-radius: 12px;
                                            overflow: hidden;
                                            transition: all 0.2s ease;
                                        }

                                        .sys-input-group:focus-within {
                                            border-color: #3b82f6;
                                            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.15);
                                        }

                                        .sys-input {
                                            width: 70px;
                                            padding: 12px 14px;
                                            border: none;
                                            background: transparent;
                                            font-size: 1.1rem;
                                            font-weight: 700;
                                            color: hsl(var(--text-main));
                                            text-align: center;
                                            font-family: 'JetBrains Mono', 'SF Mono', monospace;
                                        }

                                        .sys-input:focus {
                                            outline: none;
                                        }

                                        .sys-input::-webkit-outer-spin-button,
                                        .sys-input::-webkit-inner-spin-button {
                                            -webkit-appearance: none;
                                            margin: 0;
                                        }

                                        .sys-input-unit {
                                            padding: 12px 14px;
                                            background: hsl(var(--border-color));
                                            font-size: 0.7rem;
                                            font-weight: 800;
                                            color: hsl(var(--text-muted));
                                            letter-spacing: 0.05em;
                                        }

                                        .sys-readonly-value {
                                            display: flex;
                                            align-items: center;
                                            gap: 8px;
                                            padding: 10px 16px;
                                            background: hsl(var(--bg-secondary));
                                            border-radius: 10px;
                                        }

                                        .sys-readonly-value .sys-value {
                                            font-size: 1.2rem;
                                            font-weight: 700;
                                            color: hsl(var(--text-main));
                                            font-family: 'JetBrains Mono', 'SF Mono', monospace;
                                        }

                                        .sys-readonly-value .sys-unit {
                                            font-size: 0.65rem;
                                            font-weight: 700;
                                            color: hsl(var(--text-muted));
                                            letter-spacing: 0.05em;
                                        }

                                        .sys-default-badge {
                                            display: flex;
                                            flex-direction: column;
                                            align-items: flex-end;
                                            gap: 2px;
                                        }

                                        .sys-default-label {
                                            font-size: 0.6rem;
                                            font-weight: 700;
                                            color: hsl(var(--text-muted));
                                            text-transform: uppercase;
                                            letter-spacing: 0.1em;
                                        }

                                        .sys-default-value {
                                            font-size: 0.85rem;
                                            font-weight: 600;
                                            color: hsl(var(--text-muted));
                                            font-family: 'JetBrains Mono', 'SF Mono', monospace;
                                        }

                                        .sys-modified-indicator {
                                            display: flex;
                                            align-items: center;
                                            gap: 6px;
                                            margin-top: 12px;
                                            padding: 8px 12px;
                                            background: hsl(217 91% 60% / 0.1);
                                            border-radius: 8px;
                                            font-size: 0.7rem;
                                            font-weight: 700;
                                            color: #3b82f6;
                                            letter-spacing: 0.03em;
                                        }

                                        .sys-mod-dot {
                                            width: 6px;
                                            height: 6px;
                                            background: #3b82f6;
                                            border-radius: 50%;
                                            animation: sys-mod-pulse 1.5s ease-in-out infinite;
                                        }

                                        @keyframes sys-mod-pulse {
                                            0%, 100% { opacity: 1; transform: scale(1); }
                                            50% { opacity: 0.5; transform: scale(1.3); }
                                        }

                                        .sys-loading-state {
                                            display: flex;
                                            flex-direction: column;
                                            align-items: center;
                                            justify-content: center;
                                            padding: 80px 40px;
                                            text-align: center;
                                        }

                                        .sys-loading-spinner {
                                            width: 64px;
                                            height: 64px;
                                            background: hsl(var(--bg-secondary));
                                            border-radius: 16px;
                                            display: flex;
                                            align-items: center;
                                            justify-content: center;
                                            color: hsl(var(--text-muted));
                                            margin-bottom: 16px;
                                        }

                                        .sys-loading-state p {
                                            margin: 0;
                                            font-size: 0.85rem;
                                            color: hsl(var(--text-muted));
                                            font-weight: 500;
                                        }

                                        @media (max-width: 768px) {
                                            .sys-settings-header {
                                                flex-direction: column;
                                                gap: 16px;
                                                align-items: flex-start;
                                            }

                                            .sys-save-btn {
                                                width: 100%;
                                                justify-content: center;
                                            }

                                            .sys-settings-grid {
                                                grid-template-columns: 1fr;
                                            }

                                            .sys-settings-body {
                                                padding: 20px;
                                            }
                                        }
                                    `}</style>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
            {showDayModal && (
                <div className="premium-modal-overlay animate-in fade-in duration-300">
                    <div className="premium-modal glass-morphism animate-in zoom-in-95">
                        <div className="premium-modal-header">
                            <div className="title-group">
                                <CalendarIcon size={20} className="icon-accent" />
                                <h3>Plan Specification: {selectedDate}</h3>
                            </div>
                            <button onClick={() => setShowDayModal(false)} className="close-btn"><XCircle size={24} /></button>
                        </div>
                        <div className="premium-modal-body grid-2-col">
                            <div className="node-group">
                                <h4 className="group-label producer">PRODUCERS</h4>
                                {users.filter(u => u.type === 'producer').map(u => {
                                    const isMaintenance = isNodeUnderMaintenance(u.user_id, selectedDate)
                                    return (
                                        <div key={u.user_id} className={`input-row ${isMaintenance ? 'maintenance-locked' : ''}`}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <label>{u.user_id}</label>
                                                {isMaintenance && <span className="maint-label">DOWNTIME</span>}
                                            </div>
                                            <div className="input-with-unit">
                                                <input type="number" className="premium-input" value={dayForm[u.user_id] || ''} onChange={e => setDayForm({ ...dayForm, [u.user_id]: e.target.value })} disabled={isMaintenance} placeholder={isMaintenance ? 'OFFLINE' : ''} />
                                                <span>MT</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                            <div className="node-group">
                                <h4 className="group-label consumer">CONSUMERS</h4>
                                {users.filter(u => u.type === 'consumer').map(u => {
                                    const isMaintenance = isNodeUnderMaintenance(u.user_id, selectedDate)
                                    return (
                                        <div key={u.user_id} className={`input-row ${isMaintenance ? 'maintenance-locked' : ''}`}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <label>{u.user_id}</label>
                                                {isMaintenance && <span className="maint-label">DOWNTIME</span>}
                                            </div>
                                            <div className="input-with-unit">
                                                <input type="number" className="premium-input" value={dayForm[u.user_id] || ''} onChange={e => setDayForm({ ...dayForm, [u.user_id]: e.target.value })} disabled={isMaintenance} placeholder={isMaintenance ? 'OFFLINE' : ''} />
                                                <span>MT</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        <div className="premium-modal-footer">
                            <button className="premium-btn text-only" onClick={() => setShowDayModal(false)}>CANCEL</button>
                            <button className="premium-btn primary glow" onClick={saveDayPlan}>SET TARGETS</button>
                        </div>
                    </div>
                </div >
            )}

            {
                showResetModal && (
                    <div className="premium-modal-overlay">
                        <div className="premium-modal glass-morphism animate-in zoom-in-95" style={{ maxWidth: '440px' }}>
                            <div className="premium-modal-header" style={{ borderBottom: 'none', padding: '32px 32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                <div style={{ width: '64px', height: '64px', background: '#fef2f2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px', border: '1px solid #fee2e2' }}>
                                    <AlertCircle size={32} style={{ color: '#ef4444' }} />
                                </div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#991b1b', letterSpacing: '-0.02em' }}>Master Logistics Reset</h3>
                            </div>
                            <div className="premium-modal-body" style={{ textAlign: 'center', padding: '0 40px 32px' }}>
                                <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '24px' }}>
                                    This action will <strong style={{ color: '#1e293b' }}>permanently delete</strong> all generated logistics assignments for today. This process cannot be undone.
                                </p>

                                <div style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                    <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: '900', color: '#64748b', marginBottom: '12px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                        Type <span style={{ color: '#ef4444' }}>RESET</span> to confirm
                                    </label>
                                    <input type="text" className="premium-input" value={resetConfirmation} onChange={e => setResetConfirmation(e.target.value.toUpperCase())} placeholder="REQUIRED" style={{ width: '100%', textAlign: 'center', background: 'white', border: '1px solid #cbd5e1', borderRadius: '12px', height: '48px', fontSize: '1.1rem', fontWeight: '900', letterSpacing: '0.15em', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }} />
                                </div>
                            </div>
                            <div className="premium-modal-footer" style={{ background: 'white', borderTop: '1px solid #f1f5f9', padding: '24px 32px', justifyContent: 'center', gap: '12px' }}>
                                <button className="premium-btn ghost" onClick={() => { setShowResetModal(false); setResetConfirmation(''); }} style={{ flex: 1, height: '48px' }}>
                                    ABORT
                                </button>
                                <button className="premium-btn danger-solid" disabled={resetConfirmation !== 'RESET' || resetting} onClick={handleResetPlan} style={{ flex: 1.5, height: '48px' }}>
                                    {resetting ? <Loader2 className="animate-spin" size={18} /> : 'WIPE ALL DATA'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                showBreakdownModal && (
                    <div className="premium-modal-overlay">
                        <div className="premium-modal glass-morphism medium">
                            <div className="premium-modal-header">
                                <div className="title-group">
                                    <AlertCircle size={20} className="text-danger" />
                                    <h3>Emergency Intervention</h3>
                                </div>
                            </div>
                            <div className="premium-modal-body">
                                <p className="instruction">Select the failed node for immediate logistics re-route.</p>
                                <select className="premium-select" value={brokenNode || ''} onChange={e => setBrokenNode(e.target.value)}>
                                    <option value="">Select Disabled Node...</option>
                                    {users.map(u => <option key={u.user_id} value={u.user_id}>{u.user_id} ({u.type.toUpperCase()})</option>)}
                                </select>
                            </div>
                            <div className="premium-modal-footer">
                                <button className="premium-btn ghost" onClick={() => setShowBreakdownModal(false)}>BACK</button>
                                <button className="premium-btn action-execute" onClick={handleEmergencyRePlan} disabled={!brokenNode || rePlanning}>
                                    {rePlanning ? <Loader2 className="animate-spin" size={20} /> : 'TRIGGER RE-OPTIMIZATION'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                showMaintenanceModal && (
                    <div className="premium-modal-overlay">
                        <div className="premium-modal glass-morphism animate-in zoom-in-95" style={{ maxWidth: '480px', borderRadius: '28px' }}>
                            <div className="premium-modal-header" style={{ borderBottom: '1px solid #f1f5f9', padding: '24px 32px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ width: '40px', height: '40px', background: '#f1f5f9', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Wrench size={20} className="text-primary" />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>{editingMaintenance ? 'Modify Schedule' : 'Schedule Downtime'}</h3>
                                        <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: 800, color: 'hsl(var(--text-muted))', letterSpacing: '0.05em' }}>MAINTENANCE PROTOCOL</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowMaintenanceModal(false)} className="close-btn"><XCircle size={22} /></button>
                            </div>
                            <form onSubmit={handleMaintenanceSubmit}>
                                <div className="premium-modal-body" style={{ padding: '32px' }}>
                                    <div className="form-group-premium-v2">
                                        <label>TARGET NODE IDENTITY</label>
                                        <div className="select-wrapper-v2">
                                            <select className="premium-select-v2" value={maintenanceFormData.node_id} onChange={(e) => setMaintenanceFormData({ ...maintenanceFormData, node_id: e.target.value })} required disabled={editingMaintenance !== null}>
                                                <option value="">Select Production or Consumption Node...</option>
                                                {users.map(node => (
                                                    <option key={node.user_id} value={node.user_id}>
                                                        {node.user_id} - {node.type.toUpperCase()}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown size={16} className="select-arrow" />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '24px' }}>
                                        <div className="form-group-premium-v2">
                                            <label>COMMENCEMENT</label>
                                            <input type="date" className="premium-input-v2" value={maintenanceFormData.start_date} onChange={(e) => setMaintenanceFormData({ ...maintenanceFormData, start_date: e.target.value })} required />
                                        </div>
                                        <div className="form-group-premium-v2">
                                            <label>COMPLETION</label>
                                            <input type="date" className="premium-input-v2" value={maintenanceFormData.end_date} onChange={(e) => setMaintenanceFormData({ ...maintenanceFormData, end_date: e.target.value })} required />
                                        </div>
                                    </div>

                                    <div className="form-group-premium-v2" style={{ marginTop: '24px' }}>
                                        <label>CLASSIFICATION / REASON</label>
                                        <textarea className="premium-textarea-v2" placeholder="Describe the nature of the maintenance (e.g., Annual Relining, Emergency Repair)..." value={maintenanceFormData.reason} onChange={(e) => setMaintenanceFormData({ ...maintenanceFormData, reason: e.target.value })} required rows={3} />
                                    </div>
                                </div>
                                <div className="premium-modal-footer" style={{ background: '#f8fafc', padding: '24px 32px', borderTop: '1px solid #f1f5f9' }}>
                                    <button type="button" className="premium-btn ghost" onClick={() => setShowMaintenanceModal(false)} style={{ borderRadius: '12px', fontWeight: 800 }}>
                                        ABORT
                                    </button>
                                    <button type="submit" className="premium-btn primary" style={{ borderRadius: '12px', padding: '0 32px', height: '44px', fontWeight: 900 }}>
                                        {editingMaintenance ? 'UPDATE PROTOCOL' : 'CONFIRM SCHEDULE'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
            <ExcelUploadModal isOpen={showExcelModal} onClose={() => setShowExcelModal(false)} onConfirm={handleExcelConfirm} users={users} currentDate={currentDate} />
            {showEmailModal && (
                <div className="premium-modal-overlay">
                    <div className="premium-modal glass-morphism animate-in zoom-in-95" style={{ maxWidth: '440px', borderRadius: '28px' }}>
                        <div className="premium-modal-header" style={{ borderBottom: '1px solid #f1f5f9', padding: '24px 32px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Mail size={20} style={{ color: 'white' }} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>Email Maintenance Schedule</h3>
                                    <p style={{ margin: 0, fontSize: '0.65rem', fontWeight: 800, color: 'hsl(var(--text-muted))', letterSpacing: '0.05em' }}>SEND SCHEDULE VIA EMAIL</p>
                                </div>
                            </div>
                            <button onClick={() => setShowEmailModal(false)} className="close-btn"><XCircle size={22} /></button>
                        </div>
                        <div className="premium-modal-body" style={{ padding: '32px' }}>
                            <div className="form-group-premium-v2">
                                <label style={{ display: 'block', fontSize: '0.65rem', fontWeight: 900, color: '#64748b', marginBottom: '12px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                                    Recipient Email Address
                                </label>
                                <input type="email" className="premium-input-v2" placeholder="Enter email address..." value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} style={{ width: '100%', padding: '14px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '0.95rem', background: '#f8fafc' }} autoFocus />
                            </div>
                            <p style={{ margin: '16px 0 0 0', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                                The maintenance schedule will be sent to this email address as a formatted HTML email.
                            </p>
                        </div>
                        <div className="premium-modal-footer" style={{ background: '#f8fafc', padding: '24px 32px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button type="button" className="premium-btn ghost" onClick={() => setShowEmailModal(false)} style={{ borderRadius: '12px', fontWeight: 800 }}>
                                CANCEL
                            </button>
                            <button
                                type="button"
                                className="premium-btn primary"
                                onClick={() => {
                                    setShowEmailModal(false)
                                    emailMaintenanceSchedule()
                                }}
                                disabled={!emailAddress.trim() || !emailAddress.includes('@')}
                                style={{ borderRadius: '12px', padding: '0 24px', height: '44px', fontWeight: 900, background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', opacity: (!emailAddress.trim() || !emailAddress.includes('@')) ? 0.5 : 1, cursor: (!emailAddress.trim() || !emailAddress.includes('@')) ? 'not-allowed' : 'pointer' }}
                            >
                                <Mail size={16} style={{ marginRight: '8px' }} />
                                SEND EMAIL
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .strategic-command-center {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    background: #f8fafc;
                    color: #0f172a;
                    font-family: 'Inter', system-ui, sans-serif;
                    overflow: hidden;
                }

                .switcher-tabs {
                    display: flex;
                    background: #1e293b;
                    padding: 4px;
                    border-radius: 12px;
                    gap: 4px;
                }

                .tab-btn {
                    padding: 8px 16px;
                    border-radius: 8px;
                    border: none;
                    background: transparent;
                    color: #94a3b8;
                    font-size: 0.7rem;
                    font-weight: 800;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s;
                }

                .tab-btn.active {
                    background: white;
                    color: #0f172a;
                    box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.15);
                    transform: translateY(-1px);
                }

                .tab-btn:hover:not(.active) {
                    background: rgba(255, 255, 255, 0.05);
                    color: white;
                }

                .header-meta {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                }

                .time-display {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: #94a3b8;
                }

                .user-badge-premium {
                    width: 36px;
                    height: 36px;
                    background: #334155;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 2px solid #475569;
                }

                .user-initials {
                    font-size: 0.8rem;
                    font-weight: 900;
                    color: white;
                }

                .command-content {
                    flex: 1;
                    padding: 24px; /* Increased top/bottom padding for "breathing room" */
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                    min-height: 0;
                }

                .panel-header-actions {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    flex-shrink: 0;
                }

                .panel-title h2 {
                    font-size: 1.5rem;
                    font-weight: 900;
                    margin: 0;
                    color: #1e293b;
                }

                .panel-title p {
                    font-size: 0.85rem;
                    color: #64748b;
                    margin: 4px 0 0 0;
                    font-weight: 500;
                }

                /* Maintenance UI - Premium V2 */
                .premium-table-v2 {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                }

                .premium-table-v2 th {
                    text-align: left;
                    padding: 18px 32px;
                    font-size: 0.65rem;
                    font-weight: 900;
                    text-transform: uppercase;
                    color: #64748b;
                    background: #f8fafc;
                    border-bottom: 2px solid #f1f5f9;
                    letter-spacing: 0.1em;
                }

                .premium-table-v2 tr {
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .premium-table-v2 tr:hover {
                    background-color: #f8fafc;
                    transform: scale(0.998);
                }

                .premium-table-v2 td {
                    padding: 20px 32px;
                    font-size: 0.9rem;
                    color: #1e293b;
                    border-bottom: 1px solid #f1f5f9;
                    vertical-align: middle;
                }

                .premium-badge-v2 {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 14px;
                    border-radius: 10px;
                    font-size: 0.7rem;
                    font-weight: 900;
                    letter-spacing: 0.05em;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                }

                .premium-badge-v2.ongoing {
                    background: #fef2f2;
                    color: #ef4444;
                    border: 1px solid #fee2e2;
                }

                .premium-badge-v2.scheduled {
                    background: #fffbeb;
                    color: #d97706;
                    border: 1px solid #fef3c7;
                    border-left: 3px solid #f59e0b;
                }

                .premium-badge-v2.completed {
                    background: #f0fdf4;
                    color: #166534;
                    border: 1px solid #dcfce7;
                }

                .pulse-icon {
                    animation: pulse-red 2s infinite;
                }

                @keyframes pulse-red {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.2); opacity: 0.5; }
                    100% { transform: scale(1); opacity: 1; }
                }

                .maintenance-node-identity {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                }

                .node-icon-box {
                    width: 36px;
                    height: 36px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                }

                .node-icon-box.producer {
                    background: #fff7ed;
                    color: #ea580c;
                    border: 1px solid #ffedd5;
                }

                .node-icon-box.consumer {
                    background: #f0fdf4;
                    color: #16a34a;
                    border: 1px solid #dcfce7;
                }

                .node-info {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .node-id {
                    font-weight: 900;
                    color: #0f172a;
                    font-size: 0.95rem;
                }

                .node-type {
                    font-size: 0.6rem;
                    font-weight: 800;
                    color: #94a3b8;
                    letter-spacing: 0.05em;
                }

                .duration-pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: #f1f5f9;
                    padding: 4px 10px;
                    border-radius: 8px;
                    font-size: 0.75rem;
                    font-weight: 800;
                    color: #475569;
                    border: 1px solid #e2e8f0;
                }

                .maintenance-reason {
                    font-weight: 600;
                    color: #475569;
                    font-size: 0.85rem;
                    display: block;
                    max-width: 250px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .icon-btn-v2 {
                    width: 34px;
                    height: 34px;
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: white;
                    border: 1px solid #e2e8f0;
                    color: #64748b;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .icon-btn-v2:hover {
                    border-color: #cbd5e1;
                    color: #0f172a;
                    background: #f8fafc;
                    transform: translateY(-2px);
                }

                .icon-btn-v2.danger:hover {
                    background: #fef2f2;
                    color: #ef4444;
                    border-color: #fee2e2;
                }

                .empty-maintenance-state {
                    padding: 80px 40px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                }

                .empty-icon-ring {
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    background: #f1f5f9;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #cbd5e1;
                    border: 4px solid white;
                    box-shadow: 0 0 0 1px #e2e8f0;
                    margin-bottom: 24px;
                }

                .empty-maintenance-state h4 {
                    margin: 0 0 8px 0;
                    font-weight: 900;
                    font-size: 1.25rem;
                    color: #1e293b;
                }

                .empty-maintenance-state p {
                    margin: 0;
                    color: #94a3b8;
                    font-size: 0.9rem;
                    max-width: 320px;
                    line-height: 1.6;
                }

                /* Premium Form V2 */
                .form-group-premium-v2 {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .form-group-premium-v2 label {
                    font-size: 0.65rem;
                    font-weight: 900;
                    color: #64748b;
                    letter-spacing: 0.05em;
                }

                .select-wrapper-v2 {
                    position: relative;
                    display: flex;
                    align-items: center;
                }

                .premium-select-v2 {
                    width: 100%;
                    height: 48px;
                    background: #f8fafc;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 14px;
                    padding: 0 40px 0 16px;
                    font-size: 0.9rem;
                    font-weight: 800;
                    color: #1e293b;
                    appearance: none;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .premium-select-v2:focus {
                    border-color: #fbbf24;
                    background: white;
                    box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.1);
                    outline: none;
                }

                .select-arrow {
                    position: absolute;
                    right: 16px;
                    color: #94a3b8;
                    pointer-events: none;
                }

                .premium-input-v2 {
                    width: 100%;
                    height: 48px;
                    background: #f8fafc;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 14px;
                    padding: 0 16px;
                    font-size: 0.9rem;
                    font-weight: 800;
                    color: #1e293b;
                    transition: all 0.2s;
                }

                .premium-input-v2:focus {
                    border-color: #fbbf24;
                    background: white;
                    box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.1);
                    outline: none;
                }

                .premium-textarea-v2 {
                    width: 100%;
                    background: #f8fafc;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 14px;
                    padding: 16px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: #1e293b;
                    transition: all 0.2s;
                    resize: none;
                    font-family: inherit;
                }

                .premium-textarea-v2:focus {
                    border-color: #fbbf24;
                    background: white;
                    box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.1);
                    outline: none;
                }

            .calendar-panel-container {
                padding: 12px 20px;
            border-radius: 20px;
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
            overflow: hidden;
                }

            .strategic-panel {
                flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
            overflow: hidden;
                }

            .calendar-controls {
                display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
            margin-bottom: 12px;
            flex-shrink: 0;
                }

            .month-display {
                font-size: 1.2rem;
            font-weight: 900;
            min-width: 240px;
            text-align: center;
            letter-spacing: 0.1em;
            color: #0f172a;
                }

            .nav-icon-btn {
                background: white;
            border: 1px solid #e2e8f0;
            width: 40px;
            height: 40px;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
            color: #64748b;
                }

            .nav-icon-btn:hover {
                background: #f8fafc;
            border-color: #cbd5e1;
            color: #0f172a;
            transform: scale(1.05);
                }

            .calendar-grid-premium {
                display: grid;
            grid-template-columns: repeat(7, 1fr);
            grid-template-rows: auto repeat(6, 1fr);
            gap: 4px;
            flex: 1;
            min-height: 0;
            overflow: hidden;
                }

            .weekday-header {
                text-align: center;
            padding: 4px;
            font-size: 0.65rem;
            font-weight: 900;
            color: #94a3b8;
            letter-spacing: 0.1em;
                }

            .calendar-day {
                background: rgba(255, 255, 255, 0.5);
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 6px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            min-height: 0;
            height: 100%;
                }

            .calendar-day:hover {
                background: white;
            border-color: #fbbf24;
            box-shadow: 0 8px 20px -5px rgba(251, 191, 36, 0.2);
            transform: translateY(-4px);
                }

            .calendar-day.empty {
                background: transparent;
            border: none;
            cursor: default;
                }

            .calendar-day.is-today {
                border: 2px solid #f59e0b;
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            box-shadow: 0 4px 15px -3px rgba(245, 158, 11, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.6);
            position: relative;
                }

            .calendar-day.is-today::before {
                content: 'TODAY';
            position: absolute;
            top: -8px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: white;
            font-size: 0.55rem;
            font-weight: 800;
            padding: 2px 8px;
            border-radius: 4px;
            letter-spacing: 0.05em;
            box-shadow: 0 2px 4px rgba(217, 119, 6, 0.3);
                }

            .calendar-day.is-today .day-number {
                color: #92400e;
            font-weight: 900;
                }

            .calendar-day.has-data {
                background: white;
            border-color: #cbd5e1;
                }

            .day-header {
                display: flex;
            justify-content: space-between;
            align-items: flex-start;
                }

            .day-number {
                font-size: 0.9rem;
            font-weight: 800;
            color: #1e293b;
                }

            .committed-icon {
                color: #10b981;
                }

            .day-data-preview {
                margin-top: 4px;
                }

            .preview-item {
                display: flex;
            align-items: center;
            gap: 4px;
            background: #f1f5f9;
            padding: 2px 6px;
            border-radius: 4px;
            width: fit-content;
                }

            .preview-dot {
                width: 6px;
            height: 6px;
            background: #fbbf24;
            border-radius: 50%;
                }

            .preview-item span {
                font-size: 0.6rem;
            font-weight: 800;
            color: #475569;
                }

            /* Executive View Layout */
            .executive-view-grid {
                display: grid;
            grid-template-columns: 1fr 340px;
            gap: 24px;
            flex: 1;
            min-height: 0;
            overflow: hidden;
                }

            .performance-matrix-section {
                display: flex;
            flex-direction: column;
            min-height: 0;
            gap: 0;
                }

            .performance-matrix-section .premium-card {
                flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
                }

            .performance-matrix-section .premium-card-body {
                flex: 1;
            overflow: hidden;
                }

            .control-center-section {
                display: flex;
            flex-direction: column;
            gap: 16px;
            min-height: 0;
                }

            .control-center-section .premium-card {
                flex: 0 0 auto;
                }

            .premium-card {
                border-radius: 16px;
            overflow: hidden;
            margin-bottom: 12px;
            display: flex;
            flex-direction: column;
                }

            .premium-card-header {
                padding: 20px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #f1f5f9;
                }

            .premium-card-header h3 {
                margin: 0;
            font-size: 1rem;
            font-weight: 800;
            color: #1e293b;
                }

            .title-with-icon {
                display: flex;
            align-items: center;
            gap: 12px;
                }

            .icon-accent {color: #fbbf24; }
            .icon-success {color: #10b981; }

            .status-tag {
                font-size: 0.65rem;
            font-weight: 900;
            padding: 4px 10px;
            border-radius: 20px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            letter-spacing: 0.02em;
                }

            .status-tag.confirmed, .status-tag.operating, .status-tag.active {
                background: #f0fdf4;
            color: #166534;
            border: 1px solid #bbf7d0;
                }

            .status-tag.pending, .status-tag.scheduled {
                background: #fffbeb;
            color: #92400e;
            border: 1px solid #fef3c7;
                }

            .status-tag.error, .status-tag.offline, .status-tag.breakdown {
                background: #fef2f2;
            color: #991b1b;
            border: 1px solid #fee2e2;
                }

            .status-tag.sm {
                padding: 2px 8px;
            font-size: 0.6rem;
                }

            .no-padding {padding: 0 !important; }

            .premium-table {
                width: 100%;
            border-collapse: separate;
            border-spacing: 0;
                }

            .premium-table th {
                text-align: left;
            padding: 16px 24px;
            font-size: 0.75rem;
            font-weight: 900;
            text-transform: uppercase;
            color: #475569;
            background: #f8fafc;
            border-bottom: 2px solid #e2e8f0;
            letter-spacing: 0.05em;
                }

            .premium-table tr {
                transition: all 0.2s;
                }

            .premium-table tr:nth-child(even) {
                background-color: #f9fafb;
                }

            .premium-table tr:hover {
                background-color: #f1f5f9;
            box-shadow: inset 4px 0 0 -1px #fbbf24;
                }

            .premium-table td {
                padding: 14px 24px;
            font-size: 0.9rem;
            color: #334155;
            border-bottom: 1px solid #f1f5f9;
            vertical-align: middle;
                }

            .premium-table .tabular-nums {
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-variant-numeric: tabular-nums;
            letter-spacing: -0.02em;
                }

            .font-bold {font-weight: 800; }
            .font-medium {font-weight: 700; }
            .font-heavy {font-weight: 900; }
            .text-primary {color: #1e293b; }
            .text-accent {color: #d97706; }
            .text-muted {color: #94a3b8; }

            .role-badge {
                font-size: 0.65rem;
            font-weight: 900;
            padding: 4px 10px;
            border-radius: 8px;
            letter-spacing: 0.02em;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 80px;
                }

            .role-badge.producer {
                background: #fff7ed;
            color: #c2410c;
            border: 1px solid #ffedd5;
                }
            .role-badge.consumer {
                background: #f0fdf4;
            color: #15803d;
            border: 1px solid #dcfce7;
                }

            .mini-progress-track {
                width: 100%;
            max-width: 100px;
            height: 8px;
            background: #f1f5f9;
            border-radius: 10px;
            overflow: hidden;
            position: relative;
                }

            .mini-progress-fill {
                height: 100%;
            border-radius: 10px;
            transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.3s;
                }

            .mini-progress-fill.high {background: #10b981; }
            .mini-progress-fill.medium {background: #f59e0b; }
            .mini-progress-fill.low {background: #ef4444; }
            .mini-progress-fill.zero {background: #94a3b8; }

            /* Control Center */
            .command-panel {
                background: #0f172a;
            color: white;
                }

            .command-panel .premium-card-header {
                border-bottom-color: #1e293b;
                }

            .command-panel .premium-card-header h3 {
                color: white;
                }

            .control-group {
                display: flex;
            flex-direction: column;
            gap: 16px;
            padding: 24px;
                }

            .premium-btn {
                padding: 12px 20px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 900;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            transition: all 0.2s;
            border: none;
                }

            .premium-btn.action-confirm {
                background: #10b981;
            color: white;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
                }

            .premium-btn.action-optimize {
                background: #fbbf24;
            color: #0f172a;
            box-shadow: 0 4px 12px rgba(251, 191, 36, 0.3);
                }

            .premium-btn.action-optimize:disabled {
                background: #334155;
            color: #64748b;
            box-shadow: none;
            cursor: not-allowed;
                }

            .emergency-actions {
                margin-top: 12px;
            display: flex;
            flex-direction: column;
            gap: 10px;
                }

            .premium-btn.action-breakdown {
                background: #ef4444;
            color: white;
                }

            .premium-btn.action-reset {
                background: rgba(255, 255, 255, 0.1);
            color: #94a3b8;
                }

            .premium-btn.ghost {
                background: transparent;
            color: #64748b;
            border: 1px solid #e2e8f0;
                }

            .premium-btn.ghost:hover {
                background: #f8fafc;
            color: #0f172a;
            border-color: #cbd5e1;
                }

            .premium-btn.danger-solid {
                background: #ef4444;
            color: white;
            box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
                }

            .premium-btn.danger-solid:disabled {
                background: #cbd5e1;
            color: #94a3b8;
            box-shadow: none;
            cursor: not-allowed;
                }

            .premium-btn.text-only {
                background: transparent;
            color: #64748b;
                }

            .premium-btn.text-only:hover {
                color: #0f172a;
            background: #f1f5f9;
                }

            .history-panel {
                flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
                }

            .history-panel .premium-card {
                flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
                }

            .history-panel .premium-card-body {
                flex: 1;
            overflow: hidden;
                }

            .health-summary-card {
                background: white;
            border-radius: 20px;
            box-shadow: 0 4px 20px -5px rgba(0,0,0,0.1);
                }

            .summary-label {
                font-size: 0.6rem;
            font-weight: 900;
            letter-spacing: 0.1em;
            color: #94a3b8;
            margin-bottom: 12px;
                }

            .summary-stat {
                display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 16px;
                }

            .stat-label {
                font-size: 0.75rem;
            font-weight: 700;
            color: #64748b;
                }

            .stat-value {
                font-size: 1.2rem;
            font-weight: 900;
            color: #1e293b;
                }

            .stat-value small {
                font-size: 0.7rem;
            color: #94a3b8;
                }

            .health-progress-bar {
                height: 10px;
            background: #f1f5f9;
            border-radius: 20px;
            overflow: hidden;
            margin: 12px 0;
                }

            .health-fill {
                height: 100%;
            background: linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%);
            border-radius: 20px;
                }

            .fulfillment-status {
                font-size: 0.7rem;
            font-weight: 900;
            color: #0f172a;
            text-align: right;
                }

            /* Modals - Premium Styling */
            .premium-modal-overlay {
                position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(15, 23, 42, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(4px);
                }

            .premium-modal {
                background: white;
            border-radius: 24px;
            width: 760px;
            max-width: 95%;
            max-height: 90vh; /* Ensure modal never touches top/bottom edges */
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
            overflow: hidden;
            display: flex;
            flex-direction: column;
                }

            .premium-modal-header {
                padding: 24px 32px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #f1f5f9;
                }

            .premium-modal-header h3 {
                margin: 0;
            font-size: 1.1rem;
            font-weight: 900;
            color: #0f172a;
                }

            .title-group {
                display: flex;
            align-items: center;
            gap: 12px;
                }

            .close-btn {
                background: none;
            border: none;
            color: #94a3b8;
            cursor: pointer;
            transition: color 0.2s;
                }

            .close-btn:hover {color: #ef4444; }

            .grid-2-col {
                display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 32px;
            padding: 24px 32px;
            overflow-y: auto; /* Internal scroll only for modal content if strictly necessary */
            flex: 1;
                }

            .group-label {
                font-size: 0.65rem;
            font-weight: 900;
            letter-spacing: 0.1em;
            margin-bottom: 16px;
            padding-bottom: 6px;
            border-bottom: 2px solid #f1f5f9;
                }

            .group-label.producer {color: hsl(var(--accent)); border-color: hsl(var(--accent) / 0.1); }
            .group-label.consumer {color: hsl(var(--success)); border-color: hsl(var(--success) / 0.1); }

            .input-row {
                display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
                }

            .input-row label {
                font-size: 0.8rem;
            font-weight: 800;
            color: #475569;
                }

            .input-with-unit {
                display: flex;
            align-items: center;
            gap: 8px;
            background: #f8fafc;
            padding-right: 12px;
            border-radius: 10px;
            border: 1px solid #e2e8f0;
                }

            .premium-input {
                border: none;
            background: transparent;
            padding: 10px 14px;
            font-size: 0.9rem;
            font-weight: 800;
            color: #0f172a;
            width: 100px;
            text-align: right;
                }

            .premium-input:focus {outline: none; }

            .input-with-unit span {
                font-size: 0.65rem;
            font-weight: 900;
            color: #94a3b8;
                }

            .premium-modal-footer {
                padding: 20px 32px;
            background: #f8fafc;
            display: flex;
            justify-content: flex-end;
            gap: 16px;
                }

            .premium-btn.glow {
                box-shadow: 0 4px 14px 0 rgba(251, 191, 36, 0.39);
                }

            .premium-page-container {
                display: none; /* Hide old structure */
                }

            .calendar-day.has-maintenance {
                border: 1px dashed hsl(var(--warning) / 0.5);
            background: linear-gradient(135deg, transparent 0%, hsl(var(--warning) / 0.05) 100%);
                }

            .maintenance-icon-calendar {
                color: hsl(var(--warning));
            position: absolute;
            top: 4px;
            right: 4px;
            filter: drop-shadow(0 0 2px white);
                }

            .input-row.maintenance-locked {
                opacity: 0.7;
            background: hsl(var(--muted) / 0.1);
            border-radius: 8px;
            padding: 0 8px;
            margin: 4px -8px;
                }

            .maint-label {
                font-size: 0.65rem;
            font-weight: 800;
            padding: 1px 4px;
            background: hsl(var(--warning));
            color: white;
            border-radius: 4px;
            letter-spacing: 0.05em;
                }

            .status-tag.maintenance {
                background: hsl(var(--warning) / 0.2);
            color: hsl(var(--warning));
            border: 1px solid hsl(var(--warning) / 0.3);
                }

            .premium-modal-body::-webkit-scrollbar {
                width: 6px;
                }
            .premium-modal-body::-webkit-scrollbar-thumb {
                background: hsl(var(--primary) / 0.1);
            border-radius: 10px;
                }
            .premium-modal-body::-webkit-scrollbar-thumb:hover {
                background: hsl(var(--primary) / 0.2);
                }
            .matrix-producer-sidebar.active {
                background: #fbbf24 !important;
            color: #0f172a !important;
                }

            .matrix-producer-sidebar.active div {
                background: rgba(0,0,0,0.1) !important;
                }

            .matrix-header-active {
                background: #fef3c7 !important;
            box-shadow: inset 0 -2px 0 #fbbf24;
                }

            .matrix-number-input::-webkit-inner-spin-button,
            .matrix-number-input::-webkit-outer-spin-button {
                -webkit-appearance: none;
            margin: 0;
                }

                /* TTM Matrix UI - Premium V2 */
                .ttm-matrix-wrapper {
                    border: 1px solid #e2e8f0;
                    border-radius: 20px;
                    overflow: auto;
                    background: white;
                    box-shadow: 0 4px 20px -5px rgba(0,0,0,0.05);
                    width: 100%;
                }

                .ttm-matrix-table {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                    table-layout: auto;
                }

                .ttm-corner-cell {
                    background: #0f172a;
                    position: sticky;
                    top: 0;
                    left: 0;
                    z-index: 40;
                    padding: 16px;
                    border-bottom: 2px solid #1e293b;
                    border-right: 2px solid #1e293b;
                    width: 160px;
                    min-width: 160px;
                }

                .ttm-corner-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 8px;
                    color: white;
                }

                .ttm-corner-content span {
                    font-size: 0.6rem;
                    font-weight: 900;
                    letter-spacing: 0.25em;
                    color: #fbbf24;
                }

                .ttm-consumer-header {
                    background: #f8fafc;
                    position: sticky;
                    top: 0;
                    z-index: 30;
                    padding: 16px 12px;
                    border-bottom: 2px solid #e2e8f0;
                    transition: all 0.2s;
                    width: 120px;
                    min-width: 120px;
                    text-align: center;
                }

                .ttm-consumer-header.active {
                    background: #f1f5f9;
                    box-shadow: inset 0 -3px 0 #fbbf24;
                }

                .ttm-producer-header {
                    background: #0f172a;
                    position: sticky;
                    left: 0;
                    z-index: 30;
                    padding: 12px 16px;
                    border-right: 2px solid #1e293b;
                    border-bottom: 1px solid #1e293b;
                    transition: all 0.2s;
                    color: white;
                    width: 160px;
                    min-width: 160px;
                    white-space: nowrap;
                }

                .ttm-producer-header.active {
                    background: #1e293b;
                    box-shadow: inset 4px 0 0 #fbbf24;
                }

                .ttm-header-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 4px;
                }

                .ttm-producer-header .ttm-header-content {
                    flex-direction: row;
                    justify-content: flex-start;
                    gap: 12px;
                }

                .header-icon {
                    opacity: 0.5;
                    color: #fbbf24;
                }

                .ttm-consumer-header .node-id {
                    font-weight: 900;
                    color: #1e293b;
                    font-size: 0.85rem;
                }

                .ttm-consumer-header .node-label {
                    font-size: 0.55rem;
                    font-weight: 800;
                    color: #94a3b8;
                    letter-spacing: 0.05em;
                }

                .ttm-producer-header .node-id {
                    font-weight: 900;
                    font-size: 0.95rem;
                    color: white;
                }

                .ttm-data-cell {
                    padding: 6px;
                    border-bottom: 1px solid #f1f5f9;
                    border-right: 1px solid #f1f5f9;
                    transition: all 0.2s;
                }

                .ttm-data-cell.highlight {
                    background: #f8fafc;
                }

                .ttm-input-pill {
                    display: flex;
                    align-items: center;
                    background: white;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 0 8px;
                    height: 38px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .ttm-input-pill.focused {
                    border-color: #fbbf24;
                    box-shadow: 0 4px 12px rgba(251, 191, 36, 0.15);
                    transform: scale(1.05);
                    z-index: 10;
                }

                .ttm-input-pill input {
                    width: 100%;
                    background: transparent;
                    border: none;
                    text-align: center;
                    font-size: 1rem;
                    font-weight: 900;
                    color: #0f172a;
                    font-family: ui-monospace, monospace;
                    outline: none;
                }

                .ttm-unit {
                    font-size: 0.55rem;
                    font-weight: 900;
                    color: #cbd5e1;
                    letter-spacing: 0.05em;
                }

                /* Mobile Responsive Breakpoints */
                @media (max-width: 1024px) {
                    .executive-view-grid {
                        grid-template-columns: 1fr;
                        gap: 16px;
                    }

                    .control-center-section {
                        order: -1;
                    }
                }

                @media (max-width: 768px) {
                    .grid-2-col {
                        grid-template-columns: 1fr;
                        gap: 16px;
                        padding: 16px;
                    }

                    .calendar-controls {
                        flex-wrap: wrap;
                    }

                    .month-display {
                        min-width: 180px;
                        font-size: 1rem;
                    }

                    .premium-modal {
                        width: 95vw !important;
                        max-width: 95vw !important;
                        margin: 10px;
                    }
                }

                @media (max-width: 480px) {
                    .calendar-day {
                        padding: 4px;
                    }

                    .day-number {
                        font-size: 0.75rem;
                    }

                    .preview-item span {
                        font-size: 0.5rem;
                    }
                }
            `}</style>
        </div >
    )
}

export default MonthlyPlanning
