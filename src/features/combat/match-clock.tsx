'use client';

import { useEffect, useState } from 'react';
import type { CombatProjection } from '@/adapters/supabase/combat';
import type { CombatClockReading } from '@/domain/clock';
import { formatClock, readCombatClock } from '@/domain/clock';

export function useCombatClockReading(
  game: CombatProjection,
  seat: 'player-one' | 'player-two',
  observedAtMs: number,
): CombatClockReading {
  const running = !game.outcome.terminal && game.status === 'playing' && game.currentTurn === seat;
  const [nowMs, setNowMs] = useState(() => Date.now());

  /*
   * The reading is derived from timestamps rather than accumulated from ticks, so the
   * interval only has to keep the display fresh — it is not the source of truth. That
   * is what makes it safe to stop it while the tab is hidden: the first tick after
   * `visibilitychange` paints the correct value immediately, before any refetch lands.
   */
  useEffect(() => {
    if (!running) return;
    let timer = 0;
    const tick = () => setNowMs(Date.now());
    const sync = () => {
      window.clearInterval(timer);
      timer = document.visibilityState === 'visible' ? window.setInterval(tick, 250) : 0;
      tick();
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [running]);

  return readCombatClock({
    durableRemainingMs: game.playerState[seat].timeRemainingMs,
    running,
    turnStartedAt: game.turnStartedAt,
    serverNow: game.serverNow,
    observedAtMs,
    nowMs,
  });
}

export function ClockValue({
  game,
  seat,
  observedAtMs,
}: {
  game: CombatProjection;
  seat: 'player-one' | 'player-two';
  observedAtMs: number;
}) {
  const reading = useCombatClockReading(game, seat, observedAtMs);
  return (
    <span
      className="mono"
      data-clock={reading.expired ? 'expired' : reading.running ? 'running' : 'idle'}
      aria-label={`${seat.replace('-', ' ')} time remaining`}
    >
      {formatClock(reading.remainingMs)}
    </span>
  );
}
