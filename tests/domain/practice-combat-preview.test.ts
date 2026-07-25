import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  PRACTICE_COMBAT_PREVIEW_CAPABILITIES,
  SUPPORTED_PRACTICE_COMBAT_CLOCKS_MS,
  createPracticeCombatPreview,
  parsePracticeCombatPreviewConfig,
  practiceCombatAttemptBudget,
  practiceCombatEvidence,
  practiceCombatHoldRemainingMs,
  practiceCombatPlayerPoints,
  practiceCombatPriorEvidence,
  reducePracticeCombatPreview,
  type PracticeCombatPreviewAction,
  type PracticeCombatPreviewConfig,
  type PracticeCombatPreviewState,
} from '../../src/domain/practice-combat-preview';

const NOW = '2026-07-23T12:00:00.000Z';
const VALID = new Set(['aa', 'ab', 'ac', 'ad', 'ae', 'bb', 'cc', 'allee', 'apple', 'eagle']);

const ogConfig: PracticeCombatPreviewConfig = {
  mode: 'og',
  wordLength: 2,
  difficulty: 'standard',
  hardMode: false,
  puzzleCount: 1,
  timeLimitMs: null,
};

const goConfig: PracticeCombatPreviewConfig = {
  mode: 'go',
  wordLength: 2,
  difficulty: 'expert',
  hardMode: false,
  puzzleCount: 5,
  timeLimitMs: null,
};

function create(
  config: PracticeCombatPreviewConfig = ogConfig,
  answers: readonly string[] = ['aa'],
): PracticeCombatPreviewState {
  return createPracticeCombatPreview({
    id: 'preview-1',
    config,
    players: [{ displayName: 'Claudine' }, { displayName: 'Kiki' }],
    answers,
    now: NOW,
  });
}

function action(
  state: PracticeCombatPreviewState,
  input:
    | { readonly type: 'submit'; readonly actor: 'left' | 'right'; readonly guess: string }
    | { readonly type: 'cancel'; readonly actor: 'left' | 'right' }
    | { readonly type: 'forfeit'; readonly actor: 'left' | 'right' }
    | { readonly type: 'timeout'; readonly actor: 'left' | 'right' }
    | { readonly type: 'advance-hold' },
  actionId: string,
  now = NOW,
): PracticeCombatPreviewAction {
  return {
    ...input,
    actionId,
    expectedRevision: state.revision,
    expectedMoveCount: state.moves.length,
    now,
  };
}

function submit(
  state: PracticeCombatPreviewState,
  actor: 'left' | 'right',
  guess: string,
  actionId: string,
  now = NOW,
): PracticeCombatPreviewState {
  const reduced = reducePracticeCombatPreview(
    state,
    action(state, { type: 'submit', actor, guess }, actionId, now),
    { validGuesses: VALID },
  );
  expect(reduced.ok).toBe(true);
  if (!reduced.ok) throw new Error(reduced.message);
  return reduced.state;
}

describe('Practice COMBAT preview configuration', () => {
  it('accepts every integer word length from 2 through 35', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 35 }), (wordLength) => {
        expect(parsePracticeCombatPreviewConfig({ ...ogConfig, wordLength }).wordLength).toBe(
          wordLength,
        );
      }),
    );
  });

  it('rejects fractional and out-of-range lengths without requesting gameplay data', () => {
    for (const wordLength of [1, 1.5, 35.5, 36, Number.NaN]) {
      expect(() => parsePracticeCombatPreviewConfig({ ...ogConfig, wordLength })).toThrow();
    }
  });

  it('requires one OG puzzle and 5, 7, or 10 GO puzzles', () => {
    expect(parsePracticeCombatPreviewConfig(ogConfig).puzzleCount).toBe(1);
    for (const puzzleCount of [5, 7, 10] as const) {
      expect(parsePracticeCombatPreviewConfig({ ...goConfig, puzzleCount }).puzzleCount).toBe(
        puzzleCount,
      );
    }
    expect(() => parsePracticeCombatPreviewConfig({ ...ogConfig, puzzleCount: 5 })).toThrow(
      /OG uses one/i,
    );
    expect(() => parsePracticeCombatPreviewConfig({ ...goConfig, puzzleCount: 1 })).toThrow(
      /Practice GO/i,
    );
  });

  it('accepts only the shell-supported Practice clock choices', () => {
    expect(
      parsePracticeCombatPreviewConfig({ ...ogConfig, timeLimitMs: null }).timeLimitMs,
    ).toBeNull();
    for (const timeLimitMs of SUPPORTED_PRACTICE_COMBAT_CLOCKS_MS) {
      expect(parsePracticeCombatPreviewConfig({ ...ogConfig, timeLimitMs }).timeLimitMs).toBe(
        timeLimitMs,
      );
    }
    for (const timeLimitMs of [0, 45_000, 3_600_001]) {
      expect(() => parsePracticeCombatPreviewConfig({ ...ogConfig, timeLimitMs })).toThrow();
    }
  });

  it('validates answer count, uniqueness, alphabet, and configured length', () => {
    expect(() => create(goConfig, ['aa'])).toThrow(/unique alphabetic words/i);
    expect(() => create(goConfig, ['aa', 'aa', 'ac', 'ad', 'ae'])).toThrow();
    expect(() => create(goConfig, ['aa', 'ab', 'ac', 'ad', 'a1'])).toThrow();
    expect(() => create(goConfig, ['aa', 'ab', 'ac', 'ad', 'long'])).toThrow();
  });

  it('labels the simulation truthfully and never claims rating authority', () => {
    const state = create();
    expect(state.capabilities).toBe(PRACTICE_COMBAT_PREVIEW_CAPABILITIES);
    expect(state.capabilities).toEqual({
      authority: 'participant-writable-cooperative-preview',
      persistence: 'caller-managed',
      serverAuthoritative: false,
      ratingMutation: 'never',
    });
    expect('rating' in state).toBe(false);
  });
});

