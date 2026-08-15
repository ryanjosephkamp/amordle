'use client';

import { z } from 'zod';
import {
  accentHexSchema,
  accentNameSchema,
  flairNameSchema,
  publicRatingBucketSchema,
} from '@/domain/profile';
import type { AccentSelection, FlairName, PublicRatingBucket } from '@/domain/profile';
import { getBrowserSupabase } from './browser';
import { parseServiceResult, ServiceError, throwServiceError } from './shared';

export const publicProfileSchema = z
  .object({
    accent_color: accentNameSchema.nullable(),
    accent_hex: accentHexSchema.nullable(),
    avatar_url: z.string().startsWith('https://').max(2048).nullable(),
    bio: z.string().nullable(),
    created_at: z.string(),
    display_name: z.string().nullable(),
    flair_key: flairNameSchema.nullable(),
    public_profile_id: z.string().uuid(),
    updated_at: z.string(),
  })
  .strict();

export const myPublicProfileSchema = publicProfileSchema
  .extend({
    moderation_status: z.string(),
    active_accent_preset_id: z.string().uuid().nullable(),
    visibility: z.string(),
  })
  .strict();

export const leaderboardEntrySchema = z
  .object({
    accent_color: accentNameSchema.nullable(),
    accent_hex: accentHexSchema.nullable(),
    avatar_url: z.string().nullable(),
    bucket: z.string(),
    display_name: z.string().nullable(),
    draws: z.number().int(),
    flair_key: flairNameSchema,
    games_played: z.number().int(),
    latest_rating_delta: z.number(),
    latest_rating_movement_at: z.string().nullable(),
    leaderboard_key: z.string(),
    leaderboard_updated_at: z.string(),
    losses: z.number().int(),
    peak_rating: z.number(),
    profile_updated_at: z.string().nullable(),
    provisional: z.boolean(),
    public_profile_id: z.string(),
    rank: z.number().int().positive(),
    rating: z.number(),
    wins: z.number().int(),
  })
  .strict();

export const publicDirectoryEntrySchema = z
  .object({
    accent_color: accentNameSchema,
    accent_hex: accentHexSchema.nullable(),
    bucket: publicRatingBucketSchema.nullable(),
    display_name: z.string().min(1).max(50),
    draws: z.number().int().nonnegative().nullable(),
    flair_key: flairNameSchema,
    games_played: z.number().int().nonnegative().nullable(),
    losses: z.number().int().nonnegative().nullable(),
    profile_updated_at: z.string(),
    provisional: z.boolean().nullable(),
    public_profile_id: z.string().uuid(),
    rating: z.number().int().nullable(),
    rating_updated_at: z.string().nullable(),
    total_count: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative().nullable(),
  })
  .strict();

const publicRatingStatSchema = z
  .object({
    bucket: publicRatingBucketSchema,
    rating: z.number().int(),
    peakRating: z.number().int(),
    gamesPlayed: z.number().int().nonnegative(),
    wins: z.number().int().nonnegative(),
    losses: z.number().int().nonnegative(),
    draws: z.number().int().nonnegative(),
    provisional: z.boolean(),
    updatedAt: z.string(),
  })
  .strict();

export const publicPlayerStatsSchema = z
  .object({
    schemaVersion: z.literal(1),
    overall: z
      .object({
        gamesCompleted: z.number().int().nonnegative(),
        wins: z.number().int().nonnegative(),
        losses: z.number().int().nonnegative(),
        draws: z.number().int().nonnegative(),
        acceptedGuesses: z.number().int().nonnegative(),
        puzzlesSolved: z.number().int().nonnegative(),
      })
      .strict(),
    breakdowns: z
      .object({
        practice: z.number().int().nonnegative(),
        daily: z.number().int().nonnegative(),
        og: z.number().int().nonnegative(),
        go: z.number().int().nonnegative(),
        ranked: z.number().int().nonnegative(),
        unranked: z.number().int().nonnegative(),
      })
      .strict(),
    ratings: z.array(publicRatingStatSchema),
    updatedAt: z.string().nullable(),
  })
  .strict();

export type PublicDirectoryEntry = z.infer<typeof publicDirectoryEntrySchema>;
export type PublicPlayerStats = z.infer<typeof publicPlayerStatsSchema>;

export const accentPresetSchema = z
  .object({
    accent_hex: accentHexSchema,
    created_at: z.string(),
    /*
     * Nullable, because the server computes this as
     * `profile.active_accent_preset_id = preset.preset_id`
     * (list_my_accent_presets_v2). When a player has saved a custom accent but
     * is not currently wearing one, that comparison is `null = uuid`, which in
     * SQL is NULL rather than false — so the column arrives null and a bare
     * z.boolean() rejected the whole response, taking the Profile page down
     * with it.
     *
     * Coercing to false is the meaning, not a workaround: "no active preset"
     * is precisely "this preset is not the active one". The SQL should still
     * coalesce at source, which needs a migration and is recorded as open work.
     */
    is_active: z
      .boolean()
      .nullable()
      .transform((value) => value ?? false),
    name: z.string().min(1).max(32),
    preset_id: z.string().uuid(),
    updated_at: z.string(),
  })
  .strict();

