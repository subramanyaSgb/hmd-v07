import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TripStoryExpanded from '../TripStoryExpanded'

const sample = () => ({
    trip: {
        trip_id: 'T1', fleet_id: 'TLC-22',
        source_lab: 'BF3', destination: 'SMS3',
        tap_no: 8338,
        net_weight: 368.0, gross_weight: 700.9, tare_weight: 337.0,
        temp: 1483.0, si_l: 0.385, s_l: 0.05,
        shift: 'A',
        first_tare_time: '2026-05-12T14:23:00',
        out_date: '2026-05-12T14:35:00',
        closetime: '2026-05-12T15:02:00',
    },
    matched_heats: [
        { heat_no: 'E2030590', converter_no: 'E', sms: 'SMS3',
          torpedo_no: 'TLC-22', torpedo_no_raw: '22',
          hotmetal_qty: 172.0, torpedo_qty: 340.0,
          torpedo_in_time: '2026-05-12T15:30:00',
          torpedo_out_time: '2026-05-12T15:50:00',
          converter_life: 350 },
        { heat_no: 'G2030594', converter_no: 'G', sms: 'SMS3',
          torpedo_no: 'TLC-22', torpedo_no_raw: '22',
          hotmetal_qty: 175.0, torpedo_qty: 340.0,
          torpedo_in_time: '2026-05-12T16:10:00',
          torpedo_out_time: null,
          converter_life: 200 },
    ],
    current_torpedo_position: {
        fleet_id: 'TLC-22', type: 'torpedo', x: 12.3, y: 45.6,
        last_updated: '2026-05-12T16:15:00',
        current_status: 'Moving',
    },
    anomaly_flags: [],
    last_sync_at: { wbatngl: '2026-05-12T16:00:00', hts: null },
})

describe('TripStoryExpanded', () => {
    it('renders all 6 stepper stages', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        for (const stage of ['TAP', 'LOAD', 'DEPART', 'ARRIVE', 'POUR', 'CLOSE']) {
            expect(screen.getByText(stage)).toBeInTheDocument()
        }
    })

    it('renders TAP stage with source_lab + first_tare_time', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        const tapStage = screen.getByTestId('stage-TAP')
        expect(tapStage).toHaveTextContent('BF3')
    })

    it('renders LOAD stage with torpedo + net_weight', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        const loadStage = screen.getByTestId('stage-LOAD')
        expect(loadStage).toHaveTextContent('TLC-22')
        expect(loadStage).toHaveTextContent(/368/)
    })

    it('renders POUR stage with first matched heat_no + hotmetal_qty', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        const pourStage = screen.getByTestId('stage-POUR')
        expect(pourStage).toHaveTextContent('E2030590')
        expect(pourStage).toHaveTextContent(/172/)
    })

    it('renders chemistry pills with temp + S + Si', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        expect(screen.getByText(/1483/)).toBeInTheDocument()       // temp
        expect(screen.getByText(/0\.05/)).toBeInTheDocument()      // s_l
        expect(screen.getByText(/0\.385/)).toBeInTheDocument()     // si_l
    })

    it('renders current torpedo position when present', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        expect(screen.getByText(/current position/i)).toBeInTheDocument()
        expect(screen.getByText(/moving/i)).toBeInTheDocument()
    })

    it('renders matched heats count and list', () => {
        render(<TripStoryExpanded data={sample()} loading={false} error={null} />)
        expect(screen.getByText(/matched heats.*2/i)).toBeInTheDocument()
        // E2030590 appears twice (POUR stage line + matched heats list);
        // G2030594 appears only in the heats list.
        expect(screen.getAllByText('E2030590').length).toBeGreaterThanOrEqual(1)
        expect(screen.getByText('G2030594')).toBeInTheDocument()
    })

    it('renders an empty-heats message when matched_heats=[]', () => {
        const data = sample()
        data.matched_heats = []
        render(<TripStoryExpanded data={data} loading={false} error={null} />)
        expect(screen.getByText(/no matched heats/i)).toBeInTheDocument()
    })

    it('renders anomaly_flags when present', () => {
        const data = sample()
        data.anomaly_flags = [
            { code: 'weight_delta', severity: 'warn',
              message: 'Weight anomaly: WBATNGL 368 MT, HTS sum 412 MT (+44 MT, +12.0%)' },
        ]
        render(<TripStoryExpanded data={data} loading={false} error={null} />)
        expect(screen.getByText(/weight anomaly/i)).toBeInTheDocument()
        expect(screen.getByText(/\+12/)).toBeInTheDocument()
    })

    it('renders a loading state', () => {
        render(<TripStoryExpanded data={null} loading={true} error={null} />)
        expect(screen.getByText(/loading trip/i)).toBeInTheDocument()
    })

    it('renders an error state', () => {
        render(<TripStoryExpanded data={null} loading={false} error="not found" />)
        expect(screen.getByText(/not found|error/i)).toBeInTheDocument()
    })

    it('renders nothing when data is null and not loading and no error', () => {
        const { container } = render(<TripStoryExpanded data={null} loading={false} error={null} />)
        expect(container).toBeEmptyDOMElement()
    })
})
