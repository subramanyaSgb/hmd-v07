import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ActiveTripsPanel from '../ActiveTripsPanel'

const sample = [
  { trip_id: 'T1', torpedo_no: 'TLC-22', source_lab: 'BF3', destination: 'SMS3',
    net_weight_mt: 368.0, out_date: '2026-05-12T10:20:11',
    elapsed_minutes: 52, current_status: 'Moving' },
  { trip_id: 'T2', torpedo_no: 'TLC-44', source_lab: 'BF5', destination: 'SMS4',
    net_weight_mt: 346.7, out_date: '2026-05-12T09:17:17',
    elapsed_minutes: 115, current_status: 'Operating' },
  { trip_id: 'T3', torpedo_no: 'TLC-99', source_lab: 'BF1', destination: 'SMS1',
    net_weight_mt: null, out_date: null,
    elapsed_minutes: null, current_status: null },
]

describe('ActiveTripsPanel', () => {
  it('renders the section heading', () => {
    render(<ActiveTripsPanel trips={sample} />)
    expect(screen.getByRole('heading', { name: /active trips/i })).toBeInTheDocument()
  })

  it('renders one row per trip with key fields', () => {
    render(<ActiveTripsPanel trips={sample} />)
    expect(screen.getByText(/TLC-22/)).toBeInTheDocument()
    expect(screen.getByText(/BF3 → SMS3/)).toBeInTheDocument()
    expect(screen.getByText(/368/)).toBeInTheDocument()
    expect(screen.getByText(/52 min/)).toBeInTheDocument()
  })

  it('renders current_status as a coloured chip', () => {
    render(<ActiveTripsPanel trips={sample} />)
    const movingChip = screen.getByTestId('status-chip-T1')
    expect(movingChip).toHaveTextContent(/moving/i)
  })

  it('handles missing current_status with a neutral chip', () => {
    render(<ActiveTripsPanel trips={sample} />)
    const unknownChip = screen.getByTestId('status-chip-T3')
    expect(unknownChip).toHaveTextContent(/unknown/i)
  })

  it('handles missing net_weight / elapsed gracefully', () => {
    render(<ActiveTripsPanel trips={sample} />)
    // Row for T3 has nulls — should not crash and should render dashes
    expect(screen.getByTestId('trip-row-T3')).toBeInTheDocument()
  })

  it('shows empty state when no trips', () => {
    render(<ActiveTripsPanel trips={[]} />)
    expect(screen.getByText(/no active trips/i)).toBeInTheDocument()
  })

  it('handles missing trips prop with empty state', () => {
    render(<ActiveTripsPanel />)
    expect(screen.getByText(/no active trips/i)).toBeInTheDocument()
  })
})
