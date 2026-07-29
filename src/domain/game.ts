export type GameMode = 'og' | 'go';
export type Difficulty = 'casual' | 'standard' | 'expert';
export type TileState = 'correct' | 'present' | 'absent';
export type EvidenceState = TileState | 'removed' | 'unknown';
export type GameStatus = 'active' | 'holding' | 'won' | 'lost';

export interface Tile {
  letter: string;
  state: TileState;
}

export interface GuessRow {
  id: string;
  puzzleIndex: number;
  guess: string;
  tiles: Tile[];
  kind: 'accepted' | 'seeded';
  acceptedAt: string;
}

export interface GameSettings {
  mode: GameMode;
  length: number;
  difficulty: Difficulty;
  hardMode: boolean;
  goCount: 1 | 5 | 7 | 10;
}

export interface GameSession {
  schemaVersion: 1;
  id: string;
  ownerNamespace: string;
  settings: GameSettings;
  answers: string[];
  puzzleIndex: number;
  rows: GuessRow[];
  draft: string;
  status: GameStatus;
  rejection: string | null;
  holdUntil: string | null;
  continuationCount: number;
  revealedPositions: Record<string, string>;
  removedLetters: string[];
  appliedOperationIds: string[];
  answerRevealed: boolean;
  createdAt: string;
  updatedAt: string;
}

export type GameCommand =
  | { type: 'insert'; letter: string; now: string }
  | { type: 'delete'; now: string }
  | { type: 'submit'; sanctionedWords: ReadonlySet<string>; now: string }
  | { type: 'advance'; now: string }
  | { type: 'continue'; operationId: string; now: string }
  | { type: 'reveal-position'; operationId: string; position: number; letter: string; now: string }
  | { type: 'remove-letters'; operationId: string; letters: string[]; now: string }
  | { type: 'reveal-answer'; now: string }
  | { type: 'clear-rejection'; now: string };

const evidenceRank: Record<EvidenceState, number> = {
  unknown: 0,
  removed: 1,
  absent: 2,
  present: 3,
  correct: 4,
};

export function scoreGuess(answer: string, guess: string): Tile[] {
  if (answer.length !== guess.length) {
    throw new Error('Answer and guess must have the same length.');
  }

  const states: TileState[] = Array.from({ length: answer.length }, () => 'absent');
  const remaining = new Map<string, number>();

  for (let index = 0; index < answer.length; index += 1) {
    const answerLetter = answer[index];
    const guessLetter = guess[index];
    if (answerLetter === undefined || guessLetter === undefined) {
      throw new Error('Word indexing failed.');
    }
    if (answerLetter === guessLetter) {
      states[index] = 'correct';
    } else {
      remaining.set(answerLetter, (remaining.get(answerLetter) ?? 0) + 1);
    }
  }

  for (let index = 0; index < guess.length; index += 1) {
    if (states[index] === 'correct') continue;
    const letter = guess[index];
    if (letter === undefined) throw new Error('Word indexing failed.');
    const count = remaining.get(letter) ?? 0;
    if (count > 0) {
      states[index] = 'present';
      remaining.set(letter, count - 1);
    }
  }

  return [...guess].map((letter, index) => ({
    letter,
    state: states[index] ?? 'absent',
  }));
}

export function mergeEvidence(current: EvidenceState, incoming: EvidenceState): EvidenceState {
  return evidenceRank[incoming] > evidenceRank[current] ? incoming : current;
}

export function deriveKeyboardEvidence(
  rows: readonly GuessRow[],
  removed: ReadonlySet<string> = new Set(),
): Record<string, EvidenceState> {
  const evidence: Record<string, EvidenceState> = {};
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    evidence[letter] = 'unknown';
  }
  for (const row of rows) {
    for (const tile of row.tiles) {
      evidence[tile.letter] = mergeEvidence(evidence[tile.letter] ?? 'unknown', tile.state);
    }
  }
  for (const letter of removed) {
    evidence[letter] = 'removed';
  }
  return evidence;
}

export function playableAttemptBudget(zeroBasedPuzzleIndex: number): number {
  if (!Number.isInteger(zeroBasedPuzzleIndex) || zeroBasedPuzzleIndex < 0) {
    throw new Error('Puzzle index must be a non-negative integer.');
  }
  return Math.max(2, 6 - zeroBasedPuzzleIndex);
}

export function validateSettings(settings: GameSettings): string | null {
  if (!Number.isInteger(settings.length) || settings.length < 2 || settings.length > 35) {
    return 'Choose a word length from 2 to 35.';
  }
  if (!['casual', 'standard', 'expert'].includes(settings.difficulty)) {
    return 'Choose a supported difficulty.';
  }
  if (settings.mode === 'og' && settings.goCount !== 1) {
    return 'OG uses one puzzle.';
  }
  if (settings.mode === 'go' && ![5, 7, 10].includes(settings.goCount)) {
    return 'GO uses 5, 7, or 10 puzzles.';
  }
  return null;
}

