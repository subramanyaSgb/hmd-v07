import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OperationsLive from '../OperationsLive'

describe('OperationsLive — initial render', () => {
  it('renders the page title', () => {
    render(<OperationsLive />)
    expect(screen.getByRole('heading', { name: /operations live/i })).toBeInTheDocument()
  })
})
