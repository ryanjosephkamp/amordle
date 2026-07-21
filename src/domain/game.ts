import { z } from 'zod';

import {
  assertWordLength,
  isAcceptedAlphabeticWord,
  normalizeWord,
  type Difficulty,
  type WordLength,
} from './words';

export type TileState = 'absent' | 'present' | 'correct';
export type KeyboardState = TileState | 'unknown';
export type GameScope = 'daily' | 'practice';
export type GameStatus = 'playing' | 'won' | 'lost';

export interface ScoredTile {
  readonly letter: string;
  readonly state: TileState;
  readonly position: number;
}

export interface ScoredGuess {
  readonly guess: string;
  readonly tiles: readonly ScoredTile[];
  readonly submittedAt: string;
}

export interface OgSession {
  readonly schemaVersion: 1;
  readonly mode: 'og';
  readonly id: string;
  readonly answer: string;
  readonly wordLength: WordLength;
  readonly scope: GameScope;
  readonly difficulty: Difficulty;
  readonly hardMode: boolean;
  readonly maxAttempts: number;
  readonly continuationCount: number;
  readonly appliedContinuationIds: readonly string[];
  readonly guesses: readonly ScoredGuess[];
  readonly draft: readonly (string | null)[];
  readonly revealedPositions: readonly (string | null)[];
  readonly removedLetters: readonly string[];
  readonly status: GameStatus;
  readonly revealedAnswer: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type GuessValidationCode =
  | 'missing'
  | 'wrong_length'
  | 'non_alphabetic'
  | 'unsupported_length'
  | 'not_in_word_list'
  | 'hard_mode_correct_position'
  | 'hard_mode_present_position'
  | 'hard_mode_missing_letter'
  | 'revealed_position_mismatch'
  | 'terminal';

export interface GuessValidationError {
  readonly code: GuessValidationCode;
  readonly message: string;
  readonly letter?: string;
  readonly position?: number;
}

export type SubmitGuessResult =
  | { readonly ok: true; readonly session: OgSession; readonly submitted: ScoredGuess }
  | { readonly ok: false; readonly session: OgSession; readonly error: GuessValidationError };

const tileRank: Readonly<Record<KeyboardState, number>> = {
  unknown: 0,
  absent: 1,
  present: 2,
  correct: 3,
};

export function scoreGuess(rawGuess: string, rawAnswer: string): readonly ScoredTile[] {
  const guess = normalizeWord(rawGuess);
  const answer = normalizeWord(rawAnswer);
  if (
    guess.length !== answer.length ||
    !isAcceptedAlphabeticWord(guess) ||
    !isAcceptedAlphabeticWord(answer)
  ) {
    throw new RangeError('Guess and answer must be alphabetic words of equal length.');
  }

  const states: TileState[] = Array.from({ length: guess.length }, () => 'absent');
  const remaining = new Map<string, number>();

  for (let index = 0; index < answer.length; index += 1) {
    const answerLetter = answer[index];
    const guessLetter = guess[index];
    if (answerLetter === undefined || guessLetter === undefined) continue;
    if (answerLetter === guessLetter) states[index] = 'correct';
    else remaining.set(answerLetter, (remaining.get(answerLetter) ?? 0) + 1);
  }

  for (let index = 0; index < guess.length; index += 1) {
    if (states[index] === 'correct') continue;
    const letter = guess[index];
    if (letter === undefined) continue;
    const count = remaining.get(letter) ?? 0;
    if (count > 0) {
      states[index] = 'present';
      remaining.set(letter, count - 1);
    }
  }

  return states.map((state, position) => ({ letter: guess[position] ?? '', state, position }));
}

export function mergeKeyboardEvidence(
  guesses: readonly Pick<ScoredGuess, 'tiles'>[],
): Readonly<Record<string, KeyboardState>> {
  const evidence: Record<string, KeyboardState> = {};
  for (const guess of guesses) {
    for (const tile of guess.tiles) {
      const prior = evidence[tile.letter] ?? 'unknown';
      if (tileRank[tile.state] > tileRank[prior]) evidence[tile.letter] = tile.state;
    }
  }
  return evidence;
}

function requiredHardModeCounts(
  guesses: readonly Pick<ScoredGuess, 'tiles'>[],
): Map<string, number> {
  const required = new Map<string, number>();
  for (const guess of guesses) {
    const rowCounts = new Map<string, number>();
    for (const tile of guess.tiles) {
      if (tile.state !== 'absent')
        rowCounts.set(tile.letter, (rowCounts.get(tile.letter) ?? 0) + 1);
    }
    for (const [letter, count] of rowCounts) {
      required.set(letter, Math.max(required.get(letter) ?? 0, count));
    }
  }
  return required;
}

export function validateHardMode(
  guess: string,
  evidence: readonly Pick<ScoredGuess, 'tiles'>[],
): GuessValidationError | undefined {
  for (const prior of evidence) {
    for (const tile of prior.tiles) {
      if (tile.state === 'correct' && guess[tile.position] !== tile.letter) {
        return {
          code: 'hard_mode_correct_position',
          message: `${tile.letter.toLocaleUpperCase('en-US')} must remain in position ${tile.position + 1}.`,
          letter: tile.letter,
          position: tile.position,
        };
      }
    }
  }

  for (const prior of evidence) {
    for (const tile of prior.tiles) {
      if (tile.state === 'present' && guess[tile.position] === tile.letter) {
        return {
          code: 'hard_mode_present_position',
          message: `${tile.letter.toLocaleUpperCase('en-US')} cannot remain in position ${tile.position + 1}.`,
          letter: tile.letter,
          position: tile.position,
        };
      }
    }
  }

  const counts = new Map<string, number>();
  for (const letter of guess) counts.set(letter, (counts.get(letter) ?? 0) + 1);
  for (const [letter, minimum] of requiredHardModeCounts(evidence)) {
    if ((counts.get(letter) ?? 0) < minimum) {
      return {
        code: 'hard_mode_missing_letter',
        message: `Guess must include ${minimum} ${letter.toLocaleUpperCase('en-US')}${minimum === 1 ? '' : 's'}.`,
        letter,
      };
    }
  }
  return undefined;
}

export interface ValidateGuessInput {
  readonly rawGuess: string;
  readonly wordLength: number;
  readonly validGuesses: ReadonlySet<string>;
  readonly hardMode: boolean;
  readonly evidence: readonly Pick<ScoredGuess, 'tiles'>[];
  readonly revealedPositions?: readonly (string | null)[];
  readonly terminal: boolean;
}

export function validateGuess(input: ValidateGuessInput): GuessValidationError | undefined {
  const raw = input.rawGuess.trim();
  if (!raw) return { code: 'missing', message: 'Enter a guess.' };
  const guess = normalizeWord(raw);
  if (guess.length !== input.wordLength) {
    return {
      code: 'wrong_length',
      message: `Guess must contain exactly ${input.wordLength} letters.`,
    };
  }
  if (!isAcceptedAlphabeticWord(guess)) {
    return { code: 'non_alphabetic', message: 'Guess may contain only A–Z letters.' };
  }
  try {
    assertWordLength(input.wordLength);
  } catch {
    return { code: 'unsupported_length', message: 'This word length is not supported.' };
  }
  if (!input.validGuesses.has(guess)) {
    return { code: 'not_in_word_list', message: 'That word is not in the accepted guess list.' };
  }

  for (let index = 0; index < (input.revealedPositions?.length ?? 0); index += 1) {
    const revealed = input.revealedPositions?.[index];
    if (revealed && guess[index] !== revealed) {
      return {
        code: 'revealed_position_mismatch',
        message: `${revealed.toLocaleUpperCase('en-US')} is locked in position ${index + 1}.`,
        letter: revealed,
        position: index,
      };
    }
  }

  if (input.hardMode) {
    const hardModeError = validateHardMode(guess, input.evidence);
    if (hardModeError) return hardModeError;
  }
  if (input.terminal) return { code: 'terminal', message: 'This puzzle is already complete.' };
  return undefined;
}

function nowIso(now?: string): string {
  const timestamp = now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(timestamp)))
    throw new RangeError('A valid ISO timestamp is required.');
  return new Date(timestamp).toISOString();
}

