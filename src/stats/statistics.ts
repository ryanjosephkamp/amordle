import type { GameMode, PlayScope } from '../game/types'
import type { CompletedGameStatsInput, GameStatsBucket, StatisticsState } from './types'

function createBucket(): GameStatsBucket {
  return {
    bestAttempts: undefined,
    byLength: {},
    currentStreak: 0,
    lost: 0,
    maxStreak: 0,
    played: 0,
    totalAttempts: 0,
    won: 0,
  }
}

export function createEmptyStatistics(): StatisticsState {
  return {
    go: { daily: createBucket(), practice: createBucket() },
    og: { daily: createBucket(), practice: createBucket() },
  }
}

export function getStatsBucket(stats: StatisticsState, mode: GameMode, scope: PlayScope): GameStatsBucket {
  return stats[mode][scope]
}

export function updateStatistics(stats: StatisticsState, input: CompletedGameStatsInput): StatisticsState {
  const bucket = getStatsBucket(stats, input.mode, input.scope)
  const won = input.status === 'won'
  // Past dailies (affectsStreak === false) record full stats but must not
  // patch streak continuity, which reflects natural current-day play only.
  const affectsStreak = input.affectsStreak ?? true
  const lengthStats = bucket.byLength[input.wordLength] ?? { played: 0, won: 0 }
  const updatedBucket: GameStatsBucket = {
    bestAttempts: won ? Math.min(bucket.bestAttempts ?? input.attemptsUsed, input.attemptsUsed) : bucket.bestAttempts,
    byLength: {
      ...bucket.byLength,
      [input.wordLength]: {
        played: lengthStats.played + 1,
        won: lengthStats.won + (won ? 1 : 0),
      },
    },
    currentStreak: affectsStreak ? (won ? bucket.currentStreak + 1 : 0) : bucket.currentStreak,
    lost: bucket.lost + (won ? 0 : 1),
    maxStreak: affectsStreak && won ? Math.max(bucket.maxStreak, bucket.currentStreak + 1) : bucket.maxStreak,
    played: bucket.played + 1,
    totalAttempts: bucket.totalAttempts + input.attemptsUsed,
    won: bucket.won + (won ? 1 : 0),
  }

  return {
    ...stats,
    [input.mode]: {
      ...stats[input.mode],
      [input.scope]: updatedBucket,
    },
  }
}

export function getWinRate(bucket: GameStatsBucket): number {
  return bucket.played === 0 ? 0 : Math.round((bucket.won / bucket.played) * 100)
}

export function getAverageAttempts(bucket: GameStatsBucket): number | undefined {
  return bucket.played === 0 ? undefined : Number((bucket.totalAttempts / bucket.played).toFixed(1))
}
