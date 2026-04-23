# Settings Page

See comprehensive documentation at:

[10-settings.md](../../developer-docs/docs/frontend/pages/10-settings.md)

## Quick Reference

**File:** `frontend/src/pages/Settings.jsx`

**Route:** `/settings`

**Access:** All authenticated users

**Purpose:** User settings and preferences management including profile, notifications, display preferences, and system settings (admin only).

## Key Features

### User Settings (All Users)
- Profile information display
- Password change
- Email notifications toggle
- Desktop notifications toggle
- Theme preference (light/dark)
- Language selection (future)
- Timezone selection (future)

### System Settings (Admin Only)
- System-wide configuration
- Default values for trip calculations
- Alert thresholds
- Notification templates
- Performance tuning parameters
- Integration settings

## Settings Categories

### 1. Profile Settings
```javascript
{
  username: string,
  email: string,
  role: "admin" | "producer" | "consumer",
  full_name: string,
  phone: string | null,
  last_login: string,
}
```

### 2. Notification Preferences
```javascript
{
  email_notifications: boolean,
  desktop_notifications: boolean,
  notification_types: {
    trip_alerts: boolean,
    deviation_alerts: boolean,
    maintenance_reminders: boolean,
    daily_summary: boolean,
  }
}
```

### 3. Display Preferences
```javascript
{
  theme: "light" | "dark",
  language: "en" | "es" | "hi",  // Future
  timezone: string,               // Future
  date_format: "MM/DD/YYYY" | "DD/MM/YYYY",
  time_format: "12h" | "24h",
}
```

### 4. System Settings (Admin)
```javascript
{
  // Trip Calculation Defaults
  DEFAULT_WAIT_TIME: number,
  DEFAULT_FILL_TIME: number,
  DEFAULT_UNLOAD_TIME: number,
  DEFAULT_TRAVEL_TIME: number,
  TRAVEL_TO_PRODUCER_MINUTES: number,
  EXIT_BUFFER_MINUTES: number,

  // Deviation Thresholds
  WARNING_THRESHOLD_MINUTES: number,    // Default: 10
  ALERT_THRESHOLD_MINUTES: number,      // Default: 20
  CRITICAL_THRESHOLD_MINUTES: number,   // Default: 30

  // Security Settings
  MAX_LOGIN_ATTEMPTS: number,           // Default: 5
  LOCKOUT_DURATION_MINUTES: number,     // Default: 15
  ACCESS_TOKEN_EXPIRE_MINUTES: number,  // Default: 480

  // Performance Settings
  CACHE_ENABLED: boolean,
  RATE_LIMIT_ENABLED: boolean,
  OTEL_ENABLED: boolean,
}
```

## API Endpoints Used

- `GET /api/users/me` - Fetch current user profile
- `PUT /api/users/me` - Update user profile
- `POST /api/users/change-password` - Change password
- `GET /api/users/preferences` - Fetch user preferences
- `PUT /api/users/preferences` - Update user preferences
- `GET /api/config/system-settings` - Fetch system settings (admin)
- `POST /api/config/system-settings/bulk` - Update system settings (admin)

## Components

### Profile Section
- Display user information
- Edit profile form
- Password change modal

### Notifications Section
- Toggle switches for notification types
- Email notifications on/off
- Desktop notifications on/off (requires browser permission)

### Display Section
- Theme toggle (light/dark)
- Language dropdown
- Timezone selector
- Date/time format options

### System Section (Admin Only)
- Categorized settings groups
- Input validation
- Save confirmation
- Reset to defaults option

## Password Change Flow

1. User clicks "Change Password"
2. Modal opens with three fields:
   - Current password
   - New password
   - Confirm new password
3. Validation:
   - Current password correct
   - New password meets requirements (8+ chars, uppercase, lowercase, number)
   - Passwords match
4. Submit to `/api/users/change-password`
5. Success: Show notification, close modal
6. Error: Display error message

## Desktop Notifications

**Browser Permission Request:**
```javascript
const requestNotificationPermission = async () => {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }
  return false
}
```

**Send Test Notification:**
```javascript
const sendTestNotification = () => {
  if (Notification.permission === 'granted') {
    new Notification('HMD System', {
      body: 'Test notification from HMD System',
      icon: '/logo.png',
      badge: '/badge.png',
    })
  }
}
```

## Theme Integration

Settings page integrates with ThemeContext:

```javascript
import { useTheme } from '../context/ThemeContext'

const { theme, toggleTheme } = useTheme()

<button onClick={toggleTheme}>
  Current Theme: {theme}
</button>
```

## Validation Rules

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (optional)

### Email Format
- Valid email format (RFC 5322)
- Maximum 255 characters

### Phone Format
- Optional field
- International format accepted
- Minimum 10 digits

## Security Considerations

1. **Password Change:**
   - Requires current password verification
   - New password hashed with bcrypt
   - Session invalidated on password change

2. **Sensitive Settings:**
   - System settings restricted to admin
   - Rate limiting on settings updates
   - Audit log for settings changes

3. **Data Privacy:**
   - Personal information encrypted in transit (HTTPS)
   - Passwords never displayed or returned in API responses
   - User preferences stored per-user

## Related Documentation

- [User Management](../../developer-docs/docs/08-business-logic/user-management.md)
- [Backend Users Routes](../../developer-docs/docs/backend/routes/users.md)
- [System Configuration](../../developer-docs/docs/08-business-logic/system-configuration.md)
- [Theme Context](../../developer-docs/docs/frontend/context/ThemeContext.md)
- [Frontend Overview](../FRONTEND_OVERVIEW.md)
