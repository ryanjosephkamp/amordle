/**
 * Phase 22 — Timezone-aware daily clock helpers.
 *
 * Source of truth: PHASE-22-CALENDAR-MIDNIGHT-AND-BUGFIXES-SPEC-2026-06-02 / §27.
 *
 * The daily puzzle rolls over at **local midnight in the player's device
 * timezone**. The canonical day key continues to live in `src/data/daily.ts`
 * (`getDailyDateKey`), which now reads the local calendar fields; this module
 * adds the surrounding timing math (time-until-next-reset, formatting, device
 * timezone detection) used by the cross-page countdown indicator and the
 * reset-alert logic.
 *
 * Every function is pure and accepts an explicit `Date` (defaulting to
 * `new Date()`), so rollover behaviour is fully testable with mocked clocks.
 */

import { getDailyDateKey } from '../data/daily'

export const MS_PER_SECOND = 1_000
export const MS_PER_MINUTE = 60_000
export const MS_PER_HOUR = 3_600_000
export const MS_PER_DAY = 86_400_000

/**
 * Best-effort IANA timezone name for the current device, e.g.
 * `'America/New_York'`. Falls back to `'local'` when `Intl` is unavailable
 * (older browsers / constrained runtimes) so callers can always render a label.
 */
export function getDeviceTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return zone && zone.length > 0 ? zone : 'local'
  } catch {
    return 'local'
  }
}

/**
 * The `Date` of the next local midnight strictly after `date`. Built from the
 * device's local calendar fields so it honours the player's timezone (and any
 * DST transition the platform encodes into `Date`).
 */
export function getNextLocalMidnight(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0)
}

/**
 * Milliseconds remaining until the next local midnight (the next daily reset).
 * Always returns a value in `(0, MS_PER_DAY]`.
 */
export function getMillisUntilNextLocalMidnight(date = new Date()): number {
  return getNextLocalMidnight(date).getTime() - date.getTime()
}

function padDatePart(value: number): string {
  return `${value}`.padStart(2, '0')
}

/** UTC calendar key used by the Daily Multiplayer variant. */
export function getUtcDailyDateKey(date = new Date()): string {
  return [
    date.getUTCFullYear(),
    padDatePart(date.getUTCMonth() + 1),
    padDatePart(date.getUTCDate()),
  ].join('-')
}

/** The next midnight UTC strictly after `date`. */
export function getNextUtcMidnight(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1, 0, 0, 0, 0))
}

/** Milliseconds remaining until the next UTC reset for Daily Multiplayer. */
export function getMillisUntilNextUtcMidnight(date = new Date()): number {
  return getNextUtcMidnight(date).getTime() - date.getTime()
}

/**
 * Format a non-negative millisecond duration as a zero-padded `HH:MM:SS`
 * countdown string. Durations are clamped at 0; anything ≥ 24h is allowed to
 * show hours beyond 23 (it should not happen for a daily, but stays correct).
 */
export function formatCountdown(ms: number): string {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0
  const totalSeconds = Math.floor(safeMs / MS_PER_SECOND)
  const hours = Math.floor(totalSeconds / 3_600)
  const minutes = Math.floor((totalSeconds % 3_600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

/** Re-exported for convenience so daily-cycle consumers import from one place. */
export { getDailyDateKey }
