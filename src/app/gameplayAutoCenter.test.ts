import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GAMEPLAY_AUTOCENTER_TARGETS,
  getGameplayAutoCenterBlock,
  getGameplayAutoCenterSelector,
  getMobileSoloKeyboardBottomCorrection,
  isGameplayAutoCenterMobileViewport,
  scheduleGameplayAutoCenter,
} from './gameplayAutoCenter'

afterEach(() => {
  vi.unstubAllGlobals()
})

function installAutoCenterGlobals(options: {
  readonly activeElement?: unknown
  readonly element?: unknown
  readonly mobile?: boolean
  readonly reducedMotion?: boolean
  readonly viewportHeight?: number
}) {
  const callbacks: Array<() => void> = []
  const body = {}
  const documentElement = {}
  const querySelector = vi.fn(() => options.element ?? null)
  const documentRef = {
    activeElement: options.activeElement,
    body,
    documentElement,
    querySelector,
  }
  const windowRef = {
    matchMedia: vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion')
        ? Boolean(options.reducedMotion)
        : query.includes('max-width')
          ? Boolean(options.mobile)
          : false,
    })),
    innerHeight: options.viewportHeight ?? 844,
    scrollBy: vi.fn(),
    setTimeout: vi.fn((callback: () => void) => {
      callbacks.push(callback)
      return 1
    }),
    visualViewport: options.viewportHeight ? { height: options.viewportHeight } : undefined,
  }

  vi.stubGlobal('document', documentRef)
  vi.stubGlobal('window', windowRef)

  return { body, callbacks, documentElement, querySelector, windowRef }
}

describe('scheduleGameplayAutoCenter', () => {
  it('is a safe no-op without browser globals', () => {
    vi.stubGlobal('document', undefined)
    vi.stubGlobal('window', undefined)

    expect(scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.solo)).toBe(false)
  })

  it('schedules a centered smooth scroll and safe focus for a rendered gameplay target', () => {
    const element = {
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    }
    const { callbacks, querySelector, windowRef } = installAutoCenterGlobals({ element })

    expect(scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.multiplayer)).toBe(true)
    expect(windowRef.setTimeout).toHaveBeenCalledTimes(1)
    expect(querySelector).not.toHaveBeenCalled()

    callbacks[0]?.()

    expect(querySelector).toHaveBeenCalledWith(getGameplayAutoCenterSelector(GAMEPLAY_AUTOCENTER_TARGETS.multiplayer))
    expect(element.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      behavior: 'smooth',
    })
    expect(element.focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('exposes a dedicated solo keyboard target for post-guess viewport comfort', () => {
    expect(getGameplayAutoCenterSelector(GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard)).toBe('[data-gameplay-autocenter-target="solo-keyboard"]')
  })

  it('aligns the solo keyboard to the viewport end on mobile', () => {
    const windowRef = {
      matchMedia: vi.fn((query: string) => ({ matches: query.includes('max-width') })),
    } as unknown as Window

    expect(isGameplayAutoCenterMobileViewport(windowRef)).toBe(true)
    expect(getGameplayAutoCenterBlock(GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard, windowRef)).toBe('end')
    expect(getGameplayAutoCenterBlock(GAMEPLAY_AUTOCENTER_TARGETS.solo, windowRef)).toBe('center')
  })

  it('computes the extra mobile scroll needed for full keyboard bottom clearance', () => {
    expect(getMobileSoloKeyboardBottomCorrection(853, 844)).toBe(25)
    expect(getMobileSoloKeyboardBottomCorrection(828, 844)).toBe(0)
  })

  it('keeps the solo keyboard centered on larger screens', () => {
    const windowRef = {
      matchMedia: vi.fn(() => ({ matches: false })),
    } as unknown as Window

    expect(getGameplayAutoCenterBlock(GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard, windowRef)).toBe('center')
  })

  it('uses auto scrolling when reduced motion is preferred', () => {
    const element = {
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    }
    const { callbacks } = installAutoCenterGlobals({ element, reducedMotion: true })

    scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.solo)
    callbacks[0]?.()

    expect(element.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      behavior: 'auto',
    })
  })

  it('uses immediate end alignment for scheduled mobile solo keyboard scrolling', () => {
    const element = {
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    }
    const { callbacks } = installAutoCenterGlobals({ element, mobile: true })

    scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard)
    callbacks[0]?.()

    expect(element.scrollIntoView).toHaveBeenCalledWith({
      block: 'end',
      behavior: 'auto',
    })
  })

  it('keeps larger-screen solo keyboard scrolling smooth', () => {
    const element = {
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    }
    const { callbacks } = installAutoCenterGlobals({ element, mobile: false })

    scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard)
    callbacks[0]?.()

    expect(element.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      behavior: 'smooth',
    })
  })

  it('rechecks clipped mobile solo keyboard bottom after the initial scroll', () => {
    const element = {
      focus: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({ bottom: 853 })),
      scrollIntoView: vi.fn(),
    }
    const { callbacks, windowRef } = installAutoCenterGlobals({
      element,
      mobile: true,
      viewportHeight: 844,
    })

    scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard, { mobileOnly: true })
    callbacks[0]?.()

    expect(element.scrollIntoView).toHaveBeenCalledWith({
      block: 'end',
      behavior: 'auto',
    })
    expect(callbacks).toHaveLength(4)

    callbacks[1]?.()

    expect(element.getBoundingClientRect).toHaveBeenCalled()
    expect(windowRef.scrollBy).toHaveBeenCalledWith({ behavior: 'auto', top: 25 })
  })

  it('skips mobile-only keyboard scrolling on larger screens', () => {
    const element = {
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    }
    const { callbacks, querySelector, windowRef } = installAutoCenterGlobals({ element, mobile: false })

    expect(scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard, { mobileOnly: true })).toBe(false)
    expect(windowRef.setTimeout).not.toHaveBeenCalled()
    expect(callbacks).toHaveLength(0)
    expect(querySelector).not.toHaveBeenCalled()
    expect(element.scrollIntoView).not.toHaveBeenCalled()
  })

  it('allows mobile-only keyboard scrolling on mobile screens', () => {
    const element = {
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    }
    const { callbacks, windowRef } = installAutoCenterGlobals({ element, mobile: true })

    expect(scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard, { mobileOnly: true })).toBe(true)
    expect(windowRef.setTimeout).toHaveBeenCalledTimes(1)
    callbacks[0]?.()

    expect(element.scrollIntoView).toHaveBeenCalledWith({
      block: 'end',
      behavior: 'auto',
    })
  })

  it('does not steal focus from an active input-like element', () => {
    const activeElement = { tagName: 'INPUT' }
    const element = {
      focus: vi.fn(),
      scrollIntoView: vi.fn(),
    }
    const { callbacks } = installAutoCenterGlobals({ activeElement, element })

    scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.solo)
    callbacks[0]?.()

    expect(element.scrollIntoView).toHaveBeenCalled()
    expect(element.focus).not.toHaveBeenCalled()
  })

  it('ignores stale routes where no gameplay anchor exists', () => {
    const { callbacks, querySelector } = installAutoCenterGlobals({})

    expect(scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.multiplayer)).toBe(true)
    callbacks[0]?.()

    expect(querySelector).toHaveBeenCalledWith(getGameplayAutoCenterSelector(GAMEPLAY_AUTOCENTER_TARGETS.multiplayer))
  })
})
