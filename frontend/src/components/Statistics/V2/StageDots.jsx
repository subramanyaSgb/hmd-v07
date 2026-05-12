import React from 'react';

/**
 * 5-dot lifecycle strip: Tap → Weigh → Transit → SMS → Return.
 *
 * `stageIdx` is the *current* stage (0-4). Dots before it = done (green),
 * dot AT it = active (amber), dots after it = pending (gray).
 *
 * The mapping V07 Trip.status → stageIdx happens server-side; see
 * backend/routes/v2_dashboard.py:_trip_status_to_stage. UI just renders.
 */
const StageDots = ({ stageIdx }) => {
    return (
        <div className="v2-stage-dots">
            {[0, 1, 2, 3, 4].map(i => {
                let cls = 'v2-stage-dot';
                if (i < stageIdx) cls += ' v2-stage-dot-done';
                else if (i === stageIdx) cls += ' v2-stage-dot-active';
                return <span key={i} className={cls} />;
            })}
        </div>
    );
};

export default StageDots;
