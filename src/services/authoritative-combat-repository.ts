import { z } from 'zod';

import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import { postgresTimestamptzSchema } from './postgres-timestamp';
import { ServiceError, throwIfServiceError } from './service-error';

const opaqueIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);
const publicProfileIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9._:-]+$/);
const seatSchema = z.enum(['player-one', 'player-two']);
const modeSchema = z.enum(['og', 'go']);
const difficultySchema = z.enum(['casual', 'standard', 'expert']);
const statusSchema = z.enum(['waiting', 'playing', 'holding', 'completed', 'cancelled']);
const tileStateSchema = z.enum(['correct', 'present', 'absent']);
const puzzleCountSchema = z.union([z.literal(5), z.literal(7), z.literal(10)]);
const nullablePuzzleCountSchema = puzzleCountSchema
  .nullable()
  .optional()
  .transform((value) => value ?? null);
const nullableRankedClockSchema = z
  .union([z.literal(300_000), z.null()])
  .optional()
  .transform((value) => value ?? null);
const nullableDailyPuzzleCountSchema = z
  .union([z.literal(5), z.null()])
  .optional()
  .transform((value) => value ?? null);
const nullableOwnerSeatSchema = z
  .union([z.literal('player-one'), z.null()])
  .optional()
  .transform((value) => value ?? null);
const canonicalWordSchema = z.string().regex(/^[a-z]{2,35}$/);
const renderedWordSchema = z.string().regex(/^[A-Z]{2,35}$/);
const appRatingBucketSchema = z.enum([
  'multiplayer:og',
  'multiplayer:go',
  'multiplayer:og:timed:v1',
  'multiplayer:go:timed:v1',
]);
const nullableAppRatingBucketSchema = appRatingBucketSchema
  .nullable()
  .optional()
  .transform((value) => value ?? null);

const scoredTileSchema = z
  .object({
    letter: z.string().regex(/^[A-Z]$/),
    state: tileStateSchema,
  })
  .strict();

const authoritativePlayerSchema = z
  .object({
    seat: seatSchema,
    publicProfileId: publicProfileIdSchema.optional(),
    displayName: z.string().trim().min(1).max(50),
    avatarUrl: z.url().optional(),
    accentColor: z.string().trim().min(1).max(32).optional(),
    initials: z.string().trim().min(1).max(3).optional(),
  })
  .strict();

const authoritativeMoveSchema = z
  .object({
    sequenceNo: z.number().int().positive(),
    actionId: opaqueIdSchema,
    type: z.enum(['guess', 'cancel', 'forfeit', 'timeout', 'advance']),
    seat: seatSchema.optional(),
    puzzleIndex: z.number().int().min(0).max(9).optional(),
    guess: renderedWordSchema.optional(),
    tiles: z.array(scoredTileSchema).optional(),
    pointsAwarded: z.number().int().min(0).optional(),
    createdAt: postgresTimestamptzSchema,
  })
  .strict()
  .superRefine((move, context) => {
    if (
      move.type === 'guess' &&
      (move.seat === undefined ||
        move.puzzleIndex === undefined ||
        move.guess === undefined ||
        move.tiles === undefined ||
        move.pointsAwarded === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Accepted guess actions require complete scored evidence.',
      });
    }
    if (
      move.type !== 'guess' &&
      (move.guess !== undefined || move.tiles !== undefined || move.pointsAwarded !== undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Non-guess actions cannot contain scored guess evidence.',
      });
    }
    if (
      move.type === 'guess' &&
      move.guess !== undefined &&
      move.tiles !== undefined &&
      (move.tiles.length !== move.guess.length ||
        move.tiles.map((tile) => tile.letter).join('') !== move.guess)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Accepted guess letters and scored tiles must agree.',
      });
    }
  });

