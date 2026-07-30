'use client';

import { z } from 'zod';
import { hardModeViolationForEvidence, playableAttemptBudget, scoreGuess } from '@/domain/game';
import type { Database, Json } from '@/types/database';
import { getBrowserSupabase } from './browser';
import { parseServiceList, parseServiceResult, ServiceError, throwServiceError } from './shared';

const tileSchema = z
  .object({
    letter: z.string().length(1),
    state: z.enum(['correct', 'present', 'absent']),
  })
  .strict();

const moveSchema = z
  .object({
    sequenceNo: z.number().int().nonnegative(),
    actionId: z.string(),
    type: z.enum(['guess', 'advance', 'cancel', 'forfeit']),
    seat: z.enum(['player-one', 'player-two']),
    puzzleIndex: z.number().int().nonnegative(),
    guess: z.string().optional(),
    tiles: z.array(tileSchema),
    pointsAwarded: z.number().int(),
    createdAt: z.string(),
  })
  .strict();

const seededRowSchema = z
  .object({
    sourcePuzzleIndex: z.number().int().nonnegative(),
    label: z.string(),
    guess: z.string(),
    tiles: z.array(tileSchema),
    consumesAttemptSlot: z.literal(true),
    countsAsPlayerGuess: z.literal(false),
    awardsPoints: z.literal(false),
  })
  .strict();

const playerSchema = z
  .object({
    seat: z.enum(['player-one', 'player-two']),
    publicProfileId: z.string().optional(),
    displayName: z.string(),
    avatarUrl: z.string().optional(),
    accentColor: z.string().optional(),
    initials: z.string().optional(),
  })
  .strict();

const participantStateSchema = z
  .object({
    points: z.number().int(),
    attemptsThisPuzzle: z.number().int().nonnegative(),
    puzzlesSolved: z.number().int().nonnegative(),
    timeRemainingMs: z.number().int().nullable(),
  })
  .strict();

export const combatProjectionSchema = z
  .object({
    schemaVersion: z.literal(2),
    authorityVersion: z.literal(2),
    id: z.string(),
    scope: z.enum(['practice', 'daily']),
    mode: z.enum(['og', 'go']),
    dailyDateKey: z.string().optional(),
    sourceKind: z.string(),
    visibilityKind: z.string(),
    wordLength: z.number().int().min(2).max(35),
    difficulty: z.enum(['casual', 'standard', 'expert']),
    hardMode: z.boolean(),
    goPuzzleCount: z.number().int().nullable().optional(),
    timeLimitMs: z.number().int().nullable().optional(),
    ranked: z.boolean(),
    ratingBucket: z.string().optional(),
    status: z.enum(['waiting', 'playing', 'holding', 'completed', 'cancelled']),
    version: z.number().int().nonnegative(),
    moveCount: z.number().int().nonnegative(),
    serverNow: z.string(),
    createdAt: z.string(),
    startedAt: z.string().optional(),
    updatedAt: z.string(),
    endedAt: z.string().optional(),
    turnStartedAt: z.string().optional(),
    currentTurn: z.enum(['player-one', 'player-two']).optional(),
    currentPuzzleIndex: z.number().int().nonnegative(),
    attemptBudget: z.number().int().positive(),
    holdUntil: z.string().optional(),
    viewerSeat: z.enum(['player-one', 'player-two']),
    players: z.array(playerSchema),
    moves: z.array(moveSchema),
    seededRows: z.array(seededRowSchema),
    playerState: z
      .object({
        'player-one': participantStateSchema,
        'player-two': participantStateSchema,
      })
      .strict(),
    capabilities: z
      .object({
        canJoin: z.boolean(),
        canSubmitGuess: z.boolean(),
        canAdvance: z.boolean(),
        canCancel: z.boolean(),
        canForfeit: z.boolean(),
        canSettleRating: z.boolean(),
      })
      .strict(),
    outcome: z
      .object({
        terminal: z.boolean(),
        reason: z.string().optional(),
        winnerSeat: z.enum(['player-one', 'player-two']).optional(),
        forfeitedSeat: z.enum(['player-one', 'player-two']).optional(),
        timedOutSeat: z.enum(['player-one', 'player-two']).optional(),
      })
      .strict(),
    revealedAnswers: z.array(z.string()).optional(),
    idempotent: z.boolean().optional(),
  })
  .strict();

export const dailyLobbySchema = z
  .object({
    schemaVersion: z.literal(2),
    authorityVersion: z.literal(2),
    id: z.string(),
    scope: z.literal('daily'),
    mode: z.enum(['og', 'go']),
    dailyDateKey: z.string(),
    status: z.literal('waiting'),
    version: z.number().int().nonnegative(),
    moveCount: z.number().int().nonnegative(),
    wordLength: z.literal(5),
    difficulty: z.literal('expert'),
    hardMode: z.boolean(),
    goPuzzleCount: z.number().int().optional(),
    ranked: z.literal(false),
    viewerSeat: z.literal('player-one').optional(),
    owner: z
      .object({
        publicProfileId: z.string().optional(),
        displayName: z.string(),
        avatarUrl: z.string().optional(),
        accentColor: z.string().optional(),
      })
      .strict(),
    createdAt: z.string(),
    updatedAt: z.string(),
    capabilities: z
      .object({
        canJoin: z.boolean(),
        canCancel: z.boolean(),
      })
      .strict(),
  })
  .strict();

const queueStatusSchema = z
  .object({
    schemaVersion: z.literal(2),
    requestId: z.string(),
    status: z.enum(['queued', 'matched', 'expired', 'cancelled']),
    matchedGameId: z.string().nullable().optional(),
    queuedAt: z.string().nullable().optional(),
    matchedAt: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    idempotent: z.boolean().optional(),
  })
  .strict();

