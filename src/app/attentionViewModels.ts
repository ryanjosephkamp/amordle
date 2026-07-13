import type { DashboardViewModel } from '../dashboard'
import type { NotificationCenterViewModel } from '../notifications'
import type { MultiplayerSubtabId, SoloSubtabId } from './navigationState'
import type { AppRouteId } from './routes'

export type AttentionTone = 'neutral' | 'attention' | 'urgent'

export interface AttentionCueViewModel {
  readonly ariaLabel: string
  readonly label: string
  readonly tone: AttentionTone
}

export type RouteAttentionMap = Partial<Record<AppRouteId, AttentionCueViewModel>>
export type SoloWorkspaceAttentionMap = Partial<Record<SoloSubtabId, AttentionCueViewModel>>
export type MultiplayerWorkspaceAttentionMap = Partial<Record<MultiplayerSubtabId, AttentionCueViewModel>>

export interface WorkspaceAttentionMap {
  readonly multiplayer: MultiplayerWorkspaceAttentionMap
  readonly solo: SoloWorkspaceAttentionMap
}

export interface CreateAttentionViewModelInput {
  readonly dashboard: DashboardViewModel
  readonly notifications: NotificationCenterViewModel
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function countCue(count: number, singular: string, options: {
  readonly plural?: string
  readonly tone?: AttentionTone
} = {}): AttentionCueViewModel | undefined {
  if (count <= 0) {
    return undefined
  }

  return {
    ariaLabel: pluralize(count, singular, options.plural),
    label: String(count),
    tone: options.tone ?? 'attention',
  }
}

function labelCue(label: string, ariaLabel: string, tone: AttentionTone = 'attention'): AttentionCueViewModel {
  return { ariaLabel, label, tone }
}

function dailyReadyCount(dashboard: DashboardViewModel): number {
  return dashboard.daily.filter((daily) => daily.ready).length
}

function isDailyReady(dashboard: DashboardViewModel, id: 'daily-solo' | 'daily-multiplayer'): boolean {
  return dashboard.daily.some((daily) => daily.id === id && daily.ready)
}

function hasHighPriorityUnreadNotification(notifications: NotificationCenterViewModel): boolean {
  return notifications.items.some((item) => !item.read && item.priority === 'high')
}

function createSoloRouteCue(dashboard: DashboardViewModel): AttentionCueViewModel | undefined {
  return countCue(dashboard.summary.activeSoloCount, 'active Solo game')
    ?? (isDailyReady(dashboard, 'daily-solo') ? labelCue('Daily', 'Daily Solo is ready') : undefined)
}

function createMultiplayerRouteCue(dashboard: DashboardViewModel): AttentionCueViewModel | undefined {
  return countCue(dashboard.summary.yourTurnMultiplayerCount, 'Multiplayer game needs your turn', {
    plural: 'Multiplayer games need your turn',
    tone: 'urgent',
  })
    ?? countCue(dashboard.summary.openLobbyCount, 'open Multiplayer lobby', {
      plural: 'open Multiplayer lobbies',
    })
    ?? countCue(dashboard.summary.activeMultiplayerCount, 'active Multiplayer game')
    ?? countCue(dashboard.summary.liveGameCount, 'Live v1 game visible to you', {
      plural: 'Live v1 games visible to you',
      tone: 'neutral',
    })
}

export function createRouteAttentionMap({
  dashboard,
  notifications,
}: CreateAttentionViewModelInput): RouteAttentionMap {
  const unreadCue = countCue(notifications.unreadCount, 'unread in-app notification', {
    tone: hasHighPriorityUnreadNotification(notifications) ? 'urgent' : 'attention',
  })
  const dailyCue = countCue(dailyReadyCount(dashboard), 'Daily entry ready', {
    plural: 'Daily entries ready',
  })

  return {
    calendar: dailyCue,
    home: unreadCue,
    multiplayer: createMultiplayerRouteCue(dashboard),
    solo: createSoloRouteCue(dashboard),
  }
}

export function createWorkspaceAttentionMap({
  dashboard,
}: Pick<CreateAttentionViewModelInput, 'dashboard'>): WorkspaceAttentionMap {
  const soloDailyReady = isDailyReady(dashboard, 'daily-solo')
  const multiplayerDailyReady = isDailyReady(dashboard, 'daily-multiplayer')
  const multiplayerOverviewCount = dashboard.summary.yourTurnMultiplayerCount
    || dashboard.summary.openLobbyCount
    || dashboard.summary.activeMultiplayerCount

  return {
    multiplayer: {
      active: countCue(
        dashboard.summary.yourTurnMultiplayerCount || dashboard.summary.activeMultiplayerCount,
        dashboard.summary.yourTurnMultiplayerCount > 0 ? 'Multiplayer game needs your turn' : 'active Multiplayer game',
        {
          plural: dashboard.summary.yourTurnMultiplayerCount > 0 ? 'Multiplayer games need your turn' : 'active Multiplayer games',
          tone: dashboard.summary.yourTurnMultiplayerCount > 0 ? 'urgent' : 'attention',
        },
      ),
      daily: multiplayerDailyReady ? labelCue('Ready', 'Daily Multiplayer is ready') : undefined,
      live: countCue(dashboard.summary.liveGameCount, 'Live v1 game visible to you', {
        plural: 'Live v1 games visible to you',
        tone: 'neutral',
      }),
      lobby: countCue(dashboard.summary.openLobbyCount, 'open Multiplayer lobby', {
        plural: 'open Multiplayer lobbies',
      }),
      overview: countCue(
        multiplayerOverviewCount,
        dashboard.summary.yourTurnMultiplayerCount > 0
          ? 'Multiplayer game needs your turn'
          : dashboard.summary.openLobbyCount > 0
            ? 'open Multiplayer lobby'
            : 'active Multiplayer game',
        {
          plural: dashboard.summary.yourTurnMultiplayerCount > 0
            ? 'Multiplayer games need your turn'
            : dashboard.summary.openLobbyCount > 0
              ? 'open Multiplayer lobbies'
              : 'active Multiplayer games',
          tone: dashboard.summary.yourTurnMultiplayerCount > 0 ? 'urgent' : 'attention',
        },
      ),
    },
    solo: {
      active: countCue(dashboard.summary.activeSoloCount, 'active Solo game'),
      daily: soloDailyReady ? labelCue('Ready', 'Daily Solo is ready') : undefined,
      overview: countCue(dashboard.summary.activeSoloCount, 'active Solo game')
        ?? (soloDailyReady ? labelCue('Daily', 'Daily Solo is ready') : undefined),
    },
  }
}
