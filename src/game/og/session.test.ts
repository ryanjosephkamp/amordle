import { describe, expect, it } from 'vitest'
import { DAILY_WORD_LENGTH } from '../constants'
import { enterLetter, submitGuess } from '../session'
import { createDailyOgSetup, createOgSession, createPracticeOgSetup, getAvailableOgPracticeLengths, restoreOgSession, serializeOgSession } from './session'

describe('og session setup', () => {
  it('creates daily og setups fixed at five letters', () => {
    const setup = createDailyOgSetup(new Date(2026, 4, 26, 12, 0, 0))

    expect(setup.wordLength).toBe(DAILY_WORD_LENGTH)
    expect(setup.answer).toHaveLength(DAILY_WORD_LENGTH)
    expect(setup.dateKey).toBe('2026-05-26')
  })

  it('offers the full launch practice length range and creates matching practice setups', () => {
    expect(getAvailableOgPracticeLengths()).toEqual(
      Array.from({ length: 34 }, (_, index) => index + 2),
    )
    expect(createPracticeOgSetup(2, 0).answer).toHaveLength(2)
    expect(createPracticeOgSetup(5, 1).answer).toHaveLength(5)
    expect(createPracticeOgSetup(35, 0).answer).toHaveLength(35)
  })

  it('serializes and restores completed og sessions', () => {
    const setup = createPracticeOgSetup(5, 1)
    const guessed = [...setup.answer].reduce((state, letter) => enterLetter(state, letter), createOgSession(setup, true))
    const won = submitGuess(guessed)
    const restored = restoreOgSession(serializeOgSession(won), setup.validGuesses)

    expect(restored.status).toBe('won')
    expect(restored.hardMode).toBe(true)
    expect(restored.guesses[0].guess).toBe(setup.answer)
  })

  it('persists the explicit answer-revealed loss state', () => {
    const restored = restoreOgSession({
      answer: 'crane',
      continuationCount: 0,
      currentGuess: '',
      guesses: ['slate'],
      hardMode: false,
      maxAttempts: 1,
      revealedAnswer: true,
    }, new Set(['crane', 'slate']))

    expect(restored.status).toBe('lost')
    expect(restored.revealedAnswer).toBe(true)
  })
})
