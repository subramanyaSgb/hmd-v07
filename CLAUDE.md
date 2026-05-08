# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Repository State

Fresh git repo at `Development/Version_07/` (initial commit on `main`). The parent `HMD/` folder previously hosted a 1.8GB monorepo covering `Version_01`..`Version_06`, legacy docs, and `.7z` backups. That parent repo is archived and **not** the working tree — always work inside `Version_07/`.

**Branch context:** The codebase landed here after a heavy strip-down:
- Removed MFA / OAuth / email-verification flows
- Removed Geofence model + 9 other dead models
- Removed legacy `api/v1` router registration
- Removed frontend dark mode (`ThemeContext` deleted)
- Removed sound alerts

Anything referencing those features in older docs/comments is stale.

## Project Overview

Hot Metal Distribution (HMD) — logistics system for tracking molten iron transport between producers (Blast Furnaces) and consumers (Steel Melting Shops) in a steel plant. Manages torpedo ladle fleet, trip scheduling, distribution planning, live operations monitoring, converter/equipment tracking, weighbridge records.

## Tech Stack

- **Frontend**: React 19 + Vite 7, React Router v7, TypeScript (incremental migration — `.ts`/`.tsx` alongside `.jsx`)
- **Backend**: FastAPI + uvicorn, PostgreSQL via SQLAlchemy ORM, Alembic migrations
- **Auth**: JWT (python-jose), bcrypt password hashing — **local auth only** (no MFA/OAuth)
- **Environment**: Python venv at `./.venv/` (gitignored, bootstrapped by `app.bat`), npm for frontend
- **Charts**: Recharts
- **PDF Export**: jsPDF + jspdf-autotable
- **Cache**: Redis optional, in-memory ThreadSafeCache fallback
- **Observability**: OpenTelemetry (OTLP gRPC exporter)
- **Integrations**: WhatsApp notification service (Node.js sidecar in `whatsapp-service/`)

## Development Commands

### Quick Start (Windows)
```bash
app.bat      # Interactive menu — start/stop all services, health check
```

### Backend
Python environment is a venv at `./.venv/` (gitignored). First-time setup:
```bash
python -m venv .venv             # bootstrap (Python 3.10+ on PATH)
.venv\Scripts\activate.bat       # Windows cmd
# OR  source .venv/bin/activate  # POSIX
pip install -r backend/requirements.txt
```
Daily use:
```bash
.venv\Scripts\activate.bat
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
.venv\Scripts\activate.bat       # Windows cmd  (or source .venv/bin/activate on POSIX)

# Run all tests (~235 test functions)
pytest backend/

# Verbose output
pytest backend/ -v

# Coverage report
pytest backend/ --cov=backend --cov-report=html

# Test files
pytest backend/tests/test_auth.py             # Auth & authorization
pytest backend/tests/test_trips.py            # Trip lifecycle
pytest backend/tests/test_security.py         # Lockout, rate limit, CSRF
pytest backend/tests/test_trip_validation.py  # Status transition / validation
pytest backend/tests/test_constants.py        # Trip status constants
pytest backend/tests/test_converters.py       # Converter model / routes
pytest backend/tests/test_fleet.py            # Fleet management
pytest backend/tests/test_health.py           # Health endpoint
pytest backend/tests/test_locations.py        # Location coordinates
pytest backend/tests/test_maintenance.py      # Maintenance scheduling
```

### Database Migrations (Alembic)
```bash
.venv\Scripts\activate.bat       # Windows cmd  (or source .venv/bin/activate on POSIX)
cd backend

python -m alembic current                                    # Current version
python -m alembic history                                    # History
python -m alembic revision --autogenerate -m "<description>" # Auto-detect model changes
python -m alembic upgrade head                               # Apply all
python -m alembic downgrade -1                               # Rollback one
python -m alembic downgrade <revision_id>                    # Rollback to specific
```

Migration files: `backend/alembic/versions/`. Recent strips visible as `g1h2i3j4k5l6_strip_mfa_oauth_email_verification.py` and `h1i2j3k4l5m6_drop_dead_tables.py`.

## Architecture

### Backend Structure (FastAPI)
- `backend/main.py` — app entry, CORS, router registration, middleware, startup validation
- `backend/constants.py` — `TripStatus` constants + helper predicates (`is_active`, `can_cancel`, etc.)
- `backend/database/models.py` — SQLAlchemy models (soft delete, audit columns)
- `backend/database/init_db.py` — inline env validation, default system settings seed
- `backend/database/engine.py` — SQLAlchemy engine/session config
- `backend/schemas.py` — Pydantic request/response models
- `backend/logger.py` — logging config

