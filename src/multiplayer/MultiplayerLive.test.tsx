import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MultiplayerLiveGameViewModel } from './multiplayerViewModels'
import { MultiplayerLive } from './MultiplayerLive'

function noop() {}

const liveGame: MultiplayerLiveGameViewModel = {
  actionLabel: 'Resume live game',
  canResume: true,
  canSpectate: false,
  detailLabel: 'Your turn · 2 turns submitted',
  id: 'live-game-1',
  mode: 'og',
  modeLabel: 'OG',
  opponentLabel: 'Rival',
  rankingLabel: 'Ranked',
  ruleLabel: '5 letters · No time limit',
  scope: 'practice',
  scopeLabel: 'Practice Multiplayer',
  title: 'Practice Multiplayer OG',
  turnLabel: 'Your turn',
  updatedAt: '2026-06-13T05:00:00.000Z',
  viewerRole: 'participant',
}

const spectatorGame: MultiplayerLiveGameViewModel = {
  actionLabel: 'Spectate live game',
  canResume: false,
  canSpectate: true,
  detailLabel: 'Read-only · 1 turn submitted',
  id: 'spectator-game-1',
  mode: 'og',
  modeLabel: 'OG',
  opponentLabel: 'Host vs Rival',
  rankingLabel: 'Unranked',
  ruleLabel: '5 letters · 5 minutes per side · Hard Mode',
  scope: 'practice',
  scopeLabel: 'Practice Multiplayer',
  spectatorDetails: {
    capabilityLabel: 'Read-only spectator view. Guessing, joining, forfeiting, cancelling, timers, ratings, and claims are unavailable.',
    moves: [
      {
        createdAt: '2026-06-13T05:01:00.000Z',
        guess: 'ROBOT',
        playerLabel: 'Host',
        puzzleLabel: 'Puzzle 1',
        tiles: [
          { letter: 'R', state: 'absent' },
          { letter: 'O', state: 'present' },
          { letter: 'B', state: 'absent' },
          { letter: 'O', state: 'correct' },
          { letter: 'T', state: 'correct' },
        ],
      },
    ],
    players: [
      { label: 'Host', profile: { displayName: 'Host player' }, seat: 'player-one' },
      { label: 'Rival', profile: { displayName: 'Rival player' }, seat: 'player-two' },
    ],
    progressLabel: '1 turn submitted',
    terminal: false,
  },
  title: 'Practice Multiplayer OG',
  turnLabel: "Rival's turn",
  updatedAt: '2026-06-13T05:02:00.000Z',
  viewerRole: 'spectator',
}

describe('MultiplayerLive', () => {
  it('renders an empty public state for anonymous viewers without public rows', () => {
    const html = renderToStaticMarkup(
      <MultiplayerLive liveGames={[]} onResumeGame={noop} restrictedGameCount={0} />,
    )

    expect(html).toContain('No public Live games visible right now.')
    expect(html).toContain('Eligible Practice Multiplayer games appear here')
  })

  it('renders participant-resumable Live rows', () => {
    const html = renderToStaticMarkup(
      <MultiplayerLive liveGames={[liveGame]} onResumeGame={noop} restrictedGameCount={0} viewerUserId="host-user" />,
    )

    expect(html).toContain('Practice Multiplayer')
    expect(html).toContain('Resume live game')
    expect(html).toContain('Your turn')
    expect(html).toContain('Ranked')
    expect(html).toContain('Live')
  })

  it('renders a participant opponent profile action without exposing its target value', () => {
    const html = renderToStaticMarkup(
      <MultiplayerLive
        liveGames={[{
          ...liveGame,
          opponentPublicProfileId: '22222222-2222-4222-8222-222222222222',
        }]}
        onOpenPublicProfile={() => undefined}
        onResumeGame={noop}
        restrictedGameCount={0}
        viewerUserId="host-user"
      />,
    )

    expect(html).toContain('aria-label="Open public profile for Rival"')
    expect(html).not.toContain('22222222-2222-4222-8222-222222222222')
  })

  it('renders authenticated spectator rows as read-only Live v1 details', () => {
    const html = renderToStaticMarkup(
      <MultiplayerLive liveGames={[spectatorGame]} onResumeGame={noop} onSelectGame={noop} restrictedGameCount={0} viewerUserId="spectator-user" />,
    )

    expect(html).toContain('Spectate live game')
    expect(html).toContain('aria-controls="live-spectator-details-spectator-game-1"')
    expect(html).toContain('aria-expanded="true"')
    expect(html).not.toContain('aria-label="Hide read-only spectator details')
    expect(html).toContain('Spectator view')
    expect(html).toContain('Read-only')
    expect(html).toContain('Unranked')
    expect(html).toContain('Host player')
    expect(html).toContain('Rival player')
    expect(html).toContain('Host · Puzzle 1')
    expect(html).toContain('aria-label="Host submitted ROBOT"')
    expect(html).not.toContain('Submit guess')
    expect(html).not.toContain('Forfeit')
    expect(html).not.toContain('Cancel game')
    expect(html).not.toContain('Join game')
    expect(html).not.toContain('Open public profile')
  })

  it('renders public spectator rows for anonymous viewers without mutation actions', () => {
    const html = renderToStaticMarkup(
      <MultiplayerLive liveGames={[spectatorGame]} onResumeGame={noop} onSelectGame={noop} restrictedGameCount={0} />,
    )

    expect(html).toContain('Spectate live game')
    expect(html).toContain('Spectator view')
    expect(html).toContain('Read-only')
    expect(html).toContain('Host player')
    expect(html).toContain('Rival player')
    expect(html).not.toContain('Resume live game')
    expect(html).not.toContain('Submit guess')
    expect(html).not.toContain('Forfeit')
    expect(html).not.toContain('Cancel game')
    expect(html).not.toContain('Join game')
    expect(html).not.toContain('Open public profile')
  })

  it('renders restricted messaging without exposing nonparticipant rows', () => {
    const html = renderToStaticMarkup(
      <MultiplayerLive liveGames={[]} onResumeGame={noop} restrictedGameCount={2} viewerUserId="host-user" />,
    )

    expect(html).toContain('No Live games visible right now.')
    expect(html).toContain('2 active games are hidden by Live privacy rules')
    expect(html).not.toContain('Resume live game')
  })
})