export type AccentPreset = z.infer<typeof accentPresetSchema>;

export const siteStatsSchema = z
  .object({
    generated_at: z.string(),
    leaderboard_updated_at: z.string().nullable(),
    public_profiles_active: z.number().int(),
    public_profiles_updated_at: z.string().nullable(),
    ranked_practice_public_go_players: z.number().int(),
    ranked_practice_public_og_players: z.number().int(),
    ranked_practice_public_player_results: z.number().int(),
    ranked_practice_public_players: z.number().int(),
    stats_key: z.string(),
  })
  .strict();

function client() {
  const value = getBrowserSupabase();
  if (!value) throw new ServiceError('Community services are unavailable.', 'UNAVAILABLE');
  return value;
}

export async function getPublicProfile(publicProfileId: string) {
  const { data, error } = await client().rpc('get_public_player_profile_v2', {
    p_public_profile_id: publicProfileId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(publicProfileSchema.nullable(), data?.[0] ?? null);
}

export async function getMyPublicProfile() {
  const { data, error } = await client().rpc('get_my_public_player_profile_v2');
  if (error) throwServiceError(error);
  return parseServiceResult(myPublicProfileSchema.nullable(), data?.[0] ?? null);
}

export async function saveMyPublicProfile(input: {
  displayName: string;
  bio: string;
  visibility: 'public';
  accentSelection: AccentSelection;
  avatarUrl?: string;
  flairKey: FlairName;
}) {
  const { data, error } = await client().rpc('upsert_my_public_player_profile_v2', {
    p_display_name: input.displayName,
    p_bio: input.bio,
    p_visibility: input.visibility,
    p_accent_color: input.accentSelection.kind === 'named' ? input.accentSelection.name : 'aurora',
    p_active_accent_preset_id: (input.accentSelection.kind === 'custom'
      ? input.accentSelection.presetId
      : null) as string,
    ...(input.avatarUrl === undefined ? {} : { p_avatar_url: input.avatarUrl }),
    p_flair_key: input.flairKey,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(myPublicProfileSchema, data?.[0]);
}

export async function getMyAccentPresets() {
  const { data, error } = await client().rpc('list_my_accent_presets_v2');
  if (error) throwServiceError(error);
  return parseServiceResult(z.array(accentPresetSchema).max(24), data ?? []);
}

export async function upsertMyAccentPreset(input: {
  presetId: string | null;
  name: string;
  accentHex: string;
  select: boolean;
}) {
  const { data, error } = await client().rpc('upsert_my_accent_preset_v2', {
    p_preset_id: input.presetId as string,
    p_name: input.name,
    p_accent_hex: input.accentHex,
    p_select: input.select,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(accentPresetSchema, data?.[0]);
}

const deleteAccentPresetResultSchema = z
  .object({
    active_accent_color: accentNameSchema,
    active_accent_hex: accentHexSchema.nullable(),
    deleted: z.boolean(),
  })
  .strict();

export async function deleteMyAccentPreset(presetId: string) {
  const { data, error } = await client().rpc('delete_my_accent_preset_v2', {
    p_preset_id: presetId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(deleteAccentPresetResultSchema, data?.[0]);
}

export async function getPublicPlayerStats(publicProfileId: string) {
  const { data, error } = await client().rpc('get_public_player_profile_stats_v1', {
    p_public_profile_id: publicProfileId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(publicPlayerStatsSchema.nullable(), data);
}

export async function getPublicPlayerDirectory(input: {
  search: string;
  bucket: PublicRatingBucket;
  minRating: number | null;
  maxRating: number | null;
  sort: 'rating' | 'games' | 'name' | 'recent';
  offset: number;
  limit?: number;
}) {
  const { data, error } = await client().rpc('list_public_player_directory_v2', {
    p_search: input.search,
    p_bucket: input.bucket,
    ...(input.minRating === null ? {} : { p_min_rating: input.minRating }),
    ...(input.maxRating === null ? {} : { p_max_rating: input.maxRating }),
    p_sort: input.sort,
    p_offset: input.offset,
    p_limit: input.limit ?? 50,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(z.array(publicDirectoryEntrySchema), data ?? []);
}

export async function getLeaderboard(bucket: string) {
  const { data, error } = await client().rpc('get_public_ranked_leaderboard_v2', {
    p_bucket: bucket,
    p_limit: 50,
    p_offset: 0,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(z.array(leaderboardEntrySchema), data);
}

export async function getSiteStats() {
  const { data, error } = await client().rpc('get_public_site_stats_v1');
  if (error) throwServiceError(error);
  return parseServiceResult(siteStatsSchema, data?.[0]);
}
