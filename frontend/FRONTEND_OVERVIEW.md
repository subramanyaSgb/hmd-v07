# Frontend Overview - HMD System

## Introduction

The Hot Metal Distribution (HMD) System frontend is a modern, production-grade React 19 application built with Vite 7. It provides a comprehensive interface for managing hot metal transportation logistics across steel plant facilities, featuring real-time monitoring, trip management, fleet operations, and strategic planning capabilities.

## Technology Stack

### Core Framework
- **React 19.2.0** - Latest stable release with concurrent features
- **React Router DOM 7.13.0** - URL-based navigation with role-based route protection
- **Vite 7.2.4** - Next-generation frontend build tool with HMR

### UI Libraries
- **Lucide React 0.562.0** - Modern icon library (800+ icons)
- **Recharts 3.6.0** - Composable charting library built on D3
- **Leaflet 1.9.4** + React-Leaflet 5.0.0 - Interactive maps for geospatial tracking
- **date-fns 3.0.0** - Modern date utility library

### Export & Reporting
- **jsPDF 4.0.0** - Client-side PDF generation
- **jspdf-autotable 5.0.7** - Table plugin for jsPDF
- **XLSX 0.18.5** - Excel file generation

### TypeScript Support
- **TypeScript 5.9.3** - Incremental migration to TypeScript
- Type definitions for React, Node, and dependencies
- `.ts` and `.tsx` files coexist with `.jsx` files

## Architecture Overview

### Application Structure

```
frontend/
├── index.html              # Entry HTML file
├── vite.config.js          # Vite configuration
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── src/
    ├── main.jsx            # React entry point with StrictMode
    ├── App.jsx             # Main router with role-based routes
    ├── index.css           # Global styles and CSS variables
    ├── App.css             # App-specific styles
    ├── pages/              # Page components (17 pages)
    ├── components/         # Reusable UI components
    ├── context/            # React Context providers (4)
    ├── utils/              # Utility functions and API client
    └── types/              # TypeScript type definitions
```

### Key Design Principles

1. **Role-Based Access Control (RBAC)**
   - Three roles: `admin`, `producer`, `consumer`
   - Routes protected at router level
   - Component-level UI rendering based on role
   - Enforced on both frontend and backend

2. **Context-Driven State Management**
   - `AuthContext` - User authentication and session
   - `ThemeContext` - Light/dark mode theming
   - `NotificationContext` - Toast notifications
   - `HeaderContext` - Dynamic page title injection

3. **API-First Architecture**
   - Centralized API client (`utils/api.ts`)
   - JWT token management with automatic refresh
   - Structured error handling with user-friendly messages
   - Request/response interceptors for auth headers

4. **Real-Time Data Sync**
   - Polling-based updates (5-10 second intervals)
   - Manual refresh capabilities
   - Optimistic UI updates for better UX
   - Automatic cache invalidation

5. **Responsive Design**
   - Mobile-first CSS approach
   - Fluid layouts with CSS Grid and Flexbox
   - Breakpoint-based responsive components
   - Touch-friendly interactive elements

## Page Components (17 Total)

### Authentication
- **LoginPage** - JWT-based authentication interface

### Dashboard & Monitoring
- **Dashboard** - Real-time geospatial tracking with Leaflet maps
- **Operations** - Node-specific operations view (producer/consumer)
- **LiveOperations** - Real-time trip monitoring with deviation tracking
- **Statistics** - Analytics with role-specific views (admin/producer/consumer)
- **DeviationAnalytics** - Admin-only deviation analysis with trends and root cause

### Planning & Scheduling
- **DailyPlanning** - Daily capacity planning (producer/consumer)
- **MonthlyPlanning** - Strategic planning hub with 4 tabs:
  - Executive Dashboard (daily operations monitoring)
  - Strategic Planning (monthly calendar)
  - Logistics Configuration (travel time matrix)
  - Maintenance Scheduling (downtime calendar)
- **Configuration** - HM Matrix configuration (travel times, fill/unload times)
- **MaintenanceScheduling** - Maintenance calendar scheduling

### Trip & Fleet Management
- **TripManagement** - Trip lifecycle with 4 views (Overview, Dispatch, Live Monitor, History)
- **FleetManagement** - Torpedo fleet registry with CRUD operations

### Reporting & Audit
- **Reports** - Report generation with export options (admin)
- **ActivityMonitoring** - Audit trail viewer with filtering (admin)

### System
- **Settings** - User settings and preferences

### Legacy (Reference Only)
- **AdminPlanning** - Legacy planning component (superseded by MonthlyPlanning)
- **PlanningHistory** - Legacy history view (integrated into MonthlyPlanning)

## Navigation & Routing

### Route Configuration

