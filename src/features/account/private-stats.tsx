'use client';

import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  getEconomy,
  loadHistoryWithDiagnostics,
  loadProgress,
  loadRatingProfiles,
} from '@/adapters/supabase/account';
import { loadPendingCompletions } from '@/application/completion-outbox';
import { accountEconomyNamespace, economyQueryKey } from '@/application/query-keys';
import { AccountGate, SkeletonRows } from '@/components/route-states';
import { useAuth } from '@/components/providers';
import { defaultAccountProgress } from '@/domain/account-continuity';
import { buildPlayerStats, nextLevelProgress } from '@/domain/account-stats';

export function PrivateStats() {
  return (
    <AccountGate>
      <PrivateStatsInner />
    </AccountGate>
  );
}

function PrivateStatsInner() {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const progress = useQuery({
    queryKey: ['progress', userId],
    queryFn: () => loadProgress(userId),
    enabled: Boolean(userId),
  });
  const history = useQuery({
    queryKey: ['history', userId],
    queryFn: () => loadHistoryWithDiagnostics(userId),
    enabled: Boolean(userId),
  });
  const pending = useQuery({
    queryKey: ['completion-outbox', userId],
    queryFn: () => loadPendingCompletions(userId),
    enabled: Boolean(userId),
  });
  const economy = useQuery({
    queryKey: economyQueryKey(accountEconomyNamespace(userId)),
    queryFn: getEconomy,
    enabled: Boolean(userId),
  });
  const ratings = useQuery({
    queryKey: ['ratings', userId],
    queryFn: () => loadRatingProfiles(userId),
    enabled: Boolean(userId),
  });

  const queries = [progress, history, pending, economy, ratings];
  if (queries.every((query) => query.isPending)) {
    return <SkeletonRows label="Loading statistics…" rows={5} />;
  }

  const pendingRows = pending.data ?? [];
  const pendingIds = new Set(pendingRows.map((row) => row.id));
  const byId = new Map(pendingRows.map((row) => [row.id, row]));
  for (const row of history.data?.rows ?? []) byId.set(row.id, row);
  const projection = buildPlayerStats([...byId.values()], pendingIds);
  const accountProgress = progress.data ?? defaultAccountProgress();
  const level = nextLevelProgress(accountProgress);
  const failed =
    queries.filter((query) => query.isError).length + (history.data?.failedSources ?? 0);

  return (
    <div className="stats-console">
      {failed > 0 && (
        <div className="status-line status-line--warning" role="status">
          <span>
            {failed} statistics source{failed === 1 ? '' : 's'} could not refresh. Available totals
            are still shown.
          </span>
          <button
            className="text-action"
            onClick={() => {
              for (const query of queries) void query.refetch();
            }}
          >
            Retry
          </button>
        </div>
      )}

      <StatsSection title="progression" note={`${projection.pendingCount} sync pending`}>
        <Metric label="level" value={accountProgress.level} />
        <Metric label="xp" value={accountProgress.xp} />
        <Metric label="next level" value={`${Math.round(level.percentage)}%`} />
        <Metric label="daily streak" value={accountProgress.dailyStreak} />
        <Metric label="coins" value={economy.data?.coins ?? '—'} />
        <Metric label="reveal letters" value={economy.data?.reveal_one_letter ?? '—'} />
        <Metric label="remove letters" value={economy.data?.remove_incorrect_letters ?? '—'} />
      </StatsSection>

      <StatsSection title="overall results" note={`${projection.completedGames} game sample`}>
        <Metric label="completed" value={projection.completedGames} />
        <Metric label="wins" value={projection.wins} />
        <Metric label="losses" value={projection.losses} />
        <Metric label="draws" value={projection.draws} />
        <Metric label="win rate" value={`${projection.winRate}%`} />
        <Metric label="guesses" value={projection.acceptedGuesses} />
        <Metric label="puzzles" value={projection.puzzlesSolved} />
        <Metric
          label="recorded rewards"
          value={`${projection.rewardCoins} coins · ${projection.rewardXp} XP`}
        />
      </StatsSection>

      <StatsSection title="breakdowns" note="durable completed games">
        <Metric
          label="solo / combat"
          value={`${projection.byKind['solo-practice'] + projection.byKind['solo-daily']} / ${
            projection.byKind['combat-practice'] + projection.byKind['combat-daily']
          }`}
        />
        <Metric
          label="practice / daily"
          value={`${projection.byLane.practice} / ${projection.byLane.daily}`}
        />
        <Metric label="og / go" value={`${projection.byMode.og} / ${projection.byMode.go}`} />
        <Metric
          label="ranked / unranked"
          value={`${projection.byRanking.ranked} / ${projection.byRanking.unranked}`}
        />
      </StatsSection>

      <StatsSection title="solo attempt distribution" note="guesses used">
        {projection.soloGuessDistribution.length ? (
          projection.soloGuessDistribution.map((bucket) => (
            <div className="distribution-row" key={bucket.guesses}>
              <span>{bucket.guesses} guesses</span>
              <span aria-hidden="true" className="distribution-track">
                <span
                  style={{
                    width: `${Math.max(
                      8,
                      (bucket.games /
                        Math.max(...projection.soloGuessDistribution.map((item) => item.games))) *
                        100,
                    )}%`,
                  }}
                />
              </span>
              <strong>{bucket.games}</strong>
            </div>
          ))
        ) : (
          <p className="empty-copy">Complete a Solo game to start this distribution.</p>
        )}
      </StatsSection>

      <StatsSection title="ranked ratings" note="service-confirmed buckets">
        {ratings.data?.length ? (
          <div className="table-scroll">
            <table className="responsive-table stats-rating-table">
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th>Rating</th>
                  <th>Games</th>
                  <th>W / L / D</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {ratings.data.map((rating) => (
                  <tr key={rating.bucket}>
                    <td data-label="Bucket">{rating.bucket.replaceAll(':', ' · ')}</td>
                    <td data-label="Rating">{Math.round(rating.rating)}</td>
                    <td data-label="Games">{rating.games_played}</td>
                    <td data-label="W / L / D">
                      {rating.wins} / {rating.losses} / {rating.draws}
                    </td>
                    <td data-label="Status">
                      {rating.provisional ? 'Provisional' : 'Established'}
                    </td>
                    <td data-label="Updated">{new Date(rating.updated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-copy">No ranked rating has been established yet.</p>
        )}
      </StatsSection>

      <StatsSection title="recent activity" note="latest five completions">
        {projection.recent.length ? (
          <ol className="stats-activity">
            {projection.recent.map((row) => (
              <li key={row.id}>
                <span>
                  {row.entry.kind.replaceAll('-', ' ')} · {row.entry.mode.toUpperCase()}
                </span>
                <strong>{row.entry.result}</strong>
                <time dateTime={row.completed_at}>
                  {new Date(row.completed_at).toLocaleDateString()}
                </time>
                {pendingIds.has(row.id) && <em>sync pending</em>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-copy">
            No completed games yet. Your first signed-in result will appear here.
          </p>
        )}
      </StatsSection>

      <p className="stats-provenance">
        History and progression use durable account records. Pending results are included in game
        totals, but rewards and ratings remain unclaimed until synchronization succeeds.
      </p>
    </div>
  );
}

function StatsSection({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="stats-section">
      <header>
        <h2>{title}</h2>
        <span>{note}</span>
      </header>
      <div className="stats-metrics">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stats-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
