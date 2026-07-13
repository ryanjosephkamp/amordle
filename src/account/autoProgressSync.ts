import type { AuthState } from './auth'
import { canSyncProgressForAuthState, getProgressScopeForAuthState, type ActiveProgressScope } from './accountScopedProgress'
import type { GuestProgressState } from './storageSchema'

export const AUTHENTICATED_PROGRESS_AUTO_SYNC_DEBOUNCE_MS = 750

export interface AuthenticatedProgressSyncRequest {
  readonly localProgress: GuestProgressState
  readonly localUpdatedAt: string
  readonly userId: string
  readonly version: number
}

export interface CreateAuthenticatedProgressSyncRequestInput {
  readonly authState: AuthState
  readonly localProgress: GuestProgressState
  readonly now?: () => Date
  readonly scope: ActiveProgressScope
  readonly version: number
}

export interface AuthenticatedProgressRefreshGuardInput {
  readonly authState: AuthState
  readonly hasPendingSoloCloudWrite: boolean
  readonly hasPendingUpload: boolean
  readonly hasScheduledUpload: boolean
  readonly isUploadInFlight: boolean
  readonly scope: ActiveProgressScope
}

export interface AuthenticatedProgressSyncResultGuardInput {
  readonly authState: AuthState
  readonly currentVersion: number
  readonly requestVersion: number
  readonly scope: ActiveProgressScope
  readonly userId: string
}

export interface AuthenticatedProgressSyncInvalidationInput {
  readonly currentScope: ActiveProgressScope
  readonly nextAuthState: AuthState
}

export function createAuthenticatedProgressSyncRequest(
  input: CreateAuthenticatedProgressSyncRequestInput,
): AuthenticatedProgressSyncRequest | undefined {
  if (input.scope.kind !== 'authenticated' || !canSyncProgressForAuthState(input.authState, input.scope)) {
    return undefined
  }

  return {
    localProgress: input.localProgress,
    localUpdatedAt: (input.now ?? (() => new Date()))().toISOString(),
    userId: input.scope.userId,
    version: input.version,
  }
}

export function canRefreshAuthenticatedProgress(input: AuthenticatedProgressRefreshGuardInput): boolean {
  return canSyncProgressForAuthState(input.authState, input.scope)
    && !input.hasPendingSoloCloudWrite
    && !input.hasPendingUpload
    && !input.hasScheduledUpload
    && !input.isUploadInFlight
}

export function shouldApplyAuthenticatedProgressSyncResult(input: AuthenticatedProgressSyncResultGuardInput): boolean {
  return input.currentVersion === input.requestVersion
    && input.scope.kind === 'authenticated'
    && input.scope.userId === input.userId
    && canSyncProgressForAuthState(input.authState, input.scope)
}

function areProgressScopesEqual(left: ActiveProgressScope, right: ActiveProgressScope): boolean {
  if (left.kind !== right.kind) {
    return false
  }
  if (left.kind === 'authenticated' && right.kind === 'authenticated') {
    return left.userId === right.userId
  }
  return true
}

export function shouldInvalidateAuthenticatedProgressSyncForAuthState(
  input: AuthenticatedProgressSyncInvalidationInput,
): boolean {
  return !areProgressScopesEqual(input.currentScope, getProgressScopeForAuthState(input.nextAuthState))
}
