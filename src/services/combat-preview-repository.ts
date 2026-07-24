import { z } from 'zod';
import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import type { Json } from '../types/database';
import {
  combatSeatSchema,
  combatStatusSchema,
  parseCombatProjection,
  parseLegacyCombatSummary,
  parsePrivateRequestProjection,
  parseRankedDailyQueueProjection,
  parseRematchProjection,
  type CombatProjection,
  type LegacyCombatSummary,
  type PrivateRequestProjection,
  type RankedDailyQueueProjection,
  type RematchProjection,
} from './combat-preview-projections';
import { nullablePostgresTimestamptzSchema, postgresTimestamptzSchema } from './postgres-timestamp';
import { ServiceError, throwIfServiceError } from './service-error';

const opaqueIdSchema = z.string().trim().min(1).max(200);
const isoTimestampSchema = postgresTimestamptzSchema;
const uuidSchema = z.string().uuid();

const legacySummarySelection =
  'id,scope,mode,daily_date_key,status,current_turn,word_length,difficulty,go_puzzle_count,ranked,rating_bucket,custom_game_code,deadline_at,ended_at,winner_player_id,created_at,updated_at';
const projectionSelection = `${legacySummarySelection},projection`;

const projectionRowSchema = z
  .object({
    id: opaqueIdSchema,
    scope: z.enum(['practice', 'daily']),
    mode: z.enum(['og', 'go']),
    daily_date_key: z.string().nullable(),
    status: combatStatusSchema,
    current_turn: combatSeatSchema,
    word_length: z.number().int(),
    difficulty: z.string(),
    go_puzzle_count: z.number().int().nullable(),
    ranked: z.boolean(),
    rating_bucket: z.string().nullable(),
    custom_game_code: z.string().nullable(),
    deadline_at: nullablePostgresTimestamptzSchema,
    ended_at: nullablePostgresTimestamptzSchema,
    winner_player_id: z.string().nullable(),
    created_at: postgresTimestamptzSchema,
    updated_at: postgresTimestamptzSchema,
    projection: z.unknown().nullable(),
  })
  .strict();

export class CombatPreviewConflictError extends ServiceError {
  constructor(message = 'The COMBAT projection changed before this update was accepted.') {
    super('conflict', message, { retryable: true });
    this.name = 'CombatPreviewConflictError';
  }
}

export type CooperativeProjectionUpdate = Readonly<{
  gameId: string;
  viewerUserId: string;
  expectedUpdatedAt: string;
  expectedCurrentTurn: 'player-one' | 'player-two';
  expectedStatus: 'waiting' | 'playing';
  nextUpdatedAt: string;
  projection: unknown;
}>;

function jsonProjection(value: unknown): Json {
  return value as Json;
}

export class CombatPreviewRepository {
  constructor(private readonly client: AmordleSupabaseClient) {}

  async listParticipantSummaries(viewerUserId: string, limit = 50): Promise<LegacyCombatSummary[]> {
    const userId = uuidSchema.parse(viewerUserId);
    const safeLimit = z.number().int().min(1).max(100).parse(limit);
    const { data, error } = await this.client
      .from('async_multiplayer_games')
      .select(legacySummarySelection)
      .or(
        `host_user_id.eq.${userId},player_one_user_id.eq.${userId},player_two_user_id.eq.${userId}`,
      )
      .order('updated_at', { ascending: false })
      .limit(safeLimit);
    throwIfServiceError(error, 'Load participant COMBAT summaries');
    return (data ?? []).map(parseLegacyCombatSummary);
  }

