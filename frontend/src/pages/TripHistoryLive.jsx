import { useState, useEffect } from 'react'
import { useSearchParams, useParams, useNavigate } from 'react-router-dom'
import { api } from '../utils/api'
import { formatRelative } from '../utils/time'
import TripListTable from '../components/TripHistoryLive/TripListTable'
import Pagination from '../components/TripHistoryLive/Pagination'

const LIST_POLL_INTERVAL_MS = 30_000   // list refresh; most rows are historical
const TICK_MS = 1_000

// Query-param defaults applied when not present in the URL.
const URL_DEFAULTS = {
    time_window: 'today',
    page: '1',
    page_size: '50',
    sort_by: 'out_date',
    sort_order: 'desc',
}

// Filter keys we forward to the backend when non-empty (omit on default-empty).
const FORWARDED_KEYS = [
    'time_window', 'source_lab', 'destination', 'shift',
    'fleet_id', 'status', 'q', 'page', 'page_size',
    'sort_by', 'sort_order',
]

const buildQuery = (sp) => {
    const out = {}
    for (const key of FORWARDED_KEYS) {
        const val = sp.get(key) || URL_DEFAULTS[key]
        if (val && val !== 'all') out[key] = val
    }
    return new URLSearchParams(out).toString()
}

const TripHistoryLive = () => {
    const [searchParams, setSearchParams] = useSearchParams()
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [tick, setTick] = useState(0)

    const { trip_id: trip_id_from_url } = useParams()
    const navigate = useNavigate()
    // Expanded trip is either driven by the URL (/trip-history-live/:trip_id)
    // or by a click handler (no URL change, just inline state). For now in
    // Batch B we only honor the URL; Batch D adds inline click expansion.
    const expandedTripId = trip_id_from_url || null

    const updateParams = (mut) => {
        const next = new URLSearchParams(searchParams)
        for (const [k, v] of Object.entries(mut)) {
            if (v === null || v === undefined || v === '') next.delete(k)
            else next.set(k, String(v))
        }
        return next
    }

    const handlePageChange = (newPage) => {
        const next = updateParams({ page: newPage })
        setSearchParams(next)
    }

    const handleSortChange = (sortBy, sortOrder) => {
        const next = updateParams({ sort_by: sortBy, sort_order: sortOrder, page: 1 })
        setSearchParams(next)
    }

    const handleRowClick = (tripId) => {
        // Batch B: navigate to deep-link route. Batch D layers inline toggle on top.
        if (tripId === expandedTripId) {
            navigate(`/trip-history-live?${searchParams.toString()}`)
        } else {
            navigate(`/trip-history-live/${encodeURIComponent(tripId)}?${searchParams.toString()}`)
        }
    }

    // List poll, re-fires when the URL changes (filter or page).
    useEffect(() => {
        let mounted = true
        const fetchData = async () => {
            try {
                const url = `/api/trip-history-live?${buildQuery(searchParams)}`
                const res = await api.get(url)
                if (mounted) { setData(res); setError(null) }
            } catch (e) {
                if (mounted) setError(e?.message || 'Failed to load trips')
            } finally {
                if (mounted) setLoading(false)
            }
        }
        fetchData()
        const id = setInterval(() => {
            if (typeof document !== 'undefined' && document.hidden) return
            fetchData()
        }, LIST_POLL_INTERVAL_MS)
        return () => { mounted = false; clearInterval(id) }
    }, [searchParams])

    // 1s tick for relative-time label (decoupled from list poll).
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), TICK_MS)
        return () => clearInterval(id)
    }, [])

    if (loading) {
        return (
            <div className="premium-page-container" style={{ padding: '24px' }}>
                Loading trip history…
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
                <h2 className="space-grotesk" style={{ margin: 0 }}>Trip History (Live)</h2>
                <span style={{
                    fontSize: '12px',
                    color: 'hsl(var(--text-muted))',
                }}>
                    Updated {formatRelative(data.last_sync_at?.wbatngl)}
                </span>
            </div>
            {/* FilterBar slot — Batch C wires this in */}

            <TripListTable
                rows={data.rows}
                onRowClick={handleRowClick}
                expandedTripId={expandedTripId}
                sortBy={searchParams.get('sort_by') || 'out_date'}
                sortOrder={searchParams.get('sort_order') || 'desc'}
                onSortChange={handleSortChange}
            />

            <Pagination
                page={Number(searchParams.get('page') || 1)}
                pageSize={data.page_size || 50}
                total={data.total || 0}
                onPageChange={handlePageChange}
            />

            {/* TripStoryExpanded slot — Batch D wires this in */}

            <span style={{ display: 'none' }}>{tick}</span>
        </div>
    )
}

export default TripHistoryLive
