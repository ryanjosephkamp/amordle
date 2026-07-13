import { describe, expect, it, vi } from 'vitest'
import type { BrrrdleSupabaseClient } from '../account/supabaseClient'
import {
  createSupabasePublicSiteStatsRepository,
  parsePublicSiteStatsDto,
} from './siteStats'

const SITE_STATS_ROW = {
  generated_at: '2026-07-03T16:20:00.000Z',
  leaderboard_updated_at: '2026-07-03T16:19:00.000Z',
  public_profiles_active: 12,
  public_profiles_updated_at: '2026-07-03T16:18:00.000Z',
  ranked_practice_public_go_players: 6,
  ranked_practice_public_og_players: 8,
  ranked_practice_public_player_results: 44,
  ranked_practice_public_players: 10,
  stats_key: 'site-stats-v1',
}

function client(rpc: ReturnType<typeof vi.fn>): BrrrdleSupabaseClient {
  return { rpc } as unknown as BrrrdleSupabaseClient
}

describe('public site stats DTO parsing', () => {
  it('parses the allow-listed aggregate RPC row shape', () => {
    expect(parsePublicSiteStatsDto(SITE_STATS_ROW)).toEqual({
      generatedAt: '2026-07-03T16:20:00.000Z',
      leaderboardUpdatedAt: '2026-07-03T16:19:00.000Z',
      publicProfilesActive: 12,
      publicProfilesUpdatedAt: '2026-07-03T16:18:00.000Z',
      rankedPracticePublicGoPlayers: 6,
      rankedPracticePublicOgPlayers: 8,
      rankedPracticePublicPlayerResults: 44,
      rankedPracticePublicPlayers: 10,
      statsKey: 'site-stats-v1',
    })
  })

  it('accepts bigint strings and nullable freshness timestamps from PostgREST', () => {
    expect(parsePublicSiteStatsDto({
      ...SITE_STATS_ROW,
      leaderboard_updated_at: null,
      public_profiles_active: '12',
      public_profiles_updated_at: null,
      ranked_practice_public_player_results: '44',
    })).toMatchObject({
      leaderboardUpdatedAt: undefined,
      publicProfilesActive: 12,
      publicProfilesUpdatedAt: undefined,
      rankedPracticePublicPlayerResults: 44,
    })
  })

  it('rejects forbidden or out-of-contract fields before rendering', () => {
    expect(parsePublicSiteStatsDto({ ...SITE_STATS_ROW, user_id: 'raw-auth-id' })).toBeUndefined()
    expect(parsePublicSiteStatsDto({ ...SITE_STATS_ROW, email: 'player@example.invalid' })).toBeUndefined()
    expect(parsePublicSiteStatsDto({ ...SITE_STATS_ROW, queue_id: 'queue-1' })).toBeUndefined()
    expect(parsePublicSiteStatsDto({ ...SITE_STATS_ROW, token: 'secret-shaped' })).toBeUndefined()
    expect(parsePublicSiteStatsDto({ ...SITE_STATS_ROW, generated_at: 'not-a-date' })).toBeUndefined()
    expect(parsePublicSiteStatsDto({ ...SITE_STATS_ROW, ranked_practice_public_players: 2, ranked_practice_public_go_players: 3 })).toBeUndefined()
  })
})

describe('createSupabasePublicSiteStatsRepository', () => {
  it('calls the public aggregate stats RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [SITE_STATS_ROW], error: null })
    const repository = createSupabasePublicSiteStatsRepository(client(rpc))

    await expect(repository.loadPublicSiteStats()).resolves.toMatchObject({ statsKey: 'site-stats-v1' })
    expect(rpc).toHaveBeenCalledWith('get_public_site_stats_v1')
  })

  it('returns undefined for RPC errors or corrupt payloads', async () => {
    const errorRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'nope' } })
    const corruptRpc = vi.fn().mockResolvedValue({ data: [{ ...SITE_STATS_ROW, session: 'browser-session' }], error: null })

    await expect(createSupabasePublicSiteStatsRepository(client(errorRpc)).loadPublicSiteStats()).resolves.toBeUndefined()
    await expect(createSupabasePublicSiteStatsRepository(client(corruptRpc)).loadPublicSiteStats()).resolves.toBeUndefined()
  })
})
