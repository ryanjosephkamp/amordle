import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  continueOgSession,
  createOgSession,
  deleteLetter,
  draftWord,
  enterLetter,
  mergeKeyboardEvidence,
  restoreOgSession,
  scoreGuess,
  serializeOgSession,
  setDraftWord,
  submitOgGuess,
  validateGuess,
} from '../../src/domain/game';

const at = '2026-07-21T12:00:00.000Z';

describe('duplicate-aware tile scoring', () => {
  it('consumes unmatched answer letters exactly once', () => {
    expect(scoreGuess('allee', 'apple').map((tile) => tile.state)).toEqual([
      'correct',
      'present',
      'absent',
      'absent',
      'correct',
    ]);
  });

  it('never awards more evidence for a letter than the answer contains', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(...'abc'), minLength: 2, maxLength: 12 }),
        fc.string({ unit: fc.constantFrom(...'abc'), minLength: 2, maxLength: 12 }),
        (guess, answer) => {
          fc.pre(guess.length === answer.length);
          const tiles = scoreGuess(guess, answer);
          for (const letter of 'abc') {
            const awarded = tiles.filter(
              (tile) => tile.letter === letter && tile.state !== 'absent',
            ).length;
            expect(awarded).toBeLessThanOrEqual(answer.split(letter).length - 1);
          }
        },
      ),
    );
  });

  it('retains strongest keyboard evidence', () => {
    const absent = { guess: 'zz', tiles: scoreGuess('zz', 'at'), submittedAt: at };
    const correct = { guess: 'az', tiles: scoreGuess('az', 'at'), submittedAt: at };
    expect(mergeKeyboardEvidence([correct, absent]).a).toBe('correct');
    expect(mergeKeyboardEvidence([absent, correct]).a).toBe('correct');
  });
});

describe('validation and OG state', () => {
  it('applies validation precedence without mutating state', () => {
    const session = createOgSession({
      id: 'g1',
      answer: 'apple',
      scope: 'practice',
      hardMode: true,
      now: at,
    });
    const valid = new Set(['apple', 'allee', 'apply', 'ample', 'algae']);
    const first = submitOgGuess(session, 'allee', valid, { now: at });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const before = JSON.stringify(first.session);
    const wrongLength = submitOgGuess(first.session, 'bad', valid, { now: at });
    expect(wrongLength.ok).toBe(false);
    if (!wrongLength.ok) expect(wrongLength.error.code).toBe('wrong_length');
    const hardViolation = submitOgGuess(first.session, 'algae', valid, { now: at });
    expect(hardViolation.ok).toBe(false);
    if (!hardViolation.ok) expect(hardViolation.error.code).toBe('hard_mode_present_position');
    expect(JSON.stringify(first.session)).toBe(before);
  });

  it('checks dictionary and Hard Mode before terminal state', () => {
    const invalid = validateGuess({
      rawGuess: 'xxxxx',
      wordLength: 5,
      validGuesses: new Set(['apple']),
      hardMode: false,
      evidence: [],
      terminal: true,
    });
    expect(invalid?.code).toBe('not_in_word_list');
    const terminal = validateGuess({
      rawGuess: 'apple',
      wordLength: 5,
      validGuesses: new Set(['apple']),
      hardMode: false,
      evidence: [],
      terminal: true,
    });
    expect(terminal?.code).toBe('terminal');
  });

  it.each([2, 5, 35])('supports %i-letter sessions and all input modalities', (length) => {
    const answer = 'a'.repeat(length);
    let session = createOgSession({ id: `g-${length}`, answer, scope: 'practice', now: at });
    session = enterLetter(session, 'a', at);
    expect(draftWord(session)).toBe('a');
    session = deleteLetter(session, at);
    expect(draftWord(session)).toBe('');
    session = setDraftWord(session, answer.toUpperCase(), at);
    const result = submitOgGuess(session, draftWord(session), new Set([answer]), { now: at });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.status).toBe('won');
  });

  it('loses at the attempt limit, continues once per operation, and round-trips safely', () => {
    let session = createOgSession({
      id: 'loss',
      answer: 'apple',
      scope: 'practice',
      maxAttempts: 1,
      now: at,
    });
    const submitted = submitOgGuess(session, 'allee', new Set(['apple', 'allee']), { now: at });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    session = submitted.session;
    expect(session.status).toBe('lost');
    session = continueOgSession(session, 'continue-1', at);
    expect(session).toMatchObject({ status: 'playing', maxAttempts: 2, continuationCount: 1 });
    expect(continueOgSession(session, 'continue-1', at)).toBe(session);
    const restored = restoreOgSession(serializeOgSession(session));
    expect(restored).toEqual(session);
  });

  it('rejects corrupted scored evidence during restoration', () => {
    const session = createOgSession({ id: 'corrupt', answer: 'apple', scope: 'practice', now: at });
    const submitted = submitOgGuess(session, 'allee', new Set(['apple', 'allee']), { now: at });
    if (!submitted.ok) throw new Error('fixture failed');
    const corrupted = structuredClone(submitted.session) as unknown as {
      guesses: { tiles: { state: string }[] }[];
    };
    const firstTile = corrupted.guesses[0]?.tiles[0];
    if (firstTile) firstTile.state = 'absent';
    expect(restoreOgSession(corrupted)).toBeUndefined();
  });
});
