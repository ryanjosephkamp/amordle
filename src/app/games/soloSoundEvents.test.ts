import { describe, expect, it } from 'vitest'
import {
  createGoSession,
  createOgSession,
  createPracticeGoSetup,
  createPracticeOgSetup,
  enterGoLetter,
  enterLetter,
  submitGoGuess,
  submitGuess,
} from '../../game'
import { getSoloGoSolvedTransition } from './goTransitions'
import { getSoloInputSoundEvents, getSoloSubmitSoundEvents } from './soloSoundEvents'

function enterOgWord(session: ReturnType<typeof createOgSession>, word: string) {
  return [...word].reduce((currentSession, letter) => enterLetter(currentSession, letter), session)
}

function enterGoWord(session: ReturnType<typeof createGoSession>, word: string) {
  return [...word].reduce((currentSession, letter) => enterGoLetter(currentSession, letter), session)
}

describe('solo gameplay sound events', () => {
  it('keeps keyboard-click cues on solo letter and delete inputs only', () => {
    expect(getSoloInputSoundEvents({ type: 'letter', value: 'a' })).toEqual(['keyboard-click'])
    expect(getSoloInputSoundEvents({ type: 'delete' })).toEqual(['keyboard-click'])
    expect(getSoloInputSoundEvents({ type: 'submit' })).toEqual([])
  })

  it('plays invalid-guess for solo og word-list rejections without submit masking', () => {
    const setup = createPracticeOgSetup(5, 0)
    const invalidGuess = 'qqqqq'
    expect(setup.validGuesses.has(invalidGuess)).toBe(false)

    const submitted = submitGuess(enterOgWord(createOgSession(setup), invalidGuess))

    expect(submitted.lastValidation?.reason).toBe('not-in-word-list')
    expect(getSoloSubmitSoundEvents({
      solved: submitted.status === 'won',
      validationFailed: Boolean(submitted.lastValidation),
    })).toEqual(['invalid-guess'])
  })

  it('plays invalid-guess for solo go word-list rejections without submit masking', () => {
    const setup = createPracticeGoSetup(5, 0)
    const invalidGuess = 'qqqqq'
    expect(setup.validGuesses.has(invalidGuess)).toBe(false)

    const submitted = submitGoGuess(enterGoWord(createGoSession(setup), invalidGuess))
    const activePuzzle = submitted.puzzles[submitted.currentPuzzleIndex]

    expect(activePuzzle.lastValidation?.reason).toBe('not-in-word-list')
    expect(getSoloSubmitSoundEvents({
      solved: Boolean(getSoloGoSolvedTransition(createGoSession(setup), submitted)),
      validationFailed: Boolean(activePuzzle.lastValidation),
    })).toEqual(['invalid-guess'])
  })

  it('plays invalid-guess for solo hard-mode rejections', () => {
    let session = createOgSession({
      answer: 'cared',
      validGuesses: new Set(['crane', 'doing']),
      wordLength: 5,
    }, true)
    session = submitGuess(enterOgWord(session, 'crane'))
    const submitted = submitGuess(enterOgWord(session, 'doing'))

    expect(submitted.lastValidation?.reason).toBe('hard-mode')
    expect(getSoloSubmitSoundEvents({
      solved: submitted.status === 'won',
      validationFailed: Boolean(submitted.lastValidation),
    })).toEqual(['invalid-guess'])
  })

  it('preserves valid solo og submit cues', () => {
    const setup = createPracticeOgSetup(5, 0)
    const submitted = submitGuess(enterOgWord(createOgSession(setup), setup.answer))

    expect(submitted.lastValidation).toBeUndefined()
    expect(submitted.status).toBe('won')
    expect(getSoloSubmitSoundEvents({
      solved: submitted.status === 'won',
      validationFailed: Boolean(submitted.lastValidation),
    })).toEqual(['tile-flip', 'correct-guess'])
  })

  it('preserves valid solo go submit cues', () => {
    const setup = createPracticeGoSetup(5, 0)
    const initial = createGoSession(setup)
    const submitted = submitGoGuess(enterGoWord(initial, setup.puzzles[0].answer))
    const transition = getSoloGoSolvedTransition(initial, submitted)
    const activePuzzle = submitted.puzzles[submitted.currentPuzzleIndex]

    expect(activePuzzle.lastValidation).toBeUndefined()
    expect(transition).toEqual({ puzzleIndex: 0 })
    expect(getSoloSubmitSoundEvents({
      solved: Boolean(transition),
      validationFailed: Boolean(activePuzzle.lastValidation),
    })).toEqual(['tile-flip', 'correct-guess'])
  })
})
