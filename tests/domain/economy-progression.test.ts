import { describe, expect, it } from 'vitest';

import {
  CONSUMABLE_COSTS,
  applyEconomyOperation,
  applyPaidContinuation,
  continuationCost,
  initialEconomyState,
  selectIncorrectLettersToRemove,
  selectRevealPosition,
} from '../../src/domain/economy';
import {
  applyCompletionReward,
  calculateCompletionReward,
  cumulativeXpForLevel,
  initialProgressionState,
  levelForXp,
  promotePastDailyEntitlement,
  purchasePastDailyEntitlement,
  unlockPastDaily,
} from '../../src/domain/progression';

describe('progression', () => {
  it('calculates exact XP and coin rewards', () => {
    expect(
      calculateCompletionReward({
        gameId: 'g',
        status: 'won',
        mode: 'go',
        scope: 'daily',
        wordLength: 5,
        puzzleCount: 5,
        unusedAttempts: 3,
      }),
    ).toEqual({ xp: 290, coins: 41 });
    expect(
      calculateCompletionReward({
        gameId: 'l',
        status: 'lost',
        mode: 'og',
        scope: 'practice',
        wordLength: 2,
        puzzleCount: 1,
        unusedAttempts: 0,
      }),
    ).toEqual({ xp: 5, coins: 1 });
    expect(
      calculateCompletionReward({
        gameId: 'daily-loss',
        status: 'lost',
        mode: 'go',
        scope: 'daily',
        wordLength: 35,
        puzzleCount: 3,
        unusedAttempts: 0,
      }),
    ).toEqual({ xp: 105, coins: 2 });
    expect(() =>
      calculateCompletionReward({
        gameId: 'invalid',
        status: 'won',
        mode: 'og',
        scope: 'practice',
        wordLength: 5.5,
        puzzleCount: 1,
        unusedAttempts: 0,
      }),
    ).toThrow(/word length/);
  });

  it('uses cumulative N × 100 level costs', () => {
    expect(cumulativeXpForLevel(1)).toBe(0);
    expect(cumulativeXpForLevel(4)).toBe(600);
    expect(levelForXp(599)).toMatchObject({ level: 3, currentLevelXp: 299, nextLevelCost: 300 });
    expect(levelForXp(600)).toMatchObject({ level: 4, currentLevelXp: 0, nextLevelCost: 400 });
  });

  it('awards and unlocks exactly once', () => {
    const completion = {
      gameId: 'game-1',
      status: 'won' as const,
      mode: 'og' as const,
      scope: 'practice' as const,
      wordLength: 5,
      puzzleCount: 1,
      unusedAttempts: 2,
    };
    const first = applyCompletionReward(initialProgressionState(), completion);
    const retry = applyCompletionReward(first.state, completion);
    expect(first.applied).toBe(true);
    expect(retry.applied).toBe(false);
    expect(retry.conflict).toBe(false);
    expect(applyCompletionReward(first.state, { ...completion, unusedAttempts: 1 })).toMatchObject({
      applied: false,
      conflict: true,
      state: first.state,
    });
    const funded = { ...first.state, coins: 60 };
    const unlock = unlockPastDaily({
      state: funded,
      operationId: 'unlock-1',
      mode: 'go',
      dateKey: '2025-01-01',
      todayKey: '2026-07-21',
    });
    expect(unlock.ok).toBe(true);
    if (!unlock.ok) return;
    expect(unlock.state.coins).toBe(0);
    expect(unlock.state.unlockedDailies).toEqual(['go:2025-01-01']);
    expect(
      unlockPastDaily({
        state: unlock.state,
        operationId: 'unlock-2',
        mode: 'go',
        dateKey: '2025-01-01',
        todayKey: '2026-07-21',
      }),
    ).toMatchObject({ ok: true, applied: false });
    expect(
      unlockPastDaily({
        state: unlock.state,
        operationId: 'unlock-1',
        mode: 'og',
        dateKey: '2025-01-02',
        todayKey: '2026-07-21',
      }),
    ).toMatchObject({ ok: false, code: 'idempotency_conflict' });
  });

  it('keeps paid past-Daily access pending until the first persisted guess promotes it', () => {
    const funded = { ...initialProgressionState(), coins: 120 };
    const purchased = purchasePastDailyEntitlement({
      state: funded,
      operationId: 'past-daily:go:2025-01-01',
      mode: 'go',
      dateKey: '2025-01-01',
      todayKey: '2026-07-22',
    });
    expect(purchased.ok).toBe(true);
    if (!purchased.ok) return;
    expect(purchased.state.coins).toBe(60);
    expect(purchased.state.unlockedDailies).toEqual([]);
    expect(purchased.state.pendingDailyUnlocks).toEqual({
      'go:2025-01-01': 'past-daily:go:2025-01-01',
    });
    expect(
      purchasePastDailyEntitlement({
        state: purchased.state,
        operationId: 'another-click',
        mode: 'go',
        dateKey: '2025-01-01',
        todayKey: '2026-07-22',
      }),
    ).toMatchObject({ ok: true, applied: false, state: purchased.state });
    const promoted = promotePastDailyEntitlement(purchased.state, 'go', '2025-01-01');
    expect(promoted.applied).toBe(true);
    expect(promoted.state.coins).toBe(60);
    expect(promoted.state.pendingDailyUnlocks).toEqual({});
    expect(promoted.state.unlockedDailies).toEqual(['go:2025-01-01']);
    expect(
      purchasePastDailyEntitlement({
        state: funded,
        operationId: 'invalid-date',
        mode: 'go',
        dateKey: '2025-13-01',
        todayKey: '2026-07-22',
      }),
    ).toMatchObject({ ok: false, code: 'invalid_date', state: funded });
  });
});

