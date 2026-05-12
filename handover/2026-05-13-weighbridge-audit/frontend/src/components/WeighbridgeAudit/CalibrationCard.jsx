import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';

/**
 * Bottom-right card on the Weighbridge Audit page — one row per
 * physical weighbridge (WB HMY1 / HMY2 / LRS1) showing the 30-day
 * drift percentage and a Recalibrate button.
 *
 * Source: /api/weighbridge-audit/v2/overview (shared with KPIRow +
 * VarianceHistogram — server cache 60s).
 *
 * "last cal" date is "—" today — no calibration log table exists yet
 * (Option A per design doc). Recalibrate button fires a toast; doesn't
 * persist. Follow-up sprint may add `weighbridge_calibrations` table.
 */

const TONE_COLORS = {
    green: '#15803d',
    amber: '#f59e0b',
    red:   '#ef4444',
};

const CalibrationCard = ({ tick, range }) => {
    const [rows, setRows]   = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);
    const inflightRef = useRef(false);

    useEffect(() => {
        if (inflightRef.current) return;
        inflightRef.current = true;
        api.get('/api/weighbridge-audit/v2/overview', { range })
            .then(resp => { setRows(resp?.calibrations || []); setLoading(false); setError(null); })
            .catch(err => { setError(err); setLoading(false); })
            .finally(() => { inflightRef.current = false; });
    }, [tick, range]);

    const onRecalibrate = (wb) => {
        // Toast-only for now. Persistence intentionally deferred —
        // a `weighbridge_calibrations` table can land in a follow-up.
        setToast(`Recalibration request queued for ${wb}. (Persistence pending — admin workflow not yet wired.)`);
        setTimeout(() => setToast(null), 3500);
    };

    return (
        <div className="wb-card">
            <div className="wb-card-h">
                <h3>Per-weighbridge calibration</h3>
            </div>
            <div className="wb-cal-body">
                {error && <div className="wb-empty wb-empty-tiny">Failed to load calibration data</div>}
                {!error && rows.length === 0 && !loading && (
                    <div className="wb-empty wb-empty-tiny">No data in last 30 days yet</div>
                )}
                {rows.map(c => {
                    const drift = c.drift_pct;
                    const driftStr = drift == null
                        ? '—'
                        : `${drift > 0 ? '+' : ''}${drift.toFixed(2)}%`;
                    const driftColor = TONE_COLORS[c.tone] || TONE_COLORS.green;
                    return (
                        <div className="wb-cal-row" key={c.wb}>
                            <div className="wb-cal-meta">
                                <strong className="wb-cal-name">{c.wb}</strong>
                                <span className="wb-cal-lastcal wb-dim">
                                    last cal —
                                    {c.sample_size != null && (
                                        <span className="wb-cal-samp"> · n={c.sample_size}</span>
                                    )}
                                </span>
                            </div>
                            <div className="wb-cal-right">
                                <span
                                    className="wb-mono wb-cal-drift"
                                    style={{ color: driftColor }}
                                    title={`30-day drift = mean(variance%) over ${c.sample_size ?? 0} trips`}
                                >
                                    {driftStr}
                                </span>
                                <button
                                    type="button"
                                    className="wb-btn wb-btn-small"
                                    onClick={() => onRecalibrate(c.wb)}
                                >
                                    Recalibrate
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            {toast && <div className="wb-toast">{toast}</div>}
        </div>
    );
};

export default CalibrationCard;
