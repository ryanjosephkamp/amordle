import { describe, expect, it } from 'vitest';
import { applyEconomyOperation, type EconomyState } from '../../src/domain/economy';
import { createOgSession } from '../../src/domain/game';
import {
  applySoloConsumableEffect,
  consumableIntentSnapshot,
  SoloConsumableIntentCoordinator,
} from '../../src/features/play/solo-consumable-intent';
import { createMemoryStorage } from '../../src/persistence/local-repository';

const guest = { kind: 'guest' } as const;
const preparedAt = '2026-07-22T12:00:00.000Z';

function revealFixture() {
  const session = createOgSession({
    id: 'solo-consumable-1',
    answer: 'apple',
    scope: 'practice',
    now: preparedAt,
  });
  const operationId = `consume:reveal:${session.id}:0`;
  const intent = consumableIntentSnapshot(session, {
    operationId,
    consumable: 'revealOneLetter',
    effect: { kind: 'reveal', position: 0 },
    preparedAt,
  });
  return { session, operationId, intent };
}

function inventoryState(): EconomyState {
  return {
    coins: 0,
    inventory: { revealOneLetter: 1, removeIncorrectLetters: 1 },
    revision: 0,
    operations: {},
  };
}

describe('durable Solo consumable intent', () => {
  it('persists prepare before authorization and restores the exact intent', () => {
    const storage = createMemoryStorage();
    const { intent, operationId } = revealFixture();
    const first = new SoloConsumableIntentCoordinator(guest, 'practice:og', storage);

    expect(first.prepare(intent)).toEqual({ ok: true, value: 'prepared' });
    const reloaded = new SoloConsumableIntentCoordinator(guest, 'practice:og', storage);
    expect(reloaded.pending()).toMatchObject({
      ok: true,
      value: { operationId, phase: 'prepared', effect: { kind: 'reveal', position: 0 } },
    });
    expect(reloaded.prepare(intent)).toEqual({ ok: true, value: 'existing' });
    expect(reloaded.settle(operationId)).toEqual({ ok: true, value: 'not_authorized' });
  });

  it('replays the inventory operation and applies the prepared effect exactly once', () => {
    const storage = createMemoryStorage();
    const { session, intent, operationId } = revealFixture();
    const coordinator = new SoloConsumableIntentCoordinator(guest, 'practice:reveal', storage);
    expect(coordinator.prepare(intent)).toEqual({ ok: true, value: 'prepared' });

    const firstConsume = applyEconomyOperation(inventoryState(), {
      type: 'consume',
      operationId,
      consumable: 'revealOneLetter',
      scope: 'solo-practice',
    });
    if (!firstConsume.ok) throw new Error('Consumable authorization fixture failed.');
    expect(firstConsume.state.inventory.revealOneLetter).toBe(0);

    const reloaded = new SoloConsumableIntentCoordinator(guest, 'practice:reveal', storage);
    const replayedConsume = applyEconomyOperation(firstConsume.state, {
      type: 'consume',
      operationId,
      consumable: 'revealOneLetter',
      scope: 'solo-practice',
    });
    expect(replayedConsume).toMatchObject({
      ok: true,
      applied: false,
      state: { inventory: { revealOneLetter: 0 } },
    });
    expect(reloaded.markAuthorized(operationId, preparedAt)).toEqual({
      ok: true,
      value: 'authorized',
    });

    const applied = applySoloConsumableEffect(session, {
      ...intent,
      phase: 'authorized',
      authorizedAt: preparedAt,
    });
    expect(applied).toMatchObject({
      ok: true,
      applied: true,
      session: {
        revealedPositions: ['a', null, null, null, null],
        draft: ['a', null, null, null, null],
      },
    });
    if (!applied.ok) return;
    expect(
      applySoloConsumableEffect(applied.session, {
        ...intent,
        phase: 'authorized',
        authorizedAt: preparedAt,
      }),
    ).toMatchObject({ ok: true, applied: false });
    expect(reloaded.settle(operationId)).toEqual({ ok: true, value: 'settled' });
    expect(reloaded.pending()).toEqual({ ok: true, value: undefined });
  });

  it('validates a deterministic removal effect against the saved board', () => {
    const session = createOgSession({
      id: 'solo-consumable-remove',
      answer: 'apple',
      scope: 'practice',
      now: preparedAt,
    });
    const intent = consumableIntentSnapshot(session, {
      operationId: `consume:remove:${session.id}:bcz`,
      consumable: 'removeIncorrectLetters',
      effect: { kind: 'remove', letters: ['b', 'c', 'z'] },
      preparedAt,
    });
    const applied = applySoloConsumableEffect(session, { ...intent, phase: 'authorized' });
    expect(applied).toMatchObject({
      ok: true,
      applied: true,
      session: { removedLetters: ['b', 'c', 'z'] },
    });
    expect(
      applySoloConsumableEffect(session, {
        ...intent,
        phase: 'authorized',
        effect: { kind: 'remove', letters: ['a'] },
      }),
    ).toEqual({ ok: false, code: 'state_mismatch' });
  });

  it('fails before inventory authorization when prepare storage is unavailable or corrupt', () => {
    const { intent } = revealFixture();
    const unavailable = new SoloConsumableIntentCoordinator(
      guest,
      'practice:unavailable',
      () => undefined,
    );
    expect(unavailable.prepare(intent)).toEqual({ ok: false, code: 'storage_unavailable' });

    const storage = createMemoryStorage();
    const corrupt = new SoloConsumableIntentCoordinator(guest, 'practice:corrupt', storage);
    expect(corrupt.prepare(intent)).toEqual({ ok: true, value: 'prepared' });
    const key = storage.key(0);
    if (!key) throw new Error('Consumable intent storage fixture failed.');
    storage.setItem(key, '{broken');
    expect(corrupt.prepare(intent)).toEqual({ ok: false, code: 'corrupt_state' });
    expect(storage.getItem(key)).toBe('{broken');
  });
});
