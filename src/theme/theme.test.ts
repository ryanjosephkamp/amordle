import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME,
  THEMES,
  applyTheme,
  getThemeMeta,
  isTheme,
  normalizeTheme,
  type Theme,
} from './theme'

describe('theme allow-list', () => {
  it('defaults to icy (the current look)', () => {
    expect(DEFAULT_THEME).toBe('icy')
    expect(THEMES).toContain(DEFAULT_THEME)
  })

  it('exposes exactly the four supported themes', () => {
    expect([...THEMES]).toEqual(['icy', 'classic', 'neon', 'country-flag'])
  })

  it('accepts only allow-listed theme slugs', () => {
    for (const theme of THEMES) {
      expect(isTheme(theme)).toBe(true)
    }
    expect(isTheme('rainbow')).toBe(false)
    expect(isTheme('')).toBe(false)
    expect(isTheme(undefined)).toBe(false)
    expect(isTheme(7)).toBe(false)
  })

  it('normalizes untrusted input to a valid theme', () => {
    expect(normalizeTheme('neon')).toBe('neon')
    expect(normalizeTheme('classic')).toBe('classic')
    expect(normalizeTheme('country-flag')).toBe('country-flag')
    expect(normalizeTheme('not-a-theme')).toBe(DEFAULT_THEME)
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME)
    expect(normalizeTheme({})).toBe(DEFAULT_THEME)
  })

  it('provides a label and description for every theme', () => {
    for (const theme of THEMES) {
      const meta = getThemeMeta(theme)
      expect(meta.label.length).toBeGreaterThan(0)
      expect(meta.description.length).toBeGreaterThan(0)
    }
  })
})

describe('applyTheme', () => {
  function fakeRoot() {
    const attributes = new Map<string, string>()
    return {
      attributes,
      removeAttribute(name: string) { attributes.delete(name) },
      setAttribute(name: string, value: string) { attributes.set(name, value) },
    }
  }

  it('removes the data-theme attribute for the default theme', () => {
    const root = fakeRoot()
    root.setAttribute('data-theme', 'neon')
    applyTheme('icy', root)
    expect(root.attributes.has('data-theme')).toBe(false)
  })

  it('reflects a non-default theme as a data-theme attribute', () => {
    const root = fakeRoot()
    applyTheme('neon', root)
    expect(root.attributes.get('data-theme')).toBe('neon')
  })

  it('coerces an invalid theme to the default (attribute removed)', () => {
    const root = fakeRoot()
    root.setAttribute('data-theme', 'neon')
    applyTheme('bogus' as Theme, root)
    expect(root.attributes.has('data-theme')).toBe(false)
  })

  it('is a no-op when no root is available', () => {
    expect(() => applyTheme('neon', undefined)).not.toThrow()
  })
})
