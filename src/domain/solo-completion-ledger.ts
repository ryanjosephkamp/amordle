import { z } from 'zod';
import {
  applyCompletionReward,
  initialProgressionState,
  type CompletionReward,
  type CompletionRewardInput,
  type ProgressionState,
} from './progression';

export interface ActiveSoloSession {
  readonly sessionId: string;
  readonly sequence: number;
  readonly startedAt: string;
}

export interface SoloCompletionHandoff {
  readonly sessionId: string;
  readonly sequence: number;
  readonly completedAt: string;
  readonly completion: CompletionRewardInput;
  readonly reward: CompletionReward;
}

export interface SoloCompletionLedgerState {
  readonly latestSequence: number;
  readonly active?: ActiveSoloSession | undefined;
  readonly handoff?: SoloCompletionHandoff | undefined;
  readonly retiredSessions: Readonly<Record<string, 'completed' | 'superseded'>>;
  readonly progression: ProgressionState;
}

const completionInputSchema = z.object({
  gameId: z.string().trim().min(1).max(200),
  status: z.enum(['won', 'lost']),
  mode: z.enum(['og', 'go']),
  scope: z.enum(['daily', 'practice']),
  wordLength: z.number().int().min(2).max(35),
  puzzleCount: z.number().int().positive(),
  unusedAttempts: z.number().int().nonnegative(),
});

const progressionSchema = z.object({
  xp: z.number().int().nonnegative(),
  coins: z.number().int().nonnegative(),
  rewardedGameIds: z.array(z.string().trim().min(1).max(200)),
  unlockedDailies: z.array(z.string()),
  appliedUnlockIds: z.array(z.string().trim().min(1).max(200)),
  rewardOperations: z.record(z.string(), z.string()).optional(),
  unlockOperations: z.record(z.string(), z.string()).optional(),
  consumables: z
    .object({
      revealOneLetter: z.number().int().nonnegative(),
      removeIncorrectLetters: z.number().int().nonnegative(),
    })
    .optional(),
  economyRevision: z.number().int().nonnegative().optional(),
  economyOperations: z.record(z.string(), z.string()).optional(),
  pendingDailyUnlocks: z.record(z.string(), z.string()).optional(),
});

export const soloCompletionLedgerSchema: z.ZodType<SoloCompletionLedgerState> = z
  .object({
    latestSequence: z.number().int().nonnegative(),
    active: z
      .object({
        sessionId: z.string().trim().min(1).max(200),
        sequence: z.number().int().nonnegative(),
        startedAt: z.iso.datetime(),
      })
      .optional(),
    handoff: z
      .object({
        sessionId: z.string().trim().min(1).max(200),
        sequence: z.number().int().nonnegative(),
        completedAt: z.iso.datetime(),
        completion: completionInputSchema,
        reward: z.object({
          xp: z.number().int().nonnegative(),
          coins: z.number().int().nonnegative(),
        }),
      })
      .optional(),
    retiredSessions: z.record(z.string(), z.enum(['completed', 'superseded'])),
    progression: progressionSchema,
  })
  .superRefine((value, context) => {
    if (value.active && value.active.sequence !== value.latestSequence) {
      context.addIssue({
        code: 'custom',
        message: 'The active Solo session must own the latest sequence.',
        path: ['active', 'sequence'],
      });
    }
    if (value.active && value.retiredSessions[value.active.sessionId] !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'A retired Solo session cannot remain active.',
        path: ['active', 'sessionId'],
      });
    }
    if (
      value.handoff &&
      (value.handoff.completion.gameId !== value.handoff.sessionId ||
        value.retiredSessions[value.handoff.sessionId] !== 'completed' ||
        value.handoff.sequence > value.latestSequence)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Completion handoff authority is inconsistent.',
        path: ['handoff'],
      });
    }
  });

export function initialSoloCompletionLedger(
  progression: ProgressionState = initialProgressionState(),
): SoloCompletionLedgerState {
  return { latestSequence: 0, retiredSessions: {}, progression };
}

export type SoloLedgerFailureCode =
  | 'invalid_session'
  | 'stale_sequence'
  | 'retired_session'
  | 'not_active'
  | 'idempotency_conflict'
  | 'inconsistent_state';

