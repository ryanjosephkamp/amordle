import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HelpPanel } from './HelpPanel'

describe('HelpPanel', () => {
  it('keeps Help as a transitional placeholder without persistence or mutation controls', () => {
    const html = renderToStaticMarkup(<HelpPanel />)

    expect(html).toContain('Help and tutorials')
    expect(html).toContain('being rebuilt into a clearer beginner guide')
    expect(html).toContain('Guide under construction')
    expect(html).toContain('does not save settings, claim a Daily game, join a queue, create a match, or change gameplay')
    expect(html).not.toContain('Quick route guide')
    expect(html).not.toContain('A safe first run')
    expect(html).not.toContain('Elo and ranks are display-only explanations')
    expect(html).not.toContain('Public and guest Live spectator surfaces are read-only')
  })

  it('renders route buttons only when a route handler is provided', () => {
    const staticHtml = renderToStaticMarkup(<HelpPanel />)
    const navigableHtml = renderToStaticMarkup(<HelpPanel onNavigate={() => undefined} />)

    expect(staticHtml).not.toContain('Open Multiplayer')
    expect(navigableHtml).toContain('Open Settings')
    expect(navigableHtml).toContain('Open About')
    expect(navigableHtml).toContain('Send Feedback')
  })
})
