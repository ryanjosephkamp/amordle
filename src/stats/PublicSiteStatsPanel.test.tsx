import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PublicSiteStats } from './siteStats'
import { PublicSiteStatsView } from './PublicSiteStatsPanel'

const SITE_STATS: PublicSiteStats = {
  generatedAt: '2026-07-03T16:20:00.000Z',
  leaderboardUpdatedAt: '2026-07-03T16:19:00.000Z',
  publicProfilesActive: 12,
  publicProfilesUpdatedAt: '2026-07-03T16:18:00.000Z',
  rankedPracticePublicGoPlayers: 6,
  rankedPracticePublicOgPlayers: 8,
  rankedPracticePublicPlayerResults: 44,
  rankedPracticePublicPlayers: 10,
  statsKey: 'site-stats-v1',
}

describe('PublicSiteStatsView', () => {
  it('renders unavailable, loading, and error states without private data', () => {
    const unavailable = renderToStaticMarkup(<PublicSiteStatsView status="idle" />)
    const loading = renderToStaticMarkup(<PublicSiteStatsView status="loading" />)
    const error = renderToStaticMarkup(<PublicSiteStatsView status="error" />)

    expect(unavailable).toContain('Supabase is not configured')
    expect(loading).toContain('Loading public site stats')
    expect(error).toContain('Unable to load public site stats right now')
    for (const html of [unavailable, loading, error]) {
      expect(html).not.toContain('user_id')
      expect(html).not.toContain('email')
      expect(html).not.toContain('queue_id')
      expect(html).not.toContain('token')
      expect(html).not.toContain('serialized_session')
    }
  })

  it('renders aggregate-only public stats and safe freshness labels', () => {
    const html = renderToStaticMarkup(<PublicSiteStatsView stats={SITE_STATS} status="ready" />)

    expect(html).toContain('Live site snapshot')
    expect(html).toContain('Active public profiles')
    expect(html).toContain('Ranked Practice players')
    expect(html).toContain('Ranked Practice results')
    expect(html).toContain('OG ranked players')
    expect(html).toContain('GO ranked players')
    expect(html).toContain('12')
    expect(html).toContain('44')
    expect(html).toContain('Leaderboard freshness')
    expect(html).toContain('Profile freshness')
    expect(html).not.toContain(SITE_STATS.statsKey)
    expect(html).not.toContain('user_id')
    expect(html).not.toContain('email')
    expect(html).not.toContain('rating_transaction_id')
    expect(html).not.toContain('private_match')
  })
})