const rankedPracticeSettlementSchema = z
  .object({
    schemaVersion: z.literal(2),
    matchResultId: z.string(),
    bucket: z.string(),
    outcome: z.enum(['win', 'loss', 'draw']),
    oldRating: z.number().int(),
    newRating: z.number().int(),
    ratingDelta: z.number().int(),
    idempotent: z.boolean(),
  })
  .strict();

export type CombatProjection = z.infer<typeof combatProjectionSchema>;
export type DailyLobby = z.infer<typeof dailyLobbySchema>;
export type RankedPracticeSettlement = z.infer<typeof rankedPracticeSettlementSchema>;

const rankedDailyMoveSchema = z
  .object({
    id: z.string(),
    createdAt: z.string(),
    guess: z.string(),
    playerId: z.enum(['player-one', 'player-two']),
    puzzleIndex: z.number().int().nonnegative(),
    tiles: z.array(tileSchema),
  })
  .strict();

export const rankedDailyProjectionSchema = z
  .object({
    id: z.string(),
    scope: z.literal('daily'),
    mode: z.enum(['og', 'go']),
    dailyDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ranked: z.literal(true),
    ratingBucket: z.enum(['multiplayer:og:daily:v1', 'multiplayer:go:daily:v1']),
    wordLength: z.literal(5),
    difficulty: z.literal('expert'),
    hardMode: z.boolean(),
    goPuzzleCount: z.literal(5).nullable(),
    timeLimitMs: z.null().optional(),
    customGameCode: z.null().optional(),
    playerUserIds: z
      .object({
        'player-one': z.string().uuid(),
        'player-two': z.string().uuid(),
      })
      .strict(),
    matchmakingRequestId: z.string(),
    status: z.enum(['playing', 'won', 'lost', 'cancelled']),
    currentTurn: z.enum(['player-one', 'player-two']),
    moves: z.array(rankedDailyMoveSchema),
    authorityVersion: z.number().int().nonnegative(),
    createdAt: z.string(),
    updatedAt: z.string(),
    deadlineAt: z.string(),
    endedAt: z.string().optional(),
    winnerId: z.enum(['player-one', 'player-two']).optional(),
    forfeitedPlayerId: z.enum(['player-one', 'player-two']).optional(),
  })
  .strict();

export type RankedDailyProjection = z.infer<typeof rankedDailyProjectionSchema>;

const rankedDailyQueueSchema = z
  .object({
    request_id: z.string(),
    request_status: z.enum(['queued', 'matched', 'cancelled', 'expired']),
    rating_bucket: z.string(),
    hard_mode: z.boolean(),
    word_length: z.literal(5),
    mode: z.enum(['og', 'go']),
    scope: z.literal('daily'),
    daily_date_key: z.string(),
    queued_at: z.string(),
    expires_at: z.string(),
  })
  .strict();

const rankedDailyStatusSchema = z
  .object({
    request_id: z.string(),
    request_status: z.enum(['queued', 'matched', 'cancelled', 'expired']),
    rating_bucket: z.string(),
    hard_mode: z.boolean(),
    word_length: z.literal(5),
    mode: z.enum(['og', 'go']),
    scope: z.literal('daily'),
    daily_date_key: z.string(),
    queued_at: z.string(),
    matched_at: z.string().nullable(),
    matched_game_id: z.string().nullable(),
    opponent_request_id: z.string().nullable(),
    player_one_user_id: z.string().uuid().nullable(),
    player_two_user_id: z.string().uuid().nullable(),
    time_limit_ms: z.null(),
    viewer_seat: z.enum(['player-one', 'player-two']).nullable(),
  })
  .strict();

const legacyMoveSchema = z
  .object({
    id: z.string(),
    seat: z.enum(['player-one', 'player-two']),
    playerId: z.enum(['player-one', 'player-two']).optional(),
    puzzleIndex: z.number().int().nonnegative().optional(),
    guess: z.string(),
    tiles: z.array(tileSchema),
    acceptedAt: z.string(),
  })
  .strict();

export const legacyProjectionSchema = z
  .object({
    schemaVersion: z.literal(1),
    authorityVersion: z.literal(0),
    id: z.string(),
    scope: z.literal('practice').optional(),
    ranked: z.literal(false).optional(),
    ratingBucket: z.null().optional(),
    matchmakingRequestId: z.null().optional(),
    customGameCode: z.null().optional(),
    dailyDateKey: z.null().optional(),
    timeLimitMs: z.number().int().nullable().optional(),
    mode: z.enum(['og', 'go']),
    wordLength: z.number().int().min(2).max(35),
    difficulty: z.enum(['casual', 'standard', 'expert']),
    hardMode: z.boolean(),
    goPuzzleCount: z.number().int().nullable(),
    status: z.enum(['waiting', 'playing', 'holding', 'won', 'lost', 'cancelled']),
    currentTurn: z.enum(['player-one', 'player-two']),
    answer: z.string(),
    currentPuzzleIndex: z.number().int().nonnegative().optional(),
    holdUntil: z.string().nullable().optional(),
    moves: z.array(legacyMoveSchema),
    version: z.number().int().nonnegative(),
    winnerSeat: z.enum(['player-one', 'player-two']).optional(),
    playerUserIds: z
      .object({
        'player-one': z.string().uuid(),
        'player-two': z.string().uuid(),
      })
      .strict()
      .optional(),
  })
  .strict();

