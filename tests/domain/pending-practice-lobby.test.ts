import { describe, expect, it } from 'vitest';
import {
  clearPendingPracticeLobbyCreation,
  createPendingPracticeLobbyCreation,
  practiceLobbyConfigurationFingerprint,
  readPendingPracticeLobbyCreation,
  writePendingPracticeLobbyCreation,
} from '../../src/services/pending-practice-lobby';

const owner = '00000000-0000-4000-8000-000000000101';
const config = {
  mode: 'go' as const,
  wordLength: 7,
  difficulty: 'standard' as const,
  hardMode: true,
  puzzleCount: 7 as const,
  timeLimitMs: 120_000 as const,
};

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('pending Practice lobby creation', () => {
  it('persists one versioned owner-scoped creation intent with a stable fingerprint', () => {
    const storage = memoryStorage();
    const intent = createPendingPracticeLobbyCreation({
      gameId: 'amordle-practice-intent-1',
      ownerNamespace: owner,
      config,
      requestedAt: '2026-07-24T12:00:00+00:00',
    });

    writePendingPracticeLobbyCreation(storage, intent);

    expect(readPendingPracticeLobbyCreation(storage, owner)).toEqual({
      ...intent,
      requestedAt: '2026-07-24T12:00:00.000Z',
    });
    expect(intent.configurationFingerprint).toBe(practiceLobbyConfigurationFingerprint(config));
    clearPendingPracticeLobbyCreation(storage, owner);
    expect(readPendingPracticeLobbyCreation(storage, owner)).toBeNull();
  });

  it('removes malformed or cross-owner session state instead of accepting it', () => {
    const storage = memoryStorage();
    storage.setItem(`amordle:practice-lobby-intent:v1:${owner}`, '{"schemaVersion":999}');

    expect(readPendingPracticeLobbyCreation(storage, owner)).toBeNull();
    expect(storage.length).toBe(0);
  });
});
