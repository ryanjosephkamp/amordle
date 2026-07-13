/**
 * Phase 19.1 — Pure, render-free selectors that turn the persisted statistics,
 * history, and progression state into chart-ready data. No React, no I/O. These
 * are unit-tested directly (CONSTITUTION §7.3 spirit) and consumed by the
 * accessible chart components in `./charts`.
 */
import type { GameMode, PlayScope } from '../game/types'
import { DIFFICULTY_TIERS } from '../data/difficulty'
import { getLevelForXp, getXpForNextLevel } from '../progression'
import type { GameHistoryEntry, GuestProgressionState } from '../account/storageSchema'
import { getStatsBucket, getWinRate } from './statistics'
import type { StatisticsState } from './types'

export interface WinRateDatum {
  readonly key: string
  readonly label: string
  readonly played: number
  readonly won: number
  readonly winRate: number
}

const SCOPE_BUCKETS: readonly { readonly key: string; readonly label: string; readonly mode: GameMode; readonly scope: PlayScope }[] = [
  { key: 'og-daily', label: 'og daily', mode: 'og', scope: 'daily' },
  { key: 'og-practice', label: 'og practice', mode: 'og', scope: 'practice' },
  { key: 'go-daily', label: 'go daily', mode: 'go', scope: 'daily' },
  { key: 'go-practice', label: 'go practice', mode: 'go', scope: 'practice' },
]

/** Win rate for each mode/scope bucket. */
export function selectWinRateByScope(stats: StatisticsState): readonly WinRateDatum[] {
  return SCOPE_BUCKETS.map((item) => {
    const bucket = getStatsBucket(stats, item.mode, item.scope)
    return {
      key: item.key,
      label: item.label,
      played: bucket.played,
      winRate: getWinRate(bucket),
      won: bucket.won,
    }
  })
}

/**
 * Win rate aggregated by word length across every mode/scope bucket. Lengths
 * with no plays are omitted. Sorted ascending by length.
 */
export function selectWinRateByLength(stats: StatisticsState): readonly WinRateDatum[] {
  const totals = new Map<number, { played: number; won: number }>()
  for (const item of SCOPE_BUCKETS) {
    const bucket = getStatsBucket(stats, item.mode, item.scope)
    for (const [lengthKey, lengthStats] of Object.entries(bucket.byLength)) {
      const length = Number(lengthKey)
      const current = totals.get(length) ?? { played: 0, won: 0 }
      totals.set(length, {
        played: current.played + lengthStats.played,
        won: current.won + lengthStats.won,
      })
    }
  }

  return Array.from(totals.entries())
    .filter(([, value]) => value.played > 0)
    .sort(([leftLength], [rightLength]) => leftLength - rightLength)
    .map(([length, value]) => ({
      key: String(length),
      label: `${length} letters`,
      played: value.played,
      winRate: value.played === 0 ? 0 : Math.round((value.won / value.played) * 100),
      won: value.won,
    }))
}

/**
 * Win rate grouped by difficulty tier from history entries. Entries without a
 * `difficulty` tag (older rows) are grouped under "untagged" so no data is
 * silently dropped. Only groups with plays are returned.
 */
export function selectWinRateByTier(history: readonly GameHistoryEntry[]): readonly WinRateDatum[] {
  const groups = new Map<string, { played: number; won: number }>()
  for (const entry of history) {
    const key = entry.difficulty ?? 'untagged'
    const current = groups.get(key) ?? { played: 0, won: 0 }
    groups.set(key, {
      played: current.played + 1,
      won: current.won + (entry.status === 'won' ? 1 : 0),
    })
  }

  const order: readonly string[] = [...DIFFICULTY_TIERS, 'untagged']
  return order
    .filter((key) => groups.has(key))
    .map((key) => {
      const value = groups.get(key)!
      const label = key === 'untagged' ? 'untagged' : key
      return {
        key,
        label,
        played: value.played,
        winRate: value.played === 0 ? 0 : Math.round((value.won / value.played) * 100),
        won: value.won,
      }
    })
}

export interface CalendarDayDatum {
  readonly date: string
  readonly played: number
  readonly won: number
}

/**
 * Builds a day-by-day activity calendar for the last `days` calendar days
 * (inclusive of `today`), counting games played and won from `history`. Days
 * with no activity are present with zero counts so the heatmap stays a stable
 * grid. Dates are ISO `YYYY-MM-DD` in UTC for determinism.
 */
export function selectStreakCalendar(
  history: readonly GameHistoryEntry[],
  days = 35,
  today = new Date(),
): readonly CalendarDayDatum[] {
  const span = Math.max(1, Math.trunc(days))
  const byDay = new Map<string, { played: number; won: number }>()
  for (const entry of history) {
    const day = entry.completedAt.slice(0, 10)
    if (!day) {
      continue
    }
    const current = byDay.get(day) ?? { played: 0, won: 0 }
    byDay.set(day, {
      played: current.played + 1,
      won: current.won + (entry.status === 'won' ? 1 : 0),
    })
  }

  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const result: CalendarDayDatum[] = []
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const date = new Date(end - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const value = byDay.get(date) ?? { played: 0, won: 0 }
    result.push({ date, played: value.played, won: value.won })
  }
  return result
}

export interface XpProgressDatum {
  readonly level: number
  readonly progressPercent: number
  readonly xp: number
  readonly xpForLevel: number
  readonly xpIntoLevel: number
  readonly xpToNextLevel: number
}

/** Cumulative XP required to reach the start of a level. */
function cumulativeXpForLevel(level: number): number {
  const target = Math.max(1, Math.floor(level))
  let total = 0
  for (let current = 1; current < target; current += 1) {
    total += getXpForNextLevel(current)
  }
  return total
}

/** Progress of the current level toward the next, derived from total XP. */
export function selectXpProgress(progression: GuestProgressionState): XpProgressDatum {
  const xp = Math.max(0, Math.floor(progression.xp))
  const level = getLevelForXp(xp)
  const xpForLevel = getXpForNextLevel(level)
  const xpIntoLevel = xp - cumulativeXpForLevel(level)
  const xpToNextLevel = Math.max(0, xpForLevel - xpIntoLevel)
  const progressPercent = xpForLevel === 0 ? 0 : Math.min(100, Math.round((xpIntoLevel / xpForLevel) * 100))
  return { level, progressPercent, xp, xpForLevel, xpIntoLevel, xpToNextLevel }
}

export interface CoinTrendPointDatum {
  readonly cumulative: number
  readonly coinAward: number
  readonly completedAt: string
}

/**
 * Chronological cumulative coin-earning trend from history, oldest → newest,
 * limited to the most recent `limit` games. History is stored newest-first, so
 * we reverse a tail slice to walk forward in time.
 */
export function selectCoinTrend(history: readonly GameHistoryEntry[], limit = 30): readonly CoinTrendPointDatum[] {
  const span = Math.max(1, Math.trunc(limit))
  const recent = history.slice(0, span).slice().reverse()
  let cumulative = 0
  return recent.map((entry) => {
    cumulative += entry.coinAward
    return { coinAward: entry.coinAward, completedAt: entry.completedAt, cumulative }
  })
}
