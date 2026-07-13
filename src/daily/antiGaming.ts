/**
 * Phase 22 — Balanced anti-gaming guard for the daily reset.
 *
 * Source of truth: PHASE-22-CALENDAR-MIDNIGHT-AND-BUGFIXES-SPEC-2026-06-02 / §27.3.
 *
 * Goal: make *casual* gaming of the daily reset (changing the device clock to
 * unlock a future daily) ineffective, **without** being overly strict — normal
 * drift, small adjustments (±~2h), and the legitimate local-midnight rollover
 * must all keep working.
 *
 * Technique (the reliable, false-positive-resistant signal): compare the
 * advance of the user-settable **wall clock** (`Date.now`) against the advance
 * of the **monotonic clock** (`performance.now`), which the user cannot move and
 * which keeps ticking with real elapsed time while the page is open. When the
 * wall clock jumps forward far more than the monotonic clock did (a large
 * "clock jump"), the new day is treated as suspicious and the previously
 * granted daily is held until the clock returns to a consistent value.
 *
 * Across a cold page load there is no monotonic baseline to compare against, so
 * we fall back to trusting the wall clock (there is no bankable advantage — only
 * ever one daily exists per calendar day — and false-positiving returning
 * players would be far worse than tolerating a rare cold-open adjustment).
 *
 * The pure `evaluateDailyGuard` carries no side effects and accepts every time
 * input explicitly, so all rollover / clamp / drift scenarios are unit-testable
 * with mocked clocks.
 */

import type { KeyValueStorage } from '../game/storage/dailyOgStorage'
import { MS_PER_DAY, MS_PER_HOUR } from './dailyClock'

export interface AntiGamingConfig {
  /**
   * Wall-vs-monotonic divergence (a forward "clock jump") at or above which a
   * newly-presented day is treated as gamed and clamped. Defaults to 12h — the
   * lower bound of the spec's "~12–24h" window — so genuine rollovers and small
   * adjustments stay well clear of it.
   */
  readonly clockJumpClampMs: number
}

export const DEFAULT_ANTI_GAMING_CONFIG: AntiGamingConfig = {
  clockJumpClampMs: 12 * MS_PER_HOUR,
}

export interface DailyGuardAnchor {
  /** The dateKey currently granted to the player. */
  readonly grantedDateKey: string
  /** Wall-clock reading (ms) captured when this anchor was last accepted. */
  readonly anchorWallMs: number
  /**
   * Monotonic reading (`performance.now`, ms) when the anchor was set, or
   * `null` if it was restored from a previous session (no live baseline).
   */
  readonly anchorMonotonicMs: number | null
  /** Identifies the live page session that owns `anchorMonotonicMs`. */
  readonly sessionId: string
}

export type DailyGuardReason =
  | 'initial'
  | 'same-day'
  | 'rollover'
  | 'forward-jump-clamped'
  | 'backward-hold'

export interface EvaluateGuardInput {
  /** Local calendar day key derived from the current wall clock. */
  readonly rawDateKey: string
  readonly nowWallMs: number
  /** `performance.now()` reading, or `null` when unavailable. */
  readonly nowMonotonicMs: number | null
  /** Stable id for the current live page session. */
  readonly sessionId: string
  readonly previous: DailyGuardAnchor | null
  readonly config?: AntiGamingConfig
}

export interface EvaluateGuardResult {
  /** The dateKey the player is actually allowed to play. */
  readonly grantedDateKey: string
  readonly rawDateKey: string
  /** True when a suspicious forward jump caused the raw day to be withheld. */
  readonly clamped: boolean
  readonly reason: DailyGuardReason
  readonly anchor: DailyGuardAnchor
}

/** Calendar-day difference (`b - a`) between two `YYYY-MM-DD` keys. */
export function diffDateKeys(a: string, b: string): number {
  return Math.round((parseDateKeyUtc(b) - parseDateKeyUtc(a)) / MS_PER_DAY)
}

function parseDateKeyUtc(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map((part) => Number.parseInt(part, 10))
  return Date.UTC(year, (month ?? 1) - 1, day ?? 1)
}

