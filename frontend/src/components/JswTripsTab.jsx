import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../utils/api'

const TIME_WINDOWS = [
    { value: 'today', label: 'TODAY' },
    { value: '24h',   label: '24H' },
    { value: '7d',    label: '7D' },
    { value: '30d',   label: '30D' },
]

const SOURCE_LABS = ['all', 'BF3', 'BF4', 'BF5']
const DESTINATIONS = ['all', 'SMS1', 'SMS2', 'SMS3', 'SMS4', 'RFL']
const SHIFTS = ['all', 'A', 'B', 'C']

const TEMP_MIN = 1450
const TEMP_MAX = 1530
const S_MAX = 0.05

const isOutOfSpec = (row) => (
    (row.temp != null && (row.temp < TEMP_MIN || row.temp > TEMP_MAX)) ||
    (row.s_l != null && row.s_l > S_MAX)
)

const fmtNum = (v, d = 1) => v != null ? Number(v).toFixed(d) : '—'
const fmtTime = (iso) => iso ? new Date(iso).toLocaleString() : '—'

const Chip = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        style={{
            padding: '4px 12px',
            borderRadius: '999px',
            border: '1px solid hsl(var(--border-color))',
            background: active ? 'hsl(var(--primary))' : 'transparent',
            color: active ? 'white' : 'hsl(var(--text-muted))',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.05em',
            cursor: 'pointer',
            textTransform: 'uppercase',
            transition: 'all 0.15s',
        }}
    >
        {children}
    </button>
)

