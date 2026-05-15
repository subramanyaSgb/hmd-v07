import { Suspense, lazy } from 'react';

/**
 * Live Tracking page.
 *
 * 2026-05-15 — VERSION 1 (Dashboard.jsx) removed per user direction. The
 * page is now V2 only; no toggle, no header tab strip. `Dashboard.jsx` +
 * `TorpedoDrawer.jsx` deleted as orphans in the same commit. See changes
 * tracker for the removal sweep.
 */
const LiveTrackingV2 = lazy(() => import('./LiveTrackingV2'));

const LiveTracking = () => (
    <Suspense fallback={<div style={{ padding: 40, color: '#64748b' }}>Loading…</div>}>
        <LiveTrackingV2 />
    </Suspense>
);

export default LiveTracking;