export type SoloLedgerTransition =
  | {
      readonly ok: true;
      readonly applied: boolean;
      readonly state: SoloCompletionLedgerState;
    }
  | {
      readonly ok: false;
      readonly code: SoloLedgerFailureCode;
      readonly state: SoloCompletionLedgerState;
    };

function normalizedTimestamp(value: string): string | undefined {
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : undefined;
}

export function beginSoloSession(
  state: SoloCompletionLedgerState,
  input: { readonly sessionId: string; readonly sequence: number; readonly startedAt: string },
): SoloLedgerTransition {
  const sessionId = input.sessionId.trim();
  const startedAt = normalizedTimestamp(input.startedAt);
  if (
    !sessionId ||
    sessionId.length > 200 ||
    !Number.isInteger(input.sequence) ||
    input.sequence < 1 ||
    !startedAt
  ) {
    return { ok: false, code: 'invalid_session', state };
  }
  if (state.active?.sessionId === sessionId && state.active.sequence === input.sequence) {
    return { ok: true, applied: false, state };
  }
  if (state.retiredSessions[sessionId] !== undefined) {
    return { ok: false, code: 'retired_session', state };
  }
  if (input.sequence <= state.latestSequence) {
    return { ok: false, code: 'stale_sequence', state };
  }
  const retiredSessions = { ...state.retiredSessions };
  if (state.active) retiredSessions[state.active.sessionId] = 'superseded';
  const { handoff: _handoff, ...withoutHandoff } = state;
  void _handoff;
  return {
    ok: true,
    applied: true,
    state: {
      ...withoutHandoff,
      latestSequence: input.sequence,
      active: { sessionId, sequence: input.sequence, startedAt },
      retiredSessions,
    },
  };
}

export function settleSoloCompletion(
  state: SoloCompletionLedgerState,
  input: {
    readonly sequence: number;
    readonly completedAt: string;
    readonly completion: CompletionRewardInput;
  },
): SoloLedgerTransition {
  const sessionId = input.completion.gameId.trim();
  const completedAt = normalizedTimestamp(input.completedAt);
  const parsedCompletion = completionInputSchema.safeParse({
    ...input.completion,
    gameId: sessionId,
  });
  if (
    !completedAt ||
    !Number.isInteger(input.sequence) ||
    input.sequence < 1 ||
    !parsedCompletion.success
  ) {
    return { ok: false, code: 'invalid_session', state };
  }
  const completion = parsedCompletion.data;
  const rewardResult = applyCompletionReward(state.progression, completion);
  if (rewardResult.conflict) {
    return { ok: false, code: 'idempotency_conflict', state };
  }
  if (state.retiredSessions[sessionId] === 'completed') {
    return rewardResult.applied
      ? { ok: false, code: 'inconsistent_state', state }
      : { ok: true, applied: false, state };
  }
  if (
    !state.active ||
    state.active.sessionId !== sessionId ||
    state.active.sequence !== input.sequence
  ) {
    return { ok: false, code: 'not_active', state };
  }
  if (!rewardResult.applied) {
    return { ok: false, code: 'inconsistent_state', state };
  }
  const { active: _active, ...withoutActive } = state;
  void _active;
  return {
    ok: true,
    applied: true,
    state: {
      ...withoutActive,
      progression: rewardResult.state,
      retiredSessions: { ...state.retiredSessions, [sessionId]: 'completed' },
      handoff: {
        sessionId,
        sequence: input.sequence,
        completedAt,
        completion,
        reward: rewardResult.reward,
      },
    },
  };
}

export function acknowledgeSoloCompletion(
  state: SoloCompletionLedgerState,
  sessionId: string,
): SoloLedgerTransition {
  const normalizedId = sessionId.trim();
  if (!state.handoff || state.handoff.sessionId !== normalizedId) {
    return { ok: true, applied: false, state };
  }
  const { handoff: _handoff, ...withoutHandoff } = state;
  void _handoff;
  return { ok: true, applied: true, state: withoutHandoff };
}

export function resumableSoloSession(
  state: SoloCompletionLedgerState,
): ActiveSoloSession | undefined {
  if (!state.active || state.active.sequence !== state.latestSequence) return undefined;
  return state.retiredSessions[state.active.sessionId] === undefined ? state.active : undefined;
}
