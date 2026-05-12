import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Pagination from '../Pagination'

describe('Pagination', () => {
    it('renders 1-50 of 3432 for page 1, page_size 50', () => {
        render(<Pagination page={1} pageSize={50} total={3432} onPageChange={() => {}} />)
        expect(screen.getByText(/1.*–.*50 of 3432/i)).toBeInTheDocument()
    })

    it('renders 51-100 of 3432 for page 2', () => {
        render(<Pagination page={2} pageSize={50} total={3432} onPageChange={() => {}} />)
        expect(screen.getByText(/51.*–.*100 of 3432/i)).toBeInTheDocument()
    })

    it('renders 3401-3432 of 3432 on the last partial page', () => {
        render(<Pagination page={69} pageSize={50} total={3432} onPageChange={() => {}} />)
        // 69 * 50 = 3450 cap → "3401–3432 of 3432"
        expect(screen.getByText(/3401.*–.*3432 of 3432/i)).toBeInTheDocument()
    })

    it('disables Prev on page 1', () => {
        render(<Pagination page={1} pageSize={50} total={3432} onPageChange={() => {}} />)
        expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled()
    })

    it('disables Next on the last page', () => {
        render(<Pagination page={69} pageSize={50} total={3432} onPageChange={() => {}} />)
        expect(screen.getByRole('button', { name: /next/i })).toBeDisabled()
    })

    it('calls onPageChange(prev) when Prev clicked', () => {
        const onPageChange = vi.fn()
        render(<Pagination page={5} pageSize={50} total={3432} onPageChange={onPageChange} />)
        fireEvent.click(screen.getByRole('button', { name: /prev/i }))
        expect(onPageChange).toHaveBeenCalledWith(4)
    })

    it('calls onPageChange(next) when Next clicked', () => {
        const onPageChange = vi.fn()
        render(<Pagination page={5} pageSize={50} total={3432} onPageChange={onPageChange} />)
        fireEvent.click(screen.getByRole('button', { name: /next/i }))
        expect(onPageChange).toHaveBeenCalledWith(6)
    })

    it('renders 0 of 0 when total=0', () => {
        render(<Pagination page={1} pageSize={50} total={0} onPageChange={() => {}} />)
        expect(screen.getByText(/0 of 0/i)).toBeInTheDocument()
    })
})
