# Maintenance Scheduling Page

See comprehensive documentation at:

[08-maintenance-scheduling.md](../../developer-docs/docs/frontend/pages/08-maintenance-scheduling.md)

## Quick Reference

**File:** `frontend/src/pages/MaintenanceScheduling.jsx`

**Route:** `/maintenance`

**Access:** Admin only

**Purpose:** Calendar-based maintenance scheduling for torpedo fleet with conflict detection and status management.

## Key Features

- Monthly calendar view with maintenance events
- Add/Edit/Delete maintenance schedules
- Torpedo selection dropdown
- Maintenance type classification:
  - Routine Maintenance
  - Emergency Repair
  - Inspection
- Status tracking:
  - Scheduled
  - In Progress
  - Completed
- Conflict detection (overlapping schedules)
- Visual indicators for maintenance types
- Notes and duration management

## Data Structure

**Maintenance Schedule:**
```javascript
{
  id: number,
  torpedo_id: number,
  torpedo_name: string,
  start_date: string,  // YYYY-MM-DD
  end_date: string,    // YYYY-MM-DD
  type: "Routine" | "Emergency" | "Inspection",
  status: "Scheduled" | "In Progress" | "Completed",
  notes: string | null,
  created_at: string,
  updated_at: string,
}
```

## API Endpoints Used

- `GET /api/maintenance` - Fetch all maintenance schedules
- `POST /api/maintenance` - Create new maintenance schedule
- `PUT /api/maintenance/{id}` - Update existing schedule
- `DELETE /api/maintenance/{id}` - Delete schedule
- `GET /api/fleet` - Fetch torpedo list for selection

## Fleet Status Impact

When maintenance is scheduled:
- Torpedo status automatically set to "Maintenance"
- Torpedo removed from available fleet pool
- Cannot be assigned to trips during maintenance period
- Status restored to "Operating" upon completion

## Related Documentation

- [Fleet Management](../../developer-docs/docs/08-business-logic/fleet-management.md)
- [Backend Maintenance Routes](../../developer-docs/docs/backend/routes/maintenance.md)
- [Frontend Overview](../FRONTEND_OVERVIEW.md)
