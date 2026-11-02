import { describe, expect, it } from 'vitest';
import {
  validSeededTranscriptRows,
  type SeededTranscriptCandidate,
} from '@/domain/combat-transcript';

function candidate(sourcePuzzleIndex: number, guess: string): SeededTranscriptCandidate {
  return {
    sourcePuzzleIndex,
    guess,
    tiles: [...guess].map((letter) => ({ letter, state: 'present' as const })),
  };
}

describe('COMBAT GO seeded transcript rows', () => {
  it('sorts prior puzzle answers and labels them independently from players', () => {
    const rows = validSeededTranscriptRows({
      candidates: [candidate(1, 'gaits'), candidate(0, 'slave')],
      currentPuzzleIndex: 2,
      wordLength: 5,
    });
    expect(rows.map((row) => [row.sourcePuzzleIndex, row.guess, row.actorLabel])).toEqual([
      [0, 'slave', 'Puzzle 1 answer'],
      [1, 'gaits', 'Puzzle 2 answer'],
    ]);
  });

  it('fails closed for duplicate, future, malformed, and wrong-length candidates', () => {
    const mismatched = candidate(1, 'gaits');
    mismatched.tiles[0] = { letter: 'x', state: 'correct' };
    const rows = validSeededTranscriptRows({
      candidates: [
        candidate(0, 'slave'),
        candidate(0, 'slave'),
        candidate(2, 'future'),
        candidate(1, 'tiny'),
        candidate(1, 'gai!s'),
        mismatched,
      ],
      currentPuzzleIndex: 2,
      wordLength: 5,
    });
    expect(rows.map((row) => row.guess)).toEqual(['slave']);
  });
});
