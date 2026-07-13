import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ANTI_GAMING_CONFIG,
  clearDailyGuardAnchor,
  diffDateKeys,
  evaluateDailyGuard,
  loadDailyGuardAnchor,
  saveDailyGuardAnchor,
  type DailyGuardAnchor,
} from './antiGaming'
import { MS_PER_DAY, MS_PER_HOUR } from './dailyClock'
import type { KeyValueStorage } from '../game/storage/dailyOgStorage'

function createMemoryStorage(): KeyValueStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

const SESSION = 'session-a'

describe('diffDateKeys', () => {
  it('computes calendar-day differences', () => {
    expect(diffDateKeys('2026-05-26', '2026-05-26')).toBe(0)
    expect(diffDateKeys('2026-05-26', '2026-05-27')).toBe(1)
    expect(diffDateKeys('2026-05-26', '2026-05-25')).toBe(-1)
    expect(diffDateKeys('2026-05-26', '2026-06-05')).toBe(10)
    // Spans a year boundary.
    expect(diffDateKeys('2025-12-31', '2026-01-01')).toBe(1)
  })
})

describe('evaluateDailyGuard', () => {
  it('grants the raw day on first evaluation', () => {
    const result = evaluateDailyGuard({
      rawDateKey: '2026-05-26',
      nowWallMs: 1_000,
      nowMonotonicMs: 10,
      sessionId: SESSION,
      previous: null,
    })
    expect(result.reason).toBe('initial')
    expect(result.grantedDateKey).toBe('2026-05-26')
    expect(result.clamped).toBe(false)
    expect(result.anchor.grantedDateKey).toBe('2026-05-26')
  })

  it('holds the granted day within the same calendar day and refreshes the anchor', () => {
    const previous: DailyGuardAnchor = {
      grantedDateKey: '2026-05-26',
      anchorWallMs: 1_000,
      anchorMonotonicMs: 10,
      sessionId: SESSION,
    }
    const result = evaluateDailyGuard({
      rawDateKey: '2026-05-26',
      nowWallMs: 5_000,
      nowMonotonicMs: 4_010,
      sessionId: SESSION,
      previous,
    })
    expect(result.reason).toBe('same-day')
    expect(result.grantedDateKey).toBe('2026-05-26')
    expect(result.anchor.anchorWallMs).toBe(5_000)
    expect(result.anchor.anchorMonotonicMs).toBe(4_010)
  })

  it('allows the natural local-midnight rollover (small real elapsed time)', () => {
    const previous: DailyGuardAnchor = {
      grantedDateKey: '2026-05-26',
      anchorWallMs: 1_000,
      anchorMonotonicMs: 10,
      sessionId: SESSION,
    }
    // One second later the wall clock crosses midnight; monotonic also advanced
    // ~1s, so there is no divergence and the rollover is honoured.
    const result = evaluateDailyGuard({
      rawDateKey: '2026-05-27',
      nowWallMs: 2_000,
      nowMonotonicMs: 1_010,
      sessionId: SESSION,
      previous,
    })
    expect(result.reason).toBe('rollover')
    expect(result.grantedDateKey).toBe('2026-05-27')
    expect(result.clamped).toBe(false)
  })

  it('clamps a large forward clock jump within a live session', () => {
    const previous: DailyGuardAnchor = {
      grantedDateKey: '2026-05-26',
      anchorWallMs: 1_000_000,
      anchorMonotonicMs: 50_000,
      sessionId: SESSION,
    }
    // Wall clock jumps a full day forward but only ~2s of monotonic time elapsed.
    const result = evaluateDailyGuard({
      rawDateKey: '2026-05-27',
      nowWallMs: 1_000_000 + MS_PER_DAY,
      nowMonotonicMs: 52_000,
      sessionId: SESSION,
      previous,
    })
    expect(result.reason).toBe('forward-jump-clamped')
    expect(result.clamped).toBe(true)
    expect(result.grantedDateKey).toBe('2026-05-26')
    // Anchor is preserved so reverting the clock clears the clamp automatically.
    expect(result.anchor).toBe(previous)
  })

  it('tolerates a small forward adjustment under the clamp threshold', () => {
    const previous: DailyGuardAnchor = {
      grantedDateKey: '2026-05-26',
      anchorWallMs: 1_000_000,
      anchorMonotonicMs: 50_000,
      sessionId: SESSION,
    }
    // Wall jumped ahead ~3h beyond monotonic — within the 12h tolerance.
    const result = evaluateDailyGuard({
      rawDateKey: '2026-05-27',
      nowWallMs: 1_000_000 + 3 * MS_PER_HOUR,
      nowMonotonicMs: 52_000,
      sessionId: SESSION,
      previous,
    })
    expect(result.reason).toBe('rollover')
    expect(result.grantedDateKey).toBe('2026-05-27')
  })

  it('trusts the wall clock on a cold open with no monotonic baseline', () => {
    // Anchor restored from storage carries no live monotonic baseline.
    const previous: DailyGuardAnchor = {
      grantedDateKey: '2026-05-26',
      anchorWallMs: 1_000_000,
      anchorMonotonicMs: null,
      sessionId: 'old-session',
    }
    const result = evaluateDailyGuard({
      rawDateKey: '2026-05-30',
      nowWallMs: 1_000_000 + 4 * MS_PER_DAY,
      nowMonotonicMs: 5_000,
      sessionId: SESSION,
      previous,
    })
    expect(result.reason).toBe('rollover')
    expect(result.grantedDateKey).toBe('2026-05-30')
    expect(result.clamped).toBe(false)
  })

  it('never regresses to an older daily when the clock moves backward', () => {
    const previous: DailyGuardAnchor = {
      grantedDateKey: '2026-05-27',
      anchorWallMs: 2_000_000,
      anchorMonotonicMs: 90_000,
      sessionId: SESSION,
    }
    const result = evaluateDailyGuard({
      rawDateKey: '2026-05-26',
      nowWallMs: 2_000_000 - MS_PER_DAY,
      nowMonotonicMs: 91_000,
      sessionId: SESSION,
      previous,
    })
    expect(result.reason).toBe('backward-hold')
    expect(result.grantedDateKey).toBe('2026-05-27')
    expect(result.anchor.grantedDateKey).toBe('2026-05-27')
  })

  it('uses the default config threshold', () => {
    expect(DEFAULT_ANTI_GAMING_CONFIG.clockJumpClampMs).toBe(12 * MS_PER_HOUR)
  })
})

