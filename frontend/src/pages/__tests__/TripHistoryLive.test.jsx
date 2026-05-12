import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
