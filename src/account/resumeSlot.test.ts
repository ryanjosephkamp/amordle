import { describe, expect, it } from 'vitest'
import {
  createResumeSlot,
  describeResumeSlot,
  getLatestResumeSlot,
  getResumeSlotKey,
  isCaptureComplete,
  isCaptureInProgress,
  isCaptureWon,
  isGoSessionComplete,
  isGoSessionInProgress,
  isGoSessionWon,
  isOgSessionComplete,
  isOgSessionInProgress,
  isOgSessionWon,
  mergeResumeSlots,
  normalizeCompletedSoloDisplaySlot,
  normalizeCompletedSoloDisplaySlots,
  normalizeResumeSlot,
  normalizeResumeSlots,
  type ResumeCapture,
} from './resumeSlot'

function ogSession(overrides: Partial<Parameters<typeof isOgSessionInProgress>[0]> = {}) {
  return {
    answer: 'crane',
    continuationCount: 0,
    currentGuess: '',
    guesses: [],
    hardMode: false,
    maxAttempts: 6,
    ...overrides,
  }
}

function goSession(overrides: Partial<Parameters<typeof isGoSessionInProgress>[0]> = {}) {
  return {
    currentPuzzleIndex: 0,
    hardMode: false,
    priorAnswers: [],
    puzzles: [
      { answer: 'crane', continuationCount: 0, currentGuess: '', guesses: [], maxAttempts: 6, prefilledGuesses: [] },
      { answer: 'plumb', continuationCount: 0, currentGuess: '', guesses: [], maxAttempts: 6, prefilledGuesses: [] },
    ],
    ...overrides,
  }
}

