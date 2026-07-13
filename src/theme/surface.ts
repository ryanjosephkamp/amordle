/**
 * Phase 21 — Surface theming foundation.
 *
 * A *surface theme* controls the app-shell backdrop (background, ambient
 * effects, animated canvas, custom cursor) independently of the accent palette
 * handled by `theme.ts`. This split keeps gameplay legibility constant while
 * letting Phase 22 introduce dramatic, swappable surfaces.
 *
 * The default surface is deliberately `minimal` (a very plain near-black grid)
 * so the baseline UI is clean and distraction-free. The original "Lunar Signal
 * Deck" treatment (radial signal glow, animated star/moon canvas, scan grid,
 * custom cursor) is preserved verbatim as the `lunar-signal` surface so Phase 22
 * can enable it as one selectable theme rather than the permanent default.
 *
 * Like `theme.ts`, this module is pure (no React, no I/O beyond the optional
 * `applySurfaceTheme` attribute write) so it is fully unit-testable. The active
 * surface is reflected onto the document root as a `data-surface` attribute; the
 * CSS that reacts to it lives in `src/index.css`.
 */

export const SURFACE_THEMES = ['minimal', 'lunar-signal'] as const
export type SurfaceTheme = (typeof SURFACE_THEMES)[number]

/** Clean minimalist backdrop — the Phase 21 default. */
export const DEFAULT_SURFACE_THEME: SurfaceTheme = 'minimal'

export interface SurfaceThemeMeta {
  readonly label: string
  readonly description: string
}

const SURFACE_THEME_META: Record<SurfaceTheme, SurfaceThemeMeta> = {
  'lunar-signal': {
    description: 'The animated Lunar Signal Deck backdrop with star field, moon, and signal glow.',
    label: 'Lunar Signal Deck',
  },
  minimal: {
    description: 'A clean, minimalist near-black surface with a faint static grid.',
    label: 'Minimal',
  },
}

/** True when the candidate is one of the allow-listed surface themes. */
export function isSurfaceTheme(candidate: unknown): candidate is SurfaceTheme {
  return typeof candidate === 'string' && (SURFACE_THEMES as readonly string[]).includes(candidate)
}

/**
 * Coerce untrusted input into a valid `SurfaceTheme`, falling back to the
 * minimalist default.
 */
export function normalizeSurfaceTheme(candidate: unknown): SurfaceTheme {
  return isSurfaceTheme(candidate) ? candidate : DEFAULT_SURFACE_THEME
}

/** Display metadata (label + description) for a surface theme. */
export function getSurfaceThemeMeta(theme: SurfaceTheme): SurfaceThemeMeta {
  return SURFACE_THEME_META[theme]
}

/**
 * Reflect the active surface theme onto the document root as a `data-surface`
 * attribute so the CSS overrides in `src/index.css` take effect. The default
 * surface removes the attribute entirely to keep the DOM clean. No-ops outside a
 * DOM (SSR / tests without a document) and accepts an explicit element for
 * testability.
 */
export function applySurfaceTheme(theme: SurfaceTheme, root: { setAttribute(name: string, value: string): void; removeAttribute(name: string): void } | undefined = typeof document !== 'undefined' ? document.documentElement : undefined): void {
  if (!root) {
    return
  }
  const normalized = normalizeSurfaceTheme(theme)
  if (normalized === DEFAULT_SURFACE_THEME) {
    root.removeAttribute('data-surface')
    return
  }
  root.setAttribute('data-surface', normalized)
}
