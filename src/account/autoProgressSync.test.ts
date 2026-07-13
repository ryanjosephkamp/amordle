import { describe, expect, it } from 'vitest'
import {
  canRefreshAuthenticatedProgress,
  createAuthenticatedProgressSyncRequest,
  shouldApplyAuthenticatedProgressSyncResult,
  shouldInvalidateAuthenticatedProgressSyncForAuthState,
} from './autoProgressSync'
import { createDefaultGuestProgress } from './storageSchema'
import type { AuthState } from './auth'

const authState: AuthState = {
  status: 'authenticated',
  user: { id: 'account-a', roles: [] },
}

describe('authenticated automatic progress sync guards', () => {
  it('creates signed-in sync requests only for the matching authenticated progress scope', () => {
    const progress = createDefaultGuestProgress()
    const now = () => new Date('2026-07-05T12:00:00.000Z')

    expect(createAuthenticatedProgressSyncRequest({
      authState,
      localProgress: progress,
      now,
      scope: { kind: 'authenticated', userId: 'account-a' },
      version: 7,
    })).toEqual({
      localProgress: progress,
      localUpdatedAt: '2026-07-05T12:00:00.000Z',
      userId: 'account-a',
      version: 7,
    })

    expect(createAuthenticatedProgressSyncRequest({
      authState,
      localProgress: progress,
      now,
      scope: { kind: 'guest' },
      version: 8,
    })).toBeUndefined()
    expect(createAuthenticatedProgressSyncRequest({
      authState,
      localProgress: progress,
      now,
      scope: { kind: 'authenticated', userId: 'account-b' },
      version: 9,
    })).toBeUndefined()
  })

  it('allows cloud refresh only when no authenticated upload can be overwritten', () => {
    const scope = { kind: 'authenticated' as const, userId: 'account-a' }

    expect(canRefreshAuthenticatedProgress({
      authState,
      hasPendingUpload: false,
      hasPendingSoloCloudWrite: false,
      hasScheduledUpload: false,
      isUploadInFlight: false,
      scope,
    })).toBe(true)

    expect(canRefreshAuthenticatedProgress({
      authState,
      hasPendingUpload: true,
      hasPendingSoloCloudWrite: false,
      hasScheduledUpload: false,
      isUploadInFlight: false,
      scope,
    })).toBe(false)
    expect(canRefreshAuthenticatedProgress({
      authState,
      hasPendingUpload: false,
      hasPendingSoloCloudWrite: false,
      hasScheduledUpload: true,
      isUploadInFlight: false,
      scope,
    })).toBe(false)
    expect(canRefreshAuthenticatedProgress({
      authState,
      hasPendingUpload: false,
      hasPendingSoloCloudWrite: false,
      hasScheduledUpload: false,
      isUploadInFlight: true,
      scope,
    })).toBe(false)
    expect(canRefreshAuthenticatedProgress({
      authState,
      hasPendingUpload: false,
      hasPendingSoloCloudWrite: true,
      hasScheduledUpload: false,
      isUploadInFlight: false,
      scope,
    })).toBe(false)
  })

  it('drops stale automatic sync results after newer local signed-in work is scheduled', () => {
    expect(shouldApplyAuthenticatedProgressSyncResult({
      authState,
      currentVersion: 2,
      requestVersion: 2,
      scope: { kind: 'authenticated', userId: 'account-a' },
      userId: 'account-a',
    })).toBe(true)
    expect(shouldApplyAuthenticatedProgressSyncResult({
      authState,
      currentVersion: 3,
      requestVersion: 2,
      scope: { kind: 'authenticated', userId: 'account-a' },
      userId: 'account-a',
    })).toBe(false)
  })

  it('drops authenticated sync results after sign-out or account switching', () => {
    expect(shouldApplyAuthenticatedProgressSyncResult({
      authState: { status: 'anonymous' },
      currentVersion: 2,
      requestVersion: 2,
      scope: { kind: 'guest' },
      userId: 'account-a',
    })).toBe(false)

    expect(shouldApplyAuthenticatedProgressSyncResult({
      authState: { status: 'authenticated', user: { id: 'account-b', roles: [] } },
      currentVersion: 2,
      requestVersion: 2,
      scope: { kind: 'authenticated', userId: 'account-b' },
      userId: 'account-a',
    })).toBe(false)
  })

  it('invalidates pending authenticated sync work when the active auth scope changes', () => {
    expect(shouldInvalidateAuthenticatedProgressSyncForAuthState({
      currentScope: { kind: 'authenticated', userId: 'account-a' },
      nextAuthState: { status: 'anonymous' },
    })).toBe(true)

    expect(shouldInvalidateAuthenticatedProgressSyncForAuthState({
      currentScope: { kind: 'authenticated', userId: 'account-a' },
      nextAuthState: { status: 'authenticated', user: { id: 'account-b', roles: [] } },
    })).toBe(true)

    expect(shouldInvalidateAuthenticatedProgressSyncForAuthState({
      currentScope: { kind: 'authenticated', userId: 'account-a' },
      nextAuthState: authState,
    })).toBe(false)
  })
})
