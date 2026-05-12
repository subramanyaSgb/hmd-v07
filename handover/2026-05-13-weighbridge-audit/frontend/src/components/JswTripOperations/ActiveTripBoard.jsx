import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../utils/api';
import { Filter, ChevronDown } from 'lucide-react';
import TripDetailPane from './TripDetailPane';

/**
 * Default Trip Operations V2 sub-tab.
 *
 * Two-pane layout: cards grid on the left, single trip detail on the
 * right. Cards from /api/jsw/trips?mode=in_flight. Each card shows:
 *
 *   TLC id · BF→SMS pill · alert (or OK)
 *   Tap # · TH · Shift
 *   NET · TEMP · S · Si · AGE
 *   5-stage strip (server-derived stage_idx)
 *
 * Selecting a card opens the detail pane on the right (sticky for the
 * tab session). Refreshes every 10s tick.
 */

const TripCard = memo(
    function TripCard({ trip, selected, onClick }) {
        const tempLow = trip.temp != null && trip.temp < 1450;
        const sHigh = trip.s_l != null && trip.s_l > 0.05;
        const ageMin = computeAgeMinutes(trip);

        return (
            <div
                className={`jto-card ${selected ? 'selected' : ''}`}
                onClick={() => onClick(trip.trip_id)}
            >
                <div className="jto-card-h">
                    <div className="jto-card-h-left">
                        <span className="jto-card-id">{trip.fleet_id}</span>
                        <span className="jto-tag jto-tag-blue">
                            {trip.source_lab} → {trip.destination}
                        </span>
                    </div>
                    {trip.alert ? (
                        <span className={`jto-tag jto-tag-${alertTone(trip.alert)}`}>
                            <span className="jto-tag-dot"/>{trip.alert.tag}
                        </span>
                    ) : (
                        <span className="jto-tag jto-tag-green">
                            <span className="jto-tag-dot"/>OK
                        </span>
                    )}
                </div>

                <div className="jto-card-meta">
                    Tap #{trip.tap_no || '—'} · TH{trip.tap_hole || '?'} · Shift {(trip.shift || '?').trim()}
                </div>

                <div className="jto-card-metrics">
                    <Metric label="NET" value={trip.net_weight} unit="t" decimals={1} />
                    <Metric
                        label="TEMP"
                        value={trip.temp}
                        unit="°C"
                        decimals={0}
                        tone={tempLow ? 'red' : null}
                    />
                    <Metric
                        label="S"
                        value={trip.s_l}
                        decimals={3}
                        tone={sHigh ? 'amber' : null}
                    />
                    <Metric label="Si" value={trip.si_l} decimals={2} />
                    <div className="jto-card-age">
                        <span className="jto-metric-lbl">AGE</span>
                        <span className="jto-metric-val">
                            {ageMin != null ? `${ageMin}` : '—'}
                            <span className="jto-metric-unit"> min</span>
                        </span>
                    </div>
                </div>

                <div className="jto-stage-strip">
                    {['Tap','Weigh','Transit','SMS','Return'].map((label, i) => {
                        const done = i < (trip.stage_idx ?? 0);
                        const active = i === (trip.stage_idx ?? 0);
                        return (
                            <div
                                key={label}
                                className={`jto-stage ${done ? 'done' : active ? 'active' : ''}`}
                            >
                                <span className="jto-stage-num">{done ? '✓' : i + 1}</span>
                                <span className="jto-stage-lbl">{label}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    },
    (prev, next) =>
        prev.selected === next.selected &&
        prev.onClick === next.onClick &&
        prev.trip.trip_id === next.trip.trip_id &&
        prev.trip.fleet_id === next.trip.fleet_id &&
        prev.trip.stage_idx === next.trip.stage_idx &&
        prev.trip.temp === next.trip.temp &&
        prev.trip.s_l === next.trip.s_l &&
        prev.trip.si_l === next.trip.si_l &&
        prev.trip.net_weight === next.trip.net_weight &&
        prev.trip.alert?.id === next.trip.alert?.id
);

const Metric = ({ label, value, unit, decimals, tone }) => {
    const valStr = value != null
        ? Number(value).toFixed(decimals ?? 1)
        : '—';
    const toneCls = tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : '';
    return (
        <div className="jto-card-metric">
            <span className="jto-metric-lbl">{label}</span>
            <span className={`jto-metric-val ${toneCls}`}>
                {valStr}
                {unit && <span className="jto-metric-unit">{unit}</span>}
            </span>
        </div>
    );
};

function alertTone(alert) {
    if (!alert) return 'green';
    if (alert.severity === 'high') return 'red';
    if (alert.severity === 'med' || alert.severity === 'medium') return 'amber';
    return 'amber';
}

function computeAgeMinutes(trip) {
    const start = trip.first_tare_time;
    if (!start) return null;
    const startMs = new Date(start).getTime();
    if (isNaN(startMs)) return null;
    return Math.max(0, Math.floor((Date.now() - startMs) / 60_000));
}

const ActiveTripBoard = ({ tick, filters, setCount }) => {
    const [trips, setTrips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedTripId, setSelectedTripId] = useState(null);
    const inflightRef = useRef(false);

    // Convert UI filter values into backend query params
    const params = useMemo(() => {
        const out = { mode: 'in_flight', page_size: 50, time_window: 'today' };
        if (filters.shift && filters.shift !== 'All') out.shift = filters.shift;
        // 'All BFs' (legacy) and 'All' (post-Corex relabel 2026-05-13) both
        // mean "no source filter" — pass anything else straight through.
        if (filters.source && filters.source !== 'All' && filters.source !== 'All BFs') {
            out.source_lab = filters.source;
        }
        if (filters.destination && filters.destination !== 'All') out.destination = filters.destination;
        return out;
    }, [filters]);

    useEffect(() => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        api.get('/api/jsw/trips', params)
            .then(resp => {
                const rows = resp?.rows || [];
                setTrips(rows);
                setLoading(false);
                setError(null);
                if (setCount) setCount('active', rows.length);
            })
            .catch(err => { setError(err); setLoading(false); })
            .finally(() => { inflightRef.current = false; });
    }, [tick, params, setCount]);

    const handleSelect = React.useCallback((tripId) => {
        setSelectedTripId(prev => prev === tripId ? prev : tripId);
    }, []);

    const selectedTrip = useMemo(
        () => trips.find(t => t.trip_id === selectedTripId) || null,
        [trips, selectedTripId]
    );

    return (
        <div className="jto-active-board">
            <div className="jto-card-panel">
                <div className="jto-card-panel-h">
                    <h3>Active Trip Board</h3>
                    <span className="jto-sub">tap → weigh → transit → SMS ack</span>
                    <div className="jto-card-panel-actions">
                        <span className="jto-pill jto-pill-active">Cards</span>
                    </div>
                </div>
                <div className="jto-cards-grid">
                    {trips.length === 0 && !loading && (
                        <div className="jto-empty">No active trips right now</div>
                    )}
                    {trips.length === 0 && loading && (
                        <div className="jto-empty">Loading…</div>
                    )}
                    {error && (
                        <div className="jto-empty">Failed to load active trips</div>
                    )}
                    {trips.slice(0, 14).map(t => (
                        <TripCard
                            key={t.trip_id}
                            trip={t}
                            selected={t.trip_id === selectedTripId}
                            onClick={handleSelect}
                        />
                    ))}
                </div>
            </div>

            <div className="jto-detail-pane">
                {selectedTrip ? (
                    <TripDetailPane trip={selectedTrip} />
                ) : (
                    <div className="jto-detail-empty">
                        <div className="jto-detail-empty-h">No trip selected</div>
                        <div className="jto-detail-empty-sub">
                            Click a card on the left to inspect a trip.
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActiveTripBoard;
