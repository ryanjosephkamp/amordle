import { z } from 'zod';

import {
  continueOgSession,
  createOgSession,
  mergeKeyboardEvidence,
  restoreOgSession,
  revealOgAnswer,
  scoreGuess,
  submitOgGuess,
  type GameScope,
  type GuessValidationError,
  type KeyboardState,
  type OgSession,
  type ScoredGuess,
} from './game';
import {
  dailyAnswerIndex,
  isAcceptedAlphabeticWord,
  normalizeWord,
  type Difficulty,
} from './words';

export type GoPuzzleCount = 5 | 7 | 10;
export type GoAnswerGenerationVersion = 'v1' | 'v2';
export type GoAttemptPolicyVersion = 'fixed-v0' | 'carryover-consumes-v1';
export const GO_DAILY_V2_CUTOFF_DATE_KEY = '2026-07-14';
export const GO_SOLVED_HOLD_MS = 2_000;
export const GO_ATTEMPT_POLICY_VERSION = 'carryover-consumes-v1' as const;
export const GO_INITIAL_ATTEMPTS = 6;
export const GO_MINIMUM_ATTEMPTS = 2;

export function goAttemptBudget(puzzleIndex: number): number {
  if (!Number.isInteger(puzzleIndex) || puzzleIndex < 0) {
    throw new RangeError('GO puzzle index must be a non-negative integer.');
  }
  return Math.max(GO_MINIMUM_ATTEMPTS, GO_INITIAL_ATTEMPTS - puzzleIndex);
}

export interface GoAdvance {
  readonly solvedPuzzleIndex: number;
  readonly nextPuzzleIndex: number;
  readonly holdStartedAt: string;
  readonly autoAdvanceAt: string;
}

export interface GoSeededEvidenceRow extends ScoredGuess {
  readonly kind: 'prior-answer';
  readonly sourcePuzzleIndex: number;
  readonly consumesAttemptSlot: true;
  readonly countsAsPlayerGuess: false;
}

