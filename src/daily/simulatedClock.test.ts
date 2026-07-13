import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  adjustSimulatedOffsetMs,
  getDailyNow,
  getSimulatedOffsetMs,
  isSimulatingTime,
  resetSimulatedClock,
  setSimulatedOffsetMs,
  setSimulatedTarget,
  subscribeSimulatedClock,
} from './simulatedClock'
import { MS_PER_DAY } from './dailyClock'

afterEach(() => {
  resetSimulatedClock()
})

describe('simulatedClock', () => {
  it('starts at the real device time (zero offset)', () => {
    expect(getSimulatedOffsetMs()).toBe(0)
    expect(isSimulatingTime()).toBe(false)
  })

  it('sets and adjusts the offset', () => {
    setSimulatedOffsetMs(MS_PER_DAY)
    expect(getSimulatedOffsetMs()).toBe(MS_PER_DAY)
    expect(isSimulatingTime()).toBe(true)
    adjustSimulatedOffsetMs(MS_PER_DAY)
    expect(getSimulatedOffsetMs()).toBe(2 * MS_PER_DAY)
  })

  it('targets a specific moment relative to a provided real-now', () => {
    const realNow = 1_000_000
    setSimulatedTarget(new Date(realNow + 5 * MS_PER_DAY), realNow)
    expect(getSimulatedOffsetMs()).toBe(5 * MS_PER_DAY)
  })

  it('resets back to real time', () => {
    setSimulatedOffsetMs(MS_PER_DAY)
    resetSimulatedClock()
    expect(getSimulatedOffsetMs()).toBe(0)
    expect(isSimulatingTime()).toBe(false)
  })

  it('notifies subscribers only on change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSimulatedClock(listener)
    setSimulatedOffsetMs(MS_PER_DAY)
    setSimulatedOffsetMs(MS_PER_DAY) // no change, no notify
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setSimulatedOffsetMs(0)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('applies the offset to both wall and monotonic readings', () => {
    const before = Date.now()
    setSimulatedOffsetMs(MS_PER_DAY)
    const now = getDailyNow()
    const after = Date.now()
    expect(now.wallMs).toBeGreaterThanOrEqual(before + MS_PER_DAY)
    expect(now.wallMs).toBeLessThanOrEqual(after + MS_PER_DAY)
    expect(now.date.getTime()).toBe(now.wallMs)
    // Monotonic carries the same offset so simulated jumps look like real time.
    if (now.monotonicMs != null) {
      expect(now.monotonicMs).toBeGreaterThanOrEqual(MS_PER_DAY)
    }
  })
})
