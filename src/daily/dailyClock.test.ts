import { describe, expect, it } from 'vitest'
import {
  MS_PER_DAY,
  formatCountdown,
  getDailyDateKey,
  getDeviceTimeZone,
  getMillisUntilNextLocalMidnight,
  getMillisUntilNextUtcMidnight,
  getNextLocalMidnight,
  getNextUtcMidnight,
  getUtcDailyDateKey,
} from './dailyClock'

describe('dailyClock', () => {
  it('derives the date key from the local calendar day', () => {
    expect(getDailyDateKey(new Date(2026, 0, 5, 0, 0, 0))).toBe('2026-01-05')
    expect(getDailyDateKey(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31')
  })

  it('returns the next local midnight strictly after the given time', () => {
    const next = getNextLocalMidnight(new Date(2026, 4, 26, 9, 30, 0))
    expect(next.getFullYear()).toBe(2026)
    expect(next.getMonth()).toBe(4)
    expect(next.getDate()).toBe(27)
    expect(next.getHours()).toBe(0)
    expect(next.getMinutes()).toBe(0)
    expect(next.getSeconds()).toBe(0)
  })

  it('computes the milliseconds remaining until the next local midnight', () => {
    const at = new Date(2026, 4, 26, 23, 0, 0)
    expect(getMillisUntilNextLocalMidnight(at)).toBe(60 * 60 * 1000)

    const justAfterMidnight = new Date(2026, 4, 26, 0, 0, 0)
    const ms = getMillisUntilNextLocalMidnight(justAfterMidnight)
    expect(ms).toBeGreaterThan(0)
    expect(ms).toBeLessThanOrEqual(MS_PER_DAY)
  })

  it('derives UTC daily keys and reset timing for multiplayer dailies', () => {
    const lateUtc = new Date('2026-05-26T23:30:00.000Z')
    expect(getUtcDailyDateKey(lateUtc)).toBe('2026-05-26')
    expect(getNextUtcMidnight(lateUtc).toISOString()).toBe('2026-05-27T00:00:00.000Z')
    expect(getMillisUntilNextUtcMidnight(lateUtc)).toBe(30 * 60 * 1000)
  })

  it('formats durations as zero-padded HH:MM:SS', () => {
    expect(formatCountdown(0)).toBe('00:00:00')
    expect(formatCountdown(-5)).toBe('00:00:00')
    expect(formatCountdown(1000)).toBe('00:00:01')
    expect(formatCountdown(61 * 1000)).toBe('00:01:01')
    expect(formatCountdown((2 * 3600 + 3 * 60 + 4) * 1000)).toBe('02:03:04')
  })

  it('always returns a non-empty timezone label', () => {
    expect(getDeviceTimeZone().length).toBeGreaterThan(0)
  })
})
