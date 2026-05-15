import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronRight, Download, Crosshair } from 'lucide-react';
import { api } from '../../utils/api';
import { STATUS_COLORS } from './TorpedoListPanel';

/**
 * Right column — 360 px. Hidden by default; rendered conditionally
 * when LiveTrackingV2.selectedFleetId is non-null.
 *
 * 2026-05-15 revamp — design doc decisions #4, #5, #6, #7, #8, #14, #19.
 * Sections after the cleanup:
 *
 *   1. Header        — X close + TLC id + raw status dot + label + age (or "GPS stale")
 *   2. LOCATION      — text + lat/lon
 *   3. CURRENT TRIP  — from `Trip` table (HMD-owned via Trip Management).
 *                      Empty state directs operators to Dispatch Center.
 *   4. RECENT TRIPS  — last 5 completed/canceled/aborted trips from
 *                      the `Trip` table (NOT wbatngl_trip_mirror).
 *   5. Action footer — Center on map · Export CSV
 *
 * Removed from the prior incarnation:
 *   - CHEMISTRY & TEMP section (decision #5)
 *   - ASSET section (decision #6)
 *   - FED INTO section (decision #8)
 *
 * Polls /api/tracking/v2/torpedoes/{fleet_id} every other tick (10s).
 */
const STALE_COLOR = '#9ca3af';

