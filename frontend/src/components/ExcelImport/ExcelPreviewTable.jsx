import { AlertCircle } from 'lucide-react'

const ExcelPreviewTable = ({ data, users }) => {
    if (!data || !data.dates || !data.nodes) {
        return null
    }

    const nodeTypeMap = new Map(users.map(u => [u.user_id, u.type]))
    const validNodeIds = new Set(users.map(u => u.user_id))

    const knownNodes = data.nodes.filter(n => validNodeIds.has(n))
    const unknownNodes = data.nodes.filter(n => !validNodeIds.has(n))

    const sortedNodes = [...knownNodes].sort((a, b) => {
        const typeA = nodeTypeMap.get(a) || ''
        const typeB = nodeTypeMap.get(b) || ''
        if (typeA !== typeB) {
            return typeA === 'producer' ? -1 : 1
        }
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    })

    const displayNodes = [...sortedNodes, ...unknownNodes]

    return (
        <div className="excel-preview-container" style={{
            border: '1px solid hsl(var(--border))',
            borderRadius: '12px',
            overflow: 'hidden',
            background: 'white'
        }}>
            <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                <table className="excel-preview-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                        <tr>
                            <th style={{
                                position: 'sticky',
                                left: 0,
                                top: 0,
                                zIndex: 20,
                                background: '#f8fafc',
                                borderBottom: '2px solid hsl(var(--border))',
                                borderRight: '2px solid hsl(var(--border))',
                                padding: '10px 12px',
                                fontWeight: 800,
                                fontSize: '0.7rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                minWidth: '100px'
                            }}>
                                Date
                            </th>
                            {displayNodes.map(nodeId => {
                                const isUnknown = !validNodeIds.has(nodeId)
                                const nodeType = nodeTypeMap.get(nodeId)
                                const isProducer = nodeType === 'producer'

                                return (
                                    <th
                                        key={nodeId}
                                        style={{
                                            position: 'sticky',
                                            top: 0,
                                            zIndex: 10,
                                            background: isUnknown
                                                ? '#fef2f2'
                                                : isProducer
                                                    ? '#ecfeff'
                                                    : '#fff7ed',
                                            borderBottom: '2px solid hsl(var(--border))',
                                            padding: '10px 12px',
                                            fontWeight: 800,
                                            fontSize: '0.7rem',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.02em',
                                            minWidth: '80px',
                                            textAlign: 'center',
                                            color: isUnknown ? '#ef4444' : 'inherit'
                                        }}
                                        title={isUnknown ? 'Unknown node - will be skipped' : nodeType}
                                    >
                                        {nodeId}
                                        {isUnknown && (
                                            <AlertCircle size={12} style={{ marginLeft: '4px', verticalAlign: 'middle', color: '#ef4444' }} />
                                        )}
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {data.dates.map((dateStr, rowIndex) => {
                            const isEven = rowIndex % 2 === 0

                            return (
                                <tr key={dateStr}>
                                    <td style={{
                                        position: 'sticky',
                                        left: 0,
                                        zIndex: 5,
                                        background: isEven ? '#f8fafc' : 'white',
                                        borderBottom: '1px solid hsl(var(--border))',
                                        borderRight: '2px solid hsl(var(--border))',
                                        padding: '8px 12px',
                                        fontWeight: 700,
                                        fontSize: '0.8rem',
                                        fontFamily: 'monospace'
                                    }}>
                                        {dateStr}
                                    </td>
                                    {displayNodes.map(nodeId => {
                                        const cell = data.data[dateStr]?.[nodeId]
                                        const isUnknown = !validNodeIds.has(nodeId)
                                        const hasError = cell?.error
                                        const nodeType = nodeTypeMap.get(nodeId)
                                        const isProducer = nodeType === 'producer'

                                        let cellBg = isEven ? '#fafafa' : 'white'
                                        if (isUnknown) {
                                            cellBg = '#fef2f2'
                                        } else if (hasError) {
                                            cellBg = '#fee2e2'
                                        } else if (cell?.value !== '' && cell?.value !== undefined) {
                                            cellBg = isProducer ? '#f0fdfa' : '#fffbeb'
                                        }

                                        return (
                                            <td
                                                key={nodeId}
                                                style={{
                                                    borderBottom: '1px solid hsl(var(--border))',
                                                    padding: '8px 12px',
                                                    textAlign: 'center',
                                                    background: cellBg,
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.85rem',
                                                    color: hasError ? '#dc2626' : isUnknown ? '#9ca3af' : 'inherit',
                                                    fontWeight: cell?.value ? 600 : 400
                                                }}
                                                title={hasError || (isUnknown ? 'Unknown node' : '')}
                                            >
                                                {cell?.value !== undefined && cell?.value !== ''
                                                    ? cell.value
                                                    : <span style={{ color: '#d1d5db' }}>-</span>
                                                }
                                            </td>
                                        )
                                    })}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
            <div style={{
                display: 'flex',
                gap: '24px',
                padding: '12px 16px',
                borderTop: '1px solid hsl(var(--border))',
                background: '#f8fafc',
                fontSize: '0.75rem',
                color: 'hsl(var(--text-muted))'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '12px', background: '#ecfeff', border: '1px solid #0891b2', borderRadius: '2px' }} />
                    <span>Producer</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '12px', background: '#fff7ed', border: '1px solid #ea580c', borderRadius: '2px' }} />
                    <span>Consumer</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '12px', background: '#fee2e2', border: '1px solid #ef4444', borderRadius: '2px' }} />
                    <span>Error</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '12px', height: '12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '2px' }} />
                    <span>Unknown Node</span>
                </div>
            </div>
        </div>
    )
}

export default ExcelPreviewTable
