# Frontend Directory Structure

Complete directory structure and file organization for the HMD System frontend application.

## Root Directory

```
frontend/
├── node_modules/           # npm dependencies (generated)
├── dist/                   # Production build output (generated)
├── public/                 # Static assets (if any)
├── src/                    # Source code
├── index.html              # HTML entry point
├── vite.config.js          # Vite build configuration
├── package.json            # npm dependencies and scripts
├── package-lock.json       # Dependency lock file
├── tsconfig.json           # TypeScript configuration
├── eslint.config.js        # ESLint configuration
├── FRONTEND_OVERVIEW.md    # This documentation
└── structure.md            # Directory structure reference
```

## Source Directory (`src/`)

### Complete Structure

```
src/
├── pages/                  # Page components (17 files)
│   ├── LoginPage.jsx
│   ├── Dashboard.jsx
│   ├── Statistics.jsx
│   ├── DeviationAnalytics.jsx
│   ├── TripManagement.jsx
│   ├── FleetManagement.jsx
│   ├── Operations.jsx
│   ├── LiveOperations.jsx
│   ├── DailyPlanning.jsx
│   ├── MonthlyPlanning.jsx
│   ├── Configuration.jsx
│   ├── MaintenanceScheduling.jsx
│   ├── ActivityMonitoring.jsx
│   ├── Reports.jsx
│   ├── Settings.jsx
│   ├── AdminPlanning.jsx       # Legacy
│   └── PlanningHistory.jsx     # Legacy
│
├── components/             # Reusable UI components
│   ├── Common/
│   │   └── CustomSelect.jsx
│   ├── Statistics/
│   │   ├── AdminStatistics.jsx
│   │   ├── ProducerStatistics.jsx
│   │   ├── ConsumerStatistics.jsx
│   │   ├── MyPerformanceCard.jsx
│   │   ├── MyTripsTable.jsx
│   │   ├── LifetimeStats.jsx
│   │   ├── CompletionTimeline.jsx
│   │   ├── PartnerBreakdown.jsx
│   │   └── MonthlyPlanOverview.jsx
│   ├── PlanHistory/
│   │   ├── index.jsx
│   │   ├── PlanCard.jsx
│   │   ├── SummaryStats.jsx
│   │   ├── NodeTables.jsx
│   │   ├── TripsSection.jsx
│   │   ├── TripTimeline.jsx
│   │   └── RouteGroup.jsx
│   ├── reports/
│   │   ├── DateRangePicker.jsx
│   │   └── ExportDropdown.jsx
│   ├── Layout.jsx
│   ├── Header.jsx
│   ├── Sidebar.jsx
│   ├── Footer.jsx
│   ├── ErrorBoundary.jsx
│   ├── IncomingTorpedoes.jsx
│   ├── ActivitySummaryCards.jsx
│   └── ActivityCharts.jsx
│
├── context/                # React Context providers
│   ├── AuthContext.jsx
│   ├── ThemeContext.jsx
│   ├── NotificationContext.jsx
│   └── HeaderContext.jsx
│
├── utils/                  # Utility functions
│   ├── api.ts              # Centralized API client (TypeScript)
│   ├── errors.ts           # Error handling utilities (TypeScript)
│   ├── validation.ts       # Input validation (TypeScript)
│   ├── reportsApi.js       # Reports API integration
│   └── pdfExport.js        # PDF export functionality
│
├── types/                  # TypeScript type definitions
│   ├── api.ts              # API response types
│   └── index.ts            # Exported type definitions
│
├── main.jsx                # React entry point
├── App.jsx                 # Main application router
├── index.css               # Global styles and CSS variables
└── App.css                 # App-specific styles
```

## Directory Details

### 1. Pages (`src/pages/`)

**Purpose:** Full-page components mapped to routes in React Router.

**File Count:** 17 files

**Categories:**

**Authentication:**
- `LoginPage.jsx` - JWT-based authentication interface

