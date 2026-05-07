import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { statusColor, statusShort } from '../utils/torpedoStatus';

/**
 * TorpedoDrawer — right-side slide-in panel showing live + recent state of one torpedo.
 *
 * Phase 2 of Live Tracking Sprint. 5 sections:
 *   1. Live position  (lat/lon, derived speed, last update)  — polled every 5s
 *   2. Current trip   (in-flight trip with elapsed time)     — polled every 10s
 *   3. Last trip      (most recent completed trip)           — fetched once per open
 *   4. Trip history   (last 20 trips, manual refresh)        — fetched once per open + manual
 *   5. Maintenance    (status badge + capacity)              — fetched once per open
 *
 * Refresh strategy: Section 1 + 2 use independent polling; Sections 3-5 share a
 * single `/api/fleet-management/{id}/details` call refreshed by the Section-4 button.
 *
 * Closes on: × button, backdrop click, Esc key.
 */

const STATUS_NAMES = {
    0: 'Pending', 1: 'Assigned', 2: 'WB Tare Entry', 3: 'WB Tare Recorded',
    4: 'Producer Entered', 5: 'Loading Started', 6: 'Loading Ended',
    7: 'Producer Exited', 8: 'WB Gross Entry', 9: 'WB Gross Recorded',
    10: 'Consumer Entered', 11: 'Unloading Started', 12: 'Unloading Ended',
    13: 'Completed', 14: 'Canceled', 15: 'Aborted',
};

// Haversine distance in km between two lat/lon points.
const haversineKm = (a, b) => {
    if (!a || !b) return 0;
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
};

const formatRelative = (iso) => {
    if (!iso) return '—';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '—';
    const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
};

const formatDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
};

const formatMinutes = (m) => {
    if (m === null || m === undefined) return '—';
    if (m < 60) return `${Math.round(m)} min`;
    const h = Math.floor(m / 60);
    const rem = Math.round(m - h * 60);
    return `${h}h ${rem}m`;
};

const elapsedMinutes = (iso) => {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    return Math.max(0, (Date.now() - then) / 60000);
};

