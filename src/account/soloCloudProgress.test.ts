import { describe, expect, it } from 'vitest'
import { createDefaultGuestProgress } from './storageSchema'
import {
  createSoloCloudSessionKey,
  mergeSoloCloudSessionsIntoProgress,
  type SoloCloudSessionRecord,
} from './soloCloudProgress'

const updatedAt = '2026-07-07T12:00:00.000Z'

function createOgRecord(overrides: Partial<SoloCloudSessionRecord> = {}): SoloCloudSessionRecord {
  return {
    currentPuzzleIndex: 0,
    difficulty: 'expert',
    events: [],
    hardMode: false,
    mode: 'og',
    scope: 'daily',
    serializedSession: {
      answer: 'SLATE',
      continuationCount: 0,
      currentGuess: '',
      guesses: ['CRANE'],
      hardMode: false,
      maxAttempts: 6,
    },
    sessionKey: 'solo:daily:og:expert:2026-07-07',
    status: 'playing',
    updatedAt,
    wordLength: 5,
    ...overrides,
  }
}

function createGoTransitionRecord(): SoloCloudSessionRecord {
  return {
    currentPuzzleIndex: 1,
    difficulty: 'expert',
    events: [],
    goPuzzleCount: 5,
    hardMode: false,
    mode: 'go',
    scope: 'daily',
    serializedSession: {
      currentPuzzleIndex: 1,
      hardMode: false,
      priorAnswers: ['CRANE'],
      puzzles: [
        {
          answer: 'CRANE',
          continuationCount: 0,
          currentGuess: '',
          guesses: ['CRANE'],
          maxAttempts: 6,
          prefilledGuesses: [],
        },
        {
          answer: 'SLATE',
          continuationCount: 0,
          currentGuess: '',
          guesses: ['CRANE'],
          maxAttempts: 6,
          prefilledGuesses: ['CRANE'],
        },
      ],
    },
    sessionKey: 'solo:daily:go:expert:5:2026-07-07',
    status: 'playing',
    updatedAt,
    wordLength: 5,
  }
}

