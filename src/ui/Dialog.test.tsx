import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { Dialog } from './Dialog'

describe('Wave 01 Dialog contract', () => {
  test('renders an explicitly named and described modal surface', () => {
    const markup = renderToStaticMarkup(
      <Dialog
        description="Sanitized dialog description."
        isOpen
        onClose={() => undefined}
        title="Foundation dialog"
      >
        <input data-dialog-initial-focus aria-label="Initial field" />
      </Dialog>,
    )

    expect(markup).toContain('role="dialog"')
    expect(markup).toContain('aria-modal="true"')
    expect(markup).toMatch(/aria-labelledby="[^"]+"/u)
    expect(markup).toMatch(/aria-describedby="[^"]+"/u)
    expect(markup).toContain('tabindex="-1"')
    expect(markup).toContain('data-dialog-initial-focus="true"')
    expect(markup).toContain('aria-label="Close dialog"')
    expect(markup).toContain('overflow-x-hidden')
  })

  test('does not render a closed Dialog', () => {
    const markup = renderToStaticMarkup(
      <Dialog isOpen={false} onClose={() => undefined} title="Closed dialog">
        <p>Hidden content</p>
      </Dialog>,
    )

    expect(markup).toBe('')
  })
})
