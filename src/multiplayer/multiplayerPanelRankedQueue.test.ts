import { describe, expect, it } from 'vitest'
import {
  buildFinalizedRankedGameFromStatus,
  buildRankedQueueRequestInput,
  getRankedQueueCreationIdempotencyKey,
  getRankedQueueFinalizationIdempotencyKey,
  withRankedQueueExpiry,
} from './multiplayerPanelRankedQueue'
import type { RankedQueueStatusResult } from './multiplayerRepository'

function createMatchedDailyStatus(overrides: Partial<RankedQueueStatusResult> = {}): RankedQueueStatusResult {
  return {
    dailyDateKey: '2026-07-10',
    hardMode: true,
    matchedAt: '2026-07-10T16:00:01.000Z',
    matchedGameId: 'ranked-daily-game-1',
    mode: 'og',
    playerOneUserId: 'user-1',
    playerTwoUserId: 'user-2',
    queuedAt: '2026-07-10T16:00:00.000Z',
    ratingBucket: 'multiplayer:og:daily:v1',
    requestId: 'queue-request-1',
    requestStatus: 'matched',
    scope: 'daily',
    viewerSeat: 'player-one',
    wordLength: 5,
    ...overrides,
  }
}

describe('ranked queue helper contract', () => {
  it('builds fixed-settings ranked Daily requests', () => {
    expect(buildRankedQueueRequestInput({
      dailyDateKey: '2026-07-10',
      hardMode: true,
      mode: 'go',
      scope: 'daily',
      wordLength: 5,
    })).toEqual({
      dailyDateKey: '2026-07-10',
      hardMode: true,
      mode: 'go',
      scope: 'daily',
      timeLimitMs: null,
      wordLength: 5,
    })
  })

  it('uses a deterministic participant-lane idempotency key for ranked Daily retries', () => {
    const request = buildRankedQueueRequestInput({
      dailyDateKey: '2026-07-10',
      hardMode: true,
      mode: 'go',
      scope: 'daily',
      wordLength: 5,
    })!

    expect(getRankedQueueCreationIdempotencyKey(request, 'user-1')).toBe(
      'phase55-ranked-daily-v1:queue:user-1:2026-07-10:go:true',
    )
    expect(getRankedQueueCreationIdempotencyKey({ ...request, scope: 'practice' }, 'user-1')).toBeUndefined()
  })

  it('uses the canonical next UTC midnight for ranked Daily expiry', () => {
    const request = buildRankedQueueRequestInput({
      dailyDateKey: '2026-07-10',
      hardMode: false,
      mode: 'og',
      scope: 'daily',
      wordLength: 5,
    })!

    expect(withRankedQueueExpiry(request, new Date('2026-07-10T23:59:59.999Z'))).toEqual({
      ...request,
      expiresAt: '2026-07-11T00:00:00.000Z',
    })
    expect(withRankedQueueExpiry({
      ...request,
      dailyDateKey: '2028-02-29',
    }, new Date('2028-02-29T00:00:00.000Z')).expiresAt).toBe('2028-03-01T00:00:00.000Z')
  })

  it('keeps the five-minute expiry for ranked Practice', () => {
    const request = buildRankedQueueRequestInput({
      hardMode: false,
      mode: 'og',
      scope: 'practice',
      timeLimitMs: null,
      wordLength: 7,
    })!

    expect(withRankedQueueExpiry(request, new Date('2026-07-10T23:59:59.999Z')).expiresAt).toBe(
      '2026-07-11T00:04:59.999Z',
    )
  })

  it('rejects ranked Daily requests with a clock, non-five-letter length, or missing UTC date', () => {
    expect(buildRankedQueueRequestInput({ hardMode: false, mode: 'og', scope: 'daily', wordLength: 5 })).toBeUndefined()
    expect(buildRankedQueueRequestInput({
      dailyDateKey: '2026-07-10',
      hardMode: false,
      mode: 'og',
      scope: 'daily',
      timeLimitMs: 300_000,
      wordLength: 5,
    })).toBeUndefined()
    expect(buildRankedQueueRequestInput({
      dailyDateKey: '2026-07-10',
      hardMode: false,
      mode: 'og',
      scope: 'daily',
      wordLength: 6,
    })).toBeUndefined()
  })

  it('builds a fixed-settings ranked Daily game from matched trusted status', () => {
    const status = createMatchedDailyStatus()

    expect(getRankedQueueFinalizationIdempotencyKey(status)).toBe('phase55-ranked-daily-v1:finalize:ranked-daily-game-1')
    expect(buildFinalizedRankedGameFromStatus({
      defaultDifficulty: 'standard',
      defaultGoPuzzleCount: 5,
      status,
    })).toMatchObject({
      dailyDateKey: '2026-07-10',
      difficulty: 'expert',
      hardMode: true,
      id: 'ranked-daily-game-1',
      mode: 'og',
      ranked: true,
      ratingBucket: 'multiplayer:og:daily:v1',
      scope: 'daily',
      wordLength: 5,
    })
  })

  it('uses one canonical ranked Daily difficulty regardless of either player default', () => {
    const status = createMatchedDailyStatus({ mode: 'go', ratingBucket: 'multiplayer:go:daily:v1' })
    const casual = buildFinalizedRankedGameFromStatus({
      defaultDifficulty: 'casual',
      defaultGoPuzzleCount: 7,
      status,
    })
    const standard = buildFinalizedRankedGameFromStatus({
      defaultDifficulty: 'standard',
      defaultGoPuzzleCount: 10,
      status,
    })

    expect(casual?.difficulty).toBe('expert')
    expect(casual?.goPuzzleCount).toBe(5)
    expect(casual?.serializedSession).toEqual(standard?.serializedSession)
  })

  it('fails closed for malformed ranked Daily status', () => {
    expect(buildFinalizedRankedGameFromStatus({
      defaultDifficulty: 'standard',
      defaultGoPuzzleCount: 5,
      status: createMatchedDailyStatus({ dailyDateKey: undefined }),
    })).toBeUndefined()
    expect(buildFinalizedRankedGameFromStatus({
      defaultDifficulty: 'standard',
      defaultGoPuzzleCount: 5,
      status: createMatchedDailyStatus({ timeLimitMs: 300_000 }),
    })).toBeUndefined()
  })
})
