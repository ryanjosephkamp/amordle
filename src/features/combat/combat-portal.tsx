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
 * v8.2-P2. Rebuilt as a tile grid, on the owner's instruction, after the reference they
 * gave: one large tile per time control, chosen at a glance, entered in one press.
 *
 * The mode is a segmented control rather than a second column of tiles. Twenty tiles fit
 * on a desktop and nowhere near a phone, and the previous two-column table is what
 * produced the misaligned OG/GO headers the owner also asked about — headers that simply
 * stop existing here. The cost is honest and small: occupancy is shown for the selected
 * mode, and switching modes is one press away.
 */

type Band = CombatOccupancy['queued_band'];

/*
 * Bands, not counts: an exact number at this player base, plus knowing where one friend
 * is, identifies them. The words carry the meaning; the colour only ranks it.
 */
const bandCopy: Record<Band, string> = {
  none: 'empty',
  few: '1–2',
  some: '3–5',
  many: '6–10',
  busy: '10+',
};

const bandWeight: Record<Band, number> = { none: 0, few: 1, some: 2, many: 3, busy: 4 };

function isOccupied(cell: CombatOccupancy | null): boolean {
  if (!cell) return false;
  return cell.queued_band !== 'none' || cell.playing_band !== 'none';
}

/** The louder of the two bands decides how strongly a tile presents itself. */
function tileBand(cell: CombatOccupancy | null): Band {
  if (!cell) return 'none';
  return bandWeight[cell.queued_band] >= bandWeight[cell.playing_band]
    ? cell.queued_band
    : cell.playing_band;
}

export function CombatPortal() {
  const auth = useAuth();
  const router = useRouter();
  const rankedQueue = useRankedQueue();
  const [mode, setMode] = useState<'og' | 'go'>('og');
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
   * invent a tile. Occupancy is attached where it exists and reported as empty where it
   * does not, which is the honest reading of "we have no data" for a queue.
   */
  const tiles = useMemo(() => {
    const byKey = new Map(
      (occupancy.data ?? []).map((row) => [
        `${row.mode}:${row.time_limit_ms}:${row.hard_mode}`,
        row,
      ]),
    );
    return rankedClockLadder.map((clock) => ({
      clock,
      cell: byKey.get(`${mode}:${clock.timeLimitMs}:${hardMode}`) ?? null,
    }));
  }, [hardMode, mode, occupancy.data]);

  const live = rankedQueue.phase === 'queued' ? rankedQueue.intent : null;

  const start = (timeLimitMs: RankedPracticeConfig['timeLimitMs']) => {
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

  return (
    <div className="combat-portal">
      <section className="portal-ranked" aria-labelledby="portal-ranked-heading">
        <div className="section-heading portal-heading">
          <h2 id="portal-ranked-heading">Ranked</h2>
          <div className="portal-switches">
            {/*
              A radiogroup rather than two toggles: OG and GO are one choice with two
              answers, and `aria-pressed` on a pair of buttons would announce them as two
              independent switches that happen to disagree with each other.
            */}
            <div className="segmented" role="radiogroup" aria-label="Mode">
              {(['og', 'go'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={mode === option}
                  className={mode === option ? 'is-selected' : ''}
                  onClick={() => setMode(option)}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={hardMode}
                onChange={(event) => setHardMode(event.target.checked)}
              />
              Hard Mode
            </label>
          </div>
        </div>
        <p className="prose">
          Five letters, expert words{mode === 'go' ? ', five puzzles in a chain' : ''}. Every rating
          is kept per time control, so a result only ever counts against players who chose the same
          game.
        </p>

        <div className="portal-tiles" role="group" aria-label="Ranked time controls">
          {tiles.map(({ clock, cell }) => {
            const searching =
              live?.config.mode === mode &&
              live.config.timeLimitMs === clock.timeLimitMs &&
              live.config.hardMode === hardMode;
            const occupied = isOccupied(cell);
            const perMove = clock.display.includes('per move');
            return (
              <button
                key={clock.label}
                type="button"
                /*
                 * v8.1-C1. Still pressable while a search runs, because the press switches.
                 * It was disabled, which is why a failed search re-enabling the grid was
                 * the only way to stack a second queue request.
                 */
                disabled={rankedQueue.isBusy}
                className={[
                  'portal-tile',
                  occupied ? 'is-occupied' : '',
                  searching ? 'is-searching' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-band={tileBand(cell)}
                aria-label={`${
                  searching ? 'Searching for' : 'Find'
                } a ranked ${mode.toUpperCase()} match at ${clock.display}${
                  hardMode ? ', Hard Mode' : ''
                }`}
                onClick={() => start(clock.timeLimitMs)}
              >
                <strong className="portal-tile-clock">
                  {clock.timeLimitMs === null
                    ? 'Untimed'
                    : clock.display.replace(' per player', '').replace(' per move', '')}
                </strong>
                <span className="portal-tile-kind">
                  {clock.timeLimitMs === null ? 'no clock' : perMove ? 'per move' : 'per player'}
                </span>
                {/*
                  The occupancy line is the reason this page exists, so it is text before it
                  is colour: a colour-blind reader, a forced-colors user and a greyscale
                  screenshot all still get the answer.
                */}
                <span className="portal-tile-occupancy">
                  {searching ? (
                    <span className="portal-tile-searching">searching…</span>
                  ) : occupied && cell ? (
                    <>
                      {/*
                        Each line appears only when it has something to say. "empty playing"
                        is noise standing where a real number belongs.
                      */}
                      {cell.queued_band !== 'none' && (
                        <span className="portal-tile-count">
                          {bandCopy[cell.queued_band]} waiting
                        </span>
                      )}
                      {cell.playing_band !== 'none' && (
                        <span className="portal-tile-count is-quiet">
                          {bandCopy[cell.playing_band]} playing
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="portal-tile-count is-quiet">nobody here yet</span>
                  )}
                </span>
              </button>
            );
          })}
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
