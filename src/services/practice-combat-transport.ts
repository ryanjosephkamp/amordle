import { z } from 'zod';

import {
  PRACTICE_COMBAT_PREVIEW_CAPABILITIES,
  createPracticeCombatPreview,
  practiceCombatPreviewConfigSchema,
  type PracticeCombatPreviewConfig,
  type PracticeCombatPreviewState,
} from '../domain/practice-combat-preview';
import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import type { Json } from '../types/database';
import { practiceLobbyConfigurationFingerprint } from './pending-practice-lobby';
import { postgresTimestamptzSchema } from './postgres-timestamp';
import { ServiceError, throwIfServiceError } from './service-error';

const opaqueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);
const uuidSchema = z.string().uuid();
const timestampSchema = postgresTimestamptzSchema;
const seatSchema = z.enum(['player-one', 'player-two']);
const actorSchema = z.enum(['left', 'right']);
const sourceKindSchema = z.enum(['public-lobby', 'private-request', 'rematch']);
const tileSchema = z
  .object({
    letter: z.string().regex(/^[a-z]$/),
    state: z.enum(['absent', 'present', 'correct']),
    position: z.number().int().min(0).max(34),
  })
  .strict();
const moveSchema = z
  .object({
    sequence: z.number().int().positive(),
    actor: actorSchema,
    puzzleIndex: z.number().int().min(0).max(9),
    guess: z.string().regex(/^[a-z]{2,35}$/),
    tiles: z.array(tileSchema).min(2).max(35),
    submittedAt: timestampSchema,
  })
  .strict();
const outcomeSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('cancelled'),
      reason: z.literal('cancellation'),
      winnerId: z.null(),
      loserId: z.null(),
      revealAnswer: z.literal(false),
    })
    .strict(),
  z
    .object({
      kind: z.literal('draw'),
      reason: z.literal('points'),
      winnerId: z.null(),
      loserId: z.null(),
      revealAnswer: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal('win'),
      reason: z.enum(['forfeit', 'timeout', 'og_solve', 'points']),
      winnerId: actorSchema,
      loserId: actorSchema,
      revealAnswer: z.literal(true),
    })
    .strict(),
]);

const practiceStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: opaqueIdSchema,
    capabilities: z
      .object({
        authority: z.literal(PRACTICE_COMBAT_PREVIEW_CAPABILITIES.authority),
        persistence: z.literal(PRACTICE_COMBAT_PREVIEW_CAPABILITIES.persistence),
        serverAuthoritative: z.literal(false),
        ratingMutation: z.literal('never'),
      })
      .strict(),
    config: practiceCombatPreviewConfigSchema,
    answers: z
      .array(z.string().regex(/^[a-z]{2,35}$/))
      .min(1)
      .max(10),
    players: z.tuple([
      z
        .object({
          actor: z.literal('left'),
          displayName: z.string().trim().min(1).max(50),
          puzzles: z.array(
            z
              .object({
                puzzleIndex: z.number().int().min(0).max(9),
                attemptsUsed: z.number().int().min(0).max(6),
                solved: z.boolean(),
              })
              .strict(),
          ),
        })
        .strict(),
      z
        .object({
          actor: z.literal('right'),
          displayName: z.string().trim().min(1).max(50),
          puzzles: z.array(
            z
              .object({
                puzzleIndex: z.number().int().min(0).max(9),
                attemptsUsed: z.number().int().min(0).max(6),
                solved: z.boolean(),
              })
              .strict(),
          ),
        })
        .strict(),
    ]),
    status: z.enum(['playing', 'holding', 'terminal', 'cancelled']),
    activeActor: actorSchema.nullable(),
    currentPuzzleIndex: z.number().int().min(0).max(9),
    moves: z.array(moveSchema).max(120),
    hold: z
      .object({
        solvedPuzzleIndex: z.number().int().min(0).max(9),
        solvedBy: actorSchema,
        nextActor: actorSchema,
        holdStartedAt: timestampSchema,
        autoAdvanceAt: timestampSchema,
      })
      .strict()
      .nullable(),
    deadlineAt: timestampSchema.nullable(),
    outcome: outcomeSchema.nullable(),
    revision: z.number().int().min(0),
    appliedActionIds: z.array(opaqueIdSchema).max(240),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict()
  .superRefine((state, context) => {
    if (
      state.answers.length !== state.config.puzzleCount ||
      state.answers.some((answer) => answer.length !== state.config.wordLength) ||
      new Set(state.answers).size !== state.answers.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Practice answer material does not match the configured chain.',
      });
    }
    if (
      state.players.some(
        (player) =>
          player.puzzles.length !== state.config.puzzleCount ||
          player.puzzles.some((puzzle, index) => puzzle.puzzleIndex !== index),
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Practice player progress does not match the configured chain.',
      });
    }
    if (state.moves.some((move) => move.guess.length !== state.config.wordLength)) {
      context.addIssue({
        code: 'custom',
        message: 'Practice moves must match the configured word length.',
      });
    }
    if (
      (state.status === 'holding') !== (state.hold !== null) ||
      (state.status === 'terminal' || state.status === 'cancelled') !== (state.outcome !== null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Practice terminal and hold evidence is inconsistent.',
      });
    }
  });

