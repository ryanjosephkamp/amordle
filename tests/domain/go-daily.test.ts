import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  advanceGoSession,
  createGoSession,
  dailyGoStreamKey,
  goAnswerGenerationVersion,
  restoreGoSession,
  selectDeterministicChain,
  selectSeparatedDailyCombatChains,
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
  it('holds a solved row before explicitly advancing', () => {
    const session = createGoSession({ id: 'go-1', answers, scope: 'practice', now: at });
    const result = submitGoGuess(session, 'apple', new Set(answers), at);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.currentPuzzleIndex).toBe(0);
    expect(result.session.pendingAdvance).toMatchObject({ nextPuzzleIndex: 1 });
    const advanced = advanceGoSession(result.session, at);
    expect(advanced.currentPuzzleIndex).toBe(1);
    expect(advanced.priorAnswers).toEqual(['apple']);
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
