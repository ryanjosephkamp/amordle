import { z } from 'zod';
import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import type {
  OwnedPublicProfileProjection,
  PublicLeaderboardProjection,
  PublicProfileProjection,
  PublicSiteStatsProjection,
} from '../types/services';
import { nullablePostgresTimestamptzSchema, postgresTimestamptzSchema } from './postgres-timestamp';
import { ServiceError, throwIfServiceError } from './service-error';

const publicProfileIdSchema = z.string().uuid();
const accentSchema = z.enum(['ice', 'aurora', 'cyan', 'violet', 'rose', 'amber']);
const flairSchema = z.literal('none');
const containsNoControlCharacters = (value: string) =>
  [...value].every((character) => {
    const point = character.codePointAt(0) ?? 0;
    return point > 31 && (point < 127 || point > 159);
  });
const safeText = (maximum: number) =>
  z.string().trim().max(maximum).refine(containsNoControlCharacters);
const displayNameSchema = safeText(50).min(1);
const avatarSchema = z
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === 'https:')
  .nullable();
const bioSchema = safeText(160).nullable();

const publicProfileRowSchema = z
  .object({
    public_profile_id: publicProfileIdSchema,
    display_name: displayNameSchema,
    accent_color: accentSchema,
    flair_key: flairSchema,
    avatar_url: avatarSchema,
    bio: bioSchema,
    created_at: postgresTimestamptzSchema,
    updated_at: postgresTimestamptzSchema,
  })
  .strict();

const ownedProfileRowSchema = z
  .object({
    public_profile_id: publicProfileIdSchema,
    visibility: z.enum(['private', 'public']),
    display_name: displayNameSchema.nullable(),
    accent_color: accentSchema,
    flair_key: flairSchema,
    avatar_url: avatarSchema,
    bio: bioSchema,
    moderation_status: z.enum(['active', 'hidden', 'suspended']),
    created_at: postgresTimestamptzSchema,
    updated_at: postgresTimestamptzSchema,
  })
  .strict();

const leaderboardBucketSchema = z.enum([
  'multiplayer:og',
  'multiplayer:go',
  'multiplayer:og:daily:v1',
  'multiplayer:go:daily:v1',
]);
const leaderboardRowSchema = z
  .object({
    leaderboard_key: z.enum(['ranked-practice-v1', 'ranked-daily-v1']),
    rank: z.number().int().positive(),
    bucket: leaderboardBucketSchema,
    public_profile_id: publicProfileIdSchema,
    display_name: displayNameSchema,
    accent_color: accentSchema,
    flair_key: flairSchema,
    avatar_url: avatarSchema,
    rating: z.number().int().nonnegative(),
    games_played: z.number().int().positive(),
    wins: z.number().int().nonnegative(),
    losses: z.number().int().nonnegative(),
    draws: z.number().int().nonnegative(),
    provisional: z.boolean(),
    latest_rating_delta: z.number().int(),
    latest_rating_movement_at: nullablePostgresTimestamptzSchema,
    peak_rating: z.number().int().nonnegative(),
    profile_updated_at: postgresTimestamptzSchema,
    leaderboard_updated_at: postgresTimestamptzSchema,
  })
  .strict();

const siteStatsRowSchema = z
  .object({
    stats_key: z.literal('site-stats-v1'),
    generated_at: postgresTimestamptzSchema,
    public_profiles_active: z.number().int().nonnegative(),
    ranked_practice_public_players: z.number().int().nonnegative(),
    ranked_practice_public_player_results: z.number().int().nonnegative(),
    ranked_practice_public_og_players: z.number().int().nonnegative(),
    ranked_practice_public_go_players: z.number().int().nonnegative(),
    leaderboard_updated_at: nullablePostgresTimestamptzSchema,
    public_profiles_updated_at: nullablePostgresTimestamptzSchema,
  })
  .strict();

const profileUpdateSchema = z.object({
  displayName: safeText(50).optional(),
  visibility: z.enum(['private', 'public']).optional(),
  accentColor: accentSchema.optional(),
  flairKey: flairSchema.optional(),
  avatarUrl: z
    .union([
      z.literal(''),
      z
        .url()
        .max(2048)
        .refine((value) => new URL(value).protocol === 'https:'),
    ])
    .optional(),
  bio: safeText(160).optional(),
});

function invalidProjection(name: string): ServiceError {
  return new ServiceError('validation', `${name} returned an invalid public projection.`);
}

function normalizedOptionalText(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
}

function profileMatchesUpdate(
  profile: OwnedPublicProfileProjection,
  update: z.infer<typeof profileUpdateSchema>,
): boolean {
  return (
    (update.displayName === undefined ||
      profile.displayName === normalizedOptionalText(update.displayName)) &&
    (update.visibility === undefined || profile.visibility === update.visibility) &&
    (update.accentColor === undefined || profile.accentColor === update.accentColor) &&
    (update.flairKey === undefined || profile.flairKey === update.flairKey) &&
    (update.avatarUrl === undefined ||
      profile.avatarUrl === normalizedOptionalText(update.avatarUrl)) &&
    (update.bio === undefined || profile.bio === normalizedOptionalText(update.bio))
  );
}

