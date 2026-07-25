import { describe, expect, it } from 'vitest';

import { applyEconomyOperation, initialEconomyState } from '../../src/domain/economy';
import { continueOgSession, createOgSession, submitOgGuess } from '../../src/domain/game';
import { createMemoryStorage } from '../../src/persistence/local-repository';
import { SoloContinuationIntentCoordinator } from '../../src/features/play/solo-continuation-intent';

const guest = { kind: 'guest' } as const;
const preparedAt = '2026-07-22T12:00:00.000Z';
const intent = {
  operationId: 'continue:solo-1:1',
  sessionId: 'solo-1',
  expectedContinuationCount: 0,
  wordLength: 5,
  completionPercentage: 100,
  cost: 3,
  preparedAt,
} as const;

describe('durable Solo continuation intent', () => {
  it('persists prepare before charge and resumes the same exact operation after reload', () => {
    const storage = createMemoryStorage();
    const first = new SoloContinuationIntentCoordinator(guest, 'practice:og', storage);
    expect(first.prepare(intent)).toEqual({ ok: true, value: 'prepared' });
    expect(first.pending()).toMatchObject({
      ok: true,
      value: { ...intent, phase: 'prepared' },
    });

    const reloaded = new SoloContinuationIntentCoordinator(guest, 'practice:og', storage);
    expect(reloaded.pending()).toMatchObject({
      ok: true,
      value: { operationId: intent.operationId, phase: 'prepared', cost: 3 },
    });
    expect(reloaded.prepare(intent)).toEqual({ ok: true, value: 'existing' });
    expect(reloaded.markCharged(intent.operationId, '2026-07-22T12:00:01.000Z')).toEqual({
      ok: true,
      value: 'charged',
    });
    expect(reloaded.pending()).toMatchObject({
      ok: true,
      value: {
        operationId: intent.operationId,
        phase: 'charged',
        chargedAt: '2026-07-22T12:00:01.000Z',
      },
    });
  });

  it('settles only the exact pending operation and rejects operation reuse', () => {
    const storage = createMemoryStorage();
    const coordinator = new SoloContinuationIntentCoordinator(guest, 'practice:og', storage);
    expect(coordinator.prepare(intent)).toEqual({ ok: true, value: 'prepared' });
    expect(coordinator.markCharged('another-operation', preparedAt)).toEqual({
      ok: true,
      value: 'idempotency_conflict',
    });
    expect(coordinator.settle('another-operation')).toEqual({
      ok: true,
      value: 'idempotency_conflict',
    });
    expect(coordinator.settle(intent.operationId)).toEqual({ ok: true, value: 'not_charged' });
    expect(coordinator.markCharged(intent.operationId, preparedAt)).toEqual({
      ok: true,
      value: 'charged',
    });
    expect(coordinator.settle(intent.operationId)).toEqual({ ok: true, value: 'settled' });
    expect(coordinator.pending()).toEqual({ ok: true, value: undefined });
    expect(coordinator.prepare(intent)).toEqual({ ok: true, value: 'settled' });
    expect(coordinator.prepare({ ...intent, cost: 4 })).toEqual({
      ok: true,
      value: 'idempotency_conflict',
    });
  });

  it('fails before charge when durable prepare is unavailable or corrupt', () => {
    const unavailable = new SoloContinuationIntentCoordinator(
      guest,
      'practice:unavailable',
      () => undefined,
    );
    expect(unavailable.prepare(intent)).toEqual({ ok: false, code: 'storage_unavailable' });

    const storage = createMemoryStorage();
    const corrupt = new SoloContinuationIntentCoordinator(guest, 'practice:corrupt', storage);
    expect(corrupt.prepare(intent)).toEqual({ ok: true, value: 'prepared' });
    const key = [...Array.from({ length: storage.length }, (_, index) => storage.key(index))].find(
      Boolean,
    );
    if (!key) throw new Error('Intent storage fixture failed.');
    storage.setItem(key, '{broken');
    expect(corrupt.prepare(intent)).toEqual({ ok: false, code: 'corrupt_state' });
    expect(storage.getItem(key)).toBe('{broken');
  });

  it('blocks a second prepared action until the first intent settles', () => {
    const coordinator = new SoloContinuationIntentCoordinator(
      guest,
      'practice:pending',
      createMemoryStorage(),
    );
    expect(coordinator.prepare(intent)).toEqual({ ok: true, value: 'prepared' });
    expect(
      coordinator.prepare({
        ...intent,
        operationId: 'continue:solo-2:1',
        sessionId: 'solo-2',
      }),
    ).toEqual({ ok: true, value: 'idempotency_conflict' });
  });

  it('replays a charge after a crash and applies the prepared attempt exactly once', () => {
    const storage = createMemoryStorage();
    const coordinator = new SoloContinuationIntentCoordinator(guest, 'practice:replay', storage);
    let session = createOgSession({
      id: 'solo-1',
      answer: 'apple',
      scope: 'practice',
      maxAttempts: 1,
      now: preparedAt,
    });
    const submitted = submitOgGuess(session, 'baker', new Set(['apple', 'baker']), {
      now: preparedAt,
    });
    if (!submitted.ok) throw new Error('Continuation replay fixture failed.');
    session = submitted.session;
    expect(coordinator.prepare(intent)).toEqual({ ok: true, value: 'prepared' });

    const firstCharge = applyEconomyOperation(initialEconomyState(10), {
      type: 'spend',
      operationId: intent.operationId,
      amount: intent.cost,
    });
    if (!firstCharge.ok) throw new Error('Continuation charge fixture failed.');
    expect(firstCharge.state.coins).toBe(7);
    // Simulate a crash after the economy commit but before the session mutation.
    const afterReload = new SoloContinuationIntentCoordinator(guest, 'practice:replay', storage);
    expect(afterReload.pending()).toMatchObject({
      ok: true,
      value: { operationId: intent.operationId, phase: 'prepared' },
    });
    const replayedCharge = applyEconomyOperation(firstCharge.state, {
      type: 'spend',
      operationId: intent.operationId,
      amount: intent.cost,
    });
    expect(replayedCharge).toMatchObject({ ok: true, applied: false, state: { coins: 7 } });
    expect(afterReload.markCharged(intent.operationId, preparedAt)).toMatchObject({
      ok: true,
      value: 'charged',
    });

    const continued = continueOgSession(session, intent.operationId, preparedAt);
    expect(continued).toMatchObject({
      status: 'playing',
      maxAttempts: 2,
      continuationCount: 1,
      appliedContinuationIds: [intent.operationId],
    });
    expect(continueOgSession(continued, intent.operationId, preparedAt)).toBe(continued);
    expect(afterReload.settle(intent.operationId)).toEqual({ ok: true, value: 'settled' });
    expect(
      new SoloContinuationIntentCoordinator(guest, 'practice:replay', storage).pending(),
    ).toEqual({ ok: true, value: undefined });
  });
});
