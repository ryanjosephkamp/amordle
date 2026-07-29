'use client';

import { z } from 'zod';
import { getBrowserSupabase } from './browser';
import { parseServiceResult, ServiceError, throwServiceError } from './shared';

export const publicProfileSchema = z
  .object({
    accent_color: z.string().nullable(),
    avatar_url: z.string().nullable(),
    bio: z.string().nullable(),
    created_at: z.string(),
    display_name: z.string().nullable(),
    flair_key: z.string().nullable(),
    public_profile_id: z.string(),
    updated_at: z.string(),
  })
  .strict();

export const myPublicProfileSchema = publicProfileSchema
  .extend({
    moderation_status: z.string(),
    visibility: z.string(),
  })
  .strict();

export const leaderboardEntrySchema = z
  .object({
    accent_color: z.string().nullable(),
    avatar_url: z.string().nullable(),
    bucket: z.string(),
    display_name: z.string().nullable(),
    draws: z.number().int(),
    flair_key: z.string(),
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
  const { data, error } = await client().rpc('get_public_player_profile', {
    p_public_profile_id: publicProfileId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(publicProfileSchema.nullable(), data?.[0] ?? null);
}

export async function getMyPublicProfile() {
  const { data, error } = await client().rpc('get_my_public_player_profile');
  if (error) throwServiceError(error);
  return parseServiceResult(myPublicProfileSchema.nullable(), data?.[0] ?? null);
}

export async function saveMyPublicProfile(input: {
  displayName: string;
  bio: string;
  visibility: 'public' | 'private';
  accentColor: string;
  avatarUrl?: string;
  flairKey: string;
}) {
  const { data, error } = await client().rpc('upsert_my_public_player_profile', {
    p_display_name: input.displayName,
    p_bio: input.bio,
    p_visibility: input.visibility,
    p_accent_color: input.accentColor,
    ...(input.avatarUrl === undefined ? {} : { p_avatar_url: input.avatarUrl }),
    p_flair_key: input.flairKey,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(myPublicProfileSchema, data?.[0]);
}

export async function getLeaderboard(bucket: string) {
  const { data, error } = await client().rpc('get_public_ranked_leaderboard', {
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