**Routes (`backend/routes/`):**

Core services:
- `auth.py` — login, register, token refresh, logout with token blacklist
- `config.py` — HM Matrix + system settings
- `fleet.py` — torpedo fleet management
- `live_operations.py` — real-time deviation tracking
- `logs.py` — audit trail API with filtering + export
- `locations.py` — plant node coordinates
- `maintenance.py` — maintenance scheduling
- `notifications.py` — user notifications
- `reports.py` — report generation + export
- `users.py` — user management
- `system.py` — system-level health/stats endpoints (prefix `/api`)
- `converters.py` — converter/equipment units (LD, ZPF, EAF)
- `whatsapp.py` — WhatsApp notification integration
- `weighbridge.py` — weighbridge CRUD + records (two routers in one file)

Trip routes (split for modularity):
- `trip_crud.py` — CRUD, queries, history
- `trip_lifecycle.py` — status updates, expected time calculations
- `trip_assignment.py` — torpedo assignment, trip generation

Analytics routes (split for modularity):
- `statistics.py` — general KPIs
- `deviation_analytics.py` — deviation analysis (6 specialized endpoints)
- `performance_analytics.py` — user-specific metrics

Planning routes:
- `daily_plans.py` — daily capacity with caching
- `plans.py` — **hosts BOTH** monthly planning (`get_monthly_plans()` ~line 724+) AND distribution optimization (`generate_optimized_plan()` ~line 92). Earlier plans to split into `monthly_plans.py` and `distributions.py` were reverted — those files do not exist.

### Backend Utilities

**Security:**
- `backend/utils/security.py` — JWT auth, password hashing, `require_roles()`, token blacklist
- `backend/utils/lockout.py` — account lockout (5 fails → 15min default)
- `backend/utils/rate_limit.py` — slowapi-based tiers (auth: 5/min, high: 60, medium: 20, low: 10)
- `backend/utils/csrf.py` — double-submit cookie pattern

**Observability:**
- `backend/utils/tracing.py` — OpenTelemetry tracing, correlation IDs
- `backend/utils/activity_logger.py` — atomic audit logging, retry logic, change diff

**Data management:**
- `backend/utils/soft_delete.py` — `active_only()`, `restore()`, `is_deleted()`
- `backend/utils/trip_validation.py` — status transition rules, timestamp monotonicity, stuck trip detection
- `backend/utils/errors.py` — structured error classes + categorized codes
- `backend/utils/analytics_helpers.py` — deviation/KPI calculation helpers

**Infrastructure:**
- `backend/utils/redis_cache.py` — Redis with in-memory fallback
- `backend/utils/cache.py` — ThreadSafeCache for single-process mode

**Integrations:**
- `backend/utils/email_service.py` — email sending (stubbed after MFA/verification strip; check before using)
- `backend/utils/whatsapp_service.py` — WhatsApp API client
- `backend/utils/whatsapp_templates.py` — message templates

**Note:** No dedicated `env_validator.py` — env validation is inline in `main.py` / `init_db.py`.

### Health Endpoint

```
GET /health
```
Response:
```json
{ "status": "healthy", "database": "connected" }
```
Returns 503 if database is unreachable.

### OpenTelemetry Tracing
- FastAPI + SQLAlchemy auto-instrumentation
- Correlation ID in `X-Correlation-ID` header
- OTLP gRPC exporter → Jaeger or OTLP-compatible backend
- Manual span decorator: `@trace_span("operation_name")`

### Frontend Structure (React)
- `frontend/src/App.jsx` — main app, React Router, role-based protection, exports `PAGE_ID_TO_PATH`
- `frontend/src/pages/`:
  - `LoginPage.jsx` — login entry
  - `Dashboard.jsx` — KPI overview
  - `Operations.jsx` — node-specific operations (admin sees tabs for all nodes)
  - `TripManagement.jsx` — trip lifecycle
  - `FleetManagement.jsx` — torpedo fleet
  - `DailyPlanning.jsx` — daily capacity
  - `MonthlyPlanning.jsx` — strategic planning + System Settings
  - `Configuration.jsx` — HM Matrix (travel, fill, unload times)
  - `Statistics.jsx` — admin/producer/consumer analytics
  - `DeviationAnalytics.jsx` — admin deviation dashboard
  - `Reports.jsx` — report generation + export
  - `ActivityMonitoring.jsx` — audit trail viewer
  - `MaintenanceScheduling.jsx` — maintenance calendar
  - `Settings.jsx` — user settings