describe('shared moves, turns, scoring, and conflicts', () => {
  it('persists one actor-attributed chronological board and alternates turns', () => {
    let state = create();
    state = submit(state, 'left', 'bb', 'move-1');
    expect(state.moves).toHaveLength(1);
    expect(state.moves[0]).toMatchObject({
      sequence: 1,
      actor: 'left',
      puzzleIndex: 0,
      guess: 'bb',
    });
    expect(state.activeActor).toBe('right');
    expect(practiceCombatPlayerPoints(state, 'left')).toBe(0);
    expect(practiceCombatPlayerPoints(state, 'right')).toBe(0);

    const outOfTurn = reducePracticeCombatPreview(
      state,
      action(state, { type: 'submit', actor: 'left', guess: 'aa' }, 'move-2'),
      { validGuesses: VALID },
    );
    expect(outOfTurn).toMatchObject({ ok: false, code: 'not_turn' });
    expect(outOfTurn.state).toBe(state);
  });

  it('debits only the active player match clock and preserves the opponent clock', () => {
    const timed = create({ ...ogConfig, timeLimitMs: 60_000 });
    expect(timed.timeRemainingMs).toEqual({ left: 60_000, right: 60_000 });
    const next = submit(timed, 'left', 'bb', 'timed-move-1', '2026-07-23T12:00:10.000Z');
    expect(next.timeRemainingMs).toEqual({ left: 50_000, right: 60_000 });
    expect(next.activeActor).toBe('right');
    expect(next.turnStartedAt).toBe('2026-07-23T12:00:10.000Z');
    expect(next.deadlineAt).toBe('2026-07-23T12:01:10.000Z');
  });

  it('treats the same action id as an idempotent retry before conflict checks', () => {
    const initial = create();
    const firstAction = action(initial, { type: 'submit', actor: 'left', guess: 'bb' }, 'move-1');
    const first = reducePracticeCombatPreview(initial, firstAction, {
      validGuesses: VALID,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const retry = reducePracticeCombatPreview(first.state, firstAction, {
      validGuesses: VALID,
    });
    expect(retry).toEqual({ ok: true, state: first.state, duplicate: true });
  });

  it('detects optimistic revision and move-count conflicts without mutation', () => {
    const state = create();
    const conflict = reducePracticeCombatPreview(
      state,
      {
        type: 'submit',
        actor: 'left',
        guess: 'aa',
        actionId: 'stale-action',
        expectedRevision: 3,
        expectedMoveCount: 2,
        now: NOW,
      },
      { validGuesses: VALID },
    );
    expect(conflict).toMatchObject({
      ok: false,
      code: 'conflict',
      conflict: {
        expectedRevision: 3,
        actualRevision: 0,
        expectedMoveCount: 2,
        actualMoveCount: 0,
      },
    });
    expect(conflict.state).toBe(state);
  });

  it('requires an explicit validated dictionary context', () => {
    const state = create();
    expect(
      reducePracticeCombatPreview(
        state,
        action(state, { type: 'submit', actor: 'left', guess: 'aa' }, 'move-1'),
      ),
    ).toMatchObject({ ok: false, code: 'dictionary_required' });
  });

  it('uses shared move evidence for cooperative Hard Mode validation', () => {
    const hardMode = create(
      {
        ...ogConfig,
        wordLength: 5,
        hardMode: true,
      },
      ['apple'],
    );
    const afterLeft = submit(hardMode, 'left', 'allee', 'move-1');
    const invalid = reducePracticeCombatPreview(
      afterLeft,
      action(afterLeft, { type: 'submit', actor: 'right', guess: 'eagle' }, 'move-2'),
      { validGuesses: VALID },
    );
    expect(invalid).toMatchObject({
      ok: false,
      code: 'hard_mode_correct_position',
    });
    expect(practiceCombatEvidence(afterLeft)).toHaveLength(1);
  });

  it('finishes OG immediately on an all-correct active-player move', () => {
    const state = submit(create(), 'left', 'aa', 'solve-1');
    expect(state.status).toBe('terminal');
    expect(state.outcome).toMatchObject({
      kind: 'win',
      reason: 'og_solve',
      winnerId: 'left',
      loserId: 'right',
      revealAnswer: true,
    });
    expect(practiceCombatPlayerPoints(state, 'left')).toBe(160);
  });

  it('finishes by points when both cooperative participant budgets are exhausted', () => {
    let state = create();
    for (let index = 0; index < 12; index += 1) {
      const actor = state.activeActor;
      expect(actor).not.toBeNull();
      state = submit(
        state,
        actor!,
        index % 2 === 0 ? 'bb' : 'cc',
        `move-${index}`,
        new Date(timestampMs(NOW) + index + 1).toISOString(),
      );
    }
    expect(state.status).toBe('terminal');
    expect(state.outcome).toEqual({
      kind: 'draw',
      reason: 'points',
      winnerId: null,
      loserId: null,
      revealAnswer: true,
    });
  });
});

describe('GO budgets, evidence, and solved hold', () => {
  it('uses decreasing GO budgets with a two-attempt floor', () => {
    expect(
      Array.from({ length: 10 }, (_, puzzleIndex) =>
        practiceCombatAttemptBudget('go', puzzleIndex, 10),
      ),
    ).toEqual([6, 5, 4, 3, 2, 2, 2, 2, 2, 2]);
    expect(practiceCombatAttemptBudget('og', 0, 1)).toBe(6);
    expect(() => practiceCombatAttemptBudget('go', 5, 5)).toThrow();
  });

  it('holds a solved board for exactly two seconds, then seeds visible non-attempt evidence', () => {
    let state = create(goConfig, ['aa', 'ab', 'ac', 'ad', 'ae']);
    state = submit(state, 'left', 'aa', 'solve-1', NOW);
    expect(state.status).toBe('holding');
    expect(state.hold).toMatchObject({
      solvedPuzzleIndex: 0,
      solvedBy: 'left',
      nextActor: 'right',
      holdStartedAt: NOW,
      autoAdvanceAt: '2026-07-23T12:00:02.000Z',
    });
    expect(practiceCombatHoldRemainingMs(state, '2026-07-23T12:00:01.250Z')).toBe(750);

    const early = reducePracticeCombatPreview(
      state,
      action(state, { type: 'advance-hold' }, 'advance-1', '2026-07-23T12:00:01.999Z'),
    );
    expect(early).toMatchObject({ ok: false, code: 'hold_pending' });
    const advanced = reducePracticeCombatPreview(
      state,
      action(state, { type: 'advance-hold' }, 'advance-1', '2026-07-23T12:00:02.000Z'),
    );
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) return;
    state = advanced.state;
    expect(state).toMatchObject({
      status: 'playing',
      activeActor: 'right',
      currentPuzzleIndex: 1,
      hold: null,
    });
    const evidence = practiceCombatPriorEvidence(state);
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      kind: 'prior-answer',
      sourcePuzzleIndex: 0,
      guess: 'aa',
      countsAsPlayerGuess: false,
      consumesAttemptSlot: true,
    });
    expect(state.players[0].puzzles[1]?.attemptsUsed).toBe(0);
    expect(state.players[1].puzzles[1]?.attemptsUsed).toBe(0);
  });

  it('finishes the final GO puzzle by points without rating mutation', () => {
    let state = create(goConfig, ['aa', 'ab', 'ac', 'ad', 'ae']);
    let time = timestampMs(NOW);
    for (let puzzleIndex = 0; puzzleIndex < 5; puzzleIndex += 1) {
      const actor = state.activeActor;
      expect(actor).not.toBeNull();
      time += 100;
      state = submit(
        state,
        actor!,
        state.answers[puzzleIndex]!,
        `solve-${puzzleIndex}`,
        new Date(time).toISOString(),
      );
      if (puzzleIndex < 4) {
        time += 2_000;
        const advanced = reducePracticeCombatPreview(
          state,
          action(
            state,
            { type: 'advance-hold' },
            `advance-${puzzleIndex}`,
            new Date(time).toISOString(),
          ),
        );
        expect(advanced.ok).toBe(true);
        if (!advanced.ok) return;
        state = advanced.state;
      }
    }
    expect(state.status).toBe('terminal');
    expect(state.outcome).toMatchObject({ reason: 'points', revealAnswer: true });
    expect(state.capabilities.ratingMutation).toBe('never');
  });
});

