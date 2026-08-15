import { describe, expect, it } from 'vitest';
import { defaultAccountProgress, progressSchema } from '@/domain/account-continuity';
import {
  advanceDailyStreak,
  currentDailyStreak,
  localDayKey,
  previousDayKey,
} from '@/domain/daily-streak';
import type { AccountProgress } from '@/domain/account-continuity';

function progress(overrides: Partial<AccountProgress> = {}): AccountProgress {
  return { ...defaultAccountProgress(), ...overrides };
}

describe('previousDayKey', () => {
  it('steps across a month, a year, and a leap day', () => {
    expect(previousDayKey('2026-03-01')).toBe('2026-02-28');
    expect(previousDayKey('2026-01-01')).toBe('2025-12-31');
    expect(previousDayKey('2024-03-01')).toBe('2024-02-29');
    expect(previousDayKey('2026-08-15')).toBe('2026-08-14');
  });

  it('is unaffected by a daylight-saving transition', () => {
    // US spring forward 2026-03-08 and fall back 2026-11-01. A local-midnight Date would
    // land on the wrong side of both; the key arithmetic runs in UTC and does not.
    expect(previousDayKey('2026-03-08')).toBe('2026-03-07');
    expect(previousDayKey('2026-03-09')).toBe('2026-03-08');
    expect(previousDayKey('2026-11-01')).toBe('2026-10-31');
    expect(previousDayKey('2026-11-02')).toBe('2026-11-01');
  });
});

describe('localDayKey', () => {
  it('reads the local calendar day rather than the UTC one', () => {
    const date = new Date(2026, 7, 15, 13, 45);
    expect(localDayKey(date)).toBe('2026-08-15');
  });

  it('pads a single-digit month and day', () => {
    expect(localDayKey(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });
});

describe('advanceDailyStreak', () => {
  it('starts a new account at one', () => {
    const next = advanceDailyStreak(progress(), '2026-08-15');
    expect(next.dailyStreak).toBe(1);
    expect(next.lastDailyDate).toBe('2026-08-15');
  });

  it('advances on consecutive days', () => {
    let current = progress();
    for (const day of ['2026-08-13', '2026-08-14', '2026-08-15']) {
      current = advanceDailyStreak(current, day);
    }
    expect(current.dailyStreak).toBe(3);
    expect(current.lastDailyDate).toBe('2026-08-15');
  });

  it('counts the second mode on the same day only once', () => {
    const og = advanceDailyStreak(
      progress({ dailyStreak: 4, lastDailyDate: '2026-08-14' }),
      '2026-08-15',
    );
    expect(og.dailyStreak).toBe(5);
    const go = advanceDailyStreak(og, '2026-08-15');
    expect(go).toBe(og);
  });

  it('is idempotent, so a retried finalize changes nothing', () => {
    const first = advanceDailyStreak(progress(), '2026-08-15');
    expect(advanceDailyStreak(first, '2026-08-15')).toBe(first);
    expect(advanceDailyStreak(advanceDailyStreak(first, '2026-08-15'), '2026-08-15')).toBe(first);
  });

  it('restarts at one after a missed day', () => {
    const next = advanceDailyStreak(
      progress({ dailyStreak: 9, lastDailyDate: '2026-08-12' }),
      '2026-08-15',
    );
    expect(next.dailyStreak).toBe(1);
    expect(next.lastDailyDate).toBe('2026-08-15');
  });

  it('leaves the streak alone when an older Daily is completed', () => {
    const current = progress({ dailyStreak: 6, lastDailyDate: '2026-08-15' });
    expect(advanceDailyStreak(current, '2026-08-10')).toBe(current);
    expect(advanceDailyStreak(current, '2026-08-14')).toBe(current);
  });

  it('restarts at one from a zeroed streak, whatever date is on record', () => {
    // What the SQL account reset leaves behind: dailyStreak zeroed, lastDailyDate intact.
    const reset = progress({ dailyStreak: 0, lastDailyDate: '2026-08-15' });
    const next = advanceDailyStreak(reset, '2026-08-15');
    expect(next.dailyStreak).toBe(1);
    expect(next.lastDailyDate).toBe('2026-08-15');
  });

  it('restarts at one for an undated streak', () => {
    const next = advanceDailyStreak(progress({ dailyStreak: 7 }), '2026-08-15');
    expect(next.dailyStreak).toBe(1);
    expect(next.lastDailyDate).toBe('2026-08-15');
  });

  it('refuses a malformed date rather than recording it', () => {
    const current = progress({ dailyStreak: 3, lastDailyDate: '2026-08-14' });
    expect(advanceDailyStreak(current, '')).toBe(current);
    expect(advanceDailyStreak(current, '2026-8-15')).toBe(current);
  });

  it('produces a record the progress schema still accepts', () => {
    expect(progressSchema.parse(advanceDailyStreak(progress(), '2026-08-15'))).toMatchObject({
      dailyStreak: 1,
      lastDailyDate: '2026-08-15',
    });
  });
});

describe('currentDailyStreak', () => {
  it('shows a streak finished today or yesterday', () => {
    expect(
      currentDailyStreak(progress({ dailyStreak: 5, lastDailyDate: '2026-08-15' }), '2026-08-15'),
    ).toBe(5);
    expect(
      currentDailyStreak(progress({ dailyStreak: 5, lastDailyDate: '2026-08-14' }), '2026-08-15'),
    ).toBe(5);
  });

  it('lapses a streak once a day has been missed', () => {
    expect(
      currentDailyStreak(progress({ dailyStreak: 5, lastDailyDate: '2026-08-13' }), '2026-08-15'),
    ).toBe(0);
    expect(
      currentDailyStreak(progress({ dailyStreak: 40, lastDailyDate: '2026-06-01' }), '2026-08-15'),
    ).toBe(0);
  });

  it('agrees with what the next completion will store', () => {
    const lapsed = progress({ dailyStreak: 5, lastDailyDate: '2026-08-13' });
    expect(currentDailyStreak(lapsed, '2026-08-15')).toBe(0);
    expect(advanceDailyStreak(lapsed, '2026-08-15').dailyStreak).toBe(1);
  });

  it('holds a streak dated ahead of the local day', () => {
    // Crossing a timezone westward can leave the last day ahead of today. That is not a
    // missed day and must not read as one.
    expect(
      currentDailyStreak(progress({ dailyStreak: 3, lastDailyDate: '2026-08-16' }), '2026-08-15'),
    ).toBe(3);
  });

  it('reads zero for an account that has never finished a Daily', () => {
    expect(currentDailyStreak(progress(), '2026-08-15')).toBe(0);
    expect(currentDailyStreak(progress({ dailyStreak: 4 }), '2026-08-15')).toBe(0);
  });
});

describe('progress record compatibility', () => {
  it('still parses a record written before lastDailyDate existed', () => {
    const before = {
      schemaVersion: 1,
      xp: 400,
      level: 4,
      dailyStreak: 0,
      revision: 12,
      solo: {},
      appliedRewards: { 'solo-reward:daily:2026-08-01:og:0': 40 },
      dailyEntitlements: { '2026-08-01:og': 'unlocked' },
    };
    const parsed = progressSchema.parse(before);
    expect(parsed.lastDailyDate).toBeUndefined();
    expect(parsed.dailyStreak).toBe(0);
  });

  it('rejects a lastDailyDate that is not a day key', () => {
    expect(
      progressSchema.safeParse({ ...defaultAccountProgress(), lastDailyDate: '15-08-2026' })
        .success,
    ).toBe(false);
  });
});
