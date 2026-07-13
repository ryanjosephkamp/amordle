import { describe, expect, it } from 'vitest'
import { getGuessResult } from '../tileStates'
import { deriveKeyboardLetterStates, normalizeKeyboardKey } from './useKeyboardInput'

describe('normalizeKeyboardKey', () => {
  it('normalizes physical letter keys to lowercase letter input', () => {
    expect(normalizeKeyboardKey('A')).toEqual({ type: 'letter', value: 'a' })
    expect(normalizeKeyboardKey('z')).toEqual({ type: 'letter', value: 'z' })
  })

  it('normalizes submit and delete controls', () => {
    expect(normalizeKeyboardKey('Enter')).toEqual({ type: 'submit' })
    expect(normalizeKeyboardKey('Backspace')).toEqual({ type: 'delete' })
    expect(normalizeKeyboardKey('Delete')).toEqual({ type: 'delete' })
  })

  it('ignores unsupported keys', () => {
    expect(normalizeKeyboardKey('ArrowLeft')).toBeUndefined()
    expect(normalizeKeyboardKey(' ')).toBeUndefined()
    expect(normalizeKeyboardKey('aa')).toBeUndefined()
  })
})

describe('deriveKeyboardLetterStates', () => {
  it('keeps the strongest tile state for each letter from canonical guess results', () => {
    const guesses = [getGuessResult('cigar', 'cacao'), getGuessResult('cacao', 'cacao')]

    expect(deriveKeyboardLetterStates(guesses)).toMatchObject({
      a: 'correct',
      c: 'correct',
      g: 'absent',
      i: 'absent',
      o: 'correct',
      r: 'absent',
    })
  })
})
