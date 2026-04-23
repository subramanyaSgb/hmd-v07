import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../utils/api';
import { useHeader } from '../../context/HeaderContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FileDown } from 'lucide-react'
import MonthlyPlanOverview from './MonthlyPlanOverview'
import MyPerformanceCard from './MyPerformanceCard'
import PartnerBreakdown from './PartnerBreakdown'
import CompletionTimeline from './CompletionTimeline'

const ProducerStatistics = ({ userId }) => {
    const { setHeaderContent } = useHeader();
    const [monthlyPlan, setMonthlyPlan] = useState(null);
    const [performance, setPerformance] = useState(null);
    const [partnerBreakdown, setPartnerBreakdown] = useState([]);
    const [timeline, setTimeline] = useState([]);
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [isExporting, setIsExporting] = useState(false);

    const monthlyPlanRef = useRef(monthlyPlan);
    const performanceRef = useRef(performance);
    const partnerBreakdownRef = useRef(partnerBreakdown);
    const timelineRef = useRef(timeline);

    useEffect(() => {
        monthlyPlanRef.current = monthlyPlan;
        performanceRef.current = performance;
        partnerBreakdownRef.current = partnerBreakdown;
        timelineRef.current = timeline;
    }, [monthlyPlan, performance, partnerBreakdown, timeline]);

    const handleExportPDF = useCallback(async () => {
        setIsExporting(true);
        try {
            const doc = new jsPDF('p', 'mm', 'a4');
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 12;
            const contentWidth = pageWidth - (margin * 2);

            const plan = monthlyPlanRef.current;
            const perf = performanceRef.current;
            const partners = partnerBreakdownRef.current;
            const timelineData = timelineRef.current;

            const progressPct = plan?.planned > 0 ? Math.round((plan.actual / plan.planned) * 100) : 0;
            const remaining = plan ? Math.max(0, plan.planned - plan.actual) : 0;
            const daysInMonth = plan ? new Date(plan.year, plan.month, 0).getDate() : 30;
            const currentDay = new Date().getDate();
            const daysRemaining = Math.max(0, daysInMonth - currentDay);
            const dailyTarget = daysRemaining > 0 ? Math.round(remaining / daysRemaining) : 0;
            const dailyAvg = currentDay > 0 && plan ? Math.round(plan.actual / currentDay) : 0;

            const getStatus = (pct) => {
                if (pct >= 90) return { color: [16, 185, 129], bg: [220, 252, 231], text: 'ON TRACK' };
                if (pct >= 70) return { color: [245, 158, 11], bg: [254, 243, 199], text: 'BEHIND' };
                return { color: [239, 68, 68], bg: [254, 226, 226], text: 'CRITICAL' };
            };
            const status = getStatus(progressPct);

            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, pageWidth, 38, 'F');

            doc.setFillColor(59, 130, 246);
            doc.rect(0, 38, pageWidth, 1, 'F');

            doc.setFillColor(59, 130, 246);
            doc.roundedRect(margin, 8, 6, 6, 1, 1, 'F');

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text('DEEVIA', margin + 9, 13);

            doc.setFontSize(5);
            doc.setTextColor(100, 116, 139);
            doc.text('DEEP VISION ANALYTICS', margin + 9, 17);

            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text('PERFORMANCE DASHBOARD', pageWidth / 2, 12, { align: 'center' });

            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text(`Producer: ${userId}`, pageWidth / 2, 19, { align: 'center' });

            if (plan) {
                const monthText = new Date(plan.year, plan.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                doc.setFillColor(30, 41, 59);
                doc.roundedRect(pageWidth / 2 - 20, 23, 40, 8, 2, 2, 'F');
                doc.setFontSize(7);
                doc.setTextColor(226, 232, 240);
                doc.text(monthText, pageWidth / 2, 28, { align: 'center' });
            }

            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), pageWidth - margin, 12, { align: 'right' });
            doc.setFontSize(6);
            doc.text(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), pageWidth - margin, 17, { align: 'right' });

            let y = 46;

            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text('Monthly Plan Overview', margin, y);
            y += 5;

            doc.setFillColor(255, 255, 255);
            doc.roundedRect(margin, y, contentWidth, 32, 2, 2, 'F');
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.roundedRect(margin, y, contentWidth, 32, 2, 2, 'S');

            doc.setFillColor(...status.color);
            doc.roundedRect(margin + 4, y + 4, 18, 5, 1, 1, 'F');
            doc.setFontSize(5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text(status.text, margin + 13, y + 7.5, { align: 'center' });

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text('Production Progress', margin + 25, y + 8);

            doc.setFontSize(22);
            doc.setTextColor(...status.color);
            doc.text(`${progressPct}%`, contentWidth + margin - 4, y + 12, { align: 'right' });

            const barX = margin + 4;
            const barY = y + 14;
            const barW = contentWidth - 8;
            const barH = 6;

            doc.setFillColor(241, 245, 249);
            doc.roundedRect(barX, barY, barW, barH, 1.5, 1.5, 'F');

            const fillW = Math.max(4, (barW * Math.min(progressPct, 100)) / 100);
            doc.setFillColor(...status.color);
            doc.roundedRect(barX, barY, fillW, barH, 1.5, 1.5, 'F');

            doc.setFontSize(6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text('ACTUAL', margin + 4, y + 26);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text(`${(plan?.actual || 0).toLocaleString()} MT`, margin + 4, y + 31);

            doc.setFontSize(9);
            doc.setTextColor(148, 163, 184);
            doc.text('/', margin + 35, y + 31);

            doc.setFontSize(6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text('PLANNED', margin + 40, y + 26);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text(`${(plan?.planned || 0).toLocaleString()} MT`, margin + 40, y + 31);

            y += 36;

            const statW = (contentWidth - 6) / 4;
            const stats = [
                { label: 'Remaining', value: `${remaining.toLocaleString()} MT`, color: [59, 130, 246] },
                { label: 'Daily Avg', value: `${dailyAvg.toLocaleString()} MT/d`, color: [16, 185, 129] },
                { label: 'Days Left', value: `${daysRemaining} days`, color: [245, 158, 11] },
                { label: 'Target/Day', value: `${dailyTarget.toLocaleString()} MT`, color: [139, 92, 246] }
            ];

            stats.forEach((s, i) => {
                const x = margin + i * (statW + 2);

                doc.setFillColor(255, 255, 255);
                doc.roundedRect(x, y, statW, 16, 2, 2, 'F');
                doc.setDrawColor(226, 232, 240);
                doc.roundedRect(x, y, statW, 16, 2, 2, 'S');

                doc.setFillColor(...s.color);
                doc.roundedRect(x, y + 2, 1.5, 12, 0.5, 0.5, 'F');

                doc.setFontSize(6);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 116, 139);
                doc.text(s.label.toUpperCase(), x + 5, y + 5);

                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(30, 41, 59);
                doc.text(s.value, x + 5, y + 12);
            });

            y += 22;

            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text('My Daily Performance', margin, y);
            y += 5;

            const perfStats = [
                { label: 'Produced', value: `${perf?.total_tonnage || 0} MT`, color: [59, 130, 246] },
                { label: 'Fulfillment', value: `${perf?.fulfillment_rate || 0}%`, color: [16, 185, 129] },
                { label: 'Trips Done', value: `${perf?.trips_completed || 0}`, color: [245, 158, 11] },
                { label: 'Avg Cycle', value: `${perf?.avg_cycle_time_minutes || 0} min`, color: [139, 92, 246] }
            ];

            perfStats.forEach((s, i) => {
                const x = margin + i * (statW + 2);

                doc.setFillColor(255, 255, 255);
                doc.roundedRect(x, y, statW, 16, 2, 2, 'F');
                doc.setDrawColor(226, 232, 240);
                doc.roundedRect(x, y, statW, 16, 2, 2, 'S');

                doc.setFillColor(...s.color);
                doc.roundedRect(x, y + 2, 1.5, 12, 0.5, 0.5, 'F');

                doc.setFontSize(6);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(100, 116, 139);
                doc.text(s.label.toUpperCase(), x + 5, y + 5);

                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(30, 41, 59);
                doc.text(s.value, x + 5, y + 12);
            });

            y += 22;

            const colW = (contentWidth - 4) / 2;

            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text('My Deliveries by Consumer', margin, y);

            doc.text('Trip Completion Timeline', margin + colW + 4, y);
            y += 4;

            const tableStartY = y;
            const maxRows = 6;

            if (partners && partners.length > 0) {
                autoTable(doc, {
                    startY: y,
                    head: [['Consumer', 'Tonnage', 'Trips', '%']],
                    body: partners.slice(0, maxRows).map(p => [
                        p.partner_id || p.user_id || '-',
                        `${(p.tonnage || p.actual || 0).toLocaleString()}`,
                        String(p.trips || 0),
                        `${p.percentage || 0}%`
                    ]),
                    theme: 'plain',
                    headStyles: {
                        fillColor: [59, 130, 246],
                        textColor: 255,
                        fontStyle: 'bold',
                        fontSize: 6,
                        cellPadding: 1.5
                    },
                    bodyStyles: {
                        fontSize: 6,
                        cellPadding: 1.5,
                        textColor: [55, 65, 81]
                    },
                    alternateRowStyles: { fillColor: [248, 250, 252] },
                    columnStyles: {
                        0: { cellWidth: 20 },
                        1: { cellWidth: 18, halign: 'right' },
                        2: { cellWidth: 10, halign: 'center' },
                        3: { cellWidth: 10, halign: 'right' }
                    },
                    margin: { left: margin },
                    tableWidth: colW - 2
                });
            } else {
                
                doc.setFillColor(248, 250, 252);
                doc.roundedRect(margin, y, colW - 2, 35, 2, 2, 'F');
                doc.setDrawColor(226, 232, 240);
                doc.roundedRect(margin, y, colW - 2, 35, 2, 2, 'S');

                doc.setFontSize(7);
                doc.setTextColor(148, 163, 184);
                doc.text('No partner data available', margin + (colW - 2) / 2, y + 18, { align: 'center' });
            }

            const timelineX = margin + colW + 4;
            if (timelineData && timelineData.length > 0) {
                
                const activeHours = timelineData.filter(t => (t.trips || t.count || 0) > 0);
                const displayData = activeHours.length > 0 ? activeHours.slice(0, maxRows) : timelineData.slice(0, maxRows);

                autoTable(doc, {
                    startY: tableStartY,
                    head: [['Time', 'Trips']],
                    body: displayData.map(t => {
                        const timeStr = t.hour !== undefined ? `${String(t.hour).padStart(2, '0')}:00` : (t.time || '-');
                        return [timeStr, String(t.trips || t.count || 0)];
                    }),
                    theme: 'plain',
                    headStyles: {
                        fillColor: [139, 92, 246],
                        textColor: 255,
                        fontStyle: 'bold',
                        fontSize: 6,
                        cellPadding: 1.5
                    },
                    bodyStyles: {
                        fontSize: 6,
                        cellPadding: 1.5,
                        textColor: [55, 65, 81]
                    },
                    alternateRowStyles: { fillColor: [248, 250, 252] },
                    columnStyles: {
                        0: { cellWidth: 20 },
                        1: { cellWidth: 15, halign: 'center' }
                    },
                    margin: { left: timelineX },
                    tableWidth: colW - 2
                });
            } else {
                doc.setFillColor(248, 250, 252);
                doc.roundedRect(timelineX, y, colW - 2, 35, 2, 2, 'F');
                doc.setDrawColor(226, 232, 240);
                doc.roundedRect(timelineX, y, colW - 2, 35, 2, 2, 'S');

                doc.setFontSize(7);
                doc.setTextColor(148, 163, 184);
                doc.text('No timeline data', timelineX + (colW - 2) / 2, y + 18, { align: 'center' });
            }

            const footerY = pageHeight - 12;

            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.line(margin, footerY - 4, pageWidth - margin, footerY - 4);

            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 41, 59);
            doc.text('DEEVIA SOFTWARE INDIA PVT LTD', pageWidth / 2, footerY, { align: 'center' });

            doc.setFontSize(5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text('Advanced Logistics Control & Operational Intelligence System', pageWidth / 2, footerY + 4, { align: 'center' });

            doc.setFontSize(6);
            doc.text('Page 1 of 1', pageWidth - margin, footerY + 2, { align: 'right' });

            doc.save(`Producer_Dashboard_${userId}_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('PDF export error:', error);
        } finally {
            setIsExporting(false);
        }
    }, [userId]);

    useEffect(() => {
        setHeaderContent({
            right: (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginRight: '12px' }}>
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
                        title="Export Dashboard to PDF"
                    >
                        <FileDown size={14} />
                        {isExporting ? 'Exporting...' : 'Export PDF'}
                    </button>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'hsl(var(--text-muted))' }}>
                        {lastUpdated.toLocaleTimeString()}
                    </span>
                </div>
            )
        });

        return () => setHeaderContent({ left: null, center: null, right: null, forceLeftTitle: false });
    }, [lastUpdated, setHeaderContent, handleExportPDF, isExporting]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [monthly, perf, partners, time, tripList] = await Promise.all([
                api.get('/api/statistics/my-monthly-plan', { user_id: userId, role: 'producer' }),
                api.get('/api/statistics/my-performance', { user_id: userId, role: 'producer' }),
                api.get('/api/statistics/my-partner-breakdown', { user_id: userId, role: 'producer' }),
                api.get('/api/statistics/my-trip-timeline', { user_id: userId, role: 'producer' }),
                api.get('/api/statistics/my-trips', { user_id: userId, role: 'producer' })
            ]);
            setMonthlyPlan(monthly);
            setPerformance(perf);
            setPartnerBreakdown(partners.partners || []);
            setTimeline(time.timeline || []);
            setTrips(tripList.trips || []);
            setLastUpdated(new Date());
        } catch (err) {
            if (import.meta.env.DEV) {
                console.error('Failed to fetch producer statistics:', err);
            }
            setError(err.message || 'Failed to load statistics');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [userId]);

    if (loading && !performance) {
        return (
            <div className="producer-statistics">
                <div className="loading-state">
                    <div className="loading-spinner"></div>
                    <span>Loading your performance dashboard...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="producer-statistics">
                <div className="error-state">
                    <p>{error}</p>
                    <button onClick={fetchData} className="btn-primary-sm">Retry</button>
                </div>
            </div>
        );
    }

    return (
        <div className="producer-statistics compact-layout">
            <div className="statistics-content">
                <MonthlyPlanOverview data={monthlyPlan} userType="producer" userId={userId} lastUpdated={lastUpdated} onRefresh={fetchData} isRefreshing={loading} />
                <MyPerformanceCard data={performance} userType="producer" />

                <div className="two-column-section">
                    <PartnerBreakdown data={partnerBreakdown} partnerType="Consumer" />
                    <CompletionTimeline data={timeline} />
                </div>
            </div>
        </div>
    );
};

export default ProducerStatistics;
