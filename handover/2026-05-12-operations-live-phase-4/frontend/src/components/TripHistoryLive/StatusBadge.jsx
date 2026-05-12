// match_status -> { label, css-var-suffix }. Aligned with backend's
// /api/trip-history-live row.match_status enum.
const STATUS_META = {
    complete:      { label: 'Complete',      varName: 'success' },
    in_flight:     { label: 'In Flight',     varName: 'primary' },
    awaiting_pour: { label: 'Awaiting Pour', varName: 'warning' },
    anomaly:       { label: 'Anomaly',       varName: 'danger' },
}

const StatusBadge = ({ status }) => {
    const meta = STATUS_META[status]
    const label = meta?.label || 'Unknown'
    const varName = meta?.varName || 'text-muted'
    const colorVar = `var(--${varName})`

    return (
        <span
            data-testid={`status-badge-${status || 'unknown'}`}
            style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                color: `hsl(${colorVar})`,
                padding: '3px 8px',
                borderRadius: '999px',
                border: `1px solid hsl(${colorVar})`,
                background: `hsl(${colorVar} / 0.1)`,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
            }}>{label}</span>
    )
}

export default StatusBadge
