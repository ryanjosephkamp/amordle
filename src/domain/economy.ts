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
    if (!Number.isInteger(operation.amount) || operation.amount <= 0) {
      return { ok: false, code: 'invalid_operation', state };
    }
    coins += operation.amount;
  } else if (operation.type === 'spend') {
    if (!Number.isInteger(operation.amount) || operation.amount <= 0) {
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
  const wordLength = Math.max(2, Math.floor(input.wordLength));
  const percentage = Math.min(100, Math.max(0, input.completionPercentage));
  const multiplier = Math.max(1, Math.floor(input.continuationCount) + 1);
  const halfLength = Math.ceil(wordLength / 2);
  const completed = Math.floor((percentage / 100) * halfLength);
  return Math.max(1, (halfLength - completed + 3) * multiplier);
}

export interface PaidContinuationState {
  readonly maxAttempts: number;
  readonly continuationCount: number;
  readonly appliedOperationIds: readonly string[];
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
      readonly code: 'insufficient_coins' | 'idempotency_conflict';
      readonly cost: number;
    } {
  const cost = continuationCost({
    wordLength: input.wordLength,
    completionPercentage: input.completionPercentage,
    continuationCount: input.continuation.continuationCount,
  });
  if (input.continuation.appliedOperationIds.includes(input.operationId)) {
    const expectedFingerprint = operationFingerprint({
      type: 'spend',
      operationId: input.operationId,
      amount: cost,
    });
    if (input.economy.operations[input.operationId] !== expectedFingerprint) {
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
    operationId: input.operationId,
    amount: cost,
  });
  if (!economyResult.ok) {
    return {
      ok: false,
      code:
        economyResult.code === 'idempotency_conflict'
          ? 'idempotency_conflict'
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
      appliedOperationIds: [...input.continuation.appliedOperationIds, input.operationId],
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
