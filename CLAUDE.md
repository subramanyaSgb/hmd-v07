# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# You are updating the Obsidian guidebook vault after code changes.

STEP 1: DETECT CHANGES
- Read GUIDEBOOK_MANIFEST.json for documented files and hashes
- Scan all source files, compute current hashes
- Report: ✏️ MODIFIED | ➕ NEW | ❌ DELETED | ✅ UNCHANGED

STEP 2: UPDATE MODIFIED FILE NOTES
- Open the existing note AND the updated source file
- Identify exactly which lines/functions/sections changed
- REWRITE the code walkthrough for changed sections — show the NEW code with line-by-line comments
- Preserve unchanged sections
- Update frontmatter `updated` date

STEP 3: CREATE NOTES FOR NEW FILES
- Full documentation following Phase 1 format — actual code with line-by-line explanations
- Add to relevant MOC
- Add to manifest

STEP 4: HANDLE DELETED FILES
- Remove note, fix broken [[wikilinks]], remove from MOC and manifest

STEP 5: CASCADE UPDATES
- API changed → update endpoint note + frontend caller note
- Model changed → update table note + every service/route that uses it
- Shared util changed → update every note that references it
- New env var → update Environment Variables note
- New route → update MOC — API Reference

STEP 6: UPDATE CHANGELOG + MANIFEST
- Append to Changelog.md with date, modified/added/deleted notes, cascading updates
- Update manifest hashes, timestamps, coverage percentage

CRITICAL: Updated sections MUST show the new actual code with line-by-line comments. Do NOT just write "updated the function" — show the code.

## 📖 Obsidian Guidebook Auto-Update Rule

This project has a living documentation vault at `docs/guidebook/`.

After completing ANY code change (feature, bugfix, refactor, config change), you MUST:

1. **Identify** every file you created, modified, or deleted in this session.
2. **For each modified file:**
   - Open its note in `docs/guidebook/`
   - Find the code walkthrough section(s) affected by your change
   - Replace the old code block with the NEW code, with fresh line-by-line inline comments
   - Update frontmatter `updated` date
   - Update/add callouts if bugs were fixed or new issues found
3. **For each new file:**
   - Create a full Obsidian note with:
     - YAML frontmatter (title, path, type, tags, status, dates, related [[wikilinks]])
     - Dependencies table
     - THE ACTUAL CODE in fenced blocks with line-by-line comments explaining every line
     - Callouts ([!warning], [!bug], [!tip], [!info], [!todo])
   - Add to relevant MOC note
   - Add to GUIDEBOOK_MANIFEST.json
4. **For each deleted file:**
   - Remove its note
   - Fix broken [[wikilinks]] in other notes
   - Remove from MOC and manifest
5. **Cascade updates:**
   - API endpoint changed → update endpoint note + frontend component notes that call it
   - Model/schema changed → update table note + every service/route note that queries it
   - Shared utility changed → update every note that imports it
   - Env variable added/removed → update Environment Variables note
6. **Append to Changelog.md** with date and list of all doc changes
7. **Update GUIDEBOOK_MANIFEST.json** with new file hashes

### Code Documentation Standard
- SHOW the actual code in ``` blocks — never summarize
- EVERY line gets an inline comment: what, why, connection, technology
- Database queries show equivalent SQL
- Return values name the frontend consumer
- Use [[wikilinks]] for all cross-references
- Use callouts for warnings, bugs, tips, business rules

This is NOT optional. The guidebook is a living document. If code changes but docs don't, the guidebook becomes a lie.

## Project Overview

Hot Metal Distribution (HMD) System - A logistics management system for tracking hot metal (molten iron) transportation between producers (Blast Furnaces) and consumers (Steel Melting Shops) in a steel plant. The system manages torpedo ladle fleet, trip scheduling, distribution planning, and live operations monitoring.

## Tech Stack

- **Frontend**: React 19 + Vite 7, React Router for URL-based navigation, TypeScript (incremental migration)
- **Backend**: FastAPI with uvicorn, PostgreSQL via SQLAlchemy ORM
- **Auth**: JWT tokens (python-jose), bcrypt password hashing
- **Environment**: Conda for Python (hmd_env), npm for frontend
- **Charts**: Recharts for data visualization
- **PDF Export**: jsPDF with jspdf-autotable
- **Cache**: Redis (optional, with in-memory fallback)

## Development Commands

### Quick Start (Windows)
```bash
app.bat      # Interactive menu to start/stop all services
```

### Backend
```bash
conda activate hmd_env
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev      # Dev server on port 5173
npm run build    # Production build
npm run lint     # ESLint check
```

### Testing
```bash
conda activate hmd_env

