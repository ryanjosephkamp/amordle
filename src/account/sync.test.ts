import { describe, expect, it } from 'vitest'
import { createDefaultGuestProgress } from './storageSchema'
import { syncAuthenticatedProgress, syncGuestProgress, type CloudProgressRecord, type CloudProgressRepository } from './sync'

function createRepository(record?: CloudProgressRecord, shouldFail = false): CloudProgressRepository & { uploads: CloudProgressRecord[] } {
  const uploads: CloudProgressRecord[] = []
  return {
    async download() {
      if (shouldFail) {
        throw new Error('offline')
      }
      return record
    },
    async upload(uploadedRecord) {
      uploads.push(uploadedRecord)
    },
    uploads,
  }
}

describe('cloud sync', () => {
  it('uploads local progress when no cloud record exists', async () => {
    const repository = createRepository()
    const result = await syncGuestProgress({
      isOnline: true,
      localProgress: createDefaultGuestProgress(),
      localUpdatedAt: '2026-05-26T01:00:00Z',
      repository,
      userId: 'user-1',
    })

    expect(result.status.kind).toBe('synced')
    expect(repository.uploads).toHaveLength(1)
  })

  it('merges newer cloud progress as a conflict', async () => {
    const cloudProgress = { ...createDefaultGuestProgress(), completedGameIds: ['cloud-game'] }
    const repository = createRepository({ progress: cloudProgress, updatedAt: '2026-05-26T02:00:00Z', userId: 'user-1' })
    const result = await syncGuestProgress({
      isOnline: true,
      localProgress: { ...createDefaultGuestProgress(), completedGameIds: ['local-game'] },
      localUpdatedAt: '2026-05-26T01:00:00Z',
      repository,
      userId: 'user-1',
    })

    expect(result.status.kind).toBe('conflict')
    expect(result.progress.completedGameIds).toEqual(['cloud-game', 'local-game'])
  })

  it('keeps local progress when offline or repository fails', async () => {
    const offline = await syncGuestProgress({
      isOnline: false,
      localProgress: createDefaultGuestProgress(),
      localUpdatedAt: '2026-05-26T01:00:00Z',
      repository: createRepository(),
      userId: 'user-1',
    })
    const failed = await syncGuestProgress({
      isOnline: true,
      localProgress: createDefaultGuestProgress(),
      localUpdatedAt: '2026-05-26T01:00:00Z',
      repository: createRepository(undefined, true),
      userId: 'user-1',
    })

    expect(offline.status.kind).toBe('offline')
    expect(failed.status.kind).toBe('error')
  })

  it('uses the same merge-safe snapshot path for authenticated automatic progress sync', async () => {
    const cloudProgress = { ...createDefaultGuestProgress(), completedGameIds: ['cloud-game'] }
    const repository = createRepository({ progress: cloudProgress, updatedAt: '2026-05-26T02:00:00Z', userId: 'user-1' })
    const result = await syncAuthenticatedProgress({
      isOnline: true,
      localProgress: { ...createDefaultGuestProgress(), completedGameIds: ['local-game'] },
      localUpdatedAt: '2026-05-26T01:00:00Z',
      repository,
      userId: 'user-1',
    })

    expect(result.status.kind).toBe('conflict')
    expect(result.progress.completedGameIds).toEqual(['cloud-game', 'local-game'])
    expect(repository.uploads).toHaveLength(1)
  })
})
