import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { AlertTriangle, CheckCircle2, Clock, TrendingDown, TrendingUp, Loader2, FileDown, Factory, Zap, BarChart2, Activity, RefreshCw, Filter, Mail, X } from 'lucide-react'

import { api } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useHeader } from '../context/HeaderContext'
import { useNotification } from '../context/NotificationContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line, Area, Bar, PieChart, Pie, Cell } from 'recharts'

const COLORS = {
    primary: 'hsl(217 91% 60%)',
    success: 'hsl(142 71% 40%)',
    warning: 'hsl(38 92% 50%)',
    danger: 'hsl(0 84% 60%)',
    textMuted: 'hsl(215 16% 47%)',
    early: '#3b82f6',        
    onTime: '#22c55e',
    warningYellow: '#f59e0b',
    alertOrange: '#f97316',
    critical: '#ef4444',
    
    chartOnTime: '#0ea5e9',      
    chartDeviation: '#f97316'    
}

const DeviationAnalytics = ({ embedded = false }) => {
    const { user } = useAuth()
    const { setHeaderContent } = useHeader()
    const { showSuccess, showError } = useNotification()
    
    const chartColors = {
        axisText: '#64748b',
        gridStroke: 'rgba(0,0,0,0.04)'
    }

    const [loading, setLoading] = useState(true)
    const [timeRange, setTimeRange] = useState('week')
    const [customRange, setCustomRange] = useState({
        start: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    })
    const [compareType, setCompareType] = useState('day')
    const [nodeFilter, setNodeFilter] = useState('all')
    const [lastUpdated, setLastUpdated] = useState(new Date())
    const [isExporting, setIsExporting] = useState(false)
    const [isSendingEmail, setIsSendingEmail] = useState(false)
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [emailAddress, setEmailAddress] = useState('')

    const [summary, setSummary] = useState({
        total_trips: 0,
        early_count: 0,
        on_time_count: 0,
        warning_count: 0,
        alert_count: 0,
        critical_count: 0,
        avg_deviation_minutes: 0,
        min_deviation_minutes: 0,
        max_deviation_minutes: 0,
        on_time_percentage: 0,
        early_percentage: 0
    })
    const [nodeData, setNodeData] = useState([])
    const [phaseData, setPhaseData] = useState(null)
    const [trends, setTrends] = useState([])
    const [comparison, setComparison] = useState(null)
    const [rootCause, setRootCause] = useState(null)

    const summaryRef = useRef(summary)
    const nodeDataRef = useRef(nodeData)
    const phaseDataRef = useRef(phaseData)
    const trendsRef = useRef(trends)

    useEffect(() => {
        summaryRef.current = summary
        nodeDataRef.current = nodeData
        phaseDataRef.current = phaseData
        trendsRef.current = trends
    }, [summary, nodeData, phaseData, trends])

    const getDateParams = useCallback(() => {
        if (timeRange === 'custom') {
            return `date_from=${customRange.start}&date_to=${customRange.end}`
        }
        return `range_type=${timeRange}`
    }, [timeRange, customRange])

    const fetchData = useCallback(async () => {
        if (!user || !['admin', 'trs', 'ppc'].includes(user.role)) return

        try {
            const dateParams = timeRange === 'custom'
                ? `date_from=${customRange.start}&date_to=${customRange.end}`
                : (() => {
                    const today = new Date().toISOString().split('T')[0]
                    const getStartDate = () => {
                        const d = new Date()
                        if (timeRange === 'day') return today
                        if (timeRange === 'week') {
                            d.setDate(d.getDate() - 7)
                            return d.toISOString().split('T')[0]
                        }
                        if (timeRange === 'month') {
                            return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
                        }
                        return new Date(d.getFullYear(), 0, 1).toISOString().split('T')[0]
                    }
                    return `date_from=${getStartDate()}&date_to=${today}`
                })()

            const [summaryRes, nodeRes, phaseRes, trendsRes, comparisonRes, rootCauseRes] = await Promise.all([
                api.get(`/api/statistics/deviation-summary?${dateParams}`),
                api.get(`/api/statistics/deviation-by-node?${dateParams}&node_type=${nodeFilter}`),
                api.get(`/api/statistics/deviation-by-phase?${dateParams}`),
                api.get(`/api/statistics/deviation-trends?range_type=${timeRange}${timeRange === 'custom' ? `&start_date=${customRange.start}&end_date=${customRange.end}` : ''}`),
                api.get(`/api/statistics/deviation-comparison?compare_type=${compareType}`),
                api.get(`/api/statistics/root-cause-analysis?${dateParams}`)
            ])

            setSummary(summaryRes)
            setNodeData(nodeRes)
            setPhaseData(phaseRes)
            setTrends(trendsRes)
            setComparison(comparisonRes)
            setRootCause(rootCauseRes)
            setLastUpdated(new Date())
        } catch (err) {
            console.error("Deviation analytics fetch error:", err)
        } finally {
            setLoading(false)
        }
    }, [user, timeRange, customRange, compareType, nodeFilter])

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 30000) 
        return () => clearInterval(interval)
    }, [fetchData])

    const handleExportPDF = useCallback(async () => {
        setIsExporting(true)
        try {
            const doc = new jsPDF('p', 'mm', 'a4')
            const pageWidth = doc.internal.pageSize.getWidth()
            const pageHeight = doc.internal.pageSize.getHeight()
            const margin = 14
            let yPos = 20

            doc.setFillColor(23, 37, 84)
            doc.rect(0, 0, pageWidth, 32, 'F')

            doc.setFontSize(16)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(255, 255, 255)
            doc.text('DEEVIA', margin, 14)

            doc.setFontSize(13)
            doc.text('Deviation Analytics Report', pageWidth / 2, 12, { align: 'center' })

            doc.setFontSize(8)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(200, 220, 255)
            doc.text(`Period: ${timeRange.charAt(0).toUpperCase() + timeRange.slice(1)}`, pageWidth / 2, 19, { align: 'center' })

            doc.setFontSize(7)
            doc.setTextColor(180, 200, 255)
            doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 14, { align: 'right' })

            yPos = 38

            doc.setFontSize(9)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(23, 37, 84)
            doc.text('DEVIATION SUMMARY', margin, yPos)
            yPos += 4

            const summaryData = [
                ['Total Trips', String(summaryRef.current.total_trips), 'On-Time %', `${summaryRef.current.on_time_percentage}%`],
                ['On-Time', String(summaryRef.current.on_time_count), 'Warning', String(summaryRef.current.warning_count)],
                ['Alert', String(summaryRef.current.alert_count), 'Critical', String(summaryRef.current.critical_count)],
                ['Avg Deviation', `${summaryRef.current.avg_deviation_minutes} min`, 'Max Deviation', `${summaryRef.current.max_deviation_minutes} min`]
            ]

            autoTable(doc, {
                startY: yPos,
                body: summaryData,
                theme: 'plain',
                styles: { fontSize: 7, cellPadding: 2 },
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 40, textColor: [100, 100, 100] },
                    1: { cellWidth: 35, fontStyle: 'bold', textColor: [23, 37, 84] },
                    2: { fontStyle: 'bold', cellWidth: 40, textColor: [100, 100, 100] },
                    3: { cellWidth: 35, fontStyle: 'bold', textColor: [23, 37, 84] }
                },
                margin: { left: margin, right: margin }
            })

            yPos = doc.lastAutoTable.finalY + 8

            if (nodeDataRef.current.length > 0) {
                doc.setFontSize(9)
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(23, 37, 84)
                doc.text('NODE PERFORMANCE', margin, yPos)
                yPos += 4

                const nodeTableData = nodeDataRef.current.map(n => [
                    n.node_id,
                    n.node_type,
                    String(n.total_trips),
                    `${n.on_time_percentage}%`,
                    `${n.avg_deviation} min`
                ])

                autoTable(doc, {
                    startY: yPos,
                    head: [['Node', 'Type', 'Trips', 'On-Time %', 'Avg Dev']],
                    body: nodeTableData,
                    theme: 'striped',
                    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 7 },
                    styles: { fontSize: 7, cellPadding: 2 },
                    margin: { left: margin, right: margin }
                })
            }

            const pageCount = doc.internal.getNumberOfPages()
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i)
                doc.setFillColor(248, 250, 252)
                doc.rect(0, pageHeight - 18, pageWidth, 18, 'F')
                doc.setFontSize(8)
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(23, 37, 84)
                doc.text('DEEVIA SOFTWARE INDIA PVT LTD', pageWidth / 2, pageHeight - 10, { align: 'center' })
                doc.setFontSize(7)
                doc.setTextColor(80, 80, 80)
                doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' })
            }

            doc.save(`Deviation_Analytics_${new Date().toISOString().split('T')[0]}.pdf`)
        } catch (error) {
            console.error('PDF export error:', error)
        } finally {
            setIsExporting(false)
        }
    }, [timeRange])

    const openEmailModal = useCallback(() => {
        setEmailAddress(user?.email || '')
        setShowEmailModal(true)
    }, [user])

    const handleEmailReport = useCallback(async () => {
        const targetEmail = emailAddress.trim()
        if (!targetEmail || !targetEmail.includes('@')) {
            showError('Please enter a valid email address')
            return
        }

        setIsSendingEmail(true)
        try {
            const response = await api.post('/api/statistics/deviation-analytics/email', {
                email: targetEmail,
                date_from: customRange.start || null,
                date_to: customRange.end || null,
                node_filter: nodeFilter !== 'all' ? nodeFilter : null
            })

            if (response.status === 'success') {
                showSuccess(`Deviation analytics report sent to ${targetEmail}`)
                setShowEmailModal(false)
                setEmailAddress('')
            } else {
                showError(response.detail || 'Failed to send email')
            }
        } catch (error) {
            console.error('Email error:', error)
            const errorMessage = error.response?.data?.detail || error.message || 'Failed to send email. Please check SMTP configuration.'
            showError(errorMessage)
        } finally {
            setIsSendingEmail(false)
        }
    }, [emailAddress, customRange, nodeFilter, showSuccess, showError])

    useEffect(() => {
        const headerUpdate = {
            left: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                        display: 'flex',
                        gap: '2px',
                        background: 'var(--bg-secondary)',
                        padding: '3px',
                        borderRadius: '6px',
                        border: '1px solid hsl(var(--border-color))'
                    }}>
                        {['day', 'week', 'month', 'year', 'custom'].map(r => (
                            <button
                                key={r}
                                onClick={() => setTimeRange(r)}
                                style={{
                                    border: 'none',
                                    background: timeRange === r ? 'hsl(var(--primary))' : 'transparent',
                                    padding: '5px 10px',
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    color: timeRange === r ? 'white' : 'hsl(var(--text-muted))',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {r.charAt(0).toUpperCase() + r.slice(1)}
                            </button>
                        ))}
                    </div>
                    {timeRange === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                                type="date"
                                value={customRange.start}
                                onChange={e => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                                style={{
                                    padding: '4px 8px',
                                    border: '1px solid hsl(var(--border-color))',
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)'
                                }}
                            />
                            <span style={{ fontSize: '0.6rem', color: 'hsl(var(--text-muted))' }}>to</span>
                            <input
                                type="date"
                                value={customRange.end}
                                onChange={e => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                                style={{
                                    padding: '4px 8px',
                                    border: '1px solid hsl(var(--border-color))',
                                    borderRadius: '4px',
                                    fontSize: '0.65rem',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)'
                                }}
                            />
                        </div>
                    )}
                    <select value={nodeFilter} onChange={e => setNodeFilter(e.target.value)} className="deviation-node-select">
                        <option value="all">All Nodes</option>
                        <option value="producer">Producers Only</option>
                        <option value="consumer">Consumers Only</option>
                    </select>
                </div>
            ),
            right: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '12px' }}>
                    <button
                        onClick={fetchData}
                        style={{
                            padding: '5px',
                            border: '1px solid hsl(var(--border-color))',
                            borderRadius: '6px',
                            background: 'var(--bg-secondary)',
                            cursor: 'pointer',
                            color: 'hsl(var(--text-muted))',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                    >
                        <RefreshCw size={12} />
                    </button>
                    <button
                        onClick={handleExportPDF}
                        disabled={isExporting}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '5px 10px',
                            background: 'hsl(var(--primary))',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            cursor: isExporting ? 'wait' : 'pointer',
                            opacity: isExporting ? 0.7 : 1
                        }}
                    >
                        <FileDown size={12} />
                        {isExporting ? 'Exporting...' : 'Export PDF'}
                    </button>
                    <button
                        onClick={openEmailModal}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '5px 10px',
                            background: 'transparent',
                            color: 'hsl(var(--text-main))',
                            border: '1px solid hsl(var(--border-color))',
                            borderRadius: '6px',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        <Mail size={12} />
                        Email
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div className="pulse-dot-green"></div>
                        <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'hsl(var(--success))' }}>LIVE</span>
                    </div>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'hsl(var(--text-muted))' }}>
                        {lastUpdated.toLocaleTimeString()}
                    </span>
                </div>
            )
        };

        if (!embedded) {
            headerUpdate.center = null;
        }

        setHeaderContent(headerUpdate);
        return () => {
            setHeaderContent({ left: null, right: null, ...(embedded ? {} : { center: null }) });
        }
    }, [lastUpdated, setHeaderContent, handleExportPDF, isExporting, openEmailModal, timeRange, customRange, nodeFilter, fetchData, embedded])

    if (!user || !['admin', 'trs', 'ppc'].includes(user.role)) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: '16px' }}>
                <AlertTriangle size={48} color={COLORS.warning} />
                <p style={{ fontSize: '1rem', fontWeight: 600 }}>Admin access required</p>
            </div>
        )
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Loader2 className="animate-spin" size={40} color="hsl(var(--primary))" />
            </div>
        )
    }

    const KPICard = ({ icon: Icon, label, value, subValue, color, percentage }) => (
        <div className="dev-kpi-card" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="kpi-icon" style={{ backgroundColor: `${color}20`, color }}>
                <Icon size={16} />
            </div>
            <div className="kpi-content">
                <span className="kpi-label">{label}</span>
                <span className="kpi-value" style={{ color }}>{value}</span>
                {subValue && <span className="kpi-sub">{subValue}</span>}
                {percentage !== undefined && (
                    <div className="kpi-bar">
                        <div className="fill" style={{ width: `${Math.min(percentage, 100)}%`, background: color }}></div>
                    </div>
                )}
            </div>
        </div>
    )

    const phaseChartData = phaseData ? [
        { name: 'Loading', value: phaseData.loading_phase?.delay_contribution_pct || 0, color: COLORS.primary },
        { name: 'Transit', value: phaseData.transit_phase?.delay_contribution_pct || 0, color: COLORS.warning },
        { name: 'Unloading', value: phaseData.unloading_phase?.delay_contribution_pct || 0, color: COLORS.success }
    ] : []

    const NodeTable = ({ data }) => {
        const [sortConfig, setSortConfig] = useState({ key: 'on_time_percentage', direction: 'asc' })

        const sortedData = useMemo(() => {
            const sorted = [...data]
            sorted.sort((a, b) => {
                if (sortConfig.direction === 'asc') {
                    return a[sortConfig.key] - b[sortConfig.key]
                }
                return b[sortConfig.key] - a[sortConfig.key]
            })
            return sorted
        }, [data, sortConfig])

        const handleSort = (key) => {
            setSortConfig(prev => ({
                key,
                direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
            }))
        }

        return (
            <table className="node-table">
                <thead>
                    <tr>
                        <th>Node</th>
                        <th>Type</th>
                        <th onClick={() => handleSort('total_trips')} style={{ cursor: 'pointer' }}>
                            Trips {sortConfig.key === 'total_trips' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('on_time_percentage')} style={{ cursor: 'pointer' }}>
                            On-Time % {sortConfig.key === 'on_time_percentage' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort('avg_deviation')} style={{ cursor: 'pointer' }}>
                            Avg Dev {sortConfig.key === 'avg_deviation' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedData.map(node => {
                        let statusColor = COLORS.onTime
                        let statusText = 'Good'
                        if (node.on_time_percentage < 50) {
                            statusColor = COLORS.critical
                            statusText = 'Critical'
                        } else if (node.on_time_percentage < 70) {
                            statusColor = COLORS.alertOrange
                            statusText = 'Alert'
                        } else if (node.on_time_percentage < 85) {
                            statusColor = COLORS.warningYellow
                            statusText = 'Warning'
                        }

                        return (
                            <tr key={`${node.node_id}-${node.node_type}`}>
                                <td className="node-id">{node.node_id}</td>
                                <td>
                                    <span className={`type-badge ${node.node_type}`}>
                                        {node.node_type === 'producer' ? <Factory size={10} /> : <Zap size={10} />}
                                        {node.node_type}
                                    </span>
                                </td>
                                <td>{node.total_trips}</td>
                                <td>
                                    <span className="pct-badge" style={{ background: `${statusColor}15`, color: statusColor }}>
                                        {node.on_time_percentage}%
                                    </span>
                                </td>
                                <td>{node.avg_deviation} min</td>
                                <td>
                                    <span className="status-badge" style={{ background: `${statusColor}15`, color: statusColor }}>
                                        {statusText}
                                    </span>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        )
    }

    return (
        <div className="deviation-page">
            <div className="kpi-row">
                <KPICard icon={TrendingDown} label="Early" value={summary.early_count} subValue="Ahead of schedule" color={COLORS.early} percentage={summary.total_trips> 0 ? (summary.early_count / summary.total_trips) * 100 : 0} />
                <KPICard icon={CheckCircle2} label="On-Time" value={`${summary.on_time_percentage}%`} subValue={`${summary.on_time_count} trips (0-10 min)`} color={COLORS.onTime} percentage={summary.on_time_percentage || 0} />
                <KPICard icon={Clock} label="Warning" value={summary.warning_count} subValue="11-20 min delay" color={COLORS.warningYellow} percentage={summary.total_trips> 0 ? (summary.warning_count / summary.total_trips) * 100 : 0} />
                <KPICard icon={AlertTriangle} label="Alert" value={summary.alert_count} subValue="21-30 min delay" color={COLORS.alertOrange} percentage={summary.total_trips> 0 ? (summary.alert_count / summary.total_trips) * 100 : 0} />
                <KPICard icon={AlertTriangle} label="Critical" value={summary.critical_count} subValue=">30 min delay" color={COLORS.critical} percentage={summary.total_trips> 0 ? (summary.critical_count / summary.total_trips) * 100 : 0} />
            </div>
            <div className="deviation-summary-row">
                <div className="deviation-stat">
                    <span className="stat-label">Total Trips</span>
                    <span className="stat-value">{summary.total_trips}</span>
                </div>
                <div className="deviation-stat">
                    <span className="stat-label">Min Deviation</span>
                    <span className="stat-value" style={{ color: summary.min_deviation_minutes < 0 ? COLORS.early : COLORS.onTime }}>
                        {summary.min_deviation_minutes} min
                    </span>
                </div>
                <div className="deviation-stat">
                    <span className="stat-label">Avg Deviation</span>
                    <span className="stat-value" style={{ color: summary.avg_deviation_minutes <= 10 ? COLORS.onTime : summary.avg_deviation_minutes <= 20 ? COLORS.warningYellow : COLORS.critical }}>
                        {summary.avg_deviation_minutes} min
                    </span>
                </div>
                <div className="deviation-stat">
                    <span className="stat-label">Max Deviation</span>
                    <span className="stat-value" style={{ color: summary.max_deviation_minutes > 30 ? COLORS.critical : summary.max_deviation_minutes > 20 ? COLORS.alertOrange : COLORS.warningYellow }}>
                        {summary.max_deviation_minutes} min
                    </span>
                </div>
            </div>
            <div className="main-grid">
                <div className="card trends-card">
                    <div className="card-header">
                        <div className="title"><Activity size={14} /><span>Deviation Trends</span></div>
                    </div>
                    <div className="card-body chart-body">
                        {trends.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={trends} margin={{ top: 10, right: 30, left: -10, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="onTimeGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={COLORS.chartOnTime} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={COLORS.chartOnTime} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.gridStroke} />
                                    <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fill: chartColors.axisText, fontSize: 9 }} />
                                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: chartColors.axisText, fontSize: 9 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: COLORS.chartDeviation, fontSize: 9 }} />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || !payload.length) return null
                                            return (
                                                <div className="custom-tooltip">
                                                    <div className="tooltip-header">{label}</div>
                                                    {payload.map((entry, idx) => (
                                                        <div key={idx} className="tooltip-row">
                                                            <span
                                                                className="tooltip-dot"
                                                                style={{ background: entry.color, borderRadius: entry.dataKey === 'avg_deviation' ? '0' : '50%' }}
                                                            ></span>
                                                            <span className="tooltip-label">{entry.name}:</span>
                                                            <span className="tooltip-value">
                                                                {entry.dataKey === 'on_time_percentage' ? `${entry.value}%` : entry.dataKey === 'avg_deviation' ? `${entry.value} min` : entry.value}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )
                                        }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: '9px', paddingTop: '4px', color: chartColors.axisText }} formatter={(value, entry) => ( <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}> {entry.dataKey === 'avg_deviation' && <span style={{ borderBottom: `2px dashed ${entry.color}`, width: '12px', display: 'inline-block' }}></span>} {entry.dataKey === 'on_time_percentage' && <span style={{ borderBottom: `2px solid ${entry.color}`, width: '12px', display: 'inline-block' }}></span>} {value} </span> )} />
                                    <Area yAxisId="left" type="monotone" dataKey="on_time_percentage" fill="url(#onTimeGrad)" stroke={COLORS.chartOnTime} strokeWidth={2.5} name="On-Time %" dot={{ r: 4, fill: COLORS.chartOnTime, strokeWidth: 0 }} />
                                    <Line yAxisId="right" type="monotone" dataKey="avg_deviation" stroke={COLORS.chartDeviation} strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 4, fill: COLORS.chartDeviation, strokeWidth: 2, stroke: '#fff'}} name="Avg Deviation (min)" />
                                    <Bar yAxisId="left" dataKey="total_trips" fill={COLORS.primary} opacity={0.3} name="Total Trips" />
                                </ComposedChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="no-data"><BarChart2 size={28} /><span>No trend data</span></div>
                        )}
                    </div>
                </div>
                <div className="card comparison-card">
                    <div className="card-header">
                        <div className="title"><TrendingUp size={14} /><span>Period Comparison</span></div>
                        <select value={compareType} onChange={e => setCompareType(e.target.value)} className="compare-select">
                            <option value="day">Day</option>
                            <option value="week">Week</option>
                            <option value="month">Month</option>
                            <option value="year">Year</option>
                        </select>
                    </div>
                    <div className="card-body comparison-body">
                        {comparison ? (
                            <>
                                <div className="comparison-row">
                                    <div className="period-box current">
                                        <span className="period-label">{comparison.current_period.label}</span>
                                        <div className="period-stats">
                                            <div className="stat">
                                                <span className="stat-value">{comparison.current_period.total_trips}</span>
                                                <span className="stat-label">Trips</span>
                                            </div>
                                            <div className="stat">
                                                <span className="stat-value">{comparison.current_period.on_time_pct}%</span>
                                                <span className="stat-label">On-Time</span>
                                            </div>
                                            <div className="stat">
                                                <span className="stat-value">{comparison.current_period.avg_deviation}m</span>
                                                <span className="stat-label">Avg Dev</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="vs-divider">VS</div>
                                    <div className="period-box previous">
                                        <span className="period-label">{comparison.previous_period.label}</span>
                                        <div className="period-stats">
                                            <div className="stat">
                                                <span className="stat-value">{comparison.previous_period.total_trips}</span>
                                                <span className="stat-label">Trips</span>
                                            </div>
                                            <div className="stat">
                                                <span className="stat-value">{comparison.previous_period.on_time_pct}%</span>
                                                <span className="stat-label">On-Time</span>
                                            </div>
                                            <div className="stat">
                                                <span className="stat-value">{comparison.previous_period.avg_deviation}m</span>
                                                <span className="stat-label">Avg Dev</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="change-summary">
                                    <div className={`change-badge ${comparison.change.improved ? 'positive' : 'negative'}`}>
                                        {comparison.change.improved ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                        <span>{comparison.change.improved ? 'Improved' : 'Declined'}</span>
                                    </div>
                                    <div className="change-details">
                                        <span className={comparison.change.on_time_change_pct >= 0 ? 'positive' : 'negative'}>
                                            {comparison.change.on_time_change_pct >= 0 ? '+' : ''}{comparison.change.on_time_change_pct}% on-time
                                        </span>
                                        <span className={comparison.change.deviation_change_min <= 0 ? 'positive' : 'negative'}>
                                            {comparison.change.deviation_change_min <= 0 ? '' : '+'}{comparison.change.deviation_change_min} min avg
                                        </span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="no-data"><TrendingUp size={28} /><span>No comparison data</span></div>
                        )}
                    </div>
                </div>
            </div>
            <div className="analysis-grid">
                <div className="card phase-card">
                    <div className="card-header">
                        <div className="title"><BarChart2 size={14} /><span>Phase Contribution</span></div>
                    </div>
                    <div className="card-body phase-body">
                        {phaseData ? (
                            <>
                                <div className="phase-chart">
                                    <ResponsiveContainer width="100%" height={110}>
                                        <PieChart>
                                            <Pie data={phaseChartData} cx="50%" cy="50%" innerRadius={28} outerRadius={45} paddingAngle={4} dataKey="value" stroke="none">
                                                {phaseChartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => `${value}%`} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="phase-legend">
                                    <div className="legend-item">
                                        <span className="dot" style={{ background: COLORS.primary }}></span>
                                        <span>Loading</span>
                                        <strong>{phaseData.loading_phase?.delay_contribution_pct || 0}%</strong>
                                    </div>
                                    <div className="legend-item">
                                        <span className="dot" style={{ background: COLORS.warning }}></span>
                                        <span>Transit</span>
                                        <strong>{phaseData.transit_phase?.delay_contribution_pct || 0}%</strong>
                                    </div>
                                    <div className="legend-item">
                                        <span className="dot" style={{ background: COLORS.success }}></span>
                                        <span>Unloading</span>
                                        <strong>{phaseData.unloading_phase?.delay_contribution_pct || 0}%</strong>
                                    </div>
                                </div>
                                <div className="phase-details">
                                    {phaseData.loading_phase?.most_delayed_producer && (
                                        <span>Most delayed producer: <strong>{phaseData.loading_phase.most_delayed_producer}</strong></span>
                                    )}
                                    {phaseData.transit_phase?.most_delayed_route && (
                                        <span>Slowest route: <strong>{phaseData.transit_phase.most_delayed_route}</strong></span>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="no-data"><BarChart2 size={28} /><span>No phase data</span></div>
                        )}
                    </div>
                </div>
                <div className="card rootcause-card">
                    <div className="card-header">
                        <div className="title"><AlertTriangle size={14} /><span>Root Cause Analysis</span></div>
                    </div>
                    <div className="card-body rootcause-body">
                        {rootCause ? (
                            <div className="rootcause-content">
                                <div className="rootcause-section">
                                    <span className="section-title">By Shift</span>
                                    <div className="shift-bars">
                                        {rootCause.by_shift?.map(s => (
                                            <div key={s.shift} className="shift-bar-item">
                                                <span className="shift-name">{s.shift}</span>
                                                <div className="bar-container">
                                                    <div className="bar" style={{ width: `${s.delay_rate}%`, background: s.delay_rate > 30 ? COLORS.danger : s.delay_rate > 15 ? COLORS.warning : COLORS.success }}></div>
                                                </div>
                                                <span className="shift-value">{s.delay_rate}%</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {rootCause.by_day_of_week?.length > 0 && (
                                    <div className="rootcause-section">
                                        <span className="section-title">By Day of Week</span>
                                        <div className="day-of-week-chart">
                                            {rootCause.by_day_of_week.map(d => (
                                                <div key={d.day} className="dow-bar-item">
                                                    <span className="dow-name">{d.day.slice(0, 3)}</span>
                                                    <div className="dow-bar-container">
                                                        <div className="dow-bar" style={{ height: `${Math.min(d.delay_rate, 100)}%`, background: d.delay_rate> 30 ? COLORS.critical : d.delay_rate> 20 ? COLORS.alertOrange : d.delay_rate> 10 ? COLORS.warningYellow : COLORS.onTime }}></div>
                                                    </div>
                                                    <span className="dow-value">{d.delay_rate}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {rootCause.worst_routes?.length > 0 && (
                                    <div className="rootcause-section">
                                        <span className="section-title">Worst Routes</span>
                                        <div className="worst-routes">
                                            {rootCause.worst_routes.slice(0, 3).map((r, i) => (
                                                <div key={i} className="route-item">
                                                    <span className="route-rank">#{i + 1}</span>
                                                    <span className="route-name">{r.route}</span>
                                                    <span className="route-dev">{r.avg_deviation}m avg</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="no-data"><AlertTriangle size={28} /><span>No root cause data</span></div>
                        )}
                    </div>
                </div>
                <div className="card node-table-card">
                    <div className="card-header">
                        <div className="title"><Factory size={14} /><span>Node Performance ({nodeData.length})</span></div>
                    </div>
                    <div className="card-body table-body">
                        {nodeData.length > 0 ? (
                            <NodeTable data={nodeData} />
                        ) : (
                            <div className="no-data"><Factory size={28} /><span>No node data</span></div>
                        )}
                    </div>
                </div>
            </div>
            {showEmailModal && (
                <div className="stats-modal-overlay" onClick={() => { setShowEmailModal(false); setEmailAddress(''); }}>
                    <div className="stats-modal" onClick={e => e.stopPropagation()}>
                        <div className="stats-modal-header">
                            <div className="stats-modal-title">
                                <Mail size={20} />
                                <span>Send Report via Email</span>
                            </div>
                            <button className="stats-modal-close" onClick={() => { setShowEmailModal(false); setEmailAddress(''); }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="stats-modal-body">
                            <p className="stats-modal-desc">
                                The <strong>Deviation Analytics</strong> report for <strong>{timeRange}</strong> period will be generated and sent to your email.
                            </p>
                            <label className="stats-modal-label">Email Address</label>
                            <input type="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="Enter email address..." className="stats-modal-input" autoFocus />
                        </div>
                        <div className="stats-modal-footer">
                            <button onClick={() => { setShowEmailModal(false); setEmailAddress(''); }} className="stats-modal-btn secondary" disabled={isSendingEmail}>
                                Cancel
                            </button>
                            <button onClick={handleEmailReport} className="stats-modal-btn primary" disabled={isSendingEmail || !emailAddress.trim()}>
                                {isSendingEmail ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Mail size={14} />
                                        Send Report
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .deviation-page {
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    padding: 10px;
                    background: var(--bg-primary);
                    overflow: hidden;
                }

                @keyframes pulse-green {
                    0%, 100% { opacity: 0.6; transform: scale(0.9); }
                    50% { opacity: 1; transform: scale(1.1); }
                }

                .pulse-dot-green {
                    width: 6px;
                    height: 6px;
                    background: hsl(var(--success));
                    border-radius: 50%;
                    animation: pulse-green 1.5s infinite;
                }

                /* KPI Row */
                .kpi-row {
                    display: grid;
                    grid-template-columns: repeat(5, 1fr);
                    gap: 8px;
                    flex-shrink: 0;
                }

                /* Deviation Summary Row */
                .deviation-summary-row {
                    display: flex;
                    gap: 8px;
                    padding: 8px;
                    background: var(--bg-secondary);
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 6px;
                    flex-shrink: 0;
                }

                .deviation-stat {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 2px;
                    padding: 6px;
                    background: var(--bg-primary);
                    border-radius: 4px;
                }

                .deviation-stat .stat-label {
                    font-size: 0.6rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                }

                .deviation-stat .stat-value {
                    font-size: 0.95rem;
                    font-weight: 900;
                    color: var(--text-primary);
                }

                .dev-kpi-card {
                    background: var(--bg-secondary);
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 6px;
                    padding: 10px;
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                }

                .dev-kpi-card:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                }

                .dev-kpi-card .kpi-icon {
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                }

                .dev-kpi-card .kpi-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .dev-kpi-card .kpi-label {
                    font-size: 0.6rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                }

                .dev-kpi-card .kpi-value {
                    font-size: 1.2rem;
                    font-weight: 900;
                }

                .dev-kpi-card .kpi-sub {
                    font-size: 0.55rem;
                    color: hsl(var(--text-muted));
                }

                .dev-kpi-card .kpi-bar {
                    height: 3px;
                    background: hsl(var(--border-color) / 0.3);
                    border-radius: 2px;
                    overflow: hidden;
                    margin-top: 2px;
                }

                .dev-kpi-card .kpi-bar .fill {
                    height: 100%;
                    border-radius: 2px;
                }

                /* Main Grid */
                .main-grid {
                    display: grid;
                    grid-template-columns: 2fr 1fr;
                    gap: 8px;
                    flex: 1;
                    min-height: 0;
                }

                /* Analysis Grid */
                .analysis-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1.5fr;
                    gap: 8px;
                    flex: 1;
                    min-height: 0;
                }

                /* Cards */
                .card {
                    background: var(--bg-secondary);
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 6px;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    min-height: 0;
                }

                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 10px;
                    border-bottom: 1px solid hsl(var(--border-color) / 0.5);
                    background: var(--bg-secondary);
                    flex-shrink: 0;
                }

                .card-header .title {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: hsl(var(--primary));
                }

                .card-body {
                    flex: 1;
                    padding: 8px;
                    overflow: hidden;
                    background: var(--bg-secondary);
                    min-height: 0;
                }

                .chart-body {
                    height: 100%;
                }

                /* Node Filter Select - Premium styling */
                .deviation-node-select {
                    padding: 6px 28px 6px 10px;
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 8px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                    cursor: pointer;
                    transition: all 0.2s ease;
                    appearance: none;
                    -webkit-appearance: none;
                    -moz-appearance: none;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 8px center;
                    background-size: 12px;
                    letter-spacing: 0.02em;
                    min-width: 110px;
                }

                .deviation-node-select:hover {
                    border-color: hsl(var(--primary));
                    box-shadow: 0 0 0 2px hsl(var(--primary) / 0.1);
                }

                .deviation-node-select:focus {
                    outline: none;
                    border-color: hsl(var(--primary));
                    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15);
                }

                .deviation-node-select option {
                    background: var(--bg-secondary);
                    color: var(--text-primary);
                    font-weight: 600;
                    padding: 8px;
                }

                /* Comparison Card */
                .compare-select {
                    padding: 4px 24px 4px 8px;
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 6px;
                    font-size: 0.65rem;
                    font-weight: 700;
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    cursor: pointer;
                    transition: all 0.2s ease;
                    appearance: none;
                    -webkit-appearance: none;
                    -moz-appearance: none;
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 6px center;
                    background-size: 10px;
                }

                .compare-select:hover {
                    border-color: hsl(var(--primary));
                }

                .compare-select:focus {
                    outline: none;
                    border-color: hsl(var(--primary));
                    box-shadow: 0 0 0 2px hsl(var(--primary) / 0.1);
                }

                .compare-select option {
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-weight: 600;
                }

                .comparison-body {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .comparison-row {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .period-box {
                    flex: 1;
                    padding: 8px;
                    border-radius: 6px;
                    background: var(--bg-primary);
                }

                .period-box.current {
                    border: 2px solid hsl(var(--primary) / 0.4);
                    background: hsl(var(--primary) / 0.1);
                }

                .period-label {
                    font-size: 0.6rem;
                    font-weight: 800;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                }

                .period-stats {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 6px;
                }

                .period-stats .stat {
                    text-align: center;
                }

                .period-stats .stat-value {
                    font-size: 0.85rem;
                    font-weight: 900;
                    display: block;
                    color: var(--text-primary);
                }

                .period-stats .stat-label {
                    font-size: 0.55rem;
                    color: hsl(var(--text-muted));
                }

                .vs-divider {
                    font-size: 0.6rem;
                    font-weight: 900;
                    color: hsl(var(--text-muted));
                }

                .change-summary {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px;
                    background: var(--bg-primary);
                    border-radius: 6px;
                }

                .change-badge {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 4px 10px;
                    border-radius: 16px;
                    font-size: 0.65rem;
                    font-weight: 800;
                }

                .change-badge.positive {
                    background: ${COLORS.onTime}15;
                    color: ${COLORS.onTime};
                }

                .change-badge.negative {
                    background: ${COLORS.critical}15;
                    color: ${COLORS.critical};
                }

                .change-details {
                    display: flex;
                    gap: 10px;
                    font-size: 0.6rem;
                    font-weight: 700;
                }

                .change-details .positive { color: ${COLORS.onTime}; }
                .change-details .negative { color: ${COLORS.critical}; }

                /* Phase Card */
                .phase-body {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 6px;
                    overflow-y: auto;
                }

                .phase-chart {
                    width: 100%;
                    flex-shrink: 0;
                }

                .phase-legend {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                }

                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.65rem;
                }

                .legend-item .dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 2px;
                }

                .legend-item span {
                    flex: 1;
                    color: hsl(var(--text-muted));
                }

                .legend-item strong {
                    font-weight: 800;
                    color: var(--text-primary);
                }

                .phase-details {
                    width: 100%;
                    padding-top: 6px;
                    border-top: 1px solid hsl(var(--border-color) / 0.3);
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                    font-size: 0.6rem;
                    color: hsl(var(--text-muted));
                }

                .phase-details strong {
                    color: hsl(var(--primary));
                }

                /* Root Cause Card */
                .rootcause-body {
                    overflow-y: auto;
                }

                .rootcause-content {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .rootcause-section {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .section-title {
                    font-size: 0.6rem;
                    font-weight: 800;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                }

                .shift-bars {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                }

                .shift-bar-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .shift-name {
                    width: 50px;
                    font-size: 0.6rem;
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .bar-container {
                    flex: 1;
                    height: 6px;
                    background: hsl(var(--border-color) / 0.2);
                    border-radius: 3px;
                    overflow: hidden;
                }

                .bar-container .bar {
                    height: 100%;
                    border-radius: 3px;
                }

                .shift-value {
                    width: 30px;
                    font-size: 0.6rem;
                    font-weight: 800;
                    text-align: right;
                    color: var(--text-primary);
                }

                /* Day of Week Chart */
                .day-of-week-chart {
                    display: flex;
                    justify-content: space-between;
                    gap: 3px;
                    height: 60px;
                    padding-top: 4px;
                }

                .dow-bar-item {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 2px;
                }

                .dow-name {
                    font-size: 0.55rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                }

                .dow-bar-container {
                    flex: 1;
                    width: 100%;
                    max-width: 20px;
                    background: hsl(var(--border-color) / 0.2);
                    border-radius: 2px;
                    display: flex;
                    align-items: flex-end;
                    overflow: hidden;
                }

                .dow-bar {
                    width: 100%;
                    border-radius: 2px;
                    transition: height 0.3s ease;
                }

                .dow-value {
                    font-size: 0.55rem;
                    font-weight: 800;
                    color: var(--text-primary);
                }

                .worst-routes {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                }

                .route-item {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 4px 6px;
                    background: var(--bg-primary);
                    border-radius: 3px;
                }

                .route-rank {
                    font-size: 0.55rem;
                    font-weight: 800;
                    color: ${COLORS.danger};
                }

                .route-name {
                    flex: 1;
                    font-size: 0.6rem;
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .route-dev {
                    font-size: 0.55rem;
                    font-weight: 700;
                    color: ${COLORS.danger};
                }

                /* Node Table */
                .table-body {
                    overflow-y: auto;
                    padding: 0;
                }

                .node-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .node-table thead {
                    position: sticky;
                    top: 0;
                    background: var(--bg-secondary);
                    z-index: 10;
                }

                .node-table th {
                    text-align: left;
                    padding: 6px 8px;
                    font-size: 0.6rem;
                    font-weight: 800;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    border-bottom: 1px solid hsl(var(--border-color));
                }

                .node-table td {
                    padding: 6px 8px;
                    font-size: 0.65rem;
                    border-bottom: 1px solid hsl(var(--border-color) / 0.15);
                    color: var(--text-primary);
                }

                .node-table tr:hover {
                    background: var(--bg-primary);
                }

                .node-id {
                    font-weight: 800;
                    color: var(--text-primary);
                }

                .type-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 0.55rem;
                    font-weight: 700;
                    text-transform: capitalize;
                }

                .type-badge.producer {
                    background: ${COLORS.primary}15;
                    color: ${COLORS.primary};
                }

                .type-badge.consumer {
                    background: ${COLORS.success}15;
                    color: ${COLORS.success};
                }

                .pct-badge, .status-badge {
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-size: 0.6rem;
                    font-weight: 800;
                }

                .no-data {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: hsl(var(--text-muted));
                    font-size: 0.65rem;
                    gap: 6px;
                    opacity: 0.5;
                }

                /* Tooltip */
                .custom-tooltip {
                    background: var(--bg-secondary);
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 6px;
                    padding: 8px 10px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    font-size: 10px;
                }

                .tooltip-header {
                    font-weight: 800;
                    font-size: 9px;
                    color: hsl(var(--text-muted));
                    margin-bottom: 4px;
                    padding-bottom: 3px;
                    border-bottom: 1px solid hsl(var(--border-color) / 0.5);
                }

                .tooltip-row {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    padding: 2px 0;
                }

                .tooltip-dot {
                    width: 7px;
                    height: 7px;
                    border-radius: 2px;
                }

                .tooltip-label {
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                }

                .tooltip-value {
                    font-weight: 800;
                    color: var(--text-primary);
                }

                /* Dark mode overrides for Recharts */
                :root[data-theme="dark"] .recharts-legend-item-text {
                    color: #94a3b8 !important;
                }

                :root[data-theme="dark"] .recharts-cartesian-axis-tick-value {
                    fill: #94a3b8 !important;
                }

                :root[data-theme="dark"] .custom-dates input::-webkit-calendar-picker-indicator {
                    filter: invert(0.8);
                }

                /* Responsive */
                @media (max-width: 1400px) {
                    .kpi-row { grid-template-columns: repeat(5, 1fr); }
                }

                @media (max-width: 1200px) {
                    .deviation-page { overflow-y: auto; }
                    .kpi-row { grid-template-columns: repeat(3, 1fr); }
                    .main-grid { grid-template-columns: 1fr; flex: none; }
                    .analysis-grid { grid-template-columns: 1fr 1fr; flex: none; }
                    .deviation-summary-row { flex-wrap: wrap; }
                    .deviation-stat { min-width: calc(50% - 4px); }
                }

                @media (max-width: 768px) {
                    .kpi-row { grid-template-columns: repeat(2, 1fr); }
                    .analysis-grid { grid-template-columns: 1fr; }
                    .deviation-stat { min-width: 100%; }
                }

                @media (max-width: 480px) {
                    .kpi-row { grid-template-columns: 1fr; }
                }

                /* Email Modal Styles */
                .stats-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    animation: fadeIn 0.2s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .stats-modal {
                    background: ${'#ffffff'};
                    border-radius: 16px;
                    width: 100%;
                    max-width: 420px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                    animation: slideUp 0.3s ease;
                    border: 1px solid ${'#e2e8f0'};
                }

                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }

                .stats-modal-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 20px 24px;
                    border-bottom: 1px solid ${'#e2e8f0'};
                    background: ${'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)'};
                    border-radius: 16px 16px 0 0;
                }

                .stats-modal-title {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 1rem;
                    font-weight: 700;
                    color: ${'#0f172a'};
                }

                .stats-modal-title svg {
                    color: #3b82f6;
                }

                .stats-modal-close {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: ${'#f1f5f9'};
                    border-radius: 8px;
                    cursor: pointer;
                    color: ${'#64748b'};
                    transition: all 0.2s ease;
                }

                .stats-modal-close:hover {
                    background: hsl(var(--danger) / 0.1);
                    color: hsl(var(--danger));
                }

                .stats-modal-body {
                    padding: 24px;
                    background: ${'#ffffff'};
                }

                .stats-modal-desc {
                    font-size: 0.85rem;
                    color: ${'#64748b'};
                    margin-bottom: 20px;
                    line-height: 1.5;
                }

                .stats-modal-desc strong {
                    color: ${'#0f172a'};
                }

                .stats-modal-label {
                    display: block;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: ${'#64748b'};
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 8px;
                }

                .stats-modal-input {
                    width: 100%;
                    padding: 12px 16px;
                    border: 2px solid ${'#e2e8f0'};
                    border-radius: 10px;
                    font-size: 0.9rem;
                    font-weight: 500;
                    color: ${'#0f172a'};
                    background: ${'#f8fafc'};
                    transition: all 0.2s ease;
                    box-sizing: border-box;
                }

                .stats-modal-input:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
                }

                .stats-modal-input::placeholder {
                    color: ${'#94a3b8'};
                }

                .stats-modal-footer {
                    display: flex;
                    gap: 12px;
                    padding: 20px 24px;
                    border-top: 1px solid ${'#e2e8f0'};
                    background: ${'#f8fafc'};
                    border-radius: 0 0 16px 16px;
                }

                .stats-modal-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    padding: 12px 20px;
                    border-radius: 10px;
                    font-size: 0.85rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    border: none;
                }

                .stats-modal-btn.secondary {
                    background: ${'#ffffff'};
                    color: ${'#64748b'};
                    border: 1px solid ${'#e2e8f0'};
                }

                .stats-modal-btn.secondary:hover:not(:disabled) {
                    background: ${'#f1f5f9'};
                    color: ${'#0f172a'};
                }

                .stats-modal-btn.primary {
                    background: linear-gradient(135deg, hsl(217 91% 60%) 0%, hsl(217 91% 50%) 100%);
                    color: white;
                    box-shadow: 0 4px 12px -4px hsl(217 91% 50% / 0.4);
                }

                .stats-modal-btn.primary:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 16px -4px hsl(217 91% 50% / 0.5);
                }

                .stats-modal-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .stats-modal-btn .animate-spin {
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}

export default DeviationAnalytics
