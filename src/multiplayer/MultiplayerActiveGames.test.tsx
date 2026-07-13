import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MultiplayerActiveGames } from './MultiplayerActiveGames'
import type { MultiplayerActiveGameViewModel } from './multiplayerViewModels'

const activeGame: MultiplayerActiveGameViewModel = {
  actionLabel: 'Resume',
  canResume: true,
  detailLabel: 'Rival turn · 1 turn submitted',
  id: 'active-game-1',
  isViewerParticipant: true,
  mode: 'og',
  modeLabel: 'OG',
  opponentLabel: 'Rival player',
  ruleLabel: '5 letters · No time limit',
  scope: 'practice',
  scopeLabel: 'Practice Multiplayer',
  status: 'playing',
  statusLabel: 'In progress',
  title: 'Practice Multiplayer OG',
  turnLabel: 'Rival turn',
  updatedAt: '2026-06-23T04:25:00.000Z',
}

describe('MultiplayerActiveGames', () => {
  it('keeps resume and current-game state without the ambiguous Select action', () => {
    const html = renderToStaticMarkup(
      <MultiplayerActiveGames
        activeGames={[activeGame]}
        onResumeGame={() => undefined}
        selectedGameId="active-game-1"
      />,
    )

    expect(html).toContain('Resume')
    expect(html).toContain('aria-current="true"')
    expect(html).not.toContain('multiplayer-active-select-active-game-1')
    expect(html).not.toContain('Selected')
    expect(html).not.toContain('>Select<')
  })

  it('marks games where it is your turn with an accessible visual cue', () => {
    const html = renderToStaticMarkup(
      <MultiplayerActiveGames
        activeGames={[{ ...activeGame, turnLabel: 'Your turn' }]}
        onResumeGame={() => undefined}
      />,
    )

    expect(html).toContain('aria-label="Your turn in this multiplayer game"')
    expect(html).toContain('Your turn')
    expect(html).toContain('ring-cyan-200/20')
  })

  it('renders a participant opponent as a public-profile action only when a validated target exists', () => {
    const html = renderToStaticMarkup(
      <MultiplayerActiveGames
        activeGames={[{
          ...activeGame,
          opponentPublicProfileId: '22222222-2222-4222-8222-222222222222',
        }]}
        onOpenPublicProfile={() => undefined}
        onResumeGame={() => undefined}
      />,
    )

    expect(html).toContain('aria-label="Open public profile for Rival player"')
    expect(html).not.toContain('22222222-2222-4222-8222-222222222222')
  })
})
