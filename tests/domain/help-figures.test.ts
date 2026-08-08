import { describe, expect, it } from 'vitest';
import {
  buildCombatFrames,
  buildContinueFrames,
  buildGoFrames,
  buildRemoveFrames,
  buildRevealFrames,
  continueFigurePrice,
  COMBAT_ANSWER,
  COMBAT_SEQUENCE,
  GO_CHAIN,
  GO_PLAYS,
  REMOVE_LETTERS,
} from '@/features/support/help-figures/scripts';
import { playableAttemptBudget, scoreGuess } from '@/domain/game';
import type { EvidenceState } from '@/domain/game';

/*
 * W5. The Help figures teach the rules, so they must not be able to contradict them.
 *
 * Everything asserted here is derived by the game's own functions rather than written out,
 * and these tests exist to prove that stays true. They are also the reason the frame
 * builders live in a DOM-free module: the content can be checked without rendering
 * anything.
 *
 * The bar for "a player would read this as a blunder" is two things, and only two, because
 * neither COMBAT nor Solo GO enforces Hard Mode: never move a letter off a position
 * already proved green, and never reuse a letter already proved absent. Requiring full
 * hard-mode consistency would be wrong here — it makes a game converge in about four
 * guesses, which is the opposite of what the COMBAT figure exists to show.
 */

type Rows = ReadonlyArray<{ tiles: ReadonlyArray<{ letter: string; state: EvidenceState }> }>;

function blunder(rows: Rows, guess: string): string | null {
  const green = new Map<number, string>();
  const positive = new Set<string>();
  for (const row of rows) {
    row.tiles.forEach((tile, index) => {
      if (tile.state === 'correct') {
        green.set(index, tile.letter);
        positive.add(tile.letter);
      } else if (tile.state === 'present') positive.add(tile.letter);
    });
  }
  const dead = new Set<string>();
  for (const row of rows) {
    for (const tile of row.tiles) {
      if (tile.state === 'absent' && !positive.has(tile.letter)) dead.add(tile.letter);
    }
  }
  for (const [index, letter] of green) {
    if (guess[index] !== letter) return `moves proved green ${letter} at ${index + 1}`;
  }
  for (const letter of guess) {
    if (dead.has(letter)) return `reuses ruled-out ${letter}`;
  }
  return null;
}

