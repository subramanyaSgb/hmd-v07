import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATUS_COLORS } from './TorpedoListPanel';

/**
 * Center column of the V2 Live Tracking page.
 *
 * Reuses Leaflet from V1 — same tile system, same pan/zoom infrastructure,
 * same memoization discipline. The DIFFERENCE is purely visual:
 *
 *   - Torpedo markers are now a colored DOT + TLC number (matches design
 *     idea), NOT V1's emoji + label rectangle.
 *   - Plant nodes (stations) get labelled rectangles with kind-specific
 *     stroke color.
 *   - Track edges are dashed amber polylines between station pairs.
 *   - Selected torpedo gets a pulsing ring via CSS keyframe.
 *   - "In Transit" torpedoes draw an animated dashed line from their
 *     current position to their destination station.
 *
 * Performance: the marker DivIcons are cached by `(fleet_id, status,
 * isSelected)` so re-renders don't repaint. The marker subcomponent is
 * `React.memo`'d with custom equality. Both patterns are lifted from
 * V1's FleetMarker (tracker #34-#35) — without them, 53 markers × 5s
 * poll fries the main thread.
 */

// Default center — matches V1's DEFAULT_MAP_CENTER for visual continuity.
const DEFAULT_CENTER = [15.1750, 76.6500];
const DEFAULT_ZOOM = 14;

// Hardcoded topological connections (not geographic). These are
// permanent plant infrastructure — won't change at runtime, so no need
// for a backend endpoint.
const TRACK_EDGES = [
    ['BF-3', 'WB HMY1'], ['BF-4', 'WB HMY2'], ['BF-5', 'WB LRS1'],
    ['WB HMY1', 'YARD'], ['WB HMY2', 'YARD'], ['WB LRS1', 'YARD'],
    ['YARD', 'SMS-1'],   ['YARD', 'SMS-2'],   ['YARD', 'SMS-3'], ['YARD', 'SMS-4'],
    ['YARD', 'REPAIR'],
];

// Kind → border color for station rectangles. Matches the design idea
// palette but in V07's light-theme hues.
const STATION_COLORS = {
    bf:     '#f59e0b',
    sms:    '#3b82f6',
    wb:     '#64748b',
    yard:   '#10b981',
    repair: '#ef4444',
};

// ── Station divIcon (memoized cache) ─────────────────────────────
const _stationIconCache = new Map();
function stationIcon(node) {
    const key = `${node.id}|${node.kind}`;
    const cached = _stationIconCache.get(key);
    if (cached) return cached;
    const color = STATION_COLORS[node.kind] || '#64748b';
    const big = node.kind === 'bf' || node.kind === 'sms';
    const width = big ? 66 : node.kind === 'yard' ? 80 : 56;
    const height = big ? 22 : 20;
    const labelText = node.kind === 'wb'
        ? node.id.replace('_', ' ')
        : (node.id || node.label || '?');
    const icon = L.divIcon({
        html: `
            <div class="v2-track-station" style="
                width: ${width}px;
                height: ${height}px;
                border: 1.5px solid ${color};
                color: #fff;
                background: rgba(8, 14, 24, 0.78);
            ">
                <span style="font-size: 10.5px; font-weight: 700; letter-spacing: 0.04em;">${labelText}</span>
            </div>`,
        className: 'v2-track-station-wrap',
        iconSize: [width, height],
        iconAnchor: [width / 2, height / 2],
    });
    _stationIconCache.set(key, icon);
    return icon;
}

// ── Torpedo divIcon (memoized cache) ─────────────────────────────
const _torpedoIconCache = new Map();
function torpedoIcon(fleetId, derivedStatus, isSelected) {
    const key = `${fleetId}|${derivedStatus}|${isSelected ? 1 : 0}`;
    const cached = _torpedoIconCache.get(key);
    if (cached) return cached;
    const color = STATUS_COLORS[derivedStatus] || '#94a3b8';
    const numberOnly = (fleetId || '').replace(/^TLC[-\s]?/i, '');
    const moving = derivedStatus === 'In Transit' || derivedStatus === 'Loading';
    const pulseHtml = isSelected
        ? `<div class="v2-track-pulse" style="border-color: ${color};"></div>`
        : '';
    const haloHtml = moving
        ? `<div class="v2-track-halo" style="background: ${color};"></div>`
        : '';
    const icon = L.divIcon({
        html: `
            <div class="v2-track-torpedo-marker">
                <div class="v2-track-tlc-label" style="text-shadow: 0 1px 3px rgba(0,0,0,0.9);">${numberOnly}</div>
                ${pulseHtml}
                ${haloHtml}
                <div class="v2-track-torpedo-dot" style="background: ${color};"></div>
            </div>`,
        className: 'v2-track-torpedo-marker-wrap',
        iconSize: [24, 32],
        iconAnchor: [12, 16],
    });
    _torpedoIconCache.set(key, icon);
    return icon;
}