**Dashboard & Monitoring:**
- `Dashboard.jsx` - Real-time geospatial tracking with Leaflet maps
- `Statistics.jsx` - Role-based analytics router (admin/producer/consumer)
- `DeviationAnalytics.jsx` - Admin-only deviation analysis
- `LiveOperations.jsx` - Real-time trip monitoring with deviation tracking
- `Operations.jsx` - Node-specific operations view

**Trip & Fleet Management:**
- `TripManagement.jsx` - Trip lifecycle with 4 views
- `FleetManagement.jsx` - Torpedo fleet registry

**Planning:**
- `DailyPlanning.jsx` - Daily capacity planning
- `MonthlyPlanning.jsx` - Strategic planning hub with 4 tabs
- `Configuration.jsx` - HM Matrix configuration
- `MaintenanceScheduling.jsx` - Maintenance calendar

**Reporting & Audit:**
- `ActivityMonitoring.jsx` - Audit trail viewer
- `Reports.jsx` - Report generation and export

**System:**
- `Settings.jsx` - User settings and preferences

**Legacy (Reference Only):**
- `AdminPlanning.jsx` - Superseded by MonthlyPlanning
- `PlanningHistory.jsx` - Integrated into MonthlyPlanning

**Documentation:** See `developer-docs/docs/frontend/pages/` for individual page documentation.

### 2. Components (`src/components/`)

**Purpose:** Reusable UI components used across multiple pages.

**Organization:**

#### Core Layout Components
- `Layout.jsx` - Main application layout wrapper
- `Header.jsx` - Top navigation bar with notifications and user menu
- `Sidebar.jsx` - Left navigation with role-based menu items
- `Footer.jsx` - Bottom bar with system information
- `ErrorBoundary.jsx` - Error boundary for graceful error handling

#### Common Components (`Common/`)
- `CustomSelect.jsx` - Styled select dropdown with search

#### Statistics Components (`Statistics/`)
Role-specific analytics components:
- `AdminStatistics.jsx` - System-wide analytics for administrators
- `ProducerStatistics.jsx` - Producer-specific performance metrics
- `ConsumerStatistics.jsx` - Consumer-specific performance metrics
- `MyPerformanceCard.jsx` - Personal performance summary card
- `MyTripsTable.jsx` - User's trip history table
- `LifetimeStats.jsx` - Cumulative statistics display
- `CompletionTimeline.jsx` - Trip completion timeline chart
- `PartnerBreakdown.jsx` - Partner distribution breakdown
- `MonthlyPlanOverview.jsx` - Monthly planning summary

#### Plan History Components (`PlanHistory/`)
Components for planning history visualization:
- `index.jsx` - Main plan history container
- `PlanCard.jsx` - Individual plan card display
- `SummaryStats.jsx` - Plan summary statistics
- `NodeTables.jsx` - Producer/consumer node tables
- `TripsSection.jsx` - Trip list section
- `TripTimeline.jsx` - Trip timeline visualization
- `RouteGroup.jsx` - Route-based trip grouping

#### Reports Components (`reports/`)
- `DateRangePicker.jsx` - Date range selector for reports
- `ExportDropdown.jsx` - Export format dropdown (PDF, Excel, CSV)

#### Specialized Components
- `IncomingTorpedoes.jsx` - Real-time incoming torpedo display
- `ActivitySummaryCards.jsx` - Activity summary card grid
- `ActivityCharts.jsx` - Activity trend charts

**Documentation:** See `developer-docs/docs/frontend/components/` for component details.

### 3. Context (`src/context/`)

**Purpose:** React Context providers for global state management.

**Providers:**

#### AuthContext (`AuthContext.jsx`)
- User authentication state
- Login/logout/refresh operations
- JWT token management
- Role-based access control

**API:**
```javascript
const { user, login, logout, refreshToken, isLoading } = useAuth()
```

#### ThemeContext (`ThemeContext.jsx`)
- Light/dark mode theming
- Theme persistence (localStorage)
- CSS variable injection

**API:**
```javascript
const { theme, toggleTheme } = useTheme()
```

#### NotificationContext (`NotificationContext.jsx`)
- Toast notification system
- Success/error/warning/info types
- Auto-dismiss and queue management