const TorpedoDetailPanel = ({ fleetId, tick, onClose }) => {
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const inflightRef = useRef(false);
    const lastFetchedFleetRef = useRef(null);

    // Fetch immediately when fleetId changes, and every 2nd tick after that.
    useEffect(() => {
        const shouldFetch =
            fleetId !== lastFetchedFleetRef.current ||
            tick % 2 === 0;
        if (!shouldFetch) return;
        if (inflightRef.current) return;
        inflightRef.current = true;
        if (fleetId !== lastFetchedFleetRef.current) {
            setLoading(true);
            setDetail(null);
        }
        api.get(`/api/tracking/v2/torpedoes/${encodeURIComponent(fleetId)}`)
            .then(resp => {
                setDetail(resp);
                setError(null);
                setLoading(false);
                lastFetchedFleetRef.current = fleetId;
            })
            .catch(err => {
                setError(err);
                setLoading(false);
            })
            .finally(() => {
                inflightRef.current = false;
            });
    }, [fleetId, tick]);

    if (error) {
        return (
            <div className="v2-track-card v2-track-detail">
                <DetailHeader fleetId={fleetId} onClose={onClose} />
                <div className="v2-track-empty">Failed to load detail</div>
            </div>
        );
    }
    if (loading || !detail) {
        return (
            <div className="v2-track-card v2-track-detail">
                <DetailHeader fleetId={fleetId} onClose={onClose} />
                <div className="v2-track-empty">Loading…</div>
            </div>
        );
    }

    const baseColor = STATUS_COLORS[detail.status] || STATUS_COLORS.Idle;
    const color = detail.is_stale ? STALE_COLOR : baseColor;
    const ageLabel = detail.is_stale
        ? 'GPS stale'
        : (detail.last_report_sec != null ? `${detail.last_report_sec}s ago` : 'no GPS');

    return (
        <div className="v2-track-card v2-track-detail">
            {/* 1. HEADER */}
            <div className="v2-track-detail-header">
                <button
                    type="button"
                    className="v2-track-detail-close"
                    onClick={onClose}
                    aria-label="Close detail panel"
                >
                    <X size={16} />
                </button>
                <div className="v2-track-detail-header-meta">
                    <div className="v2-track-detail-id">{detail.fleet_id}</div>
                    <div className="v2-track-detail-status-row">
                        <span
                            className="v2-track-detail-dot"
                            style={{ background: color, boxShadow: `0 0 6px ${color}` }}
                        />
                        <span className="v2-track-detail-status">{detail.status}</span>
                        <span className="v2-track-dim">· {ageLabel}</span>
                    </div>
                </div>
            </div>

            <div className="v2-track-detail-body">
                {/* 2. LOCATION */}
                <Section title="LOCATION">
                    <div className="v2-track-detail-loc-text">
                        {detail.location?.text || '—'}
                    </div>
                    <div className="v2-track-detail-coords">
                        <span><span className="v2-track-dim">Lat</span> <span className="v2-track-mono">{detail.location?.lat?.toFixed(7) ?? '—'}</span></span>
                        <span><span className="v2-track-dim">Lon</span> <span className="v2-track-mono">{detail.location?.lon?.toFixed(7) ?? '—'}</span></span>
                    </div>
                </Section>

                {/* 3. CURRENT TRIP (from Trip table) */}
                <Section title="CURRENT TRIP">
                    {detail.current_trip ? (
                        <CurrentTrip ct={detail.current_trip} />
                    ) : (
                        <div className="v2-track-dim v2-track-tiny">
                            No active trip — assign one via{' '}
                            <span className="v2-track-breadcrumb">
                                Trip Management → Dispatch Center
                            </span>.
                        </div>
                    )}
                </Section>

                {/* 4. RECENT TRIPS (from Trip table) */}
                <Section title="RECENT TRIPS">
                    {(!detail.recent_trips || detail.recent_trips.length === 0) ? (
                        <div className="v2-track-dim v2-track-tiny">
                            No completed trips yet.
                        </div>
                    ) : (
                        <div className="v2-track-detail-recent">
                            {detail.recent_trips.map(r => (
                                <div key={r.trip_id} className="v2-track-detail-recent-row">
                                    <span className="v2-track-mono v2-track-dim">#{r.trip_id || '—'}</span>
                                    <span className="v2-track-tiny">{r.source || '—'} → {r.destination || '—'}</span>
                                    <span className="v2-track-mono">
                                        {r.net_wt != null ? `${r.net_wt.toFixed(1)}t` : '—'}
                                    </span>
                                    <span className="v2-track-tiny v2-track-dim">{r.status_label || '—'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </Section>
            </div>

            {/* 5. ACTION ROW */}
            <div className="v2-track-detail-footer">
                <button
                    type="button"
                    className="v2-track-btn v2-track-btn-primary"
                    onClick={() => {
                        if (detail.location?.lat != null && detail.location?.lon != null) {
                            window.dispatchEvent(new CustomEvent('v2track:centerMap', {
                                detail: { lat: detail.location.lat, lon: detail.location.lon },
                            }));
                        }
                    }}
                >
                    <Crosshair size={13} /> Center on map
                </button>
                <button
                    type="button"
                    className="v2-track-btn"
                    onClick={() => downloadCsv(detail)}
                >
                    <Download size={13} /> Export
                </button>
            </div>
        </div>
    );
};

const DetailHeader = ({ fleetId, onClose }) => (
    <div className="v2-track-detail-header">
        <button
            type="button"
            className="v2-track-detail-close"
            onClick={onClose}
            aria-label="Close detail panel"
        >
            <X size={16} />
        </button>
        <div className="v2-track-detail-header-meta">
            <div className="v2-track-detail-id">{fleetId}</div>
        </div>
    </div>
);

const Section = ({ title, children }) => (
    <div className="v2-track-detail-section">
        <div className="v2-track-detail-section-h">{title}</div>
        <div className="v2-track-detail-section-body">{children}</div>
    </div>
);

const CurrentTrip = ({ ct }) => {
    const stages = ['Tap', 'Weigh', 'Transit', 'SMS', 'Return'];
    return (
        <div className="v2-track-detail-trip">
            <div className="v2-track-detail-trip-route">
                <div>
                    <div className="v2-track-dim v2-track-tiny">SOURCE</div>
                    <div className="v2-track-detail-trip-node">{ct.source || '—'}</div>
                </div>
                <ChevronRight size={14} className="v2-track-dim" />
                <div>
                    <div className="v2-track-dim v2-track-tiny">DEST</div>
                    <div className="v2-track-detail-trip-node">{ct.destination || '—'}</div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div className="v2-track-dim v2-track-tiny">NET</div>
                    <div className="v2-track-mono">{ct.net_wt != null ? `${ct.net_wt.toFixed(1)} t` : '—'}</div>
                </div>
            </div>
            <div className="v2-track-stage-strip">
                {stages.map((label, i) => {
                    const done = i < (ct.stage_idx ?? 0);
                    const active = i === (ct.stage_idx ?? 0);
                    return (
                        <div
                            key={label}
                            className={`v2-track-stage ${done ? 'done' : active ? 'active' : ''}`}
                        >
                            <span className="v2-track-stage-num">{done ? '✓' : i + 1}</span>
                            <span className="v2-track-stage-lbl">{label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

function downloadCsv(detail) {
    if (!detail.recent_trips || !detail.recent_trips.length) {
        return;
    }
    const headers = ['trip_id', 'source', 'destination', 'net_wt', 'status_label', 'completed_at'];
    const rows = detail.recent_trips.map(r => [
        r.trip_id, r.source, r.destination, r.net_wt, r.status_label, r.completed_at,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${detail.fleet_id}_recent_trips.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export default TorpedoDetailPanel;
