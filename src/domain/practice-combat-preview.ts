import { z } from 'zod';

import {
  determineCombatOutcome,
  playerCombatPoints,
  type CombatOutcome,
  type PlayerPuzzlePerformance,
} from './combat';
import { GO_SOLVED_HOLD_MS, goAttemptBudget, type GoPuzzleCount } from './go';
import {
  scoreGuess,
  validateGuess,
  type GuessValidationCode,
  type ScoredGuess,
  type ScoredTile,
} from './game';
import { MAX_WORD_LENGTH, MIN_WORD_LENGTH, isAcceptedAlphabeticWord, normalizeWord } from './words';

export const PRACTICE_COMBAT_PREVIEW_CAPABILITIES = Object.freeze({
  authority: 'participant-writable-cooperative-preview',
  persistence: 'caller-managed',
  serverAuthoritative: false,
  ratingMutation: 'never',
} as const);

export const SUPPORTED_PRACTICE_COMBAT_CLOCKS_MS = [
  30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000, 3_600_000,
] as const;

export type PracticeCombatClockMs = (typeof SUPPORTED_PRACTICE_COMBAT_CLOCKS_MS)[number];
export type PracticeCombatActor = 'left' | 'right';
export type PracticeCombatMode = 'og' | 'go';
export type PracticeCombatPuzzleCount = 1 | GoPuzzleCount;

const supportedClockSchema = z
  .union([
    z.literal(30_000),
    z.literal(60_000),
    z.literal(120_000),
    z.literal(300_000),
    z.literal(600_000),
    z.literal(1_800_000),
    z.literal(3_600_000),
  ])
  .nullable();

export const practiceCombatPreviewConfigSchema = z
  .object({
    mode: z.enum(['og', 'go']),
    wordLength: z.number().int().min(MIN_WORD_LENGTH).max(MAX_WORD_LENGTH),
    difficulty: z.enum(['casual', 'standard', 'expert']),
    hardMode: z.boolean(),
    puzzleCount: z.union([z.literal(1), z.literal(5), z.literal(7), z.literal(10)]),
    timeLimitMs: supportedClockSchema,
  })
  .strict()
  .superRefine((config, context) => {
    if (
      (config.mode === 'og' && config.puzzleCount !== 1) ||
      (config.mode === 'go' && config.puzzleCount === 1)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['puzzleCount'],
        message: 'OG uses one puzzle; Practice GO uses 5, 7, or 10 puzzles.',
      });
    }
  });

export type PracticeCombatPreviewConfig = z.infer<typeof practiceCombatPreviewConfigSchema>;

export function parsePracticeCombatPreviewConfig(input: unknown): PracticeCombatPreviewConfig {
  return practiceCombatPreviewConfigSchema.parse(input);
}

export function practiceCombatAttemptBudget(
  mode: PracticeCombatMode,
  puzzleIndex: number,
  puzzleCount: PracticeCombatPuzzleCount,
): number {
  if (!Number.isInteger(puzzleIndex) || puzzleIndex < 0 || puzzleIndex >= puzzleCount) {
    throw new RangeError('Practice COMBAT puzzle index is outside the configured chain.');
  }
  if (mode === 'og') {
    if (puzzleCount !== 1 || puzzleIndex !== 0) {
      throw new RangeError('Practice COMBAT OG contains exactly one puzzle.');
    }
    return 6;
  }
  if (puzzleCount === 1) {
    throw new RangeError('Practice COMBAT GO requires 5, 7, or 10 puzzles.');
  }
  return goAttemptBudget(puzzleIndex);
}

export interface PracticeCombatPreviewPlayer {
  readonly actor: PracticeCombatActor;
  readonly displayName: string;
  readonly puzzles: readonly {
    readonly puzzleIndex: number;
    readonly attemptsUsed: number;
    readonly solved: boolean;
  }[];
}

