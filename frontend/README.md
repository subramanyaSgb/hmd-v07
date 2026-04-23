# Frontend Documentation - HMD System

Complete frontend documentation for the Hot Metal Distribution (HMD) System React application.

## Quick Navigation

### Core Documentation

| Document | Description |
|----------|-------------|
| [FRONTEND_OVERVIEW.md](FRONTEND_OVERVIEW.md) | Complete frontend architecture, tech stack, and design principles |
| [structure.md](structure.md) | Directory structure and file organization reference |
| [index-html.md](index-html.md) | HTML entry point documentation with meta tags and configuration |

### Specialized Guides

| Guide | Description |
|-------|-------------|
| [charts/recharts-guide.md](charts/recharts-guide.md) | Complete Recharts usage guide with examples and theme integration |
| [styling/theming.md](styling/theming.md) | CSS variables, theming system, and light/dark mode implementation |

### Page Reference Documentation

Quick reference files that link to comprehensive documentation:

| Page | Route | Access | Reference |
|------|-------|--------|-----------|
| Statistics | `/statistics` | All users | [statistics.md](pages/statistics.md) → [04-statistics.md](../developer-docs/docs/frontend/pages/04-statistics.md) |
| Deviation Analytics | `/analytics/deviation` | Admin | [deviation-analytics.md](pages/deviation-analytics.md) → [05-deviation-analytics.md](../developer-docs/docs/frontend/pages/05-deviation-analytics.md) |
| Configuration | `/configuration` | Admin | [configuration.md](pages/configuration.md) → [03-configuration.md](../developer-docs/docs/frontend/pages/03-configuration.md) |
| Activity Monitoring | `/audit` | Admin | [activity-monitoring.md](pages/activity-monitoring.md) → [07-activity-monitoring.md](../developer-docs/docs/frontend/pages/07-activity-monitoring.md) |
| Maintenance Scheduling | `/maintenance` | Admin | [maintenance-scheduling.md](pages/maintenance-scheduling.md) → [08-maintenance-scheduling.md](../developer-docs/docs/frontend/pages/08-maintenance-scheduling.md) |
| Reports | `/reports` | Admin | [reports.md](pages/reports.md) → [06-reports.md](../developer-docs/docs/frontend/pages/06-reports.md) |
| Settings | `/settings` | All users | [settings.md](pages/settings.md) → [10-settings.md](../developer-docs/docs/frontend/pages/10-settings.md) |

## Documentation Structure

```
frontend/
├── README.md                       # This file - navigation hub
├── FRONTEND_OVERVIEW.md            # Complete architecture overview
├── structure.md                    # Directory structure reference
├── index-html.md                   # HTML entry point documentation
│
├── charts/
│   └── recharts-guide.md           # Recharts usage guide with examples
│
├── styling/
│   └── theming.md                  # CSS variables and theming guide
│
└── pages/                          # Page reference files
    ├── statistics.md               # → 04-statistics.md
    ├── deviation-analytics.md      # → 05-deviation-analytics.md
    ├── configuration.md            # → 03-configuration.md
    ├── activity-monitoring.md      # → 07-activity-monitoring.md
    ├── maintenance-scheduling.md   # → 08-maintenance-scheduling.md
    ├── reports.md                  # → 06-reports.md
    └── settings.md                 # → 10-settings.md
```

## Getting Started

### For New Developers

1. **Start with:** [FRONTEND_OVERVIEW.md](FRONTEND_OVERVIEW.md)
   - Understand the tech stack
   - Learn the architecture patterns
   - Review the routing structure

2. **Then read:** [structure.md](structure.md)
   - Understand the file organization
   - Learn naming conventions
   - Review import path patterns

3. **Explore:** Component and page documentation in `developer-docs/docs/frontend/`

### For Designers

1. **Start with:** [styling/theming.md](styling/theming.md)
   - Understand the CSS variable system
   - Learn light/dark mode implementation
   - Review premium UI patterns

2. **Then explore:** [charts/recharts-guide.md](charts/recharts-guide.md)
   - Understand data visualization patterns
   - Review chart types and customization
   - Learn theme-aware chart implementation

### For Backend Developers

1. **Start with:** [FRONTEND_OVERVIEW.md](FRONTEND_OVERVIEW.md) - API Integration section
   - Understand API client implementation
   - Review request/response patterns
   - Learn error handling

2. **Then review:** Individual page documentation for API endpoint usage

## Technology Stack

### Core Framework
- **React 19.2.0** - Latest stable release
- **React Router DOM 7.13.0** - URL-based navigation
- **Vite 7.2.4** - Build tool with HMR

### UI Libraries
- **Lucide React 0.562.0** - Icon library
- **Recharts 3.6.0** - Data visualization
- **Leaflet 1.9.4** - Interactive maps
- **date-fns 3.0.0** - Date utilities