**API:**
```javascript
const { notify } = useNotification()
notify.success('Operation completed')
notify.error('Failed to save')
```

#### HeaderContext (`HeaderContext.jsx`)
- Dynamic header content injection
- Page title management
- Custom header actions

**API:**
```javascript
const { setHeaderContent } = useHeaderContext()
setHeaderContent({ title: 'Custom Title', actions: <Buttons /> })
```

**Documentation:** See `developer-docs/docs/frontend/context/` for context details.

### 4. Utils (`src/utils/`)

**Purpose:** Utility functions, API client, and helper modules.

**Files:**

#### `api.ts` (TypeScript)
Centralized HTTP client with JWT authentication.

**Features:**
- Type-safe API calls
- Automatic token injection
- Token refresh on 401
- Structured error handling
- CSRF token support

**Usage:**
```typescript
import { api } from './utils/api'
const data = await api.get<Trip[]>('/api/trips')
await api.post('/api/plans', { date: '2024-01-20' })
```

#### `errors.ts` (TypeScript)
Structured error handling utilities.

**Features:**
- API error parsing
- User-friendly error messages
- Error code categorization
- Field-level validation errors

#### `validation.ts` (TypeScript)
Input validation helpers.

**Features:**
- Form field validation
- Data type validation
- Range and format checks

#### `reportsApi.js`
Reports API integration module.

**Features:**
- Report generation requests
- Export format handling
- Date range validation

#### `pdfExport.js`
Client-side PDF generation using jsPDF.

**Features:**
- Table export with jspdf-autotable
- Custom styling and branding
- Multi-page support
- Automatic page breaks

**Documentation:** See `developer-docs/docs/frontend/utils/` for utility details.

### 5. Types (`src/types/`)

**Purpose:** TypeScript type definitions for API responses and data models.

**Files:**

#### `api.ts`
API request and response type definitions.

**Includes:**
- Trip types (Trip, TripStatus, TripCreate)
- Plan types (DailyPlan, MonthlyPlan, DistributionAssignment)
- Fleet types (Torpedo, MaintenanceSchedule)
- User types (User, UserRole, LoginCredentials)
- Configuration types (HMMatrix, SystemSettings)
- Statistics types (DeviationSummary, PerformanceMetrics)

#### `index.ts`
Re-exports all types for easy importing.

**Usage:**
```typescript
import { Trip, DailyPlan, User } from './types'
```

**Documentation:** See `developer-docs/docs/frontend/types/` for type reference.

### 6. Root Files (`src/`)

#### `main.jsx`
React application entry point.

**Responsibilities:**
- Mounts React app to DOM
- Wraps app with React.StrictMode
- Imports global styles

