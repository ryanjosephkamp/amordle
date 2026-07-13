import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getInAppNotificationModeDescription,
  getInAppNotificationModeLabel,
  getNotificationSoundModeDescription,
  getNotificationSoundModeLabel,
  normalizeNotificationPreferences,
  shouldIncludeInAppNotification,
} from './notificationPreferences'

describe('notification preferences', () => {
  it('defaults private request notifications on and normalizes explicit opt-out', () => {
    expect(normalizeNotificationPreferences({}).privateRequestNotificationsEnabled).toBe(true)
    expect(normalizeNotificationPreferences({ privateRequestNotificationsEnabled: false }).privateRequestNotificationsEnabled).toBe(false)
    expect(normalizeNotificationPreferences({ privateRequestNotificationsEnabled: 'no' }).privateRequestNotificationsEnabled).toBe(true)
  })
  it('normalizes missing, partial, and corrupt preference payloads to safe defaults', () => {
    expect(normalizeNotificationPreferences(undefined)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
    expect(normalizeNotificationPreferences({
      inAppNotificationMode: 'important-only',
      inAppNotificationsEnabled: false,
      notificationSoundMode: 'all',
      privateRequestNotificationsEnabled: true,
      browserNotificationsEnabled: true,
    })).toEqual({
      browserNotificationsEnabled: true,
      inAppNotificationMode: 'important-only',
      inAppNotificationsEnabled: false,
      notificationSoundMode: 'all',
      privateRequestNotificationsEnabled: true,
    })
    expect(normalizeNotificationPreferences({
      browserNotificationsEnabled: 'yes',
      inAppNotificationMode: 'everything',
      inAppNotificationsEnabled: 'yes',
      notificationSoundMode: 'loud',
    })).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
  })

  it('filters low-priority candidates only when important-only mode is selected', () => {
    expect(shouldIncludeInAppNotification({ priority: 'high' }, {
      inAppNotificationMode: 'important-only',
      inAppNotificationsEnabled: true,
    })).toBe(true)
    expect(shouldIncludeInAppNotification({ priority: 'medium' }, {
      inAppNotificationMode: 'important-only',
      inAppNotificationsEnabled: true,
    })).toBe(true)
    expect(shouldIncludeInAppNotification({ priority: 'low' }, {
      inAppNotificationMode: 'important-only',
      inAppNotificationsEnabled: true,
    })).toBe(false)
    expect(shouldIncludeInAppNotification({ priority: 'low' }, {
      inAppNotificationMode: 'all',
      inAppNotificationsEnabled: true,
    })).toBe(true)
  })

  it('hides every in-app notification when preferences disable them', () => {
    expect(shouldIncludeInAppNotification({ priority: 'high' }, {
      inAppNotificationMode: 'all',
      inAppNotificationsEnabled: false,
    })).toBe(false)
  })

  it('exposes stable labels and descriptions for Settings copy', () => {
    expect(getInAppNotificationModeLabel('all')).toBe('All notifications')
    expect(getInAppNotificationModeLabel('important-only')).toBe('Important only')
    expect(getInAppNotificationModeDescription('important-only')).toContain('Daily readiness')
    expect(getNotificationSoundModeLabel('important-only')).toBe('Important only')
    expect(getNotificationSoundModeLabel('off')).toBe('Off')
    expect(getNotificationSoundModeDescription('important-only')).toContain('multiplayer turns')
  })
})
