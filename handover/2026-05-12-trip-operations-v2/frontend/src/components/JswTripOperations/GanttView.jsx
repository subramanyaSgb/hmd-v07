import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../utils/api';

/**
 * Timeline sub-tab — per-torpedo gantt for the last N hours.
 *
 * Source: /api/jsw/v2/timeline?hours=12 (default).
 * Backend returns up to 18 lanes (top by recent activity).
 *
 * Layout: sticky lane label column on the left, time axis at top,
 * trip bars positioned by start/end as % of (now - cutoff). In-flight
 * trips with no end time draw a "ghost" bar from start to now.
 */

const HOURS_OPTIONS = [6, 12, 24];

const DEST_COLORS = {
    SMS1: '#7fb1ff',
    SMS2: '#7fb1ff',
    SMS3: '#06b6d4',
    SMS4: '#a78bfa',
    RFL:  '#10b981',
    MGP:  '#f59e0b',
};

const GanttView = ({ tick }) => {
    const [hours, setHours] = useState(12);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const inflightRef = useRef(false);

    useEffect(() => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        api.get('/api/jsw/v2/timeline', { hours })
            .then(resp => {
                setData(resp);
                setLoading(false);
                setError(null);
            })
            .catch(err => { setError(err); setLoading(false); })
            .finally(() => { inflightRef.current = false; });
    }, [tick, hours]);

    const cutoffMs = data?.cutoff ? new Date(data.cutoff).getTime() : null;
    const nowMs = data?.now ? new Date(data.now).getTime() : Date.now();
    const totalMs = cutoffMs != null ? nowMs - cutoffMs : hours * 3600_000;

    // Time-axis ticks — one per hour, labelled HH:00
    const ticks = useMemo(() => {
        if (cutoffMs == null) return [];
        const out = [];
        const cutoffHour = new Date(cutoffMs);
        cutoffHour.setMinutes(0, 0, 0);
        for (let h = 0; h <= hours; h++) {
            const t = cutoffHour.getTime() + h * 3600_000;
            if (t < cutoffMs || t > nowMs + 60_000) continue;
            out.push({
                t,
                pct: ((t - cutoffMs) / totalMs) * 100,
                label: new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
            });
        }
        return out;
    }, [cutoffMs, nowMs, totalMs, hours]);

    return (
        <div className="jto-card">
            <div className="jto-card-panel-h">
                <h3>Trip Timeline</h3>
                <span className="jto-sub">last {hours} hours · per torpedo</span>
                <div className="jto-card-panel-actions">
                    {HOURS_OPTIONS.map(h => (
                        <button
                            key={h}
                            type="button"
                            className={`jto-pill ${hours === h ? 'jto-pill-active' : ''}`}
                            onClick={() => setHours(h)}
                        >
                            {h}h
                        </button>
                    ))}
                </div>
            </div>

            <div className="jto-gantt-wrap">
                {error && <div className="jto-empty">Failed to load timeline</div>}
                {!error && !loading && (!data || data.lanes?.length === 0) && (
                    <div className="jto-empty">No trips in the last {hours} h.</div>
                )}
                {data && data.lanes?.length > 0 && (
                    <div className="jto-gantt">
                        {/* Time axis row */}
                        <div className="jto-gantt-axis">
                            <div className="jto-gantt-axis-spacer"/>
                            <div className="jto-gantt-axis-track">
                                {ticks.map((t, i) => (
                                    <span
                                        key={i}
                                        className="jto-gantt-axis-tick"
                                        style={{ left: `${t.pct}%` }}
                                    >
                                        {t.label}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Lanes */}
                        <div className="jto-gantt-lanes">
                            {data.lanes.map(lane => (
                                <div key={lane.fleet_id} className="jto-gantt-lane">
                                    <div className="jto-gantt-lane-label">
                                        <span className="jto-gantt-lane-dot"/>
                                        <span className="jto-gantt-lane-name">{lane.fleet_id}</span>
                                        <span className="jto-gantt-lane-status">
                                            {lane.status}
                                        </span>
                                    </div>
                                    <div className="jto-gantt-lane-track">
                                        {/* vertical grid lines from the same ticks */}
                                        {ticks.map((t, i) => (
                                            <div
                                                key={i}
                                                className="jto-gantt-vline"
                                                style={{ left: `${t.pct}%` }}
                                            />
                                        ))}
                                        {lane.trips.map((trip, i) => {
                                            const startMs = trip.start ? new Date(trip.start).getTime() : null;
                                            if (startMs == null || startMs > nowMs) return null;
                                            const endMs = trip.end
                                                ? new Date(trip.end).getTime()
                                                : nowMs;
                                            const leftPct = Math.max(
                                                0,
                                                ((startMs - cutoffMs) / totalMs) * 100
                                            );
                                            const widthPct = Math.max(
                                                1.2,
                                                ((endMs - startMs) / totalMs) * 100
                                            );
                                            const color = DEST_COLORS[trip.dst] || '#3b82f6';
                                            const ghost = !trip.end;
                                            return (
                                                <div
                                                    key={i}
                                                    className={`jto-gantt-bar ${ghost ? 'ghost' : ''}`}
                                                    style={{
                                                        left: `${leftPct}%`,
                                                        width: `${widthPct}%`,
                                                        background: color,
                                                    }}
                                                    title={`${trip.src || '?'} → ${trip.dst || '?'}`}
                                                >
                                                    <span className="jto-gantt-bar-lbl">
                                                        {trip.src || '?'}→{trip.dst || '?'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GanttView;
