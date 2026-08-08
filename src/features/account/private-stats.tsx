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
import {
  buildDifficultyBreakdown,
  buildPlayerStats,
  buildRatingTrajectory,
  buildResultTimeline,
  nextLevelProgress,
} from '@/domain/account-stats';
import type { AccountHistoryRow } from '@/domain/account-continuity';
import type { DifficultyBreakdownRow, ResultTimelineDay } from '@/domain/account-stats';
import { ratingBucketLabel, resolveRatingLane } from '@/domain/profile';

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
    refetchOnMount: 'always',
  });
  const history = useQuery({
    queryKey: ['history', userId],
    queryFn: () => loadHistoryWithDiagnostics(userId),
    enabled: Boolean(userId),
    refetchOnMount: 'always',
  });
  const pending = useQuery({
    queryKey: ['completion-outbox', userId],
    queryFn: () => loadPendingCompletions(userId),
    enabled: Boolean(userId),
    refetchOnMount: 'always',
  });
  const economy = useQuery({
    queryKey: economyQueryKey(accountEconomyNamespace(userId)),
    queryFn: getEconomy,
    enabled: Boolean(userId),
    refetchOnMount: 'always',
  });
  const ratings = useQuery({
    queryKey: ['ratings', userId],
    queryFn: () => loadRatingProfiles(userId),
    enabled: Boolean(userId),
    refetchOnMount: 'always',
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
  const timeline = buildResultTimeline([...byId.values()], pendingIds);
  const difficulty = buildDifficultyBreakdown([...byId.values()], pendingIds);
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
        <LevelProgress
          level={accountProgress.level}
          xp={accountProgress.xp}
          percentage={level.percentage}
        />
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
        <ResultComposition
          wins={projection.wins}
          losses={projection.losses}
          draws={projection.draws}
        />
        <ResultTimeline days={timeline} />
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
        <ComparisonBars
          rows={[
            ['Solo', projection.byKind['solo-practice'] + projection.byKind['solo-daily']],
            ['COMBAT', projection.byKind['combat-practice'] + projection.byKind['combat-daily']],
            ['Practice', projection.byLane.practice],
            ['Daily', projection.byLane.daily],
          ]}
        />
        <DifficultyWinRate rows={difficulty} />
      </StatsSection>

      <StatsSection title="solo attempt distribution" note="guesses used">
        {projection.soloGuessDistribution.length ? (
          projection.soloGuessDistribution.map((bucket) => (
            <div
              className="distribution-row"
              key={bucket.guesses}
              tabIndex={0}
              aria-label={`${bucket.games} Solo ${bucket.games === 1 ? 'game' : 'games'} completed in ${bucket.guesses} guesses`}
            >
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

      <StatsSection title="ranked ratings" note="service-confirmed lanes">
        {ratings.data?.length ? (
          <div className="rating-bucket-grid">
            {ratings.data.map((rating) => {
              const lane = resolveRatingLane(rating.bucket);
              return (
                <article className="rating-bucket" key={rating.bucket}>
                  <header>
                    <span>{lane.label}</span>
                    <strong>{Math.round(rating.rating)}</strong>
                  </header>
                  <dl>
                    {/*
                      ANNOT-06: scope, mode, and clock are separate labelled facts, so
                      "which ranked lane is this?" is answerable at a glance instead of
                      every lane reading "Ranked COMBAT".
                    */}
                    <div>
                      <dt>lane</dt>
                      <dd>{lane.scope === 'unknown' ? '—' : lane.scope}</dd>
                    </div>
                    <div>
                      <dt>mode</dt>
                      <dd>{lane.mode === 'unknown' ? '—' : lane.mode.toUpperCase()}</dd>
                    </div>
                    <div>
                      <dt>clock</dt>
                      <dd>{lane.clock === 'unknown' ? '—' : lane.clock}</dd>
                    </div>
                    <div>
                      <dt>games</dt>
                      <dd>{rating.games_played}</dd>
                    </div>
                    <div>
                      <dt>w–l–d</dt>
                      <dd>
                        {rating.wins}–{rating.losses}–{rating.draws}
                      </dd>
                    </div>
                    <div>
                      <dt>status</dt>
                      <dd>{rating.provisional ? 'provisional' : 'established'}</dd>
                    </div>
                    <div>
                      <dt>updated</dt>
                      <dd>{new Date(rating.updated_at).toLocaleDateString()}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="empty-copy">No ranked rating has been established yet.</p>
        )}
        {ratings.data?.length ? <RatingComparison ratings={ratings.data} /> : null}
        <RatingTrajectory rows={[...byId.values()]} />
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

function ResultComposition({
  wins,
  losses,
  draws,
}: {
  wins: number;
  losses: number;
  draws: number;
}) {
  const total = wins + losses + draws;
  if (!total) return null;
  return (
    <figure className="stats-visual stats-result-composition">
      <figcaption>
        Result mix · {wins} wins, {losses} losses, {draws} draws · {total} total
      </figcaption>
      <div className="result-composition-track">
        {wins > 0 ? (
          <span
            className="is-win"
            tabIndex={0}
            aria-label={`${wins} wins, ${Math.round((wins / total) * 100)} percent`}
            style={{ width: `${(wins / total) * 100}%` }}
          />
        ) : null}
        {losses > 0 ? (
          <span
            className="is-loss"
            tabIndex={0}
            aria-label={`${losses} losses, ${Math.round((losses / total) * 100)} percent`}
            style={{ width: `${(losses / total) * 100}%` }}
          />
        ) : null}
        {draws > 0 ? (
          <span
            className="is-draw"
            tabIndex={0}
            aria-label={`${draws} draws, ${Math.round((draws / total) * 100)} percent`}
            style={{ width: `${(draws / total) * 100}%` }}
          />
        ) : null}
      </div>
      <div className="result-composition-legend" aria-hidden="true">
        <span>WIN {Math.round((wins / total) * 100)}%</span>
        <span>LOSS {Math.round((losses / total) * 100)}%</span>
        <span>DRAW {Math.round((draws / total) * 100)}%</span>
      </div>
    </figure>
  );
}

function ComparisonBars({ rows }: { rows: Array<[string, number]> }) {
  const maximum = Math.max(1, ...rows.map(([, value]) => value));
  return (
    <figure className="stats-visual stats-comparison">
      <figcaption>Completed-game comparison</figcaption>
      {rows.map(([label, value]) => (
        <div
          className="comparison-row"
          key={label}
          tabIndex={0}
          aria-label={`${label}: ${value} completed games`}
        >
          <span>{label}</span>
          <span className="comparison-track" aria-hidden="true">
            <span style={{ width: `${(value / maximum) * 100}%` }} />
          </span>
          <strong>{value}</strong>
        </div>
      ))}
    </figure>
  );
}

/**
 * W6. Results over time, from a projection that was written, reviewed and unit-tested
 * before this pass and then called from nowhere.
 *
 * Plotted as games-per-day with a win share, not as a win-rate line: a day with one game
 * has a win rate of either 0% or 100%, and a line through those would read as violent
 * swings in form rather than as a small sample. Days with no completed game are absent
 * from the data rather than drawn as zero, so the horizontal axis is ordinal — the
 * spacing between points says "next session", not "next day".
 */
function ResultTimeline({ days }: { days: ResultTimelineDay[] }) {
  if (days.length < 2) return null;

  const width = 100;
  const height = 32;
  const peak = Math.max(...days.map((day) => day.games));
  const totals = days.reduce(
    (sum, day) => ({ games: sum.games + day.games, wins: sum.wins + day.wins }),
    { games: 0, wins: 0 },
  );
  const point = (index: number, value: number) =>
    `${((index / (days.length - 1)) * width).toFixed(2)},${(height - (value / peak) * height).toFixed(2)}`;

  return (
    <figure className="stats-visual stats-result-timeline">
      <figcaption>
        Games per day · {days.length} active days · {totals.games} games, {totals.wins} won
      </figcaption>
      <svg
        className="trajectory-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Completed games across ${days.length} active days, ${totals.games} in total of which ${totals.wins} were won`}
      >
        <polyline
          className="trajectory-line"
          points={days.map((day, index) => point(index, day.games)).join(' ')}
        />
        <polyline
          className="timeline-wins"
          points={days.map((day, index) => point(index, day.wins)).join(' ')}
        />
      </svg>
      {/* Exact textual equivalent: the chart never carries information on its own. */}
      <ol className="trajectory-values">
        {days.map((day) => (
          <li key={day.day}>
            <time dateTime={day.day}>{new Date(`${day.day}T12:00:00`).toLocaleDateString()}</time>
            <span>
              {day.games} game{day.games === 1 ? '' : 's'}
            </span>
            <strong>{day.wins} won</strong>
          </li>
        ))}
      </ol>
    </figure>
  );
}

/**
 * W6. Win rate by difficulty — recorded on every completed game since schema v2 and never
 * shown anywhere until now. Buckets with too few games to carry a rate are absent from the
 * data entirely, so an empty figure means "not enough played yet", never "0%".
 */
function DifficultyWinRate({ rows }: { rows: DifficultyBreakdownRow[] }) {
  if (!rows.length) return null;
  return (
    <figure className="stats-visual stats-comparison">
      <figcaption>Win rate by difficulty · completed games only</figcaption>
      {rows.map((row) => (
        <div
          className="comparison-row"
          key={row.difficulty}
          tabIndex={0}
          aria-label={`${row.difficulty}: ${row.winRate}% win rate across ${row.games} completed games`}
        >
          <span>{row.difficulty}</span>
          <span className="comparison-track" aria-hidden="true">
            <span style={{ width: `${row.winRate}%` }} />
          </span>
          <strong>{row.winRate}%</strong>
        </div>
      ))}
    </figure>
  );
}

function LevelProgress({
  level,
  xp,
  percentage,
}: {
  level: number;
  xp: number;
  percentage: number;
}) {
  const rounded = Math.max(0, Math.min(100, Math.round(percentage)));
  return (
    <figure className="stats-visual stats-level-progress">
      <figcaption>
        Level {level} progress · {xp} total XP · {rounded}% toward level {level + 1}
      </figcaption>
      <div
        className="stats-progress-track"
        role="progressbar"
        aria-label={`Progress toward level ${level + 1}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
      >
        <span style={{ width: `${rounded}%` }} />
      </div>
    </figure>
  );
}

/**
 * ANNOT-06. Ranked rating movement over time, derived entirely from durable History
 * rows already loaded by this route — no new request, no fabricated series.
 *
 * History stores the delta a result produced, not the rating it produced, so this
 * plots cumulative *change* rather than absolute Elo. Fewer than two points renders
 * the number instead of a line, because a single result is not a trend.
 */
function RatingTrajectory({ rows }: { rows: AccountHistoryRow[] }) {
  const points = buildRatingTrajectory(rows);
  if (points.length === 0) return null;

  if (points.length < 2) {
    const only = points[0]!;
    return (
      <figure className="stats-visual stats-rating-trajectory">
        <figcaption>
          Ranked rating movement · one settled result so far ({only.delta >= 0 ? '+' : ''}
          {only.delta})
        </figcaption>
        <p className="empty-copy">A trend appears once a second ranked result settles.</p>
      </figure>
    );
  }

  const values = points.map((point) => point.cumulativeDelta);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const span = maximum - minimum || 1;
  const width = 100;
  const height = 32;
  const coordinates = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((point.cumulativeDelta - minimum) / span) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const baselineY = height - ((0 - minimum) / span) * height;
  const net = values[values.length - 1]!;

  return (
    <figure className="stats-visual stats-rating-trajectory">
      <figcaption>
        Ranked rating movement · {points.length} settled results · net {net >= 0 ? '+' : ''}
        {net}
      </figcaption>
      <svg
        className="trajectory-chart"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Cumulative ranked rating change across ${points.length} settled results, ending at ${net >= 0 ? 'plus ' : 'minus '}${Math.abs(net)}`}
      >
        <line className="trajectory-baseline" x1="0" y1={baselineY} x2={width} y2={baselineY} />
        <polyline className="trajectory-line" points={coordinates.join(' ')} />
      </svg>
      {/* Exact textual equivalent: the chart never carries information on its own. */}
      <ol className="trajectory-values">
        {points.map((point) => (
          <li key={`${point.completedAt}:${point.cumulativeDelta}`}>
            <time dateTime={point.completedAt}>
              {new Date(point.completedAt).toLocaleDateString()}
            </time>
            <span>
              {point.delta >= 0 ? '+' : ''}
              {point.delta}
            </span>
            <strong>
              {point.cumulativeDelta >= 0 ? '+' : ''}
              {point.cumulativeDelta}
            </strong>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function RatingComparison({ ratings }: { ratings: Array<{ bucket: string; rating: number }> }) {
  const maximum = Math.max(1, ...ratings.map((rating) => rating.rating));
  return (
    <figure className="stats-visual stats-rating-comparison">
      <figcaption>Current service-confirmed rating comparison</figcaption>
      {ratings.map((rating) => {
        const value = Math.round(rating.rating);
        return (
          <div
            className="comparison-row"
            key={rating.bucket}
            tabIndex={0}
            aria-label={`${ratingBucketLabel(rating.bucket)} rating ${value}`}
          >
            <span>{ratingBucketLabel(rating.bucket)}</span>
            <span className="comparison-track" aria-hidden="true">
              <span style={{ width: `${(value / maximum) * 100}%` }} />
            </span>
            <strong>{value}</strong>
          </div>
        );
      })}
    </figure>
  );
}
