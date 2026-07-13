export type InAppNotificationMode = 'all' | 'important-only'
export type NotificationSoundMode = 'off' | 'important-only' | 'all'
export type NotificationPreferencePriority = 'high' | 'medium' | 'low'

export interface NotificationPreferencesState {
  readonly browserNotificationsEnabled: boolean
  readonly inAppNotificationsEnabled: boolean
  readonly inAppNotificationMode: InAppNotificationMode
  readonly notificationSoundMode: NotificationSoundMode
  readonly privateRequestNotificationsEnabled: boolean
}

export const IN_APP_NOTIFICATION_MODES = ['all', 'important-only'] as const
export const NOTIFICATION_SOUND_MODES = ['off', 'important-only', 'all'] as const

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferencesState = {
  browserNotificationsEnabled: false,
  inAppNotificationMode: 'all',
  inAppNotificationsEnabled: true,
  notificationSoundMode: 'important-only',
  privateRequestNotificationsEnabled: true,
}

const IN_APP_NOTIFICATION_MODE_LABELS: Record<InAppNotificationMode, string> = {
  all: 'All notifications',
  'important-only': 'Important only',
}

const IN_APP_NOTIFICATION_MODE_DESCRIPTIONS: Record<InAppNotificationMode, string> = {
  all: 'Show all in-app notifications, including lower-priority Lobby and Live freshness cues.',
  'important-only': 'Show Daily readiness, multiplayer turns, and completed-game alerts while hiding lower-priority freshness cues.',
}

const NOTIFICATION_SOUND_MODE_LABELS: Record<NotificationSoundMode, string> = {
  all: 'All notification sounds',
  'important-only': 'Important only',
  off: 'Off',
}

const NOTIFICATION_SOUND_MODE_DESCRIPTIONS: Record<NotificationSoundMode, string> = {
  all: 'Play a notification sound for every visible in-app notification after it changes.',
  'important-only': 'Play sounds only for multiplayer turns and completed multiplayer matches.',
  off: 'Silence notification sounds while keeping in-app notifications visible.',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isInAppNotificationMode(value: unknown): value is InAppNotificationMode {
  return value === 'all' || value === 'important-only'
}

export function isNotificationSoundMode(value: unknown): value is NotificationSoundMode {
  return value === 'off' || value === 'important-only' || value === 'all'
}

export function getInAppNotificationModeLabel(mode: InAppNotificationMode): string {
  return IN_APP_NOTIFICATION_MODE_LABELS[mode]
}

export function getInAppNotificationModeDescription(mode: InAppNotificationMode): string {
  return IN_APP_NOTIFICATION_MODE_DESCRIPTIONS[mode]
}

export function getNotificationSoundModeLabel(mode: NotificationSoundMode): string {
  return NOTIFICATION_SOUND_MODE_LABELS[mode]
}

export function getNotificationSoundModeDescription(mode: NotificationSoundMode): string {
  return NOTIFICATION_SOUND_MODE_DESCRIPTIONS[mode]
}

export function normalizeNotificationPreferences(raw: unknown): NotificationPreferencesState {
  const record = isRecord(raw) ? raw : {}
  return {
    browserNotificationsEnabled: typeof record.browserNotificationsEnabled === 'boolean'
      ? record.browserNotificationsEnabled
      : DEFAULT_NOTIFICATION_PREFERENCES.browserNotificationsEnabled,
    inAppNotificationMode: isInAppNotificationMode(record.inAppNotificationMode)
      ? record.inAppNotificationMode
      : DEFAULT_NOTIFICATION_PREFERENCES.inAppNotificationMode,
    inAppNotificationsEnabled: typeof record.inAppNotificationsEnabled === 'boolean'
      ? record.inAppNotificationsEnabled
      : DEFAULT_NOTIFICATION_PREFERENCES.inAppNotificationsEnabled,
    notificationSoundMode: isNotificationSoundMode(record.notificationSoundMode)
      ? record.notificationSoundMode
      : DEFAULT_NOTIFICATION_PREFERENCES.notificationSoundMode,
    privateRequestNotificationsEnabled: typeof record.privateRequestNotificationsEnabled === 'boolean'
      ? record.privateRequestNotificationsEnabled
      : DEFAULT_NOTIFICATION_PREFERENCES.privateRequestNotificationsEnabled,
  }
}

export function shouldIncludeInAppNotification(
  candidate: { readonly priority: NotificationPreferencePriority },
  rawPreferences?: unknown,
): boolean {
  const preferences = normalizeNotificationPreferences(rawPreferences)
  if (!preferences.inAppNotificationsEnabled) {
    return false
  }

  if (preferences.inAppNotificationMode === 'important-only') {
    return candidate.priority !== 'low'
  }

  return true
}