const playerIdsSchema = z
  .object({
    'player-one': uuidSchema,
    'player-two': uuidSchema.nullable(),
  })
  .strict();

const commonProjectionShape = {
  id: opaqueIdSchema,
  sourceKind: sourceKindSchema,
  scope: z.literal('practice'),
  mode: z.enum(['og', 'go']),
  ranked: z.literal(false),
  ratingBucket: z.null(),
  wordLength: z.number().int().min(2).max(35),
  difficulty: z.enum(['casual', 'standard', 'expert']),
  hardMode: z.boolean(),
  timeLimitMs: z
    .union([
      z.literal(30_000),
      z.literal(60_000),
      z.literal(120_000),
      z.literal(300_000),
      z.literal(600_000),
      z.literal(1_800_000),
      z.literal(3_600_000),
    ])
    .nullable(),
  customGameCode: z.null(),
  dailyDateKey: z.null(),
  goPuzzleCount: z.union([z.literal(5), z.literal(7), z.literal(10)]).nullable(),
  playerUserIds: playerIdsSchema,
  matchmakingRequestId: z.null(),
  currentTurn: seatSchema,
  moves: z.array(moveSchema).max(120),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  deadlineAt: timestampSchema.nullable(),
  endedAt: timestampSchema.nullable(),
  winnerId: seatSchema.nullable(),
  forfeitedPlayerId: seatSchema.nullable(),
  timedOutPlayerId: seatSchema.nullable(),
};

const waitingProjectionSchema = z
  .object({
    schema: z.literal('amordle-practice-waiting-v1'),
    ...commonProjectionShape,
    sourceKind: z.literal('public-lobby'),
    status: z.literal('waiting'),
    playerUserIds: z
      .object({
        'player-one': uuidSchema,
        'player-two': z.null(),
      })
      .strict(),
    currentTurn: z.literal('player-one'),
    moves: z.tuple([]),
    deadlineAt: z.null(),
    endedAt: z.null(),
    winnerId: z.null(),
    forfeitedPlayerId: z.null(),
    timedOutPlayerId: z.null(),
  })
  .strict();

const cancelledWaitingProjectionSchema = z
  .object({
    schema: z.literal('amordle-practice-cancelled-v1'),
    ...commonProjectionShape,
    sourceKind: z.literal('public-lobby'),
    status: z.literal('cancelled'),
    playerUserIds: z
      .object({
        'player-one': uuidSchema,
        'player-two': z.null(),
      })
      .strict(),
    currentTurn: z.literal('player-one'),
    moves: z.tuple([]),
    deadlineAt: z.null(),
    endedAt: timestampSchema,
    winnerId: z.null(),
    forfeitedPlayerId: z.null(),
    timedOutPlayerId: z.null(),
  })
  .strict();

