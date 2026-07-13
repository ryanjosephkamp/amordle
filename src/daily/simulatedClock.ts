/**
 * Phase 22 — Developer "Simulate Time" clock offset (dev mode only).
 *
 * Source of truth: PHASE-22-CALENDAR-MIDNIGHT-AND-BUGFIXES-SPEC-2026-06-02 / §27
 * goal 5. This holds a single signed millisecond offset that is added to the
 * real device clock so a developer can fast-forward to local midnight and watch
 * the rollover, reset alert, and unique sound fire on demand.
 *
 * The offset is applied to **both** the wall clock and the monotonic clock (see
 * `getDailyNow`) so simulated jumps look like genuine elapsed time and are NOT
 * flagged by the anti-gaming guard — letting devs exercise the real rollover
 * path. The UI that mutates this offset is gated behind `import.meta.env.DEV`
 * and is tree-shaken out of production builds, so in production the offset is
 * always 0 and these helpers are inert.
 */

let simulatedOffsetMs = 0
const listeners = new Set<() => void>()

export function getSimulatedOffsetMs(): number {
  return simulatedOffsetMs
}

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function setSimulatedOffsetMs(nextOffsetMs: number): void {
  const normalized = Number.isFinite(nextOffsetMs) ? nextOffsetMs : 0
  if (normalized === simulatedOffsetMs) {
    return
  }
  simulatedOffsetMs = normalized
  notify()
}

export function adjustSimulatedOffsetMs(deltaMs: number): void {
  if (!Number.isFinite(deltaMs) || deltaMs === 0) {
    return
  }
  setSimulatedOffsetMs(simulatedOffsetMs + deltaMs)
}

/** Set the offset so that "simulated now" equals the given target time. */
export function setSimulatedTarget(target: Date, realNowMs: number = Date.now()): void {
  setSimulatedOffsetMs(target.getTime() - realNowMs)
}

export function resetSimulatedClock(): void {
  setSimulatedOffsetMs(0)
}

export function isSimulatingTime(): boolean {
  return simulatedOffsetMs !== 0
}

export function subscribeSimulatedClock(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export interface DailyNow {
  /** Wall-clock time (ms) including any active simulation offset. */
  readonly wallMs: number
  /** Monotonic time (ms) including the same offset, or `null` if unavailable. */
  readonly monotonicMs: number | null
  /** A `Date` built from `wallMs`, for calendar-day math. */
  readonly date: Date
}

function readMonotonicMs(): number | null {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return null
}

/**
 * The current time used by the daily cycle. Applies the simulation offset to
 * both the wall and monotonic readings so the anti-gaming guard sees consistent
 * elapsed time during simulated jumps.
 */
export function getDailyNow(): DailyNow {
  const wallMs = Date.now() + simulatedOffsetMs
  const monotonic = readMonotonicMs()
  return {
    wallMs,
    monotonicMs: monotonic == null ? null : monotonic + simulatedOffsetMs,
    date: new Date(wallMs),
  }
}