/**
 * Pure, side-effect-free evaluation of the balanced anti-gaming policy.
 * Returns the granted dateKey plus the next anchor to persist.
 */
export function evaluateDailyGuard(input: EvaluateGuardInput): EvaluateGuardResult {
  const config = input.config ?? DEFAULT_ANTI_GAMING_CONFIG
  const { rawDateKey, nowWallMs, nowMonotonicMs, sessionId, previous } = input

  const freshAnchor: DailyGuardAnchor = {
    grantedDateKey: rawDateKey,
    anchorWallMs: nowWallMs,
    anchorMonotonicMs: nowMonotonicMs,
    sessionId,
  }

  if (!previous) {
    return { grantedDateKey: rawDateKey, rawDateKey, clamped: false, reason: 'initial', anchor: freshAnchor }
  }

  const daysDelta = diffDateKeys(previous.grantedDateKey, rawDateKey)

  // Same calendar day: refresh the anchor so the next jump is measured from the
  // most recent observation, but keep the granted day unchanged.
  if (daysDelta === 0) {
    return { grantedDateKey: previous.grantedDateKey, rawDateKey, clamped: false, reason: 'same-day', anchor: freshAnchor }
  }

  // Backward movement: never regress to an older daily. Hold the granted day and
  // re-anchor from "now" so a later return to real time is measured cleanly.
  if (daysDelta < 0) {
    return {
      grantedDateKey: previous.grantedDateKey,
      rawDateKey,
      clamped: false,
      reason: 'backward-hold',
      anchor: { ...freshAnchor, grantedDateKey: previous.grantedDateKey },
    }
  }

  // Forward into a new day. If we have a live monotonic baseline from the same
  // session, verify the wall clock did not jump far ahead of real elapsed time.
  const hasLiveBaseline =
    nowMonotonicMs != null &&
    previous.anchorMonotonicMs != null &&
    previous.sessionId === sessionId

  if (hasLiveBaseline) {
    const wallElapsed = nowWallMs - previous.anchorWallMs
    const monotonicElapsed = (nowMonotonicMs as number) - (previous.anchorMonotonicMs as number)
    const clockJump = wallElapsed - monotonicElapsed
    if (clockJump >= config.clockJumpClampMs) {
      // Suspicious forward jump: hold the previous daily and keep the anchor
      // intact so reverting the clock automatically clears the clamp.
      return {
        grantedDateKey: previous.grantedDateKey,
        rawDateKey,
        clamped: true,
        reason: 'forward-jump-clamped',
        anchor: previous,
      }
    }
  }

  // Legitimate rollover (or a tolerated small forward adjustment / cold open).
  return { grantedDateKey: rawDateKey, rawDateKey, clamped: false, reason: 'rollover', anchor: freshAnchor }
}

function guardStorageKey(storagePrefix: string): string {
  return `${storagePrefix}:guard:v1`
}

export function loadDailyGuardAnchor(storage: KeyValueStorage | undefined, storagePrefix: string): DailyGuardAnchor | null {
  const raw = storage?.getItem(guardStorageKey(storagePrefix))
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DailyGuardAnchor>
    if (typeof parsed.grantedDateKey !== 'string' || typeof parsed.anchorWallMs !== 'number') {
      return null
    }
    return {
      grantedDateKey: parsed.grantedDateKey,
      anchorWallMs: parsed.anchorWallMs,
      // A persisted anchor never carries a live monotonic baseline.
      anchorMonotonicMs: null,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : '',
    }
  } catch {
    return null
  }
}

export function saveDailyGuardAnchor(
  anchor: DailyGuardAnchor,
  storage: KeyValueStorage | undefined,
  storagePrefix: string,
): void {
  storage?.setItem(guardStorageKey(storagePrefix), JSON.stringify(anchor))
}

export function clearDailyGuardAnchor(storage: KeyValueStorage | undefined, storagePrefix: string): void {
  storage?.removeItem(guardStorageKey(storagePrefix))
}
