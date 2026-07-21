import {
  getMultiplayerSessionForPlayer,
  getViewerMultiplayerPlayerId,
  type MultiplayerGame,
  type MultiplayerMove,
  type MultiplayerPlayerId,
  type MultiplayerSerializedSession,
} from './multiplayer'
import {
  getCompetitiveRatingEligibility,
  MULTIPLAYER_HARD_MODE_SOLVE_BONUS,
  MULTIPLAYER_SOLVE_POINTS,
  MULTIPLAYER_TILE_POINTS,
  MULTIPLAYER_UNUSED_ATTEMPT_POINTS,
  projectMultiplayerPerformance,
} from './scoring'

export interface CombatScoreline {
  readonly isLeading: boolean
  readonly isViewer: boolean
  readonly label: string
  readonly playerId: MultiplayerPlayerId
  readonly points: number
  readonly turnState: 'active' | 'complete' | 'waiting'
}

export interface CombatResultPresentation {
  readonly detail: string
  readonly headline: string
  readonly reason: 'cancelled' | 'draw' | 'forfeit' | 'points' | 'solve' | 'timeout'
  readonly settlementLabel: string
  readonly viewerOutcome: 'loss' | 'neutral' | 'win'
}

function moveSolved(move: MultiplayerMove): boolean {
  return move.tiles.length > 0 && move.tiles.every((tile) => tile.state === 'correct')
}

function getPuzzleMaxAttempts(session: MultiplayerSerializedSession, puzzleIndex: number): number {
  if (session.mode === 'og') {
    return session.session.maxAttempts
  }
  return session.session.puzzles[puzzleIndex]?.maxAttempts
    ?? session.session.puzzles[0]?.maxAttempts
    ?? 6
}

function projectPlayerPoints(game: MultiplayerGame, playerId: MultiplayerPlayerId): number {
  const moves = game.moves.filter((move) => move.playerId === playerId)
  const session = getMultiplayerSessionForPlayer(game, playerId)
  const puzzleIndexes = game.mode === 'go'
    ? Array.from(
        { length: session.mode === 'go' ? session.session.puzzles.length : 1 },
        (_, index) => index,
      )
    : [0]

  return puzzleIndexes.reduce((total, puzzleIndex) => {
    const puzzleMoves = moves.filter((move) => move.puzzleIndex === puzzleIndex)
    const tilePoints = puzzleMoves.reduce(
      (subtotal, move) => subtotal + move.tiles.reduce(
        (moveTotal, tile) => moveTotal + MULTIPLAYER_TILE_POINTS[tile.state],
        0,
      ),
      0,
    )
    const solved = puzzleMoves.some(moveSolved)
    if (!solved) {
      return total + tilePoints
    }
    const unusedAttempts = Math.max(0, getPuzzleMaxAttempts(session, puzzleIndex) - puzzleMoves.length)
    return total
      + tilePoints
      + MULTIPLAYER_SOLVE_POINTS
      + unusedAttempts * MULTIPLAYER_UNUSED_ATTEMPT_POINTS
      + (game.hardMode ? MULTIPLAYER_HARD_MODE_SOLVE_BONUS : 0)
  }, 0)
}

function getPlayerLabel(game: MultiplayerGame, playerId: MultiplayerPlayerId): string {
  const profile = game.playerProfiles?.[playerId]
  const profileLabel = profile?.displayName?.trim() || profile?.label.trim()
  if (profileLabel) {
    return profileLabel
  }
  const storedLabel = game.players.find((player) => player.id === playerId)?.label.trim()
  if (storedLabel && !['you', 'rival'].includes(storedLabel.toLocaleLowerCase('en-US'))) {
    return storedLabel
  }
  return playerId === 'player-one' ? 'Player one' : 'Player two'
}

export function projectCombatScorelines(
  game: MultiplayerGame,
  viewerUserId?: string,
): readonly CombatScoreline[] {
  const viewerPlayerId = getViewerMultiplayerPlayerId(game, viewerUserId)
  const rows = game.players.map((player) => ({
    isViewer: player.id === viewerPlayerId,
    label: getPlayerLabel(game, player.id),
    playerId: player.id,
    points: projectPlayerPoints(game, player.id),
    turnState: game.status === 'playing'
      ? game.currentTurn === player.id ? 'active' as const : 'waiting' as const
      : 'complete' as const,
  }))
  const leadingPoints = Math.max(...rows.map((row) => row.points))
  const hasSoleLeader = rows.filter((row) => row.points === leadingPoints).length === 1
  return rows.map((row) => ({
    ...row,
    isLeading: hasSoleLeader && row.points === leadingPoints,
  }))
}

function getViewerOutcome(
  game: MultiplayerGame,
  viewerUserId: string | undefined,
): CombatResultPresentation['viewerOutcome'] {
  const viewerPlayerId = getViewerMultiplayerPlayerId(game, viewerUserId)
  if (!viewerPlayerId || !game.winnerId) {
    return 'neutral'
  }
  return game.winnerId === viewerPlayerId ? 'win' : 'loss'
}

function getWinnerLabel(game: MultiplayerGame): string | undefined {
  return game.winnerId ? getPlayerLabel(game, game.winnerId).toLocaleUpperCase('en-US') : undefined
}

function getSettlementLabel(game: MultiplayerGame): string {
  const eligibility = getCompetitiveRatingEligibility(game)
  return eligibility.eligible ? 'Trusted settlement eligible' : 'Ranked settlement unavailable'
}

export function getCombatResultPresentation(
  game: MultiplayerGame,
  viewerUserId?: string,
): CombatResultPresentation {
  if (game.status === 'cancelled') {
    return {
      detail: 'The match ended before the first shared guess. No win, loss, points result, rating result, or answer reveal was recorded.',
      headline: 'MATCH CANCELLED',
      reason: 'cancelled',
      settlementLabel: 'No settlement',
      viewerOutcome: 'neutral',
    }
  }

  const performance = projectMultiplayerPerformance(game)
  const winnerLabel = getWinnerLabel(game)
  const viewerOutcome = getViewerOutcome(game, viewerUserId)
  if (game.timedOutPlayerId && winnerLabel) {
    return {
      detail: 'Timeout precedence determined the result before points.',
      headline: `${winnerLabel} WON ON TIME`,
      reason: 'timeout',
      settlementLabel: getSettlementLabel(game),
      viewerOutcome,
    }
  }
  if (game.forfeitedPlayerId && winnerLabel) {
    return {
      detail: 'Post-start forfeit precedence determined the result before points.',
      headline: `${winnerLabel} WON BY FORFEIT`,
      reason: 'forfeit',
      settlementLabel: getSettlementLabel(game),
      viewerOutcome,
    }
  }
  if (!winnerLabel) {
    return {
      detail: performance?.summary ?? 'No winner was recorded.',
      headline: 'MATCH DRAWN',
      reason: 'draw',
      settlementLabel: getSettlementLabel(game),
      viewerOutcome,
    }
  }
  const winnerPerformance = performance?.players.find((player) => player.playerId === game.winnerId)
  const reason = game.mode === 'og' && winnerPerformance?.puzzlesSolved === 1
    ? 'solve'
    : 'points'
  return {
    detail: performance?.summary ?? `${winnerLabel} won the match.`,
    headline: reason === 'points' ? `${winnerLabel} WON ON POINTS` : `${winnerLabel} WON THE MATCH`,
    reason,
    settlementLabel: getSettlementLabel(game),
    viewerOutcome,
  }
}
