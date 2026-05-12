import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import useTripDetail from '../useTripDetail'

vi.mock('../../../utils/api', () => ({
    api: { get: vi.fn() },
}))

import { api } from '../../../utils/api'

const sample = () => ({
    trip: { trip_id: 'T1', fleet_id: 'TLC-22' },
    matched_heats: [],
    current_torpedo_position: null,
    anomaly_flags: [],
    last_sync_at: { wbatngl: null, hts: null },
})

describe('useTripDetail', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // shouldAdvanceTime lets waitFor's internal setTimeout retry loop
        // run on the real clock while we still control the polling interval
        // explicitly via advanceTimersByTime. Without this, fake-timer mode
        // would block waitFor entirely.
        vi.useFakeTimers({ shouldAdvanceTime: true })
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns null until a trip_id is provided', () => {
        const { result } = renderHook(() => useTripDetail(null))
        expect(result.current.data).toBeNull()
        expect(result.current.error).toBeNull()
        expect(result.current.loading).toBe(false)
        expect(api.get).not.toHaveBeenCalled()
    })

    it('fetches /api/trip-history-live/:trip_id when trip_id changes', async () => {
        api.get.mockResolvedValueOnce(sample())
        const { result } = renderHook(() => useTripDetail('T1'))
        await waitFor(() => {
            expect(result.current.data).not.toBeNull()
        })
        expect(api.get).toHaveBeenCalledWith('/api/trip-history-live/T1')
        expect(result.current.data.trip.trip_id).toBe('T1')
    })

    it('polls every 10 seconds while trip_id remains set', async () => {
        api.get.mockResolvedValue(sample())
        renderHook(() => useTripDetail('T1'))
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(1)
        })
        await act(async () => { vi.advanceTimersByTime(10_000) })
        expect(api.get).toHaveBeenCalledTimes(2)
        await act(async () => { vi.advanceTimersByTime(10_000) })
        expect(api.get).toHaveBeenCalledTimes(3)
    })

    it('stops polling when trip_id becomes null', async () => {
        api.get.mockResolvedValue(sample())
        const { rerender } = renderHook(({ id }) => useTripDetail(id), {
            initialProps: { id: 'T1' },
        })
        await waitFor(() => {
            expect(api.get).toHaveBeenCalledTimes(1)
        })
        rerender({ id: null })
        await act(async () => { vi.advanceTimersByTime(30_000) })
        // No new calls after the unmount of the previous effect
        expect(api.get).toHaveBeenCalledTimes(1)
    })

    it('surfaces error message on api rejection', async () => {
        api.get.mockRejectedValueOnce(new Error('not found'))
        const { result } = renderHook(() => useTripDetail('T_BAD'))
        await waitFor(() => {
            expect(result.current.error).toBe('not found')
        })
    })

    it('clears error on next successful poll', async () => {
        api.get.mockRejectedValueOnce(new Error('boom'))
        api.get.mockResolvedValueOnce(sample())
        const { result } = renderHook(() => useTripDetail('T1'))
        await waitFor(() => {
            expect(result.current.error).toBe('boom')
        })
        await act(async () => { vi.advanceTimersByTime(10_000) })
        await waitFor(() => {
            expect(result.current.error).toBeNull()
            expect(result.current.data).not.toBeNull()
        })
    })
})