```javascript
export const ROUTE_CONFIG = {
  '/': 'Hot Metal Distribution System',
  '/statistics': 'Operational Analytics',
  '/analytics/deviation': 'Deviation Analytics',
  '/planning/monthly': 'Strategic Planning',
  '/planning/daily': 'Daily Planning',
  '/trips': 'Trip Management',
  '/fleet': 'Torpedo Management',
  '/audit': 'Audit Trail',
  '/operations': 'Node Operations',
  '/configuration': 'Logistics Configuration',
  '/maintenance': 'Maintenance Scheduling',
  '/reports': 'Reports',
  '/settings': 'Settings',
}
```

### Access Control Matrix

| Route | Component | Access |
|-------|-----------|--------|
| `/` | Dashboard | All authenticated |
| `/statistics` | Statistics | All authenticated |
| `/analytics/deviation` | DeviationAnalytics | Admin only |
| `/planning/monthly` | MonthlyPlanning | Admin only |
| `/planning/daily` | DailyPlanning | Producer/Consumer |
| `/trips` | TripManagement | All authenticated |
| `/fleet` | FleetManagement | Admin only |
| `/audit` | ActivityMonitoring | Admin only |
| `/operations` | Operations | Producer/Consumer |
| `/configuration` | Configuration | Admin only |
| `/maintenance` | MaintenanceScheduling | Admin only |
| `/reports` | Reports | Admin only |
| `/settings` | Settings | All authenticated |

### Navigation Components
- **Sidebar** - Left navigation with role-based menu items
- **Header** - Top bar with notifications, theme toggle, user menu
- **Footer** - Bottom bar with system info

## Context Providers

### AuthContext
**File:** `src/context/AuthContext.jsx`

Manages user authentication state and session persistence.

**Features:**
- JWT token storage (sessionStorage)
- User session management
- Login/logout/refresh token operations
- Role-based access helpers

**API:**
```javascript
const { user, login, logout, refreshToken, isLoading } = useAuth()
```

### ThemeContext
**File:** `src/context/ThemeContext.jsx`

Provides light/dark mode theming capabilities.

**Features:**
- Theme persistence (localStorage)
- Dynamic CSS variable injection
- Smooth theme transitions

**API:**
```javascript
const { theme, toggleTheme } = useTheme()
```

### NotificationContext
**File:** `src/context/NotificationContext.jsx`

Toast notification system for user feedback.

**Features:**
- Success/error/warning/info toast types
- Auto-dismiss with configurable duration
- Queue management for multiple notifications
- Position and animation control

**API:**
```javascript
const { notify } = useNotification()
notify.success('Operation completed')
notify.error('Failed to save', 5000)
```

### HeaderContext
**File:** `src/context/HeaderContext.jsx`

Dynamic header content injection for page-specific controls.

**Features:**
- Page title management
- Custom header action buttons
- Breadcrumb injection

**API:**
```javascript
const { setHeaderContent } = useHeaderContext()
setHeaderContent({ title: 'Custom Title', actions: <CustomButtons /> })
```

## API Integration

### Centralized API Client
**File:** `src/utils/api.ts` (TypeScript)

Type-safe HTTP client with JWT authentication.

**Features:**
- Automatic JWT token injection
- Request/response interceptors
- Token refresh on 401 errors
- Structured error handling
- CSRF token support
- Correlation ID tracking

**Usage:**
```typescript
import { api } from './utils/api';

// GET request
const trips = await api.get<Trip[]>('/api/trips', { status: 'active' });

// POST request
const result = await api.post('/api/plans', {
  date: '2024-01-20',
  capacity: 100
});

// With error handling
try {
  const data = await api.put(`/api/trips/${tripId}/status`, { status: 2 });
} catch (error) {
  console.error('API Error:', error.message);
}
```

### API Endpoints

The frontend integrates with the FastAPI backend at `http://localhost:8000/api/`. Key endpoint categories:

- **Auth:** `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`
- **Trips:** `/api/trips`, `/api/trips/{id}/status`, `/api/trips/active`
- **Planning:** `/api/daily-plans`, `/api/monthly-plans`, `/api/distributions/optimize`
- **Fleet:** `/api/fleet`, `/api/fleet/{id}/maintenance`
- **Config:** `/api/config/hm-matrix`, `/api/config/system-settings`
- **Monitoring:** `/api/live-ops/trips`, `/api/activity-logs`
- **Analytics:** `/api/statistics/*`, `/api/analytics/deviation/*`

See [API Documentation](../developer-docs/docs/07-api/) for complete endpoint reference.

## Styling System

### CSS Architecture

The application uses a CSS custom properties-based theming system with two modes:

1. **Light Mode** (Default)
   - Clean, professional appearance
   - High contrast for readability
   - Subtle shadows and borders