describe('resume slot model', () => {
  it('treats a consumable effect as durable started Practice state before the first guess', () => {
    expect(isOgSessionInProgress({
      answer: 'SLATE', continuationCount: 0, currentGuess: '', guesses: [], hardMode: false, maxAttempts: 6,
      consumableEffects: { removedLetters: [], revealedHints: [{ index: 0, letter: 's' }] },
    })).toBe(true)
  })
  it('treats an untouched og board as not in progress', () => {
    expect(isOgSessionInProgress(ogSession())).toBe(false)
  })

  it('treats a started, unsolved og board as in progress', () => {
    expect(isOgSessionInProgress(ogSession({ currentGuess: 'cr' }))).toBe(true)
    expect(isOgSessionInProgress(ogSession({ guesses: ['plumb'] }))).toBe(true)
  })

  it('treats a solved or lost og board as finished', () => {
    expect(isOgSessionInProgress(ogSession({ guesses: ['crane'] }))).toBe(false)
    expect(isOgSessionInProgress(ogSession({ guesses: ['plumb', 'plumb', 'plumb', 'plumb', 'plumb', 'plumb'] }))).toBe(false)
    expect(isOgSessionWon(ogSession({ guesses: ['crane'] }))).toBe(true)
    expect(isOgSessionWon(ogSession({ guesses: ['plumb', 'plumb', 'plumb', 'plumb', 'plumb', 'plumb'] }))).toBe(false)
    expect(isOgSessionComplete(ogSession({ revealedAnswer: true }))).toBe(true)
  })

  it('detects an in-progress go chain and a won/lost chain', () => {
    expect(isGoSessionInProgress(goSession())).toBe(false)
    expect(isGoSessionInProgress(goSession({ currentPuzzleIndex: 1, priorAnswers: ['crane'] }))).toBe(true)
    const won = goSession({
      currentPuzzleIndex: 1,
      priorAnswers: ['crane'],
      puzzles: [
        { answer: 'crane', continuationCount: 0, currentGuess: '', guesses: ['crane'], maxAttempts: 6, prefilledGuesses: [] },
        { answer: 'plumb', continuationCount: 0, currentGuess: '', guesses: ['plumb'], maxAttempts: 6, prefilledGuesses: ['crane'] },
      ],
    })
    expect(isGoSessionInProgress(won)).toBe(false)
    expect(isGoSessionWon(won)).toBe(true)
    const lost = goSession({
      puzzles: [
        { answer: 'crane', continuationCount: 0, currentGuess: '', guesses: ['aaaaa', 'aaaaa', 'aaaaa', 'aaaaa', 'aaaaa', 'aaaaa'], maxAttempts: 6, prefilledGuesses: [] },
        { answer: 'plumb', continuationCount: 0, currentGuess: '', guesses: [], maxAttempts: 6, prefilledGuesses: [] },
      ],
    })
    expect(isGoSessionInProgress(lost)).toBe(false)
    expect(isGoSessionWon(lost)).toBe(false)
    expect(isGoSessionComplete(goSession({ revealedAnswer: true }))).toBe(true)
  })

  it('stamps a capture with a timestamp and reports progress', () => {
    const capture: ResumeCapture = { difficulty: 'expert', mode: 'og', scope: 'practice', serializedSession: ogSession({ currentGuess: 'cr' }), wordLength: 5 }
    expect(isCaptureInProgress(capture)).toBe(true)
    expect(isCaptureWon(capture)).toBe(false)
    expect(isCaptureComplete(capture)).toBe(false)
    const slot = createResumeSlot(capture, '2026-05-30T06:00:00.000Z')
    expect(slot.updatedAt).toBe('2026-05-30T06:00:00.000Z')
  })

  it('detects completed winning captures without making them resumable', () => {
    const capture: ResumeCapture = { difficulty: 'expert', mode: 'og', scope: 'practice', serializedSession: ogSession({ guesses: ['crane'] }), wordLength: 5 }
    const slot = createResumeSlot(capture, '2026-07-06T00:00:00.000Z')

    expect(isCaptureWon(capture)).toBe(true)
    expect(isCaptureComplete(capture)).toBe(true)
    expect(isCaptureInProgress(capture)).toBe(false)
    expect(normalizeResumeSlot(slot)).toBeUndefined()
  })

  it('normalizes completed display slots separately from resumable slots', () => {
    const practiceOg = createResumeSlot({ difficulty: 'expert', mode: 'og', scope: 'practice', serializedSession: ogSession({ guesses: ['crane'] }), wordLength: 5 }, '2026-07-06T00:00:00.000Z')
    const dailyGo = createResumeSlot({
      difficulty: 'expert',
      goPuzzleCount: 5,
      mode: 'go',
      scope: 'daily',
      serializedSession: goSession({
        currentPuzzleIndex: 1,
        priorAnswers: ['crane'],
        puzzles: [
          { answer: 'crane', continuationCount: 0, currentGuess: '', guesses: ['crane'], maxAttempts: 6, prefilledGuesses: [] },
          { answer: 'plumb', continuationCount: 0, currentGuess: '', guesses: ['plumb'], maxAttempts: 6, prefilledGuesses: ['crane'] },
        ],
      }),
      wordLength: 5,
    }, '2026-07-06T00:01:00.000Z')
    const inProgress = createResumeSlot({ difficulty: 'expert', mode: 'og', scope: 'daily', serializedSession: ogSession({ currentGuess: 'cr' }), wordLength: 5 }, '2026-07-06T00:02:00.000Z')

    expect(normalizeCompletedSoloDisplaySlot(practiceOg)).toEqual(practiceOg)
    expect(normalizeCompletedSoloDisplaySlot(inProgress)).toBeUndefined()
    expect(normalizeCompletedSoloDisplaySlots({
      'daily-go': dailyGo,
      'daily-og': inProgress,
      'practice-og': practiceOg,
    })).toEqual({
      'daily-go': dailyGo,
      'practice-og': practiceOg,
    })
  })

  it('round-trips a valid og slot through normalization', () => {
    const slot = createResumeSlot({ difficulty: 'casual', mode: 'og', scope: 'practice', serializedSession: ogSession({ currentGuess: 'cr' }), wordLength: 5 }, '2026-05-30T06:00:00.000Z')
    expect(normalizeResumeSlot(slot)).toEqual(slot)
  })

  it('round-trips a valid go slot and normalizes the count', () => {
    const slot = createResumeSlot({ difficulty: 'expert', goPuzzleCount: 7, mode: 'go', scope: 'daily', serializedSession: goSession({ currentPuzzleIndex: 1, priorAnswers: ['crane'] }), wordLength: 5 }, '2026-05-30T06:00:00.000Z')
    expect(normalizeResumeSlot(slot)).toEqual(slot)
    expect(normalizeResumeSlot({ ...slot, goPuzzleCount: 99 })?.mode === 'go' && normalizeResumeSlot({ ...slot, goPuzzleCount: 99 })).toMatchObject({ goPuzzleCount: 5 })
  })

  it('rejects malformed, finished, or unknown-mode slots', () => {
    expect(normalizeResumeSlot(undefined)).toBeUndefined()
    expect(normalizeResumeSlot({ mode: 'og' })).toBeUndefined()
    expect(normalizeResumeSlot({ mode: 'tetris', scope: 'practice', wordLength: 5, serializedSession: ogSession({ currentGuess: 'cr' }) })).toBeUndefined()
    // A finished session is not resumable.
    expect(normalizeResumeSlot(createResumeSlot({ difficulty: 'expert', mode: 'og', scope: 'practice', serializedSession: ogSession({ guesses: ['crane'] }), wordLength: 5 }))).toBeUndefined()
  })

  it('describes a slot for the resume button', () => {
    const og = createResumeSlot({ difficulty: 'expert', mode: 'og', scope: 'practice', serializedSession: ogSession({ currentGuess: 'cr' }), wordLength: 5 })
    expect(describeResumeSlot(og)).toContain('og practice')
    const go = createResumeSlot({ difficulty: 'expert', goPuzzleCount: 10, mode: 'go', scope: 'daily', serializedSession: goSession({ currentPuzzleIndex: 1, priorAnswers: ['crane'] }), wordLength: 5 })
    expect(describeResumeSlot(go)).toContain('10 puzzles')
  })

  it('normalizes independent resume slots by lane and finds the newest one', () => {
    const practiceOg = createResumeSlot({ difficulty: 'expert', mode: 'og', scope: 'practice', serializedSession: ogSession({ currentGuess: 'cr' }), wordLength: 5 }, '2026-05-30T06:00:00.000Z')
    const practiceGo = createResumeSlot({ difficulty: 'expert', goPuzzleCount: 5, mode: 'go', scope: 'practice', serializedSession: goSession({ currentPuzzleIndex: 1, priorAnswers: ['crane'] }), wordLength: 5 }, '2026-05-30T07:00:00.000Z')
    const slots = normalizeResumeSlots({
      'practice-og': practiceOg,
      'practice-go': practiceGo,
      'daily-og': practiceGo,
    })

    expect(getResumeSlotKey(practiceOg)).toBe('practice-og')
    expect(slots['practice-og']).toEqual(practiceOg)
    expect(slots['practice-go']).toEqual(practiceGo)
    expect(slots['daily-og']).toBeUndefined()
    expect(getLatestResumeSlot(slots)).toEqual(practiceGo)
  })

  it('merges independent resume slots by keeping the newest per lane', () => {
    const older = createResumeSlot({ difficulty: 'expert', mode: 'og', scope: 'practice', serializedSession: ogSession({ currentGuess: 'cr' }), wordLength: 5 }, '2026-05-30T06:00:00.000Z')
    const newer = createResumeSlot({ difficulty: 'expert', mode: 'og', scope: 'practice', serializedSession: ogSession({ currentGuess: 'cra' }), wordLength: 5 }, '2026-05-30T07:00:00.000Z')
    const daily = createResumeSlot({ difficulty: 'expert', goPuzzleCount: 5, mode: 'go', scope: 'daily', serializedSession: goSession({ currentPuzzleIndex: 1, priorAnswers: ['crane'] }), wordLength: 5 }, '2026-05-30T06:30:00.000Z')

    expect(mergeResumeSlots({ 'practice-og': older }, { 'practice-og': newer, 'daily-go': daily })).toEqual({
      'daily-go': daily,
      'practice-og': newer,
    })
  })
})
