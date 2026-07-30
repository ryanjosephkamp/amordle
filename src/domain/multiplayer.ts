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

export interface RankedPracticeConfig {
  mode: 'og' | 'go';
  wordLength: number;
  difficulty: 'casual' | 'standard' | 'expert';
  hardMode: boolean;
  goPuzzleCount: 5 | 7 | 10 | null;
  timeLimitMs: 300_000 | null;
}

export type RankedPracticeQueuePhase =
  'idle' | 'queued' | 'matched' | 'expired' | 'cancelled' | 'conflict' | 'failed';

export interface RankedPracticeQueueTransition {
  phase: RankedPracticeQueuePhase;
  shouldClearIntent: boolean;
  shouldFinalize: boolean;
}

export function sameRankedPracticeConfig(
  left: RankedPracticeConfig,
  right: RankedPracticeConfig,
): boolean {
  return (
    left.mode === right.mode &&
    left.wordLength === right.wordLength &&
    left.difficulty === right.difficulty &&
    left.hardMode === right.hardMode &&
    left.goPuzzleCount === right.goPuzzleCount &&
    left.timeLimitMs === right.timeLimitMs
  );
}

export function rankedPracticeQueueTransition(
  status: 'queued' | 'matched' | 'expired' | 'cancelled' | 'conflict' | 'failed',
): RankedPracticeQueueTransition {
  switch (status) {
    case 'matched':
      return { phase: status, shouldClearIntent: false, shouldFinalize: true };
    case 'expired':
    case 'cancelled':
      return { phase: status, shouldClearIntent: true, shouldFinalize: false };
    case 'queued':
    case 'conflict':
    case 'failed':
      return { phase: status, shouldClearIntent: false, shouldFinalize: false };
  }
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
