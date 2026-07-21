export const DAILY_CALENDAR_START = '2025-01-01';
export const PAST_DAILY_UNLOCK_COST = 60;

export type DailyMode = 'og' | 'go';
export type DailyClock = 'local' | 'utc';

export function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function utcDateKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function dailyDateKey(clock: DailyClock, date: Date = new Date()): string {
  return clock === 'utc' ? utcDateKey(date) : localDateKey(date);
}

export function isCalendarDateAvailable(dateKey: string, todayKey: string): boolean {
  return (
    isDateKey(dateKey) &&
    isDateKey(todayKey) &&
    dateKey >= DAILY_CALENDAR_START &&
    dateKey <= todayKey
  );
}

export function pastDailyUnlockKey(mode: DailyMode, dateKey: string): string {
  if (!isDateKey(dateKey)) throw new RangeError('A valid Daily date key is required.');
  return `${mode}:${dateKey}`;
}

export function sanitizePastDailyUnlocks(value: unknown, todayKey: string): readonly string[] {
  if (!Array.isArray(value) || !isDateKey(todayKey)) return [];
  const safe = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const match = /^(og|go):(\d{4}-\d{2}-\d{2})$/.exec(item);
    if (!match) continue;
    const mode = match[1] as DailyMode;
    const dateKey = match[2];
    if (dateKey && dateKey < todayKey && isCalendarDateAvailable(dateKey, todayKey)) {
      safe.add(pastDailyUnlockKey(mode, dateKey));
    }
  }
  return [...safe].sort();
}

export function canAccessDaily(input: {
  readonly mode: DailyMode;
  readonly dateKey: string;
  readonly todayKey: string;
  readonly unlocked: readonly string[];
}): boolean {
  if (!isCalendarDateAvailable(input.dateKey, input.todayKey)) return false;
  if (input.dateKey === input.todayKey) return true;
  return sanitizePastDailyUnlocks(input.unlocked, input.todayKey).includes(
    pastDailyUnlockKey(input.mode, input.dateKey),
  );
}

export interface DailyClockGuard {
  readonly baselineWallMs: number;
  readonly baselineMonotonicMs: number;
  readonly lastGrantedWallMs: number;
}

export function createDailyClockGuard(wallMs: number, monotonicMs: number): DailyClockGuard {
  return { baselineWallMs: wallMs, baselineMonotonicMs: monotonicMs, lastGrantedWallMs: wallMs };
}

export function advanceDailyClockGuard(input: {
  readonly guard: DailyClockGuard;
  readonly wallMs: number;
  readonly monotonicMs: number;
  readonly maxSkewMs?: number;
}): { readonly guard: DailyClockGuard; readonly grantedWallMs: number; readonly clamped: boolean } {
  const maxSkewMs = input.maxSkewMs ?? 5 * 60_000;
  const elapsed = Math.max(0, input.monotonicMs - input.guard.baselineMonotonicMs);
  const expected = input.guard.baselineWallMs + elapsed;
  const wallIsPlausible = Math.abs(input.wallMs - expected) <= maxSkewMs;
  const candidate = wallIsPlausible ? input.wallMs : expected;
  const grantedWallMs = Math.max(input.guard.lastGrantedWallMs, candidate);
  return {
    guard: { ...input.guard, lastGrantedWallMs: grantedWallMs },
    grantedWallMs,
    clamped: !wallIsPlausible || grantedWallMs !== candidate,
  };
}

export function millisecondsUntilNextDay(date: Date, clock: DailyClock): number {
  const next = new Date(date.getTime());
  if (clock === 'utc') {
    next.setUTCHours(24, 0, 0, 0);
  } else {
    next.setHours(24, 0, 0, 0);
  }
  return Math.max(0, next.getTime() - date.getTime());
}

export function dailySeedNamespace(input: {
  readonly player: 'solo' | 'multiplayer';
  readonly lane?: 'unranked' | 'ranked';
  readonly mode: DailyMode;
  readonly dateKey: string;
  readonly version: string;
}): string {
  if (!isDateKey(input.dateKey)) throw new RangeError('A valid Daily date key is required.');
  return [
    input.version,
    input.player,
    'daily',
    input.lane ?? 'solo',
    input.mode,
    input.dateKey,
  ].join(':');
}