  async loadProjection(gameId: string, viewerUserId: string): Promise<CombatProjection | null> {
    const safeGameId = opaqueIdSchema.parse(gameId);
    const safeViewerUserId = uuidSchema.parse(viewerUserId);
    const { data, error } = await this.client
      .from('async_multiplayer_games')
      .select(projectionSelection)
      .eq('id', safeGameId)
      .maybeSingle();
    throwIfServiceError(error, 'Load safe COMBAT projection');
    if (data === null) return null;
    const row = projectionRowSchema.parse(data);
    if (row.projection === null) {
      throw new ServiceError(
        'validation',
        'This legacy COMBAT record has no playable safe projection.',
        { retryable: false },
      );
    }
    const projection = parseCombatProjection(row.projection, safeViewerUserId);
    if (
      projection.id !== row.id ||
      projection.scope !== row.scope ||
      projection.mode !== row.mode ||
      projection.status !== row.status ||
      projection.currentTurn !== row.current_turn ||
      projection.updatedAt !== row.updated_at
    ) {
      throw new ServiceError(
        'validation',
        'COMBAT table metadata and projection evidence disagree.',
        { retryable: false },
      );
    }
    return projection;
  }

  async loadLegacyReadOnlySummary(gameId: string): Promise<LegacyCombatSummary | null> {
    const safeGameId = opaqueIdSchema.parse(gameId);
    const { data, error } = await this.client
      .from('async_multiplayer_games')
      .select(legacySummarySelection)
      .eq('id', safeGameId)
      .maybeSingle();
    throwIfServiceError(error, 'Load legacy COMBAT summary');
    return data === null ? null : parseLegacyCombatSummary(data);
  }

  async listPrivateRequests(input?: {
    status?: 'requested' | 'created' | 'declined' | 'cancelled' | 'expired';
    limit?: number;
  }): Promise<PrivateRequestProjection[]> {
    const status = input?.status;
    const limit = z
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(input?.limit ?? 50);
    const { data, error } = await this.client.rpc('get_private_multiplayer_match_requests', {
      p_limit: limit,
      ...(status === undefined ? {} : { p_status: status }),
    });
    throwIfServiceError(error, 'Load safe private COMBAT requests');
    return z
      .array(z.unknown())
      .parse(data ?? [])
      .map(parsePrivateRequestProjection);
  }

  async listRematches(input?: {
    sourceGameId?: string;
    limit?: number;
  }): Promise<RematchProjection[]> {
    const sourceGameId =
      input?.sourceGameId === undefined ? undefined : opaqueIdSchema.parse(input.sourceGameId);
    const limit = z
      .number()
      .int()
      .min(1)
      .max(100)
      .parse(input?.limit ?? 50);
    const { data, error } = await this.client.rpc('get_practice_multiplayer_rematch_requests', {
      p_limit: limit,
      ...(sourceGameId === undefined ? {} : { p_source_game_id: sourceGameId }),
    });
    throwIfServiceError(error, 'Load safe Practice rematches');
    return z
      .array(z.unknown())
      .parse(data ?? [])
      .map(parseRematchProjection);
  }

  async loadRankedDailyQueue(requestId: string): Promise<RankedDailyQueueProjection | null> {
    const safeRequestId = opaqueIdSchema.parse(requestId);
    const { data, error } = await this.client.rpc('get_ranked_async_matchmaking_status_v2', {
      p_request_id: safeRequestId,
    });
    throwIfServiceError(error, 'Load safe Ranked Daily queue');
    const row = data?.[0];
    return row === undefined ? null : parseRankedDailyQueueProjection(row);
  }

  async createRankedDailyQueue(input: {
    mode: 'og' | 'go';
    dailyDateKey: string;
    hardMode: boolean;
    idempotencyKey: string;
  }): Promise<RankedDailyQueueProjection> {
    const safe = z
      .object({
        mode: z.enum(['og', 'go']),
        dailyDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        hardMode: z.boolean(),
        idempotencyKey: opaqueIdSchema,
      })
      .parse(input);
    const { data, error } = await this.client.rpc('create_ranked_async_matchmaking_request_v2', {
      p_mode: safe.mode,
      p_scope: 'daily',
      p_word_length: 5,
      p_hard_mode: safe.hardMode,
      p_daily_date_key: safe.dailyDateKey,
      p_idempotency_key: safe.idempotencyKey,
    });
    throwIfServiceError(error, 'Create Ranked Daily queue');
    const requestId = opaqueIdSchema.parse(data?.[0]?.request_id);
    const queue = await this.loadRankedDailyQueue(requestId);
    if (queue === null) throw new ServiceError('conflict', 'Ranked Daily queue was not retained.');
    return queue;
  }