# Run all tests (133 passing, 43% coverage)
pytest backend/

# Run with verbose output
pytest backend/ -v

# Run with coverage report
pytest backend/ --cov=backend --cov-report=html

# Test categories
pytest backend/tests/test_auth.py           # Authentication & authorization tests
pytest backend/tests/test_trips.py          # Trip lifecycle tests
pytest backend/tests/test_utils.py          # Utility function tests
pytest backend/tests/test_security.py       # Security feature tests (lockout, rate limit, CSRF)
pytest backend/tests/test_cache.py          # Caching tests
pytest backend/tests/test_validation.py     # Trip validation tests
```

### Database Migrations (Alembic)
```bash
conda activate hmd_env
cd backend

# Check current migration version
python -m alembic current

# View migration history
python -m alembic history

# Generate new migration (auto-detect model changes)
python -m alembic revision --autogenerate -m "description_of_change"

# Apply all pending migrations
python -m alembic upgrade head

# Rollback one migration
python -m alembic downgrade -1

# Rollback to specific revision
python -m alembic downgrade <revision_id>
```

**Legacy migrations (deprecated):**
```bash
python backend/migrations/run_migration.py              # Trip expected columns
python backend/migrations/add_audit_trail_columns.py    # Audit trail columns
```

## Architecture

### Backend Structure (FastAPI)
- `backend/main.py` - App entry, CORS config, router registration, middleware
- `backend/routes/` - API endpoints (modular architecture):

  **Core Services:**
  - `auth.py` - Login, register, token refresh, logout with token blacklist
  - `config.py` - HM Matrix configuration, system settings
  - `fleet.py` - Torpedo fleet management
  - `live_operations.py` - Real-time deviation tracking & thresholds
  - `logs.py` - Audit trail API with filtering & export
  - `locations.py` - Plant node coordinates
  - `maintenance.py` - Maintenance scheduling
  - `notifications.py` - User notifications
  - `reports.py` - Report generation & export
  - `users.py` - User management

  **Planning Routes** (split from `plans.py` for modularity):
  - `daily_plans.py` - Daily capacity management with caching
  - `monthly_plans.py` - Monthly planning & dashboard summaries
  - `distributions.py` - Distribution optimization (PuLP linear programming)

  **Trip Routes** (split from `trips.py` for modularity):
  - `trip_crud.py` - CRUD operations, queries, history
  - `trip_lifecycle.py` - Status updates, expected time calculations
  - `trip_assignment.py` - Torpedo assignment, trip generation

  **Analytics Routes** (split from `analytics.py` for modularity):
  - `statistics.py` - General KPIs and statistics
  - `deviation_analytics.py` - Deviation analysis (6 specialized endpoints)
  - `performance_analytics.py` - User-specific performance metrics

  **Note:** Original `plans.py`, `trips.py`, and `analytics.py` still exist for backward compatibility.

- `backend/database/models.py` - SQLAlchemy models with soft delete support
- `backend/schemas.py` - Pydantic request/response models

### Backend Utilities
Production-grade utilities for security, observability, data management, and infrastructure:

**Security:**
- `backend/utils/security.py` - JWT auth, password hashing, `require_roles()` decorator, token blacklist
- `backend/utils/lockout.py` - Account lockout protection (5 failed attempts → 15min lockout)
- `backend/utils/rate_limit.py` - Rate limiting (auth: 5/min, high: 60/min, medium: 20/min, low: 10/min)
- `backend/utils/csrf.py` - CSRF protection with double-submit cookie pattern

**Observability:**
- `backend/utils/tracing.py` - OpenTelemetry distributed tracing with correlation IDs
- `backend/utils/activity_logger.py` - Atomic audit logging with retry logic and change tracking

**Data Management:**
- `backend/utils/soft_delete.py` - Soft delete with `active_only()`, `restore()`, `is_deleted()` helpers
- `backend/utils/trip_validation.py` - Status transition validation, timestamp monotonicity, stuck trip detection
- `backend/utils/errors.py` - Structured error handling with categorized error codes (1xxx-9xxx)

**Infrastructure:**
- `backend/utils/redis_cache.py` - Redis cache with automatic in-memory fallback
- `backend/utils/cache.py` - ThreadSafeCache for single-process fallback
- `backend/utils/env_validator.py` - Environment variable validation at startup

### Health Endpoint

**Health Check:**
```
GET /health
```
Response:
```json
{
  "status": "healthy",
  "database": "connected"
}
```
Returns 503 Service Unavailable if database connection fails.

**OpenTelemetry Tracing:**
- Distributed tracing via OpenTelemetry (OTLP gRPC exporter)
- Correlation ID tracking in `X-Correlation-ID` header
- FastAPI and SQLAlchemy auto-instrumentation
- Export to Jaeger or any OTLP-compatible backend
- Manual span creation: `@trace_span("operation_name")` decorator

### Frontend Structure (React)
- `frontend/src/App.jsx` - Main app with React Router, role-based route protection
- `frontend/src/pages/` - Page components:
  - `Dashboard.jsx` - Main overview with KPIs
  - `Operations.jsx` - Node-specific operations view
  - `TripManagement.jsx` - Trip lifecycle management
  - `FleetManagement.jsx` - Torpedo fleet management
  - `DailyPlanning.jsx` - Daily capacity planning
  - `MonthlyPlanning.jsx` - Strategic planning with history tab and System Settings
  - `Configuration.jsx` - HM Matrix config (travel times, fill/unload times)
  - `Statistics.jsx` - Analytics with admin/producer/consumer views
  - `DeviationAnalytics.jsx` - Admin-only deviation analysis with trends, root cause, comparisons
  - `Reports.jsx` - Report generation with export options
  - `ActivityMonitoring.jsx` - Audit trail viewer
  - `MaintenanceScheduling.jsx` - Maintenance calendar
- `frontend/src/context/` - React contexts:
  - `AuthContext.jsx` - User authentication state
  - `ThemeContext.jsx` - Light/dark mode toggle
  - `NotificationContext.jsx` - Toast notifications
  - `HeaderContext.jsx` - Dynamic header content
- `frontend/src/utils/api.ts` - Centralized API client with JWT handling (TypeScript)
- `frontend/src/types/` - TypeScript type definitions

### Key Domain Models

**Trip Lifecycle (14 stages, status 0-13):**
```
0: Pending       → Trip created, awaiting torpedo assignment
1: Assigned      → Torpedo assigned, expected times calculated
2: WB_Tare_Entry → Arrived at weighbridge (empty)
3: WB_Tare_Rec   → Tare weight measured and stored
4: P_Entered     → Torpedo entered producer facility
5: P_Loading     → Loading started
6: P_Loaded      → Loading completed
7: P_Exited      → Exited producer, in transit
8: WB_Gross_Entry→ Arrived at weighbridge (full)
9: WB_Gross_Rec  → Gross weight measured and stored
10: C_Entered    → Arrived at consumer facility
11: C_Unloading  → Unloading started
12: C_Unloaded   → Unloading completed
13: Completed    → Trip finished, exited consumer
```

**Live Operations Intelligence:**
- Expected times calculated from HM Matrix at torpedo assignment
- Phase-level deviation tracking (expected vs actual at each stage)
- Configurable thresholds: warning (10min), alert (20min), critical (30min)
- Shift tracking: day/night/afternoon

**Deviation Categories:**
```
Early:    deviation < 0       (finished before expected)
On-Time:  0 <= deviation <= 10 min
Warning:  11-20 min delay
Alert:    21-30 min delay
Critical: >30 min delay
```

**Deviation Analytics Endpoints:**
- `/api/statistics/deviation-summary` - Counts by category, min/max/avg deviation
- `/api/statistics/deviation-by-node` - Per producer/consumer metrics
- `/api/statistics/deviation-by-phase` - Loading/Transit/Unloading breakdown
- `/api/statistics/deviation-trends` - Time-series data (daily or monthly for year view)
- `/api/statistics/deviation-comparison` - Period-over-period comparison
- `/api/statistics/root-cause-analysis` - By shift, day of week, worst routes

**Other Models:**
- `DailyPlan` - Producer/consumer capacity (Primary→Revised→Confirmed)
- `DistributionAssignment` - Links producers to consumers with quantity/trips
- `FleetManagement` - Torpedo tracking (Operating/Maintenance status)
- `UserActivity` - Audit trail with entity tracking and change history
- `Weighbridge` - Physical weighbridge units with location coordinates and status
- `WeighbridgeRecord` - Tare/gross weight measurements per trip

## API Patterns

- All routes under `/api/` prefix
- JWT token in Authorization header: `Bearer <token>`
- Role-based access: `admin`, `producer`, `consumer`
- Use `require_roles("admin", "producer")` decorator for route protection
- CSRF token in `X-CSRF-Token` header (for POST/PUT/DELETE/PATCH)
- Correlation ID tracking via `X-Correlation-ID` header (auto-generated if not provided)

### Key Endpoints

**Authentication:**
```
POST /api/auth/login              # Login (5/minute rate limit)
POST /api/auth/register           # Register new user (3/minute)
POST /api/auth/refresh            # Refresh JWT token
POST /api/auth/logout             # Logout (blacklist token)
GET  /api/csrf-token              # Get CSRF token
```

**Trips:**
```
GET  /api/trips                   # List trips with filters
POST /api/trips/manual            # Create manual trip (admin)
PUT  /api/trips/{trip_id}/status  # Update trip status
GET  /api/trips/active            # Active trips (status 0-8)
GET  /api/trips/history           # Completed trips with pagination
```

**Planning:**
```
GET  /api/daily-plans/{date}      # Get plans for date
POST /api/daily-plans             # Upsert daily plan
GET  /api/monthly-plans/{year}/{month}  # Monthly plans
POST /api/distributions/optimize  # Optimize distribution
```

**Configuration:**
```
POST /api/config/hm-matrix        # Update HM Matrix times
GET  /api/config/system-settings  # System timing configuration
POST /api/config/system-settings/bulk  # Update system settings (admin, 3/minute)
```

**Monitoring:**
```
GET  /api/live-ops/trips          # Live operations with deviations
GET  /api/activity-logs           # Audit trail with pagination
GET  /health                      # Health check
```

**Weighbridges:**
```
GET  /api/weighbridges              # List weighbridges
POST /api/weighbridges              # Create weighbridge (admin)
PUT  /api/weighbridges/{id}         # Update weighbridge (admin)
PUT  /api/weighbridges/{id}/status  # Change status (admin)
GET  /api/weighbridge-records/{trip_id}  # Records for a trip
POST /api/weighbridge-records       # Manual record entry
```

### Error Response Format

All API errors follow a structured format:

```json
{
  "success": false,
  "error": "ValidationError",
  "error_code": "VAL_2001",
  "message": "Missing required field: producer_id",
  "details": {
    "field": "producer_id",
    "requirement": "required"
  },
  "field_errors": [
    {
      "field": "producer_id",
      "message": "This field is required",
      "code": "required"
    }
  ],
  "request_id": "correlation-id-uuid"
}
```

**Error Code Categories:**
- **1xxx**: Authentication (invalid credentials, token expired, account locked)
- **2xxx**: Validation (required field, invalid format, out of range)
- **3xxx**: Resource (not found, already exists, conflict)
- **4xxx**: Trip-specific (invalid status transition, no available torpedo)
- **5xxx**: Fleet (in maintenance, already assigned)
- **6xxx**: Planning (date passed, capacity exceeded)
- **7xxx**: Rate limiting (rate limit exceeded)
- **9xxx**: Server errors (internal error, database error)

**System Settings Keys:**
- `TRAVEL_TO_PRODUCER_MINUTES` - Time from depot to producer after assignment
- `EXIT_BUFFER_MINUTES` - Buffer after loading/unloading before exit
- `DEFAULT_WAIT_TIME`, `DEFAULT_FILL_TIME`, `DEFAULT_UNLOAD_TIME`, `DEFAULT_TRAVEL_TIME`

## Database

- PostgreSQL via `backend/.env`:
  - `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`
  - `SECRET_KEY` required for JWT
- Models auto-create tables via `init_db()` on startup
- **Alembic** for database migrations (see Database Migrations section above)
- Migration files in `backend/alembic/versions/`
- **Soft Delete**: User, Trip, and FleetManagement models support soft delete (deleted_at timestamp)

## Production Readiness

The HMD system includes comprehensive production-grade features implemented across 6 sprints:

### Security Features

**Account Lockout (Brute Force Protection):**
- Failed login tracking with configurable thresholds
- Default: 5 failed attempts → 15-minute lockout
- Tracks attempts by username and IP address
- Admin unlock capability via `unlock_account()`
- Environment variables: `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_DURATION_MINUTES`

**Token Blacklist (Secure Logout):**
- JWT tokens invalidated on logout (Redis-backed with SHA-256 hashing)
- Automatic TTL cleanup (expires with token)
- Force logout from all sessions: `clear_user_tokens(username)`
- Integrated with `get_current_user_required` dependency

**Rate Limiting (DoS Protection):**
- Endpoint-specific rate limits using slowapi
- Tiers: auth (5/min), high (60/min), medium (20/min), low (10/min), export (5/min)
- Configurable per-endpoint overrides
- Test mode available: `RATE_LIMIT_ENABLED=false`

**CSRF Protection:**
- Double-submit cookie pattern
- Token format: `random.timestamp.signature` (HMAC-SHA256)
- Auto-refresh on each request
- Exempt paths: login, register, health, documentation
- Get token: `GET /api/csrf-token`

**Security Headers:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (when HTTPS enabled)
- `Content-Security-Policy` with comprehensive restrictions
- `Permissions-Policy` for browser feature control

**HTTPS Enforcement:**
- Automatic HTTP → HTTPS redirect (301)
- Configurable via `ENFORCE_HTTPS` environment variable
- Supports reverse proxy detection (`X-Forwarded-Proto`)

### Observability

**OpenTelemetry Distributed Tracing:**
- FastAPI and SQLAlchemy auto-instrumentation
- Correlation ID tracking across requests (`X-Correlation-ID` header)
- OTLP gRPC exporter (Jaeger or any OTLP-compatible backend)
- Configurable: `OTEL_ENABLED`, `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`
- Manual span creation: `@trace_span("operation_name")` decorator

**Structured Error Responses:**
- Categorized error codes: Auth (1xxx), Validation (2xxx), Resource (3xxx), Trip (4xxx), Fleet (5xxx), Planning (6xxx), Rate Limit (7xxx), Server (9xxx)
- Field-level validation errors with Pydantic integration
- Correlation ID in error responses for tracing
- Exception classes: `HMDException`, `NotFoundError`, `ValidationError`, `TripStatusError`, etc.

### Data Management

**Soft Delete Implementation:**
- Models: User, Trip, FleetManagement
- Helper functions: `active_only(query)`, `soft_delete(db, record)`, `restore(db, record)`
- Preserves data for audit and recovery
- Query helpers: `get_active()`, `get_active_by_id()`

**Trip Validation:**
- Status transition validation (prevents invalid state changes)
- Timestamp monotonicity checks (ensures chronological order)
- Stuck trip detection with configurable thresholds
- Helper: `update_trip_status()` with comprehensive validation

**Atomic Audit Logging:**
- Transaction-safe logging with retry logic
- Automatic change diff tracking: `log_entity_change()`
- Context extraction: IP address, user agent
- Atomic operations: `atomic_operation()` context manager with savepoint support

### Caching Strategy

**Redis Cache (Primary):**
- Connection pooling (max 20 connections)
- Automatic fallback to in-memory cache if Redis unavailable
- TTL support with automatic expiration
- Pattern-based invalidation: `delete_pattern("plans:*")`
- Health check with latency metrics
- Environment variables: `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASSWORD`

**In-Memory Cache (Fallback):**
- ThreadSafeCache with RLock for thread safety
- Automatic expiration cleanup
- Prefix-based pattern matching
- Zero-config development mode

**Cache Decorator:**
```python
@cached(cache_key="plans:{date}", ttl=300)
def get_daily_plan(date: str):
    ...