- `frontend/src/context/`:
  - `AuthContext.jsx` — user authentication state
  - `NotificationContext.jsx` — toast notifications
  - `HeaderContext.jsx` — dynamic header content
  - **(No `ThemeContext` — dark mode was stripped.)**
- `frontend/src/utils/api.ts` — centralized API client, JWT handling, CSRF header (TypeScript)
- `frontend/src/types/` — TypeScript type definitions

### Key Domain Models

**Trip Lifecycle (16 statuses, 0-15) — defined in `backend/constants.py`:**
```
0: PENDING            Trip created, awaiting torpedo assignment
1: ASSIGNED           Torpedo assigned, expected times calculated
2: WB_TARE_ENTRY      Arrived at weighbridge (empty)
3: WB_TARE_RECORDED   Tare weight measured
4: PRODUCER_ENTERED   Entered producer facility
5: LOADING_STARTED    Loading begins
6: LOADING_ENDED      Loading complete
7: PRODUCER_EXITED    Exited producer, in transit
8: WB_GROSS_ENTRY     Arrived at weighbridge (full)
9: WB_GROSS_RECORDED  Gross weight measured
10: CONSUMER_ENTERED  Arrived at consumer facility
11: UNLOADING_STARTED Unloading begins
12: UNLOADING_ENDED   Unloading complete
13: COMPLETED         Trip finished (exited consumer)
14: CANCELED          Trip canceled (pre-execution)
15: ABORTED           Trip aborted mid-execution
```
Helpers in `constants.py`: `is_active()`, `is_at_producer()`, `is_at_consumer()`, `is_at_weighbridge()`, `can_cancel()`, `can_abort()`.

**Live Operations Intelligence:**
- Expected times calculated from HM Matrix at torpedo assignment
- Phase-level deviation tracking (expected vs actual per stage)
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
- `/api/statistics/deviation-summary` — counts by category, min/max/avg
- `/api/statistics/deviation-by-node` — per producer/consumer
- `/api/statistics/deviation-by-phase` — Loading/Transit/Unloading breakdown
- `/api/statistics/deviation-trends` — time-series (daily or monthly)
- `/api/statistics/deviation-comparison` — period-over-period
- `/api/statistics/root-cause-analysis` — shift, day of week, worst routes

**Models (in `backend/database/models.py`):**

Users & auth:
- `User` — SoftDeleteMixin, email column retained (verification stripped)
- `LoginAttempt` — brute-force tracking

Fleet & plant:
- `FleetManagement` — torpedo tracking (Operating/Maintenance) — SoftDeleteMixin
- `FleetLiveLocation` — real-time GPS/status
- `LocationCoordinate` — plant node mapping
- `MaintenanceSchedule` — maintenance windows
- `NodeStatusHistory` — node operational status changes

Trips:
- `Trip` — core trip record — SoftDeleteMixin
- `Weighbridge` — physical weighbridge units
- `WeighbridgeRecord` — tare/gross measurements per trip

Converter/equipment:
- `Converter` — LD/ZPF/EAF vessels
- `TripConverterDistribution` — trip→converter mapping
- `ConverterStatusHistory` — converter lifecycle events

Planning:
- `DailyPlan` — producer/consumer capacity (Primary→Revised→Confirmed)
- `DistributionAssignment` — links producers to consumers with quantity/trips
- `TripTimeConfig` — travel times between nodes
- `ConsumerConfig` / `ProducerConfig` — node-specific settings
- `RoutingConstraint` — route restrictions

System:
- `SystemConfig` — global settings (TRAVEL_TO_PRODUCER_MINUTES, EXIT_BUFFER_MINUTES, etc.)
- `DeviationThresholdConfig` — per-metric alert thresholds
- `UserActivity` — audit trail
- `Notification` — user notifications

## API Patterns

- All routes under `/api/` prefix
- JWT in `Authorization: Bearer <token>`
- Roles: `admin`, `producer`, `consumer`
- `require_roles("admin", "producer")` decorator for protection
- CSRF token in `X-CSRF-Token` header for POST/PUT/DELETE/PATCH
- Correlation ID via `X-Correlation-ID` (auto-generated if absent)