const cooperativeProjectionSchema = z
  .object({
    schema: z.literal('amordle-practice-coop-v1'),
    ...commonProjectionShape,
    status: z.enum(['playing', 'won', 'lost', 'expired', 'cancelled']),
    playerUserIds: z
      .object({
        'player-one': uuidSchema,
        'player-two': uuidSchema,
      })
      .strict(),
    wordRevision: z.string().trim().min(1).max(160),
    state: practiceStateSchema,
  })
  .strict()
  .superRefine((projection, context) => {
    const state = projection.state;
    const expectedMode = state.config.mode;
    const expectedCurrentTurn = state.activeActor === 'right' ? 'player-two' : 'player-one';
    const expectedStatus =
      state.status === 'playing' || state.status === 'holding'
        ? 'playing'
        : state.status === 'cancelled'
          ? 'cancelled'
          : state.outcome?.kind === 'win' && state.outcome.reason === 'timeout'
            ? 'expired'
            : 'won';
    const expectedWinner =
      state.outcome?.kind === 'win'
        ? state.outcome.winnerId === 'left'
          ? 'player-one'
          : 'player-two'
        : null;
    if (
      projection.id !== state.id ||
      projection.mode !== expectedMode ||
      projection.wordLength !== state.config.wordLength ||
      projection.difficulty !== state.config.difficulty ||
      projection.hardMode !== state.config.hardMode ||
      projection.timeLimitMs !== state.config.timeLimitMs ||
      projection.goPuzzleCount !== (state.config.mode === 'go' ? state.config.puzzleCount : null) ||
      projection.currentTurn !== expectedCurrentTurn ||
      projection.status !== expectedStatus ||
      projection.updatedAt !== state.updatedAt ||
      projection.deadlineAt !== state.deadlineAt ||
      projection.winnerId !== expectedWinner ||
      projection.moves.length !== state.moves.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Practice table projection and cooperative state disagree.',
      });
    }
  });

type RawWaitingProjection = z.infer<typeof waitingProjectionSchema>;
type RawCancelledWaitingProjection = z.infer<typeof cancelledWaitingProjectionSchema>;
type RawCooperativeProjection = z.infer<typeof cooperativeProjectionSchema>;

export type PracticeViewerSeat = 'player-one' | 'player-two' | null;
export type PracticeTransportCapabilities = Readonly<{
  canJoin: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  canForfeit: boolean;
  canRequestRematch: boolean;
  canEditDraft: boolean;
  readOnly: boolean;
}>;

type PracticeTransportBase = Readonly<{
  id: string;
  sourceKind: 'public-lobby' | 'private-request' | 'rematch';
  mode: 'og' | 'go';
  wordLength: number;
  difficulty: 'casual' | 'standard' | 'expert';
  hardMode: boolean;
  timeLimitMs: number | null;
  goPuzzleCount: 5 | 7 | 10 | null;
  status: 'waiting' | 'playing' | 'won' | 'lost' | 'expired' | 'cancelled';
  currentTurn: 'player-one' | 'player-two';
  createdAt: string;
  updatedAt: string;
  deadlineAt: string | null;
  endedAt: string | null;
  winnerId: 'player-one' | 'player-two' | null;
  viewerSeat: PracticeViewerSeat;
  capabilities: PracticeTransportCapabilities;
}>;

export type PracticeWaitingProjection = PracticeTransportBase &
  Readonly<{ kind: 'waiting'; state: null; wordRevision: null }>;
export type PracticeCooperativeProjection = PracticeTransportBase &
  Readonly<{
    kind: 'cooperative-participant';
    state: PracticeCombatPreviewState;
    wordRevision: string;
  }>;
export type PracticeCancelledProjection = PracticeTransportBase &
  Readonly<{ kind: 'cancelled-waiting'; state: null; wordRevision: null }>;
export type PracticeTransportProjection =
  PracticeWaitingProjection | PracticeCooperativeProjection | PracticeCancelledProjection;

function seatFor(
  playerUserIds: { 'player-one': string; 'player-two': string | null },
  viewerUserId: string,
): PracticeViewerSeat {
  if (viewerUserId === playerUserIds['player-one']) return 'player-one';
  if (viewerUserId === playerUserIds['player-two']) return 'player-two';
  return null;
}

function capabilitiesFor(input: {
  status: PracticeTransportBase['status'];
  viewerSeat: PracticeViewerSeat;
  currentTurn: 'player-one' | 'player-two';
  moveCount: number;
  openSeat: boolean;
}): PracticeTransportCapabilities {
  const playing = input.status === 'playing';
  const participant = input.viewerSeat !== null;
  const canSubmit = playing && participant && input.currentTurn === input.viewerSeat;
  const canJoin = input.status === 'waiting' && !participant && input.openSeat;
  const canCancel =
    participant && (input.status === 'waiting' || (playing && input.moveCount === 0));
  const canForfeit = participant && playing && input.moveCount > 0;
  const terminal = ['won', 'lost', 'expired', 'cancelled'].includes(input.status);
  return {
    canJoin,
    canSubmit,
    canCancel,
    canForfeit,
    canRequestRematch: participant && terminal && !input.openSeat,
    canEditDraft: canSubmit,
    readOnly: !canJoin && !canSubmit && !canCancel && !canForfeit,
  };
}

