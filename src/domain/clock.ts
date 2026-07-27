export interface MatchClock {
  activePlayerId: string | null;
  playerRemainingMs: Record<string, number>;
  serverObservedAt: string;
}

export function materializeClock(clock: MatchClock, now: string): MatchClock {
  if (!clock.activePlayerId) return clock;
  const elapsed = Math.max(0, Date.parse(now) - Date.parse(clock.serverObservedAt));
  const current = clock.playerRemainingMs[clock.activePlayerId] ?? 0;
  return {
    ...clock,
    playerRemainingMs: {
      ...clock.playerRemainingMs,
      [clock.activePlayerId]: Math.max(0, current - elapsed),
    },
    serverObservedAt: now,
  };
}

export function clockHasExpired(clock: MatchClock, playerId: string, now: string): boolean {
  return (materializeClock(clock, now).playerRemainingMs[playerId] ?? 0) <= 0;
}