### Key Endpoints

**Authentication:**
```
POST /api/auth/login              # Login (5/min rate limit)
POST /api/auth/register           # Register (3/min)
POST /api/auth/refresh            # Refresh JWT
POST /api/auth/logout             # Blacklist token
GET  /api/csrf-token              # Get CSRF token
```

**Trips:**
```
GET  /api/trips                   # List with filters
POST /api/trips/manual            # Manual create (admin)
PUT  /api/trips/{trip_id}/status  # Update status
GET  /api/trips/active            # Active trips (status 0-12)
GET  /api/trips/history           # Completed with pagination
```

**Planning (in `plans.py`):**
```
GET  /api/daily-plans/{date}
POST /api/daily-plans
GET  /api/monthly-plans/{year}/{month}
POST /api/distributions/optimize  # PuLP linear programming
```

**Configuration:**
```
POST /api/config/hm-matrix
GET  /api/config/system-settings
POST /api/config/system-settings/bulk  # admin, 3/min
```

**Monitoring:**
```
GET  /api/live-ops/trips
GET  /api/activity-logs
GET  /health
```

**Weighbridges:**
```
GET  /api/weighbridges
POST /api/weighbridges              # admin
PUT  /api/weighbridges/{id}         # admin
PUT  /api/weighbridges/{id}/status  # admin
GET  /api/weighbridge-records/{trip_id}
POST /api/weighbridge-records
```

**Converters:**
```
GET  /api/converters                # List
POST /api/converters                # admin
PUT  /api/converters/{id}
PUT  /api/converters/{id}/status
```

### Error Response Format

```json
{
  "success": false,
  "error": "ValidationError",
  "error_code": "VAL_2001",
  "message": "Missing required field: producer_id",
  "details": { "field": "producer_id", "requirement": "required" },
  "field_errors": [
    { "field": "producer_id", "message": "This field is required", "code": "required" }
  ],
  "request_id": "correlation-id-uuid"
}
```

**Error Code Categories:**
- **1xxx** Authentication (invalid credentials, token expired, locked)
- **2xxx** Validation (required, format, range)
- **3xxx** Resource (not found, duplicate, conflict)
- **4xxx** Trip-specific (invalid transition, no available torpedo)
- **5xxx** Fleet (in maintenance, already assigned)
- **6xxx** Planning (date passed, capacity exceeded)
- **7xxx** Rate limit
- **9xxx** Server (internal, database)

**System Settings Keys:**
- `TRAVEL_TO_PRODUCER_MINUTES` — depot→producer after assignment (default 15)
- `EXIT_BUFFER_MINUTES` — buffer after load/unload before exit (default 5)
- `DEFAULT_WAIT_TIME`, `DEFAULT_FILL_TIME`, `DEFAULT_UNLOAD_TIME`, `DEFAULT_TRAVEL_TIME`

## Database

- PostgreSQL via `backend/.env`:
  - `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`
  - `SECRET_KEY` required for JWT
- Models auto-create via `init_db()` on startup (dev); Alembic for production migrations
- **Soft Delete**: `User`, `Trip`, `FleetManagement` carry `deleted_at` (via `SoftDeleteMixin`)

## Production Readiness

### Security Features

**Account Lockout:**
- 5 failed attempts → 15min lockout (configurable)
- Tracks by username + IP
- Admin unlock via `unlock_account()`
- Env: `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_DURATION_MINUTES`

**Token Blacklist:**
- Redis-backed with SHA-256 hashing
- Automatic TTL cleanup
- Force logout all sessions: `clear_user_tokens(username)`

**Rate Limiting (slowapi):**
- Tiers: auth (5/min), high (60/min), medium (20/min), low (10/min), export (5/min)
- Test mode: `RATE_LIMIT_ENABLED=false`

**CSRF:**
- Double-submit cookie pattern
- Token format: `random.timestamp.signature` (HMAC-SHA256)
- Exempt paths: login, register, health, docs
- Endpoint: `GET /api/csrf-token`

**Security Headers:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (when HTTPS enabled)
- `Content-Security-Policy` + `Permissions-Policy`

**HTTPS Enforcement:**
- Auto HTTP→HTTPS redirect (301) when `ENFORCE_HTTPS=true`
- Supports `X-Forwarded-Proto` for reverse proxy

