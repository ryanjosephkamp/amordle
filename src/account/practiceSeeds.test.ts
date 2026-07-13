import { describe, expect, it } from 'vitest'
import { createDailyGoSetup, createPracticeGoSetup } from '../game/go/session'
import { createDailyOgSetup, createPracticeOgSetup } from '../game/og/session'
import {
  advancePracticeSeedState,
  createAccountPracticeSeed,
  createDefaultPracticeSeedState,
  mergePracticeSeedStates,
  normalizePracticeSeedState,
} from './practiceSeeds'

describe('practice seed state', () => {
  it('derives stable per-account Practice OG and GO seeds', () => {
    const userA = 'stage15-seed-account-alpha'
    const userB = 'stage15-seed-account-beta'
    const ogA = createPracticeOgSetup(5, createAccountPracticeSeed('og', userA, 0))
    const ogB = createPracticeOgSetup(5, createAccountPracticeSeed('og', userB, 0))
    const goA = createPracticeGoSetup(5, createAccountPracticeSeed('go', userA, 0))
    const goB = createPracticeGoSetup(5, createAccountPracticeSeed('go', userB, 0))

    expect(ogA.answer).not.toBe(ogB.answer)
    expect(goA.puzzles.map((puzzle) => puzzle.answer)).not.toEqual(goB.puzzles.map((puzzle) => puzzle.answer))
    expect(createAccountPracticeSeed('og', userA, 0)).toBe(createAccountPracticeSeed('og', userA, 0))
  })

  it('keeps guests on the existing local counter seed path', () => {
    expect(createAccountPracticeSeed('og', undefined, 0)).toBe(0)
    expect(createAccountPracticeSeed('go', undefined, 3)).toBe(3)
  })

  it('normalizes, advances, and merges per-mode counters', () => {
    expect(createDefaultPracticeSeedState()).toEqual({ go: 0, og: 0 })
    expect(normalizePracticeSeedState({ go: 4.9, og: -2 })).toEqual({ go: 4, og: 0 })
    expect(advancePracticeSeedState({ go: 4, og: 2 }, 'go')).toEqual({ go: 5, og: 2 })
    expect(mergePracticeSeedStates({ go: 1, og: 9 }, { go: 3, og: 2 })).toEqual({ go: 3, og: 9 })
  })

  it('does not alter globally deterministic Daily OG or Daily GO selection', () => {
    const date = new Date('2026-06-08T12:00:00.000Z')
    const firstOg = createDailyOgSetup(date)
    const repeatedOg = createDailyOgSetup(date)
    const firstGo = createDailyGoSetup(date)
    const repeatedGo = createDailyGoSetup(date)

    expect(firstOg.answer).toBe(repeatedOg.answer)
    expect(firstGo.puzzles.map((puzzle) => puzzle.answer)).toEqual(repeatedGo.puzzles.map((puzzle) => puzzle.answer))
  })
})
