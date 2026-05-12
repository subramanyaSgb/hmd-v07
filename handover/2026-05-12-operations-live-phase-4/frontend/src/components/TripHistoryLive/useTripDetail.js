import { useState, useEffect } from 'react'
import { api } from '../../utils/api'

const DETAIL_POLL_INTERVAL_MS = 10_000

/**
 * Fetches /api/trip-history-live/:trip_id and re-polls every 10s while
 * trip_id remains set. Returns null data when trip_id is null/undefined.
 * Error from a single poll is preserved on the result until the next
 * successful poll clears it.
 */
const useTripDetail = (tripId) => {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (!tripId) {
            setData(null)
            setLoading(false)
            setError(null)
            return
        }
        let mounted = true
        setLoading(true)
        setData(null)
        setError(null)
        const fetchDetail = async () => {
            try {
                const res = await api.get(`/api/trip-history-live/${tripId}`)
                if (mounted) { setData(res); setError(null) }
            } catch (e) {
                if (mounted) setError(e?.message || 'Failed to load trip detail')
            } finally {
                if (mounted) setLoading(false)
            }
        }
        fetchDetail()
        const id = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return
            fetchDetail()
        }, DETAIL_POLL_INTERVAL_MS)
        return () => { mounted = false; clearInterval(id) }
    }, [tripId])

    return { data, loading, error }
}

export default useTripDetail
