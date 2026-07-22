import { z } from 'zod';

import type { ConsumableType } from '../../domain/economy';
import type { OgSession } from '../../domain/game';
import type { GoSession } from '../../domain/go';
import {
  createVersionedLocalRepository,
  type IdentityScope,
  type StorageLike,
  type VersionedLocalRepository,
} from '../../persistence/local-repository';
import type { SoloSession } from './solo-session-repository';

const revealEffectSchema = z.object({
  kind: z.literal('reveal'),
  position: z.number().int().min(0).max(34),
});

const removeEffectSchema = z.object({
  kind: z.literal('remove'),
  letters: z
    .array(z.string().regex(/^[a-z]$/))
    .min(1)
    .max(5),
});

export type SoloConsumableEffect =
  z.infer<typeof revealEffectSchema> | z.infer<typeof removeEffectSchema>;

export interface SoloConsumableIntent {
  readonly operationId: string;
  readonly sessionId: string;
  readonly puzzleId: string;
  readonly puzzleIndex: number;
  readonly consumable: ConsumableType;
  readonly effect: SoloConsumableEffect;
  readonly expectedGuessCount: number;
  readonly expectedRevealedPositions: readonly number[];
  readonly expectedRemovedLetters: readonly string[];
  readonly phase: 'prepared' | 'authorized';
  readonly preparedAt: string;
  readonly authorizedAt?: string | undefined;
}

interface SoloConsumableIntentState {
  readonly pending?: SoloConsumableIntent | undefined;
  readonly settledOperations: Readonly<Record<string, string>>;
  readonly settledOrder: readonly string[];
}

const intentSchema: z.ZodType<SoloConsumableIntent> = z
  .object({
    operationId: z.string().trim().min(1).max(200),
    sessionId: z.string().trim().min(1).max(240),
    puzzleId: z.string().trim().min(1).max(260),
    puzzleIndex: z.number().int().min(0).max(9),
    consumable: z.enum(['revealOneLetter', 'removeIncorrectLetters']),
    effect: z.discriminatedUnion('kind', [revealEffectSchema, removeEffectSchema]),
    expectedGuessCount: z.number().int().nonnegative(),
    expectedRevealedPositions: z.array(z.number().int().min(0).max(34)).max(35),
    expectedRemovedLetters: z.array(z.string().regex(/^[a-z]$/)).max(26),
    phase: z.enum(['prepared', 'authorized']),
    preparedAt: z.iso.datetime(),
    authorizedAt: z.iso.datetime().optional(),
  })
  .superRefine((intent, context) => {
    const expectedConsumable =
      intent.effect.kind === 'reveal' ? 'revealOneLetter' : 'removeIncorrectLetters';
    if (intent.consumable !== expectedConsumable) {
      context.addIssue({
        code: 'custom',
        message: 'The consumable does not match its prepared effect.',
        path: ['consumable'],
      });
    }
    if (
      new Set(intent.expectedRevealedPositions).size !== intent.expectedRevealedPositions.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Values must be unique.',
        path: ['expectedRevealedPositions'],
      });
    }
    if (new Set(intent.expectedRemovedLetters).size !== intent.expectedRemovedLetters.length) {
      context.addIssue({
        code: 'custom',
        message: 'Values must be unique.',
        path: ['expectedRemovedLetters'],
      });
    }
    if (
      intent.effect.kind === 'remove' &&
      new Set(intent.effect.letters).size !== intent.effect.letters.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Values must be unique.',
        path: ['effect', 'letters'],
      });
    }
  });

const stateSchema: z.ZodType<SoloConsumableIntentState> = z
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
        message: 'Settled consumable operations are inconsistent.',
        path: ['settledOrder'],
      });
    }
  });

function initialState(): SoloConsumableIntentState {
  return { settledOperations: {}, settledOrder: [] };
}

function normalizedTimestamp(value: string): string | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function sortedUnique<T extends string | number>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) =>
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right)),
  );
}

