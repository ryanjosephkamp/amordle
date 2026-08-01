import { z } from 'zod';

export const progressSchema = z
  .object({
    schemaVersion: z.literal(1),
    xp: z.number().int().nonnegative(),
    level: z.number().int().positive(),
    dailyStreak: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    solo: z.record(z.string(), z.unknown()).optional(),
    appliedRewards: z.record(z.string(), z.number().int().nonnegative()).optional(),
    dailyEntitlements: z.record(z.string(), z.enum(['pending', 'unlocked'])).optional(),
  })
  .strict();

export type AccountProgress = z.infer<typeof progressSchema>;

export const historyEntryV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(['solo-practice', 'solo-daily', 'combat-practice', 'combat-daily']),
    mode: z.enum(['og', 'go']),
    result: z.enum(['won', 'lost', 'draw', 'cancelled']),
    wordLength: z.number().int().min(2).max(35),
    acceptedGuesses: z.number().int().nonnegative(),
    puzzlesSolved: z.number().int().nonnegative().nullable(),
    rewardCoins: z.number().int().nonnegative(),
    rewardXp: z.number().int().nonnegative(),
    dailyDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

export const historyEntryV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    kind: z.enum(['solo-practice', 'solo-daily', 'combat-practice', 'combat-daily']),
    lane: z.enum(['practice', 'daily']),
    mode: z.enum(['og', 'go']),
    ranked: z.boolean(),
    result: z.enum(['won', 'lost', 'draw', 'cancelled']),
    terminalReason: z.string(),
    wordLength: z.number().int().min(2).max(35),
    difficulty: z.enum(['casual', 'standard', 'expert']),
    hardMode: z.boolean(),
    goPuzzleCount: z.number().int().positive().nullable(),
    acceptedGuesses: z.number().int().nonnegative(),
    puzzlesSolved: z.number().int().nonnegative().nullable(),
    points: z.number().int().nullable(),
    rewardCoins: z.number().int().nonnegative(),
    rewardXp: z.number().int().nonnegative(),
    dailyDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    ratingDelta: z.number().nullable(),
    opponent: z
      .object({
        publicProfileId: z.string().optional(),
        displayName: z.string().nullable(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const historyEntryV3Schema = historyEntryV2Schema.extend({
  schemaVersion: z.literal(3),
  revealedAnswers: z.array(z.string().regex(/^[a-z]{2,35}$/)).max(10),
});

export const historyEntrySchema = z.discriminatedUnion('schemaVersion', [
  historyEntryV1Schema,
  historyEntryV2Schema,
  historyEntryV3Schema,
]);

export const historyRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string().uuid(),
    completed_at: z.string(),
    entry: historyEntrySchema,
  })
  .strict();

export type AccountHistoryRow = z.infer<typeof historyRowSchema>;

export const ACCOUNT_STATE_KIND = 'amordle-account-state-v1';

export const accountStateEntrySchema = z
  .object({
    kind: z.literal(ACCOUNT_STATE_KIND),
    schemaVersion: z.literal(1),
    progress: progressSchema,
  })
  .strict();

const legacyHistoryEntrySchema = z
  .object({
    attemptsUsed: z.number().int().nonnegative(),
    coinAward: z.number().int().nonnegative(),
    completedAt: z.string(),
    gameId: z.string().min(1),
    mode: z.enum(['og', 'go']),
    scope: z.enum(['practice', 'daily']),
    status: z.enum(['won', 'lost']),
    wordLength: z.number().int().min(2).max(35),
    xpAward: z.number().int().nonnegative(),
  })
  .passthrough();

const legacyProgressSchema = z
  .object({
    schemaVersion: z.number().int().min(1).max(11),
    progression: z
      .object({
        xp: z.number().int().nonnegative(),
        level: z.number().int().positive(),
      })
      .passthrough(),
    history: z.array(legacyHistoryEntrySchema),
    stats: z.unknown().optional(),
    unlockedDailies: z.array(z.string()).optional(),
  })
  .passthrough();

export function defaultAccountProgress(): AccountProgress {
  return {
    schemaVersion: 1,
    xp: 0,
    level: 1,
    dailyStreak: 0,
    revision: 0,
    solo: {},
    appliedRewards: {},
    dailyEntitlements: {},
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function nonnegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function legacyDailyStreak(stats: unknown): number {
  const root = record(stats);
  const og = record(root?.og);
  const go = record(root?.go);
  const ogDaily = record(og?.daily);
  const goDaily = record(go?.daily);
  return Math.max(
    nonnegativeInteger(ogDaily?.currentStreak),
    nonnegativeInteger(goDaily?.currentStreak),
  );
}

function legacyDailyEntitlements(
  values: readonly string[] | undefined,
): AccountProgress['dailyEntitlements'] {
  const result: NonNullable<AccountProgress['dailyEntitlements']> = {};
  for (const value of values ?? []) {
    const match = /^(og|go):(\d{4}-\d{2}-\d{2})$/.exec(value);
    if (match) result[`${match[2]}:${match[1]}`] = 'unlocked';
  }
  return result;
}

export function normalizeAccountProgress(
  value: unknown,
):
  | { kind: 'native'; progress: AccountProgress }
  | { kind: 'legacy'; progress: AccountProgress }
  | { kind: 'unknown' } {
  const native = progressSchema.safeParse(value);
  if (native.success) return { kind: 'native', progress: native.data };
  const legacy = legacyProgressSchema.safeParse(value);
  if (!legacy.success) return { kind: 'unknown' };
  return {
    kind: 'legacy',
    progress: {
      ...defaultAccountProgress(),
      xp: legacy.data.progression.xp,
      level: legacy.data.progression.level,
      dailyStreak: legacyDailyStreak(legacy.data.stats),
      dailyEntitlements: legacyDailyEntitlements(legacy.data.unlockedDailies),
    },
  };
}

function legacyDailyDate(gameId: string, scope: 'practice' | 'daily'): string | undefined {
  if (scope !== 'daily') return undefined;
  return /^(?:og|go):daily:(\d{4}-\d{2}-\d{2})$/.exec(gameId)?.[1];
}

export function normalizeLegacyHistory(value: unknown, userId: string): AccountHistoryRow[] {
  const legacy = legacyProgressSchema.safeParse(value);
  if (!legacy.success) return [];
  return legacy.data.history.flatMap((entry) => {
    const completedAt = new Date(entry.completedAt);
    if (Number.isNaN(completedAt.valueOf())) return [];
    const dailyDate = legacyDailyDate(entry.gameId, entry.scope);
    return [
      {
        id: `legacy:${entry.gameId}`,
        user_id: userId,
        completed_at: completedAt.toISOString(),
        entry: {
          schemaVersion: 1 as const,
          kind: `solo-${entry.scope}` as 'solo-practice' | 'solo-daily',
          mode: entry.mode,
          result: entry.status,
          wordLength: entry.wordLength,
          acceptedGuesses: entry.attemptsUsed,
          puzzlesSolved: null,
          rewardCoins: entry.coinAward,
          rewardXp: entry.xpAward,
          ...(dailyDate ? { dailyDate } : {}),
        },
      },
    ];
  });
}
