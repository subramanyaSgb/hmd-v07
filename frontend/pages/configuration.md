# Configuration Page

See comprehensive documentation at:

[03-configuration.md](../../developer-docs/docs/frontend/pages/03-configuration.md)

## Quick Reference

**File:** `frontend/src/pages/Configuration.jsx`

**Route:** `/configuration`

**Access:** Admin only

**Purpose:** HM Matrix configuration for travel times, fill times, and unload times between plant nodes.

## Key Features

- Matrix-style input grid (Producers x Consumers)
- Travel time configuration (minutes)
- Fill time per producer (minutes)
- Unload time per consumer (minutes)
- System settings integration
- Input validation
- Bulk save with confirmation

## Data Structure

**HM Matrix:**
```javascript
{
  "BF1_to_SMS1": 15,  // Travel time in minutes
  "BF1_to_SMS2": 20,
  "BF2_to_SMS1": 18,
  // ... etc
}
```

**Additional Settings:**
- `TRAVEL_TO_PRODUCER_MINUTES` - Time from depot to producer after assignment
- `EXIT_BUFFER_MINUTES` - Buffer after loading/unloading before exit
- `DEFAULT_WAIT_TIME`, `DEFAULT_FILL_TIME`, `DEFAULT_UNLOAD_TIME`, `DEFAULT_TRAVEL_TIME`

## API Endpoints Used

- `POST /api/config/hm-matrix` - Save HM Matrix configuration
- `GET /api/config/system-settings` - Fetch system settings
- `POST /api/config/system-settings/bulk` - Update system settings

## Related Documentation

- [System Configuration](../../developer-docs/docs/08-business-logic/system-configuration.md)
- [Backend Config Routes](../../developer-docs/docs/backend/routes/config.md)
- [Frontend Overview](../FRONTEND_OVERVIEW.md)
