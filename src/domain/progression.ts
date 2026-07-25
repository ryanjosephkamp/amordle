import {
  DAILY_CALENDAR_START,
  PAST_DAILY_UNLOCK_COST,
  isDateKey,
  pastDailyUnlockKey,
  type DailyMode,
} from './daily';

export interface CompletionRewardInput {
  readonly gameId: string;
  readonly status: 'won' | 'lost';
  readonly mode: 'og' | 'go';
  readonly scope: 'daily' | 'practice';
  readonly wordLength: number;
  readonly puzzleCount: number;
  readonly unusedAttempts: number;
}

export interface CompletionReward {
  readonly xp: number;
  readonly coins: number;
}

function normalizedCompletion(input: CompletionRewardInput): CompletionRewardInput {
  const gameId = input.gameId.trim();
  if (!gameId || gameId.length > 200) throw new RangeError('A valid game id is required.');
  if (!Number.isInteger(input.wordLength) || input.wordLength < 2 || input.wordLength > 35) {
    throw new RangeError('Reward word length must be an integer from 2 through 35.');
  }
  if (!Number.isInteger(input.puzzleCount) || input.puzzleCount < 1) {
    throw new RangeError('Reward puzzle count must be a positive integer.');
  }
  if (!Number.isInteger(input.unusedAttempts) || input.unusedAttempts < 0) {
    throw new RangeError('Unused attempts must be a non-negative integer.');
  }
  return { ...input, gameId };
}

function completionFingerprint(input: CompletionRewardInput): string {
  return JSON.stringify({
    status: input.status,
    mode: input.mode,
    scope: input.scope,
    wordLength: input.wordLength,
    puzzleCount: input.puzzleCount,
    unusedAttempts: input.unusedAttempts,
  });
}

export function calculateCompletionReward(input: CompletionRewardInput): CompletionReward {
  const normalized = normalizedCompletion(input);
  if (normalized.status === 'won') {
    return {
      xp:
        normalized.wordLength * 10 * normalized.puzzleCount +
        5 * normalized.unusedAttempts +
        (normalized.mode === 'go' ? 25 : 0),
      coins:
        normalized.wordLength * normalized.puzzleCount +
        2 * normalized.unusedAttempts +
        (normalized.scope === 'daily' ? 5 : 0) +
        (normalized.mode === 'go' ? 5 : 0),
    };
  }
  return {
    xp: Math.max(5, normalized.wordLength * normalized.puzzleCount),
    coins: normalized.scope === 'daily' ? 2 : 1,
  };
}

export function cumulativeXpForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.trunc(level));
  return ((safeLevel - 1) * safeLevel * 100) / 2;
}

export function levelForXp(xp: number): {
  readonly level: number;
  readonly currentLevelXp: number;
  readonly nextLevelCost: number;
} {
  const safeXp = Math.max(0, Math.trunc(xp));
  let level = Math.floor((1 + Math.sqrt(1 + (8 * safeXp) / 100)) / 2);
  level = Math.max(1, level);
  while (cumulativeXpForLevel(level + 1) <= safeXp) level += 1;
  while (cumulativeXpForLevel(level) > safeXp) level -= 1;
  return {
    level,
    currentLevelXp: safeXp - cumulativeXpForLevel(level),
    nextLevelCost: level * 100,
  };
}

export interface ProgressionState {
  readonly xp: number;
  readonly coins: number;
  readonly rewardedGameIds: readonly string[];
  readonly unlockedDailies: readonly string[];
  readonly appliedUnlockIds: readonly string[];
  /** Fingerprints make a reused operation id fail closed instead of masquerading as a retry. */
  readonly rewardOperations?: Readonly<Record<string, string>> | undefined;
  readonly unlockOperations?: Readonly<Record<string, string>> | undefined;
  readonly consumables?:
    Readonly<{ revealOneLetter: number; removeIncorrectLetters: number }> | undefined;
  readonly economyRevision?: number | undefined;
  readonly economyOperations?: Readonly<Record<string, string>> | undefined;
  readonly pendingDailyUnlocks?: Readonly<Record<string, string>> | undefined;
}

export function initialProgressionState(): ProgressionState {
  return {
    xp: 0,
    coins: 0,
    rewardedGameIds: [],
    unlockedDailies: [],
    appliedUnlockIds: [],
    rewardOperations: {},
    unlockOperations: {},
    consumables: { revealOneLetter: 0, removeIncorrectLetters: 0 },
    economyRevision: 0,
    economyOperations: {},
    pendingDailyUnlocks: {},
  };
}

