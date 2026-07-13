import type { GameMode, PlayScope } from '../game/types'
import { getMultiplayerSessionForPlayer, type MultiplayerGame, type MultiplayerMove, type MultiplayerPlayerId, type MultiplayerSerializedSession } from './multiplayer'
import {
  getRankedDailyRatingBucket,
  getRankedPracticeRatingBucket,
  getRatingBucket,
  isTimedPracticeRatingBucket,
  type RatingBucketId,
  type RatingOutcome,
  type RatedMatchEvidence,
} from './rating'

export type MultiplayerResultStatus = 'completed' | 'aborted' | 'expired'
export type MultiplayerResultPlayerId = MultiplayerPlayerId

export const MULTIPLAYER_TILE_POINTS = {
  absent: 0,
  correct: 5,
  present: 2,
} as const

export const MULTIPLAYER_SOLVE_POINTS = 100
export const MULTIPLAYER_UNUSED_ATTEMPT_POINTS = 10
export const MULTIPLAYER_HARD_MODE_SOLVE_BONUS = 15

export interface MultiplayerPlayerPerformance {
  readonly attemptsUsed: number
  readonly completedAt?: string
  readonly outcome: RatingOutcome
  readonly playerId: MultiplayerResultPlayerId
  readonly points: number
  readonly puzzlesSolved: number
  readonly scoreSummary: string
  readonly summary: string
  readonly userId?: string
}

export interface MultiplayerMatchPerformance {
  readonly bucket: RatingBucketId
  readonly customGameCode?: string
  readonly dailyDateKey?: string
  readonly endedAt?: string
  readonly mode: GameMode
  readonly ranked: boolean
  readonly scope: PlayScope
  readonly sourceMatchId: string
  readonly status: MultiplayerResultStatus
  readonly summary: string
  readonly winnerPlayerId?: MultiplayerResultPlayerId
  readonly players: readonly MultiplayerPlayerPerformance[]
}

export interface CompetitiveRatingEligibility {
  readonly eligible: boolean
  readonly reason: string
}

function otherPlayer(playerId: MultiplayerResultPlayerId): MultiplayerResultPlayerId {
  return playerId === 'player-one' ? 'player-two' : 'player-one'
}

function outcomeFor(playerId: MultiplayerResultPlayerId, winnerPlayerId: MultiplayerResultPlayerId | undefined, status: MultiplayerResultStatus): RatingOutcome {
  if (status !== 'completed' || !winnerPlayerId) {
    return 'draw'
  }
  return playerId === winnerPlayerId ? 'win' : 'loss'
}

function playerSummary(outcome: RatingOutcome, attemptsUsed: number, puzzlesSolved: number, mode: GameMode, totalPuzzles = 1): string {
  const result = outcome === 'draw' ? 'Drew' : outcome === 'win' ? 'Won' : 'Lost'
  if (mode === 'go') {
    return `${result} with ${puzzlesSolved}/${totalPuzzles} boards solved`
  }
  return `${result} in ${attemptsUsed || 0} ${attemptsUsed === 1 ? 'guess' : 'guesses'}`
}

function moveSolved(move: MultiplayerMove): boolean {
  return move.tiles.length > 0 && move.tiles.every((tile) => tile.state === 'correct')
}

function tilePoints(move: MultiplayerMove): number {
  return move.tiles.reduce((total, tile) => total + MULTIPLAYER_TILE_POINTS[tile.state], 0)
}

function getPuzzleMaxAttempts(session: MultiplayerSerializedSession, puzzleIndex: number): number {
  if (session.mode === 'og') {
    return session.session.maxAttempts
  }
  return session.session.puzzles[puzzleIndex]?.maxAttempts ?? session.session.puzzles[0]?.maxAttempts ?? 6
}

