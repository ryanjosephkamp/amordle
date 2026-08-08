import type { AccountHistoryRow, AccountProgress } from './account-continuity';

export interface RatingSummary {
  bucket: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  provisional: boolean;
  updatedAt: string;
}

export interface PlayerStatsProjection {
  completedGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  acceptedGuesses: number;
  puzzlesSolved: number;
  rewardCoins: number;
  rewardXp: number;
  byKind: Record<AccountHistoryRow['entry']['kind'], number>;
  byLane: Record<'practice' | 'daily', number>;
  byMode: Record<'og' | 'go', number>;
  byRanking: Record<'ranked' | 'unranked', number>;
  soloGuessDistribution: Array<{ guesses: number; games: number }>;
  pendingCount: number;
  recent: AccountHistoryRow[];
}

export function buildPlayerStats(
  history: readonly AccountHistoryRow[],
  pendingIds: ReadonlySet<string> = new Set(),
): PlayerStatsProjection {
  const completed = history.filter((row) => row.entry.result !== 'cancelled');
  const wins = completed.filter((row) => row.entry.result === 'won').length;
  const losses = completed.filter((row) => row.entry.result === 'lost').length;
  const draws = completed.filter((row) => row.entry.result === 'draw').length;
  const byKind: PlayerStatsProjection['byKind'] = {
    'solo-practice': 0,
    'solo-daily': 0,
    'combat-practice': 0,
    'combat-daily': 0,
  };
  const byLane: PlayerStatsProjection['byLane'] = { practice: 0, daily: 0 };
  const byMode: PlayerStatsProjection['byMode'] = { og: 0, go: 0 };
  const byRanking: PlayerStatsProjection['byRanking'] = { ranked: 0, unranked: 0 };
  const distribution = new Map<number, number>();
  let acceptedGuesses = 0;
  let puzzlesSolved = 0;
  let rewardCoins = 0;
  let rewardXp = 0;

  for (const row of completed) {
    byKind[row.entry.kind] += 1;
    byLane[row.entry.kind.endsWith('-daily') ? 'daily' : 'practice'] += 1;
    byMode[row.entry.mode] += 1;
    byRanking[row.entry.schemaVersion === 2 && row.entry.ranked ? 'ranked' : 'unranked'] += 1;
    acceptedGuesses += row.entry.acceptedGuesses;
    puzzlesSolved += row.entry.puzzlesSolved ?? 0;
    if (!pendingIds.has(row.id)) {
      rewardCoins += row.entry.rewardCoins;
      rewardXp += row.entry.rewardXp;
    }
    if (row.entry.kind.startsWith('solo-')) {
      distribution.set(
        row.entry.acceptedGuesses,
        (distribution.get(row.entry.acceptedGuesses) ?? 0) + 1,
      );
    }
  }

  return {
    completedGames: completed.length,
    wins,
    losses,
    draws,
    winRate: completed.length ? Math.round((wins / completed.length) * 1000) / 10 : 0,
    acceptedGuesses,
    puzzlesSolved,
    rewardCoins,
    rewardXp,
    byKind,
    byLane,
    byMode,
    byRanking,
    soloGuessDistribution: [...distribution.entries()]
      .sort(([left], [right]) => left - right)
      .map(([guesses, games]) => ({ guesses, games })),
    pendingCount: history.filter((row) => pendingIds.has(row.id)).length,
    recent: [...history]
      .sort((left, right) => right.completed_at.localeCompare(left.completed_at))
      .slice(0, 5),
  };
}

export interface RatingTrajectoryPoint {
  completedAt: string;
  /** Cumulative rating change since the first recorded ranked result. */
  cumulativeDelta: number;
  delta: number;
}

/**
 * ANNOT-06: a truthful ranked-rating trajectory built only from durable History rows
 * that actually carry a rating delta.
 *
 * Deliberately cumulative *change* rather than absolute Elo: History records the delta
 * a result produced, not the rating it produced, so plotting absolute values would
 * require inventing a starting point. Nothing is interpolated, back-filled, or
 * smoothed — a lane with one result yields one point, and the caller renders a number
 * instead of a line.
 */
