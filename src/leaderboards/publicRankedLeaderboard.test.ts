import { describe, expect, it, vi } from 'vitest'
import type { BrrrdleSupabaseClient } from '../account/supabaseClient'
import {
  createSupabasePublicRankedLeaderboardRepository,
  normalizePublicRankedLeaderboardQuery,
  parsePublicRankedLeaderboardRow,
  parsePublicRankedLeaderboardRows,
} from './publicRankedLeaderboard'

const PUBLIC_PROFILE_ID = '123e4567-e89b-42d3-a456-426614174000'
const LEADERBOARD_ROW = {
  accent_color: 'cyan',
  avatar_url: 'https://example.invalid/public/avatar.png',
  bucket: 'multiplayer:og',
  display_name: 'Ada',
  draws: 1,
  flair_key: 'none',
  games_played: 12,
  latest_rating_delta: 18,
  latest_rating_movement_at: '2026-06-23T01:00:00.000Z',
  leaderboard_key: 'ranked-practice-v1',
  leaderboard_updated_at: '2026-06-23T01:05:00.000Z',
  losses: 3,
  peak_rating: 1290,
  profile_updated_at: '2026-06-23T00:55:00.000Z',
  provisional: false,
  public_profile_id: PUBLIC_PROFILE_ID,
  rank: 1,
  rating: 1260,
  wins: 8,
}

function client(rpc: ReturnType<typeof vi.fn>): BrrrdleSupabaseClient {
  return { rpc } as unknown as BrrrdleSupabaseClient
}

describe('public ranked leaderboard query normalization', () => {
  it('defaults to the authenticated ranked Practice leaderboard window', () => {
    expect(normalizePublicRankedLeaderboardQuery()).toEqual({
      ok: true,
      value: {
        bucket: null,
        limit: 50,
        offset: 0,
      },
    })
  })

  it('allows only approved public ranked Practice and Daily buckets', () => {
    expect(normalizePublicRankedLeaderboardQuery({ bucket: 'multiplayer:go', limit: 25, offset: 10 })).toEqual({
      ok: true,
      value: {
        bucket: 'multiplayer:go',
        limit: 25,
        offset: 10,
      },
    })
    expect(normalizePublicRankedLeaderboardQuery({ bucket: 'multiplayer:og:daily:v1' })).toMatchObject({
      ok: true,
      value: { bucket: 'multiplayer:og:daily:v1' },
    })
    expect(normalizePublicRankedLeaderboardQuery({ bucket: 'multiplayer:go:daily:v1' })).toMatchObject({
      ok: true,
      value: { bucket: 'multiplayer:go:daily:v1' },
    })
    expect(normalizePublicRankedLeaderboardQuery({ bucket: 'async:og' as never })).toMatchObject({ ok: false })
    expect(normalizePublicRankedLeaderboardQuery({ bucket: 'daily:og' as never })).toMatchObject({ ok: false })
    expect(normalizePublicRankedLeaderboardQuery({ bucket: 'multiplayer:og:timed:v1' as never })).toMatchObject({ ok: false })
  })

  it('rejects out-of-contract limits and offsets before RPC execution', () => {
    expect(normalizePublicRankedLeaderboardQuery({ limit: 0 })).toMatchObject({ ok: false })
    expect(normalizePublicRankedLeaderboardQuery({ limit: 101 })).toMatchObject({ ok: false })
    expect(normalizePublicRankedLeaderboardQuery({ offset: -1 })).toMatchObject({ ok: false })
    expect(normalizePublicRankedLeaderboardQuery({ offset: 1001 })).toMatchObject({ ok: false })
  })
})

