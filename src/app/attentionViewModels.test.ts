import { describe, expect, it } from 'vitest'
import type { DashboardViewModel } from '../dashboard'
import type { NotificationCenterViewModel } from '../notifications'
import { createRouteAttentionMap, createWorkspaceAttentionMap } from './attentionViewModels'

function createDashboard(overrides: Partial<DashboardViewModel> = {}): DashboardViewModel {
  return {
    activeMultiplayer: [],
    activeSolo: [],
    daily: [
      {
        actionLabel: 'Play now',
        actionTarget: { routeId: 'solo', soloSubtab: 'daily' },
        detailLabel: 'Daily Solo is ready.',
        id: 'daily-solo',
        ready: true,
        title: 'Daily Solo',
      },
      {
        actionLabel: 'Open daily',
        actionTarget: { multiplayerSubtab: 'daily', routeId: 'multiplayer' },
        detailLabel: 'Daily Multiplayer resets later.',
        id: 'daily-multiplayer',
        ready: false,
        title: 'Daily Multiplayer',
      },
    ],
    generatedAt: '2026-06-14T06:45:00.000Z',
    livePreview: [],
    lobbyPreview: [],
    quickActions: [],
    recentMultiplayer: [],
    recentSolo: [],
    summary: {
      activeMultiplayerCount: 2,
      activeSoloCount: 1,
      liveGameCount: 1,
      openLobbyCount: 3,
      recentMultiplayerResultCount: 0,
      recentSoloResultCount: 0,
      restrictedLiveGameCount: 1,
      yourTurnMultiplayerCount: 2,
    },
    yourTurnMultiplayer: [],
    ...overrides,
  }
}

function createNotifications(overrides: Partial<NotificationCenterViewModel> = {}): NotificationCenterViewModel {
  return {
    dismissedCount: 0,
    generatedAt: '2026-06-14T06:45:00.000Z',
    items: [
      {
        actionTarget: { multiplayerSubtab: 'active', routeId: 'multiplayer' },
        detail: 'Daily Multiplayer OG is waiting for your turn.',
        dismissed: false,
        fingerprint: 'turn:1',
        id: 'multiplayer:turn:1',
        kind: 'multiplayer-your-turn',
        priority: 'high',
        read: false,
        source: 'multiplayer',
        title: 'Your turn',
        updatedAt: '2026-06-14T06:40:00.000Z',
      },
    ],
    readCount: 0,
    totalCandidateCount: 1,
    unreadCount: 1,
    ...overrides,
  }
}

describe('attention view models', () => {
  it('projects route badges from dashboard and notification summaries', () => {
    const routeAttention = createRouteAttentionMap({
      dashboard: createDashboard(),
      notifications: createNotifications(),
    })

    expect(routeAttention.home).toEqual({
      ariaLabel: '1 unread in-app notification',
      label: '1',
      tone: 'urgent',
    })
    expect(routeAttention.solo).toEqual({
      ariaLabel: '1 active Solo game',
      label: '1',
      tone: 'attention',
    })
    expect(routeAttention.multiplayer).toEqual({
      ariaLabel: '2 Multiplayer games need your turn',
      label: '2',
      tone: 'urgent',
    })
    expect(routeAttention.calendar).toEqual({
      ariaLabel: '1 Daily entry ready',
      label: '1',
      tone: 'attention',
    })
  })

  it('keeps route badges quiet when no attention source exists', () => {
    const routeAttention = createRouteAttentionMap({
      dashboard: createDashboard({
        daily: createDashboard().daily.map((daily) => ({ ...daily, ready: false })),
        summary: {
          activeMultiplayerCount: 0,
          activeSoloCount: 0,
          liveGameCount: 0,
          openLobbyCount: 0,
          recentMultiplayerResultCount: 0,
          recentSoloResultCount: 0,
          restrictedLiveGameCount: 0,
          yourTurnMultiplayerCount: 0,
        },
      }),
      notifications: createNotifications({ items: [], totalCandidateCount: 0, unreadCount: 0 }),
    })

    expect(routeAttention).toEqual({
      calendar: undefined,
      home: undefined,
      multiplayer: undefined,
      solo: undefined,
    })
  })

  it('projects workspace subtab cues without duplicating gameplay state', () => {
    const workspaceAttention = createWorkspaceAttentionMap({
      dashboard: createDashboard(),
    })

    expect(workspaceAttention.solo).toMatchObject({
      active: { ariaLabel: '1 active Solo game', label: '1', tone: 'attention' },
      daily: { ariaLabel: 'Daily Solo is ready', label: 'Ready', tone: 'attention' },
      overview: { ariaLabel: '1 active Solo game', label: '1', tone: 'attention' },
    })
    expect(workspaceAttention.multiplayer).toMatchObject({
      active: { ariaLabel: '2 Multiplayer games need your turn', label: '2', tone: 'urgent' },
      lobby: { ariaLabel: '3 open Multiplayer lobbies', label: '3', tone: 'attention' },
      live: { ariaLabel: '1 Live v1 game visible to you', label: '1', tone: 'neutral' },
      overview: { ariaLabel: '2 Multiplayer games need your turn', label: '2', tone: 'urgent' },
    })
  })
})
