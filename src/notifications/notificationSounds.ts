import type { SoundEvent } from '../sound'
import {
  normalizeNotificationPreferences,
  type NotificationSoundMode,
} from './notificationPreferences'
import type { NotificationItemViewModel, NotificationKind } from './notificationViewModels'

export interface NotificationSoundDecision {
  readonly event: SoundEvent
  readonly fingerprint: string
  readonly itemId: string
  readonly kind: NotificationKind
}

export interface SelectNotificationSoundInput {
  readonly items: readonly NotificationItemViewModel[]
  readonly masterSoundEnabled: boolean
  readonly previousFingerprints?: readonly string[]
  readonly preferences?: unknown
  readonly suppressInitial?: boolean
}

const IMPORTANT_SOUND_KINDS = new Set<NotificationKind>([
  'multiplayer-completed',
  'multiplayer-your-turn',
])

const NOTIFICATION_KIND_SOUND_EVENTS: Record<NotificationKind, SoundEvent> = {
  'daily-multiplayer-ready': 'daily-multiplayer-reset',
  'daily-solo-ready': 'daily-reset',
  'live-active': 'notification-alert',
  'lobby-open': 'notification-alert',
  'multiplayer-completed': 'notification-alert',
  'multiplayer-your-turn': 'notification-alert',
  'private-request-incoming': 'notification-alert',
  'private-request-created': 'notification-alert',
  'private-request-declined': 'notification-alert',
  'private-request-cancelled': 'notification-alert',
  'private-request-expired': 'notification-alert',
}

export function getNotificationSoundFingerprint(item: Pick<NotificationItemViewModel, 'fingerprint' | 'id'>): string {
  return `${item.id}:${item.fingerprint}`
}

export function getNotificationSoundFingerprints(
  items: readonly Pick<NotificationItemViewModel, 'fingerprint' | 'id'>[],
): readonly string[] {
  return items.map((item) => getNotificationSoundFingerprint(item))
}

function shouldPlayForMode(kind: NotificationKind, mode: NotificationSoundMode): boolean {
  if (mode === 'off') {
    return false
  }
  if (mode === 'important-only') {
    return IMPORTANT_SOUND_KINDS.has(kind)
  }
  return true
}

export function selectNotificationSoundDecision(input: SelectNotificationSoundInput): NotificationSoundDecision | undefined {
  const preferences = normalizeNotificationPreferences(input.preferences)
  if (
    input.suppressInitial
    || !input.masterSoundEnabled
    || !preferences.inAppNotificationsEnabled
    || preferences.notificationSoundMode === 'off'
  ) {
    return undefined
  }

  const previous = new Set(input.previousFingerprints ?? [])
  const item = input.items.find((candidate) => (
    !candidate.dismissed
    && !candidate.read
    && shouldPlayForMode(candidate.kind, preferences.notificationSoundMode)
    && !previous.has(getNotificationSoundFingerprint(candidate))
  ))

  if (!item) {
    return undefined
  }

  return {
    event: NOTIFICATION_KIND_SOUND_EVENTS[item.kind],
    fingerprint: getNotificationSoundFingerprint(item),
    itemId: item.id,
    kind: item.kind,
  }
}
