import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AmordleSupabaseClient } from '../../src/lib/supabase-browser';
import type { IdentityScope, VersionedEnvelope } from '../../src/persistence/local-repository';
import {
  SOLO_CLOUD_DOCUMENT_FIELD,
  SoloCloudRepository,
  SupabaseSoloCloudStore,
  type SoloCloudRow,
  type SoloCloudStore,
} from '../../src/services/solo-cloud-repository';
import type { Json } from '../../src/types/database';

const accountA = {
  kind: 'authenticated',
  userId: '00000000-0000-4000-8000-000000000001',
} as const;
const accountB = {
  kind: 'authenticated',
  userId: '00000000-0000-4000-8000-000000000002',
} as const;
const guest = { kind: 'guest' } as const;
const now = new Date('2026-07-22T12:30:00.000Z');
const stateSchema = z.object({ sessionKey: z.string(), moves: z.number().int().nonnegative() });
type State = z.infer<typeof stateSchema>;

function envelope(
  owner: IdentityScope,
  revision: number,
  updatedAt: string,
  moves: number,
): VersionedEnvelope<State> {
  return {
    schemaVersion: 1,
    owner,
    revision,
    updatedAt,
    payload: { sessionKey: 'practice:og:5', moves },
  };
}

class MemorySoloCloudStore implements SoloCloudStore {
  readonly rows = new Map<string, SoloCloudRow>();
  reads = 0;
  writes = 0;
  beforeReplace?: () => boolean | undefined;

  async read(userId: string): Promise<SoloCloudRow | null> {
    this.reads += 1;
    const row = this.rows.get(userId);
    return row ? structuredClone(row) : null;
  }

  async create(userId: string, progress: Json, updatedAt: string): Promise<boolean> {
    if (this.rows.has(userId)) return false;
    this.writes += 1;
    this.rows.set(userId, { progress: structuredClone(progress), updatedAt });
    return true;
  }

  async replace(
    userId: string,
    expectedUpdatedAt: string,
    progress: Json,
    updatedAt: string,
  ): Promise<boolean> {
    const override = this.beforeReplace?.();
    if (override !== undefined) return override;
    const current = this.rows.get(userId);
    if (!current || current.updatedAt !== expectedUpdatedAt) return false;
    this.writes += 1;
    this.rows.set(userId, { progress: structuredClone(progress), updatedAt });
    return true;
  }
}

function repository(store: SoloCloudStore) {
  return new SoloCloudRepository(store, stateSchema, { now: () => now });
}

function cloudProgress(value: VersionedEnvelope<State>, extra: Record<string, Json> = {}): Json {
  return { ...extra, [SOLO_CLOUD_DOCUMENT_FIELD]: value as unknown as Json };
}

