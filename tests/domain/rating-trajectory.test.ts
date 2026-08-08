import { describe, expect, it } from 'vitest';
import {
  buildDifficultyBreakdown,
  buildRatingTrajectory,
  buildResultTimeline,
} from '@/domain/account-stats';
import type { AccountHistoryRow } from '@/domain/account-continuity';

/**
 * The real v2 shape, with `difficulty` where the schema actually puts it — flat on the
 * entry, not inside a `settings` object.
 */
function gradedRow(
  id: string,
  difficulty: 'casual' | 'standard' | 'expert',
  result: 'won' | 'lost' | 'draw' | 'cancelled',
  schemaVersion: 1 | 2 = 2,
): AccountHistoryRow {
  return {
    id,
    completed_at: '2026-08-08T10:00:00.000Z',
    entry: {
      schemaVersion,
      kind: 'solo-practice',
      lane: 'practice',
      mode: 'og',
      ranked: false,
      result,
      terminalReason: 'solved',
      wordLength: 5,
      difficulty,
      hardMode: false,
      goPuzzleCount: null,
      acceptedGuesses: 3,
      puzzlesSolved: 1,
      points: null,
      rewardCoins: 2,
      rewardXp: 10,
      ratingDelta: null,
    },
  } as unknown as AccountHistoryRow;
}

function rankedRow(
  id: string,
  completedAt: string,
  ratingDelta: number | null,
  result: 'won' | 'lost' | 'draw' | 'cancelled' = 'won',
): AccountHistoryRow {
  return {
    id,
    completed_at: completedAt,
    entry: {
      schemaVersion: 2,
      kind: 'combat-practice',
      lane: 'practice',
      mode: 'og',
      result,
      terminalReason: 'solved',
      settings: { length: 5, difficulty: 'standard', hardMode: false },
      acceptedGuesses: 3,
      puzzlesSolved: 1,
      points: 10,
      rewardCoins: 5,
      rewardXp: 20,
      ranked: true,
      ratingDelta,
      opponent: undefined,
    },
  } as unknown as AccountHistoryRow;
}

function unrankedRow(id: string, completedAt: string): AccountHistoryRow {
  return {
    id,
    completed_at: completedAt,
    entry: {
      schemaVersion: 1,
      kind: 'solo-practice',
      mode: 'og',
      result: 'won',
      acceptedGuesses: 4,
      rewardCoins: 2,
      rewardXp: 10,
    },
  } as unknown as AccountHistoryRow;
}