export interface PracticeCombatPreviewMove {
  readonly sequence: number;
  readonly actor: PracticeCombatActor;
  readonly puzzleIndex: number;
  readonly guess: string;
  readonly tiles: readonly ScoredTile[];
  readonly submittedAt: string;
}

export interface PracticeCombatPreviewHold {
  readonly solvedPuzzleIndex: number;
  readonly solvedBy: PracticeCombatActor;
  readonly nextActor: PracticeCombatActor;
  readonly holdStartedAt: string;
  readonly autoAdvanceAt: string;
}

export interface PracticeCombatPreviewState {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly capabilities: typeof PRACTICE_COMBAT_PREVIEW_CAPABILITIES;
  readonly config: PracticeCombatPreviewConfig;
  /**
   * Local preview answer material. This state is not a public or server projection
   * and must not be represented as ranked/Daily answer authority.
   */
  readonly answers: readonly string[];
  readonly players: readonly [PracticeCombatPreviewPlayer, PracticeCombatPreviewPlayer];
  readonly status: 'playing' | 'holding' | 'terminal' | 'cancelled';
  readonly activeActor: PracticeCombatActor | null;
  readonly currentPuzzleIndex: number;
  readonly moves: readonly PracticeCombatPreviewMove[];
  readonly hold: PracticeCombatPreviewHold | null;
  readonly deadlineAt: string | null;
  readonly outcome: CombatOutcome | null;
  readonly revision: number;
  readonly appliedActionIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);
const displayNameSchema = z.string().trim().min(1).max(50);

function timestampMs(value: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError('Practice COMBAT preview requires a valid timestamp.');
  }
  return milliseconds;
}

function timestamp(value: string): string {
  return new Date(timestampMs(value)).toISOString();
}

function opponentOf(actor: PracticeCombatActor): PracticeCombatActor {
  return actor === 'left' ? 'right' : 'left';
}

function deadlineFrom(now: string, timeLimitMs: PracticeCombatClockMs | null): string | null {
  return timeLimitMs === null ? null : new Date(timestampMs(now) + timeLimitMs).toISOString();
}

function initialPuzzles(count: PracticeCombatPuzzleCount): PracticeCombatPreviewPlayer['puzzles'] {
  return Array.from({ length: count }, (_, puzzleIndex) => ({
    puzzleIndex,
    attemptsUsed: 0,
    solved: false,
  }));
}

