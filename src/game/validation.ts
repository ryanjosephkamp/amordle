import { isSupportedPracticeWordLength } from './constants'
import type { ValidationResult } from './types'

const LETTERS_ONLY_PATTERN = /^[a-z]+$/

export interface GuessValidationInput {
  readonly guess: string
  readonly wordLength: number
  readonly validGuesses?: ReadonlySet<string> | readonly string[]
}

export function normalizeGuess(guess: string): string {
  return guess.trim().toLocaleLowerCase('en-US')
}

export function toWordSet(words: ReadonlySet<string> | readonly string[]): ReadonlySet<string> {
  if ('has' in words) {
    return words
  }

  return new Set([...words].map(normalizeGuess))
}

export function validateGuess(input: GuessValidationInput): ValidationResult {
  const guess = normalizeGuess(input.guess)

  if (guess.length === 0) {
    return {
      ok: false,
      reason: 'empty',
      message: 'Enter a guess before submitting.',
    }
  }

  if (!isSupportedPracticeWordLength(input.wordLength)) {
    return {
      ok: false,
      reason: 'unsupported-length',
      message: `Word length ${input.wordLength} is not supported.`,
    }
  }

  if (guess.length !== input.wordLength) {
    return {
      ok: false,
      reason: 'wrong-length',
      message: `Guess must be ${input.wordLength} letters long.`,
    }
  }

  if (!LETTERS_ONLY_PATTERN.test(guess)) {
    return {
      ok: false,
      reason: 'invalid-characters',
      message: 'Guess must contain letters only.',
    }
  }

  if (input.validGuesses && !toWordSet(input.validGuesses).has(guess)) {
    return {
      ok: false,
      reason: 'not-in-word-list',
      message: 'Guess is not in the word list.',
    }
  }

  return { ok: true }
}
