import { fnv1a32, mixU32 } from './go';

export type ConsumableType = 'revealOneLetter' | 'removeIncorrectLetters';
export const CONSUMABLE_COSTS: Readonly<Record<ConsumableType, number>> = {
  revealOneLetter: 25,
  removeIncorrectLetters: 40,
};

export interface EconomyState {
  readonly coins: number;
  readonly inventory: Readonly<Record<ConsumableType, number>>;
  readonly revision: number;
  readonly operations: Readonly<Record<string, string>>;
}

export function initialEconomyState(coins = 0): EconomyState {
  return {
    coins: Math.max(0, Math.trunc(coins)),
    inventory: { revealOneLetter: 0, removeIncorrectLetters: 0 },
    revision: 0,
    operations: {},
  };
}

export type EconomyOperation =
  | { readonly type: 'credit'; readonly operationId: string; readonly amount: number }
  | { readonly type: 'spend'; readonly operationId: string; readonly amount: number }
  | { readonly type: 'purchase'; readonly operationId: string; readonly consumable: ConsumableType }
  | {
      readonly type: 'consume';
      readonly operationId: string;
      readonly consumable: ConsumableType;
      readonly scope: 'solo-practice' | string;
    };

export type EconomyOperationResult =
  | { readonly ok: true; readonly applied: boolean; readonly state: EconomyState }
  | {
      readonly ok: false;
      readonly code:
        | 'invalid_operation'
        | 'idempotency_conflict'
        | 'insufficient_coins'
        | 'insufficient_inventory'
        | 'invalid_scope';
      readonly state: EconomyState;
    };

function operationFingerprint(operation: EconomyOperation): string {
  return JSON.stringify(operation);
}

export function applyEconomyOperation(
  state: EconomyState,
  operation: EconomyOperation,
): EconomyOperationResult {
  const operationId = operation.operationId.trim();
  if (!operationId || operationId.length > 200)
    return { ok: false, code: 'invalid_operation', state };
  const fingerprint = operationFingerprint({ ...operation, operationId });
  const existing = state.operations[operationId];
  if (existing) {
    return existing === fingerprint
      ? { ok: true, applied: false, state }
      : { ok: false, code: 'idempotency_conflict', state };
  }

  let coins = state.coins;
  const inventory = { ...state.inventory };
  if (operation.type === 'credit') {
    if (!Number.isInteger(operation.amount) || operation.amount <= 0 || operation.amount > 10_000) {
      return { ok: false, code: 'invalid_operation', state };
    }
    coins += operation.amount;
  } else if (operation.type === 'spend') {
    if (!Number.isInteger(operation.amount) || operation.amount <= 0 || operation.amount > 10_000) {
      return { ok: false, code: 'invalid_operation', state };
    }
    if (coins < operation.amount) return { ok: false, code: 'insufficient_coins', state };
    coins -= operation.amount;
  } else if (operation.type === 'purchase') {
    const cost = CONSUMABLE_COSTS[operation.consumable];
    if (coins < cost) return { ok: false, code: 'insufficient_coins', state };
    coins -= cost;
    inventory[operation.consumable] += 1;
  } else {
    if (operation.scope !== 'solo-practice') return { ok: false, code: 'invalid_scope', state };
    if (inventory[operation.consumable] < 1) {
      return { ok: false, code: 'insufficient_inventory', state };
    }
    inventory[operation.consumable] -= 1;
  }

  return {
    ok: true,
    applied: true,
    state: {
      coins,
      inventory,
      revision: state.revision + 1,
      operations: { ...state.operations, [operationId]: fingerprint },
    },
  };
}

export function continuationCost(input: {
  readonly wordLength: number;
  readonly completionPercentage: number;
  readonly continuationCount: number;
}): number {
  if (!Number.isInteger(input.wordLength) || input.wordLength < 2 || input.wordLength > 35) {
    throw new RangeError('Continuation word length must be an integer from 2 through 35.');
  }
  if (
    !Number.isFinite(input.completionPercentage) ||
    input.completionPercentage < 0 ||
    input.completionPercentage > 100
  ) {
    throw new RangeError('Continuation completion percentage must be from 0 through 100.');
  }
  if (!Number.isInteger(input.continuationCount) || input.continuationCount < 0) {
    throw new RangeError('Continuation count must be a non-negative integer.');
  }
  const multiplier = input.continuationCount + 1;
  const halfLength = Math.ceil(input.wordLength / 2);
  const completed = Math.floor((input.completionPercentage / 100) * halfLength);
  return Math.max(1, (halfLength - completed + 3) * multiplier);
}

export interface PaidContinuationState {
  readonly maxAttempts: number;
  readonly continuationCount: number;
  readonly appliedOperationIds: readonly string[];
  /** Cost is retained so retries never recalculate against the incremented continuation count. */
  readonly operationCosts?: Readonly<Record<string, number>> | undefined;
  /** Inputs are retained so one operation id cannot be reused for a different continuation. */
  readonly operationFingerprints?: Readonly<Record<string, string>> | undefined;
}

