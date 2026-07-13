import { describe, expect, it } from 'vitest'
import type { DashboardActionHandlers } from '../dashboard'
import type { HistoryFilters } from '../app/navigationState'
import type { AppRouteId } from '../app/routes'
import type { NotificationMetadataState } from './notificationStorage'
import {
  activateNotificationItem,
  dismissNotificationItem,
  markNotificationItemRead,
  markVisibleNotificationItemsRead,
  type NotificationMetadataUpdater,
} from './notificationActions'
import type { NotificationItemViewModel } from './notificationViewModels'

function createNotificationFixture(
  actionTarget: NotificationItemViewModel['actionTarget'] = {
    multiplayerSubtab: 'active',
    routeId: 'multiplayer',
    selectedMultiplayerGameId: 'match-1',
  },
): NotificationItemViewModel {
  return {
    actionTarget,
    detail: 'Daily Multiplayer OG is waiting for your guess.',
    dismissed: false,
    fingerprint: 'turn:match-1:2026-06-14T06:00:00.000Z',
    id: 'multiplayer:match-1:your-turn',
    kind: 'multiplayer-your-turn',
    priority: 'high',
    read: false,
    source: 'multiplayer',
    title: 'Your turn',
    updatedAt: '2026-06-14T06:00:00.000Z',
  }
}

function createMetadataHarness(initial: NotificationMetadataState = { records: [], version: 1 }) {
  let current = initial
  const updateMetadata: NotificationMetadataUpdater = (updater) => {
    current = updater(current)
  }

  return {
    get current() {
      return current
    },
    updateMetadata,
  }
}

function createDashboardActionHarness(
  onResumeMultiplayerGame?: DashboardActionHandlers['onResumeMultiplayerGame'],
) {
  const calls: string[] = []
  const historyFilters: HistoryFilters[] = []
  const routes: AppRouteId[] = []
  const handlers: DashboardActionHandlers = {
    onHistoryFiltersChange: (filters) => {
      calls.push('historyFilters')
      historyFilters.push(filters)
    },
    onMultiplayerSubtabChange: (subtab) => {
      calls.push(`multiplayer:${subtab}`)
    },
    onResumeMultiplayerGame: onResumeMultiplayerGame ?? ((id) => {
      calls.push(`resume:${id}`)
      return false
    }),
    onSelectMultiplayerGame: (id) => {
      calls.push(`game:${id}`)
    },
    onSelectRoute: (routeId) => {
      calls.push(`route:${routeId}`)
      routes.push(routeId)
    },
    onSelectSoloGame: (key, options) => {
      calls.push(`soloGame:${key}:${options?.autoCenter ? 'auto' : 'manual'}`)
    },
    onSoloSubtabChange: (subtab) => {
      calls.push(`solo:${subtab}`)
    },
  }

  return { calls, handlers, historyFilters, routes }
}

