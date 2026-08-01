import { z } from 'zod';

export const accentNames = ['ice', 'aurora', 'cyan', 'violet', 'rose', 'amber'] as const;

export const accentNameSchema = z.enum(accentNames);

export type AccentName = z.infer<typeof accentNameSchema>;

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
  return accentCssColors[value ?? 'cyan'];
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
