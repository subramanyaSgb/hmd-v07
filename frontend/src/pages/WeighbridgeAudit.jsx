import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Download } from 'lucide-react';
import { useHeader } from '../context/HeaderContext';
import KPIRow from '../components/WeighbridgeAudit/KPIRow';
import WeighbridgeLog from '../components/WeighbridgeAudit/WeighbridgeLog';
import VarianceHistogram from '../components/WeighbridgeAudit/VarianceHistogram';
import CalibrationCard from '../components/WeighbridgeAudit/CalibrationCard';
import '../components/WeighbridgeAudit/WeighbridgeAudit.css';

/**
 * Weighbridge Audit — cross-check BF-side gross/tare/net readings
 * against SMS-side actual receipt. 1:1 layout port of
 * `desing_idea/reports.jsx:WeighbridgeAudit`, light theme.
 *
 * Layout: 4 KPI cards on top; grid 1.6fr / 1fr below — log table on the
 * left, variance histogram + calibration card stacked on the right.
 *
 * Master 60s tick (weighbridge data doesn't change rapidly).
 *
 * Design doc: docs/plans/2026-05-13-weighbridge-audit-design.md
 */

const RANGES = [
    { id: 'shift_a', label: 'Shift A' },
    { id: 'today',   label: 'Today'   },
    { id: '7d',      label: '7d'      },
];

const REFRESH_MS = 60_000;

const WeighbridgeAudit = () => {
    const { setHeaderContent } = useHeader();
    const [range, setRange]   = useState('today');
    const [filter, setFilter] = useState('all');
    const [tick, setTick]     = useState(0);

    // Master 60s tick
    const timerRef = useRef(null);
    useEffect(() => {
        timerRef.current = setInterval(() => setTick(t => t + 1), REFRESH_MS);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, []);

    // HeaderContext — [Shift A] [Today] [7d] pills + Export
    useEffect(() => {
        setHeaderContent({
            right: (
                <div className="wb-header-right">
                    {RANGES.map(r => (
                        <button
                            key={r.id}
                            type="button"
                            className={`wb-pill ${range === r.id ? 'wb-pill-active' : ''}`}
                            onClick={() => setRange(r.id)}
                        >
                            {r.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        className="wb-btn"
                        onClick={() => window.dispatchEvent(new CustomEvent('wbaudit:export'))}
                    >
                        <Download size={13} /> Export
                    </button>
                </div>
            ),
        });
        return () => setHeaderContent({ left: null, center: null, right: null, forceLeftTitle: false });
    }, [range, setHeaderContent]);

    return (
        <div className="wb-audit">
            <KPIRow tick={tick} range={range} />

            <div className="wb-grid-2col">
                <WeighbridgeLog
                    tick={tick}
                    range={range}
                    filter={filter}
                    setFilter={setFilter}
                />
                <div className="wb-side">
                    <VarianceHistogram tick={tick} range={range} />
                    <CalibrationCard tick={tick} range={range} />
                </div>
            </div>
        </div>
    );
};

export default WeighbridgeAudit;
