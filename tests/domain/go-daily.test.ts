import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { scoreGuess } from '../../src/domain/game';
import {
  advanceGoSession,
  autoAdvanceGoSession,
  createGoSession,
  dailyGoStreamKey,
  goAttemptBudget,
  goAutoAdvanceRemainingDelay,
  goAnswerGenerationVersion,
  goPriorSeededEvidence,
  needsGoAttemptPolicyRestart,
  revealGoAnswer,
  restoreGoSession,
  selectDailyGoAnswers,
  selectDeterministicChain,
  selectLegacyDailyGoChain,
  selectSeparatedDailyCombatChains,
  selectUnrankedDailyCombatAnswers,
  serializeGoSession,
  submitGoGuess,
} from '../../src/domain/go';
import {
  advanceDailyClockGuard,
  canAccessDaily,
  createDailyClockGuard,
  isDateKey,
  localDateKey,
  sanitizePastDailyUnlocks,
  utcDateKey,
} from '../../src/domain/daily';

const at = '2026-07-21T12:00:00.000Z';
const answers = ['apple', 'baker', 'cider', 'delta', 'ember'];

describe('GO state and selection', () => {
  it.each([
    [5, [6, 5, 4, 3, 2]],
    [7, [6, 5, 4, 3, 2, 2, 2]],
    [10, [6, 5, 4, 3, 2, 2, 2, 2, 2, 2]],
  ] as const)(
    'allocates the canonical playable attempt budget for %i puzzles',
    (count, expected) => {
      const chain = Array.from({ length: count }, (_, index) => {
        const first = String.fromCharCode(97 + Math.floor(index / 26));
        const second = String.fromCharCode(97 + (index % 26));
        return `${first}${second}aaa`;
      });
      const session = createGoSession({
        id: `go-budget-${count}`,
        answers: chain,
        scope: 'practice',
        now: at,
      });
      expect(session.puzzles.map((puzzle) => puzzle.maxAttempts)).toEqual(expected);
    },
  );

  it('keeps the GO attempt budget non-increasing with a two-attempt floor', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000 }), (index) => {
        expect(goAttemptBudget(index)).toBeGreaterThanOrEqual(2);
        expect(goAttemptBudget(index + 1)).toBeLessThanOrEqual(goAttemptBudget(index));
      }),
    );
    expect(() => goAttemptBudget(-1)).toThrow(RangeError);
    expect(() => goAttemptBudget(1.5)).toThrow(RangeError);
  });

  it('persists a solved hold and auto-advances exactly when its deadline arrives', () => {
    const session = createGoSession({ id: 'go-1', answers, scope: 'practice', now: at });
    const result = submitGoGuess(session, 'apple', new Set(answers), at);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.currentPuzzleIndex).toBe(0);
    expect(result.session.pendingAdvance).toEqual({
      solvedPuzzleIndex: 0,
      nextPuzzleIndex: 1,
      holdStartedAt: at,
      autoAdvanceAt: '2026-07-21T12:00:02.000Z',
    });
    expect(goAutoAdvanceRemainingDelay(result.session, '2026-07-21T12:00:00.750Z')).toBe(1_250);
    expect(autoAdvanceGoSession(result.session, '2026-07-21T12:00:01.999Z')).toBe(result.session);
    const serializedDuringHold = serializeGoSession(result.session);
    const reloaded = restoreGoSession(serializedDuringHold);
    expect(reloaded).toEqual(result.session);
    if (!reloaded) throw new Error('hold fixture failed to restore');
    const advanced = autoAdvanceGoSession(reloaded, '2026-07-21T12:00:02.000Z');
    expect(advanced.currentPuzzleIndex).toBe(1);
    expect(advanced.priorAnswers).toEqual(['apple']);
    expect(advanced.pendingAdvance).toBeUndefined();
    expect(autoAdvanceGoSession(advanced, '2026-07-21T12:00:03.000Z')).toBe(advanced);
  });

  it('cannot reveal or corrupt a solved hold or terminal chain', () => {
    const session = createGoSession({ id: 'go-reveal-guard', answers, scope: 'practice', now: at });
    const result = submitGoGuess(session, 'apple', new Set(answers), at);
    if (!result.ok) throw new Error('reveal guard fixture failed');
    expect(result.session.pendingAdvance).toBeDefined();
    expect(revealGoAnswer(result.session, true)).toBe(result.session);

    let completed = result.session;
    for (let index = 1; index < answers.length; index += 1) {
      completed = advanceGoSession(completed, at);
      const submitted = submitGoGuess(completed, answers[index] ?? '', new Set(answers), at);
      if (!submitted.ok) throw new Error('terminal reveal guard fixture failed');
      completed = submitted.session;
    }
    expect(completed.status).toBe('won');
    expect(revealGoAnswer(completed, true)).toBe(completed);
  });

  it('migrates the earlier solvedAt hold envelope and rejects a poisoned deadline', () => {
    const session = createGoSession({
      id: 'go-hold-migration',
      answers,
      scope: 'practice',
      now: at,
    });
    const result = submitGoGuess(session, 'apple', new Set(answers), at);
    if (!result.ok) throw new Error('hold migration fixture failed');
    const legacy = JSON.parse(serializeGoSession(result.session)) as {
      pendingAdvance: Record<string, unknown>;
    };
    legacy.pendingAdvance = { solvedPuzzleIndex: 0, nextPuzzleIndex: 1, solvedAt: at };
    expect(restoreGoSession(legacy)?.pendingAdvance).toEqual({
      solvedPuzzleIndex: 0,
      nextPuzzleIndex: 1,
      holdStartedAt: at,
      autoAdvanceAt: '2026-07-21T12:00:02.000Z',
    });

    const poisoned = JSON.parse(serializeGoSession(result.session)) as {
      pendingAdvance: { autoAdvanceAt: string };
    };
    poisoned.pendingAdvance.autoAdvanceAt = '2099-01-01T00:00:00.000Z';
    expect(restoreGoSession(poisoned)).toBeUndefined();
  });

  it('completes the chain and preserves serialization', () => {
    let session = createGoSession({ id: 'go-complete', answers, scope: 'practice', now: at });
    const valid = new Set(answers);
    for (let index = 0; index < answers.length; index += 1) {
      const result = submitGoGuess(session, answers[index] ?? '', valid, at);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('fixture failed');
      session = result.session;
      if (session.pendingAdvance) session = advanceGoSession(session, at);
    }
    expect(session.status).toBe('won');
    expect(restoreGoSession(serializeGoSession(session))).toEqual(session);
  });

  it('is deterministic, versioned, and selects without replacement', () => {
    const catalog = [...answers, 'fable', 'grape', 'hotel', 'ivory', 'joker', 'karma', 'lemon'];
    const key = dailyGoStreamKey({ player: 'solo', lane: 'unranked', dateKey: '2026-07-21' });
    const first = selectDeterministicChain(catalog, 10, key);
    const second = selectDeterministicChain([...catalog].reverse(), 10, key);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(10);
    expect(goAnswerGenerationVersion('2026-07-13', 'go')).toBe('v1');
    expect(goAnswerGenerationVersion('2026-07-14', 'go')).toBe('v2');
    expect(goAnswerGenerationVersion('2099-01-01', 'og')).toBe('v1');
  });

  it('uses legacy contiguous Daily GO selection before the cutoff and v2 afterward', () => {
    const catalog = [...answers, 'fable', 'grape', 'hotel', 'ivory', 'joker', 'karma', 'lemon'];
    const legacy = selectDailyGoAnswers({ catalog, dateKey: '2026-07-13' });
    expect(legacy).toEqual({
      answers: selectLegacyDailyGoChain(catalog, '2026-07-13', 5),
      answerGenerationVersion: 'v1',
      source: 'generated',
    });
    expect(
      legacy.answers.every(
        (answer, index) =>
          index === 0 ||
          catalog.indexOf(answer) ===
            (catalog.indexOf(legacy.answers[index - 1] ?? '') + 1) % catalog.length,
      ),
    ).toBe(true);

    const current = selectDailyGoAnswers({ catalog, dateKey: '2026-07-14' });
    expect(current.answerGenerationVersion).toBe('v2');
    expect(current.answers).toHaveLength(5);
    expect(new Set(current.answers).size).toBe(5);
  });

  it('treats stored GO answer arrays as authoritative, including legacy duplicates and order', () => {
    const stored = ['zebra', 'apple', 'zebra', 'delta'];
    expect(
      selectDailyGoAnswers({
        catalog: [...answers].reverse(),
        dateKey: '2099-01-01',
        stored: { answers: stored },
      }),
    ).toEqual({ answers: stored, answerGenerationVersion: 'v1', source: 'stored' });
  });

  it('projects prior answers as scored slot-consuming evidence, not player guesses', () => {
    const first = createGoSession({ id: 'seeded', answers, scope: 'practice', now: at });
    const solved = submitGoGuess(first, 'apple', new Set(answers), at);
    if (!solved.ok) throw new Error('seeded fixture failed');
    const advanced = advanceGoSession(solved.session, '2026-07-21T12:00:02.000Z');
    expect(goPriorSeededEvidence(advanced)).toEqual([
      expect.objectContaining({
        kind: 'prior-answer',
        sourcePuzzleIndex: 0,
        consumesAttemptSlot: true,
        countsAsPlayerGuess: false,
        guess: 'apple',
      }),
    ]);
    expect(advanced.puzzles[1]?.guesses).toHaveLength(0);
    expect(advanced.puzzles[1]?.maxAttempts).toBe(5);
  });

  it('recognizes legacy fixed-budget active chains without corrupting terminal history', () => {
    const current = createGoSession({
      id: 'go-attempt-migration',
      answers,
      scope: 'practice',
      now: at,
    });
    const legacy = structuredClone(current) as unknown as { attemptPolicyVersion?: string };
    delete legacy.attemptPolicyVersion;
    const restored = restoreGoSession(legacy);
    expect(restored?.attemptPolicyVersion).toBe('fixed-v0');
    expect(restored && needsGoAttemptPolicyRestart(restored)).toBe(true);

    const completed = {
      ...restored!,
      status: 'won' as const,
      currentPuzzleIndex: restored!.puzzles.length - 1,
      priorAnswers: restored!.answers.slice(0, -1),
      puzzles: restored!.puzzles.map((puzzle) => ({
        ...puzzle,
        guesses: [
          {
            guess: puzzle.answer,
            tiles: scoreGuess(puzzle.answer, puzzle.answer),
            submittedAt: at,
          },
        ],
        status: 'won' as const,
      })),
    };
    expect(needsGoAttemptPolicyRestart(completed)).toBe(false);
  });

  it('rejects a current-policy session whose stored puzzle budgets were tampered with', () => {
    const session = createGoSession({
      id: 'go-budget-tamper',
      answers,
      scope: 'practice',
      now: at,
    });
    const tampered = {
      ...structuredClone(session),
      puzzles: session.puzzles.map((puzzle, index) =>
        index === 2 ? { ...puzzle, maxAttempts: 6 } : puzzle,
      ),
    };
    expect(restoreGoSession(tampered)).toBeUndefined();
  });

  it('applies carried prior-answer evidence to GO Hard Mode', () => {
    const hard = createGoSession({
      id: 'seeded-hard',
      answers,
      scope: 'practice',
      hardMode: true,
      now: at,
    });
    const solved = submitGoGuess(hard, 'apple', new Set([...answers, 'paper']), at);
    if (!solved.ok) throw new Error('hard seeded fixture failed');
    const advanced = advanceGoSession(solved.session, '2026-07-21T12:00:02.000Z');
    const rejected = submitGoGuess(advanced, 'paper', new Set([...answers, 'paper']), at);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error).toMatchObject({ code: 'hard_mode_absent_letter', letter: 'p' });
    }
  });

  it('separates ranked and unranked Daily chains', () => {
    const catalog = Array.from({ length: 20 }, (_, index) =>
      `a${String(index).padStart(4, 'a')}`.slice(0, 5),
    );
    // Use a valid unique alphabetic catalog instead of numeric fixture words.
    const alpha = 'abcdefghijklmnopqrst'.split('').map((letter) => `${letter}aaaa`);
    const chains = selectSeparatedDailyCombatChains(alpha, '2026-07-21');
    expect(chains.unranked).toHaveLength(5);
    expect(chains.ranked).toHaveLength(5);
    expect(chains.ranked.some((word) => chains.unranked.includes(word))).toBe(false);
    expect(catalog).toHaveLength(20);
  });

  it('selects a stable fixed-five unranked Daily COMBAT lane', () => {
    const catalog = Array.from({ length: 40 }, (_, index) => {
      const left = String.fromCharCode(97 + Math.floor(index / 26));
      const right = String.fromCharCode(97 + (index % 26));
      return `${left}${right}aaa`;
    });
    const og = selectUnrankedDailyCombatAnswers({
      catalog,
      dateKey: '2026-07-24',
      mode: 'og',
    });
    const go = selectUnrankedDailyCombatAnswers({
      catalog,
      dateKey: '2026-07-24',
      mode: 'go',
    });
    expect(og).toHaveLength(1);
    expect(go).toHaveLength(5);
    expect(new Set(go).size).toBe(5);
    expect(
      selectUnrankedDailyCombatAnswers({
        catalog,
        dateKey: '2026-07-24',
        mode: 'go',
      }),
    ).toEqual(go);
  });

  it('selects requested sizes over broad catalogs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 30 }), (count) => {
        const catalog = Array.from({ length: 40 }, (_, index) => {
          const left = String.fromCharCode(97 + Math.floor(index / 26));
          const right = String.fromCharCode(97 + (index % 26));
          return `${left}${right}aaa`;
        });
        const chain = selectDeterministicChain(catalog, count, 'property');
        expect(chain).toHaveLength(count);
        expect(new Set(chain).size).toBe(count);
      }),
    );
  });
});

