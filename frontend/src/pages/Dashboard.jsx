import { useState, useEffect, useCallback, useMemo } from 'react'
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

const createFleetIcon = (id, status) => {
    const color = statusColor(status);
    const shortStatus = statusShort(status);
    return L.divIcon({
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
    const [isOnline, setIsOnline] = useState(false)
    const [hasCentered, setHasCentered] = useState(false)
    const [hasFittedFleet, setHasFittedFleet] = useState(false)
    const [selectedFleetId, setSelectedFleetId] = useState(null)
    const [mapStyle] = useState(localStorage.getItem('hmd_map_style') || 'road')
    const [currentTime, setCurrentTime] = useState(new Date())
    const [planningSummary, setPlanningSummary] = useState({
        summary: { total_production: 0, total_consumption: 0, net: 0 },
        individual: [],
        assignments: []
    })
    const [error, setError] = useState(null)

    const zoom = useMemo(() => parseInt(localStorage.getItem('hmd_map_zoom')) || 13, [])

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        let isMounted = true
        let pollInterval = null

        const fetchInitialData = async () => {
            if (!isMounted) return

            try {
                const [locationsData, planData, wbData] = await Promise.all([
                    api.get('/api/locations'),
                    api.get('/api/daily-plans/dashboard-summary'),
                    api.get('/api/weighbridges').catch(() => ({ success: true, data: [] }))
                ])

                if (isMounted) {
                    setLocations(Array.isArray(locationsData) ? locationsData : [])
                    setWeighbridges(wbData?.data || [])
                    setPlanningSummary(planData || {
                        summary: { total_production: 0, total_consumption: 0, net: 0 },
                        individual: [],
                        assignments: []
                    })
                    setIsOnline(true)
                    setError(null)
                }
            } catch (err) {
                console.error("Dashboard initial fetch error:", err)
                if (isMounted) {
                    setIsOnline(false)
                    setError(err.message)
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
                const [fleetData, planData] = await Promise.all([
                    api.get('/api/fleet/live'),
                    api.get('/api/daily-plans/dashboard-summary')
                ])

                if (isMounted) {
                    setFleetLocations(Array.isArray(fleetData) ? fleetData : [])
                    setPlanningSummary(planData || {
                        summary: { total_production: 0, total_consumption: 0, net: 0 },
                        individual: [],
                        assignments: []
                    })
                    setIsOnline(true)
                    setError(null)
                }
            } catch (err) {
                console.error("Dashboard poll error:", err)
                if (isMounted) {
                    setIsOnline(false)
                }
            }
        }

        fetchInitialData()

        pollInterval = setInterval(pollLiveUpdates, 5000)

        return () => {
            isMounted = false
            if (pollInterval) {
                clearInterval(pollInterval)
            }
        }
    }, [])

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
                        <Marker
                            key={`fleet-${fleet.fleet_id}`}
                            position={[fleet.x, fleet.y]}
                            icon={createFleetIcon(fleet.fleet_id, fleet.status)}
                            eventHandlers={{
                                click: () => setSelectedFleetId(fleet.fleet_id)
                            }}
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
                onClose={() => setSelectedFleetId(null)}
            />
        </div>
    );
}

export default Dashboard
