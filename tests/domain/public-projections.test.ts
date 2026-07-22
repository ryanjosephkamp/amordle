import { describe, expect, it, vi } from 'vitest';
import type { AmordleSupabaseClient } from '../../src/lib/supabase-browser';
import { PublicRepository } from '../../src/services/public-repository';

const publicProfileId = '00000000-0000-4000-8000-000000000111';
const timestamp = '2026-07-22T12:00:00.000Z';

function clientWithRpc(handler: (name: string, args: unknown) => unknown): {
  client: AmordleSupabaseClient;
  rpc: ReturnType<typeof vi.fn>;
} {
  const rpc = vi.fn(async (name: string, args?: unknown) => ({
    data: handler(name, args),
    error: null,
  }));
  return { client: { rpc } as unknown as AmordleSupabaseClient, rpc };
}

function publicProfileRow() {
  return {
    public_profile_id: publicProfileId,
    display_name: 'Ember Player',
    accent_color: 'aurora',
    flair_key: 'none',
    avatar_url: null,
    bio: 'Public bio',
    created_at: timestamp,
    updated_at: timestamp,
    user_id: 'raw-auth-id-must-not-pass',
    email: 'private@example.test',
    answer: 'crane',
  };
}

describe('sanitized public projections', () => {
  it('maps only approved public profile fields and validates the public identifier', async () => {
    const { client, rpc } = clientWithRpc(() => [publicProfileRow()]);
    const projection = await new PublicRepository(client).getProfile(publicProfileId);
    expect(projection).toEqual({
      publicProfileId,
      displayName: 'Ember Player',
      accentColor: 'aurora',
      flairKey: 'none',
      avatarUrl: null,
      bio: 'Public bio',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    expect(JSON.stringify(projection)).not.toContain('raw-auth-id');
    expect(JSON.stringify(projection)).not.toContain('private@example.test');
    expect(JSON.stringify(projection)).not.toContain('crane');

    await expect(new PublicRepository(client).getProfile('raw-auth-id')).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('returns a typed owner projection without leaking broad account fields', async () => {
    const { client } = clientWithRpc(() => [
      {
        ...publicProfileRow(),
        visibility: 'private',
        display_name: null,
        moderation_status: 'active',
      },
    ]);
    const projection = await new PublicRepository(client).getMyProfile();
    expect(projection).toMatchObject({
      publicProfileId,
      visibility: 'private',
      displayName: null,
      moderationStatus: 'active',
    });
    expect(projection).not.toHaveProperty('user_id');
    expect(projection).not.toHaveProperty('email');
  });

  it('allows only the sanctioned ranked leaderboard wire shape', async () => {
    const { client, rpc } = clientWithRpc(() => [
      {
        leaderboard_key: 'ranked-practice-v1',
        rank: 1,
        bucket: 'multiplayer:og',
        public_profile_id: publicProfileId,
        display_name: 'Ember Player',
        accent_color: 'ice',
        flair_key: 'none',
        avatar_url: null,
        rating: 1210,
        games_played: 2,
        wins: 1,
        losses: 1,
        draws: 0,
        provisional: true,
        latest_rating_delta: 10,
        latest_rating_movement_at: null,
        peak_rating: 1210,
        profile_updated_at: timestamp,
        leaderboard_updated_at: timestamp,
        user_id: 'raw-auth-id-must-not-pass',
        private_projection: { answer: 'crane' },
      },
    ]);
    const rows = await new PublicRepository(client).getLeaderboard('multiplayer:og', 25, 0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty('user_id');
    expect(rows[0]).not.toHaveProperty('private_projection');
    expect(rows[0]).toMatchObject({
      public_profile_id: publicProfileId,
      rating: 1210,
      latest_rating_movement_at: null,
    });
    expect(rpc).toHaveBeenCalledWith('get_public_ranked_leaderboard', {
      p_bucket: 'multiplayer:og',
      p_limit: 25,
      p_offset: 0,
    });

    await expect(
      new PublicRepository(client).getLeaderboard('multiplayer:go', 101, 0),
    ).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('accepts the sanctioned Daily leaderboard bucket and key', async () => {
    const { client, rpc } = clientWithRpc(() => [
      {
        leaderboard_key: 'ranked-daily-v1',
        rank: 1,
        bucket: 'multiplayer:go:daily:v1',
        public_profile_id: publicProfileId,
        display_name: 'Frost Player',
        accent_color: 'ice',
        flair_key: 'none',
        avatar_url: null,
        rating: 1240,
        games_played: 3,
        wins: 2,
        losses: 1,
        draws: 0,
        provisional: true,
        latest_rating_delta: 8,
        latest_rating_movement_at: timestamp,
        peak_rating: 1240,
        profile_updated_at: timestamp,
        leaderboard_updated_at: timestamp,
      },
    ]);

    const rows = await new PublicRepository(client).getLeaderboard('multiplayer:go:daily:v1');

    expect(rows[0]).toMatchObject({
      leaderboard_key: 'ranked-daily-v1',
      bucket: 'multiplayer:go:daily:v1',
    });
    expect(rpc).toHaveBeenCalledWith('get_public_ranked_leaderboard', {
      p_bucket: 'multiplayer:go:daily:v1',
      p_limit: 50,
      p_offset: 0,
    });
  });

  it('sanitizes aggregate site statistics and fails closed on malformed RPC data', async () => {
    const valid = clientWithRpc(() => [
      {
        stats_key: 'site-stats-v1',
        generated_at: timestamp,
        public_profiles_active: 4,
        ranked_practice_public_players: 3,
        ranked_practice_public_player_results: 8,
        ranked_practice_public_og_players: 2,
        ranked_practice_public_go_players: 1,
        leaderboard_updated_at: null,
        public_profiles_updated_at: timestamp,
        emails: ['private@example.test'],
      },
    ]);
    const projection = await new PublicRepository(valid.client).getSiteStats();
    expect(projection).toMatchObject({
      stats_key: 'site-stats-v1',
      public_profiles_active: 4,
      leaderboard_updated_at: null,
    });
    expect(projection).not.toHaveProperty('emails');

    const malformed = clientWithRpc(() => [
      {
        stats_key: 'site-stats-v1',
        generated_at: timestamp,
        public_profiles_active: -1,
      },
    ]);
    await expect(new PublicRepository(malformed.client).getSiteStats()).rejects.toMatchObject({
      failure: { code: 'validation' },
    });
  });
});
