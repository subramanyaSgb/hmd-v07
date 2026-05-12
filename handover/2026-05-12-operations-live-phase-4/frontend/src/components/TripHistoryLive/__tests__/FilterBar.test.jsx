import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilterBar from '../FilterBar'

const defaultValues = {
    time_window: 'today',
    source_lab: 'all',
    destination: 'all',
    fleet_id: 'all',
    status: 'all',
    shift: 'all',
    q: '',
}

describe('FilterBar', () => {
    it('renders the 4 time-window chips', () => {
        render(<FilterBar values={defaultValues} onChange={() => {}} />)
        expect(screen.getByRole('button', { name: /^today$/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^24h$/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^7d$/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /^30d$/i })).toBeInTheDocument()
    })

    it('marks the active time chip via data-active', () => {
        render(<FilterBar values={{ ...defaultValues, time_window: '7d' }} onChange={() => {}} />)
        expect(screen.getByRole('button', { name: /^7d$/i })).toHaveAttribute('data-active', 'true')
        expect(screen.getByRole('button', { name: /^today$/i })).toHaveAttribute('data-active', 'false')
    })

    it('calls onChange when a chip is clicked', () => {
        const onChange = vi.fn()
        render(<FilterBar values={defaultValues} onChange={onChange} />)
        fireEvent.click(screen.getByRole('button', { name: /^7d$/i }))
        expect(onChange).toHaveBeenCalledWith({ time_window: '7d', page: 1 })
    })

    it('renders the producer dropdown with the expected options', () => {
        render(<FilterBar values={defaultValues} onChange={() => {}} />)
        const select = screen.getByLabelText(/producer/i)
        expect(select).toBeInTheDocument()
        const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
        expect(options).toEqual(expect.arrayContaining([
            'all', 'BF1', 'BF2', 'BF3', 'BF4', 'BF5', 'COREX1', 'COREX2',
        ]))
    })

    it('calls onChange when the producer dropdown changes', () => {
        const onChange = vi.fn()
        render(<FilterBar values={defaultValues} onChange={onChange} />)
        fireEvent.change(screen.getByLabelText(/producer/i), { target: { value: 'BF3' } })
        expect(onChange).toHaveBeenCalledWith({ source_lab: 'BF3', page: 1 })
    })

    it('renders the consumer dropdown with the expected options', () => {
        render(<FilterBar values={defaultValues} onChange={() => {}} />)
        const select = screen.getByLabelText(/consumer/i)
        const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
        expect(options).toEqual(expect.arrayContaining([
            'all', 'SMS1', 'SMS2', 'SMS3', 'SMS4', 'RFL',
        ]))
    })

    it('renders the torpedo dropdown with 53 TLC values + "all"', () => {
        render(<FilterBar values={defaultValues} onChange={() => {}} />)
        const select = screen.getByLabelText(/torpedo/i)
        const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
        expect(options.length).toBe(54)        // all + TLC-01..TLC-53
        expect(options).toContain('all')
        expect(options).toContain('TLC-01')
        expect(options).toContain('TLC-53')
    })

    it('renders the status dropdown with the 5 enum values + "all"', () => {
        render(<FilterBar values={defaultValues} onChange={() => {}} />)
        const select = screen.getByLabelText(/status/i)
        const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
        expect(options).toEqual(['all', 'complete', 'in_flight', 'awaiting_pour', 'anomaly'])
    })

    it('renders the shift dropdown with A/B/C/all', () => {
        render(<FilterBar values={defaultValues} onChange={() => {}} />)
        const select = screen.getByLabelText(/shift/i)
        const options = Array.from(select.querySelectorAll('option')).map(o => o.value)
        expect(options).toEqual(['all', 'A', 'B', 'C'])
    })

    it('renders a search input with the current q value', () => {
        render(<FilterBar values={{ ...defaultValues, q: 'TLC-22' }} onChange={() => {}} />)
        expect(screen.getByPlaceholderText(/search/i)).toHaveValue('TLC-22')
    })

    it('calls onChange with the new q on submit', () => {
        const onChange = vi.fn()
        render(<FilterBar values={defaultValues} onChange={onChange} />)
        const input = screen.getByPlaceholderText(/search/i)
        fireEvent.change(input, { target: { value: 'TLC-22' } })
        fireEvent.submit(input.closest('form'))
        expect(onChange).toHaveBeenCalledWith({ q: 'TLC-22', page: 1 })
    })
})
