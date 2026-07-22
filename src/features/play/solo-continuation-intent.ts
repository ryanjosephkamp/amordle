import { z } from 'zod';
import {
  createVersionedLocalRepository,
  type IdentityScope,
  type StorageLike,
  type VersionedLocalRepository,
} from '../../persistence/local-repository';

export interface SoloContinuationIntent {
  readonly operationId: string;
  readonly sessionId: string;
  readonly expectedContinuationCount: number;
  readonly wordLength: number;
  readonly completionPercentage: number;
  readonly cost: number;
  readonly phase: 'prepared' | 'charged';
  readonly preparedAt: string;
  readonly chargedAt?: string | undefined;
}

interface SoloContinuationIntentState {
  readonly pending?: SoloContinuationIntent | undefined;
  readonly settledOperations: Readonly<Record<string, string>>;
  readonly settledOrder: readonly string[];
}

const intentSchema: z.ZodType<SoloContinuationIntent> = z.object({
  operationId: z.string().trim().min(1).max(200),
  sessionId: z.string().trim().min(1).max(240),
  expectedContinuationCount: z.number().int().nonnegative(),
  wordLength: z.number().int().min(2).max(35),
  completionPercentage: z.number().min(0).max(100),
  cost: z.number().int().positive().max(10_000),
  phase: z.enum(['prepared', 'charged']),
  preparedAt: z.iso.datetime(),
  chargedAt: z.iso.datetime().optional(),
});

const stateSchema: z.ZodType<SoloContinuationIntentState> = z
  .object({
    pending: intentSchema.optional(),
    settledOperations: z.record(z.string().trim().min(1).max(200), z.string().min(1)),
    settledOrder: z.array(z.string().trim().min(1).max(200)).max(250),
  })
  .superRefine((state, context) => {
    if (
      new Set(state.settledOrder).size !== state.settledOrder.length ||
      state.settledOrder.some((operationId) => state.settledOperations[operationId] === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Settled continuation operations are inconsistent.',
        path: ['settledOrder'],
      });
    }
  });

function initialState(): SoloContinuationIntentState {
  return { settledOperations: {}, settledOrder: [] };
}

function normalizedTimestamp(value: string): string | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function intentFingerprint(intent: SoloContinuationIntent): string {
  return JSON.stringify({
    sessionId: intent.sessionId,
    expectedContinuationCount: intent.expectedContinuationCount,
    wordLength: intent.wordLength,
    completionPercentage: intent.completionPercentage,
    cost: intent.cost,
  });
}

function repositoryForLane(
  lane: string,
  storage?: StorageLike | (() => StorageLike | undefined),
): VersionedLocalRepository<SoloContinuationIntentState> {
  const safeLane = encodeURIComponent(lane).slice(0, 300);
  return createVersionedLocalRepository({
    schema: stateSchema,
    storage:
      storage ??
      (() => {
        try {
          return window.localStorage;
        } catch {
          return undefined;
        }
      }),
    keyPrefix: `amordle:solo-continuation:${safeLane}`,
  });
}

export type ContinuationIntentFailure =
  'invalid_intent' | 'corrupt_state' | 'storage_unavailable' | 'conflict';

type MutationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ContinuationIntentFailure };

export class SoloContinuationIntentCoordinator {
  private readonly repository: VersionedLocalRepository<SoloContinuationIntentState>;

  constructor(
    private readonly identity: IdentityScope,
    lane: string,
    storage?: StorageLike | (() => StorageLike | undefined),
  ) {
    this.repository = repositoryForLane(lane, storage);
  }

