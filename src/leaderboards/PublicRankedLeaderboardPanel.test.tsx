import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PublicRankedLeaderboardRow } from './publicRankedLeaderboard'
import {
  PublicRankedLeaderboardPanel,
  PublicRankedLeaderboardView,
} from './PublicRankedLeaderboardPanel'

const ROW: PublicRankedLeaderboardRow = {
  accentColor: 'aurora',
  avatarUrl: 'https://example.invalid/public/avatar.png',
  bucket: 'multiplayer:go',
  displayName: 'Public Ada',
  draws: 2,
  flairKey: 'none',
  gamesPlayed: 20,
  latestRatingDelta: -8,
  latestRatingMovementAt: '2026-06-23T01:00:00.000Z',
  leaderboardKey: 'ranked-practice-v1',
  leaderboardUpdatedAt: '2026-06-23T01:05:00.000Z',
  losses: 5,
  peakRating: 1330,
  profileUpdatedAt: '2026-06-23T00:55:00.000Z',
  provisional: false,
  publicProfileId: '123e4567-e89b-42d3-a456-426614174000',
  rank: 2,
  rating: 1310,
  wins: 13,
}

describe('PublicRankedLeaderboardView', () => {
  it('renders the authenticated-only gate for signed-out players', () => {
    const html = renderToStaticMarkup(
      <PublicRankedLeaderboardView
        authStatus="anonymous"
        bucket="multiplayer:og"
        limit={50}
        rows={[]}
        status="idle"
      />,
    )

    expect(html).toContain('Ranked multiplayer leaderboard')
    expect(html).toContain('Sign in to view public ranked multiplayer leaderboards')
    expect(html).toContain('authenticated-only')
  })

  it('renders unavailable, loading, error, and empty states without private data', () => {
    const unavailable = renderToStaticMarkup(
      <PublicRankedLeaderboardView authStatus="unconfigured" bucket="multiplayer:og" limit={50} rows={[]} status="idle" />,
    )
    const loading = renderToStaticMarkup(
      <PublicRankedLeaderboardView authStatus="authenticated" bucket="multiplayer:og" limit={50} rows={[]} status="loading" />,
    )
    const error = renderToStaticMarkup(
      <PublicRankedLeaderboardView
        authStatus="authenticated"
        bucket="multiplayer:og"
        errorMessage="Unable to load the public ranked leaderboard right now."
        limit={50}
        rows={[]}
        status="error"
      />,
    )
    const empty = renderToStaticMarkup(
      <PublicRankedLeaderboardView authStatus="authenticated" bucket="multiplayer:og" limit={50} rows={[]} status="ready" />,
    )

    expect(unavailable).toContain('Supabase is not configured')
    expect(loading).toContain('Loading public ranked leaderboard')
    expect(error).toContain('Unable to load the public ranked leaderboard right now')
    expect(empty).toContain('No public ranked multiplayer rows yet')
    for (const html of [unavailable, loading, error, empty]) {
      expect(html).not.toContain('email')
      expect(html).not.toContain('user_id')
      expect(html).not.toContain('rating_transaction_id')
      expect(html).not.toContain('match_id')
      expect(html).not.toContain('queue_id')
    }
  })

  it('renders Practice/Daily OG/GO bucket filters, row limits, rank bands, and public-safe leaderboard rows', () => {
    const html = renderToStaticMarkup(
      <PublicRankedLeaderboardView
        authStatus="authenticated"
        bucket="multiplayer:go"
        limit={25}
        rows={[ROW]}
        status="ready"
      />,
    )

    expect(html).not.toContain('All buckets')
    expect(html).not.toContain('All ranked Practice buckets')
    expect(html).toContain('Practice OG')
    expect(html).toContain('Practice GO')
    expect(html).toContain('Daily OG')
    expect(html).toContain('Daily GO')
    expect(html).toContain('Top 25')
    expect(html).toContain('Top 50')
    expect(html).toContain('Top 100')
    expect(html).toContain('Public Ada')
    expect(html).toContain('GO ranked Practice')
    expect(html).toContain('#2')
    expect(html).toContain('1310')
    expect(html).toContain('Gold band')
    expect(html).toContain('13-5-2')
    expect(html).toContain('Established')
    expect(html).toContain('-8 from last settlement')
    expect(html).toContain('Peak 1330')
    expect(html).toContain('Rank bands are display labels for current Elo ranges')
    expect(html).not.toContain('1,310')
    expect(html).not.toContain('Peak 1,330')
    expect(html).not.toContain(ROW.publicProfileId)
    expect(html).not.toContain('raw_user_meta_data')
    expect(html).not.toContain('raw_rating_transaction_id')
  })

  it('renders provisional rows with a no-movement label', () => {
    const html = renderToStaticMarkup(
      <PublicRankedLeaderboardView
        authStatus="authenticated"
        bucket="multiplayer:og"
        limit={50}
        rows={[{
          ...ROW,
          latestRatingDelta: 0,
          latestRatingMovementAt: undefined,
          peakRating: 1200,
          provisional: true,
          rank: 7,
          rating: 1200,
        }]}
        status="ready"
      />,
    )

    expect(html).toContain('Provisional')
    expect(html).toContain('Silver band')
    expect(html).toContain('No settled movement yet')
    expect(html).toContain('Peak 1200')
    expect(html).not.toContain('Peak 1,200')
  })

  it('renders clickable safe leaderboard identity without exposing the public profile id in markup', () => {
    const html = renderToStaticMarkup(
      <PublicRankedLeaderboardView
        authStatus="authenticated"
        bucket="multiplayer:go"
        limit={25}
        onOpenPublicProfile={() => undefined}
        rows={[ROW]}
        status="ready"
      />,
    )

    expect(html).toContain('Open public profile for Public Ada')
    expect(html).toContain('<button')
    expect(html).toContain('Public Ada')
    expect(html).not.toContain(ROW.publicProfileId)
    expect(html).not.toContain('user_id')
    expect(html).not.toContain('email')
  })
})

describe('PublicRankedLeaderboardPanel', () => {
  it('does not call for a repository in the signed-out static render path', () => {
    const html = renderToStaticMarkup(<PublicRankedLeaderboardPanel authStatus="anonymous" />)

    expect(html).toContain('Sign in to view public ranked multiplayer leaderboards')
  })
})
