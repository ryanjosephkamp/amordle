import { describe, expect, it } from 'vitest'
import { createDefaultGuestProgress } from './storageSchema'
import { mergeGuestProgressIntoCloud } from './guestTransfer'
import { createMultiplayerGame } from '../multiplayer'

describe('guest transfer', () => {
  it('merges local and cloud progress without losing history or completed IDs', () => {
    const local = {
      ...createDefaultGuestProgress(),
      completedGameIds: ['local-game'],
      history: [{ attemptsUsed: 1, coinAward: 10, completedAt: '2026-05-26T01:00:00Z', gameId: 'local-game', mode: 'og', scope: 'daily', status: 'won', word: 'crane', wordLength: 5, xpAward: 50 }],
      progression: { ...createDefaultGuestProgress().progression, coins: 10, xp: 150 },
    } as const
    const cloud = {
      ...createDefaultGuestProgress(),
      completedGameIds: ['cloud-game'],
      history: [{ attemptsUsed: 2, coinAward: 8, completedAt: '2026-05-26T00:00:00Z', gameId: 'cloud-game', mode: 'go', scope: 'practice', status: 'won', word: 'brisk', wordLength: 5, xpAward: 40 }],
      progression: { ...createDefaultGuestProgress().progression, coins: 20, xp: 90 },
    } as const

    const merged = mergeGuestProgressIntoCloud(local, cloud)

    expect(merged.completedGameIds).toEqual(['cloud-game', 'local-game'])
    expect(merged.history.map((entry) => entry.gameId)).toEqual(['local-game', 'cloud-game'])
    expect(merged.progression.coins).toBe(20)
    expect(merged.progression.xp).toBe(150)
    expect(merged.progression.level).toBe(2)
  })

  it('keeps the higher-revision economy snapshot instead of resurrecting spent resources', () => {
    const stale = {
      ...createDefaultGuestProgress(),
      progression: {
        ...createDefaultGuestProgress().progression,
        coins: 100,
        consumables: { removeIncorrectLetters: 2, revealOneLetter: 2 },
        economyRevision: 1,
      },
    }
    const spent = {
      ...createDefaultGuestProgress(),
      progression: {
        ...createDefaultGuestProgress().progression,
        coins: 35,
        consumables: { removeIncorrectLetters: 0, revealOneLetter: 1 },
        economyRevision: 4,
      },
    }

    expect(mergeGuestProgressIntoCloud(stale, spent).progression).toMatchObject({
      coins: 35,
      consumables: { removeIncorrectLetters: 0, revealOneLetter: 1 },
      economyRevision: 4,
    })
    expect(mergeGuestProgressIntoCloud(spent, stale).progression.coins).toBe(35)
  })

  it('keeps the difficulty default from the side with more history (signed-in persistence)', () => {
    const local = {
      ...createDefaultGuestProgress(),
      history: [
        { attemptsUsed: 1, coinAward: 10, completedAt: '2026-05-26T01:00:00Z', gameId: 'a', mode: 'og', scope: 'daily', status: 'won', word: 'crane', wordLength: 5, xpAward: 50 },
        { attemptsUsed: 1, coinAward: 10, completedAt: '2026-05-26T02:00:00Z', gameId: 'b', mode: 'og', scope: 'daily', status: 'won', word: 'plumb', wordLength: 5, xpAward: 50 },
      ],
      settings: { ...createDefaultGuestProgress().settings, difficultyDefault: 'casual' },
    } as const
    const cloud = {
      ...createDefaultGuestProgress(),
      settings: { ...createDefaultGuestProgress().settings, difficultyDefault: 'expert' },
    } as const

    expect(mergeGuestProgressIntoCloud(local, cloud).settings.difficultyDefault).toBe('casual')
    expect(mergeGuestProgressIntoCloud(cloud, local).settings.difficultyDefault).toBe('casual')
  })

  it('syncs notification preferences with the winning settings payload', () => {
    const local = {
      ...createDefaultGuestProgress(),
      history: [
        { attemptsUsed: 1, coinAward: 10, completedAt: '2026-05-26T01:00:00Z', gameId: 'a', mode: 'og', scope: 'daily', status: 'won', word: 'crane', wordLength: 5, xpAward: 50 },
      ],
      settings: {
        ...createDefaultGuestProgress().settings,
        browserNotificationsEnabled: true,
        inAppNotificationMode: 'important-only',
        inAppNotificationsEnabled: false,
        notificationSoundMode: 'off',
      },
    } as const
    const cloud = {
      ...createDefaultGuestProgress(),
      settings: {
        ...createDefaultGuestProgress().settings,
        browserNotificationsEnabled: false,
        inAppNotificationMode: 'all',
        inAppNotificationsEnabled: true,
        notificationSoundMode: 'important-only',
      },
    } as const

    expect(mergeGuestProgressIntoCloud(local, cloud).settings).toMatchObject({
      browserNotificationsEnabled: true,
      inAppNotificationMode: 'important-only',
      inAppNotificationsEnabled: false,
      notificationSoundMode: 'off',
    })
  })

  it('normalizes the winning settings so a missing tier falls back to the default (migration-safe)', () => {
    const local = {
      ...createDefaultGuestProgress(),
      settings: { hardModeDefault: true, reducedMotion: false } as unknown as ReturnType<typeof createDefaultGuestProgress>['settings'],
    }
    const cloud = createDefaultGuestProgress()

    const merged = mergeGuestProgressIntoCloud(local, cloud)
    expect(merged.settings.difficultyDefault).toBe('expert')
    expect(merged.settings.hardModeDefault).toBe(true)
    expect(merged.settings.inAppNotificationsEnabled).toBe(true)
    expect(merged.settings.inAppNotificationMode).toBe('all')
    expect(merged.settings.notificationSoundMode).toBe('important-only')
    expect(merged.settings.browserNotificationsEnabled).toBe(false)
  })

  it('preserves a typed resume slot from either side', () => {
    const slot = {
      difficulty: 'expert',
      mode: 'og',
      scope: 'practice',
      serializedSession: { answer: 'crane', continuationCount: 0, currentGuess: 'cr', guesses: [], hardMode: false, maxAttempts: 6 },
      updatedAt: '2026-05-30T06:00:00.000Z',
      wordLength: 5,
    } as const
    const local = { ...createDefaultGuestProgress(), resumeSlot: slot }
    const cloud = createDefaultGuestProgress()

    expect(mergeGuestProgressIntoCloud(local, cloud).resumeSlot).toEqual(slot)
    expect(mergeGuestProgressIntoCloud(cloud, local).resumeSlot).toEqual(slot)
    expect(mergeGuestProgressIntoCloud(cloud, cloud).resumeSlot).toBeUndefined()
  })

  it('merges lane-based resume slots without collapsing practice modes', () => {
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
    const local = { ...createDefaultGuestProgress(), resumeSlots: { 'practice-og': practiceOg } }
    const cloud = { ...createDefaultGuestProgress(), resumeSlots: { 'practice-go': practiceGo } }
    const merged = mergeGuestProgressIntoCloud(local, cloud)

    expect(merged.resumeSlots).toEqual({
      'practice-go': practiceGo,
      'practice-og': practiceOg,
    })
    expect(merged.resumeSlot).toEqual(practiceGo)
  })

  it('merges Practice seed counters by preserving the furthest per-mode progress', () => {
    const local = { ...createDefaultGuestProgress(), practiceSeeds: { go: 4, og: 1 } }
    const cloud = { ...createDefaultGuestProgress(), practiceSeeds: { go: 2, og: 9 } }

    expect(mergeGuestProgressIntoCloud(local, cloud).practiceSeeds).toEqual({ go: 4, og: 9 })
  })

  it('merges multiplayer games by id and newest update', () => {
    const localGame = {
      ...createMultiplayerGame({ createdAt: '2026-05-26T01:00:00.000Z', mode: 'og', scope: 'practice', seed: 1, wordLength: 5 }),
      id: 'shared-game',
      updatedAt: '2026-05-26T03:00:00.000Z',
    }
    const cloudGame = {
      ...localGame,
      updatedAt: '2026-05-26T02:00:00.000Z',
    }
    const merged = mergeGuestProgressIntoCloud(
      { ...createDefaultGuestProgress(), multiplayer: { games: [localGame] } },
      { ...createDefaultGuestProgress(), multiplayer: { games: [cloudGame] } },
    )

    expect(merged.multiplayer?.games).toHaveLength(1)
    expect(merged.multiplayer?.games[0].updatedAt).toBe('2026-05-26T03:00:00.000Z')
  })
})
