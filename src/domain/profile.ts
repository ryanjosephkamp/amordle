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
  keyMix: number,
  borderMix: number,
): ResolvedAccentMode {
  const keyBackground = mixHex(hex, surface, keyMix) ?? surface;
  const keyForeground = bestForeground(keyBackground);
  return {
    accentText: contrastSafeTint(hex, background),
    accentSoft: mixHex(hex, surface, 0.14) ?? surface,
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
    light: resolveAccentMode(hex, '#F7F9FA', '#E7EEF0', 0.24, 0.58),
    dark: resolveAccentMode(hex, '#151A20', '#172127', 0.28, 0.62),
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
    '--custom-focus-light': resolved.light.focus,
    '--custom-key-background-light': resolved.light.keyBackground,
    '--custom-key-border-light': resolved.light.keyBorder,
    '--custom-key-ink-light': resolved.light.keyInk,
    '--custom-accent-text-dark': resolved.dark.accentText,
    '--custom-accent-soft-dark': resolved.dark.accentSoft,
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

export function ratingBucketLabel(bucket: string): string {
  const parsed = publicRatingBucketSchema.safeParse(bucket);
  return parsed.success ? publicRatingBucketLabels[parsed.data] : 'Ranked COMBAT';
}
