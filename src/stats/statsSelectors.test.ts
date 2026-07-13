import { describe, expect, it } from 'vitest'
import { createEmptyStatistics, updateStatistics } from './statistics'
import {
  selectCoinTrend,
  selectStreakCalendar,
  selectWinRateByLength,
  selectWinRateByScope,
  selectWinRateByTier,
  selectXpProgress,
} from './statsSelectors'
import type { GameHistoryEntry, GuestProgressionState } from '../account/storageSchema'

function entry(overrides: Partial<GameHistoryEntry>): GameHistoryEntry {
  return {
    attemptsUsed: 4,
    coinAward: 10,
    completedAt: '2026-05-30T00:00:00.000Z',
    gameId: Math.random().toString(36),
    mode: 'og',
    scope: 'daily',
    status: 'won',
    word: 'apple',
    wordLength: 5,
    xpAward: 50,
    ...overrides,
  }
}

describe('stats selectors', () => {
  it('computes win rate by scope for all four buckets', () => {
    let stats = createEmptyStatistics()
    stats = updateStatistics(stats, { attemptsUsed: 3, mode: 'og', scope: 'daily', status: 'won', wordLength: 5 })
    stats = updateStatistics(stats, { attemptsUsed: 6, mode: 'og', scope: 'daily', status: 'lost', wordLength: 5 })

    const result = selectWinRateByScope(stats)
    expect(result).toHaveLength(4)
    const ogDaily = result.find((datum) => datum.key === 'og-daily')!
    expect(ogDaily.played).toBe(2)
    expect(ogDaily.won).toBe(1)
    expect(ogDaily.winRate).toBe(50)
  })

  it('aggregates win rate by length and omits empty lengths', () => {
    let stats = createEmptyStatistics()
    stats = updateStatistics(stats, { attemptsUsed: 3, mode: 'og', scope: 'practice', status: 'won', wordLength: 2 })
    stats = updateStatistics(stats, { attemptsUsed: 4, mode: 'go', scope: 'practice', status: 'lost', wordLength: 5 })

    const result = selectWinRateByLength(stats)
    expect(result.map((datum) => datum.key)).toEqual(['2', '5'])
    expect(result[0]!.winRate).toBe(100)
    expect(result[1]!.winRate).toBe(0)
  })

  it('groups win rate by difficulty tier and buckets untagged entries', () => {
    const history: GameHistoryEntry[] = [
      entry({ difficulty: 'casual', status: 'won' }),
      entry({ difficulty: 'casual', status: 'lost' }),
      entry({ difficulty: 'expert', status: 'won' }),
      entry({ status: 'won' }),
    ]

    const result = selectWinRateByTier(history)
    expect(result.map((datum) => datum.key)).toEqual(['casual', 'expert', 'untagged'])
    expect(result.find((datum) => datum.key === 'casual')!.winRate).toBe(50)
    expect(result.find((datum) => datum.key === 'untagged')!.played).toBe(1)
  })

  it('builds a stable calendar grid with zero-filled inactive days', () => {
    const today = new Date('2026-05-30T12:00:00.000Z')
    const history: GameHistoryEntry[] = [
      entry({ completedAt: '2026-05-30T01:00:00.000Z', status: 'won' }),
      entry({ completedAt: '2026-05-30T02:00:00.000Z', status: 'lost' }),
      entry({ completedAt: '2026-05-28T02:00:00.000Z', status: 'won' }),
    ]

    const result = selectStreakCalendar(history, 5, today)
    expect(result).toHaveLength(5)
    expect(result[result.length - 1]!.date).toBe('2026-05-30')
    expect(result[result.length - 1]!.played).toBe(2)
    expect(result[result.length - 1]!.won).toBe(1)
    expect(result[0]!.played).toBe(0)
  })

  it('derives XP progress within the current level', () => {
    // Level 1 needs 100 XP; level 2 starts at 100 and needs 200 to advance.
    const progression: GuestProgressionState = {
      coins: 0,
      consumables: { removeIncorrectLetters: 0, revealOneLetter: 0 },
      economyOperationIds: [],
      economyRevision: 0,
      level: 2,
      xp: 150,
    }
    const result = selectXpProgress(progression)
    expect(result.level).toBe(2)
    expect(result.xpForLevel).toBe(200)
    expect(result.xpIntoLevel).toBe(50)
    expect(result.xpToNextLevel).toBe(150)
    expect(result.progressPercent).toBe(25)
  })

  it('produces a forward-in-time cumulative coin trend', () => {
    // History is stored newest-first.
    const history: GameHistoryEntry[] = [
      entry({ completedAt: '2026-05-30T00:00:00.000Z', coinAward: 5 }),
      entry({ completedAt: '2026-05-29T00:00:00.000Z', coinAward: 10 }),
      entry({ completedAt: '2026-05-28T00:00:00.000Z', coinAward: 3 }),
    ]

    const result = selectCoinTrend(history, 30)
    expect(result.map((point) => point.completedAt)).toEqual([
      '2026-05-28T00:00:00.000Z',
      '2026-05-29T00:00:00.000Z',
      '2026-05-30T00:00:00.000Z',
    ])
    expect(result.map((point) => point.cumulative)).toEqual([3, 13, 18])
  })
})
