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

export function calculateCompletionReward(input: CompletionRewardInput): CompletionReward {
  const wordLength = Math.max(2, Math.trunc(input.wordLength));
  const puzzleCount = Math.max(1, Math.trunc(input.puzzleCount));
  const unusedAttempts = Math.max(0, Math.trunc(input.unusedAttempts));
  if (input.status === 'won') {
    return {
      xp: wordLength * 10 * puzzleCount + 5 * unusedAttempts + (input.mode === 'go' ? 25 : 0),
      coins:
        wordLength * puzzleCount +
        2 * unusedAttempts +
        (input.scope === 'daily' ? 5 : 0) +
        (input.mode === 'go' ? 5 : 0),
    };
  }
  return {
    xp: Math.max(5, wordLength * puzzleCount),
    coins: input.scope === 'daily' ? 2 : 1,
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
}

export function initialProgressionState(): ProgressionState {
  return { xp: 0, coins: 0, rewardedGameIds: [], unlockedDailies: [], appliedUnlockIds: [] };
}

export function applyCompletionReward(
  state: ProgressionState,
  completion: CompletionRewardInput,
): {
  readonly applied: boolean;
  readonly state: ProgressionState;
  readonly reward: CompletionReward;
} {
  const reward = calculateCompletionReward(completion);
  if (state.rewardedGameIds.includes(completion.gameId)) return { applied: false, state, reward };
  return {
    applied: true,
    reward,
    state: {
      ...state,
      xp: state.xp + reward.xp,
      coins: state.coins + reward.coins,
      rewardedGameIds: [...state.rewardedGameIds, completion.gameId],
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
      readonly code: 'invalid_date' | 'not_past' | 'insufficient_coins';
      readonly state: ProgressionState;
    } {
  if (!isDateKey(input.dateKey) || !isDateKey(input.todayKey)) {
    return { ok: false, code: 'invalid_date', state: input.state };
  }
  if (input.dateKey < DAILY_CALENDAR_START || input.dateKey >= input.todayKey) {
    return { ok: false, code: 'not_past', state: input.state };
  }
  const key = pastDailyUnlockKey(input.mode, input.dateKey);
  if (
    input.state.appliedUnlockIds.includes(input.operationId) ||
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
      appliedUnlockIds: [...input.state.appliedUnlockIds, input.operationId],
    },
  };
}