function mapProfile(input: unknown): PublicProfileProjection {
  const parsed = publicProfileRowSchema.safeParse(input);
  if (!parsed.success) throw invalidProjection('Public profile service');
  const row = parsed.data;
  return {
    publicProfileId: row.public_profile_id,
    displayName: row.display_name,
    accentColor: row.accent_color,
    flairKey: row.flair_key,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOwnedProfile(input: unknown): OwnedPublicProfileProjection {
  const parsed = ownedProfileRowSchema.safeParse(input);
  if (!parsed.success) throw invalidProjection('Account profile service');
  const row = parsed.data;
  return {
    publicProfileId: row.public_profile_id,
    visibility: row.visibility,
    displayName: row.display_name,
    accentColor: row.accent_color,
    flairKey: row.flair_key,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    moderationStatus: row.moderation_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseLeaderboard(input: unknown): PublicLeaderboardProjection[] {
  const parsed = z.array(leaderboardRowSchema).safeParse(input);
  if (!parsed.success) throw invalidProjection('Leaderboard service');
  return parsed.data;
}

function parseSiteStats(input: unknown): PublicSiteStatsProjection {
  const parsed = siteStatsRowSchema.safeParse(input);
  if (!parsed.success) throw invalidProjection('Site statistics service');
  return parsed.data;
}

export class PublicRepository {
  constructor(private readonly client: AmordleSupabaseClient) {}

  async getProfile(publicProfileId: string): Promise<PublicProfileProjection | null> {
    const { data, error } = await this.client.rpc('get_public_player_profile', {
      p_public_profile_id: publicProfileIdSchema.parse(publicProfileId),
    });
    throwIfServiceError(error, 'Load public profile');
    const row = data?.[0];
    return row ? mapProfile(row) : null;
  }

  async getMyProfile(): Promise<OwnedPublicProfileProjection | null> {
    const { data, error } = await this.client.rpc('get_my_public_player_profile');
    throwIfServiceError(error, 'Load my public profile');
    const row = data?.[0];
    return row ? mapOwnedProfile(row) : null;
  }

  async updateMyProfile(input: {
    displayName?: string;
    visibility?: 'private' | 'public';
    accentColor?: string;
    flairKey?: string;
    avatarUrl?: string;
    bio?: string;
  }): Promise<OwnedPublicProfileProjection> {
    const safe = profileUpdateSchema.parse(input);
    const { data, error } = await this.client.rpc('upsert_my_public_player_profile', {
      ...(safe.displayName === undefined ? {} : { p_display_name: safe.displayName }),
      ...(safe.visibility === undefined ? {} : { p_visibility: safe.visibility }),
      ...(safe.accentColor === undefined ? {} : { p_accent_color: safe.accentColor }),
      ...(safe.flairKey === undefined ? {} : { p_flair_key: safe.flairKey }),
      ...(safe.avatarUrl === undefined ? {} : { p_avatar_url: safe.avatarUrl }),
      ...(safe.bio === undefined ? {} : { p_bio: safe.bio }),
    });
    if (error) {
      try {
        const reconciled = await this.getMyProfile();
        if (reconciled && profileMatchesUpdate(reconciled, safe)) return reconciled;
      } catch {
        // The original mutation error remains authoritative unless the approved
        // owner projection proves that the requested state was durably saved.
      }
      throwIfServiceError(error, 'Update public profile');
    }
    const row = data?.[0];
    if (!row) throw invalidProjection('Account profile service');
    return mapOwnedProfile(row);
  }

  async getProfiles(publicProfileIds: string[]): Promise<PublicProfileProjection[]> {
    if (publicProfileIds.length === 0) return [];
    const ids = [...new Set(publicProfileIds.map((id) => publicProfileIdSchema.parse(id)))];
    if (ids.length > 100) {
      throw new ServiceError('validation', 'At most 100 public profiles may be requested.');
    }
    const { data, error } = await this.client.rpc('get_public_player_profiles', {
      p_public_profile_ids: ids,
    });
    throwIfServiceError(error, 'Load public profiles');
    return (data ?? []).map(mapProfile);
  }

  async getSiteStats(): Promise<PublicSiteStatsProjection | null> {
    const { data, error } = await this.client.rpc('get_public_site_stats_v1');
    throwIfServiceError(error, 'Load public site statistics');
    const row = data?.[0];
    return row ? parseSiteStats(row) : null;
  }

  async getLeaderboard(
    bucket: string,
    limit = 50,
    offset = 0,
  ): Promise<PublicLeaderboardProjection[]> {
    const safeBucket = leaderboardBucketSchema.parse(bucket);
    const safeLimit = z.number().int().min(1).max(100).parse(limit);
    const safeOffset = z.number().int().min(0).max(1000).parse(offset);
    const { data, error } = await this.client.rpc('get_public_ranked_leaderboard', {
      p_bucket: safeBucket,
      p_limit: safeLimit,
      p_offset: safeOffset,
    });
    throwIfServiceError(error, 'Load public leaderboard');
    return parseLeaderboard(data ?? []);
  }
}