function projectPlayerScore(game: MultiplayerGame, playerId: MultiplayerPlayerId): {
  readonly attemptsUsed: number
  readonly points: number
  readonly puzzlesSolved: number
  readonly scoreSummary: string
} {
  const moves = game.moves.filter((move) => move.playerId === playerId)
  const session = getMultiplayerSessionForPlayer(game, playerId)
  const puzzleIndexes = game.mode === 'go'
    ? Array.from({ length: session.mode === 'go' ? session.session.puzzles.length : 1 }, (_, index) => index)
    : [0]
  let points = 0
  let puzzlesSolved = 0
  for (const puzzleIndex of puzzleIndexes) {
    const puzzleMoves = moves.filter((move) => move.puzzleIndex === puzzleIndex)
    const solvedMove = puzzleMoves.find(moveSolved)
    points += puzzleMoves.reduce((total, move) => total + tilePoints(move), 0)
    if (solvedMove) {
      puzzlesSolved += 1
      const maxAttempts = getPuzzleMaxAttempts(session, puzzleIndex)
      const unusedAttempts = Math.max(0, maxAttempts - puzzleMoves.length)
      points += MULTIPLAYER_SOLVE_POINTS + unusedAttempts * MULTIPLAYER_UNUSED_ATTEMPT_POINTS
      if (game.hardMode) {
        points += MULTIPLAYER_HARD_MODE_SOLVE_BONUS
      }
    }
  }

  const solveLabel = game.mode === 'go'
    ? `${puzzlesSolved}/${puzzleIndexes.length} puzzles solved`
    : puzzlesSolved > 0 ? 'solved' : 'not solved'
  return {
    attemptsUsed: moves.length,
    points,
    puzzlesSolved,
    scoreSummary: `${points} pts; ${solveLabel}`,
  }
}

function pointsWinner(players: readonly MultiplayerPlayerPerformance[]): MultiplayerPlayerId | undefined {
  const [left, right] = players
  if (!left || !right || left.points === right.points) {
    return undefined
  }
  return left.points > right.points ? left.playerId : right.playerId
}

function winnerReason(game: MultiplayerGame, players: readonly MultiplayerPlayerPerformance[], winnerPlayerId: MultiplayerPlayerId | undefined): string {
  if (!winnerPlayerId) {
    return 'draw'
  }
  if (game.timedOutPlayerId) {
    return 'timeout'
  }
  if (game.forfeitedPlayerId) {
    return 'forfeit'
  }
  const winner = players.find((player) => player.playerId === winnerPlayerId)
  const solvedPlayers = players.filter((player) => player.puzzlesSolved > 0)
  if (game.mode === 'og' && solvedPlayers.length === 1 && winner?.puzzlesSolved) {
    return 'solve'
  }
  return 'points'
}

export function getCompetitiveRatingEligibility(game: Pick<MultiplayerGame, 'customGameCode' | 'dailyDateKey' | 'mode' | 'ranked' | 'ratingBucket' | 'scope' | 'timeLimitMs' | 'wordLength'>): CompetitiveRatingEligibility {
  if (game.ranked !== true) {
    return { eligible: false, reason: 'Unranked matches do not affect rating.' }
  }
  if (game.customGameCode) {
    return { eligible: false, reason: 'Ranked custom games are deferred.' }
  }
  if (game.scope === 'daily') {
    const expectedBucket = getRankedDailyRatingBucket(game.mode)
    if (!game.dailyDateKey) {
      return { eligible: false, reason: 'Daily ranked rating requires a UTC date key.' }
    }
    if (game.wordLength !== 5 || game.timeLimitMs !== null) {
      return { eligible: false, reason: 'Daily ranked rating requires five-letter puzzles without a clock.' }
    }
    if (game.ratingBucket && game.ratingBucket !== expectedBucket) {
      return { eligible: false, reason: 'Ranked Daily rating bucket does not match its game mode.' }
    }
    return { eligible: true, reason: 'Eligible for Daily ranked rating.' }
  }
  const expectedBucket = getRankedPracticeRatingBucket(game.mode, game.timeLimitMs)
  if (!expectedBucket) {
    return { eligible: false, reason: 'Timed Practice ranked supports only the canonical five-minute clock.' }
  }
  if (game.ratingBucket && game.ratingBucket !== expectedBucket) {
    return { eligible: false, reason: 'Ranked Practice rating bucket does not match its time control.' }
  }
  if (isTimedPracticeRatingBucket(expectedBucket)) {
    return { eligible: true, reason: 'Eligible for timed Practice ranked rating.' }
  }
  return { eligible: true, reason: 'Eligible for Practice ranked rating.' }
}

