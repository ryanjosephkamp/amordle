import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  completionPercentage,
  createGameSession,
  deriveKeyboardEvidence,
  derivePuzzleKeyboardEvidence,
  hardModeViolationForEvidence,
  playableAttemptBudget,
  reduceGame,
  scoreGuess,
  validateSettings,
} from '@/domain/game';

const time = '2026-07-27T12:00:00.000Z';

describe('canonical game rules', () => {
  it('scores duplicate letters with a two-pass remaining-count algorithm', () => {
    expect(scoreGuess('allee', 'eagle').map((tile) => tile.state)).toEqual([
      'present',
      'present',
      'absent',
      'present',
      'correct',
    ]);
    expect(scoreGuess('civic', 'cacao').map((tile) => tile.state)).toEqual([
      'correct',
      'absent',
      'present',
      'absent',
      'absent',
    ]);
  });

  it('never awards more positive copies of a letter than the answer contains', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', 'b', 'c'), { minLength: 2, maxLength: 35 }),
        fc.array(fc.constantFrom('a', 'b', 'c'), { minLength: 2, maxLength: 35 }),
        (answerLetters, guessLetters) => {
          fc.pre(answerLetters.length === guessLetters.length);
          const answer = answerLetters.join('');
          const guess = guessLetters.join('');
          const result = scoreGuess(answer, guess);
          for (const letter of ['a', 'b', 'c']) {
            const positive = result.filter(
              (tile) => tile.letter === letter && tile.state !== 'absent',
            ).length;
            expect(positive).toBeLessThanOrEqual(
              answerLetters.filter((candidate) => candidate === letter).length,
            );
          }
        },
      ),
    );
  });

  it('keeps the strongest scored keyboard evidence and overlays removed keys last', () => {
    const evidence = deriveKeyboardEvidence(
      [
        {
          id: 'one',
          kind: 'accepted',
          guess: 'allee',
          puzzleIndex: 0,
          tiles: [
            { letter: 'a', state: 'absent' },
            { letter: 'l', state: 'absent' },
            { letter: 'l', state: 'present' },
            { letter: 'e', state: 'present' },
            { letter: 'e', state: 'correct' },
          ],
          acceptedAt: time,
        },
      ],
      new Set(['e', 'z']),
    );

    expect(evidence.a).toBe('absent');
    expect(evidence.l).toBe('present');
    expect(evidence.e).toBe('removed');
    expect(evidence.z).toBe('removed');
    expect(evidence.q).toBe('unknown');
  });

  it('derives keyboard evidence only from the visible GO puzzle and its rescored seeds', () => {
    const evidence = derivePuzzleKeyboardEvidence({
      currentPuzzleIndex: 1,
      moves: [
        {
          puzzleIndex: 0,
          tiles: [
            { letter: 'a', state: 'correct' },
            { letter: 'x', state: 'absent' },
          ],
        },
        {
          puzzleIndex: 1,
          tiles: [
            { letter: 'b', state: 'present' },
            { letter: 'x', state: 'present' },
          ],
        },
      ],
      seededRows: [
        {
          tiles: [
            { letter: 'a', state: 'absent' },
            { letter: 'c', state: 'correct' },
          ],
        },
      ],
      removed: new Set(['c']),
    });

    expect(evidence.a).toBe('absent');
    expect(evidence.b).toBe('present');
    expect(evidence.x).toBe('present');
    expect(evidence.c).toBe('removed');
  });

  it('enforces settings and decreasing GO attempt budgets at boundary lengths', () => {
    for (const length of [2, 5, 7, 10, 35]) {
      expect(
        validateSettings({
          mode: 'og',
          length,
          difficulty: 'standard',
          hardMode: false,
          goCount: 1,
        }),
      ).toBeNull();
    }
    expect(playableAttemptBudget(0)).toBe(6);
    expect(playableAttemptBudget(4)).toBe(2);
    expect(playableAttemptBudget(30)).toBe(2);
  });

  it('uses one reducer for rejected, accepted, terminal, continuation, and tool commands', () => {
    let session = createGameSession({
      id: 'practice',
      ownerNamespace: 'guest',
      settings: {
        mode: 'og',
        length: 5,
        difficulty: 'standard',
        hardMode: false,
        goCount: 1,
      },
      answers: ['crane'],
      now: time,
    });
    session = reduceGame(session, { type: 'insert', letter: 'x', now: time });
    session = reduceGame(session, {
      type: 'submit',
      sanctionedWords: new Set(['crane']),
      now: time,
    });
    expect(session.rejection).toBe('Enter a 5-letter word.');
    session = reduceGame(session, { type: 'delete', now: time });
    for (const letter of 'crane') {
      session = reduceGame(session, { type: 'insert', letter, now: time });
    }
    session = reduceGame(session, {
      type: 'submit',
      sanctionedWords: new Set(['crane']),
      now: time,
    });
    expect(session.status).toBe('won');
    expect(completionPercentage(session)).toBe(100);
  });

  it('persists a solved GO board for a two-second hold and seeds the next board', () => {
    let session = createGameSession({
      id: 'go',
      ownerNamespace: 'guest',
      settings: {
        mode: 'go',
        length: 2,
        difficulty: 'standard',
        hardMode: false,
        goCount: 5,
      },
      answers: ['at', 'to', 'on', 'no', 'in'],
      now: time,
    });
    for (const letter of 'at') {
      session = reduceGame(session, { type: 'insert', letter, now: time });
    }
    session = reduceGame(session, {
      type: 'submit',
      sanctionedWords: new Set(['at']),
      now: time,
    });
    expect(session.status).toBe('holding');
    expect(reduceGame(session, { type: 'advance', now: time })).toBe(session);
    session = reduceGame(session, {
      type: 'advance',
      now: '2026-07-27T12:00:02.000Z',
    });
    expect(session.puzzleIndex).toBe(1);
    expect(session.rows.find((row) => row.kind === 'seeded')?.guess).toBe('at');
  });

  it('enforces Hard Mode fixed positions, multiplicity, and ruled-out letters', () => {
    const evidence = [{ tiles: scoreGuess('eerie', 'eagle') }];
    expect(
      hardModeViolationForEvidence({
        rows: evidence,
        enabled: true,
        guess: 'early',
      }),
    ).toContain('position 5');
    expect(
      hardModeViolationForEvidence({
        rows: [
          {
            tiles: [
              { letter: 's', state: 'present' },
              { letter: 's', state: 'present' },
              { letter: 'a', state: 'absent' },
              { letter: 'y', state: 'absent' },
              { letter: 'x', state: 'absent' },
            ],
          },
        ],
        enabled: true,
        guess: 'satin',
      }),
    ).toContain('at least');
  });
});
