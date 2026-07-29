import { describe, expect, it } from 'vitest';
import {
  defaultAccountProgress,
  normalizeAccountProgress,
  normalizeLegacyHistory,
} from '@/domain/account-continuity';

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
});