export function projectMultiplayerPerformance(game: MultiplayerGame): MultiplayerMatchPerformance | undefined {
  if (game.status === 'waiting' || game.status === 'playing' || game.status === 'cancelled') {
    return undefined
  }
  const lastMove = game.moves[game.moves.length - 1]
  const status: MultiplayerResultStatus = game.status === 'expired' ? 'expired' : 'completed'
  const bucket = game.ratingBucket
    ?? (game.scope === 'daily' && game.ranked === true
      ? getRankedDailyRatingBucket(game.mode)
      : getRankedPracticeRatingBucket(game.mode, game.timeLimitMs) ?? getRatingBucket(game.mode))
  const ratingEligibility = getCompetitiveRatingEligibility(game)
  const scoredPlayers = game.players.map((player): MultiplayerPlayerPerformance => {
    const moves = game.moves.filter((move) => move.playerId === player.id)
    const score = projectPlayerScore(game, player.id)
    return {
      attemptsUsed: moves.length,
      completedAt: game.endedAt,
      outcome: 'draw',
      playerId: player.id,
      points: score.points,
      puzzlesSolved: score.puzzlesSolved,
      scoreSummary: score.scoreSummary,
      summary: '',
      userId: game.playerUserIds?.[player.id],
    }
  })
  const solvedPlayers = scoredPlayers.filter((player) => player.puzzlesSolved > 0)
  const winnerPlayerId = game.winnerId
    ?? (game.status === 'lost' && game.forfeitedPlayerId ? otherPlayer(game.forfeitedPlayerId) : undefined)
    ?? (game.mode === 'og' && solvedPlayers.length === 1 ? solvedPlayers[0].playerId : undefined)
    ?? (game.status === 'lost' && lastMove && game.timedOutPlayerId ? otherPlayer(game.timedOutPlayerId) : undefined)
    ?? pointsWinner(scoredPlayers)
  const players = scoredPlayers.map((player): MultiplayerPlayerPerformance => {
    const outcome = outcomeFor(player.playerId, winnerPlayerId, status)
    const totalPuzzles = game.serializedSession.mode === 'go' ? game.serializedSession.session.puzzles.length : 1
    return {
      ...player,
      outcome,
      summary: `${playerSummary(outcome, player.attemptsUsed, player.puzzlesSolved, game.mode, totalPuzzles)}; ${player.scoreSummary}`,
    }
  })
  const reason = winnerReason(game, players, winnerPlayerId)
  const winnerLabel = winnerPlayerId ? game.players.find((player) => player.id === winnerPlayerId)?.label ?? winnerPlayerId : undefined
  return {
    bucket,
    customGameCode: game.customGameCode,
    dailyDateKey: game.dailyDateKey,
    endedAt: game.endedAt,
    mode: game.mode,
    players,
    ranked: ratingEligibility.eligible,
    scope: game.scope,
    sourceMatchId: game.id,
    status,
    summary: status === 'expired'
      ? 'Multiplayer match expired before completion'
      : winnerPlayerId && reason === 'points'
        ? `${winnerLabel} won on points`
        : winnerPlayerId && reason === 'solve'
          ? `${winnerLabel} won the multiplayer match by solving`
          : winnerPlayerId && reason === 'timeout'
            ? `${winnerLabel} won the multiplayer match on time`
            : winnerPlayerId && reason === 'forfeit'
              ? `${winnerLabel} won by forfeit`
            : winnerPlayerId
              ? `${winnerLabel} won the multiplayer match`
        : 'Multiplayer match ended in a draw',
    winnerPlayerId,
  }
}

export function createRatedEvidenceFromPerformance(
  performance: MultiplayerMatchPerformance,
  input: {
    readonly authenticated: boolean
    readonly durableResult: boolean
  },
): RatedMatchEvidence {
  return {
    authenticated: input.authenticated,
    bucket: performance.bucket,
    durableResult: input.durableResult,
    matchId: performance.sourceMatchId,
    playerResults: performance.players.flatMap((player) => player.userId ? [{
      outcome: player.outcome,
      playerId: player.playerId,
      userId: player.userId,
    }] : []),
    ranked: performance.ranked,
    terminalStatus: performance.status === 'completed' ? 'completed' : performance.status,
  }
}