describe('daily guard anchor persistence', () => {
  it('round-trips an anchor through storage without the live monotonic baseline', () => {
    const storage = createMemoryStorage()
    const anchor: DailyGuardAnchor = {
      grantedDateKey: '2026-05-26',
      anchorWallMs: 1_234,
      anchorMonotonicMs: 99,
      sessionId: SESSION,
    }
    saveDailyGuardAnchor(anchor, storage, 'brrrdle:daily')
    const loaded = loadDailyGuardAnchor(storage, 'brrrdle:daily')
    expect(loaded).toEqual({ ...anchor, anchorMonotonicMs: null })
  })

  it('returns null for missing or malformed anchors', () => {
    const storage = createMemoryStorage()
    expect(loadDailyGuardAnchor(storage, 'brrrdle:daily')).toBeNull()
    storage.setItem('brrrdle:daily:guard:v1', 'not json')
    expect(loadDailyGuardAnchor(storage, 'brrrdle:daily')).toBeNull()
  })

  it('clears a stored anchor', () => {
    const storage = createMemoryStorage()
    saveDailyGuardAnchor(
      { grantedDateKey: '2026-05-26', anchorWallMs: 1, anchorMonotonicMs: null, sessionId: SESSION },
      storage,
      'brrrdle:daily',
    )
    clearDailyGuardAnchor(storage, 'brrrdle:daily')
    expect(loadDailyGuardAnchor(storage, 'brrrdle:daily')).toBeNull()
  })
})
