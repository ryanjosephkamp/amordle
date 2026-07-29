import { describe, expect, it } from 'vitest';
import {
  defaultAccountProgress,
  historyRowSchema,
  normalizeAccountProgress,
  normalizeLegacyHistory,
} from '@/domain/account-continuity';
import { buildPlayerStats, nextLevelProgress } from '@/domain/account-stats';
import { accentCssColor, accentNameSchema } from '@/domain/profile';

const userId = 'f75cc9a7-8983-4ee6-b7fa-790830202b61';

function legacyProgress() {
  return {
    schemaVersion: 11,
    completedGameIds: ['og:daily:2026-07-20'],
    progression: {
      coins: 32,
      consumables: { removeIncorrectLetters: 1, revealOneLetter: 2 },
      level: 4,
      xp: 375,
      economyOperationIds: [],
      economyRevision: 2,
    },
    settings: {},
    stats: {
      og: { daily: { currentStreak: 3 } },
      go: { daily: { currentStreak: 5 } },
    },
    unlockedDailies: ['og:2026-07-18', 'go:2026-07-19', 'not-a-daily'],
    history: [
      {
        attemptsUsed: 4,
        coinAward: 12,
        completedAt: '2026-07-20T15:00:00.000Z',
        gameId: 'og:daily:2026-07-20',
        mode: 'og',
        scope: 'daily',
        status: 'won',
        word: 'never-expose-this',
        wordLength: 5,
        xpAward: 42,
      },
    ],
  };
}

describe('account continuity', () => {
  it('keeps native progress unchanged', () => {
    const progress = { ...defaultAccountProgress(), xp: 50, revision: 3 };
    expect(normalizeAccountProgress(progress)).toEqual({ kind: 'native', progress });
  });

  it('projects BRRRDLE schema 11 without copying answer-bearing fields', () => {
    expect(normalizeAccountProgress(legacyProgress())).toEqual({
      kind: 'legacy',
      progress: {
        ...defaultAccountProgress(),
        xp: 375,
        level: 4,
        dailyStreak: 5,
        dailyEntitlements: {
          '2026-07-18:og': 'unlocked',
          '2026-07-19:go': 'unlocked',
        },
      },
    });
    const [row] = normalizeLegacyHistory(legacyProgress(), userId);
    expect(row).toMatchObject({
      id: 'legacy:og:daily:2026-07-20',
      user_id: userId,
      entry: {
        kind: 'solo-daily',
        mode: 'og',
        result: 'won',
        dailyDate: '2026-07-20',
        puzzlesSolved: null,
        acceptedGuesses: 4,
      },
    });
    expect(JSON.stringify(row)).not.toContain('never-expose-this');
  });

  it('fails closed for unknown progress and drops invalid history rows', () => {
    expect(normalizeAccountProgress({ schemaVersion: 99 })).toEqual({ kind: 'unknown' });
    const invalid = legacyProgress();
    invalid.history[0]!.completedAt = 'invalid';
    expect(normalizeLegacyHistory(invalid, userId)).toEqual([]);
  });

  it('accepts backward-compatible v2 history without answer-bearing state', () => {
    const row = historyRowSchema.parse({
      id: 'combat:game-1:player-one',
      user_id: userId,
      completed_at: '2026-07-29T16:00:00.000Z',
      entry: {
        schemaVersion: 2,
        kind: 'combat-practice',
        lane: 'practice',
        mode: 'og',
        ranked: false,
        result: 'won',
        terminalReason: 'solved',
        wordLength: 5,
        difficulty: 'standard',
        hardMode: false,
        goPuzzleCount: null,
        acceptedGuesses: 4,
        puzzlesSolved: 1,
        points: 2,
        rewardCoins: 0,
        rewardXp: 0,
        ratingDelta: null,
        opponent: {
          publicProfileId: 'public-rival',
          displayName: 'Rival',
        },
      },
    });
    expect(row.entry.schemaVersion).toBe(2);
    expect(JSON.stringify(row)).not.toContain('answer');
  });

  it('projects honest zero and mixed history statistics', () => {
    expect(buildPlayerStats([])).toMatchObject({
      completedGames: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      pendingCount: 0,
    });
    const legacy = normalizeLegacyHistory(legacyProgress(), userId);
    const combat = historyRowSchema.parse({
      id: 'combat:game-2:player-two',
      user_id: userId,
      completed_at: '2026-07-29T17:00:00.000Z',
      entry: {
        schemaVersion: 2,
        kind: 'combat-daily',
        lane: 'daily',
        mode: 'go',
        ranked: true,
        result: 'draw',
        terminalReason: 'time',
        wordLength: 5,
        difficulty: 'expert',
        hardMode: true,
        goPuzzleCount: 5,
        acceptedGuesses: 7,
        puzzlesSolved: 2,
        points: 3,
        rewardCoins: 0,
        rewardXp: 0,
        dailyDate: '2026-07-29',
        ratingDelta: 0,
      },
    });
    expect(buildPlayerStats([...legacy, combat], new Set([legacy[0]!.id]))).toMatchObject({
      completedGames: 2,
      wins: 1,
      draws: 1,
      acceptedGuesses: 11,
      puzzlesSolved: 2,
      byLane: { practice: 0, daily: 2 },
      byMode: { og: 1, go: 1 },
      byRanking: { ranked: 1, unranked: 1 },
      rewardCoins: 0,
      rewardXp: 0,
      pendingCount: 1,
    });
    expect(nextLevelProgress({ ...defaultAccountProgress(), xp: 50 })).toEqual({
      current: 0,
      next: 100,
      percentage: 50,
    });
  });

  it('accepts only named profile accents and maps them to CSS colors', () => {
    expect(accentNameSchema.parse('violet')).toBe('violet');
    expect(accentNameSchema.safeParse('#00ffff').success).toBe(false);
    expect(accentCssColor('amber')).toMatch(/^oklch/);
  });
});
