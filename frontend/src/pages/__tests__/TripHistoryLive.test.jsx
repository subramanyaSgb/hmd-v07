import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TripHistoryLive from '../TripHistoryLive'

// Page reads useSearchParams + useParams + useNavigate from react-router-dom,
// so all renders need a Router parent.
const renderWithRouter = (initialEntries = ['/trip-history-live']) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <TripHistoryLive />
    </MemoryRouter>
  )

// Mock the api module before the page imports it.
vi.mock('../../utils/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import { api } from '../../utils/api'

describe('TripHistoryLive — initial render', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.get.mockReturnValue(new Promise(() => {}))   // hang so we see loading
  })

  it('renders the page heading', () => {
    renderWithRouter()
    expect(screen.getByRole('heading', { name: /trip history.*live/i })).toBeInTheDocument()
  })
})
