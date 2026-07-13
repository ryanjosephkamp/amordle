import { describe, expect, it } from 'vitest'
import {
  continueAfterLoss,
  createPuzzleSession,
  deleteLetter,
  enterLetter,
  resetPuzzleSession,
  submitGuess,
} from './session'

describe('puzzle session', () => {
  it('enters and deletes letters while playing', () => {
    let state = createPuzzleSession({ answer: 'cat' })
    state = enterLetter(state, 'c')
    state = enterLetter(state, 'a')
    state = deleteLetter(state)
    expect(state.currentGuess).toBe('c')
  })

  it('rejects invalid guesses without consuming attempts', () => {
    let state = createPuzzleSession({ answer: 'crane', validGuesses: ['crane'] })
    for (const letter of 'slate') {
      state = enterLetter(state, letter)
    }
    state = submitGuess(state)
    expect(state.guesses).toHaveLength(0)
    expect(state.lastValidation?.reason).toBe('not-in-word-list')
  })

  it('wins when the submitted guess matches the answer', () => {
    let state = createPuzzleSession({ answer: 'crane', validGuesses: ['crane'] })
    for (const letter of 'crane') {
      state = enterLetter(state, letter)
    }
    state = submitGuess(state)
    expect(state.status).toBe('won')
    expect(state.guesses).toHaveLength(1)
  })

  it('loses after max attempts', () => {
    let state = createPuzzleSession({ answer: 'crane', validGuesses: ['slate'], maxAttempts: 1 })
    for (const letter of 'slate') {
      state = enterLetter(state, letter)
    }
    state = submitGuess(state)
    expect(state.status).toBe('lost')
  })

  it('can continue a lost puzzle with extra attempts', () => {
    const lostState = {
      ...createPuzzleSession({ answer: 'crane', maxAttempts: 1 }),
      revealedAnswer: true,
      status: 'lost' as const,
    }
    const continued = continueAfterLoss(lostState, 2)
    expect(continued.status).toBe('playing')
    expect(continued.maxAttempts).toBe(3)
    expect(continued.continuationCount).toBe(1)
    expect(continued.revealedAnswer).toBeUndefined()
  })

  it('enforces hard mode during submission', () => {
    let state = createPuzzleSession({ answer: 'cared', validGuesses: ['crane', 'doing'], hardMode: true })
    for (const letter of 'crane') {
      state = enterLetter(state, letter)
    }
    state = submitGuess(state)
    for (const letter of 'doing') {
      state = enterLetter(state, letter)
    }
    state = submitGuess(state)
    expect(state.guesses).toHaveLength(1)
    expect(state.lastValidation?.reason).toBe('hard-mode')
  })

  it('resets to a fresh puzzle session', () => {
    const state = resetPuzzleSession(createPuzzleSession({ answer: 'crane' }), { answer: 'slate' })
    expect(state.answer).toBe('slate')
    expect(state.guesses).toHaveLength(0)
    expect(state.status).toBe('playing')
  })
})
