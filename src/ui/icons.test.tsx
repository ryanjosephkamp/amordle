import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { AmordleIcon, AMORDLE_ICON_NAMES } from './icons'

describe('Wave 01 icon wrapper', () => {
  test('exposes one bounded neutral icon vocabulary', () => {
    expect(AMORDLE_ICON_NAMES).toEqual([
      'play',
      'calendar',
      'users',
      'eye',
      'clock',
      'check-circle',
      'info',
      'alert',
      'lock',
      'settings',
      'help',
      'bell',
      'search',
      'chevron-down',
      'chevron-right',
      'close',
      'account',
    ])
  })

  test('hides decorative icons from assistive technology by default', () => {
    const markup = renderToStaticMarkup(createElement(AmordleIcon, { name: 'play' }))

    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('focusable="false"')
    expect(markup).not.toContain('aria-label=')
  })

  test('requires and renders an accessible label for a meaningful icon', () => {
    const markup = renderToStaticMarkup(createElement(AmordleIcon, {
      decorative: false,
      label: 'Connection information',
      name: 'info',
    }))

    expect(markup).toContain('aria-label="Connection information"')
    expect(markup).toContain('role="img"')
    expect(markup).not.toContain('aria-hidden=')
  })
})
