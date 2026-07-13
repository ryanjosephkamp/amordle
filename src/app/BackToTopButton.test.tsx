import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BackToTopButton } from './BackToTopButton'
import { shouldLiftBackToTopForGameplay, shouldShowBackToTop } from './backToTopState'

describe('BackToTopButton helpers', () => {
  it('only shows the back-to-top affordance after meaningful page scroll', () => {
    expect(shouldShowBackToTop({ documentHeight: 1100, scrollY: 400, viewportHeight: 760 })).toBe(false)
    expect(shouldShowBackToTop({ documentHeight: 1800, scrollY: 240, viewportHeight: 760 })).toBe(false)
    expect(shouldShowBackToTop({ documentHeight: 1800, scrollY: 360, viewportHeight: 760 })).toBe(true)
  })

  it('lifts the control away from a gameplay target occupying the bottom-right zone', () => {
    expect(shouldLiftBackToTopForGameplay({
      bottom: 780,
      left: 760,
      right: 1180,
      top: 420,
    }, 1200, 720)).toBe(true)

    expect(shouldLiftBackToTopForGameplay({
      bottom: 500,
      left: 80,
      right: 760,
      top: 160,
    }, 1200, 720)).toBe(false)
  })

  it('does not render during server-side output before browser scroll state is available', () => {
    expect(renderToStaticMarkup(<BackToTopButton />)).toBe('')
  })
})
