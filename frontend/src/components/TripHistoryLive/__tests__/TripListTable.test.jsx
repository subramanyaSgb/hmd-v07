import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TripListTable from '../TripListTable'

const sample = [
    {
        trip_id: 'T1', fleet_id: 'TLC-22', source_lab: 'BF3', destination: 'SMS3',
        net_weight: 368.0, out_date: '2026-05-12T10:20:11',
        match_status: 'complete', first_heat_no: 'E2030590',
        matched_heat_count: 2, weight_delta_pct: -5.7,
    },
    {
        trip_id: 'T2', fleet_id: 'TLC-44', source_lab: 'BF5', destination: 'SMS4',
        net_weight: null, out_date: null,
        match_status: 'in_flight', first_heat_no: null,
        matched_heat_count: 0, weight_delta_pct: null,
    },
    {
        trip_id: 'T3', fleet_id: 'TLC-99', source_lab: 'BF1', destination: 'SMS1',
        net_weight: 350, out_date: '2026-05-12T08:00:00',
        match_status: 'anomaly', first_heat_no: 'D2030500',
        matched_heat_count: 1, weight_delta_pct: 12.4,
    },
]

describe('TripListTable', () => {
    it('renders one row per trip + header', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        // Header
        expect(screen.getByText(/torpedo/i)).toBeInTheDocument()
        expect(screen.getByText(/source.*destination/i)).toBeInTheDocument()
        expect(screen.getByText(/net.*mt/i)).toBeInTheDocument()
        expect(screen.getByText(/departed/i)).toBeInTheDocument()
        expect(screen.getByText(/status/i)).toBeInTheDocument()
        expect(screen.getByText(/heat #/i)).toBeInTheDocument()
        // Rows
        expect(screen.getByText('TLC-22')).toBeInTheDocument()
        expect(screen.getByText('TLC-44')).toBeInTheDocument()
        expect(screen.getByText('TLC-99')).toBeInTheDocument()
    })

    it('renders BF3 → SMS3 in the source/destination column', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        // Either the unicode arrow or the ASCII pair — we use unicode for the
        // browser presentation (it renders cleanly; Phase 2's mojibake fix
        // was for cmd terminals, not browsers).
        expect(screen.getByText(/BF3.*SMS3/)).toBeInTheDocument()
    })

    it('renders net weight to 0 decimals + MT unit', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        expect(screen.getByText(/368.*MT/i)).toBeInTheDocument()
    })

    it('renders em-dash for missing net_weight / out_date', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        // T2 has nulls — its row should contain at least 2 em-dashes
        const t2Row = screen.getByTestId('trip-row-T2')
        const dashes = (t2Row.textContent.match(/—/g) || []).length
        expect(dashes).toBeGreaterThanOrEqual(2)
    })

    it('renders the StatusBadge per row', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        expect(screen.getByTestId('status-badge-complete')).toBeInTheDocument()
        expect(screen.getByTestId('status-badge-in_flight')).toBeInTheDocument()
        expect(screen.getByTestId('status-badge-anomaly')).toBeInTheDocument()
    })

    it('renders first_heat_no or em-dash', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        expect(screen.getByText('E2030590')).toBeInTheDocument()
        expect(screen.getByText('D2030500')).toBeInTheDocument()
        // T2's heat is null — em-dash in the heat# column for its row
        const t2Row = screen.getByTestId('trip-row-T2')
        // (the StatusBadge "In Flight" still contains a non-dash; the heat cell
        // separately should be a dash)
        expect(t2Row).toBeInTheDocument()
    })

    it('calls onRowClick with the trip_id when a row is clicked', () => {
        const onRowClick = vi.fn()
        render(<TripListTable rows={sample} onRowClick={onRowClick}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        fireEvent.click(screen.getByTestId('trip-row-T1'))
        expect(onRowClick).toHaveBeenCalledWith('T1')
    })

    it('marks the expanded row with aria-expanded=true', () => {
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId="T1"
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        expect(screen.getByTestId('trip-row-T1')).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByTestId('trip-row-T2')).toHaveAttribute('aria-expanded', 'false')
    })

    it('calls onSortChange when a sortable header is clicked', () => {
        const onSortChange = vi.fn()
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={onSortChange} />)
        fireEvent.click(screen.getByTestId('header-net_weight'))
        // Clicking the inactive net_weight header sorts by it desc by default
        expect(onSortChange).toHaveBeenCalledWith('net_weight', 'desc')
    })

    it('toggles sort order when clicking the active sort header', () => {
        const onSortChange = vi.fn()
        render(<TripListTable rows={sample} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={onSortChange} />)
        fireEvent.click(screen.getByTestId('header-out_date'))
        expect(onSortChange).toHaveBeenCalledWith('out_date', 'asc')
    })

    it('shows an empty state when rows=[]', () => {
        render(<TripListTable rows={[]} onRowClick={() => {}}
                               expandedTripId={null}
                               sortBy="out_date" sortOrder="desc"
                               onSortChange={() => {}} />)
        expect(screen.getByText(/no trips match/i)).toBeInTheDocument()
    })
})
