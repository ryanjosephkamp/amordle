import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DashboardHome } from './DashboardHome'
import type { DashboardViewModel } from './dashboardViewModels'

function createDashboard(overrides: Partial<DashboardViewModel> = {}): DashboardViewModel {
  return {
    activeMultiplayer: [
      {
        actionLabel: 'Resume',
        actionTarget: {
          multiplayerSubtab: 'active',
          routeId: 'multiplayer',
          selectedMultiplayerGameId: 'match-1',
        },
        canResume: true,
        detailLabel: 'Round 2 · 5 letters',
        id: 'match-1',
        isViewerParticipant: true,
        mode: 'og',
        modeLabel: 'OG',
        opponentLabel: 'vs Player Two',
        ruleLabel: 'No clock',
        scope: 'daily',
        scopeLabel: 'Daily Multiplayer',
        status: 'playing',
        statusLabel: 'In progress',
        title: 'Daily Multiplayer OG',
        turnLabel: 'Your turn',
        updatedAt: '2026-06-14T05:15:00.000Z',
      },
    ],
    activeSolo: [
      {
        actionLabel: 'Resume',
        actionTarget: {
          routeId: 'solo',
          selectedSoloGameKey: 'practice-og',
          soloSubtab: 'active',
        },
        detailLabel: 'Ready for the next guess',
        key: 'practice-og',
        mode: 'og',
        modeLabel: 'OG',
        progressLabel: '2/6 guesses',
        scope: 'practice',
        scopeLabel: 'Practice Solo',
        title: 'Practice Solo OG',
        updatedAt: '2026-06-14T05:00:00.000Z',
        wordLength: 5,
        wordLengthLabel: '5 letters',
      },
    ],
    daily: [
      {
        actionLabel: 'Play now',
        actionTarget: { routeId: 'solo', soloSubtab: 'daily' },
        detailLabel: 'Daily Solo has refreshed.',
        id: 'daily-solo',
        ready: true,
        title: 'Daily Solo',
      },
      {
        actionLabel: 'Open daily',
        actionTarget: { multiplayerSubtab: 'daily', routeId: 'multiplayer' },
        detailLabel: 'Daily Multiplayer resets in 12h 00m (UTC).',
        id: 'daily-multiplayer',
        ready: false,
        title: 'Daily Multiplayer',
      },
    ],
    generatedAt: '2026-06-14T05:30:00.000Z',
    livePreview: [
      {
        actionLabel: 'Resume',
        actionTarget: {
          multiplayerSubtab: 'live',
          routeId: 'multiplayer',
          selectedMultiplayerGameId: 'match-1',
        },
        canResume: true,
        canSpectate: false,
        detailLabel: 'Participant-safe Live v1 preview.',
        id: 'match-1',
        mode: 'og',
        modeLabel: 'OG',
        opponentLabel: 'vs Player Two',
        rankingLabel: 'Unranked',
        ruleLabel: 'No clock',
        scope: 'daily',
        scopeLabel: 'Daily Multiplayer',
        title: 'Daily Multiplayer OG',
        turnLabel: 'Your turn',
        updatedAt: '2026-06-14T05:15:00.000Z',
        viewerRole: 'participant',
      },
    ],
    lobbyPreview: [
      {
        actionLabel: 'Join',
        actionTarget: {
          multiplayerSubtab: 'lobby',
          routeId: 'multiplayer',
          selectedMultiplayerGameId: 'lobby-1',
        },
        canCancel: false,
        canJoin: true,
        claimBlocked: false,
        detailLabel: 'Practice GO · 5 letters',
        hostLabel: 'Player One',
        id: 'lobby-1',
        mode: 'go',
        modeLabel: 'GO',
        scope: 'practice',
        scopeLabel: 'Practice Multiplayer',
        statusLabel: 'Waiting',
        timeLimitLabel: 'No clock',
        title: 'Practice Multiplayer GO',
        updatedAt: '2026-06-14T05:10:00.000Z',
      },
    ],
    quickActions: [
      {
        actionTarget: { routeId: 'solo', soloSubtab: 'daily' },
        attentionCount: 1,
        detailLabel: 'Daily Solo has refreshed.',
        id: 'daily-solo',
        label: 'Daily Solo',
      },
      {
        actionTarget: { multiplayerSubtab: 'lobby', routeId: 'multiplayer' },
        attentionCount: 1,
        detailLabel: 'Browse joinable lobbies.',
        id: 'lobby',
        label: 'Lobby',
      },
    ],
    recentMultiplayer: [
      {
        actionTarget: {
          historyFilters: { mode: 'all', player: 'multiplayer', scope: 'all' },
          routeId: 'history',
        },
        completedAt: '2026-06-14T04:30:00.000Z',
        detailLabel: '250 pts',
        id: 'result-1',
        mode: 'go',
        modeLabel: 'GO',
        outcomeLabel: 'Won',
        scope: 'daily',
        scopeLabel: 'Daily Multiplayer',
        summaryLabel: 'Won with 5/5 boards solved',
        title: 'Daily Multiplayer GO',
      },
    ],
    recentSolo: [
      {
        actionTarget: {
          historyFilters: { mode: 'all', player: 'solo', scope: 'all' },
          routeId: 'history',
        },
        attemptsLabel: '3/6 guesses',
        completedAt: '2026-06-14T04:00:00.000Z',
        gameId: 'solo-1',
        mode: 'og',
        modeLabel: 'OG',
        rewardLabel: '+50 XP',
        scope: 'daily',
        scopeLabel: 'Daily Solo',
        statusLabel: 'Won',
        title: 'Daily Solo OG',
        wordLabel: 'CRANE - 5 letters',
      },
    ],
    summary: {
      activeMultiplayerCount: 1,
      activeSoloCount: 1,
      liveGameCount: 1,
      openLobbyCount: 1,
      recentMultiplayerResultCount: 1,
      recentSoloResultCount: 1,
      restrictedLiveGameCount: 0,
      yourTurnMultiplayerCount: 1,
    },
    yourTurnMultiplayer: [],
    ...overrides,
  }
}

