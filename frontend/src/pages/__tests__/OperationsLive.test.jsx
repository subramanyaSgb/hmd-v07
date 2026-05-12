import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import OperationsLive from '../OperationsLive'

// Mock the api module BEFORE importing the page (handled by hoisting).
vi.mock('../../utils/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import { api } from '../../utils/api'

const minimalPayload = () => ({
  kpi_strip: {
    production_today_mt: 0,
    consumption_today_mt: 0,
    active_trips_now: 0,
    heats_in_progress: 0,
    idle_torpedoes: 0,
  },
  converters: [],
  active_trips: [],
  activity_feed: [],
  last_sync_at: { wbatngl: null, hts: null },
})

describe('OperationsLive — load + error states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading state on first paint', () => {
    api.get.mockReturnValue(new Promise(() => {}))  // never resolves
    render(<OperationsLive />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('replaces loading with the page once data arrives', async () => {
    api.get.mockResolvedValueOnce(minimalPayload())
    render(<OperationsLive />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /operations live/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
  })

  it('renders an error state when the API rejects', async () => {
    api.get.mockRejectedValueOnce(new Error('boom'))
    render(<OperationsLive />)
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })
  })

  it('hits /api/operations-live/dashboard on mount', async () => {
    api.get.mockResolvedValueOnce(minimalPayload())
    render(<OperationsLive />)
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/api/operations-live/dashboard')
    })
  })

  it('renders Updated label using last_sync_at.wbatngl', async () => {
    const ago = new Date(Date.now() - 5_000).toISOString()  // 5s ago
    api.get.mockResolvedValueOnce({
      ...minimalPayload(),
      last_sync_at: { wbatngl: ago, hts: null },
    })
    render(<OperationsLive />)
    await waitFor(() => {
      // Match "Updated 5s ago" or "Updated 6s ago" — tolerate small drift
      expect(screen.getByText(/updated \d+s ago/i)).toBeInTheDocument()
    })
  })

  it('renders Updated — when last_sync_at is null', async () => {
    api.get.mockResolvedValueOnce({
      ...minimalPayload(),
      last_sync_at: { wbatngl: null, hts: null },
    })
    render(<OperationsLive />)
    await waitFor(() => {
      expect(screen.getByText(/updated —/i)).toBeInTheDocument()
    })
  })

  it('renders the TopKpiStrip with real numbers when data arrives', async () => {
    api.get.mockResolvedValueOnce({
      ...minimalPayload(),
      kpi_strip: {
        production_today_mt: 14524.6,
        consumption_today_mt: 8000,
        active_trips_now: 27,
        heats_in_progress: 3,
        idle_torpedoes: 42,
      },
    })
    render(<OperationsLive />)
    await waitFor(() => {
      expect(screen.getByText(/14524\.6/)).toBeInTheDocument()
    })
    expect(screen.getByText('27')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders RecentActivityFeed with the events from the API', async () => {
    api.get.mockResolvedValueOnce({
      ...minimalPayload(),
      activity_feed: [
        { type: 'trip_completed', at: '2026-05-12T10:36:11',
          summary: 'TLC-35 closed BF4 -> SMS2 (340 MT)',
          ref_id: '74642TLC 352120526' },
      ],
    })
    render(<OperationsLive />)
    await waitFor(() => {
      expect(screen.getByText(/TLC-35 closed/)).toBeInTheDocument()
    })
  })

  it('renders LiveHeatsPanel with the 6 converters from the API', async () => {
    api.get.mockResolvedValueOnce({
      ...minimalPayload(),
      converters: ['D','E','F','G','H','I'].map(letter => ({
        converter_no: letter, sms: null, state: 'IDLE',
        current_heat_no: null, current_torpedo: null,
        elapsed_minutes: null, hotmetal_received_mt: null,
        last_heat_no: `${letter}999`, last_heat_at: null,
        heats_today: 0,
      })),
    })
    render(<OperationsLive />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /live heats/i })).toBeInTheDocument()
    })
    // All 6 letters present
    for (const letter of ['D','E','F','G','H','I']) {
      expect(screen.getByText(letter)).toBeInTheDocument()
    }
  })

  it('renders ActiveTripsPanel with the trips from the API', async () => {
    api.get.mockResolvedValueOnce({
      ...minimalPayload(),
      active_trips: [
        { trip_id: 'T1', torpedo_no: 'TLC-22',
          source_lab: 'BF3', destination: 'SMS3',
          net_weight_mt: 368.0, out_date: '2026-05-12T10:20:11',
          elapsed_minutes: 52, current_status: 'Moving' },
      ],
    })
    render(<OperationsLive />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /active trips/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/TLC-22/)).toBeInTheDocument()
  })
})
