import ConverterCard from './ConverterCard'

const LiveHeatsPanel = ({ converters = [] }) => {
    return (
        <div className="premium-card" style={{ padding: '20px' }}>
            <h3 className="space-grotesk" style={{
                margin: '0 0 16px 0',
                fontSize: '15px',
                fontWeight: 700,
                color: 'hsl(var(--text-primary))',
            }}>Live Heats</h3>
            {converters.length === 0 ? (
                <div style={{
                    color: 'hsl(var(--text-muted))',
                    fontSize: '13px',
                    padding: '12px 0',
                }}>No converter data — HTS sync may be paused.</div>
            ) : (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px',
                }}>
                    {converters.map(c => (
                        <ConverterCard key={c.converter_no} data={c} />
                    ))}
                </div>
            )}
        </div>
    )
}

export default LiveHeatsPanel
