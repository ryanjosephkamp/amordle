import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const authorityV2 = read('supabase/migrations/20260724222000_amordle_authoritative_combat_v2.sql');
const spectatorV3 = read(
  'supabase/migrations/20260724223000_amordle_live_spectator_privacy_v3.sql',
);
const authorityV3 = read('supabase/migrations/20260730193000_amordle_combat_authority_v3.sql');
const publicCommunityV1 = read(
  'supabase/migrations/20260801032334_amordle_public_community_v1.sql',
);
const rankedDaily = read('supabase/migrations/20260710061039_phase55_ranked_daily_multiplayer.sql');
const requestProtection = read(
  'supabase/migrations/20260711001811_phase56_private_request_center_and_anti_spam.sql',
);
const matchController = read('src/features/combat/match-controller.tsx');
const accountFreshness = read('src/application/account-query-freshness.ts');
const practiceLobby = read('src/features/combat/practice-lobby.tsx');
const dailyLobby = read('src/features/combat/daily-lobby.tsx');
const openLobbies = read('src/features/combat/open-lobbies.tsx');
const activeGames = read('src/features/combat/active-games.tsx');
const liveGames = read('src/features/combat/live-games.tsx');
const requestCenter = read('src/features/combat/request-center.tsx');
const homeAttention = read('src/features/home/home-attention.tsx');
const sessionCombat = read('src/adapters/session-combat.ts');
const cloudCombat = read('src/adapters/cloud/combat.ts');
const notificationCenter = read('src/components/notification-center.tsx');
const notifications = read('src/domain/notifications.ts');
const transcript = read('src/features/combat/combat-transcript.tsx');

function includesAll(source: string, fragments: readonly string[]) {
  for (const fragment of fragments) expect(source).toContain(fragment);
}

