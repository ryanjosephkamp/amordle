import {
  createDashboardViewModel,
  type CreateDashboardViewModelInput,
  type DashboardActionTarget,
  type DashboardViewModel,
} from '../dashboard'
import type { NotificationMetadataRecord, NotificationMetadataState } from './notificationStorage'
import { normalizeNotificationMetadataState } from './notificationStorage'
import { shouldIncludeInAppNotification } from './notificationPreferences'
import type { PrivateMatchRequestResult } from '../multiplayer/multiplayerRepository'
import { getPrivateRequestCounterpart } from '../multiplayer/privateRequestCenter'

export type NotificationKind =
  | 'daily-solo-ready'
  | 'daily-multiplayer-ready'
  | 'multiplayer-your-turn'
  | 'multiplayer-completed'
  | 'lobby-open'
  | 'live-active'
  | 'private-request-incoming'
  | 'private-request-created'
  | 'private-request-declined'
  | 'private-request-cancelled'
  | 'private-request-expired'

export type NotificationSource = 'daily' | 'multiplayer' | 'lobby' | 'live' | 'history'

export type NotificationPriority = 'high' | 'medium' | 'low'

export interface NotificationItemViewModel {
  readonly id: string
  readonly kind: NotificationKind
  readonly source: NotificationSource
  readonly title: string
  readonly detail: string
  readonly priority: NotificationPriority
  readonly updatedAt: string
  readonly fingerprint: string
  readonly actionTarget: DashboardActionTarget
  readonly read: boolean
  readonly dismissed: boolean
}

export interface NotificationCenterViewModel {
  readonly generatedAt: string
  readonly items: readonly NotificationItemViewModel[]
  readonly unreadCount: number
  readonly readCount: number
  readonly dismissedCount: number
  readonly totalCandidateCount: number
}

export interface CreateNotificationViewModelInput extends CreateDashboardViewModelInput {
  readonly dashboard?: DashboardViewModel
  readonly includeRead?: boolean
  readonly notificationMetadata?: NotificationMetadataState
  readonly notificationPreferences?: unknown
  readonly now?: string
  readonly privateMatchRequests?: readonly PrivateMatchRequestResult[]
}

type NotificationCandidate = Omit<NotificationItemViewModel, 'dismissed' | 'read'>

const PRIORITY_RANK: Record<NotificationPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function latestTimestamp(rows: readonly { readonly updatedAt?: string; readonly completedAt?: string }[]): string | undefined {
  return rows
    .map((row) => row.updatedAt ?? row.completedAt)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort((left, right) => right.localeCompare(left))[0]
}

function dailyNotifications(dashboard: DashboardViewModel, now: string): readonly NotificationCandidate[] {
  return dashboard.daily
    .filter((daily) => daily.ready)
    .map((daily): NotificationCandidate => {
      const isSolo = daily.id === 'daily-solo'
      return {
        actionTarget: daily.actionTarget,
        detail: daily.detailLabel,
        fingerprint: `${daily.id}:${daily.resetAt ?? daily.detailLabel}:ready`,
        id: `daily:${isSolo ? 'solo' : 'multiplayer'}:ready`,
        kind: isSolo ? 'daily-solo-ready' : 'daily-multiplayer-ready',
        priority: 'medium',
        source: 'daily',
        title: `${daily.title} is ready`,
        updatedAt: daily.resetAt ?? now,
      }
    })
}

function multiplayerTurnNotifications(dashboard: DashboardViewModel): readonly NotificationCandidate[] {
  return dashboard.yourTurnMultiplayer.map((game): NotificationCandidate => ({
    actionTarget: game.actionTarget,
    detail: `${game.title} - ${game.detailLabel}`,
    fingerprint: `${game.id}:${game.updatedAt}:${game.turnLabel}`,
    id: `multiplayer:${game.id}:your-turn`,
    kind: 'multiplayer-your-turn',
    priority: 'high',
    source: 'multiplayer',
    title: 'Your turn',
    updatedAt: game.updatedAt,
  }))
}

function multiplayerCompletedNotifications(dashboard: DashboardViewModel): readonly NotificationCandidate[] {
  return dashboard.recentMultiplayer.map((result): NotificationCandidate => ({
    actionTarget: result.actionTarget,
    detail: `${result.title} - ${result.detailLabel}`,
    fingerprint: `${result.id}:${result.completedAt}:${result.outcomeLabel}`,
    id: `multiplayer:${result.id}:completed`,
    kind: 'multiplayer-completed',
    priority: 'medium',
    source: 'history',
    title: `Multiplayer ${result.outcomeLabel.toLowerCase()}`,
    updatedAt: result.completedAt,
  }))
}

function lobbyNotification(dashboard: DashboardViewModel, now: string): NotificationCandidate | undefined {
  if (dashboard.summary.openLobbyCount <= 0) {
    return undefined
  }

  const latest = latestTimestamp(dashboard.lobbyPreview) ?? now
  return {
    actionTarget: { multiplayerSubtab: 'lobby', routeId: 'multiplayer' },
    detail: `${pluralize(dashboard.summary.openLobbyCount, 'lobby', 'lobbies')} available from safe Lobby state.`,
    fingerprint: `lobby:${dashboard.summary.openLobbyCount}:${latest}`,
    id: 'lobby:open',
    kind: 'lobby-open',
    priority: 'low',
    source: 'lobby',
    title: 'Open multiplayer lobby',
    updatedAt: latest,
  }
}

