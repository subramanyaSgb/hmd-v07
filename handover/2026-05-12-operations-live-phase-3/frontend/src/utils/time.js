/**
 * Format an ISO date string as a relative time label ("5s ago", "12m ago",
 * "3h ago", "2d ago", or "—" for null/invalid input).
 *
 * Returns "—" for null, undefined, empty string, or an unparseable date.
 * Canonical variant (was duplicated in 4 places before extraction).
 */
export const formatRelative = (iso) => {
    if (!iso) return '—'
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return '—'
    const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
    if (diffSec < 60) return `${diffSec}s ago`
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
    return `${Math.floor(diffSec / 86400)}d ago`
}