export interface GoSession {
  readonly schemaVersion: 1;
  readonly mode: 'go';
  readonly id: string;
  readonly scope: GameScope;
  readonly difficulty: Difficulty;
  readonly hardMode: boolean;
  readonly attemptPolicyVersion: GoAttemptPolicyVersion;
  readonly answerGenerationVersion: GoAnswerGenerationVersion;
  readonly answers: readonly string[];
  readonly puzzles: readonly OgSession[];
  readonly currentPuzzleIndex: number;
  readonly priorAnswers: readonly string[];
  readonly pendingAdvance?: GoAdvance;
  readonly status: 'playing' | 'won' | 'lost';
  readonly revealedAnswer: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateGoSessionInput {
  readonly id: string;
  readonly answers: readonly string[];
  readonly scope: GameScope;
  readonly difficulty?: Difficulty;
  readonly hardMode?: boolean;
  readonly maxAttempts?: number;
  readonly answerGenerationVersion?: GoAnswerGenerationVersion;
  readonly now?: string;
}

export function isPracticeGoPuzzleCount(value: number): value is GoPuzzleCount {
  return value === 5 || value === 7 || value === 10;
}

export function createGoSession(input: CreateGoSessionInput): GoSession {
  const id = input.id.trim();
  if (!id) throw new RangeError('Session id is required.');
  const answers = input.answers.map(normalizeWord);
  if (input.scope === 'practice' && !isPracticeGoPuzzleCount(answers.length)) {
    throw new RangeError('Practice GO chains must contain 5, 7, or 10 puzzles.');
  }
  if (input.scope === 'daily' && answers.length !== 5) {
    throw new RangeError('Daily GO chains must contain five puzzles.');
  }
  if (new Set(answers).size !== answers.length) {
    throw new RangeError('New GO chains must select answers without replacement.');
  }
  const wordLength = answers[0]?.length;
  if (
    wordLength === undefined ||
    answers.some((answer) => !isAcceptedAlphabeticWord(answer) || answer.length !== wordLength)
  ) {
    throw new RangeError('GO answers must be alphabetic words of one supported length.');
  }

  const puzzles = answers.map((answer, index) => {
    const puzzleInput = {
      id: `${id}:${index}`,
      answer,
      scope: input.scope,
      ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
      ...(input.hardMode !== undefined ? { hardMode: input.hardMode } : {}),
      maxAttempts:
        input.maxAttempts !== undefined
          ? Math.max(GO_MINIMUM_ATTEMPTS, input.maxAttempts - index)
          : goAttemptBudget(index),
      ...(input.now !== undefined ? { now: input.now } : {}),
    };
    return createOgSession(puzzleInput);
  });
  const first = puzzles[0];
  if (!first) throw new RangeError('GO chain cannot be empty.');
  return {
    schemaVersion: 1,
    mode: 'go',
    id,
    scope: input.scope,
    difficulty: input.difficulty ?? 'expert',
    hardMode: input.hardMode ?? false,
    attemptPolicyVersion: GO_ATTEMPT_POLICY_VERSION,
    answerGenerationVersion: input.answerGenerationVersion ?? 'v2',
    answers,
    puzzles,
    currentPuzzleIndex: 0,
    priorAnswers: [],
    status: 'playing',
    revealedAnswer: false,
    createdAt: first.createdAt,
    updatedAt: first.updatedAt,
  };
}

export function currentGoPuzzle(session: GoSession): OgSession {
  const puzzle = session.puzzles[session.currentPuzzleIndex];
  if (!puzzle) throw new RangeError('GO session has no active puzzle.');
  return puzzle;
}

export function goPriorSeededEvidence(session: GoSession): readonly GoSeededEvidenceRow[] {
  const puzzle = currentGoPuzzle(session);
  return session.priorAnswers.map((answer, index) => ({
    kind: 'prior-answer',
    sourcePuzzleIndex: index,
    consumesAttemptSlot: true,
    countsAsPlayerGuess: false,
    guess: answer,
    tiles: scoreGuess(answer, puzzle.answer),
    submittedAt: session.puzzles[index]?.updatedAt ?? session.createdAt,
  }));
}

/** Backward-compatible semantic name for validation and keyboard consumers. */
export function goPriorEvidence(session: GoSession): readonly ScoredGuess[] {
  return goPriorSeededEvidence(session);
}

export function goKeyboardEvidence(session: GoSession): Readonly<Record<string, KeyboardState>> {
  return mergeKeyboardEvidence([...goPriorEvidence(session), ...currentGoPuzzle(session).guesses]);
}

export type SubmitGoGuessResult =
  | {
      readonly ok: true;
      readonly session: GoSession;
      readonly submitted: ScoredGuess;
      readonly puzzleIndex: number;
    }
  | {
      readonly ok: false;
      readonly session: GoSession;
      readonly error: GuessValidationError;
    };

export function submitGoGuess(
  session: GoSession,
  rawGuess: string,
  validGuesses: ReadonlySet<string>,
  now?: string,
): SubmitGoGuessResult {
  if (session.status !== 'playing' || session.pendingAdvance) {
    return {
      ok: false,
      session,
      error: { code: 'terminal', message: 'This GO puzzle cannot accept another guess yet.' },
    };
  }
  const puzzleIndex = session.currentPuzzleIndex;
  const result = submitOgGuess(currentGoPuzzle(session), rawGuess, validGuesses, {
    priorEvidence: goPriorEvidence(session),
    ...(now !== undefined ? { now } : {}),
  });
  if (!result.ok) return { ok: false, session, error: result.error };
  const puzzles = [...session.puzzles];
  puzzles[puzzleIndex] = result.session;
  const isFinal = puzzleIndex === puzzles.length - 1;
  const status =
    result.session.status === 'lost'
      ? 'lost'
      : result.session.status === 'won' && isFinal
        ? 'won'
        : 'playing';
  const pendingAdvance =
    result.session.status === 'won' && !isFinal
      ? createGoAdvance(puzzleIndex, result.session.updatedAt)
      : undefined;
  const next: GoSession = {
    ...session,
    puzzles,
    status,
    updatedAt: result.session.updatedAt,
    ...(pendingAdvance ? { pendingAdvance } : {}),
  };
  return { ok: true, session: next, submitted: result.submitted, puzzleIndex };
}

export function createGoAdvance(solvedPuzzleIndex: number, holdStartedAt: string): GoAdvance {
  if (!Number.isInteger(solvedPuzzleIndex) || solvedPuzzleIndex < 0) {
    throw new RangeError('Solved GO puzzle index must be a non-negative integer.');
  }
  const startedMs = Date.parse(holdStartedAt);
  if (!Number.isFinite(startedMs)) {
    throw new RangeError('GO hold requires a valid start time.');
  }
  return {
    solvedPuzzleIndex,
    nextPuzzleIndex: solvedPuzzleIndex + 1,
    holdStartedAt: new Date(startedMs).toISOString(),
    autoAdvanceAt: new Date(startedMs + GO_SOLVED_HOLD_MS).toISOString(),
  };
}

export function goAutoAdvanceRemainingDelay(
  session: GoSession,
  now: string | number | Date = Date.now(),
): number | undefined {
  if (!session.pendingAdvance) return undefined;
  const nowMs =
    now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new RangeError('GO hold comparison requires a valid time.');
  return Math.max(0, Date.parse(session.pendingAdvance.autoAdvanceAt) - nowMs);
}

/** Pure reload/timer transition: it advances exactly when the persisted hold expires. */
export function autoAdvanceGoSession(
  session: GoSession,
  now: string | number | Date = Date.now(),
): GoSession {
  const remaining = goAutoAdvanceRemainingDelay(session, now);
  if (remaining === undefined || remaining > 0) return session;
  const timestamp =
    now instanceof Date
      ? now.toISOString()
      : typeof now === 'number'
        ? new Date(now).toISOString()
        : new Date(now).toISOString();
  return advanceGoSession(session, timestamp);
}

export function advanceGoSession(session: GoSession, now?: string): GoSession {
  const transition = session.pendingAdvance;
  if (!transition || session.status !== 'playing') return session;
  const solved = session.puzzles[transition.solvedPuzzleIndex];
  if (!solved || solved.status !== 'won') return session;
  const updatedAt = now ? new Date(now).toISOString() : session.updatedAt;
  const { pendingAdvance, ...withoutPending } = session;
  void pendingAdvance;
  return {
    ...withoutPending,
    currentPuzzleIndex: transition.nextPuzzleIndex,
    priorAnswers: [...session.priorAnswers, solved.answer],
    updatedAt,
  };
}

export function continueGoSession(
  session: GoSession,
  operationId: string,
  now?: string,
): GoSession {
  if (session.scope !== 'practice' || session.status !== 'lost') return session;
  const index = session.currentPuzzleIndex;
  const prior = currentGoPuzzle(session);
  const continued = continueOgSession(prior, operationId, now);
  if (continued === prior) return session;
  const puzzles = [...session.puzzles];
  puzzles[index] = continued;
  return {
    ...session,
    puzzles,
    status: 'playing',
    revealedAnswer: false,
    updatedAt: continued.updatedAt,
  };
}

export function revealGoAnswer(session: GoSession, authorized: boolean, now?: string): GoSession {
  if (!authorized || session.status !== 'playing' || session.pendingAdvance) return session;
  const index = session.currentPuzzleIndex;
  const current = currentGoPuzzle(session);
  if (current.status !== 'playing') return session;
  const revealed = revealOgAnswer(current, true, now);
  if (revealed === current) return session;
  const puzzles = [...session.puzzles];
  puzzles[index] = revealed;
  return {
    ...session,
    puzzles,
    status: 'lost',
    revealedAnswer: true,
    updatedAt: revealed.updatedAt,
  };
}

export function fnv1a32(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619) >>> 0;
  }
  return hash;
}