function mapBase(
  raw: RawWaitingProjection | RawCancelledWaitingProjection | RawCooperativeProjection,
  viewerUserId: string,
): PracticeTransportBase {
  const viewerSeat = seatFor(raw.playerUserIds, viewerUserId);
  return {
    id: raw.id,
    sourceKind: raw.sourceKind,
    mode: raw.mode,
    wordLength: raw.wordLength,
    difficulty: raw.difficulty,
    hardMode: raw.hardMode,
    timeLimitMs: raw.timeLimitMs,
    goPuzzleCount: raw.goPuzzleCount,
    status: raw.status,
    currentTurn: raw.currentTurn,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    deadlineAt: raw.deadlineAt,
    endedAt: raw.endedAt,
    winnerId: raw.winnerId,
    viewerSeat,
    capabilities: capabilitiesFor({
      status: raw.status,
      viewerSeat,
      currentTurn: raw.currentTurn,
      moveCount: raw.moves.length,
      openSeat: raw.playerUserIds['player-two'] === null,
    }),
  };
}

export function parsePracticeTransportProjection(
  value: unknown,
  viewerUserId: string,
): PracticeTransportProjection {
  const userId = uuidSchema.parse(viewerUserId);
  if (
    typeof value !== 'object' ||
    value === null ||
    !('schema' in value) ||
    typeof value.schema !== 'string'
  ) {
    throw new ServiceError('validation', 'Practice COMBAT projection is not recognized.');
  }
  if (value.schema === 'amordle-practice-waiting-v1') {
    const raw = waitingProjectionSchema.parse(value);
    return {
      ...mapBase(raw, userId),
      kind: 'waiting',
      state: null,
      wordRevision: null,
    };
  }
  if (value.schema === 'amordle-practice-cancelled-v1') {
    const raw = cancelledWaitingProjectionSchema.parse(value);
    if (raw.playerUserIds['player-one'] !== userId) {
      throw new ServiceError('authorization', 'Cancelled lobby is owner-only.');
    }
    return {
      ...mapBase(raw, userId),
      kind: 'cancelled-waiting',
      state: null,
      wordRevision: null,
    };
  }
  const raw = cooperativeProjectionSchema.parse(value);
  const base = mapBase(raw, userId);
  if (base.viewerSeat === null) {
    throw new ServiceError(
      'authorization',
      'Cooperative Practice answer material is participant-only.',
    );
  }
  return {
    ...base,
    kind: 'cooperative-participant',
    state: raw.state as PracticeCombatPreviewState,
    wordRevision: raw.wordRevision,
  };
}

export function buildWaitingPracticeProjection(input: {
  id: string;
  hostUserId: string;
  config: PracticeCombatPreviewConfig;
  now: string;
}): RawWaitingProjection {
  const config = practiceCombatPreviewConfigSchema.parse(input.config);
  const now = timestampSchema.parse(input.now);
  return waitingProjectionSchema.parse({
    schema: 'amordle-practice-waiting-v1',
    id: opaqueIdSchema.parse(input.id),
    sourceKind: 'public-lobby',
    scope: 'practice',
    mode: config.mode,
    ranked: false,
    ratingBucket: null,
    wordLength: config.wordLength,
    difficulty: config.difficulty,
    hardMode: config.hardMode,
    timeLimitMs: config.timeLimitMs,
    customGameCode: null,
    dailyDateKey: null,
    goPuzzleCount: config.mode === 'go' ? config.puzzleCount : null,
    playerUserIds: {
      'player-one': uuidSchema.parse(input.hostUserId),
      'player-two': null,
    },
    matchmakingRequestId: null,
    status: 'waiting',
    currentTurn: 'player-one',
    moves: [],
    createdAt: now,
    updatedAt: now,
    deadlineAt: null,
    endedAt: null,
    winnerId: null,
    forfeitedPlayerId: null,
    timedOutPlayerId: null,
  });
}

