import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('test harness smoke', () => {
  it('renders a basic component and finds it', () => {
    render(<div data-testid="hello">it works</div>)
    expect(screen.getByTestId('hello')).toHaveTextContent('it works')
  })

  it('jest-dom matchers are available', () => {
    render(<button disabled>save</button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
