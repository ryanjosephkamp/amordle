import { describe, expect, it } from 'vitest';

import {
  attachRankedPracticeRequest,
  clearRankedPracticeSearchState,
  createRankedPracticeSearchState,
  readRankedPracticeSearchState,
  writeRankedPracticeSearchState,
} from '../../src/services/pending-ranked-practice';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('ranked Practice search recovery', () => {
  it('retains one retry key and the exact finalization configuration', () => {
    const storage = memoryStorage();
    const ownerNamespace = '00000000-0000-4000-8000-000000000001';
    const pending = createRankedPracticeSearchState({
      ownerNamespace,
      configuration: {
        mode: 'go',
        wordLength: 8,
        difficulty: 'casual',
        hardMode: true,
        puzzleCount: 10,
        timeLimitMs: 300_000,
      },
      requestedAt: '2026-07-24T12:00:00+00:00',
    });
    writeRankedPracticeSearchState(storage, pending);
    expect(readRankedPracticeSearchState(storage, ownerNamespace)).toMatchObject({
      idempotencyKey: pending.idempotencyKey,
      difficulty: 'casual',
      puzzleCount: 10,
      requestId: null,
      requestedAt: '2026-07-24T12:00:00.000Z',
    });

    const accepted = attachRankedPracticeRequest(pending, 'ranked-request-1');
    writeRankedPracticeSearchState(storage, accepted);
    expect(readRankedPracticeSearchState(storage, ownerNamespace)?.requestId).toBe(
      'ranked-request-1',
    );
    clearRankedPracticeSearchState(storage);
    expect(readRankedPracticeSearchState(storage, ownerNamespace)).toBeNull();
  });

  it('does not restore another account search', () => {
    const storage = memoryStorage();
    const pending = createRankedPracticeSearchState({
      ownerNamespace: '00000000-0000-4000-8000-000000000001',
      configuration: {
        mode: 'og',
        wordLength: 5,
        difficulty: 'expert',
        hardMode: false,
        puzzleCount: 5,
        timeLimitMs: null,
      },
      requestedAt: '2026-07-24T12:00:00Z',
    });
    writeRankedPracticeSearchState(storage, pending);
    expect(
      readRankedPracticeSearchState(storage, '00000000-0000-4000-8000-000000000002'),
    ).toBeNull();
  });
});