### Observability

**OpenTelemetry:**
- FastAPI + SQLAlchemy auto-instrumentation
- Correlation ID across requests
- OTLP gRPC → Jaeger or any OTLP backend
- Env: `OTEL_ENABLED`, `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`
- Manual spans: `@trace_span("operation_name")`

**Structured Errors:**
- Exception classes: `HMDException`, `NotFoundError`, `ValidationError`, `TripStatusError`
- Field-level validation errors (Pydantic integration)
- Correlation ID in every error response

### Data Management

**Soft Delete:**
- Models: `User`, `Trip`, `FleetManagement`
- Helpers: `active_only(query)`, `soft_delete(db, record)`, `restore(db, record)`
- Query helpers: `get_active()`, `get_active_by_id()`

**Trip Validation:**
- Status transition rules (prevents invalid jumps)
- Timestamp monotonicity
- Stuck trip detection with configurable thresholds
- Helper: `update_trip_status()`

**Atomic Audit Logging:**
- Transaction-safe with retry logic
- Change diff via `log_entity_change()`
- Context: IP, user agent
- `atomic_operation()` context manager (savepoint support)

### Caching

**Redis Cache (primary):**
- Connection pool (max 20)
- Auto fallback to in-memory if unavailable
- TTL support
- Pattern invalidation: `delete_pattern("plans:*")`
- Env: `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB`, `REDIS_PASSWORD`

**In-Memory Fallback:**
- `ThreadSafeCache` (RLock)
- Automatic expiration cleanup
- Prefix-based pattern matching

**Cache Decorator:**
```python
@cached(cache_key="plans:{date}", ttl=300)
def get_daily_plan(date: str): ...
```

### Environment Configuration

**Required:**
- `SECRET_KEY` — JWT signing key (min 32 chars, no default)
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD`, `DATABASE_NAME`

**Security (optional with defaults):**
- `ENFORCE_HTTPS` (false)
- `CSRF_ENABLED` (true)
- `RATE_LIMIT_ENABLED` (true)
- `MAX_LOGIN_ATTEMPTS` (5)
- `LOCKOUT_DURATION_MINUTES` (15)
- `ACCESS_TOKEN_EXPIRE_MINUTES` (480)

**Observability (optional):**
- `OTEL_ENABLED` (true)
- `OTEL_SERVICE_NAME` (`hmd-backend`)
- `OTEL_EXPORTER_OTLP_ENDPOINT` (`http://localhost:4317`)

**Infrastructure (optional):**
- `CACHE_ENABLED` (true)
- `REDIS_HOST` (localhost), `REDIS_PORT` (6379)
- `ALLOWED_ORIGINS` — CORS whitelist (comma-separated)

**Startup Validation:**
- Env vars validated inline on app startup (see `main.py` / `init_db.py`)
- Detailed error messages for missing/invalid config
- Safe summary logging (sensitive values masked)

## Frontend Patterns

### React Router URLs

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
| `/operations` | Node Operations | Yes (All) | All (Admin sees tabbed view) |
| `/reports` | Reports | Yes (Admin) | Admin only |
| `/settings` | Settings | Yes | All authenticated |

**Strategic Planning Tabs (Admin):**
- Executive View — dashboard summary + node monitoring
- Configuration — HM Matrix
- Maintenance — maintenance calendar
- Strategic — monthly calendar planning
- Weighbridge — weighbridge unit management

Configuration and Maintenance were moved from the sidebar into Strategic Planning tabs. Routes still resolve, but primary entry is via tabs.

**Navigation:**
- `Sidebar.jsx` — `<Link>` from react-router-dom
- `Header.jsx` — `useNavigate()` for notification routing
- `App.jsx` — exports `PAGE_ID_TO_PATH` for back-compat

### API Usage
```typescript
import { api } from './utils/api';
const data = await api.get<Trip[]>('/api/trips', { status: 'active' });
await api.post('/api/plans', { date: '2024-01-20', capacity: 100 });
// Auth stored in sessionStorage under 'hmd_user'
```

### CSS Variables & Theming

Uses CSS custom properties. Key variables:
- `var(--bg-primary)`, `var(--bg-secondary)` — backgrounds
- `var(--text-primary)`, `hsl(var(--text-muted))` — text
- `hsl(var(--border-color))`, `hsl(var(--primary))` — border/accent