describe('cancellation, forfeit, timeout, and terminal outcomes', () => {
  it('treats pre-guess cancellation and pre-guess forfeit as no-result cancellation', () => {
    for (const type of ['cancel', 'forfeit'] as const) {
      const state = create();
      const reduced = reducePracticeCombatPreview(
        state,
        action(state, { type, actor: 'right' }, `${type}-1`),
      );
      expect(reduced.ok).toBe(true);
      if (!reduced.ok) continue;
      expect(reduced.state).toMatchObject({
        status: 'cancelled',
        activeActor: null,
        outcome: {
          kind: 'cancelled',
          reason: 'cancellation',
          winnerId: null,
          loserId: null,
          revealAnswer: false,
        },
      });
    }
  });

  it('uses post-start forfeit precedence and rejects post-start cancellation', () => {
    let state = create();
    state = submit(state, 'left', 'bb', 'move-1');
    expect(
      reducePracticeCombatPreview(
        state,
        action(state, { type: 'cancel', actor: 'right' }, 'cancel-1'),
      ),
    ).toMatchObject({ ok: false, code: 'cannot_cancel' });
    const forfeited = reducePracticeCombatPreview(
      state,
      action(state, { type: 'forfeit', actor: 'right' }, 'forfeit-1'),
    );
    expect(forfeited.ok).toBe(true);
    if (!forfeited.ok) return;
    expect(forfeited.state.outcome).toMatchObject({
      kind: 'win',
      reason: 'forfeit',
      winnerId: 'left',
      loserId: 'right',
    });
  });

  it('derives timeout only after the participant-writable preview deadline', () => {
    const state = create({ ...ogConfig, timeLimitMs: 30_000 });
    expect(state.deadlineAt).toBe('2026-07-23T12:00:30.000Z');
    expect(
      reducePracticeCombatPreview(
        state,
        action(state, { type: 'timeout', actor: 'left' }, 'timeout-1', '2026-07-23T12:00:29.999Z'),
      ),
    ).toMatchObject({ ok: false, code: 'timeout_pending' });
    const timedOut = reducePracticeCombatPreview(
      state,
      action(state, { type: 'timeout', actor: 'left' }, 'timeout-1', '2026-07-23T12:00:30.000Z'),
    );
    expect(timedOut.ok).toBe(true);
    if (!timedOut.ok) return;
    expect(timedOut.state.outcome).toMatchObject({
      kind: 'win',
      reason: 'timeout',
      winnerId: 'right',
      loserId: 'left',
    });
  });

  it('does not accept a guess at or after the cooperative clock deadline', () => {
    const state = create({ ...ogConfig, timeLimitMs: 30_000 });
    expect(
      reducePracticeCombatPreview(
        state,
        action(
          state,
          { type: 'submit', actor: 'left', guess: 'aa' },
          'late-guess',
          '2026-07-23T12:00:30.000Z',
        ),
        { validGuesses: VALID },
      ),
    ).toMatchObject({ ok: false, code: 'timeout_pending' });
  });

  it('rejects timeout claims for untimed previews and inactive participants', () => {
    const untimed = create();
    expect(
      reducePracticeCombatPreview(
        untimed,
        action(untimed, { type: 'timeout', actor: 'left' }, 'timeout-1'),
      ),
    ).toMatchObject({ ok: false, code: 'not_timed' });
    const timed = create({ ...ogConfig, timeLimitMs: 30_000 });
    expect(
      reducePracticeCombatPreview(
        timed,
        action(timed, { type: 'timeout', actor: 'right' }, 'timeout-2', '2026-07-23T12:00:30.000Z'),
      ),
    ).toMatchObject({ ok: false, code: 'not_turn' });
  });
});

function timestampMs(value: string): number {
  return Date.parse(value);
}
