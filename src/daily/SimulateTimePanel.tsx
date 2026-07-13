/**
 * Phase 22 — Developer-only "Simulate Time" floating tool (dev mode only).
 *
 * Source of truth: PHASE-22-CALENDAR-MIDNIGHT-AND-BUGFIXES-SPEC-2026-06-02 / §27
 * goal 5. A floating button opens a panel to set a specific simulated date/time,
 * jump forward/backward by hours or days, jump to just before the next local
 * midnight (to watch the rollover, reset alert, and unique sound fire), and
 * reset back to the real device time.
 *
 * SECURITY / SCOPE: this component must NEVER ship in production. The caller in
 * `App.tsx` only renders it behind `import.meta.env.DEV`, which Vite statically
 * replaces with `false` in production builds so the whole subtree (and this
 * module's logic) is tree-shaken away. As a defence-in-depth measure the
 * component also returns `null` when `import.meta.env.DEV` is not truthy.
 */

import { useEffect, useState } from 'react'
import {
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_SECOND,
  getMillisUntilNextLocalMidnight,
} from './dailyClock'
import {
  adjustSimulatedOffsetMs,
  getDailyNow,
  getSimulatedOffsetMs,
  isSimulatingTime,
  resetSimulatedClock,
  setSimulatedTarget,
  subscribeSimulatedClock,
} from './simulatedClock'

function formatOffset(offsetMs: number): string {
  if (offsetMs === 0) {
    return 'real device time'
  }
  const sign = offsetMs > 0 ? '+' : '−'
  const abs = Math.abs(offsetMs)
  const days = Math.floor(abs / MS_PER_DAY)
  const hours = Math.floor((abs % MS_PER_DAY) / MS_PER_HOUR)
  const minutes = Math.floor((abs % MS_PER_HOUR) / 60_000)
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (minutes || parts.length === 0) parts.push(`${minutes}m`)
  return `${sign}${parts.join(' ')}`
}

function toDateTimeLocalValue(date: Date): string {
  const pad = (value: number) => `${value}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function SimulateTimePanel() {
  const [open, setOpen] = useState(false)
  const [, forceRender] = useState(0)

  useEffect(() => subscribeSimulatedClock(() => forceRender((value) => value + 1)), [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Keyboard fallback: Shift+Alt+T toggles the panel.
      if (event.shiftKey && event.altKey && (event.key === 'T' || event.key === 't')) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!import.meta.env.DEV) {
    return null
  }

  const now = getDailyNow()
  const offsetMs = getSimulatedOffsetMs()
  const simulating = isSimulatingTime()

  const jumpToNextMidnight = () => {
    // Land 5 seconds before the next local midnight so the rollover + reset
    // alert + unique sound fire shortly after, on the natural tick.
    const msUntil = getMillisUntilNextLocalMidnight(now.date)
    adjustSimulatedOffsetMs(msUntil - 5 * MS_PER_SECOND)
  }

  return (
    <div className="brrrdle-sim-time" data-open={open ? 'true' : undefined}>
      {open ? (
        <section aria-label="Simulate time (developer tool)" className="brrrdle-sim-time-panel">
          <header className="brrrdle-sim-time-header">
            <strong>Simulate Time</strong>
            <button aria-label="Close simulate time panel" onClick={() => setOpen(false)} type="button">×</button>
          </header>
          <p className="brrrdle-sim-time-readout">
            <span>{now.date.toLocaleString()}</span>
            <span data-active={simulating ? 'true' : undefined}>{formatOffset(offsetMs)}</span>
          </p>
          <label className="brrrdle-sim-time-field">
            <span>Set specific date/time</span>
            <input
              onChange={(event) => {
                const value = event.target.value
                if (!value) {
                  return
                }
                const target = new Date(value)
                if (!Number.isNaN(target.getTime())) {
                  setSimulatedTarget(target)
                }
              }}
              type="datetime-local"
              value={toDateTimeLocalValue(now.date)}
            />
          </label>
          <div className="brrrdle-sim-time-grid">
            <button onClick={() => adjustSimulatedOffsetMs(-MS_PER_DAY)} type="button">−1 day</button>
            <button onClick={() => adjustSimulatedOffsetMs(-MS_PER_HOUR)} type="button">−1 hour</button>
            <button onClick={() => adjustSimulatedOffsetMs(MS_PER_HOUR)} type="button">+1 hour</button>
            <button onClick={() => adjustSimulatedOffsetMs(MS_PER_DAY)} type="button">+1 day</button>
          </div>
          <div className="brrrdle-sim-time-actions">
            <button onClick={jumpToNextMidnight} type="button">Jump to next midnight</button>
            <button data-variant="reset" disabled={!simulating} onClick={resetSimulatedClock} type="button">Reset to real time</button>
          </div>
        </section>
      ) : null}
      <button
        aria-label="Open simulate time developer tool"
        className="brrrdle-sim-time-fab"
        data-active={simulating ? 'true' : undefined}
        onClick={() => setOpen((value) => !value)}
        title="Simulate Time (dev) — Shift+Alt+T"
        type="button"
      >
        ⏱
      </button>
    </div>
  )
}
