import { describe, expect, it } from 'vitest';
import { matchDirectNavigationShortcut } from '@/application/keyboard-shortcuts';

function key(
  code: string,
  overrides: Partial<Parameters<typeof matchDirectNavigationShortcut>[0]> = {},
) {
  return {
    code,
    shiftKey: true,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    repeat: false,
    ...overrides,
  };
}

describe('physical keyboard navigation contract', () => {
  it('maps the six documented Shift chords to their canonical destinations', () => {
    expect(matchDirectNavigationShortcut(key('Digit1'))?.href).toBe('/');
    expect(matchDirectNavigationShortcut(key('Digit2'))?.href).toBe('/play/solo');
    expect(matchDirectNavigationShortcut(key('Digit3'))?.href).toBe('/calendar');
    expect(matchDirectNavigationShortcut(key('Digit4'))?.href).toBe('/combat');
    expect(matchDirectNavigationShortcut(key('Digit5'))?.href).toBe('/history');
    expect(matchDirectNavigationShortcut(key('KeyM'))?.id).toBe('menu');
  });

  it('does not claim plain, repeated, or browser-modified key events', () => {
    expect(matchDirectNavigationShortcut(key('KeyM', { shiftKey: false }))).toBeNull();
    expect(matchDirectNavigationShortcut(key('Digit1', { repeat: true }))).toBeNull();
    expect(matchDirectNavigationShortcut(key('Digit1', { ctrlKey: true }))).toBeNull();
    expect(matchDirectNavigationShortcut(key('Digit1', { metaKey: true }))).toBeNull();
    expect(matchDirectNavigationShortcut(key('Digit1', { altKey: true }))).toBeNull();
  });
});