const seededEvidenceSchema = z
  .object({
    sourcePuzzleIndex: z.number().int().min(0).max(9),
    label: z.string().regex(/^P(?:[1-9]|10)$/),
    guess: renderedWordSchema,
    tiles: z.array(scoredTileSchema),
    consumesAttemptSlot: z.literal(true),
    countsAsPlayerGuess: z.literal(false),
    awardsPoints: z.literal(false),
  })
  .strict()
  .superRefine((row, context) => {
    if (
      row.tiles.length !== row.guess.length ||
      row.tiles.map((tile) => tile.letter).join('') !== row.guess
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Seeded evidence letters and scored tiles must agree.',
      });
    }
  });

const playerProgressSchema = z
  .object({
    points: z.number().int().min(0),
    attemptsThisPuzzle: z.number().int().min(0).max(6),
    puzzlesSolved: z.number().int().min(0).max(10),
    timeRemainingMs: z
      .number()
      .int()
      .min(0)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
  })
  .strict();

const combatCapabilitiesSchema = z
  .object({
    canJoin: z.literal(false),
    canSubmitGuess: z.boolean(),
    canAdvance: z.boolean(),
    canCancel: z.boolean(),
    canForfeit: z.boolean(),
    canSettleRating: z.boolean(),
  })
  .strict();

const combatOutcomeSchema = z
  .object({
    terminal: z.boolean(),
    reason: z.enum(['cancelled', 'forfeit', 'timeout', 'solve', 'points', 'draw']).optional(),
    winnerSeat: seatSchema.optional(),
    forfeitedSeat: seatSchema.optional(),
    timedOutSeat: seatSchema.optional(),
  })
  .strict();

