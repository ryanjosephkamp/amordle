import { describe, expect, it } from 'vitest'
import type { PublicRankedLeaderboardRow } from '../leaderboards/publicRankedLeaderboard'
import {
  createPublicProfileRatingMetadata,
  type PublicProfileRatingMetadata,
} from './publicProfileRatingMetadata'

const PROFILE_ID = '123e4567-e89b-42d3-a456-426614174000'

function row(overrides: Partial<PublicRankedLeaderboardRow> = {}): PublicRankedLeaderboardRow {
  return {
    accentColor: 'aurora',
    avatarUrl: 'https://example.invalid/public/avatar.png',
    bucket: 'multiplayer:og',
    displayName: 'Public Ada',
    draws: 1,
    flairKey: 'none',
    gamesPlayed: 12,
    latestRatingDelta: 18,
    latestRatingMovementAt: '2026-07-09T12:00:00.000Z',
    leaderboardKey: 'ranked-practice-v1',
    leaderboardUpdatedAt: '2026-07-09T12:05:00.000Z',
    losses: 3,
    peakRating: 1290,
    profileUpdatedAt: '2026-07-09T11:55:00.000Z',
    provisional: false,
    publicProfileId: PROFILE_ID,
    rank: 4,
    rating: 1260,
    wins: 8,
    ...overrides,
  }
}

function serialize(metadata: readonly PublicProfileRatingMetadata[]): string {
  return JSON.stringify(metadata)
}

describe('createPublicProfileRatingMetadata', () => {
  it('derives safe public ranked Practice and Daily labels for a public profile', () => {
    const metadata = createPublicProfileRatingMetadata([
      row(),
      row({
        bucket: 'multiplayer:go',
        draws: 0,
        gamesPlayed: 2,
        latestRatingDelta: 0,
        latestRatingMovementAt: undefined,
        losses: 1,
        peakRating: 1205,
        provisional: true,
        rank: 12,
        rating: 1205,
        wins: 1,
      }),
      row({
        bucket: 'multiplayer:og:daily:v1',
        publicProfileId: PROFILE_ID,
        rank: 6,
      }),
      row({
        bucket: 'multiplayer:go:daily:v1',
        publicProfileId: PROFILE_ID,
        rank: 7,
      }),
      row({
        displayName: 'Other Player',
        publicProfileId: '123e4567-e89b-42d3-a456-426614174001',
        rank: 1,
        rating: 1500,
      }),
    ], PROFILE_ID)
    const serialized = serialize(metadata)

    expect(metadata).toEqual([
      expect.objectContaining({
        bucketLabel: 'OG ranked Practice',
        latestMovementLabel: '+18 from last settlement',
        peakLabel: 'Peak 1290',
        provisionalLabel: 'Established',
        rankBandLabel: 'Silver',
        rankLabel: '#4',
        ratingLabel: '1260',
        recordLabel: '8-3-1',
      }),
      expect.objectContaining({
        bucketLabel: 'GO ranked Practice',
        latestMovementLabel: 'No settled movement yet',
        peakLabel: 'Peak 1205',
        provisionalLabel: 'Provisional',
        rankBandLabel: 'Silver',
        rankLabel: '#12',
        ratingLabel: '1205',
        recordLabel: '1-1-0',
      }),
      expect.objectContaining({
        bucketLabel: 'OG ranked Daily',
        rankLabel: '#6',
      }),
      expect.objectContaining({
        bucketLabel: 'GO ranked Daily',
        rankLabel: '#7',
      }),
    ])
    expect(serialized).not.toContain(PROFILE_ID)
    expect(serialized).not.toContain('123e4567-e89b-42d3-a456-426614174001')
    expect(serialized).not.toContain('publicProfileId')
    expect(serialized).not.toContain('user_id')
    expect(serialized).not.toContain('email')
    expect(serialized).not.toContain('match_id')
    expect(serialized).not.toContain('queue_id')
    expect(serialized).not.toContain('rating_transaction_id')
  })

  it('returns no metadata when the profile is absent from public leaderboard rows', () => {
    expect(createPublicProfileRatingMetadata([row()], '123e4567-e89b-42d3-a456-426614174002')).toEqual([])
    expect(createPublicProfileRatingMetadata([row()], undefined)).toEqual([])
  })
})
