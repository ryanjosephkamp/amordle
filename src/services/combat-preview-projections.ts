import { z } from 'zod';
import { nullablePostgresTimestamptzSchema, postgresTimestamptzSchema } from './postgres-timestamp';

const opaqueIdSchema = z.string().trim().min(1).max(200);
const isoTimestampSchema = postgresTimestamptzSchema;
const nullableTimestampSchema = nullablePostgresTimestamptzSchema;
const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Daily date keys must be real ISO calendar dates.');

export const combatSeatSchema = z.enum(['player-one', 'player-two']);
export const combatStatusSchema = z.enum([
  'waiting',
  'playing',
  'won',
  'lost',
  'expired',
  'cancelled',
]);
export const combatModeSchema = z.enum(['og', 'go']);
export const combatScopeSchema = z.enum(['practice', 'daily']);
export const combatDifficultySchema = z.enum([
  'easy',
  'medium',
  'hard',
  'casual',
  'standard',
  'expert',
]);

const tileSchema = z
  .object({
    letter: z.string().regex(/^[a-z]$/),
    state: z.enum(['absent', 'present', 'correct']),
    position: z.number().int().min(0).max(34).optional(),
  })
  .strict();

const moveSchema = z
  .object({
    id: opaqueIdSchema,
    createdAt: isoTimestampSchema,
    guess: z.string().regex(/^[a-z]{2,35}$/),
    playerId: combatSeatSchema,
    puzzleIndex: z.number().int().min(0).max(9),
    tiles: z.array(tileSchema).min(2).max(35),
  })
  .strict()
  .superRefine((move, context) => {
    if (move.guess.length !== move.tiles.length) {
      context.addIssue({
        code: 'custom',
        message: 'COMBAT move tiles must match the submitted guess length.',
      });
    }
    for (const [index, tile] of move.tiles.entries()) {
      if (tile.letter !== move.guess[index]) {
        context.addIssue({
          code: 'custom',
          message: 'COMBAT move tile letters must match the submitted guess.',
          path: ['tiles', index, 'letter'],
        });
      }
      if (tile.position !== undefined && tile.position !== index) {
        context.addIssue({
          code: 'custom',
          message: 'COMBAT move tile positions must be contiguous.',
          path: ['tiles', index, 'position'],
        });
      }
    }
  });

const playerIdsSchema = z
  .object({
    'player-one': z.string().uuid(),
    'player-two': z.string().uuid().nullable(),
  })
  .strict();

const timeRemainingSchema = z
  .object({
    'player-one': z.number().int().min(0),
    'player-two': z.number().int().min(0),
  })
  .strict();

const rawProjectionSchema = z
  .object({
    id: opaqueIdSchema,
    scope: combatScopeSchema,
    mode: combatModeSchema,
    ranked: z.boolean(),
    ratingBucket: z.string().trim().min(1).max(100).nullable().optional(),
    wordLength: z.number().int().min(2).max(35),
    difficulty: combatDifficultySchema,
    hardMode: z.boolean(),
    timeLimitMs: z.number().int().positive().nullable().optional(),
    customGameCode: z.string().trim().min(1).max(100).nullable().optional(),
    dailyDateKey: dateKeySchema.nullable().optional(),
    goPuzzleCount: z
      .union([z.literal(5), z.literal(7), z.literal(10)])
      .nullable()
      .optional(),
    playerUserIds: playerIdsSchema,
    matchmakingRequestId: opaqueIdSchema.nullable().optional(),
    status: combatStatusSchema,
    currentTurn: combatSeatSchema,
    moves: z.array(moveSchema).max(120),
    authorityVersion: z.number().int().min(0).optional(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    deadlineAt: nullableTimestampSchema.optional(),
    endedAt: nullableTimestampSchema.optional(),
    winnerId: combatSeatSchema.nullable().optional(),
    forfeitedPlayerId: combatSeatSchema.nullable().optional(),
    timedOutPlayerId: combatSeatSchema.nullable().optional(),
    timeRemainingMs: timeRemainingSchema.optional(),
    turnStartedAt: nullableTimestampSchema.optional(),
  })
  .strict()
  .superRefine((projection, context) => {
    if (projection.mode === 'go' && projection.goPuzzleCount == null) {
      context.addIssue({ code: 'custom', message: 'GO COMBAT requires a chain count.' });
    }
    if (projection.mode === 'og' && projection.goPuzzleCount != null) {
      context.addIssue({ code: 'custom', message: 'OG COMBAT cannot contain a chain count.' });
    }
    if (projection.moves.some((move) => move.guess.length !== projection.wordLength)) {
      context.addIssue({
        code: 'custom',
        message: 'Every COMBAT move must match the configured word length.',
      });
    }
    if (projection.status === 'waiting') {
      if (
        projection.scope !== 'practice' ||
        projection.ranked ||
        projection.playerUserIds['player-two'] !== null ||
        projection.moves.length !== 0
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Waiting projections must be answerless unranked Practice games.',
        });
      }
    } else if (projection.playerUserIds['player-two'] === null) {
      context.addIssue({
        code: 'custom',
        message: 'Started and terminal projections require both participants.',
      });
    }
    if (projection.scope === 'daily') {
      const expectedBucket =
        projection.mode === 'og' ? 'multiplayer:og:daily:v1' : 'multiplayer:go:daily:v1';
      if (
        !projection.ranked ||
        projection.wordLength !== 5 ||
        projection.difficulty !== 'expert' ||
        projection.dailyDateKey == null ||
        projection.timeLimitMs != null ||
        projection.ratingBucket !== expectedBucket ||
        projection.authorityVersion === undefined ||
        (projection.mode === 'go' && projection.goPuzzleCount !== 5)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Ranked Daily projection settings do not match server authority.',
        });
      }
    }
    if (projection.scope === 'practice' && projection.dailyDateKey != null) {
      context.addIssue({
        code: 'custom',
        message: 'Practice projections cannot contain a Daily date key.',
      });
    }
    if (
      ['won', 'lost', 'expired', 'cancelled'].includes(projection.status) &&
      projection.endedAt == null
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Terminal COMBAT projections require an end timestamp.',
      });
    }
  });

