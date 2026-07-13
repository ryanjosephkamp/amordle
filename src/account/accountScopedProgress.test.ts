import { describe, expect, it, vi } from 'vitest'
import {
  canSyncProgressForAuthState,
  getProgressScopeForAuthState,
  loadAuthenticatedProgressForScope,
  shouldPersistProgressToGuestStorage,
  type ActiveProgressScope,
} from './accountScopedProgress'
import { createDefaultGuestProgress } from './storageSchema'
import type { AuthState } from './auth'

const authenticatedAuthState: AuthState = {
  status: 'authenticated',
  user: { id: 'account-a', roles: [] },
}

describe('account-scoped progress guards', () => {
  it('classifies progress ownership from auth state', () => {
    expect(getProgressScopeForAuthState({ status: 'anonymous' })).toEqual({ kind: 'guest' })
    expect(getProgressScopeForAuthState({ status: 'unconfigured' })).toEqual({ kind: 'unconfigured' })
    expect(getProgressScopeForAuthState(authenticatedAuthState)).toEqual({ kind: 'authenticated', userId: 'account-a' })
  })

  it('keeps authenticated progress out of the guest local-storage payload', () => {
    expect(shouldPersistProgressToGuestStorage({ kind: 'guest' })).toBe(true)
    expect(shouldPersistProgressToGuestStorage({ kind: 'unconfigured' })).toBe(true)
    expect(shouldPersistProgressToGuestStorage({ kind: 'authenticated', userId: 'account-a' })).toBe(false)
  })

  it('allows sync only after the active progress scope belongs to the signed-in account', () => {
    const guestScope: ActiveProgressScope = { kind: 'guest' }
    const matchingAccountScope: ActiveProgressScope = { kind: 'authenticated', userId: 'account-a' }
    const rivalAccountScope: ActiveProgressScope = { kind: 'authenticated', userId: 'account-b' }

    expect(canSyncProgressForAuthState(authenticatedAuthState, guestScope)).toBe(false)
    expect(canSyncProgressForAuthState(authenticatedAuthState, rivalAccountScope)).toBe(false)
    expect(canSyncProgressForAuthState(authenticatedAuthState, matchingAccountScope)).toBe(true)
    expect(canSyncProgressForAuthState({ status: 'anonymous' }, matchingAccountScope)).toBe(false)
  })

  it('loads account progress from cloud without uploading local guest progress', async () => {
    const cloudProgress = { ...createDefaultGuestProgress(), completedGameIds: ['cloud-game'] }
    const repository = {
      download: vi.fn().mockResolvedValue({
        progress: cloudProgress,
        updatedAt: '2026-07-04T23:10:00Z',
        userId: 'account-a',
      }),
      upload: vi.fn(),
    }

    const result = await loadAuthenticatedProgressForScope({
      isOnline: true,
      repository,
      userId: 'account-a',
    })

    expect(result.status.kind).toBe('synced')
    expect(result.progress.completedGameIds).toEqual(['cloud-game'])
    expect(repository.download).toHaveBeenCalledWith('account-a')
    expect(repository.upload).not.toHaveBeenCalled()
  })

  it('uses a fresh account state when no cloud progress exists', async () => {
    const repository = {
      download: vi.fn().mockResolvedValue(undefined),
      upload: vi.fn(),
    }

    const result = await loadAuthenticatedProgressForScope({
      isOnline: true,
      repository,
      userId: 'account-a',
    })

    expect(result.status.kind).toBe('idle')
    expect(result.progress).toEqual(createDefaultGuestProgress())
    expect(repository.upload).not.toHaveBeenCalled()
  })

  it('keeps account hydration empty across guest-visible resume, history, multiplayer, rating, settings, and stats surfaces when no cloud state exists', async () => {
    const repository = {
      download: vi.fn().mockResolvedValue(undefined),
      upload: vi.fn(),
    }

    const result = await loadAuthenticatedProgressForScope({
      isOnline: true,
      repository,
      userId: 'account-a',
    })

    expect(result.progress.completedGameIds).toEqual([])
    expect(result.progress.history).toEqual([])
    expect(result.progress.resumeSlot).toBeUndefined()
    expect(result.progress.resumeSlots).toBeUndefined()
    expect(result.progress.multiplayer?.games).toEqual([])
    expect(result.progress.competitiveMultiplayer?.customGames).toEqual([])
    expect(result.progress.competitiveMultiplayer?.rating.profiles).toEqual([])
    expect(result.progress.competitiveMultiplayer?.rating.transactions).toEqual([])
    expect(result.progress.competitiveMultiplayer?.results).toEqual([])
    expect(result.progress.settings).toEqual(createDefaultGuestProgress().settings)
    expect(result.progress.stats).toEqual(createDefaultGuestProgress().stats)
    expect(repository.upload).not.toHaveBeenCalled()
  })
})
