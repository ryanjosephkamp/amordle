import { describe, expect, it } from 'vitest'
import { createInitialConsumableEffects } from '../../progression'
import type { PuzzleSessionState } from '../../game'
import { selectSoloBoardPresentation } from './soloBoardRows'

function createSession(overrides: Partial<PuzzleSessionState> = {}): PuzzleSessionState {
  return {
    answer: 'crane',
    continuationCount: 0,
    currentGuess: '',
    guesses: [{
      guess: 'slate',
      tiles: [
        { letter: 's', state: 'absent' },
        { letter: 'l', state: 'absent' },
        { letter: 'a', state: 'present' },
        { letter: 't', state: 'absent' },
        { letter: 'e', state: 'correct' },
      ],
    }],
    hardMode: false,
    maxAttempts: 8,
    status: 'playing',
    validGuesses: new Set(['crane', 'slate']),
    wordLength: 5,
    ...overrides,
  }
}

describe('selectSoloBoardPresentation', () => {
  it('preserves every continuation row and stable submitted-row identities', () => {
    const effects = createInitialConsumableEffects()
    const before = selectSoloBoardPresentation(createSession(), effects)
    const after = selectSoloBoardPresentation(createSession({ currentGuess: 'c' }), effects)

    expect(before.rows).toHaveLength(8)
    expect(after.rows).toHaveLength(8)
    expect(after.rows[0]?.id).toBe(before.rows[0]?.id)
    expect(after.rows[0]?.tiles.map((tile) => tile.id)).toEqual(before.rows[0]?.tiles.map((tile) => tile.id))
    expect(after.activeCell).toEqual({ columnIndex: 1, rowIndex: 1 })
  })
})
