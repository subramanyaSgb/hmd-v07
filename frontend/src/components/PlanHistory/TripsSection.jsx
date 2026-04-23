import { useState } from 'react';
import { Truck, ChevronDown, ChevronRight, MapPin } from 'lucide-react'
import RouteGroup from './RouteGroup'

const TripsSection = ({ routes }) => {
    const [expandedRoutes, setExpandedRoutes] = useState(new Set());

    const handleToggleRoute = (routeKey) => {
        setExpandedRoutes(prev => {
            const next = new Set(prev);
            if (next.has(routeKey)) {
                next.delete(routeKey);
            } else {
                next.add(routeKey);
            }
            return next;
        });
    };

    const handleExpandAll = () => {
        setExpandedRoutes(new Set(routes.map(r => r.route_key)));
    };

    const handleCollapseAll = () => {
        setExpandedRoutes(new Set());
    };

    const totalTrips = routes.reduce((sum, r) => sum + r.trips.length, 0);
    const completedTrips = routes.reduce((sum, r) => sum + r.completed_trips, 0);

    return (
        <div className="trips-section">
            <div className="trips-section-header">
                <div className="trips-section-title">
                    <Truck size={16} />
                    <h4>Trips by Route</h4>
                    <span className="trips-count-badge">
                        {completedTrips} / {totalTrips} completed
                    </span>
                </div>
                <div className="trips-section-actions">
                    <button className="btn-text-sm" onClick={expandedRoutes.size === routes.length ? handleCollapseAll : handleExpandAll}>
                        {expandedRoutes.size === routes.length ? (
                            <>
                                <ChevronDown size={14} />
                                Collapse All Routes
                            </>
                        ) : (
                            <>
                                <ChevronRight size={14} />
                                Expand All Routes
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="routes-list">
                {routes.length === 0 ? (
                    <div className="routes-empty">
                        <MapPin size={32} strokeWidth={1} />
                        <span>No routes generated for this plan</span>
                    </div>
                ) : (
                    routes.map(route => (
                        <RouteGroup key={route.route_key} route={route} isExpanded={expandedRoutes.has(route.route_key)} onToggle={() => handleToggleRoute(route.route_key)} />
                    ))
                )}
            </div>
        </div>
    );
};

export default TripsSection;
