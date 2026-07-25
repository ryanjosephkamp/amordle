import { z } from 'zod';

import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import { postgresTimestamptzSchema } from './postgres-timestamp';
import { ServiceError, throwIfServiceError } from './service-error';

const opaqueIdSchema = z.string().trim().min(1).max(200);
const seatSchema = z.enum(['player-one', 'player-two']);
const tileStateSchema = z.enum(['correct', 'present', 'absent']);

const publicProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(50).optional(),
    avatarUrl: z.url().optional(),
    accentColor: z.string().trim().min(1).max(32).optional(),
    initials: z.string().trim().min(1).max(3).optional(),
  })
  .strict();

const spectatorPlayerSchema = z
  .object({
    seat: seatSchema,
    label: z.string().trim().min(1).max(50),
    profile: publicProfileSchema.optional(),
  })
  .strict();

const spectatorMoveSchema = z
  .object({
    seat: seatSchema,
    puzzleIndex: z.number().int().min(0).max(9),
    guess: z.string().regex(/^[A-Z]{2,35}$/),
    tiles: z.array(
      z
        .object({
          letter: z.string().regex(/^[A-Z]$/),
          state: tileStateSchema,
        })
        .strict(),
    ),
    createdAt: postgresTimestamptzSchema.optional(),
  })
  .strict();

const spectatorCapabilitiesSchema = z
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
  .strict();

const liveRowSchema = z
  .object({
    id: opaqueIdSchema,
    scope: z.literal('practice'),
    mode: z.enum(['og', 'go']),
    status: z.enum(['playing', 'won', 'lost', 'expired', 'cancelled']),
    word_length: z.number().int().min(2).max(35),
    go_puzzle_count: z.number().int().min(1).max(10).nullable(),
    hard_mode: z.boolean(),
    ranked: z.boolean(),
    current_turn_seat: seatSchema.nullable(),
    created_at: postgresTimestamptzSchema,
    updated_at: postgresTimestamptzSchema,
    terminal_at: postgresTimestamptzSchema.nullable(),
    players: z.array(spectatorPlayerSchema).length(2),
    moves: z.array(spectatorMoveSchema),
    progress: z
      .object({
        moveCount: z.number().int().min(0),
        currentPuzzleIndex: z.number().int().min(0).max(9),
        solvedPuzzleCount: z.number().int().min(0).max(10),
        latestMoveAt: postgresTimestamptzSchema.optional(),
      })
      .strict(),
    outcome: z
      .object({
        terminal: z.boolean(),
        status: z.enum(['playing', 'won', 'lost', 'expired', 'cancelled']),
        winnerSeat: seatSchema.optional(),
        forfeitedSeat: seatSchema.optional(),
        terminationReason: z
          .enum(['cancelled', 'forfeit', 'timeout', 'solve', 'points', 'draw'])
          .optional(),
        label: z.string().trim().min(1).max(80),
        terminalAt: postgresTimestamptzSchema.optional(),
      })
      .strict(),
    spectator_capabilities: spectatorCapabilitiesSchema,
  })
  .strict();

type LiveRow = z.infer<typeof liveRowSchema>;

export interface CombatLiveProjection {
  readonly id: string;
  readonly mode: 'og' | 'go';
  readonly status: 'playing' | 'won' | 'lost' | 'expired' | 'cancelled';
  readonly wordLength: number;
  readonly goPuzzleCount: number | null;
  readonly hardMode: boolean;
  readonly ranked: boolean;
  readonly currentTurn: 'player-one' | 'player-two' | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly terminalAt: string | null;
  readonly players: LiveRow['players'];
  readonly moves: LiveRow['moves'];
  readonly progress: LiveRow['progress'];
  readonly outcome: LiveRow['outcome'];
  readonly capabilities: LiveRow['spectator_capabilities'];
}

function mapLiveRow(value: unknown): CombatLiveProjection {
  const row = liveRowSchema.parse(value);
  if (
    row.players[0]?.seat === row.players[1]?.seat ||
    row.moves.some(
      (move) =>
        move.guess.length !== row.word_length ||
        move.tiles.length !== row.word_length ||
        move.tiles.map((tile) => tile.letter).join('') !== move.guess,
    ) ||
    row.progress.moveCount !== row.moves.length
  ) {
    throw new ServiceError('validation', 'Live spectator projection is internally inconsistent.');
  }
  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    wordLength: row.word_length,
    goPuzzleCount: row.go_puzzle_count,
    hardMode: row.hard_mode,
    ranked: row.ranked,
    currentTurn: row.current_turn_seat,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    terminalAt: row.terminal_at,
    players: row.players,
    moves: row.moves,
    progress: row.progress,
    outcome: row.outcome,
    capabilities: row.spectator_capabilities,
  };
}

export class CombatLiveRepository {
  constructor(private readonly client: AmordleSupabaseClient) {}

  async list(input: { authenticated: boolean; limit?: number }): Promise<CombatLiveProjection[]> {
    return this.load(input);
  }

  async get(input: {
    authenticated: boolean;
    gameId: string;
  }): Promise<CombatLiveProjection | null> {
    const rows = await this.load({ ...input, limit: 1 });
    return rows[0] ?? null;
  }

  private async load(input: {
    authenticated: boolean;
    gameId?: string;
    limit?: number;
  }): Promise<CombatLiveProjection[]> {
    const limit = z
      .number()
      .int()
      .min(1)
      .max(50)
      .parse(input.limit ?? 50);
    const gameId = input.gameId === undefined ? undefined : opaqueIdSchema.parse(input.gameId);
    const { data, error } = input.authenticated
      ? await this.client.rpc('get_authenticated_live_v1_spectator_games_v3', {
          p_limit: limit,
          p_terminal_window_seconds: 15,
          ...(gameId === undefined ? {} : { p_game_id: gameId }),
        })
      : await this.client.rpc('get_public_live_v1_spectator_games_v2', {
          p_limit: limit,
          p_terminal_window_seconds: 15,
          ...(gameId === undefined ? {} : { p_game_id: gameId }),
        });
    throwIfServiceError(error, 'Load privacy-safe Practice Live');
    const rows = z
      .array(z.unknown())
      .parse(data ?? [])
      .map(mapLiveRow);
    if (gameId !== undefined && rows.some((row) => row.id !== gameId)) {
      throw new ServiceError('validation', 'Live exact-ID lookup returned a different game.');
    }
    return rows;
  }
}
