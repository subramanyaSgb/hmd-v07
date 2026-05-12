import React, { useEffect, useRef, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import ActiveTripBoard from './ActiveTripBoard';
import ExceptionsQueue from './ExceptionsQueue';
import CompletedTable from './CompletedTable';
import GanttView from './GanttView';
import './JswTripOperations.css';

/**
 * Trip Operations V2 — the JSW tab's new content (replaces the
 * legacy JswTripsTab table view as of 2026-05-12). 1:1 layout port of
 * `desing_idea/trips.jsx`, adapted to V07's light theme.
 *
 * Four sub-tabs, each backed by `/api/jsw/*` endpoints:
 *   1. Active Trips     → /api/jsw/trips?mode=in_flight  (cards + detail pane)
 *   2. Exceptions       → /api/jsw/v2/exceptions         (queue table)
 *   3. Completed today  → /api/jsw/trips?mode=completed  (full row table)
 *   4. Timeline         → /api/jsw/v2/timeline?hours=12  (per-torpedo gantt)
 *
 * Master 10s tick fans out to whichever sub-tab is mounted; only the
 * active sub-tab fetches.
 *
 * Design doc: docs/plans/2026-05-12-trip-operations-v2-design.md
 */

const REFRESH_MS = 10_000;

const SUB_TABS = [
    { id: 'active',     label: 'Active Trips' },
    { id: 'exceptions', label: 'Exceptions', tone: 'red' },
    { id: 'completed',  label: 'Completed (today)' },
    { id: 'timeline',   label: 'Timeline' },
];

const JswTripOperations = () => {
    const [subTab, setSubTab] = useState('active');
    const [filters, setFilters] = useState({ shift: 'A', source: 'All BFs', destination: 'All' });
    const [tick, setTick] = useState(0);

    // Shared counts shown in the sub-tab badges. Each tab reports its
    // count back via setCount(id, n).
    const [counts, setCounts] = useState({ active: 0, exceptions: 0, completed: 0 });
    const setCount = React.useCallback((id, n) => {
        setCounts(prev => (prev[id] === n ? prev : { ...prev, [id]: n }));
    }, []);

    // Master tick — 10s
    const timerRef = useRef(null);
    useEffect(() => {
        timerRef.current = setInterval(() => setTick(t => t + 1), REFRESH_MS);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    return (
        <div className="jsw-trip-ops">
            {/* Sub-tab row + filter chips + Export */}
            <div className="jto-toolbar">
                <div className="jto-subtabs">
                    {SUB_TABS.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            className={`jto-subtab ${subTab === t.id ? 'active' : ''}`}
                            onClick={() => setSubTab(t.id)}
                        >
                            {t.label}
                            {counts[t.id] != null && t.id !== 'timeline' && (
                                <span className={`jto-count ${t.tone === 'red' && counts[t.id] > 0 ? 'red' : ''}`}>
                                    {counts[t.id]}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="jto-filters">
                    <FilterChip
                        label="Shift"
                        value={filters.shift}
                        options={['All', 'A', 'B', 'C']}
                        onChange={v => setFilters(f => ({ ...f, shift: v }))}
                    />
                    <FilterChip
                        label="Source"
                        value={filters.source}
                        options={['All BFs', 'BF3', 'BF4', 'BF5']}
                        onChange={v => setFilters(f => ({ ...f, source: v }))}
                    />
                    <FilterChip
                        label="Destination"
                        value={filters.destination}
                        options={['All', 'SMS1', 'SMS2', 'SMS3', 'SMS4', 'RFL']}
                        onChange={v => setFilters(f => ({ ...f, destination: v }))}
                    />
                    <button type="button" className="jto-btn jto-btn-ghost">
                        <Download size={13} /> Export
                    </button>
                </div>
            </div>

            {/* Render the active sub-tab. Only one is mounted at a time
                so we don't pay polling cost on unseen tabs. */}
            <div className="jto-body">
                {subTab === 'active' && (
                    <ActiveTripBoard
                        tick={tick}
                        filters={filters}
                        setCount={setCount}
                    />
                )}
                {subTab === 'exceptions' && (
                    <ExceptionsQueue
                        tick={tick}
                        setCount={setCount}
                    />
                )}
                {subTab === 'completed' && (
                    <CompletedTable
                        tick={tick}
                        filters={filters}
                        setCount={setCount}
                    />
                )}
                {subTab === 'timeline' && (
                    <GanttView tick={tick} />
                )}
            </div>
        </div>
    );
};

/**
 * Tiny native-select dropdown chip — same visual as design idea's
 * `[Shift: A ▾]` filter chips. Native select to keep keyboard/a11y
 * working without rolling a custom popover.
 */
const FilterChip = ({ label, value, options, onChange }) => {
    return (
        <label className="jto-filter-chip">
            <span className="jto-filter-chip-lbl">{label}:</span>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="jto-filter-chip-select"
            >
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronDown size={11} />
        </label>
    );
};

export default JswTripOperations;
