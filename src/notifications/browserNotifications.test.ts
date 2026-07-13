import { describe, expect, it } from 'vitest'
import type { DashboardActionTarget } from '../dashboard'
import type { NotificationItemViewModel } from './notificationViewModels'
import {
  createBrowserNotificationPayload,
  dispatchBrowserNotification,
  getBrowserNotificationFingerprint,
  getBrowserNotificationFingerprints,
  getBrowserNotificationPermissionState,
  getBrowserNotificationStatusDescription,
  getBrowserNotificationStatusLabel,
  requestBrowserNotificationPermission,
  selectBrowserNotificationDispatches,
} from './browserNotifications'

function item(
  kind: NotificationItemViewModel['kind'],
  overrides: Partial<NotificationItemViewModel> = {},
): NotificationItemViewModel {
  const actionTarget: DashboardActionTarget = {
    multiplayerSubtab: 'active',
    routeId: 'multiplayer',
    selectedMultiplayerGameId: 'game-one',
  }
  return {
    actionTarget,
    detail: `${kind} detail`,
    dismissed: false,
    fingerprint: `${kind}:2026-06-18T01:00:00.000Z`,
    id: `${kind}:id`,
    kind,
    priority: kind === 'multiplayer-your-turn' ? 'high' : kind === 'live-active' ? 'low' : 'medium',
    read: false,
    source: kind.startsWith('daily') ? 'daily' : kind.startsWith('multiplayer') ? 'multiplayer' : 'live',
    title: `${kind} title`,
    updatedAt: '2026-06-18T01:00:00.000Z',
    ...overrides,
  }
}

