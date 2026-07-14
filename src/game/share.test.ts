import { describe, expect, it } from 'vitest'
import { formatGoShare, formatOgShare } from './share'
import { getGuessResult } from './tileStates'
import type { PuzzleSessionState } from './session'

describe('emoji sharing', () => {
  it('formats og guesses with canonical tile states', () => {
    const guesses = [getGuessResult('cigar', 'crane'), getGuessResult('crane', 'crane')]

    expect(formatOgShare({ dateKey: '2026-05-26', guesses, maxAttempts: 6, mode: 'og', scope: 'daily', status: 'won' })).toBe([
      'amordle og daily 2026-05-26 2/6',
      '🟩⬛⬛🟨🟨',
      '🟩🟩🟩🟩🟩',
    ].join('\n'))
  })

  it('formats go chains with completed puzzle groups', () => {
    const basePuzzle = {
      answer: 'crane',
      continuationCount: 0,
      currentGuess: '',
      hardMode: false,
      maxAttempts: 6,
      status: 'won',
      validGuesses: new Set<string>(),
      wordLength: 5,
    } satisfies Omit<PuzzleSessionState, 'guesses'>
    const puzzles = [
      { ...basePuzzle, guesses: [getGuessResult('crane', 'crane')] },
      { ...basePuzzle, answer: 'brisk', guesses: [getGuessResult('brick', 'brisk'), getGuessResult('brisk', 'brisk')] },
    ]

    expect(formatGoShare({ currentPuzzleIndex: 1, mode: 'go', puzzles, scope: 'practice', status: 'won' })).toContain('Puzzle 2\n🟩🟩🟩⬛🟩\n🟩🟩🟩🟩🟩')
  })
})
