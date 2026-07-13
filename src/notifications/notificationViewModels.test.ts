import { describe, expect, it } from 'vitest'
import { createResumeSlot, type GameHistoryEntry } from '../account'
import type { AuthState } from '../account/auth'
import { createDashboardViewModel, type DashboardViewModel } from '../dashboard'
import {
  createEmptyCompetitiveMultiplayerState,
  settleMultiplayerStateResults,
} from '../multiplayer/competitiveMultiplayer'
import {
  createMultiplayerGame,
  getMultiplayerAnswerWords,
  submitMultiplayerGuess,
} from '../multiplayer/multiplayer'
import type { NotificationMetadataState } from './notificationStorage'
import { createNotificationViewModel } from './notificationViewModels'
import type { PrivateMatchRequestResult } from '../multiplayer/multiplayerRepository'

const authenticatedViewer: AuthState = {
  status: 'authenticated',
  user: {
    id: 'viewer-user',
    roles: [],
  },
}

function privateRequest(overrides: Partial<PrivateMatchRequestResult> = {}): PrivateMatchRequestResult {
  return {
    created: false, createdAt: '2026-07-10T12:00:00.000Z', expired: false,
    expiresAt: '2026-07-10T12:10:00.000Z', hardMode: false, idempotent: false, mode: 'og',
    opponent: { displayName: 'Opponent', identityAvailable: true }, requestId: 'private-request-1',
    requester: { displayName: 'Requester', identityAvailable: true }, requestStatus: 'requested',
    updatedAt: '2026-07-10T12:00:00.000Z', viewerCanAccept: true, viewerCanCancel: false,
    viewerCanDecline: true, viewerRole: 'opponent', wordLength: 5, ...overrides,
  }
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

function createDashboardFixture(): DashboardViewModel {
  const active = createMultiplayerGame({
    createdAt: '2026-06-14T03:00:00.000Z',
    mode: 'og',
    playerUserIds: { 'player-one': 'viewer-user', 'player-two': 'rival-user' },
    scope: 'practice',
    wordLength: 5,
  })
  const lobby = createMultiplayerGame({
    createdAt: '2026-06-14T03:05:00.000Z',
    mode: 'go',
    playerUserIds: { 'player-one': 'rival-user' },
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
  const history: GameHistoryEntry[] = [
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

  return createDashboardViewModel({
    competitiveMultiplayerState,
    dailyMultiplayer: {
      detailLabel: 'Daily Multiplayer is available now.',
      ready: true,
      resetAt: '2026-06-15T00:00:00.000Z',
    },
    dailySolo: {
      detailLabel: 'Daily Solo is available now.',
      ready: true,
      resetAt: '2026-06-15T00:00:00.000Z',
    },
    generatedAt: '2026-06-14T05:00:00.000Z',
    history,
    multiplayerState: { games: [active, lobby] },
    resumeSlots: {
      'daily-og': createResumeSlot({
        difficulty: 'expert',
        mode: 'og',
        scope: 'daily',
        serializedSession: ogSession({ guesses: ['slate'] }),
        wordLength: 5,
      }, '2026-06-14T01:00:00.000Z'),
    },
    viewerUserId: 'viewer-user',
  })
}

describe('notification view models', () => {
  it('projects private request lifecycle items with stable request-center and game actions', () => {
    const pendingView = createNotificationViewModel({ privateMatchRequests: [privateRequest()] })
    const createdView = createNotificationViewModel({ privateMatchRequests: [privateRequest({
      createdGameId: 'private-game-1', requestStatus: 'created', updatedAt: '2026-07-10T12:03:00.000Z',
      viewerCanAccept: false, viewerCanDecline: false,
    })] })

    expect(pendingView.items).toEqual(expect.arrayContaining([expect.objectContaining({
      actionTarget: { multiplayerSubtab: 'practice', routeId: 'multiplayer' },
      id: 'private-request:private-request-1:requested', kind: 'private-request-incoming',
    })]))
    expect(createdView.items).toEqual(expect.arrayContaining([expect.objectContaining({
      actionTarget: { selectedMultiplayerGameId: 'private-game-1', multiplayerSubtab: 'practice', routeId: 'multiplayer' },
      id: 'private-request:private-request-1:created', kind: 'private-request-created',
    })]))
  })

  it('suppresses private request items when their dedicated preference is off', () => {
    const view = createNotificationViewModel({
      notificationPreferences: { privateRequestNotificationsEnabled: false },
      privateMatchRequests: [privateRequest()],
    })
    expect(view.items.some((item) => item.kind.startsWith('private-request-'))).toBe(false)
  })
  it('projects deterministic notification items from dashboard state', () => {
    const dashboard = createDashboardFixture()
    const notifications = createNotificationViewModel({
      dashboard,
      now: '2026-06-14T05:00:00.000Z',
    })

    expect(notifications.totalCandidateCount).toBe(6)
    expect(notifications.unreadCount).toBe(6)
    expect(notifications.items.map((item) => item.kind)).toEqual([
      'multiplayer-your-turn',
      'daily-multiplayer-ready',
      'daily-solo-ready',
      'multiplayer-completed',
      'lobby-open',
      'live-active',
    ])
    expect(notifications.items[0]).toMatchObject({
      actionTarget: {
        multiplayerSubtab: 'active',
        resumeMultiplayerGameId: dashboard.yourTurnMultiplayer[0].id,
        routeId: 'multiplayer',
        selectedMultiplayerGameId: dashboard.yourTurnMultiplayer[0].id,
      },
      priority: 'high',
      source: 'multiplayer',
      title: 'Your turn',
    })
    expect(notifications.items.find((item) => item.kind === 'daily-solo-ready')).toMatchObject({
      actionTarget: { routeId: 'solo', soloSubtab: 'daily' },
      detail: 'Daily Solo is available now.',
    })
    expect(notifications.items.find((item) => item.kind === 'lobby-open')).toMatchObject({
      actionTarget: { multiplayerSubtab: 'lobby', routeId: 'multiplayer' },
      detail: '1 lobby available from safe Lobby state.',
    })
  })

  it('filters read and dismissed metadata by exact fingerprint by default', () => {
    const dashboard = createDashboardFixture()
    const baseline = createNotificationViewModel({
      dashboard,
      now: '2026-06-14T05:00:00.000Z',
    })
    const turn = baseline.items.find((item) => item.kind === 'multiplayer-your-turn')!
    const lobby = baseline.items.find((item) => item.kind === 'lobby-open')!
    const metadata: NotificationMetadataState = {
      records: [
        {
          fingerprint: turn.fingerprint,
          id: turn.id,
          readAt: '2026-06-14T05:01:00.000Z',
        },
        {
          dismissedAt: '2026-06-14T05:02:00.000Z',
          fingerprint: lobby.fingerprint,
          id: lobby.id,
        },
      ],
      version: 1,
    }

    const filtered = createNotificationViewModel({
      dashboard,
      notificationMetadata: metadata,
      now: '2026-06-14T05:03:00.000Z',
    })
    const includeRead = createNotificationViewModel({
      dashboard,
      includeRead: true,
      notificationMetadata: metadata,
      now: '2026-06-14T05:03:00.000Z',
    })

    expect(filtered.items.map((item) => item.id)).not.toContain(turn.id)
    expect(filtered.items.map((item) => item.id)).not.toContain(lobby.id)
    expect(filtered.readCount).toBe(1)
    expect(filtered.dismissedCount).toBe(1)
    expect(includeRead.items.find((item) => item.id === turn.id)).toMatchObject({
      dismissed: false,
      read: true,
    })
    expect(includeRead.items.map((item) => item.id)).not.toContain(lobby.id)
  })

  it('filters low-priority freshness items in important-only mode', () => {
    const notifications = createNotificationViewModel({
      dashboard: createDashboardFixture(),
      notificationPreferences: {
        inAppNotificationMode: 'important-only',
        inAppNotificationsEnabled: true,
      },
      now: '2026-06-14T05:00:00.000Z',
    })

    expect(notifications.totalCandidateCount).toBe(4)
    expect(notifications.unreadCount).toBe(4)
    expect(notifications.items.map((item) => item.kind)).toEqual([
      'multiplayer-your-turn',
      'daily-multiplayer-ready',
      'daily-solo-ready',
      'multiplayer-completed',
    ])
  })

  it('does not create multiplayer notifications from stale account rows for signed-out guests', () => {
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

    const notifications = createNotificationViewModel({
      competitiveMultiplayerState,
      generatedAt: '2026-06-14T05:00:00.000Z',
      multiplayerState: { games: [active] },
      now: '2026-06-14T05:00:00.000Z',
    })

    expect(notifications).toMatchObject({
      items: [],
      totalCandidateCount: 0,
      unreadCount: 0,
    })
  })

  it('suppresses in-app notifications without clearing metadata', () => {
    const dashboard = createDashboardFixture()
    const baseline = createNotificationViewModel({
      dashboard,
      now: '2026-06-14T05:00:00.000Z',
    })
    const turn = baseline.items.find((item) => item.kind === 'multiplayer-your-turn')!
    const metadata: NotificationMetadataState = {
      records: [{
        fingerprint: turn.fingerprint,
        id: turn.id,
        readAt: '2026-06-14T05:01:00.000Z',
      }],
      version: 1,
    }

    const disabled = createNotificationViewModel({
      dashboard,
      notificationMetadata: metadata,
      notificationPreferences: {
        inAppNotificationMode: 'all',
        inAppNotificationsEnabled: false,
      },
      now: '2026-06-14T05:02:00.000Z',
    })
    const restored = createNotificationViewModel({
      dashboard,
      includeRead: true,
      notificationMetadata: metadata,
      notificationPreferences: {
        inAppNotificationMode: 'all',
        inAppNotificationsEnabled: true,
      },
      now: '2026-06-14T05:03:00.000Z',
    })

    expect(disabled).toMatchObject({
      dismissedCount: 0,
      items: [],
      readCount: 0,
      totalCandidateCount: 0,
      unreadCount: 0,
    })
    expect(restored.items.find((item) => item.id === turn.id)).toMatchObject({
      read: true,
    })
  })

  it('resurfaces a read notification when source state materially changes', () => {
    const dashboard = createDashboardFixture()
    const baseline = createNotificationViewModel({
      dashboard,
      now: '2026-06-14T05:00:00.000Z',
    })
    const turn = baseline.items.find((item) => item.kind === 'multiplayer-your-turn')!
    const changedDashboard: DashboardViewModel = {
      ...dashboard,
      yourTurnMultiplayer: dashboard.yourTurnMultiplayer.map((game) => ({
        ...game,
        updatedAt: '2026-06-14T05:10:00.000Z',
      })),
    }

    const changed = createNotificationViewModel({
      dashboard: changedDashboard,
      notificationMetadata: {
        records: [{
          fingerprint: turn.fingerprint,
          id: turn.id,
          readAt: '2026-06-14T05:01:00.000Z',
        }],
        version: 1,
      },
      now: '2026-06-14T05:11:00.000Z',
    })

    expect(changed.items.find((item) => item.id === turn.id)).toMatchObject({
      read: false,
      updatedAt: '2026-06-14T05:10:00.000Z',
    })
  })

  it('handles empty dashboards without phantom notifications', () => {
    const notifications = createNotificationViewModel({
      generatedAt: '2026-06-14T05:00:00.000Z',
      now: '2026-06-14T05:00:00.000Z',
    })

    expect(notifications).toEqual({
      dismissedCount: 0,
      generatedAt: '2026-06-14T05:00:00.000Z',
      items: [],
      readCount: 0,
      totalCandidateCount: 0,
      unreadCount: 0,
    })
  })
})