export function buildCooperativePracticeProjection(input: {
  sourceKind: 'public-lobby' | 'private-request' | 'rematch';
  playerOneUserId: string;
  playerTwoUserId: string;
  wordRevision: string;
  state: PracticeCombatPreviewState;
}): RawCooperativeProjection {
  const state = practiceStateSchema.parse(input.state);
  const currentTurn = state.activeActor === 'right' ? 'player-two' : 'player-one';
  const status =
    state.status === 'playing' || state.status === 'holding'
      ? 'playing'
      : state.status === 'cancelled'
        ? 'cancelled'
        : state.outcome?.kind === 'win' && state.outcome.reason === 'timeout'
          ? 'expired'
          : 'won';
  const winnerId =
    state.outcome?.kind === 'win'
      ? state.outcome.winnerId === 'left'
        ? 'player-one'
        : 'player-two'
      : null;
  const actorSeat = (actor: 'left' | 'right') =>
    actor === 'left' ? ('player-one' as const) : ('player-two' as const);
  return cooperativeProjectionSchema.parse({
    schema: 'amordle-practice-coop-v1',
    id: state.id,
    sourceKind: input.sourceKind,
    scope: 'practice',
    mode: state.config.mode,
    ranked: false,
    ratingBucket: null,
    wordLength: state.config.wordLength,
    difficulty: state.config.difficulty,
    hardMode: state.config.hardMode,
    timeLimitMs: state.config.timeLimitMs,
    customGameCode: null,
    dailyDateKey: null,
    goPuzzleCount: state.config.mode === 'go' ? state.config.puzzleCount : null,
    playerUserIds: {
      'player-one': uuidSchema.parse(input.playerOneUserId),
      'player-two': uuidSchema.parse(input.playerTwoUserId),
    },
    matchmakingRequestId: null,
    status,
    currentTurn,
    moves: state.moves,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    deadlineAt: state.deadlineAt,
    endedAt: state.status === 'terminal' || state.status === 'cancelled' ? state.updatedAt : null,
    winnerId,
    forfeitedPlayerId:
      state.outcome?.kind === 'win' && state.outcome.reason === 'forfeit'
        ? actorSeat(state.outcome.loserId)
        : null,
    timedOutPlayerId:
      state.outcome?.kind === 'win' && state.outcome.reason === 'timeout'
        ? actorSeat(state.outcome.loserId)
        : null,
    wordRevision: input.wordRevision,
    state,
  });
}

const projectionSelection =
  'id,scope,mode,status,current_turn,word_length,difficulty,go_puzzle_count,ranked,deadline_at,ended_at,winner_player_id,created_at,updated_at,projection';

