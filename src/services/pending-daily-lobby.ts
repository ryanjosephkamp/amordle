import { z } from 'zod';

import { postgresTimestamptzSchema } from './postgres-timestamp';

const STORAGE_KEY = 'amordle:unranked-daily-lobby-v2';
const LEGACY_STORAGE_KEY = 'amordle:unranked-daily-lobby-v1';

const pendingDailyLobbySchema = z
  .object({
    schemaVersion: z.literal(2),
    ownerNamespace: z.string().uuid(),
    creationKey: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    mode: z.enum(['og', 'go']),
    hardMode: z.boolean(),
    dailyDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    requestedAt: postgresTimestamptzSchema,
  })
  .strict();

export type PendingDailyLobby = z.infer<typeof pendingDailyLobbySchema>;

export function createPendingDailyLobby(input: {
  readonly ownerNamespace: string;
  readonly mode: 'og' | 'go';
  readonly hardMode: boolean;
  readonly dailyDateKey: string;
  readonly requestedAt: string;
}): PendingDailyLobby {
  return pendingDailyLobbySchema.parse({
    schemaVersion: 2,
    ownerNamespace: input.ownerNamespace,
    creationKey: `amordle-daily-${crypto.randomUUID()}`,
    mode: input.mode,
    hardMode: input.hardMode,
    dailyDateKey: input.dailyDateKey,
    requestedAt: input.requestedAt,
  });
}

export function readPendingDailyLobby(
  storage: Pick<Storage, 'getItem'>,
  ownerNamespace: string,
): PendingDailyLobby | null {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed = pendingDailyLobbySchema.parse(JSON.parse(raw) as unknown);
    return parsed.ownerNamespace === ownerNamespace ? parsed : null;
  } catch {
    return null;
  }
}

export function writePendingDailyLobby(
  storage: Pick<Storage, 'removeItem' | 'setItem'>,
  pending: PendingDailyLobby,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(pendingDailyLobbySchema.parse(pending)));
  storage.removeItem(LEGACY_STORAGE_KEY);
}

export function clearPendingDailyLobby(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(STORAGE_KEY);
  storage.removeItem(LEGACY_STORAGE_KEY);
}
