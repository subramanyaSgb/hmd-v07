# Reports Page

See comprehensive documentation at:

[06-reports.md](../../developer-docs/docs/frontend/pages/06-reports.md)

## Quick Reference

**File:** `frontend/src/pages/Reports.jsx`

**Route:** `/reports`

**Access:** Admin only

**Purpose:** Comprehensive report generation and export system with multiple report types and formats.

## Key Features

- Report type selection:
  - Trip Summary Report
  - Fleet Utilization Report
  - Producer Performance Report
  - Consumer Performance Report
  - Deviation Analysis Report
  - Maintenance Report
- Date range selection
- Export formats:
  - PDF (jsPDF)
  - Excel (XLSX)
  - CSV
- Preview before export
- Scheduled reports (future feature)
- Report templates

## Report Types

### 1. Trip Summary Report
- Total trips (planned, completed, in-progress)
- Completion rate percentage
- Average trip duration
- Status distribution (on-time, delayed, critical)
- Route-level breakdown

### 2. Fleet Utilization Report
- Total torpedoes
- Operational vs maintenance count
- Utilization rate percentage
- Average trips per torpedo
- Maintenance schedule summary

### 3. Producer Performance Report
- Trips per producer
- Average loading time
- Deviation statistics
- Capacity utilization
- Top performers

### 4. Consumer Performance Report
- Trips per consumer
- Average unloading time
- Deviation statistics
- Demand fulfillment rate
- Top consumers

### 5. Deviation Analysis Report
- Deviation summary (early, on-time, warning, alert, critical)
- Root cause analysis (shift, route, day of week)
- Trend analysis over time
- Phase-level breakdown

### 6. Maintenance Report
- Scheduled vs completed maintenance
- Maintenance duration statistics
- Torpedo downtime analysis
- Upcoming maintenance calendar

## Export Implementation

**PDF Export:**
```javascript
import jsPDF from 'jspdf'
import 'jspdf-autotable'

const exportPDF = (data, reportType) => {
  const doc = new jsPDF()
  doc.text(reportType, 14, 20)
  doc.autoTable({
    head: [headers],
    body: data,
    startY: 30,
  })
  doc.save(`${reportType}_${new Date().toISOString()}.pdf`)
}
```

**Excel Export:**
```javascript
import * as XLSX from 'xlsx'

const exportExcel = (data, reportType) => {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')
  XLSX.writeFile(wb, `${reportType}_${new Date().toISOString()}.xlsx`)
}
```

## API Endpoints Used

- `GET /api/reports/trip-summary` - Trip summary data
- `GET /api/reports/fleet-utilization` - Fleet utilization data
- `GET /api/reports/producer-performance` - Producer performance data
- `GET /api/reports/consumer-performance` - Consumer performance data
- `GET /api/reports/deviation-analysis` - Deviation analysis data
- `GET /api/reports/maintenance` - Maintenance report data
- `POST /api/reports/export` - Server-side export generation

## Components Used

- `DateRangePicker` - Date range selector
- `ExportDropdown` - Export format selector
- Report preview tables
- Loading states
- Error handling

## Related Documentation

- [Backend Reports Routes](../../developer-docs/docs/backend/routes/reports.md)
- [PDF Export Utility](../../developer-docs/docs/frontend/utils/pdfExport.md)
- [Reports API Integration](../../developer-docs/docs/frontend/utils/reportsApi.md)
- [Frontend Overview](../FRONTEND_OVERVIEW.md)
