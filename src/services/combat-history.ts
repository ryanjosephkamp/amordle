import { z } from 'zod';

import type { Json, Tables } from '../types/database';
import { combatLaneLabel, type CombatLaneSource } from '../domain/combat-presentation';
import { postgresTimestamptzSchema } from './postgres-timestamp';

const combatHistoryInputSchema = z
  .object({
    gameId: z.string().trim().min(1).max(190),
    userId: z.string().uuid(),
    scope: z.enum(['practice', 'daily']),
    mode: z.enum(['og', 'go']),
    ranked: z.boolean(),
    sourceKind: z.enum([
      'ranked-queue',
      'daily-lobby',
      'public-lobby',
      'private-request',
      'rematch',
    ]),
    result: z.enum(['Won', 'Lost', 'Draw']),
    terminalReason: z.enum(['forfeit', 'timeout', 'solve', 'points', 'draw']),
    wordLength: z.number().int().min(2).max(35),
    difficulty: z.enum(['casual', 'standard', 'expert']),
    hardMode: z.boolean(),
    puzzleCount: z.number().int().min(1).max(10),
    playerPoints: z.number().int().min(0),
    opponentPoints: z.number().int().min(0),
    completedAt: postgresTimestamptzSchema,
    opponent: z
      .object({
        publicProfileId: z.string().uuid().nullable(),
        displayName: z.string().trim().min(1).max(50),
      })
      .strict(),
  })
  .strict();

export type CombatHistoryInput = z.infer<typeof combatHistoryInputSchema>;

export function createCombatHistoryRow(input: CombatHistoryInput): Tables<'game_history'> {
  const safe = combatHistoryInputSchema.parse(input);
  const lane = combatLaneLabel({
    scope: safe.scope,
    mode: safe.mode,
    ranked: safe.ranked,
    sourceKind: safe.sourceKind as CombatLaneSource,
  });
  const entry = {
    schemaVersion: 1,
    area: 'combat',
    scope: safe.scope,
    mode: safe.mode,
    lane,
    ranked: safe.ranked,
    sourceKind: safe.sourceKind,
    result: safe.result,
    terminalReason: safe.terminalReason,
    wordLength: safe.wordLength,
    difficulty: safe.difficulty,
    hardMode: safe.hardMode,
    puzzleCount: safe.puzzleCount,
    playerPoints: safe.playerPoints,
    opponentPoints: safe.opponentPoints,
    opponent: {
      publicProfileId: safe.opponent.publicProfileId,
      displayName: safe.opponent.displayName,
    },
    summary: `${safe.playerPoints}–${safe.opponentPoints} · ${safe.terminalReason}`,
    context: lane,
  } satisfies Record<string, Json>;
  return {
    id: `combat:${safe.gameId}`,
    user_id: safe.userId,
    completed_at: safe.completedAt,
    entry,
  };
}
