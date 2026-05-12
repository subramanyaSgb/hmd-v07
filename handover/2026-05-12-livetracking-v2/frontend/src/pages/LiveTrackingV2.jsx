import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../utils/api';
import TorpedoListPanel from '../components/LiveTrackingV2/TorpedoListPanel';
import PlantMap from '../components/LiveTrackingV2/PlantMap';
import TorpedoDetailPanel from '../components/LiveTrackingV2/TorpedoDetailPanel';
import '../components/LiveTrackingV2/LiveTrackingV2.css';

/**
 * Version 2 Live Tracking — 3-column container.
 *
 * Layout (CSS grid in LiveTrackingV2.css):
 *   - No torpedo selected:    [List 270px] [Map 1fr]
 *   - Torpedo selected:       [List 270px] [Map 1fr] [Detail 360px]
 *
 * State lives here so the list, map, and detail panel all see the same
 * `torpedoes` snapshot (avoids two children both fetching /torpedoes).
 * The 5-second master tick is also rooted here.
 *
 * Reuses Leaflet from V1 — no new map engine. Adds design-idea visuals
 * (labelled station rectangles, dashed track edges, dot+number torpedo
 * markers, pulsing ring for selected, animated transit lines) ON TOP.
 *
 * Design doc: docs/plans/2026-05-12-livetracking-v2-design.md
 */
const REFRESH_MS = 5_000;

const LiveTrackingV2 = () => {
    // selectedFleetId === null  →  detail panel hidden, map expands.
    // setting it non-null       →  panel slides in.
    // re-clicking same id       →  no-op (user spec — Q3 answer 2 = a).
    const [selectedFleetId, setSelectedFleetId] = useState(null);
    const [filter, setFilter] = useState('All');
    const [search, setSearch] = useState('');
    const [tick, setTick] = useState(0);

    const [torpedoes, setTorpedoes] = useState([]);
    const [plantNodes, setPlantNodes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Refs guard against overlapping fetches (slow Oracle round-trip
    // shouldn't kick off a second poll if the previous one hasn't
    // returned yet).
    const inflightTorpedoesRef = useRef(false);
    const inflightNodesRef = useRef(false);

    // ── Master 5s tick ──────────────────────────────────────────
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), REFRESH_MS);
        return () => clearInterval(id);
    }, []);

    // ── /torpedoes — every tick ─────────────────────────────────
    useEffect(() => {
        if (inflightTorpedoesRef.current) return;
        inflightTorpedoesRef.current = true;
        api.get('/api/tracking/v2/torpedoes')
            .then(resp => {
                setTorpedoes(resp?.torpedoes || []);
                setLoading(false);
                setError(null);
            })
            .catch(err => {
                setError(err);
                setLoading(false);
            })
            .finally(() => {
                inflightTorpedoesRef.current = false;
            });
    }, [tick]);

    // ── /plant-nodes — once on mount ────────────────────────────
    useEffect(() => {
        if (inflightNodesRef.current) return;
        inflightNodesRef.current = true;
        api.get('/api/tracking/v2/plant-nodes')
            .then(resp => setPlantNodes(resp?.nodes || []))
            .catch(() => { /* node coords are static, errors non-fatal */ })
            .finally(() => { inflightNodesRef.current = false; });
    }, []);

    // ── Derived: filtered list for the left panel ───────────────
    const filteredTorpedoes = useMemo(() => {
        const q = search.trim().toLowerCase();
        return torpedoes.filter(t => {
            if (filter !== 'All' && t.derived_status !== filter) return false;
            if (q) {
                const fid = (t.fleet_id || '').toLowerCase();
                const loc = (t.location_text || '').toLowerCase();
                if (!fid.includes(q) && !loc.includes(q)) return false;
            }
            return true;
        });
    }, [torpedoes, filter, search]);

    // Stable handler — passed to memoized children. Re-clicking the
    // same fleet_id is a no-op per spec.
    const handleSelect = React.useCallback((fleetId) => {
        if (!fleetId) return;
        setSelectedFleetId(prev => (prev === fleetId ? prev : fleetId));
    }, []);

    const handleClose = React.useCallback(() => {
        setSelectedFleetId(null);
    }, []);

    const panelOpen = selectedFleetId !== null;

    return (
        <div className={`v2-tracking ${panelOpen ? 'panel-open' : ''}`}>
            <TorpedoListPanel
                torpedoes={torpedoes}
                filtered={filteredTorpedoes}
                filter={filter}
                setFilter={setFilter}
                search={search}
                setSearch={setSearch}
                selectedFleetId={selectedFleetId}
                onSelect={handleSelect}
                loading={loading}
                error={error}
            />
            <PlantMap
                torpedoes={filteredTorpedoes}
                allTorpedoes={torpedoes}
                plantNodes={plantNodes}
                selectedFleetId={selectedFleetId}
                onSelect={handleSelect}
                panelOpen={panelOpen}
            />
            {panelOpen && (
                <TorpedoDetailPanel
                    fleetId={selectedFleetId}
                    tick={tick}
                    onClose={handleClose}
                />
            )}
        </div>
    );
};

export default LiveTrackingV2;
