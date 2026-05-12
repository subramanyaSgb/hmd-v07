import React, { memo } from 'react';
import { Search } from 'lucide-react';

/**
 * Left column of the V2 Live Tracking page.
 * Width is fixed at 270px via grid in LiveTrackingV2.css.
 *
 * Renders, top to bottom:
 *   1. Title row with count "X of N"
 *   2. Search input (matches fleet_id OR location_text)
 *   3. 8 filter pills: All + 7 derived statuses (Loading / In Transit /
 *      At SMS / Returning / Idle / Hot Repair / Ign Off)
 *   4. Scrollable list of TorpedoRow cards
 *
 * The 7 status names + colors mirror the V2 dashboard donut and the
 * design idea exactly — keeping the visual language consistent across
 * pages.
 */
const STATUS_FILTERS = [
    'All',
    'Loading',
    'In Transit',
    'At SMS',
    'Returning',
    'Idle',
    'Hot Repair',
    'Ign Off',
];

export const STATUS_COLORS = {
    Loading:      '#f59e0b',
    'In Transit': '#3b82f6',
    'At SMS':     '#06b6d4',
    Returning:    '#a78bfa',
    Idle:         '#94a3b8',
    'Hot Repair': '#ef4444',
    'Ign Off':    '#64748b',
};

const TorpedoListPanel = ({
    torpedoes,
    filtered,
    filter,
    setFilter,
    search,
    setSearch,
    selectedFleetId,
    onSelect,
    loading,
    error,
}) => {
    return (
        <div className="v2-track-card v2-track-list">
            <div className="v2-track-card-h">
                <h3>Torpedoes</h3>
                <span className="v2-track-sub">
                    {filtered.length} of {torpedoes.length}
                </span>
            </div>

            {/* Search */}
            <div className="v2-track-search-row">
                <Search size={13} className="v2-track-search-icon" />
                <input
                    type="text"
                    placeholder="Search TLC or location"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="v2-track-search-input"
                />
            </div>

            {/* Filter pills */}
            <div className="v2-track-filter-row">
                {STATUS_FILTERS.map(f => (
                    <button
                        key={f}
                        type="button"
                        onClick={() => setFilter(f)}
                        className={`v2-track-pill ${filter === f ? 'active' : ''}`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* List */}
            <div className="v2-track-list-body">
                {error && (
                    <div className="v2-track-empty">Failed to load torpedoes</div>
                )}
                {!error && filtered.length === 0 && !loading && (
                    <div className="v2-track-empty">
                        {search || filter !== 'All' ? 'No matches' : 'No torpedoes'}
                    </div>
                )}
                {!error && loading && torpedoes.length === 0 && (
                    <div className="v2-track-empty">Loading torpedoes…</div>
                )}
                {filtered.map(t => (
                    <TorpedoRow
                        key={t.fleet_id}
                        t={t}
                        isSelected={t.fleet_id === selectedFleetId}
                        onClick={onSelect}
                    />
                ))}
            </div>
        </div>
    );
};

/**
 * Single row in the torpedo list. Memoized so changing other rows
 * doesn't re-render this one (53 rows × 5s polling = lots of churn
 * if we don't).
 */
const TorpedoRow = memo(
    function TorpedoRow({ t, isSelected, onClick }) {
        const color = STATUS_COLORS[t.derived_status] || '#94a3b8';
        const isMoving = t.derived_status === 'In Transit' || t.derived_status === 'Loading';
        const ageLabel = formatAge(t.last_report_sec);

        return (
            <div
                className={`v2-track-row ${isSelected ? 'selected' : ''}`}
                onClick={() => onClick(t.fleet_id)}
            >
                {/* Tiny torpedo SVG (matches design idea's list-item icon) */}
                <svg width="22" height="14" viewBox="0 0 32 16" className="v2-track-row-icon" style={{ color }}>
                    <ellipse cx="16" cy="8" rx="11" ry="5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <line x1="5" y1="8" x2="27" y2="8" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
                    <circle cx="9" cy="13" r="1.5" fill="currentColor" />
                    <circle cx="14" cy="13" r="1.5" fill="currentColor" />
                    <circle cx="19" cy="13" r="1.5" fill="currentColor" />
                    <circle cx="24" cy="13" r="1.5" fill="currentColor" />
                </svg>

                <div className="v2-track-row-body">
                    <div className="v2-track-row-head">
                        <span className="v2-track-row-id">{t.fleet_id}</span>
                        <span className="v2-track-row-age">{ageLabel}</span>
                    </div>
                    <div className="v2-track-row-status">
                        <span
                            className="v2-track-row-dot"
                            style={{
                                background: color,
                                boxShadow: isMoving ? `0 0 6px ${color}` : 'none',
                            }}
                        />
                        <span className="v2-track-row-status-label">{t.derived_status}</span>
                        {t.last_temp != null && (
                            <span className="v2-track-row-temp">
                                {Math.round(t.last_temp)}°C
                            </span>
                        )}
                    </div>
                    <div className="v2-track-row-loc">
                        {t.location_text || '—'}
                    </div>
                </div>
            </div>
        );
    },
    // custom equality — only re-render if the displayed fields actually changed
    (prev, next) =>
        prev.isSelected === next.isSelected &&
        prev.t.fleet_id === next.t.fleet_id &&
        prev.t.derived_status === next.t.derived_status &&
        prev.t.last_temp === next.t.last_temp &&
        prev.t.location_text === next.t.location_text &&
        prev.t.last_report_sec === next.t.last_report_sec
);

function formatAge(seconds) {
    if (seconds == null) return '—';
    if (seconds < 60) return `${seconds}s ago`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
}

export default TorpedoListPanel;
