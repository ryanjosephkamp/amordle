import type { SerializedGoSession } from '../go/session'
import type { KeyValueStorage } from './dailyOgStorage'

export interface DailyGoStoredSession {
  readonly dateKey: string
  readonly session: SerializedGoSession
}

export const DAILY_GO_STORAGE_KEY = 'brrrdle:daily-go:v1'

/**
 * Storage key for a daily go session. Current Daily play is restored through
 * account-scoped resume slots; the bare key is a legacy key and should not be
 * used by today's Daily game surface. An explicit `dateKey` namespaces *past*
 * dailies (Phase 22 Addendum §27.10) so each unlocked past day persists its
 * partial progress independently.
 */
export function dailyGoStorageKey(dateKey?: string): string {
  return dateKey ? `${DAILY_GO_STORAGE_KEY}:${dateKey}` : DAILY_GO_STORAGE_KEY
}

function getBrowserStorage(): KeyValueStorage | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.localStorage
}

export function loadDailyGoStoredSession(storage: KeyValueStorage | undefined = getBrowserStorage(), dateKey?: string): DailyGoStoredSession | undefined {
  const rawValue = storage?.getItem(dailyGoStorageKey(dateKey))
  if (!rawValue) {
    return undefined
  }

  try {
    const parsed = JSON.parse(rawValue) as DailyGoStoredSession
    if (!parsed.dateKey || !Array.isArray(parsed.session?.puzzles)) {
      return undefined
    }

    return parsed
  } catch {
    return undefined
  }
}

export function saveDailyGoStoredSession(value: DailyGoStoredSession, storage: KeyValueStorage | undefined = getBrowserStorage(), dateKey?: string): void {
  storage?.setItem(dailyGoStorageKey(dateKey), JSON.stringify(value))
}

export function clearDailyGoStoredSession(storage: KeyValueStorage | undefined = getBrowserStorage(), dateKey?: string): void {
  storage?.removeItem(dailyGoStorageKey(dateKey))
}