2. **Dark Mode** (Premium Gaming Style)
   - True dark backgrounds (#0a0a0a)
   - Golden accents (#d4a842)
   - Enhanced contrast for OLED displays

### CSS Variables

**Global variables in `index.css`:**
```css
:root {
  /* Colors */
  --primary: 224 71% 4%;           /* Deep midnight */
  --accent: 217 91% 60%;            /* Electric Blue */
  --success: 142 71% 40%;           /* Forest Green */
  --warning: 38 92% 50%;            /* Amber */
  --danger: 0 84% 60%;              /* Red */

  /* Backgrounds */
  --sidebar-bg: 0 0% 100%;
  --main-bg: 210 40% 98%;
  --card-bg: 0 0% 100%;

  /* Text */
  --text-main: 215 25% 15%;
  --text-muted: 215 16% 47%;

  /* Borders */
  --border-color: 214 32% 91%;

  /* Spacing */
  --sidebar-width: 280px;
  --header-height: 80px;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.05);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.08);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
}
```

**Dark mode overrides:**
```css
[data-theme="dark"] {
  --primary: 43 89% 55%;            /* Golden */
  --sidebar-bg: 0 0% 6%;
  --main-bg: 0 0% 4%;
  --card-bg: 0 0% 8%;
  --text-main: 0 0% 92%;
  --text-muted: 0 0% 55%;
  --border-color: 0 0% 16%;
}
```

### Styling Best Practices

1. **Use CSS Variables**
   ```css
   /* Good */
   background: var(--bg-secondary);
   color: hsl(var(--text-main));

   /* Avoid */
   background: white;
   color: #0f172a;
   ```

2. **Theme-Aware Components**
   ```javascript
   import { useTheme } from '../context/ThemeContext'

   const { theme } = useTheme()
   const isDarkMode = theme === 'dark'

   const chartColors = {
     axisText: isDarkMode ? '#94a3b8' : '#64748b',
     gridStroke: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
   }
   ```

3. **Premium UI Patterns**
   - Card hover effects: `transform: translateY(-2px)` with box-shadow
   - Accent bars: `::before` pseudo-element with gradient
   - Rounded corners: `border-radius: 8px-16px` for cards
   - Icons with colored backgrounds in summary cards
   - KPI cards with colored left border: `border-left: 3px solid ${color}`

See [Theming Documentation](../developer-docs/docs/frontend/styling/theming.md) for complete guide.

## Data Visualization

### Recharts Integration

The application uses Recharts for all data visualization needs.

**Chart Types Used:**
- **LineChart** - Trend analysis (deviation trends, performance over time)
- **BarChart** - Comparative analysis (producer vs consumer, shift comparison)
- **PieChart** - Distribution breakdown (status distribution, route breakdown)
- **AreaChart** - Cumulative metrics (capacity utilization, trip volume)
- **ComposedChart** - Multi-metric views (planned vs actual with trend lines)

**Common Chart Configuration:**
```javascript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { useTheme } from '../context/ThemeContext'

const { theme } = useTheme()
const isDarkMode = theme === 'dark'

<LineChart data={data} width={800} height={400}>
  <CartesianGrid
    strokeDasharray="3 3"
    stroke={isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
  />
  <XAxis
    dataKey="date"
    stroke={isDarkMode ? '#94a3b8' : '#64748b'}
    tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b' }}
  />
  <YAxis
    stroke={isDarkMode ? '#94a3b8' : '#64748b'}
    tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b' }}
  />
  <Tooltip
    contentStyle={{
      backgroundColor: isDarkMode ? 'hsl(0 0% 8%)' : 'white',
      border: `1px solid ${isDarkMode ? 'hsl(0 0% 16%)' : 'hsl(214 32% 91%)'}`,
      color: isDarkMode ? 'hsl(0 0% 92%)' : 'hsl(215 25% 15%)'
    }}
  />
  <Legend />
  <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} />
</LineChart>
```

See [Recharts Guide](../developer-docs/docs/frontend/charts/recharts-guide.md) for comprehensive examples.

## Development Workflow

### Getting Started

```bash
cd frontend
npm install
npm run dev      # Dev server on http://localhost:5173
```

### Available Scripts

```bash
npm run dev      # Start Vite dev server with HMR
npm run build    # Production build (outputs to dist/)
npm run preview  # Preview production build locally
npm run lint     # Run ESLint checks
```

### Environment Configuration

The frontend connects to the backend via hardcoded API base URL in `api.ts`:

```typescript
const API_BASE_URL = 'http://localhost:8000';
```

For production deployments, update this to your production backend URL.

### Code Organization

**Component Categories:**
- **Pages** (`pages/`) - Full-page components mapped to routes
- **Shared Components** (`components/`) - Reusable UI elements
- **Context Providers** (`context/`) - Global state management
- **Utilities** (`utils/`) - Helper functions and API client
- **Types** (`types/`) - TypeScript type definitions

**Naming Conventions:**
- PascalCase for components: `TripManagement.jsx`
- camelCase for utilities: `pdfExport.js`
- kebab-case for CSS classes: `.trip-card-header`

### Error Handling

**Structured Error Responses:**
```typescript
interface APIError {
  success: false;
  error: string;
  error_code: string;
  message: string;
  details?: Record<string, any>;
  field_errors?: Array<{
    field: string;
    message: string;
    code: string;
  }>;
  request_id?: string;
}
```

**Frontend Error Handling:**
```javascript
try {
  const data = await api.post('/api/trips', tripData);
  notify.success('Trip created successfully');
} catch (error) {
  // error.message contains user-friendly message
  notify.error(error.message || 'Failed to create trip');

  // error.details contains field-level validation errors
  if (error.details?.field_errors) {
    error.details.field_errors.forEach(fe => {
      console.error(`${fe.field}: ${fe.message}`);
    });
  }
}
```

## Performance Optimization

### Lazy Loading
Routes and heavy components are lazily loaded using React.lazy and Suspense.

### Memoization
Expensive computations and component renders are memoized using:
- `React.memo()` for component memoization
- `useMemo()` for computed values
- `useCallback()` for event handlers

### Virtual Scrolling
Large tables use virtualization to render only visible rows.

### Image Optimization
Images are optimized and served via CDN where applicable.

## Security Considerations

### Authentication
- JWT tokens stored in sessionStorage (cleared on tab close)
- Automatic token refresh before expiration
- Logout clears all session data

### CSRF Protection
- CSRF tokens in `X-CSRF-Token` header for mutations
- Token fetched from `/api/csrf-token` endpoint
- Auto-refresh on token expiration

### Input Validation
- Client-side validation for user inputs
- Server-side validation enforced (never trust client)
- XSS prevention via React's automatic escaping

### Role-Based Access
- Routes protected at router level
- UI elements hidden based on role
- Backend enforces permissions (frontend is not security boundary)

## Testing Strategy

### Manual Testing
- Cross-browser testing (Chrome, Firefox, Edge, Safari)
- Responsive design testing (mobile, tablet, desktop)
- Theme testing (light/dark mode)
- Role-based access testing (admin, producer, consumer)

### Future Testing Plans
- Unit tests with Vitest
- Component tests with React Testing Library
- E2E tests with Playwright
- Visual regression testing with Percy

## Deployment

### Production Build

```bash
cd frontend
npm run build
```

Output directory: `frontend/dist/`

### Deployment Options

1. **Static Hosting** (Vercel, Netlify, GitHub Pages)
   - Deploy `dist/` folder
   - Configure SPA fallback to `index.html`
   - Set backend API URL environment variable

2. **Docker Container**
   - Use nginx to serve static files
   - Configure reverse proxy to backend
   - See `docker-compose.yml` for reference

3. **Backend Integration**
   - FastAPI can serve static files via `StaticFiles` mount
   - Copy `dist/` contents to backend static folder

See [Deployment Guide](../developer-docs/docs/DEPLOYMENT_GUIDE.md) for detailed instructions.

## Browser Support

### Minimum Requirements
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

### Polyfills
Modern browser features are used without polyfills. If IE11 support is needed, add:
- `core-js` for ES6+ features
- `whatwg-fetch` for Fetch API
- `react-app-polyfill` for React compatibility

## Accessibility

### WCAG 2.1 Compliance
- Semantic HTML elements
- ARIA labels for interactive elements
- Keyboard navigation support
- Color contrast ratios meet AA standards
- Focus indicators on all interactive elements

### Screen Reader Support
- Alt text for images
- Descriptive button labels
- Form labels properly associated
- Skip navigation links

## Future Enhancements

### Planned Features
- WebSocket integration for real-time updates
- Service Worker for offline support
- Push notifications for critical alerts
- Advanced data export options (CSV, JSON)
- User preferences persistence
- Multi-language support (i18n)

### Technical Debt
- Complete TypeScript migration (currently incremental)
- Unit test coverage (currently 0%)
- Storybook for component documentation
- Automated visual regression testing
- Performance monitoring with Lighthouse CI

## Related Documentation

- [Frontend Structure](structure.md) - Directory organization
- [index.html Documentation](index-html.md) - Entry HTML file
- [Recharts Guide](charts/recharts-guide.md) - Chart examples
- [Theming Guide](styling/theming.md) - CSS variables and themes
- [Page Components](../developer-docs/docs/frontend/pages/) - Individual page docs
- [Backend API](../developer-docs/docs/07-api/) - API endpoint reference

---

**Last Updated:** January 2026
**Version:** 4.0
**React Version:** 19.2.0
**Node Version:** 18.x or higher
