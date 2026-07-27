export type EconomyOperation =
  'reward' | 'purchase-reveal' | 'purchase-remove' | 'daily-unlock' | 'continuation';

export const ECONOMY_PRICES = {
  reveal: 25,
  remove: 40,
  dailyUnlock: 60,
} as const;

export function levelForXp(xp: number): number {
  if (!Number.isInteger(xp) || xp < 0) throw new Error('XP must be non-negative.');
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export function xpFloorForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new Error('Level must be positive.');
  return (level - 1) ** 2 * 100;
}

export function continuationCost(input: {
  wordLength: number;
  completionPercentage: number;
  continuationCount: number;
}): number {
  if (!Number.isInteger(input.wordLength) || input.wordLength < 2 || input.wordLength > 35) {
    throw new Error('Continuation word length must be from 2 to 35.');
  }
  if (
    !Number.isFinite(input.completionPercentage) ||
    input.completionPercentage < 0 ||
    input.completionPercentage > 100
  ) {
    throw new Error('Completion percentage must be from 0 to 100.');
  }
  if (!Number.isInteger(input.continuationCount) || input.continuationCount < 0) {
    throw new Error('Continuation count must be non-negative.');
  }
  const multiplier = input.continuationCount + 1;
  const halfLength = Math.ceil(input.wordLength / 2);
  const completed = Math.floor((input.completionPercentage / 100) * halfLength);
  return Math.max(1, (halfLength - completed + 3) * multiplier);
}

function seededRank(value: string): number {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function deterministicOrder<T extends string | number>(values: readonly T[], seed: string): T[] {
  return [...values].sort(
    (left, right) =>
      seededRank(`${seed}:${left}`) - seededRank(`${seed}:${right}`) ||
      String(left).localeCompare(String(right)),
  );
}

export function selectRevealPosition(input: {
  answer: string;
  knownPositions: ReadonlySet<number>;
  operationId: string;
}): number | null {
  const unresolved = [...input.answer]
    .map((_letter, index) => index)
    .filter((index) => !input.knownPositions.has(index));
  return deterministicOrder(unresolved, input.operationId)[0] ?? null;
}

export function selectIncorrectLettersToRemove(input: {
  answer: string;
  draft: string;
  alreadyAbsentOrRemoved: ReadonlySet<string>;
  operationId: string;
}): string[] {
  const excluded = new Set([
    ...input.answer.toLowerCase(),
    ...input.draft.toLowerCase(),
    ...input.alreadyAbsentOrRemoved,
  ]);
  const eligible = [...'abcdefghijklmnopqrstuvwxyz'].filter((letter) => !excluded.has(letter));
  return deterministicOrder(eligible, input.operationId).slice(0, 5);
}

export function economyIdempotencyKey(input: {
  ownerNamespace: string;
  operation: EconomyOperation;
  logicalId: string;
}): string {
  return `${input.ownerNamespace}:${input.operation}:${input.logicalId}`;
}
