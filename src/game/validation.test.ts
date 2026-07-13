import { describe, expect, it } from 'vitest'
import type { ValidationResult } from './types'
import { normalizeGuess, validateGuess } from './validation'

function expectFailure(result: ValidationResult) {
  expect(result.ok).toBe(false)
  if (result.ok) {
    throw new Error('Expected validation to fail.')
  }
  return result
}

describe('validateGuess', () => {
  it('accepts valid guesses from a word list', () => {
    expect(validateGuess({ guess: 'Crane', wordLength: 5, validGuesses: ['crane'] })).toEqual({ ok: true })
  })

  it('rejects empty guesses', () => {
    expect(expectFailure(validateGuess({ guess: ' ', wordLength: 5 })).reason).toBe('empty')
  })

  it('rejects unsupported lengths', () => {
    expect(expectFailure(validateGuess({ guess: 'a', wordLength: 1 })).reason).toBe('unsupported-length')
    expect(expectFailure(validateGuess({ guess: 'a'.repeat(36), wordLength: 36 })).reason).toBe(
      'unsupported-length',
    )
  })

  it('rejects wrong-length guesses', () => {
    expect(expectFailure(validateGuess({ guess: 'cat', wordLength: 5 })).reason).toBe('wrong-length')
  })

  it('rejects non-letter characters', () => {
    expect(expectFailure(validateGuess({ guess: 'ab-de', wordLength: 5 })).reason).toBe('invalid-characters')
  })

  it('rejects guesses missing from the word list', () => {
    expect(
      expectFailure(validateGuess({ guess: 'crane', wordLength: 5, validGuesses: new Set(['slate']) })).reason,
    ).toBe('not-in-word-list')
  })
})

describe('normalizeGuess', () => {
  it('trims and lowercases guesses', () => {
    expect(normalizeGuess(' APPLE ')).toBe('apple')
  })
})
