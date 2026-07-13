import { describe, expect, it } from 'vitest'
import type { AuthState } from '../account/auth'
import {
  createMultiplayerGame,
  getMultiplayerAnswerWords,
  submitMultiplayerGuess,
} from './multiplayer'
import {
  applyTrustedSettlementResult,
  createEmptyCompetitiveMultiplayerState,
  settleMultiplayerStateResults,
} from './competitiveMultiplayer'

const authenticated: AuthState = {
  status: 'authenticated',
  user: {
    id: 'user-a',
    roles: [],
  },
}

describe('competitive multiplayer settlement', () => {
  it('settles terminal games that arrive through a multiplayer state snapshot', () => {
    const game = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-a', 'player-two': 'user-b' },
      ranked: true,
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const submitted = submitMultiplayerGuess({ games: [game] }, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      now: '2026-06-04T12:00:10.000Z',
      playerId: 'player-one',
    })

    const settled = settleMultiplayerStateResults(
      createEmptyCompetitiveMultiplayerState(),
      submitted.state,
      authenticated,
    )
    const settledAgain = settleMultiplayerStateResults(settled, submitted.state, authenticated)

    expect(settled.results).toHaveLength(1)
    expect(settled.results[0].sourceMatchId).toBe(game.id)
    expect(settled.rating.transactions).toHaveLength(2)
    expect(settledAgain.results).toHaveLength(1)
    expect(settledAgain.rating.transactions).toHaveLength(2)
  })

  it('can record terminal ranked results without local browser rating movement', () => {
    const game = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      matchmakingRequestId: 'queue-request-1',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-a', 'player-two': 'user-b' },
      ranked: true,
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const submitted = submitMultiplayerGuess({ games: [game] }, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      now: '2026-06-04T12:00:10.000Z',
      playerId: 'player-one',
    })

    const settled = settleMultiplayerStateResults(
      createEmptyCompetitiveMultiplayerState(),
      submitted.state,
      authenticated,
      { applyLocalRating: false },
    )

    expect(settled.results).toHaveLength(1)
    expect(settled.results[0].ranked).toBe(true)
    expect(settled.rating.transactions).toHaveLength(0)
    expect(settled.rating.profiles).toHaveLength(0)
  })

  it('applies trusted settlement transactions as idempotent local rating cache updates', () => {
    const game = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      matchmakingRequestId: 'queue-request-1',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-a', 'player-two': 'user-b' },
      ranked: true,
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const submitted = submitMultiplayerGuess({ games: [game] }, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      now: '2026-06-04T12:00:10.000Z',
      playerId: 'player-one',
    })
    const terminal = submitted.game!
    const trustedTransactions = [
      {
        bucket: 'multiplayer:og' as const,
        createdAt: '2026-06-16T06:10:00.000Z',
        expectedScore: 0.5,
        id: 'trusted-phase27-result-game-1-multiplayer:og-user-a',
        matchId: 'phase27-result-game-1',
        newRating: 1220,
        oldRating: 1200,
        opponentUserId: 'user-b',
        outcome: 'win' as const,
        ratingDelta: 20,
        userId: 'user-a',
      },
      {
        bucket: 'multiplayer:og' as const,
        createdAt: '2026-06-16T06:10:00.000Z',
        expectedScore: 0.5,
        id: 'trusted-phase27-result-game-1-multiplayer:og-user-b',
        matchId: 'phase27-result-game-1',
        newRating: 1180,
        oldRating: 1200,
        opponentUserId: 'user-a',
        outcome: 'loss' as const,
        ratingDelta: -20,
        userId: 'user-b',
      },
    ]

    const settled = applyTrustedSettlementResult(createEmptyCompetitiveMultiplayerState(), terminal, trustedTransactions)
    const settledAgain = applyTrustedSettlementResult(settled, terminal, trustedTransactions)

    expect(settled.results).toHaveLength(1)
    expect(settled.rating.transactions).toHaveLength(2)
    expect(settled.rating.profiles).toEqual([
      expect.objectContaining({ gamesPlayed: 1, rating: 1220, userId: 'user-a', wins: 1 }),
      expect.objectContaining({ gamesPlayed: 1, losses: 1, rating: 1180, userId: 'user-b' }),
    ])
    expect(settledAgain.rating.transactions).toHaveLength(2)
    expect(settledAgain.rating.profiles).toEqual(settled.rating.profiles)
  })

  it('records local-preview and queue-backed ranked Daily results without browser-authoritative rating movement', () => {
    const previewGame = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-a', 'player-two': 'preview-rival-request-1' },
      ranked: true,
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const previewSubmitted = submitMultiplayerGuess({ games: [previewGame] }, {
      gameId: previewGame.id,
      guess: getMultiplayerAnswerWords(previewGame)[0],
      now: '2026-06-04T12:00:10.000Z',
      playerId: 'player-one',
    })
    const dailyGame = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      matchmakingRequestId: 'daily-queue-request-1',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-a', 'player-two': 'user-b' },
      ranked: true,
      ratingBucket: 'multiplayer:og:daily:v1',
      scope: 'daily',
      seed: 1,
      wordLength: 5,
    })
    const dailyTerminal = {
      ...dailyGame,
      endedAt: '2026-06-04T12:01:00.000Z',
      status: 'lost' as const,
      winnerId: 'player-one' as const,
    }

    const settled = settleMultiplayerStateResults(createEmptyCompetitiveMultiplayerState(), {
      games: [previewSubmitted.game!, dailyTerminal],
    }, authenticated, { applyLocalRating: false })

    expect(settled.results).toHaveLength(2)
    expect(settled.results.find((result) => result.sourceMatchId === previewGame.id)?.ranked).toBe(true)
    expect(settled.results.find((result) => result.sourceMatchId === dailyGame.id)?.ranked).toBe(true)
    expect(settled.rating.transactions).toHaveLength(0)
  })
})