export interface CreateOgSessionInput {
  readonly id: string;
  readonly answer: string;
  readonly scope: GameScope;
  readonly difficulty?: Difficulty;
  readonly hardMode?: boolean;
  readonly maxAttempts?: number;
  readonly now?: string;
}

export function createOgSession(input: CreateOgSessionInput): OgSession {
  const answer = normalizeWord(input.answer);
  if (!isAcceptedAlphabeticWord(answer))
    throw new RangeError('Answer must contain only A–Z letters.');
  const wordLength = assertWordLength(answer.length);
  const id = input.id.trim();
  if (!id) throw new RangeError('Session id is required.');
  const maxAttempts = input.maxAttempts ?? 6;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('Maximum attempts must be a positive integer.');
  }
  const timestamp = nowIso(input.now);
  return {
    schemaVersion: 1,
    mode: 'og',
    id,
    answer,
    wordLength,
    scope: input.scope,
    difficulty: input.difficulty ?? 'expert',
    hardMode: input.hardMode ?? false,
    maxAttempts,
    continuationCount: 0,
    appliedContinuationIds: [],
    guesses: [],
    draft: Array.from({ length: wordLength }, () => null),
    revealedPositions: Array.from({ length: wordLength }, () => null),
    removedLetters: [],
    status: 'playing',
    revealedAnswer: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function nextEditableIndex(session: OgSession): number | undefined {
  for (let index = 0; index < session.wordLength; index += 1) {
    if (!session.revealedPositions[index] && !session.draft[index]) return index;
  }
  return undefined;
}

export function enterLetter(session: OgSession, rawLetter: string, now?: string): OgSession {
  if (session.status !== 'playing') return session;
  const letter = normalizeWord(rawLetter);
  if (!/^[a-z]$/.test(letter) || session.removedLetters.includes(letter)) return session;
  const index = nextEditableIndex(session);
  if (index === undefined) return session;
  const draft = [...session.draft];
  draft[index] = letter;
  return { ...session, draft, updatedAt: nowIso(now) };
}

export function deleteLetter(session: OgSession, now?: string): OgSession {
  if (session.status !== 'playing') return session;
  for (let index = session.wordLength - 1; index >= 0; index -= 1) {
    if (!session.revealedPositions[index] && session.draft[index]) {
      const draft = [...session.draft];
      draft[index] = null;
      return { ...session, draft, updatedAt: nowIso(now) };
    }
  }
  return session;
}

export function setDraftWord(session: OgSession, rawGuess: string, now?: string): OgSession {
  if (session.status !== 'playing') return session;
  const guess = normalizeWord(rawGuess);
  if (!isAcceptedAlphabeticWord(guess) || guess.length !== session.wordLength) return session;
  const draft = [...session.draft];
  for (let index = 0; index < session.wordLength; index += 1) {
    const locked = session.revealedPositions[index];
    draft[index] = locked ?? guess[index] ?? null;
  }
  return { ...session, draft, updatedAt: nowIso(now) };
}

export function draftWord(session: OgSession): string {
  return session.draft
    .map((letter, index) => session.revealedPositions[index] ?? letter ?? '')
    .join('');
}

export function submitOgGuess(
  session: OgSession,
  rawGuess: string,
  validGuesses: ReadonlySet<string>,
  options: { readonly priorEvidence?: readonly ScoredGuess[]; readonly now?: string } = {},
): SubmitGuessResult {
  const guess = normalizeWord(rawGuess);
  const evidence = [...(options.priorEvidence ?? []), ...session.guesses];
  const error = validateGuess({
    rawGuess,
    wordLength: session.wordLength,
    validGuesses,
    hardMode: session.hardMode,
    evidence,
    revealedPositions: session.revealedPositions,
    terminal: session.status !== 'playing',
  });
  if (error) return { ok: false, session, error };

  const submittedAt = nowIso(options.now);
  const submitted: ScoredGuess = { guess, tiles: scoreGuess(guess, session.answer), submittedAt };
  const guesses = [...session.guesses, submitted];
  const solved = guess === session.answer;
  const status: GameStatus = solved
    ? 'won'
    : guesses.length >= session.maxAttempts
      ? 'lost'
      : 'playing';
  const next: OgSession = {
    ...session,
    guesses,
    draft: session.revealedPositions.map((letter) => letter),
    status,
    updatedAt: submittedAt,
  };
  return { ok: true, session: next, submitted };
}

export function continueOgSession(
  session: OgSession,
  operationId: string,
  now?: string,
): OgSession {
  if (session.appliedContinuationIds.includes(operationId)) return session;
  if (session.scope !== 'practice' || session.status !== 'lost' || session.revealedAnswer)
    return session;
  const id = operationId.trim();
  if (!id) throw new RangeError('Continuation operation id is required.');
  return {
    ...session,
    maxAttempts: session.maxAttempts + 1,
    continuationCount: session.continuationCount + 1,
    appliedContinuationIds: [...session.appliedContinuationIds, id],
    status: 'playing',
    updatedAt: nowIso(now),
  };
}

export function revealOgAnswer(session: OgSession, authorized: boolean, now?: string): OgSession {
  if (!authorized || session.status === 'won') return session;
  return {
    ...session,
    draft: Array.from({ length: session.wordLength }, () => null),
    status: 'lost',
    revealedAnswer: true,
    updatedAt: nowIso(now),
  };
}

export function completionPercentage(session: OgSession): number {
  let best = 0;
  for (const guess of session.guesses) {
    const correct = guess.tiles.filter((tile) => tile.state === 'correct').length;
    best = Math.max(best, Math.floor((correct / session.wordLength) * 100));
  }
  return best;
}

const scoredTileSchema = z.object({
  letter: z.string().regex(/^[a-z]$/),
  state: z.enum(['absent', 'present', 'correct']),
  position: z.number().int().nonnegative(),
});
const scoredGuessSchema = z.object({
  guess: z.string(),
  tiles: z.array(scoredTileSchema),
  submittedAt: z.iso.datetime(),
});

export const ogSessionSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.literal('og'),
  id: z.string().min(1),
  answer: z.string(),
  wordLength: z.number().int().min(2).max(35),
  scope: z.enum(['daily', 'practice']),
  difficulty: z.enum(['casual', 'standard', 'expert']),
  hardMode: z.boolean(),
  maxAttempts: z.number().int().positive(),
  continuationCount: z.number().int().nonnegative(),
  appliedContinuationIds: z.array(z.string().min(1)),
  guesses: z.array(scoredGuessSchema),
  draft: z.array(
    z
      .string()
      .regex(/^[a-z]$/)
      .nullable(),
  ),
  revealedPositions: z.array(
    z
      .string()
      .regex(/^[a-z]$/)
      .nullable(),
  ),
  removedLetters: z.array(z.string().regex(/^[a-z]$/)),
  status: z.enum(['playing', 'won', 'lost']),
  revealedAnswer: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export function restoreOgSession(value: unknown): OgSession | undefined {
  let input: unknown = value;
  if (typeof value === 'string') {
    try {
      input = JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }
  const parsed = ogSessionSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const session = parsed.data as OgSession;
  if (
    session.answer.length !== session.wordLength ||
    !isAcceptedAlphabeticWord(session.answer) ||
    session.draft.length !== session.wordLength ||
    session.revealedPositions.length !== session.wordLength ||
    session.guesses.length > session.maxAttempts
  ) {
    return undefined;
  }
  for (const row of session.guesses) {
    if (row.guess.length !== session.wordLength || row.tiles.length !== session.wordLength)
      return undefined;
    const expected = scoreGuess(row.guess, session.answer);
    if (JSON.stringify(expected) !== JSON.stringify(row.tiles)) return undefined;
  }
  const solved = session.guesses.some((row) => row.guess === session.answer);
  if (session.status === 'won' && !solved) return undefined;
  if (session.status === 'lost' && solved) return undefined;
  if (
    session.status === 'lost' &&
    !session.revealedAnswer &&
    session.guesses.length < session.maxAttempts
  ) {
    return undefined;
  }
  if (session.status === 'playing' && (solved || session.guesses.length >= session.maxAttempts))
    return undefined;
  return session;
}

export function serializeOgSession(session: OgSession): string {
  const restored = restoreOgSession(session);
  if (!restored) throw new TypeError('Cannot serialize an invalid OG session.');
  return JSON.stringify(restored);
}
