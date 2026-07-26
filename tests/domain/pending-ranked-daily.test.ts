import { describe, expect, it, vi } from 'vitest';

import {
  attachRankedDailyRequest,
  clearRankedDailySearchIntent,
  createRankedDailySearchIntent,
  rankedDailySearchFingerprint,
  readRankedDailySearchIntent,
  writeRankedDailySearchIntent,
} from '../../src/services/pending-ranked-daily';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('Ranked Daily pending search intents', () => {
  it('uses one stable idempotency key per account intent and distinct keys across accounts', () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValueOnce('a').mockReturnValueOnce('b'),
    });
    const left = createRankedDailySearchIntent({
      ownerNamespace: '10000000-0000-4000-8000-000000000001',
      dailyDateKey: '2026-07-26',
      mode: 'og',
      hardMode: false,
      requestedAt: '2026-07-26T12:00:00Z',
    });
    const right = createRankedDailySearchIntent({
      ownerNamespace: '10000000-0000-4000-8000-000000000002',
      dailyDateKey: '2026-07-26',
      mode: 'og',
      hardMode: false,
      requestedAt: '2026-07-26T12:00:00Z',
    });
    expect(left.fingerprint).toBe(right.fingerprint);
    expect(left.idempotencyKey).not.toBe(right.idempotencyKey);
    expect(attachRankedDailyRequest(left, 'request-one').idempotencyKey).toBe(left.idempotencyKey);
    vi.unstubAllGlobals();
  });

  it('preserves one bounded account-owned intent without leaking it during account switch', () => {
    const storage = new MemoryStorage();
    const leftOwner = '10000000-0000-4000-8000-000000000001';
    const rightOwner = '10000000-0000-4000-8000-000000000002';
    const left = createRankedDailySearchIntent({
      ownerNamespace: leftOwner,
      dailyDateKey: '2026-07-26',
      mode: 'go',
      hardMode: true,
      requestedAt: '2026-07-26T12:00:00Z',
    });
    const right = createRankedDailySearchIntent({
      ownerNamespace: rightOwner,
      dailyDateKey: '2026-07-26',
      mode: 'og',
      hardMode: false,
      requestedAt: '2026-07-26T12:00:00Z',
    });
    writeRankedDailySearchIntent(storage, left);
    writeRankedDailySearchIntent(storage, right);
    expect(readRankedDailySearchIntent(storage, leftOwner)).toEqual(left);
    expect(readRankedDailySearchIntent(storage, rightOwner)).toEqual(right);
    clearRankedDailySearchIntent(storage, leftOwner);
    expect(readRankedDailySearchIntent(storage, leftOwner)).toBeNull();
    expect(readRankedDailySearchIntent(storage, rightOwner)).toEqual(right);
  });

  it('fingerprints UTC date, mode, and Hard Mode without an account identifier', () => {
    expect(
      rankedDailySearchFingerprint({
        dailyDateKey: '2026-07-26',
        mode: 'go',
        hardMode: true,
      }),
    ).toBe('2026-07-26:go:hard');
  });
});
