import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronRight, Download, Crosshair, AlertCircle } from 'lucide-react';
import { api } from '../../utils/api';
import { STATUS_COLORS } from './TorpedoListPanel';

/**
 * Right column — 360px. Hidden by default; rendered conditionally
 * when LiveTrackingV2.selectedFleetId is non-null.
 *
 * 7 sections from top to bottom:
 *   1. Header — [X] top-LEFT + TLC id + status dot + status label + age
 *   2. Location
 *   3. Current Trip (with 5-stage vertical timeline)
 *   4. Chemistry & Temp
 *   5. Asset (life cycles / campaign / sensor placeholders)
 *   6. Recent Trips (last 5 from WBATNGL)
 *   7. Action row — Center on map · Export CSV
 *
 * Polls /api/tracking/v2/torpedoes/{fleet_id} every other tick (10s)
 * while open, using the `tick` prop from LiveTrackingV2.
 */
const TorpedoDetailPanel = ({ fleetId, tick, onClose }) => {
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const inflightRef = useRef(false);
    const lastFetchedFleetRef = useRef(null);

    // Fetch immediately when fleetId changes, and every 2nd tick after that
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

    const color = STATUS_COLORS[detail.derived_status] || '#94a3b8';

    return (
        <div className="v2-track-card v2-track-detail">
            {/* 1. HEADER with X top-LEFT */}
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
                        <span className="v2-track-detail-status">{detail.derived_status}</span>
                        <span className="v2-track-dim">
                            · {detail.last_report_sec != null ? `${detail.last_report_sec}s ago` : 'no GPS'}
                        </span>
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

                {/* 3. CURRENT TRIP */}
                <Section title="CURRENT TRIP">
                    {detail.current_trip ? (
                        <CurrentTrip ct={detail.current_trip} />
                    ) : (
                        <div className="v2-track-dim v2-track-tiny">
                            No active trip — torpedo {detail.derived_status.toLowerCase()}.
                        </div>
                    )}
                </Section>

                {/* 3.5 FED INTO (HTS heat-to-trip live map, Tier 1 #2)
                     Only renders when HTS has recorded this torpedo in
                     the last 90 min — i.e. the torpedo is currently or
                     just-recently pouring into a heat at SMS. Folds
                     directly into the same panel poll. */}
                {detail.current_heat && (
                    <Section title="FED INTO">
                        <FedInto heat={detail.current_heat} />
                    </Section>
                )}

                {/* 4. CHEMISTRY & TEMP */}
                <Section title="CHEMISTRY & TEMP">
                    <div className="v2-track-detail-metrics">
                        <Metric
                            label="Last temp"
                            value={detail.chemistry?.temp != null ? Math.round(detail.chemistry.temp) : '—'}
                            unit="°C"
                            tone={detail.chemistry?.temp != null && detail.chemistry.temp < 1450 ? 'red' :
                                  detail.chemistry?.temp != null && detail.chemistry.temp < 1470 ? 'amber' : null}
                        />
                        <Metric
                            label="Sulfur"
                            value={detail.chemistry?.sulfur != null ? detail.chemistry.sulfur.toFixed(3) : '—'}
                            unit="%"
                            tone={detail.chemistry?.sulfur != null && detail.chemistry.sulfur > 0.05 ? 'amber' : null}
                        />
                        <Metric
                            label="Silicon"
                            value={detail.chemistry?.silicon != null ? detail.chemistry.silicon.toFixed(2) : '—'}
                            unit="%"
                        />
                    </div>
                </Section>

                {/* 5. ASSET */}
                <Section title="ASSET">
                    <div className="v2-track-detail-asset">
                        <AssetRow label="Life cycles" value={detail.asset?.life_cycles ?? '—'} />
                        <AssetRow label="Campaign" value={detail.asset?.campaign != null ? `#${detail.asset.campaign}` : '—'} />
                        <AssetRow
                            label="Shell temp"
                            value="—"
                            unit="°C"
                            note="no sensor"
                        />
                        <AssetRow
                            label="Heel"
                            value="—"
                            unit="t"
                            note="no sensor"
                        />
                        <AssetRow
                            label="GPS battery"
                            value="—"
                            unit="%"
                            note="not in feed"
                        />
                        <AssetRow
                            label="Last report"
                            value={detail.last_report_sec != null ? `${detail.last_report_sec}` : '—'}
                            unit="s"
                        />
                    </div>
                </Section>

                {/* 6. RECENT TRIPS */}
                <Section title="RECENT TRIPS">
                    {detail.recent_trips?.length === 0 && (
                        <div className="v2-track-dim v2-track-tiny">No recent WBATNGL trips on this TLC.</div>
                    )}
                    <div className="v2-track-detail-recent">
                        {(detail.recent_trips || []).map(r => (
                            <div key={r.trip_id} className="v2-track-detail-recent-row">
                                <span className="v2-track-mono v2-track-dim">#{r.tap_no || '—'}</span>
                                <span className="v2-track-tiny">{r.source || '—'}→{r.destination || '—'}</span>
                                <span className="v2-track-mono">{r.net_wt != null ? `${r.net_wt.toFixed(1)}t` : '—'}</span>
                                <span className="v2-track-mono v2-track-dim">{r.temp != null ? `${Math.round(r.temp)}°C` : '—'}</span>
                            </div>
                        ))}
                    </div>
                </Section>
            </div>

            {/* 7. ACTION ROW */}
            <div className="v2-track-detail-footer">
                <button
                    type="button"
                    className="v2-track-btn v2-track-btn-primary"
                    onClick={() => {
                        // Inform map to center via global event — simplest cross-component
                        // signal that doesn't require lifting the map ref. PlantMap listens.
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

const Metric = ({ label, value, unit, tone }) => {
    const cls = tone === 'red' ? 'v2-track-metric v2-track-metric-red' :
                tone === 'amber' ? 'v2-track-metric v2-track-metric-amber' :
                'v2-track-metric';
    return (
        <div className={cls}>
            <div className="v2-track-metric-lbl">{label}</div>
            <div className="v2-track-metric-row">
                <span className="v2-track-metric-val">{value}</span>
                {unit && <span className="v2-track-metric-unit">{unit}</span>}
            </div>
        </div>
    );
};

const AssetRow = ({ label, value, unit, note }) => (
    <div className="v2-track-asset-row">
        <span className="v2-track-asset-lbl">{label}</span>
        <span className="v2-track-asset-val">
            <span className="v2-track-mono">{value}</span>
            {unit && <span className="v2-track-asset-unit">{unit}</span>}
            {note && (
                <span className="v2-track-asset-note" title={note}>
                    <AlertCircle size={11} />
                </span>
            )}
        </span>
    </div>
);

const FedInto = ({ heat }) => {
    /* Slim "this torpedo is currently feeding heat X" card.
       Pours-into label + the operator + grade + (eventual) yield.
       Yield is NULL until the heat completes upstream — show a
       'pouring' badge in that case instead of "—". */
    const stillPouring = heat.still_pouring;
    const labelLeft = heat.sms || 'SMS';
    const labelRight = heat.converter_no ? `Converter ${heat.converter_no}` : 'Converter ?';
    return (
        <div className="v2-track-detail-fedinto">
            <div className="v2-track-detail-trip-route">
                <div>
                    <div className="v2-track-dim v2-track-tiny">AT</div>
                    <div className="v2-track-detail-trip-node">{labelLeft}</div>
                </div>
                <ChevronRight size={14} className="v2-track-dim" />
                <div>
                    <div className="v2-track-dim v2-track-tiny">FEEDING</div>
                    <div className="v2-track-detail-trip-node">{labelRight}</div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div className="v2-track-dim v2-track-tiny">HEAT</div>
                    <div className="v2-track-mono">{heat.heat_no || '—'}</div>
                </div>
            </div>
            <div className="v2-track-detail-fedinto-meta">
                <span>
                    <span className="v2-track-dim v2-track-tiny">GRADE </span>
                    <span className="v2-track-mono">{heat.grade || '—'}</span>
                </span>
                <span>
                    <span className="v2-track-dim v2-track-tiny">SHIFT </span>
                    <span className="v2-track-mono">{heat.shift || '—'}</span>
                </span>
                <span>
                    <span className="v2-track-dim v2-track-tiny">OPR </span>
                    <span className="v2-track-mono">{heat.shift_incharge || heat.p1_operator || '—'}</span>
                </span>
                <span>
                    <span className="v2-track-dim v2-track-tiny">YIELD </span>
                    {stillPouring ? (
                        <span className="v2-track-fedinto-pouring">pouring</span>
                    ) : (
                        <span className="v2-track-mono">
                            {heat.yield_pct != null ? `${heat.yield_pct.toFixed(2)}%` : '—'}
                        </span>
                    )}
                </span>
            </div>
            <div className="v2-track-detail-fedinto-times">
                <span className="v2-track-dim v2-track-tiny">In </span>
                <span className="v2-track-mono">
                    {heat.torpedo_in_time
                        ? new Date(heat.torpedo_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                </span>
                {heat.torpedo_out_time && (
                    <>
                        {'  '}
                        <span className="v2-track-dim v2-track-tiny">Out </span>
                        <span className="v2-track-mono">
                            {new Date(heat.torpedo_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </>
                )}
                {heat.hotmetal_qty != null && (
                    <>
                        {'  '}
                        <span className="v2-track-dim v2-track-tiny">QTY </span>
                        <span className="v2-track-mono">{heat.hotmetal_qty.toFixed(1)} t</span>
                    </>
                )}
            </div>
        </div>
    );
};

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
    const headers = ['trip_id', 'tap_no', 'source', 'destination', 'net_wt', 'temp', 'updated_date'];
    const rows = detail.recent_trips.map(r => [
        r.trip_id, r.tap_no, r.source, r.destination, r.net_wt, r.temp, r.updated_date,
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
