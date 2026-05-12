import { Factory, FlaskConical, Truck, Flame, ParkingCircle } from 'lucide-react'

const Tile = ({ label, value, unit, icon }) => (
    <div className="premium-card" style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        minHeight: '110px',
    }}>
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'hsl(var(--text-muted))',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
        }}>
            <span>{label}</span>
            <span style={{ opacity: 0.7 }}>{icon}</span>
        </div>
        <div style={{
            fontSize: '28px',
            fontWeight: 700,
            color: 'hsl(var(--text-primary))',
            lineHeight: 1,
        }}>
            {value}
            {unit && (
                <span style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'hsl(var(--text-muted))',
                    marginLeft: '6px',
                }}>{unit}</span>
            )}
        </div>
    </div>
)

const fmt1 = (n) => (Number.isFinite(n) ? Number(n).toFixed(1) : '0.0')
const fmtInt = (n) => (Number.isFinite(n) ? Math.trunc(n).toString() : '0')

const TopKpiStrip = ({ kpis = {} }) => {
    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
        }}>
            <Tile
                label="Production Today"
                value={fmt1(kpis.production_today_mt)}
                unit="MT"
                icon={<Factory size={18} />}
            />
            <Tile
                label="Consumption Today"
                value={fmt1(kpis.consumption_today_mt)}
                unit="MT"
                icon={<FlaskConical size={18} />}
            />
            <Tile
                label="Active Trips Now"
                value={fmtInt(kpis.active_trips_now)}
                icon={<Truck size={18} />}
            />
            <Tile
                label="Heats In Progress"
                value={fmtInt(kpis.heats_in_progress)}
                icon={<Flame size={18} />}
            />
            <Tile
                label="Idle Torpedoes"
                value={fmtInt(kpis.idle_torpedoes)}
                icon={<ParkingCircle size={18} />}
            />
        </div>
    )
}

export default TopKpiStrip
