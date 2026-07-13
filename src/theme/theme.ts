/**
 * Phase 19.5 — Light theming foundation.
 *
 * A theme is an accent/border palette only. Themes swap a small set of CSS
 * custom properties (the ice accent tokens + focus ring/glow) via a
 * `data-theme` attribute on the document root; the actual swaps live in
 * `src/index.css`. They deliberately do NOT change layout or the tile-state
 * colors (correct/present/absent), so gameplay legibility and contrast minima
 * are preserved across every theme (CONSTITUTION §7.1, §12.2).
 *
 * This module is pure (no React, no I/O beyond the optional `applyTheme`
 * attribute write) so it is fully unit-testable.
 */

export const THEMES = ['icy', 'classic', 'neon', 'country-flag'] as const
export type Theme = (typeof THEMES)[number]

/** Current look — keeps every existing player on today's palette. */
export const DEFAULT_THEME: Theme = 'icy'

export interface ThemeMeta {
  readonly label: string
  readonly description: string
}

const THEME_META: Record<Theme, ThemeMeta> = {
  classic: {
    description: 'A warm, classic word-game green accent.',
    label: 'Classic',
  },
  'country-flag': {
    description: 'A bold red, white, and blue accent.',
    label: 'Country flag',
  },
  icy: {
    description: 'The original cool ice-and-aurora palette.',
    label: 'Icy',
  },
  neon: {
    description: 'A vivid neon magenta-and-cyan accent.',
    label: 'Neon',
  },
}

/** True when the candidate is one of the allow-listed themes. */
export function isTheme(candidate: unknown): candidate is Theme {
  return typeof candidate === 'string' && (THEMES as readonly string[]).includes(candidate)
}

/**
 * Coerce untrusted input into a valid `Theme`, falling back to the default.
 * Used for both persisted guest settings and Supabase profile metadata.
 */
export function normalizeTheme(candidate: unknown): Theme {
  return isTheme(candidate) ? candidate : DEFAULT_THEME
}

/** Display metadata (label + description) for a theme. */
export function getThemeMeta(theme: Theme): ThemeMeta {
  return THEME_META[theme]
}

/**
 * Reflect the active theme onto the document root as a `data-theme` attribute
 * so the CSS variable overrides in `src/index.css` take effect. The default
 * theme removes the attribute entirely to keep the DOM clean. No-ops outside a
 * DOM (SSR / tests without a document) and accepts an explicit element for
 * testability.
 */
export function applyTheme(theme: Theme, root: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void } | undefined = typeof document !== 'undefined' ? document.documentElement : undefined): void {
  if (!root) {
    return
  }
  const normalized = normalizeTheme(theme)
  if (normalized === DEFAULT_THEME) {
    root.removeAttribute('data-theme')
    return
  }
  root.setAttribute('data-theme', normalized)
}
