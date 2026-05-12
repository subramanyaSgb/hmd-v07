const STATE_LABEL = {
    IDLE: 'IDLE',
    HEAT_IN_PROGRESS: 'HEAT IN PROGRESS',
}

const STATE_COLOR = {
    IDLE: 'hsl(var(--text-muted))',
    HEAT_IN_PROGRESS: '#22c55e',   // green
}

const ConverterCard = ({ data }) => {
    if (!data) return null
    const active = data.state === 'HEAT_IN_PROGRESS'
    const stateColor = STATE_COLOR[data.state] || STATE_COLOR.IDLE

    return (
        <div
            data-testid="converter-card"
            data-converter={data.converter_no}
            className="premium-card"
            style={{
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                minHeight: '160px',
            }}>
            {/* Header: letter + sms + state badge */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '8px',
                }}>
                    <span style={{
                        fontSize: '32px',
                        fontWeight: 800,
                        color: 'hsl(var(--text-primary))',
                        lineHeight: 1,
                    }}>{data.converter_no}</span>
                    {data.sms && (
                        <span style={{
                            fontSize: '11px',
                            color: 'hsl(var(--text-muted))',
                            fontWeight: 600,
                        }}>· {data.sms}</span>
                    )}
                </div>
                <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    color: stateColor,
                    padding: '3px 8px',
                    borderRadius: '999px',
                    border: `1px solid ${stateColor}`,
                    background: `${stateColor}1A`,  // 10% opacity tint
                    whiteSpace: 'nowrap',
                }}>{STATE_LABEL[data.state] || data.state}</span>
            </div>

            {/* Body: active heat detail OR last-heat reference */}
            {active ? (
                <div style={{
                    fontSize: '12px',
                    color: 'hsl(var(--text-muted))',
                    lineHeight: 1.5,
                }}>
                    <div style={{ color: 'hsl(var(--text-primary))', fontWeight: 600 }}>
                        Heat {data.current_heat_no || '—'}
                    </div>
                    <div>Torpedo {data.current_torpedo || '—'}</div>
                    <div>Elapsed: {data.elapsed_minutes ?? '—'} min</div>
                    <div>HM received: {data.hotmetal_received_mt != null
                        ? `${Number(data.hotmetal_received_mt).toFixed(1)} MT`
                        : '—'}</div>
                </div>
            ) : (
                <div style={{
                    fontSize: '12px',
                    color: 'hsl(var(--text-muted))',
                    lineHeight: 1.5,
                }}>
                    <div>Last: {data.last_heat_no || '—'}</div>
                </div>
            )}

            {/* Footer: heats-today counter */}
            <div style={{
                marginTop: 'auto',
                fontSize: '11px',
                color: 'hsl(var(--text-muted))',
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
            }}>
                {data.heats_today ?? 0} today
            </div>
        </div>
    )
}

export default ConverterCard