const FORBIDDEN_REMOTE_KEYS = new Set([
  'answer',
  'answers',
  'seed',
  'serializedsession',
  'playersessions',
  'email',
  'accesstoken',
  'refreshtoken',
  'servicekey',
  'servicerolekey',
  'authid',
  'authuserid',
  'privatesession',
]);

function normalizedKey(key: string): string {
  return key.replaceAll(/[^a-z0-9]/gi, '').toLowerCase();
}

export function assertNoPrivateCombatFields(value: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    nodes += 1;
    if (nodes > 2_000 || current.depth > 12) {
      throw new Error('COMBAT projection exceeds the safe inspection boundary.');
    }
    if (current.value === null || typeof current.value !== 'object') continue;
    if (seen.has(current.value)) throw new Error('COMBAT projection cannot contain cycles.');
    seen.add(current.value);
    if (Array.isArray(current.value)) {
      for (const item of current.value) {
        pending.push({ value: item, depth: current.depth + 1 });
      }
      continue;
    }
    for (const [key, nested] of Object.entries(current.value)) {
      if (FORBIDDEN_REMOTE_KEYS.has(normalizedKey(key))) {
        throw new Error(`COMBAT projection contains forbidden private field "${key}".`);
      }
      pending.push({ value: nested, depth: current.depth + 1 });
    }
  }
}

export type CombatSeat = z.infer<typeof combatSeatSchema>;
export type CombatStatus = z.infer<typeof combatStatusSchema>;
export type CombatMove = z.infer<typeof moveSchema>;

export type CombatCapabilities = Readonly<{
  canJoin: boolean;
  canSubmit: boolean;
  canCancel: boolean;
  canForfeit: boolean;
  canRequestRematch: boolean;
  canEditDraft: boolean;
  readOnly: boolean;
}>;

export function deriveCombatCapabilities(input: {
  status: CombatStatus;
  viewerSeat: CombatSeat | null;
  currentTurn: CombatSeat;
  moveCount: number;
  hasOpenSeat: boolean;
  scope: 'practice' | 'daily';
}): CombatCapabilities {
  const participant = input.viewerSeat !== null;
  const playing = input.status === 'playing';
  const terminal = ['won', 'lost', 'expired', 'cancelled'].includes(input.status);
  const canSubmit = participant && playing && input.currentTurn === input.viewerSeat;
  const canJoin = !participant && input.status === 'waiting' && input.hasOpenSeat;
  const canCancel =
    participant && (input.status === 'waiting' || (playing && input.moveCount === 0));
  const canForfeit = participant && playing && input.moveCount > 0;
  return {
    canJoin,
    canSubmit,
    canCancel,
    canForfeit,
    canRequestRematch: participant && terminal && input.scope === 'practice',
    canEditDraft: canSubmit,
    readOnly: !canJoin && !canSubmit && !canCancel && !canForfeit,
  };
}

