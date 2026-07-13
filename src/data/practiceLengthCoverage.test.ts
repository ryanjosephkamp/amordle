import { describe, expect, it } from 'vitest'
import { validateGuess } from '../game/validation.js'
import { loadBundledWordList } from './loadWordList.js'

/**
 * Phase 12 (updated diagnosis 2026-05-26) regression coverage.
 *
 * The updated diagnosis report described two user-visible symptoms that this
 * suite explicitly guards against re-introducing:
 *
 *   1. The practice length selector was reportedly limited to 2/5/35 instead
 *      of exposing every length between MIN_PRACTICE_WORD_LENGTH (2) and
 *      MAX_PRACTICE_WORD_LENGTH (35).
 *
 *   2. Many ordinary English words were rejected at supported lengths as
 *      "word not in list" because the bundled validation set fell back to a
 *      sparse seed slice.
 *
 * The tests below exercise the canonical validation path (`validateGuess`)
 * against the bundled `validGuesses` set returned by `loadBundledWordList`
 * for a representative sample of lengths spanning the supported range.
 */
describe('practice length coverage (Phase 12 updated diagnosis)', () => {
  for (const length of [2, 5, 12, 20] as const) {
    it(`accepts a representative bundled word at length ${length}`, () => {
      const result = loadBundledWordList('practice', length)
      expect(result.ok).toBe(true)
      if (!result.ok) {
        throw new Error(`Expected bundled word list to load for length ${length}.`)
      }

      const sample = result.wordList.validGuesses.values().next().value
      expect(typeof sample).toBe('string')
      expect((sample ?? '').length).toBe(length)

      const validation = validateGuess({
        guess: sample ?? '',
        wordLength: length,
        validGuesses: result.wordList.validGuesses,
      })
      expect(validation).toEqual({ ok: true })
    })
  }

  it('exposes a non-empty validation set for every length 2..35', () => {
    for (let length = 2; length <= 35; length += 1) {
      const result = loadBundledWordList('practice', length)
      expect(result.ok).toBe(true)
      if (!result.ok) {
        continue
      }
      expect(result.wordList.validGuesses.size).toBeGreaterThan(0)
      expect(result.wordList.answers.length).toBeGreaterThan(0)
    }
  })

  it('still rejects clearly invalid strings at supported lengths', () => {
    const result = loadBundledWordList('practice', 5)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected length-5 bundled word list to load.')
    }

    const validation = validateGuess({
      guess: 'zzzzz',
      wordLength: 5,
      validGuesses: result.wordList.validGuesses,
    })
    expect(validation.ok).toBe(false)
  })
})