  async claimRankedDailyQueue(requestId: string): Promise<RankedDailyQueueProjection> {
    const safeRequestId = opaqueIdSchema.parse(requestId);
    const { error } = await this.client.rpc('claim_ranked_async_matchmaking_pair', {
      p_request_id: safeRequestId,
    });
    throwIfServiceError(error, 'Claim Ranked Daily opponent');
    const queue = await this.loadRankedDailyQueue(safeRequestId);
    if (queue === null) throw new ServiceError('conflict', 'Ranked Daily queue disappeared.');
    return queue;
  }

  async cancelRankedDailyQueue(requestId: string): Promise<RankedDailyQueueProjection> {
    const safeRequestId = opaqueIdSchema.parse(requestId);
    const { error } = await this.client.rpc('cancel_ranked_async_matchmaking_request', {
      p_request_id: safeRequestId,
    });
    throwIfServiceError(error, 'Cancel Ranked Daily queue');
    const queue = await this.loadRankedDailyQueue(safeRequestId);
    if (queue === null) throw new ServiceError('conflict', 'Ranked Daily queue disappeared.');
    return queue;
  }

  async finalizeRankedDailyQueue(
    queue: RankedDailyQueueProjection,
  ): Promise<{ gameId: string; idempotent: boolean }> {
    if (queue.status !== 'matched' || queue.matchedGameId === null) {
      throw new ServiceError('validation', 'Only a matched Ranked Daily queue can be finalized.');
    }
    const { data, error } = await this.client.rpc('finalize_ranked_async_matchmaking_game_v2', {
      p_request_id: queue.requestId,
      p_matched_game_id: queue.matchedGameId,
      p_game_projection: {},
      p_idempotency_key: `amordle-ranked-daily-finalize:${queue.requestId}`,
    });
    throwIfServiceError(error, 'Finalize Ranked Daily game');
    const row = z
      .object({
        game_id: opaqueIdSchema,
        idempotent: z.boolean(),
      })
      .passthrough()
      .parse(data?.[0]);
    return { gameId: row.game_id, idempotent: row.idempotent };
  }

  async saveRankedDailyAction(input: {
    gameId: string;
    viewerUserId: string;
    actionId: string;
    expectedVersion: number;
    expectedMoveCount: number;
    guess?: string;
    forfeit?: boolean;
  }): Promise<CombatProjection> {
    const gameId = opaqueIdSchema.parse(input.gameId);
    const viewerUserId = uuidSchema.parse(input.viewerUserId);
    const actionId = opaqueIdSchema.parse(input.actionId);
    const expectedVersion = z.number().int().min(0).parse(input.expectedVersion);
    const expectedMoveCount = z.number().int().min(0).parse(input.expectedMoveCount);
    const guess =
      input.guess === undefined
        ? undefined
        : z
            .string()
            .regex(/^[a-z]{5}$/)
            .parse(input.guess);
    const forfeit = input.forfeit ?? false;
    if ((guess === undefined) === !forfeit) {
      throw new ServiceError(
        'validation',
        'Ranked Daily actions must contain exactly one guess or forfeit.',
        { retryable: false },
      );
    }

    const { data, error } = await this.client.rpc('save_ranked_daily_async_multiplayer_action', {
      p_game_id: gameId,
      p_action_id: actionId,
      p_expected_move_count: expectedMoveCount,
      p_expected_version: expectedVersion,
      ...(guess === undefined ? {} : { p_guess: guess }),
      ...(forfeit ? { p_forfeit: true } : {}),
    });
    throwIfServiceError(error, 'Save safe Ranked Daily action');
    const projection = parseCombatProjection(data?.[0]?.game_projection, viewerUserId);
    if (projection.kind !== 'ranked-daily' || projection.id !== gameId) {
      throw new ServiceError(
        'validation',
        'Ranked Daily action returned a mismatched projection.',
        { retryable: false },
      );
    }
    return projection;
  }

