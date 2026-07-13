import { describe, expect, it } from 'vitest'
import { getWordRepository, isWordRepositorySuccess } from './wordRepository'
import type { DifficultyTier } from './difficulty/index'

const tiers: readonly DifficultyTier[] = ['casual', 'standard', 'expert']

describe('wordRepository difficulty tiers', () => {
  it('keeps validGuesses identical across all three tiers (answers-only subsetting)', () => {
    for (const scope of ['daily', 'practice'] as const) {
      const expert = getWordRepository({ mode: 'og', scope, length: 5, difficulty: 'expert' })
      if (!isWordRepositorySuccess(expert)) throw new Error('expected success')
      const expertGuesses = [...expert.validGuesses].sort()

      for (const tier of tiers) {
        const result = getWordRepository({ mode: 'og', scope, length: 5, difficulty: tier })
        if (!isWordRepositorySuccess(result)) throw new Error('expected success')
        expect([...result.validGuesses].sort()).toEqual(expertGuesses)
      }
    }
  })

  it('default request reproduces the full expert answer pool', () => {
    const explicit = getWordRepository({ mode: 'og', scope: 'practice', length: 5, difficulty: 'expert' })
    const defaulted = getWordRepository({ mode: 'og', scope: 'practice', length: 5 })
    if (!isWordRepositorySuccess(explicit) || !isWordRepositorySuccess(defaulted)) {
      throw new Error('expected success')
    }
    expect(defaulted.answers.length).toBe(explicit.answers.length)
    expect(defaulted.answers).toStrictEqual(explicit.answers)
  })

  it('subsets the answer pool for non-expert tiers', () => {
    const expert = getWordRepository({ mode: 'og', scope: 'practice', length: 5, difficulty: 'expert' })
    const casual = getWordRepository({ mode: 'og', scope: 'practice', length: 5, difficulty: 'casual' })
    if (!isWordRepositorySuccess(expert) || !isWordRepositorySuccess(casual)) {
      throw new Error('expected success')
    }
    expect(casual.answers.length).toBeLessThan(expert.answers.length)
    // Every casual answer is also a valid guess (canonical invariant).
    for (const entry of casual.answers) {
      expect(casual.validGuesses.has(entry.word)).toBe(true)
    }
  })

  it('preserves the daily 5-letter lock regardless of tier', () => {
    const result = getWordRepository({ mode: 'og', scope: 'daily', length: 9, difficulty: 'casual' })
    // Daily always resolves to length 5; a length-9 daily request is coerced.
    if (!isWordRepositorySuccess(result)) throw new Error('expected success')
    expect(result.wordList.metadata.length).toBe(5)
  })
})
