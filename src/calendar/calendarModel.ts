/**
 * Phase 22 Addendum (§27.10) — Calendar model (framework-agnostic).
 *
 * Source of truth: PHASE-22-ADDENDUM-CALENDAR-AND-COUNTDOWN-POSITIONING-2026-06-03.
 *
 * Pure helpers that turn a target month + the granted "today" key into a
 * renderable monthly grid, and that derive per-day OG/GO completion status from
 * the player's recorded daily history. No React/DOM dependency so the grid math
 * and completion derivation are fully unit-testable.
 */

import { getDailyDateKey } from '../data/daily'
import { CALENDAR_START_DATE_KEY } from '../daily/pastDailies'
import type { StatisticsState } from '../stats/types'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export { WEEKDAY_LABELS }

export interface CalendarDay {
  /** `YYYY-MM-DD` key, or `null` for a padding cell outside the visible range. */
  readonly dateKey: string | null
  readonly dayOfMonth: number | null
  readonly inCurrentMonth: boolean
  /** The granted current daily day. */
  readonly isToday: boolean
  /** A future day (after today) — not yet playable. */
  readonly isFuture: boolean
  /** Before the fixed calendar start date — out of scope. */
  readonly isBeforeStart: boolean
  /** A playable past day (>= start date and < today). */
  readonly isPast: boolean
}

export interface CalendarMonth {
  readonly year: number
  /** Zero-based month index (0 = January). */
  readonly month: number
  readonly label: string
  readonly weeks: readonly (readonly CalendarDay[])[]
  readonly canGoPrev: boolean
  readonly canGoNext: boolean
}

export interface DailyCompletion {
  readonly og: ReadonlySet<string>
  readonly go: ReadonlySet<string>
}

/** Build a local `Date` (noon, to dodge DST edges) from a `YYYY-MM-DD` key. */
export function dateFromKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map((part) => Number.parseInt(part, 10))
  return new Date(year, (month ?? 1) - 1, (day ?? 1), 12, 0, 0, 0)
}

/** `{ year, month0 }` of the month containing `dateKey`. */
export function monthOfKey(dateKey: string): { readonly year: number; readonly month: number } {
  const date = dateFromKey(dateKey)
  return { year: date.getFullYear(), month: date.getMonth() }
}

/** Compare two `{year, month}` pairs: negative if a < b, 0 if equal, positive if a > b. */
function compareMonths(a: { year: number; month: number }, b: { year: number; month: number }): number {
  return a.year !== b.year ? a.year - b.year : a.month - b.month
}

/** Step a `{year, month0}` by `delta` months, normalizing overflow. */
export function addMonths(year: number, month: number, delta: number): { readonly year: number; readonly month: number } {
  const total = year * 12 + month + delta
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 }
}

export function getMonthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[((month % 12) + 12) % 12]} ${year}`
}

export interface BuildCalendarMonthOptions {
  readonly year: number
  readonly month: number
  readonly todayDateKey: string
  readonly startDateKey?: string
}

/**
 * Build a monthly calendar grid (weeks of seven days, Sunday-first). Days are
 * classified relative to the granted today key and the fixed start date so the
 * UI can render completion, lock, today, and out-of-range affordances.
 */
export function buildCalendarMonth({
  year,
  month,
  todayDateKey,
  startDateKey = CALENDAR_START_DATE_KEY,
}: BuildCalendarMonthOptions): CalendarMonth {
  const firstOfMonth = new Date(year, month, 1, 12, 0, 0, 0)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const leadingBlanks = firstOfMonth.getDay()

  const cells: CalendarDay[] = []
  for (let i = 0; i < leadingBlanks; i += 1) {
    cells.push(emptyDay())
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = getDailyDateKey(new Date(year, month, day, 12, 0, 0, 0))
    const isToday = dateKey === todayDateKey
    const isFuture = dateKey > todayDateKey
    const isBeforeStart = dateKey < startDateKey
    cells.push({
      dateKey,
      dayOfMonth: day,
      inCurrentMonth: true,
      isToday,
      isFuture,
      isBeforeStart,
      isPast: !isToday && !isFuture && !isBeforeStart,
    })
  }
  while (cells.length % 7 !== 0) {
    cells.push(emptyDay())
  }

  const weeks: CalendarDay[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  const current = { year, month }
  const startMonth = monthOfKey(startDateKey)
  const todayMonth = monthOfKey(todayDateKey)

  return {
    year,
    month,
    label: getMonthLabel(year, month),
    weeks,
    canGoPrev: compareMonths(current, startMonth) > 0,
    canGoNext: compareMonths(current, todayMonth) < 0,
  }
}

function emptyDay(): CalendarDay {
  return {
    dateKey: null,
    dayOfMonth: null,
    inCurrentMonth: false,
    isToday: false,
    isFuture: false,
    isBeforeStart: false,
    isPast: false,
  }
}

const DAILY_GAME_ID_PATTERN = /^(og|go):daily:(\d{4}-\d{2}-\d{2})$/

/**
 * Derive the set of completed daily date keys per mode from recorded game ids
 * (`og:daily:YYYY-MM-DD` / `go:daily:YYYY-MM-DD`). Used to badge each calendar
 * day with its OG and GO completion state.
 */
export function deriveDailyCompletion(completedGameIds: readonly string[]): DailyCompletion {
  const og = new Set<string>()
  const go = new Set<string>()
  for (const id of completedGameIds) {
    const match = DAILY_GAME_ID_PATTERN.exec(id)
    if (!match) {
      continue
    }
    if (match[1] === 'og') {
      og.add(match[2])
    } else {
      go.add(match[2])
    }
  }
  return { og, go }
}

export interface DailyStreaks {
  readonly ogCurrent: number
  readonly ogMax: number
  readonly goCurrent: number
  readonly goMax: number
}

/** Read the daily current/longest streaks for both modes from the stats state. */
export function getDailyStreaks(stats: StatisticsState): DailyStreaks {
  return {
    ogCurrent: stats.og.daily.currentStreak,
    ogMax: stats.og.daily.maxStreak,
    goCurrent: stats.go.daily.currentStreak,
    goMax: stats.go.daily.maxStreak,
  }
}
