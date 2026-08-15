/*
 * The deterministic content behind the Help figures, as pure data.
 *
 * Every evidence colour, keyboard state and price here is COMPUTED by the functions the
 * game itself runs — `scoreGuess`, `deriveKeyboardEvidence`, `playableAttemptBudget`,
 * `continuationCost`. None of it is written out by hand. That is the whole reason these
 * builders are a separate, DOM-free module: a figure that teaches the rules must not be
 * able to drift from them, and this file can be unit-tested to prove it has not.
 *
 * The word sequences were designed, then checked against `scoreGuess`. The first COMBAT
 * sequence attempted had two blunders in it — one guess moved a letter off a proved green
 * position, another reused a letter already ruled out — which is exactly the sort of thing
 * that is invisible when tiles are coloured by hand.
 */
import { deriveKeyboardEvidence, playableAttemptBudget, scoreGuess } from '@/domain/game';
import type { EvidenceState, Tile } from '@/domain/game';
import { continuationCost } from '@/domain/economy';

export interface FigureTile {
  letter: string;
  state: EvidenceState | 'draft';
  revealed?: boolean;
}

export interface FigureRow {
  tiles: FigureTile[];
  meta?: string;
  seed?: boolean;
  draft?: boolean;
}

export interface Frame {
  rows: FigureRow[];
  note: string;
  hold: number;
  /** COMBAT only: which side is on move, so the turn marker can follow it. */
  seat?: 0 | 1;
  /** COMBAT and Remove: one evidence object, rendered by every keyboard in the figure. */
  evidence?: Record<string, EvidenceState>;
  /** Tool figures: whether the tool button is mid-press on this frame. */
  firing?: boolean;
  /**
   * The key struck on this frame — a letter, or `submit` on the beat a guess resolves.
   * Rendered only by the keyboard of the side on move, so the two keyboards read as
   * belonging to two different people rather than mirroring each other.
   */
  pressed?: string;
  /** Continue only: the terminal panel copy, when the board has run out. */
  result?: string;
}

/*
 * One knob per beat. Pacing is data, so tuning it is a data change rather than a code
 * change. A guess lands in roughly 1.5s: five letters typed, a settle, then a hold —
 * inside the "one guess every 1.5 to 2 seconds" the owner asked for. PUZZLE_HOLD is not
 * invented; 2000ms is the hold the real GO chain uses between puzzles.
 */
export const TYPE_MS = 110;
export const SETTLE_MS = 260;
export const ROW_HOLD = 700;
export const HANDOFF_MS = 520;
export const PUZZLE_HOLD = 2000;
export const TOOL_MS = 900;

const asFigureTiles = (tiles: readonly Tile[]): FigureTile[] =>
  tiles.map((tile) => ({ letter: tile.letter, state: tile.state }));

const blankTiles = (length: number): FigureTile[] =>
  Array.from({ length }, () => ({ letter: '', state: 'draft' as const }));

const draftTiles = (
  text: string,
  length: number,
  revealedIndex = -1,
  revealedLetter = '',
): FigureTile[] =>
  Array.from({ length }, (_unused, index) => ({
    letter: index === revealedIndex ? revealedLetter : (text[index] ?? ''),
    state: 'draft' as const,
    ...(index === revealedIndex ? { revealed: true } : {}),
  }));

/* ------------------------------------------------------------------ W5.2 GO chain --- */

export const GO_CHAIN = ['crane', 'plate', 'stone', 'shore', 'stain'] as const;
export const GO_PLAYS: ReadonlyArray<readonly string[]> = [
  ['slate', 'brace', 'crane'],
  ['shale', 'plate'],
  ['shone', 'stone'],
  ['swore', 'shore'],
  ['stand', 'stain'],
];

/**
 * A real solo GO playthrough: five letters, five puzzles, eleven guesses of which six are
 * wrong, ending in a win on the last attempt of the last puzzle.
 *
 * The board never changes height. `playableAttemptBudget` is `max(2, 6 - index)` and
 * puzzle *i* carries *i* seeded rows that cost no attempt, so every puzzle shows exactly
 * six entries — 0+6, 1+5, 2+4, 3+3, 4+2. The squeeze from six fresh attempts down to two
 * attempts behind four seeded rows is the thing this figure teaches.
 */
