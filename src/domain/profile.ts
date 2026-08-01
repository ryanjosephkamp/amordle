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

export function resolveAccentColor(value: string): ResolvedAccentColor | null {
  const hex = normalizeAccentHex(value);
  if (!hex) return null;
  const dark = '#050708' as const;
  const light = '#FFFFFF' as const;
  const darkContrast = contrastRatio(hex, dark) ?? 0;
  const lightContrast = contrastRatio(hex, light) ?? 0;
  const foreground = darkContrast >= lightContrast ? dark : light;
  return {
    hex,
    foreground,
    contrastRatio: Math.max(darkContrast, lightContrast),
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
