import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const exportPlanToPDF = (plan) => {
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

        const tableMargin = { left: margin, right: margin, bottom: bottomMargin };

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
        doc.text('Planning Data', pageWidth / 2, 12, { align: 'center' });

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(200, 220, 255);
        doc.text(`${plan.plan_id || plan.plan_name}`, pageWidth / 2, 19, { align: 'center' });

        doc.setFontSize(7);
        doc.setTextColor(180, 200, 255);
        const planDate = new Date(plan.date).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
        doc.text(`Date: ${planDate} | Status: ${plan.status}`, pageWidth - margin, 14, { align: 'right' });
        doc.setFontSize(5);
        doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 20, { align: 'right' });

        yPos = 38;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(23, 37, 84);
        doc.text('SUMMARY METRICS', margin, yPos);
        yPos += 4;

        const summaryData = [
            ['Production', `${(plan.summary.total_production_mt || 0).toLocaleString()} MT`, 'Consumption', `${(plan.summary.total_consumption_mt || 0).toLocaleString()} MT`],
            ['Planned Trips', String(plan.summary.planned_trips ?? plan.summary.total_trips ?? 0), 'Manual Trips', String(plan.summary.manual_trips ?? 0)],
            ['Completed', String(plan.summary.completed_trips ?? 0), 'Fulfillment', `${plan.summary.fulfillment_rate ?? 0}%`],
            ['Avg Cycle', `${plan.summary.avg_cycle_time_minutes ?? 0} min`, 'Fleet Util.', `${plan.summary.fleet_utilization ?? 0}%`]
        ];

        autoTable(doc, {
            startY: yPos,
            body: summaryData,
            theme: 'plain',
            styles: { fontSize: 7, cellPadding: 2 },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 30, textColor: [100, 100, 100] },
                1: { cellWidth: 35, fontStyle: 'bold', textColor: [23, 37, 84] },
                2: { fontStyle: 'bold', cellWidth: 30, textColor: [100, 100, 100] },
                3: { cellWidth: 35, fontStyle: 'bold', textColor: [23, 37, 84] }
            },
            margin: tableMargin,
            tableWidth: 'auto'
        });

        yPos = doc.lastAutoTable.finalY + 8;

        if (plan.producers && plan.producers.length > 0) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(23, 37, 84);
            doc.text('PRODUCER PERFORMANCE', margin, yPos);
            yPos += 4;

            const producerData = plan.producers.map(p => [
                p.user_id || '-',
                `${(p.planned || 0).toLocaleString()} MT`,
                `${(p.actual || 0).toLocaleString()} MT`,
                p.planned > 0 ? `${Math.round((p.actual / p.planned) * 100)}%` : '-',
                p.status || 'Operating'
            ]);

            autoTable(doc, {
                startY: yPos,
                head: [['Node', 'Planned', 'Delivered', 'Rate', 'Status']],
                body: producerData,
                theme: 'striped',
                headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 7 },
                styles: { fontSize: 7, cellPadding: 2 },
                margin: tableMargin
            });

            yPos = doc.lastAutoTable.finalY + 8;
        }

        if (plan.consumers && plan.consumers.length > 0) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(23, 37, 84);
            doc.text('CONSUMER PERFORMANCE', margin, yPos);
            yPos += 4;

            const consumerData = plan.consumers.map(c => [
                c.user_id || '-',
                `${(c.planned || 0).toLocaleString()} MT`,
                `${(c.actual || 0).toLocaleString()} MT`,
                c.planned > 0 ? `${Math.round((c.actual / c.planned) * 100)}%` : '-',
                c.status || 'Operating'
            ]);

            autoTable(doc, {
                startY: yPos,
                head: [['Node', 'Planned', 'Received', 'Rate', 'Status']],
                body: consumerData,
                theme: 'striped',
                headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold', fontSize: 7 },
                styles: { fontSize: 7, cellPadding: 2 },
                margin: tableMargin
            });

            yPos = doc.lastAutoTable.finalY + 8;
        }

        if (plan.routes && plan.routes.length > 0) {
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(23, 37, 84);
            doc.text('ROUTE SUMMARY', margin, yPos);
            yPos += 4;

            const routeData = plan.routes.map(r => [
                `${r.producer_id || '-'} → ${r.consumer_id || '-'}`,
                String(r.planned_trips || 0),
                String(r.completed_trips || 0),
                r.planned_trips > 0 ? `${Math.round((r.completed_trips / r.planned_trips) * 100)}%` : '-'
            ]);

            autoTable(doc, {
                startY: yPos,
                head: [['Route', 'Planned', 'Completed', 'Rate']],
                body: routeData,
                theme: 'striped',
                headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold', fontSize: 7 },
                styles: { fontSize: 7, cellPadding: 2 },
                margin: tableMargin
            });

            yPos = doc.lastAutoTable.finalY + 8;

            for (const route of plan.routes) {
                if (route.trips && route.trips.length > 0) {
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(59, 130, 246);
                    doc.text(`${route.producer_id} → ${route.consumer_id} - Trip Timeline`, margin, yPos);
                    yPos += 3;

                    const tripData = route.trips.map(t => {
                        const timeline = t.timeline || {};
                        return [
                            t.trip_id?.split('_').slice(-2).join('_') || '-',
                            t.torpedo_id || '-',
                            formatTime(timeline.assigned_at),
                            formatTime(timeline.p_entered_at),
                            formatTime(timeline.p_loading_end_at),
                            formatTime(timeline.p_exited_at),
                            formatTime(timeline.c_entered_at),
                            formatTime(timeline.c_exited_at),
                            t.cycle_time_minutes ? `${Math.round(t.cycle_time_minutes)}m` : '-'
                        ];
                    });

                    autoTable(doc, {
                        startY: yPos,
                        head: [['Trip', 'Asset', 'Assign', 'P.In', 'Load', 'P.Out', 'C.In', 'C.Out', 'Cycle']],
                        body: tripData,
                        theme: 'grid',
                        headStyles: { fillColor: [100, 116, 139], textColor: 255, fontStyle: 'bold', fontSize: 6 },
                        styles: { fontSize: 5.5, cellPadding: 1.5 },
                        columnStyles: {
                            0: { cellWidth: 22 },
                            1: { cellWidth: 14 },
                            2: { cellWidth: 18 },
                            3: { cellWidth: 18 },
                            4: { cellWidth: 18 },
                            5: { cellWidth: 18 },
                            6: { cellWidth: 18 },
                            7: { cellWidth: 18 },
                            8: { cellWidth: 12 }
                        },
                        margin: tableMargin,
                        showHead: 'everyPage'
                    });

                    yPos = doc.lastAutoTable.finalY + 6;
                }
            }
        }

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

        const fileName = `PlanningData_${(plan.plan_id || plan.plan_name || 'report').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        doc.save(fileName);
    } catch (error) {
        
        if (import.meta.env.DEV) {
            console.error('PDF Generation Error:', error);
        }
        alert('Failed to generate PDF. Please try again.');
    }
};
