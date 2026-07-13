import { describe, expect, it } from 'vitest'
import {
  MULTIPLAYER_ELO_EXPECTED_SCORE_SCALE,
  MULTIPLAYER_ESTABLISHED_K,
  MULTIPLAYER_PROVISIONAL_K,
  applyRatedMatch,
  calculateRatingDelta,
  calculateExpectedScore,
  createEmptyRatingState,
  createInitialRatingProfile,
  getRankedDailyRatingBucket,
  getRankedDailyStorageBucket,
  getRankedPracticeRatingBucket,
  getRankedPracticeStorageBucket,
  getMultiplayerRankBand,
  getRatedMatchEligibility,
  getRatingBucket,
  getRatingKFactor,
  getTimedPracticeRatingBucket,
  normalizeRatingBucket,
  normalizeRankedPracticeTimeLimitMs,
  normalizeRatingProfile,
  normalizeRatingState,
  parseRatingBucket,
  TIMED_RANKED_PRACTICE_TIME_LIMIT_MS,
} from './rating'

describe('multiplayer rating model', () => {
  it('keeps independent buckets by game mode', () => {
    expect(getRatingBucket('og')).toBe('multiplayer:og')
    expect(getRatingBucket('go')).toBe('multiplayer:go')
    expect(getTimedPracticeRatingBucket('og')).toBe('multiplayer:og:timed:v1')
    expect(getTimedPracticeRatingBucket('go')).toBe('multiplayer:go:timed:v1')
    expect(getRankedPracticeRatingBucket('og', null)).toBe('multiplayer:og')
    expect(getRankedPracticeRatingBucket('go', TIMED_RANKED_PRACTICE_TIME_LIMIT_MS)).toBe('multiplayer:go:timed:v1')
    expect(getRankedPracticeRatingBucket('og', 30_000)).toBeUndefined()
    expect(getRankedPracticeStorageBucket('multiplayer:og:timed:v1')).toBe('async:og:timed:v1')
    expect(getRankedDailyRatingBucket('og')).toBe('multiplayer:og:daily:v1')
    expect(getRankedDailyRatingBucket('go')).toBe('multiplayer:go:daily:v1')
    expect(getRankedDailyStorageBucket('multiplayer:og:daily:v1')).toBe('async:og:daily:v1')
    expect(getRankedDailyStorageBucket('multiplayer:go:daily:v1')).toBe('async:go:daily:v1')
  })

  it('normalizes only the canonical timed Practice ranked clock', () => {
    expect(normalizeRankedPracticeTimeLimitMs(null)).toBeNull()
    expect(normalizeRankedPracticeTimeLimitMs(undefined)).toBeNull()
    expect(normalizeRankedPracticeTimeLimitMs(0)).toBeNull()
    expect(normalizeRankedPracticeTimeLimitMs(TIMED_RANKED_PRACTICE_TIME_LIMIT_MS)).toBe(TIMED_RANKED_PRACTICE_TIME_LIMIT_MS)
    expect(normalizeRankedPracticeTimeLimitMs(30_000)).toBeUndefined()
    expect(normalizeRankedPracticeTimeLimitMs(300_000.5)).toBeUndefined()
    expect(normalizeRankedPracticeTimeLimitMs('300000')).toBeUndefined()
  })

  it('uses provisional and established K factors', () => {
    expect(getRatingKFactor(createInitialRatingProfile('user-a', 'multiplayer:og'))).toBe(MULTIPLAYER_PROVISIONAL_K)
    expect(getRatingKFactor({ gamesPlayed: 9, provisional: false })).toBe(MULTIPLAYER_PROVISIONAL_K)
    expect(getRatingKFactor({ gamesPlayed: 10, provisional: true })).toBe(MULTIPLAYER_ESTABLISHED_K)
    expect(getRatingKFactor({ gamesPlayed: 12, provisional: false })).toBe(MULTIPLAYER_ESTABLISHED_K)
  })

  it('calculates expected score from rating difference', () => {
    expect(MULTIPLAYER_ELO_EXPECTED_SCORE_SCALE).toBe(400)
    expect(calculateExpectedScore(1200, 1200)).toBeCloseTo(0.5)
    expect(calculateExpectedScore(1400, 1200)).toBeGreaterThan(0.75)
    expect(calculateExpectedScore(Number.NaN, 1200)).toBeCloseTo(0.5)
    expect(calculateExpectedScore(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)).toBeCloseTo(0.5)
    expect(calculateExpectedScore(10_000, -10_000)).toBeGreaterThan(0.99)
  })

  it('maps current rating to display-only rank bands at every threshold boundary', () => {
    expect(getMultiplayerRankBand(899)).toMatchObject({ id: 'learner', label: 'Learner' })
    expect(getMultiplayerRankBand(900)).toMatchObject({ id: 'bronze', label: 'Bronze' })
    expect(getMultiplayerRankBand(1099)).toMatchObject({ id: 'bronze', label: 'Bronze' })
    expect(getMultiplayerRankBand(1100)).toMatchObject({ id: 'silver', label: 'Silver' })
    expect(getMultiplayerRankBand(1299)).toMatchObject({ id: 'silver', label: 'Silver' })
    expect(getMultiplayerRankBand(1300)).toMatchObject({ id: 'gold', label: 'Gold' })
    expect(getMultiplayerRankBand(1499)).toMatchObject({ id: 'gold', label: 'Gold' })
    expect(getMultiplayerRankBand(1500)).toMatchObject({ id: 'platinum', label: 'Platinum' })
    expect(getMultiplayerRankBand(1699)).toMatchObject({ id: 'platinum', label: 'Platinum' })
    expect(getMultiplayerRankBand(1700)).toMatchObject({ id: 'diamond', label: 'Diamond' })
    expect(getMultiplayerRankBand(1899)).toMatchObject({ id: 'diamond', label: 'Diamond' })
    expect(getMultiplayerRankBand(1900)).toMatchObject({ id: 'master', label: 'Master' })
  })

  it('normalizes legacy buckets, stale provisional flags, and corrupt rating rows', () => {
    expect(normalizeRatingBucket('async:og')).toBe('multiplayer:og')
    expect(normalizeRatingBucket('live:go')).toBe('multiplayer:go')
    expect(normalizeRatingBucket('async:og:timed:v1')).toBe('multiplayer:og:timed:v1')
    expect(normalizeRatingBucket('multiplayer:go:timed:v1')).toBe('multiplayer:go:timed:v1')
    expect(parseRatingBucket('async:go:timed:v1')).toBe('multiplayer:go:timed:v1')
    expect(parseRatingBucket('async:og:daily:v1')).toBe('multiplayer:og:daily:v1')
    expect(parseRatingBucket('multiplayer:go:daily:v1')).toBe('multiplayer:go:daily:v1')

    const profile = normalizeRatingProfile({
      bucket: 'async:og',
      draws: 1.7,
      gamesPlayed: 10,
      losses: -4,
      provisional: true,
      rating: Number.NaN,
      updatedAt: '2026-06-04T12:00:00.000Z',
      userId: ' user-a ',
      wins: 3.2,
    })

    expect(profile).toMatchObject({
      bucket: 'multiplayer:og',
      draws: 1,
      gamesPlayed: 10,
      losses: 0,
      provisional: false,
      rating: 1200,
      userId: 'user-a',
      wins: 3,
    })

    const state = normalizeRatingState({
      transactions: [
        {
          bucket: 'live:go',
          expectedScore: 1.5,
          id: ' rating-row ',
          matchId: ' match-1 ',
          newRating: 1210.6,
          oldRating: 1200.4,
          opponentUserId: ' user-b ',
          outcome: 'win',
          ratingDelta: Number.NaN,
          userId: ' user-a ',
        },
      ],
    })

    expect(state.transactions[0]).toMatchObject({
      bucket: 'multiplayer:go',
      expectedScore: 1,
      id: 'rating-row',
      matchId: 'match-1',
      newRating: 1211,
      oldRating: 1200,
      opponentUserId: 'user-b',
      ratingDelta: 0,
      userId: 'user-a',
    })
  })

  it('drops malformed rating buckets instead of turning them into valid OG rows', () => {
    expect(normalizeRatingProfile({
      bucket: 'broken:og',
      draws: 0,
      gamesPlayed: 99,
      losses: 0,
      provisional: false,
      rating: 1999,
      updatedAt: '2026-06-04T12:00:00.000Z',
      userId: 'user-a',
      wins: 99,
    })).toBeUndefined()

    expect(normalizeRatingState({
      profiles: [{
        bucket: 'broken:og',
        gamesPlayed: 99,
        rating: 1999,
        userId: 'user-a',
      }],
      transactions: [{
        bucket: 'broken:og',
        expectedScore: 0.5,
        id: 'bad-transaction',
        matchId: 'match-1',
        newRating: 1999,
        oldRating: 1200,
        opponentUserId: 'user-b',
        outcome: 'win',
        ratingDelta: 799,
        userId: 'user-a',
      }],
    })).toEqual({ profiles: [], transactions: [] })
  })

  it('rejects unranked, anonymous, non-durable, and duplicate-user evidence', () => {
    const base = {
      authenticated: true,
      bucket: 'multiplayer:og' as const,
      durableResult: true,
      matchId: 'match-1',
      playerResults: [
        { outcome: 'win' as const, playerId: 'player-one', userId: 'user-a' },
        { outcome: 'loss' as const, playerId: 'player-two', userId: 'user-b' },
      ],
      ranked: true,
      terminalStatus: 'completed' as const,
    }

    expect(getRatedMatchEligibility({ ...base, ranked: false }).eligible).toBe(false)
    expect(getRatedMatchEligibility({ ...base, authenticated: false }).eligible).toBe(false)
    expect(getRatedMatchEligibility({ ...base, durableResult: false }).eligible).toBe(false)
    expect(getRatedMatchEligibility({ ...base, matchId: '   ' }).eligible).toBe(false)
    expect(getRatedMatchEligibility({
      ...base,
      playerResults: [
        { outcome: 'win', playerId: 'player-one', userId: 'user-a' },
        { outcome: 'loss', playerId: 'player-two', userId: 'user-a' },
      ],
    }).eligible).toBe(false)
    expect(getRatedMatchEligibility({
      ...base,
      playerResults: [
        { outcome: 'win', playerId: 'player-one', userId: ' user-a ' },
        { outcome: 'loss', playerId: 'player-two', userId: 'user-b' },
      ],
    }).eligible).toBe(false)
    expect(getRatedMatchEligibility({
      ...base,
      playerResults: [
        { outcome: 'win', playerId: 'player-one', userId: 'user-a' },
        { outcome: 'loss', playerId: 'player-one', userId: 'user-b' },
      ],
    }).eligible).toBe(false)
    expect(getRatedMatchEligibility({
      ...base,
      playerResults: [
        { outcome: 'win', playerId: 'player-one', userId: 'user-a' },
        { outcome: 'win', playerId: 'player-two', userId: 'user-b' },
      ],
    }).eligible).toBe(false)
    expect(getRatedMatchEligibility({
      ...base,
      playerResults: [
        { outcome: 'draw', playerId: 'player-one', userId: 'user-a' },
        { outcome: 'draw', playerId: 'player-two', userId: 'user-b' },
      ],
    }).eligible).toBe(true)
  })

  it('applies one idempotent rating transaction pair per match and bucket', () => {
    const evidence = {
      authenticated: true,
      bucket: 'multiplayer:og' as const,
      durableResult: true,
      matchId: 'match-1',
      playerResults: [
        { outcome: 'win' as const, playerId: 'player-one', userId: 'user-a' },
        { outcome: 'loss' as const, playerId: 'player-two', userId: 'user-b' },
      ],
      ranked: true,
      terminalStatus: 'completed' as const,
    }
    const first = applyRatedMatch(createEmptyRatingState(), evidence, '2026-06-04T12:00:00.000Z')
    expect(first.transactions).toHaveLength(2)
    expect(first.state.profiles.find((profile) => profile.userId === 'user-a')?.rating).toBe(1220)
    expect(first.state.profiles.find((profile) => profile.userId === 'user-b')?.rating).toBe(1180)

    const second = applyRatedMatch(first.state, evidence, '2026-06-04T12:01:00.000Z')
    expect(second.transactions).toHaveLength(0)
    expect(second.state.profiles.find((profile) => profile.userId === 'user-a')?.rating).toBe(1220)
  })

  it('keeps rating movement based on outcome and opponent strength rather than points', () => {
    const establishedFavorite = {
      ...createInitialRatingProfile('favorite', 'multiplayer:og'),
      gamesPlayed: 20,
      provisional: false,
      rating: 1600,
    }
    const establishedUnderdog = {
      ...createInitialRatingProfile('underdog', 'multiplayer:og'),
      gamesPlayed: 20,
      provisional: false,
      rating: 1200,
    }

    expect(calculateRatingDelta(establishedFavorite, establishedUnderdog, 'loss')).toBeLessThan(
      calculateRatingDelta(establishedFavorite, establishedUnderdog, 'win'),
    )
    expect(calculateRatingDelta(establishedUnderdog, establishedFavorite, 'win')).toBeGreaterThan(0)
  })
})