export function purchasePastDailyEntitlement(input: {
  readonly state: ProgressionState;
  readonly operationId: string;
  readonly mode: DailyMode;
  readonly dateKey: string;
  readonly todayKey: string;
}): ReturnType<typeof unlockPastDaily> {
  if (!isDateKey(input.dateKey)) {
    return { ok: false, code: 'invalid_date', state: input.state };
  }
  const key = pastDailyUnlockKey(input.mode, input.dateKey);
  if (input.state.pendingDailyUnlocks?.[key]) {
    return { ok: true, applied: false, state: input.state };
  }
  const purchased = unlockPastDaily(input);
  if (!purchased.ok || !purchased.applied) return purchased;
  return {
    ...purchased,
    state: {
      ...purchased.state,
      unlockedDailies: purchased.state.unlockedDailies.filter((item) => item !== key),
      pendingDailyUnlocks: {
        ...purchased.state.pendingDailyUnlocks,
        [key]: input.operationId.trim(),
      },
    },
  };
}

export function promotePastDailyEntitlement(
  state: ProgressionState,
  mode: DailyMode,
  dateKey: string,
): { readonly applied: boolean; readonly state: ProgressionState } {
  const key = pastDailyUnlockKey(mode, dateKey);
  if (!state.pendingDailyUnlocks?.[key]) return { applied: false, state };
  const pendingDailyUnlocks = { ...state.pendingDailyUnlocks };
  delete pendingDailyUnlocks[key];
  return {
    applied: true,
    state: {
      ...state,
      pendingDailyUnlocks,
      unlockedDailies: state.unlockedDailies.includes(key)
        ? state.unlockedDailies
        : [...state.unlockedDailies, key],
    },
  };
}

export function applyCompletionReward(
  state: ProgressionState,
  completion: CompletionRewardInput,
): {
  readonly applied: boolean;
  readonly conflict: boolean;
  readonly state: ProgressionState;
  readonly reward: CompletionReward;
} {
  const normalized = normalizedCompletion(completion);
  const reward = calculateCompletionReward(normalized);
  const fingerprint = completionFingerprint(normalized);
  const existing = state.rewardOperations?.[normalized.gameId];
  if (existing !== undefined) {
    return { applied: false, conflict: existing !== fingerprint, state, reward };
  }
  if (state.rewardedGameIds.includes(normalized.gameId)) {
    // Legacy state has no fingerprint; preserve the original once-only decision.
    return { applied: false, conflict: false, state, reward };
  }
  return {
    applied: true,
    conflict: false,
    reward,
    state: {
      ...state,
      xp: state.xp + reward.xp,
      coins: state.coins + reward.coins,
      rewardedGameIds: [...state.rewardedGameIds, normalized.gameId],
      rewardOperations: { ...state.rewardOperations, [normalized.gameId]: fingerprint },
    },
  };
}

export function unlockPastDaily(input: {
  readonly state: ProgressionState;
  readonly operationId: string;
  readonly mode: DailyMode;
  readonly dateKey: string;
  readonly todayKey: string;
}):
  | { readonly ok: true; readonly applied: boolean; readonly state: ProgressionState }
  | {
      readonly ok: false;
      readonly code:
        | 'invalid_operation'
        | 'idempotency_conflict'
        | 'invalid_date'
        | 'not_past'
        | 'insufficient_coins';
      readonly state: ProgressionState;
    } {
  const operationId = input.operationId.trim();
  if (!operationId || operationId.length > 200) {
    return { ok: false, code: 'invalid_operation', state: input.state };
  }
  if (!isDateKey(input.dateKey) || !isDateKey(input.todayKey)) {
    return { ok: false, code: 'invalid_date', state: input.state };
  }
  if (input.dateKey < DAILY_CALENDAR_START || input.dateKey >= input.todayKey) {
    return { ok: false, code: 'not_past', state: input.state };
  }
  const key = pastDailyUnlockKey(input.mode, input.dateKey);
  const fingerprint = JSON.stringify({ mode: input.mode, dateKey: input.dateKey });
  const existing = input.state.unlockOperations?.[operationId];
  if (existing !== undefined && existing !== fingerprint) {
    return { ok: false, code: 'idempotency_conflict', state: input.state };
  }
  if (
    existing === fingerprint ||
    input.state.appliedUnlockIds.includes(operationId) ||
    input.state.unlockedDailies.includes(key)
  ) {
    return { ok: true, applied: false, state: input.state };
  }
  if (input.state.coins < PAST_DAILY_UNLOCK_COST) {
    return { ok: false, code: 'insufficient_coins', state: input.state };
  }
  return {
    ok: true,
    applied: true,
    state: {
      ...input.state,
      coins: input.state.coins - PAST_DAILY_UNLOCK_COST,
      unlockedDailies: [...input.state.unlockedDailies, key],
      appliedUnlockIds: [...input.state.appliedUnlockIds, operationId],
      unlockOperations: { ...input.state.unlockOperations, [operationId]: fingerprint },
    },
  };
}
