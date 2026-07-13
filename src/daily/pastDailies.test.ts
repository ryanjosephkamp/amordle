import { describe, expect, it } from 'vitest'
import {
  CALENDAR_START_DATE_KEY,
  PAST_DAILY_UNLOCK_COST,
  isDailyUnlocked,
  isPastDailyDateKey,
  normalizeUnlockedDailies,
  pastDailyKey,
} from './pastDailies'

describe('past daily helpers', () => {
  it('fixes the unlock cost at 60 coins and the start date at 2025-01-01', () => {
    expect(PAST_DAILY_UNLOCK_COST).toBe(60)
    expect(CALENDAR_START_DATE_KEY).toBe('2025-01-01')
  })

  it('builds a stable mode-specific key', () => {
    expect(pastDailyKey('og', '2025-03-04')).toBe('og:2025-03-04')
    expect(pastDailyKey('go', '2025-03-04')).toBe('go:2025-03-04')
  })

  it('detects unlocked dailies by mode and date', () => {
    const unlocked = ['og:2025-03-04', 'go:2025-04-01']
    expect(isDailyUnlocked(unlocked, 'og', '2025-03-04')).toBe(true)
    expect(isDailyUnlocked(unlocked, 'go', '2025-03-04')).toBe(false)
    expect(isDailyUnlocked(unlocked, 'go', '2025-04-01')).toBe(true)
    expect(isDailyUnlocked(undefined, 'og', '2025-03-04')).toBe(false)
    expect(isDailyUnlocked([], 'og', '2025-03-04')).toBe(false)
  })

  it('normalizes an untrusted unlocked-daily list, dropping invalid entries and duplicates', () => {
    expect(
      normalizeUnlockedDailies([
        'og:2025-03-04',
        'og:2025-03-04',
        'go:2025-04-01',
        'xx:2025-04-01',
        'og:not-a-date',
        42,
        null,
      ]),
    ).toEqual(['og:2025-03-04', 'go:2025-04-01'])
    expect(normalizeUnlockedDailies(undefined)).toEqual([])
    expect(normalizeUnlockedDailies('og:2025-03-04')).toEqual([])
  })

  it('treats only strictly-earlier dates as past dailies', () => {
    expect(isPastDailyDateKey('2025-03-03', '2025-03-04')).toBe(true)
    expect(isPastDailyDateKey('2025-03-04', '2025-03-04')).toBe(false)
    expect(isPastDailyDateKey('2025-03-05', '2025-03-04')).toBe(false)
  })
})
