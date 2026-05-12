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

  it('handles missing/null kpis gracefully', () => {
    render(<TopKpiStrip kpis={{}} />)
    // No crash; the 5 labels still render
    expect(screen.getByText(/production today/i)).toBeInTheDocument()
    // Missing values render as 0 (default) not "undefined" or "NaN"
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/nan/i)).not.toBeInTheDocument()
  })
})