describe('browser notification helpers', () => {
  it('reports unsupported when the Notification API is unavailable', () => {
    expect(getBrowserNotificationPermissionState({})).toBe('unsupported')
    expect(getBrowserNotificationStatusLabel('unsupported')).toBe('Unavailable')
    expect(getBrowserNotificationStatusDescription('unsupported')).toContain('does not expose')
  })

  it('normalizes supported permission states for Settings copy', () => {
    expect(getBrowserNotificationPermissionState({ Notification: {
      permission: 'granted',
      requestPermission: async () => 'granted',
    } })).toBe('granted')
    expect(getBrowserNotificationStatusLabel('default')).toBe('Not requested')
    expect(getBrowserNotificationStatusLabel('denied')).toBe('Blocked')
    expect(getBrowserNotificationStatusDescription('default')).toContain('Awordle never asks automatically')
    expect(getBrowserNotificationStatusDescription('granted')).toContain('foreground-only')
  })

  it('requests permission only through an explicit helper call', async () => {
    let calls = 0
    const runtime = {
      Notification: {
        permission: 'default' as NotificationPermission,
        requestPermission: async () => {
          calls += 1
          return 'granted' as NotificationPermission
        },
      },
    }

    expect(calls).toBe(0)
    await expect(requestBrowserNotificationPermission(runtime)).resolves.toBe('granted')
    expect(calls).toBe(1)
  })

  it('falls back to current permission if the permission request fails', async () => {
    const runtime = {
      Notification: {
        permission: 'denied' as NotificationPermission,
        requestPermission: async () => {
          throw new Error('blocked')
        },
      },
    }

    await expect(requestBrowserNotificationPermission(runtime)).resolves.toBe('denied')
  })

  it('selects eligible new browser notification dispatches under granted permission and enabled preferences', () => {
    const turn = item('multiplayer-your-turn')
    const completed = item('multiplayer-completed', {
      actionTarget: { historyFilters: { mode: 'all', player: 'multiplayer', scope: 'all' }, routeId: 'history' },
    })

    expect(selectBrowserNotificationDispatches({
      documentHidden: false,
      items: [turn, completed],
      permission: 'granted',
      preferences: {
        browserNotificationsEnabled: true,
        inAppNotificationMode: 'all',
        inAppNotificationsEnabled: true,
      },
      routeContext: { activeRouteId: 'home' },
    }).map((decision) => decision.kind)).toEqual([
      'multiplayer-your-turn',
      'multiplayer-completed',
    ])
  })

  it('suppresses browser notifications without support, permission, preference, or in-app eligibility', () => {
    const turn = item('multiplayer-your-turn')
    const live = item('live-active', {
      actionTarget: { multiplayerSubtab: 'live', routeId: 'multiplayer' },
    })

    expect(selectBrowserNotificationDispatches({
      items: [turn],
      permission: 'default',
      preferences: { browserNotificationsEnabled: true, inAppNotificationsEnabled: true },
    })).toEqual([])
    expect(selectBrowserNotificationDispatches({
      items: [turn],
      permission: 'denied',
      preferences: { browserNotificationsEnabled: true, inAppNotificationsEnabled: true },
    })).toEqual([])
    expect(selectBrowserNotificationDispatches({
      items: [turn],
      permission: 'unsupported',
      preferences: { browserNotificationsEnabled: true, inAppNotificationsEnabled: true },
    })).toEqual([])
    expect(selectBrowserNotificationDispatches({
      items: [turn],
      permission: 'granted',
      preferences: { browserNotificationsEnabled: false, inAppNotificationsEnabled: true },
    })).toEqual([])
    expect(selectBrowserNotificationDispatches({
      items: [turn],
      permission: 'granted',
      preferences: { browserNotificationsEnabled: true, inAppNotificationsEnabled: false },
    })).toEqual([])
    expect(selectBrowserNotificationDispatches({
      items: [live],
      permission: 'granted',
      preferences: {
        browserNotificationsEnabled: true,
        inAppNotificationMode: 'important-only',
        inAppNotificationsEnabled: true,
      },
    })).toEqual([])
  })

  it('dedupes fingerprints and suppresses initial hydration', () => {
    const turn = item('multiplayer-your-turn')

    expect(selectBrowserNotificationDispatches({
      items: [turn],
      permission: 'granted',
      preferences: { browserNotificationsEnabled: true, inAppNotificationsEnabled: true },
      previousFingerprints: [getBrowserNotificationFingerprint(turn)],
    })).toEqual([])

    expect(selectBrowserNotificationDispatches({
      items: [turn],
      permission: 'granted',
      preferences: { browserNotificationsEnabled: true, inAppNotificationsEnabled: true },
      suppressInitial: true,
    })).toEqual([])

    expect(getBrowserNotificationFingerprints([turn])).toEqual([`${turn.id}:${turn.fingerprint}`])
  })

  it('suppresses notifications for the active exact route target while visible but allows hidden documents', () => {
    const turn = item('multiplayer-your-turn')

    expect(selectBrowserNotificationDispatches({
      documentHidden: false,
      items: [turn],
      permission: 'granted',
      preferences: { browserNotificationsEnabled: true, inAppNotificationsEnabled: true },
      routeContext: {
        activeRouteId: 'multiplayer',
        multiplayerSubtab: 'active',
        selectedMultiplayerGameId: 'game-one',
      },
    })).toEqual([])

    expect(selectBrowserNotificationDispatches({
      documentHidden: false,
      items: [turn],
      permission: 'granted',
      preferences: { browserNotificationsEnabled: true, inAppNotificationsEnabled: true },
      routeContext: {
        activeRouteId: 'multiplayer',
        multiplayerSubtab: 'active',
        selectedMultiplayerGameId: 'different-game',
      },
    })).toHaveLength(1)

    expect(selectBrowserNotificationDispatches({
      documentHidden: true,
      items: [turn],
      permission: 'granted',
      preferences: { browserNotificationsEnabled: true, inAppNotificationsEnabled: true },
      routeContext: {
        activeRouteId: 'multiplayer',
        multiplayerSubtab: 'active',
        selectedMultiplayerGameId: 'game-one',
      },
    })).toHaveLength(1)
  })

  it('suppresses direct-resume multiplayer notifications on the selected gameplay surface', () => {
    const turn = item('multiplayer-your-turn', {
      actionTarget: {
        multiplayerSubtab: 'active',
        resumeMultiplayerGameId: 'game-one',
        routeId: 'multiplayer',
        selectedMultiplayerGameId: 'game-one',
      },
    })

    expect(selectBrowserNotificationDispatches({
      documentHidden: false,
      items: [turn],
      permission: 'granted',
      preferences: { browserNotificationsEnabled: true, inAppNotificationsEnabled: true },
      routeContext: {
        activeRouteId: 'multiplayer',
        multiplayerSubtab: 'practice',
        selectedMultiplayerGameId: 'game-one',
      },
    })).toEqual([])

    expect(selectBrowserNotificationDispatches({
      documentHidden: false,
      items: [turn],
      permission: 'granted',
      preferences: { browserNotificationsEnabled: true, inAppNotificationsEnabled: true },
      routeContext: {
        activeRouteId: 'multiplayer',
        multiplayerSubtab: 'practice',
        selectedMultiplayerGameId: 'different-game',
      },
    })).toHaveLength(1)
  })

  it('builds payloads without raw emails, uuid values, or audible browser sounds', () => {
    const payload = createBrowserNotificationPayload(item('multiplayer-completed', {
      detail: 'Invite sent to player@example.com for row 123e4567-e89b-12d3-a456-426614174000.',
      title: 'Multiplayer completed for player@example.com',
    }))

    expect(payload.title).toBe('Multiplayer completed for [account]')
    expect(payload.options.body).toBe('Invite sent to [account] for row [id].')
    expect(payload.options.silent).toBe(true)
    expect(payload.options.tag).toBe('brrrdle-multiplayer-completed')
    expect(JSON.stringify(payload)).not.toContain('player@example.com')
    expect(JSON.stringify(payload)).not.toContain('123e4567-e89b-12d3-a456-426614174000')
  })

  it('dispatches through the foreground Notification constructor only when permission remains granted', () => {
    const calls: Array<{ readonly title: string; readonly options?: NotificationOptions }> = []
    class FakeNotification {
      static permission: NotificationPermission = 'granted'
      static requestPermission = async () => 'granted' as NotificationPermission

      constructor(title: string, options?: NotificationOptions) {
        calls.push({ options, title })
      }
    }
    const runtime = { Notification: FakeNotification }

    expect(dispatchBrowserNotification(item('multiplayer-your-turn'), runtime)).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].title).toBe('multiplayer-your-turn title')

    FakeNotification.permission = 'denied'
    expect(dispatchBrowserNotification(item('multiplayer-completed'), runtime)).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('routes foreground browser notification clicks through the live page callback and best-effort focus', () => {
    const calls: Array<{ readonly title: string; readonly options?: NotificationOptions }> = []
    const clicks: NotificationItemViewModel[] = []
    let focusCalls = 0
    let closeCalls = 0

    class FakeNotification {
      static latest: FakeNotification | undefined
      static permission: NotificationPermission = 'granted'
      static requestPermission = async () => 'granted' as NotificationPermission
      onclick: ((event: Event) => void) | null = null

      constructor(title: string, options?: NotificationOptions) {
        calls.push({ options, title })
        FakeNotification.latest = this
      }

      close() {
        closeCalls += 1
      }
    }

    const turn = item('multiplayer-your-turn')

    expect(dispatchBrowserNotification(turn, {
      Notification: FakeNotification,
      focus: () => {
        focusCalls += 1
      },
    }, {
      onClick: (clickedItem) => {
        clicks.push(clickedItem)
      },
    })).toBe(true)

    expect(calls).toHaveLength(1)
    expect(FakeNotification.latest?.onclick).toBeTypeOf('function')

    FakeNotification.latest?.onclick?.(new Event('click'))

    expect(focusCalls).toBe(1)
    expect(closeCalls).toBe(1)
    expect(clicks).toEqual([turn])
  })
})