export type CombatProjection = Readonly<{
  kind: 'waiting' | 'participant' | 'ranked-daily';
  id: string;
  scope: 'practice' | 'daily';
  mode: 'og' | 'go';
  ranked: boolean;
  ratingBucket: string | null;
  wordLength: number;
  difficulty: z.infer<typeof combatDifficultySchema>;
  hardMode: boolean;
  timeLimitMs: number | null;
  dailyDateKey: string | null;
  goPuzzleCount: 5 | 7 | 10 | null;
  status: CombatStatus;
  currentTurn: CombatSeat;
  moves: readonly CombatMove[];
  authorityVersion: number | null;
  createdAt: string;
  updatedAt: string;
  deadlineAt: string | null;
  endedAt: string | null;
  winnerId: CombatSeat | null;
  forfeitedPlayerId: CombatSeat | null;
  timedOutPlayerId: CombatSeat | null;
  timeRemainingMs: Readonly<Record<CombatSeat, number>> | null;
  turnStartedAt: string | null;
  viewerSeat: CombatSeat | null;
  capabilities: CombatCapabilities;
}>;

export function parseCombatProjection(value: unknown, viewerUserId?: string): CombatProjection {
  assertNoPrivateCombatFields(value);
  const projection = rawProjectionSchema.parse(value);
  const safeViewerId =
    viewerUserId === undefined ? undefined : z.string().uuid().parse(viewerUserId);
  const viewerSeat =
    safeViewerId === projection.playerUserIds['player-one']
      ? 'player-one'
      : safeViewerId === projection.playerUserIds['player-two']
        ? 'player-two'
        : null;
  const kind =
    projection.status === 'waiting'
      ? 'waiting'
      : projection.scope === 'daily'
        ? 'ranked-daily'
        : 'participant';
  const capabilities = deriveCombatCapabilities({
    status: projection.status,
    viewerSeat,
    currentTurn: projection.currentTurn,
    moveCount: projection.moves.length,
    hasOpenSeat: projection.playerUserIds['player-two'] === null,
    scope: projection.scope,
  });

  return {
    kind,
    id: projection.id,
    scope: projection.scope,
    mode: projection.mode,
    ranked: projection.ranked,
    ratingBucket: projection.ratingBucket ?? null,
    wordLength: projection.wordLength,
    difficulty: projection.difficulty,
    hardMode: projection.hardMode,
    timeLimitMs: projection.timeLimitMs ?? null,
    dailyDateKey: projection.dailyDateKey ?? null,
    goPuzzleCount: projection.goPuzzleCount ?? null,
    status: projection.status,
    currentTurn: projection.currentTurn,
    moves: projection.moves,
    authorityVersion: projection.authorityVersion ?? null,
    createdAt: projection.createdAt,
    updatedAt: projection.updatedAt,
    deadlineAt: projection.deadlineAt ?? null,
    endedAt: projection.endedAt ?? null,
    winnerId: projection.winnerId ?? null,
    forfeitedPlayerId: projection.forfeitedPlayerId ?? null,
    timedOutPlayerId: projection.timedOutPlayerId ?? null,
    timeRemainingMs: projection.timeRemainingMs ?? null,
    turnStartedAt: projection.turnStartedAt ?? null,
    viewerSeat,
    capabilities,
  };
}

const legacySummarySchema = z
  .object({
    id: opaqueIdSchema,
    scope: combatScopeSchema,
    mode: combatModeSchema,
    daily_date_key: dateKeySchema.nullable(),
    status: combatStatusSchema,
    current_turn: combatSeatSchema,
    word_length: z.number().int().min(2).max(35),
    difficulty: combatDifficultySchema,
    go_puzzle_count: z.union([z.literal(5), z.literal(7), z.literal(10)]).nullable(),
    ranked: z.boolean(),
    rating_bucket: z.string().trim().min(1).max(100).nullable(),
    custom_game_code: z.string().trim().min(1).max(100).nullable(),
    deadline_at: nullableTimestampSchema,
    ended_at: nullableTimestampSchema,
    winner_player_id: combatSeatSchema.nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
  })
  .strict();