// ── Memoized marker subcomponent (pattern from V1 FleetMarker) ───
const TorpedoMarker = memo(
    function TorpedoMarker({ t, isSelected, onClick }) {
        const icon = useMemo(
            () => torpedoIcon(t.fleet_id, t.derived_status, isSelected),
            [t.fleet_id, t.derived_status, isSelected]
        );
        const position = useMemo(() => [t.lat, t.lon], [t.lat, t.lon]);
        const handleClick = useCallback(() => onClick(t.fleet_id), [onClick, t.fleet_id]);
        const eventHandlers = useMemo(() => ({ click: handleClick }), [handleClick]);
        return <Marker position={position} icon={icon} eventHandlers={eventHandlers} />;
    },
    (prev, next) =>
        prev.onClick === next.onClick &&
        prev.isSelected === next.isSelected &&
        prev.t.fleet_id === next.t.fleet_id &&
        prev.t.lat === next.t.lat &&
        prev.t.lon === next.t.lon &&
        prev.t.derived_status === next.t.derived_status
);

const StationMarker = memo(
    function StationMarker({ node }) {
        const icon = useMemo(() => stationIcon(node), [node.id, node.kind]);
        const position = useMemo(() => [node.lat, node.lon], [node.lat, node.lon]);
        return <Marker position={position} icon={icon} interactive={false} />;
    },
    (prev, next) =>
        prev.node.id === next.node.id &&
        prev.node.lat === next.node.lat &&
        prev.node.lon === next.node.lon
);

/**
 * Calls map.invalidateSize() whenever the parent grid morphs (panel
 * opens/closes). Leaflet caches container dimensions internally and
 * doesn't notice CSS-driven width changes on its own — without this,
 * tiles + markers stretch awkwardly.
 */
const InvalidateOnResize = ({ panelOpen }) => {
    const map = useMap();
    useEffect(() => {
        // CSS transition is 300ms — wait it out, then refresh layout.
        const id = setTimeout(() => map.invalidateSize(), 320);
        return () => clearTimeout(id);
    }, [panelOpen, map]);
    return null;
};

/**
 * Listens for the global "Center on map" event fired by the detail
 * panel's button. Uses a window-level CustomEvent to avoid threading a
 * map ref up through props (the map instance lives inside the
 * MapContainer's render tree, and we only need a one-shot pan).
 */
const CenterMapListener = () => {
    const map = useMap();
    useEffect(() => {
        const handler = (e) => {
            const { lat, lon } = e.detail || {};
            if (typeof lat === 'number' && typeof lon === 'number') {
                map.flyTo([lat, lon], Math.max(map.getZoom(), 16), {
                    animate: true,
                    duration: 0.7,
                });
            }
        };
        window.addEventListener('v2track:centerMap', handler);
        return () => window.removeEventListener('v2track:centerMap', handler);
    }, [map]);
    return null;
};