export function mixU32(value: number): number {
  let mixed = value >>> 0;
  mixed = (mixed ^ (mixed >>> 16)) >>> 0;
  mixed = Math.imul(mixed, 2_246_822_507) >>> 0;
  mixed = (mixed ^ (mixed >>> 13)) >>> 0;
  mixed = Math.imul(mixed, 3_266_489_909) >>> 0;
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

export function selectDeterministicChain(
  catalog: readonly string[],
  count: number,
  streamKey: string,
  excluded: ReadonlySet<string> = new Set(),
): readonly string[] {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('Chain count must be positive.');
  const unique = [...new Set(catalog.map(normalizeWord))].filter(
    (word) => isAcceptedAlphabeticWord(word) && !excluded.has(word),
  );
  if (unique.length < count)
    throw new RangeError('Answer catalog cannot provide the requested chain.');
  return unique
    .map((word) => ({ word, rank: mixU32(fnv1a32(`${streamKey}:${word}`)) }))
    .sort(
      (left, right) =>
        left.rank - right.rank || (left.word < right.word ? -1 : left.word > right.word ? 1 : 0),
    )
    .slice(0, count)
    .map(({ word }) => word);
}

function mixLegacyDailySeed(day: number): number {
  let hash = (day ^ 0x9e3779b9) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function selectLegacyDailyGoChain(
  catalog: readonly string[],
  dateKey: string,
  count = 5,
): readonly string[] {
  if (!Number.isInteger(count) || count < 1) throw new RangeError('Chain count must be positive.');
  const answers = [...new Set(catalog.map(normalizeWord))].filter(isAcceptedAlphabeticWord);
  if (answers.length < count)
    throw new RangeError('Answer catalog cannot provide the requested chain.');
  const ogIndex = dailyAnswerIndex(dateKey, answers.length);
  const day = Date.parse(`${dateKey}T00:00:00.000Z`) / 86_400_000;
  const seedIndex =
    answers.length === 1
      ? ogIndex
      : (ogIndex + 1 + (mixLegacyDailySeed(Math.trunc(day)) % (answers.length - 1))) %
        answers.length;
  return Array.from({ length: count }, (_, offset) => {
    const answer = answers[(seedIndex + offset) % answers.length];
    if (answer === undefined) throw new RangeError('Legacy Daily GO selection failed.');
    return answer;
  });
}

export interface SelectDailyGoAnswersInput {
  readonly catalog: readonly string[];
  readonly dateKey: string;
  readonly difficulty?: Difficulty;
  readonly stored?: {
    readonly answers: readonly string[];
    readonly answerGenerationVersion?: GoAnswerGenerationVersion;
  };
}

export interface SelectedDailyGoAnswers {
  readonly answers: readonly string[];
  readonly answerGenerationVersion: GoAnswerGenerationVersion;
  readonly source: 'generated' | 'stored';
}

/**
 * Resolves Daily GO authority. Once answers have been serialized they are
 * returned byte-for-byte; only a genuinely new chain consults the current
 * catalog and cutoff selector.
 */
export function selectDailyGoAnswers(input: SelectDailyGoAnswersInput): SelectedDailyGoAnswers {
  if (input.stored) {
    if (input.stored.answers.length === 0) {
      throw new RangeError('Stored GO answers cannot be empty.');
    }
    return {
      answers: [...input.stored.answers],
      answerGenerationVersion: input.stored.answerGenerationVersion ?? 'v1',
      source: 'stored',
    };
  }
  const answerGenerationVersion = goAnswerGenerationVersion(input.dateKey, 'go');
  const answers =
    answerGenerationVersion === 'v1'
      ? selectLegacyDailyGoChain(input.catalog, input.dateKey, 5)
      : selectDeterministicChain(
          input.catalog,
          5,
          dailyGoStreamKey({
            player: 'solo',
            lane: 'unranked',
            dateKey: input.dateKey,
            wordLength: 5,
            difficulty: input.difficulty ?? 'expert',
            puzzleCount: 5,
          }),
        );
  return { answers, answerGenerationVersion, source: 'generated' };
}

export function dailyGoStreamKey(input: {
  readonly player: 'solo' | 'multiplayer';
  readonly lane: 'unranked' | 'ranked';
  readonly dateKey: string;
  readonly wordLength?: number;
  readonly difficulty?: Difficulty;
  readonly puzzleCount?: number;
}): string {
  return `go-chain-v2:${input.player}:daily:${input.lane}:${input.dateKey}:${input.wordLength ?? 5}:${input.difficulty ?? 'expert'}:${input.puzzleCount ?? 5}`;
}

export function selectSeparatedDailyCombatChains(
  catalog: readonly string[],
  dateKey: string,
): { readonly unranked: readonly string[]; readonly ranked: readonly string[] } {
  const unranked = selectDeterministicChain(
    catalog,
    5,
    dailyGoStreamKey({ player: 'multiplayer', lane: 'unranked', dateKey }),
  );
  const ranked = selectDeterministicChain(
    catalog,
    5,
    dailyGoStreamKey({ player: 'multiplayer', lane: 'ranked', dateKey }),
    new Set(unranked),
  );
  return { unranked, ranked };
}

function shellCompatibleDailyCombatIndex(
  catalog: readonly string[],
  dateKey: string,
  family: 'og' | 'go',
  baseIndex: number,
): number {
  if (catalog.length < 2) {
    if (catalog.length === 1) return 0;
    throw new RangeError('Daily COMBAT requires at least one answer.');
  }
  const offset = 1 + (fnv1a32(`${dateKey}:${family}:multiplayer`) % (catalog.length - 1));
  return (baseIndex + offset) % catalog.length;
}

/**
 * Selects the retained shell's unranked Daily Multiplayer lane without
 * conflating it with Solo Daily or the separately seeded ranked lane.
 */
export function selectUnrankedDailyCombatAnswers(input: {
  readonly catalog: readonly string[];
  readonly dateKey: string;
  readonly mode: 'og' | 'go';
}): readonly string[] {
  const catalog = [...new Set(input.catalog.map(normalizeWord))].filter(isAcceptedAlphabeticWord);
  if (catalog.length === 0) throw new RangeError('Daily COMBAT answer catalog is empty.');
  if (input.mode === 'og') {
    const index = shellCompatibleDailyCombatIndex(
      catalog,
      input.dateKey,
      'og',
      dailyAnswerIndex(input.dateKey, catalog.length),
    );
    const answer = catalog[index];
    if (!answer) throw new RangeError('Daily COMBAT OG selection failed.');
    return [answer];
  }
  if (goAnswerGenerationVersion(input.dateKey, 'go') === 'v2') {
    return selectSeparatedDailyCombatChains(catalog, input.dateKey).unranked;
  }
  const legacy = selectLegacyDailyGoChain(catalog, input.dateKey, 5);
  const baseIndex = catalog.indexOf(legacy[0] ?? '');
  const seedIndex = shellCompatibleDailyCombatIndex(
    catalog,
    input.dateKey,
    'go',
    Math.max(baseIndex, 0),
  );
  return Array.from({ length: 5 }, (_, offset) => {
    const answer = catalog[(seedIndex + offset) % catalog.length];
    if (!answer) throw new RangeError('Daily COMBAT GO selection failed.');
    return answer;
  });
}

export function goAnswerGenerationVersion(
  dateKey: string,
  mode: 'og' | 'go',
): GoAnswerGenerationVersion {
  return mode === 'go' && dateKey >= GO_DAILY_V2_CUTOFF_DATE_KEY ? 'v2' : 'v1';
}

const goSessionSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal('go'),
  id: z.string().min(1),
  scope: z.enum(['daily', 'practice']),
  difficulty: z.enum(['casual', 'standard', 'expert']),
  hardMode: z.boolean(),
  attemptPolicyVersion: z
    .enum(['fixed-v0', GO_ATTEMPT_POLICY_VERSION])
    .optional()
    .default('fixed-v0'),
  answerGenerationVersion: z.enum(['v1', 'v2']),
  answers: z.array(z.string()).min(1),
  puzzles: z.array(z.unknown()).min(1),
  currentPuzzleIndex: z.number().int().nonnegative(),
  priorAnswers: z.array(z.string()),
  pendingAdvance: z
    .object({
      solvedPuzzleIndex: z.number().int().nonnegative(),
      nextPuzzleIndex: z.number().int().nonnegative(),
      holdStartedAt: z.iso.datetime().optional(),
      autoAdvanceAt: z.iso.datetime().optional(),
      // Checkpoint-1 migration support for the earlier pre-hold envelope.
      solvedAt: z.iso.datetime().optional(),
    })
    .optional(),
  status: z.enum(['playing', 'won', 'lost']),
  revealedAnswer: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export function restoreGoSession(value: unknown): GoSession | undefined {
  let input: unknown = value;
  if (typeof value === 'string') {
    try {
      input = JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }
  const parsed = goSessionSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const puzzles = parsed.data.puzzles.map(restoreOgSession);
  if (puzzles.some((puzzle) => !puzzle)) return undefined;
  const parsedAdvance = parsed.data.pendingAdvance;
  const pendingAdvance = parsedAdvance
    ? parsedAdvance.holdStartedAt && parsedAdvance.autoAdvanceAt
      ? {
          solvedPuzzleIndex: parsedAdvance.solvedPuzzleIndex,
          nextPuzzleIndex: parsedAdvance.nextPuzzleIndex,
          holdStartedAt: parsedAdvance.holdStartedAt,
          autoAdvanceAt: parsedAdvance.autoAdvanceAt,
        }
      : parsedAdvance.solvedAt
        ? createGoAdvance(parsedAdvance.solvedPuzzleIndex, parsedAdvance.solvedAt)
        : undefined
    : undefined;
  if (parsedAdvance && !pendingAdvance) return undefined;
  const session = {
    ...parsed.data,
    puzzles: puzzles as OgSession[],
    ...(pendingAdvance ? { pendingAdvance } : {}),
  } as GoSession;
  const attemptPolicyIsValid = session.puzzles.every((puzzle, index) => {
    if (session.attemptPolicyVersion === 'fixed-v0') return true;
    return puzzle.maxAttempts === goAttemptBudget(index) + puzzle.continuationCount;
  });
  if (
    !attemptPolicyIsValid ||
    session.answers.length !== session.puzzles.length ||
    session.currentPuzzleIndex >= session.puzzles.length ||
    session.answers.some((answer, index) => answer !== session.puzzles[index]?.answer) ||
    session.priorAnswers.some((answer, index) => answer !== session.answers[index]) ||
    session.priorAnswers.length !== session.currentPuzzleIndex ||
    (session.status === 'won' && session.puzzles.some((puzzle) => puzzle.status !== 'won')) ||
    (session.status === 'lost' && session.puzzles[session.currentPuzzleIndex]?.status !== 'lost') ||
    (session.pendingAdvance !== undefined &&
      (session.pendingAdvance.solvedPuzzleIndex !== session.currentPuzzleIndex ||
        session.pendingAdvance.nextPuzzleIndex !== session.currentPuzzleIndex + 1 ||
        session.puzzles[session.currentPuzzleIndex]?.status !== 'won' ||
        Date.parse(session.pendingAdvance.autoAdvanceAt) -
          Date.parse(session.pendingAdvance.holdStartedAt) !==
          GO_SOLVED_HOLD_MS))
  ) {
    return undefined;
  }
  // Legacy serialized answers are deliberately accepted unchanged; only new-chain creation enforces uniqueness.
  return session;
}

export function needsGoAttemptPolicyRestart(session: GoSession): boolean {
  return (
    session.attemptPolicyVersion === 'fixed-v0' &&
    (session.status === 'playing' ||
      (session.scope === 'practice' && session.status === 'lost' && !session.revealedAnswer))
  );
}

export function serializeGoSession(session: GoSession): string {
  const restored = restoreGoSession(session);
  if (!restored) throw new TypeError('Cannot serialize an invalid GO session.');
  return JSON.stringify(restored);
}
