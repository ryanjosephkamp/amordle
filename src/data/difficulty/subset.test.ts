import { describe, expect, it } from 'vitest'
import { SUPPORTED_PRACTICE_WORD_LENGTHS } from '../../game/constants'
import { isLoadWordListFailure, loadBundledWordList } from '../loadWordList'
import {
  CASUAL_ANSWER_FRACTION,
  STANDARD_ANSWER_FRACTION,
  classifyAnswerTier,
  clearDifficultyModelCache,
  getAnswerSubset,
  getTierAnswerWords,
} from './subset'
import { scoreWordsByQuality } from './heuristic'
import { DEFAULT_DIFFICULTY_TIER, DIFFICULTY_TIERS, isDifficultyTier, normalizeDifficultyTier } from './tiers'

function expertWords(length: number): readonly string[] {
  const loaded = loadBundledWordList('practice', length)
  if (isLoadWordListFailure(loaded)) {
    return []
  }
  return loaded.wordList.answers.map((entry) => entry.word)
}

const availableLengths = SUPPORTED_PRACTICE_WORD_LENGTHS.filter((length) => !isLoadWordListFailure(loadBundledWordList('practice', length)))

describe('difficulty tiers', () => {
  it('defaults to expert', () => {
    expect(DEFAULT_DIFFICULTY_TIER).toBe('expert')
    expect(DIFFICULTY_TIERS).toEqual(['casual', 'standard', 'expert'])
  })

  it('validates and normalizes tier values', () => {
    expect(isDifficultyTier('casual')).toBe(true)
    expect(isDifficultyTier('nope')).toBe(false)
    expect(normalizeDifficultyTier('standard')).toBe('standard')
    expect(normalizeDifficultyTier('garbage')).toBe('expert')
    expect(normalizeDifficultyTier(undefined)).toBe('expert')
  })
})

describe('Casual ⊆ Standard ⊆ Expert invariant', () => {
  it('holds for every available length 2..35', () => {
    for (const length of availableLengths) {
      const casual = getTierAnswerWords(length, 'casual')
      const standard = getTierAnswerWords(length, 'standard')
      const expert = getTierAnswerWords(length, 'expert')

      expect(casual.size).toBeGreaterThan(0)
      expect(standard.size).toBeGreaterThanOrEqual(casual.size)
      expect(expert.size).toBeGreaterThanOrEqual(standard.size)

      for (const word of casual) {
        expect(standard.has(word)).toBe(true)
      }
      for (const word of standard) {
        expect(expert.has(word)).toBe(true)
      }
    }
  })
})

describe('getAnswerSubset', () => {
  it('returns the identical array for expert (byte-identical default behaviour)', () => {
    const loaded = loadBundledWordList('practice', 5)
    if (isLoadWordListFailure(loaded)) throw new Error('expected length 5')
    const answers = loaded.wordList.answers
    expect(getAnswerSubset(answers, 5, 'expert')).toBe(answers)
    // No explicit tier defaults to expert.
    expect(getAnswerSubset(answers, 5)).toBe(answers)
  })

  it('preserves original order and entry objects for subsets', () => {
    const loaded = loadBundledWordList('practice', 5)
    if (isLoadWordListFailure(loaded)) throw new Error('expected length 5')
    const answers = loaded.wordList.answers
    const standard = getAnswerSubset(answers, 5, 'standard')
    expect(standard.length).toBeLessThan(answers.length)
    // Order preserved: each subset entry appears in the same relative order.
    const indices = standard.map((entry) => answers.indexOf(entry))
    const sorted = [...indices].sort((a, b) => a - b)
    expect(indices).toEqual(sorted)
  })

  it('scales the subset size per length using the configured fractions', () => {
    const words = expertWords(5)
    const standard = getTierAnswerWords(5, 'standard')
    const casual = getTierAnswerWords(5, 'casual')
    expect(standard.size).toBe(Math.ceil(words.length * STANDARD_ANSWER_FRACTION))
    expect(casual.size).toBe(Math.ceil(words.length * CASUAL_ANSWER_FRACTION))
  })
})

describe('classifyAnswerTier', () => {
  it('returns the minimal tier for an answer word and undefined for non-answers', () => {
    const casual = [...getTierAnswerWords(5, 'casual')]
    expect(classifyAnswerTier(5, casual[0]!)).toBe('casual')

    const standardOnly = [...getTierAnswerWords(5, 'standard')].find((word) => !getTierAnswerWords(5, 'casual').has(word))
    expect(classifyAnswerTier(5, standardOnly!)).toBe('standard')

    const expertOnly = expertWords(5).find((word) => !getTierAnswerWords(5, 'standard').has(word))
    expect(classifyAnswerTier(5, expertOnly!)).toBe('expert')

    expect(classifyAnswerTier(5, 'zzzzz')).toBeUndefined()
  })
})

describe('heuristic determinism', () => {
  it('produces a stable ordering for the same inputs', () => {
    const words = expertWords(5)
    const first = scoreWordsByQuality(words, 5).map((entry) => entry.word)
    const second = scoreWordsByQuality(words, 5).map((entry) => entry.word)
    expect(first).toEqual(second)
  })

  it('memoization is stable across cache clears', () => {
    const before = [...getTierAnswerWords(5, 'casual')]
    clearDifficultyModelCache()
    const after = [...getTierAnswerWords(5, 'casual')]
    expect(after).toEqual(before)
  })
})
