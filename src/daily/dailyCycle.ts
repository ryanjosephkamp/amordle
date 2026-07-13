/**
 * Phase 22 — Daily cycle core (framework-agnostic).
 *
 * Source of truth: PHASE-22-CALENDAR-MIDNIGHT-AND-BUGFIXES-SPEC-2026-06-02 / §27.
 *
 * This is the single, modular seam that resolves "which daily is the player
 * allowed to play right now?" — combining the timezone-aware local-midnight
 * clock (`dailyClock`), the balanced anti-gaming guard (`antiGaming`), and a
 * per-variant storage namespace (`dailyVariant`). It is deliberately free of any
 * React or DOM dependency so it can be reused by:
 *   - the React countdown / reset-alert hook (`useDailyCycle`), and
 *   - the daily game surfaces (so a clamped/granted day actually gates the
 *     puzzle that is generated), and
 *   - a future multiplayer daily variant (by passing a different `variant`).
 */

import type { KeyValueStorage } from '../game/storage/dailyOgStorage'
import {
  DEFAULT_ANTI_GAMING_CONFIG,
  evaluateDailyGuard,
  loadDailyGuardAnchor,
  saveDailyGuardAnchor,
  type AntiGamingConfig,
  type DailyGuardAnchor,
  type DailyGuardReason,
} from './antiGaming'
import {
  getDailyDateKey,
  getMillisUntilNextLocalMidnight,
  getMillisUntilNextUtcMidnight,
  getNextLocalMidnight,
  getNextUtcMidnight,
  getUtcDailyDateKey,
} from './dailyClock'
import { getDailyVariantDescriptor, type DailyVariant } from './dailyVariant'
import { getDailyNow, type DailyNow } from './simulatedClock'

/** A stable id for the current live page session (one per module load). */
function createDailySessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Non-security identifier: it only distinguishes the current live page session
  // (with its monotonic baseline) from a persisted/reloaded anchor. Cryptographic
  // randomness is unnecessary, so derive uniqueness from time sources instead.
  const monotonic = typeof performance !== 'undefined' ? performance.now() : 0
  return `s-${Date.now().toString(36)}-${Math.trunc(monotonic * 1000).toString(36)}`
}

export const DAILY_SESSION_ID: string = createDailySessionId()

function getBrowserStorage(): KeyValueStorage | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  return window.localStorage
}

/**
 * The live, in-memory guard anchors for the current page session. Unlike the
 * persisted anchor (which loses its monotonic baseline across reloads), this
 * keeps the `performance.now` baseline alive so the wall-vs-monotonic clock-jump
 * check actually works within a single page load. Anchors are keyed by variant:
 * solo local-midnight and multiplayer UTC dailies must never reuse each other's
 * guard baseline.
 */
let liveAnchors: Partial<Record<DailyVariant, DailyGuardAnchor>> = {}

/** Test-only: clear the in-memory live anchor so cases start from a clean slate. */
export function resetDailyLiveAnchor(): void {
  liveAnchors = {}
}

export interface ResolveDailyOptions {
  readonly variant?: DailyVariant
  readonly storage?: KeyValueStorage
  readonly sessionId?: string
  readonly now?: DailyNow
  readonly config?: AntiGamingConfig
  /**
   * Explicit previous anchor. When provided (including `null`), it overrides both
   * the in-memory live anchor and the persisted anchor. Used for deterministic
   * tests and for callers that thread their own anchor.
   */
  readonly previousAnchor?: DailyGuardAnchor | null
}

export interface ResolvedDaily {
  /** The dateKey the player may actually play (after anti-gaming clamping). */
  readonly grantedDateKey: string
  /** The unguarded dateKey derived from the (possibly gamed) device clock. */
  readonly rawDateKey: string
  /** True when a suspicious forward jump is currently withholding a new daily. */
  readonly clamped: boolean
  readonly reason: DailyGuardReason
  /** Milliseconds until the next local-midnight reset. */
  readonly msUntilReset: number
  /** Epoch ms of the next local-midnight reset. */
  readonly nextResetAt: number
  /** The anchor that was persisted for this evaluation. */
  readonly anchor: DailyGuardAnchor
  readonly now: DailyNow
}

/**
 * Resolve the current daily state: read the (optionally simulated) clock, apply
 * the anti-gaming guard against the persisted anchor, persist any new anchor,
 * and compute the countdown to the next local midnight.
 */
export function resolveDaily(options: ResolveDailyOptions = {}): ResolvedDaily {
  const variant = getDailyVariantDescriptor(options.variant)
  const storage = options.storage ?? getBrowserStorage()
  const sessionId = options.sessionId ?? DAILY_SESSION_ID
  const now = options.now ?? getDailyNow()
  const config = options.config ?? DEFAULT_ANTI_GAMING_CONFIG

  // Default callers (no explicit storage/anchor) share the in-memory live anchor
  // so the monotonic baseline survives across calls within one page session.
  const usingSharedLiveAnchor = options.storage === undefined && options.previousAnchor === undefined

  let previous: DailyGuardAnchor | null
  if (options.previousAnchor !== undefined) {
    previous = options.previousAnchor
  } else if (usingSharedLiveAnchor && liveAnchors[variant.id]?.sessionId === sessionId) {
    previous = liveAnchors[variant.id] ?? null
  } else {
    previous = loadDailyGuardAnchor(storage, variant.storagePrefix)
  }

  const rawDateKey = variant.resetClock === 'utc' ? getUtcDailyDateKey(now.date) : getDailyDateKey(now.date)
  const result = evaluateDailyGuard({
    rawDateKey,
    nowWallMs: now.wallMs,
    nowMonotonicMs: now.monotonicMs,
    sessionId,
    previous,
    config,
  })

  const persistedPrevious = loadDailyGuardAnchor(storage, variant.storagePrefix)
  if (
    !persistedPrevious ||
    persistedPrevious.grantedDateKey !== result.anchor.grantedDateKey ||
    persistedPrevious.anchorWallMs !== result.anchor.anchorWallMs ||
    persistedPrevious.sessionId !== result.anchor.sessionId
  ) {
    saveDailyGuardAnchor(result.anchor, storage, variant.storagePrefix)
  }

  if (usingSharedLiveAnchor) {
    liveAnchors = { ...liveAnchors, [variant.id]: result.anchor }
  }

  const nextReset = variant.resetClock === 'utc' ? getNextUtcMidnight(now.date) : getNextLocalMidnight(now.date)
  const msUntilReset = variant.resetClock === 'utc'
    ? getMillisUntilNextUtcMidnight(now.date)
    : getMillisUntilNextLocalMidnight(now.date)
  return {
    grantedDateKey: result.grantedDateKey,
    rawDateKey: result.rawDateKey,
    clamped: result.clamped,
    reason: result.reason,
    msUntilReset,
    nextResetAt: nextReset.getTime(),
    anchor: result.anchor,
    now,
  }
}

/** Convert a `YYYY-MM-DD` key to a local `Date` at noon on that calendar day. */
export function dateKeyToLocalDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map((part) => Number.parseInt(part, 10))
  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0)
}

/**
 * The `Date` representing the daily puzzle the player is currently allowed to
 * play. Daily game surfaces use this instead of `new Date()` so that a clamped
 * (anti-gamed) or simulated day produces the matching puzzle. Returns a local
 * date on the granted calendar day; passing it to `getDailyDateKey` round-trips
 * to the same granted key.
 */
export function getActiveDailyDate(options: ResolveDailyOptions = {}): Date {
  return dateKeyToLocalDate(resolveDaily(options).grantedDateKey)
}
