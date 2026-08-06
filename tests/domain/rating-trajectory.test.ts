import { describe, expect, it } from 'vitest';
import { buildRatingTrajectory, buildResultTimeline } from '@/domain/account-stats';
import type { AccountHistoryRow } from '@/domain/account-continuity';

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
    expect(timeline).toEqual([
      { week: '2026-08-01', wins: 1, losses: 1, draws: 0 },
      { week: '2026-08-04', wins: 0, losses: 0, draws: 1 },
    ]);
  });
});
