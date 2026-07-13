import type { SerializedOgSession } from '../og/session'

export interface DailyOgStoredSession {
  readonly dateKey: string
  readonly session: SerializedOgSession
}

export interface KeyValueStorage {
  readonly getItem: (key: string) => string | null
  readonly removeItem: (key: string) => void
  readonly setItem: (key: string, value: string) => void
}

export const DAILY_OG_STORAGE_KEY = 'brrrdle:daily-og:v1'

/**
 * Storage key for a daily og session. Current Daily play is restored through
 * account-scoped resume slots; the bare key is a legacy key and should not be
 * used by today's Daily game surface. Phase 22 Addendum (§27.10): an explicit
 * `dateKey` namespaces *past* dailies under their own key so each unlocked past
 * day persists its partial progress independently.
 */
export function dailyOgStorageKey(dateKey?: string): string {
  return dateKey ? `${DAILY_OG_STORAGE_KEY}:${dateKey}` : DAILY_OG_STORAGE_KEY
}

function getBrowserStorage(): KeyValueStorage | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.localStorage
}

export function loadDailyOgStoredSession(storage: KeyValueStorage | undefined = getBrowserStorage(), dateKey?: string): DailyOgStoredSession | undefined {
  const rawValue = storage?.getItem(dailyOgStorageKey(dateKey))
  if (!rawValue) {
    return undefined
  }

  try {
    const parsed = JSON.parse(rawValue) as DailyOgStoredSession
    if (!parsed.dateKey || !parsed.session?.answer || !Array.isArray(parsed.session.guesses)) {
      return undefined
    }

    return parsed
  } catch {
    return undefined
  }
}

export function saveDailyOgStoredSession(value: DailyOgStoredSession, storage: KeyValueStorage | undefined = getBrowserStorage(), dateKey?: string): void {
  storage?.setItem(dailyOgStorageKey(dateKey), JSON.stringify(value))
}

export function clearDailyOgStoredSession(storage: KeyValueStorage | undefined = getBrowserStorage(), dateKey?: string): void {
  storage?.removeItem(dailyOgStorageKey(dateKey))
}