export function buildGoFrames(): Frame[] {
  const frames: Frame[] = [];
  GO_CHAIN.forEach((answer, puzzle) => {
    const slots = puzzle + playableAttemptBudget(puzzle);
    const seeds: FigureRow[] = GO_CHAIN.slice(0, puzzle).map((word, index) => ({
      tiles: asFigureTiles(scoreGuess(answer, word)),
      meta: `seed ${index + 1}`,
      seed: true,
    }));
    const played: FigureRow[] = [];

    const blanks = Object.freeze(blankTiles(answer.length));
    const compose = (draft: string | null): FigureRow[] => {
      const rows = [...seeds, ...played];
      if (draft !== null && rows.length < slots) {
        rows.push({
          tiles: draftTiles(draft, answer.length),
          draft: true,
          meta: `${rows.length + 1}`,
        });
      }
      while (rows.length < slots) rows.push({ tiles: blanks as FigureTile[], meta: '' });
      return rows;
    };

    frames.push({
      rows: compose(''),
      note: puzzle
        ? `Puzzle ${puzzle + 1} of 5 · ${puzzle} seeded row${puzzle > 1 ? 's' : ''} carried forward`
        : 'Puzzle 1 of 5 · six attempts, nothing to go on',
      hold: puzzle ? PUZZLE_HOLD : ROW_HOLD,
    });

    for (const guess of GO_PLAYS[puzzle] ?? []) {
      for (let n = 1; n <= guess.length; n += 1) {
        frames.push({ rows: compose(guess.slice(0, n)), note: '', hold: TYPE_MS });
      }
      const tiles = scoreGuess(answer, guess);
      played.push({ tiles: asFigureTiles(tiles), meta: `${seeds.length + played.length + 1}` });
      const solved = tiles.every((tile) => tile.state === 'correct');
      const left = playableAttemptBudget(puzzle) - played.length;
      frames.push({
        rows: compose(null),
        note: solved
          ? puzzle === GO_CHAIN.length - 1
            ? 'Chain complete. Five puzzles, one run.'
            : `${guess.toUpperCase()} solved — it becomes a seeded row in the next puzzle.`
          : `${guess.toUpperCase()} — ${left} attempt${left === 1 ? '' : 's'} left`,
        hold: solved ? PUZZLE_HOLD : ROW_HOLD + SETTLE_MS,
      });
    }
  });
  return frames;
}

/* -------------------------------------------------------------------- W5.4 COMBAT --- */

export const COMBAT_ANSWER = 'waste';
export const COMBAT_SEQUENCE = [
  'guide',
  'flake',
  'caste',
  'haste',
  'paste',
  'baste',
  'taste',
  'waste',
] as const;
export const COMBAT_NAMES = ['Nova', 'Rook'] as const;

/**
 * A COMBAT match that does not end at row six.
 *
 * Two exploratory guesses, a breakthrough at row three, then a five-row grind through the
 * `_aste` family ending in a win on row eight — nine visible slots by the end, because the
 * transcript always shows `max(6, rows + 1)`. That extension IS the lesson.
 *
 * Note row seven: TASTE puts a T at index 0, where the answer has a W, so that tile scores
 * absent — yet the shared keyboard keeps T green, because `mergeEvidence` ranks `correct`
 * above `absent` and evidence only ever improves. Drawing this figure by hand would almost
 * certainly have got that wrong.
 *
 * The keyboard evidence is computed ONCE per frame and rendered by both keyboards. Two
 * keyboards that read from one object cannot disagree, which is the shared-evidence point
 * of the whole figure expressed in code rather than in a caption.
 */
