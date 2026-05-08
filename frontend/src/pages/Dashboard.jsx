import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import { useMap, MapContainer, TileLayer, Marker, Popup, ZoomControl } from 'react-leaflet'
import { api } from '../utils/api'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import producerIcon from '../assets/producer_icon.png'
import consumerIcon from '../assets/consumer.png'
import wbridgeIcon from '../assets/wbridge.jpg'
import { statusColor, statusShort } from '../utils/torpedoStatus'
import TorpedoDrawer from '../components/TorpedoDrawer'

const shortenName = (name) => {
    if (!name) return "";
    const lowerName = name.toLowerCase();

    if (lowerName.includes("blast furnace")) {
        const match = name.match(/\d+/);
        return match ? `BF${match[0]}` : "BF";
    }

    if (lowerName.includes("corex")) {
        const match = name.match(/\d+/);
        return match ? `CX${match[0]}` : "CX";
    }

    if (name.length > 8) {
        return name.split(' ').map(sub => sub[0]).join('').toUpperCase();
    }
    return name;
}

const createMarkerIcon = (name, status, type) => {
    const shortName = shortenName(name);
    const statusColors = {
        'Operating': type === 'producer' ? 'hsl(var(--accent))' : 'hsl(var(--success))',
        'Maintenance': 'hsl(var(--warning))',
        'Shutdown': '#9CA3AF'
    };
    const statusColor = statusColors[status] || 'hsl(var(--success))';

    const isShutdown = status === 'Shutdown';
    const iconOpacity = isShutdown ? 0.4 : 1;
    const iconFilter = isShutdown
        ? 'drop-shadow(0 3px 6px rgba(0,0,0,0.15)) grayscale(100%) blur(0.5px)'
        : 'drop-shadow(0 3px 6px rgba(0,0,0,0.15))';

    const iconContent = type === 'producer'
        ? `<img src="${producerIcon}" style="width: 32px; height: 32px; filter: ${iconFilter}; opacity: ${iconOpacity};" />`
        : `<img src="${consumerIcon}" style="width: 32px; height: 32px; filter: ${iconFilter}; opacity: ${iconOpacity};" />`;

    return L.divIcon({
        html: `
            <div style="display: flex; flex-direction: column; align-items: center;">
                <div style="
                    background: ${statusColor};
                    min-width: 44px;
                    text-align: center;
                    padding: 2px 4px;
                    border-radius: 4px;
                    font-weight: 900;
                    font-size: 10px;
                    color: white;
                    box-shadow: 0 4px 8px -2px ${statusColor}60;
                    border: 1px solid ${isShutdown ? '#D1D5DB' : 'white'};
                    margin-bottom: 2px;
                    white-space: nowrap;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    letter-spacing: 0.01em;
                    opacity: ${isShutdown ? 0.6 : 1};
                    filter: ${isShutdown ? 'blur(0.3px)' : 'none'};
                ">
                    ${shortName}
                </div>
                ${iconContent}
            </div>`,
        className: 'custom-marker',
        iconSize: [44, 60],
        iconAnchor: [22, 60],
        popupAnchor: [0, -40]
    });
}

// Cache divIcon instances by (id, status). Bounded by ~fleet_count × status_count
// (~53 × 5 = 265 entries max). Critical: returning the SAME L.divIcon reference
// for the same (id, status) means react-leaflet's icon-prop effect short-circuits
// and we avoid replacing 53 marker DOM nodes on every Dashboard render.
const _fleetIconCache = new Map();
const createFleetIcon = (id, status) => {
    const cacheKey = `${id}|${status || ''}`;
    const cached = _fleetIconCache.get(cacheKey);
    if (cached) return cached;
    const color = statusColor(status);
    const shortStatus = statusShort(status);
    const icon = L.divIcon({
        html: `
            <div style="display: flex; flex-direction: column; align-items: center;">
                <div style="
                    background: ${color};
                    min-width: 60px;
                    text-align: center;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-weight: 900;
                    font-size: 10px;
                    color: white;
                    box-shadow: 0 4px 8px ${color}80;
                    border: 1.5px solid white;
                    margin-bottom: 2px;
                    white-space: nowrap;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    letter-spacing: 0.01em;
                ">${id} · ${shortStatus}</div>
                <div style="
                    font-size: 30px;
                    filter: drop-shadow(0 4px 8px ${color}cc);
                    line-height: 1;
                ">🚂</div>
            </div>`,
        className: 'custom-fleet-marker',
        iconSize: [70, 50],
        iconAnchor: [35, 45],
        popupAnchor: [0, -40]
    });
    _fleetIconCache.set(cacheKey, icon);
    return icon;
}

