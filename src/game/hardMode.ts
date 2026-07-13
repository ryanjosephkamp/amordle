import type { GuessResult, ValidationResult } from './types'
import { normalizeGuess } from './validation'

export interface HardModeViolation {
  readonly rule: 'correct-position' | 'required-letter' | 'absent-letter'
  readonly message: string
}

export interface HardModeValidationFailure {
  readonly ok: false
  readonly reason: 'hard-mode'
  readonly message: string
  readonly violations: readonly HardModeViolation[]
}

export type HardModeValidationResult = { readonly ok: true } | HardModeValidationFailure

interface HardModeConstraints {
  readonly correctPositions: ReadonlyMap<number, string>
  readonly requiredLetterCounts: ReadonlyMap<string, number>
  readonly forbiddenLetters: ReadonlySet<string>
}

function countLetters(word: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const letter of word) {
    counts.set(letter, (counts.get(letter) ?? 0) + 1)
  }
  return counts
}

export function deriveHardModeConstraints(
  previousGuesses: readonly GuessResult[],
): HardModeConstraints {
  const correctPositions = new Map<number, string>()
  const requiredLetterCounts = new Map<string, number>()
  const knownPresentLetters = new Set<string>()
  const absentLetters = new Set<string>()

  for (const result of previousGuesses) {
    const perGuessKnownCounts = new Map<string, number>()

    result.tiles.forEach((tile, index) => {
      if (tile.state === 'correct') {
        correctPositions.set(index, tile.letter)
      }

      if (tile.state === 'correct' || tile.state === 'present') {
        knownPresentLetters.add(tile.letter)
        perGuessKnownCounts.set(tile.letter, (perGuessKnownCounts.get(tile.letter) ?? 0) + 1)
      }

      if (tile.state === 'absent') {
        absentLetters.add(tile.letter)
      }
    })

    for (const [letter, count] of perGuessKnownCounts) {
      requiredLetterCounts.set(letter, Math.max(requiredLetterCounts.get(letter) ?? 0, count))
    }
  }

  const forbiddenLetters = new Set(
    [...absentLetters].filter((letter) => !knownPresentLetters.has(letter)),
  )

  return {
    correctPositions,
    requiredLetterCounts,
    forbiddenLetters,
  }
}

export function validateHardModeGuess(
  guess: string,
  previousGuesses: readonly GuessResult[],
): HardModeValidationResult {
  const normalizedGuess = normalizeGuess(guess)
  const constraints = deriveHardModeConstraints(previousGuesses)
  const guessCounts = countLetters(normalizedGuess)
  const violations: HardModeViolation[] = []

  for (const [index, letter] of constraints.correctPositions) {
    if (normalizedGuess[index] !== letter) {
      violations.push({
        rule: 'correct-position',
        message: `Letter ${letter.toUpperCase()} must remain in position ${index + 1}.`,
      })
    }
  }

  for (const [letter, requiredCount] of constraints.requiredLetterCounts) {
    if ((guessCounts.get(letter) ?? 0) < requiredCount) {
      violations.push({
        rule: 'required-letter',
        message: `Guess must include ${letter.toUpperCase()}.`,
      })
    }
  }

  for (const letter of constraints.forbiddenLetters) {
    if (normalizedGuess.includes(letter)) {
      violations.push({
        rule: 'absent-letter',
        message: `Gray letter ${letter.toUpperCase()} cannot be reused.`,
      })
    }
  }

  if (violations.length > 0) {
    return {
      ok: false,
      reason: 'hard-mode',
      message: violations[0].message,
      violations,
    }
  }

  return { ok: true }
}

export function toValidationResult(result: HardModeValidationResult): ValidationResult {
  if (result.ok) {
    return result
  }

  return {
    ok: false,
    reason: result.reason,
    message: result.message,
  }
}
