import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ArrowUp, ArrowDown, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import { useV2Endpoint } from '../Version2Dashboard';

/**
 * Active Trips — V2 Dashboard's full-width trip lifecycle table.
 *
 * Rebuilt 2026-05-14 (changes_tracker #186) under the new 4-rule
 * trip-completion logic (see memory: project_trip_completion_logic.md).
 * Backend now derives "active" via Rules 1-4 from
 * /api/statistics/v2/active-trips; this component just renders the
 * paginated slice.
 *
 * Columns (12):
 *   1. Created  (first_tare_time, HH:MM)
 *   2. Dispatched (out_date, HH:MM)
 *   3. Ladle (TLC-NN)
 *   4. Trip ID
 *   5. Source (BFn / COREXn)
 *   6. Dest (SMS-N / Converter — converter shown when HTS matches)
 *   7. Net WT (with received qty in second line when HTS matches)
 *   8. Temp (red if <1450)
 *   9. S (red if >0.05)
 *   10. Stage (colored badge: At BF WB / At BF Tap / WB Loaded / In Transit / At SMS)
 *   11. Current Location (SuVeechi text; grayed if GPS stale >1h)
 *   12. Age (orange if >6h)
 *
 * Controls:
 *   - Search box (trip_id / ladle substring match)
 *   - 3 filter dropdowns (Source / Dest / Stage)
 *   - Click any column header to sort (toggle asc/desc)
 *   - Pagination at bottom (page size 10 / 25 / 50)
 *
 * URL state: all filters + sort + page persist via useSearchParams so
 * refresh/copy-link stays on the same view.
 */

const STAGE_OPTIONS = [
    { value: '',           label: 'All stages' },
    { value: 'AT_BF_WB',   label: 'At BF Weighbridge' },
    { value: 'AT_BF_TAP',  label: 'At BF Tap' },
    { value: 'WB_LOADED',  label: 'WB Loaded' },
    { value: 'IN_TRANSIT', label: 'In Transit' },
    { value: 'AT_SMS',     label: 'At SMS' },
];

const SOURCE_OPTIONS = [
    { value: '', label: 'All sources' },
    'BF1', 'BF2', 'BF3', 'BF4', 'BF5', 'COREX1', 'COREX2'
].map(o => typeof o === 'string' ? { value: o, label: o } : o);

const DEST_OPTIONS = [
    { value: '',      label: 'All destinations' },
    { value: 'SMS-1', label: 'SMS-1' },
    { value: 'SMS-2', label: 'SMS-2' },
    { value: 'SMS-4', label: 'SMS-4' },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

// Stage badge color classes (matches CSS .v2-stage-badge--<key>)
const STAGE_BADGE_CLASS = {
    AT_BF_WB:   'v2-stage-badge v2-stage-badge--bf-wb',
    AT_BF_TAP:  'v2-stage-badge v2-stage-badge--bf-tap',
    WB_LOADED:  'v2-stage-badge v2-stage-badge--wb-loaded',
    IN_TRANSIT: 'v2-stage-badge v2-stage-badge--transit',
    AT_SMS:     'v2-stage-badge v2-stage-badge--sms',
};
const STAGE_LABEL = {
    AT_BF_WB:   'At BF WB',
    AT_BF_TAP:  'At BF Tap',
    WB_LOADED:  'WB Loaded',
    IN_TRANSIT: 'In Transit',
    AT_SMS:     'At SMS',
};

/** Format an ISO timestamp as "HH:MM" in browser TZ. */
const fmtTime = (iso) => {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    } catch { return '—'; }
};

/** Format age in seconds as "Nm" or "Nh Mm". */
const fmtAge = (seconds) => {
    if (seconds == null) return '—';
    const s = Math.max(0, Math.floor(seconds));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
};

/** Returns the dest cell content — "SMS-2 / G" if HTS matched, else just SMS or raw destination. */
const formatDest = (t) => {
    const sms = t.dest_sms || (t.dest_destination_raw || '').toUpperCase().match(/^SMS-?\d+/)?.[0];
    const conv = t.dest_converter;
    if (sms && conv) return `${sms} / ${conv}`;
    if (sms) return sms;
    return t.dest_destination_raw || '—';
};

// Click-to-sort column header
const SortableTh = ({ field, label, currentSortBy, currentSortDir, onClick, align = 'left' }) => {
    const active = currentSortBy === field;
    const dir = active ? currentSortDir : null;
    return (
        <th
            className={`v2-active-th v2-active-th--sortable v2-active-th--${align}`}
            onClick={() => onClick(field)}
            role="button"
            tabIndex={0}
        >
            <span className="v2-active-th-inner">
                {label}
                {active && (dir === 'asc'
                    ? <ArrowUp size={11} className="v2-active-sort-icon" />
                    : <ArrowDown size={11} className="v2-active-sort-icon" />)}
            </span>
        </th>
    );
};

