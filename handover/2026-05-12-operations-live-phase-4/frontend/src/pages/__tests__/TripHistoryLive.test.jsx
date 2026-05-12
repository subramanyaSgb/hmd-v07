import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import TripHistoryLive from '../TripHistoryLive'

vi.mock('../../utils/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import { api } from '../../utils/api'

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/trip-history-live" element={<TripHistoryLive />} />
      <Route path="/trip-history-live/:trip_id" element={<TripHistoryLive />} />
    </Routes>
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
            expect(screen.getByRole('cell', { name: 'TLC-22' })).toBeInTheDocument()
        })
        expect(screen.getByRole('cell', { name: 'TLC-44' })).toBeInTheDocument()
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

    it('clicking a time-window chip updates time_window + resets page in the URL', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live?page=3')
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /^7d$/i })).toBeInTheDocument()
        })
        fireEvent.click(screen.getByRole('button', { name: /^7d$/i }))
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(2)
        })
        const url = api.get.mock.calls[1][0]
        expect(url).toContain('time_window=7d')
        expect(url).toContain('page=1')
    })

    it('selecting a producer dropdown value updates source_lab in the URL', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live')
        await waitFor(() => {
            expect(screen.getByLabelText(/producer/i)).toBeInTheDocument()
        })
        fireEvent.change(screen.getByLabelText(/producer/i), { target: { value: 'BF4' } })
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(2)
        })
        expect(api.get.mock.calls[1][0]).toContain('source_lab=BF4')
    })

    it('reload with full filter URL restores all controls', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live?time_window=7d&source_lab=BF3&destination=SMS2&fleet_id=TLC-22&status=anomaly&shift=A&q=heat&page=2&sort_by=net_weight&sort_order=asc')
        await waitFor(() => {
            // Controls reflect the URL
            expect(screen.getByLabelText(/producer/i)).toHaveValue('BF3')
            expect(screen.getByLabelText(/consumer/i)).toHaveValue('SMS2')
            expect(screen.getByLabelText(/torpedo/i)).toHaveValue('TLC-22')
            expect(screen.getByLabelText(/status/i)).toHaveValue('anomaly')
            expect(screen.getByLabelText(/shift/i)).toHaveValue('A')
            expect(screen.getByPlaceholderText(/search/i)).toHaveValue('heat')
            expect(screen.getByRole('button', { name: /^7d$/i })).toHaveAttribute('data-active', 'true')
        })
    })

    it('changing filter while on page 5 resets to page 1', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live?page=5&source_lab=BF3')
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(1)
        })
        fireEvent.change(screen.getByLabelText(/consumer/i), { target: { value: 'SMS4' } })
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(2)
        })
        expect(api.get.mock.calls[1][0]).toContain('page=1')
        expect(api.get.mock.calls[1][0]).not.toContain('page=5')
    })

    it('renders TripStoryExpanded when the URL has /:trip_id', async () => {
        api.get.mockImplementation((url) => {
            if (url.startsWith('/api/trip-history-live/')) {
                return Promise.resolve({
                    trip: { trip_id: 'T1', fleet_id: 'TLC-22',
                            source_lab: 'BF3', destination: 'SMS3',
                            net_weight: 368.0 },
                    matched_heats: [],
                    current_torpedo_position: null,
                    anomaly_flags: [],
                    last_sync_at: { wbatngl: null, hts: null },
                })
            }
            return Promise.resolve(samplePayload())
        })
        renderAt('/trip-history-live/T1')
        await waitFor(() => {
            expect(screen.getByText('TAP')).toBeInTheDocument()
        })
        // Also calls both endpoints
        const callUrls = api.get.mock.calls.map(c => c[0])
        expect(callUrls.some(u => u.startsWith('/api/trip-history-live?'))).toBe(true)
        expect(callUrls.some(u => u === '/api/trip-history-live/T1')).toBe(true)
    })

    it('clicking a row navigates to the deep-link route', async () => {
        api.get.mockResolvedValue(samplePayload())
        renderAt('/trip-history-live')
        await waitFor(() => {
            expect(screen.getByTestId('trip-row-T1')).toBeInTheDocument()
        })
        fireEvent.click(screen.getByTestId('trip-row-T1'))
        // The detail endpoint should now have been called
        await waitFor(() => {
            const callUrls = api.get.mock.calls.map(c => c[0])
            expect(callUrls.some(u => u === '/api/trip-history-live/T1')).toBe(true)
        })
    })
})
