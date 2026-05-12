import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { NotificationProvider } from './context/NotificationContext'
import { HeaderProvider } from './context/HeaderContext'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import './index.css'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Statistics = lazy(() => import('./pages/Statistics'))
const TripManagement = lazy(() => import('./pages/TripManagement'))
const Settings = lazy(() => import('./pages/Settings'))
const DailyPlanning = lazy(() => import('./pages/DailyPlanning'))
const Configuration = lazy(() => import('./pages/Configuration'))
const FleetManagement = lazy(() => import('./pages/FleetManagement'))
const ActivityMonitoring = lazy(() => import('./pages/ActivityMonitoring'))
const Operations = lazy(() => import('./pages/Operations'))
const MonthlyPlanning = lazy(() => import('./pages/MonthlyPlanning'))
const MaintenanceScheduling = lazy(() => import('./pages/MaintenanceScheduling'))
const Reports = lazy(() => import('./pages/Reports'))
const PlantLive = lazy(() => import('./pages/PlantLive'))
const OperationsLive = lazy(() => import('./pages/OperationsLive'))

export const ROUTE_CONFIG = {
  '/': { title: 'Live Tracking' },
  '/statistics': { title: 'Dashboard' },
  '/analytics/deviation': { title: 'Dashboard' },
  '/planning/monthly': { title: 'Strategic Planning' },
  '/planning/daily': { title: 'Daily Planning' },
  '/trips': { title: 'Trip Management' },
  '/fleet': { title: 'Torpedo Management' },
  '/audit': { title: 'Audit Trail' },
  '/operations': { title: 'Operations Control' },
  '/configuration': { title: 'Logistics Configuration' },
  '/maintenance': { title: 'Maintenance Scheduling' },
  '/reports': { title: 'Reports' },
  '/settings': { title: 'Settings' },
}

export const PAGE_ID_TO_PATH = {
  'dashboard': '/',
  'statistics': '/statistics',
  'deviation-analytics': '/analytics/deviation',
  'monthly-planning': '/planning/monthly',
  'daily-planning': '/planning/daily',
  'trip-management': '/trips',
  'fleet-management': '/fleet',
  'activity-monitoring': '/audit',
  'operations': '/operations',
  'configuration': '/configuration',
  'maintenance-scheduling': '/maintenance',
  'reports': '/reports',
  'settings': '/settings',
}

export const PATH_TO_PAGE_ID = Object.fromEntries(
  Object.entries(PAGE_ID_TO_PATH).map(([id, path]) => [path, id])
)

const LoadingSpinner = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    width: '100vw',
    background: 'hsl(var(--main-bg))'
  }}>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '4px solid hsl(var(--border))',
        borderTopColor: 'hsl(var(--primary))',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <p style={{
        color: 'hsl(var(--text-muted))',
        fontWeight: 600
      }}>
        Loading...
      </p>
    </div>
    <style>{`
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `}</style>
  </div>
)

const PageWrapper = ({ children, title }) => {
  const location = useLocation()
  const pageTitle = title || ROUTE_CONFIG[location.pathname]?.title || 'HMD System'

  return (
    <Layout title={pageTitle}>
      <ErrorBoundary key={location.pathname}>
        {children}
      </ErrorBoundary>
    </Layout>
  )
}

const getDefaultRoute = (role) => {
  return '/statistics'
}

function AppRoutes() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (!user) {
    if (location.pathname !== '/') {
      return <Navigate to="/" replace />
    }
    return <LoginPage />
  }

  const isAdmin = user.role === 'admin'
  const isTRS = user.role === 'trs'
  const isPPC = user.role === 'ppc'
  const isAdminOrTRS = isAdmin || isTRS
  const isProducerOrConsumer = user.role === 'producer' || user.role === 'consumer'
  const defaultRoute = getDefaultRoute(user.role)

  const needsRedirect = sessionStorage.getItem('hmd_needs_redirect')

  useEffect(() => {
    if (location.pathname === '/statistics' && needsRedirect === 'true') {
      sessionStorage.removeItem('hmd_needs_redirect')
    }
  }, [location.pathname, needsRedirect])

  if (needsRedirect === 'true' && location.pathname !== '/statistics') {
    return <Navigate to="/statistics" replace />
  }

  return (
    <Routes>
      <Route path="/" element={<PageWrapper><Dashboard /></PageWrapper>} />
      <Route path="/statistics" element={<PageWrapper><Statistics /></PageWrapper>} />
      <Route path="/trips" element={<PageWrapper><TripManagement /></PageWrapper>} />
      <Route path="/plant" element={<PageWrapper><PlantLive /></PageWrapper>} />
      <Route path="/operations-live" element={<PageWrapper><OperationsLive /></PageWrapper>} />
      <Route path="/settings" element={<PageWrapper><Settings /></PageWrapper>} />
      {isAdminOrTRS && (
        <>
          <Route path="/audit" element={<PageWrapper><ActivityMonitoring /></PageWrapper>} />
          <Route path="/analytics/deviation" element={<Navigate to="/statistics" replace />} />
          <Route path="/planning/monthly" element={<PageWrapper><MonthlyPlanning /></PageWrapper>} />
          <Route path="/fleet" element={<PageWrapper><FleetManagement /></PageWrapper>} />
          <Route path="/configuration" element={<PageWrapper><Configuration /></PageWrapper>} />
          <Route path="/maintenance" element={<PageWrapper><MaintenanceScheduling /></PageWrapper>} />
          <Route path="/reports" element={<PageWrapper><Reports /></PageWrapper>} />
          <Route path="/operations" element={<PageWrapper><Operations /></PageWrapper>} />
        </>
      )}
      {isPPC && (
        <>
          <Route path="/analytics/deviation" element={<Navigate to="/statistics" replace />} />
          <Route path="/reports" element={<PageWrapper><Reports /></PageWrapper>} />
        </>
      )}
      {isProducerOrConsumer && (
        <>
          <Route path="/planning/daily" element={<PageWrapper><DailyPlanning /></PageWrapper>} />
          <Route path="/operations" element={<PageWrapper><Operations /></PageWrapper>} />
        </>
      )}
      <Route path="*" element={<Navigate to={defaultRoute} replace />} />
    </Routes>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <NotificationProvider>
          <HeaderProvider>
            <AuthProvider>
              <Suspense fallback={<LoadingSpinner />}>
                <AppRoutes />
              </Suspense>
            </AuthProvider>
          </HeaderProvider>
        </NotificationProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
