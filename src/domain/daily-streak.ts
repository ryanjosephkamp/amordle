import type { AccountProgress } from './account-continuity';

export const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The player's local calendar day, which is how Daily puzzles are keyed. Callers must
 * defer this past the first render — computing it during SSR bakes in the server's day.
 */
export function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The calendar day before a day key. The arithmetic runs in UTC on the parsed parts so
 * that no local timezone or daylight-saving transition can shift the result — the key is
 * already a local day, and stepping it is pure calendar work.
 */
export function previousDayKey(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const previous = new Date(Date.UTC(year!, month! - 1, day! - 1));
  return previous.toISOString().slice(0, 10);
}

/**
 * Record a completed Daily against the streak, or return the snapshot untouched.
 *
 * Idempotency comes from the date rather than an operation id, which is deliberate: it
 * is the same property that makes finishing both the OG and the GO Daily on one day
 * count once, and that makes a retried finalize a no-op.
 */
export function advanceDailyStreak(progress: AccountProgress, dailyDate: string): AccountProgress {
  if (!DAY_KEY_PATTERN.test(dailyDate)) return progress;
  const last = progress.lastDailyDate;

  // A stored streak of zero always restarts at one, whatever date is on record. This is
  // what makes the SQL account reset correct without a forward migration: it zeroes
  // dailyStreak and cannot know about lastDailyDate.
  if (progress.dailyStreak === 0 || !last) {
    return { ...progress, dailyStreak: 1, lastDailyDate: dailyDate };
  }
  if (last === dailyDate) return progress;
  // Forward only. Completing an older Daily from the calendar pays its rewards but
  // cannot extend or repair the streak.
  if (last > dailyDate) return progress;
  if (last === previousDayKey(dailyDate)) {
    return { ...progress, dailyStreak: progress.dailyStreak + 1, lastDailyDate: dailyDate };
  }
  return { ...progress, dailyStreak: 1, lastDailyDate: dailyDate };
}

/**
 * The streak as it should be shown. A stored streak is only current while its last day
 * is today or yesterday; past that the player has missed a day and it has lapsed.
 * Without this the panel would show a stale number to somebody who stopped a month ago,
 * and `advanceDailyStreak` restarts at one on their next Daily, so the two agree.
 */
export function currentDailyStreak(progress: AccountProgress, todayKey: string): number {
  const last = progress.lastDailyDate;
  if (progress.dailyStreak === 0 || !last) return 0;
  // `>=` rather than an equality pair: a player who crosses a timezone westward can hold
  // a last day that is ahead of their own today, and that is not a lapse.
  return last >= previousDayKey(todayKey) ? progress.dailyStreak : 0;
}