describe('Daily date authority', () => {
  it('separates local Solo and UTC COMBAT date keys', () => {
    const instant = new Date('2026-07-21T01:30:00.000Z');
    expect(utcDateKey(instant)).toBe('2026-07-21');
    expect(isDateKey(localDateKey(instant))).toBe(true);
  });

  it('sanitizes unlocks and never grants future/corrupt entries', () => {
    const unlocked = sanitizePastDailyUnlocks(
      ['og:2025-01-01', 'go:2026-07-22', 'wat', null, 'go:2024-12-31'],
      '2026-07-21',
    );
    expect(unlocked).toEqual(['og:2025-01-01']);
    expect(
      canAccessDaily({ mode: 'og', dateKey: '2025-01-01', todayKey: '2026-07-21', unlocked }),
    ).toBe(true);
    expect(
      canAccessDaily({ mode: 'go', dateKey: '2025-01-01', todayKey: '2026-07-21', unlocked }),
    ).toBe(false);
  });

  it('clamps large wall-clock jumps while allowing monotonic drift', () => {
    const guard = createDailyClockGuard(1_000_000, 500);
    const normal = advanceDailyClockGuard({ guard, wallMs: 1_001_000, monotonicMs: 1_500 });
    expect(normal).toMatchObject({ grantedWallMs: 1_001_000, clamped: false });
    const jumped = advanceDailyClockGuard({
      guard: normal.guard,
      wallMs: 90_000_000,
      monotonicMs: 2_500,
      maxSkewMs: 1_000,
    });
    expect(jumped).toMatchObject({ grantedWallMs: 1_002_000, clamped: true });
  });
});
