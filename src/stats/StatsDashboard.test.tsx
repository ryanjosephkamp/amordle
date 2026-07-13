import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createEmptyStatistics } from './statistics'
import { StatsDashboard } from './StatsDashboard'
import type { MultiplayerCompetitiveState } from '../multiplayer'

const COMPETITIVE: MultiplayerCompetitiveState = {
  customGames: [],
  rating: {
    profiles: [{
      bucket: 'multiplayer:og',
      draws: 1,
      gamesPlayed: 12,
      losses: 4,
      provisional: false,
      rating: 1324,
      updatedAt: '2026-07-09T12:00:00.000Z',
      userId: 'private-viewer-user-id',
      wins: 7,
    }],
    transactions: [],
  },
  results: [{
    bucket: 'multiplayer:og',
    mode: 'og',
    players: [],
    ranked: true,
    scope: 'practice',
    sourceMatchId: 'private-match-id',
    status: 'completed',
    summary: 'You won the ranked Practice match',
  }],
}

describe('StatsDashboard', () => {
  it('separates private stats, progression, local multiplayer cache, and public aggregate stats', () => {
    const html = renderToStaticMarkup(
      <StatsDashboard stats={createEmptyStatistics()} />,
    )

    expect(html).toContain('Statistics')
    expect(html).toContain('private player stats')
    expect(html).toContain('Stats separates private Solo gameplay')
    expect(html).toContain('Data sources')
    expect(html).toContain('Local-only environment')
    expect(html).toContain('Private by default')
    expect(html).toContain('Solo summary')
    expect(html).toContain('progression transparency')
    expect(html).toContain('Level, XP, and coins')
    expect(html).toContain('Multiplayer performance summary')
    expect(html).toContain('local multiplayer cache')
    expect(html).toContain('Rating buckets')
    expect(html).toContain('Live site snapshot')
    expect(html).toContain('public site stats')
    expect(html).toContain('Supabase is not configured')
    expect(html).toContain('og daily')
    expect(html.indexOf('og daily')).toBeGreaterThan(html.indexOf('Solo summary'))
    expect(html).toContain('Win rate by mode &amp; scope')
    expect(html.indexOf('Live site snapshot')).toBeGreaterThan(html.indexOf('Coins earned trend'))
    expect(html).not.toContain('Ranked Practice leaderboard')
    expect(html).not.toContain('Sign in to view public ranked Practice leaderboards')
    expect(html).not.toContain('Competitive multiplayer')
    expect(html).not.toContain('multiplayer ratings')
    expect(html).not.toContain('user_id')
    expect(html).not.toContain('email')
    expect(html).not.toContain('rating_transaction_id')
  })

  it('labels authenticated cloud sync and summarizes local multiplayer cache without raw ids', () => {
    const html = renderToStaticMarkup(
      <StatsDashboard
        authStatus="authenticated"
        competitiveMultiplayer={COMPETITIVE}
        stats={createEmptyStatistics()}
        viewerUserId="private-viewer-user-id"
      />,
    )

    expect(html).toContain('Cloud-synced account snapshot')
    expect(html).toContain('Local cached Elo tracks shown for this signed-in player')
    expect(html).toContain('Multiplayer results')
    expect(html).toContain('Rating changes')
    expect(html).not.toContain('private-viewer-user-id')
    expect(html).not.toContain('private-match-id')
    expect(html).not.toContain('user_id')
    expect(html).not.toContain('rating_transaction_id')
  })

  it('keeps chart accessibility tables visually hidden with the project helper', () => {
    const html = renderToStaticMarkup(
      <StatsDashboard stats={createEmptyStatistics()} />,
    )

    expect(html).toContain('<table class="brrrdle-visually-hidden">')
    expect(html).not.toContain('<table class="sr-only">')
    expect(html).toContain('<caption>Win rate by mode &amp; scope</caption>')
    expect(html).toContain('<caption>Recent activity</caption>')
  })
})