export const authoritativeCombatProjectionSchema = z
  .object({
    schemaVersion: z.literal(2),
    authorityVersion: z.literal(2),
    id: opaqueIdSchema,
    scope: z.enum(['practice', 'daily']),
    mode: modeSchema,
    sourceKind: z.enum(['ranked-queue', 'daily-lobby']),
    visibilityKind: z.enum(['public', 'restricted']),
    dailyDateKey: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    wordLength: z.number().int().min(2).max(35),
    difficulty: difficultySchema,
    hardMode: z.boolean(),
    goPuzzleCount: nullablePuzzleCountSchema,
    timeLimitMs: nullableRankedClockSchema,
    ranked: z.boolean(),
    ratingBucket: nullableAppRatingBucketSchema,
    status: statusSchema,
    version: z.number().int().min(0),
    moveCount: z.number().int().min(0),
    serverNow: postgresTimestamptzSchema,
    createdAt: postgresTimestamptzSchema,
    startedAt: postgresTimestamptzSchema.optional(),
    updatedAt: postgresTimestamptzSchema,
    endedAt: postgresTimestamptzSchema.optional(),
    turnStartedAt: postgresTimestamptzSchema.optional(),
    currentTurn: seatSchema.nullable().optional(),
    currentPuzzleIndex: z.number().int().min(0).max(9),
    attemptBudget: z.number().int().min(2).max(6),
    holdUntil: postgresTimestamptzSchema.optional(),
    viewerSeat: seatSchema,
    players: z.array(authoritativePlayerSchema).min(1).max(2),
    moves: z.array(authoritativeMoveSchema),
    seededRows: z.array(seededEvidenceSchema),
    playerState: z
      .object({
        'player-one': playerProgressSchema,
        'player-two': playerProgressSchema,
      })
      .strict(),
    capabilities: combatCapabilitiesSchema,
    outcome: combatOutcomeSchema,
    revealedAnswers: z.array(canonicalWordSchema).optional(),
    idempotent: z.boolean().optional(),
  })
  .strict()
  .superRefine((projection, context) => {
    const puzzleCount = projection.mode === 'go' ? projection.goPuzzleCount : 1;
    const acceptedMoves = projection.moves.filter((move) => move.type === 'guess');
    const expectedBudget = Math.max(2, 6 - projection.currentPuzzleIndex);
    if (
      puzzleCount === null ||
      (projection.mode === 'og' && projection.goPuzzleCount !== null) ||
      (projection.mode === 'go' && projection.goPuzzleCount === null) ||
      projection.currentPuzzleIndex >= puzzleCount
    ) {
      context.addIssue({
        code: 'custom',
        message: 'COMBAT mode, puzzle count, and active puzzle must agree.',
      });
    }
    if (
      projection.attemptBudget !== expectedBudget ||
      (projection.mode === 'og' && projection.attemptBudget !== 6)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'COMBAT attempt budget does not match the shared GO policy.',
      });
    }
    if (acceptedMoves.length !== projection.moveCount) {
      context.addIssue({
        code: 'custom',
        message: 'COMBAT move count must equal accepted player guesses.',
      });
    }
    if (
      projection.players.some(
        (player, index) =>
          projection.players.findIndex((candidate) => candidate.seat === player.seat) !== index,
      ) ||
      !projection.players.some((player) => player.seat === projection.viewerSeat)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'COMBAT participant seats must be unique and include the viewer.',
      });
    }
    if (
      projection.moves.some(
        (move) =>
          move.type === 'guess' &&
          (move.guess?.length !== projection.wordLength ||
            move.tiles?.length !== projection.wordLength),
      ) ||
      projection.seededRows.some(
        (row) =>
          row.guess.length !== projection.wordLength || row.tiles.length !== projection.wordLength,
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'COMBAT evidence must match the configured word length.',
      });
    }
    if (
      projection.seededRows.length !==
        (projection.mode === 'go' ? projection.currentPuzzleIndex : 0) ||
      projection.seededRows.some(
        (row, index) =>
          row.sourcePuzzleIndex !== index || row.label !== `P${row.sourcePuzzleIndex + 1}`,
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'GO seeded evidence must cover every prior puzzle exactly once.',
      });
    }
    if (projection.status !== 'completed' && projection.revealedAnswers !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Active and cancelled COMBAT projections cannot reveal answers.',
      });
    }
    if (
      projection.status === 'completed' &&
      (projection.revealedAnswers === undefined ||
        projection.revealedAnswers.length !== puzzleCount ||
        projection.revealedAnswers.some((answer) => answer.length !== projection.wordLength))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Completed participant projections require the complete answer evidence.',
      });
    }
    if (
      projection.scope === 'daily' &&
      (projection.ranked ||
        projection.sourceKind !== 'daily-lobby' ||
        projection.visibilityKind !== 'restricted' ||
        projection.wordLength !== 5 ||
        projection.difficulty !== 'expert' ||
        projection.dailyDateKey === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Unranked Daily authority must remain fixed-five and restricted.',
      });
    }
    if (
      projection.scope === 'practice' &&
      (!projection.ranked ||
        projection.sourceKind !== 'ranked-queue' ||
        projection.visibilityKind !== 'public' ||
        projection.dailyDateKey !== undefined ||
        projection.ratingBucket === null)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Authoritative Practice v2 must be a ranked public reservation.',
      });
    }
  });

export type AuthoritativeCombatProjection = z.infer<typeof authoritativeCombatProjectionSchema>;
export type AuthoritativeCombatMove = AuthoritativeCombatProjection['moves'][number];
export type AuthoritativeGuessMove = AuthoritativeCombatMove & {
  readonly type: 'guess';
  readonly seat: 'player-one' | 'player-two';
  readonly puzzleIndex: number;
  readonly guess: string;
  readonly tiles: NonNullable<AuthoritativeCombatMove['tiles']>;
  readonly pointsAwarded: number;
};

export const rankedPracticeQueueSchema = z
  .object({
    schemaVersion: z.literal(2),
    requestId: opaqueIdSchema,
    status: z.enum(['queued', 'matched', 'cancelled', 'expired']),
    matchedGameId: opaqueIdSchema.nullable().optional(),
    queuedAt: postgresTimestamptzSchema.optional(),
    matchedAt: postgresTimestamptzSchema.optional(),
    expiresAt: postgresTimestamptzSchema.optional(),
    idempotent: z.boolean().optional(),
  })
  .strict();

