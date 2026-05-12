import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LiveHeatsPanel from '../LiveHeatsPanel'

const sample = ['D', 'E', 'F', 'G', 'H', 'I'].map(letter => ({
  converter_no: letter,
  sms: null,
  state: 'IDLE',
  current_heat_no: null, current_torpedo: null,
  elapsed_minutes: null, hotmetal_received_mt: null,
  last_heat_no: `${letter}999`, last_heat_at: null,
  heats_today: 0,
}))

describe('LiveHeatsPanel', () => {
  it('renders the section heading', () => {
    render(<LiveHeatsPanel converters={sample} />)
    expect(screen.getByRole('heading', { name: /live heats/i })).toBeInTheDocument()
  })

  it('renders one ConverterCard per converter (all 6 letters present)', () => {
    render(<LiveHeatsPanel converters={sample} />)
    for (const letter of ['D', 'E', 'F', 'G', 'H', 'I']) {
      expect(screen.getByText(letter)).toBeInTheDocument()
    }
  })

  it('preserves the order it receives', () => {
    render(<LiveHeatsPanel converters={sample} />)
    const cards = screen.getAllByTestId('converter-card')
    expect(cards.map(c => c.dataset.converter)).toEqual(['D', 'E', 'F', 'G', 'H', 'I'])
  })

  it('handles a payload with fewer than 6 converters gracefully', () => {
    render(<LiveHeatsPanel converters={sample.slice(0, 3)} />)
    expect(screen.getAllByTestId('converter-card')).toHaveLength(3)
  })

  it('handles an empty converters prop with an empty-state message', () => {
    render(<LiveHeatsPanel converters={[]} />)
    expect(screen.getByText(/no converter data/i)).toBeInTheDocument()
  })

  it('handles missing converters prop with an empty-state message', () => {
    render(<LiveHeatsPanel />)
    expect(screen.getByText(/no converter data/i)).toBeInTheDocument()
  })
})