export function buildCombatFrames(): Frame[] {
  const frames: Frame[] = [];
  const rows: Array<{ tiles: Tile[] }> = [];
  /*
   * Played rows and the derived keyboard evidence are built ONCE and then shared by
   * reference across every later frame. That is not micro-optimisation: a guess takes five
   * typing frames, and without stable references React re-renders 45 tiles and 104 keys on
   * each of them. The first version of this figure did, and it pushed the canonical-route
   * walk from nine seconds to thirty-five. Only the draft row changes while a player types.
   */
  const playedRows: FigureRow[] = [];
  const blanks = Object.freeze(blankTiles(COMBAT_ANSWER.length));
  let evidence = deriveKeyboardEvidence(rows);

  const push = (draft: string, seat: 0 | 1, note: string, hold: number, pressed?: string) => {
    const visible = Math.max(6, rows.length + 1);
    const composed: FigureRow[] = [...playedRows];
    if (composed.length < visible) {
      composed.push({
        tiles: draftTiles(draft, COMBAT_ANSWER.length),
        draft: true,
        meta: `${String(composed.length + 1).padStart(2, '0')} ${COMBAT_NAMES[seat]}`,
      });
    }
    while (composed.length < visible) composed.push({ tiles: blanks as FigureTile[], meta: '' });
    frames.push({ rows: composed, seat, evidence, note, hold, ...(pressed ? { pressed } : {}) });
  };

  push(
    '',
    0,
    `${COMBAT_NAMES[0]} opens. Six rows to start — watch what happens after that.`,
    ROW_HOLD,
  );

  COMBAT_SEQUENCE.forEach((guess, index) => {
    const seat = (index % 2) as 0 | 1;
    // Each typing frame presses the letter it just added.
    for (let n = 1; n <= guess.length; n += 1) {
      push(guess.slice(0, n), seat, '', TYPE_MS, guess[n - 1]);
    }
    /*
     * A beat of its own for SUBMIT, before the row resolves. It cannot ride the resolve
     * frame: that frame has already handed the turn to the other player, so the press
     * would light the wrong keyboard. Here the word is complete, SUBMIT is struck, and the
     * evidence has not landed yet — which is the order it happens in.
     */
    push(guess, seat, '', SETTLE_MS, 'submit');
    rows.push({ tiles: scoreGuess(COMBAT_ANSWER, guess) });
    playedRows.push({
      tiles: asFigureTiles(rows[rows.length - 1]!.tiles),
      meta: `${String(rows.length).padStart(2, '0')} ${COMBAT_NAMES[(rows.length - 1) % 2]}`,
    });
    evidence = deriveKeyboardEvidence(rows);
    const solved = guess === COMBAT_ANSWER;
    const note = solved
      ? `${COMBAT_NAMES[seat]} wins on row ${index + 1}. Eight guesses — a COMBAT board has no last row.`
      : index === 5
        ? 'Row six. In Wordle the game would be over. The board just extends.'
        : index === 6
          ? 'TASTE puts T in the wrong place — but T stays green on both keyboards. Evidence only improves.'
          : `Both keyboards update from the same row. ${COMBAT_NAMES[1 - seat]} is up.`;
    push(
      '',
      (1 - seat) as 0 | 1,
      note,
      solved
        ? PUZZLE_HOLD
        : ROW_HOLD + (index === 5 || index === 6 ? SETTLE_MS + HANDOFF_MS : HANDOFF_MS),
    );
  });
  return frames;
}

/* --------------------------------------------------------------------- W5.5 tools --- */

export const REVEAL_ANSWER = 'waste';
export const REVEAL_OPENER = 'crane';

/**
 * Reveal. Row one scores exactly one green and one amber, as the owner specified.
 *
 * The revealed letter lands in the DRAFT row with a dashed outline, not as a green
 * evidence tile — that is what the game actually does, because a bought letter is not
 * evidence you earned. The owner reviewed both readings and locked in the faithful one.
 */
export function buildRevealFrames(): Frame[] {
  const row1 = asFigureTiles(scoreGuess(REVEAL_ANSWER, REVEAL_OPENER));
  const compose = (revealedIndex: number): FigureRow[] => [
    { tiles: row1, meta: '01' },
    {
      tiles: draftTiles(
        '',
        REVEAL_ANSWER.length,
        revealedIndex,
        REVEAL_ANSWER[revealedIndex] ?? '',
      ),
      draft: true,
      meta: '02',
    },
  ];
  return [
    {
      rows: compose(-1),
      note: 'One row in. E is placed, S is somewhere else.',
      hold: ROW_HOLD + SETTLE_MS,
    },
    { rows: compose(-1), note: 'Spend the coins.', hold: TOOL_MS, firing: true },
    {
      rows: compose(0),
      note: 'W is locked into position 1 of your next guess — outlined, not colored. You bought it, so it is not evidence you earned.',
      hold: PUZZLE_HOLD,
    },
  ];
}

/** The five letters Remove strikes out. Fixed here so the figure is deterministic. */
export const REMOVE_LETTERS = ['b', 'j', 'q', 'v', 'z'] as const;

