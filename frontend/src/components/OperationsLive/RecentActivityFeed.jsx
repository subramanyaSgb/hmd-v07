import { Truck, Flame } from 'lucide-react'
import { formatRelative } from '../../utils/time'

const Row = ({ event }) => {
    const isTrip = event.type === 'trip_completed'
    const Icon = isTrip ? Truck : Flame
    const color = isTrip ? 'hsl(var(--primary))' : 'hsl(var(--warning))'
    return (
        <div data-testid="activity-row" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '10px 12px',
            borderBottom: '1px solid hsl(var(--border-color))',
            fontSize: '13px',
        }}>
            <Icon size={16} color={color} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'hsl(var(--text-primary))' }}>
                {event.summary}
            </span>
            <span style={{
                color: 'hsl(var(--text-muted))',
                fontSize: '11px',
                flexShrink: 0,
            }}>
                {formatRelative(event.at)}
            </span>
        </div>
    )
}

const RecentActivityFeed = ({ events = [] }) => {
    return (
        <div className="premium-card" style={{ padding: '20px', marginTop: '24px' }}>
            <h3 className="space-grotesk" style={{
                margin: '0 0 16px 0',
                fontSize: '15px',
                fontWeight: 700,
                color: 'hsl(var(--text-primary))',
            }}>Recent Activity</h3>
            {events.length === 0 ? (
                <div style={{
                    color: 'hsl(var(--text-muted))',
                    fontSize: '13px',
                    padding: '12px 0',
                }}>No recent activity in the last 2 hours.</div>
            ) : (
                <div>
                    {events.map((e) => (
                        <Row key={`${e.type}-${e.ref_id}`} event={e} />
                    ))}
                </div>
            )}
        </div>
    )
}

export default RecentActivityFeed
