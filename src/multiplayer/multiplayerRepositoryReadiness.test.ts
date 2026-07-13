import { describe, expect, it, vi } from 'vitest'
import type { MultiplayerRepository } from './multiplayerRepository'
import { loadMultiplayerRepositoryWithRetry } from './multiplayerRepositoryReadiness'

function createRepository(load: MultiplayerRepository['load']): MultiplayerRepository {
  return { load } as MultiplayerRepository
}

describe('multiplayer repository readiness', () => {
  it('retries one failed authenticated bootstrap read immediately', async () => {
    const snapshot = { serverNow: '2026-07-11T12:00:00.000Z', state: { games: [] }, version: 1 }
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('session not ready'))
      .mockResolvedValueOnce(snapshot)

    await expect(loadMultiplayerRepositoryWithRetry(createRepository(load))).resolves.toBe(snapshot)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('surfaces the second failure without entering an unbounded retry loop', async () => {
    const load = vi.fn().mockRejectedValue(new Error('read failed'))

    await expect(loadMultiplayerRepositoryWithRetry(createRepository(load))).rejects.toThrow('read failed')
    expect(load).toHaveBeenCalledTimes(2)
  })
})