export default function TorpedoDrawer({ fleetId, onClose }) {
    const navigate = useNavigate();
    const isOpen = Boolean(fleetId);

    const [livePosition, setLivePosition] = useState(null); // { x, y, last_updated, status, capacity }
    const [details, setDetails] = useState(null);            // /details payload
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [error, setError] = useState(null);
    const [tick, setTick] = useState(0); // forces re-render of "N s ago" counters

    // Track previous live point to derive speed.
    const prevPointRef = useRef(null); // { lat, lon, ts }
    const [derivedSpeedKmh, setDerivedSpeedKmh] = useState(null);

    // 1-second tick for relative-time counters.
    useEffect(() => {
        if (!isOpen) return;
        const id = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(id);
    }, [isOpen]);

    // Reset state when fleetId changes.
    useEffect(() => {
        if (!isOpen) return;
        setLivePosition(null);
        setDetails(null);
        setError(null);
        prevPointRef.current = null;
        setDerivedSpeedKmh(null);
    }, [fleetId, isOpen]);

    // Section 1 — poll /api/fleet/live every 5s, filter to this fleet_id.
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        const fetchLive = async () => {
            try {
                const all = await api.get('/api/fleet/live');
                if (cancelled) return;
                const me = Array.isArray(all)
                    ? all.find((f) => f.fleet_id === fleetId)
                    : null;
                if (me) {
                    // Derive speed from previous fix if we have one.
                    const prev = prevPointRef.current;
                    if (prev && me.last_updated) {
                        const tsNow = new Date(me.last_updated).getTime();
                        const dtSec = (tsNow - prev.ts) / 1000;
                        if (dtSec > 0 && dtSec < 600) {
                            const km = haversineKm([prev.lat, prev.lon], [me.x, me.y]);
                            const kmh = (km / dtSec) * 3600;
                            // Ignore noisy GPS jitter under a tiny threshold.
                            setDerivedSpeedKmh(kmh < 0.5 ? 0 : kmh);
                        }
                    }
                    if (me.last_updated) {
                        prevPointRef.current = {
                            lat: me.x, lon: me.y, ts: new Date(me.last_updated).getTime(),
                        };
                    }
                    setLivePosition(me);
                }
            } catch (err) {
                if (!cancelled) console.warn('TorpedoDrawer: live poll failed', err);
            }
        };

        fetchLive();
        const id = setInterval(fetchLive, 5000);
        return () => { cancelled = true; clearInterval(id); };
    }, [fleetId, isOpen]);

    // Sections 2-5 — fetch /details once per open + when manual refresh triggered.
    const fetchDetails = useCallback(async () => {
        if (!isOpen) return;
        setLoadingDetails(true);
        setError(null);
        try {
            const data = await api.get(`/api/fleet-management/${fleetId}/details`);
            setDetails(data);
        } catch (err) {
            setError(err.message || 'Failed to load torpedo details');
        } finally {
            setLoadingDetails(false);
        }
    }, [fleetId, isOpen]);

    useEffect(() => {
        fetchDetails();
    }, [fetchDetails]);

    // Section 2 only — re-poll current trip every 10s while drawer is open AND torpedo is Assigned.
    useEffect(() => {
        if (!isOpen) return;
        const isAssigned = livePosition?.status === 'Assigned' || details?.torpedo?.status === 'Assigned';
        if (!isAssigned) return;
        const id = setInterval(fetchDetails, 10000);
        return () => clearInterval(id);
    }, [isOpen, livePosition?.status, details?.torpedo?.status, fetchDetails]);

    // Esc key to close.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    const headerStatus = livePosition?.status || details?.torpedo?.status || 'Unknown';
    const headerColor = statusColor(headerStatus);
    const headerShort = statusShort(headerStatus);

    const lastUpdatedRel = useMemo(() => {
        // touch tick so this recomputes every second
        void tick;
        return formatRelative(livePosition?.last_updated);
    }, [livePosition?.last_updated, tick]);

    const currentTrip = details?.current_trip;
    const lastTrip = details?.recent_trips?.[0];
    const recentTrips = details?.recent_trips || [];

    if (!isOpen) return null;

    return (
        <>
            <div style={styles.backdrop} onClick={onClose} />
            <aside style={styles.drawer} role="dialog" aria-label={`Torpedo ${fleetId} details`}>
                {/* Sticky header */}
                <header style={{ ...styles.header, borderTop: `4px solid ${headerColor}` }}>
                    <div style={styles.headerRow}>
                        <div style={styles.fleetIdText}>{fleetId}</div>
                        <button onClick={onClose} style={styles.closeBtn} aria-label="Close">✕</button>
                    </div>
                    <div style={styles.headerRow}>
                        <span style={{ ...styles.badge, background: headerColor }}>{headerShort}</span>
                        <span style={styles.metaText}>updated {lastUpdatedRel}</span>
                    </div>
                </header>

                <div style={styles.body}>
                    {error && (
                        <div style={styles.errorBanner}>{error}</div>
                    )}

                    {/* Section 1 — Live Position */}
                    <section style={styles.section}>
                        <h3 style={styles.sectionTitle}>Live Position</h3>
                        <div style={styles.kvGrid}>
                            <div style={styles.k}>Latitude</div>
                            <div style={styles.v}>{livePosition?.x?.toFixed(3) ?? '—'}</div>
                            <div style={styles.k}>Longitude</div>
                            <div style={styles.v}>{livePosition?.y?.toFixed(3) ?? '—'}</div>
                            <div style={styles.k}>Speed (derived)</div>
                            <div style={styles.v}>
                                {derivedSpeedKmh === null ? '—' : `${derivedSpeedKmh.toFixed(1)} km/h`}
                            </div>
                            <div style={styles.k}>Last update</div>
                            <div style={styles.v}>{formatDateTime(livePosition?.last_updated)}</div>
                        </div>
                    </section>

                    {/* Section 2 — Current Trip */}
                    <section style={styles.section}>
                        <h3 style={styles.sectionTitle}>Current Trip</h3>
                        {currentTrip ? (
                            <>
                                <div style={styles.kvGrid}>
                                    <div style={styles.k}>Trip ID</div>
                                    <div style={styles.v}>{currentTrip.trip_id}</div>
                                    <div style={styles.k}>Route</div>
                                    <div style={styles.v}>{currentTrip.producer_id} → {currentTrip.consumer_id}</div>
                                    <div style={styles.k}>Status</div>
                                    <div style={styles.v}>{currentTrip.status_name || STATUS_NAMES[currentTrip.status] || '—'}</div>
                                    <div style={styles.k}>Elapsed</div>
                                    <div style={styles.v}>
                                        {/* tick state forces this to recompute every second */}
                                        {tick >= 0 && formatMinutes(elapsedMinutes(currentTrip.assigned_at))}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    style={styles.primaryBtn}
                                    onClick={() => {
                                        navigate(`/trips?id=${encodeURIComponent(currentTrip.trip_id)}`);
                                        onClose();
                                    }}
                                >
                                    View full trip detail →
                                </button>
                            </>
                        ) : (
                            <div style={styles.emptyText}>No active trip</div>
                        )}
                    </section>

                    {/* Section 3 — Last Trip */}
                    <section style={styles.section}>
                        <h3 style={styles.sectionTitle}>Last Trip</h3>
                        {lastTrip ? (
                            <div style={styles.kvGrid}>
                                <div style={styles.k}>Trip ID</div>
                                <div style={styles.v}>{lastTrip.trip_id}</div>
                                <div style={styles.k}>Route</div>
                                <div style={styles.v}>{lastTrip.producer_id} → {lastTrip.consumer_id}</div>
                                <div style={styles.k}>Cycle time</div>
                                <div style={styles.v}>{formatMinutes(lastTrip.cycle_time_minutes)}</div>
                                <div style={styles.k}>Completed</div>
                                <div style={styles.v}>{formatDateTime(lastTrip.completed_at)}</div>
                            </div>
                        ) : (
                            <div style={styles.emptyText}>No completed trips yet</div>
                        )}
                    </section>

                    {/* Section 4 — Trip History (last 20) */}
                    <section style={styles.section}>
                        <div style={styles.sectionHeaderRow}>
                            <h3 style={styles.sectionTitle}>Trip History</h3>
                            <button
                                type="button"
                                onClick={fetchDetails}
                                disabled={loadingDetails}
                                style={styles.refreshBtn}
                            >
                                {loadingDetails ? 'Refreshing…' : 'Refresh'}
                            </button>
                        </div>
                        {recentTrips.length > 0 ? (
                            <div style={styles.tableWrap}>
                                <table style={styles.table}>
                                    <thead>
                                        <tr>
                                            <th style={styles.th}>Trip</th>
                                            <th style={styles.th}>Route</th>
                                            <th style={styles.th}>Status</th>
                                            <th style={styles.th}>Cycle</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentTrips.map((t) => (
                                            <tr key={t.trip_id}>
                                                <td style={styles.td}>{t.trip_id}</td>
                                                <td style={styles.td}>{t.producer_id}→{t.consumer_id}</td>
                                                <td style={styles.td}>{t.status_name || STATUS_NAMES[t.status] || '—'}</td>
                                                <td style={styles.td}>{formatMinutes(t.cycle_time_minutes)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div style={styles.emptyText}>No trips on record</div>
                        )}
                    </section>

                    {/* Section 5 — Maintenance Summary */}
                    <section style={styles.section}>
                        <h3 style={styles.sectionTitle}>Maintenance & Capacity</h3>
                        <div style={styles.kvGrid}>
                            <div style={styles.k}>Status</div>
                            <div style={styles.v}>
                                <span style={{
                                    ...styles.badge,
                                    background: statusColor(details?.torpedo?.status || headerStatus),
                                    fontSize: '11px',
                                }}>
                                    {details?.torpedo?.status || headerStatus}
                                </span>
                            </div>
                            <div style={styles.k}>Capacity</div>
                            <div style={styles.v}>
                                {details?.torpedo?.capacity ? `${details.torpedo.capacity} MT` : '—'}
                            </div>
                            <div style={styles.k}>Type</div>
                            <div style={styles.v}>{details?.torpedo?.type || '—'}</div>
                        </div>
                    </section>
                </div>
            </aside>
            <style>{slideKeyframes}</style>
        </>
    );
}

const slideKeyframes = `
@keyframes torpedoDrawerSlideIn {
    from { transform: translateX(100%); }
    to   { transform: translateX(0); }
}
@keyframes torpedoDrawerFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
}
`;

const styles = {
    backdrop: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.35)',
        backdropFilter: 'blur(2px)',
        // Sit above app header (z=2000) and sidebar (z=2100) so the drawer's
        // own sticky header (fleet_id + status badge + ✕) isn't covered.
        zIndex: 2200,
        animation: 'torpedoDrawerFadeIn 180ms ease-out',
    },
    drawer: {
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '420px',
        maxWidth: '100vw',
        background: '#ffffff',
        color: '#1e293b',
        boxShadow: '-12px 0 32px rgba(15, 23, 42, 0.18)',
        zIndex: 2201,
        display: 'flex',
        flexDirection: 'column',
        animation: 'torpedoDrawerSlideIn 200ms cubic-bezier(0.32, 0.72, 0.0, 1)',
    },
    header: {
        position: 'sticky',
        top: 0,
        background: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        padding: '14px 18px 12px',
        zIndex: 2,
    },
    headerRow: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        marginTop: '4px',
    },
    fleetIdText: {
        fontSize: '20px',
        fontWeight: 800,
        letterSpacing: '0.02em',
        color: '#0f172a',
    },
    badge: {
        padding: '2px 10px',
        borderRadius: '999px',
        color: '#ffffff',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        boxShadow: '0 1px 2px rgba(15,23,42,0.15)',
    },
    metaText: {
        fontSize: '12px',
        color: '#64748b',
        fontWeight: 500,
    },
    closeBtn: {
        background: 'none',
        border: 'none',
        fontSize: '18px',
        color: '#94a3b8',
        cursor: 'pointer',
        padding: '4px 8px',
        borderRadius: '6px',
    },
    body: {
        flex: 1,
        overflowY: 'auto',
        padding: '14px 18px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
    },
    section: {
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '12px 14px',
    },
    sectionHeaderRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4px',
    },
    sectionTitle: {
        margin: '0 0 8px 0',
        fontSize: '12px',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: '#475569',
    },
    kvGrid: {
        display: 'grid',
        gridTemplateColumns: '120px 1fr',
        rowGap: '6px',
        columnGap: '12px',
        fontSize: '13px',
    },
    k: {
        color: '#64748b',
        fontWeight: 500,
    },
    v: {
        color: '#0f172a',
        fontWeight: 600,
        wordBreak: 'break-word',
    },
    emptyText: {
        fontSize: '13px',
        color: '#94a3b8',
        fontStyle: 'italic',
    },
    primaryBtn: {
        marginTop: '10px',
        width: '100%',
        padding: '8px 12px',
        borderRadius: '8px',
        border: 'none',
        background: '#3b82f6',
        color: '#ffffff',
        fontWeight: 700,
        fontSize: '13px',
        cursor: 'pointer',
    },
    refreshBtn: {
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        color: '#475569',
        fontSize: '11px',
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: '6px',
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    },
    tableWrap: {
        maxHeight: '220px',
        overflowY: 'auto',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        background: '#ffffff',
    },
    table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '12px',
    },
    th: {
        position: 'sticky',
        top: 0,
        background: '#f1f5f9',
        textAlign: 'left',
        padding: '6px 8px',
        fontWeight: 700,
        color: '#475569',
        borderBottom: '1px solid #e2e8f0',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        fontSize: '10px',
    },
    td: {
        padding: '6px 8px',
        borderBottom: '1px solid #f1f5f9',
        color: '#0f172a',
    },
    errorBanner: {
        padding: '8px 12px',
        borderRadius: '8px',
        background: 'rgba(239, 68, 68, 0.1)',
        color: '#ef4444',
        fontSize: '12px',
        fontWeight: 600,
    },
};