  private mutate<T>(
    transition: (
      state: SoloContinuationIntentState,
    ) =>
      | { readonly applied: false; readonly value: T }
      | { readonly applied: true; readonly state: SoloContinuationIntentState; readonly value: T },
  ): MutationResult<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const loaded = this.repository.load(this.identity);
      if (loaded.status === 'corrupt') return { ok: false, code: 'corrupt_state' };
      if (loaded.status === 'unavailable') return { ok: false, code: 'storage_unavailable' };
      const state = loaded.status === 'ok' ? loaded.envelope.payload : initialState();
      const next = transition(state);
      if (!next.applied) return { ok: true, value: next.value };
      const saved = this.repository.save(this.identity, next.state, {
        expectedRevision: loaded.status === 'ok' ? loaded.envelope.revision : 0,
        replaceCorrupt: false,
      });
      if (saved.ok) return { ok: true, value: next.value };
      if (saved.reason !== 'conflict') {
        return {
          ok: false,
          code: saved.reason === 'corrupt' ? 'corrupt_state' : 'storage_unavailable',
        };
      }
    }
    return { ok: false, code: 'conflict' };
  }

  pending(): MutationResult<SoloContinuationIntent | undefined> {
    const loaded = this.repository.load(this.identity);
    if (loaded.status === 'corrupt') return { ok: false, code: 'corrupt_state' };
    if (loaded.status === 'unavailable') return { ok: false, code: 'storage_unavailable' };
    return {
      ok: true,
      value: loaded.status === 'ok' ? loaded.envelope.payload.pending : undefined,
    };
  }

  prepare(
    input: Omit<SoloContinuationIntent, 'phase' | 'chargedAt'>,
  ): MutationResult<'prepared' | 'existing' | 'settled' | 'idempotency_conflict'> {
    const preparedAt = normalizedTimestamp(input.preparedAt);
    const parsed = intentSchema.safeParse({ ...input, phase: 'prepared', preparedAt });
    if (!parsed.success) return { ok: false, code: 'invalid_intent' };
    const intent = parsed.data;
    const fingerprint = intentFingerprint(intent);
    return this.mutate((state) => {
      const settled = state.settledOperations[intent.operationId];
      if (settled !== undefined) {
        return {
          applied: false,
          value: settled === fingerprint ? ('settled' as const) : ('idempotency_conflict' as const),
        };
      }
      if (state.pending) {
        return {
          applied: false,
          value:
            state.pending.operationId === intent.operationId &&
            intentFingerprint(state.pending) === fingerprint
              ? ('existing' as const)
              : ('idempotency_conflict' as const),
        };
      }
      return { applied: true, state: { ...state, pending: intent }, value: 'prepared' as const };
    });
  }

  markCharged(
    operationId: string,
    chargedAt: string,
  ): MutationResult<'charged' | 'existing' | 'missing' | 'idempotency_conflict'> {
    const normalizedId = operationId.trim();
    const normalizedAt = normalizedTimestamp(chargedAt);
    if (!normalizedId || normalizedId.length > 200 || !normalizedAt) {
      return { ok: false, code: 'invalid_intent' };
    }
    return this.mutate((state) => {
      if (!state.pending) {
        return {
          applied: false,
          value:
            state.settledOperations[normalizedId] !== undefined
              ? ('existing' as const)
              : ('missing' as const),
        };
      }
      if (state.pending.operationId !== normalizedId) {
        return { applied: false, value: 'idempotency_conflict' as const };
      }
      if (state.pending.phase === 'charged') {
        return { applied: false, value: 'existing' as const };
      }
      return {
        applied: true,
        state: {
          ...state,
          pending: { ...state.pending, phase: 'charged', chargedAt: normalizedAt },
        },
        value: 'charged' as const,
      };
    });
  }

  settle(
    operationId: string,
  ): MutationResult<'settled' | 'existing' | 'missing' | 'not_charged' | 'idempotency_conflict'> {
    const normalizedId = operationId.trim();
    if (!normalizedId || normalizedId.length > 200) {
      return { ok: false, code: 'invalid_intent' };
    }
    return this.mutate((state) => {
      if (!state.pending) {
        return {
          applied: false,
          value:
            state.settledOperations[normalizedId] !== undefined
              ? ('existing' as const)
              : ('missing' as const),
        };
      }
      if (state.pending.operationId !== normalizedId) {
        return { applied: false, value: 'idempotency_conflict' as const };
      }
      if (state.pending.phase !== 'charged') {
        return { applied: false, value: 'not_charged' as const };
      }
      const settledOrder = [
        ...state.settledOrder.filter((item) => item !== normalizedId),
        normalizedId,
      ].slice(-250);
      const pendingFingerprint = intentFingerprint(state.pending);
      const settledOperations = Object.fromEntries(
        settledOrder.map((item) => [
          item,
          item === normalizedId ? pendingFingerprint : (state.settledOperations[item] ?? ''),
        ]),
      );
      const { pending: _pending, ...withoutPending } = state;
      void _pending;
      return {
        applied: true,
        state: { ...withoutPending, settledOrder, settledOperations },
        value: 'settled' as const,
      };
    });
  }
}
