/**
 * Phase 22 Addendum (§27.10) — Past-daily domain helpers.
 *
 * Source of truth: PHASE-22-ADDENDUM-CALENDAR-AND-COUNTDOWN-POSITIONING-2026-06-03.
 *
 * The Calendar lets players unlock and play any *past* daily (OG or GO) for a
 * single fixed coin cost. This module owns the small, framework-agnostic facts
 * about that flow so the economy, persistence, game surfaces, and Calendar UI
 * all agree:
 *
 *  - the fixed unlock cost (identical for OG and GO),
 *  - the earliest date a past daily can ever be accessed,
 *  - the stable storage key for a permanently-unlocked daily, and
 *  - normalization of the persisted unlocked-daily list.
 *
 * It deliberately has no React/DOM dependency so it can be reused everywhere.
 */

import type { GameMode } from '../game/types'
import { getDailyDateKey } from '../data/daily'

/**
 * Fixed coin cost to unlock any single past daily, identical across OG and GO
 * modes. Confirmed by the user at 60 coins (within the suggested 50–75 band ≈
 * the coin earnings from ~5 average-performance practice games): non-trivial but
 * not discouraging exploration of the archive.
 */
export const PAST_DAILY_UNLOCK_COST = 60

/**
 * The earliest calendar day a player can ever access through the Calendar. Fixed
 * at January 1, 2025 (not a rolling window): days before this are out of scope.
 */
export const CALENDAR_START_DATE_KEY = '2025-01-01'

/**
 * A stable identifier for a single mode-specific daily instance, e.g.
 * `og:2025-03-04`. Used as the persistence key for the "permanently unlocked"
 * set once the player makes at least one guess on a past daily.
 */
export function pastDailyKey(mode: GameMode, dateKey: string): string {
  return `${mode}:${dateKey}`
}

/** True when `${mode}:${dateKey}` is present in the unlocked-daily list. */
export function isDailyUnlocked(
  unlockedDailies: readonly string[] | undefined,
  mode: GameMode,
  dateKey: string,
): boolean {
  if (!unlockedDailies || unlockedDailies.length === 0) {
    return false
  }
  return unlockedDailies.includes(pastDailyKey(mode, dateKey))
}

const UNLOCKED_DAILY_PATTERN = /^(og|go):\d{4}-\d{2}-\d{2}$/

/**
 * Coerce an untrusted persisted value into a de-duplicated list of valid
 * unlocked-daily keys (`og|go:YYYY-MM-DD`). Invalid entries are dropped so a
 * corrupt payload can never crash the Calendar or grant phantom unlocks.
 */
export function normalizeUnlockedDailies(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const seen = new Set<string>()
  for (const entry of raw) {
    if (typeof entry === 'string' && UNLOCKED_DAILY_PATTERN.test(entry)) {
      seen.add(entry)
    }
  }
  return Array.from(seen)
}

/**
 * Whether `dateKey` is strictly before the granted "today" key (i.e. a past
 * daily that requires unlocking). Today's daily is never a past daily.
 */
export function isPastDailyDateKey(dateKey: string, todayDateKey: string): boolean {
  return dateKey < todayDateKey
}

/** Re-exported so past-daily consumers import date keys from one place. */
export { getDailyDateKey }
