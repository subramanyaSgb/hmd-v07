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
})
