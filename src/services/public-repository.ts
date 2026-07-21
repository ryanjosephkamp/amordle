import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import type { Database } from '../types/database';
import type { PublicProfileProjection } from '../types/services';
import { throwIfServiceError } from './service-error';

type PublicProfileRow = {
  public_profile_id: string;
  display_name: string;
  accent_color: string;
  flair_key: string;
  avatar_url: string;
  bio: string;
  updated_at: string;
};

function mapProfile(row: PublicProfileRow): PublicProfileProjection {
  return {
    publicProfileId: row.public_profile_id,
    displayName: row.display_name,
    accentColor: row.accent_color || null,
    flairKey: row.flair_key || null,
    avatarUrl: row.avatar_url || null,
    bio: row.bio || null,
    updatedAt: row.updated_at,
  };
}

export class PublicRepository {
  constructor(private readonly client: AmordleSupabaseClient) {}

  async getProfile(publicProfileId: string): Promise<PublicProfileProjection | null> {
    const { data, error } = await this.client.rpc('get_public_player_profile', {
      p_public_profile_id: publicProfileId,
    });
    throwIfServiceError(error, 'Load public profile');
    const row = data?.[0];
    return row ? mapProfile(row) : null;
  }

  async getMyProfile(): Promise<unknown> {
    const { data, error } = await this.client.rpc('get_my_public_player_profile');
    throwIfServiceError(error, 'Load my public profile');
    return data?.[0] ?? null;
  }

  async updateMyProfile(input: {
    displayName?: string;
    visibility?: 'private' | 'public';
    accentColor?: string;
    flairKey?: string;
    avatarUrl?: string;
    bio?: string;
  }): Promise<unknown> {
    const { data, error } = await this.client.rpc('upsert_my_public_player_profile', {
      ...(input.displayName === undefined ? {} : { p_display_name: input.displayName }),
      ...(input.visibility === undefined ? {} : { p_visibility: input.visibility }),
      ...(input.accentColor === undefined ? {} : { p_accent_color: input.accentColor }),
      ...(input.flairKey === undefined ? {} : { p_flair_key: input.flairKey }),
      ...(input.avatarUrl === undefined ? {} : { p_avatar_url: input.avatarUrl }),
      ...(input.bio === undefined ? {} : { p_bio: input.bio }),
    });
    throwIfServiceError(error, 'Update public profile');
    return data?.[0] ?? null;
  }

  async getProfiles(publicProfileIds: string[]): Promise<PublicProfileProjection[]> {
    if (publicProfileIds.length === 0) return [];
    const { data, error } = await this.client.rpc('get_public_player_profiles', {
      p_public_profile_ids: [...new Set(publicProfileIds)].slice(0, 100),
    });
    throwIfServiceError(error, 'Load public profiles');
    return (data ?? []).map(mapProfile);
  }

  async getSiteStats(): Promise<
    Database['public']['Functions']['get_public_site_stats_v1']['Returns'][number] | null
  > {
    const { data, error } = await this.client.rpc('get_public_site_stats_v1');
    throwIfServiceError(error, 'Load public site statistics');
    return data?.[0] ?? null;
  }

  async getLeaderboard(
    bucket: string,
    limit = 50,
    offset = 0,
  ): Promise<Database['public']['Functions']['get_public_ranked_leaderboard']['Returns']> {
    const { data, error } = await this.client.rpc('get_public_ranked_leaderboard', {
      p_bucket: bucket,
      p_limit: Math.min(Math.max(limit, 1), 100),
      p_offset: Math.max(offset, 0),
    });
    throwIfServiceError(error, 'Load public leaderboard');
    return data ?? [];
  }
}