export type LegacyCombatSummary = Readonly<{
  kind: 'legacy-read-only';
  id: string;
  scope: 'practice' | 'daily';
  mode: 'og' | 'go';
  status: CombatStatus;
  currentTurn: CombatSeat;
  wordLength: number;
  difficulty: z.infer<typeof combatDifficultySchema>;
  goPuzzleCount: 5 | 7 | 10 | null;
  ranked: boolean;
  ratingBucket: string | null;
  dailyDateKey: string | null;
  deadlineAt: string | null;
  endedAt: string | null;
  winnerId: CombatSeat | null;
  createdAt: string;
  updatedAt: string;
  capabilities: CombatCapabilities;
}>;

export function parseLegacyCombatSummary(value: unknown): LegacyCombatSummary {
  assertNoPrivateCombatFields(value);
  const row = legacySummarySchema.parse(value);
  return {
    kind: 'legacy-read-only',
    id: row.id,
    scope: row.scope,
    mode: row.mode,
    status: row.status,
    currentTurn: row.current_turn,
    wordLength: row.word_length,
    difficulty: row.difficulty,
    goPuzzleCount: row.go_puzzle_count,
    ranked: row.ranked,
    ratingBucket: row.rating_bucket,
    dailyDateKey: row.daily_date_key,
    deadlineAt: row.deadline_at,
    endedAt: row.ended_at,
    winnerId: row.winner_player_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    capabilities: deriveCombatCapabilities({
      status: row.status,
      viewerSeat: null,
      currentTurn: row.current_turn,
      moveCount: 0,
      hasOpenSeat: false,
      scope: row.scope,
    }),
  };
}

const privateProfileSchema = z
  .object({
    identityAvailable: z.boolean(),
    publicProfileId: z.string().uuid().nullable(),
    displayName: z.string().trim().min(1).max(50).nullable(),
    accentColor: z.string().trim().min(1).max(30).nullable(),
    flairKey: z.string().trim().min(1).max(100).nullable(),
    avatarUrl: z.string().url().max(2048).nullable(),
    profileUpdatedAt: nullableTimestampSchema,
  })
  .strict()
  .superRefine((profile, context) => {
    const required = [
      profile.publicProfileId,
      profile.displayName,
      profile.accentColor,
      profile.flairKey,
      profile.profileUpdatedAt,
    ];
    if (profile.identityAvailable !== required.every((value) => value !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Private-request profile availability is inconsistent.',
      });
    }
  });

const privateRequestRawSchema = z
  .object({
    request_id: opaqueIdSchema,
    request_status: z.enum(['requested', 'created', 'declined', 'cancelled', 'expired']),
    viewer_role: z.enum(['requester', 'opponent', 'participant']),
    viewer_can_accept: z.boolean(),
    viewer_can_cancel: z.boolean(),
    viewer_can_decline: z.boolean(),
    mode: combatModeSchema,
    word_length: z.number().int().min(2).max(35),
    hard_mode: z.boolean(),
    time_limit_ms: z.number().int().positive().nullable(),
    go_puzzle_count: z.union([z.literal(5), z.literal(7), z.literal(10)]).nullable(),
    created_game_id: opaqueIdSchema.nullable(),
    created_at: isoTimestampSchema,
    expires_at: isoTimestampSchema,
    responded_at: nullableTimestampSchema,
    updated_at: isoTimestampSchema,
    created: z.boolean(),
    idempotent: z.boolean(),
    requester_identity_available: z.boolean(),
    requester_public_profile_id: z.string().uuid().nullable(),
    requester_display_name: z.string().trim().min(1).max(50).nullable(),
    requester_accent_color: z.string().trim().min(1).max(30).nullable(),
    requester_flair_key: z.string().trim().min(1).max(100).nullable(),
    requester_avatar_url: z.string().url().max(2048).nullable(),
    requester_profile_updated_at: nullableTimestampSchema,
    opponent_identity_available: z.boolean(),
    opponent_public_profile_id: z.string().uuid().nullable(),
    opponent_display_name: z.string().trim().min(1).max(50).nullable(),
    opponent_accent_color: z.string().trim().min(1).max(30).nullable(),
    opponent_flair_key: z.string().trim().min(1).max(100).nullable(),
    opponent_avatar_url: z.string().url().max(2048).nullable(),
    opponent_profile_updated_at: nullableTimestampSchema,
  })
  .strict();

