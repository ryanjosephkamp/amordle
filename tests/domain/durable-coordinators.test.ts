import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  acknowledgeSoloCompletion,
  beginSoloSession,
  initialSoloCompletionLedger,
  resumableSoloSession,
  settleSoloCompletion,
  soloCompletionLedgerSchema,
  type SoloLedgerTransition,
} from '../../src/domain/solo-completion-ledger';
import { DurableStateCoordinator } from '../../src/persistence/durable-state-coordinator';
import {
  createMemoryStorage,
  createVersionedLocalRepository,
} from '../../src/persistence/local-repository';

const guest = { kind: 'guest' } as const;

function durableSoloTransition(transition: SoloLedgerTransition) {
  return {
    applied: transition.ok && transition.applied,
    value: transition.state,
    result: transition,
  };
}

describe('durable Solo completion coordination', () => {
  it('persists completion, reward, retirement, and handoff atomically without resurrection', () => {
    const storage = createMemoryStorage();
    const repository = createVersionedLocalRepository({
      schema: soloCompletionLedgerSchema,
      storage,
      keyPrefix: 'test:solo-ledger',
    });
    const coordinator = new DurableStateCoordinator(repository, guest, initialSoloCompletionLedger);

    expect(coordinator.hydrate()).toMatchObject({ status: 'ready', revision: 0 });
    const begun = coordinator.transact((state) =>
      durableSoloTransition(
        beginSoloSession(state, {
          sessionId: 'solo-1',
          sequence: 1,
          startedAt: '2026-07-22T12:00:00.000Z',
        }),
      ),
    );
    expect(begun).toMatchObject({ ok: true, applied: true, snapshot: { revision: 1 } });

    const completion = {
      gameId: 'solo-1',
      status: 'won' as const,
      mode: 'go' as const,
      scope: 'daily' as const,
      wordLength: 5,
      puzzleCount: 5,
      unusedAttempts: 3,
    };
    const settled = coordinator.transact((state) =>
      durableSoloTransition(
        settleSoloCompletion(state, {
          sequence: 1,
          completedAt: '2026-07-22T12:05:00.000Z',
          completion,
        }),
      ),
    );
    expect(settled).toMatchObject({
      ok: true,
      applied: true,
      snapshot: {
        revision: 2,
        value: {
          handoff: { sessionId: 'solo-1', reward: { xp: 290, coins: 41 } },
          retiredSessions: { 'solo-1': 'completed' },
          progression: { xp: 290, coins: 41, rewardedGameIds: ['solo-1'] },
        },
      },
    });
    if (!settled.ok) return;
    expect(settled.snapshot.value.active).toBeUndefined();
    expect(resumableSoloSession(settled.snapshot.value)).toBeUndefined();

    const retry = coordinator.transact((state) =>
      durableSoloTransition(
        settleSoloCompletion(state, {
          sequence: 1,
          completedAt: '2026-07-22T12:05:00.000Z',
          completion,
        }),
      ),
    );
    expect(retry).toMatchObject({ ok: true, applied: false, snapshot: { revision: 2 } });

    const acknowledged = coordinator.transact((state) =>
      durableSoloTransition(acknowledgeSoloCompletion(state, 'solo-1')),
    );
    expect(acknowledged).toMatchObject({
      ok: true,
      applied: true,
      snapshot: { revision: 3, value: { retiredSessions: { 'solo-1': 'completed' } } },
    });
    if (!acknowledged.ok) return;
    expect(acknowledged.snapshot.value.handoff).toBeUndefined();

    const next = coordinator.transact((state) =>
      durableSoloTransition(
        beginSoloSession(state, {
          sessionId: 'solo-2',
          sequence: 2,
          startedAt: '2026-07-22T12:10:00.000Z',
        }),
      ),
    );
    expect(next).toMatchObject({ ok: true, applied: true, snapshot: { revision: 4 } });

    const resurrect = coordinator.transact((state) =>
      durableSoloTransition(
        beginSoloSession(state, {
          sessionId: 'solo-1',
          sequence: 1,
          startedAt: '2026-07-22T12:00:00.000Z',
        }),
      ),
    );
    expect(resurrect).toMatchObject({
      ok: true,
      applied: false,
      result: { ok: false, code: 'retired_session' },
      snapshot: { revision: 4 },
    });

    const restored = new DurableStateCoordinator(
      repository,
      guest,
      initialSoloCompletionLedger,
    ).hydrate();
    expect(restored).toMatchObject({
      status: 'ready',
      revision: 4,
      value: { active: { sessionId: 'solo-2', sequence: 2 } },
    });
    expect(resumableSoloSession(restored.value)).toMatchObject({
      sessionId: 'solo-2',
      sequence: 2,
    });
  });

  it('keeps a monotonic revision and incorporates an external winning revision', () => {
    const payloadSchema = z.object({ count: z.number().int().nonnegative() });
    const storage = createMemoryStorage();
    const repository = createVersionedLocalRepository({
      schema: payloadSchema,
      storage,
      keyPrefix: 'test:coordinator',
    });
    const coordinator = new DurableStateCoordinator(repository, guest, () => ({ count: 0 }));
    expect(
      coordinator.transact((state) => ({
        applied: true,
        value: { count: state.count + 1 },
        result: 'local',
      })),
    ).toMatchObject({ ok: true, snapshot: { revision: 1, value: { count: 1 } } });
    expect(repository.save(guest, { count: 5 }, { expectedRevision: 1 })).toMatchObject({
      ok: true,
    });
    expect(
      coordinator.transact((state) => ({
        applied: true,
        value: { count: state.count + 1 },
        result: 'after-external',
      })),
    ).toMatchObject({ ok: true, snapshot: { revision: 3, value: { count: 6 } } });

    expect(repository.clear(guest, 3)).toBe(true);
    expect(coordinator.hydrate()).toMatchObject({
      status: 'error',
      revision: 3,
      value: { count: 6 },
      error: { code: 'revision_regression', observedRevision: 3 },
    });
  });

  it('fails closed on corrupt or unavailable storage without replacing state', () => {
    const payloadSchema = z.object({ count: z.number().int().nonnegative() });
    const storage = createMemoryStorage();
    const repository = createVersionedLocalRepository({
      schema: payloadSchema,
      storage,
      keyPrefix: 'test:corrupt',
    });
    storage.setItem(repository.storageKey(guest), '{not-json');
    const coordinator = new DurableStateCoordinator(repository, guest, () => ({ count: 0 }));
    expect(coordinator.hydrate()).toMatchObject({
      status: 'error',
      error: { code: 'corrupt_state' },
    });
    expect(
      coordinator.transact((state) => ({
        applied: true,
        value: { count: state.count + 1 },
        result: undefined,
      })),
    ).toMatchObject({ ok: false, snapshot: { error: { code: 'corrupt_state' } } });
    expect(storage.getItem(repository.storageKey(guest))).toBe('{not-json');

    const unavailable = new DurableStateCoordinator(
      createVersionedLocalRepository({ schema: payloadSchema, storage: () => undefined }),
      guest,
      () => ({ count: 0 }),
    );
    expect(unavailable.hydrate()).toMatchObject({
      status: 'error',
      error: { code: 'storage_unavailable' },
    });
  });
});
