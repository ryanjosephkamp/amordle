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

/**
 * Completed games grouped by ISO week, for an honest results-over-time view. Weeks with
 * no completed game are omitted rather than drawn as zero, so the shape never implies
 * activity that did not happen.
 */
export function buildResultTimeline(
  history: readonly AccountHistoryRow[],
): Array<{ week: string; wins: number; losses: number; draws: number }> {
  const weeks = new Map<string, { week: string; wins: number; losses: number; draws: number }>();
  for (const row of history) {
    if (row.entry.result === 'cancelled') continue;
    const week = row.completed_at.slice(0, 10);
    const bucket = weeks.get(week) ?? { week, wins: 0, losses: 0, draws: 0 };
    if (row.entry.result === 'won') bucket.wins += 1;
    else if (row.entry.result === 'lost') bucket.losses += 1;
    else if (row.entry.result === 'draw') bucket.draws += 1;
    weeks.set(week, bucket);
  }
  return [...weeks.values()].sort((left, right) => left.week.localeCompare(right.week));
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
