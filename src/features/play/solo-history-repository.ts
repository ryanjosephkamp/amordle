import { z } from 'zod';
import type { IdentityScope, StorageLike } from '../../persistence/local-repository';
import { createVersionedLocalRepository } from '../../persistence/local-repository';

export type SoloHistoryEntry = {
  readonly id: string;
  readonly mode: 'og' | 'go';
  readonly scope: 'daily' | 'practice';
  readonly status: 'won' | 'lost';
  readonly wordLength: number;
  readonly difficulty: 'casual' | 'standard' | 'expert';
  readonly hardMode: boolean;
  readonly puzzleCount: number;
  readonly completedPuzzles: number;
  readonly acceptedGuesses: number;
  readonly completedAt: string;
  readonly dateKey?: string | undefined;
};

const historyEntrySchema: z.ZodType<SoloHistoryEntry> = z.object({
  id: z.string().trim().min(1).max(240),
  mode: z.enum(['og', 'go']),
  scope: z.enum(['daily', 'practice']),
  status: z.enum(['won', 'lost']),
  wordLength: z.number().int().min(2).max(35),
  difficulty: z.enum(['casual', 'standard', 'expert']),
  hardMode: z.boolean(),
  puzzleCount: z.number().int().positive().max(10),
  completedPuzzles: z.number().int().nonnegative().max(10),
  acceptedGuesses: z.number().int().nonnegative(),
  completedAt: z.iso.datetime(),
  dateKey: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const historyStateSchema = z.object({
  entries: z.array(historyEntrySchema).max(250),
});

function repository(storage?: StorageLike) {
  return createVersionedLocalRepository<{ entries: SoloHistoryEntry[] }>({
    schema: historyStateSchema,
    storage: () => {
      if (storage) return storage;
      try {
        return window.localStorage;
      } catch {
        return undefined;
      }
    },
    keyPrefix: 'amordle:solo-history',
  });
}

export function readSoloHistory(
  identity: IdentityScope,
  storage?: StorageLike,
): readonly SoloHistoryEntry[] {
  const loaded = repository(storage).load(identity);
  return loaded.status === 'ok' ? loaded.envelope.payload.entries : [];
}

export function recordSoloHistory(
  identity: IdentityScope,
  input: SoloHistoryEntry,
  storage?: StorageLike,
): { readonly ok: true; readonly applied: boolean } | { readonly ok: false } {
  const entry = historyEntrySchema.parse(input);
  const historyRepository = repository(storage);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = historyRepository.load(identity);
    if (loaded.status === 'corrupt' || loaded.status === 'unavailable') return { ok: false };
    const entries = loaded.status === 'ok' ? loaded.envelope.payload.entries : [];
    const existing = entries.find((item) => item.id === entry.id);
    if (existing) {
      return JSON.stringify(existing) === JSON.stringify(entry)
        ? { ok: true, applied: false }
        : { ok: false };
    }
    const next = [entry, ...entries]
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
      .slice(0, 250);
    const saved = historyRepository.save(
      identity,
      { entries: next },
      {
        expectedRevision: loaded.status === 'ok' ? loaded.envelope.revision : 0,
        updatedAt: entry.completedAt,
      },
    );
    if (saved.ok) return { ok: true, applied: true };
    if (saved.reason !== 'conflict') return { ok: false };
  }
  return { ok: false };
}

export function soloHistoryStorageKey(identity: IdentityScope): string {
  return repository().storageKey(identity);
}
