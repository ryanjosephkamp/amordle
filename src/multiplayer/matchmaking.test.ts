import { describe, expect, it } from 'vitest'
import {
  createMatchmakingRequest,
  findBestMatchForRequest,
  getRankedMatchmakingEligibility,
  getSearchBand,
  isMatchmakingCompatible,
  markMatched,
} from './matchmaking'

describe('multiplayer matchmaking', () => {
  it('widens search bands over wait time', () => {
    const request = createMatchmakingRequest({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      rating: 1400,
      scope: 'practice',
      userId: 'user-a',
    })

    expect(getSearchBand(request, new Date('2026-06-04T12:00:00.000Z'))).toBe(100)
    expect(getSearchBand(request, new Date('2026-06-04T12:10:00.000Z'))).toBe(150)
    expect(getSearchBand({ ...request, createdAt: 'not-a-date', rating: Number.NaN }, new Date('2026-06-04T12:10:00.000Z'))).toBe(200)
  })

  it('filters by mode, scope, word length, Hard Mode, and distinct users', () => {
    const left = createMatchmakingRequest({
      createdAt: '2026-06-04T12:00:00.000Z',
      hardMode: true,
      mode: 'go',
      rating: 1200,
      scope: 'practice',
      userId: 'user-a',
      wordLength: 8,
    })
    const right = createMatchmakingRequest({
      createdAt: '2026-06-04T12:00:00.000Z',
      hardMode: true,
      mode: 'go',
      rating: 1210,
      scope: 'practice',
      userId: 'user-b',
      wordLength: 8,
    })
    const wrongLength = { ...right, id: 'wrong-length', wordLength: 9 }
    const wrongHardMode = { ...right, hardMode: false, id: 'wrong-hard-mode' }
    const sameUser = { ...right, id: 'same-user', userId: 'user-a' }

    expect(isMatchmakingCompatible(left, right, new Date('2026-06-04T12:00:01.000Z'))).toBe(true)
    expect(isMatchmakingCompatible(left, wrongLength, new Date('2026-06-04T12:00:01.000Z'))).toBe(false)
    expect(isMatchmakingCompatible(left, wrongHardMode, new Date('2026-06-04T12:00:01.000Z'))).toBe(false)
    expect(isMatchmakingCompatible(left, sameUser, new Date('2026-06-04T12:00:01.000Z'))).toBe(false)
  })

  it('matches only compatible current-day ranked Daily requests', () => {
    const now = new Date('2026-06-04T23:59:00.000Z')
    const left = createMatchmakingRequest({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      hardMode: true,
      mode: 'og',
      ranked: true,
      scope: 'daily',
      userId: 'user-a',
      wordLength: 5,
    })
    const right = createMatchmakingRequest({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      hardMode: true,
      mode: 'og',
      ranked: true,
      scope: 'daily',
      userId: 'user-b',
      wordLength: 5,
    })

    expect(left.ranked).toBe(true)
    expect(right.ranked).toBe(true)
    expect(left.ratingBucket).toBe('multiplayer:og:daily:v1')
    expect(left.wordLength).toBe(5)
    expect(left.timeLimitMs).toBeUndefined()
    expect(getRankedMatchmakingEligibility({
      dailyDateKey: '2026-06-04',
      hardMode: true,
      mode: 'og',
      now,
      ranked: true,
      scope: 'daily',
      timeLimitMs: null,
      wordLength: 5,
    })).toMatchObject({
      eligible: true,
      reason: 'Eligible for Daily ranked matchmaking.',
    })
    expect(isMatchmakingCompatible(left, right, now)).toBe(true)
    expect(isMatchmakingCompatible(left, right, new Date('2026-06-05T00:01:00.000Z'))).toBe(false)
    expect(isMatchmakingCompatible(left, { ...right, hardMode: false }, new Date('2026-06-04T23:59:00.000Z'))).toBe(false)
    expect(isMatchmakingCompatible(left, { ...right, scope: 'practice' }, new Date('2026-06-04T23:59:00.000Z'))).toBe(false)
    expect(isMatchmakingCompatible(left, { ...right, timeLimitMs: 300_000 }, new Date('2026-06-04T23:59:00.000Z'))).toBe(false)
    expect(isMatchmakingCompatible(left, { ...right, wordLength: 6 }, new Date('2026-06-04T23:59:00.000Z'))).toBe(false)
    expect(isMatchmakingCompatible(left, { ...right, ratingBucket: 'multiplayer:og' }, new Date('2026-06-04T23:59:00.000Z'))).toBe(false)
  })

  it('fails Daily ranked eligibility closed without current canonical settings evidence', () => {
    const eligible = {
      dailyDateKey: '2026-06-04',
      hardMode: false,
      mode: 'og' as const,
      now: new Date('2026-06-04T12:00:00.000Z'),
      ranked: true,
      scope: 'daily' as const,
      timeLimitMs: null,
      wordLength: 5,
    }

    expect(getRankedMatchmakingEligibility(eligible).eligible).toBe(true)
    expect(getRankedMatchmakingEligibility({ ...eligible, dailyDateKey: undefined }).eligible).toBe(false)
    expect(getRankedMatchmakingEligibility({ ...eligible, dailyDateKey: '2026-06-03' }).eligible).toBe(false)
    expect(getRankedMatchmakingEligibility({ ...eligible, hardMode: undefined }).eligible).toBe(false)
    expect(getRankedMatchmakingEligibility({ ...eligible, wordLength: undefined }).eligible).toBe(false)
    expect(getRankedMatchmakingEligibility({ ...eligible, timeLimitMs: 300_000 }).eligible).toBe(false)
    expect(getRankedMatchmakingEligibility({ ...eligible, mode: 'go', goPuzzleCount: undefined }).eligible).toBe(false)
    expect(getRankedMatchmakingEligibility({ ...eligible, mode: 'go', goPuzzleCount: 7 }).eligible).toBe(false)
    expect(getRankedMatchmakingEligibility({ ...eligible, mode: 'go', goPuzzleCount: 5 }).eligible).toBe(true)
  })

  it('does not manufacture missing ranked Daily eligibility evidence', () => {
    const request = createMatchmakingRequest({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      ranked: true,
      scope: 'daily',
      userId: 'user-a',
    })

    expect(request.ranked).toBe(false)
    expect(request.ratingBucket).toBe('multiplayer:og')
  })

  it('supports only canonical five-minute timed Practice ranked matchmaking', () => {
    const left = createMatchmakingRequest({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      rating: 1200,
      scope: 'practice',
      timeLimitMs: 300_000,
      userId: 'user-a',
      wordLength: 5,
    })
    const right = createMatchmakingRequest({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      rating: 1210,
      scope: 'practice',
      timeLimitMs: 300_000,
      userId: 'user-b',
      wordLength: 5,
    })
    const untimed = createMatchmakingRequest({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      rating: 1210,
      scope: 'practice',
      userId: 'user-c',
      wordLength: 5,
    })
    const unsupportedTimer = createMatchmakingRequest({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      rating: 1210,
      scope: 'practice',
      timeLimitMs: 30_000,
      userId: 'user-d',
      wordLength: 5,
    })

    expect(left.ranked).toBe(true)
    expect(left.ratingBucket).toBe('multiplayer:og:timed:v1')
    expect(getRankedMatchmakingEligibility({ ranked: true, scope: 'practice', timeLimitMs: 30_000 })).toMatchObject({
      eligible: false,
      reason: 'Timed Practice ranked supports only the canonical five-minute clock.',
    })
    expect(getRankedMatchmakingEligibility({ ranked: true, scope: 'practice', timeLimitMs: 300_000 })).toMatchObject({
      eligible: true,
      reason: 'Eligible for timed Practice ranked matchmaking.',
    })
    expect(isMatchmakingCompatible(left, right, new Date('2026-06-04T12:00:01.000Z'))).toBe(true)
    expect(isMatchmakingCompatible(left, untimed, new Date('2026-06-04T12:00:01.000Z'))).toBe(false)
    expect(unsupportedTimer.ranked).toBe(false)
    expect(isMatchmakingCompatible(left, unsupportedTimer, new Date('2026-06-04T12:00:01.000Z'))).toBe(false)
  })

  it('selects the oldest compatible queued opponent and marks both matched', () => {
    const left = createMatchmakingRequest({ createdAt: '2026-06-04T12:00:02.000Z', id: 'left', mode: 'og', rating: 1300, scope: 'practice', userId: 'user-a' })
    const close = createMatchmakingRequest({ createdAt: '2026-06-04T12:00:01.000Z', id: 'close', mode: 'og', rating: 1320, scope: 'practice', userId: 'user-b' })
    const older = createMatchmakingRequest({ createdAt: '2026-06-04T12:00:00.000Z', id: 'older', mode: 'og', rating: 1380, scope: 'practice', userId: 'user-c' })

    const selection = findBestMatchForRequest(left, [close, older], new Date(left.createdAt))
    expect(selection?.right.id).toBe('older')
    expect(markMatched([left, close, older], selection!).filter((request) => request.status === 'matched').map((request) => request.id)).toEqual(['left', 'older'])
  })

  it('does not match expired or corrupt queue rows', () => {
    const left = createMatchmakingRequest({ id: 'left', mode: 'og', rating: 1300, scope: 'practice', userId: 'user-a' })
    const expired = createMatchmakingRequest({
      createdAt: '2026-06-04T12:00:00.000Z',
      id: 'expired',
      mode: 'og',
      rating: 1310,
      scope: 'practice',
      userId: 'user-b',
    })

    expect(isMatchmakingCompatible(left, { ...expired, expiresAt: '2026-06-04T12:00:30.000Z' }, new Date('2026-06-04T12:01:00.000Z'))).toBe(false)
    expect(isMatchmakingCompatible(left, { ...expired, expiresAt: 'not-a-date' }, new Date('2026-06-04T12:00:01.000Z'))).toBe(false)
  })
})