export function buildRatingTrajectory(
  history: readonly AccountHistoryRow[],
): RatingTrajectoryPoint[] {
  const ranked = history
    .filter((row) => row.entry.schemaVersion === 2 && typeof row.entry.ratingDelta === 'number')
    .sort((left, right) => left.completed_at.localeCompare(right.completed_at));

  let cumulative = 0;
  return ranked.map((row) => {
    const delta = row.entry.schemaVersion === 2 ? (row.entry.ratingDelta ?? 0) : 0;
    cumulative += delta;
    return { completedAt: row.completed_at, cumulativeDelta: cumulative, delta };
  });
}

export interface ResultTimelineDay {
  day: string;
  wins: number;
  losses: number;
  draws: number;
  games: number;
}

/**
 * Completed games grouped by day, for an honest results-over-time view. Days with no
 * completed game are omitted rather than drawn as zero, so the shape never implies
 * activity that did not happen.
 *
 * W6. Two corrections on wiring this up, both of which had been latent since it was
 * written: the buckets were named `week` while the implementation slices `YYYY-MM-DD`
 * off the timestamp, which is a day; and unsynced rows were counted, unlike every other
 * projection on this page, so a figure drawn from it would have disagreed with the
 * metrics printed beside it.
 */
export function buildResultTimeline(
  history: readonly AccountHistoryRow[],
  pendingIds: ReadonlySet<string> = new Set(),
): ResultTimelineDay[] {
  const days = new Map<string, ResultTimelineDay>();
  for (const row of history) {
    if (row.entry.result === 'cancelled' || pendingIds.has(row.id)) continue;
    const day = row.completed_at.slice(0, 10);
    const bucket = days.get(day) ?? { day, wins: 0, losses: 0, draws: 0, games: 0 };
    if (row.entry.result === 'won') bucket.wins += 1;
    else if (row.entry.result === 'lost') bucket.losses += 1;
    else if (row.entry.result === 'draw') bucket.draws += 1;
    bucket.games = bucket.wins + bucket.losses + bucket.draws;
    days.set(day, bucket);
  }
  return [...days.values()].sort((left, right) => left.day.localeCompare(right.day));
}

export interface DifficultyBreakdownRow {
  difficulty: 'casual' | 'standard' | 'expert';
  games: number;
  wins: number;
  winRate: number;
}

/**
 * W6. Win rate by difficulty. `difficulty` is recorded on every completed game from
 * schema v2 onward and has never been surfaced anywhere in the app.
 *
 * Chosen over word length, which is the more distinctive Amordle dimension but spreads a
 * hundred-row history across up to thirty-four buckets — sparse enough to read as a
 * pattern when it is noise. Three buckets stay dense enough to mean something.
 *
 * A bucket below `minimumGames` is omitted rather than drawn, for the same reason this
 * file omits empty days: two games is not a win rate. v1 rows carry no difficulty at all
 * and are excluded rather than bucketed as a guess.
 */
export function buildDifficultyBreakdown(
  history: readonly AccountHistoryRow[],
  pendingIds: ReadonlySet<string> = new Set(),
  minimumGames = 3,
): DifficultyBreakdownRow[] {
  const order = ['casual', 'standard', 'expert'] as const;
  const buckets = new Map<string, { games: number; wins: number }>();
  for (const row of history) {
    if (row.entry.schemaVersion === 1) continue;
    if (row.entry.result === 'cancelled' || pendingIds.has(row.id)) continue;
    const bucket = buckets.get(row.entry.difficulty) ?? { games: 0, wins: 0 };
    bucket.games += 1;
    if (row.entry.result === 'won') bucket.wins += 1;
    buckets.set(row.entry.difficulty, bucket);
  }
  return order
    .map((difficulty) => ({ difficulty, ...(buckets.get(difficulty) ?? { games: 0, wins: 0 }) }))
    .filter((row) => row.games >= minimumGames)
    .map((row) => ({
      ...row,
      winRate: Math.round((row.wins / row.games) * 1000) / 10,
    }));
}

export function nextLevelProgress(progress: AccountProgress): {
  current: number;
  next: number;
  percentage: number;
} {
  const current = Math.max(0, (progress.level - 1) * (progress.level - 1) * 100);
  const next = progress.level * progress.level * 100;
  const percentage =
    next === current
      ? 100
      : Math.max(0, Math.min(100, ((progress.xp - current) / (next - current)) * 100));
  return { current, next, percentage };
}
