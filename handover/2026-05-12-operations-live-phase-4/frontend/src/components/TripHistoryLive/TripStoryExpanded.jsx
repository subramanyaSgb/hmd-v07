import { AlertTriangle, Flame } from 'lucide-react'

const STAGES = ['TAP', 'LOAD', 'DEPART', 'ARRIVE', 'POUR', 'CLOSE']

const fmt0 = (v) => v != null ? Number(v).toFixed(0) : '—'
const fmt1 = (v) => v != null ? Number(v).toFixed(1) : '—'
const fmt3 = (v) => v != null ? Number(v).toFixed(3) : '—'
const fmtTime = (iso) => iso
    ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '—'

const StageDot = ({ label, isFirst, isLast, lines = [] }) => (
    <div
        data-testid={`stage-${label}`}
        style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '0 8px',
        }}>
        {/* Connector line behind the dot — drawn except at start */}
        {!isFirst && (
            <div style={{
                position: 'absolute',
                top: '11px',
                left: 0,
                width: '50%',
                height: '2px',
                background: 'hsl(var(--border-color))',
                zIndex: 0,
            }} />
        )}
        {!isLast && (
            <div style={{
                position: 'absolute',
                top: '11px',
                left: '50%',
                width: '50%',
                height: '2px',
                background: 'hsl(var(--border-color))',
                zIndex: 0,
            }} />
        )}
        {/* Dot */}
        <div style={{
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            background: 'hsl(var(--primary))',
            border: '4px solid hsl(var(--bg-secondary))',
            boxSizing: 'content-box',
            zIndex: 1,
            position: 'relative',
        }} />
        {/* Label + per-stage lines */}
        <div style={{
            marginTop: '8px',
            fontSize: '11px',
            fontWeight: 700,
            color: 'hsl(var(--text-primary))',
            letterSpacing: '0.05em',
        }}>{label}</div>
        {lines.map((line, i) => (
            <div key={i} style={{
                fontSize: '11px',
                color: 'hsl(var(--text-muted))',
                textAlign: 'center',
                marginTop: '2px',
                whiteSpace: 'nowrap',
            }}>{line}</div>
        ))}
    </div>
)

const stageLines = (data) => {
    const t = data.trip || {}
    const heats = Array.isArray(data.matched_heats) ? data.matched_heats : []
    const firstHeat = heats[0]
    const totalPoured = heats.reduce(
        (acc, h) => acc + (Number.isFinite(Number(h.hotmetal_qty)) ? Number(h.hotmetal_qty) : 0),
        0
    )
    const residual = t.net_weight != null
        ? Number(t.net_weight) - totalPoured
        : null

    return {
        TAP:    [t.source_lab || '—', fmtTime(t.first_tare_time)],
        LOAD:   [t.fleet_id || '—', t.net_weight != null ? `${fmt0(t.net_weight)} MT` : '—'],
        DEPART: [t.source_lab || '—', fmtTime(t.out_date)],
        ARRIVE: [t.destination || '—', fmtTime(t.closetime)],
        POUR:   firstHeat
            ? [firstHeat.heat_no, `${fmt0(firstHeat.hotmetal_qty)} MT`]
            : ['—', '—'],
        CLOSE:  [
            fmtTime(t.closetime),
            residual != null ? `${fmt0(residual)} MT res` : '—',
        ],
    }
}

const ChemistryPill = ({ label, value, unit }) => (
    <span style={{
        padding: '6px 10px',
        borderRadius: '8px',
        background: 'hsl(var(--bg-secondary))',
        border: '1px solid hsl(var(--border-color))',
        fontSize: '12px',
        color: 'hsl(var(--text-primary))',
        whiteSpace: 'nowrap',
    }}>
        <span style={{ color: 'hsl(var(--text-muted))', marginRight: '6px' }}>{label}</span>
        <strong>{value}</strong>{unit && <span style={{ color: 'hsl(var(--text-muted))' }}> {unit}</span>}
    </span>
)