function currentAnswer(session: GameSession): string {
  const answer = session.answers[session.puzzleIndex];
  if (answer === undefined) throw new Error('Current answer is unavailable.');
  return answer;
}

function acceptedRowsForCurrentPuzzle(session: GameSession): GuessRow[] {
  return session.rows.filter(
    (row) => row.kind === 'accepted' && row.puzzleIndex === session.puzzleIndex,
  );
}

export function hardModeViolationForEvidence(input: {
  rows: ReadonlyArray<Pick<GuessRow, 'tiles'>>;
  revealedPositions?: Readonly<Record<string, string>>;
  enabled: boolean;
  guess: string;
}): string | null {
  for (const [position, letter] of Object.entries(input.revealedPositions ?? {})) {
    const index = Number(position);
    if (input.guess[index] !== letter) {
      return `Keep the revealed ${letter.toUpperCase()} in position ${index + 1}.`;
    }
  }
  if (!input.enabled) return null;
  const fixed = new Map<number, string>();
  const positiveCounts = new Map<string, number>();
  const purelyAbsent = new Set<string>();

  for (const row of input.rows) {
    const rowPositive = new Map<string, number>();
    for (let index = 0; index < row.tiles.length; index += 1) {
      const tile = row.tiles[index];
      if (tile === undefined) continue;
      if (tile.state === 'correct') fixed.set(index, tile.letter);
      if (tile.state === 'correct' || tile.state === 'present') {
        rowPositive.set(tile.letter, (rowPositive.get(tile.letter) ?? 0) + 1);
        purelyAbsent.delete(tile.letter);
      } else if (!positiveCounts.has(tile.letter)) {
        purelyAbsent.add(tile.letter);
      }
    }
    for (const [letter, count] of rowPositive) {
      positiveCounts.set(letter, Math.max(positiveCounts.get(letter) ?? 0, count));
    }
  }

  for (const [index, letter] of fixed) {
    if (input.guess[index] !== letter) {
      return `Keep ${letter.toUpperCase()} in position ${index + 1}.`;
    }
  }
  for (const [letter, count] of positiveCounts) {
    const actual = [...input.guess].filter((candidate) => candidate === letter).length;
    if (actual < count) {
      return `Use at least ${count} ${letter.toUpperCase()}${count > 1 ? 's' : ''}.`;
    }
  }
  for (const letter of purelyAbsent) {
    if (input.guess.includes(letter) && !positiveCounts.has(letter)) {
      return `${letter.toUpperCase()} has already been ruled out.`;
    }
  }
  return null;
}

function hardModeViolation(session: GameSession, guess: string): string | null {
  return hardModeViolationForEvidence({
    rows: session.rows.filter((row) => row.puzzleIndex === session.puzzleIndex),
    revealedPositions: session.revealedPositions,
    enabled: session.settings.hardMode,
    guess,
  });
}

function validateDraft(session: GameSession, sanctionedWords: ReadonlySet<string>): string | null {
  if (session.status !== 'active') return 'This game is not accepting guesses.';
  const answer = currentAnswer(session);
  if (session.draft.length !== answer.length || !/^[a-z]+$/.test(session.draft)) {
    return `Enter a ${answer.length}-letter word.`;
  }
  if (!sanctionedWords.has(session.draft)) {
    return 'That word is not in this game’s list.';
  }
  return hardModeViolation(session, session.draft);
}

function seededRowsForPuzzle(
  session: GameSession,
  puzzleIndex: number,
  acceptedAt: string,
): GuessRow[] {
  const answer = session.answers[puzzleIndex];
  if (answer === undefined) return [];
  return session.answers.slice(0, puzzleIndex).map((priorAnswer, index) => ({
    id: `${session.id}:seed:${puzzleIndex}:${index}`,
    puzzleIndex,
    guess: priorAnswer,
    tiles: scoreGuess(answer, priorAnswer),
    kind: 'seeded',
    acceptedAt,
  }));
}