**Dark mode is NOT supported** — `ThemeContext` was stripped. Don't reintroduce `useTheme()` / `data-theme="dark"` patterns without explicit scope expansion.

**Avoid hardcoded colors:**
- `background: white` → `background: var(--bg-secondary)`
- `background: #f8fafc` → `background: var(--bg-primary)`

### UI Styling Patterns
- Card hover: `transform: translateY(-2px)` + box-shadow
- Accent bars: `::before` pseudo-element with gradient
- Rounded corners: `border-radius: 8px-16px`
- KPI cards: colored left border (`border-left: 3px solid ${color}`)
- Summary cards: icon + value + label with accent
- Data tables: sticky headers, solid backgrounds
- Filter controls: gradient bg with focus ring
- Modals: backdrop blur, rounded corners

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

**Status:** Index was previously built for `Version_06`. Since this is a fresh repo at `Version_07` (see Repository State above), **the existing GitNexus index is stale**. Rebuild before relying on it:

```bash
npx gitnexus analyze --embeddings   # preserve embeddings if previously generated
```

After rebuild, the resources below will refer to `Version_07`.

## Always Do

- **MUST run impact analysis before editing any symbol.** Run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level).
- **MUST run `gitnexus_detect_changes()` before committing** to verify changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact returns HIGH or CRITICAL risk before proceeding.
- For unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping.
- For full context on a symbol, use `gitnexus_context({name: "symbolName"})`.

## When Debugging

1. `gitnexus_query({query: "<error or symptom>"})` — find related execution flows
2. `gitnexus_context({name: "<suspect function>"})` — see callers, callees, flow participation
3. `READ gitnexus://repo/Version_07/process/{processName}` — trace full execution step by step
4. Regressions: `gitnexus_detect_changes({scope: "compare", base_ref: "main"})`

## When Refactoring

- **Renaming**: MUST use `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` first. Review preview. Graph edits are safe; text_search edits need manual review. Then run with `dry_run: false`.
- **Extracting/Splitting**: Run `gitnexus_context({name: "target"})` first to see refs; then `gitnexus_impact({target: "target", direction: "upstream"})` to find external callers.
- After refactor: `gitnexus_detect_changes({scope: "all"})` to verify scope.

## Never Do

- NEVER edit a symbol without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings.
- NEVER rename with find-and-replace — use `gitnexus_rename`.
- NEVER commit without `gitnexus_detect_changes()`.

## Tools Quick Reference

| Tool | When to use | Command |
|------|-------------|---------|
| `query` | Find code by concept | `gitnexus_query({query: "auth validation"})` |
| `context` | 360° view of one symbol | `gitnexus_context({name: "validateUser"})` |
| `impact` | Blast radius before editing | `gitnexus_impact({target: "X", direction: "upstream"})` |
| `detect_changes` | Pre-commit scope check | `gitnexus_detect_changes({scope: "staged"})` |
| `rename` | Safe multi-file rename | `gitnexus_rename({symbol_name: "old", new_name: "new", dry_run: true})` |
| `cypher` | Custom graph queries | `gitnexus_cypher({query: "MATCH ..."})` |

## Impact Risk Levels

| Depth | Meaning | Action |
|-------|---------|--------|
| d=1 | WILL BREAK — direct callers | MUST update |
| d=2 | LIKELY AFFECTED — indirect | Should test |
| d=3 | MAY NEED TESTING — transitive | Test if critical path |

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Version_07/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Version_07/clusters` | Functional areas |
| `gitnexus://repo/Version_07/processes` | All execution flows |
| `gitnexus://repo/Version_07/process/{name}` | Step-by-step execution trace |

## Self-Check Before Finishing

1. `gitnexus_impact` run for all modified symbols
2. No HIGH/CRITICAL risk warnings ignored
3. `gitnexus_detect_changes()` confirms scope
4. All d=1 dependents updated

## Keeping the Index Fresh

After commit, re-run analyze:

```bash
npx gitnexus analyze
```

Preserve embeddings (if previously generated):

```bash
npx gitnexus analyze --embeddings
```

Check `.gitnexus/meta.json` — `stats.embeddings` shows count (0 = none). **Running analyze without `--embeddings` deletes previously generated embeddings.**

> Claude Code: A PostToolUse hook runs this automatically after `git commit` / `git merge`.

## CLI Skill Files

| Task | Skill file |
|------|-----------|
| Understand architecture | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools / schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index / status / clean / wiki CLI | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
