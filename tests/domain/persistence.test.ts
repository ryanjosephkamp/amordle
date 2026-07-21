import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { z } from 'zod';

import {
  chooseAuthoritativeEnvelope,
  createMemoryStorage,
  createVersionedLocalRepository,
  type IdentityScope,
} from '../../src/persistence/local-repository';

const payloadSchema = z.object({ name: z.string(), count: z.number().int().nonnegative() });
const guest = { kind: 'guest' } as const;
const accountA = { kind: 'authenticated', userId: '00000000-0000-4000-8000-000000000001' } as const;
const accountB = { kind: 'authenticated', userId: '00000000-0000-4000-8000-000000000002' } as const;

describe('versioned identity-isolated local persistence', () => {
  it('isolates guest and authenticated account namespaces', () => {
    const storage = createMemoryStorage();
    const repository = createVersionedLocalRepository({ schema: payloadSchema, storage });
    repository.save(guest, { name: 'guest', count: 1 });
    repository.save(accountA, { name: 'a', count: 2 });
    repository.save(accountB, { name: 'b', count: 3 });
    expect(repository.load(guest)).toMatchObject({
      status: 'ok',
      envelope: { payload: { name: 'guest' } },
    });
    expect(repository.load(accountA)).toMatchObject({
      status: 'ok',
      envelope: { payload: { name: 'a' } },
    });
    expect(repository.load(accountB)).toMatchObject({
      status: 'ok',
      envelope: { payload: { name: 'b' } },
    });
    expect(
      new Set([
        repository.storageKey(guest),
        repository.storageKey(accountA),
        repository.storageKey(accountB),
      ]).size,
    ).toBe(3);
  });

  it('detects compare-and-swap conflicts', () => {
    const repository = createVersionedLocalRepository({
      schema: payloadSchema,
      storage: createMemoryStorage(),
    });
    const first = repository.save(guest, { name: 'first', count: 1 }, { expectedRevision: 0 });
    expect(first.ok).toBe(true);
    expect(
      repository.save(guest, { name: 'stale', count: 2 }, { expectedRevision: 0 }),
    ).toMatchObject({
      ok: false,
      reason: 'conflict',
      currentRevision: 1,
    });
  });

  it('migrates older payloads without accepting missing migrations', () => {
    const storage = createMemoryStorage();
    const key = 'test:guest';
    storage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 0,
        owner: guest,
        revision: 4,
        updatedAt: '2026-07-21T12:00:00.000Z',
        payload: { label: 'old' },
      }),
    );
    const repository = createVersionedLocalRepository({
      schema: payloadSchema,
      storage,
      keyPrefix: 'test',
      migrations: { 0: (value) => ({ name: (value as { label: string }).label, count: 0 }) },
    });
    expect(repository.load(guest)).toMatchObject({
      status: 'ok',
      migrated: true,
      envelope: { revision: 4, payload: { name: 'old', count: 0 } },
    });
  });

  it('fails closed for arbitrary corrupt values', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const storage = createMemoryStorage({ 'amordle:local-state:guest': JSON.stringify(value) });
        const repository = createVersionedLocalRepository({ schema: payloadSchema, storage });
        const result = repository.load(guest);
        if (result.status === 'ok') {
          expect(payloadSchema.safeParse(result.envelope.payload).success).toBe(true);
          expect(result.envelope.owner).toEqual(guest);
        } else {
          expect(['empty', 'corrupt', 'unavailable']).toContain(result.status);
        }
      }),
    );
  });

  it('rejects an owner mismatch even when a value is placed under another account key', () => {
    const storage = createMemoryStorage();
    const repository = createVersionedLocalRepository({ schema: payloadSchema, storage });
    const saved = repository.save(accountA, { name: 'a', count: 1 });
    if (!saved.ok) throw new Error('fixture failed');
    storage.setItem(repository.storageKey(accountB), JSON.stringify(saved.envelope));
    expect(repository.load(accountB)).toEqual({ status: 'corrupt', reason: 'owner_mismatch' });
  });

  it('selects newer safe state and rejects future-clock poisoning', () => {
    const envelope = (owner: IdentityScope, revision: number, updatedAt: string, name: string) => ({
      schemaVersion: 1,
      owner,
      revision,
      updatedAt,
      payload: { name, count: 0 },
    });
    const local = envelope(accountA, 3, '2026-07-21T12:00:00.000Z', 'local');
    const cloud = envelope(accountA, 2, '2026-07-21T12:01:00.000Z', 'cloud');
    expect(
      chooseAuthoritativeEnvelope({ local, cloud, nowMs: Date.parse('2026-07-21T12:02:00.000Z') }),
    ).toBe(cloud);
    const poisoned = envelope(accountA, 999, '2099-01-01T00:00:00.000Z', 'poisoned');
    expect(
      chooseAuthoritativeEnvelope({
        local: poisoned,
        cloud,
        nowMs: Date.parse('2026-07-21T12:02:00.000Z'),
      }),
    ).toBe(cloud);
    expect(() =>
      chooseAuthoritativeEnvelope({ local, cloud: envelope(accountB, 1, local.updatedAt, 'b') }),
    ).toThrow(/different owners/);
  });
});
