import { describe, expect, it } from 'vitest'
import { createDefaultGuestProgress, GUEST_PROGRESS_SCHEMA_VERSION } from './storageSchema'
import { exportGuestProgress, loadGuestProgress, recordCompletedGame, resetGuestProgress, saveGuestProgress, type KeyValueStorage } from './guestStorage'

function createMemoryStorage(initialValue?: string): KeyValueStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>()
  if (initialValue) {
    values.set('brrrdle:guest-progress:v1', initialValue)
  }
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
    values,
  }
}

describe('guest storage', () => {
  it('saves, loads, exports, and resets versioned guest progress', () => {
    const storage = createMemoryStorage()
    const progress = createDefaultGuestProgress()
    saveGuestProgress({ ...progress, progression: { ...progress.progression, coins: 12 } }, storage)

    expect(loadGuestProgress(storage).progression.coins).toBe(12)
    expect(JSON.parse(exportGuestProgress(loadGuestProgress(storage))).schemaVersion).toBe(GUEST_PROGRESS_SCHEMA_VERSION)
    expect(resetGuestProgress(storage).progression.coins).toBe(0)
  })

  it('falls back to defaults for corrupted or incompatible data', () => {
    expect(loadGuestProgress(createMemoryStorage('{broken')).schemaVersion).toBe(GUEST_PROGRESS_SCHEMA_VERSION)
    expect(loadGuestProgress(createMemoryStorage(JSON.stringify({ schemaVersion: 99 }))).progression.level).toBe(1)
  })

  it('normalizes malformed Phase 57 economy cache fields without losing legacy coins', () => {
    const legacy = createDefaultGuestProgress()
    const migrated = loadGuestProgress(createMemoryStorage(JSON.stringify({
      ...legacy,
      progression: {
        ...legacy.progression,
        coins: 17,
        consumables: { removeIncorrectLetters: -2, revealOneLetter: 'bad' },
        economyOperationIds: ['valid', '', 'valid', 42],
        economyRevision: -9,
      },
    })))

    expect(migrated.progression).toMatchObject({
      coins: 17,
      consumables: { removeIncorrectLetters: 0, revealOneLetter: 0 },
      economyOperationIds: ['valid'],
      economyRevision: 0,
    })
  })

  it('migrates legacy v1 payloads without losing progress and fills the difficulty default', () => {
    const legacy = createDefaultGuestProgress()
    const legacyPayload = JSON.stringify({
      ...legacy,
      schemaVersion: 1,
      progression: { ...legacy.progression, coins: 42, xp: 120, level: 3 },
      settings: { hardModeDefault: true, reducedMotion: true },
    })
    const migrated = loadGuestProgress(createMemoryStorage(legacyPayload))

    expect(migrated.schemaVersion).toBe(GUEST_PROGRESS_SCHEMA_VERSION)
    expect(migrated.progression.coins).toBe(42)
    expect(migrated.progression.xp).toBe(120)
    expect(migrated.progression.level).toBe(3)
    expect(migrated.settings.hardModeDefault).toBe(true)
    expect(migrated.settings.reducedMotion).toBe(true)
    expect(migrated.settings.difficultyDefault).toBe('expert')
    expect(migrated.settings.goPuzzleCountDefault).toBe(5)
    expect(migrated.settings.themeDefault).toBe('icy')
    expect(migrated.settings.dailyMultiplayerCountdownEnabled).toBe(true)
    expect(migrated.settings.inAppNotificationsEnabled).toBe(true)
    expect(migrated.settings.inAppNotificationMode).toBe('all')
    expect(migrated.settings.notificationSoundMode).toBe('important-only')
    expect(migrated.settings.browserNotificationsEnabled).toBe(false)
    expect(migrated.practiceSeeds).toEqual({ go: 0, og: 0 })
    expect(migrated.multiplayer?.games).toHaveLength(0)
    expect(migrated.competitiveMultiplayer?.rating.profiles).toHaveLength(0)
  })

  it('migrates notification preferences from current and stale settings payloads', () => {
    const persisted = loadGuestProgress(createMemoryStorage(JSON.stringify({
      ...createDefaultGuestProgress(),
      schemaVersion: 8,
      settings: {
        ...createDefaultGuestProgress().settings,
        browserNotificationsEnabled: true,
        inAppNotificationMode: 'important-only',
        inAppNotificationsEnabled: false,
        notificationSoundMode: 'all',
      },
    })))
    const corrupt = loadGuestProgress(createMemoryStorage(JSON.stringify({
      ...createDefaultGuestProgress(),
      schemaVersion: 8,
      settings: {
        ...createDefaultGuestProgress().settings,
        browserNotificationsEnabled: 'yes',
        inAppNotificationMode: 'everything',
        inAppNotificationsEnabled: 'nope',
        notificationSoundMode: 'loud',
      },
    })))

    expect(persisted.schemaVersion).toBe(GUEST_PROGRESS_SCHEMA_VERSION)
    expect(persisted.settings.inAppNotificationsEnabled).toBe(false)
    expect(persisted.settings.inAppNotificationMode).toBe('important-only')
    expect(persisted.settings.notificationSoundMode).toBe('all')
    expect(persisted.settings.browserNotificationsEnabled).toBe(true)
    expect(corrupt.settings.inAppNotificationsEnabled).toBe(true)
    expect(corrupt.settings.inAppNotificationMode).toBe('all')
    expect(corrupt.settings.notificationSoundMode).toBe('important-only')
    expect(corrupt.settings.browserNotificationsEnabled).toBe(false)
  })

  it('records completed games once for history, stats, XP, and coins', () => {
    const progress = recordCompletedGame({
      attemptsUsed: 3,
      gameId: 'daily-og-2026-05-26',
      maxAttempts: 6,
      mode: 'og',
      scope: 'daily',
      status: 'won',
      word: 'crane',
      wordLength: 5,
    }, createDefaultGuestProgress())
    const duplicate = recordCompletedGame({
      attemptsUsed: 3,
      gameId: 'daily-og-2026-05-26',
      maxAttempts: 6,
      mode: 'og',
      scope: 'daily',
      status: 'won',
      word: 'crane',
      wordLength: 5,
    }, progress)

    expect(progress.history).toHaveLength(1)
    expect(progress.stats.og.daily.played).toBe(1)
    expect(progress.progression.xp).toBeGreaterThan(0)
    expect(progress.progression.coins).toBeGreaterThan(0)
    expect(duplicate).toBe(progress)
  })

  it('migrates the legacy single resume slot into the lane-based resume collection', () => {
    const legacySlot = {
      difficulty: 'expert',
      mode: 'og',
      scope: 'practice',
      serializedSession: { answer: 'crane', continuationCount: 0, currentGuess: 'cr', guesses: [], hardMode: false, maxAttempts: 6 },
      updatedAt: '2026-05-30T06:00:00.000Z',
      wordLength: 5,
    } as const
    const migrated = loadGuestProgress(createMemoryStorage(JSON.stringify({
      ...createDefaultGuestProgress(),
      resumeSlot: legacySlot,
      schemaVersion: 3,
    })))

    expect(migrated.resumeSlot).toEqual(legacySlot)
    expect(migrated.resumeSlots?.['practice-og']).toEqual(legacySlot)
  })

  it('clears only the completed lane from the resume collection', () => {
    const practiceOg = {
      difficulty: 'expert',
      mode: 'og',
      scope: 'practice',
      serializedSession: { answer: 'crane', continuationCount: 0, currentGuess: 'cr', guesses: [], hardMode: false, maxAttempts: 6 },
      updatedAt: '2026-05-30T06:00:00.000Z',
      wordLength: 5,
    } as const
    const practiceGo = {
      difficulty: 'expert',
      goPuzzleCount: 5,
      mode: 'go',
      scope: 'practice',
      serializedSession: {
        currentPuzzleIndex: 1,
        hardMode: false,
        priorAnswers: ['crane'],
        puzzles: [
          { answer: 'crane', continuationCount: 0, currentGuess: '', guesses: ['crane'], maxAttempts: 6, prefilledGuesses: [] },
          { answer: 'plumb', continuationCount: 0, currentGuess: 'pl', guesses: [], maxAttempts: 6, prefilledGuesses: ['crane'] },
        ],
      },
      updatedAt: '2026-05-30T07:00:00.000Z',
      wordLength: 5,
    } as const
    const progress = recordCompletedGame({
      attemptsUsed: 3,
      gameId: 'practice-og-2026-05-26',
      maxAttempts: 6,
      mode: 'og',
      scope: 'practice',
      status: 'won',
      word: 'crane',
      wordLength: 5,
    }, {
      ...createDefaultGuestProgress(),
      resumeSlot: practiceGo,
      resumeSlots: {
        'practice-go': practiceGo,
        'practice-og': practiceOg,
      },
    })

    expect(progress.resumeSlots?.['practice-og']).toBeUndefined()
    expect(progress.resumeSlots?.['practice-go']).toEqual(practiceGo)
    expect(progress.resumeSlot).toEqual(practiceGo)
  })
})
