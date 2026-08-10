import { z } from 'zod';

export const accentNames = ['ice', 'aurora', 'cyan', 'violet', 'rose', 'amber'] as const;

export const accentNameSchema = z.enum(accentNames);

export type AccentName = z.infer<typeof accentNameSchema>;

export const defaultAccentName = 'aurora' satisfies AccentName;

export const accentHexSchema = z
  .string()
  .trim()
  .regex(/^#?[0-9a-f]{6}$/i, 'Enter a six-digit hex color such as #32BFA2.')
  .transform((value) => `#${value.replace(/^#/, '').toUpperCase()}`);

export type AccentSelection =
  { kind: 'named'; name: AccentName } | { kind: 'custom'; presetId: string; hex: string };

export interface ResolvedAccentColor {
  hex: string;
  foreground: '#050708' | '#FFFFFF';
  contrastRatio: number;
  light: ResolvedAccentMode;
  dark: ResolvedAccentMode;
}

export interface ResolvedAccentMode {
  accentText: string;
  accentSoft: string;
  /*
   * B2. Secondary text sitting on the accent-tinted surface. `--muted` is measured
   * against the page, not against `--accent-soft`, and a custom accent can lighten that
   * surface far enough in dark scheme to drop the pairing to 3.55:1. Derived from the
   * surface it actually paints on, the way keyInk already is.
   */
  accentSoftMuted: string;
  focus: string;
  keyBackground: string;
  keyBorder: string;
  keyInk: '#050708' | '#FFFFFF';
  keyContrastRatio: number;
}

export const flairNames = ['none', 'daily', 'combat'] as const;
export const flairNameSchema = z.enum(flairNames);
export type FlairName = z.infer<typeof flairNameSchema>;

export const flairLabels: Record<FlairName, string> = {
  none: 'No flair',
  daily: 'Daily player',
  combat: 'COMBAT player',
};

export const publicAvatarUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => value === '' || value.startsWith('https://'), {
    message: 'Use a secure https image URL.',
  });

export const accentLabels: Record<AccentName, string> = {
  ice: 'Ice',
  aurora: 'Aurora',
  cyan: 'Cyan',
  violet: 'Violet',
  rose: 'Rose',
  amber: 'Amber',
};

export const accentCssColors: Record<AccentName, string> = {
  ice: 'oklch(0.78 0.075 210)',
  aurora: 'oklch(0.72 0.13 170)',
  cyan: 'oklch(0.75 0.12 205)',
  violet: 'oklch(0.69 0.15 295)',
  rose: 'oklch(0.7 0.15 15)',
  amber: 'oklch(0.78 0.14 80)',
};

export function accentCssColor(value: AccentName | null | undefined): string {
  return accentCssColors[value ?? defaultAccentName];
}

export function profileAccentCss(
  value: AccentName | null | undefined,
  customHex?: string | null,
): string {
  return normalizeAccentHex(customHex ?? '') ?? accentCssColor(value);
}

export function normalizeAccentHex(value: string): string | null {
  const parsed = accentHexSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function hexChannel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
}

