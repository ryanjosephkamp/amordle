export type MatchPhase = 'waiting' | 'playing' | 'holding' | 'completed' | 'cancelled';

export interface MatchTransitionState {
  phase: MatchPhase;
  version: number;
  move: number;
  activePlayerId: string | null;
  acceptedRows: number;
  winnerId: string | null;
  terminalReason: string | null;
}

export function acceptsExpectedState(
  state: MatchTransitionState,
  expectedVersion: number,
  expectedMove: number,
): boolean {
  return (
    state.phase === 'playing' && state.version === expectedVersion && state.move === expectedMove
  );
}

export function terminalPrecedence(
  candidates: readonly (
    'before-play-cancel' | 'timeout' | 'forfeit' | 'solve' | 'exhaustion' | 'draw'
  )[],
): string | null {
  const order = [
    'before-play-cancel',
    'timeout',
    'forfeit',
    'solve',
    'exhaustion',
    'draw',
  ] as const;
  return order.find((candidate) => candidates.includes(candidate)) ?? null;
}
