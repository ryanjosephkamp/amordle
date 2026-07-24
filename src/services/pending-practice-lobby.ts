import { z } from 'zod';
import {
  practiceCombatPreviewConfigSchema,
  type PracticeCombatPreviewConfig,
} from '../domain/practice-combat-preview';
import { postgresTimestamptzSchema, type CanonicalInstant } from './postgres-timestamp';

const pendingIntentSchema = z
  .object({
    schemaVersion: z.literal(1),
    gameId: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    ownerNamespace: z.string().uuid(),
    configurationFingerprint: z.string().trim().min(1).max(500),
    requestedAt: postgresTimestamptzSchema,
  })
  .strict();

export interface PendingPracticeLobbyCreation {
  readonly schemaVersion: 1;
  readonly gameId: string;
  readonly ownerNamespace: string;
  readonly configurationFingerprint: string;
  readonly requestedAt: CanonicalInstant;
}

type SessionStorageBoundary = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storageKey(ownerNamespace: string): string {
  return `amordle:practice-lobby-intent:v1:${z.string().uuid().parse(ownerNamespace)}`;
}

export function practiceLobbyConfigurationFingerprint(config: PracticeCombatPreviewConfig): string {
  const safe = practiceCombatPreviewConfigSchema.parse(config);
  return JSON.stringify({
    mode: safe.mode,
    wordLength: safe.wordLength,
    difficulty: safe.difficulty,
    hardMode: safe.hardMode,
    puzzleCount: safe.puzzleCount,
    timeLimitMs: safe.timeLimitMs,
  });
}

export function createPendingPracticeLobbyCreation(input: {
  readonly gameId: string;
  readonly ownerNamespace: string;
  readonly config: PracticeCombatPreviewConfig;
  readonly requestedAt: string;
}): PendingPracticeLobbyCreation {
  return pendingIntentSchema.parse({
    schemaVersion: 1,
    gameId: input.gameId,
    ownerNamespace: input.ownerNamespace,
    configurationFingerprint: practiceLobbyConfigurationFingerprint(input.config),
    requestedAt: input.requestedAt,
  });
}

export function readPendingPracticeLobbyCreation(
  storage: SessionStorageBoundary,
  ownerNamespace: string,
): PendingPracticeLobbyCreation | null {
  const key = storageKey(ownerNamespace);
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    const parsed = pendingIntentSchema.parse(JSON.parse(raw));
    if (parsed.ownerNamespace !== ownerNamespace) {
      storage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writePendingPracticeLobbyCreation(
  storage: SessionStorageBoundary,
  intent: PendingPracticeLobbyCreation,
): void {
  const safe = pendingIntentSchema.parse(intent);
  storage.setItem(storageKey(safe.ownerNamespace), JSON.stringify(safe));
}

export function clearPendingPracticeLobbyCreation(
  storage: SessionStorageBoundary,
  ownerNamespace: string,
): void {
  storage.removeItem(storageKey(ownerNamespace));
}
