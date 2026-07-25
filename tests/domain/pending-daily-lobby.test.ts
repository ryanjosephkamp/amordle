import { describe, expect, it } from 'vitest';

import {
  clearPendingDailyLobby,
  createPendingDailyLobby,
  readPendingDailyLobby,
  writePendingDailyLobby,
} from '../../src/services/pending-daily-lobby';

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('pending unranked Daily lobby intent', () => {
  it('binds the retry key to owner, date, mode, and Hard Mode', () => {
    const storage = new MemoryStorage();
    const state = createPendingDailyLobby({
      ownerNamespace: '00000000-0000-4000-8000-000000000001',
      mode: 'go',
      hardMode: true,
      dailyDateKey: '2026-07-24',
      requestedAt: '2026-07-24T20:00:00+00:00',
    });
    writePendingDailyLobby(storage, state);

    expect(readPendingDailyLobby(storage, state.ownerNamespace)).toEqual({
      ...state,
      requestedAt: '2026-07-24T20:00:00.000Z',
    });
    expect(readPendingDailyLobby(storage, '00000000-0000-4000-8000-000000000002')).toBeNull();
  });

  it('ignores the superseded client-selected game intent and clears both versions', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'amordle:unranked-daily-lobby-v1',
      JSON.stringify({
        schemaVersion: 1,
        ownerNamespace: '00000000-0000-4000-8000-000000000001',
        gameId: 'client-selected-game',
        mode: 'og',
        dailyDateKey: '2026-07-24',
        requestedAt: '2026-07-24T20:00:00.000Z',
      }),
    );

    expect(readPendingDailyLobby(storage, '00000000-0000-4000-8000-000000000001')).toBeNull();
    clearPendingDailyLobby(storage);
    expect(storage.values.size).toBe(0);
  });
});
