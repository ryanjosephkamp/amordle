/**
 * Phase 22 — Daily variant descriptor (modular multiplayer preparation).
 *
 * Source of truth: PHASE-22-CALENDAR-MIDNIGHT-AND-BUGFIXES-SPEC-2026-06-02 / §27
 * goal 7: "Design the daily reset / rollover logic modularly so it can later
 * support a special multiplayer daily variant with separate statistics.
 *
 * This module introduces a single seam — the `DailyVariant` — that the rollover
 * service, countdown, and anti-gaming guard are parameterised by. Phase 23 adds
 * the `'multiplayer'` variant with its own UTC reset, storage namespace, and UI
 * labels while keeping solo daily rollover unchanged.
 */

export type DailyVariant = 'solo' | 'multiplayer'

export interface DailyVariantDescriptor {
  /** Stable identifier used in storage keys and analytics. */
  readonly id: DailyVariant
  /** Human-readable label for UI surfaces. */
  readonly label: string
  /** Reset clock used to derive the raw daily key and countdown deadline. */
  readonly resetClock: 'local' | 'utc'
  /** Countdown headline while the variant is waiting for its next reset. */
  readonly countdownLabel: string
  /** Countdown headline while the variant has just reset. */
  readonly readyLabel: string
  /** Human-readable deadline label rendered in the countdown and Settings copy. */
  readonly deadlineLabel: string
  /** Timezone label rendered beside the countdown value. */
  readonly timeZoneLabel: string
  /**
   * Storage-key prefix that namespaces this variant's persisted state (resume
   * slots, anti-gaming anchor, etc.). Keeping the prefix per-variant is what
   * lets a future multiplayer daily keep *separate statistics* without
   * colliding with the solo daily.
   */
  readonly storagePrefix: string
}

export const SOLO_DAILY_VARIANT: DailyVariantDescriptor = {
  countdownLabel: 'Next daily',
  deadlineLabel: 'Local midnight',
  id: 'solo',
  label: 'Daily',
  readyLabel: 'New daily ready',
  resetClock: 'local',
  storagePrefix: 'brrrdle:daily',
  timeZoneLabel: 'local',
}

export const MULTIPLAYER_DAILY_VARIANT: DailyVariantDescriptor = {
  countdownLabel: 'Daily multiplayer',
  deadlineLabel: 'UTC midnight',
  id: 'multiplayer',
  label: 'Daily Multiplayer',
  readyLabel: 'Daily multiplayer ready',
  resetClock: 'utc',
  storagePrefix: 'brrrdle:daily-multiplayer',
  timeZoneLabel: 'UTC',
}

export const DAILY_VARIANTS: Readonly<Record<DailyVariant, DailyVariantDescriptor>> = {
  multiplayer: MULTIPLAYER_DAILY_VARIANT,
  solo: SOLO_DAILY_VARIANT,
}

export const DEFAULT_DAILY_VARIANT: DailyVariant = 'solo'

export function getDailyVariantDescriptor(variant: DailyVariant = DEFAULT_DAILY_VARIANT): DailyVariantDescriptor {
  return DAILY_VARIANTS[variant] ?? SOLO_DAILY_VARIANT
}
