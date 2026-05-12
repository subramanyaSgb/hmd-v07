import StatusBadge from './StatusBadge'

const fmtMT = (v) => v != null ? `${Number(v).toFixed(0)} MT` : '—'
const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString() : '—'

// Header cells — sortable ones have a sort_by key matching the backend's whitelist.
const COLUMNS = [
    { key: 'fleet_id',     label: 'Torpedo',          sortable: true },
    { key: 'route',        label: 'Source → Destination', sortable: false },
    { key: 'net_weight',   label: 'Net (MT)',         sortable: true,  align: 'right' },
    { key: 'out_date',     label: 'Departed',         sortable: true },
    { key: 'match_status', label: 'Status',           sortable: false },
    { key: 'first_heat_no', label: 'Heat #',          sortable: false },
]

const HeaderCell = ({ col, sortBy, sortOrder, onSortChange }) => {
    const active = col.sortable && col.key === sortBy
    const next = active && sortOrder === 'desc' ? 'asc' : 'desc'
    const arrow = active ? (sortOrder === 'desc' ? ' ▼' : ' ▲') : ''
    return (
        <th
            data-testid={col.sortable ? `header-${col.key}` : undefined}
            onClick={col.sortable ? () => onSortChange(col.key, next) : undefined}
            style={{
                padding: '10px 12px',
                textAlign: col.align || 'left',
                cursor: col.sortable ? 'pointer' : 'default',
                fontSize: '11px',
                fontWeight: 700,
                color: 'hsl(var(--text-muted))',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid hsl(var(--border-color))',
                whiteSpace: 'nowrap',
                userSelect: 'none',
            }}>
            {col.label}{arrow}
        </th>
    )
}

const TripListTable = ({ rows, onRowClick, expandedTripId, sortBy, sortOrder, onSortChange }) => {
    if (rows.length === 0) {
        return (
            <div className="premium-card" style={{
                padding: '32px',
                textAlign: 'center',
                color: 'hsl(var(--text-muted))',
                fontSize: '13px',
            }}>No trips match the current filters.</div>
        )
    }
    return (
        <div className="premium-card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        {COLUMNS.map(col => (
                            <HeaderCell
                                key={col.key}
                                col={col}
                                sortBy={sortBy}
                                sortOrder={sortOrder}
                                onSortChange={onSortChange}
                            />
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const expanded = row.trip_id === expandedTripId
                        return (
                            <tr
                                key={row.trip_id}
                                data-testid={`trip-row-${row.trip_id}`}
                                aria-expanded={expanded ? 'true' : 'false'}
                                onClick={() => onRowClick(row.trip_id)}
                                style={{
                                    cursor: 'pointer',
                                    background: expanded ? 'hsl(var(--bg-primary))' : 'transparent',
                                    transition: 'background 0.1s',
                                }}>
                                <td style={td}>{row.fleet_id || '—'}</td>
                                <td style={td}>
                                    {row.source_lab || '—'} → {row.destination || '—'}
                                </td>
                                <td style={{ ...td, textAlign: 'right' }}>
                                    {fmtMT(row.net_weight)}
                                </td>
                                <td style={td}>{fmtDateTime(row.out_date)}</td>
                                <td style={td}>
                                    <StatusBadge status={row.match_status} />
                                </td>
                                <td style={td}>{row.first_heat_no || '—'}</td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

const td = {
    padding: '10px 12px',
    fontSize: '13px',
    borderBottom: '1px solid hsl(var(--border-color))',
    color: 'hsl(var(--text-primary))',
}

export default TripListTable
