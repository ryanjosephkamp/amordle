import { describe, expect, it } from 'vitest'
import { shouldAutoCenterFreshSoloKeyboard, shouldAutoCenterSoloKeyboard, shouldAutoCenterSoloKeyboardEntry } from './soloGameplayAutoCenter'

describe('solo gameplay keyboard auto-centering', () => {
  it('does not fire on the initial render or unchanged submitted-guess counts', () => {
    expect(shouldAutoCenterSoloKeyboard(undefined, 0)).toBe(false)
    expect(shouldAutoCenterSoloKeyboard(undefined, 2)).toBe(false)
    expect(shouldAutoCenterSoloKeyboard(1, 1)).toBe(false)
  })

  it('fires only after a valid submitted guess increases the count', () => {
    expect(shouldAutoCenterSoloKeyboard(0, 1)).toBe(true)
    expect(shouldAutoCenterSoloKeyboard(1, 2)).toBe(true)
    expect(shouldAutoCenterSoloKeyboard(2, 1)).toBe(false)
  })

  it('targets fresh playing solo games for a mobile-only pre-guess keyboard alignment', () => {
    expect(shouldAutoCenterFreshSoloKeyboard(0, true)).toBe(true)
    expect(shouldAutoCenterFreshSoloKeyboard(1, true)).toBe(false)
    expect(shouldAutoCenterFreshSoloKeyboard(0, false)).toBe(false)
  })

  it('targets playing solo games on entry and re-entry for mobile keyboard alignment', () => {
    expect(shouldAutoCenterSoloKeyboardEntry(true)).toBe(true)
    expect(shouldAutoCenterSoloKeyboardEntry(false)).toBe(false)
  })
})