### Export & Reporting
- **jsPDF 4.0.0** - PDF generation
- **jspdf-autotable 5.0.7** - Table plugin
- **XLSX 0.18.5** - Excel export

### TypeScript
- **TypeScript 5.9.3** - Incremental migration

## Key Features

### Routing
- Role-based access control (admin, producer, consumer)
- React Router v7 with URL-based navigation
- Protected routes with authentication
- Route-to-title mapping

### State Management
- Context API for global state
- AuthContext (authentication)
- ThemeContext (light/dark mode)
- NotificationContext (toast notifications)
- HeaderContext (dynamic page titles)

### Theming
- Light and dark mode support
- CSS custom properties (HSL format)
- Premium gaming-style dark mode
- Theme persistence in localStorage

### Data Visualization
- Recharts for all charts
- Theme-aware chart colors
- Responsive chart containers
- Multiple chart types (line, bar, area, pie)

### Real-Time Features
- Polling-based updates (5-10 second intervals)
- Live operations monitoring
- Deviation tracking with thresholds
- Geospatial tracking with Leaflet maps

## Development Commands

```bash
# Install dependencies
cd frontend
npm install

# Start development server (http://localhost:5173)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

## API Integration

The frontend integrates with the FastAPI backend at `http://localhost:8000/api/`.

**API Client:** `src/utils/api.ts` (TypeScript)

**Features:**
- Automatic JWT token injection
- Token refresh on 401 errors
- Structured error handling
- CSRF token support
- Correlation ID tracking

**Example Usage:**
```typescript
import { api } from './utils/api'

// GET request
const trips = await api.get<Trip[]>('/api/trips', { status: 'active' })

// POST request
await api.post('/api/plans', { date: '2024-01-20', capacity: 100 })

// Error handling
try {
  const data = await api.put(`/api/trips/${id}/status`, { status: 2 })
} catch (error) {
  console.error('API Error:', error.message)
}
```

## Comprehensive Documentation

For detailed component, utility, and page documentation, see:

**[developer-docs/docs/frontend/](../developer-docs/docs/frontend/)**

### Component Documentation
- Layout components (Header, Sidebar, Footer)
- Statistics components (Admin/Producer/Consumer)
- Plan history components
- Common components (CustomSelect, etc.)

### Utility Documentation
- API client (`api.ts`)
- Error handling (`errors.ts`)
- Validation (`validation.ts`)
- PDF export (`pdfExport.js`)
- Reports API (`reportsApi.js`)

### Page Documentation
- Dashboard (geospatial tracking)
- Trip Management (4 views)
- Fleet Management (torpedo registry)
- Daily Planning (capacity management)
- Monthly Planning (strategic planning hub)
- Live Operations (real-time monitoring)
- And more...

### Context Documentation
- AuthContext (authentication)
- ThemeContext (theming)
- NotificationContext (toast notifications)
- HeaderContext (dynamic titles)

### Type Documentation
- API types (`api.ts`)
- Custom type definitions
- TypeScript migration guide

## Browser Support

**Minimum Requirements:**
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

**Modern browser features used:**
- ES6+ JavaScript
- CSS Custom Properties
- Fetch API
- LocalStorage/SessionStorage
- Web Notifications API (optional)

## Performance Optimization

- Lazy loading for routes
- React.memo() for component memoization
- useMemo() for expensive computations
- useCallback() for event handlers
- Responsive container for charts
- Virtual scrolling for large tables

## Security Features

- JWT token authentication
- CSRF protection
- Role-based access control
- Input validation (client and server)
- XSS prevention via React
- HTTPS enforcement (production)

## Accessibility

- WCAG 2.1 AA compliance
- Semantic HTML elements
- ARIA labels for interactive elements
- Keyboard navigation support
- Color contrast ratios meet AA standards
- Screen reader support

## Related Backend Documentation

- [Backend API Reference](../developer-docs/docs/07-api/)
- [Database Models](../developer-docs/docs/06-database/models.md)
- [Security Features](../developer-docs/docs/09-security/)
- [Monitoring Setup](../developer-docs/docs/10-monitoring/)

## Contributing

When adding new features:

1. Follow existing patterns in `FRONTEND_OVERVIEW.md`
2. Update `structure.md` if adding new directories
3. Document new components in `developer-docs/docs/frontend/components/`
4. Document new pages in `developer-docs/docs/frontend/pages/`
5. Update this README with navigation links
6. Follow naming conventions (PascalCase for components, camelCase for utils)
7. Use CSS variables for all colors
8. Ensure dark mode compatibility
9. Add TypeScript types for new APIs

## Support

For questions or issues:

1. Check this documentation first
2. Review component-specific docs in `developer-docs/docs/frontend/`
3. Check backend API documentation in `developer-docs/docs/07-api/`
4. Review CLAUDE.md for project overview

---

**Last Updated:** January 2026
**Version:** 4.0
**React Version:** 19.2.0
**Documentation Coverage:** Complete
