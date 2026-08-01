import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { publicDirectoryEntrySchema, publicPlayerStatsSchema } from '@/adapters/cloud/public';
import {
  accentNameSchema,
  flairNameSchema,
  publicAvatarUrlSchema,
  publicRatingBucketSchema,
} from '@/domain/profile';

const migration = readFileSync(
  'supabase/migrations/20260801032334_amordle_public_community_v1.sql',
  'utf8',
);
const statsRepairMigration = readFileSync(
  'supabase/migrations/20260801050000_amordle_public_community_stats_repair.sql',
  'utf8',
);

describe('public community contract', () => {
  it('accepts only the supported public identity presentation values', () => {
    expect(accentNameSchema.parse('cyan')).toBe('cyan');
    expect(flairNameSchema.parse('daily')).toBe('daily');
    expect(flairNameSchema.parse('combat')).toBe('combat');
    expect(flairNameSchema.safeParse('admin').success).toBe(false);
    expect(publicAvatarUrlSchema.parse('https://images.example.test/player.png')).toContain(
      'https://',
    );
    expect(publicAvatarUrlSchema.safeParse('http://images.example.test/player.png').success).toBe(
      false,
    );
    expect(publicAvatarUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
  });

  it('adds bounded public discovery without granting table access', () => {
    for (const fragment of [
      'list_public_player_directory_v1',
      "where visibility = 'public'",
      "and moderation_status = 'active'",
      'v_limit < 1 or v_limit > 50',
      'v_offset < 0 or v_offset > 5000',
      "lower(profile.display_name) like v_search || '%'",
      'public_player_profiles_public_name_idx',
      'to anon, authenticated',
      'revoke all on all tables in schema brrrdle_private',
    ]) {
      expect(migration).toContain(fragment);
    }
    expect(migration).not.toContain('grant select on public.public_player_profiles');
    expect(migration).not.toContain('grant select on public.multiplayer_player_results');
  });

  it('returns only sanctioned directory identity and one public rating lane', () => {
    const row = publicDirectoryEntrySchema.parse({
      public_profile_id: 'a6b7e763-66d1-4cfb-a899-4f28061f00e4',
      display_name: 'Rival',
      accent_color: 'aurora',
      flair_key: 'combat',
      profile_updated_at: '2026-08-01T03:00:00.000Z',
      bucket: 'multiplayer:go',
      rating: 1342,
      games_played: 12,
      wins: 7,
      losses: 4,
      draws: 1,
      provisional: false,
      rating_updated_at: '2026-08-01T03:00:00.000Z',
      total_count: 1,
    });
    expect(publicRatingBucketSchema.parse(row.bucket)).toBe('multiplayer:go');
    expect(
      publicDirectoryEntrySchema.safeParse({ ...row, user_id: 'private-auth-id' }).success,
    ).toBe(false);
  });

  it('strictly limits public statistics to COMBAT aggregates and rating buckets', () => {
    const projection = publicPlayerStatsSchema.parse({
      schemaVersion: 1,
      overall: {
        gamesCompleted: 3,
        wins: 2,
        losses: 1,
        draws: 0,
        acceptedGuesses: 13,
        puzzlesSolved: 4,
      },
      breakdowns: { practice: 2, daily: 1, og: 1, go: 2, ranked: 2, unranked: 1 },
      ratings: [
        {
          bucket: 'multiplayer:og:daily:v1',
          rating: 1220,
          peakRating: 1240,
          gamesPlayed: 2,
          wins: 1,
          losses: 1,
          draws: 0,
          provisional: true,
          updatedAt: '2026-08-01T03:00:00.000Z',
        },
      ],
      updatedAt: '2026-08-01T03:00:00.000Z',
    });
    expect(projection.overall.gamesCompleted).toBe(3);
    expect(publicPlayerStatsSchema.safeParse({ ...projection, coins: 9000 }).success).toBe(false);

    const statsBoundary = migration.slice(
      migration.indexOf('create or replace function public.get_public_player_profile_stats_v1'),
      migration.indexOf(
        'create or replace function public.get_amordle_public_practice_spectator_v4',
      ),
    );
    expect(statsBoundary).toContain('multiplayer_player_results');
    expect(statsBoundary).toContain('multiplayer_rating_profiles');
    expect(statsBoundary).not.toContain('game_history');
    expect(statsBoundary).not.toContain('account_progress');
    expect(statsBoundary).not.toContain('economy');
  });

  it('repairs public totals and directory ratings from current authoritative data', () => {
    const directoryBoundary = statsRepairMigration.slice(
      statsRepairMigration.indexOf(
        'create or replace function public.list_public_player_directory_v1',
      ),
      statsRepairMigration.indexOf(
        'create or replace function public.get_public_player_profile_stats_v1',
      ),
    );
    expect(directoryBoundary).toContain("when 'multiplayer:og' then 'async:og:amordle:v2'");
    expect(directoryBoundary).toContain("when 'multiplayer:go' then 'async:go:amordle:v2'");
    expect(directoryBoundary).not.toContain("when 'multiplayer:og' then 'async:og'");

    const statsBoundary = statsRepairMigration.slice(
      statsRepairMigration.indexOf(
        'create or replace function public.get_public_player_profile_stats_v1',
      ),
      statsRepairMigration.indexOf('comment on function public.list_public_player_directory_v1'),
    );
    for (const fragment of [
      'brrrdle_private.amordle_combat_authority',
      'brrrdle_private.amordle_combat_action_ledger',
      "authority.status = 'completed'",
      'viewer.player_id is not null',
      'multiplayer_player_results',
      "'async:og:amordle:v2'",
      "'async:go:amordle:v2'",
    ]) {
      expect(statsBoundary).toContain(fragment);
    }
    expect(statsBoundary).not.toContain('game_history');
    expect(statsBoundary).not.toContain('authority.answers');
    expect(statsBoundary).not.toContain('requested_guess');
    expect(statsBoundary).not.toContain('player_one_user_id as');
    expect(statsRepairMigration).toContain(
      'revoke all on all tables in schema brrrdle_private from public, anon, authenticated',
    );
  });

  it('keeps clickable spectator identities inside public unranked Practice only', () => {
    const spectatorBoundary = migration.slice(
      migration.indexOf(
        'create or replace function public.get_amordle_public_practice_spectator_v4',
      ),
      migration.indexOf('comment on function public.list_public_player_directory_v1'),
    );
    for (const fragment of [
      "'publicProfileId', profile.public_profile_id",
      "authority.source_kind = 'public_lobby'",
      "authority.visibility_kind = 'public'",
      "authority.scope = 'practice'",
      'and not authority.ranked',
      "'canMutate', false",
    ]) {
      expect(spectatorBoundary).toContain(fragment);
    }
    expect(spectatorBoundary).not.toContain("'userId'");
    expect(spectatorBoundary).not.toContain("'answer'");
    expect(spectatorBoundary).not.toContain("'seed'");
  });
});