const createWeighbridgeIcon = (name, status) => {
    const isShutdown = status === 'Shutdown';
    const isMaintenance = status === 'Maintenance';
    const bgColor = isShutdown ? '#9CA3AF' : isMaintenance ? '#f59e0b' : '#8b5cf6';
    const opacity = isShutdown ? 0.5 : 1;

    return L.divIcon({
        html: `
            <div style="display: flex; flex-direction: column; align-items: center; opacity: ${opacity};">
                <div style="
                    background: ${bgColor};
                    min-width: 44px;
                    text-align: center;
                    padding: 2px 4px;
                    border-radius: 4px;
                    font-weight: 900;
                    font-size: 10px;
                    color: white;
                    box-shadow: 0 4px 8px -2px ${bgColor}60;
                    border: 1px solid ${isShutdown ? '#D1D5DB' : 'white'};
                    margin-bottom: 2px;
                    white-space: nowrap;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    letter-spacing: 0.01em;
                ">${name}</div>
                <img src="${wbridgeIcon}" style="
                    width: 28px;
                    height: 28px;
                    object-fit: contain;
                    mix-blend-mode: multiply;
                    filter: drop-shadow(0 3px 6px rgba(0,0,0,0.15));
                " />
            </div>`,
        className: 'custom-marker',
        iconSize: [44, 50],
        iconAnchor: [22, 50],
        popupAnchor: [0, -35]
    });
}

// Memoized torpedo marker — keeps the icon + position references stable when a
// torpedo's data hasn't changed across polls, so react-leaflet skips setIcon /
// setLatLng (each of which replaces / re-transforms DOM). Without this memo,
// 53 torpedoes × every Dashboard render = 53 marker DOM rebuilds, which blew
// past the main-thread budget once SuVeechi started feeding 53 live fleets.
const FleetMarker = memo(
    ({ fleet, onClick }) => {
        const icon = useMemo(
            () => createFleetIcon(fleet.fleet_id, fleet.status),
            [fleet.fleet_id, fleet.status]
        )
        const position = useMemo(() => [fleet.x, fleet.y], [fleet.x, fleet.y])
        const handleClick = useCallback(
            () => onClick(fleet.fleet_id),
            [onClick, fleet.fleet_id]
        )
        const eventHandlers = useMemo(() => ({ click: handleClick }), [handleClick])
        return <Marker position={position} icon={icon} eventHandlers={eventHandlers} />
    },
    (prev, next) =>
        prev.onClick === next.onClick &&
        prev.fleet.fleet_id === next.fleet.fleet_id &&
        prev.fleet.x === next.fleet.x &&
        prev.fleet.y === next.fleet.y &&
        prev.fleet.status === next.fleet.status
)

const ChangeView = ({ center, hasCentered, onCentered }) => {
    const map = useMap()

    useEffect(() => {
        if (map.zoomControl) {
            map.zoomControl.remove()
        }
    }, [map])

    useEffect(() => {
        if (center && !hasCentered) {
            const zoom = parseInt(localStorage.getItem('hmd_map_zoom')) || 13
            map.setView(center, zoom)
            onCentered()
        }
    }, [center, map, hasCentered, onCentered])

    return null
}

