import type { GameSession, GuessRow } from './game';

export interface EncounteredSoloGoEntry {
  puzzleNumber: number;
  word: string;
}

export type EncounteredSoloGoReviewResult =
  | { status: 'available'; entries: EncounteredSoloGoEntry[] }
  | { status: 'unavailable'; reason: 'not-authorized' | 'invalid-session' | 'not-go' };

function isSolvedRow(row: GuessRow, answer: string, puzzleIndex: number): boolean {
  return (
    row.kind === 'accepted' &&
    row.puzzleIndex === puzzleIndex &&
    row.guess === answer &&
    row.tiles.length === answer.length &&
    row.tiles.every((tile, index) => tile.letter === answer[index] && tile.state === 'correct')
  );
}

/**
 * Returns only the terminal GO answers the player has actually encountered.
 * The selector deliberately returns no partial prefix when persisted state is
 * contradictory, because a partial recovery could disclose an unproved word.
 */
export function selectEncounteredSoloGoAnswers(
  session: GameSession,
  lane: 'practice' | 'daily',
): EncounteredSoloGoReviewResult {
  if (session.settings.mode !== 'go') {
    return { status: 'unavailable', reason: 'not-go' };
  }

  const authorized =
    session.status === 'won' ||
    (session.status === 'lost' && (lane === 'daily' || session.answerRevealed));
  if (!authorized) {
    return { status: 'unavailable', reason: 'not-authorized' };
  }

  const expectedCount = session.settings.goCount;
  const answersValid =
    [5, 7, 10].includes(expectedCount) &&
    session.answers.length === expectedCount &&
    new Set(session.answers).size === session.answers.length &&
    session.answers.every(
      (answer) => /^[a-z]+$/.test(answer) && answer.length === session.settings.length,
    );
  const indexValid =
    Number.isInteger(session.puzzleIndex) &&
    session.puzzleIndex >= 0 &&
    session.puzzleIndex < session.answers.length;
  if (!answersValid || !indexValid) {
    return { status: 'unavailable', reason: 'invalid-session' };
  }

  for (let index = 0; index < session.puzzleIndex; index += 1) {
    const answer = session.answers[index];
    if (answer === undefined || !session.rows.some((row) => isSolvedRow(row, answer, index))) {
      return { status: 'unavailable', reason: 'invalid-session' };
    }
  }

  if (session.status === 'won') {
    const answer = session.answers[session.puzzleIndex];
    if (
      session.puzzleIndex !== session.answers.length - 1 ||
      answer === undefined ||
      !session.rows.some((row) => isSolvedRow(row, answer, session.puzzleIndex))
    ) {
      return { status: 'unavailable', reason: 'invalid-session' };
    }
  }

  return {
    status: 'available',
    entries: session.answers.slice(0, session.puzzleIndex + 1).map((word, index) => ({
      puzzleNumber: index + 1,
      word,
    })),
  };
}
