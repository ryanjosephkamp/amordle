import { describe, expect, it, vi } from 'vitest'
import type { BrrrdleSupabaseClient } from '../account/supabaseClient'
import { createSupabaseMultiplayerRepository } from './multiplayerRepository'

describe('Phase 56 private request repository authority', () => {
  it('uses narrow preference and block RPCs with allowlisted results', async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === 'get_private_multiplayer_request_preference') return { data: [{ accept_private_practice_requests: false, updated_at: '2026-07-11T00:00:00.000Z' }], error: null }
      if (name === 'update_private_multiplayer_request_preference') return { data: [{ accept_private_practice_requests: true, updated_at: '2026-07-11T00:01:00.000Z' }], error: null }
      if (name === 'get_private_multiplayer_request_blocks') return { data: [{ blocked_at: '2026-07-11T00:02:00.000Z', display_name: 'Blocked player', public_profile_id: '22222222-2222-4222-8222-222222222222' }], error: null }
      if (name === 'set_private_multiplayer_request_block') return { data: [{ blocked: true, public_profile_id: '22222222-2222-4222-8222-222222222222', updated_at: '2026-07-11T00:03:00.000Z' }], error: null }
      return { data: [], error: null }
    })
    const repository = createSupabaseMultiplayerRepository({
      client: { channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), from: vi.fn(), removeChannel: vi.fn(), rpc } as unknown as BrrrdleSupabaseClient,
      userId: '11111111-1111-4111-8111-111111111111',
    })

    await expect(repository.getPrivateRequestPreference()).resolves.toMatchObject({ acceptPrivatePracticeRequests: false })
    await expect(repository.updatePrivateRequestPreference(true)).resolves.toMatchObject({ acceptPrivatePracticeRequests: true })
    await expect(repository.listPrivateRequestBlocks()).resolves.toEqual([expect.objectContaining({ displayName: 'Blocked player' })])
    await expect(repository.setPrivateRequestBlock({ blocked: true, targetPublicProfileId: '22222222-2222-4222-8222-222222222222' })).resolves.toMatchObject({ blocked: true })
    expect(rpc).toHaveBeenCalledWith('update_private_multiplayer_request_preference', { p_accept: true })
    expect(rpc).toHaveBeenCalledWith('set_private_multiplayer_request_block', { p_blocked: true, p_target_public_profile_id: '22222222-2222-4222-8222-222222222222' })
  })

  it('rejects extra private fields from block responses', async () => {
    const rpc = vi.fn(async () => ({ data: [{ blocked_at: '2026-07-11T00:02:00.000Z', display_name: 'Blocked player', public_profile_id: '22222222-2222-4222-8222-222222222222', user_id: 'forbidden' }], error: null }))
    const repository = createSupabaseMultiplayerRepository({
      client: { channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), from: vi.fn(), removeChannel: vi.fn(), rpc } as unknown as BrrrdleSupabaseClient,
      userId: '11111111-1111-4111-8111-111111111111',
    })
    await expect(repository.listPrivateRequestBlocks()).resolves.toEqual([])
  })
})
