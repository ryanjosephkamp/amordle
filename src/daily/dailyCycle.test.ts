import { beforeEach, describe, expect, it } from 'vitest'
import { dateKeyToLocalDate, getActiveDailyDate, resetDailyLiveAnchor, resolveDaily } from './dailyCycle'
import { getDailyDateKey, MS_PER_DAY } from './dailyClock'
import type { DailyNow } from './simulatedClock'
import type { KeyValueStorage } from '../game/storage/dailyOgStorage'

function createMemoryStorage(): KeyValueStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

function nowAt(date: Date, monotonicMs: number | null): DailyNow {
  return { wallMs: date.getTime(), monotonicMs, date }
}

describe('resolveDaily', () => {
  beforeEach(() => {
    resetDailyLiveAnchor()
  })

  it('grants the local day and computes the countdown', () => {
    const storage = createMemoryStorage()
    const date = new Date(2026, 4, 26, 23, 0, 0)
    const resolved = resolveDaily({ storage, sessionId: 's1', now: nowAt(date, 1_000) })

    expect(resolved.grantedDateKey).toBe(getDailyDateKey(date))
    expect(resolved.rawDateKey).toBe(getDailyDateKey(date))
    expect(resolved.clamped).toBe(false)
    expect(resolved.msUntilReset).toBe(60 * 60 * 1000)
  })

  it('honours a natural rollover across two evaluations', () => {
    const storage = createMemoryStorage()
    const before = new Date(2026, 4, 26, 23, 59, 59)
    const first = resolveDaily({ storage, sessionId: 's1', now: nowAt(before, 1_000) })

    const after = new Date(2026, 4, 27, 0, 0, 1)
    const resolved = resolveDaily({
      storage,
      sessionId: 's1',
      now: nowAt(after, 3_000),
      previousAnchor: first.anchor,
    })
    expect(resolved.grantedDateKey).toBe(getDailyDateKey(after))
    expect(resolved.clamped).toBe(false)
  })

  it('clamps a suspicious in-session forward jump and keeps the previous daily', () => {
    const storage = createMemoryStorage()
    const start = new Date(2026, 4, 26, 12, 0, 0)
    const first = resolveDaily({ storage, sessionId: 's1', now: nowAt(start, 1_000) })

    // Wall clock jumps a full day ahead but only 2 seconds of monotonic elapsed.
    const jumped = new Date(start.getTime() + MS_PER_DAY)
    const resolved = resolveDaily({
      storage,
      sessionId: 's1',
      now: nowAt(jumped, 3_000),
      previousAnchor: first.anchor,
    })

    expect(resolved.clamped).toBe(true)
    expect(resolved.grantedDateKey).toBe(getDailyDateKey(start))
    expect(resolved.rawDateKey).toBe(getDailyDateKey(jumped))
  })

  it('uses UTC day keys and UTC reset timing for the multiplayer variant', () => {
    const storage = createMemoryStorage()
    const date = new Date('2026-05-26T23:30:00.000Z')
    const resolved = resolveDaily({
      storage,
      sessionId: 's1',
      now: nowAt(date, 1_000),
      variant: 'multiplayer',
    })

    expect(resolved.grantedDateKey).toBe('2026-05-26')
    expect(resolved.rawDateKey).toBe('2026-05-26')
    expect(resolved.msUntilReset).toBe(30 * 60 * 1000)
    expect(resolved.nextResetAt).toBe(Date.parse('2026-05-27T00:00:00.000Z'))
  })

  it('grants a new multiplayer daily after a natural UTC midnight rollover', () => {
    const storage = createMemoryStorage()
    const before = new Date('2026-05-26T23:59:59.000Z')
    const first = resolveDaily({
      storage,
      sessionId: 's1',
      now: nowAt(before, 1_000),
      variant: 'multiplayer',
    })

    const after = new Date('2026-05-27T00:00:01.000Z')
    const resolved = resolveDaily({
      storage,
      sessionId: 's1',
      now: nowAt(after, 3_000),
      previousAnchor: first.anchor,
      variant: 'multiplayer',
    })

    expect(first.grantedDateKey).toBe('2026-05-26')
    expect(resolved.grantedDateKey).toBe('2026-05-27')
    expect(resolved.clamped).toBe(false)
  })

  it('keeps live anti-gaming anchors isolated per daily variant', () => {
    const solo = resolveDaily({
      now: nowAt(new Date('2026-05-26T12:00:00.000Z'), 1_000),
      sessionId: 'shared-session',
      variant: 'solo',
    })
    const multiplayer = resolveDaily({
      now: nowAt(new Date('2026-05-27T12:00:00.000Z'), 2_000),
      sessionId: 'shared-session',
      variant: 'multiplayer',
    })

    expect(solo.reason).toBe('initial')
    expect(multiplayer.reason).toBe('initial')
    expect(multiplayer.clamped).toBe(false)
  })
})

describe('getActiveDailyDate / dateKeyToLocalDate', () => {
  it('round-trips the granted date key', () => {
    const storage = createMemoryStorage()
    const date = new Date(2026, 4, 26, 8, 0, 0)
    const active = getActiveDailyDate({ storage, sessionId: 's1', now: nowAt(date, 1_000) })
    expect(getDailyDateKey(active)).toBe('2026-05-26')
  })

  it('builds a local date on the given calendar day', () => {
    const date = dateKeyToLocalDate('2026-05-26')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(4)
    expect(date.getDate()).toBe(26)
    expect(getDailyDateKey(date)).toBe('2026-05-26')
  })
})