describe('ANNOT-06 ranked rating trajectory', () => {
  it('accumulates only rows that carry a real rating delta, in chronological order', () => {
    const points = buildRatingTrajectory([
      rankedRow('b', '2026-08-02T00:00:00.000Z', -8, 'lost'),
      unrankedRow('solo', '2026-08-03T00:00:00.000Z'),
      rankedRow('a', '2026-08-01T00:00:00.000Z', 24),
      rankedRow('c', '2026-08-03T00:00:00.000Z', null),
    ]);
    expect(points.map((point) => point.delta)).toEqual([24, -8]);
    expect(points.map((point) => point.cumulativeDelta)).toEqual([24, 16]);
  });

  it('returns nothing rather than an invented baseline when no ranked result exists', () => {
    expect(buildRatingTrajectory([unrankedRow('solo', '2026-08-01T00:00:00.000Z')])).toEqual([]);
    expect(buildRatingTrajectory([])).toEqual([]);
  });

  it('never interpolates missing days', () => {
    const points = buildRatingTrajectory([
      rankedRow('a', '2026-08-01T00:00:00.000Z', 10),
      rankedRow('b', '2026-08-20T00:00:00.000Z', 10),
    ]);
    // Nineteen days apart, still exactly two points.
    expect(points).toHaveLength(2);
    expect(points[1]!.cumulativeDelta).toBe(20);
  });

  it('omits days with no completed game instead of drawing them as zero', () => {
    const timeline = buildResultTimeline([
      rankedRow('a', '2026-08-01T09:00:00.000Z', 10, 'won'),
      rankedRow('b', '2026-08-01T10:00:00.000Z', -5, 'lost'),
      rankedRow('c', '2026-08-04T10:00:00.000Z', 0, 'draw'),
      rankedRow('d', '2026-08-05T10:00:00.000Z', null, 'cancelled'),
    ]);
    // W6. The buckets were called `week` while the implementation slices YYYY-MM-DD,
    // which is a day. Renamed rather than left to mislead the next reader.
    expect(timeline).toEqual([
      { day: '2026-08-01', wins: 1, losses: 1, draws: 0, games: 2 },
      { day: '2026-08-04', wins: 0, losses: 0, draws: 1, games: 1 },
    ]);
  });

  /*
   * W6. Every other projection on the Stats page excludes rows still waiting to sync, so
   * a figure built from this one would have disagreed with the metrics printed beside it.
   */
  it('excludes rows that have not synced yet, as the rest of the page does', () => {
    const rows = [
      rankedRow('a', '2026-08-01T09:00:00.000Z', 10, 'won'),
      rankedRow('b', '2026-08-01T10:00:00.000Z', -5, 'lost'),
    ];
    expect(buildResultTimeline(rows, new Set(['b']))).toEqual([
      { day: '2026-08-01', wins: 1, losses: 0, draws: 0, games: 1 },
    ]);
    expect(buildResultTimeline(rows, new Set(['a', 'b']))).toEqual([]);
  });
});

/*
 * W6. Difficulty is recorded on every completed game from schema v2 onward and had never
 * been surfaced. The rules that keep it honest are the same ones the rest of this file
 * follows: nothing is invented, and a sample too small to mean anything is omitted rather
 * than drawn.
 */
describe('W6 difficulty breakdown', () => {
  it('reports a win rate per difficulty and orders them by escalation', () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => gradedRow(`c${i}`, 'casual', i < 3 ? 'won' : 'lost')),
      ...Array.from({ length: 5 }, (_, i) =>
        gradedRow(`s${i}`, 'standard', i < 2 ? 'won' : 'lost'),
      ),
      ...Array.from({ length: 3 }, (_, i) => gradedRow(`e${i}`, 'expert', i < 1 ? 'won' : 'lost')),
    ];
    expect(buildDifficultyBreakdown(rows)).toEqual([
      { difficulty: 'casual', games: 4, wins: 3, winRate: 75 },
      { difficulty: 'standard', games: 5, wins: 2, winRate: 40 },
      { difficulty: 'expert', games: 3, wins: 1, winRate: 33.3 },
    ]);
  });

  it('omits a bucket too small to be a win rate rather than drawing a misleading one', () => {
    const rows = [
      gradedRow('a', 'expert', 'won'),
      gradedRow('b', 'expert', 'won'),
      ...Array.from({ length: 3 }, (_, i) => gradedRow(`s${i}`, 'standard', 'won')),
    ];
    // Two-for-two at expert is not a 100% win rate, so it is not shown at all.
    expect(buildDifficultyBreakdown(rows).map((row) => row.difficulty)).toEqual(['standard']);
  });

  it('ignores cancelled games, unsynced rows, and v1 rows that carry no difficulty', () => {
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => gradedRow(`s${i}`, 'standard', 'won')),
      gradedRow('cancelled', 'standard', 'cancelled'),
      gradedRow('pending', 'standard', 'lost'),
      // v1 has no `difficulty` field at all; bucketing it would be a guess.
      gradedRow('legacy', 'casual', 'won', 1),
      gradedRow('legacy2', 'casual', 'won', 1),
      gradedRow('legacy3', 'casual', 'won', 1),
    ];
    expect(buildDifficultyBreakdown(rows, new Set(['pending']))).toEqual([
      { difficulty: 'standard', games: 3, wins: 3, winRate: 100 },
    ]);
  });
});
