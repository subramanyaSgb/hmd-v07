import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Factory, Zap, Target, BarChart2, LayoutGrid, TrendingUp, Clock, Truck, AlertTriangle, CheckCircle2, Loader2, ArrowUp, ArrowDown, Calendar, ChevronDown, CalendarDays, FileDown, Mail, X, AreaChart, BarChart3, LineChart } from 'lucide-react'

import { api } from '../../utils/api'
import { useAuth } from '../../context/AuthContext'
import { useHeader } from '../../context/HeaderContext'
import { useNotification } from '../../context/NotificationContext'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Line, Area, Bar, PieChart, Pie, Cell, Brush } from 'recharts'

const COLORS = {
    primary: 'hsl(217 91% 60%)',
    accent: 'hsl(217 91% 60%)',
    success: 'hsl(142 71% 40%)',
    warning: 'hsl(38 92% 50%)',
    danger: 'hsl(0 84% 60%)',
    textMuted: 'hsl(215 16% 47%)'
}

const AdminStatistics = () => {
    const { user } = useAuth()
    const { setHeaderContent } = useHeader()
    const { showNotification } = useNotification()
    const [liveKPIs, setLiveKPIs] = useState({
        producers: { planned: 0, actual: 0, efficiency: 0, avg_cycle_time: 0, active_trips: 0 },
        consumers: { planned: 0, actual: 0, efficiency: 0, avg_cycle_time: 0, active_trips: 0 },
        is_admin: true
    })
    const [fleetMetrics, setFleetMetrics] = useState({ assigned: 0, operating: 0, maintenance: 0, total: 0, utilization_percent: 0 })
    const [nodePerformance, setNodePerformance] = useState([])
    const [trends, setTrends] = useState([])
    const [timeRange, setTimeRange] = useState('week')
    const [customRange, setCustomRange] = useState({
        start: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    })
    const [chartType, setChartType] = useState('area') 
    const [hiddenSeries, setHiddenSeries] = useState({})
    const [loading, setLoading] = useState(true)
    const [lastUpdated, setLastUpdated] = useState(new Date())
    const [isExporting, setIsExporting] = useState(false)
    const [isSendingEmail, setIsSendingEmail] = useState(false)
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [emailAddress, setEmailAddress] = useState('')

    const liveKPIsRef = useRef(liveKPIs)
    const fleetMetricsRef = useRef(fleetMetrics)
    const nodePerformanceRef = useRef(nodePerformance)
    const trendsRef = useRef(trends)
    const timeRangeRef = useRef(timeRange)

    useEffect(() => {
        liveKPIsRef.current = liveKPIs
        fleetMetricsRef.current = fleetMetrics
        nodePerformanceRef.current = nodePerformance
        trendsRef.current = trends
        timeRangeRef.current = timeRange
    }, [liveKPIs, fleetMetrics, nodePerformance, trends, timeRange])

    const handleExportPDF = useCallback(async () => {
        setIsExporting(true)
        try {
            const doc = new jsPDF('p', 'mm', 'a4')
            const pageWidth = doc.internal.pageSize.getWidth()
            const pageHeight = doc.internal.pageSize.getHeight()
            const margin = 14
            const bottomMargin = 28
            let yPos = 20

            const tableMargin = { left: margin, right: margin, bottom: bottomMargin }

            doc.setFillColor(23, 37, 84)
            doc.rect(0, 0, pageWidth, 32, 'F')

            doc.setFontSize(16)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(255, 255, 255)
            doc.text('DEEVIA', margin, 14)

            doc.setFontSize(5)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(150, 180, 255)
            doc.text('DEEP VISION ANALYTICS', margin, 19)

            doc.setFontSize(13)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(255, 255, 255)
            doc.text('Statistics Report', pageWidth / 2, 12, { align: 'center' })

            doc.setFontSize(8)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(200, 220, 255)
            doc.text(`Period: ${timeRangeRef.current.charAt(0).toUpperCase() + timeRangeRef.current.slice(1)}`, pageWidth / 2, 19, { align: 'center' })

            doc.setFontSize(7)
            doc.setTextColor(180, 200, 255)
            const reportDate = new Date().toLocaleDateString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric'
            })
            doc.text(`Date: ${reportDate}`, pageWidth - margin, 14, { align: 'right' })
            doc.setFontSize(5)
            doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 20, { align: 'right' })

            yPos = 38

            doc.setFontSize(9)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(23, 37, 84)
            doc.text('SUMMARY METRICS', margin, yPos)
            yPos += 4

            const kpiData = liveKPIsRef.current
            const summaryData = [
                ['Lifetime Production', `${(kpiData.producers?.lifetime_total || 0).toLocaleString()} MT`, 'Lifetime Consumption', `${(kpiData.consumers?.lifetime_total || 0).toLocaleString()} MT`],
                ['Monthly Planned (Prod)', `${(kpiData.producers?.monthly_planned || 0).toLocaleString()} MT`, 'Monthly Planned (Cons)', `${(kpiData.consumers?.monthly_planned || 0).toLocaleString()} MT`],
                ['Monthly Actual (Prod)', `${(kpiData.producers?.monthly_actual || 0).toLocaleString()} MT`, 'Monthly Actual (Cons)', `${(kpiData.consumers?.monthly_actual || 0).toLocaleString()} MT`],
                ['Production Efficiency', `${kpiData.producers?.efficiency || 0}%`, 'Consumption Efficiency', `${kpiData.consumers?.efficiency || 0}%`]
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
                margin: tableMargin,
                tableWidth: 'auto'
            })

            yPos = doc.lastAutoTable.finalY + 8

            const fleetData = fleetMetricsRef.current
            doc.setFontSize(9)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(23, 37, 84)
            doc.text('FLEET STATUS', margin, yPos)
            yPos += 4

            const fleetTableData = [
                ['Assigned', String(fleetData.assigned || 0)],
                ['Available', String(fleetData.operating || 0)],
                ['Maintenance', String(fleetData.maintenance || 0)],
                ['Total', String(fleetData.total || 0)],
                ['Utilization', `${fleetData.utilization_percent || 0}%`]
            ]

            autoTable(doc, {
                startY: yPos,
                head: [['Status', 'Count']],
                body: fleetTableData,
                theme: 'striped',
                headStyles: { fillColor: [245, 158, 11], textColor: 255, fontStyle: 'bold', fontSize: 7 },
                styles: { fontSize: 7, cellPadding: 2 },
                columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 30 } },
                margin: tableMargin,
                tableWidth: 80
            })

            yPos = doc.lastAutoTable.finalY + 8

            const nodes = nodePerformanceRef.current
            const producers = nodes.filter(n => n.role === 'producer')
            const consumers = nodes.filter(n => n.role === 'consumer')

            if (producers.length > 0) {
                doc.setFontSize(9)
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(23, 37, 84)
                doc.text('PRODUCER PERFORMANCE', margin, yPos)
                yPos += 4

                const prodTableData = producers.map(p => [
                    p.user_id || '-',
                    `${(p.planned || 0).toLocaleString()} MT`,
                    `${(p.actual || 0).toLocaleString()} MT`,
                    `${p.fulfillment_rate || 0}%`
                ])

                autoTable(doc, {
                    startY: yPos,
                    head: [['Node', 'Planned', 'Actual', 'Rate']],
                    body: prodTableData,
                    theme: 'striped',
                    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 7 },
                    styles: { fontSize: 7, cellPadding: 2 },
                    margin: tableMargin
                })

                yPos = doc.lastAutoTable.finalY + 8
            }

            if (consumers.length > 0) {
                
                if (yPos > 220) {
                    doc.addPage()
                    yPos = 20
                }

                doc.setFontSize(9)
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(23, 37, 84)
                doc.text('CONSUMER PERFORMANCE', margin, yPos)
                yPos += 4

                const consTableData = consumers.map(c => [
                    c.user_id || '-',
                    `${(c.planned || 0).toLocaleString()} MT`,
                    `${(c.actual || 0).toLocaleString()} MT`,
                    `${c.fulfillment_rate || 0}%`
                ])

                autoTable(doc, {
                    startY: yPos,
                    head: [['Node', 'Planned', 'Actual', 'Rate']],
                    body: consTableData,
                    theme: 'striped',
                    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', fontSize: 7 },
                    styles: { fontSize: 7, cellPadding: 2 },
                    margin: tableMargin
                })
            }

            const pageCount = doc.internal.getNumberOfPages()
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i)

                const footerY = pageHeight - 8

                doc.setFillColor(248, 250, 252)
                doc.rect(0, pageHeight - 18, pageWidth, 18, 'F')

                doc.setDrawColor(23, 37, 84)
                doc.setLineWidth(0.5)
                doc.line(0, pageHeight - 18, pageWidth, pageHeight - 18)

                doc.setFontSize(8)
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(23, 37, 84)
                doc.text('DEEVIA SOFTWARE INDIA PVT LTD', pageWidth / 2, footerY - 4, { align: 'center' })

                doc.setFontSize(6)
                doc.setFont('helvetica', 'normal')
                doc.setTextColor(100, 100, 100)
                doc.text('Advanced Logistics Control & Operational Intelligence System', pageWidth / 2, footerY, { align: 'center' })

                doc.setFontSize(7)
                doc.setTextColor(80, 80, 80)
                doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, footerY - 2, { align: 'right' })
            }

            const fileName = `Statistics_Report_${new Date().toISOString().split('T')[0]}.pdf`
            doc.save(fileName)
        } catch (error) {
            console.error('PDF export error:', error)
        } finally {
            setIsExporting(false)
        }
    }, [])

    const openEmailModal = useCallback(() => {
        setEmailAddress(user?.email || '')
        setShowEmailModal(true)
    }, [user])

    const handleSendEmail = useCallback(async () => {
        const targetEmail = emailAddress.trim()
        if (!targetEmail || !targetEmail.includes('@')) {
            showNotification('warning', 'Please enter a valid email address')
            return
        }

        setIsSendingEmail(true)
        try {
            const payload = {
                email: targetEmail,
                range_type: timeRangeRef.current,
                ...(timeRangeRef.current === 'custom' && {
                    start_date: customRange.start,
                    end_date: customRange.end
                })
            }

            await api.post('/api/statistics/email', payload)
            showNotification('success', `Report sent successfully to ${targetEmail}`)
            setShowEmailModal(false)
            setEmailAddress('')
        } catch (error) {
            console.error('Email report error:', error)
            showNotification('error', 'Failed to send email. Please try again.')
        } finally {
            setIsSendingEmail(false)
        }
    }, [customRange, emailAddress, showNotification])

    const fetchData = useCallback(async () => {
        if (!user) return

        const isAdmin = user.role === 'admin' || user.role === 'trs' || user.role === 'ppc'
        const hasValidUserId = user.user_id && user.user_id !== 'null'

        if (!isAdmin && !hasValidUserId) return

        try {
            const userParam = hasValidUserId ? `user_id=${user.user_id}&` : ''
            let rangeParams = `range_type=${timeRange}`
            if (timeRange === 'custom' && customRange.start && customRange.end) {
                rangeParams += `&start_date=${customRange.start}&end_date=${customRange.end}`
            }

            const [trendData, summaryData, nodePerfData, fleetData] = await Promise.all([
                api.get(`/api/statistics/trends?${userParam}role=${user.role}&${rangeParams}`),
                api.get(`/api/statistics/summary?${userParam}role=${user.role}&${rangeParams}`),
                api.get(`/api/statistics/nodes-performance-summary?${rangeParams}`),
                api.get('/api/statistics/fleet-utilization')
            ])
            setTrends(trendData)
            setLiveKPIs(summaryData)
            setNodePerformance(nodePerfData)
            setFleetMetrics(fleetData)
            setLastUpdated(new Date())
        } catch (err) {
            console.error("Statistics sync error:", err)
        } finally {
            setLoading(false)
        }
    }, [user, timeRange, customRange])

    useEffect(() => {
        fetchData()
        const interval = setInterval(fetchData, 10000)
        return () => clearInterval(interval)
    }, [fetchData])

    useEffect(() => {
        setHeaderContent({
            right: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginRight: '12px' }}>
                    <button onClick={openEmailModal} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'linear-gradient(135deg, hsl(217 91% 60%) 0%, hsl(217 91% 50%) 100%)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s ease' }} title="Email Statistics Report">
                        <Mail size={14} />
                        Email
                    </button>
                    <button
                        onClick={handleExportPDF}
                        disabled={isExporting}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            background: 'hsl(var(--primary))',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            cursor: isExporting ? 'wait' : 'pointer',
                            opacity: isExporting ? 0.7 : 1,
                            transition: 'all 0.2s ease'
                        }}
                        title="Export Statistics to PDF"
                    >
                        <FileDown size={14} />
                        {isExporting ? 'Exporting...' : 'Export PDF'}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div className="pulse-dot-green"></div>
                        <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'hsl(var(--success))', letterSpacing: '0.05em' }}>LIVE</span>
                    </div>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))' }}>
                        {lastUpdated.toLocaleTimeString()}
                    </span>
                </div>
            )
        })

        return () => setHeaderContent({ left: null, right: null })
    }, [lastUpdated, setHeaderContent, handleExportPDF, isExporting, openEmailModal])

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Loader2 className="animate-spin" size={40} color="hsl(var(--primary))" />
            </div>
        )
    }

    const producers = nodePerformance.filter(n => n.role === 'producer')
    const consumers = nodePerformance.filter(n => n.role === 'consumer')

    const fleetData = [
        { name: 'Assigned', value: fleetMetrics.assigned, color: COLORS.primary },
        { name: 'Available', value: fleetMetrics.operating, color: COLORS.success },
        { name: 'Maintenance', value: fleetMetrics.maintenance, color: COLORS.warning }
    ].filter(d => d.value > 0)

    const MiniSparkline = ({ data, dataKey, color, height = 30 }) => {
        if (!data || data.length < 2) return null;
        return (
            <div style={{ width: '60px', height: `${height}px` }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        );
    };

    const KPICard = ({ icon: Icon, label, value, unit, efficiency, trend, color, sparklineData, sparklineKey }) => {
        const trendUp = trend && trend > 0
        return (
            <div className="kpi-card" style={{ borderLeft: `3px solid ${color}` }}>
                <div className="kpi-top">
                    <div className="kpi-icon" style={{ backgroundColor: `${color.replace(')', ' / 0.12)')}`, color }}>
                        <Icon size={14} />
                    </div>
                    <span className="kpi-label">{label}</span>
                    {trend !== undefined && trend !== null && (
                        <div className="kpi-trend" style={{ color: trendUp ? COLORS.success : COLORS.danger }}>
                            {trendUp ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                            <span>{Math.abs(trend)}%</span>
                        </div>
                    )}
                </div>
                <div className="kpi-bottom">
                    <span className="kpi-value">{value.toLocaleString()}<small>{unit}</small></span>
                    {sparklineData && sparklineKey && (
                        <MiniSparkline data={sparklineData} dataKey={sparklineKey} color={color} />
                    )}
                    {efficiency !== undefined && efficiency !== null && !sparklineData && (
                        <>
                            <div className="kpi-bar">
                                <div className="fill" style={{ width: `${Math.min(efficiency, 100)}%`, backgroundColor: color }}></div>
                            </div>
                            <span className="kpi-eff">{efficiency.toFixed(0)}%</span>
                        </>
                    )}
                </div>
            </div>
        )
    }

    const DateRangePicker = ({ range, setRange }) => {
        const [isOpen, setIsOpen] = useState(false)
        const dropdownRef = React.useRef(null)

        useEffect(() => {
            const handleClickOutside = (event) => {
                if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                    setIsOpen(false)
                }
            }
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }, [])

        const presets = [
            { label: 'Today', days: 0 },
            { label: 'Last 7 Days', days: 7 },
            { label: 'Last 30 Days', days: 30 },
            { label: 'Current Month', type: 'month' }
        ]

        const applyPreset = (preset) => {
            const today = new Date()
            let start = new Date()
            if (preset.type === 'month') {
                start = new Date(today.getFullYear(), today.month, 1)
            } else {
                start.setDate(today.getDate() - preset.days)
            }

            setRange({
                start: start.toISOString().split('T')[0],
                end: today.toISOString().split('T')[0]
            })
            setIsOpen(false)
        }

        return (
            <div className="date-picker-container" ref={dropdownRef}>
                <button className={`picker-trigger ${isOpen ? 'active' : ''}`} onClick={() => setIsOpen(!isOpen)}>
                    <Calendar size={12} />
                    <span>{range.start} to {range.end}</span>
                    <ChevronDown size={10} className={`arrow ${isOpen ? 'up' : ''}`} />
                </button>

                {isOpen && (
                    <div className="picker-dropdown">
                        <div className="dropdown-section">
                            <span className="section-title"><CalendarDays size={10} /> Presets</span>
                            <div className="presets-grid">
                                {presets.map(p => (
                                    <button key={p.label} onClick={() => applyPreset(p)} className="preset-btn">
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="dropdown-section">
                            <span className="section-title">Custom Range</span>
                            <div className="custom-inputs">
                                <div className="input-group">
                                    <label>Start</label>
                                    <input type="date" value={range.start} onChange={(e) => setRange(prev => ({ ...prev, start: e.target.value }))} />
                                </div>
                                <div className="input-group">
                                    <label>End</label>
                                    <input type="date" value={range.end} onChange={(e) => setRange(prev => ({ ...prev, end: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    const PerformanceTable = ({ data }) => {
        const [sortConfig, setSortConfig] = useState({ key: 'fulfillment_rate', direction: 'desc' })

        const handleSort = (key) => {
            let direction = 'desc'
            if (sortConfig.key === key && sortConfig.direction === 'desc') {
                direction = 'asc'
            }
            setSortConfig({ key, direction })
        }

        const sortedData = useMemo(() => {
            let sortableItems = [...data]
            if (sortConfig.key !== null) {
                sortableItems.sort((a, b) => {
                    let aValue = a[sortConfig.key]
                    let bValue = b[sortConfig.key]

                    if (typeof aValue === 'string') aValue = aValue.toLowerCase()
                    if (typeof bValue === 'string') bValue = bValue.toLowerCase()

                    if (aValue < bValue) {
                        return sortConfig.direction === 'asc' ? -1 : 1
                    }
                    if (aValue > bValue) {
                        return sortConfig.direction === 'asc' ? 1 : -1
                    }
                    return 0
                })
            }
            return sortableItems
        }, [data, sortConfig])

        const getSortIcon = (key) => {
            if (sortConfig.key !== key) return <ArrowDown size={10} style={{ opacity: 0.2 }} />
            return sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />
        }

        const SortableHeader = ({ label, sortKey, style }) => (
            <th onClick={() => handleSort(sortKey)} style={{ cursor: 'pointer', ...style }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {label}
                    {getSortIcon(sortKey)}
                </div>
            </th>
        )

        return (
            <table className="perf-table">
                <thead>
                    <tr>
                        <SortableHeader label="Unit" sortKey="user_id" />
                        <SortableHeader label="Planned" sortKey="planned" />
                        <SortableHeader label="Actual" sortKey="actual" />
                        <SortableHeader label="Rate" sortKey="fulfillment_rate" />
                        <SortableHeader label="Status" sortKey="fulfillment_rate" />
                        <SortableHeader label="Progress" sortKey="fulfillment_rate" style={{ width: '100px' }} />
                    </tr>
                </thead>
                <tbody>
                    {sortedData.map(node => {
                        
                        let statusColor = COLORS.success
                        let statusBg = 'hsl(142 71% 40% / 0.12)'
                        let statusText = 'On Track'
                        let statusIcon = <CheckCircle2 size={10} />
                        let rowClass = ''

                        if (node.fulfillment_rate < 10) {
                            statusColor = COLORS.danger
                            statusBg = 'hsl(0 84% 60% / 0.12)'
                            statusText = 'Critical'
                            statusIcon = <AlertTriangle size={10} />
                            rowClass = 'alert-row'
                        } else if (node.fulfillment_rate <= 50) {
                            statusColor = COLORS.warning
                            statusBg = 'hsl(38 92% 50% / 0.12)'
                            statusText = 'Normal'
                            statusIcon = <Clock size={10} /> 
                        }

                        return (
                            <tr key={node.user_id} className={rowClass}>
                                <td className="unit-id">{node.user_id}</td>
                                <td>{node.planned?.toLocaleString()}</td>
                                <td style={{ color: node.actual >= node.planned ? COLORS.success : 'inherit', fontWeight: 700 }}>
                                    {node.actual?.toLocaleString()}
                                </td>
                                <td>
                                    <span className="rate-badge" style={{ background: statusBg, color: statusColor }}>
                                        {node.fulfillment_rate}%
                                    </span>
                                </td>
                                <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span className="status-sm" style={{ background: statusBg, color: statusColor }}>
                                            {statusIcon}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: statusColor }}>
                                            {statusText}
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    <div className="progress-bar">
                                        <div className="fill" style={{ width: `${Math.min(node.fulfillment_rate, 100)}%`, background: statusColor }}></div>
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        )
    }

    return (
        <div className="stats-page">
            <div className="kpi-row">
                <KPICard icon={Factory} label="Total Production (Lifetime)" value={liveKPIs.producers?.lifetime_total || 0} unit="MT" color={COLORS.primary} sparklineData={trends.slice(-7)} sparklineKey="production" />
                <KPICard icon={Zap} label="Total Consumption (Lifetime)" value={liveKPIs.consumers?.lifetime_total || 0} unit="MT" color={COLORS.success} sparklineData={trends.slice(-7)} sparklineKey="consumption" />
                <KPICard icon={Target} label="Production Target (Month)" value={liveKPIs.producers?.monthly_actual || 0} unit={` / ${(liveKPIs.producers?.monthly_planned ? (liveKPIs.producers?.monthly_planned / 1000).toFixed(1) + 'k' : '0')} MT`} efficiency={liveKPIs.producers?.monthly_planned> 0 ? (liveKPIs.producers?.monthly_actual / liveKPIs.producers?.monthly_planned) * 100 : 0} color={COLORS.warning} />
                <KPICard icon={Target} label="Consumption Target (Month)" value={liveKPIs.consumers?.monthly_actual || 0} unit={` / ${(liveKPIs.consumers?.monthly_planned ? (liveKPIs.consumers?.monthly_planned / 1000).toFixed(1) + 'k' : '0')} MT`} efficiency={liveKPIs.consumers?.monthly_planned> 0 ? (liveKPIs.consumers?.monthly_actual / liveKPIs.consumers?.monthly_planned) * 100 : 0} color={COLORS.accent} />
            </div>
            <div className="main-grid">
                <div className="left-column">
                    <div className="card trends-card">
                        <div className="card-header">
                            <div className="title"><TrendingUp size={14} /><span>Performance Trends</span></div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <div className="chart-type-btns">
                                    <button className={chartType === 'area' ? 'active' : ''} onClick={() => setChartType('area')} title="Area Chart">
                                        <AreaChart size={12} />
                                    </button>
                                    <button className={chartType === 'bar' ? 'active' : ''} onClick={() => setChartType('bar')} title="Bar Chart">
                                        <BarChart3 size={12} />
                                    </button>
                                    <button className={chartType === 'line' ? 'active' : ''} onClick={() => setChartType('line')} title="Line Chart">
                                        <LineChart size={12} />
                                    </button>
                                    <button className={chartType === 'stacked' ? 'active' : ''} onClick={() => setChartType('stacked')} title="Stacked Bar">
                                        <BarChart2 size={12} />
                                    </button>
                                </div>
                                <div className="time-btns">
                                    {['day', 'week', 'month', 'year', 'custom'].map(r => (
                                        <button key={r} className={timeRange === r ? 'active' : ''} onClick={() => setTimeRange(r)}>
                                            {r.charAt(0).toUpperCase() + r.slice(1)}
                                        </button>
                                    ))}
                                </div>
                                {timeRange === 'custom' && (
                                    <DateRangePicker range={customRange} setRange={setCustomRange} />
                                )}

                            </div>
                        </div>
                        <div className="card-body chart-body" style={{ height: '300px', minHeight: '300px' }}>
                            {trends && trends.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={trends} margin={{ top: 5, right: 40, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                                                <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="consGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3} />
                                                <stop offset="95%" stopColor={COLORS.success} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.04)" />
                                        <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fill: COLORS.textMuted, fontSize: 9 }} />
                                        <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: COLORS.textMuted, fontSize: 9 }} />
                                        <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: COLORS.warning, fontSize: 9 }} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                                        <Tooltip
                                            content={({ active, payload, label }) => {
                                                if (!active || !payload || !payload.length) return null;
                                                const dataIndex = trends.findIndex(t => t.displayDate === label);
                                                const prevData = dataIndex > 0 ? trends[dataIndex - 1] : null;

                                                return (
                                                    <div className="custom-tooltip">
                                                        <div className="tooltip-header">{label}</div>
                                                        {payload.map((entry, idx) => {
                                                            const prevValue = prevData ? prevData[entry.dataKey] : null;
                                                            const change = prevValue ? ((entry.value - prevValue) / prevValue * 100).toFixed(1) : null;
                                                            const isUp = change && parseFloat(change) > 0;

                                                            const isEfficiency = entry.dataKey === 'efficiency';
                                                            const unit = isEfficiency ? '%' : ' MT';

                                                            return (
                                                                <div key={idx} className="tooltip-row">
                                                                    <span className="tooltip-dot" style={{ background: entry.color }}></span>
                                                                    <span className="tooltip-label">{entry.name}:</span>
                                                                    <span className="tooltip-value">{entry.value?.toLocaleString()}{unit}</span>
                                                                    {change && !isEfficiency && (
                                                                        <span className={`tooltip-change ${isUp ? 'up' : 'down'}`}>
                                                                            {isUp ? '↑' : '↓'} {Math.abs(change)}%
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Legend
                                            wrapperStyle={{ fontSize: '9px', paddingTop: '4px' }}
                                            onClick={(e) => {
                                                const key = e.dataKey;
                                                setHiddenSeries(prev => ({ ...prev, [key]: !prev[key] }));
                                            }}
                                            formatter={(value, entry) => (
                                                <span style={{ color: hiddenSeries[entry.dataKey] ? '#ccc' : entry.color, cursor: 'pointer' }}>
                                                    {value}
                                                </span>
                                            )}
                                        />
                                        {chartType === 'area' && (
                                            <>
                                                {!hiddenSeries.production && (
                                                    <Area yAxisId="left" type="monotone" dataKey="production" fill="url(#prodGrad)" stroke={COLORS.primary} strokeWidth={2} name="Production" activeDot={{ r: 4 }} />
                                                )}
                                                {!hiddenSeries.consumption && (
                                                    <Area yAxisId="left" type="monotone" dataKey="consumption" fill="url(#consGrad)" stroke={COLORS.success} strokeWidth={2} name="Consumption" activeDot={{ r: 4 }} />
                                                )}
                                            </>
                                        )}

                                        {chartType === 'bar' && (
                                            <>
                                                {!hiddenSeries.production && (
                                                    <Bar yAxisId="left" dataKey="production" fill={COLORS.primary} name="Production" radius={[4, 4, 0, 0]} />
                                                )}
                                                {!hiddenSeries.consumption && (
                                                    <Bar yAxisId="left" dataKey="consumption" fill={COLORS.success} name="Consumption" radius={[4, 4, 0, 0]} />
                                                )}
                                            </>
                                        )}

                                        {chartType === 'line' && (
                                            <>
                                                {!hiddenSeries.production && (
                                                    <Line yAxisId="left" type="monotone" dataKey="production" stroke={COLORS.primary} strokeWidth={2} name="Production" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                                )}
                                                {!hiddenSeries.consumption && (
                                                    <Line yAxisId="left" type="monotone" dataKey="consumption" stroke={COLORS.success} strokeWidth={2} name="Consumption" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                                )}
                                            </>
                                        )}

                                        {chartType === 'stacked' && (
                                            <>
                                                {!hiddenSeries.production && (
                                                    <Bar yAxisId="left" dataKey="production" stackId="stack" fill={COLORS.primary} name="Production" />
                                                )}
                                                {!hiddenSeries.consumption && (
                                                    <Bar yAxisId="left" dataKey="consumption" stackId="stack" fill={COLORS.success} name="Consumption" />
                                                )}
                                            </>
                                        )}
                                        {!hiddenSeries.plannedProduction && (
                                            <Line yAxisId="left" type="monotone" dataKey="plannedProduction" stroke={COLORS.primary} strokeWidth={1.5} strokeDasharray="5 5" name="Planned Prod" dot={false} opacity={0.6} />
                                        )}
                                        {!hiddenSeries.plannedConsumption && (
                                            <Line yAxisId="left" type="monotone" dataKey="plannedConsumption" stroke={COLORS.success} strokeWidth={1.5} strokeDasharray="5 5" name="Planned Cons" dot={false} opacity={0.6} />
                                        )}
                                        {!hiddenSeries.movingAvg && timeRange !== 'day' && (
                                            <Line yAxisId="left" type="monotone" dataKey="movingAvg" stroke="#8b5cf6" strokeWidth={2} name="7-Day Avg" dot={false} connectNulls />
                                        )}
                                        {!hiddenSeries.efficiency && (
                                            <Line yAxisId="right" type="monotone" dataKey="efficiency" stroke={COLORS.warning} strokeWidth={2} strokeDasharray="3 3" name="Efficiency %" dot={{ r: 2 }} />
                                        )}
                                        {timeRange !== 'day' && trends.length > 7 && (
                                            <Brush
                                                dataKey="displayDate"
                                                height={20}
                                                stroke={COLORS.primary}
                                                fill="hsl(var(--main-bg))"
                                                tickFormatter={(v) => v}
                                            />
                                        )}
                                    </ComposedChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="no-data"><BarChart2 size={28} /><span>No data</span></div>
                            )}
                        </div>
                    </div>
                    <div className="bottom-charts">
                        <div className="card fleet-card">
                            <div className="card-header">
                                <div className="title"><LayoutGrid size={14} /><span>Fleet Status</span></div>
                            </div>
                            <div className="card-body fleet-body">
                                {fleetMetrics.total > 0 ? (
                                    <>
                                        <div className="pie-container" style={{ height: '200px', minHeight: '200px', width: '100%' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={fleetData} cx="50%" cy="50%" innerRadius={35} outerRadius={50} paddingAngle={4} dataKey="value" stroke="none">
                                                        {fleetData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="fleet-stats">
                                            <div className="stat-item"><div className="dot" style={{ background: COLORS.primary }}></div><span>Assigned</span><strong>{fleetMetrics.assigned}</strong></div>
                                            <div className="stat-item"><div className="dot" style={{ background: COLORS.success }}></div><span>Available</span><strong>{fleetMetrics.operating}</strong></div>
                                            <div className="stat-item"><div className="dot" style={{ background: COLORS.warning }}></div><span>Maintenance</span><strong>{fleetMetrics.maintenance}</strong></div>
                                            <div className="stat-item total"><span>Total</span><strong>{fleetMetrics.total}</strong></div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="no-data"><Truck size={28} /><span>No fleet data</span></div>
                                )}
                            </div>
                        </div>
                        <div className="card tonnage-card">
                            <div className="card-header">
                                <div className="title"><BarChart2 size={14} /><span>Tonnage Balance</span></div>
                            </div>
                            <div className="card-body tonnage-body">
                                <div className="tonnage-item prod">
                                    <div className="tonnage-row">
                                        <span className="tonnage-label">PRODUCTION</span>
                                        <span className="tonnage-pct">{liveKPIs.producers?.efficiency || 0}%</span>
                                    </div>
                                    <div className="tonnage-value">{liveKPIs.producers?.actual?.toLocaleString() || 0} <small>MT</small></div>
                                    <div className="tonnage-bar"><div className="fill" style={{ width: `${Math.min(liveKPIs.producers?.planned > 0 ? (liveKPIs.producers?.actual / liveKPIs.producers?.planned) * 100 : 0, 100)}%` }}></div></div>
                                    <div className="tonnage-plan">Plan: {liveKPIs.producers?.planned?.toLocaleString() || 0} MT</div>
                                </div>
                                <div className="tonnage-item cons">
                                    <div className="tonnage-row">
                                        <span className="tonnage-label">CONSUMPTION</span>
                                        <span className="tonnage-pct">{liveKPIs.consumers?.efficiency || 0}%</span>
                                    </div>
                                    <div className="tonnage-value">{liveKPIs.consumers?.actual?.toLocaleString() || 0} <small>MT</small></div>
                                    <div className="tonnage-bar"><div className="fill" style={{ width: `${Math.min(liveKPIs.consumers?.planned > 0 ? (liveKPIs.consumers?.actual / liveKPIs.consumers?.planned) * 100 : 0, 100)}%` }}></div></div>
                                    <div className="tonnage-plan">Plan: {liveKPIs.consumers?.planned?.toLocaleString() || 0} MT</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="right-column">
                    <div className="card perf-card">
                        <div className="card-header">
                            <div className="title"><Factory size={14} /><span>Producers ({producers.length})</span></div>
                        </div>
                        <div className="card-body perf-body">
                            <PerformanceTable data={producers} />
                        </div>
                    </div>
                    <div className="card perf-card">
                        <div className="card-header">
                            <div className="title"><Zap size={14} /><span>Consumers ({consumers.length})</span></div>
                        </div>
                        <div className="card-body perf-body">
                            <PerformanceTable data={consumers} />
                        </div>
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
                                The <strong>Performance Dashboard</strong> report for <strong>{timeRange}</strong> period will be generated and sent to your email.
                            </p>
                            <label className="stats-modal-label">Email Address</label>
                            <input type="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="Enter email address..." className="stats-modal-input" autoFocus />
                        </div>
                        <div className="stats-modal-footer">
                            <button onClick={() => { setShowEmailModal(false); setEmailAddress(''); }} className="stats-modal-btn secondary" disabled={isSendingEmail}>
                                Cancel
                            </button>
                            <button onClick={handleSendEmail} className="stats-modal-btn primary" disabled={isSendingEmail || !emailAddress.trim()}>
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
                .stats-page {
                    height: 100%;
                    display: grid;
                    grid-template-rows: auto 1fr;
                    gap: 10px;
                    padding: 12px;
                    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
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
                    grid-template-columns: repeat(4, 1fr);
                    gap: 10px;
                }

                .kpi-card {
                    background: white;
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 8px;
                    padding: 8px 10px;
                }

                .kpi-top {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-bottom: 6px;
                }

                .kpi-icon {
                    width: 24px;
                    height: 24px;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .kpi-label {
                    font-size: 0.75rem;
                    font-weight: 800;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    flex: 1;
                }

                .kpi-trend {
                    display: flex;
                    align-items: center;
                    gap: 2px;
                    font-size: 0.7rem;
                    font-weight: 800;
                }

                .kpi-bottom {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .kpi-value {
                    font-size: 1.1rem;
                    font-weight: 900;
                    font-family: 'Space Grotesk', sans-serif;
                    min-width: 70px;
                }

                .kpi-value small {
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    margin-left: 2px;
                }

                .kpi-bar {
                    flex: 1;
                    height: 4px;
                    background: hsl(var(--border-color) / 0.3);
                    border-radius: 2px;
                    overflow: hidden;
                }

                .kpi-bar .fill {
                    height: 100%;
                    border-radius: 2px;
                    transition: width 0.5s ease;
                }

                .kpi-eff {
                    font-size: 0.7rem;
                    font-weight: 800;
                    color: hsl(var(--text-muted));
                    min-width: 32px;
                    text-align: right;
                }

                /* Main Grid - 2 Column Layout */
                .main-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    min-height: 0;
                }

                .left-column {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    min-height: 0;
                }

                .left-column .trends-card {
                    flex: 1;
                    min-height: 0;
                }

                .bottom-charts {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    flex-shrink: 0;
                }

                .right-column {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    min-height: 0;
                }

                .right-column .perf-card {
                    flex: 1;
                    min-height: 0;
                }

                .card {
                    background: white;
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 8px;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }

                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 10px;
                    border-bottom: 1px solid hsl(var(--border-color) / 0.5);
                    flex-shrink: 0;
                }

                .card-header .title {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.8rem;
                    font-weight: 800;
                    color: hsl(var(--primary));
                }

                .time-btns, .tab-btns, .chart-type-btns {
                    display: flex;
                    gap: 2px;
                    background: hsl(var(--main-bg));
                    padding: 2px;
                    border-radius: 4px;
                }

                .time-btns button, .tab-btns button, .chart-type-btns button {
                    border: none;
                    background: transparent;
                    padding: 4px 10px;
                    border-radius: 4px;
                    font-size: 0.65rem;
                    font-weight: 800;
                    color: hsl(var(--text-muted));
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .chart-type-btns button {
                    padding: 4px 6px;
                }

                .time-btns button.active, .tab-btns button.active, .chart-type-btns button.active {
                    background: hsl(var(--primary));
                    color: white;
                }

                .time-btns button:hover:not(.active), .chart-type-btns button:hover:not(.active) {
                    background: hsl(var(--border-color) / 0.3);
                }

                .export-btn {
                    border: none;
                    background: hsl(var(--main-bg));
                    padding: 6px;
                    border-radius: 4px;
                    cursor: pointer;
                    color: hsl(var(--text-muted));
                    display: flex;
                    align-items: center;
                    transition: all 0.2s ease;
                }

                .export-btn:hover {
                    background: hsl(var(--primary));
                    color: white;
                }

                /* Custom Tooltip */
                .custom-tooltip {
                    background: white;
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 8px;
                    padding: 10px 12px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    font-size: 11px;
                }

                .tooltip-header {
                    font-weight: 800;
                    font-size: 10px;
                    color: hsl(var(--text-muted));
                    margin-bottom: 6px;
                    padding-bottom: 4px;
                    border-bottom: 1px solid hsl(var(--border-color) / 0.5);
                }

                .tooltip-row {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 3px 0;
                }

                .tooltip-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 2px;
                }

                .tooltip-label {
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                }

                .tooltip-value {
                    font-weight: 800;
                    color: hsl(var(--text-dark));
                }

                .tooltip-change {
                    font-size: 9px;
                    font-weight: 800;
                    padding: 2px 4px;
                    border-radius: 3px;
                    margin-left: auto;
                }

                .tooltip-change.up {
                    background: hsl(142 71% 40% / 0.12);
                    color: hsl(142 71% 40%);
                }

                .tooltip-change.down {
                    background: hsl(0 84% 60% / 0.12);
                    color: hsl(0 84% 60%);
                }

                .card-body {
                    flex: 1;
                    min-height: 0;
                    overflow: hidden;
                }

                .chart-body {
                    padding: 8px;
                    height: 300px;
                    min-height: 300px;
                }

                .no-data {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: hsl(var(--text-muted));
                    font-size: 0.75rem;
                    gap: 8px;
                    opacity: 0.5;
                }

                /* Fleet Card */
                .fleet-body {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 10px;
                    gap: 8px;
                    height: 100%;
                }

                .pie-container {
                    flex: 1;
                    width: 100%;
                    min-height: 200px;
                    height: 200px;
                }

                .fleet-stats {
                    width: 100%;
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 4px;
                }

                .stat-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 2px;
                    font-size: 0.7rem;
                    color: hsl(var(--text-muted));
                    padding: 6px 4px;
                    background: hsl(var(--main-bg) / 0.5);
                    border-radius: 4px;
                }

                .stat-item .dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 2px;
                }

                .stat-item span { font-weight: 600; font-size: 0.6rem; }
                .stat-item strong { font-weight: 900; color: hsl(var(--primary)); font-size: 0.85rem; }

                .stat-item.total {
                    background: hsl(var(--primary) / 0.08);
                    border: 1px solid hsl(var(--primary) / 0.15);
                }

                /* Tonnage Card */
                .tonnage-body {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    padding: 10px;
                    height: 100%;
                    justify-content: center;
                }

                .tonnage-item {
                    padding: 10px 12px;
                    border-radius: 6px;
                    border-left: 3px solid;
                }

                .tonnage-item.prod {
                    background: hsl(217 91% 60% / 0.06);
                    border-color: ${COLORS.primary};
                }

                .tonnage-item.cons {
                    background: hsl(142 71% 40% / 0.06);
                    border-color: ${COLORS.success};
                }

                .tonnage-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 4px;
                }

                .tonnage-label {
                    font-size: 0.65rem;
                    font-weight: 900;
                    letter-spacing: 0.05em;
                }

                .tonnage-item.prod .tonnage-label, .tonnage-item.prod .tonnage-pct { color: ${COLORS.primary}; }
                .tonnage-item.cons .tonnage-label, .tonnage-item.cons .tonnage-pct { color: ${COLORS.success}; }

                .tonnage-pct {
                    font-size: 0.8rem;
                    font-weight: 900;
                }

                .tonnage-value {
                    font-size: 1.1rem;
                    font-weight: 900;
                    margin-bottom: 6px;
                }

                .tonnage-value small {
                    font-size: 0.6rem;
                    font-weight: 600;
                    opacity: 0.6;
                }

                .tonnage-bar {
                    height: 5px;
                    background: rgba(0,0,0,0.08);
                    border-radius: 2px;
                    overflow: hidden;
                    margin-bottom: 4px;
                }

                .tonnage-item.prod .tonnage-bar .fill { background: ${COLORS.primary}; }
                .tonnage-item.cons .tonnage-bar .fill { background: ${COLORS.success}; }

                .tonnage-bar .fill {
                    height: 100%;
                    border-radius: 2px;
                    transition: width 0.5s ease;
                }

                .tonnage-plan {
                    font-size: 0.65rem;
                    color: hsl(var(--text-muted));
                    font-weight: 700;
                }

                /* Performance Card */
                .perf-card {
                    min-height: 0;
                }

                .perf-body {
                    overflow-y: auto;
                    padding: 0 8px 8px;
                }

                .perf-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .perf-table thead {
                    position: sticky;
                    top: 0;
                    background: white;
                    z-index: 10;
                }

                .perf-table th {
                    text-align: left;
                    padding: 8px 10px;
                    font-size: 0.7rem;
                    font-weight: 900;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    border-bottom: 1px solid hsl(var(--border-color));
                    background: white;
                }

                .perf-table td {
                    padding: 8px 10px;
                    font-size: 0.8rem;
                    border-bottom: 1px solid hsl(var(--border-color) / 0.15);
                }

                .perf-table tr:hover { background: hsl(var(--main-bg) / 0.5); }
                .perf-table tr.alert-row { background: hsl(var(--destructive) / 0.03); }

                .unit-id { font-weight: 800; }

                .rate-badge {
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 0.75rem;
                    font-weight: 800;
                }

                .status-sm {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 18px;
                    height: 18px;
                    border-radius: 4px;
                }

                .status-sm.success { background: hsl(var(--success) / 0.1); color: hsl(var(--success)); }
                .status-sm.warning { background: hsl(var(--destructive) / 0.1); color: hsl(var(--destructive)); }

                .progress-bar {
                    width: 100%;
                    height: 4px;
                    background: hsl(var(--border-color) / 0.2);
                    border-radius: 2px;
                    overflow: hidden;
                }

                .progress-bar .fill {
                    height: 100%;
                    border-radius: 2px;
                    transition: width 0.5s ease;
                }

                /* Scrollbar */
                .perf-body::-webkit-scrollbar { width: 4px; }
                .perf-body::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }

                /* Date Picker Premium Styles */
                .date-picker-container {
                    position: relative;
                    margin-left: 8px;
                }

                .picker-trigger {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 5px 12px;
                    background: hsl(var(--background));
                    border: 1px solid hsl(var(--border));
                    border-radius: 6px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: hsl(var(--foreground));
                    cursor: pointer;
                    transition: all 0.2s ease;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }

                .picker-trigger:hover, .picker-trigger.active {
                    background: hsl(var(--main-bg));
                    border-color: ${COLORS.primary};
                    box-shadow: 0 0 0 2px ${COLORS.primary.replace(')', ' / 0.1)')};
                }

                .picker-trigger span {
                    color: hsl(var(--text-muted));
                    font-weight: 600;
                }

                .picker-trigger .arrow {
                    transition: transform 0.2s ease;
                    opacity: 0.5;
                }

                .picker-trigger .arrow.up {
                    transform: rotate(180deg);
                }

                .picker-dropdown {
                    position: absolute;
                    top: calc(100% + 8px);
                    right: 0;
                    width: 280px;
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(12px);
                    border: 1px solid hsl(var(--border));
                    border-radius: 12px;
                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
                    z-index: 1000;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    animation: slideDown 0.2s ease;
                }

                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .dropdown-section {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .section-title {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 0.65rem;
                    font-weight: 900;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .presets-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 6px;
                }

                .preset-btn {
                    padding: 6px 10px;
                    background: hsl(var(--main-bg) / 0.5);
                    border: 1px solid hsl(var(--border) / 0.5);
                    border-radius: 6px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-align: left;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .preset-btn:hover {
                    background: ${COLORS.primary.replace(')', ' / 0.08)')};
                    border-color: ${COLORS.primary};
                    color: ${COLORS.primary};
                }

                .custom-inputs {
                    display: flex;
                    gap: 8px;
                }

                .input-group {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .input-group label {
                    font-size: 0.6rem;
                    font-weight: 800;
                    color: hsl(var(--text-muted));
                }

                .input-group input {
                    width: 100%;
                    padding: 6px 8px;
                    background: hsl(var(--background));
                    border: 1px solid hsl(var(--border));
                    border-radius: 6px;
                    font-size: 0.75rem;
                    font-family: inherit;
                    color: inherit;
                    cursor: pointer;
                }

                .input-group input:focus {
                    outline: none;
                    border-color: ${COLORS.primary};
                    box-shadow: 0 0 0 2px ${COLORS.primary.replace(')', ' / 0.1)')};
                }

                /* Responsive */
                @media (max-width: 1200px) {
                    .kpi-row { grid-template-columns: repeat(2, 1fr); }
                    .main-grid { grid-template-columns: 1fr; }
                    .left-column { flex-direction: column; }
                    .bottom-charts { grid-template-columns: 1fr 1fr; }
                    .stats-page { overflow-y: auto; }
                }

                @media (max-width: 768px) {
                    .kpi-row { grid-template-columns: 1fr; }
                    .stats-page { padding: 8px; gap: 8px; }
                    .bottom-charts { grid-template-columns: 1fr; }
                    .fleet-body { flex-direction: column; }
                    .pie-container { width: 100%; height: 80px; }
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
                    background: hsl(var(--card-bg));
                    border-radius: 16px;
                    width: 100%;
                    max-width: 420px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                    animation: slideUp 0.3s ease;
                    border: 1px solid hsl(var(--border-color));
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
                    border-bottom: 1px solid hsl(var(--border-color));
                    background: linear-gradient(135deg, hsl(217 91% 60% / 0.08) 0%, hsl(217 91% 50% / 0.04) 100%);
                }

                .stats-modal-title {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 1rem;
                    font-weight: 700;
                    color: hsl(var(--text-main));
                }

                .stats-modal-title svg {
                    color: hsl(var(--primary));
                }

                .stats-modal-close {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    border: none;
                    background: hsl(var(--main-bg));
                    border-radius: 8px;
                    cursor: pointer;
                    color: hsl(var(--text-muted));
                    transition: all 0.2s ease;
                }

                .stats-modal-close:hover {
                    background: hsl(var(--danger) / 0.1);
                    color: hsl(var(--danger));
                }

                .stats-modal-body {
                    padding: 24px;
                }

                .stats-modal-desc {
                    font-size: 0.85rem;
                    color: hsl(var(--text-muted));
                    margin-bottom: 20px;
                    line-height: 1.5;
                }

                .stats-modal-desc strong {
                    color: hsl(var(--text-main));
                }

                .stats-modal-label {
                    display: block;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    margin-bottom: 8px;
                }

                .stats-modal-input {
                    width: 100%;
                    padding: 12px 16px;
                    border: 2px solid hsl(var(--border-color));
                    border-radius: 10px;
                    font-size: 0.9rem;
                    font-weight: 500;
                    color: hsl(var(--text-main));
                    background: hsl(var(--main-bg));
                    transition: all 0.2s ease;
                    box-sizing: border-box;
                }

                .stats-modal-input:focus {
                    outline: none;
                    border-color: hsl(var(--primary));
                    box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15);
                }

                .stats-modal-input::placeholder {
                    color: hsl(var(--text-muted) / 0.6);
                }

                .stats-modal-footer {
                    display: flex;
                    gap: 12px;
                    padding: 20px 24px;
                    border-top: 1px solid hsl(var(--border-color));
                    background: hsl(var(--main-bg) / 0.5);
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
                    background: hsl(var(--main-bg));
                    color: hsl(var(--text-muted));
                    border: 1px solid hsl(var(--border-color));
                }

                .stats-modal-btn.secondary:hover:not(:disabled) {
                    background: hsl(var(--border-color) / 0.5);
                    color: hsl(var(--text-main));
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

export default AdminStatistics