export function createPracticeCombatPreview(input: {
  readonly id: string;
  readonly config: unknown;
  readonly players: readonly [{ readonly displayName: string }, { readonly displayName: string }];
  readonly answers: readonly string[];
  readonly now: string;
}): PracticeCombatPreviewState {
  const id = identifierSchema.parse(input.id);
  const config = parsePracticeCombatPreviewConfig(input.config);
  const createdAt = timestamp(input.now);
  const answers = input.answers.map(normalizeWord);
  if (
    answers.length !== config.puzzleCount ||
    new Set(answers).size !== answers.length ||
    answers.some(
      (answer) => !isAcceptedAlphabeticWord(answer) || answer.length !== config.wordLength,
    )
  ) {
    throw new RangeError(
      'Practice COMBAT preview answers must be unique alphabetic words matching the configuration.',
    );
  }
  const leftName = displayNameSchema.parse(input.players[0].displayName);
  const rightName = displayNameSchema.parse(input.players[1].displayName);
  return {
    schemaVersion: 1,
    id,
    capabilities: PRACTICE_COMBAT_PREVIEW_CAPABILITIES,
    config,
    answers,
    players: [
      { actor: 'left', displayName: leftName, puzzles: initialPuzzles(config.puzzleCount) },
      { actor: 'right', displayName: rightName, puzzles: initialPuzzles(config.puzzleCount) },
    ],
    status: 'playing',
    activeActor: 'left',
    currentPuzzleIndex: 0,
    moves: [],
    hold: null,
    deadlineAt: deadlineFrom(createdAt, config.timeLimitMs),
    outcome: null,
    revision: 0,
    appliedActionIds: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function playerFor(
  state: PracticeCombatPreviewState,
  actor: PracticeCombatActor,
): PracticeCombatPreviewPlayer {
  return state.players[actor === 'left' ? 0 : 1];
}

function replacePlayer(
  state: PracticeCombatPreviewState,
  player: PracticeCombatPreviewPlayer,
): PracticeCombatPreviewState['players'] {
  return player.actor === 'left' ? [player, state.players[1]] : [state.players[0], player];
}

function movesFor(
  state: PracticeCombatPreviewState,
  actor: PracticeCombatActor,
  puzzleIndex: number,
): readonly PracticeCombatPreviewMove[] {
  return state.moves.filter((move) => move.actor === actor && move.puzzleIndex === puzzleIndex);
}

export function practiceCombatPlayerPoints(
  state: PracticeCombatPreviewState,
  actor: PracticeCombatActor,
): number {
  const player = playerFor(state, actor);
  const performances: PlayerPuzzlePerformance[] = player.puzzles.map((puzzle) => ({
    guesses: movesFor(state, actor, puzzle.puzzleIndex).map((move) => move.tiles),
    solved: puzzle.solved,
    maxAttempts: practiceCombatAttemptBudget(
      state.config.mode,
      puzzle.puzzleIndex,
      state.config.puzzleCount,
    ),
    hardMode: state.config.hardMode,
  }));
  return playerCombatPoints(performances);
}

export interface PracticeCombatPriorEvidenceRow extends ScoredGuess {
  readonly kind: 'prior-answer';
  readonly sourcePuzzleIndex: number;
  readonly countsAsPlayerGuess: false;
  readonly consumesAttemptSlot: true;
}

export function practiceCombatPriorEvidence(
  state: PracticeCombatPreviewState,
): readonly PracticeCombatPriorEvidenceRow[] {
  if (state.config.mode !== 'go' || state.currentPuzzleIndex === 0) return [];
  const currentAnswer = state.answers[state.currentPuzzleIndex];
  if (currentAnswer === undefined) return [];
  return state.answers.slice(0, state.currentPuzzleIndex).map((answer, sourcePuzzleIndex) => {
    const submittedAt =
      [...state.moves]
        .reverse()
        .find(
          (move) =>
            move.puzzleIndex === sourcePuzzleIndex &&
            move.tiles.every((tile) => tile.state === 'correct'),
        )?.submittedAt ?? state.createdAt;
    return {
      kind: 'prior-answer',
      sourcePuzzleIndex,
      countsAsPlayerGuess: false,
      consumesAttemptSlot: true,
      guess: answer,
      tiles: scoreGuess(answer, currentAnswer),
      submittedAt,
    };
  });
}

export function practiceCombatEvidence(state: PracticeCombatPreviewState): readonly ScoredGuess[] {
  const sharedMoves = state.moves
    .filter((move) => move.puzzleIndex === state.currentPuzzleIndex)
    .map(({ guess, tiles, submittedAt }) => ({ guess, tiles, submittedAt }));
  return [...practiceCombatPriorEvidence(state), ...sharedMoves];
}

export function practiceCombatHoldRemainingMs(
  state: PracticeCombatPreviewState,
  now: string,
): number | null {
  if (state.hold === null) return null;
  return Math.max(0, timestampMs(state.hold.autoAdvanceAt) - timestampMs(now));
}

interface PreviewActionBase {
  readonly actionId: string;
  readonly expectedRevision: number;
  readonly expectedMoveCount: number;
  readonly now: string;
}

export type PracticeCombatPreviewAction =
  | (PreviewActionBase & {
      readonly type: 'submit';
      readonly actor: PracticeCombatActor;
      readonly guess: string;
    })
  | (PreviewActionBase & {
      readonly type: 'cancel';
      readonly actor: PracticeCombatActor;
    })
  | (PreviewActionBase & {
      readonly type: 'forfeit';
      readonly actor: PracticeCombatActor;
    })
  | (PreviewActionBase & {
      readonly type: 'timeout';
      readonly actor: PracticeCombatActor;
    })
  | (PreviewActionBase & {
      readonly type: 'advance-hold';
    });

export interface PracticeCombatPreviewReducerContext {
  readonly validGuesses: ReadonlySet<string>;
}

export type PracticeCombatPreviewErrorCode =
  | 'invalid_action'
  | 'conflict'
  | 'terminal'
  | 'not_turn'
  | 'dictionary_required'
  | 'hold_pending'
  | 'not_timed'
  | 'timeout_pending'
  | 'cannot_cancel'
  | GuessValidationCode;

export type PracticeCombatPreviewReducerResult =
  | {
      readonly ok: true;
      readonly state: PracticeCombatPreviewState;
      readonly duplicate: boolean;
    }
  | {
      readonly ok: false;
      readonly state: PracticeCombatPreviewState;
      readonly code: PracticeCombatPreviewErrorCode;
      readonly message: string;
      readonly conflict?: {
        readonly expectedRevision: number;
        readonly actualRevision: number;
        readonly expectedMoveCount: number;
        readonly actualMoveCount: number;
      };
    };

function failure(
  state: PracticeCombatPreviewState,
  code: PracticeCombatPreviewErrorCode,
  message: string,
  conflict?: NonNullable<Extract<PracticeCombatPreviewReducerResult, { ok: false }>['conflict']>,
): PracticeCombatPreviewReducerResult {
  return {
    ok: false,
    state,
    code,
    message,
    ...(conflict === undefined ? {} : { conflict }),
  };
}

function commit(
  state: PracticeCombatPreviewState,
  action: PracticeCombatPreviewAction,
  patch: Partial<PracticeCombatPreviewState>,
): PracticeCombatPreviewState {
  return {
    ...state,
    ...patch,
    revision: state.revision + 1,
    appliedActionIds: [...state.appliedActionIds, action.actionId],
    updatedAt: timestamp(action.now),
  };
}

function result(state: PracticeCombatPreviewState): PracticeCombatPreviewReducerResult {
  return { ok: true, state, duplicate: false };
}

function outcomeFor(
  state: PracticeCombatPreviewState,
  signals: {
    readonly forfeitingActor?: PracticeCombatActor;
    readonly timedOutActor?: PracticeCombatActor;
    readonly ogSolvedBy?: PracticeCombatActor;
  } = {},
): CombatOutcome {
  return determineCombatOutcome({
    playerIds: ['left', 'right'],
    submittedGuessCount: state.moves.length,
    points: {
      left: practiceCombatPlayerPoints(state, 'left'),
      right: practiceCombatPlayerPoints(state, 'right'),
    },
    ...(signals.forfeitingActor === undefined
      ? {}
      : { forfeitingPlayerId: signals.forfeitingActor }),
    ...(signals.timedOutActor === undefined ? {} : { timedOutPlayerId: signals.timedOutActor }),
    ...(signals.ogSolvedBy === undefined ? {} : { ogSolvedByPlayerId: signals.ogSolvedBy }),
  });
}

function terminalPatch(
  state: PracticeCombatPreviewState,
  outcome: CombatOutcome,
): Partial<PracticeCombatPreviewState> {
  return {
    status: outcome.kind === 'cancelled' ? 'cancelled' : 'terminal',
    activeActor: null,
    hold: null,
    deadlineAt: null,
    outcome,
  };
}

function attemptsRemaining(state: PracticeCombatPreviewState, actor: PracticeCombatActor): number {
  const progress = playerFor(state, actor).puzzles[state.currentPuzzleIndex];
  const budget = practiceCombatAttemptBudget(
    state.config.mode,
    state.currentPuzzleIndex,
    state.config.puzzleCount,
  );
  return Math.max(0, budget - (progress?.attemptsUsed ?? budget));
}

function nextEligibleActor(
  state: PracticeCombatPreviewState,
  actor: PracticeCombatActor,
): PracticeCombatActor | null {
  const opponent = opponentOf(actor);
  if (attemptsRemaining(state, opponent) > 0) return opponent;
  return attemptsRemaining(state, actor) > 0 ? actor : null;
}

function reduceSubmit(
  state: PracticeCombatPreviewState,
  action: Extract<PracticeCombatPreviewAction, { type: 'submit' }>,
  context: PracticeCombatPreviewReducerContext | undefined,
): PracticeCombatPreviewReducerResult {
  if (state.status === 'holding') {
    return failure(state, 'hold_pending', 'The solved GO evidence hold must finish first.');
  }
  if (state.activeActor !== action.actor) {
    return failure(state, 'not_turn', 'Only the active preview participant can submit.');
  }
  if (context === undefined) {
    return failure(
      state,
      'dictionary_required',
      'A validated word-list context is required for preview guesses.',
    );
  }
  if (state.deadlineAt !== null && timestampMs(action.now) >= timestampMs(state.deadlineAt)) {
    return failure(
      state,
      'timeout_pending',
      'The participant-writable preview clock expired before this guess.',
    );
  }
  const answer = state.answers[state.currentPuzzleIndex];
  if (answer === undefined) {
    return failure(state, 'terminal', 'The preview has no active puzzle.');
  }
  const validation = validateGuess({
    rawGuess: action.guess,
    wordLength: state.config.wordLength,
    validGuesses: context.validGuesses,
    hardMode: state.config.hardMode,
    evidence: practiceCombatEvidence(state),
    terminal: false,
  });
  if (validation !== undefined) {
    return failure(state, validation.code, validation.message);
  }
  const guess = normalizeWord(action.guess);
  const submittedAt = timestamp(action.now);
  const move: PracticeCombatPreviewMove = {
    sequence: state.moves.length + 1,
    actor: action.actor,
    puzzleIndex: state.currentPuzzleIndex,
    guess,
    tiles: scoreGuess(guess, answer),
    submittedAt,
  };
  const player = playerFor(state, action.actor);
  const puzzles = [...player.puzzles];
  const priorProgress = puzzles[state.currentPuzzleIndex];
  if (priorProgress === undefined) {
    return failure(state, 'terminal', 'The preview participant has no active puzzle.');
  }
  puzzles[state.currentPuzzleIndex] = {
    ...priorProgress,
    attemptsUsed: priorProgress.attemptsUsed + 1,
    solved: guess === answer,
  };
  const moved = {
    ...state,
    players: replacePlayer(state, { ...player, puzzles }),
    moves: [...state.moves, move],
  };
  if (guess === answer && state.config.mode === 'og') {
    return result(
      commit(state, action, {
        ...moved,
        ...terminalPatch(moved, outcomeFor(moved, { ogSolvedBy: action.actor })),
      }),
    );
  }
  if (guess === answer && state.config.mode === 'go') {
    const finalPuzzle = state.currentPuzzleIndex === state.config.puzzleCount - 1;
    if (finalPuzzle) {
      return result(
        commit(state, action, {
          ...moved,
          ...terminalPatch(moved, outcomeFor(moved)),
        }),
      );
    }
    const nextActor = opponentOf(action.actor);
    return result(
      commit(state, action, {
        ...moved,
        status: 'holding',
        activeActor: null,
        deadlineAt: null,
        hold: {
          solvedPuzzleIndex: state.currentPuzzleIndex,
          solvedBy: action.actor,
          nextActor,
          holdStartedAt: submittedAt,
          autoAdvanceAt: new Date(timestampMs(submittedAt) + GO_SOLVED_HOLD_MS).toISOString(),
        },
      }),
    );
  }
  const nextActor = nextEligibleActor(moved, action.actor);
  if (nextActor === null) {
    return result(
      commit(state, action, {
        ...moved,
        ...terminalPatch(moved, outcomeFor(moved)),
      }),
    );
  }
  return result(
    commit(state, action, {
      ...moved,
      activeActor: nextActor,
      deadlineAt: deadlineFrom(submittedAt, state.config.timeLimitMs),
    }),
  );
}

export function reducePracticeCombatPreview(
  state: PracticeCombatPreviewState,
  action: PracticeCombatPreviewAction,
  context?: PracticeCombatPreviewReducerContext,
): PracticeCombatPreviewReducerResult {
  const actionId = identifierSchema.safeParse(action.actionId);
  let now: string;
  try {
    now = timestamp(action.now);
  } catch {
    return failure(state, 'invalid_action', 'Preview action timestamp is invalid.');
  }
  if (timestampMs(now) < timestampMs(state.updatedAt)) {
    return failure(
      state,
      'invalid_action',
      'Preview actions cannot move cooperative state backward in time.',
    );
  }
  if (!actionId.success) {
    return failure(state, 'invalid_action', 'Preview action id is invalid.');
  }
  if (state.appliedActionIds.includes(actionId.data)) {
    return { ok: true, state, duplicate: true };
  }
  if (
    action.expectedRevision !== state.revision ||
    action.expectedMoveCount !== state.moves.length
  ) {
    return failure(state, 'conflict', 'Preview state changed before this action was applied.', {
      expectedRevision: action.expectedRevision,
      actualRevision: state.revision,
      expectedMoveCount: action.expectedMoveCount,
      actualMoveCount: state.moves.length,
    });
  }
  if (state.status === 'terminal' || state.status === 'cancelled') {
    return failure(state, 'terminal', 'This Practice COMBAT preview is complete.');
  }
  const normalizedAction = { ...action, actionId: actionId.data, now };
  if (normalizedAction.type === 'submit') {
    return reduceSubmit(state, normalizedAction, context);
  }
  if (normalizedAction.type === 'advance-hold') {
    if (state.status !== 'holding' || state.hold === null) {
      return failure(state, 'hold_pending', 'There is no solved GO hold to advance.');
    }
    if (practiceCombatHoldRemainingMs(state, now)! > 0) {
      return failure(state, 'hold_pending', 'The two-second solved evidence hold is still active.');
    }
    return result(
      commit(state, normalizedAction, {
        status: 'playing',
        activeActor: state.hold.nextActor,
        currentPuzzleIndex: state.currentPuzzleIndex + 1,
        hold: null,
        deadlineAt: deadlineFrom(now, state.config.timeLimitMs),
      }),
    );
  }
  if (normalizedAction.type === 'cancel') {
    if (state.moves.length > 0) {
      return failure(
        state,
        'cannot_cancel',
        'A started preview must use forfeit rather than cancellation.',
      );
    }
    return result(
      commit(
        state,
        normalizedAction,
        terminalPatch(state, outcomeFor(state, { forfeitingActor: normalizedAction.actor })),
      ),
    );
  }
  if (normalizedAction.type === 'forfeit') {
    return result(
      commit(
        state,
        normalizedAction,
        terminalPatch(state, outcomeFor(state, { forfeitingActor: normalizedAction.actor })),
      ),
    );
  }
  if (state.config.timeLimitMs === null || state.deadlineAt === null) {
    return failure(state, 'not_timed', 'This Practice COMBAT preview has no clock.');
  }
  if (state.activeActor !== normalizedAction.actor) {
    return failure(state, 'not_turn', 'Only the active preview participant can time out.');
  }
  if (timestampMs(now) < timestampMs(state.deadlineAt)) {
    return failure(state, 'timeout_pending', 'The preview turn clock has not expired.');
  }
  return result(
    commit(
      state,
      normalizedAction,
      terminalPatch(state, outcomeFor(state, { timedOutActor: normalizedAction.actor })),
    ),
  );
}