export type RankedPracticeQueue = z.infer<typeof rankedPracticeQueueSchema>;

export const unrankedDailyLobbySchema = z
  .object({
    schemaVersion: z.literal(2),
    authorityVersion: z.literal(2),
    id: opaqueIdSchema,
    scope: z.literal('daily'),
    mode: modeSchema,
    dailyDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.literal('waiting'),
    version: z.number().int().min(0),
    moveCount: z.literal(0),
    wordLength: z.literal(5),
    difficulty: z.literal('expert'),
    hardMode: z.boolean(),
    goPuzzleCount: nullableDailyPuzzleCountSchema,
    ranked: z.literal(false),
    viewerSeat: nullableOwnerSeatSchema,
    owner: z
      .object({
        publicProfileId: publicProfileIdSchema.optional(),
        displayName: z.string().trim().min(1).max(50),
        avatarUrl: z.url().optional(),
        accentColor: z.string().trim().min(1).max(32).optional(),
      })
      .strict(),
    createdAt: postgresTimestamptzSchema,
    updatedAt: postgresTimestamptzSchema,
    capabilities: z
      .object({
        canJoin: z.boolean(),
        canCancel: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((lobby, context) => {
    if (
      (lobby.mode === 'og' && lobby.goPuzzleCount !== null) ||
      (lobby.mode === 'go' && lobby.goPuzzleCount !== 5) ||
      lobby.capabilities.canJoin === lobby.capabilities.canCancel ||
      (lobby.viewerSeat === 'player-one' && !lobby.capabilities.canCancel) ||
      (lobby.viewerSeat === null && !lobby.capabilities.canJoin)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Unranked Daily lobby capabilities or puzzle count are inconsistent.',
      });
    }
  });

export type UnrankedDailyLobby = z.infer<typeof unrankedDailyLobbySchema>;

export const rankedPracticeSettlementSchema = z
  .object({
    schemaVersion: z.literal(2),
    matchResultId: opaqueIdSchema,
    bucket: appRatingBucketSchema,
    outcome: z.enum(['win', 'loss', 'draw']),
    oldRating: z.number().int().min(0),
    newRating: z.number().int().min(0),
    ratingDelta: z.number().int(),
    idempotent: z.boolean(),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.oldRating + result.ratingDelta !== result.newRating) {
      context.addIssue({
        code: 'custom',
        message: 'Ranked settlement rating arithmetic is inconsistent.',
      });
    }
  });

export type RankedPracticeSettlement = z.infer<typeof rankedPracticeSettlementSchema>;

export const authoritativeLeaderboardRowSchema = z
  .object({
    rank: z.number().int().positive(),
    publicProfileId: publicProfileIdSchema,
    displayName: z.string().trim().min(1).max(50),
    avatarUrl: z.url().nullable().optional(),
    accentColor: z.string().trim().min(1).max(32).nullable().optional(),
    rating: z.number().int().min(0),
    gamesPlayed: z.number().int().min(0),
    wins: z.number().int().min(0),
    losses: z.number().int().min(0),
    draws: z.number().int().min(0),
    provisional: z.boolean(),
    updatedAt: postgresTimestamptzSchema,
  })
  .strict()
  .superRefine((row, context) => {
    if (row.wins + row.losses + row.draws !== row.gamesPlayed) {
      context.addIssue({
        code: 'custom',
        message: 'Leaderboard outcome totals must equal games played.',
      });
    }
  });

export type AuthoritativeLeaderboardRow = z.infer<typeof authoritativeLeaderboardRowSchema>;

type RpcResult = Readonly<{
  data: unknown;
  error: { message: string; code?: string | undefined } | null;
}>;

type RpcCaller = (name: string, args?: Record<string, unknown>) => Promise<RpcResult>;

function rpcCaller(client: AmordleSupabaseClient): RpcCaller {
  return client.rpc.bind(client) as unknown as RpcCaller;
}

async function callRpc(
  client: AmordleSupabaseClient,
  name: string,
  args: Record<string, unknown>,
  operation: string,
): Promise<unknown> {
  const { data, error } = await rpcCaller(client)(name, args);
  throwIfServiceError(error, operation);
  return data;
}

export class AuthoritativeCombatRepository {
  constructor(private readonly client: AmordleSupabaseClient) {}

  async createRankedPracticeRequest(input: {
    mode: 'og' | 'go';
    wordLength: number;
    difficulty: 'casual' | 'standard' | 'expert';
    hardMode: boolean;
    goPuzzleCount: 5 | 7 | 10;
    timeLimitMs: 300_000 | null;
    creationKey: string;
    expiresAt?: string;
  }): Promise<RankedPracticeQueue> {
    const safe = z
      .object({
        mode: modeSchema,
        wordLength: z.number().int().min(2).max(35),
        difficulty: difficultySchema,
        hardMode: z.boolean(),
        goPuzzleCount: puzzleCountSchema,
        timeLimitMs: z.union([z.literal(300_000), z.null()]),
        creationKey: opaqueIdSchema,
        expiresAt: postgresTimestamptzSchema.optional(),
      })
      .strict()
      .parse(input);
    return rankedPracticeQueueSchema.parse(
      await callRpc(
        this.client,
        'create_amordle_ranked_practice_request_v2',
        {
          p_mode: safe.mode,
          p_word_length: safe.wordLength,
          p_difficulty: safe.difficulty,
          p_hard_mode: safe.hardMode,
          p_go_puzzle_count: safe.mode === 'go' ? safe.goPuzzleCount : null,
          p_time_limit_ms: safe.timeLimitMs,
          p_creation_key: safe.creationKey,
          ...(safe.expiresAt === undefined ? {} : { p_expires_at: safe.expiresAt }),
        },
        'Create authoritative Ranked Practice request',
      ),
    );
  }

  async getRankedPracticeStatus(requestId: string): Promise<RankedPracticeQueue> {
    return rankedPracticeQueueSchema.parse(
      await callRpc(
        this.client,
        'get_amordle_ranked_practice_status_v2',
        { p_request_id: opaqueIdSchema.parse(requestId) },
        'Load authoritative Ranked Practice status',
      ),
    );
  }

  async claimRankedPractice(input: {
    requestId: string;
    actionId: string;
  }): Promise<RankedPracticeQueue> {
    return rankedPracticeQueueSchema.parse(
      await callRpc(
        this.client,
        'claim_amordle_ranked_practice_v2',
        {
          p_request_id: opaqueIdSchema.parse(input.requestId),
          p_action_id: opaqueIdSchema.parse(input.actionId),
        },
        'Claim authoritative Ranked Practice opponent',
      ),
    );
  }

  async cancelRankedPractice(input: {
    requestId: string;
    actionId: string;
  }): Promise<RankedPracticeQueue> {
    return rankedPracticeQueueSchema.parse(
      await callRpc(
        this.client,
        'cancel_amordle_ranked_practice_v2',
        {
          p_request_id: opaqueIdSchema.parse(input.requestId),
          p_action_id: opaqueIdSchema.parse(input.actionId),
        },
        'Cancel authoritative Ranked Practice request',
      ),
    );
  }

  async finalizeRankedPractice(input: {
    requestId: string;
    gameId: string;
    actionId: string;
  }): Promise<AuthoritativeCombatProjection> {
    return authoritativeCombatProjectionSchema.parse(
      await callRpc(
        this.client,
        'finalize_amordle_ranked_practice_v2',
        {
          p_request_id: opaqueIdSchema.parse(input.requestId),
          p_game_id: opaqueIdSchema.parse(input.gameId),
          p_action_id: opaqueIdSchema.parse(input.actionId),
        },
        'Finalize authoritative Ranked Practice game',
      ),
    );
  }

  async createUnrankedDailyLobby(input: {
    mode: 'og' | 'go';
    hardMode: boolean;
    creationKey: string;
  }): Promise<AuthoritativeCombatProjection> {
    return authoritativeCombatProjectionSchema.parse(
      await callRpc(
        this.client,
        'create_amordle_unranked_daily_lobby_v2',
        {
          p_mode: modeSchema.parse(input.mode),
          p_hard_mode: z.boolean().parse(input.hardMode),
          p_creation_key: opaqueIdSchema.parse(input.creationKey),
        },
        'Create authoritative unranked Daily lobby',
      ),
    );
  }

  async listUnrankedDailyLobbies(input?: {
    mode?: 'og' | 'go';
    limit?: number;
  }): Promise<UnrankedDailyLobby[]> {
    return z.array(unrankedDailyLobbySchema).parse(
      await callRpc(
        this.client,
        'list_amordle_unranked_daily_lobbies_v2',
        {
          p_mode: input?.mode ?? null,
          p_limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .parse(input?.limit ?? 25),
        },
        'List authoritative unranked Daily lobbies',
      ),
    );
  }

  async joinUnrankedDailyLobby(input: {
    gameId: string;
    actionId: string;
    expectedVersion: number;
  }): Promise<AuthoritativeCombatProjection> {
    return authoritativeCombatProjectionSchema.parse(
      await callRpc(
        this.client,
        'join_amordle_unranked_daily_lobby_v2',
        {
          p_game_id: opaqueIdSchema.parse(input.gameId),
          p_action_id: opaqueIdSchema.parse(input.actionId),
          p_expected_version: z.number().int().min(0).parse(input.expectedVersion),
        },
        'Join authoritative unranked Daily lobby',
      ),
    );
  }

  async cancelUnrankedDailyLobby(input: {
    gameId: string;
    actionId: string;
    expectedVersion: number;
  }): Promise<AuthoritativeCombatProjection> {
    return authoritativeCombatProjectionSchema.parse(
      await callRpc(
        this.client,
        'cancel_amordle_unranked_daily_lobby_v2',
        {
          p_game_id: opaqueIdSchema.parse(input.gameId),
          p_action_id: opaqueIdSchema.parse(input.actionId),
          p_expected_version: z.number().int().min(0).parse(input.expectedVersion),
        },
        'Cancel authoritative unranked Daily lobby',
      ),
    );
  }

  async getGame(gameId: string): Promise<AuthoritativeCombatProjection> {
    return authoritativeCombatProjectionSchema.parse(
      await callRpc(
        this.client,
        'get_amordle_combat_game_v2',
        { p_game_id: opaqueIdSchema.parse(gameId) },
        'Load authoritative COMBAT game',
      ),
    );
  }

  async listActive(limit = 50): Promise<AuthoritativeCombatProjection[]> {
    const projections = z
      .array(authoritativeCombatProjectionSchema)
      .parse(
        await callRpc(
          this.client,
          'list_amordle_combat_active_v2',
          { p_limit: z.number().int().min(1).max(100).parse(limit) },
          'List authoritative COMBAT games',
        ),
      );
    return projections.filter(
      (projection) =>
        projection.status === 'waiting' ||
        projection.status === 'playing' ||
        projection.status === 'holding',
    );
  }

  async saveCommand(input: {
    gameId: string;
    actionId: string;
    expectedVersion: number;
    expectedMoveCount: number;
    command: 'guess' | 'cancel' | 'forfeit' | 'advance' | 'timeout';
    guess?: string;
  }): Promise<AuthoritativeCombatProjection> {
    const safe = z
      .object({
        gameId: opaqueIdSchema,
        actionId: opaqueIdSchema,
        expectedVersion: z.number().int().min(0),
        expectedMoveCount: z.number().int().min(0),
        command: z.enum(['guess', 'cancel', 'forfeit', 'advance', 'timeout']),
        guess: z
          .string()
          .trim()
          .regex(/^[A-Za-z]{2,35}$/)
          .optional(),
      })
      .strict()
      .superRefine((command, context) => {
        if (
          (command.command === 'guess' && command.guess === undefined) ||
          (command.command !== 'guess' && command.guess !== undefined)
        ) {
          context.addIssue({
            code: 'custom',
            message: 'Only guess commands contain guess text.',
          });
        }
      })
      .parse(input);
    return authoritativeCombatProjectionSchema.parse(
      await callRpc(
        this.client,
        'save_amordle_combat_command_v2',
        {
          p_game_id: safe.gameId,
          p_action_id: safe.actionId,
          p_expected_version: safe.expectedVersion,
          p_expected_move_count: safe.expectedMoveCount,
          p_command: safe.command,
          p_guess: safe.guess?.toLocaleLowerCase('en-US') ?? null,
        },
        'Save authoritative COMBAT command',
      ),
    );
  }

  async settleRankedPractice(input: {
    gameId: string;
    actionId: string;
  }): Promise<RankedPracticeSettlement> {
    return rankedPracticeSettlementSchema.parse(
      await callRpc(
        this.client,
        'settle_amordle_ranked_practice_v2',
        {
          p_game_id: opaqueIdSchema.parse(input.gameId),
          p_action_id: opaqueIdSchema.parse(input.actionId),
        },
        'Settle authoritative Ranked Practice',
      ),
    );
  }

  async getPracticeLeaderboard(input: {
    bucket: z.infer<typeof appRatingBucketSchema>;
    limit?: number;
    offset?: number;
  }): Promise<AuthoritativeLeaderboardRow[]> {
    return z.array(authoritativeLeaderboardRowSchema).parse(
      await callRpc(
        this.client,
        'get_amordle_practice_leaderboard_v2',
        {
          p_app_bucket: appRatingBucketSchema.parse(input.bucket),
          p_limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .parse(input.limit ?? 50),
          p_offset: z
            .number()
            .int()
            .min(0)
            .parse(input.offset ?? 0),
        },
        'Load authoritative Practice leaderboard',
      ),
    );
  }
}

export function authoritativeGuessMoves(
  projection: AuthoritativeCombatProjection,
): readonly AuthoritativeGuessMove[] {
  return projection.moves.filter(
    (move): move is AuthoritativeGuessMove =>
      move.type === 'guess' &&
      move.seat !== undefined &&
      move.puzzleIndex !== undefined &&
      move.guess !== undefined &&
      move.tiles !== undefined &&
      move.pointsAwarded !== undefined,
  );
}

export function authoritativeClockRemainingMs(
  projection: AuthoritativeCombatProjection,
  seat: 'player-one' | 'player-two',
  now = Date.now(),
): number | null {
  const stored = projection.playerState[seat].timeRemainingMs;
  if (stored === null) return null;
  if (
    projection.status !== 'playing' ||
    projection.currentTurn !== seat ||
    projection.turnStartedAt === undefined
  ) {
    return stored;
  }
  const elapsedSinceServerSnapshot = Math.max(0, now - Date.parse(projection.serverNow));
  const elapsedBeforeSnapshot = Math.max(
    0,
    Date.parse(projection.serverNow) - Date.parse(projection.turnStartedAt),
  );
  return Math.max(0, stored - elapsedBeforeSnapshot - elapsedSinceServerSnapshot);
}

export function assertNoSensitiveCombatProjection(value: unknown): void {
  const serialized = JSON.stringify(value).toLocaleLowerCase('en-US');
  const forbiddenKeys = [
    '"answer"',
    '"answers"',
    '"answerseed"',
    '"seed"',
    '"email"',
    '"userid"',
    '"authuuid"',
    '"session"',
  ];
  if (forbiddenKeys.some((key) => serialized.includes(key))) {
    throw new ServiceError(
      'validation',
      'The COMBAT boundary returned forbidden private authority material.',
      { retryable: false },
    );
  }
}
