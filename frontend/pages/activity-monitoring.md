# Activity Monitoring Page

See comprehensive documentation at:

[07-activity-monitoring.md](../../developer-docs/docs/frontend/pages/07-activity-monitoring.md)

## Quick Reference

**File:** `frontend/src/pages/ActivityMonitoring.jsx`

**Route:** `/audit`

**Access:** Admin only

**Purpose:** Comprehensive audit trail viewer with filtering, search, and export capabilities.

## Key Features

- Paginated activity log table (50 entries per page)
- Advanced filtering:
  - Date range selection
  - Action type (Create, Update, Delete)
  - Entity type (Trip, Plan, Fleet, User, Config)
  - User filter
  - Search by description
- Activity summary cards
- Activity trends chart (Recharts line chart)
- Export functionality (PDF, Excel, CSV)
- Real-time log updates

## Data Structure

**Activity Log Entry:**
```javascript
{
  id: number,
  user_id: number,
  username: string,
  action: "CREATE" | "UPDATE" | "DELETE" | "LOGIN" | "LOGOUT",
  entity_type: "Trip" | "Plan" | "Fleet" | "User" | "Config",
  entity_id: number | null,
  description: string,
  changes: object | null,  // Diff of before/after values
  ip_address: string,
  user_agent: string,
  timestamp: string,  // ISO 8601 format
}
```

## API Endpoints Used

- `GET /api/activity-logs` - Fetch paginated activity logs with filters
- `GET /api/activity-logs/export` - Export logs (PDF/Excel/CSV)

## Components Used

- `ActivitySummaryCards` - Summary statistics cards
- `ActivityCharts` - Trend visualization (Recharts)
- `DateRangePicker` - Date range selector
- `ExportDropdown` - Export format selector

## Related Documentation

- [Audit Trail System](../../developer-docs/docs/08-business-logic/audit-trail.md)
- [Backend Activity Logger](../../developer-docs/docs/backend/utils/activity-logger.md)
- [Reports API](../../developer-docs/docs/backend/routes/reports.md)
- [Frontend Overview](../FRONTEND_OVERVIEW.md)
