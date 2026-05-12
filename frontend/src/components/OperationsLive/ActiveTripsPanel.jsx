import { statusColor } from '../../utils/torpedoStatus'

const StatusChip = ({ status, tripId }) => {
    const label = status || 'Unknown'
    const color = status ? statusColor(status) : '#94a3b8'
    return (
        <span
            data-testid={`status-chip-${tripId}`}
            style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.05em',
                color,
                padding: '2px 8px',
                borderRadius: '999px',
                border: `1px solid ${color}`,
                background: `${color}1A`,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
            }}>{label}</span>
    )
}

const TripRow = ({ trip }) => {
    return (
        <div
            data-testid={`trip-row-${trip.trip_id}`}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: '10px 12px',
                borderBottom: '1px solid hsl(var(--border-color))',
                fontSize: '13px',
            }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
            }}>
                <span style={{
                    fontWeight: 700,
                    color: 'hsl(var(--text-primary))',
                }}>{trip.torpedo_no || '—'}</span>
                <StatusChip status={trip.current_status} tripId={trip.trip_id} />
            </div>
            <div style={{
                color: 'hsl(var(--text-muted))',
                fontSize: '12px',
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
            }}>
                <span>{trip.source_lab || '—'} → {trip.destination || '—'}</span>
                <span>{trip.net_weight_mt != null
                    ? `${Number(trip.net_weight_mt).toFixed(0)} MT`
                    : '—'}</span>
                <span>{trip.elapsed_minutes != null
                    ? `${trip.elapsed_minutes} min`
                    : '—'}</span>
            </div>
        </div>
    )
}

const ActiveTripsPanel = ({ trips = [] }) => {
    return (
        <div className="premium-card" style={{
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '600px',
        }}>
            <h3 className="space-grotesk" style={{
                margin: '0 0 16px 0',
                fontSize: '15px',
                fontWeight: 700,
                color: 'hsl(var(--text-primary))',
            }}>Active Trips</h3>
            {trips.length === 0 ? (
                <div style={{
                    color: 'hsl(var(--text-muted))',
                    fontSize: '13px',
                    padding: '12px 0',
                }}>No active trips right now.</div>
            ) : (
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                }}>
                    {trips.map(t => (
                        <TripRow key={t.trip_id} trip={t} />
                    ))}
                </div>
            )}
        </div>
    )
}

export default ActiveTripsPanel