const ActiveTripsTable = ({ tick }) => {
    const [searchParams, setSearchParams] = useSearchParams();

    // ── Local UI state (controlled inputs that debounce into URL) ──
    const initial = {
        page:      parseInt(searchParams.get('page') || '1', 10),
        page_size: parseInt(searchParams.get('page_size') || '10', 10),
        search:    searchParams.get('search') || '',
        source:    searchParams.get('source') || '',
        dest:      searchParams.get('dest') || '',
        stage:     searchParams.get('stage') || '',
        sort_by:   searchParams.get('sort_by') || 'created_at',
        sort_dir:  searchParams.get('sort_dir') || 'desc',
    };
    const [searchInput, setSearchInput] = useState(initial.search);

    // Derive current params from URL so the back-button works naturally.
    const queryParams = useMemo(() => ({
        page:      parseInt(searchParams.get('page') || '1', 10),
        page_size: parseInt(searchParams.get('page_size') || '10', 10),
        search:    searchParams.get('search') || '',
        source:    searchParams.get('source') || '',
        dest:      searchParams.get('dest') || '',
        stage:     searchParams.get('stage') || '',
        sort_by:   searchParams.get('sort_by') || 'created_at',
        sort_dir:  searchParams.get('sort_dir') || 'desc',
    }), [searchParams]);

    // Helper to update URL params (preserves others, resets page on filter change).
    const updateParams = (changes, { resetPage = false } = {}) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(changes).forEach(([k, v]) => {
            if (v === '' || v == null) next.delete(k);
            else next.set(k, String(v));
        });
        if (resetPage) next.delete('page');
        setSearchParams(next, { replace: false });
    };

    // Debounced search-input → URL
    useEffect(() => {
        const id = setTimeout(() => {
            if (searchInput !== queryParams.search) {
                updateParams({ search: searchInput }, { resetPage: true });
            }
        }, 350);
        return () => clearTimeout(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchInput]);

    // Click a sortable header
    const handleSortClick = (field) => {
        if (queryParams.sort_by === field) {
            updateParams({ sort_dir: queryParams.sort_dir === 'asc' ? 'desc' : 'asc' });
        } else {
            updateParams({ sort_by: field, sort_dir: 'desc' }, { resetPage: true });
        }
    };

    // ── Data fetch (refreshes on every dashboard tick = 30s) ──
    const { data, loading, error } = useV2Endpoint(
        '/api/statistics/v2/active-trips',
        {
            page:      queryParams.page,
            page_size: queryParams.page_size,
            search:    queryParams.search || undefined,
            source:    queryParams.source || undefined,
            dest:      queryParams.dest || undefined,
            stage:     queryParams.stage || undefined,
            sort_by:   queryParams.sort_by,
            sort_dir:  queryParams.sort_dir,
        },
        { tick, cadence: 1 }
    );

    const trips = data?.trips || [];
    const total       = data?.count       ?? 0;
    const totalPages  = data?.total_pages ?? 1;
    const page        = data?.page        ?? queryParams.page;
    const pageSize    = data?.page_size   ?? queryParams.page_size;
    const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const showingTo   = Math.min(page * pageSize, total);

    return (
        <div className="v2-card v2-active-card">
            <div className="v2-card-h v2-card-h--with-controls">
                <h3>Active Trips</h3>
                <span className="v2-sub">
                    {total === 0 ? 'No active trips' : `Showing ${showingFrom}–${showingTo} of ${total}`}
                </span>

                {/* Filter / search bar — inline in header, pushed right via margin-left:auto */}
                <div className="v2-active-controls">
                    <div className="v2-active-search">
                        <Search size={13} className="v2-active-search-icon" />
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search Trip ID or Ladle…"
                            className="v2-active-search-input"
                        />
                    </div>
                    <select
                        value={queryParams.source}
                        onChange={(e) => updateParams({ source: e.target.value }, { resetPage: true })}
                        className="v2-active-select"
                    >
                        {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select
                        value={queryParams.dest}
                        onChange={(e) => updateParams({ dest: e.target.value }, { resetPage: true })}
                        className="v2-active-select"
                    >
                        {DEST_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <select
                        value={queryParams.stage}
                        onChange={(e) => updateParams({ stage: e.target.value }, { resetPage: true })}
                        className="v2-active-select"
                    >
                        {STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </div>
            </div>

            {/* Table body */}
            <div className="v2-active-body">
                {error && <div className="v2-empty">Failed to load active trips</div>}
                {!error && trips.length === 0 && !loading && (
                    <div className="v2-empty">No active trips matching the current filters</div>
                )}
                {!error && trips.length > 0 && (
                    <table className="v2-active-table">
                        <thead>
                            <tr>
                                <SortableTh field="created_at"    label="Created"    {...{ currentSortBy: queryParams.sort_by, currentSortDir: queryParams.sort_dir, onClick: handleSortClick }} />
                                <SortableTh field="dispatched_at" label="Dispatched" {...{ currentSortBy: queryParams.sort_by, currentSortDir: queryParams.sort_dir, onClick: handleSortClick }} />
                                <SortableTh field="ladle"         label="Ladle"      {...{ currentSortBy: queryParams.sort_by, currentSortDir: queryParams.sort_dir, onClick: handleSortClick }} />
                                <SortableTh field="trip_id"       label="Trip ID"    {...{ currentSortBy: queryParams.sort_by, currentSortDir: queryParams.sort_dir, onClick: handleSortClick }} />
                                <SortableTh field="source"        label="Source"     {...{ currentSortBy: queryParams.sort_by, currentSortDir: queryParams.sort_dir, onClick: handleSortClick }} />
                                <SortableTh field="dest_sms"      label="Dest"       {...{ currentSortBy: queryParams.sort_by, currentSortDir: queryParams.sort_dir, onClick: handleSortClick }} />
                                <SortableTh field="net_weight"    label="Net WT"     align="right" {...{ currentSortBy: queryParams.sort_by, currentSortDir: queryParams.sort_dir, onClick: handleSortClick }} />
                                <SortableTh field="temp"          label="Temp"       align="right" {...{ currentSortBy: queryParams.sort_by, currentSortDir: queryParams.sort_dir, onClick: handleSortClick }} />
                                <SortableTh field="s"             label="S"          align="right" {...{ currentSortBy: queryParams.sort_by, currentSortDir: queryParams.sort_dir, onClick: handleSortClick }} />
                                <th className="v2-active-th">Stage</th>
                                <th className="v2-active-th">Current Location</th>
                                <SortableTh field="age_seconds"   label="Age"        align="right" {...{ currentSortBy: queryParams.sort_by, currentSortDir: queryParams.sort_dir, onClick: handleSortClick }} />
                            </tr>
                        </thead>
                        <tbody>
                            {trips.map(t => (
                                <tr key={t.trip_id}>
                                    <td className="v2-mono">{fmtTime(t.created_at)}</td>
                                    <td className="v2-mono">{fmtTime(t.dispatched_at)}</td>
                                    <td><strong>{t.ladle || '—'}</strong></td>
                                    <td className="v2-mono v2-dim">{t.trip_id || '—'}</td>
                                    <td>{t.source || '—'}</td>
                                    <td>{formatDest(t)}</td>
                                    <td className="v2-mono v2-active-td--right">
                                        {t.net_weight != null ? `${t.net_weight} t` : '—'}
                                        {t.hotmetal_qty != null && (
                                            <div className="v2-active-sub-value">↓ {t.hotmetal_qty} t</div>
                                        )}
                                    </td>
                                    <td className={`v2-mono v2-active-td--right ${t.is_cold ? 'v2-text-red' : ''}`}>
                                        {t.temp != null ? `${t.temp}°C` : '—'}
                                    </td>
                                    <td className={`v2-mono v2-active-td--right ${t.is_high_s ? 'v2-text-red' : ''}`}>
                                        {t.s != null ? t.s : '—'}
                                    </td>
                                    <td>
                                        <span className={STAGE_BADGE_CLASS[t.stage] || 'v2-stage-badge'}>
                                            {STAGE_LABEL[t.stage] || t.stage || '—'}
                                        </span>
                                    </td>
                                    <td className={`v2-active-td--loc ${t.gps_stale ? 'v2-dim' : ''}`}>
                                        {t.gps_stale ? 'GPS stale' : (t.current_location_text || '—')}
                                    </td>
                                    <td className={`v2-mono v2-active-td--right ${t.is_late ? 'v2-text-amber' : ''}`}>
                                        {fmtAge(t.age_seconds)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination footer */}
            <div className="v2-active-footer">
                <div className="v2-active-page-size">
                    Rows per page:&nbsp;
                    <select
                        value={pageSize}
                        onChange={(e) => updateParams({ page_size: e.target.value }, { resetPage: true })}
                        className="v2-active-select v2-active-select--sm"
                    >
                        {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
                <div className="v2-active-page-info">
                    Page {page} of {totalPages}
                </div>
                <div className="v2-active-page-nav">
                    <button
                        type="button"
                        className="v2-active-page-btn"
                        disabled={page <= 1}
                        onClick={() => updateParams({ page: 1 })}
                        aria-label="First page"
                    ><ChevronsLeft size={14} /></button>
                    <button
                        type="button"
                        className="v2-active-page-btn"
                        disabled={page <= 1}
                        onClick={() => updateParams({ page: page - 1 })}
                        aria-label="Previous page"
                    ><ChevronLeft size={14} /></button>
                    <button
                        type="button"
                        className="v2-active-page-btn"
                        disabled={page >= totalPages}
                        onClick={() => updateParams({ page: page + 1 })}
                        aria-label="Next page"
                    ><ChevronRight size={14} /></button>
                    <button
                        type="button"
                        className="v2-active-page-btn"
                        disabled={page >= totalPages}
                        onClick={() => updateParams({ page: totalPages })}
                        aria-label="Last page"
                    ><ChevronsRight size={14} /></button>
                </div>
            </div>
        </div>
    );
};

export default ActiveTripsTable;