describe('economy and deterministic tools', () => {
  it('purchases and consumes only in Solo Practice with idempotency', () => {
    expect(CONSUMABLE_COSTS).toEqual({ revealOneLetter: 25, removeIncorrectLetters: 40 });
    const funded = initialEconomyState(100);
    const purchased = applyEconomyOperation(funded, {
      type: 'purchase',
      operationId: 'buy-1',
      consumable: 'revealOneLetter',
    });
    expect(purchased.ok).toBe(true);
    if (!purchased.ok) return;
    expect(purchased.state).toMatchObject({
      coins: 75,
      inventory: { revealOneLetter: 1 },
      revision: 1,
    });
    expect(
      applyEconomyOperation(purchased.state, {
        type: 'purchase',
        operationId: 'buy-1',
        consumable: 'revealOneLetter',
      }),
    ).toMatchObject({ ok: true, applied: false });
    const secondPurchase = applyEconomyOperation(purchased.state, {
      type: 'purchase',
      operationId: 'buy-2',
      consumable: 'removeIncorrectLetters',
    });
    expect(secondPurchase).toMatchObject({
      ok: true,
      applied: true,
      state: { coins: 35, inventory: { removeIncorrectLetters: 1 }, revision: 2 },
    });
    expect(
      applyEconomyOperation(purchased.state, {
        type: 'purchase',
        operationId: 'buy-1',
        consumable: 'removeIncorrectLetters',
      }),
    ).toMatchObject({ ok: false, code: 'idempotency_conflict' });
    expect(
      applyEconomyOperation(purchased.state, {
        type: 'consume',
        operationId: 'use-bad',
        consumable: 'revealOneLetter',
        scope: 'daily',
      }),
    ).toMatchObject({ ok: false, code: 'invalid_scope' });
    expect(
      applyEconomyOperation(purchased.state, {
        type: 'consume',
        operationId: 'use-1',
        consumable: 'revealOneLetter',
        scope: 'solo-practice',
      }),
    ).toMatchObject({ ok: true, applied: true, state: { inventory: { revealOneLetter: 0 } } });
  });

  it('matches the accepted continuation formula and applies charge/attempt atomically', () => {
    expect(continuationCost({ wordLength: 5, completionPercentage: 0, continuationCount: 0 })).toBe(
      6,
    );
    expect(
      continuationCost({ wordLength: 5, completionPercentage: 100, continuationCount: 0 }),
    ).toBe(3);
    expect(
      continuationCost({ wordLength: 5, completionPercentage: 100, continuationCount: 1 }),
    ).toBe(6);
    const continued = applyPaidContinuation({
      economy: initialEconomyState(10),
      continuation: { maxAttempts: 6, continuationCount: 0, appliedOperationIds: [] },
      operationId: 'continue-1',
      wordLength: 5,
      completionPercentage: 100,
    });
    expect(continued.ok).toBe(true);
    if (!continued.ok) return;
    expect(continued).toMatchObject({
      cost: 3,
      economy: { coins: 7 },
      continuation: { maxAttempts: 7, continuationCount: 1 },
    });
    expect(
      applyPaidContinuation({
        economy: continued.economy,
        continuation: continued.continuation,
        operationId: 'continue-1',
        wordLength: 5,
        completionPercentage: 100,
      }),
    ).toMatchObject({
      ok: true,
      applied: false,
      cost: 3,
      economy: { coins: 7, revision: 1 },
      continuation: { maxAttempts: 7, continuationCount: 1 },
    });
    expect(
      applyPaidContinuation({
        economy: continued.economy,
        continuation: continued.continuation,
        operationId: 'continue-1',
        wordLength: 5,
        completionPercentage: 0,
      }),
    ).toMatchObject({ ok: false, code: 'idempotency_conflict', cost: 3 });
    const secondContinuation = applyPaidContinuation({
      economy: continued.economy,
      continuation: continued.continuation,
      operationId: 'continue-2',
      wordLength: 5,
      completionPercentage: 100,
    });
    expect(secondContinuation).toMatchObject({
      ok: true,
      applied: true,
      cost: 6,
      economy: { coins: 1, revision: 2 },
      continuation: { maxAttempts: 8, continuationCount: 2 },
    });
    const insufficient = applyPaidContinuation({
      economy: initialEconomyState(0),
      continuation: { maxAttempts: 6, continuationCount: 0, appliedOperationIds: [] },
      operationId: 'continue-2',
      wordLength: 35,
      completionPercentage: 0,
    });
    expect(insufficient).toMatchObject({ ok: false, code: 'insufficient_coins' });
    expect(() =>
      continuationCost({ wordLength: 36, completionPercentage: 100, continuationCount: 0 }),
    ).toThrow(/word length/);
    expect(
      applyPaidContinuation({
        economy: initialEconomyState(10),
        continuation: { maxAttempts: 6, continuationCount: 0, appliedOperationIds: [] },
        operationId: 'invalid-continuation',
        wordLength: 36,
        completionPercentage: 100,
      }),
    ).toMatchObject({ ok: false, code: 'invalid_operation', cost: 0 });
  });

  it('chooses stable eligible reveal/removal effects', () => {
    expect(
      selectRevealPosition({
        answer: 'apple',
        revealedPositions: [null, null, null, null, null],
        seed: 'x',
      }),
    ).toBe(
      selectRevealPosition({
        answer: 'apple',
        revealedPositions: [null, null, null, null, null],
        seed: 'x',
      }),
    );
    const removed = selectIncorrectLettersToRemove({
      answer: 'apple',
      draft: 'z',
      alreadyAbsentOrRemoved: ['q'],
      seed: 'x',
    });
    expect(removed).toHaveLength(5);
    expect(removed.some((letter) => 'applezq'.includes(letter))).toBe(false);
  });
});