// Fit map bounds to all torpedoes once on first non-empty load.
const FitBoundsOnFleet = ({ fleetLocations, hasFitted, onFitted }) => {
    const map = useMap()
    useEffect(() => {
        if (hasFitted) return
        if (!Array.isArray(fleetLocations) || fleetLocations.length === 0) return
        const points = fleetLocations
            .filter(f => typeof f.x === 'number' && typeof f.y === 'number')
            .map(f => [f.x, f.y])
        if (points.length === 0) return
        try {
            const bounds = L.latLngBounds(points)
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 })
            onFitted()
        } catch (err) {
            console.warn('fitBounds failed:', err)
        }
    }, [fleetLocations, hasFitted, map, onFitted])
    return null
}

const DEFAULT_MAP_CENTER = (() => {
    const envCenter = import.meta.env.VITE_MAP_CENTER;
    if (envCenter) {
        const [lat, lng] = envCenter.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
    }
    return [15.1834, 76.6715];
})();

const Dashboard = () => {
    const [locations, setLocations] = useState([])
    const [fleetLocations, setFleetLocations] = useState([])
    const [weighbridges, setWeighbridges] = useState([])
    const [loading, setLoading] = useState(true)
    // Tracks whether /api/fleet/live has returned at least once since this
    // mount. Without it, navigating away and back left the user staring at
    // an empty map + "TOTAL 0" counter for ~5 seconds (the setInterval delay)
    // — looked broken even though the GPS sync was healthy. (SMS4 UX
    // regression flagged 2026-05-08.)
    const [fleetLoaded, setFleetLoaded] = useState(false)
    const [isOnline, setIsOnline] = useState(false)
    const [hasCentered, setHasCentered] = useState(false)
    const [hasFittedFleet, setHasFittedFleet] = useState(false)
    const [selectedFleetId, setSelectedFleetId] = useState(null)
    const [mapStyle] = useState(localStorage.getItem('hmd_map_style') || 'road')
    const [showTorpedoLegend, setShowTorpedoLegend] = useState(
        localStorage.getItem('hmd_show_torpedo_legend') !== 'false'
    )

    const zoom = useMemo(() => parseInt(localStorage.getItem('hmd_map_zoom')) || 13, [])

    // React to live changes from Settings (so user sees the toggle effect immediately
    // without a page refresh). Settings page dispatches hmd:settings-changed.
    useEffect(() => {
        const onChange = (e) => {
            if (e?.detail?.key === 'hmd_show_torpedo_legend') {
                setShowTorpedoLegend(Boolean(e.detail.value))
            }
        }
        window.addEventListener('hmd:settings-changed', onChange)
        return () => window.removeEventListener('hmd:settings-changed', onChange)
    }, [])

    useEffect(() => {
        let isMounted = true
        let pollInterval = null

        const fetchInitialData = async () => {
            if (!isMounted) return

            try {
                const [locationsData, wbData] = await Promise.all([
                    api.get('/api/locations'),
                    api.get('/api/weighbridges').catch(() => ({ success: true, data: [] }))
                ])

                if (isMounted) {
                    setLocations(Array.isArray(locationsData) ? locationsData : [])
                    setWeighbridges(wbData?.data || [])
                    setIsOnline(true)
                }
            } catch (err) {
                console.error("Dashboard initial fetch error:", err)
                if (isMounted) {
                    setIsOnline(false)
                }
            } finally {
                if (isMounted) {
                    setLoading(false)
                }
            }
        }

        const pollLiveUpdates = async () => {
            if (!isMounted) return

            try {
                const fleetData = await api.get('/api/fleet/live')
                if (isMounted) {
                    // Defensive dedupe by fleet_id: keep the row with the newest
                    // last_updated (or highest id as tiebreaker) — we should never
                    // render two markers for the same torpedo.
                    const arr = Array.isArray(fleetData) ? fleetData : []
                    const byId = new Map()
                    for (const row of arr) {
                        if (!row || !row.fleet_id) continue
                        const existing = byId.get(row.fleet_id)
                        if (!existing) {
                            byId.set(row.fleet_id, row)
                            continue
                        }
                        const a = existing.last_updated || ''
                        const b = row.last_updated || ''
                        if (b > a || (b === a && (row.id || 0) > (existing.id || 0))) {
                            byId.set(row.fleet_id, row)
                        }
                    }
                    setFleetLocations(Array.from(byId.values()))
                    setIsOnline(true)
                    // First successful response — flip the loading pill off.
                    // Subsequent ticks just update positions without UI flicker.
                    setFleetLoaded(true)
                }
            } catch (err) {
                console.error("Dashboard poll error:", err)
                if (isMounted) {
                    setIsOnline(false)
                }
            }
        }

        fetchInitialData()
        // Kick off the first /api/fleet/live request immediately so the user
        // doesn't stare at an empty map for the full 5-second interval gap
        // every time they navigate to the Live Tracking page.
        pollLiveUpdates()

        pollInterval = setInterval(pollLiveUpdates, 5000)

        return () => {
            isMounted = false
            if (pollInterval) {
                clearInterval(pollInterval)
            }
        }
    }, [])

    const handleFleetClick = useCallback(fleetId => setSelectedFleetId(fleetId), [])
    const handleDrawerClose = useCallback(() => setSelectedFleetId(null), [])

    const getMapCenter = useCallback(() => {
        if (locations.length > 0 && locations[0].x && locations[0].y) {
            return [locations[0].x, locations[0].y]
        }
        return DEFAULT_MAP_CENTER
    }, [locations])

    const handleCentered = useCallback(() => {
        setHasCentered(true)
    }, [])

    const visibleLocations = useMemo(() => {
        return locations.filter(loc => loc.is_visible)
    }, [locations])

    // Bucket torpedoes for the legend. Maps SuVeechi vocab (Idle/Moving/Ign Off)
    // and HMD vocab (Operating/Assigned/Maintenance) to a single set of buckets.
    const torpedoBuckets = useMemo(() => {
        const buckets = {
            total: fleetLocations.length,
            idle: 0,      // Idle, Operating
            moving: 0,    // Moving
            assigned: 0,  // Assigned (in active trip)
            maintenance: 0, // Maintenance, Ign Off
            unknown: 0,
        }
        for (const f of fleetLocations) {
            const s = f?.status
            if (s === 'Moving') buckets.moving += 1
            else if (s === 'Assigned') buckets.assigned += 1
            else if (s === 'Maintenance' || s === 'Ign Off') buckets.maintenance += 1
            else if (s === 'Operating' || s === 'Idle') buckets.idle += 1
            else buckets.unknown += 1
        }
        return buckets
    }, [fleetLocations])

    if (loading) {
        return (
            <div className="premium-page-container dashboard-wrapper">
                <div className="premium-card dashboard-map-card">
                    <div style={{
                        display: 'flex',
                        height: '100%',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'hsl(var(--main-bg) / 0.5)'
                    }}>
                        <p style={{ color: 'hsl(var(--text-muted))', fontWeight: 700 }}>
                            INITIALIZING GEOSPATIAL ENGINE...
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    const legendChip = (label, value, color) => (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '2px',
            padding: '0 10px',
            borderLeft: `3px solid ${color}`,
        }}>
            <span style={{
                fontSize: '0.62rem',
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'hsl(var(--text-muted))',
            }}>{label}</span>
            <span style={{
                fontSize: '1.05rem',
                fontWeight: 800,
                color: color,
                lineHeight: 1.05,
                fontFamily: 'Space Grotesk, sans-serif',
            }}>{value}</span>
        </div>
    )

    return (
        <div className="dashboard-wrapper">
            <div className="dashboard-overlay-top">
                <div className="overlay-glass-box">
                    <h3 className="space-grotesk" style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'hsl(var(--primary))' }}>
                        Real-Time Tracking
                    </h3>
                </div>

                <div className="overlay-glass-box" style={{ display: 'flex', gap: '24px' }}>
                    <div className="overlay-legend-item">
                        <div style={{ width: '8px', height: '8px', background: 'hsl(var(--accent))', borderRadius: '50%', boxShadow: '0 0 8px hsl(var(--accent) / 0.5)' }} />
                        <span>PRODUCER</span>
                    </div>
                    <div className="overlay-legend-item">
                        <div style={{ width: '8px', height: '8px', background: 'hsl(var(--success))', borderRadius: '50%', boxShadow: '0 0 8px hsl(var(--success) / 0.5)' }} />
                        <span>CONSUMER</span>
                    </div>
                    <div className="overlay-legend-item">
                        <div style={{ width: '8px', height: '8px', background: '#8b5cf6', borderRadius: '50%', boxShadow: '0 0 8px rgba(139,92,246,0.5)' }} />
                        <span>WEIGHBRIDGE</span>
                    </div>
                </div>
            </div>

            {showTorpedoLegend && !fleetLoaded && (
                <div
                    className="overlay-glass-box"
                    style={{
                        position: 'absolute',
                        bottom: '24px',
                        left: '24px',
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        pointerEvents: 'auto',
                        padding: '12px 18px',
                    }}
                    aria-label="Locating torpedoes"
                    aria-live="polite"
                >
                    <div
                        style={{
                            width: '14px', height: '14px',
                            border: '2px solid hsl(var(--border-color))',
                            borderTopColor: 'hsl(var(--primary))',
                            borderRadius: '50%',
                            animation: 'hmd-spin 0.8s linear infinite',
                        }}
                    />
                    <span style={{
                        fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em',
                        textTransform: 'uppercase', color: 'hsl(var(--text-muted))',
                    }}>
                        Locating torpedoes…
                    </span>
                    <style>{`
                        @keyframes hmd-spin {
                            to { transform: rotate(360deg); }
                        }
                    `}</style>
                </div>
            )}

            {showTorpedoLegend && fleetLoaded && (
                <div
                    className="overlay-glass-box"
                    style={{
                        position: 'absolute',
                        bottom: '24px',
                        left: '24px',
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        pointerEvents: 'auto',
                        padding: '10px 8px 10px 14px',
                    }}
                    aria-label="Torpedo status legend"
                >
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        gap: '2px',
                        padding: '0 14px 0 0',
                        borderRight: '1px solid hsl(var(--border-color))',
                        marginRight: '4px',
                    }}>
                        <span style={{
                            fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.06em',
                            textTransform: 'uppercase', color: 'hsl(var(--text-muted))',
                        }}>Total</span>
                        <span style={{
                            fontSize: '1.25rem', fontWeight: 800,
                            color: 'hsl(var(--primary))', lineHeight: 1.05,
                            fontFamily: 'Space Grotesk, sans-serif',
                        }}>{torpedoBuckets.total}</span>
                    </div>
                    {legendChip('Idle', torpedoBuckets.idle, statusColor('Operating'))}
                    {legendChip('Moving', torpedoBuckets.moving, statusColor('Moving'))}
                    {legendChip('Trip', torpedoBuckets.assigned, statusColor('Assigned'))}
                    {legendChip('Maint', torpedoBuckets.maintenance, statusColor('Maintenance'))}
                    {torpedoBuckets.unknown > 0 &&
                        legendChip('?', torpedoBuckets.unknown, '#94a3b8')}
                </div>
            )}

            <div className="dashboard-map-container">
                <MapContainer center={getMapCenter()} zoom={zoom} style={{ height: '100%', width: '100%' }} zoomControl={false} attributionControl={false}>
                    <ZoomControl position="topright" />
                    <ChangeView center={getMapCenter()} hasCentered={hasCentered} onCentered={handleCentered} />
                    <FitBoundsOnFleet
                        fleetLocations={fleetLocations}
                        hasFitted={hasFittedFleet}
                        onFitted={() => setHasFittedFleet(true)}
                    />

                    {mapStyle === 'road' ? (
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    ) : (
                        <TileLayer
                            attribution='Tiles &copy; Esri'
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        />
                    )}

                    {visibleLocations.map(loc => (
                        <Marker key={`loc-${loc.id}`} position={[loc.x, loc.y]} icon={createMarkerIcon(loc.location_name, loc.status, loc.type)}>
                            <Popup>
                                <div style={{
                                    fontWeight: 800,
                                    fontSize: '0.9rem',
                                    marginBottom: '4px',
                                    color: 'hsl(var(--primary))'
                                }}>
                                    {loc.location_name}
                                </div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    textTransform: 'uppercase',
                                    color: 'hsl(var(--text-muted))',
                                    fontSize: '0.7rem',
                                    fontWeight: 700
                                }}>
                                    <div style={{
                                        width: '6px',
                                        height: '6px',
                                        borderRadius: '50%',
                                        background: loc.type === 'producer'
                                            ? 'hsl(var(--accent))'
                                            : 'hsl(var(--success))'
                                    }} />
                                    {loc.type} NODE
                                </div>
                                <div style={{
                                    marginTop: '8px',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    background: loc.status === 'Operating'
                                        ? 'hsl(var(--success) / 0.1)'
                                        : loc.status === 'Maintenance'
                                            ? 'hsl(var(--warning) / 0.1)'
                                            : 'rgba(0,0,0,0.1)',
                                    color: loc.status === 'Operating'
                                        ? 'hsl(var(--success))'
                                        : loc.status === 'Maintenance'
                                            ? 'hsl(var(--warning))'
                                            : '#000000',
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    textAlign: 'center'
                                }}>
                                    {loc.status?.toUpperCase() || 'OPERATING'}
                                </div>
                            </Popup>
                        </Marker>
                    ))}

                    {isOnline && fleetLocations.map(fleet => (
                        <FleetMarker
                            key={`fleet-${fleet.fleet_id}`}
                            fleet={fleet}
                            onClick={handleFleetClick}
                        />
                    ))}

                    {weighbridges.filter(wb => wb.x && wb.y && wb.is_active).map(wb => (
                        <Marker key={`wb-${wb.id}`} position={[wb.x, wb.y]} icon={createWeighbridgeIcon(wb.name, wb.status)}>
                            <Popup>
                                <div style={{ fontWeight: 800, fontSize: '0.9rem', marginBottom: '4px', color: '#8b5cf6' }}>
                                    {wb.location_name || wb.name}
                                </div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    textTransform: 'uppercase',
                                    color: 'hsl(var(--text-muted))',
                                    fontSize: '0.7rem',
                                    fontWeight: 700
                                }}>
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8b5cf6' }} />
                                    WEIGHBRIDGE
                                </div>
                                <div style={{
                                    marginTop: '8px',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    background: wb.status === 'Operating'
                                        ? 'rgba(139,92,246,0.1)'
                                        : wb.status === 'Maintenance'
                                            ? 'hsl(var(--warning) / 0.1)'
                                            : 'rgba(0,0,0,0.1)',
                                    color: wb.status === 'Operating'
                                        ? '#8b5cf6'
                                        : wb.status === 'Maintenance'
                                            ? 'hsl(var(--warning))'
                                            : '#9CA3AF',
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    textAlign: 'center'
                                }}>
                                    {wb.status?.toUpperCase()}
                                </div>
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
                {!isOnline && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'var(--glass-bg)',
                        backdropFilter: 'grayscale(1) blur(4px)',
                        zIndex: 999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none'
                    }}>
                        <div
                            role="alert"
                            style={{
                                background: 'hsl(var(--danger))',
                                color: 'white',
                                padding: '16px 32px',
                                borderRadius: '16px',
                                boxShadow: '0 20px 40px hsl(var(--danger) / 0.2)',
                                fontWeight: 800,
                                fontSize: '0.9rem'
                            }}
                        >
                            SERVER DISCONNECTED : VERIFY BACKEND STATE
                        </div>
                    </div>
                )}
            </div>

            <TorpedoDrawer
                fleetId={selectedFleetId}
                onClose={handleDrawerClose}
            />
        </div>
    );
}

export default Dashboard