const TripStoryExpanded = ({ data, loading, error }) => {
    if (loading) {
        return (
            <div className="premium-card" style={{ padding: '20px', marginTop: '16px' }}>
                Loading trip story…
            </div>
        )
    }
    if (error) {
        return (
            <div className="premium-card" style={{
                padding: '20px',
                marginTop: '16px',
                color: 'hsl(var(--danger))',
            }}>Error: {error}</div>
        )
    }
    if (!data) return null

    // Defensive defaults — the detail endpoint may return partial data
    // mid-poll or while a downstream join is still hydrating.
    const trip = data.trip || {}
    const matchedHeats = Array.isArray(data.matched_heats) ? data.matched_heats : []
    const anomalyFlags = Array.isArray(data.anomaly_flags) ? data.anomaly_flags : []

    const lines = stageLines(data)

    return (
        <div className="premium-card" style={{
            padding: '24px',
            marginTop: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
        }}>
            {/* Anomaly callout (if any) */}
            {anomalyFlags.length > 0 && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: 'hsl(var(--danger) / 0.1)',
                    border: '1px solid hsl(var(--danger))',
                    color: 'hsl(var(--danger))',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                }}>
                    <AlertTriangle size={18} />
                    <div>
                        {anomalyFlags.map((f, i) => (
                            <div key={i}>{f.message}</div>
                        ))}
                    </div>
                </div>
            )}

            {/* Horizontal stepper */}
            <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 0,
            }}>
                {STAGES.map((stage, i) => (
                    <StageDot
                        key={stage}
                        label={stage}
                        isFirst={i === 0}
                        isLast={i === STAGES.length - 1}
                        lines={lines[stage]}
                    />
                ))}
            </div>

            {/* Chemistry pills */}
            <div style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                paddingTop: '8px',
                borderTop: '1px solid hsl(var(--border-color))',
            }}>
                <ChemistryPill label="TEMP" value={fmt1(trip.temp)} unit="°C" />
                <ChemistryPill label="S"    value={fmt3(trip.s_l)} unit="%" />
                <ChemistryPill label="Si"   value={fmt3(trip.si_l)} unit="%" />
            </div>

            {/* Current torpedo position */}
            {data.current_torpedo_position && (
                <div style={{
                    fontSize: '13px',
                    color: 'hsl(var(--text-primary))',
                }}>
                    <span style={{ color: 'hsl(var(--text-muted))', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Current Position
                    </span>
                    <div style={{ marginTop: '4px' }}>
                        {data.current_torpedo_position.fleet_id} ·{' '}
                        <strong>{data.current_torpedo_position.current_status || 'Unknown'}</strong>{' '}
                        · (x: {fmt1(data.current_torpedo_position.x)},
                        y: {fmt1(data.current_torpedo_position.y)})
                    </div>
                </div>
            )}

            {/* Matched heats list */}
            <div>
                <div style={{
                    color: 'hsl(var(--text-muted))',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '8px',
                }}>
                    Matched Heats {matchedHeats.length > 0 && `(${matchedHeats.length})`}
                </div>
                {matchedHeats.length === 0 ? (
                    <div style={{ color: 'hsl(var(--text-muted))', fontSize: '13px' }}>
                        No matched heats for this trip yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {matchedHeats.map(h => (
                            <div key={h.heat_no} style={{
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'center',
                                fontSize: '13px',
                                color: 'hsl(var(--text-primary))',
                                padding: '8px 10px',
                                background: 'hsl(var(--bg-secondary))',
                                borderRadius: '6px',
                            }}>
                                <Flame size={14} color="hsl(var(--warning))" />
                                <strong>{h.heat_no}</strong>
                                <span style={{ color: 'hsl(var(--text-muted))' }}>
                                    @ {h.converter_no || '—'} · {fmt0(h.hotmetal_qty)} MT
                                </span>
                                <span style={{ marginLeft: 'auto', color: 'hsl(var(--text-muted))', fontSize: '11px' }}>
                                    {fmtTime(h.torpedo_in_time)} → {fmtTime(h.torpedo_out_time)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default TripStoryExpanded
