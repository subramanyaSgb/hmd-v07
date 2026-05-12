import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { formatRelative } from '../utils/time'
import TopKpiStrip from '../components/OperationsLive/TopKpiStrip'
import RecentActivityFeed from '../components/OperationsLive/RecentActivityFeed'

const POLL_INTERVAL_MS = 10_000   // matches /api/operations-live/dashboard cache TTL × 2

const OperationsLive = () => {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        let mounted = true
        const fetchData = async () => {
            try {
                const res = await api.get('/api/operations-live/dashboard')
                if (mounted) { setData(res); setError(null) }
            } catch (e) {
                if (mounted) setError(e?.message || 'Failed to load operations data')
            } finally {
                if (mounted) setLoading(false)
            }
        }
        fetchData()
        const id = setInterval(() => {
            // Pause when the tab is hidden — no point burning cycles.
            if (typeof document !== 'undefined' && document.hidden) return
            fetchData()
        }, POLL_INTERVAL_MS)
        return () => { mounted = false; clearInterval(id) }
    }, [])

    const [tick, setTick] = useState(0)
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1000)
        return () => clearInterval(id)
    }, [])

    if (loading) {
        return (
            <div className="premium-page-container" style={{ padding: '24px' }}>
                Loading operations data…
            </div>
        )
    }
    if (error) {
        return (
            <div className="premium-page-container"
                 style={{ padding: '24px', color: 'hsl(var(--danger))' }}>
                Error: {error}
            </div>
        )
    }
    if (!data) return null

    return (
        <div className="premium-page-container" style={{ padding: '24px 32px', overflowY: 'auto' }}>
            <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: '24px', gap: '16px', flexWrap: 'wrap',
            }}>
                <h2 className="space-grotesk" style={{ margin: 0 }}>Operations Live</h2>
                <span style={{
                    fontSize: '12px',
                    color: 'hsl(var(--text-muted))',
                }}>
                    Updated {formatRelative(data.last_sync_at?.wbatngl)}
                </span>
            </div>
            <TopKpiStrip kpis={data.kpi_strip} />
            <RecentActivityFeed events={data.activity_feed} />
            {/* Sections wired in Batch B onward. Read `tick` so re-renders happen. */}
            <span style={{ display: 'none' }}>{tick}</span>
        </div>
    )
}

export default OperationsLive
