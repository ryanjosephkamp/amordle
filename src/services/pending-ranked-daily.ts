import { z } from 'zod';

import { postgresTimestamptzSchema } from './postgres-timestamp';

const STORAGE_KEY = 'amordle:ranked-daily-search-v1';
const LEGACY_REQUEST_KEY = 'amordle:ranked-daily-request';
const MAX_ACCOUNT_INTENTS = 8;

const requestIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);

const rankedDailySearchIntentSchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerNamespace: z.string().uuid(),
    fingerprint: z.string().trim().min(1).max(200),
    idempotencyKey: requestIdSchema,
    requestId: requestIdSchema.nullable(),
    dailyDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mode: z.enum(['og', 'go']),
    hardMode: z.boolean(),
    requestedAt: postgresTimestamptzSchema,
  })
  .strict();

const rankedDailyIntentEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    intents: z.array(rankedDailySearchIntentSchema).max(MAX_ACCOUNT_INTENTS),
  })
  .strict()
  .superRefine((value, context) => {
    const owners = new Set<string>();
    value.intents.forEach((intent, index) => {
      if (owners.has(intent.ownerNamespace)) {
        context.addIssue({
          code: 'custom',
          path: ['intents', index, 'ownerNamespace'],
          message: 'Ranked Daily intent owners must be unique.',
        });
      }
      owners.add(intent.ownerNamespace);
    });
  });

export type RankedDailySearchIntent = z.infer<typeof rankedDailySearchIntentSchema>;

type RankedDailyStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

export function rankedDailySearchFingerprint(input: {
  readonly dailyDateKey: string;
  readonly mode: 'og' | 'go';
  readonly hardMode: boolean;
}): string {
  return `${input.dailyDateKey}:${input.mode}:${input.hardMode ? 'hard' : 'normal'}`;
}

export function createRankedDailySearchIntent(input: {
  readonly ownerNamespace: string;
  readonly dailyDateKey: string;
  readonly mode: 'og' | 'go';
  readonly hardMode: boolean;
  readonly requestedAt: string;
}): RankedDailySearchIntent {
  return rankedDailySearchIntentSchema.parse({
    schemaVersion: 1,
    ownerNamespace: input.ownerNamespace,
    fingerprint: rankedDailySearchFingerprint(input),
    idempotencyKey: `amordle-ranked-daily-${crypto.randomUUID()}`,
    requestId: null,
    dailyDateKey: input.dailyDateKey,
    mode: input.mode,
    hardMode: input.hardMode,
    requestedAt: input.requestedAt,
  });
}

function readEnvelope(storage: Pick<Storage, 'getItem'>) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return rankedDailyIntentEnvelopeSchema.parse({ schemaVersion: 1, intents: [] });
  return rankedDailyIntentEnvelopeSchema.parse(JSON.parse(raw) as unknown);
}

function readEnvelopeSafely(storage: RankedDailyStorage) {
  try {
    return readEnvelope(storage);
  } catch {
    storage.removeItem(STORAGE_KEY);
    return rankedDailyIntentEnvelopeSchema.parse({ schemaVersion: 1, intents: [] });
  }
}

export function readRankedDailySearchIntent(
  storage: RankedDailyStorage,
  ownerNamespace: string,
): RankedDailySearchIntent | null {
  const owner = z.string().uuid().parse(ownerNamespace);
  return (
    readEnvelopeSafely(storage).intents.find((intent) => intent.ownerNamespace === owner) ?? null
  );
}

export function writeRankedDailySearchIntent(
  storage: RankedDailyStorage,
  intent: RankedDailySearchIntent,
): void {
  const safe = rankedDailySearchIntentSchema.parse(intent);
  const existing = readEnvelopeSafely(storage).intents.filter(
    (candidate) => candidate.ownerNamespace !== safe.ownerNamespace,
  );
  const envelope = rankedDailyIntentEnvelopeSchema.parse({
    schemaVersion: 1,
    intents: [safe, ...existing].slice(0, MAX_ACCOUNT_INTENTS),
  });
  storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  storage.removeItem(LEGACY_REQUEST_KEY);
}

export function attachRankedDailyRequest(
  intent: RankedDailySearchIntent,
  requestId: string,
): RankedDailySearchIntent {
  return rankedDailySearchIntentSchema.parse({
    ...intent,
    requestId: requestIdSchema.parse(requestId),
  });
}

export function clearRankedDailySearchIntent(
  storage: RankedDailyStorage,
  ownerNamespace: string,
): void {
  const owner = z.string().uuid().parse(ownerNamespace);
  const envelope = readEnvelopeSafely(storage);
  const intents = envelope.intents.filter((intent) => intent.ownerNamespace !== owner);
  if (intents.length === 0) {
    storage.removeItem(STORAGE_KEY);
  } else {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify(rankedDailyIntentEnvelopeSchema.parse({ schemaVersion: 1, intents })),
    );
  }
  storage.removeItem(LEGACY_REQUEST_KEY);
}

export function readLegacyRankedDailyRequestId(storage: Pick<Storage, 'getItem'>): string | null {
  const raw = storage.getItem(LEGACY_REQUEST_KEY);
  const parsed = requestIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function clearLegacyRankedDailyRequestId(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(LEGACY_REQUEST_KEY);
}
