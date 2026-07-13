import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MultiplayerFoundationPanel } from './MultiplayerFoundationPanel'

describe('MultiplayerFoundationPanel', () => {
  it('renders a compatibility note for the active Multiplayer workspace', () => {
    const html = renderToStaticMarkup(<MultiplayerFoundationPanel />)

    expect(html).toContain('Multiplayer')
    expect(html).toContain('Practice and Daily Multiplayer now open from the Multiplayer workspace')
    expect(html).toContain('Calendar retained as the Daily hub')
    expect(html).not.toContain('Open multiplayer match')
    expect(html).not.toContain('Join multiplayer match')
  })
})
