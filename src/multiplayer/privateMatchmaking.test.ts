import { describe, expect, it } from 'vitest'
import { DEFAULT_DIFFICULTY_TIER } from '../data/difficulty'
import {
  createPrivateMatchGameProjection,
  getPrivateMatchAcceptIdempotencyKey,
} from './privateMatchmaking'
import type { PrivateMatchRequestResult } from './multiplayerRepository'

function privateMatchRequest(overrides: Partial<PrivateMatchRequestResult> = {}): PrivateMatchRequestResult {
  return {
    created: false,
    createdAt: '2026-07-01T23:45:00.000Z',
    expired: false,
    expiresAt: '2026-07-02T00:00:00.000Z',
    hardMode: false,
    idempotent: false,
    mode: 'og',
    opponent: {
      displayName: 'Kiki',
      identityAvailable: true,
      publicProfileId: '22222222-2222-4222-8222-222222222222',
      updatedAt: '2026-07-01T23:40:00.000Z',
    },
    requestId: 'private-request-1',
    requester: {
      displayName: 'Claudine',
      identityAvailable: true,
      publicProfileId: '11111111-1111-4111-8111-111111111111',
      updatedAt: '2026-07-01T23:39:00.000Z',
    },
    requestStatus: 'requested',
    updatedAt: '2026-07-01T23:45:00.000Z',
    viewerCanAccept: true,
    viewerCanCancel: false,
    viewerCanDecline: true,
    viewerRole: 'opponent',
    wordLength: 5,
    ...overrides,
  }
}

describe('private match accepted-game projection', () => {
  it('creates a fresh unranked Practice game without browser-supplied player user ids', () => {
    const projection = createPrivateMatchGameProjection(privateMatchRequest(), {
      defaultDifficulty: DEFAULT_DIFFICULTY_TIER,
      id: 'private-game-1',
      now: '2026-07-01T23:46:00.000Z',
      seed: 40,
    })

    expect(projection).toMatchObject({
      id: 'private-game-1',
      mode: 'og',
      playerProfiles: {
        'player-one': { label: 'Claudine' },
        'player-two': { label: 'Kiki' },
      },
      ranked: false,
      scope: 'practice',
      status: 'playing',
      wordLength: 5,
    })
    expect(projection?.playerUserIds).toBeUndefined()
    expect(projection?.dailyDateKey).toBeUndefined()
    expect(projection?.customGameCode).toBeUndefined()
    expect(projection?.matchmakingRequestId).toBeUndefined()
  })

  it('projects selected GO, Hard Mode, word-length, and time-control settings into the accepted game', () => {
    const projection = createPrivateMatchGameProjection(privateMatchRequest({
      goPuzzleCount: 5,
      hardMode: true,
      mode: 'go',
      timeLimitMs: 300_000,
      wordLength: 7,
    }), {
      defaultDifficulty: DEFAULT_DIFFICULTY_TIER,
      id: 'private-game-go',
      now: '2026-07-01T23:46:00.000Z',
      seed: 41,
    })

    expect(projection).toMatchObject({
      goPuzzleCount: 5,
      hardMode: true,
      id: 'private-game-go',
      mode: 'go',
      ranked: false,
      scope: 'practice',
      timeLimitMs: 300_000,
      wordLength: 7,
    })
    expect(projection?.playerUserIds).toBeUndefined()
    expect(projection?.dailyDateKey).toBeUndefined()
  })

  it('refuses expired, non-opponent, and unsupported timed requests', () => {
    expect(createPrivateMatchGameProjection(privateMatchRequest({ expired: true }), {
      defaultDifficulty: DEFAULT_DIFFICULTY_TIER,
    })).toBeUndefined()
    expect(createPrivateMatchGameProjection(privateMatchRequest({ viewerCanAccept: false, viewerRole: 'requester' }), {
      defaultDifficulty: DEFAULT_DIFFICULTY_TIER,
    })).toBeUndefined()
    expect(createPrivateMatchGameProjection(privateMatchRequest({ timeLimitMs: 45_000 }), {
      defaultDifficulty: DEFAULT_DIFFICULTY_TIER,
    })).toBeUndefined()
  })

  it('builds the v2 accept idempotency key without raw identity material', () => {
    expect(getPrivateMatchAcceptIdempotencyKey(privateMatchRequest(), 'private-game-1')).toBe(
      'phase40-private-request:accept:v2:private-request-1:private-game-1',
    )
  })
})