export type PrivateRequestProjection = Readonly<{
  requestId: string;
  status: z.infer<typeof privateRequestRawSchema>['request_status'];
  viewerRole: z.infer<typeof privateRequestRawSchema>['viewer_role'];
  capabilities: Readonly<{ canAccept: boolean; canCancel: boolean; canDecline: boolean }>;
  mode: 'og' | 'go';
  wordLength: number;
  hardMode: boolean;
  timeLimitMs: number | null;
  goPuzzleCount: 5 | 7 | 10 | null;
  createdGameId: string | null;
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  updatedAt: string;
  requester: z.infer<typeof privateProfileSchema>;
  opponent: z.infer<typeof privateProfileSchema>;
}>;

export function parsePrivateRequestProjection(value: unknown): PrivateRequestProjection {
  assertNoPrivateCombatFields(value);
  const row = privateRequestRawSchema.parse(value);
  const requester = privateProfileSchema.parse({
    identityAvailable: row.requester_identity_available,
    publicProfileId: row.requester_public_profile_id,
    displayName: row.requester_display_name,
    accentColor: row.requester_accent_color,
    flairKey: row.requester_flair_key,
    avatarUrl: row.requester_avatar_url,
    profileUpdatedAt: row.requester_profile_updated_at,
  });
  const opponent = privateProfileSchema.parse({
    identityAvailable: row.opponent_identity_available,
    publicProfileId: row.opponent_public_profile_id,
    displayName: row.opponent_display_name,
    accentColor: row.opponent_accent_color,
    flairKey: row.opponent_flair_key,
    avatarUrl: row.opponent_avatar_url,
    profileUpdatedAt: row.opponent_profile_updated_at,
  });
  return {
    requestId: row.request_id,
    status: row.request_status,
    viewerRole: row.viewer_role,
    capabilities: {
      canAccept:
        row.request_status === 'requested' &&
        row.viewer_role === 'opponent' &&
        row.viewer_can_accept,
      canCancel:
        row.request_status === 'requested' &&
        row.viewer_role === 'requester' &&
        row.viewer_can_cancel,
      canDecline:
        row.request_status === 'requested' &&
        row.viewer_role === 'opponent' &&
        row.viewer_can_decline,
    },
    mode: row.mode,
    wordLength: row.word_length,
    hardMode: row.hard_mode,
    timeLimitMs: row.time_limit_ms,
    goPuzzleCount: row.go_puzzle_count,
    createdGameId: row.created_game_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    respondedAt: row.responded_at,
    updatedAt: row.updated_at,
    requester,
    opponent,
  };
}

const rematchRawSchema = z
  .object({
    request_id: opaqueIdSchema,
    source_game_id: opaqueIdSchema,
    request_status: z.enum(['requested', 'created', 'declined', 'cancelled', 'expired']),
    requester_seat: combatSeatSchema,
    opponent_seat: combatSeatSchema,
    viewer_role: z.enum(['requester', 'opponent', 'participant']),
    viewer_can_accept: z.boolean(),
    viewer_can_cancel: z.boolean(),
    mode: combatModeSchema,
    word_length: z.number().int().min(2).max(35),
    hard_mode: z.boolean(),
    time_limit_ms: z.number().int().positive().nullable(),
    go_puzzle_count: z.union([z.literal(5), z.literal(7), z.literal(10)]).nullable(),
    created_game_id: opaqueIdSchema.nullable(),
    created_at: isoTimestampSchema,
    expires_at: isoTimestampSchema,
    responded_at: nullableTimestampSchema,
    updated_at: isoTimestampSchema,
    created: z.boolean(),
    idempotent: z.boolean(),
  })
  .strict()
  .superRefine((row, context) => {
    if (row.requester_seat === row.opponent_seat) {
      context.addIssue({ code: 'custom', message: 'Rematch seats must be distinct.' });
    }
  });

export type RematchProjection = Readonly<{
  requestId: string;
  sourceGameId: string;
  status: z.infer<typeof rematchRawSchema>['request_status'];
  requesterSeat: CombatSeat;
  opponentSeat: CombatSeat;
  viewerRole: z.infer<typeof rematchRawSchema>['viewer_role'];
  capabilities: Readonly<{ canAccept: boolean; canCancel: boolean }>;
  mode: 'og' | 'go';
  wordLength: number;
  hardMode: boolean;
  timeLimitMs: number | null;
  goPuzzleCount: 5 | 7 | 10 | null;
  createdGameId: string | null;
  createdAt: string;
  expiresAt: string;
  respondedAt: string | null;
  updatedAt: string;
}>;

