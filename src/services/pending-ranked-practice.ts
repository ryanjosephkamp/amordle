import { z } from 'zod';

import { postgresTimestamptzSchema } from './postgres-timestamp';

const STORAGE_KEY = 'amordle:ranked-practice-search-v1';
const LEGACY_REQUEST_KEY = 'amordle:ranked-practice-request';

const rankedPracticeSearchSchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerNamespace: z.string().uuid(),
    fingerprint: z.string().min(1).max(500),
    idempotencyKey: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    mode: z.enum(['og', 'go']),
    wordLength: z.number().int().min(2).max(35),
    difficulty: z.enum(['casual', 'standard', 'expert']),
    hardMode: z.boolean(),
    puzzleCount: z.union([z.literal(5), z.literal(7), z.literal(10)]),
    timeLimitMs: z.union([z.literal(300_000), z.null()]),
    requestedAt: postgresTimestamptzSchema,
    requestId: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/)
      .nullable(),
  })
  .strict();

export type RankedPracticeSearchState = z.infer<typeof rankedPracticeSearchSchema>;

export interface RankedPracticeSearchConfiguration {
  readonly mode: 'og' | 'go';
  readonly wordLength: number;
  readonly difficulty: 'casual' | 'standard' | 'expert';
  readonly hardMode: boolean;
  readonly puzzleCount: 5 | 7 | 10;
  readonly timeLimitMs: 300_000 | null;
}

export function rankedPracticeSearchFingerprint(input: RankedPracticeSearchConfiguration): string {
  return [
    input.mode,
    input.wordLength,
    input.difficulty,
    input.hardMode ? 'hard' : 'normal',
    input.mode === 'go' ? input.puzzleCount : 1,
    input.timeLimitMs ?? 'untimed',
  ].join(':');
}

export function createRankedPracticeSearchState(input: {
  readonly ownerNamespace: string;
  readonly configuration: RankedPracticeSearchConfiguration;
  readonly requestedAt: string;
}): RankedPracticeSearchState {
  return rankedPracticeSearchSchema.parse({
    schemaVersion: 1,
    ownerNamespace: input.ownerNamespace,
    fingerprint: rankedPracticeSearchFingerprint(input.configuration),
    idempotencyKey: `amordle-ranked-practice-${crypto.randomUUID()}`,
    ...input.configuration,
    requestedAt: input.requestedAt,
    requestId: null,
  });
}

export function readRankedPracticeSearchState(
  storage: Pick<Storage, 'getItem'>,
  ownerNamespace: string,
): RankedPracticeSearchState | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed = rankedPracticeSearchSchema.parse(JSON.parse(raw) as unknown);
    return parsed.ownerNamespace === ownerNamespace ? parsed : null;
  } catch {
    return null;
  }
}

export function writeRankedPracticeSearchState(
  storage: Pick<Storage, 'removeItem' | 'setItem'>,
  state: RankedPracticeSearchState,
): void {
  const parsed = rankedPracticeSearchSchema.parse(state);
  storage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  if (parsed.requestId === null) {
    storage.removeItem(LEGACY_REQUEST_KEY);
  } else {
    storage.setItem(LEGACY_REQUEST_KEY, parsed.requestId);
  }
}

export function attachRankedPracticeRequest(
  state: RankedPracticeSearchState,
  requestId: string,
): RankedPracticeSearchState {
  return rankedPracticeSearchSchema.parse({ ...state, requestId });
}

export function clearRankedPracticeSearchState(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(STORAGE_KEY);
  storage.removeItem(LEGACY_REQUEST_KEY);
}