describe('solo cloud progress', () => {
  it('creates stable scoped session keys without raw account ids', () => {
    expect(createSoloCloudSessionKey({
      dailyDateKey: '2026-07-07',
      difficulty: 'expert',
      mode: 'go',
      scope: 'daily',
      wordLength: 5,
    })).toBe('solo:daily:go:expert:5:2026-07-07')

    expect(createSoloCloudSessionKey({
      difficulty: 'casual',
      mode: 'og',
      practiceSeed: 42,
      scope: 'practice',
      wordLength: 7,
    })).toBe('solo:practice:og:casual:7:42')
  })

  it('hydrates in-progress cloud sessions into account resume slots', () => {
    const hydrated = mergeSoloCloudSessionsIntoProgress(createDefaultGuestProgress(), [createOgRecord()])

    expect(hydrated.completedSlots['daily-og']).toBeUndefined()
    expect(hydrated.progress.resumeSlots?.['daily-og']?.mode).toBe('og')
    expect(hydrated.progress.resumeSlots?.['daily-og']?.updatedAt).toBe(updatedAt)
  })

  it('keeps private Practice consumable effects in the hydrated serialized session', () => {
    const hydrated = mergeSoloCloudSessionsIntoProgress(createDefaultGuestProgress(), [createOgRecord({
      scope: 'practice',
      serializedSession: {
        ...createOgRecord().serializedSession,
        consumableEffects: { removedLetters: ['z'], revealedHints: [{ index: 2, letter: 'a' }] },
      },
      sessionKey: 'solo:practice:og:expert:5:1',
    })])
    const slot = hydrated.progress.resumeSlots?.['practice-og']

    expect(slot?.mode).toBe('og')
    expect(slot?.mode === 'og' ? slot.serializedSession.consumableEffects : undefined).toEqual({
      removedLetters: ['z'],
      revealedHints: [{ index: 2, letter: 'a' }],
    })
  })

  it('hydrates completed cloud sessions into display-only slots', () => {
    const hydrated = mergeSoloCloudSessionsIntoProgress(createDefaultGuestProgress(), [
      createOgRecord({
        completedAt: updatedAt,
        serializedSession: {
          answer: 'SLATE',
          continuationCount: 0,
          currentGuess: '',
          guesses: ['SLATE'],
          hardMode: false,
          maxAttempts: 6,
        },
        status: 'won',
      }),
    ])

    expect(hydrated.progress.resumeSlots?.['daily-og']).toBeUndefined()
    expect(hydrated.completedSlots['daily-og']?.mode).toBe('og')
    expect(hydrated.completedSlots['daily-og']?.updatedAt).toBe(updatedAt)
  })

  it('hydrates Daily GO first-puzzle solves as puzzle two resume state', () => {
    const hydrated = mergeSoloCloudSessionsIntoProgress(createDefaultGuestProgress(), [createGoTransitionRecord()])
    const slot = hydrated.progress.resumeSlots?.['daily-go']

    expect(slot?.mode).toBe('go')
    expect(slot?.mode === 'go' ? slot.serializedSession.currentPuzzleIndex : undefined).toBe(1)
    expect(slot?.mode === 'go' ? slot.serializedSession.priorAnswers : []).toEqual(['CRANE'])
  })

  it('keeps more advanced local Daily progress when a later-timestamped cloud row is behind', () => {
    const local = mergeSoloCloudSessionsIntoProgress(createDefaultGuestProgress(), [createOgRecord({
      serializedSession: {
        ...createOgRecord().serializedSession,
        guesses: ['CRANE', 'PLANT'],
      },
      updatedAt: '2026-07-07T12:00:00.000Z',
    })]).progress

    const hydrated = mergeSoloCloudSessionsIntoProgress(local, [createOgRecord({
      serializedSession: {
        ...createOgRecord().serializedSession,
        guesses: ['CRANE'],
      },
      updatedAt: '2026-07-07T12:01:00.000Z',
    })])
    const slot = hydrated.progress.resumeSlots?.['daily-og']

    expect(slot?.mode === 'og' ? slot.serializedSession.guesses : []).toEqual(['CRANE', 'PLANT'])
  })

  it('accepts more advanced cloud Daily progress even when its timestamp is older', () => {
    const local = mergeSoloCloudSessionsIntoProgress(createDefaultGuestProgress(), [createOgRecord({
      serializedSession: {
        ...createOgRecord().serializedSession,
        guesses: ['CRANE'],
      },
      updatedAt: '2026-07-07T12:01:00.000Z',
    })]).progress

    const hydrated = mergeSoloCloudSessionsIntoProgress(local, [createOgRecord({
      serializedSession: {
        ...createOgRecord().serializedSession,
        guesses: ['CRANE', 'PLANT'],
      },
      updatedAt: '2026-07-07T12:00:00.000Z',
    })])
    const slot = hydrated.progress.resumeSlots?.['daily-og']

    expect(slot?.mode === 'og' ? slot.serializedSession.guesses : []).toEqual(['CRANE', 'PLANT'])
  })

  it('skips superseded Practice cloud sessions when the account has advanced to a newer seed', () => {
    const hydrated = mergeSoloCloudSessionsIntoProgress(createDefaultGuestProgress(), [
      createOgRecord({
        completedAt: updatedAt,
        practiceSeed: 0,
        scope: 'practice',
        serializedSession: {
          answer: 'SLATE',
          continuationCount: 0,
          currentGuess: '',
          guesses: ['SLATE'],
          hardMode: false,
          maxAttempts: 6,
        },
        sessionKey: 'solo:practice:og:expert:5:0',
        status: 'won',
      }),
      createOgRecord({
        practiceSeed: 1,
        scope: 'practice',
        sessionKey: 'solo:practice:og:expert:5:1',
      }),
    ], { currentPracticeSeeds: { og: 1 } })

    expect(hydrated.completedSlots['practice-og']).toBeUndefined()
    expect(hydrated.progress.resumeSlots?.['practice-og']?.mode).toBe('og')
    expect(hydrated.progress.resumeSlots?.['practice-og']?.updatedAt).toBe(updatedAt)
  })
})
