import { z } from 'zod';

export const accentNames = ['ice', 'aurora', 'cyan', 'violet', 'rose', 'amber'] as const;

export const accentNameSchema = z.enum(accentNames);

export type AccentName = z.infer<typeof accentNameSchema>;

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
  return accentCssColors[value ?? 'ice'];
}
