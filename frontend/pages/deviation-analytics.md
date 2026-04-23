# Deviation Analytics Page

See comprehensive documentation at:

[05-deviation-analytics.md](../../developer-docs/docs/frontend/pages/05-deviation-analytics.md)

## Quick Reference

**File:** `frontend/src/pages/DeviationAnalytics.jsx`

**Route:** `/analytics/deviation`

**Access:** Admin only

**Purpose:** Comprehensive deviation analysis dashboard with:
- Deviation summary cards (On-Time, Warning, Alert, Critical)
- Trend analysis charts (daily/monthly)
- Root cause analysis (by shift, day of week, route)
- Producer/consumer breakdown
- Phase-level analysis (Loading, Transit, Unloading)
- Period-over-period comparison

## Key Features

- 6 specialized deviation analytics endpoints
- Interactive date range filtering
- Recharts visualizations (line, bar, pie charts)
- Dark mode support
- Real-time data refresh

## API Endpoints Used

- `/api/statistics/deviation-summary`
- `/api/statistics/deviation-trends`
- `/api/statistics/deviation-by-node`
- `/api/statistics/deviation-by-phase`
- `/api/statistics/root-cause-analysis`
- `/api/statistics/deviation-comparison`

## Related Documentation

- [Backend Deviation Analytics API](../../developer-docs/docs/backend/routes/deviation-analytics.md)
- [Recharts Guide](../charts/recharts-guide.md)
- [Frontend Overview](../FRONTEND_OVERVIEW.md)
