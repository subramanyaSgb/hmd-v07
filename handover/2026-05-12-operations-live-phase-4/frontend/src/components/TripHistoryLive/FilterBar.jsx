import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'

const TIME_WINDOWS = [
    { value: 'today', label: 'Today' },
    { value: '24h',   label: '24h' },
    { value: '7d',    label: '7d' },
    { value: '30d',   label: '30d' },
]
const PRODUCERS = ['all', 'BF1', 'BF2', 'BF3', 'BF4', 'BF5', 'COREX1', 'COREX2']
const CONSUMERS = ['all', 'SMS1', 'SMS2', 'SMS3', 'SMS4', 'RFL']
const TORPEDOES = [
    'all',
    ...Array.from({ length: 53 }, (_, i) => `TLC-${String(i + 1).padStart(2, '0')}`),
]
const STATUSES = ['all', 'complete', 'in_flight', 'awaiting_pour', 'anomaly']
const SHIFTS = ['all', 'A', 'B', 'C']

const STATUS_LABEL = {
    all: 'All',
    complete: 'Complete',
    in_flight: 'In Flight',
    awaiting_pour: 'Awaiting Pour',
    anomaly: 'Anomaly',
}

const chipStyle = (active) => ({
    padding: '6px 14px',
    borderRadius: '999px',
    border: '1px solid hsl(var(--border-color))',
    background: active ? 'hsl(var(--primary))' : 'transparent',
    color: active ? 'white' : 'hsl(var(--text-muted))',
    fontWeight: 700,
    fontSize: '11px',
    letterSpacing: '0.05em',
    cursor: 'pointer',
    textTransform: 'uppercase',
    transition: 'all 0.15s',
})

const labelStyle = {
    fontSize: '11px',
    fontWeight: 600,
    color: 'hsl(var(--text-muted))',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
}

const selectStyle = {
    padding: '6px 10px',
    fontSize: '12px',
    borderRadius: '8px',
    border: '1px solid hsl(var(--border-color))',
    background: 'hsl(var(--bg-secondary))',
    color: 'hsl(var(--text-primary))',
    minWidth: '110px',
}

const FilterBar = ({ values, onChange }) => {
    const [qLocal, setQLocal] = useState(values.q || '')

    useEffect(() => {
        setQLocal(values.q || '')
    }, [values.q])

    const onSearchSubmit = (e) => {
        e.preventDefault()
        onChange({ q: qLocal.trim(), page: 1 })
    }

    return (
        <div className="premium-card" style={{
            padding: '16px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
        }}>
            {/* Time chips */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {TIME_WINDOWS.map(w => (
                    <button
                        key={w.value}
                        data-active={values.time_window === w.value ? 'true' : 'false'}
                        onClick={() => onChange({ time_window: w.value, page: 1 })}
                        style={chipStyle(values.time_window === w.value)}>
                        {w.label}
                    </button>
                ))}
            </div>

            {/* Dropdowns + search, single row that wraps */}
            <div style={{
                display: 'flex',
                gap: '16px',
                flexWrap: 'wrap',
                alignItems: 'center',
            }}>
                <label style={labelStyle}>
                    Producer
                    <select
                        value={values.source_lab || 'all'}
                        onChange={(e) => onChange({ source_lab: e.target.value, page: 1 })}
                        style={{ ...selectStyle, marginLeft: '8px' }}>
                        {PRODUCERS.map(p => (
                            <option key={p} value={p}>{p === 'all' ? 'All' : p}</option>
                        ))}
                    </select>
                </label>

                <label style={labelStyle}>
                    Consumer
                    <select
                        value={values.destination || 'all'}
                        onChange={(e) => onChange({ destination: e.target.value, page: 1 })}
                        style={{ ...selectStyle, marginLeft: '8px' }}>
                        {CONSUMERS.map(c => (
                            <option key={c} value={c}>{c === 'all' ? 'All' : c}</option>
                        ))}
                    </select>
                </label>

                <label style={labelStyle}>
                    Torpedo
                    <select
                        value={values.fleet_id || 'all'}
                        onChange={(e) => onChange({ fleet_id: e.target.value, page: 1 })}
                        style={{ ...selectStyle, marginLeft: '8px' }}>
                        {TORPEDOES.map(t => (
                            <option key={t} value={t}>{t === 'all' ? 'All' : t}</option>
                        ))}
                    </select>
                </label>

                <label style={labelStyle}>
                    Status
                    <select
                        value={values.status || 'all'}
                        onChange={(e) => onChange({ status: e.target.value, page: 1 })}
                        style={{ ...selectStyle, marginLeft: '8px' }}>
                        {STATUSES.map(s => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                        ))}
                    </select>
                </label>

                <label style={labelStyle}>
                    Shift
                    <select
                        value={values.shift || 'all'}
                        onChange={(e) => onChange({ shift: e.target.value, page: 1 })}
                        style={{ ...selectStyle, marginLeft: '8px', minWidth: '80px' }}>
                        {SHIFTS.map(s => (
                            <option key={s} value={s}>{s === 'all' ? 'All' : s}</option>
                        ))}
                    </select>
                </label>

                <form onSubmit={onSearchSubmit} style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'hsl(var(--bg-secondary))',
                        border: '1px solid hsl(var(--border-color))',
                        borderRadius: '8px',
                        padding: '6px 10px',
                    }}>
                        <Search size={14} color="hsl(var(--text-muted))" />
                        <input
                            type="search"
                            placeholder="Search trip id / fleet id / heat #"
                            value={qLocal}
                            onChange={(e) => setQLocal(e.target.value)}
                            style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                outline: 'none',
                                color: 'hsl(var(--text-primary))',
                                fontSize: '13px',
                            }}
                        />
                    </div>
                </form>
            </div>
        </div>
    )
}

export default FilterBar
