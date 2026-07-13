import { describe, expect, it } from 'vitest'
import {
  addMonths,
  buildCalendarMonth,
  dateFromKey,
  deriveDailyCompletion,
  getDailyStreaks,
  getMonthLabel,
  monthOfKey,
} from './calendarModel'
import { CALENDAR_START_DATE_KEY } from '../daily/pastDailies'
import { getDailyDateKey } from '../data/daily'
import { createEmptyStatistics } from '../stats/statistics'

describe('calendarModel date helpers', () => {
  it('round-trips a date key through dateFromKey and getDailyDateKey', () => {
    expect(getDailyDateKey(dateFromKey('2025-03-07'))).toBe('2025-03-07')
  })

  it('reports the month containing a key', () => {
    expect(monthOfKey('2025-01-01')).toEqual({ year: 2025, month: 0 })
    expect(monthOfKey('2026-12-31')).toEqual({ year: 2026, month: 11 })
  })

  it('steps months with overflow normalization', () => {
    expect(addMonths(2025, 0, -1)).toEqual({ year: 2024, month: 11 })
    expect(addMonths(2025, 11, 1)).toEqual({ year: 2026, month: 0 })
    expect(addMonths(2025, 5, 0)).toEqual({ year: 2025, month: 5 })
  })

  it('formats a human month label', () => {
    expect(getMonthLabel(2025, 0)).toBe('January 2025')
    expect(getMonthLabel(2025, 11)).toBe('December 2025')
  })
})

describe('buildCalendarMonth', () => {
  it('lays out a month as Sunday-first weeks with correct day classification', () => {
    const month = buildCalendarMonth({ year: 2025, month: 2, todayDateKey: '2025-03-15' })
    // March 2025 starts on a Saturday → 6 leading blanks.
    expect(month.label).toBe('March 2025')
    expect(month.weeks[0][0].dateKey).toBeNull()
    expect(month.weeks[0][6].dateKey).toBe('2025-03-01')

    const allDays = month.weeks.flat().filter((day) => day.dateKey !== null)
    expect(allDays).toHaveLength(31)

    const today = allDays.find((day) => day.dateKey === '2025-03-15')
    expect(today?.isToday).toBe(true)
    expect(today?.isPast).toBe(false)
    expect(today?.isFuture).toBe(false)

    const past = allDays.find((day) => day.dateKey === '2025-03-10')
    expect(past?.isPast).toBe(true)

    const future = allDays.find((day) => day.dateKey === '2025-03-20')
    expect(future?.isFuture).toBe(true)
    expect(future?.isPast).toBe(false)
  })

  it('marks days before the fixed start date as out of scope', () => {
    const month = buildCalendarMonth({ year: 2024, month: 11, todayDateKey: '2025-06-01' })
    const beforeStart = month.weeks.flat().find((day) => day.dateKey === '2024-12-31')
    expect(beforeStart?.isBeforeStart).toBe(true)
    expect(beforeStart?.isPast).toBe(false)
  })

  it('clamps navigation between the start month and today month', () => {
    const startMonth = buildCalendarMonth({
      year: 2025,
      month: 0,
      todayDateKey: '2025-06-15',
      startDateKey: CALENDAR_START_DATE_KEY,
    })
    expect(startMonth.canGoPrev).toBe(false)
    expect(startMonth.canGoNext).toBe(true)

    const todayMonth = buildCalendarMonth({ year: 2025, month: 5, todayDateKey: '2025-06-15' })
    expect(todayMonth.canGoNext).toBe(false)
    expect(todayMonth.canGoPrev).toBe(true)
  })
})

describe('deriveDailyCompletion', () => {
  it('separates OG and GO completed daily dates and ignores other ids', () => {
    const completion = deriveDailyCompletion([
      'og:daily:2025-03-01',
      'go:daily:2025-03-01',
      'og:daily:2025-03-02',
      'og:practice:abc',
      'go:daily:not-a-date',
      'random',
    ])
    expect([...completion.og].sort()).toEqual(['2025-03-01', '2025-03-02'])
    expect([...completion.go]).toEqual(['2025-03-01'])
  })
})

describe('getDailyStreaks', () => {
  it('reads both modes from the daily stat buckets', () => {
    const stats = createEmptyStatistics()
    expect(getDailyStreaks(stats)).toEqual({ ogCurrent: 0, ogMax: 0, goCurrent: 0, goMax: 0 })
  })
})
