import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RecentActivityFeed from '../RecentActivityFeed'

const sample = [
  { type: 'trip_completed', at: '2026-05-12T10:36:11',
    summary: 'TLC-35 closed BF4 -> SMS2 (340 MT)',
    ref_id: '74642TLC 352120526' },
  { type: 'heat_started', at: '2026-05-12T10:30:00',
    summary: 'Heat D2030600 started @ D (torpedo TLC-22)',
    ref_id: 'D2030600' },
]

describe('RecentActivityFeed', () => {
  it('renders one row per event', () => {
    render(<RecentActivityFeed events={sample} />)
    expect(screen.getByText(/TLC-35 closed/)).toBeInTheDocument()
    expect(screen.getByText(/Heat D2030600 started/)).toBeInTheDocument()
  })

  it('renders the section title', () => {
    render(<RecentActivityFeed events={sample} />)
    expect(screen.getByRole('heading', { name: /recent activity/i })).toBeInTheDocument()
  })

  it('shows an empty state when no events', () => {
    render(<RecentActivityFeed events={[]} />)
    expect(screen.getByText(/no recent activity/i)).toBeInTheDocument()
  })

  it('handles missing events prop gracefully', () => {
    render(<RecentActivityFeed />)
    expect(screen.getByText(/no recent activity/i)).toBeInTheDocument()
  })

  it('preserves the order it receives (assumes parent passes newest-first)', () => {
    render(<RecentActivityFeed events={sample} />)
    const rows = screen.getAllByTestId('activity-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('TLC-35 closed')
    expect(rows[1]).toHaveTextContent('Heat D2030600 started')
  })

  it('renders a relative time per row', () => {
    // Build a fresh "5 minutes ago" event
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    render(<RecentActivityFeed events={[{
      type: 'trip_completed', at: fiveMinAgo,
      summary: 'fresh test event', ref_id: 'TEST-1',
    }]} />)
    expect(screen.getByText(/5m ago/)).toBeInTheDocument()
  })
})
