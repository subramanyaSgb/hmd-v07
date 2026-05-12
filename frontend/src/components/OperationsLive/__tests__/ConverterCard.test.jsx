import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ConverterCard from '../ConverterCard'

const idleSample = {
  converter_no: 'D',
  sms: null,
  state: 'IDLE',
  current_heat_no: null,
  current_torpedo: null,
  elapsed_minutes: null,
  hotmetal_received_mt: null,
  last_heat_no: 'D2030595',
  last_heat_at: '2026-04-01T18:14:03',
  heats_today: 0,
}

const activeSample = {
  converter_no: 'E',
  sms: 'SMS3',
  state: 'HEAT_IN_PROGRESS',
  current_heat_no: 'E2030600',
  current_torpedo: 'TLC-22',
  elapsed_minutes: 15,
  hotmetal_received_mt: 172.5,
  last_heat_no: 'E2030597',
  last_heat_at: '2026-04-01T17:36:14',
  heats_today: 4,
}

describe('ConverterCard', () => {
  it('renders the converter letter prominently', () => {
    render(<ConverterCard data={idleSample} />)
    expect(screen.getByText('D')).toBeInTheDocument()
  })

  it('shows IDLE badge when state is IDLE', () => {
    render(<ConverterCard data={idleSample} />)
    expect(screen.getByText(/idle/i)).toBeInTheDocument()
    expect(screen.queryByText(/heat in progress/i)).not.toBeInTheDocument()
  })

  it('shows HEAT IN PROGRESS badge when state is HEAT_IN_PROGRESS', () => {
    render(<ConverterCard data={activeSample} />)
    expect(screen.getByText(/heat in progress/i)).toBeInTheDocument()
  })

  it('shows current heat, torpedo, elapsed, hotmetal when active', () => {
    render(<ConverterCard data={activeSample} />)
    expect(screen.getByText(/E2030600/)).toBeInTheDocument()
    expect(screen.getByText(/TLC-22/)).toBeInTheDocument()
    expect(screen.getByText(/15 min/)).toBeInTheDocument()
    expect(screen.getByText(/172\.5/)).toBeInTheDocument()
  })

  it('shows last heat info when idle', () => {
    render(<ConverterCard data={idleSample} />)
    expect(screen.getByText(/D2030595/)).toBeInTheDocument()
  })

  it('shows SMS label when present', () => {
    render(<ConverterCard data={activeSample} />)
    expect(screen.getByText(/SMS3/)).toBeInTheDocument()
  })

  it('omits SMS label gracefully when null', () => {
    render(<ConverterCard data={idleSample} />)
    // No "SMS-anything" should appear given sms: null
    expect(screen.queryByText(/SMS\d/)).not.toBeInTheDocument()
  })

  it('shows heats_today counter', () => {
    render(<ConverterCard data={activeSample} />)
    expect(screen.getByText(/4 today/i)).toBeInTheDocument()
  })

  it('shows 0 today gracefully', () => {
    render(<ConverterCard data={idleSample} />)
    expect(screen.getByText(/0 today/i)).toBeInTheDocument()
  })
})
