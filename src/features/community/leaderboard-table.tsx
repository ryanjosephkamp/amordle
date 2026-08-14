'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getLeaderboard, getSiteStats } from '@/adapters/supabase/public';
import { PlayerIdentityLink } from '@/components/player-identity-link';
import { SkeletonRows } from '@/components/route-states';
import { profileAccentCss, rankedClockLadder } from '@/domain/profile';
import type { RankedClockLabel } from '@/domain/profile';

/*
 * W-5 offered four hardcoded lanes. v8.2-P3 replaces them, because Cycle C moved every
 * ranked Practice rating into a per-time-control pool and those four names now match no
 * rows at all — the leaderboard was empty and had no way to ask for a lane that exists.
 *
 * The controls are the COMBAT portal's: mode, Hard Mode, and the time-control ladder, so
 * picking a lane here reads the same way as entering one there. The ladder is imported
 * rather than restated — a second copy is how the four stale names survived.
 *
 * The old W-5 note said timed lanes were withheld on purpose. That reasoning retired with
 * Cycle C: every ranked lane now carries an explicit clock, so a rule that hides timed
 * lanes hides all of them.
 */
const dailyLanes = [
  { id: 'multiplayer:og:daily:v1', label: 'Daily · OG' },
  { id: 'multiplayer:go:daily:v1', label: 'Daily · GO' },
] as const;

type Scope = 'practice' | 'daily';

export function LeaderboardTable() {
  const [scope, setScope] = useState<Scope>('practice');
  const [mode, setMode] = useState<'og' | 'go'>('og');
  const [hardMode, setHardMode] = useState(false);
  const [clock, setClock] = useState<RankedClockLabel>('5m');
  const [dailyLane, setDailyLane] =
    useState<(typeof dailyLanes)[number]['id']>('multiplayer:og:daily:v1');

  /*
   * A v4 bucket name is self-describing, so it is the lane id the RPC takes directly.
   * Daily predates the ladder and keeps its own ids.
   */
  const bucket =
    scope === 'daily' ? dailyLane : `async:${mode}:${clock}:${hardMode ? 'hard' : 'std'}:v4`;
  const leaderboard = useQuery({
    queryKey: ['leaderboard', bucket],
    queryFn: () => getLeaderboard(bucket),
    refetchInterval: 30_000,
    refetchOnMount: 'always',
  });
  const site = useQuery({
    queryKey: ['site-stats'],
    queryFn: getSiteStats,
    refetchInterval: 30_000,
    refetchOnMount: 'always',
  });
  return (
    <>
      <div className="leaderboard-lanes">
        <div className="segmented" role="radiogroup" aria-label="Leaderboard scope">
          {(['practice', 'daily'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={scope === option}
              className={scope === option ? 'is-selected' : ''}
              onClick={() => setScope(option)}
            >
              {option === 'practice' ? 'Ranked' : 'Daily'}
            </button>
          ))}
        </div>
        {scope === 'daily' ? (
          <div className="segmented" role="radiogroup" aria-label="Daily mode">
            {dailyLanes.map((lane) => (
              <button
                key={lane.id}
                type="button"
                role="radio"
                aria-checked={dailyLane === lane.id}
                className={dailyLane === lane.id ? 'is-selected' : ''}
                onClick={() => setDailyLane(lane.id)}
              >
                {lane.label.replace('Daily · ', '')}
              </button>
            ))}
          </div>
        ) : (
          <>
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
            <div
              className="segmented leaderboard-clocks"
              role="radiogroup"
              aria-label="Time control"
            >
              {rankedClockLadder.map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  role="radio"
                  aria-checked={clock === entry.label}
                  aria-label={entry.display}
                  className={clock === entry.label ? 'is-selected' : ''}
                  onClick={() => setClock(entry.label)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {leaderboard.isPending ? (
        <SkeletonRows label="Loading leaderboard…" rows={6} />
      ) : leaderboard.isError ? (
        <section className="status-panel">
          <h2>Leaderboard unavailable</h2>
          <button onClick={() => void leaderboard.refetch()}>Try again</button>
        </section>
      ) : leaderboard.data.length ? (
        <div className="table-scroll">
          <table className="responsive-table leaderboard-table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Player</th>
                <th>Rating</th>
                <th>Record</th>
                <th>Peak</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.data.map((entry) => (
                <tr
                  key={entry.leaderboard_key}
                  style={
                    {
                      '--profile-accent': profileAccentCss(entry.accent_color, entry.accent_hex),
                    } as React.CSSProperties
                  }
                >
                  <td data-label="Rank">{entry.rank}</td>
                  <td data-label="Player">
                    <PlayerIdentityLink
                      publicProfileId={entry.public_profile_id}
                      displayName={entry.display_name || 'Player'}
                    />
                  </td>
                  <td data-label="Rating">
                    {Math.round(entry.rating)}
                    {entry.provisional ? ' provisional' : ''}
                  </td>
                  <td data-label="Record">
                    {entry.wins}–{entry.losses}–{entry.draws}
                  </td>
                  <td data-label="Peak">{Math.round(entry.peak_rating)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="prose">
          No public ranked results in this lane yet. Ratings are kept per time control, so a quiet
          lane means nobody has finished a rated game at this one — not that the board is broken.
        </p>
      )}
      {site.data && (
        <p className="prose mono">
          {site.data.ranked_practice_public_players} public ranked players
          {site.data.leaderboard_updated_at
            ? ` · updated ${new Date(site.data.leaderboard_updated_at).toLocaleString()}`
            : ''}
        </p>
      )}
    </>
  );
}
