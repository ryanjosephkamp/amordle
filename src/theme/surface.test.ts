import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SURFACE_THEME,
  SURFACE_THEMES,
  applySurfaceTheme,
  getSurfaceThemeMeta,
  isSurfaceTheme,
  normalizeSurfaceTheme,
  type SurfaceTheme,
} from './surface'

describe('surface theme allow-list', () => {
  it('defaults to the minimalist surface', () => {
    expect(DEFAULT_SURFACE_THEME).toBe('minimal')
    expect(SURFACE_THEMES).toContain(DEFAULT_SURFACE_THEME)
  })

  it('exposes exactly the supported surfaces', () => {
    expect([...SURFACE_THEMES]).toEqual(['minimal', 'lunar-signal'])
  })

  it('accepts only allow-listed surface slugs', () => {
    for (const surface of SURFACE_THEMES) {
      expect(isSurfaceTheme(surface)).toBe(true)
    }
    expect(isSurfaceTheme('aurora')).toBe(false)
    expect(isSurfaceTheme('')).toBe(false)
    expect(isSurfaceTheme(undefined)).toBe(false)
    expect(isSurfaceTheme(7)).toBe(false)
  })

  it('normalizes untrusted input to a valid surface', () => {
    expect(normalizeSurfaceTheme('lunar-signal')).toBe('lunar-signal')
    expect(normalizeSurfaceTheme('minimal')).toBe('minimal')
    expect(normalizeSurfaceTheme('not-a-surface')).toBe(DEFAULT_SURFACE_THEME)
    expect(normalizeSurfaceTheme(null)).toBe(DEFAULT_SURFACE_THEME)
    expect(normalizeSurfaceTheme({})).toBe(DEFAULT_SURFACE_THEME)
  })

  it('exposes display metadata for every surface', () => {
    for (const surface of SURFACE_THEMES) {
      const meta = getSurfaceThemeMeta(surface)
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.description.length).toBeGreaterThan(0)
    }
  })
})

describe('applySurfaceTheme', () => {
  function createFakeRoot() {
    const attributes = new Map<string, string>()
    return {
      attributes,
      removeAttribute(name: string) {
        attributes.delete(name)
      },
      setAttribute(name: string, value: string) {
        attributes.set(name, value)
      },
    }
  }

  it('removes the attribute for the default surface to keep the DOM clean', () => {
    const root = createFakeRoot()
    root.setAttribute('data-surface', 'lunar-signal')
    applySurfaceTheme('minimal', root)
    expect(root.attributes.has('data-surface')).toBe(false)
  })

  it('writes the attribute for non-default surfaces', () => {
    const root = createFakeRoot()
    applySurfaceTheme('lunar-signal', root)
    expect(root.attributes.get('data-surface')).toBe('lunar-signal')
  })

  it('coerces invalid input through the normalizer', () => {
    const root = createFakeRoot()
    applySurfaceTheme('bogus' as SurfaceTheme, root)
    expect(root.attributes.has('data-surface')).toBe(false)
  })

  it('no-ops when no root is available', () => {
    expect(() => applySurfaceTheme('lunar-signal', undefined)).not.toThrow()
  })
})