function paidContinuationFingerprint(input: {
  readonly wordLength: number;
  readonly completionPercentage: number;
  readonly continuationCount: number;
  readonly cost: number;
}): string {
  return JSON.stringify(input);
}

export function applyPaidContinuation(input: {
  readonly economy: EconomyState;
  readonly continuation: PaidContinuationState;
  readonly operationId: string;
  readonly wordLength: number;
  readonly completionPercentage: number;
}):
  | {
      readonly ok: true;
      readonly applied: boolean;
      readonly cost: number;
      readonly economy: EconomyState;
      readonly continuation: PaidContinuationState;
    }
  | {
      readonly ok: false;
      readonly code: 'invalid_operation' | 'insufficient_coins' | 'idempotency_conflict';
      readonly cost: number;
    } {
  const operationId = input.operationId.trim();
  if (!operationId || operationId.length > 200) {
    return { ok: false, code: 'invalid_operation', cost: 0 };
  }
  const priorIndex = input.continuation.appliedOperationIds.indexOf(operationId);
  const effectiveContinuationCount =
    priorIndex >= 0 ? priorIndex : input.continuation.continuationCount;
  let calculatedCost: number;
  try {
    calculatedCost = continuationCost({
      wordLength: input.wordLength,
      completionPercentage: input.completionPercentage,
      continuationCount: effectiveContinuationCount,
    });
  } catch {
    return { ok: false, code: 'invalid_operation', cost: 0 };
  }
  const cost =
    priorIndex >= 0
      ? (input.continuation.operationCosts?.[operationId] ?? calculatedCost)
      : calculatedCost;
  const fingerprint = paidContinuationFingerprint({
    wordLength: input.wordLength,
    completionPercentage: input.completionPercentage,
    continuationCount: effectiveContinuationCount,
    cost,
  });
  if (priorIndex >= 0) {
    const existingContinuationFingerprint = input.continuation.operationFingerprints?.[operationId];
    if (
      existingContinuationFingerprint !== undefined &&
      existingContinuationFingerprint !== fingerprint
    ) {
      return { ok: false, code: 'idempotency_conflict', cost };
    }
    const expectedFingerprint = operationFingerprint({
      type: 'spend',
      operationId,
      amount: cost,
    });
    if (input.economy.operations[operationId] !== expectedFingerprint) {
      return { ok: false, code: 'idempotency_conflict', cost };
    }
    return {
      ok: true,
      applied: false,
      cost,
      economy: input.economy,
      continuation: input.continuation,
    };
  }
  const economyResult = applyEconomyOperation(input.economy, {
    type: 'spend',
    operationId,
    amount: cost,
  });
  if (!economyResult.ok) {
    return {
      ok: false,
      code:
        economyResult.code === 'idempotency_conflict'
          ? 'idempotency_conflict'
          : economyResult.code === 'invalid_operation'
            ? 'invalid_operation'
            : 'insufficient_coins',
      cost,
    };
  }
  return {
    ok: true,
    applied: true,
    cost,
    economy: economyResult.state,
    continuation: {
      maxAttempts: input.continuation.maxAttempts + 1,
      continuationCount: input.continuation.continuationCount + 1,
      appliedOperationIds: [...input.continuation.appliedOperationIds, operationId],
      operationCosts: { ...input.continuation.operationCosts, [operationId]: cost },
      operationFingerprints: {
        ...input.continuation.operationFingerprints,
        [operationId]: fingerprint,
      },
    },
  };
}

function deterministicOrder(values: readonly string[], seed: string): readonly string[] {
  return [...values].sort((left, right) => {
    const leftRank = mixU32(fnv1a32(`${seed}:${left}`));
    const rightRank = mixU32(fnv1a32(`${seed}:${right}`));
    return leftRank - rightRank || left.localeCompare(right);
  });
}

export function selectRevealPosition(input: {
  readonly answer: string;
  readonly revealedPositions: readonly (string | null)[];
  readonly seed: string;
}): number | undefined {
  const unresolved = input.answer
    .split('')
    .map((_letter, index) => index)
    .filter((index) => !input.revealedPositions[index]);
  const selected = deterministicOrder(unresolved.map(String), input.seed)[0];
  return selected === undefined ? undefined : Number(selected);
}

export function selectIncorrectLettersToRemove(input: {
  readonly answer: string;
  readonly draft: string;
  readonly alreadyAbsentOrRemoved: readonly string[];
  readonly seed: string;
}): readonly string[] {
  const excluded = new Set([
    ...input.answer.toLocaleLowerCase('en-US'),
    ...input.draft.toLocaleLowerCase('en-US'),
    ...input.alreadyAbsentOrRemoved.map((letter) => letter.toLocaleLowerCase('en-US')),
  ]);
  const eligible = 'abcdefghijklmnopqrstuvwxyz'.split('').filter((letter) => !excluded.has(letter));
  return deterministicOrder(eligible, input.seed).slice(0, 5);
}