```

### Environment Configuration

**Required Variables:**
- `SECRET_KEY` - JWT signing key (minimum 32 characters, no default)
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`

**Security (optional with defaults):**
- `ENFORCE_HTTPS` (default: false)
- `CSRF_ENABLED` (default: true)
- `RATE_LIMIT_ENABLED` (default: true)
- `MAX_LOGIN_ATTEMPTS` (default: 5)
- `LOCKOUT_DURATION_MINUTES` (default: 15)
- `ACCESS_TOKEN_EXPIRE_MINUTES` (default: 480)

**Observability (optional with defaults):**
- `OTEL_ENABLED` (default: true)
- `OTEL_SERVICE_NAME` (default: "hmd-backend")
- `OTEL_EXPORTER_OTLP_ENDPOINT` (default: http://localhost:4317)

**Infrastructure (optional with defaults):**
- `CACHE_ENABLED` (default: true)
- `REDIS_HOST` (default: localhost), `REDIS_PORT` (default: 6379)
- `ALLOWED_ORIGINS` - CORS whitelist (comma-separated)

**Startup Validation:**
- Environment variables validated via `env_validator.py` on app startup
- Detailed error messages for missing/invalid configuration
- Safe summary logging (sensitive values masked)

## Frontend Patterns

### React Router URLs
The frontend uses React Router for URL-based navigation with role-based route protection:

| URL | Page | Sidebar | Access |
|-----|------|---------|--------|
| `/` | Dashboard | Yes | All authenticated |
| `/statistics` | Statistics | Yes | All authenticated |
| `/analytics/deviation` | Deviation Analytics | Yes (Admin) | Admin only |
| `/planning/monthly` | Strategic Planning | Yes (Admin) | Admin only |
| `/planning/daily` | Daily Planning | Yes (P/C) | Producer/Consumer |
| `/trips` | Trip Management | Yes | All authenticated |
| `/fleet` | Torpedo Management | Yes (Admin) | Admin only |
| `/audit` | Audit Trail | Yes (Admin) | Admin only |
| `/operations` | Node Operations | Yes (All) | All authenticated (Admin sees tabbed view of all nodes) |
| `/reports` | Reports | Yes (Admin) | Admin only |
| `/settings` | Settings | Yes | All authenticated |

**Strategic Planning Tabs (Admin only):**
- Executive View - Dashboard summary and node monitoring
- Configuration - HM Matrix (travel times, fill/unload times)
- Maintenance - Maintenance calendar scheduling
- Strategic - Monthly calendar planning
- Weighbridge - Weighbridge unit management (create, edit, status)

**Note:** Configuration and Maintenance were moved from sidebar into Strategic Planning page tabs. The routes still exist but are accessed via the Strategic Planning tabs.

**Navigation components:**
- `Sidebar.jsx` - Uses `<Link>` from react-router-dom
- `Header.jsx` - Uses `useNavigate()` for notification links
- `App.jsx` - Exports `PAGE_ID_TO_PATH` mapping for backwards compatibility

### API Usage
```typescript
import { api } from './utils/api';
const data = await api.get<Trip[]>('/api/trips', { status: 'active' });
await api.post('/api/plans', { date: '2024-01-20', capacity: 100 });
// Auth stored in sessionStorage under 'hmd_user'
```

### CSS Variables & Theming
Uses CSS custom properties for theming. Key variables:
- `var(--bg-primary)`, `var(--bg-secondary)` - Background colors
- `var(--text-primary)`, `hsl(var(--text-muted))` - Text colors
- `hsl(var(--border-color))`, `hsl(var(--primary))` - Border and accent colors
- Dark mode: Apply via `:root[data-theme="dark"]` selectors

**Dark Mode for Components with Charts:**
```javascript
import { useTheme } from '../context/ThemeContext'
const { theme } = useTheme()
const isDarkMode = theme === 'dark'

// For Recharts colors
const chartColors = {
    axisText: isDarkMode ? '#94a3b8' : '#64748b',
    gridStroke: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'
}
```

**Avoid hardcoded colors** - use CSS variables for backgrounds:
- Instead of `background: white` → use `background: var(--bg-secondary)`
- Instead of `background: #f8fafc` → use `background: var(--bg-primary)`

### Premium UI Styling Patterns
- Card hover effects: `transform: translateY(-2px)` with box-shadow
- Accent bars: `::before` pseudo-element with gradient
- Rounded corners: `border-radius: 8px-16px` for cards
- Icons with colored backgrounds in summary cards
- KPI cards with colored left border: `border-left: 3px solid ${color}`

### Component Patterns
- Summary cards: Icon + value + label with accent colors
- Data tables: Sticky headers with solid background colors
- Filter controls: Gradient backgrounds with focus ring effects
- Modals: Backdrop blur with rounded corners

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Version_06** (9262 symbols, 16774 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find execution flows related to the issue
2. `gitnexus_context({name: "<suspect function>"})` — see all callers, callees, and process participation
3. `READ gitnexus://repo/Version_06/process/{processName}` — trace the full execution flow step by step
4. For regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})` — see what your branch changed

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review the preview — graph edits are safe, text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: MUST run `gitnexus_context({name: "target"})` to see all incoming/outgoing refs, then `gitnexus_impact({target: "target", direction: "upstream"})` to find all external callers before moving code.
- After any refactor: run `gitnexus_detect_changes({scope: "all"})` to verify only expected files changed.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360-degree view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers/importers | MUST update these |
| d=2 | LIKELY AFFECTED — indirect deps | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Version_06/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Version_06/clusters` | All functional areas |
| `gitnexus://repo/Version_06/processes` | All execution flows |
| `gitnexus://repo/Version_06/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

Before completing any code modification task, verify:
1. `gitnexus_impact` was run for all modified symbols
2. No HIGH/CRITICAL risk warnings were ignored
3. `gitnexus_detect_changes()` confirms changes match expected scope
4. All d=1 (WILL BREAK) dependents were updated

## Keeping the Index Fresh

After committing code changes, the GitNexus index becomes stale. Re-run analyze to update it:

```bash
npx gitnexus analyze
```

If the index previously included embeddings, preserve them by adding `--embeddings`:

```bash
npx gitnexus analyze --embeddings
```

To check whether embeddings exist, inspect `.gitnexus/meta.json` — the `stats.embeddings` field shows the count (0 means no embeddings). **Running analyze without `--embeddings` will delete any previously generated embeddings.**

> Claude Code users: A PostToolUse hook handles this automatically after `git commit` and `git merge`.

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