const PlantMap = ({
    torpedoes,
    allTorpedoes,
    plantNodes,
    selectedFleetId,
    onSelect,
    panelOpen,
}) => {
    // Build a lookup of plant nodes by id for transit-line endpoint
    // resolution. Matched loosely so backend `consumer_id` like 'SMS-2'
    // or 'SMS2' both resolve.
    const nodeById = useMemo(() => {
        const map = new Map();
        for (const n of plantNodes) {
            map.set(n.id, n);
            // Also index by collapsed-dash form so 'SMS-2' resolves 'SMS2'
            map.set(n.id.replace('-', ''), n);
        }
        return map;
    }, [plantNodes]);

    // Render torpedoes with valid coords
    const torpedoesWithCoords = useMemo(
        () => torpedoes.filter(t => t.lat != null && t.lon != null),
        [torpedoes]
    );

    // In-transit lines: each torpedo with derived_status='In Transit' →
    // dashed polyline from torpedo's current position to its destination
    // station. Skipped if destination can't be resolved to a known node.
    const transitLines = useMemo(() => {
        const lines = [];
        for (const t of torpedoesWithCoords) {
            if (t.derived_status !== 'In Transit') continue;
            if (!t.destination) continue;
            const node = nodeById.get(t.destination)
                || nodeById.get(t.destination.replace('-', ''));
            if (!node) continue;
            lines.push({
                key: t.fleet_id,
                positions: [[t.lat, t.lon], [node.lat, node.lon]],
                color: STATUS_COLORS['In Transit'],
            });
        }
        return lines;
    }, [torpedoesWithCoords, nodeById]);

    // Track edges between stations
    const trackEdgesResolved = useMemo(() => {
        const edges = [];
        for (const [a, b] of TRACK_EDGES) {
            const na = nodeById.get(a) || nodeById.get(a.replace('-', ''));
            const nb = nodeById.get(b) || nodeById.get(b.replace('-', ''));
            if (!na || !nb) continue;
            edges.push({
                key: `${a}__${b}`,
                positions: [[na.lat, na.lon], [nb.lat, nb.lon]],
            });
        }
        return edges;
    }, [nodeById]);

    const tileLayerUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

    // Top-right stats — count by derived_status
    const stats = useMemo(() => {
        const out = { Loading: 0, 'In Transit': 0, 'At SMS': 0 };
        for (const t of allTorpedoes || []) {
            if (out[t.derived_status] != null) out[t.derived_status] += 1;
        }
        return out;
    }, [allTorpedoes]);

    return (
        <div className="v2-track-card v2-track-map-card">
            <div className="v2-track-card-h">
                <h3>Plant Schematic</h3>
                <span className="v2-track-sub">
                    JSW Vijaynagar · Hot Metal Track
                </span>
            </div>
            <div className="v2-track-map-body">
                <MapContainer
                    center={DEFAULT_CENTER}
                    zoom={DEFAULT_ZOOM}
                    style={{ width: '100%', height: '100%' }}
                    preferCanvas={false}
                    zoomControl={true}
                    attributionControl={false}
                >
                    <TileLayer
                        url={tileLayerUrl}
                        attribution="Imagery © Esri · World Imagery"
                    />
                    <InvalidateOnResize panelOpen={panelOpen} />
                    <CenterMapListener />

                    {/* Dashed track edges between stations */}
                    {trackEdgesResolved.map(e => (
                        <Polyline
                            key={e.key}
                            positions={e.positions}
                            pathOptions={{
                                color: '#f59e0b',
                                weight: 2,
                                opacity: 0.55,
                                dashArray: '6 5',
                            }}
                        />
                    ))}

                    {/* Animated in-transit lines */}
                    {transitLines.map(l => (
                        <Polyline
                            key={`tx-${l.key}`}
                            positions={l.positions}
                            pathOptions={{
                                color: l.color,
                                weight: 2,
                                opacity: 0.85,
                                dashArray: '4 4',
                                className: 'v2-track-transit-line',
                            }}
                        />
                    ))}

                    {/* Station markers */}
                    {plantNodes.map(n => (
                        <StationMarker key={n.id} node={n} />
                    ))}

                    {/* Torpedo markers */}
                    {torpedoesWithCoords.map(t => (
                        <TorpedoMarker
                            key={t.fleet_id}
                            t={t}
                            isSelected={t.fleet_id === selectedFleetId}
                            onClick={onSelect}
                        />
                    ))}
                </MapContainer>

                {/* Top-right live stats card */}
                <div className="v2-track-mapstats">
                    <Stat n={stats.Loading} label="Loading" color={STATUS_COLORS.Loading} />
                    <Stat n={stats['In Transit']} label="In Transit" color={STATUS_COLORS['In Transit']} />
                    <Stat n={stats['At SMS']} label="At SMS" color={STATUS_COLORS['At SMS']} />
                    <div className="v2-track-mapstats-live">
                        <span className="v2-track-live-dot" />
                        <span className="v2-track-live-text">Live · 5s</span>
                    </div>
                </div>

                {/* Bottom-left station legend */}
                <div className="v2-track-maplegend">
                    <div className="v2-track-maplegend-h">STATIONS</div>
                    {Object.entries(STATION_COLORS).map(([k, c]) => (
                        <div className="v2-track-maplegend-row" key={k}>
                            <span className="v2-track-maplegend-bar" style={{ background: c }} />
                            <span className="v2-track-maplegend-lbl">
                                {k === 'bf' ? 'BF' : k === 'sms' ? 'SMS' : k === 'wb' ? 'WB' : k.charAt(0).toUpperCase() + k.slice(1)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const Stat = ({ n, label, color }) => (
    <div className="v2-track-stat">
        <div className="v2-track-stat-num" style={{ color }}>{n}</div>
        <div className="v2-track-stat-lbl">{label}</div>
    </div>
);

export default PlantMap;