const JswTripsTab = () => {
    const [timeWindow, setTimeWindow] = useState('today')
    const [filters, setFilters] = useState({
        source_lab: 'all',
        destination: 'all',
        shift: 'all',
        fleet_id: 'all',
    })
    const [q, setQ] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize] = useState(50)
    const [data, setData] = useState({ rows: [], total: 0, last_sync_at: null })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [refreshSeq, setRefreshSeq] = useState(0)
    const [syncing, setSyncing] = useState(false)

    const fleetIds = Array.from(new Set([
        'all',
        ...Array.from({ length: 53 }, (_, i) => `TLC-${String(i + 1).padStart(2, '0')}`),
    ]))

    const fetchData = useCallback(async () => {
        const params = new URLSearchParams({
            time_window: timeWindow,
            page: String(page),
            page_size: String(pageSize),
            ...Object.fromEntries(
                Object.entries(filters).filter(([, v]) => v && v !== 'all')
            ),
            ...(q.trim() ? { q: q.trim() } : {}),
        }).toString()
        try {
            const res = await api.get(`/api/jsw/trips?${params}`)
            setData(res)
            setError(null)
        } catch (e) {
            setError(e.message || 'Failed to load JSW trips')
        } finally {
            setLoading(false)
        }
    }, [timeWindow, page, pageSize, filters, q])

    // Manual refresh: trigger a JSW pull on the backend, then re-read the
    // mirror. Without the sync-now POST, the Refresh button could only
    // surface whatever the 60s tick had already written — confusing when
    // operators expect Refresh to mean "go look at JSW *now*".
    const handleRefresh = useCallback(async () => {
        if (syncing) return
        setSyncing(true)
        try {
            await api.post('/api/jsw/sync-now', {})
        } catch (e) {
            // Soft-fail: even if the sync trigger errors (network blip,
            // Oracle unreachable), we still want to re-read the mirror so
            // the UI shows whatever the latest tick already wrote.

            console.warn('JSW sync-now failed:', e?.message || e)
        } finally {
            setRefreshSeq(s => s + 1)
            setSyncing(false)
        }
    }, [syncing])

    // Reset to page 1 whenever filters or window change
    useEffect(() => { setPage(1) }, [timeWindow, filters, q])

    // Initial + 15s poll
    useEffect(() => {
        let mounted = true
        const run = async () => { if (mounted) await fetchData() }
        run()
        const id = setInterval(run, 15000)
        return () => { mounted = false; clearInterval(id) }
    }, [fetchData, refreshSeq])

    const totalPages = Math.max(1, Math.ceil((data.total || 0) / pageSize))

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Filter bar */}
            <div className="premium-card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Time window */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                        {TIME_WINDOWS.map(w => (
                            <Chip
                                key={w.value}
                                active={timeWindow === w.value}
                                onClick={() => setTimeWindow(w.value)}
                            >
                                {w.label}
                            </Chip>
                        ))}
                    </div>

                    {/* Search */}
                    <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: '320px' }}>
                        <Search size={14} style={{
                            position: 'absolute', left: '10px', top: '50%',
                            transform: 'translateY(-50%)', color: 'hsl(var(--text-muted))',
                        }} />
                        <input
                            type="text"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search trip / fleet / tap"
                            style={{
                                width: '100%',
                                padding: '6px 10px 6px 30px',
                                fontSize: '13px',
                                border: '1px solid hsl(var(--border-color))',
                                borderRadius: '8px',
                                background: 'hsl(var(--main-bg))',
                            }}
                        />
                    </div>

                    {/* Fleet dropdown */}
                    <select
                        value={filters.fleet_id}
                        onChange={(e) => setFilters(f => ({ ...f, fleet_id: e.target.value }))}
                        style={{
                            padding: '6px 10px',
                            fontSize: '13px',
                            border: '1px solid hsl(var(--border-color))',
                            borderRadius: '8px',
                            background: 'hsl(var(--main-bg))',
                        }}
                    >
                        {fleetIds.map(id => (
                            <option key={id} value={id}>{id === 'all' ? 'All Torpedos' : id}</option>
                        ))}
                    </select>

                    {/* Refresh button — pulls fresh data from JSW WBATNGL,
                        then re-reads the local mirror */}
                    <button
                        onClick={handleRefresh}
                        disabled={syncing}
                        title={syncing ? 'Syncing from JSW…' : 'Pull fresh data from JSW WBATNGL'}
                        style={{
                            padding: '6px 10px',
                            border: '1px solid hsl(var(--border-color))',
                            borderRadius: '8px',
                            background: 'transparent',
                            cursor: syncing ? 'wait' : 'pointer',
                            color: 'hsl(var(--text-muted))',
                            display: 'flex', alignItems: 'center', gap: '4px',
                            fontSize: '12px',
                            opacity: syncing ? 0.6 : 1,
                        }}
                    >
                        <RefreshCw size={12} /> {syncing ? 'Syncing…' : 'Refresh'}
                    </button>

                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'hsl(var(--text-muted))' }}>
                        {data.total} trips · last sync {data.last_sync_at ? new Date(data.last_sync_at).toLocaleTimeString() : '—'}
                    </span>
                </div>

                {/* Producer / Consumer / Shift chip rows */}
                <div style={{ display: 'flex', gap: '24px', marginTop: '10px', flexWrap: 'wrap' }}>
                    <ChipGroup
                        label="Producer"
                        options={SOURCE_LABS}
                        value={filters.source_lab}
                        onChange={(v) => setFilters(f => ({ ...f, source_lab: v }))}
                    />
                    <ChipGroup
                        label="Consumer"
                        options={DESTINATIONS}
                        value={filters.destination}
                        onChange={(v) => setFilters(f => ({ ...f, destination: v }))}
                    />
                    <ChipGroup
                        label="Shift"
                        options={SHIFTS}
                        value={filters.shift}
                        onChange={(v) => setFilters(f => ({ ...f, shift: v }))}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="premium-card" style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                minHeight: 0, padding: 0, overflow: 'hidden',
            }}>
                <div style={{ flex: 1, overflow: 'auto' }}>
                    {loading ? (
                        <div style={{ padding: '24px', color: 'hsl(var(--text-muted))' }}>Loading…</div>
                    ) : error ? (
                        <div style={{ padding: '24px', color: 'hsl(var(--danger))' }}>Error: {error}</div>
                    ) : data.rows.length === 0 ? (
                        <div style={{ padding: '24px', color: 'hsl(var(--text-muted))' }}>
                            No JSW trips match the current filters.
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ position: 'sticky', top: 0, background: 'hsl(var(--main-bg))', zIndex: 1 }}>
                                <tr>
                                    <th style={th}>Trip</th>
                                    <th style={th}>Fleet</th>
                                    <th style={th}>Producer</th>
                                    <th style={th}>Consumer</th>
                                    <th style={th}>Shift</th>
                                    <th style={th}>Net (MT)</th>
                                    <th style={th}>Temp (°C)</th>
                                    <th style={th}>S (%)</th>
                                    <th style={th}>Updated</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.map(r => {
                                    const oos = isOutOfSpec(r)
                                    return (
                                        <tr key={r.id || r.trip_id}
                                            style={oos ? { background: 'rgba(239,68,68,0.05)' } : undefined}>
                                            <td style={td}>{r.trip_id}</td>
                                            <td style={td}><strong>{r.fleet_id}</strong></td>
                                            <td style={td}>{r.source_lab || '—'}</td>
                                            <td style={td}>{r.destination || '—'}</td>
                                            <td style={td}>{r.shift || '—'}</td>
                                            <td style={td}>{fmtNum(r.net_weight, 1)}</td>
                                            <td style={{
                                                ...td,
                                                color: r.temp != null && (r.temp < TEMP_MIN || r.temp > TEMP_MAX)
                                                    ? 'hsl(var(--danger))' : 'inherit',
                                                fontWeight: r.temp != null && (r.temp < TEMP_MIN || r.temp > TEMP_MAX) ? 700 : 'inherit',
                                            }}>
                                                {fmtNum(r.temp, 0)}
                                            </td>
                                            <td style={{
                                                ...td,
                                                color: r.s_l != null && r.s_l > S_MAX
                                                    ? 'hsl(var(--danger))' : 'inherit',
                                                fontWeight: r.s_l != null && r.s_l > S_MAX ? 700 : 'inherit',
                                            }}>
                                                {fmtNum(r.s_l, 3)}
                                            </td>
                                            <td style={td}>{fmtTime(r.updated_date)}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination footer */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 16px', borderTop: '1px solid hsl(var(--border-color))',
                    fontSize: '12px', color: 'hsl(var(--text-muted))',
                }}>
                    <span>
                        Page {page} of {totalPages} · {data.total} total
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            style={pagerBtn(page <= 1)}
                        >
                            <ChevronLeft size={14} /> Prev
                        </button>
                        <button
                            disabled={page >= totalPages}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            style={pagerBtn(page >= totalPages)}
                        >
                            Next <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

const ChipGroup = ({ label, options, value, onChange }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
            fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
            color: 'hsl(var(--text-muted))', letterSpacing: '0.05em',
        }}>
            {label}
        </span>
        <div style={{ display: 'flex', gap: '4px' }}>
            {options.map(o => (
                <Chip key={o} active={value === o} onClick={() => onChange(o)}>
                    {o === 'all' ? 'All' : o}
                </Chip>
            ))}
        </div>
    </div>
)

const th = {
    textAlign: 'left',
    padding: '10px 12px',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'hsl(var(--text-muted))',
    fontWeight: 700,
    borderBottom: '2px solid hsl(var(--border-color))',
    whiteSpace: 'nowrap',
}
const td = {
    padding: '8px 12px',
    fontSize: '13px',
    borderBottom: '1px solid hsl(var(--border-color))',
    whiteSpace: 'nowrap',
}
const pagerBtn = (disabled) => ({
    display: 'flex', alignItems: 'center', gap: '2px',
    padding: '4px 10px',
    border: '1px solid hsl(var(--border-color))',
    borderRadius: '6px',
    background: 'transparent',
    color: disabled ? 'hsl(var(--text-muted))' : 'inherit',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontSize: '12px',
})

export default JswTripsTab
