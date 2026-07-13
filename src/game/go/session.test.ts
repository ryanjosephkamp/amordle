import { describe, expect, it } from 'vitest'
import { DAILY_WORD_LENGTH, GO_PUZZLE_COUNT } from '../constants'
import { GO_CHAIN_V2_DAILY_CUTOFF_DATE_KEY } from './chainSelector'
import { continueGoAfterLoss, createDailyGoSetup, createGoSession, createPracticeGoSetup, deleteGoLetter, enterGoLetter, getAvailableGoPracticeLengths, restoreGoSession, revealGoPuzzle, serializeGoSession, setGoHardMode, submitGoGuess } from './session'

function submitWord(state: ReturnType<typeof createGoSession>, word: string) {
  const filled = [...word].reduce((currentState, letter) => enterGoLetter(currentState, letter), state)
  return submitGoGuess(filled)
}

describe('go session model', () => {
  it('creates daily go sessions with five 5-letter puzzles', () => {
    const setup = createDailyGoSetup(new Date('2026-05-26T00:00:00.000Z'))

    expect(setup.wordLength).toBe(DAILY_WORD_LENGTH)
    expect(setup.puzzles).toHaveLength(GO_PUZZLE_COUNT)
    expect(setup.puzzles.every((puzzle) => puzzle.answer.length === DAILY_WORD_LENGTH)).toBe(true)
  })

  it('advances through all five puzzles and tracks prior answers', () => {
    const setup = createDailyGoSetup(new Date('2026-05-26T00:00:00.000Z'))
    let session = createGoSession(setup)

    for (const puzzle of setup.puzzles) {
      session = submitWord(session, puzzle.answer)
    }

    expect(session.status).toBe('won')
    expect(session.currentPuzzleIndex).toBe(GO_PUZZLE_COUNT - 1)
    expect(session.priorAnswers).toEqual(setup.puzzles.map((puzzle) => puzzle.answer))
  })

  it('pre-fills later puzzles with prior answer rows without blocking current input', () => {
    const setup = createDailyGoSetup(new Date('2026-05-26T00:00:00.000Z'))
    const session = submitWord(createGoSession(setup), setup.puzzles[0].answer)

    expect(session.currentPuzzleIndex).toBe(1)
    expect(session.puzzles[1].guesses[0].guess).toBe(setup.puzzles[0].answer)
    expect(deleteGoLetter(session).puzzles[1].currentGuess).toBe('')
  })

  it('marks the chain lost when the current puzzle is failed', () => {
    const setup = createPracticeGoSetup(5, 0)
    let session = createGoSession(setup)

    for (let attempt = 0; attempt < 6; attempt += 1) {
      session = submitWord(session, 'slate')
    }

    expect(session.status).toBe('lost')
    expect(session.puzzles[0].status).toBe('lost')
  })

  it('can continue the failed current puzzle with an extra attempt', () => {
    const setup = createPracticeGoSetup(5, 0)
    let session = createGoSession(setup)

    for (let attempt = 0; attempt < 6; attempt += 1) {
      session = submitWord(session, 'slate')
    }

    const continued = continueGoAfterLoss(session)
    expect(continued.status).toBe('playing')
    expect(continued.puzzles[0].status).toBe('playing')
    expect(continued.puzzles[0].maxAttempts).toBe(7)
    expect(continued.puzzles[0].continuationCount).toBe(1)
    expect(continued.revealedAnswer).toBeUndefined()
  })

  it('creates practice go sessions with one selected length for all puzzles', () => {
    expect(getAvailableGoPracticeLengths()).toEqual(
      Array.from({ length: 34 }, (_, index) => index + 2),
    )
    for (const length of [2, 5, 35]) {
      const setup = createPracticeGoSetup(length, 0)
      expect(setup.wordLength).toBe(length)
      expect(setup.puzzles.every((puzzle) => puzzle.answer.length === length)).toBe(true)
    }
  })

  it('restores serialized go sessions', () => {
    const setup = createDailyGoSetup(new Date('2026-05-26T00:00:00.000Z'))
    const session = submitWord(setGoHardMode(createGoSession(setup), true), setup.puzzles[0].answer)
    const restored = restoreGoSession(serializeGoSession(session), setup.validGuesses)

    expect(restored.currentPuzzleIndex).toBe(1)
    expect(restored.hardMode).toBe(true)
    expect(restored.priorAnswers).toEqual([setup.puzzles[0].answer])
  })

  it('serializes and restores the explicit answer-revealed loss state', () => {
    const setup = createPracticeGoSetup(5, 0)
    const revealed = revealGoPuzzle(createGoSession(setup))
    const restored = restoreGoSession(serializeGoSession(revealed), setup.validGuesses)

    expect(restored.status).toBe('lost')
    expect(restored.revealedAnswer).toBe(true)
    expect(restored.puzzles[restored.currentPuzzleIndex].status).toBe('lost')
  })

  it('reveals the current puzzle as a loss-equivalent and flags the session', () => {
    const setup = createPracticeGoSetup(5, 0)
    const session = revealGoPuzzle(createGoSession(setup))

    expect(session.status).toBe('lost')
    expect(session.revealedAnswer).toBe(true)
    expect(session.puzzles[session.currentPuzzleIndex].status).toBe('lost')
    expect(session.currentPuzzleIndex).toBe(0)
  })

  it('reveals later puzzles after earlier ones are solved', () => {
    const setup = createPracticeGoSetup(5, 0)
    const solved = submitWord(createGoSession(setup), setup.puzzles[0].answer)
    expect(solved.currentPuzzleIndex).toBe(1)

    const revealed = revealGoPuzzle(solved)
    expect(revealed.status).toBe('lost')
    expect(revealed.revealedAnswer).toBe(true)
    expect(revealed.puzzles[0].status).toBe('won')
    expect(revealed.puzzles[1].status).toBe('lost')
  })

  it('builds daily go chains of 5, 7, or 10 distinct puzzles with carry-over pre-fills', () => {
    for (const count of [5, 7, 10] as const) {
      const setup = createDailyGoSetup(new Date('2026-05-26T00:00:00.000Z'), undefined, count)
      expect(setup.puzzles).toHaveLength(count)
      expect(setup.wordLength).toBe(DAILY_WORD_LENGTH)
      expect(setup.puzzles.every((puzzle) => puzzle.answer.length === DAILY_WORD_LENGTH)).toBe(true)
      // Each daily answer is distinct (the length-5 pool is large enough).
      expect(new Set(setup.puzzles.map((puzzle) => puzzle.answer)).size).toBe(count)
      // Later puzzles carry every prior answer as a pre-filled row.
      setup.puzzles.forEach((puzzle, index) => {
        expect(puzzle.prefilledGuesses).toEqual(setup.puzzles.slice(0, index).map((prior) => prior.answer))
      })
    }
  })

  it('advances through and wins a configurable-length daily go chain', () => {
    const setup = createDailyGoSetup(new Date('2026-05-26T00:00:00.000Z'), undefined, 7)
    let session = createGoSession(setup)
    expect(session.puzzles).toHaveLength(7)

    setup.puzzles.forEach((puzzle, index) => {
      session = submitWord(session, puzzle.answer)
      if (index < setup.puzzles.length - 1) {
        expect(session.status).toBe('playing')
      }
    })

    expect(session.status).toBe('won')
    expect(session.currentPuzzleIndex).toBe(6)
    expect(session.priorAnswers).toEqual(setup.puzzles.map((puzzle) => puzzle.answer))
  })

  it('builds practice go chains with the selected count and length', () => {
    const setup = createPracticeGoSetup(5, 0, undefined, 10)
    expect(setup.puzzles).toHaveLength(10)
    expect(setup.puzzles.every((puzzle) => puzzle.answer.length === 5)).toBe(true)
  })

  it('uses v2 for new practice chains without shifted consecutive answer windows', () => {
    const first = createPracticeGoSetup(5, 100)
    const second = createPracticeGoSetup(5, 101)
    const firstAnswers = first.puzzles.map((puzzle) => puzzle.answer)
    const secondAnswers = second.puzzles.map((puzzle) => puzzle.answer)

    expect(first.answerGenerationVersion).toBe('v2')
    expect(second.answerGenerationVersion).toBe('v2')
    expect(secondAnswers.slice(0, -1)).not.toEqual(firstAnswers.slice(1))
    expect(secondAnswers.filter((answer) => firstAnswers.includes(answer)).length).toBeLessThan(4)
  })

  it('activates Daily v2 only at the shared calendar-date cutoff', () => {
    const before = new Date(`${GO_CHAIN_V2_DAILY_CUTOFF_DATE_KEY}T12:00:00`)
    before.setDate(before.getDate() - 1)
    const legacy = createDailyGoSetup(before)
    const v2 = createDailyGoSetup(new Date(`${GO_CHAIN_V2_DAILY_CUTOFF_DATE_KEY}T12:00:00`))

    expect(legacy.answerGenerationVersion).toBe('v1')
    expect(v2.answerGenerationVersion).toBe('v2')
  })

  it('round-trips v2 and treats a missing serialized version as legacy v1', () => {
    const setup = createPracticeGoSetup(5, 200)
    const serialized = serializeGoSession(createGoSession(setup))
    const restored = restoreGoSession(serialized, setup.validGuesses)
    const { answerGenerationVersion: _version, ...legacySerialized } = serialized
    void _version
    const restoredLegacy = restoreGoSession(legacySerialized, setup.validGuesses)

    expect(serialized.answerGenerationVersion).toBe('v2')
    expect(restored.answerGenerationVersion).toBe('v2')
    expect(restoredLegacy.answerGenerationVersion).toBe('v1')
    expect(restoredLegacy.puzzles.map((puzzle) => puzzle.answer)).toEqual(
      serialized.puzzles.map((puzzle) => puzzle.answer),
    )
  })
})
