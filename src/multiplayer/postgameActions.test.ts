import { describe, expect, it } from 'vitest'
import { createMultiplayerGame, type MultiplayerGame } from './multiplayer'
import {
  createPracticeRematchGameProjection,
  getPracticePostgameActions,
} from './postgameActions'
import { TIMED_RANKED_PRACTICE_TIME_LIMIT_MS } from './rating'

function terminalPracticeGame(overrides: Partial<MultiplayerGame> = {}): MultiplayerGame {
  const game = createMultiplayerGame({
    hardMode: true,
    mode: 'go',
    playerUserIds: { 'player-one': 'host-user', 'player-two': 'rival-user' },
    scope: 'practice',
    seed: 31,
    timeLimitMs: 120_000,
    wordLength: 6,
    ...overrides,
  })
  return {
    ...game,
    endedAt: '2026-06-24T00:20:00.000Z',
    status: 'won',
    updatedAt: '2026-06-24T00:20:00.000Z',
    winnerId: 'player-one',
    ...overrides,
  }
}

describe('Practice postgame action domain', () => {
  it('allows direct rematch and same-settings play-again for terminal unranked non-custom Practice games', () => {
    const game = terminalPracticeGame()

    const actions = getPracticePostgameActions(game, 'host-user')

    expect(actions).toMatchObject({
      canPlayAgain: true,
      canRequestRematch: true,
      canSearchAgain: false,
      continuationKind: 'unranked-play-again',
      opponentSeat: 'player-two',
      viewerSeat: 'player-one',
      settings: {
        goPuzzleCount: 5,
        hardMode: true,
        mode: 'go',
        ranked: false,
        timeLimitMs: 120_000,
        wordLength: 6,
      },
    })
  })

  it('rejects Daily, nonterminal, and nonparticipant games', () => {
    expect(getPracticePostgameActions(terminalPracticeGame({ dailyDateKey: '2026-06-24', scope: 'daily' }), 'host-user')).toMatchObject({
      canPlayAgain: false,
      canRequestRematch: false,
      canSearchAgain: false,
      unavailableReason: 'Daily Multiplayer does not support rematch or same-settings postgame shortcuts.',
    })
    expect(getPracticePostgameActions(terminalPracticeGame({ status: 'playing' }), 'host-user')).toMatchObject({
      canPlayAgain: false,
      canRequestRematch: false,
      canSearchAgain: false,
      unavailableReason: 'Postgame actions require a terminal Practice multiplayer game.',
    })
    expect(getPracticePostgameActions(terminalPracticeGame(), 'third-user')).toMatchObject({
      canPlayAgain: false,
      canRequestRematch: false,
      canSearchAgain: false,
      unavailableReason: 'Only game participants can use Practice postgame actions.',
    })
  })

  it('keeps ranked Practice continuation on the trusted queue path for untimed and canonical timed ranked games', () => {
    const ranked = terminalPracticeGame({
      matchmakingRequestId: 'queue-request-1',
      mode: 'og',
      ranked: true,
      ratingBucket: 'multiplayer:og',
      timeLimitMs: null,
    })
    const timedRanked = terminalPracticeGame({
      matchmakingRequestId: 'queue-request-1',
      mode: 'og',
      ranked: true,
      ratingBucket: 'multiplayer:og:timed:v1',
      timeLimitMs: TIMED_RANKED_PRACTICE_TIME_LIMIT_MS,
    })

    expect(getPracticePostgameActions(ranked, 'host-user')).toMatchObject({
      canPlayAgain: false,
      canRequestRematch: false,
      canSearchAgain: true,
      continuationKind: 'ranked-search-again',
      rematchUnavailableReason: 'Ranked Practice rematches must use the trusted ranked queue instead of direct rematch.',
      settings: {
        hardMode: true,
        mode: 'og',
        ranked: true,
        ratingBucket: 'multiplayer:og',
        timeLimitMs: undefined,
        wordLength: 6,
      },
    })
    expect(getPracticePostgameActions(timedRanked, 'host-user')).toMatchObject({
      canPlayAgain: false,
      canRequestRematch: false,
      canSearchAgain: true,
      continuationKind: 'ranked-search-again',
      rematchUnavailableReason: 'Ranked Practice rematches must use the trusted ranked queue instead of direct rematch.',
      settings: {
        hardMode: true,
        mode: 'og',
        ranked: true,
        ratingBucket: 'multiplayer:og:timed:v1',
        timeLimitMs: TIMED_RANKED_PRACTICE_TIME_LIMIT_MS,
        wordLength: 6,
      },
    })
  })

  it('rejects unsupported timed ranked postgame search-again shortcuts', () => {
    const unsupportedTimedRanked = terminalPracticeGame({
      matchmakingRequestId: 'queue-request-1',
      mode: 'og',
      ranked: true,
      ratingBucket: 'multiplayer:og',
      timeLimitMs: 30_000,
    })

    expect(getPracticePostgameActions(unsupportedTimedRanked, 'host-user')).toMatchObject({
      canPlayAgain: false,
      canRequestRematch: false,
      canSearchAgain: false,
      continuationKind: 'none',
      unavailableReason: 'Timed Practice ranked search-again supports only the five-minute ranked queue.',
    })
  })

  it('keeps custom/private-code Practice games out of direct rematch while preserving setup-prefill settings', () => {
    const custom = terminalPracticeGame({
      customGameCode: 'ABC123',
      mode: 'og',
    })

    expect(getPracticePostgameActions(custom, 'rival-user')).toMatchObject({
      canPlayAgain: true,
      canRequestRematch: false,
      canSearchAgain: false,
      continuationKind: 'custom-play-again',
      rematchUnavailableReason: 'Custom Practice games use setup-prefill instead of direct rematch.',
      settings: {
        customGameCode: 'ABC123',
        hardMode: true,
        mode: 'og',
        ranked: false,
        timeLimitMs: 120_000,
        wordLength: 6,
      },
    })
  })

  it('creates a fresh unranked Practice rematch projection with the approved same settings only', () => {
    const source = terminalPracticeGame()

    const projection = createPracticeRematchGameProjection(source, {
      id: 'rematch-game-1',
      now: '2026-06-24T00:30:00.000Z',
      seed: 42,
    })

    expect(projection).toMatchObject({
      customGameCode: undefined,
      dailyDateKey: undefined,
      goPuzzleCount: 5,
      hardMode: true,
      id: 'rematch-game-1',
      matchmakingRequestId: undefined,
      mode: 'go',
      playerUserIds: { 'player-one': 'host-user', 'player-two': 'rival-user' },
      ranked: false,
      ratingBucket: undefined,
      scope: 'practice',
      seed: 42,
      status: 'playing',
      timeLimitMs: 120_000,
      wordLength: 6,
    })
    expect(createPracticeRematchGameProjection({ ...source, ranked: true, ratingBucket: 'multiplayer:go' })).toBeUndefined()
    expect(createPracticeRematchGameProjection({ ...source, customGameCode: 'ABC123' })).toBeUndefined()
    expect(createPracticeRematchGameProjection({ ...source, scope: 'daily', dailyDateKey: '2026-06-24' })).toBeUndefined()
  })

  it('tolerates legacy unranked Practice projections that carried a rating bucket', () => {
    const legacyUnranked = terminalPracticeGame({
      mode: 'og',
      ranked: false,
      ratingBucket: 'multiplayer:og',
      timeLimitMs: null,
      wordLength: 5,
    })

    expect(getPracticePostgameActions(legacyUnranked, 'host-user')).toMatchObject({
      canRequestRematch: true,
      continuationKind: 'unranked-play-again',
      settings: {
        mode: 'og',
        ranked: false,
        ratingBucket: undefined,
        timeLimitMs: undefined,
        wordLength: 5,
      },
    })

    expect(createPracticeRematchGameProjection(legacyUnranked, {
      id: 'legacy-rematch-game-1',
      now: '2026-06-24T00:30:00.000Z',
      seed: 44,
    })).toMatchObject({
      id: 'legacy-rematch-game-1',
      mode: 'og',
      ranked: false,
      ratingBucket: undefined,
      scope: 'practice',
      timeLimitMs: null,
      wordLength: 5,
    })
  })
})