describe('W5 Help figure content is derived from the real rules', () => {
  it('never plays a guess a viewer would read as a blunder, in either figure', () => {
    const combatRows: Array<{ tiles: ReturnType<typeof scoreGuess> }> = [];
    for (const guess of COMBAT_SEQUENCE) {
      expect(blunder(combatRows, guess), `COMBAT ${guess}`).toBeNull();
      combatRows.push({ tiles: scoreGuess(COMBAT_ANSWER, guess) });
    }

    GO_CHAIN.forEach((answer, puzzle) => {
      // Seeded rows bind too: they are real evidence on the board for this puzzle.
      const rows = GO_CHAIN.slice(0, puzzle).map((word) => ({ tiles: scoreGuess(answer, word) }));
      for (const guess of GO_PLAYS[puzzle] ?? []) {
        expect(blunder(rows, guess), `GO puzzle ${puzzle + 1} ${guess}`).toBeNull();
        rows.push({ tiles: scoreGuess(answer, guess) });
      }
    });
  });

  it('runs the COMBAT board past row six and wins on the eighth guess', () => {
    expect(COMBAT_SEQUENCE.length).toBeGreaterThan(6);
    expect(COMBAT_SEQUENCE.at(-1)).toBe(COMBAT_ANSWER);
    expect(new Set(COMBAT_SEQUENCE).size).toBe(COMBAT_SEQUENCE.length);

    const frames = buildCombatFrames();
    const terminal = frames.at(-1)!;
    // The teaching goal, asserted rather than assumed: nine slots, and a solved last row.
    expect(terminal.rows).toHaveLength(9);
    const solved = terminal.rows[7]!;
    expect(solved.tiles.every((tile) => tile.state === 'correct')).toBe(true);
    expect(solved.tiles.map((tile) => tile.letter).join('')).toBe(COMBAT_ANSWER);
  });

  it('keeps T green after TASTE puts it in the wrong place', () => {
    /*
     * The subtle one. Row seven plays TASTE against WASTE, so the T at index 0 scores
     * absent — but `mergeEvidence` ranks correct above absent, so the shared keyboard
     * still shows T as correct. A hand-drawn figure would almost certainly have shown it
     * greyed out, teaching players that evidence can be lost. It cannot.
     */
    const frames = buildCombatFrames();
    const seventh = scoreGuess(COMBAT_ANSWER, 'taste');
    expect(seventh[0]!.state).toBe('absent');
    expect(frames.at(-1)!.evidence!.t).toBe('correct');
  });

  it('renders both COMBAT keyboards from one evidence object', () => {
    // Not a style preference: two keyboards that read from a single source cannot
    // disagree, which is the entire point the figure is making.
    for (const frame of buildCombatFrames()) expect(frame.evidence).toBeDefined();
  });

  it('holds the GO board at six rows for every puzzle while attempts fall away', () => {
    const frames = buildGoFrames();
    for (const frame of frames) expect(frame.rows).toHaveLength(6);
    GO_CHAIN.forEach((_answer, puzzle) => {
      // i seeded rows plus max(2, 6 - i) attempts is always six entries.
      expect(puzzle + playableAttemptBudget(puzzle)).toBe(6);
      expect((GO_PLAYS[puzzle] ?? []).length).toBeLessThanOrEqual(playableAttemptBudget(puzzle));
    });
    // Every puzzle ends solved, and the run ends on the last attempt of the last puzzle.
    GO_CHAIN.forEach((answer, puzzle) => {
      const last = (GO_PLAYS[puzzle] ?? []).at(-1)!;
      expect(scoreGuess(answer, last).every((tile) => tile.state === 'correct')).toBe(true);
    });
    expect((GO_PLAYS.at(-1) ?? []).length).toBe(playableAttemptBudget(GO_CHAIN.length - 1));
    // Wrong guesses are the point: a flawless run would not show evidence accumulating.
    const wrong = GO_PLAYS.reduce((total, plays) => total + plays.length - 1, 0);
    expect(wrong).toBeGreaterThanOrEqual(5);
  });

  it('opens the Reveal figure on exactly one green and one amber', () => {
    const frames = buildRevealFrames();
    const row1 = frames[0]!.rows[0]!.tiles;
    expect(row1.filter((tile) => tile.state === 'correct')).toHaveLength(1);
    expect(row1.filter((tile) => tile.state === 'present')).toHaveLength(1);
    // The bought letter lands in the DRAFT row, outlined — not as earned evidence.
    const draft = frames.at(-1)!.rows[1]!;
    expect(draft.draft).toBe(true);
    expect(draft.tiles[0]!.revealed).toBe(true);
    expect(draft.tiles[0]!.letter).toBe('w');
    expect(draft.tiles[0]!.state).not.toBe('correct');
  });

  it('removes exactly five letters, which is what the tool actually does', () => {
    // `selectIncorrectLettersToRemove` slices five. A caption promising "all the wrong
    // letters" would over-sell the tool, so the figure must not show more than five.
    expect(REMOVE_LETTERS).toHaveLength(5);
    const evidence = buildRemoveFrames().at(-1)!.evidence!;
    const removed = Object.entries(evidence).filter(([, state]) => state === 'removed');
    expect(removed).toHaveLength(5);
  });

  it('prices the continuation from the economy rather than from a literal', () => {
    expect(continueFigurePrice()).toBe(4);
    const frames = buildContinueFrames();
    expect(frames[0]!.rows).toHaveLength(6);
    // A seventh row past the sixth is the whole lesson.
    expect(frames.at(-1)!.rows).toHaveLength(7);
    expect(frames.at(-1)!.rows[6]!.draft).toBe(true);
  });

  it('ends every sequence on its most teaching-dense frame', () => {
    /*
     * The finished state is the initial state: `useFrameSequence` starts at the LAST
     * frame, so a reader with no JavaScript, reduced motion, or a crawler sees this one.
     * It therefore has to be the frame worth seeing, and it must carry a note.
     */
    for (const frames of [
      buildGoFrames(),
      buildCombatFrames(),
      buildRevealFrames(),
      buildRemoveFrames(),
      buildContinueFrames(),
    ]) {
      expect(frames.length).toBeGreaterThan(1);
      expect(frames.at(-1)!.note.length).toBeGreaterThan(0);
      expect(frames.at(-1)!.hold).toBeGreaterThan(0);
    }
  });
});
