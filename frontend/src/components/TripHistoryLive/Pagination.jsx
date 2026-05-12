import { ChevronLeft, ChevronRight } from 'lucide-react'

const Pagination = ({ page, pageSize, total, onPageChange }) => {
    const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize)
    const lo = total === 0 ? 0 : (page - 1) * pageSize + 1
    const hi = total === 0 ? 0 : Math.min(page * pageSize, total)
    const onPrev = () => page > 1 && onPageChange(page - 1)
    const onNext = () => page < totalPages && onPageChange(page + 1)

    const btn = (disabled) => ({
        padding: '6px 12px',
        borderRadius: '8px',
        border: '1px solid hsl(var(--border-color))',
        background: 'transparent',
        color: disabled ? 'hsl(var(--text-muted))' : 'hsl(var(--text-primary))',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '12px',
        fontWeight: 600,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        opacity: disabled ? 0.5 : 1,
    })

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            gap: '12px',
            flexWrap: 'wrap',
        }}>
            <span style={{ fontSize: '12px', color: 'hsl(var(--text-muted))' }}>
                {total === 0 ? '0 of 0' : `${lo}–${hi} of ${total}`}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={onPrev} disabled={page <= 1} style={btn(page <= 1)}>
                    <ChevronLeft size={14} /> Prev
                </button>
                <button onClick={onNext} disabled={page >= totalPages} style={btn(page >= totalPages)}>
                    Next <ChevronRight size={14} />
                </button>
            </div>
        </div>
    )
}

export default Pagination