describe('notification actions', () => {
  it('marks notification metadata read and dismissed by exact id/fingerprint', () => {
    const item = createNotificationFixture()
    const metadata = createMetadataHarness()

    markNotificationItemRead(item, metadata.updateMetadata, () => '2026-06-14T06:31:00.000Z')
    dismissNotificationItem(item, metadata.updateMetadata, () => '2026-06-14T06:32:00.000Z')

    expect(metadata.current).toEqual({
      records: [
        {
          dismissedAt: '2026-06-14T06:32:00.000Z',
          fingerprint: item.fingerprint,
          id: item.id,
          readAt: '2026-06-14T06:31:00.000Z',
        },
      ],
      version: 1,
    })
  })

  it('marks notifications read before routing through existing dashboard actions', () => {
    const item = createNotificationFixture()
    const metadata = createMetadataHarness()
    const { calls, handlers } = createDashboardActionHarness()

    activateNotificationItem(item, {
      dashboardHandlers: handlers,
      now: () => '2026-06-14T06:33:00.000Z',
      updateMetadata: metadata.updateMetadata,
    })

    expect(metadata.current.records[0]).toMatchObject({
      fingerprint: item.fingerprint,
      id: item.id,
      readAt: '2026-06-14T06:33:00.000Z',
    })
    expect(calls).toEqual(['route:multiplayer', 'multiplayer:active', 'game:match-1'])
  })

  it('activates direct-resume multiplayer notifications through the shared resume target', () => {
    const item = createNotificationFixture({
      multiplayerSubtab: 'active',
      resumeMultiplayerGameId: 'match-1',
      routeId: 'multiplayer',
      selectedMultiplayerGameId: 'match-1',
    })
    const metadata = createMetadataHarness()
    const { calls, handlers } = createDashboardActionHarness((id) => {
      calls.push(`resume:${id}`)
      return true
    })

    activateNotificationItem(item, {
      dashboardHandlers: handlers,
      now: () => '2026-06-14T06:33:00.000Z',
      updateMetadata: metadata.updateMetadata,
    })

    expect(metadata.current.records[0]).toMatchObject({
      fingerprint: item.fingerprint,
      id: item.id,
      readAt: '2026-06-14T06:33:00.000Z',
    })
    expect(calls).toEqual(['resume:match-1'])
  })

  it('activates Solo notifications as explicit auto-center targets', () => {
    const item = createNotificationFixture({
      routeId: 'solo',
      selectedSoloGameKey: 'practice-go',
      soloSubtab: 'practice',
    })
    const metadata = createMetadataHarness()
    const { calls, handlers } = createDashboardActionHarness()

    activateNotificationItem(item, {
      dashboardHandlers: handlers,
      now: () => '2026-06-14T06:34:00.000Z',
      updateMetadata: metadata.updateMetadata,
    })

    expect(metadata.current.records[0]).toMatchObject({
      fingerprint: item.fingerprint,
      id: item.id,
      readAt: '2026-06-14T06:34:00.000Z',
    })
    expect(calls).toEqual(['route:solo', 'solo:practice', 'soloGame:practice-go:auto'])
  })

  it('marks all visible unread notification items read with one local timestamp', () => {
    const first = createNotificationFixture()
    const read = createNotificationFixture({
      multiplayerSubtab: 'active',
      routeId: 'multiplayer',
      selectedMultiplayerGameId: 'match-read',
    })
    const dismissed = createNotificationFixture({
      multiplayerSubtab: 'active',
      routeId: 'multiplayer',
      selectedMultiplayerGameId: 'match-dismissed',
    })
    const metadata = createMetadataHarness()

    markVisibleNotificationItemsRead([
      first,
      {
        ...read,
        fingerprint: 'turn:match-read:2026-06-14T06:00:00.000Z',
        id: 'multiplayer:match-read:your-turn',
        read: true,
      },
      {
        ...dismissed,
        dismissed: true,
        fingerprint: 'turn:match-dismissed:2026-06-14T06:00:00.000Z',
        id: 'multiplayer:match-dismissed:your-turn',
      },
    ], metadata.updateMetadata, () => '2026-06-14T06:35:00.000Z')

    expect(metadata.current).toEqual({
      records: [
        {
          fingerprint: first.fingerprint,
          id: first.id,
          readAt: '2026-06-14T06:35:00.000Z',
        },
      ],
      version: 1,
    })
  })

  it('routes history notification actions without inventing notification-specific navigation', () => {
    const filters: HistoryFilters = { mode: 'go', player: 'multiplayer', scope: 'daily' }
    const item = createNotificationFixture({
      historyFilters: filters,
      routeId: 'history',
    })
    const metadata = createMetadataHarness()
    const { calls, handlers, historyFilters, routes } = createDashboardActionHarness()

    activateNotificationItem(item, {
      dashboardHandlers: handlers,
      now: () => '2026-06-14T06:34:00.000Z',
      updateMetadata: metadata.updateMetadata,
    })

    expect(calls).toEqual(['historyFilters', 'route:history'])
    expect(historyFilters).toEqual([filters])
    expect(routes).toEqual(['history'])
  })
})
