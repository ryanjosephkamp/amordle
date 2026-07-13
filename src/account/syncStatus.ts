export type SyncStatusKind = 'idle' | 'syncing' | 'synced' | 'offline' | 'conflict' | 'error'

export interface SyncStatusState {
  readonly kind: SyncStatusKind
  readonly message: string
}

export const syncStatusMessages: Readonly<Record<SyncStatusKind, string>> = {
  conflict: 'Cloud and local progress differed; the newest compatible record was selected.',
  error: 'Cloud sync failed. Guest progress remains available on this device.',
  idle: 'Cloud sync is ready when Supabase is configured and you are signed in.',
  offline: 'Cloud sync is paused while the browser is offline.',
  synced: 'Cloud progress is up to date.',
  syncing: 'Syncing signed-in progress with Supabase.',
}

export function createSyncStatus(kind: SyncStatusKind): SyncStatusState {
  return { kind, message: syncStatusMessages[kind] }
}
