import { describe, expect, it } from 'vitest'
import type { DashboardActionTarget } from '../dashboard'
import type { NotificationItemViewModel } from './notificationViewModels'
import {
  getNotificationSoundFingerprint,
  getNotificationSoundFingerprints,
  selectNotificationSoundDecision,
} from './notificationSounds'

function item(
  kind: NotificationItemViewModel['kind'],
  overrides: Partial<NotificationItemViewModel> = {},
): NotificationItemViewModel {
  const actionTarget: DashboardActionTarget = { routeId: 'home' }
  return {
    actionTarget,
    detail: `${kind} detail`,
    dismissed: false,
    fingerprint: `${kind}:2026-06-15T23:00:00.000Z`,
    id: `${kind}:id`,
    kind,
    priority: kind === 'multiplayer-your-turn' ? 'high' : kind === 'lobby-open' ? 'low' : 'medium',
    read: false,
    source: kind.startsWith('daily') ? 'daily' : kind.startsWith('multiplayer') ? 'multiplayer' : 'lobby',
    title: `${kind} title`,
    updatedAt: '2026-06-15T23:00:00.000Z',
    ...overrides,
  }
}

describe('notification sound decisions', () => {
  it('suppresses sounds during initial hydration and when master sound is off', () => {
    const items = [item('multiplayer-your-turn')]

    expect(selectNotificationSoundDecision({
      items,
      masterSoundEnabled: true,
      preferences: { inAppNotificationsEnabled: true, notificationSoundMode: 'important-only' },
      suppressInitial: true,
    })).toBeUndefined()

    expect(selectNotificationSoundDecision({
      items,
      masterSoundEnabled: false,
      preferences: { inAppNotificationsEnabled: true, notificationSoundMode: 'important-only' },
    })).toBeUndefined()
  })

  it('defaults to important-only sounds for multiplayer turn and completed-game notifications', () => {
    expect(selectNotificationSoundDecision({
      items: [item('daily-solo-ready'), item('multiplayer-completed')],
      masterSoundEnabled: true,
      preferences: { inAppNotificationsEnabled: true },
    })).toMatchObject({
      event: 'notification-alert',
      kind: 'multiplayer-completed',
    })
  })

  it('keeps Daily readiness silent in important-only mode but allows it in all mode', () => {
    expect(selectNotificationSoundDecision({
      items: [item('daily-multiplayer-ready')],
      masterSoundEnabled: true,
      preferences: { inAppNotificationsEnabled: true, notificationSoundMode: 'important-only' },
    })).toBeUndefined()

    expect(selectNotificationSoundDecision({
      items: [item('daily-multiplayer-ready')],
      masterSoundEnabled: true,
      preferences: { inAppNotificationsEnabled: true, notificationSoundMode: 'all' },
    })).toMatchObject({
      event: 'daily-multiplayer-reset',
      kind: 'daily-multiplayer-ready',
    })
  })

  it('dedupes unchanged notification fingerprints', () => {
    const turn = item('multiplayer-your-turn')

    expect(selectNotificationSoundDecision({
      items: [turn],
      masterSoundEnabled: true,
      preferences: { inAppNotificationsEnabled: true, notificationSoundMode: 'important-only' },
      previousFingerprints: [getNotificationSoundFingerprint(turn)],
    })).toBeUndefined()
  })

  it('does not sound for read, dismissed, disabled, or off-mode notifications', () => {
    expect(selectNotificationSoundDecision({
      items: [item('multiplayer-your-turn', { read: true })],
      masterSoundEnabled: true,
      preferences: { inAppNotificationsEnabled: true, notificationSoundMode: 'important-only' },
    })).toBeUndefined()

    expect(selectNotificationSoundDecision({
      items: [item('multiplayer-your-turn', { dismissed: true })],
      masterSoundEnabled: true,
      preferences: { inAppNotificationsEnabled: true, notificationSoundMode: 'important-only' },
    })).toBeUndefined()

    expect(selectNotificationSoundDecision({
      items: [item('multiplayer-your-turn')],
      masterSoundEnabled: true,
      preferences: { inAppNotificationsEnabled: false, notificationSoundMode: 'important-only' },
    })).toBeUndefined()

    expect(selectNotificationSoundDecision({
      items: [item('multiplayer-your-turn')],
      masterSoundEnabled: true,
      preferences: { inAppNotificationsEnabled: true, notificationSoundMode: 'off' },
    })).toBeUndefined()
  })

  it('uses stable id and fingerprint pairs for seen-state tracking', () => {
    const turn = item('multiplayer-your-turn')

    expect(getNotificationSoundFingerprint(turn)).toBe(`${turn.id}:${turn.fingerprint}`)
    expect(getNotificationSoundFingerprints([turn])).toEqual([`${turn.id}:${turn.fingerprint}`])
  })
})