/**
 * Remove. The caption says FIVE deliberately: `selectIncorrectLettersToRemove` slices
 * five, and it also skips letters already in your draft. "Removes all the wrong letters"
 * would promise more than the tool delivers.
 */
export function buildRemoveFrames(): Frame[] {
  const evidence = deriveKeyboardEvidence([{ tiles: scoreGuess(REVEAL_ANSWER, REVEAL_OPENER) }]);
  const after: Record<string, EvidenceState> = { ...evidence };
  for (const letter of REMOVE_LETTERS) after[letter] = 'removed';
  return [
    { rows: [], evidence, note: 'A keyboard part-way through a game.', hold: ROW_HOLD + SETTLE_MS },
    { rows: [], evidence, note: 'Spend the coins.', hold: TOOL_MS, firing: true },
    {
      rows: [],
      evidence: after,
      note: 'Five letters that cannot be in the word are struck out — not every wrong letter, five of them.',
      hold: PUZZLE_HOLD,
    },
  ];
}

export interface CalendarDay {
  day: number;
  label: string;
  future: boolean;
  target: boolean;
  selected: boolean;
  unlocked: boolean;
}

export const DAILY_TARGET = 12;
export const DAILY_TODAY = 23;

/** Past Daily. A month grid, one locked date, one unlock. */
export function buildDailyFrames(): Array<Frame & { days: CalendarDay[] }> {
  const month = (selected: boolean, unlocked: boolean): CalendarDay[] =>
    Array.from({ length: 30 }, (_unused, index) => {
      const day = index + 1;
      const target = day === DAILY_TARGET;
      return {
        day,
        future: day > DAILY_TODAY,
        target,
        selected: target && selected,
        unlocked: target && unlocked,
        label: target
          ? unlocked
            ? 'Ready'
            : 'Locked'
          : day === DAILY_TODAY
            ? 'Today'
            : day > DAILY_TODAY
              ? ''
              : 'Done',
      };
    });
  return [
    {
      rows: [],
      days: month(false, false),
      note: 'A month of Solo Daily. The 12th was never played.',
      hold: ROW_HOLD + SETTLE_MS,
    },
    { rows: [], days: month(true, false), note: 'Pick it.', hold: TOOL_MS },
    { rows: [], days: month(true, false), note: 'Spend the coins.', hold: TOOL_MS, firing: true },
    {
      rows: [],
      days: month(true, true),
      note: 'Unlocked. The past Daily is playable — the same puzzle everyone else got that day.',
      hold: PUZZLE_HOLD,
    },
  ];
}

export const CONTINUE_ROWS = ['guide', 'flake', 'caste', 'haste', 'paste', 'baste'] as const;

/**
 * Continue. Six rows used, the sixth one letter away, then a seventh row opens.
 *
 * The price is CALCULATED, never written: the best row has four of five correct, which is
 * 80% completion, and `continuationCost` returns 4 coins for that board. If the economy
 * ever changes, this figure changes with it instead of lying.
 */
export function continueFigurePrice(): number {
  const best = Math.max(
    ...CONTINUE_ROWS.map(
      (guess) => scoreGuess(REVEAL_ANSWER, guess).filter((tile) => tile.state === 'correct').length,
    ),
  );
  return continuationCost({
    wordLength: REVEAL_ANSWER.length,
    completionPercentage: Math.round((best / REVEAL_ANSWER.length) * 100),
    continuationCount: 0,
  });
}

export function buildContinueFrames(): Frame[] {
  const rows: FigureRow[] = CONTINUE_ROWS.map((guess, index) => ({
    tiles: asFigureTiles(scoreGuess(REVEAL_ANSWER, guess)),
    meta: String(index + 1).padStart(2, '0'),
  }));
  const seventh: FigureRow = {
    tiles: draftTiles('', REVEAL_ANSWER.length),
    draft: true,
    meta: '07',
  };
  return [
    { rows, note: 'Six rows used. BASTE was one letter away.', hold: ROW_HOLD + SETTLE_MS },
    {
      rows,
      note: 'In Solo the game would end here.',
      hold: PUZZLE_HOLD,
      result: 'No attempts remain',
    },
    { rows, note: 'Spend the coins.', hold: TOOL_MS, firing: true, result: 'No attempts remain' },
    {
      rows: [...rows, seventh],
      note: 'Row seven. The price rises each time, and depends how close you already are.',
      hold: PUZZLE_HOLD,
    },
  ];
}
