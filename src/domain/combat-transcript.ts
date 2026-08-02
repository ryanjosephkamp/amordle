import type { Tile } from './game';

export interface SeededTranscriptCandidate {
  sourcePuzzleIndex: number;
  guess: string;
  tiles: Tile[];
}

export interface SeededTranscriptRow extends SeededTranscriptCandidate {
  kind: 'seeded';
  id: string;
  actorLabel: string;
}

export function validSeededTranscriptRows(input: {
  candidates: readonly SeededTranscriptCandidate[];
  currentPuzzleIndex: number;
  wordLength: number;
}): SeededTranscriptRow[] {
  const seen = new Set<number>();
  const rows: SeededTranscriptRow[] = [];
  for (const candidate of [...input.candidates].sort(
    (left, right) => left.sourcePuzzleIndex - right.sourcePuzzleIndex,
  )) {
    const index = candidate.sourcePuzzleIndex;
    const word = candidate.guess.trim().toLowerCase();
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= input.currentPuzzleIndex ||
      seen.has(index) ||
      !/^[a-z]+$/u.test(word) ||
      word.length !== input.wordLength ||
      candidate.tiles.length !== input.wordLength ||
      candidate.tiles.some(
        (tile, tileIndex) =>
          tile.letter.toLowerCase() !== word[tileIndex] ||
          !['correct', 'present', 'absent'].includes(tile.state),
      )
    ) {
      continue;
    }
    seen.add(index);
    rows.push({
      kind: 'seeded',
      id: `seed:${index}:${word}`,
      sourcePuzzleIndex: index,
      guess: word,
      tiles: candidate.tiles,
      actorLabel: `Puzzle ${index + 1} answer`,
    });
  }
  return rows;
}
