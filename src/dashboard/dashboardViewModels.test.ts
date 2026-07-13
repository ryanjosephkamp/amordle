import { describe, expect, it } from 'vitest'
import { createResumeSlot, type GameHistoryEntry, type ResumeSlotCollection } from '../account'
import type { AuthState } from '../account/auth'
import {
  createEmptyCompetitiveMultiplayerState,
  settleMultiplayerStateResults,
} from '../multiplayer/competitiveMultiplayer'
import {
  createMultiplayerGame,
  getMultiplayerAnswerWords,
  submitMultiplayerGuess,
} from '../multiplayer/multiplayer'
import { createDashboardViewModel } from './dashboardViewModels'

const authenticatedViewer: AuthState = {
  status: 'authenticated',
  user: {
    id: 'viewer-user',
    roles: [],
  },
}

function ogSession(overrides: Partial<Parameters<typeof createResumeSlot>[0]['serializedSession']> = {}) {
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

function createSoloSlots(): ResumeSlotCollection {
  return {
    'daily-og': createResumeSlot({
      difficulty: 'expert',
      mode: 'og',
      scope: 'daily',
      serializedSession: ogSession({ guesses: ['slate'] }),
      wordLength: 5,
    }, '2026-06-14T01:00:00.000Z'),
  }
}

const soloHistory: GameHistoryEntry[] = [
  {
    attemptsUsed: 3,
    coinAward: 10,
    completedAt: '2026-06-14T02:00:00.000Z',
    gameId: 'solo-daily-og',
    mode: 'og',
    scope: 'daily',
    status: 'won',
    word: 'crane',
    wordLength: 5,
    xpAward: 50,
  },
]

describe('dashboard view models', () => {
  it('projects active games, lobby, Live v1, and recent results from existing selectors', () => {
    const active = createMultiplayerGame({
      createdAt: '2026-06-14T03:00:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'viewer-user', 'player-two': 'rival-user' },
      scope: 'practice',
      timeLimitMs: 60_000,
      wordLength: 5,
    })
    const lobby = createMultiplayerGame({
      createdAt: '2026-06-14T03:05:00.000Z',
      mode: 'go',
      playerUserIds: { 'player-one': 'rival-user' },
      scope: 'practice',
      wordLength: 5,
    })
    const restrictedLive = createMultiplayerGame({
      createdAt: '2026-06-14T03:10:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'other-user', 'player-two': 'third-user' },
      scope: 'practice',
      wordLength: 5,
    })
    const completedBase = createMultiplayerGame({
      createdAt: '2026-06-14T04:00:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'viewer-user', 'player-two': 'rival-user' },
      scope: 'practice',
      wordLength: 5,
    })
    const completed = submitMultiplayerGuess({ games: [completedBase] }, {
      gameId: completedBase.id,
      guess: getMultiplayerAnswerWords(completedBase)[0],
      now: '2026-06-14T04:01:00.000Z',
      playerId: 'player-one',
    })
    const competitiveMultiplayerState = settleMultiplayerStateResults(
      createEmptyCompetitiveMultiplayerState(),
      completed.state,
      authenticatedViewer,
    )

    const dashboard = createDashboardViewModel({
      competitiveMultiplayerState,
      dailyDateKey: '2026-06-14',
      generatedAt: '2026-06-14T05:00:00.000Z',
      history: soloHistory,
      multiplayerState: { games: [active, lobby, restrictedLive] },
      resumeSlots: createSoloSlots(),
      viewerUserId: 'viewer-user',
    })

    expect(dashboard.summary).toMatchObject({
      activeMultiplayerCount: 1,
      activeSoloCount: 1,
      liveGameCount: 1,
      openLobbyCount: 1,
      recentMultiplayerResultCount: 1,
      recentSoloResultCount: 1,
      restrictedLiveGameCount: 1,
      yourTurnMultiplayerCount: 1,
    })
    expect(dashboard.activeSolo[0]).toMatchObject({
      actionTarget: { routeId: 'solo', selectedSoloGameKey: 'daily-og', soloSubtab: 'active' },
      title: 'Daily Solo OG',
    })
    expect(dashboard.activeMultiplayer[0]).toMatchObject({
      actionTarget: {
        multiplayerSubtab: 'active',
        resumeMultiplayerGameId: active.id,
        routeId: 'multiplayer',
        selectedMultiplayerGameId: active.id,
      },
      turnLabel: 'Your turn',
    })
    expect(dashboard.yourTurnMultiplayer.map((game) => game.id)).toEqual([active.id])
    expect(dashboard.lobbyPreview[0]).toMatchObject({
      actionTarget: { multiplayerSubtab: 'lobby', routeId: 'multiplayer', selectedMultiplayerGameId: lobby.id },
      canJoin: true,
    })
    expect(dashboard.livePreview[0]).toMatchObject({
      actionTarget: { multiplayerSubtab: 'live', routeId: 'multiplayer', selectedMultiplayerGameId: active.id },
      id: active.id,
    })
    expect(dashboard.recentSolo[0].actionTarget).toEqual({
      historyFilters: { mode: 'all', player: 'solo', scope: 'all' },
      routeId: 'history',
    })
    expect(dashboard.recentMultiplayer[0]).toMatchObject({
      actionTarget: { historyFilters: { mode: 'all', player: 'multiplayer', scope: 'all' }, routeId: 'history' },
      outcomeLabel: 'Won',
    })
  })

  it('does not surface stale account-owned multiplayer attention for signed-out guests', () => {
    const active = createMultiplayerGame({
      createdAt: '2026-06-14T03:00:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'viewer-user', 'player-two': 'rival-user' },
      scope: 'practice',
      wordLength: 5,
    })
    const completedBase = createMultiplayerGame({
      createdAt: '2026-06-14T04:00:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'viewer-user', 'player-two': 'rival-user' },
      scope: 'practice',
      wordLength: 5,
    })
    const completed = submitMultiplayerGuess({ games: [completedBase] }, {
      gameId: completedBase.id,
      guess: getMultiplayerAnswerWords(completedBase)[0],
      now: '2026-06-14T04:01:00.000Z',
      playerId: 'player-one',
    })
    const competitiveMultiplayerState = settleMultiplayerStateResults(
      createEmptyCompetitiveMultiplayerState(),
      completed.state,
      authenticatedViewer,
    )

    const dashboard = createDashboardViewModel({
      competitiveMultiplayerState,
      generatedAt: '2026-06-14T05:00:00.000Z',
      multiplayerState: { games: [active] },
    })

    expect(dashboard.summary).toMatchObject({
      activeMultiplayerCount: 0,
      recentMultiplayerResultCount: 0,
      restrictedLiveGameCount: 0,
      yourTurnMultiplayerCount: 0,
    })
    expect(dashboard.activeMultiplayer).toEqual([])
    expect(dashboard.yourTurnMultiplayer).toEqual([])
    expect(dashboard.livePreview).toEqual([])
    expect(dashboard.recentMultiplayer).toEqual([])
    expect(dashboard.quickActions.find((action) => action.id === 'active-multiplayer')?.attentionCount).toBe(0)
    expect(dashboard.quickActions.find((action) => action.id === 'history')?.attentionCount).toBe(0)
  })

  it('keeps preview limits separate from summary counts and projects Daily readiness', () => {
    const dashboard = createDashboardViewModel({
      dailyMultiplayer: {
        detailLabel: 'Daily Multiplayer resets at 00:00 UTC.',
        ready: false,
        resetAt: '2026-06-15T00:00:00.000Z',
      },
      dailySolo: {
        actionLabel: 'Play Daily Solo',
        detailLabel: 'Daily Solo is available now.',
        ready: true,
        resetAt: '2026-06-15T00:00:00.000Z',
      },
      generatedAt: '2026-06-14T05:00:00.000Z',
      history: soloHistory,
      limits: {
        activeSolo: 0,
        recentSolo: 0,
      },
      resumeSlots: createSoloSlots(),
    })

    expect(dashboard.activeSolo).toEqual([])
    expect(dashboard.recentSolo).toEqual([])
    expect(dashboard.summary.activeSoloCount).toBe(1)
    expect(dashboard.summary.recentSoloResultCount).toBe(0)
    expect(dashboard.daily).toEqual([
      {
        actionLabel: 'Play Daily Solo',
        actionTarget: { routeId: 'solo', soloSubtab: 'daily' },
        detailLabel: 'Daily Solo is available now.',
        id: 'daily-solo',
        ready: true,
        resetAt: '2026-06-15T00:00:00.000Z',
        title: 'Daily Solo',
      },
      {
        actionLabel: 'Open daily',
        actionTarget: { multiplayerSubtab: 'daily', routeId: 'multiplayer' },
        detailLabel: 'Daily Multiplayer resets at 00:00 UTC.',
        id: 'daily-multiplayer',
        ready: false,
        resetAt: '2026-06-15T00:00:00.000Z',
        title: 'Daily Multiplayer',
      },
    ])
    expect(dashboard.quickActions.find((action) => action.id === 'daily-solo')).toMatchObject({
      attentionCount: 1,
      label: 'Daily Solo',
    })
  })

  it('handles empty inputs without surfacing phantom attention', () => {
    const dashboard = createDashboardViewModel({
      generatedAt: '2026-06-14T05:00:00.000Z',
    })

    expect(dashboard.summary).toEqual({
      activeMultiplayerCount: 0,
      activeSoloCount: 0,
      liveGameCount: 0,
      openLobbyCount: 0,
      recentMultiplayerResultCount: 0,
      recentSoloResultCount: 0,
      restrictedLiveGameCount: 0,
      yourTurnMultiplayerCount: 0,
    })
    expect(dashboard.activeSolo).toEqual([])
    expect(dashboard.activeMultiplayer).toEqual([])
    expect(dashboard.lobbyPreview).toEqual([])
    expect(dashboard.livePreview).toEqual([])
    expect(dashboard.recentSolo).toEqual([])
    expect(dashboard.recentMultiplayer).toEqual([])
  })
})