function linearizeSrgb(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hexValue: string): number | null {
  const hex = normalizeAccentHex(hexValue);
  if (!hex) return null;
  const red = linearizeSrgb(hexChannel(hex, 1));
  const green = linearizeSrgb(hexChannel(hex, 3));
  const blue = linearizeSrgb(hexChannel(hex, 5));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(firstHex: string, secondHex: string): number | null {
  const first = relativeLuminance(firstHex);
  const second = relativeLuminance(secondHex);
  if (first === null || second === null) return null;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function hexChannels(hexValue: string): [number, number, number] | null {
  const hex = normalizeAccentHex(hexValue);
  if (!hex) return null;
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function channelsToHex(channels: [number, number, number]): string {
  return `#${channels
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();
}

/** Mix `foreground` into `background` by a ratio from 0 to 1. */
export function mixHex(foreground: string, background: string, ratio: number): string | null {
  const first = hexChannels(foreground);
  const second = hexChannels(background);
  if (!first || !second || !Number.isFinite(ratio)) return null;
  const weight = Math.max(0, Math.min(1, ratio));
  return channelsToHex([
    first[0] * weight + second[0] * (1 - weight),
    first[1] * weight + second[1] * (1 - weight),
    first[2] * weight + second[2] * (1 - weight),
  ]);
}

function bestForeground(background: string): {
  color: '#050708' | '#FFFFFF';
  ratio: number;
} {
  const dark = '#050708' as const;
  const light = '#FFFFFF' as const;
  const darkContrast = contrastRatio(background, dark) ?? 0;
  const lightContrast = contrastRatio(background, light) ?? 0;
  return darkContrast >= lightContrast
    ? { color: dark, ratio: darkContrast }
    : { color: light, ratio: lightContrast };
}

function contrastSafeTint(color: string, background: string, minimum = 4.5): string {
  if ((contrastRatio(color, background) ?? 0) >= minimum) return color;
  const target = bestForeground(background).color;
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mixHex(target, color, step / 20) ?? target;
    if ((contrastRatio(candidate, background) ?? 0) >= minimum) return candidate;
  }
  return target;
}

function resolveAccentMode(
  hex: string,
  background: string,
  surface: string,
  muted: string,
  keyMix: number,
  borderMix: number,
): ResolvedAccentMode {
  const keyBackground = mixHex(hex, surface, keyMix) ?? surface;
  const keyForeground = bestForeground(keyBackground);
  const accentSoft = mixHex(hex, surface, 0.14) ?? surface;
  return {
    accentText: contrastSafeTint(hex, background),
    accentSoft,
    // Keeps `--muted` wherever it already clears 4.5:1, and only nudges it where it does not.
    accentSoftMuted: contrastSafeTint(muted, accentSoft),
    focus: contrastSafeTint(hex, background, 3),
    keyBackground,
    keyBorder: mixHex(hex, bestForeground(surface).color, borderMix) ?? hex,
    keyInk: keyForeground.color,
    keyContrastRatio: keyForeground.ratio,
  };
}

export function resolveAccentColor(value: string): ResolvedAccentColor | null {
  const hex = normalizeAccentHex(value);
  if (!hex) return null;
  const foreground = bestForeground(hex);
  return {
    hex,
    foreground: foreground.color,
    contrastRatio: foreground.ratio,
    // The muted values are the hex of `--muted` in each scheme (tui-shell.css:18, :153).
    light: resolveAccentMode(hex, '#F7F9FA', '#E7EEF0', '#434F55', 0.24, 0.58),
    dark: resolveAccentMode(hex, '#151A20', '#172127', '#8C989A', 0.28, 0.62),
  };
}

export function accentCssVariableMap(value: string): Record<string, string> | null {
  const resolved = resolveAccentColor(value);
  if (!resolved) return null;
  return {
    '--custom-accent': resolved.hex,
    '--custom-accent-ink': resolved.foreground,
    '--custom-accent-text-light': resolved.light.accentText,
    '--custom-accent-soft-light': resolved.light.accentSoft,
    '--custom-accent-soft-muted-light': resolved.light.accentSoftMuted,
    '--custom-focus-light': resolved.light.focus,
    '--custom-key-background-light': resolved.light.keyBackground,
    '--custom-key-border-light': resolved.light.keyBorder,
    '--custom-key-ink-light': resolved.light.keyInk,
    '--custom-accent-text-dark': resolved.dark.accentText,
    '--custom-accent-soft-dark': resolved.dark.accentSoft,
    '--custom-accent-soft-muted-dark': resolved.dark.accentSoftMuted,
    '--custom-focus-dark': resolved.dark.focus,
    '--custom-key-background-dark': resolved.dark.keyBackground,
    '--custom-key-border-dark': resolved.dark.keyBorder,
    '--custom-key-ink-dark': resolved.dark.keyInk,
  };
}

export const publicRatingBuckets = [
  'multiplayer:og',
  'multiplayer:go',
  'multiplayer:og:daily:v1',
  'multiplayer:go:daily:v1',
] as const;

export const publicRatingBucketSchema = z.enum(publicRatingBuckets);
export type PublicRatingBucket = z.infer<typeof publicRatingBucketSchema>;

export const publicRatingBucketLabels: Record<PublicRatingBucket, string> = {
  'multiplayer:og': 'Ranked Practice · OG',
  'multiplayer:go': 'Ranked Practice · GO',
  'multiplayer:og:daily:v1': 'Ranked Daily · OG',
  'multiplayer:go:daily:v1': 'Ranked Daily · GO',
};

/**
 * ANNOT-06.
 *
 * `multiplayer_rating_profiles.bucket` stores *storage* buckets (`async:*`), while the
 * application projection speaks *app* buckets (`multiplayer:*`). Private Stats reads
 * the table directly, so before this map every real lane fell through to the generic
 * "Ranked COMBAT" — SS-06 shows two distinct lanes both labelled that way.
 *
 * The mapping mirrors the database authority exactly:
 *   - `brrrdle_private.amordle_app_bucket`      (amordle_combat_authority_v3)
 *   - `public.phase55_ranked_app_bucket`        (phase55_ranked_daily_multiplayer)
 *   - `public.phase33_ranked_practice_app_bucket_for_storage_bucket`
 *
 * Legacy pre-v2 keys are retained because historical rating rows still carry them.
 */
export const ratingStorageBucketToAppBucket: Record<string, string> = {
  'async:og:amordle:v2': 'multiplayer:og',
  'async:go:amordle:v2': 'multiplayer:go',
  'async:og:timed:amordle:v2': 'multiplayer:og:timed:v1',
  'async:go:timed:amordle:v2': 'multiplayer:go:timed:v1',
  'async:og:daily:v1': 'multiplayer:og:daily:v1',
  'async:go:daily:v1': 'multiplayer:go:daily:v1',
  // Pre-v2 authority. Same lanes, earlier storage keys.
  'async:og': 'multiplayer:og',
  'async:go': 'multiplayer:go',
  'async:og:timed:v1': 'multiplayer:og:timed:v1',
  'async:go:timed:v1': 'multiplayer:go:timed:v1',
};

/** Timed lanes exist in the rating authority but are not part of any public projection. */
export const timedRatingBucketLabels: Record<string, string> = {
  'multiplayer:og:timed:v1': 'Ranked Practice · OG · 5-minute',
  'multiplayer:go:timed:v1': 'Ranked Practice · GO · 5-minute',
};

/*
 * v8-C. The ranked clock ladder, stated once.
 *
 * The database holds the same seven rows in `brrrdle_private.amordle_rating_bucket`,
 * which is the authority: a clock missing from there cannot be played whatever this
 * file says. This list exists so the lobby can offer the options and so a bucket name
 * can be read back into words, not to decide what is legal.
 */
export const rankedClockLadder = [
  { label: 'untimed', timeLimitMs: null, display: 'Untimed' },
  { label: '1m', timeLimitMs: 60_000, display: '1 minute per player' },
  { label: '3m', timeLimitMs: 180_000, display: '3 minutes per player' },
  { label: '5m', timeLimitMs: 300_000, display: '5 minutes per player' },
  { label: '10m', timeLimitMs: 600_000, display: '10 minutes per player' },
  { label: '20m', timeLimitMs: 1_200_000, display: '20 minutes per player' },
  { label: '45m', timeLimitMs: 2_700_000, display: '45 minutes per player' },
  /*
   * v8-D. Correspondence: a fresh allowance every turn rather than one budget for the
   * match. `clockKind` is the only thing that distinguishes them, and the database
   * carries the same flag on the bucket row.
   */
  { label: '1d', timeLimitMs: 86_400_000, display: '1 day per move' },
  { label: '3d', timeLimitMs: 259_200_000, display: '3 days per move' },
  { label: '7d', timeLimitMs: 604_800_000, display: '7 days per move' },
] as const;

const perMoveClocks = new Set(['1d', '3d', '7d']);

export function rankedClockKind(label: string): 'budget' | 'per_move' {
  return perMoveClocks.has(label) ? 'per_move' : 'budget';
}

export type RankedClockLabel = (typeof rankedClockLadder)[number]['label'];
export type RankedClockMs = (typeof rankedClockLadder)[number]['timeLimitMs'];

export function rankedClockFromMs(timeLimitMs: number | null) {
  return rankedClockLadder.find((entry) => entry.timeLimitMs === timeLimitMs) ?? null;
}

export interface RatingLane {
  /** App bucket key, or null when the storage key is not recognized. */
  appBucket: string | null;
  scope: 'practice' | 'daily' | 'unknown';
  mode: 'og' | 'go' | 'unknown';
  /** A ladder label, the legacy `5-minute`, or `unknown`. */
  clock: RankedClockLabel | '5-minute' | 'unknown';
  /** v8-D. Whether the clock is one budget for the match or a fresh one each turn. */
  clockKind: 'budget' | 'per_move';
  hardMode: boolean;
  label: string;
}

/*
 * v8-C. `async:<mode>:<clock>:<hard|std>:v4`.
 *
 * The bucket name is self-describing now, so one parser replaces the hand-written
 * ladders this file used to carry. The previous `resolveRatingLane` sniffed substrings
 * — `bucket.includes(':go')`, `bucket.includes(':daily:')` — which could not express a
 * clock at all and would have reported `async:og:10m:hard:v4` as an OG untimed lane
 * with a straight face.
 */
const v4Bucket = /^async:(og|go):([a-z0-9]+):(std|hard):v4$/;

function parseV4Bucket(bucket: string): RatingLane | null {
  const match = v4Bucket.exec(bucket);
  if (!match) return null;
  const [, mode, clockLabel, hardness] = match;
  const clock = rankedClockLadder.find((entry) => entry.label === clockLabel);
  if (!clock) return null;
  const hardMode = hardness === 'hard';
  return {
    appBucket: `multiplayer:${mode}:${clockLabel}:${hardness}`,
    scope: 'practice',
    mode: mode as 'og' | 'go',
    clock: clock.label,
    clockKind: rankedClockKind(clock.label),
    hardMode,
    label: [
      'Ranked Practice',
      (mode as string).toUpperCase(),
      clock.timeLimitMs === null ? 'Untimed' : clock.display.replace(' per player', ''),
      hardMode ? 'Hard Mode' : null,
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

/**
 * Resolves a storage *or* app bucket into a labelled lane. An unrecognized key is
 * reported as such rather than collapsed into a plausible-looking label — a truthful
 * gap beats a confident wrong answer.
 */
export function resolveRatingLane(bucket: string): RatingLane {
  const v4 = parseV4Bucket(bucket);
  if (v4) return v4;
  const appBucket = ratingStorageBucketToAppBucket[bucket] ?? bucket;
  const publicMatch = publicRatingBucketSchema.safeParse(appBucket);
  if (publicMatch.success) {
    const daily = appBucket.includes(':daily:');
    return {
      appBucket,
      scope: daily ? 'daily' : 'practice',
      mode: appBucket.includes(':go') ? 'go' : 'og',
      clock: 'untimed',
      clockKind: 'budget',
      hardMode: false,
      label: publicRatingBucketLabels[publicMatch.data],
    };
  }
  const timedLabel = timedRatingBucketLabels[appBucket];
  if (timedLabel) {
    return {
      appBucket,
      scope: 'practice',
      mode: appBucket.includes(':go') ? 'go' : 'og',
      clock: '5-minute',
      clockKind: 'budget',
      hardMode: false,
      label: timedLabel,
    };
  }
  return {
    appBucket: null,
    scope: 'unknown',
    mode: 'unknown',
    clock: 'unknown',
    clockKind: 'budget',
    hardMode: false,
    label: `Ranked COMBAT · unrecognized lane (${bucket})`,
  };
}

export function ratingBucketLabel(bucket: string): string {
  return resolveRatingLane(bucket).label;
}
