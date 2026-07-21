export type TileState = 'correct' | 'present' | 'absent' | 'empty' | 'draft' | 'removed';
export type Tile = { letter?: string; state: TileState };

export function tiles(word: string, states: TileState[]): Tile[] {
  return [...word].map((letter, index) => ({ letter, state: states[index] ?? 'empty' }));
}

export function emptyRow(length: number, draft = ''): Tile[] {
  return Array.from({ length }, (_, index) =>
    draft[index] ? { letter: draft[index], state: 'draft' } : { state: 'empty' },
  );
}
