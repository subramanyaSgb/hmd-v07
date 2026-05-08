import { useState, useEffect, useMemo } from 'react'
import { Activity, Factory, FlaskConical, Truck, Clock } from 'lucide-react'
import { api } from '../utils/api'

const TIME_WINDOWS = [
    { value: 'today', label: 'TODAY' },
    { value: '24h',   label: '24H' },
    { value: '7d',    label: '7D' },
    { value: '30d',   label: '30D' },
]

const formatRelative = (iso) => {
    if (!iso) return '—'
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
    if (diffSec < 60) return `${diffSec}s ago`
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    return `${Math.floor(diffSec / 3600)}h ago`
}

const PlantLive = () => {
    const [timeWindow, setTimeWindow] = useState('today')
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [tick, setTick] = useState(0)

    // 1-second tick for the relative-timer label only.
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1000)
        return () => clearInterval(id)
    }, [])

    // 15-second data poll (matches /api/jsw/dashboard cache TTL × 3).
    useEffect(() => {
        let mounted = true
        const fetchData = async () => {
            try {
                const res = await api.get(`/api/jsw/dashboard?time_window=${timeWindow}`)
                if (mounted) { setData(res); setError(null) }
            } catch (e) {
                if (mounted) setError(e.message || 'Failed to load JSW data')
            } finally {
                if (mounted) setLoading(false)
            }
        }
        fetchData()
        const id = setInterval(fetchData, 15000)
        return () => { mounted = false; clearInterval(id) }
    }, [timeWindow])

    const updatedRel = useMemo(() => {
        // re-evaluate every tick so "5s ago" advances even when data is stale
        void tick
        return formatRelative(data?.last_sync_at)
    }, [data?.last_sync_at, tick])

    if (loading) {
        return <div className="premium-page-container" style={{ padding: '24px' }}>Loading plant data…</div>
    }
    if (error) {
        return <div className="premium-page-container" style={{ padding: '24px', color: 'hsl(var(--danger))' }}>Error: {error}</div>
    }
    if (!data) return null

    const { kpis, flow, chemistry, recent_trips: recentTrips } = data
    const tonnageDelta = (kpis.tonnage_total_mt || 0) - (kpis.tonnage_total_prior_mt || 0)
    const tonnageDeltaPct = kpis.tonnage_total_prior_mt
        ? (tonnageDelta / kpis.tonnage_total_prior_mt) * 100
        : null
    const tripsDelta = (kpis.trips_count || 0) - (kpis.trips_count_prior || 0)

    return (
        <div className="premium-page-container" style={{ padding: '24px 32px', overflowY: 'auto' }}>
            {/* Header strip — title + time-window chips + last-updated label */}
            <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: '24px', gap: '16px', flexWrap: 'wrap',
            }}>
                <h2 className="space-grotesk" style={{ margin: 0 }}>Plant Live</h2>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {TIME_WINDOWS.map(w => (
                        <button
                            key={w.value}
                            onClick={() => setTimeWindow(w.value)}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: '1px solid hsl(var(--border-color))',
                                background: timeWindow === w.value ? 'hsl(var(--primary))' : 'transparent',
                                color: timeWindow === w.value ? 'white' : 'hsl(var(--text-muted))',
                                fontWeight: 700,
                                fontSize: '11px',
                                letterSpacing: '0.05em',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                        >
                            {w.label}
                        </button>
                    ))}
                    <span style={{
                        fontSize: '12px',
                        color: 'hsl(var(--text-muted))',
                        marginLeft: '12px',
                    }}>
                        Updated {updatedRel}
                    </span>
                </div>
            </div>

            {/* KPI strip */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
                marginBottom: '24px',
            }}>
                <KpiCard
                    label="Trips"
                    value={kpis.trips_count}
                    delta={tripsDelta !== 0 ? (tripsDelta > 0 ? `+${tripsDelta}` : `${tripsDelta}`) : null}
                    deltaNegative={tripsDelta < 0}
                    icon={<Truck size={18} />}
                />
                <KpiCard
                    label="Tonnage (MT)"
                    value={(kpis.tonnage_total_mt || 0).toFixed(1)}
                    delta={tonnageDeltaPct !== null
                        ? `${tonnageDeltaPct > 0 ? '+' : ''}${tonnageDeltaPct.toFixed(0)}%`
                        : null}
                    deltaNegative={tonnageDeltaPct !== null && tonnageDeltaPct < 0}
                    icon={<Factory size={18} />}
                />
                <KpiCard
                    label="Avg Cycle (min)"
                    value={kpis.avg_cycle_min ?? '—'}
                    icon={<Clock size={18} />}
                />
                <KpiCard
                    label="Active Torpedos"
                    value={`${kpis.active_torpedoes}/${kpis.fleet_size}`}
                    icon={<Activity size={18} />}
                />
            </div>

            {/* Producer → Consumer Flow */}
            <Section title="Producer → Consumer Flow">
                {flow.length === 0 ? (
                    <div style={{ color: 'hsl(var(--text-muted))', fontSize: '13px' }}>
                        No flow data in this window.
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={th}>Producer</th>
                                <th style={th}>Consumer</th>
                                <th style={th}>Trips</th>
                                <th style={th}>Tonnage (MT)</th>
                                <th style={th}>Avg Net (MT)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {flow.map((r, i) => (
                                <tr key={`${r.source_lab}-${r.destination}-${i}`}>
                                    <td style={td}>{r.source_lab || '—'}</td>
                                    <td style={td}>{r.destination || '—'}</td>
                                    <td style={td}>{r.trips}</td>
                                    <td style={td}>{(r.tonnage_mt || 0).toFixed(1)}</td>
                                    <td style={td}>{r.avg_net_mt != null ? r.avg_net_mt.toFixed(1) : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Section>

            {/* Chemistry + Live Feed (two-column on wide screens) */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: '16px',
            }}>
                <Section title="Chemistry Snapshot" icon={<FlaskConical size={14} />}>
                    <ChemistryRow label="Avg Temp" value={chemistry.avg_temp_c}  unit="°C" />
                    <ChemistryRow label="Avg Si"   value={chemistry.avg_si_pct}   unit="%" decimals={3} />
                    <ChemistryRow label="Avg S"    value={chemistry.avg_s_pct}    unit="%" decimals={4} />
                    <div style={{ marginTop: '12px', fontSize: '13px' }}>
                        <div>Out of spec: <strong>{chemistry.out_of_spec_count}</strong> heats</div>
                        {Object.entries(chemistry.out_of_spec_breakdown || {}).map(([k, v]) =>
                            v > 0 && (
                                <div key={k} style={{ fontSize: '12px', color: 'hsl(var(--text-muted))', marginTop: '2px' }}>
                                    • {v} {k.replaceAll('_', ' ')}
                                </div>
                            )
                        )}
                    </div>
                </Section>

                <Section title="Live Trip Feed">
                    <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                        {recentTrips.length === 0 ? (
                            <div style={{ color: 'hsl(var(--text-muted))', fontSize: '13px' }}>
                                No recent trips in this window.
                            </div>
                        ) : recentTrips.map(t => (
                            <div key={t.id} style={{
                                borderBottom: '1px solid hsl(var(--border-color))',
                                padding: '8px 0', fontSize: '13px',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>
                                        <strong>{t.fleet_id}</strong>{' '}
                                        {t.source_lab || '—'} → {t.destination || '—'}
                                    </span>
                                    <span style={{ color: 'hsl(var(--text-muted))' }}>
                                        {t.updated_date
                                            ? new Date(t.updated_date).toLocaleTimeString()
                                            : '—'}
                                    </span>
                                </div>
                                <div style={{ color: 'hsl(var(--text-muted))', fontSize: '11px', marginTop: '2px' }}>
                                    {t.net_weight != null ? `${t.net_weight.toFixed(0)} MT` : 'no net'}
                                    {t.temp != null ? ` · ${t.temp.toFixed(0)}°C` : ''}
                                    {t.s_l != null ? ` · S ${t.s_l.toFixed(3)}%` : ''}
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
            </div>
        </div>
    )
}

const KpiCard = ({ label, value, delta, deltaNegative, icon }) => (
    <div className="premium-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
                fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em',
                color: 'hsl(var(--text-muted))', fontWeight: 700,
            }}>
                {label}
            </span>
            <span style={{ color: 'hsl(var(--text-muted))' }}>{icon}</span>
        </div>
        <div style={{ fontSize: '28px', fontWeight: 800, marginTop: '4px' }}>{value}</div>
        {delta != null && (
            <div style={{
                fontSize: '12px',
                color: deltaNegative ? 'hsl(var(--danger))' : 'hsl(var(--success))',
                marginTop: '2px',
            }}>
                {delta} vs prior
            </div>
        )}
    </div>
)

const Section = ({ title, icon, children }) => (
    <div className="premium-card" style={{ padding: '16px', marginBottom: '16px' }}>
        <h3 style={{
            margin: '0 0 12px 0', fontSize: '12px', fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'hsl(var(--text-muted))',
            display: 'flex', alignItems: 'center', gap: '6px',
        }}>
            {icon}
            {title}
        </h3>
        {children}
    </div>
)

const ChemistryRow = ({ label, value, unit, decimals = 1 }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '13px' }}>
        <span>{label}</span>
        <strong>
            {value != null ? Number(value).toFixed(decimals) : '—'} {unit}
        </strong>
    </div>
)

const th = {
    textAlign: 'left', padding: '6px 8px', fontSize: '11px',
    textTransform: 'uppercase', color: 'hsl(var(--text-muted))', fontWeight: 700,
    borderBottom: '2px solid hsl(var(--border-color))',
}
const td = {
    padding: '8px', fontSize: '13px',
    borderBottom: '1px solid hsl(var(--border-color))',
}

export default PlantLive