const legacyRowSchema = z
  .object({
    id: z.string(),
    scope: z.literal('practice'),
    mode: z.enum(['og', 'go']),
    status: z.string(),
    current_turn: z.enum(['player-one', 'player-two']),
    word_length: z.number().int(),
    difficulty: z.string(),
    go_puzzle_count: z.number().int().nullable(),
    host_user_id: z.string().uuid(),
    player_one_user_id: z.string().uuid().nullable(),
    player_two_user_id: z.string().uuid().nullable(),
    ranked: z.literal(false),
    projection: legacyProjectionSchema,
    state_version: z.number().int().nonnegative(),
    move_count: z.number().int().nonnegative(),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .strict();

export type LegacyProjection = z.infer<typeof legacyProjectionSchema>;
export type LegacyRow = z.infer<typeof legacyRowSchema>;

const publicPracticeLobbySchema = z
  .object({
    id: z.string(),
    scope: z.literal('practice'),
    mode: z.enum(['og', 'go']),
    status: z.literal('waiting'),
    word_length: z.number().int().min(2).max(35),
    difficulty: z.enum(['casual', 'standard', 'expert']),
    go_puzzle_count: z.number().int().nullable(),
    ranked: z.literal(false),
    created_at: z.string(),
    updated_at: z.string(),
    hard_mode: z.preprocess((value) => value === true || value === 'true', z.boolean()),
    projection_status: z.literal('waiting'),
  })
  .strict();

export type PublicPracticeLobby = z.infer<typeof publicPracticeLobbySchema> & {
  canCancel: boolean;
};

function client() {
  const value = getBrowserSupabase();
  if (!value) throw new ServiceError('COMBAT services are unavailable.', 'UNAVAILABLE');
  return value;
}

async function jsonRpc<Name extends keyof Database['public']['Functions']>(
  name: Name,
  args: Database['public']['Functions'][Name]['Args'],
): Promise<Json | Json[]> {
  const { data, error } = await client().rpc(name, args);
  if (error) throwServiceError(error);
  return data as Json | Json[];
}

export async function createRankedPractice(input: {
  mode: 'og' | 'go';
  wordLength: number;
  difficulty: 'casual' | 'standard' | 'expert';
  hardMode: boolean;
  goPuzzleCount: 5 | 7 | 10 | null;
  timeLimitMs: number | null;
  creationKey: string;
}) {
  return parseServiceResult(
    queueStatusSchema,
    await jsonRpc('create_amordle_ranked_practice_request_v2', {
      p_mode: input.mode,
      p_word_length: input.wordLength,
      p_difficulty: input.difficulty,
      p_hard_mode: input.hardMode,
      // The generated type cannot express SQL NULL, while the RPC requires it for OG.
      p_go_puzzle_count: input.goPuzzleCount as unknown as number,
      p_time_limit_ms: input.timeLimitMs as unknown as number,
      p_creation_key: input.creationKey,
    }),
  );
}

export async function claimRankedPractice(requestId: string, actionId: string) {
  return parseServiceResult(
    queueStatusSchema,
    await jsonRpc('claim_amordle_ranked_practice_v2', {
      p_request_id: requestId,
      p_action_id: actionId,
    }),
  );
}

export async function getRankedPracticeStatus(requestId: string) {
  return parseServiceResult(
    queueStatusSchema,
    await jsonRpc('get_amordle_ranked_practice_status_v2', {
      p_request_id: requestId,
    }),
  );
}

export async function cancelRankedPractice(requestId: string, actionId: string) {
  return parseServiceResult(
    queueStatusSchema,
    await jsonRpc('cancel_amordle_ranked_practice_v2', {
      p_request_id: requestId,
      p_action_id: actionId,
    }),
  );
}

export async function finalizeRankedPractice(requestId: string, gameId: string, actionId: string) {
  return parseServiceResult(
    combatProjectionSchema,
    await jsonRpc('finalize_amordle_ranked_practice_v2', {
      p_request_id: requestId,
      p_game_id: gameId,
      p_action_id: actionId,
    }),
  );
}

export async function createDailyLobby(mode: 'og' | 'go', hardMode: boolean, creationKey: string) {
  return parseServiceResult(
    combatProjectionSchema,
    await jsonRpc('create_amordle_unranked_daily_lobby_v2', {
      p_mode: mode,
      p_hard_mode: hardMode,
      p_creation_key: creationKey,
    }),
  );
}

export async function listDailyLobbies(mode?: 'og' | 'go') {
  return (await listDailyLobbiesWithDiagnostics(mode)).items;
}

export async function listDailyLobbiesWithDiagnostics(mode?: 'og' | 'go') {
  return parseServiceList(
    dailyLobbySchema,
    await jsonRpc('list_amordle_unranked_daily_lobbies_v2', {
      p_limit: 50,
      ...(mode === undefined ? {} : { p_mode: mode }),
    }),
  );
}

export async function joinDailyLobby(gameId: string, version: number, actionId: string) {
  return parseServiceResult(
    combatProjectionSchema,
    await jsonRpc('join_amordle_unranked_daily_lobby_v2', {
      p_game_id: gameId,
      p_expected_version: version,
      p_action_id: actionId,
    }),
  );
}

export async function getCombatGame(gameId: string) {
  return parseServiceResult(
    combatProjectionSchema,
    await jsonRpc('get_amordle_combat_game_v2', { p_game_id: gameId }),
  );
}

export async function listActiveCombat() {
  return parseServiceList(
    combatProjectionSchema,
    await jsonRpc('list_amordle_combat_active_v2', { p_limit: 100 }),
  ).items;
}

export async function saveCombatCommand(input: {
  gameId: string;
  actionId: string;
  expectedVersion: number;
  expectedMoveCount: number;
  command: 'guess' | 'advance' | 'cancel' | 'forfeit';
  guess?: string;
}) {
  return parseServiceResult(
    combatProjectionSchema,
    await jsonRpc('save_amordle_combat_command_v2', {
      p_game_id: input.gameId,
      p_action_id: input.actionId,
      p_expected_version: input.expectedVersion,
      p_expected_move_count: input.expectedMoveCount,
      p_command: input.command,
      ...(input.guess === undefined ? {} : { p_guess: input.guess }),
    }),
  );
}

export async function settleRankedPractice(gameId: string, actionId: string) {
  return parseServiceResult(
    rankedPracticeSettlementSchema,
    await jsonRpc('settle_amordle_ranked_practice_v2', {
      p_game_id: gameId,
      p_action_id: actionId,
    }),
  );
}

export async function createRankedDaily(input: {
  mode: 'og' | 'go';
  hardMode: boolean;
  dailyDateKey: string;
  idempotencyKey: string;
}) {
  const { data, error } = await client().rpc('create_ranked_async_matchmaking_request_v2', {
    p_mode: input.mode,
    p_word_length: 5,
    p_hard_mode: input.hardMode,
    p_idempotency_key: input.idempotencyKey,
    p_scope: 'daily',
    p_daily_date_key: input.dailyDateKey,
    p_expires_at: `${input.dailyDateKey}T23:59:59.999Z`,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(rankedDailyQueueSchema, data?.[0]);
}

export async function getRankedDailyStatus(requestId: string) {
  const { data, error } = await client().rpc('get_ranked_async_matchmaking_status_v2', {
    p_request_id: requestId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(rankedDailyStatusSchema, data?.[0]);
}

export async function claimRankedDaily(requestId: string, matchedGameId: string) {
  const { data, error } = await client().rpc('claim_ranked_async_matchmaking_pair', {
    p_request_id: requestId,
    p_matched_game_id: matchedGameId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(
    z
      .object({
        matched_game_id: z.string().nullable(),
        opponent_request_id: z.string().nullable(),
        request_id: z.string(),
        request_status: z.enum(['queued', 'matched']),
      })
      .strict(),
    data?.[0],
  );
}

export async function cancelRankedDaily(requestId: string) {
  const { data, error } = await client().rpc('cancel_ranked_async_matchmaking_request', {
    p_request_id: requestId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(
    z
      .object({
        request_id: z.string(),
        request_status: z.enum(['cancelled', 'expired']),
      })
      .strict(),
    data?.[0],
  );
}

export async function finalizeRankedDaily(
  requestId: string,
  matchedGameId: string,
  idempotencyKey: string,
) {
  const status = await getRankedDailyStatus(requestId);
  if (
    status.request_status !== 'matched' ||
    !status.player_one_user_id ||
    !status.player_two_user_id
  ) {
    throw new ServiceError('The ranked Daily pair is not ready.', 'NOT_READY');
  }
  const projection = {
    id: matchedGameId,
    mode: status.mode,
    scope: 'daily',
    dailyDateKey: status.daily_date_key,
    ranked: true,
    ratingBucket: `multiplayer:${status.mode}:daily:v1`,
    wordLength: 5,
    difficulty: 'expert',
    hardMode: status.hard_mode,
    timeLimitMs: null,
    customGameCode: null,
    goPuzzleCount: status.mode === 'go' ? 5 : null,
    playerUserIds: {
      'player-one': status.player_one_user_id,
      'player-two': status.player_two_user_id,
    },
    moves: [],
  };
  const { data, error } = await client().rpc('finalize_ranked_async_matchmaking_game_v2', {
    p_request_id: requestId,
    p_matched_game_id: matchedGameId,
    p_game_projection: projection,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(
    z
      .object({
        game_id: z.string(),
        request_id: z.string(),
        opponent_request_id: z.string(),
        request_status: z.literal('matched'),
        created: z.boolean(),
        idempotent: z.boolean(),
      })
      .strict(),
    data?.[0],
  );
}

export async function getRankedDailyGame(gameId: string) {
  const { data, error } = await client()
    .from('async_multiplayer_games')
    .select('projection')
    .eq('id', gameId)
    .eq('scope', 'daily')
    .eq('ranked', true)
    .maybeSingle();
  if (error) throwServiceError(error);
  if (!data) return null;
  return parseServiceResult(rankedDailyProjectionSchema, data.projection);
}

export async function saveRankedDailyAction(input: {
  gameId: string;
  expectedVersion: number;
  expectedMoveCount: number;
  actionId: string;
  guess?: string;
  forfeit?: boolean;
}) {
  const { data, error } = await client().rpc('save_ranked_daily_async_multiplayer_action', {
    p_game_id: input.gameId,
    p_expected_version: input.expectedVersion,
    p_expected_move_count: input.expectedMoveCount,
    p_action_id: input.actionId,
    p_forfeit: input.forfeit ?? false,
    ...(input.guess === undefined ? {} : { p_guess: input.guess }),
  });
  if (error) throwServiceError(error);
  return parseServiceResult(rankedDailyProjectionSchema, data?.[0]?.game_projection);
}

export async function settleRankedDaily(gameId: string, idempotencyKey: string) {
  const { data, error } = await client().rpc('settle_ranked_async_multiplayer_match_v2', {
    p_game_id: gameId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(z.array(z.unknown()), data);
}

const legacySelect =
  'id,scope,mode,status,current_turn,word_length,difficulty,go_puzzle_count,host_user_id,player_one_user_id,player_two_user_id,ranked,projection,state_version,move_count,created_at,updated_at';

export async function createUnrankedPractice(input: {
  userId: string;
  mode: 'og' | 'go';
  wordLength: number;
  difficulty: 'casual' | 'standard' | 'expert';
  hardMode: boolean;
  goPuzzleCount: 5 | 7 | 10 | null;
  candidates: readonly string[];
}) {
  const id = `practice-${crypto.randomUUID()}`;
  const answer = selectLegacyAnswer(id, 0, input.candidates);
  const projection = legacyProjectionSchema.parse({
    schemaVersion: 1,
    authorityVersion: 0,
    id,
    scope: 'practice',
    ranked: false,
    ratingBucket: null,
    matchmakingRequestId: null,
    customGameCode: null,
    dailyDateKey: null,
    timeLimitMs: null,
    mode: input.mode,
    wordLength: input.wordLength,
    difficulty: input.difficulty,
    hardMode: input.hardMode,
    goPuzzleCount: input.goPuzzleCount,
    status: 'waiting',
    currentTurn: 'player-one',
    answer,
    currentPuzzleIndex: 0,
    holdUntil: null,
    moves: [],
    version: 0,
  });
  const { data, error } = await client()
    .from('async_multiplayer_games')
    .insert({
      id,
      scope: 'practice',
      mode: input.mode,
      status: 'waiting',
      current_turn: 'player-one',
      word_length: input.wordLength,
      difficulty: input.difficulty,
      go_puzzle_count: input.goPuzzleCount,
      host_user_id: input.userId,
      player_one_user_id: input.userId,
      player_two_user_id: null,
      ranked: false,
      authority_version: 0,
      source_kind: 'public_lobby',
      visibility_kind: 'public',
      state_version: 0,
      move_count: 0,
      projection,
    })
    .select(legacySelect)
    .single();
  if (error) throwServiceError(error);
  return parseServiceResult(legacyRowSchema, data);
}

export async function listUnrankedPractice(userId: string) {
  return (await listUnrankedPracticeWithDiagnostics(userId)).items;
}

export async function listUnrankedPracticeWithDiagnostics(userId: string) {
  const [publicRows, ownedRows] = await Promise.all([
    client()
      .from('async_multiplayer_games')
      .select(
        'id,scope,mode,status,word_length,difficulty,go_puzzle_count,ranked,created_at,updated_at,hard_mode:projection->>hardMode,projection_status:projection->>status',
      )
      .eq('authority_version', 0)
      .eq('scope', 'practice')
      .eq('ranked', false)
      .eq('status', 'waiting')
      .is('player_two_user_id', null)
      .order('created_at', { ascending: true })
      .limit(50),
    client()
      .from('async_multiplayer_games')
      .select('id')
      .eq('authority_version', 0)
      .eq('scope', 'practice')
      .eq('ranked', false)
      .eq('status', 'waiting')
      .eq('host_user_id', userId)
      .is('player_two_user_id', null)
      .limit(50),
  ]);
  if (publicRows.error) throwServiceError(publicRows.error);
  if (ownedRows.error) throwServiceError(ownedRows.error);
  const parsed = parseServiceList(publicPracticeLobbySchema, publicRows.data);
  const owned = new Set((ownedRows.data ?? []).map((row) => row.id));
  return {
    items: parsed.items.map((row) => ({ ...row, canCancel: owned.has(row.id) })),
    skipped: parsed.skipped,
  };
}

export async function getLegacyPractice(gameId: string) {
  const { data, error } = await client()
    .from('async_multiplayer_games')
    .select(legacySelect)
    .eq('id', gameId)
    .eq('authority_version', 0)
    .maybeSingle();
  if (error) throwServiceError(error);
  return parseServiceResult(legacyRowSchema.nullable(), data);
}

export async function listLegacyActive(userId: string) {
  const { data, error } = await client()
    .from('async_multiplayer_games')
    .select(legacySelect)
    .eq('authority_version', 0)
    .eq('scope', 'practice')
    .eq('ranked', false)
    .in('status', ['waiting', 'playing', 'holding'])
    .or(`player_one_user_id.eq.${userId},player_two_user_id.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throwServiceError(error);
  return parseServiceList(legacyRowSchema, data).items;
}

export async function listLegacyRecent(userId: string) {
  const { data, error } = await client()
    .from('async_multiplayer_games')
    .select(legacySelect)
    .eq('authority_version', 0)
    .eq('scope', 'practice')
    .eq('ranked', false)
    .in('status', ['waiting', 'playing', 'holding', 'won', 'lost', 'cancelled'])
    .or(`player_one_user_id.eq.${userId},player_two_user_id.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throwServiceError(error);
  return parseServiceList(legacyRowSchema, data).items;
}

export async function cancelUnrankedPractice(gameId: string, userId: string) {
  const current = await getLegacyPractice(gameId);
  if (!current) throw new ServiceError('That match no longer exists.', 'NOT_FOUND');
  if (current.player_one_user_id !== userId) {
    throw new ServiceError('Only the player who opened this match can cancel it.', 'FORBIDDEN');
  }
  if (current.status !== 'waiting' || current.player_two_user_id !== null) {
    throw new ServiceError('That match is no longer waiting for a player.', 'TERMINAL');
  }
  const nextVersion = current.state_version + 1;
  const projection = legacyProjectionSchema.parse({
    ...current.projection,
    status: 'cancelled',
    version: nextVersion,
  });
  const timestamp = new Date().toISOString();
  const { data, error } = await client()
    .from('async_multiplayer_games')
    .update({
      status: 'cancelled',
      projection,
      state_version: nextVersion,
      ended_at: timestamp,
      updated_at: timestamp,
    })
    .eq('id', gameId)
    .eq('player_one_user_id', userId)
    .eq('state_version', current.state_version)
    .eq('status', 'waiting')
    .is('player_two_user_id', null)
    .select(legacySelect)
    .single();
  if (error) throwServiceError(error);
  return parseServiceResult(legacyRowSchema, data);
}

export async function joinUnrankedPractice(gameId: string, userId: string) {
  const current = await getLegacyPractice(gameId);
  if (!current) throw new ServiceError('That match no longer exists.', 'NOT_FOUND');
  if (current.player_one_user_id === userId) return current;
  if (current.player_two_user_id && current.player_two_user_id !== userId) {
    throw new ServiceError('That match already has two players.', 'TERMINAL');
  }
  const nextProjection = legacyProjectionSchema.parse({
    ...current.projection,
    status: 'playing',
    version: current.state_version + 1,
  });
  const { data, error } = await client()
    .from('async_multiplayer_games')
    .update({
      player_two_user_id: userId,
      status: 'playing',
      projection: nextProjection,
      state_version: current.state_version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameId)
    .eq('state_version', current.state_version)
    .is('player_two_user_id', null)
    .select(legacySelect)
    .single();
  if (error) throwServiceError(error);
  return parseServiceResult(legacyRowSchema, data);
}

function selectLegacyAnswer(
  gameId: string,
  puzzleIndex: number,
  candidates: readonly string[],
): string {
  const sorted = [...new Set(candidates)].sort();
  if (!sorted.length) throw new ServiceError('No answer is available.', 'UNAVAILABLE');
  let hash = 0x811c9dc5;
  for (const character of `${gameId}:${puzzleIndex}`) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return sorted[(hash >>> 0) % sorted.length]!;
}

export async function saveLegacyGuess(input: {
  gameId: string;
  userId: string;
  guess: string;
  sanctionedWords: ReadonlySet<string>;
  actionId: string;
}) {
  const current = await getLegacyPractice(input.gameId);
  if (!current) throw new ServiceError('That match no longer exists.', 'NOT_FOUND');
  const projection = current.projection;
  if (projection.status !== 'playing') {
    throw new ServiceError('That match is not accepting guesses.', 'TERMINAL');
  }
  const seat =
    current.player_one_user_id === input.userId
      ? 'player-one'
      : current.player_two_user_id === input.userId
        ? 'player-two'
        : null;
  if (!seat) throw new ServiceError('Only participants can play this match.', 'FORBIDDEN');
  if (seat !== projection.currentTurn) {
    throw new ServiceError('It is the other player’s turn.', 'TURN_CONFLICT');
  }
  const guess = input.guess.toLowerCase();
  if (guess.length !== projection.wordLength || !/^[a-z]+$/.test(guess)) {
    throw new ServiceError(`Enter a ${projection.wordLength}-letter word.`, 'INVALID_GUESS');
  }
  if (!input.sanctionedWords.has(guess)) {
    throw new ServiceError('That word is not in this game’s list.', 'INVALID_GUESS');
  }
  const currentPuzzleIndex = projection.currentPuzzleIndex ?? 0;
  const hardViolation = hardModeViolationForEvidence({
    rows: projection.moves
      .filter((candidate) => (candidate.puzzleIndex ?? 0) === currentPuzzleIndex)
      .map((candidate) => ({ tiles: candidate.tiles })),
    enabled: projection.hardMode,
    guess,
  });
  if (hardViolation) throw new ServiceError(hardViolation, 'HARD_MODE');
  const duplicate = projection.moves.find((move) => move.id === input.actionId);
  if (duplicate) return current;
  const move = legacyMoveSchema.parse({
    id: input.actionId,
    seat,
    playerId: seat,
    puzzleIndex: currentPuzzleIndex,
    guess,
    tiles: scoreGuess(projection.answer, guess),
    acceptedAt: new Date().toISOString(),
  });
  const solved = move.tiles.every((tile) => tile.state === 'correct');
  const finalPuzzle =
    projection.mode === 'og' || currentPuzzleIndex >= (projection.goPuzzleCount ?? 1) - 1;
  const currentMoves = projection.moves.filter(
    (candidate) => (candidate.puzzleIndex ?? 0) === currentPuzzleIndex,
  );
  const exhausted =
    currentMoves.length + 1 >=
    (projection.mode === 'go' ? playableAttemptBudget(currentPuzzleIndex) : 6);
  const nextStatus = solved ? (finalPuzzle ? 'won' : 'holding') : exhausted ? 'lost' : 'playing';
  const nextTurn = seat === 'player-one' ? 'player-two' : 'player-one';
  const nextVersion = current.state_version + 1;
  const nextProjection = legacyProjectionSchema.parse({
    ...projection,
    status: nextStatus,
    currentTurn: nextTurn,
    moves: [...projection.moves, move],
    version: nextVersion,
    holdUntil:
      nextStatus === 'holding' ? new Date(Date.parse(move.acceptedAt) + 2_000).toISOString() : null,
    ...(nextStatus === 'won' ? { winnerSeat: seat } : {}),
  });
  const { data, error } = await client()
    .from('async_multiplayer_games')
    .update({
      status: nextStatus,
      current_turn: nextTurn,
      winner_player_id: nextStatus === 'won' ? seat : null,
      ended_at: nextStatus === 'won' || nextStatus === 'lost' ? new Date().toISOString() : null,
      projection: nextProjection,
      state_version: nextVersion,
      move_count: current.move_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', current.id)
    .eq('state_version', current.state_version)
    .eq('current_turn', seat)
    .select(legacySelect)
    .single();
  if (error) throwServiceError(error);
  return parseServiceResult(legacyRowSchema, data);
}

export async function advanceLegacyGo(gameId: string, sanctionedWords: ReadonlySet<string>) {
  const current = await getLegacyPractice(gameId);
  if (!current) throw new ServiceError('That match no longer exists.', 'NOT_FOUND');
  const projection = current.projection;
  if (
    projection.status !== 'holding' ||
    !projection.holdUntil ||
    Date.parse(projection.holdUntil) > Date.now()
  ) {
    return current;
  }
  const nextPuzzleIndex = (projection.currentPuzzleIndex ?? 0) + 1;
  const nextVersion = current.state_version + 1;
  const nextProjection = legacyProjectionSchema.parse({
    ...projection,
    answer: selectLegacyAnswer(gameId, nextPuzzleIndex, [...sanctionedWords]),
    currentPuzzleIndex: nextPuzzleIndex,
    status: 'playing',
    holdUntil: null,
    version: nextVersion,
  });
  const { data, error } = await client()
    .from('async_multiplayer_games')
    .update({
      status: 'playing',
      current_turn: nextProjection.currentTurn,
      projection: nextProjection,
      state_version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameId)
    .eq('state_version', current.state_version)
    .eq('status', 'holding')
    .select(legacySelect)
    .single();
  if (error) throwServiceError(error);
  return parseServiceResult(legacyRowSchema, data);
}

const rematchRequestStatusSchema = z
  .enum(['requested', 'pending', 'accepted', 'declined', 'cancelled', 'expired'])
  .transform((status) => (status === 'requested' ? 'pending' : status));

export const rematchRequestSchema = z
  .object({
    created: z.boolean(),
    created_at: z.string(),
    created_game_id: z.string().nullable(),
    expires_at: z.string(),
    go_puzzle_count: z.number().int().nullable(),
    hard_mode: z.boolean(),
    idempotent: z.boolean(),
    mode: z.enum(['og', 'go']),
    opponent_seat: z.enum(['player-one', 'player-two']),
    request_id: z.string(),
    request_status: rematchRequestStatusSchema,
    requester_seat: z.enum(['player-one', 'player-two']),
    responded_at: z.string().nullable(),
    source_game_id: z.string(),
    time_limit_ms: z.number().int().nullable(),
    updated_at: z.string(),
    viewer_can_accept: z.boolean(),
    viewer_can_cancel: z.boolean(),
    viewer_role: z.enum(['requester', 'opponent']),
    word_length: z.number().int().min(2).max(35),
  })
  .strict();

export type RematchRequest = z.infer<typeof rematchRequestSchema>;

export async function listPracticeRematches(sourceGameId: string) {
  const { data, error } = await client().rpc('get_practice_multiplayer_rematch_requests', {
    p_source_game_id: sourceGameId,
    p_limit: 20,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(z.array(rematchRequestSchema), data);
}

export async function requestPracticeRematch(sourceGameId: string, idempotencyKey: string) {
  const { data, error } = await client().rpc('request_practice_multiplayer_rematch', {
    p_source_game_id: sourceGameId,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(rematchRequestSchema, data?.[0]);
}

export async function cancelPracticeRematch(requestId: string) {
  const { data, error } = await client().rpc('cancel_practice_multiplayer_rematch', {
    p_request_id: requestId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(rematchRequestSchema, data?.[0]);
}

export async function declinePracticeRematch(requestId: string) {
  const { data, error } = await client().rpc('decline_practice_multiplayer_rematch', {
    p_request_id: requestId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(rematchRequestSchema, data?.[0]);
}

export async function acceptPracticeRematch(
  request: RematchRequest,
  candidates: readonly string[],
  idempotencyKey: string,
) {
  const id = `practice-rematch-${crypto.randomUUID()}`;
  const answer = selectLegacyAnswer(id, 0, candidates);
  const projection = legacyProjectionSchema.parse({
    schemaVersion: 1,
    authorityVersion: 0,
    id,
    scope: 'practice',
    ranked: false,
    ratingBucket: null,
    matchmakingRequestId: null,
    customGameCode: null,
    dailyDateKey: null,
    timeLimitMs: request.time_limit_ms,
    mode: request.mode,
    wordLength: request.word_length,
    difficulty: 'standard',
    hardMode: request.hard_mode,
    goPuzzleCount: request.mode === 'go' ? request.go_puzzle_count : null,
    status: 'playing',
    currentTurn: 'player-one',
    answer,
    currentPuzzleIndex: 0,
    holdUntil: null,
    moves: [],
    version: 0,
  });
  const { data, error } = await client().rpc('accept_practice_multiplayer_rematch', {
    p_request_id: request.request_id,
    p_game_projection: projection,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(rematchRequestSchema, data?.[0]);
}

export const privateRequestSchema = z
  .object({
    created: z.boolean(),
    created_at: z.string(),
    created_game_id: z.string().nullable(),
    expires_at: z.string(),
    go_puzzle_count: z.number().int().nullable(),
    hard_mode: z.boolean(),
    idempotent: z.boolean(),
    mode: z.enum(['og', 'go']),
    opponent_accent_color: z.string().nullable(),
    opponent_avatar_url: z.string().nullable(),
    opponent_display_name: z.string().nullable(),
    opponent_flair_key: z.string().nullable(),
    opponent_identity_available: z.boolean(),
    opponent_profile_updated_at: z.string().nullable(),
    opponent_public_profile_id: z.string().nullable(),
    request_id: z.string(),
    request_status: z.string(),
    requester_accent_color: z.string().nullable(),
    requester_avatar_url: z.string().nullable(),
    requester_display_name: z.string().nullable(),
    requester_flair_key: z.string().nullable(),
    requester_identity_available: z.boolean(),
    requester_profile_updated_at: z.string().nullable(),
    requester_public_profile_id: z.string().nullable(),
    responded_at: z.string().nullable(),
    time_limit_ms: z.number().int().nullable(),
    updated_at: z.string(),
    viewer_can_accept: z.boolean(),
    viewer_can_cancel: z.boolean(),
    viewer_can_decline: z.boolean(),
    viewer_role: z.string(),
    word_length: z.number().int().min(2).max(35),
  })
  .strict();

export type PrivateRequest = z.infer<typeof privateRequestSchema>;

export async function listPrivateRequests() {
  const { data, error } = await client().rpc('get_private_multiplayer_match_requests', {
    p_limit: 100,
  });
  if (error) throwServiceError(error);
  return parseServiceList(privateRequestSchema, data).items;
}

export async function createPrivateRequest(input: {
  targetPublicProfileId: string;
  mode: 'og' | 'go';
  wordLength: number;
  hardMode: boolean;
  goPuzzleCount: 5 | 7 | 10 | null;
  idempotencyKey: string;
}) {
  const { data, error } = await client().rpc('create_private_multiplayer_match_request_v2', {
    p_target_public_profile_id: input.targetPublicProfileId,
    p_mode: input.mode,
    p_word_length: input.wordLength,
    p_hard_mode: input.hardMode,
    ...(input.goPuzzleCount === null ? {} : { p_go_puzzle_count: input.goPuzzleCount }),
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(privateRequestSchema, data?.[0]);
}

export async function acceptPrivateRequest(
  request: PrivateRequest,
  candidates: readonly string[],
  idempotencyKey: string,
) {
  const id = `private-practice-${crypto.randomUUID()}`;
  const answer = selectLegacyAnswer(id, 0, candidates);
  const projection = legacyProjectionSchema.parse({
    schemaVersion: 1,
    authorityVersion: 0,
    id,
    scope: 'practice',
    ranked: false,
    ratingBucket: null,
    matchmakingRequestId: null,
    customGameCode: null,
    dailyDateKey: null,
    timeLimitMs:
      request.time_limit_ms !== null && request.time_limit_ms > 0 ? request.time_limit_ms : null,
    mode: request.mode,
    wordLength: request.word_length,
    difficulty: 'standard',
    hardMode: request.hard_mode,
    goPuzzleCount: request.mode === 'go' ? request.go_puzzle_count : null,
    status: 'playing',
    currentTurn: 'player-one',
    answer,
    currentPuzzleIndex: 0,
    holdUntil: null,
    moves: [],
    version: 0,
  });
  const { data, error } = await client().rpc('accept_private_multiplayer_match_request_v2', {
    p_request_id: request.request_id,
    p_game_projection: projection,
    p_idempotency_key: idempotencyKey,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(privateRequestSchema, data?.[0]);
}

export async function declinePrivateRequest(requestId: string) {
  const { data, error } = await client().rpc('decline_private_multiplayer_match_request', {
    p_request_id: requestId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(privateRequestSchema, data?.[0]);
}

export async function cancelPrivateRequest(requestId: string) {
  const { data, error } = await client().rpc('cancel_private_multiplayer_match_request', {
    p_request_id: requestId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(privateRequestSchema, data?.[0]);
}

const privatePreferenceSchema = z
  .object({
    accept_private_practice_requests: z.boolean(),
    updated_at: z.string(),
  })
  .strict();

export async function getPrivateRequestPreference() {
  const { data, error } = await client().rpc('get_private_multiplayer_request_preference');
  if (error) throwServiceError(error);
  return parseServiceResult(privatePreferenceSchema, data?.[0]);
}

export async function setPrivateRequestPreference(accept: boolean) {
  const { data, error } = await client().rpc('update_private_multiplayer_request_preference', {
    p_accept: accept,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(privatePreferenceSchema, data?.[0]);
}

export async function blockPrivateRequester(publicProfileId: string, blocked: boolean) {
  const responseSchema = z
    .object({
      blocked: z.boolean(),
      public_profile_id: z.string(),
      updated_at: z.string(),
    })
    .strict();
  const { data, error } = await client().rpc('set_private_multiplayer_request_block', {
    p_target_public_profile_id: publicProfileId,
    p_blocked: blocked,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(responseSchema, data?.[0]);
}

const spectatorPlayerSchema = z
  .object({
    seat: z.enum(['player-one', 'player-two']),
    label: z.string(),
    profile: z
      .object({
        displayName: z.string().optional(),
        avatarUrl: z.string().optional(),
        accentColor: z.string().optional(),
        initials: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const spectatorMoveSchema = z
  .object({
    seat: z.enum(['player-one', 'player-two']),
    puzzleIndex: z.number().int().nonnegative(),
    guess: z.string(),
    tiles: z.array(tileSchema),
    createdAt: z.string().optional(),
  })
  .strict();

export const spectatorGameSchema = z
  .object({
    id: z.string(),
    scope: z.literal('practice'),
    mode: z.enum(['og', 'go']),
    status: z.string(),
    word_length: z.number().int().min(2).max(35),
    go_puzzle_count: z.number().int().nullable(),
    hard_mode: z.boolean(),
    ranked: z.boolean(),
    current_turn_seat: z.enum(['player-one', 'player-two']).nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    terminal_at: z.string().nullable(),
    players: z.array(spectatorPlayerSchema),
    moves: z.array(spectatorMoveSchema),
    progress: z
      .object({
        moveCount: z.number().int().nonnegative(),
        currentPuzzleIndex: z.number().int().nonnegative(),
        solvedPuzzleCount: z.number().int().nonnegative(),
        latestMoveAt: z.string().optional(),
      })
      .strict(),
    outcome: z
      .object({
        terminal: z.boolean(),
        status: z.string(),
        winnerSeat: z.enum(['player-one', 'player-two']).optional(),
        forfeitedSeat: z.enum(['player-one', 'player-two']).optional(),
        terminationReason: z.string().optional(),
        label: z.string(),
        terminalAt: z.string().optional(),
      })
      .strict(),
    spectator_capabilities: z
      .object({
        canSubmitGuess: z.literal(false),
        canForfeit: z.literal(false),
        canCancel: z.literal(false),
        canJoin: z.literal(false),
        canMutate: z.literal(false),
        canClaimDaily: z.literal(false),
        canQueue: z.literal(false),
        canSettleRating: z.literal(false),
        canNotify: z.literal(false),
      })
      .strict(),
  })
  .strict();

export type SpectatorGame = z.infer<typeof spectatorGameSchema>;

export async function listPublicLive(gameId?: string) {
  const { data, error } = await client().rpc('get_public_live_v1_spectator_games_v2', {
    p_limit: 50,
    p_terminal_window_seconds: 15,
    ...(gameId === undefined ? {} : { p_game_id: gameId }),
  });
  if (error) throwServiceError(error);
  return parseServiceResult(z.array(spectatorGameSchema), data);
}
