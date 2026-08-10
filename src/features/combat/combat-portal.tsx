'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { listCombatOccupancy } from '@/adapters/supabase/combat';
import type { CombatOccupancy } from '@/adapters/supabase/combat';
import { useAuth } from '@/components/providers';
import { rankedClockLadder } from '@/domain/profile';
import type { RankedPracticeConfig } from '@/domain/multiplayer';
import { useRankedQueue } from './ranked-queue';

/*
 * v8-D. The COMBAT portal.
 *
 * Multiplayer was five sibling routes — practice, lobby, daily, live, active — with no
 * front door: the `[4] COMBAT` shortcut pointed at `/combat`, which had no page at all.
 * That is the "afterthought" problem stated as a sitemap.
 *
 * This leads with the thing the mode is actually about: pick a time control, see whether
 * anyone is there, and be in a queue in one press. The five existing routes stay
 * reachable from the lanes below, because notifications, results pages and the legacy
 * bridges all link to them, and breaking those to make a navigation point would be a bad
 * trade.
 */

const bandLabel: Record<CombatOccupancy['queued_band'], string> = {
  none: 'empty',
  few: '1–2',
  some: '3–5',
  many: '6–10',
  busy: '10+',
};

/** Occupancy is deliberately coarse; a band is the whole signal, not a rounded count. */
function OccupancyDot({ band, label }: { band: CombatOccupancy['queued_band']; label: string }) {
  return (
    <span className={`occupancy occupancy-${band}`}>
      <span className="occupancy-label">{label}</span>
      <span className="occupancy-value">{bandLabel[band]}</span>
    </span>
  );
}

export function CombatPortal() {
  const auth = useAuth();
  const router = useRouter();
  const rankedQueue = useRankedQueue();
  const [hardMode, setHardMode] = useState(false);

  const occupancy = useQuery({
    queryKey: ['combat', 'occupancy'],
    queryFn: listCombatOccupancy,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  /*
   * The grid is the ladder, not the server's row list: a control with no row yet must
   * still be offered, and a row for a control this build does not know about must not
   * invent a cell. Occupancy is attached where it exists and reported as empty where it
   * does not, which is the honest reading of "we have no data" for a queue.
   */
  const rows = useMemo(() => {
    const byKey = new Map(
      (occupancy.data ?? []).map((row) => [
        `${row.mode}:${row.time_limit_ms}:${row.hard_mode}`,
        row,
      ]),
    );
    return rankedClockLadder.map((clock) => ({
      clock,
      lanes: (['og', 'go'] as const).map((mode) => ({
        mode,
        occupancy: byKey.get(`${mode}:${clock.timeLimitMs}:${hardMode}`) ?? null,
      })),
    }));
  }, [hardMode, occupancy.data]);

  const start = (mode: 'og' | 'go', timeLimitMs: RankedPracticeConfig['timeLimitMs']) => {
    if (!auth.user?.id) {
      router.push('/auth');
      return;
    }
    rankedQueue.start({
      mode,
      // Ranked is one comparable format; only the clock, mode and hard mode identify a
      // pool. See `create_amordle_ranked_practice_request_v2`.
      wordLength: 5,
      difficulty: 'expert',
      hardMode,
      goPuzzleCount: mode === 'go' ? 5 : null,
      timeLimitMs,
    });
  };

  const searching = rankedQueue.phase === 'queued';

  return (
    <div className="combat-portal">
      <section className="portal-ranked" aria-labelledby="portal-ranked-heading">
        <div className="section-heading">
          <h2 id="portal-ranked-heading">Ranked</h2>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hardMode}
              disabled={searching}
              onChange={(event) => setHardMode(event.target.checked)}
            />
            Hard Mode
          </label>
        </div>
        <p className="prose">
          Five letters, expert words, GO over five puzzles. Every rating is kept per time control,
          so a result only ever counts against players who chose the same game.
        </p>

        <div className="portal-grid" role="group" aria-label="Ranked time controls">
          <div className="portal-grid-head" aria-hidden="true">
            <span>Time control</span>
            <span>OG</span>
            <span>GO</span>
          </div>
          {rows.map(({ clock, lanes }) => (
            <div className="portal-row" key={clock.label}>
              <span className="portal-clock">
                <strong>{clock.display.replace(' per player', '').replace(' per move', '')}</strong>
                <span className="portal-clock-kind">
                  {clock.timeLimitMs === null
                    ? 'no clock'
                    : clock.display.includes('per move')
                      ? 'per move'
                      : 'per player'}
                </span>
              </span>
              {lanes.map(({ mode, occupancy: cell }) => (
                <button
                  key={mode}
                  type="button"
                  className="portal-cell"
                  disabled={searching || rankedQueue.isBusy}
                  aria-label={`Find a ranked ${mode.toUpperCase()} match at ${clock.display}${
                    hardMode ? ', Hard Mode' : ''
                  }`}
                  onClick={() => start(mode, clock.timeLimitMs)}
                >
                  <OccupancyDot band={cell?.queued_band ?? 'none'} label="waiting" />
                  <OccupancyDot band={cell?.playing_band ?? 'none'} label="playing" />
                </button>
              ))}
            </div>
          ))}
        </div>
        {occupancy.isError && (
          <p role="status">
            Live occupancy is unavailable right now. Every time control is still playable.
          </p>
        )}
        <p className="footnote">
          Occupancy is shown in bands rather than exact numbers, so a quiet queue cannot be used to
          work out who is in it.
        </p>
      </section>

      <section className="portal-lanes" aria-labelledby="portal-lanes-heading">
        <h2 id="portal-lanes-heading">Other ways to play</h2>
        <div className="portal-lane-list">
          <Link href="/combat/practice" className="portal-lane">
            <strong>Unranked Practice</strong>
            <span>Any word length, any difficulty, any clock. Nothing counts to a rating.</span>
          </Link>
          <Link href="/combat/daily" className="portal-lane">
            <strong>Daily COMBAT</strong>
            <span>Everyone plays the same puzzle. One ranked match a day per mode.</span>
          </Link>
          <Link href="/combat/lobby" className="portal-lane">
            <strong>Private challenge</strong>
            <span>Send a match request to a specific player.</span>
          </Link>
          <Link href="/combat/active" className="portal-lane">
            <strong>Your games</strong>
            <span>Everything waiting on you, and everything waiting on an opponent.</span>
          </Link>
          <Link href="/combat/live" className="portal-lane">
            <strong>Watch</strong>
            <span>Public games in progress, board by board.</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