describe('account-scoped Solo cloud reconciliation', () => {
  it('binds production replacement to both owner and exact row timestamp', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { updated_at: '2026-07-22T12:30:00.001Z' },
      error: null,
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const matchTimestamp = vi.fn(() => ({ select }));
    const matchOwner = vi.fn(() => ({ eq: matchTimestamp }));
    const update = vi.fn(() => ({ eq: matchOwner }));
    const from = vi.fn(() => ({ update }));
    const client = { from } as unknown as AmordleSupabaseClient;
    const store = new SupabaseSoloCloudStore(client);

    await expect(
      store.replace(
        accountA.userId,
        '2026-07-22T12:00:01.000Z',
        { soloCloudV1: { revision: 2 } },
        '2026-07-22T12:30:00.001Z',
      ),
    ).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith('progress_snapshots');
    expect(matchOwner).toHaveBeenCalledWith('user_id', accountA.userId);
    expect(matchTimestamp).toHaveBeenCalledWith('updated_at', '2026-07-22T12:00:01.000Z');
  });

  it('keeps guest state local and performs no cloud read or implicit transfer', async () => {
    const store = new MemorySoloCloudStore();
    const local = envelope(guest, 2, '2026-07-22T12:00:00.000Z', 2);
    await expect(repository(store).reconcile(guest, local)).resolves.toMatchObject({
      status: 'guest-local-only',
      authoritative: { owner: { kind: 'guest' }, payload: { moves: 2 } },
    });
    expect(store.reads).toBe(0);
    expect(store.writes).toBe(0);

    await expect(repository(store).reconcile(accountA, local)).rejects.toMatchObject({
      failure: { code: 'validation' },
    });
    expect(store.reads).toBe(0);
  });

  it('hydrates only the active account and rejects a cloud owner mismatch', async () => {
    const store = new MemorySoloCloudStore();
    const cloud = envelope(accountA, 4, '2026-07-22T12:10:00.000Z', 4);
    store.rows.set(accountA.userId, {
      progress: cloudProgress(cloud),
      updatedAt: '2026-07-22T12:10:01.000Z',
    });
    await expect(repository(store).reconcile(accountA)).resolves.toMatchObject({
      status: 'hydrated',
      authoritative: { owner: accountA, revision: 4 },
    });
    await expect(repository(store).load(accountB)).resolves.toEqual({ status: 'empty' });

    store.rows.set(accountB.userId, {
      progress: cloudProgress(cloud),
      updatedAt: '2026-07-22T12:10:01.000Z',
    });
    await expect(repository(store).load(accountB)).resolves.toEqual({
      status: 'corrupt',
      reason: 'owner_mismatch',
    });
  });

  it('rejects stale writes without touching the cloud row', async () => {
    const store = new MemorySoloCloudStore();
    const cloud = envelope(accountA, 8, '2026-07-22T12:20:00.000Z', 8);
    store.rows.set(accountA.userId, {
      progress: cloudProgress(cloud),
      updatedAt: '2026-07-22T12:20:01.000Z',
    });
    const staleByRevision = envelope(accountA, 7, '2026-07-22T12:21:00.000Z', 7);
    await expect(repository(store).reconcile(accountA, staleByRevision)).resolves.toMatchObject({
      status: 'stale-rejected',
      authoritative: { revision: 8, payload: { moves: 8 } },
    });
    const staleByTime = envelope(accountA, 9, '2026-07-22T12:19:00.000Z', 9);
    await expect(repository(store).reconcile(accountA, staleByTime)).resolves.toMatchObject({
      status: 'stale-rejected',
      authoritative: { revision: 8 },
    });
    expect(store.writes).toBe(0);
  });

  it('publishes a newer envelope with CAS while preserving unrelated progress fields', async () => {
    const store = new MemorySoloCloudStore();
    const cloud = envelope(accountA, 2, '2026-07-22T12:00:00.000Z', 2);
    store.rows.set(accountA.userId, {
      progress: cloudProgress(cloud, { xp: 140, coins: 22 }),
      updatedAt: '2026-07-22T12:00:01.000Z',
    });
    const candidate = envelope(accountA, 3, '2026-07-22T12:05:00.000Z', 3);
    await expect(repository(store).reconcile(accountA, candidate)).resolves.toMatchObject({
      status: 'published',
      authoritative: { revision: 3 },
    });
    expect(store.rows.get(accountA.userId)?.progress).toMatchObject({
      xp: 140,
      coins: 22,
      [SOLO_CLOUD_DOCUMENT_FIELD]: { revision: 3, payload: { moves: 3 } },
    });
    expect(store.writes).toBe(1);
  });

  it('re-reads after a CAS loss and refuses to overwrite the winning state', async () => {
    const store = new MemorySoloCloudStore();
    const initial = envelope(accountA, 1, '2026-07-22T12:00:00.000Z', 1);
    const winner = envelope(accountA, 3, '2026-07-22T12:10:00.000Z', 3);
    store.rows.set(accountA.userId, {
      progress: cloudProgress(initial),
      updatedAt: '2026-07-22T12:00:01.000Z',
    });
    let raced = false;
    store.beforeReplace = () => {
      if (raced) return undefined;
      raced = true;
      store.rows.set(accountA.userId, {
        progress: cloudProgress(winner),
        updatedAt: '2026-07-22T12:10:01.000Z',
      });
      return false;
    };

    const candidate = envelope(accountA, 2, '2026-07-22T12:05:00.000Z', 2);
    await expect(repository(store).reconcile(accountA, candidate)).resolves.toMatchObject({
      status: 'stale-rejected',
      authoritative: { revision: 3, payload: { moves: 3 } },
    });
    expect(store.rows.get(accountA.userId)?.progress).toMatchObject({
      [SOLO_CLOUD_DOCUMENT_FIELD]: { revision: 3 },
    });
  });

  it('fails closed on divergent equal revisions and future-clock poisoning', async () => {
    const store = new MemorySoloCloudStore();
    const cloud = envelope(accountA, 5, '2026-07-22T12:10:00.000Z', 5);
    store.rows.set(accountA.userId, {
      progress: cloudProgress(cloud),
      updatedAt: '2026-07-22T12:10:01.000Z',
    });
    const divergent = envelope(accountA, 5, '2026-07-22T12:11:00.000Z', 99);
    await expect(repository(store).reconcile(accountA, divergent)).resolves.toMatchObject({
      status: 'conflict',
      authoritative: { payload: { moves: 5 } },
    });
    const future = envelope(accountA, 6, '2099-01-01T00:00:00.000Z', 6);
    await expect(repository(store).reconcile(accountA, future)).rejects.toMatchObject({
      failure: { code: 'validation' },
    });
    expect(store.writes).toBe(0);
  });
});
