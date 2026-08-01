'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getLeaderboard, getSiteStats } from '@/adapters/supabase/public';
import { PlayerIdentityLink } from '@/components/player-identity-link';
import { SkeletonRows } from '@/components/route-states';
import { profileAccentCss } from '@/domain/profile';

const buckets = [
  { id: 'multiplayer:og', label: 'OG' },
  { id: 'multiplayer:go', label: 'GO' },
] as const;

export function LeaderboardTable() {
  const [bucket, setBucket] = useState<(typeof buckets)[number]['id']>('multiplayer:og');
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
      <div className="segmented" aria-label="Leaderboard mode">
        {buckets.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={bucket === item.id}
            onClick={() => setBucket(item.id)}
          >
            {item.label}
          </button>
        ))}
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
        <p className="prose">No public ranked results are available for this lane yet.</p>
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