const rowSchema = z
  .object({
    id: opaqueIdSchema,
    scope: z.literal('practice'),
    mode: z.enum(['og', 'go']),
    status: z.enum(['waiting', 'playing', 'won', 'lost', 'expired', 'cancelled']),
    current_turn: seatSchema,
    word_length: z.number().int().min(2).max(35),
    difficulty: z.string(),
    go_puzzle_count: z.number().int().nullable(),
    ranked: z.boolean(),
    deadline_at: timestampSchema.nullable(),
    ended_at: timestampSchema.nullable(),
    winner_player_id: seatSchema.nullable(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    projection: z.unknown(),
  })
  .strict();

function json(value: unknown): Json {
  return value as Json;
}

function validateRow(value: unknown, viewerUserId: string): PracticeTransportProjection {
  const row = rowSchema.parse(value);
  const projection = parsePracticeTransportProjection(row.projection, viewerUserId);
  if (
    row.id !== projection.id ||
    row.mode !== projection.mode ||
    row.status !== projection.status ||
    row.current_turn !== projection.currentTurn ||
    row.word_length !== projection.wordLength ||
    row.updated_at !== projection.updatedAt
  ) {
    throw new ServiceError(
      'validation',
      'Practice table metadata and projection evidence disagree.',
    );
  }
  return projection;
}

export class PracticeCombatConflictError extends ServiceError {
  constructor() {
    super('conflict', 'Practice COMBAT changed before this action was saved.', {
      retryable: true,
    });
    this.name = 'PracticeCombatConflictError';
  }
}

export class PracticeCombatTransportRepository {
  constructor(private readonly client: AmordleSupabaseClient) {}

  private async loadRawProjection(
    gameId: string,
  ): Promise<
    RawWaitingProjection | RawCancelledWaitingProjection | RawCooperativeProjection | null
  > {
    const id = opaqueIdSchema.parse(gameId);
    const { data, error } = await this.client
      .from('async_multiplayer_games')
      .select(projectionSelection)
      .eq('id', id)
      .maybeSingle();
    throwIfServiceError(error, 'Load Practice COMBAT');
    if (data === null) return null;
    const row = rowSchema.parse(data);
    if (
      typeof row.projection !== 'object' ||
      row.projection === null ||
      !('schema' in row.projection)
    ) {
      throw new ServiceError(
        'validation',
        'This legacy COMBAT record has no compatible cooperative projection.',
      );
    }
    if (row.projection.schema === 'amordle-practice-waiting-v1') {
      return waitingProjectionSchema.parse(row.projection);
    }
    if (row.projection.schema === 'amordle-practice-cancelled-v1') {
      return cancelledWaitingProjectionSchema.parse(row.projection);
    }
    return cooperativeProjectionSchema.parse(row.projection);
  }

  async recoverPublicLobby(input: {
    gameId: string;
    ownerUserId: string;
    configurationFingerprint: string;
  }): Promise<PracticeWaitingProjection | null> {
    const ownerUserId = uuidSchema.parse(input.ownerUserId);
    const expectedFingerprint = z
      .string()
      .trim()
      .min(1)
      .max(500)
      .parse(input.configurationFingerprint);
    const raw = await this.loadRawProjection(input.gameId);
    if (raw === null) return null;
    if (
      raw.schema !== 'amordle-practice-waiting-v1' ||
      raw.playerUserIds['player-one'] !== ownerUserId
    ) {
      throw new ServiceError(
        'conflict',
        'The pending Practice lobby identifier belongs to different durable state.',
        { retryable: false },
      );
    }
    const actualFingerprint = practiceLobbyConfigurationFingerprint({
      mode: raw.mode,
      wordLength: raw.wordLength,
      difficulty: raw.difficulty,
      hardMode: raw.hardMode,
      puzzleCount: raw.mode === 'go' ? raw.goPuzzleCount! : 1,
      timeLimitMs: raw.timeLimitMs,
    });
    if (actualFingerprint !== expectedFingerprint) {
      throw new ServiceError(
        'conflict',
        'The pending Practice lobby configuration conflicts with the durable lobby.',
        { retryable: false },
      );
    }
    const recovered = parsePracticeTransportProjection(raw, ownerUserId);
    if (recovered.kind !== 'waiting') {
      throw new ServiceError('conflict', 'The durable Practice lobby is no longer waiting.', {
        retryable: false,
      });
    }
    return recovered;
  }

  async createPublicLobby(input: {
    id: string;
    hostUserId: string;
    config: PracticeCombatPreviewConfig;
    now: string;
  }): Promise<PracticeWaitingProjection> {
    const projection = buildWaitingPracticeProjection(input);
    const fingerprint = practiceLobbyConfigurationFingerprint(input.config);
    const existing = await this.recoverPublicLobby({
      gameId: projection.id,
      ownerUserId: projection.playerUserIds['player-one'],
      configurationFingerprint: fingerprint,
    });
    if (existing) return existing;
    const { data, error } = await this.client
      .from('async_multiplayer_games')
      .insert({
        id: projection.id,
        scope: 'practice',
        mode: projection.mode,
        daily_date_key: null,
        status: 'waiting',
        current_turn: 'player-one',
        word_length: projection.wordLength,
        difficulty: projection.difficulty,
        go_puzzle_count: projection.goPuzzleCount,
        host_user_id: projection.playerUserIds['player-one'],
        player_one_user_id: projection.playerUserIds['player-one'],
        player_two_user_id: null,
        ranked: false,
        rating_bucket: null,
        matchmaking_request_id: null,
        custom_game_code: null,
        winner_player_id: null,
        deadline_at: null,
        ended_at: null,
        projection: json(projection),
        created_at: projection.createdAt,
        updated_at: projection.updatedAt,
      })
      .select(projectionSelection)
      .single();
    if (error) {
      try {
        const recovered = await this.recoverPublicLobby({
          gameId: projection.id,
          ownerUserId: projection.playerUserIds['player-one'],
          configurationFingerprint: fingerprint,
        });
        if (recovered) return recovered;
      } catch {
        // The original persistence failure remains authoritative unless the
        // exact pending identifier proves the requested lobby was committed.
      }
      throwIfServiceError(error, 'Create public Practice lobby');
    }
    const accepted = validateRow(data, projection.playerUserIds['player-one']);
    if (accepted.kind !== 'waiting') {
      throw new ServiceError('conflict', 'Practice lobby was not created in waiting state.');
    }
    return accepted;
  }

  async listPublicLobbies(viewerUserId: string, limit = 50): Promise<PracticeWaitingProjection[]> {
    const userId = uuidSchema.parse(viewerUserId);
    const { data, error } = await this.client
      .from('async_multiplayer_games')
      .select(projectionSelection)
      .eq('scope', 'practice')
      .eq('ranked', false)
      .eq('status', 'waiting')
      .is('player_two_user_id', null)
      .order('updated_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));
    throwIfServiceError(error, 'Load public Practice lobbies');
    return (data ?? []).flatMap((row) => {
      try {
        const projection = validateRow(row, userId);
        return projection.kind === 'waiting' ? [projection] : [];
      } catch (error) {
        const rawProjection =
          typeof row === 'object' && row !== null && 'projection' in row
            ? row.projection
            : undefined;
        const playerOneUserId =
          typeof rawProjection === 'object' &&
          rawProjection !== null &&
          'playerUserIds' in rawProjection &&
          typeof rawProjection.playerUserIds === 'object' &&
          rawProjection.playerUserIds !== null &&
          'player-one' in rawProjection.playerUserIds
            ? rawProjection.playerUserIds['player-one']
            : null;
        if (playerOneUserId === userId) {
          throw new ServiceError(
            'validation',
            'An owned Practice lobby contains inconsistent durable evidence.',
            { cause: error, retryable: false },
          );
        }
        return [];
      }
    });
  }

  async load(gameId: string, viewerUserId: string): Promise<PracticeTransportProjection | null> {
    const userId = uuidSchema.parse(viewerUserId);
    const raw = await this.loadRawProjection(gameId);
    return raw === null ? null : parsePracticeTransportProjection(raw, userId);
  }

  async joinPublicLobby(input: {
    gameId: string;
    joinerUserId: string;
    expectedUpdatedAt: string;
    displayNames: readonly [string, string];
    answers: readonly string[];
    wordRevision: string;
    now: string;
  }): Promise<PracticeCooperativeProjection> {
    const gameId = opaqueIdSchema.parse(input.gameId);
    const joinerUserId = uuidSchema.parse(input.joinerUserId);
    const expectedUpdatedAt = timestampSchema.parse(input.expectedUpdatedAt);
    const waiting = await this.loadRawProjection(gameId);
    if (
      waiting === null ||
      waiting.schema !== 'amordle-practice-waiting-v1' ||
      waiting.updatedAt !== expectedUpdatedAt
    ) {
      throw new PracticeCombatConflictError();
    }
    if (waiting.playerUserIds['player-one'] === joinerUserId) {
      throw new ServiceError('validation', 'A Practice lobby requires two distinct accounts.');
    }
    const state = createPracticeCombatPreview({
      id: gameId,
      config: {
        mode: waiting.mode,
        wordLength: waiting.wordLength,
        difficulty: waiting.difficulty,
        hardMode: waiting.hardMode,
        puzzleCount: waiting.mode === 'go' ? waiting.goPuzzleCount! : 1,
        timeLimitMs: waiting.timeLimitMs,
      },
      players: [{ displayName: input.displayNames[0] }, { displayName: input.displayNames[1] }],
      answers: input.answers,
      now: input.now,
    });
    const projection = buildCooperativePracticeProjection({
      sourceKind: 'public-lobby',
      playerOneUserId: waiting.playerUserIds['player-one'],
      playerTwoUserId: joinerUserId,
      wordRevision: input.wordRevision,
      state,
    });
    const { data, error } = await this.client
      .from('async_multiplayer_games')
      .update({
        player_two_user_id: joinerUserId,
        status: 'playing',
        current_turn: projection.currentTurn,
        deadline_at: projection.deadlineAt,
        projection: json(projection),
        updated_at: projection.updatedAt,
      })
      .eq('id', gameId)
      .eq('scope', 'practice')
      .eq('ranked', false)
      .eq('status', 'waiting')
      .eq('updated_at', expectedUpdatedAt)
      .is('player_two_user_id', null)
      .neq('host_user_id', joinerUserId)
      .select(projectionSelection)
      .maybeSingle();
    throwIfServiceError(error, 'Join public Practice lobby');
    if (data === null) throw new PracticeCombatConflictError();
    const accepted = validateRow(data, joinerUserId);
    if (accepted.kind !== 'cooperative-participant') {
      throw new PracticeCombatConflictError();
    }
    return accepted;
  }

  async save(input: {
    viewerUserId: string;
    expectedUpdatedAt: string;
    expectedCurrentTurn: 'player-one' | 'player-two';
    expectedStatus: 'playing';
    state: PracticeCombatPreviewState;
  }): Promise<PracticeCooperativeProjection> {
    const viewerUserId = uuidSchema.parse(input.viewerUserId);
    const expectedUpdatedAt = timestampSchema.parse(input.expectedUpdatedAt);
    const expectedCurrentTurn = seatSchema.parse(input.expectedCurrentTurn);
    const current = await this.loadRawProjection(input.state.id);
    if (current === null || current.schema !== 'amordle-practice-coop-v1') {
      throw new PracticeCombatConflictError();
    }
    if (
      current.updatedAt !== expectedUpdatedAt ||
      current.currentTurn !== expectedCurrentTurn ||
      current.status !== input.expectedStatus
    ) {
      throw new PracticeCombatConflictError();
    }
    if (
      viewerUserId !== current.playerUserIds['player-one'] &&
      viewerUserId !== current.playerUserIds['player-two']
    ) {
      throw new ServiceError('authorization', 'Practice save requires a participant.');
    }
    const projection = buildCooperativePracticeProjection({
      sourceKind: current.sourceKind,
      playerOneUserId: current.playerUserIds['player-one'],
      playerTwoUserId: current.playerUserIds['player-two'],
      wordRevision: current.wordRevision,
      state: input.state,
    });
    if (Date.parse(projection.updatedAt) <= Date.parse(expectedUpdatedAt)) {
      throw new ServiceError('validation', 'Practice update time must advance.');
    }
    const { data, error } = await this.client
      .from('async_multiplayer_games')
      .update({
        status: projection.status,
        current_turn: projection.currentTurn,
        deadline_at: projection.deadlineAt,
        ended_at: projection.endedAt,
        winner_player_id: projection.winnerId,
        projection: json(projection),
        updated_at: projection.updatedAt,
      })
      .eq('id', projection.id)
      .eq('scope', 'practice')
      .eq('ranked', false)
      .eq('status', input.expectedStatus)
      .eq('updated_at', expectedUpdatedAt)
      .eq('current_turn', expectedCurrentTurn)
      .select(projectionSelection)
      .maybeSingle();
    throwIfServiceError(error, 'Save cooperative Practice action');
    if (data === null) throw new PracticeCombatConflictError();
    const accepted = validateRow(data, viewerUserId);
    if (accepted.kind !== 'cooperative-participant') {
      throw new PracticeCombatConflictError();
    }
    return accepted;
  }

  async cancelWaitingLobby(input: {
    gameId: string;
    ownerUserId: string;
    expectedUpdatedAt: string;
    now: string;
  }): Promise<PracticeCancelledProjection> {
    const gameId = opaqueIdSchema.parse(input.gameId);
    const ownerUserId = uuidSchema.parse(input.ownerUserId);
    const expectedUpdatedAt = timestampSchema.parse(input.expectedUpdatedAt);
    const now = timestampSchema.parse(input.now);
    const waiting = await this.loadRawProjection(gameId);
    if (
      waiting === null ||
      waiting.schema !== 'amordle-practice-waiting-v1' ||
      waiting.playerUserIds['player-one'] !== ownerUserId ||
      waiting.updatedAt !== expectedUpdatedAt
    ) {
      throw new PracticeCombatConflictError();
    }
    const projection = cancelledWaitingProjectionSchema.parse({
      ...waiting,
      schema: 'amordle-practice-cancelled-v1',
      status: 'cancelled',
      updatedAt: now,
      endedAt: now,
    });
    const { data, error } = await this.client
      .from('async_multiplayer_games')
      .update({
        status: 'cancelled',
        ended_at: now,
        projection: json(projection),
        updated_at: now,
      })
      .eq('id', gameId)
      .eq('scope', 'practice')
      .eq('ranked', false)
      .eq('status', 'waiting')
      .eq('updated_at', expectedUpdatedAt)
      .eq('host_user_id', ownerUserId)
      .is('player_two_user_id', null)
      .select(projectionSelection)
      .maybeSingle();
    throwIfServiceError(error, 'Cancel public Practice lobby');
    if (data === null) throw new PracticeCombatConflictError();
    const accepted = validateRow(data, ownerUserId);
    if (accepted.kind !== 'cancelled-waiting') throw new PracticeCombatConflictError();
    return accepted;
  }
}
