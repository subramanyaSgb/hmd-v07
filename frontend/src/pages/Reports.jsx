import { useState, useEffect, useCallback, useRef } from 'react';
import { Truck, Ship, BarChart3, Wrench,
    TrendingUp, Activity, Clock, FileText, Calendar, Save, Mail, Loader2, TrendingDown, Sparkles, PieChart as PieChartIcon, BarChart2, LineChart as LineChartIcon, AreaChart as AreaChartIcon } from 'lucide-react';

import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { useHeader } from '../context/HeaderContext';
import REPORTS_API from '../utils/reportsApi';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import DateRangePicker from '../components/reports/DateRangePicker'
import ExportDropdown from '../components/reports/ExportDropdown'

const REPORT_TYPES = [
    { id: 'trip-performance', name: 'Trip Performance', icon: Truck, color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)' },
    { id: 'fleet-utilization', name: 'Fleet Utilization', icon: Ship, color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
];

const CHART_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

function Reports() {
    const { showNotification } = useNotification();
    const { user } = useAuth();
    const { setHeaderContent } = useHeader();
    const [activeReport, setActiveReport] = useState('trip-performance');
    const [dateRange, setDateRange] = useState({ date_from: '', date_to: '' });
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState(null);
    const [savedReports, setSavedReports] = useState([]);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [reportName, setReportName] = useState('');
    const [showEmailDialog, setShowEmailDialog] = useState(false);
    const [emailAddress, setEmailAddress] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);

    const [trendChartType, setTrendChartType] = useState('area'); 
    const [cycleChartType, setCycleChartType] = useState('pie'); 

    const activeReportRef = useRef(activeReport);
    const dateRangeRef = useRef(dateRange);

    useEffect(() => {
        activeReportRef.current = activeReport;
    }, [activeReport]);

    useEffect(() => {
        dateRangeRef.current = dateRange;
    }, [dateRange]);

    const handleExport = useCallback(async (format) => {
        const currentReport = activeReportRef.current;
        const currentRange = dateRangeRef.current;
        try {
            let blob;
            switch (format) {
                case 'csv':
                    blob = await REPORTS_API.exportToCSV(currentReport, currentRange);
                    downloadFile(blob, `${currentReport}_report.csv`, 'text/csv');
                    break;
                case 'json':
                    blob = await REPORTS_API.exportToJSON(currentReport, currentRange);
                    downloadFile(blob, `${currentReport}_report.json`, 'application/json');
                    break;
                case 'html':
                    blob = await REPORTS_API.exportToHTML(currentReport, currentRange);
                    const url = URL.createObjectURL(blob);
                    window.open(url, '_blank');
                    break;
                case 'pdf':
                    blob = await REPORTS_API.exportToHTML(currentReport, currentRange);
                    downloadFile(blob, `${currentReport}_report.html`, 'text/html');
                    break;
                case 'excel':
                    blob = await REPORTS_API.exportToCSV(currentReport, currentRange);
                    downloadFile(blob, `${currentReport}_report.csv`, 'text/csv');
                    break;
            }
            showNotification('success', 'Export completed successfully');
        } catch (error) {
            showNotification('error', `Export failed: ${error.message}`);
        }
    }, [showNotification]);

    const fetchReport = useCallback(async () => {
        if (!user?.role) return;

        setLoading(true);
        try {
            let data;
            const params = {};
            if (dateRange.date_from) params.date_from = dateRange.date_from;
            if (dateRange.date_to) params.date_to = dateRange.date_to;

            switch (activeReport) {
                case 'trip-performance':
                    data = await REPORTS_API.getTripPerformanceReport(params);
                    break;
                case 'fleet-utilization':
                    if (user.role !== 'admin' && user.role !== 'trs' && user.role !== 'ppc') {
                        showNotification('error', 'Access denied.');
                        setLoading(false);
                        return;
                    }
                    data = await REPORTS_API.getFleetUtilizationReport(params);
                    break;
                default:
                    data = {};
            }

            setReportData(data);
        } catch (error) {
            showNotification('error', `Failed to load report: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [activeReport, dateRange, user, showNotification]);

    useEffect(() => {
        setHeaderContent({
            right: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '12px' }}>
                    <button onClick={() => { setEmailAddress(user?.email || ''); setShowEmailDialog(true); }} className="rpt-header-btn">
                        <Mail size={15} />
                        <span>Email</span>
                    </button>
                    <button onClick={() => setShowSaveDialog(true)} className="rpt-header-btn">
                        <Save size={15} />
                        <span>Save</span>
                    </button>
                    <ExportDropdown onExport={handleExport} />
                </div>
            )
        });

        return () => setHeaderContent({ left: null, center: null, right: null });
    }, [setHeaderContent, handleExport, user?.email]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    useEffect(() => {
        const loadSavedReports = async () => {
            try {
                const saved = await REPORTS_API.getSavedReports();
                setSavedReports(saved);
            } catch (error) {
                console.error('Failed to load saved reports:', error);
            }
        };
        loadSavedReports();
    }, []);

    const handleSaveReport = async () => {
        if (!reportName.trim()) {
            showNotification('error', 'Please enter a report name');
            return;
        }

        try {
            await REPORTS_API.saveReport({
                name: reportName,
                report_type: activeReport,
                filters: { ...dateRange }
            });
            showNotification('success', 'Report saved successfully');
            setShowSaveDialog(false);
            setReportName('');

            const saved = await REPORTS_API.getSavedReports();
            setSavedReports(saved);
        } catch (error) {
            showNotification('error', `Failed to save report: ${error.message}`);
        }
    };

    const handleSendToEmail = async () => {
        const targetEmail = emailAddress.trim() || user?.email;
        if (!targetEmail) {
            showNotification('error', 'Please enter an email address');
            return;
        }

        setSendingEmail(true);
        try {
            await REPORTS_API.sendReportToEmail({
                report_type: activeReport,
                email: targetEmail,
                filters: { ...dateRange }
            });
            showNotification('success', `Report sent to ${targetEmail}`);
            setShowEmailDialog(false);
            setEmailAddress('');
        } catch (error) {
            showNotification('error', `Failed to send report: ${error.message}`);
        } finally {
            setSendingEmail(false);
        }
    };

    const downloadFile = (blob, filename, type) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const activeReportConfig = REPORT_TYPES.find(r => r.id === activeReport);

    const renderMetricCards = () => {
        if (!reportData?.summary) return null;

        const summary = reportData.summary;
        let metrics = [];

        if (activeReport === 'trip-performance') {
            metrics = [
                { label: 'Total Trips', value: summary.total_trips || 0, icon: Truck, color: '#3b82f6', trend: null },
                { label: 'Completed', value: summary.completed_trips || 0, icon: BarChart3, color: '#10b981', trend: 'up' },
                { label: 'Avg Cycle Time', value: `${(summary.avg_cycle_time_minutes || 0).toFixed(1)}`, unit: 'min', icon: Clock, color: '#f59e0b', trend: null },
                { label: 'On-Time Rate', value: `${(summary.on_time_delivery_rate || 0).toFixed(1)}`, unit: '%', icon: TrendingUp, color: '#8b5cf6', trend: 'up' }
            ];
        } else if (activeReport === 'fleet-utilization') {
            metrics = [
                { label: 'Total Fleet', value: summary.total_fleet || 0, icon: Ship, color: '#f59e0b', trend: null },
                { label: 'Operating', value: summary.operating_count || 0, icon: Activity, color: '#10b981', trend: 'up' },
                { label: 'Maintenance', value: summary.maintenance_count || 0, icon: Wrench, color: '#ef4444', trend: summary.maintenance_count > 0 ? 'down' : null },
                { label: 'Trips Done', value: summary.total_trips_completed || 0, icon: BarChart3, color: '#3b82f6', trend: null }
            ];
        }

        return (
            <div className="rpt-metrics-row">
                {metrics.map((metric, index) => {
                    const IconComponent = metric.icon;
                    return (
                        <div key={index} className="rpt-metric-card" style={{ '--metric-color': metric.color, animationDelay: `${index * 0.05}s` }}>
                            <div className="rpt-metric-icon-wrapper">
                                <IconComponent size={20} strokeWidth={2} />
                            </div>
                            <div className="rpt-metric-content">
                                <span className="rpt-metric-label">{metric.label}</span>
                                <div className="rpt-metric-value-row">
                                    <span className="rpt-metric-value">
                                        {typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}
                                    </span>
                                    {metric.unit && <span className="rpt-metric-unit">{metric.unit}</span>}
                                    {metric.trend && (
                                        <span className={`rpt-metric-trend ${metric.trend}`}>
                                            {metric.trend === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="rpt-chart-tooltip">
                    <p className="rpt-tooltip-label">{label}</p>
                    {payload.map((entry, index) => (
                        <p key={index} className="rpt-tooltip-value" style={{ color: entry.color }}>
                            {entry.name}: <strong>{typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}</strong>
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    const renderCharts = () => {
        if (!reportData) return null;

        if (activeReport === 'trip-performance' && reportData.daily_trends) {
            const cycleTimeData = [
                { name: '0-30 min', value: reportData.cycle_time_distribution?.range_0_30 || 0 },
                { name: '30-45 min', value: reportData.cycle_time_distribution?.range_30_45 || 0 },
                { name: '45-60 min', value: reportData.cycle_time_distribution?.range_45_60 || 0 },
                { name: '60-90 min', value: reportData.cycle_time_distribution?.range_60_90 || 0 },
                { name: '90+ min', value: reportData.cycle_time_distribution?.range_90_plus || 0 }
            ];

            return (
                <div className="rpt-charts-grid">
                    <div className="rpt-chart-panel">
                        <div className="rpt-chart-header">
                            <div className="rpt-chart-title">
                                <Activity size={16} />
                                <span>Daily Trip Trends</span>
                            </div>
                            <div className="rpt-chart-toggle">
                                <button className={trendChartType === 'area' ? 'active' : ''} onClick={() => setTrendChartType('area')} title="Area Chart">
                                    <AreaChartIcon size={14} />
                                </button>
                                <button className={trendChartType === 'bar' ? 'active' : ''} onClick={() => setTrendChartType('bar')} title="Bar Chart">
                                    <BarChart2 size={14} />
                                </button>
                                <button className={trendChartType === 'line' ? 'active' : ''} onClick={() => setTrendChartType('line')} title="Line Chart">
                                    <LineChartIcon size={14} />
                                </button>
                            </div>
                        </div>
                        <div className="rpt-chart-body">
                            <ResponsiveContainer width="100%" height={160}>
                                {trendChartType === 'area' ? (
                                    <AreaChart data={reportData.daily_trends}>
                                        <defs>
                                            <linearGradient id="colorTrips" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                            </linearGradient>
                                            <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-color))" vertical={false} />
                                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }} axisLine={false} tickLine={false} width={30} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Area type="monotone" dataKey="trip_count" stroke="#3b82f6" strokeWidth={2} fill="url(#colorTrips)" name="Total Trips" />
                                        <Area type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} fill="url(#colorCompleted)" name="Completed" />
                                    </AreaChart>
                                ) : trendChartType === 'bar' ? (
                                    <BarChart data={reportData.daily_trends} barGap={2}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-color))" vertical={false} />
                                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }} axisLine={false} tickLine={false} width={30} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="trip_count" fill="#3b82f6" name="Total Trips" radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="completed" fill="#10b981" name="Completed" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                ) : (
                                    <LineChart data={reportData.daily_trends}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-color))" vertical={false} />
                                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }} axisLine={false} tickLine={false} width={30} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Line type="monotone" dataKey="trip_count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Total Trips" />
                                        <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Completed" />
                                    </LineChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="rpt-chart-panel">
                        <div className="rpt-chart-header">
                            <div className="rpt-chart-title">
                                <Clock size={16} />
                                <span>Cycle Time Distribution</span>
                            </div>
                            <div className="rpt-chart-toggle">
                                <button className={cycleChartType === 'pie' ? 'active' : ''} onClick={() => setCycleChartType('pie')} title="Pie Chart">
                                    <PieChartIcon size={14} />
                                </button>
                                <button className={cycleChartType === 'bar' ? 'active' : ''} onClick={() => setCycleChartType('bar')} title="Bar Chart">
                                    <BarChart2 size={14} />
                                </button>
                            </div>
                        </div>
                        <div className="rpt-chart-body rpt-pie-container">
                            <ResponsiveContainer width="100%" height={160}>
                                {cycleChartType === 'pie' ? (
                                    <PieChart>
                                        <Pie data={cycleTimeData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value">
                                            {CHART_COLORS.map((color, index) => (
                                                <Cell key={index} fill={color} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 500 }} />
                                    </PieChart>
                                ) : (
                                    <BarChart data={cycleTimeData} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-color))" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }} axisLine={false} tickLine={false} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: 'hsl(var(--text-muted))' }} axisLine={false} tickLine={false} width={55} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Bar dataKey="value" radius={[0, 4, 4, 0]} name="Trips">
                                            {cycleTimeData.map((_, index) => (
                                                <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                )}
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            );
        }

        if (activeReport === 'fleet-utilization' && reportData.status_distribution) {
            return (
                <div className="rpt-charts-grid">
                    <div className="rpt-chart-panel">
                        <div className="rpt-chart-header">
                            <div className="rpt-chart-title">
                                <Ship size={16} />
                                <span>Fleet Status</span>
                            </div>
                        </div>
                        <div className="rpt-chart-body rpt-pie-container">
                            <ResponsiveContainer width="100%" height={160}>
                                <PieChart>
                                    <Pie data={Object.entries(reportData.status_distribution).map(([key, value]) => ({ name: key, value }))} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value">
                                        {Object.entries(reportData.status_distribution).map((_, index) => (
                                            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: '10px', fontWeight: 500 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="rpt-chart-panel">
                        <div className="rpt-chart-header">
                            <div className="rpt-chart-title">
                                <Activity size={16} />
                                <span>Daily Utilization</span>
                            </div>
                        </div>
                        <div className="rpt-chart-body">
                            <ResponsiveContainer width="100%" height={160}>
                                <LineChart data={reportData.daily_utilization || []}>
                                    <defs>
                                        <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0%" stopColor="#3b82f6" />
                                            <stop offset="100%" stopColor="#8b5cf6" />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-color))" vertical={false} />
                                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--text-muted))' }} axisLine={false} tickLine={false} width={30} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Line type="monotone" dataKey="trip_count" stroke="url(#lineGradient)" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} name="Trips" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            );
        }

        return null;
    };

    const renderDataTable = () => {
        if (!reportData) return null;

        let data = [];
        let columns = [];

        switch (activeReport) {
            case 'trip-performance':
                data = (reportData.trips || []).map(trip => ({ ...trip, producer: trip.producer_id, consumer: trip.consumer_id }));
                columns = ['trip_id', 'producer', 'consumer', 'status_text', 'cycle_time_minutes', 'created_at'];
                break;
            case 'fleet-utilization':
                data = reportData.fleet_details || [];
                columns = ['fleet_id', 'fleet_type', 'status', 'total_trips', 'completed_trips'];
                break;
        }

        if (data.length === 0) {
            return (
                <div className="rpt-table-panel rpt-empty-state">
                    <div className="rpt-empty-icon">
                        <FileText size={36} strokeWidth={1.5} />
                    </div>
                    <h4>No Data Available</h4>
                    <p>No records found for the selected criteria. Try adjusting your date range.</p>
                </div>
            );
        }

        const columnLabels = {
            trip_id: 'Trip ID', producer: 'Producer', consumer: 'Consumer', status_text: 'Status',
            cycle_time_minutes: 'Cycle Time (min)', created_at: 'Created', fleet_id: 'Fleet ID',
            fleet_type: 'Type', status: 'Status', total_trips: 'Total Trips', completed_trips: 'Completed',
            total_production: 'Total Production (MT)', total_consumption: 'Total Consumption (MT)',
            days_active: 'Days Active', node_id: 'Node', start_date: 'Start Date', end_date: 'End Date',
            reason: 'Reason', downtime_hours: 'Downtime (hrs)', assignment_id: 'Assignment ID',
            date: 'Date', quantity: 'Quantity (MT)', username: 'Username', action: 'Action',
            details: 'Details', ip_address: 'IP Address', timestamp: 'Timestamp', id: 'ID'
        };

        return (
            <div className="rpt-table-panel">
                <div className="rpt-table-header">
                    <div className="rpt-table-title">
                        <FileText size={18} />
                        <span>Data Details</span>
                    </div>
                    <span className="rpt-table-count">{data.length} records</span>
                </div>
                <div className="rpt-table-scroll-container">
                    <div className="rpt-table-wrapper">
                        <table className="rpt-table">
                            <thead>
                                <tr>
                                    {columns.map(col => (
                                        <th key={col}>{columnLabels[col] || col}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((row, index) => (
                                    <tr key={index}>
                                        {columns.map(col => (
                                            <td key={col}>
                                                {col === 'status_text' || col === 'status' ? (
                                                    <span className={`rpt-status-badge ${(row[col] || '').toLowerCase().replace(/\s+/g, '-')}`}>
                                                        {row[col] || '-'}
                                                    </span>
                                                ) : (
                                                    row[col] !== undefined && row[col] !== null
                                                        ? (typeof row[col] === 'number' ? row[col].toLocaleString() : String(row[col]))
                                                        : '-'
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="rpt-container">
            <div className="rpt-selector-bar">
                <div className="rpt-selector-tabs">
                    {REPORT_TYPES.filter(report => {
                        if (user?.role === 'admin' || user?.role === 'trs' || user?.role === 'ppc') return true;
                        if (report.id === 'fleet-utilization') return false;
                        return true;
                    }).map((report, index) => {
                        const Icon = report.icon;
                        const isActive = activeReport === report.id;
                        return (
                            <button key={report.id} onClick={() => setActiveReport(report.id)} className={`rpt-selector-tab ${isActive ? 'active' : ''}`} style={{ '--tab-color': report.color, '--tab-gradient': report.gradient, animationDelay: `${index * 0.05}s` }}>
                                <Icon size={16} />
                                <span>{report.name}</span>
                            </button>
                        );
                    })}
                </div>
                <div className="rpt-filter-group">
                    <div className="rpt-date-picker-wrapper">
                        <Calendar size={14} />
                        <DateRangePicker value={dateRange} onChange={setDateRange} />
                    </div>
                    <button onClick={fetchReport} disabled={loading} className="rpt-generate-btn">
                        {loading ? <Loader2 size={15} className="rpt-spin" /> : <Sparkles size={15} />}
                        <span>{loading ? 'Loading...' : 'Generate'}</span>
                    </button>
                </div>
            </div>
            <div className="rpt-content">
                {loading ? (
                    <div className="rpt-loading">
                        <Loader2 size={32} className="rpt-spin" />
                        <span>Generating report...</span>
                    </div>
                ) : (
                    <>
                        {renderMetricCards()}
                        {renderCharts()}
                        {renderDataTable()}
                    </>
                )}
            </div>
            {showSaveDialog && (
                <div className="rpt-modal-overlay" onClick={() => setShowSaveDialog(false)}>
                    <div className="rpt-modal" onClick={e => e.stopPropagation()}>
                        <div className="rpt-modal-header">
                            <Save size={20} />
                            <span>Save Report</span>
                        </div>
                        <div className="rpt-modal-body">
                            <label>Report Name</label>
                            <input type="text" value={reportName} onChange={(e) => setReportName(e.target.value)} placeholder="Enter a name for this report..." className="rpt-modal-input" autoFocus />
                        </div>
                        <div className="rpt-modal-actions">
                            <button onClick={() => setShowSaveDialog(false)} className="rpt-modal-btn secondary">Cancel</button>
                            <button onClick={handleSaveReport} className="rpt-modal-btn primary">Save Report</button>
                        </div>
                    </div>
                </div>
            )}
            {showEmailDialog && (
                <div className="rpt-modal-overlay" onClick={() => setShowEmailDialog(false)}>
                    <div className="rpt-modal" onClick={e => e.stopPropagation()}>
                        <div className="rpt-modal-header">
                            <Mail size={20} />
                            <span>Send Report via Email</span>
                        </div>
                        <div className="rpt-modal-body">
                            <p className="rpt-modal-desc">
                                The <strong>{activeReportConfig?.name}</strong> report will be generated and sent to your email.
                            </p>
                            <label>Email Address</label>
                            <input type="email" value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="Enter email address..." className="rpt-modal-input" autoFocus />
                        </div>
                        <div className="rpt-modal-actions">
                            <button onClick={() => { setShowEmailDialog(false); setEmailAddress(''); }} className="rpt-modal-btn secondary" disabled={sendingEmail}>
                                Cancel
                            </button>
                            <button onClick={handleSendToEmail} className="rpt-modal-btn primary success" disabled={sendingEmail}>
                                {sendingEmail ? <><Loader2 size={14} className="rpt-spin" /> Sending...</> : <><Mail size={14} /> Send Report</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .rpt-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    padding: 24px;
                    gap: 24px;
                    overflow: hidden;
                    background: hsl(var(--main-bg));
                }

                /* Header Buttons */
                .rpt-header-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 9px 14px;
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 10px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .rpt-header-btn:hover {
                    border-color: hsl(var(--accent));
                    color: hsl(var(--accent));
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px -4px hsl(var(--accent) / 0.2);
                }

                /* Selector Bar */
                .rpt-selector-bar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    flex-wrap: wrap;
                    flex-shrink: 0;
                }

                .rpt-selector-tabs {
                    display: flex;
                    gap: 8px;
                    flex-wrap: wrap;
                }

                .rpt-selector-tab {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 16px;
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 12px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                    cursor: pointer;
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    position: relative;
                    overflow: hidden;
                    animation: rptFadeIn 0.3s ease forwards;
                    opacity: 0;
                }

                .rpt-selector-tab::before {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: var(--tab-color);
                    transform: scaleX(0);
                    transition: transform 0.25s ease;
                }

                .rpt-selector-tab:hover {
                    border-color: var(--tab-color);
                    color: hsl(var(--text-main));
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px -6px rgba(0,0,0,0.12);
                }

                .rpt-selector-tab:hover::before {
                    transform: scaleX(1);
                }

                .rpt-selector-tab.active {
                    background: var(--tab-gradient);
                    border-color: transparent;
                    color: white;
                    box-shadow: 0 6px 20px -4px var(--tab-color);
                }

                .rpt-selector-tab.active::before {
                    display: none;
                }

                .rpt-filter-group {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .rpt-date-picker-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 14px;
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 10px;
                    color: hsl(var(--text-muted));
                }

                .rpt-generate-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 10px 18px;
                    background: linear-gradient(135deg, hsl(var(--accent)) 0%, hsl(217 91% 50%) 100%);
                    border: none;
                    border-radius: 10px;
                    font-size: 0.8rem;
                    font-weight: 700;
                    color: white;
                    cursor: pointer;
                    transition: all 0.25s ease;
                    box-shadow: 0 4px 14px -4px hsl(var(--accent) / 0.4);
                }

                .rpt-generate-btn:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px -4px hsl(var(--accent) / 0.5);
                }

                .rpt-generate-btn:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                }

                /* Content Area */
                .rpt-content {
                    flex: 1;
                    overflow-y: auto;
                    overflow-x: hidden;
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                    padding-right: 4px;
                }

                /* Loading State */
                .rpt-loading {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    color: hsl(var(--text-muted));
                    font-weight: 500;
                }

                /* Metrics Row */
                .rpt-metrics-row {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 16px;
                }

                @media (max-width: 1200px) {
                    .rpt-metrics-row { grid-template-columns: repeat(2, 1fr); }
                }

                @media (max-width: 600px) {
                    .rpt-metrics-row { grid-template-columns: 1fr; }
                }

                .rpt-metric-card {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 22px;
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 18px;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.04);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    animation: rptSlideUp 0.4s ease forwards;
                    opacity: 0;
                }

                .rpt-metric-card:hover {
                    transform: translateY(-4px);
                    border-color: var(--metric-color);
                    box-shadow: 0 12px 32px -8px rgba(0,0,0,0.12), 0 0 0 1px var(--metric-color);
                }

                .rpt-metric-icon-wrapper {
                    width: 52px;
                    height: 52px;
                    border-radius: 14px;
                    background: color-mix(in srgb, var(--metric-color) 12%, transparent);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--metric-color);
                    flex-shrink: 0;
                    transition: all 0.3s ease;
                }

                .rpt-metric-card:hover .rpt-metric-icon-wrapper {
                    transform: scale(1.08);
                    box-shadow: 0 6px 16px -4px var(--metric-color);
                }

                .rpt-metric-content {
                    flex: 1;
                    min-width: 0;
                }

                .rpt-metric-label {
                    display: block;
                    font-size: 0.72rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    margin-bottom: 6px;
                }

                .rpt-metric-value-row {
                    display: flex;
                    align-items: baseline;
                    gap: 6px;
                }

                .rpt-metric-value {
                    font-size: 1.75rem;
                    font-weight: 800;
                    color: hsl(var(--text-main));
                    font-family: 'Space Grotesk', sans-serif;
                    line-height: 1;
                }

                .rpt-metric-unit {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                }

                .rpt-metric-trend {
                    display: flex;
                    align-items: center;
                    margin-left: 4px;
                }

                .rpt-metric-trend.up { color: #10b981; }
                .rpt-metric-trend.down { color: #ef4444; }

                /* Charts */
                .rpt-charts-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                }

                @media (max-width: 1000px) {
                    .rpt-charts-grid { grid-template-columns: 1fr; }
                }

                .rpt-chart-panel {
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 18px;
                    overflow: hidden;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.04);
                    transition: all 0.3s ease;
                    animation: rptSlideUp 0.4s ease forwards;
                    opacity: 0;
                    animation-delay: 0.1s;
                }

                .rpt-chart-panel:hover {
                    box-shadow: 0 8px 24px -6px rgba(0,0,0,0.12);
                    transform: translateY(-2px);
                }

                .rpt-chart-panel.rpt-chart-full {
                    grid-column: 1 / -1;
                }

                .rpt-chart-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px 20px;
                    border-bottom: 1px solid hsl(var(--border-color));
                    background: hsl(var(--main-bg) / 0.5);
                }

                .rpt-chart-title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: hsl(var(--text-main));
                }

                .rpt-chart-title svg {
                    color: hsl(var(--accent));
                }

                .rpt-chart-toggle {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    background: hsl(var(--main-bg));
                    padding: 4px;
                    border-radius: 8px;
                    border: 1px solid hsl(var(--border-color));
                }

                .rpt-chart-toggle button {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    height: 28px;
                    padding: 0;
                    background: transparent;
                    border: none;
                    border-radius: 6px;
                    color: hsl(var(--text-muted));
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .rpt-chart-toggle button:hover {
                    background: hsl(var(--card-bg));
                    color: hsl(var(--text-main));
                }

                .rpt-chart-toggle button.active {
                    background: hsl(var(--accent));
                    color: white;
                    box-shadow: 0 2px 8px -2px hsl(var(--accent) / 0.4);
                }

                .rpt-chart-body {
                    padding: 20px;
                }

                .rpt-pie-container {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .rpt-chart-tooltip {
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 10px;
                    padding: 12px 16px;
                    box-shadow: 0 8px 24px -8px rgba(0,0,0,0.15);
                }

                .rpt-tooltip-label {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                    margin-bottom: 6px;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .rpt-tooltip-value {
                    font-size: 0.85rem;
                    margin: 4px 0;
                }

                .rpt-tooltip-value strong {
                    font-weight: 700;
                }

                /* Maintenance Overview */
                .rpt-maintenance-overview {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 48px 24px;
                }

                .rpt-maintenance-stat {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                }

                .rpt-maintenance-icon {
                    width: 72px;
                    height: 72px;
                    border-radius: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 16px;
                }

                .rpt-maintenance-count {
                    font-size: 3rem;
                    font-weight: 800;
                    color: hsl(var(--text-main));
                    font-family: 'Space Grotesk', sans-serif;
                    line-height: 1;
                    margin-bottom: 8px;
                }

                .rpt-maintenance-label {
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                /* Data Table */
                .rpt-table-panel {
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 18px;
                    overflow: hidden;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.04);
                    animation: rptSlideUp 0.4s ease forwards;
                    opacity: 0;
                    animation-delay: 0.2s;
                }

                .rpt-table-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 16px 20px;
                    border-bottom: 1px solid hsl(var(--border-color));
                    background: hsl(var(--main-bg) / 0.5);
                }

                .rpt-table-title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: hsl(var(--text-main));
                }

                .rpt-table-title svg {
                    color: hsl(var(--accent));
                }

                .rpt-table-count {
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: hsl(var(--text-muted));
                    background: hsl(var(--main-bg));
                    padding: 4px 10px;
                    border-radius: 6px;
                }

                .rpt-table-scroll-container {
                    max-height: 320px;
                    overflow: auto;
                }

                .rpt-table-scroll-container::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }

                .rpt-table-scroll-container::-webkit-scrollbar-track {
                    background: hsl(var(--main-bg));
                    border-radius: 4px;
                }

                .rpt-table-scroll-container::-webkit-scrollbar-thumb {
                    background: hsl(var(--border-color));
                    border-radius: 4px;
                    border: 2px solid hsl(var(--main-bg));
                }

                .rpt-table-scroll-container::-webkit-scrollbar-thumb:hover {
                    background: hsl(var(--text-muted));
                }

                .rpt-table-scroll-container::-webkit-scrollbar-corner {
                    background: hsl(var(--main-bg));
                }

                .rpt-table-wrapper {
                    min-width: 100%;
                }

                .rpt-table {
                    width: 100%;
                    border-collapse: separate;
                    border-spacing: 0;
                }

                .rpt-table th {
                    padding: 14px 16px;
                    text-align: left;
                    font-size: 0.7rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    background: hsl(var(--card-bg));
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    white-space: nowrap;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                    border-bottom: 2px solid hsl(var(--border-color));
                    box-shadow: 0 1px 0 hsl(var(--border-color));
                }

                .rpt-table td {
                    padding: 14px 16px;
                    font-size: 0.82rem;
                    color: hsl(var(--text-main));
                    border-bottom: 1px solid hsl(var(--border-color));
                    white-space: nowrap;
                }

                .rpt-table tbody tr {
                    transition: background 0.2s ease;
                    animation: rptFadeIn 0.3s ease forwards;
                    opacity: 0;
                }

                .rpt-table tbody tr:hover {
                    background: hsl(var(--main-bg) / 0.6);
                }

                .rpt-table tbody tr:last-child td {
                    border-bottom: none;
                }

                .rpt-status-badge {
                    display: inline-flex;
                    align-items: center;
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .rpt-status-badge.completed, .rpt-status-badge.active {
                    background: rgba(16, 185, 129, 0.1);
                    color: #10b981;
                }

                .rpt-status-badge.pending, .rpt-status-badge.scheduled {
                    background: rgba(245, 158, 11, 0.1);
                    color: #f59e0b;
                }

                .rpt-status-badge.cancelled, .rpt-status-badge.failed {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }

                .rpt-status-badge.operating {
                    background: rgba(59, 130, 246, 0.1);
                    color: #3b82f6;
                }

                .rpt-status-badge.maintenance {
                    background: rgba(239, 68, 68, 0.1);
                    color: #ef4444;
                }

                .rpt-table-footer {
                    padding: 14px 20px;
                    text-align: center;
                    font-size: 0.78rem;
                    font-weight: 500;
                    color: hsl(var(--text-muted));
                    background: hsl(var(--main-bg) / 0.5);
                    border-top: 1px solid hsl(var(--border-color));
                }

                /* Empty State */
                .rpt-empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 64px 24px !important;
                    text-align: center;
                }

                .rpt-empty-icon {
                    width: 80px;
                    height: 80px;
                    border-radius: 20px;
                    background: hsl(var(--accent) / 0.1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: hsl(var(--accent));
                    margin-bottom: 20px;
                }

                .rpt-empty-state h4 {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: hsl(var(--text-main));
                    margin: 0 0 8px;
                }

                .rpt-empty-state p {
                    font-size: 0.85rem;
                    color: hsl(var(--text-muted));
                    margin: 0;
                    max-width: 320px;
                }

                /* Modal */
                .rpt-modal-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(4px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 9999;
                    animation: rptFadeIn 0.2s ease;
                }

                .rpt-modal {
                    background: hsl(var(--card-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 20px;
                    width: 420px;
                    max-width: 90%;
                    box-shadow: 0 24px 48px -12px rgba(0,0,0,0.25);
                    animation: rptSlideUp 0.3s ease;
                }

                .rpt-modal-header {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 20px 24px;
                    border-bottom: 1px solid hsl(var(--border-color));
                    font-size: 1rem;
                    font-weight: 700;
                    color: hsl(var(--text-main));
                }

                .rpt-modal-header svg {
                    color: hsl(var(--accent));
                }

                .rpt-modal-body {
                    padding: 24px;
                }

                .rpt-modal-body label {
                    display: block;
                    font-size: 0.75rem;
                    font-weight: 700;
                    color: hsl(var(--text-muted));
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    margin-bottom: 8px;
                }

                .rpt-modal-desc {
                    font-size: 0.85rem;
                    color: hsl(var(--text-muted));
                    margin-bottom: 20px;
                    line-height: 1.5;
                }

                .rpt-modal-desc strong {
                    color: hsl(var(--text-main));
                }

                .rpt-modal-input {
                    width: 100%;
                    padding: 14px 16px;
                    background: hsl(var(--main-bg));
                    border: 1px solid hsl(var(--border-color));
                    border-radius: 12px;
                    font-size: 0.9rem;
                    font-weight: 500;
                    color: hsl(var(--text-main));
                    transition: all 0.2s ease;
                }

                .rpt-modal-input:focus {
                    outline: none;
                    border-color: hsl(var(--accent));
                    box-shadow: 0 0 0 3px hsl(var(--accent) / 0.15);
                }

                .rpt-modal-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: flex-end;
                    padding: 16px 24px;
                    border-top: 1px solid hsl(var(--border-color));
                    background: hsl(var(--main-bg) / 0.5);
                }

                .rpt-modal-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 11px 20px;
                    border-radius: 10px;
                    font-size: 0.8rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .rpt-modal-btn.secondary {
                    background: transparent;
                    border: 1px solid hsl(var(--border-color));
                    color: hsl(var(--text-muted));
                }

                .rpt-modal-btn.secondary:hover {
                    border-color: hsl(var(--text-muted));
                    color: hsl(var(--text-main));
                }

                .rpt-modal-btn.primary {
                    background: linear-gradient(135deg, hsl(var(--accent)) 0%, hsl(217 91% 50%) 100%);
                    border: none;
                    color: white;
                    box-shadow: 0 4px 12px -4px hsl(var(--accent) / 0.4);
                }

                .rpt-modal-btn.primary:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 16px -4px hsl(var(--accent) / 0.5);
                }

                .rpt-modal-btn.primary.success {
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    box-shadow: 0 4px 12px -4px rgba(16, 185, 129, 0.4);
                }

                .rpt-modal-btn.primary.success:hover:not(:disabled) {
                    box-shadow: 0 6px 16px -4px rgba(16, 185, 129, 0.5);
                }

                .rpt-modal-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                /* Animations */
                @keyframes rptFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                @keyframes rptSlideUp {
                    from {
                        opacity: 0;
                        transform: translateY(16px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .rpt-spin {
                    animation: rptSpin 1s linear infinite;
                }

                @keyframes rptSpin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }

                /* Responsive */
                @media (max-width: 900px) {
                    .rpt-selector-bar {
                        flex-direction: column;
                        align-items: stretch;
                    }

                    .rpt-filter-group {
                        justify-content: flex-end;
                    }
                }

                /* Dark Mode Refinements */
                [data-theme="dark"] .rpt-metric-card {
                    background: hsl(var(--card-bg));
                }

                [data-theme="dark"] .rpt-chart-panel,
                [data-theme="dark"] .rpt-table-panel {
                    background: hsl(var(--card-bg));
                }

                [data-theme="dark"] .rpt-selector-tab {
                    background: hsl(var(--card-bg));
                }

                [data-theme="dark"] .rpt-table th {
                    background: hsl(var(--card-bg));
                    border-bottom-color: hsl(var(--border-color));
                    box-shadow: 0 1px 0 hsl(var(--border-color));
                }
            `}</style>
        </div>
    );
}

export default Reports;
