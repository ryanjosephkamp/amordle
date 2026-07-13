import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  MultiplayerLobby,
} from './MultiplayerLobby'
import type { MultiplayerLobbyRowViewModel } from './multiplayerViewModels'

function createLobbyRow(overrides: Partial<MultiplayerLobbyRowViewModel> = {}): MultiplayerLobbyRowViewModel {
  return {
    actionLabel: 'Join',
    canCancel: false,
    canJoin: true,
    claimBlocked: false,
    detailLabel: '5 letters · No time limit',
    hardModeLabel: 'Hard Mode off',
    hostLabel: 'Host player',
    id: 'lobby-1',
    mode: 'og',
    modeLabel: 'OG',
    scope: 'practice',
    scopeLabel: 'Practice Multiplayer',
    statusLabel: 'Waiting',
    timeLimitLabel: 'No time limit',
    title: 'Practice Multiplayer OG',
    updatedAt: '2026-06-26T22:40:00.000Z',
    ...overrides,
  }
}

describe('MultiplayerLobby', () => {
  it('renders joinable rows as direct Join actions with clear accessible copy', () => {
    const row = createLobbyRow()
    const html = renderToStaticMarkup(
      <MultiplayerLobby
        onJoinGame={() => undefined}
        onOpenGame={() => undefined}
        rows={[row]}
      />,
    )

    expect(html).toContain('data-action-target="join"')
    expect(html).toContain('aria-label="Join multiplayer match"')
    expect(html).toContain('>Join</button>')
    expect(html).not.toContain('Open to join')
    expect(html).not.toContain('Open public profile')
  })

  it('keeps own-lobby management and blocked rows on the open path', () => {
    const ownLobby = createLobbyRow({
      actionLabel: 'Manage lobby',
      canCancel: true,
      canJoin: false,
      id: 'own-lobby',
    })
    const signedOutLobby = createLobbyRow({
      actionLabel: 'Sign in to join',
      canJoin: false,
      id: 'signed-out-lobby',
    })
    const html = renderToStaticMarkup(
      <MultiplayerLobby
        onJoinGame={() => undefined}
        onOpenGame={() => undefined}
        rows={[ownLobby, signedOutLobby]}
      />,
    )

    expect(html.match(/data-action-target="open"/g)).toHaveLength(2)
    expect(html).toContain('Manage lobby')
    expect(html).toContain('Sign in to join')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('aria-label="Join multiplayer match" data-action-target="open"')
  })
})