function canonicalIntent(intent: SoloConsumableIntent): SoloConsumableIntent {
  return {
    ...intent,
    expectedRevealedPositions: sortedUnique(intent.expectedRevealedPositions),
    expectedRemovedLetters: sortedUnique(intent.expectedRemovedLetters),
    effect:
      intent.effect.kind === 'remove'
        ? { ...intent.effect, letters: sortedUnique(intent.effect.letters) }
        : intent.effect,
  };
}

function intentFingerprint(intent: SoloConsumableIntent): string {
  const canonical = canonicalIntent(intent);
  return JSON.stringify({
    sessionId: canonical.sessionId,
    puzzleId: canonical.puzzleId,
    puzzleIndex: canonical.puzzleIndex,
    consumable: canonical.consumable,
    effect: canonical.effect,
    expectedGuessCount: canonical.expectedGuessCount,
    expectedRevealedPositions: canonical.expectedRevealedPositions,
    expectedRemovedLetters: canonical.expectedRemovedLetters,
  });
}

function repositoryForLane(
  lane: string,
  storage?: StorageLike | (() => StorageLike | undefined),
): VersionedLocalRepository<SoloConsumableIntentState> {
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
    keyPrefix: `amordle:solo-consumable:${safeLane}`,
  });
}

export type ConsumableIntentFailure =
  'invalid_intent' | 'corrupt_state' | 'storage_unavailable' | 'conflict';

type MutationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ConsumableIntentFailure };

export class SoloConsumableIntentCoordinator {
  private readonly repository: VersionedLocalRepository<SoloConsumableIntentState>;

  constructor(
    private readonly identity: IdentityScope,
    lane: string,
    storage?: StorageLike | (() => StorageLike | undefined),
  ) {
    this.repository = repositoryForLane(lane, storage);
  }

  private mutate<T>(
    transition: (
      state: SoloConsumableIntentState,
    ) =>
      | { readonly applied: false; readonly value: T }
      | { readonly applied: true; readonly state: SoloConsumableIntentState; readonly value: T },
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

  pending(): MutationResult<SoloConsumableIntent | undefined> {
    const loaded = this.repository.load(this.identity);
    if (loaded.status === 'corrupt') return { ok: false, code: 'corrupt_state' };
    if (loaded.status === 'unavailable') return { ok: false, code: 'storage_unavailable' };
    return {
      ok: true,
      value: loaded.status === 'ok' ? loaded.envelope.payload.pending : undefined,
    };
  }

  prepare(
    input: Omit<SoloConsumableIntent, 'phase' | 'authorizedAt'>,
  ): MutationResult<'prepared' | 'existing' | 'settled' | 'idempotency_conflict'> {
    const preparedAt = normalizedTimestamp(input.preparedAt);
    const parsed = intentSchema.safeParse({ ...input, phase: 'prepared', preparedAt });
    if (!parsed.success) return { ok: false, code: 'invalid_intent' };
    const intent = canonicalIntent(parsed.data);
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

  markAuthorized(
    operationId: string,
    authorizedAt: string,
  ): MutationResult<'authorized' | 'existing' | 'missing' | 'idempotency_conflict'> {
    const normalizedId = operationId.trim();
    const normalizedAt = normalizedTimestamp(authorizedAt);
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
      if (state.pending.phase === 'authorized') {
        return { applied: false, value: 'existing' as const };
      }
      return {
        applied: true,
        state: {
          ...state,
          pending: { ...state.pending, phase: 'authorized', authorizedAt: normalizedAt },
        },
        value: 'authorized' as const,
      };
    });
  }

