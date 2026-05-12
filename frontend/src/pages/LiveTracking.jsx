import { useState, useEffect, Suspense, lazy } from 'react';
import { useHeader } from '../context/HeaderContext';
import { LayoutDashboard, Sparkles } from 'lucide-react';
import Dashboard from './Dashboard';

/**
 * Live Tracking page — thin wrapper that hosts the V1 / V2 toggle.
 *
 * - V1 = existing `Dashboard.jsx` (battle-tested, UNCHANGED — every perf
 *        fix from tracker #32-#36 stays in force).
 * - V2 = new `LiveTrackingV2.jsx` (1:1 layout port of
 *        `desing_idea/tracking.jsx`, adapted to V07's light theme).
 *
 * Tab toggle uses HeaderContext center slot — same pattern as the
 * Statistics page tabs. Title moves to the LEFT slot per user spec.
 * Default tab is `'v1'` so existing operators see no change until they
 * click VERSION 2.
 *
 * No role gate — Live Tracking is open to all authenticated users.
 *
 * Design doc: docs/plans/2026-05-12-livetracking-v2-design.md
 */
const LiveTrackingV2 = lazy(() => import('./LiveTrackingV2'));

const LiveTracking = () => {
    const { setHeaderContent } = useHeader();
    const [activeTab, setActiveTab] = useState('v1');

    useEffect(() => {
        setHeaderContent({
            left: (
                <div className="page-title-left">Live Tracking</div>
            ),
            center: (
                <div className="switcher-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'v1' ? 'active' : ''}`}
                        onClick={() => setActiveTab('v1')}
                    >
                        <LayoutDashboard size={16} />
                        VERSION 1
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'v2' ? 'active' : ''}`}
                        onClick={() => setActiveTab('v2')}
                    >
                        <Sparkles size={16} />
                        VERSION 2
                    </button>
                </div>
            ),
            // forceLeftTitle: false → header doesn't render its default
            // "LIVE TRACKING" centered title. Our `left` slot owns it now.
            forceLeftTitle: true,
        });

        return () => setHeaderContent({
            left: null, center: null, right: null, forceLeftTitle: false,
        });
    }, [activeTab, setHeaderContent]);

    if (activeTab === 'v2') {
        return (
            <Suspense fallback={<div style={{ padding: 40, color: '#64748b' }}>Loading V2…</div>}>
                <LiveTrackingV2 />
            </Suspense>
        );
    }
    return <Dashboard />;
};

export default LiveTracking;
