/**
 * Phase 22 — `useDailyCycle` React hook.
 *
 * Source of truth: PHASE-22-CALENDAR-MIDNIGHT-AND-BUGFIXES-SPEC-2026-06-02 / §27.
 *
 * Drives the cross-page countdown indicator and the reset alert. It ticks once
 * a second (configurable), re-resolving the timezone-aware daily state through
 * the framework-agnostic core (`resolveDaily`) so it transparently honours the
 * anti-gaming guard and the dev "Simulate Time" offset. When the granted daily
 * advances (a real local-midnight rollover or a dev simulation), it invokes
 * `onReset` exactly once so the caller can show the subtle visual alert and play
 * the brand-new unique reset sound.
 */

import { useEffect, useRef, useState } from 'react'
import { formatCountdown, getDeviceTimeZone } from './dailyClock'
import { resolveDaily } from './dailyCycle'
import { subscribeSimulatedClock } from './simulatedClock'
import { getDailyVariantDescriptor, type DailyVariant } from './dailyVariant'

export interface DailyResetInfo {
  readonly dateKey: string
  readonly previousDateKey: string
}

export interface UseDailyCycleOptions {
  readonly variant?: DailyVariant
  readonly tickMs?: number
  /** When false, `onReset` is not invoked (countdown/alerts globally disabled). */
  readonly alertsEnabled?: boolean
  readonly onReset?: (info: DailyResetInfo) => void
}

export interface DailyCycleState {
  /** The granted (anti-gaming–guarded) daily date key. */
  readonly dateKey: string
  /** The raw device-clock date key (may differ from `dateKey` when clamped). */
  readonly rawDateKey: string
  readonly clamped: boolean
  readonly msUntilReset: number
  readonly countdownLabel: string
  readonly timeZone: string
}

const DEFAULT_TICK_MS = 1_000

export function useDailyCycle(options: UseDailyCycleOptions = {}): DailyCycleState {
  const { variant, tickMs = DEFAULT_TICK_MS } = options
  const descriptor = getDailyVariantDescriptor(variant)
  const timeZoneLabel = descriptor.resetClock === 'utc' ? descriptor.timeZoneLabel : getDeviceTimeZone()

  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const grantedRef = useRef<string | null>(null)

  const [state, setState] = useState<DailyCycleState>(() => {
    const resolved = resolveDaily({ variant })
    return {
      dateKey: resolved.grantedDateKey,
      rawDateKey: resolved.rawDateKey,
      clamped: resolved.clamped,
      msUntilReset: resolved.msUntilReset,
      countdownLabel: formatCountdown(resolved.msUntilReset),
      timeZone: timeZoneLabel,
    }
  })

  useEffect(() => {
    let active = true

    const read = () => {
      if (!active) {
        return
      }
      const resolved = resolveDaily({ variant })
      const previousGranted = grantedRef.current
      if (previousGranted != null && resolved.grantedDateKey !== previousGranted) {
        grantedRef.current = resolved.grantedDateKey
        const { alertsEnabled = true, onReset } = optionsRef.current
        if (alertsEnabled && onReset) {
          onReset({ dateKey: resolved.grantedDateKey, previousDateKey: previousGranted })
        }
      } else if (previousGranted == null) {
        grantedRef.current = resolved.grantedDateKey
      }

      setState({
        dateKey: resolved.grantedDateKey,
        rawDateKey: resolved.rawDateKey,
        clamped: resolved.clamped,
        msUntilReset: resolved.msUntilReset,
        countdownLabel: formatCountdown(resolved.msUntilReset),
        timeZone: timeZoneLabel,
      })
    }

    // Re-read immediately (covers remounts) and then on every tick.
    read()
    const intervalId = setInterval(read, tickMs)
    const unsubscribe = subscribeSimulatedClock(read)

    return () => {
      active = false
      clearInterval(intervalId)
      unsubscribe()
    }
  }, [tickMs, timeZoneLabel, variant])

  return state
}
