import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SubtabBar } from './SubtabBar'

describe('SubtabBar', () => {
  it('renders accessible tab semantics with one active tab', () => {
    const html = renderToStaticMarkup(
      <SubtabBar
        activeId="daily"
        label="Solo sections"
        onSelect={() => undefined}
        options={[
          { id: 'overview', label: 'Overview' },
          { id: 'daily', label: 'Daily' },
          { id: 'practice', label: 'Practice' },
        ]}
      />,
    )

    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-label="Solo sections"')
    expect(html).toContain('role="tab"')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('tabindex="-1"')
  })

  it('renders optional attention badges as descriptions without changing tab names', () => {
    const html = renderToStaticMarkup(
      <SubtabBar
        activeId="overview"
        label="Multiplayer sections"
        onSelect={() => undefined}
        options={[
          { id: 'overview', label: 'Overview' },
          {
            attention: {
              ariaLabel: '2 Multiplayer games need your turn',
              label: '2',
              tone: 'urgent',
            },
            id: 'active',
            label: 'Active',
          },
        ]}
      />,
    )

    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-label="Active"')
    expect(html).toContain('aria-describedby="subtab-multiplayer-sections-active-attention"')
    expect(html).toContain('2 Multiplayer games need your turn')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-tone="urgent"')
  })

  it('marks active neutral badges so selected Live counts can use readable contrast', () => {
    const html = renderToStaticMarkup(
      <SubtabBar
        activeId="live"
        label="Multiplayer sections"
        onSelect={() => undefined}
        options={[
          { id: 'overview', label: 'Overview' },
          {
            attention: {
              ariaLabel: '3 Live v1 games visible to you',
              label: '3',
              tone: 'neutral',
            },
            id: 'live',
            label: 'Live',
          },
        ]}
      />,
    )

    expect(html).toContain('aria-label="Live"')
    expect(html).toContain('data-tone="neutral"')
    expect(html).toContain('data-active="true"')
    expect(html).toContain('3 Live v1 games visible to you')
  })

  it('marks an active Ready attention badge for the generic selected treatment', () => {
    const html = renderToStaticMarkup(
      <SubtabBar
        activeId="daily"
        label="Multiplayer sections"
        onSelect={() => undefined}
        options={[
          {
            attention: {
              ariaLabel: 'Daily Multiplayer is ready',
              label: 'Ready',
              tone: 'attention',
            },
            id: 'daily',
            label: 'Daily Multiplayer',
          },
        ]}
      />,
    )

    expect(html).toContain('data-active="true"')
    expect(html).toContain('>Ready</span>')
  })
})
