import { playerCombatPoints, type PlayerPuzzlePerformance } from './combat';

export type CombatLaneSource =
  'ranked-queue' | 'daily-lobby' | 'public-lobby' | 'private-request' | 'rematch';

export function combatLaneLabel(input: {
  readonly scope: 'practice' | 'daily';
  readonly mode: 'og' | 'go';
  readonly ranked: boolean;
  readonly sourceKind: CombatLaneSource;
}): string {
  const mode = input.mode.toUpperCase();
  if (input.scope === 'daily') {
    return `${input.ranked ? 'Ranked' : 'Unranked'} Daily ${mode}`;
  }
  if (input.sourceKind === 'private-request') return `Private Practice ${mode}`;
  if (input.sourceKind === 'rematch') return `Practice Rematch ${mode}`;
  return `${input.ranked ? 'Ranked' : 'Unranked Public'} Practice ${mode}`;
}

interface CombatScoredMove {
  readonly playerId: 'player-one' | 'player-two';
  readonly puzzleIndex: number;
  readonly tiles: readonly {
    readonly state: 'absent' | 'present' | 'correct';
  }[];
}

export function projectedCombatPoints(input: {
  readonly mode: 'og' | 'go';
  readonly puzzleCount: number;
  readonly hardMode: boolean;
  readonly moves: readonly CombatScoredMove[];
  readonly seat: 'player-one' | 'player-two';
}): number {
  const puzzleCount = input.mode === 'go' ? Math.max(1, Math.trunc(input.puzzleCount)) : 1;
  const puzzles: PlayerPuzzlePerformance[] = Array.from(
    { length: puzzleCount },
    (_, puzzleIndex) => {
      const guesses = input.moves
        .filter((move) => move.playerId === input.seat && move.puzzleIndex === puzzleIndex)
        .map((move) =>
          move.tiles.map((tile, position) => ({
            letter: '',
            state: tile.state,
            position,
          })),
        );
      return {
        guesses,
        solved: guesses.some((guess) => guess.every((tile) => tile.state === 'correct')),
        maxAttempts: input.mode === 'go' ? Math.max(2, 6 - puzzleIndex) : 6,
        hardMode: input.hardMode,
      };
    },
  );
  return playerCombatPoints(puzzles);
}