export function parseRematchProjection(value: unknown): RematchProjection {
  assertNoPrivateCombatFields(value);
  const row = rematchRawSchema.parse(value);
  return {
    requestId: row.request_id,
    sourceGameId: row.source_game_id,
    status: row.request_status,
    requesterSeat: row.requester_seat,
    opponentSeat: row.opponent_seat,
    viewerRole: row.viewer_role,
    capabilities: {
      canAccept:
        row.request_status === 'requested' &&
        row.viewer_role === 'opponent' &&
        row.viewer_can_accept,
      canCancel:
        row.request_status === 'requested' &&
        row.viewer_role === 'requester' &&
        row.viewer_can_cancel,
    },
    mode: row.mode,
    wordLength: row.word_length,
    hardMode: row.hard_mode,
    timeLimitMs: row.time_limit_ms,
    goPuzzleCount: row.go_puzzle_count,
    createdGameId: row.created_game_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    respondedAt: row.responded_at,
    updatedAt: row.updated_at,
  };
}

const rankedDailyQueueRawSchema = z
  .object({
    request_id: opaqueIdSchema,
    request_status: z.enum(['queued', 'matched', 'cancelled', 'expired']),
    matched_game_id: opaqueIdSchema.nullable(),
    opponent_request_id: opaqueIdSchema.nullable(),
    viewer_seat: combatSeatSchema.nullable(),
    player_one_user_id: z.string().uuid().nullable(),
    player_two_user_id: z.string().uuid().nullable(),
    mode: combatModeSchema,
    scope: z.literal('daily'),
    daily_date_key: dateKeySchema,
    rating_bucket: z.enum(['async:og:daily:v1', 'async:go:daily:v1']),
    word_length: z.literal(5),
    hard_mode: z.boolean(),
    time_limit_ms: z.null(),
    queued_at: isoTimestampSchema,
    matched_at: nullableTimestampSchema,
  })
  .strict()
  .superRefine((row, context) => {
    const matchedValues = [
      row.matched_game_id,
      row.opponent_request_id,
      row.viewer_seat,
      row.player_one_user_id,
      row.player_two_user_id,
      row.matched_at,
    ];
    if ((row.request_status === 'matched') !== matchedValues.every((value) => value !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Ranked Daily matched status is internally inconsistent.',
      });
    }
    const expectedBucket = row.mode === 'og' ? 'async:og:daily:v1' : 'async:go:daily:v1';
    if (row.rating_bucket !== expectedBucket) {
      context.addIssue({
        code: 'custom',
        message: 'Ranked Daily queue bucket does not match its mode.',
      });
    }
  });

export type RankedDailyQueueProjection = Readonly<{
  requestId: string;
  status: z.infer<typeof rankedDailyQueueRawSchema>['request_status'];
  matchedGameId: string | null;
  opponentRequestId: string | null;
  viewerSeat: CombatSeat | null;
  mode: 'og' | 'go';
  dailyDateKey: string;
  ratingBucket: 'multiplayer:og:daily:v1' | 'multiplayer:go:daily:v1';
  wordLength: 5;
  hardMode: boolean;
  queuedAt: string;
  matchedAt: string | null;
}>;

export function parseRankedDailyQueueProjection(value: unknown): RankedDailyQueueProjection {
  assertNoPrivateCombatFields(value);
  const row = rankedDailyQueueRawSchema.parse(value);
  return {
    requestId: row.request_id,
    status: row.request_status,
    matchedGameId: row.matched_game_id,
    opponentRequestId: row.opponent_request_id,
    viewerSeat: row.viewer_seat,
    mode: row.mode,
    dailyDateKey: row.daily_date_key,
    ratingBucket: row.mode === 'og' ? 'multiplayer:og:daily:v1' : 'multiplayer:go:daily:v1',
    wordLength: 5,
    hardMode: row.hard_mode,
    queuedAt: row.queued_at,
    matchedAt: row.matched_at,
  };
}

export function combatSessionDraftKey(input: {
  ownerNamespace: string;
  gameId: string;
  seat: CombatSeat;
}): string {
  const ownerNamespace = opaqueIdSchema.parse(input.ownerNamespace);
  const gameId = opaqueIdSchema.parse(input.gameId);
  const seat = combatSeatSchema.parse(input.seat);
  return `amordle:combat-draft:v1:${encodeURIComponent(ownerNamespace)}:${encodeURIComponent(gameId)}:${seat}`;
}