describe('public ranked leaderboard DTO parsing', () => {
  it('parses the allow-listed Stage 30.3 RPC row shape', () => {
    expect(parsePublicRankedLeaderboardRow(LEADERBOARD_ROW)).toEqual({
      accentColor: 'cyan',
      avatarUrl: 'https://example.invalid/public/avatar.png',
      bucket: 'multiplayer:og',
      displayName: 'Ada',
      draws: 1,
      flairKey: 'none',
      gamesPlayed: 12,
      latestRatingDelta: 18,
      latestRatingMovementAt: '2026-06-23T01:00:00.000Z',
      leaderboardKey: 'ranked-practice-v1',
      leaderboardUpdatedAt: '2026-06-23T01:05:00.000Z',
      losses: 3,
      peakRating: 1290,
      profileUpdatedAt: '2026-06-23T00:55:00.000Z',
      provisional: false,
      publicProfileId: PUBLIC_PROFILE_ID,
      rank: 1,
      rating: 1260,
      wins: 8,
    })
  })

  it('supports provisional rows without a latest movement timestamp', () => {
    expect(parsePublicRankedLeaderboardRow({
      ...LEADERBOARD_ROW,
      draws: 0,
      games_played: 2,
      latest_rating_delta: 0,
      latest_rating_movement_at: null,
      losses: 1,
      peak_rating: 1205,
      provisional: true,
      rating: 1205,
      wins: 1,
    })).toMatchObject({
      latestRatingDelta: 0,
      latestRatingMovementAt: undefined,
      peakRating: 1205,
      provisional: true,
    })
  })

  it('parses ranked Daily rows without broadening the public payload', () => {
    expect(parsePublicRankedLeaderboardRow({
      ...LEADERBOARD_ROW,
      bucket: 'multiplayer:og:daily:v1',
      leaderboard_key: 'ranked-daily-v1',
    })).toMatchObject({
      bucket: 'multiplayer:og:daily:v1',
      publicProfileId: PUBLIC_PROFILE_ID,
    })
    expect(parsePublicRankedLeaderboardRow({
      ...LEADERBOARD_ROW,
      bucket: 'multiplayer:go:daily:v1',
      leaderboard_key: 'ranked-daily-v1',
    })).toMatchObject({ bucket: 'multiplayer:go:daily:v1' })
    expect(parsePublicRankedLeaderboardRow({
      ...LEADERBOARD_ROW,
      bucket: 'multiplayer:og:daily:v1',
      leaderboard_key: 'ranked-practice-v1',
    })).toBeUndefined()
    expect(parsePublicRankedLeaderboardRow({
      ...LEADERBOARD_ROW,
      leaderboard_key: 'ranked-daily-v1',
    })).toBeUndefined()
  })

  it('rejects corrupt buckets, invalid timestamps, and impossible aggregates', () => {
    expect(parsePublicRankedLeaderboardRow({ ...LEADERBOARD_ROW, bucket: 'async:og' })).toBeUndefined()
    expect(parsePublicRankedLeaderboardRow({ ...LEADERBOARD_ROW, bucket: 'multiplayer:go:timed:v1' })).toBeUndefined()
    expect(parsePublicRankedLeaderboardRow({ ...LEADERBOARD_ROW, latest_rating_movement_at: 'not-a-date' })).toBeUndefined()
    expect(parsePublicRankedLeaderboardRow({ ...LEADERBOARD_ROW, games_played: 3, wins: 4 })).toBeUndefined()
    expect(parsePublicRankedLeaderboardRow({ ...LEADERBOARD_ROW, peak_rating: 1259 })).toBeUndefined()
    expect(parsePublicRankedLeaderboardRow({ ...LEADERBOARD_ROW, public_profile_id: 'raw-auth-id' })).toBeUndefined()
  })

  it('rejects rows containing private or unknown fields', () => {
    for (const privateKey of [
      'user_id',
      'email',
      'raw_user_meta_data',
      'rating_transaction_id',
      'match_id',
      'queue_id',
      'settlement_id',
      'answer',
      'seed',
      'serializedSession',
      'token',
      'session',
    ]) {
      expect(parsePublicRankedLeaderboardRow({ ...LEADERBOARD_ROW, [privateKey]: 'private' })).toBeUndefined()
    }
    expect(parsePublicRankedLeaderboardRow({ ...LEADERBOARD_ROW, visibility: 'public' })).toBeUndefined()
  })

  it('drops corrupt rows without exposing forbidden row data through parsed output', () => {
    const rows = parsePublicRankedLeaderboardRows([
      LEADERBOARD_ROW,
      { ...LEADERBOARD_ROW, email: 'player@example.com', public_profile_id: '223e4567-e89b-42d3-a456-426614174000' },
      { ...LEADERBOARD_ROW, answer: 'crane', public_profile_id: '323e4567-e89b-42d3-a456-426614174000' },
    ])
    const json = JSON.stringify(rows)

    expect(rows).toHaveLength(1)
    expect(json).not.toContain('player@example.com')
    expect(json).not.toContain('crane')
  })
})

describe('createSupabasePublicRankedLeaderboardRepository', () => {
  it('calls the Stage 30.3 RPC with normalized pagination and bucket filters', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [LEADERBOARD_ROW], error: null })
    const repository = createSupabasePublicRankedLeaderboardRepository(client(rpc))

    await expect(repository.loadRankedPracticeLeaderboard({
      bucket: 'multiplayer:og',
      limit: 25,
      offset: 50,
    })).resolves.toMatchObject([{ publicProfileId: PUBLIC_PROFILE_ID, rank: 1 }])
    expect(rpc).toHaveBeenCalledWith('get_public_ranked_leaderboard', {
      p_bucket: 'multiplayer:og',
      p_limit: 25,
      p_offset: 50,
    })
  })

  it('uses safe defaults for the all-bucket leaderboard query', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [LEADERBOARD_ROW], error: null })
    const repository = createSupabasePublicRankedLeaderboardRepository(client(rpc))

    await repository.loadRankedPracticeLeaderboard()
    expect(rpc).toHaveBeenCalledWith('get_public_ranked_leaderboard', {
      p_bucket: null,
      p_limit: 50,
      p_offset: 0,
    })
  })

  it('does not call Supabase for unsupported public request parameters', async () => {
    const rpc = vi.fn()
    const repository = createSupabasePublicRankedLeaderboardRepository(client(rpc))

    await expect(repository.loadRankedPracticeLeaderboard({ bucket: 'async:go' as never })).rejects.toThrow(/Unsupported/)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns no rows for signed-out or RPC error responses', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Authentication required.' } })
    const repository = createSupabasePublicRankedLeaderboardRepository(client(rpc))

    await expect(repository.loadRankedPracticeLeaderboard()).resolves.toEqual([])
  })

  it('keeps repository results on the public allow-list even when RPC data is corrupt', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        LEADERBOARD_ROW,
        { ...LEADERBOARD_ROW, user_id: 'raw-auth-user', public_profile_id: '223e4567-e89b-42d3-a456-426614174000' },
      ],
      error: null,
    })
    const repository = createSupabasePublicRankedLeaderboardRepository(client(rpc))
    const rows = await repository.loadRankedPracticeLeaderboard()
    const json = JSON.stringify(rows)

    expect(rows).toHaveLength(1)
    expect(json).not.toContain('raw-auth-user')
    expect(json).not.toContain('rating_transaction_id')
    expect(json).not.toContain('match_id')
    expect(json).not.toContain('queue_id')
  })
})
