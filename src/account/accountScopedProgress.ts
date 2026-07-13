import type { AuthState } from './auth'
import type { CloudProgressRepository } from './sync'
import { createDefaultGuestProgress, type GuestProgressState } from './storageSchema'
import { createSyncStatus, type SyncStatusState } from './syncStatus'

export type ActiveProgressScope =
  | { readonly kind: 'authenticated'; readonly userId: string }
  | { readonly kind: 'guest' }
  | { readonly kind: 'unconfigured' }

export interface AuthenticatedProgressLoadInput {
  readonly isOnline: boolean
  readonly repository: CloudProgressRepository
  readonly userId: string
}

export interface AuthenticatedProgressLoadResult {
  readonly progress: GuestProgressState
  readonly status: SyncStatusState
}

export function getProgressScopeForAuthState(authState: AuthState): ActiveProgressScope {
  if (authState.status === 'authenticated' && authState.user) {
    return { kind: 'authenticated', userId: authState.user.id }
  }

  return authState.status === 'unconfigured' ? { kind: 'unconfigured' } : { kind: 'guest' }
}

export function shouldPersistProgressToGuestStorage(scope: ActiveProgressScope): boolean {
  return scope.kind !== 'authenticated'
}

export function canSyncProgressForAuthState(authState: AuthState, scope: ActiveProgressScope): boolean {
  return authState.status === 'authenticated'
    && Boolean(authState.user)
    && scope.kind === 'authenticated'
    && scope.userId === authState.user?.id
}

export async function loadAuthenticatedProgressForScope(input: AuthenticatedProgressLoadInput): Promise<AuthenticatedProgressLoadResult> {
  if (!input.isOnline) {
    return { progress: createDefaultGuestProgress(), status: createSyncStatus('offline') }
  }

  try {
    const cloud = await input.repository.download(input.userId)
    return {
      progress: cloud?.progress ?? createDefaultGuestProgress(),
      status: cloud ? createSyncStatus('synced') : createSyncStatus('idle'),
    }
  } catch {
    return { progress: createDefaultGuestProgress(), status: createSyncStatus('error') }
  }
}