  settle(
    operationId: string,
  ): MutationResult<
    'settled' | 'existing' | 'missing' | 'not_authorized' | 'idempotency_conflict'
  > {
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
      if (state.pending.phase !== 'authorized') {
        return { applied: false, value: 'not_authorized' as const };
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

function activePuzzleWithIndex(session: SoloSession): {
  readonly puzzle: OgSession;
  index: number;
} {
  return session.mode === 'go'
    ? {
        puzzle: session.puzzles[session.currentPuzzleIndex] as OgSession,
        index: session.currentPuzzleIndex,
      }
    : { puzzle: session, index: 0 };
}

function replacePuzzle(session: SoloSession, nextPuzzle: OgSession): SoloSession {
  if (session.mode === 'og') return nextPuzzle;
  const puzzles = [...session.puzzles];
  puzzles[session.currentPuzzleIndex] = nextPuzzle;
  return { ...session, puzzles, updatedAt: nextPuzzle.updatedAt } as GoSession;
}

function revealedIndexes(puzzle: OgSession): readonly number[] {
  return puzzle.revealedPositions.flatMap((letter, index) => (letter ? [index] : []));
}

export function applySoloConsumableEffect(
  session: SoloSession,
  intent: SoloConsumableIntent,
  now = new Date().toISOString(),
):
  | { readonly ok: true; readonly applied: boolean; readonly session: SoloSession }
  | { readonly ok: false; readonly code: 'session_mismatch' | 'state_mismatch' } {
  const active = activePuzzleWithIndex(session);
  if (
    session.scope !== 'practice' ||
    session.id !== intent.sessionId ||
    active.puzzle.id !== intent.puzzleId ||
    active.index !== intent.puzzleIndex
  ) {
    return { ok: false, code: 'session_mismatch' };
  }

  const effectAlreadyApplied =
    intent.effect.kind === 'reveal'
      ? active.puzzle.revealedPositions[intent.effect.position] ===
        active.puzzle.answer[intent.effect.position]
      : intent.effect.letters.every((letter) => active.puzzle.removedLetters.includes(letter));
  if (effectAlreadyApplied) return { ok: true, applied: false, session };

  if (
    session.status !== 'playing' ||
    active.puzzle.status !== 'playing' ||
    active.puzzle.guesses.length !== intent.expectedGuessCount ||
    JSON.stringify(revealedIndexes(active.puzzle)) !==
      JSON.stringify(intent.expectedRevealedPositions) ||
    JSON.stringify(sortedUnique(active.puzzle.removedLetters)) !==
      JSON.stringify(intent.expectedRemovedLetters)
  ) {
    return { ok: false, code: 'state_mismatch' };
  }

  if (intent.effect.kind === 'reveal') {
    const letter = active.puzzle.answer[intent.effect.position];
    if (!letter || active.puzzle.revealedPositions[intent.effect.position]) {
      return { ok: false, code: 'state_mismatch' };
    }
    const revealedPositions = [...active.puzzle.revealedPositions];
    const draft = [...active.puzzle.draft];
    revealedPositions[intent.effect.position] = letter;
    draft[intent.effect.position] = letter;
    return {
      ok: true,
      applied: true,
      session: replacePuzzle(session, {
        ...active.puzzle,
        revealedPositions,
        draft,
        updatedAt: now,
      }),
    };
  }

  if (
    intent.effect.letters.length === 0 ||
    intent.effect.letters.some(
      (letter) =>
        active.puzzle.answer.includes(letter) ||
        active.puzzle.draft.includes(letter) ||
        active.puzzle.removedLetters.includes(letter),
    )
  ) {
    return { ok: false, code: 'state_mismatch' };
  }
  return {
    ok: true,
    applied: true,
    session: replacePuzzle(session, {
      ...active.puzzle,
      removedLetters: [...active.puzzle.removedLetters, ...intent.effect.letters],
      updatedAt: now,
    }),
  };
}

export function consumableIntentSnapshot(
  session: SoloSession,
  input: {
    readonly operationId: string;
    readonly consumable: ConsumableType;
    readonly effect: SoloConsumableEffect;
    readonly preparedAt: string;
  },
): Omit<SoloConsumableIntent, 'phase' | 'authorizedAt'> {
  const active = activePuzzleWithIndex(session);
  return {
    ...input,
    sessionId: session.id,
    puzzleId: active.puzzle.id,
    puzzleIndex: active.index,
    expectedGuessCount: active.puzzle.guesses.length,
    expectedRevealedPositions: revealedIndexes(active.puzzle),
    expectedRemovedLetters: sortedUnique(active.puzzle.removedLetters),
  };
}