**Code:**
```javascript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

#### `App.jsx`
Main application router with role-based route protection.

**Responsibilities:**
- BrowserRouter setup
- Route definitions
- Context provider wrapping
- Role-based access control
- Route title configuration

**Key Exports:**
- `ROUTE_CONFIG` - Route to title mapping
- `PAGE_ID_TO_PATH` - Legacy page ID to path mapping
- `PATH_TO_PAGE_ID` - Path to page ID mapping (for Sidebar)

**Documentation:** See `developer-docs/docs/frontend/app.md`.

#### `index.css`
Global styles and CSS custom properties.

**Contents:**
- CSS variable definitions (light/dark themes)
- Font imports (Inter, Space Grotesk)
- Global animations and keyframes
- Utility classes
- Dark mode overrides

**Documentation:** See `developer-docs/docs/frontend/index-css.md` and `styling/theming.md`.

#### `App.css`
App-specific styles.

**Contents:**
- Component-specific styles
- Layout overrides
- Custom class definitions

## Configuration Files (Root)

### `index.html`
HTML entry point.

**Features:**
- UTF-8 charset
- Viewport meta tag for responsive design
- Root div for React mounting
- Module script tag for main.jsx

**Documentation:** See `index-html.md`.

### `vite.config.js`
Vite build configuration.

**Configuration:**
- React plugin setup
- Build output settings
- Development server config
- Path aliases (if any)

**Documentation:** See `developer-docs/docs/frontend/vite-config.md`.

### `package.json`
npm package configuration.

**Scripts:**
- `dev` - Start Vite dev server
- `build` - Production build
- `preview` - Preview production build
- `lint` - Run ESLint checks

**Key Dependencies:**
- React 19.2.0
- React Router DOM 7.13.0
- Recharts 3.6.0
- Leaflet 1.9.4
- jsPDF 4.0.0
- TypeScript 5.9.3

### `tsconfig.json`
TypeScript compiler configuration.

**Settings:**
- Target: ES2020
- Module: ESNext
- JSX: react-jsx
- Incremental: true (allows .jsx and .ts coexistence)

### `eslint.config.js`
ESLint configuration.

**Rules:**
- React plugin rules
- React Hooks plugin
- Custom project rules

## Build Output (`dist/`)

**Generated by:** `npm run build`

**Contents:**
```
dist/
├── index.html              # Minified HTML
├── assets/
│   ├── index-[hash].js     # Bundled JS with hash
│   ├── index-[hash].css    # Bundled CSS with hash
│   └── [asset]-[hash].*    # Other assets (images, fonts)
└── vite.svg                # Vite logo
```

**Deployment:** Copy entire `dist/` folder to static hosting or CDN.

## File Naming Conventions

### Components
- **PascalCase** for React components: `TripManagement.jsx`, `CustomSelect.jsx`
- **Index files** for directory entry points: `components/PlanHistory/index.jsx`

### Utilities
- **camelCase** for utility modules: `pdfExport.js`, `reportsApi.js`

### Styles
- **kebab-case** for CSS files: `index.css`, `App.css`
- **kebab-case** for CSS classes: `.trip-card-header`, `.stats-summary`

### Types
- **camelCase** for type files: `api.ts`, `index.ts`
- **PascalCase** for type names: `Trip`, `DailyPlan`, `User`

## Import Path Patterns

### Relative Imports (Current)
```javascript
import { useAuth } from '../context/AuthContext'
import { api } from './utils/api'
import Dashboard from './pages/Dashboard'
```

### Absolute Imports (Potential Future)
If path aliases configured in `vite.config.js`:
```javascript
import { useAuth } from '@/context/AuthContext'
import { api } from '@/utils/api'
import Dashboard from '@/pages/Dashboard'
```

## Code Organization Principles

### 1. Separation of Concerns
- **Pages** handle routing and page-level logic
- **Components** are reusable and presentation-focused
- **Context** manages global state
- **Utils** provide pure functions and API integration

### 2. Component Composition
- Small, focused components
- Compose complex UIs from simple components
- Props drilling avoided via Context

### 3. Type Safety
- TypeScript for API client and types
- Gradual migration from .jsx to .tsx
- Type-safe API calls

### 4. Style Isolation
- Global styles in `index.css`
- Component-specific styles in `App.css` or inline
- CSS modules not currently used (potential future enhancement)

## File Size Considerations

### Large Files (>500 lines)
- `TripManagement.jsx` (1,200+ lines) - Consider splitting into sub-components
- `MonthlyPlanning.jsx` (1,000+ lines) - Complex tab-based layout
- `DeviationAnalytics.jsx` (900+ lines) - Multiple analytics sections

### Optimization Opportunities
- Extract chart configurations to separate modules
- Split large page components into smaller logical sections
- Move inline styles to CSS modules

## Related Documentation

- [Frontend Overview](FRONTEND_OVERVIEW.md) - High-level frontend architecture
- [index.html Documentation](index-html.md) - Entry HTML file
- [Recharts Guide](charts/recharts-guide.md) - Chart integration examples
- [Theming Guide](styling/theming.md) - CSS variables and themes
- [Page Documentation](../developer-docs/docs/frontend/pages/) - Individual page docs
- [Component Documentation](../developer-docs/docs/frontend/components/) - Component details

---

**Last Updated:** January 2026
**Total Files:** ~50 source files
**Total Lines of Code:** ~15,000+ lines
**Build Size:** ~500 KB (gzipped)
