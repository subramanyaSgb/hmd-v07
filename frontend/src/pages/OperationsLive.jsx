import { useState, useEffect } from 'react'
import { api } from '../utils/api'

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
            <h2 className="space-grotesk" style={{ margin: 0 }}>Operations Live</h2>
            {/* Sub-sections wired up in Batch B onward */}
        </div>
    )
}

export default OperationsLive
