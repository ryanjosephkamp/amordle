import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Keyboard } from './Keyboard'

describe('Keyboard', () => {
  it('exposes semantic letter states independently of presentation classes', () => {
    const html = renderToStaticMarkup(
      <Keyboard
        letterStates={{ a: 'absent', b: 'present', c: 'correct' }}
        onInput={() => undefined}
      />,
    )

    expect(html).toMatch(/aria-label="Enter A"[^>]*data-state="absent"/u)
    expect(html).toMatch(/aria-label="Enter B"[^>]*data-state="present"/u)
    expect(html).toMatch(/aria-label="Enter C"[^>]*data-state="correct"/u)
    expect(html).toMatch(/aria-label="Enter D"[^>]*data-state="unknown"/u)
  })

  it('disables only removed Practice letters while keeping actions available', () => {
    const html = renderToStaticMarkup(<Keyboard disabledLetters={['b', 'd']} onInput={() => undefined} />)
    expect(html).toContain('aria-label="Enter B"')
    expect(html).toMatch(/aria-label="Enter B"[^>]*disabled=""/)
    const aButton = html.match(/<button aria-label="Enter A"[^>]*>/)?.[0]
    expect(aButton).toBeDefined()
    expect(aButton).not.toContain('disabled=""')
    expect(html).toContain('aria-label="Submit guess"')
  })
})
