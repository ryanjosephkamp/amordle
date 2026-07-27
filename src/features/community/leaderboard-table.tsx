'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getLeaderboard, getSiteStats } from '@/adapters/supabase/public';

const buckets = [
  { id: 'async:og', label: 'OG' },
  { id: 'async:go', label: 'GO' },
] as const;

export function LeaderboardTable() {
  const [bucket, setBucket] = useState<(typeof buckets)[number]['id']>('async:og');
  const leaderboard = useQuery({
    queryKey: ['leaderboard', bucket],
    queryFn: () => getLeaderboard(bucket),
    refetchInterval: 30_000,
  });
  const site = useQuery({
    queryKey: ['site-stats'],
    queryFn: getSiteStats,
    refetchInterval: 30_000,
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
        <p aria-live="polite">Loading leaderboard…</p>
      ) : leaderboard.isError ? (
        <section className="status-panel">
          <h2>Leaderboard unavailable</h2>
          <button onClick={() => void leaderboard.refetch()}>Try again</button>
        </section>
      ) : leaderboard.data.length ? (
        <div className="table-scroll">
          <table>
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
                <tr key={entry.leaderboard_key}>
                  <td>{entry.rank}</td>
                  <td>
                    <Link href={`/players/${entry.public_profile_id}`}>
                      {entry.display_name || 'Player'}
                    </Link>
                  </td>
                  <td>
                    {Math.round(entry.rating)}
                    {entry.provisional ? ' provisional' : ''}
                  </td>
                  <td>
                    {entry.wins}–{entry.losses}–{entry.draws}
                  </td>
                  <td>{Math.round(entry.peak_rating)}</td>
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
          {site.data.ranked_practice_public_players} public ranked players · updated{' '}
          {new Date(site.data.leaderboard_updated_at).toLocaleString()}
        </p>
      )}
    </>
  );
}