describe('DashboardHome', () => {
  it('renders the Home dashboard sections and projected summaries', () => {
    const html = renderToStaticMarkup(<DashboardHome dashboard={createDashboard()} onAction={() => undefined} />)

    expect(html).toContain('Dashboard')
    expect(html).toContain('Active Solo')
    expect(html).toContain('Active Multiplayer')
    expect(html).toContain('Your Turn')
    expect(html).toContain('Daily Status')
    expect(html).toContain('Daily Solo has refreshed.')
    expect(html).toContain('Practice Solo OG')
    expect(html).toContain('Daily Multiplayer OG')
    expect(html).toContain('Practice Multiplayer GO hosted by Player One')
    expect(html).toContain('Live v1')
    expect(html).toContain('Recent Results')
    expect(html).toContain('Daily Solo OG')
    expect(html).toContain('Won · 3/6 guesses')
    expect(html).toContain('Completed Jun 14, 2026')
    expect(html).not.toContain('<table')
    expect(html).not.toContain('min-w-[40rem]')
    expect(html).not.toContain('overflow-x-auto')
  })

  it('renders empty states without phantom dashboard content', () => {
    const html = renderToStaticMarkup(
      <DashboardHome
        dashboard={createDashboard({
          activeMultiplayer: [],
          activeSolo: [],
          livePreview: [],
          lobbyPreview: [],
          recentMultiplayer: [],
          recentSolo: [],
          summary: {
            activeMultiplayerCount: 0,
            activeSoloCount: 0,
            liveGameCount: 0,
            openLobbyCount: 0,
            recentMultiplayerResultCount: 0,
            recentSoloResultCount: 0,
            restrictedLiveGameCount: 0,
            yourTurnMultiplayerCount: 0,
          },
        })}
        onAction={() => undefined}
      />,
    )

    expect(html).toContain('No active Solo games.')
    expect(html).toContain('No active Multiplayer games.')
    expect(html).toContain('No open lobbies.')
    expect(html).toContain('No Live games.')
    expect(html).toContain('No recent results.')
  })
})
