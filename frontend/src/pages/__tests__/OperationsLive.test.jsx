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
})
