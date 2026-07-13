import { describe, expect, it } from 'vitest'
import { createEmptyStatistics, getAverageAttempts, getWinRate, updateStatistics } from './statistics'

describe('statistics', () => {
  it('tracks wins, losses, streaks, attempts, scopes, modes, and lengths separately', () => {
    const empty = createEmptyStatistics()
    const ogWin = updateStatistics(empty, { attemptsUsed: 3, mode: 'og', scope: 'daily', status: 'won', wordLength: 5 })
    const ogLoss = updateStatistics(ogWin, { attemptsUsed: 6, mode: 'og', scope: 'daily', status: 'lost', wordLength: 5 })
    const goWin = updateStatistics(ogLoss, { attemptsUsed: 15, mode: 'go', scope: 'practice', status: 'won', wordLength: 5 })

    expect(goWin.og.daily.played).toBe(2)
    expect(goWin.og.daily.currentStreak).toBe(0)
    expect(goWin.og.daily.maxStreak).toBe(1)
    expect(goWin.og.daily.byLength[5]).toEqual({ played: 2, won: 1 })
    expect(goWin.go.practice.played).toBe(1)
    expect(goWin.go.daily.played).toBe(0)
    expect(getWinRate(goWin.og.daily)).toBe(50)
    expect(getAverageAttempts(goWin.og.daily)).toBe(4.5)
  })

  it('records full stats but preserves streaks when affectsStreak is false (past dailies)', () => {
    const empty = createEmptyStatistics()
    const natural = updateStatistics(empty, { attemptsUsed: 3, mode: 'og', scope: 'daily', status: 'won', wordLength: 5 })
    expect(natural.og.daily.currentStreak).toBe(1)
    expect(natural.og.daily.maxStreak).toBe(1)

    // An unlocked past daily win records play/win/attempts but must not bump the streak.
    const withPast = updateStatistics(natural, {
      attemptsUsed: 4,
      mode: 'og',
      scope: 'daily',
      status: 'won',
      wordLength: 5,
      affectsStreak: false,
    })
    expect(withPast.og.daily.played).toBe(2)
    expect(withPast.og.daily.won).toBe(2)
    expect(withPast.og.daily.byLength[5]).toEqual({ played: 2, won: 2 })
    expect(withPast.og.daily.currentStreak).toBe(1)
    expect(withPast.og.daily.maxStreak).toBe(1)

    // A past-daily loss likewise must not reset the natural current streak.
    const afterPastLoss = updateStatistics(withPast, {
      attemptsUsed: 6,
      mode: 'og',
      scope: 'daily',
      status: 'lost',
      wordLength: 5,
      affectsStreak: false,
    })
    expect(afterPastLoss.og.daily.lost).toBe(1)
    expect(afterPastLoss.og.daily.currentStreak).toBe(1)
  })
})