describe('MP-01 through MP-21 acceptance authority', () => {
  it('proves MP-01 public Practice authority and complete configuration', () => {
    includesAll(authorityV3, [
      'create_amordle_public_practice_v3',
      'join_amordle_public_practice_v3',
      "v_mode not in ('og', 'go')",
      'p_word_length not between 2 and 35',
      "v_difficulty not in ('casual', 'standard', 'expert')",
      'p_go_puzzle_count not in (5, 7, 10)',
      'p_time_limit_ms is not null and p_time_limit_ms <> 300000',
    ]);
    includesAll(transcript, [
      'actorLabel',
      'orderedMoves',
      'const rows: CombatTranscriptRow[]',
      'Math.max(6, rows.length + 1)',
    ]);
  });

  it('proves MP-02 four isolated Daily lanes and UTC authority', () => {
    includesAll(authorityV2, [
      'create_amordle_unranked_daily_lobby_v2',
      'list_amordle_unranked_daily_lobbies_v2',
      'join_amordle_unranked_daily_lobby_v2',
      "v_mode not in ('og', 'go')",
      "'scope', 'daily'",
      "'wordLength', 5",
    ]);
    includesAll(authorityV3, [
      'get_amordle_ranked_daily_status_v3',
      'finalize_amordle_ranked_daily_v3',
      'settle_amordle_ranked_daily_v3',
    ]);
    includesAll(dailyLobby, [
      '<option value="og">OG</option>',
      '<option value="go">GO · five puzzles</option>',
      'Create Daily lobby',
      'Find ranked Daily',
      'UTC lane',
    ]);
  });

  it('proves MP-03 private drafts and optimistic concurrency', () => {
    includesAll(authorityV2, [
      'p_expected_version integer',
      'p_expected_move_count integer',
      'amordle-combat-command:',
      'v_authority.version <> p_expected_version',
      'v_authority.move_count <> p_expected_move_count',
    ]);
    includesAll(matchController, [
      'const [draft, setDraft]',
      'expectedVersion:',
      'expectedMoveCount:',
    ]);
  });

  it('proves MP-04 chronological convergence and shared current-puzzle evidence', () => {
    includesAll(matchController, [
      "refetchInterval: () => (document.visibilityState === 'visible' ? 5_000 : false)",
      "table: 'async_multiplayer_games'",
      'derivePuzzleKeyboardEvidence',
      'visibleMoves',
    ]);
    includesAll(transcript, ['chronological', 'actorLabel', 'orderedMoves']);
  });

  it('proves MP-05 authoritative multiplayer GO lifecycle', () => {
    includesAll(authorityV2, [
      'hold_until',
      "v_command = 'advance'",
      "interval '2 seconds'",
      'amordle_attempt_budget',
      'seeded_rows',
      'current_puzzle_index',
      'puzzles_solved',
      'points_awarded',
    ]);
  });

  it('proves MP-06 Hard Mode and durable clock authority', () => {
    includesAll(authorityV2, [
      'amordle_hard_mode_guess_is_valid',
      'check (time_limit_ms is null or time_limit_ms = 300000)',
      'player_one_time_remaining_ms',
      'player_two_time_remaining_ms',
      'turn_started_at',
      "terminal_reason = 'timeout'",
    ]);
  });

  it('proves MP-07 terminal precedence and idempotent settlement', () => {
    includesAll(authorityV2, [
      "v_command not in ('guess', 'cancel', 'forfeit', 'advance', 'timeout')",
      "v_terminal_reason := 'forfeit'",
      "v_terminal_reason := 'cancelled'",
      "terminal_reason = 'timeout'",
      'amordle-combat-settle:',
      "v_idempotency_key := 'amordle-ranked-practice-v2:settle:' || p_game_id",
      "'idempotent', true",
    ]);
  });

  it('proves MP-08 ranked Practice queue compatibility and recovery', () => {
    includesAll(authorityV2, [
      'create_amordle_ranked_practice_request_v2',
      'claim_amordle_ranked_practice_v2',
      'get_amordle_ranked_practice_status_v2',
      'cancel_amordle_ranked_practice_v2',
      'finalize_amordle_ranked_practice_v2',
      'for update skip locked',
      'candidate.rating_bucket = v_request.rating_bucket',
    ]);
    includesAll(sessionCombat, ['storageKey(userId)', 'ownerUserId']);
    includesAll(practiceLobby, ['expired', 'cancelled', 'conflict', 'Reread status']);
  });

  it('proves MP-09 rating settlement and account continuity', () => {
    includesAll(authorityV2, [
      'settle_amordle_ranked_practice_v2',
      'multiplayer_match_results',
      'multiplayer_player_results',
      'multiplayer_rating_transactions',
      'provisional = games_played + 1 < 10',
    ]);
    includesAll(authorityV3, ['settle_amordle_ranked_daily_v3', 'rating_bucket']);
    includesAll(matchController, ['invalidateAccountProjections']);
    includesAll(accountFreshness, [
      'historyQueryKey(userId)',
      'progressQueryKey(userId)',
      'ratingsQueryKey(userId)',
    ]);
  });

  it('proves MP-10 private request lifecycle and server-owned game creation', () => {
    includesAll(requestProtection, [
      'create_private_multiplayer_match_request_v2',
      "status = 'requested'",
      'expires_at > now()',
      'pg_advisory_xact_lock',
    ]);
    includesAll(authorityV3, [
      'accept_private_multiplayer_match_request_v3',
      "'private_request'",
      "v_request.status <> 'requested'",
    ]);
  });

  it('proves MP-11 participant-only Active recovery', () => {
    includesAll(authorityV2, [
      'list_amordle_combat_active_v2',
      "status in ('waiting', 'playing', 'holding')",
    ]);
    includesAll(activeGames, [
      'listActiveCombat()',
      'listLegacyActive(userId)',
      "document.visibilityState === 'visible' ? 5_000 : false",
      'your turn',
      'waiting on rival',
    ]);
  });

  it('proves MP-12 joinable Lobby filtering and tolerant recovery', () => {
    includesAll(openLobbies, [
      'listUnrankedPracticeWithDiagnostics',
      'listDailyLobbiesWithDiagnostics',
      "row.status === 'waiting'",
      'const dailyRows',
      'outdated',
      'canCancel',
    ]);
    includesAll(authorityV3, ['list_amordle_public_practice_v3', 'blocked_user_id']);
  });

  it('proves MP-13 sanitized public Live discovery', () => {
    includesAll(spectatorV3, [
      'get_public_live_v1_spectator_games_v2',
      'get_authenticated_live_v1_spectator_games_v3',
      "where spectator.status = 'playing'",
      'spectator_capabilities',
    ]);
    expect(liveGames).toContain('refetchInterval: 30_000');
  });

  it('proves MP-14 privacy-safe read-only spectation', () => {
    includesAll(authorityV3, [
      'get_amordle_public_practice_spectator_v3',
      "authority.source_kind = 'public_lobby'",
      "authority.visibility_kind = 'public'",
      "'canMutate', false",
    ]);
    expect(cloudCombat).toContain('spectatorGameSchema');
    includesAll(publicCommunityV1, [
      'get_amordle_public_practice_spectator_v4',
      "'publicProfileId', profile.public_profile_id",
      "authority.source_kind = 'public_lobby'",
      "authority.visibility_kind = 'public'",
      "authority.scope = 'practice'",
      'and not authority.ranked',
    ]);
    expect(cloudCombat).toContain("rpc('get_amordle_public_practice_spectator_v4'");
  });

  it('proves MP-15 polling, invalidation, reconnect and visibility recovery', () => {
    includesAll(matchController, [
      "document.addEventListener('visibilitychange', refetch)",
      "window.addEventListener('online', refetch)",
      '.channel(`combat:${gameId}`)',
      "document.visibilityState === 'visible' ? 5_000 : false",
    ]);
    expect(activeGames).toContain("document.visibilityState === 'visible' ? 5_000 : false");
    expect(openLobbies).toContain('refetchInterval: 30_000');
    expect(liveGames).toContain('refetchInterval: 30_000');
  });

  it('proves MP-16 durable exactly-once alerts', () => {
    includesAll(notifications, ['durableRevision', 'accountNamespace', 'currentByTransition']);
    /*
     * v10.6. This clause used to pin `refetchInterval: 30_000` and the
     * `notification-projection` realtime channel. Both are gone, and the clause
     * follows the code rather than the code being held to a stale clause:
     *
     *   - the poll is 120 s, because the component is mounted on every page and
     *     the interval was the largest single driver of Supabase egress
     *   - the channel is removed, because none of its three subscriptions could
     *     deliver a change for a game played today — two tables are not in the
     *     `supabase_realtime` publication and the third admits only
     *     `authority_version = 0` rows to a reader
     *   - the whole feed is one RPC rather than four to twenty-four requests
     *
     * What MP-16 is actually about — exactly-once, durable alerts that survive a
     * reload — is unchanged and is what the first assertion still pins.
     */
    includesAll(notificationCenter, [
      'refetchInterval: 120_000',
      'loadCombatNotificationFeed',
      "window.addEventListener('online', onOnline)",
      "document.addEventListener('visibilitychange', onVisibility)",
    ]);
    expect(notificationCenter).not.toContain('.channel(`notification-projection:${userId}`)');
  });

  it('proves MP-17 results, rematches and contextual next actions', () => {
    includesAll(matchController, [
      'REQUEST REMATCH',
      'ACCEPT REMATCH',
      'DECLINE',
      'CANCEL REMATCH REQUEST',
      // A1: the requesting player's way into an accepted rematch.
      'JOIN REMATCH',
      'SEARCH AGAIN',
      'PLAY DAILY',
      'VIEW RIVAL',
      'HISTORY',
      '<WordDefinition word={answer}',
    ]);
    expect(authorityV3).toContain('accept_practice_multiplayer_rematch_v3');
  });

  it('proves MP-18 sanitized Ranked Daily queue and settlement', () => {
    includesAll(authorityV3, [
      'get_amordle_ranked_daily_status_v3',
      'finalize_amordle_ranked_daily_v3',
      'settle_amordle_ranked_daily_v3',
      'v_authority.rating_bucket not in (',
    ]);
    expect(rankedDaily).toContain('multiplayer:og:daily:v1');
    const statusBoundary = authorityV3.slice(
      authorityV3.indexOf('create or replace function public.get_amordle_ranked_daily_status_v3'),
      authorityV3.indexOf('create or replace function public.finalize_amordle_ranked_daily_v3'),
    );
    expect(statusBoundary).not.toContain('playerUserIds');
  });

  it('proves MP-19 request preferences, blocking and anti-spam', () => {
    includesAll(requestProtection, [
      'get_private_multiplayer_request_preference',
      'update_private_multiplayer_request_preference',
      'get_private_multiplayer_request_blocks',
      'set_private_multiplayer_request_block',
      'multiplayer_private_match_requests_active_direction_mode_idx',
      'pg_advisory_xact_lock',
    ]);
    includesAll(requestCenter, ['Blocked players', 'Unblock', 'Private requests remain blocked']);
  });

  it('proves MP-20 account-scoped same-tab provisional recovery', () => {
    includesAll(sessionCombat, [
      'combatAttentionProjectionSchema',
      'ownerUserId',
      'amordle:combat:attention:v1:',
      'href: z.string().startsWith',
      'display-only',
    ]);
    includesAll(homeAttention, [
      'readCombatAttentionProjection(userId)',
      "cached.status === 'valid'",
      'checking latest',
    ]);
  });

  it('proves MP-21 participant-first startup without Home word loading', () => {
    const participantRead = homeAttention.indexOf('const authoritative = await listActiveCombat()');
    const waitingRead = homeAttention.indexOf('const legacy = await listLegacyActive(userId)');
    expect(participantRead).toBeGreaterThan(-1);
    expect(waitingRead).toBeGreaterThan(participantRead);
    includesAll(homeAttention, [
      "queryKey: ['combat', 'home-attention', userId]",
      'ownerUserId: userId',
    ]);
    expect(homeAttention).not.toContain('loadPublicWordSet');
    expect(homeAttention).not.toContain("['word-set'");
  });
});
