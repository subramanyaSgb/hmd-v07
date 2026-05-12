import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TopKpiStrip from '../TopKpiStrip'

const sample = {
  production_today_mt: 14524.6,
  consumption_today_mt: 0,
  active_trips_now: 27,
  heats_in_progress: 0,
  idle_torpedoes: 42,
}

describe('TopKpiStrip', () => {
  it('renders all five labelled tiles', () => {
    render(<TopKpiStrip kpis={sample} />)
    expect(screen.getByText(/production today/i)).toBeInTheDocument()
    expect(screen.getByText(/consumption today/i)).toBeInTheDocument()
    expect(screen.getByText(/active trips now/i)).toBeInTheDocument()
    expect(screen.getByText(/heats in progress/i)).toBeInTheDocument()
    expect(screen.getByText(/idle torpedoes/i)).toBeInTheDocument()
  })

  it('renders production_today_mt with 1 decimal + MT unit', () => {
    render(<TopKpiStrip kpis={sample} />)
    expect(screen.getByText(/14524\.6/)).toBeInTheDocument()
  })

  it('renders integer counters without decimals', () => {
    render(<TopKpiStrip kpis={sample} />)
    expect(screen.getByText('27')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('handles missing kpis by rendering zero values, not undefined/NaN', () => {
    render(<TopKpiStrip kpis={{}} />)
    // The 5 labels still render
    expect(screen.getByText(/production today/i)).toBeInTheDocument()
    expect(screen.getByText(/idle torpedoes/i)).toBeInTheDocument()
    // Float tiles (production + consumption) fall back to '0.0'
    expect(screen.getAllByText('0.0').length).toBeGreaterThanOrEqual(2)
    // Int tiles (active trips, heats, idle torpedoes) fall back to '0'
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(3)
    // And nothing leaks
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/nan/i)).not.toBeInTheDocument()
  })

  it('handles null kpis by rendering zero values', () => {
    // Defensive: parent might pass `kpis={null}` if API returns null section
    render(<TopKpiStrip kpis={null} />)
    expect(screen.getByText(/production today/i)).toBeInTheDocument()
    expect(screen.getAllByText('0.0').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(3)
  })
})