  async settleRankedDaily(input: { gameId: string; viewerUserId: string }): Promise<{
    outcome: 'win' | 'loss' | 'draw';
    oldRating: number;
    newRating: number;
    ratingDelta: number;
    idempotent: boolean;
  }> {
    const gameId = opaqueIdSchema.parse(input.gameId);
    const viewerUserId = uuidSchema.parse(input.viewerUserId);
    const { data, error } = await this.client.rpc('settle_ranked_async_multiplayer_match_v2', {
      p_game_id: gameId,
      p_idempotency_key: `amordle-ranked-daily-settle:${gameId}`,
    });
    throwIfServiceError(error, 'Settle Ranked Daily game');
    const rows = z
      .array(
        z
          .object({
            user_id: uuidSchema,
            outcome: z.enum(['win', 'loss', 'draw']),
            old_rating: z.number().int().nonnegative(),
            new_rating: z.number().int().nonnegative(),
            rating_delta: z.number().int(),
            idempotent: z.boolean(),
          })
          .passthrough(),
      )
      .parse(data ?? []);
    const viewer = rows.find((row) => row.user_id === viewerUserId);
    if (!viewer) {
      throw new ServiceError(
        'authorization',
        'Ranked Daily settlement did not include the current participant.',
      );
    }
    return {
      outcome: viewer.outcome,
      oldRating: viewer.old_rating,
      newRating: viewer.new_rating,
      ratingDelta: viewer.rating_delta,
      idempotent: viewer.idempotent,
    };
  }

  async updateCooperativeProjection(input: CooperativeProjectionUpdate): Promise<CombatProjection> {
    const gameId = opaqueIdSchema.parse(input.gameId);
    const viewerUserId = uuidSchema.parse(input.viewerUserId);
    const expectedUpdatedAt = isoTimestampSchema.parse(input.expectedUpdatedAt);
    const expectedCurrentTurn = combatSeatSchema.parse(input.expectedCurrentTurn);
    const expectedStatus = z.enum(['waiting', 'playing']).parse(input.expectedStatus);
    const nextUpdatedAt = isoTimestampSchema.parse(input.nextUpdatedAt);
    if (Date.parse(nextUpdatedAt) <= Date.parse(expectedUpdatedAt)) {
      throw new ServiceError(
        'validation',
        'The next COMBAT update timestamp must advance monotonically.',
        { retryable: false },
      );
    }

    const projection = parseCombatProjection(input.projection, viewerUserId);
    if (
      projection.id !== gameId ||
      projection.scope !== 'practice' ||
      projection.ranked ||
      projection.updatedAt !== nextUpdatedAt ||
      projection.kind === 'ranked-daily'
    ) {
      throw new ServiceError(
        'validation',
        'Only answerless cooperative Practice projections can use conditional updates.',
        { retryable: false },
      );
    }

    const update = {
      projection: jsonProjection(input.projection),
      status: projection.status,
      current_turn: projection.currentTurn,
      updated_at: nextUpdatedAt,
      ended_at: projection.endedAt,
      winner_player_id: projection.winnerId,
    };
    const { data, error } = await this.client
      .from('async_multiplayer_games')
      .update(update)
      .eq('id', gameId)
      .eq('scope', 'practice')
      .eq('ranked', false)
      .eq('updated_at', expectedUpdatedAt)
      .eq('current_turn', expectedCurrentTurn)
      .eq('status', expectedStatus)
      .select(projectionSelection)
      .maybeSingle();
    throwIfServiceError(error, 'Update cooperative COMBAT projection');
    if (data === null) throw new CombatPreviewConflictError();
    const row = projectionRowSchema.parse(data);
    const accepted = parseCombatProjection(row.projection, viewerUserId);
    if (
      accepted.id !== gameId ||
      accepted.updatedAt !== nextUpdatedAt ||
      accepted.status !== projection.status ||
      accepted.currentTurn !== projection.currentTurn
    ) {
      throw new CombatPreviewConflictError(
        'The accepted COMBAT projection does not match the requested conditional update.',
      );
    }
    return accepted;
  }
}
