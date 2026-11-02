import { describe, expect, it } from 'vitest';
import { createGameSession, reduceGame } from '@/domain/game';
import type { GameSession } from '@/domain/game';
import { selectEncounteredSoloGoAnswers } from '@/domain/solo-go-review';

const answers = [
  'crane',
  'slate',
  'proud',
  'blink',
  'mover',
  'shard',
  'wince',
  'flock',
  'grape',
  'tuned',
];

function create(count: 5 | 7 | 10): GameSession {
  return createGameSession({
    id: `go-${count}`,
    ownerNamespace: 'guest',
    settings: {
      mode: 'go',
      length: 5,
      difficulty: 'standard',
      hardMode: false,
      goCount: count,
    },
    answers: answers.slice(0, count),
    now: '2026-08-01T20:00:00.000Z',
  });
}

function solveAndAdvance(session: GameSession, index: number): GameSession {
  let next = { ...session, draft: session.answers[index] ?? '' };
  next = reduceGame(next, {
    type: 'submit',
    sanctionedWords: new Set(session.answers),
    now: `2026-08-01T20:00:${String(index * 2).padStart(2, '0')}.000Z`,
  });
  if (next.status === 'holding') {
    next = reduceGame(next, {
      type: 'advance',
      now: next.holdUntil ?? '2026-08-01T20:01:00.000Z',
    });
  }
  return next;
}

function reachPuzzle(count: 5 | 7 | 10, puzzleIndex: number): GameSession {
  let session = create(count);
  for (let index = 0; index < puzzleIndex; index += 1) {
    session = solveAndAdvance(session, index);
  }
  return session;
}

describe('encountered-only Solo GO review', () => {
  for (const count of [5, 7, 10] as const) {
    it(`returns every encountered answer for a ${count}-puzzle win`, () => {
      let session = reachPuzzle(count, count - 1);
      session = solveAndAdvance(session, count - 1);
      expect(session.status).toBe('won');
      expect(selectEncounteredSoloGoAnswers(session, 'practice')).toEqual({
        status: 'available',
        entries: answers.slice(0, count).map((word, index) => ({
          puzzleNumber: index + 1,
          word,
        })),
      });
    });
  }

  it('returns only the reached prefix for an answer-revealed Practice loss', () => {
    let session = reachPuzzle(5, 2);
    session = { ...session, status: 'lost' };
    expect(selectEncounteredSoloGoAnswers(session, 'practice')).toEqual({
      status: 'unavailable',
      reason: 'not-authorized',
    });
    session = reduceGame(session, {
      type: 'reveal-answer',
      now: '2026-08-01T20:10:00.000Z',
    });
    expect(selectEncounteredSoloGoAnswers(session, 'practice')).toEqual({
      status: 'available',
      entries: answers.slice(0, 3).map((word, index) => ({ puzzleNumber: index + 1, word })),
    });
  });

  for (const puzzleIndex of [0, 1, 2, 3, 4]) {
    it(`authorizes a Daily loss on puzzle ${puzzleIndex + 1} without exposing later answers`, () => {
      const session = { ...reachPuzzle(5, puzzleIndex), status: 'lost' as const };
      expect(selectEncounteredSoloGoAnswers(session, 'daily')).toEqual({
        status: 'available',
        entries: answers
          .slice(0, puzzleIndex + 1)
          .map((word, index) => ({ puzzleNumber: index + 1, word })),
      });
    });
  }

  it('fails closed for malformed, contradictory, non-terminal, and OG state', () => {
    const reached = reachPuzzle(5, 2);
    expect(selectEncounteredSoloGoAnswers(reached, 'practice')).toEqual({
      status: 'unavailable',
      reason: 'not-authorized',
    });
    expect(
      selectEncounteredSoloGoAnswers(
        { ...reached, status: 'lost', answerRevealed: true, rows: reached.rows.slice(1) },
        'practice',
      ),
    ).toEqual({ status: 'unavailable', reason: 'invalid-session' });
    expect(
      selectEncounteredSoloGoAnswers({ ...reached, status: 'won', puzzleIndex: 2 }, 'practice'),
    ).toEqual({ status: 'unavailable', reason: 'invalid-session' });
    const og = createGameSession({
      id: 'og',
      ownerNamespace: 'guest',
      settings: {
        mode: 'og',
        length: 5,
        difficulty: 'standard',
        hardMode: false,
        goCount: 1,
      },
      answers: ['crane'],
      now: '2026-08-01T20:00:00.000Z',
    });
    expect(selectEncounteredSoloGoAnswers({ ...og, status: 'lost' }, 'daily')).toEqual({
      status: 'unavailable',
      reason: 'not-go',
    });
  });
});