export function reduceGame(session: GameSession, command: GameCommand): GameSession {
  if (command.type === 'clear-rejection') {
    return { ...session, rejection: null, updatedAt: command.now };
  }

  if (command.type === 'advance') {
    if (session.status !== 'holding') return session;
    if (session.holdUntil !== null && Date.parse(command.now) < Date.parse(session.holdUntil)) {
      return session;
    }
    const nextIndex = session.puzzleIndex + 1;
    return {
      ...session,
      puzzleIndex: nextIndex,
      rows: [...session.rows, ...seededRowsForPuzzle(session, nextIndex, command.now)],
      draft: '',
      status: 'active',
      rejection: null,
      holdUntil: null,
      continuationCount: 0,
      revealedPositions: {},
      removedLetters: [],
      updatedAt: command.now,
    };
  }

  if (command.type === 'continue') {
    if (
      session.status !== 'lost' ||
      session.answerRevealed ||
      session.appliedOperationIds.includes(command.operationId)
    ) {
      return session;
    }
    return {
      ...session,
      status: 'active',
      continuationCount: session.continuationCount + 1,
      appliedOperationIds: [...session.appliedOperationIds, command.operationId],
      rejection: null,
      updatedAt: command.now,
    };
  }

  if (command.type === 'reveal-answer') {
    if (session.status !== 'lost' || session.answerRevealed) return session;
    return { ...session, answerRevealed: true, updatedAt: command.now };
  }

  if (command.type === 'reveal-position') {
    if (
      session.status !== 'active' ||
      session.appliedOperationIds.includes(command.operationId) ||
      command.position < 0 ||
      command.position >= currentAnswer(session).length ||
      currentAnswer(session)[command.position] !== command.letter
    ) {
      return session;
    }
    return {
      ...session,
      revealedPositions: {
        ...session.revealedPositions,
        [String(command.position)]: command.letter,
      },
      appliedOperationIds: [...session.appliedOperationIds, command.operationId],
      updatedAt: command.now,
    };
  }

  if (command.type === 'remove-letters') {
    if (session.status !== 'active' || session.appliedOperationIds.includes(command.operationId)) {
      return session;
    }
    const answerLetters = new Set(currentAnswer(session));
    const safeLetters = command.letters.filter(
      (letter) => /^[a-z]$/.test(letter) && !answerLetters.has(letter),
    );
    return {
      ...session,
      removedLetters: [...new Set([...session.removedLetters, ...safeLetters])],
      appliedOperationIds: [...session.appliedOperationIds, command.operationId],
      updatedAt: command.now,
    };
  }

  if (session.status !== 'active') return session;

  if (command.type === 'insert') {
    const letter = command.letter.toLowerCase();
    if (!/^[a-z]$/.test(letter)) return session;
    if (session.removedLetters.includes(letter)) return session;
    if (session.draft.length >= currentAnswer(session).length) return session;
    return {
      ...session,
      draft: `${session.draft}${letter}`,
      rejection: null,
      updatedAt: command.now,
    };
  }

  if (command.type === 'delete') {
    if (!session.draft) return session;
    return {
      ...session,
      draft: session.draft.slice(0, -1),
      rejection: null,
      updatedAt: command.now,
    };
  }

  const rejection = validateDraft(session, command.sanctionedWords);
  if (rejection) {
    return { ...session, rejection, updatedAt: command.now };
  }

  const answer = currentAnswer(session);
  const tiles = scoreGuess(answer, session.draft);
  const acceptedRow: GuessRow = {
    id: `${session.id}:${session.puzzleIndex}:${acceptedRowsForCurrentPuzzle(session).length}`,
    puzzleIndex: session.puzzleIndex,
    guess: session.draft,
    tiles,
    kind: 'accepted',
    acceptedAt: command.now,
  };
  const rows = [...session.rows, acceptedRow];
  const solved = session.draft === answer;
  const finalPuzzle = session.puzzleIndex === session.answers.length - 1;
  const attempts = acceptedRowsForCurrentPuzzle({
    ...session,
    rows,
  }).length;
  const budget =
    session.settings.mode === 'go'
      ? playableAttemptBudget(session.puzzleIndex) + session.continuationCount
      : 6 + session.continuationCount;

  let status: GameStatus = 'active';
  let holdUntil: string | null = null;
  if (solved && finalPuzzle) status = 'won';
  else if (solved) {
    status = 'holding';
    holdUntil = new Date(Date.parse(command.now) + 2_000).toISOString();
  } else if (attempts >= budget) status = 'lost';

  return {
    ...session,
    rows,
    draft: '',
    status,
    rejection: null,
    holdUntil,
    updatedAt: command.now,
  };
}

export function createGameSession(input: {
  id: string;
  ownerNamespace: string;
  settings: GameSettings;
  answers: string[];
  now: string;
}): GameSession {
  const settingsError = validateSettings(input.settings);
  if (settingsError) throw new Error(settingsError);
  const expectedAnswers = input.settings.mode === 'go' ? input.settings.goCount : 1;
  if (input.answers.length !== expectedAnswers) {
    throw new Error('Answer count does not match the selected mode.');
  }
  if (
    input.answers.some(
      (answer) => answer.length !== input.settings.length || !/^[a-z]+$/.test(answer),
    )
  ) {
    throw new Error('Answers do not match the selected word length.');
  }
  return {
    schemaVersion: 1,
    id: input.id,
    ownerNamespace: input.ownerNamespace,
    settings: input.settings,
    answers: [...input.answers],
    puzzleIndex: 0,
    rows: [],
    draft: '',
    status: 'active',
    rejection: null,
    holdUntil: null,
    continuationCount: 0,
    revealedPositions: {},
    removedLetters: [],
    appliedOperationIds: [],
    answerRevealed: false,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function completionPercentage(session: GameSession): number {
  const currentRows = session.rows.filter(
    (row) => row.kind === 'accepted' && row.puzzleIndex === session.puzzleIndex,
  );
  let best = 0;
  for (const row of currentRows) {
    const correct = row.tiles.filter((tile) => tile.state === 'correct').length;
    best = Math.max(best, Math.floor((correct / session.settings.length) * 100));
  }
  return best;
}
