import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from '../StatusBadge'

describe('StatusBadge', () => {
    it('renders Complete for match_status="complete"', () => {
        render(<StatusBadge status="complete" />)
        expect(screen.getByText(/complete/i)).toBeInTheDocument()
    })

    it('renders In Flight for "in_flight"', () => {
        render(<StatusBadge status="in_flight" />)
        expect(screen.getByText(/in flight/i)).toBeInTheDocument()
    })

    it('renders Awaiting Pour for "awaiting_pour"', () => {
        render(<StatusBadge status="awaiting_pour" />)
        expect(screen.getByText(/awaiting pour/i)).toBeInTheDocument()
    })

    it('renders Anomaly for "anomaly"', () => {
        render(<StatusBadge status="anomaly" />)
        expect(screen.getByText(/anomaly/i)).toBeInTheDocument()
    })

    it('renders Unknown for null / missing / unrecognised', () => {
        render(<StatusBadge status={null} />)
        expect(screen.getByText(/unknown/i)).toBeInTheDocument()
    })

    it('attaches data-testid that includes the raw status', () => {
        render(<StatusBadge status="anomaly" />)
        expect(screen.getByTestId('status-badge-anomaly')).toBeInTheDocument()
    })
})
