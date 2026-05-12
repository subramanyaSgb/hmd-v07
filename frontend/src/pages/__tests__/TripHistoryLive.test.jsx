import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TripHistoryLive from '../TripHistoryLive'

vi.mock('../../utils/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import { api } from '../../utils/api'

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <TripHistoryLive />
  </MemoryRouter>
)

const emptyPayload = () => ({
  rows: [],
  page: 1,
  page_size: 50,
  total: 0,
  last_sync_at: { wbatngl: null, hts: null },
})

describe('TripHistoryLive — load + URL sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a loading state on first paint', () => {
    api.get.mockReturnValue(new Promise(() => {}))
    renderAt('/trip-history-live')
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('renders the page once data arrives', async () => {
    api.get.mockResolvedValueOnce(emptyPayload())
    renderAt('/trip-history-live')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /trip history.*live/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
  })

  it('renders an error state when the API rejects', async () => {
    api.get.mockRejectedValueOnce(new Error('boom'))
    renderAt('/trip-history-live')
    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument()
    })
  })

  it('calls /api/trip-history-live with default time_window=today on mount', async () => {
    api.get.mockResolvedValueOnce(emptyPayload())
    renderAt('/trip-history-live')
    await waitFor(() => {
      expect(api.get).toHaveBeenCalled()
    })
    const url = api.get.mock.calls[0][0]
    expect(url).toMatch(/^\/api\/trip-history-live\?/)
    expect(url).toContain('time_window=today')
    expect(url).toContain('page=1')
  })

  it('reads filters from the URL', async () => {
    api.get.mockResolvedValueOnce(emptyPayload())
    renderAt('/trip-history-live?time_window=7d&source_lab=BF3&page=3')
    await waitFor(() => {
      expect(api.get).toHaveBeenCalled()
    })
    const url = api.get.mock.calls[0][0]
    expect(url).toContain('time_window=7d')
    expect(url).toContain('source_lab=BF3')
    expect(url).toContain('page=3')
  })

  it('renders Updated label using last_sync_at.wbatngl', async () => {
    const ago = new Date(Date.now() - 5_000).toISOString()
    api.get.mockResolvedValueOnce({
      ...emptyPayload(),
      last_sync_at: { wbatngl: ago, hts: null },
    })
    renderAt('/trip-history-live')
    await waitFor(() => {
      expect(screen.getByText(/updated \d+s ago/i)).toBeInTheDocument()
    })
  })
})

const samplePayload = () => ({
    rows: [
        { trip_id: 'T1', fleet_id: 'TLC-22', source_lab: 'BF3', destination: 'SMS3',
          net_weight: 368.0, out_date: '2026-05-12T10:20:11',
          match_status: 'complete', first_heat_no: 'E2030590',
          matched_heat_count: 2, weight_delta_pct: -5.7 },
        { trip_id: 'T2', fleet_id: 'TLC-44', source_lab: 'BF5', destination: 'SMS4',
          net_weight: null, out_date: null,
          match_status: 'in_flight', first_heat_no: null,
          matched_heat_count: 0, weight_delta_pct: null },
    ],
    page: 1, page_size: 50, total: 187,
    last_sync_at: { wbatngl: '2026-05-12T11:00:00', hts: null },
})

describe('TripHistoryLive — list integration', () => {
    beforeEach(() => { vi.clearAllMocks() })

    it('renders TripListTable rows from the API', async () => {
        api.get.mockResolvedValueOnce(samplePayload())
        renderAt('/trip-history-live')
        await waitFor(() => {
            expect(screen.getByText('TLC-22')).toBeInTheDocument()
        })
        expect(screen.getByText('TLC-44')).toBeInTheDocument()
    })

    it('renders Pagination with the API total', async () => {
        api.get.mockResolvedValueOnce(samplePayload())
        renderAt('/trip-history-live')
        await waitFor(() => {
            expect(screen.getByText(/of 187/i)).toBeInTheDocument()
        })
    })

    it('clicking the next-page button bumps page in the URL', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live')
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
        })
        fireEvent.click(screen.getByRole('button', { name: /next/i }))
        await waitFor(() => {
            // 2nd call after URL change
            expect(api.get).toHaveBeenCalledTimes(2)
            expect(api.get.mock.calls[1][0]).toContain('page=2')
        })
    })

    it('clicking a sortable header updates sort_by + sort_order in the URL', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live')
        await waitFor(() => {
            expect(screen.getByTestId('header-net_weight')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByTestId('header-net_weight'))
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(2)
            expect(api.get.mock.calls[1][0]).toContain('sort_by=net_weight')
            expect(api.get.mock.calls[1][0]).toContain('sort_order=desc')
        })
    })
})
