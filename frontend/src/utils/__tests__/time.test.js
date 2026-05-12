import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatRelative } from '../time'

describe('formatRelative', () => {
    const NOW = new Date('2026-05-12T12:00:00Z').getTime()

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(NOW))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('returns em-dash for null', () => {
        expect(formatRelative(null)).toBe('—')
    })

    it('returns em-dash for undefined', () => {
        expect(formatRelative(undefined)).toBe('—')
    })

    it('returns em-dash for empty string', () => {
        expect(formatRelative('')).toBe('—')
    })

    it('returns em-dash for unparseable date string', () => {
        expect(formatRelative('not a date')).toBe('—')
    })

    it('formats seconds-ago', () => {
        const fiveSecAgo = new Date(NOW - 5_000).toISOString()
        expect(formatRelative(fiveSecAgo)).toBe('5s ago')
    })

    it('formats minutes-ago', () => {
        const sevenMinAgo = new Date(NOW - 7 * 60_000).toISOString()
        expect(formatRelative(sevenMinAgo)).toBe('7m ago')
    })

    it('formats hours-ago', () => {
        const threeHoursAgo = new Date(NOW - 3 * 3600_000).toISOString()
        expect(formatRelative(threeHoursAgo)).toBe('3h ago')
    })

    it('formats days-ago beyond 24h', () => {
        const twoDaysAgo = new Date(NOW - 2 * 86400_000).toISOString()
        expect(formatRelative(twoDaysAgo)).toBe('2d ago')
    })

    it('clamps future timestamps to 0s ago (no negative readings)', () => {
        const future = new Date(NOW + 60_000).toISOString()
        expect(formatRelative(future)).toBe('0s ago')
    })
})
