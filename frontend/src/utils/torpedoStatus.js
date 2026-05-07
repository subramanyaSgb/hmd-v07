/**
 * Torpedo status mapping — colors + short labels.
 *
 * Source values come from two places:
 *   - SuVeechi MySQL view (`status` field): "Idle", "Moving", "Ign Off"
 *   - HMD FleetManagement.status: "Operating", "Assigned", "Maintenance"
 *
 * The SuVeechi sync maps Idle/Moving -> Operating, Ign Off -> Maintenance,
 * but the raw SuVeechi values may also leak through if the sync hasn't run
 * yet for a new torpedo. Handle both vocabularies here.
 */

export const STATUS_COLORS = {
  // HMD vocabulary
  Operating: '#22c55e',   // green — torpedo healthy and not in trip
  Assigned:  '#f59e0b',   // amber — torpedo currently in trip
  Maintenance: '#ef4444', // red — torpedo down

  // SuVeechi vocabulary (defensive)
  Idle:    '#22c55e',
  Moving:  '#3b82f6',     // blue — actively moving
  'Ign Off': '#ef4444',
};

export const STATUS_SHORT = {
  Operating: 'Idle',
  Assigned: 'Trip',
  Maintenance: 'Maint',
  Idle: 'Idle',
  Moving: 'Moving',
  'Ign Off': 'Off',
};

const DEFAULT_COLOR = '#94a3b8'; // slate — unknown status

export function statusColor(status) {
  return STATUS_COLORS[status] || DEFAULT_COLOR;
}

export function statusShort(status) {
  return STATUS_SHORT[status] || (status || 'Unknown');
}