function liveNotification(dashboard: DashboardViewModel, now: string): NotificationCandidate | undefined {
  if (dashboard.summary.liveGameCount <= 0) {
    return undefined
  }

  const latest = latestTimestamp(dashboard.livePreview) ?? now
  const restrictedDetail = dashboard.summary.restrictedLiveGameCount > 0
    ? ` ${pluralize(dashboard.summary.restrictedLiveGameCount, 'nonparticipant game')} hidden by Live privacy rules.`
    : ''
  return {
    actionTarget: { multiplayerSubtab: 'live', routeId: 'multiplayer' },
    detail: `${pluralize(dashboard.summary.liveGameCount, 'active multiplayer game')} visible to you.${restrictedDetail}`.trim(),
    fingerprint: `live:${dashboard.summary.liveGameCount}:${dashboard.summary.restrictedLiveGameCount}:${latest}`,
    id: 'live:active',
    kind: 'live-active',
    priority: 'low',
    source: 'live',
    title: 'Live games available',
    updatedAt: latest,
  }
}

function privateRequestNotifications(
  requests: readonly PrivateMatchRequestResult[],
  preferences: unknown,
): readonly NotificationCandidate[] {
  const privateEnabled = typeof preferences === 'object' && preferences !== null
    ? (preferences as Record<string, unknown>).privateRequestNotificationsEnabled !== false
    : true
  if (!privateEnabled) return []

  return requests.flatMap((request): readonly NotificationCandidate[] => {
    const counterpart = getPrivateRequestCounterpart(request)
    const label = counterpart.displayName ?? 'Player'
    const base = {
      detail: `${request.mode.toUpperCase()} ${request.wordLength}-letter private Practice request with ${label}.`,
      fingerprint: `${request.requestId}:${request.requestStatus}:${request.updatedAt}`,
      priority: 'high' as const,
      source: 'multiplayer' as const,
      updatedAt: request.updatedAt,
    }
    if (request.requestStatus === 'requested' && request.viewerRole === 'opponent') {
      return [{ ...base, actionTarget: { multiplayerSubtab: 'practice', routeId: 'multiplayer' }, id: `private-request:${request.requestId}:requested`, kind: 'private-request-incoming', title: 'Private match request' }]
    }
    if (request.requestStatus === 'created' && request.createdGameId) {
      return [{ ...base, actionTarget: { selectedMultiplayerGameId: request.createdGameId, multiplayerSubtab: 'practice', routeId: 'multiplayer' }, id: `private-request:${request.requestId}:created`, kind: 'private-request-created', title: 'Private match created' }]
    }
    const terminal = request.requestStatus === 'declined' || request.requestStatus === 'cancelled' || request.requestStatus === 'expired'
    if (!terminal) return []
    return [{
      ...base,
      actionTarget: { multiplayerSubtab: 'practice', routeId: 'multiplayer' },
      id: `private-request:${request.requestId}:${request.requestStatus}`,
      kind: `private-request-${request.requestStatus}` as NotificationKind,
      priority: 'medium',
      title: `Private request ${request.requestStatus}`,
    }]
  })
}

function getMetadataRecord(
  metadata: NotificationMetadataState,
  candidate: NotificationCandidate,
): NotificationMetadataRecord | undefined {
  return metadata.records.find((record) => (
    record.id === candidate.id && record.fingerprint === candidate.fingerprint
  ))
}

function applyMetadata(metadata: NotificationMetadataState, candidate: NotificationCandidate): NotificationItemViewModel {
  const record = getMetadataRecord(metadata, candidate)
  return {
    ...candidate,
    dismissed: Boolean(record?.dismissedAt),
    read: Boolean(record?.readAt),
  }
}

function dedupeCandidates(candidates: readonly NotificationCandidate[]): readonly NotificationCandidate[] {
  return Array.from(
    candidates.reduce((map, candidate) => {
      map.set(candidate.id, candidate)
      return map
    }, new Map<string, NotificationCandidate>()).values(),
  )
}

function sortNotifications(items: readonly NotificationItemViewModel[]): readonly NotificationItemViewModel[] {
  return [...items].sort((left, right) => (
    Number(left.read) - Number(right.read)
    || PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
    || right.updatedAt.localeCompare(left.updatedAt)
    || left.id.localeCompare(right.id)
  ))
}

export function createNotificationViewModel(input: CreateNotificationViewModelInput = {}): NotificationCenterViewModel {
  const now = input.now ?? input.generatedAt ?? new Date().toISOString()
  const dashboard = input.dashboard ?? createDashboardViewModel({
    ...input,
    generatedAt: input.generatedAt ?? now,
  })
  const metadata = normalizeNotificationMetadataState(input.notificationMetadata)
  const lobby = lobbyNotification(dashboard, now)
  const live = liveNotification(dashboard, now)
  const candidates = dedupeCandidates([
    ...dailyNotifications(dashboard, now),
    ...multiplayerTurnNotifications(dashboard),
    ...multiplayerCompletedNotifications(dashboard),
    ...(lobby ? [lobby] : []),
    ...(live ? [live] : []),
    ...privateRequestNotifications(input.privateMatchRequests ?? [], input.notificationPreferences),
  ]).filter((candidate) => shouldIncludeInAppNotification(candidate, input.notificationPreferences))
  const withMetadata = candidates.map((candidate) => applyMetadata(metadata, candidate))
  const items = sortNotifications(withMetadata.filter((item) => (
    !item.dismissed && (input.includeRead || !item.read)
  )))

  return {
    dismissedCount: withMetadata.filter((item) => item.dismissed).length,
    generatedAt: now,
    items,
    readCount: withMetadata.filter((item) => item.read && !item.dismissed).length,
    totalCandidateCount: candidates.length,
    unreadCount: items.filter((item) => !item.read).length,
  }
}
