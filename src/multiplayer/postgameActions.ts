import type { GameMode } from '../game/types'
import { normalizeGoPuzzleCount, type GoPuzzleCount } from '../game/constants'
import {
  createMultiplayerGame,
  type MultiplayerGame,
  type MultiplayerGameStatus,
  type MultiplayerPlayerId,
  type PracticeMultiplayerTimeLimitMs,
} from './multiplayer'
import {
  getRankedPracticeRatingBucket,
  getRatingBucket,
  normalizeRankedPracticeTimeLimitMs,
  type RatingBucketId,
} from './rating'

export type PracticePostgameContinuationKind =
  | 'custom-play-again'
  | 'none'
  | 'ranked-search-again'
  | 'unranked-play-again'

export interface PracticePostgameSettings {
  readonly customGameCode?: string
  readonly goPuzzleCount?: GoPuzzleCount
  readonly hardMode: boolean
  readonly mode: GameMode
  readonly ranked: boolean
  readonly ratingBucket?: RatingBucketId
  readonly timeLimitMs?: PracticeMultiplayerTimeLimitMs
  readonly wordLength: number
}

export interface PracticePostgameActions {
  readonly canPlayAgain: boolean
  readonly canRequestRematch: boolean
  readonly canSearchAgain: boolean
  readonly continuationKind: PracticePostgameContinuationKind
  readonly opponentSeat?: MultiplayerPlayerId
  readonly rematchUnavailableReason?: string
  readonly settings?: PracticePostgameSettings
  readonly unavailableReason?: string
  readonly viewerSeat?: MultiplayerPlayerId
}

export interface CreatePracticeRematchGameProjectionInput {
  readonly id?: string
  readonly now?: string
  readonly seed?: number
}

const TERMINAL_POSTGAME_STATUSES = new Set<MultiplayerGameStatus>(['won', 'lost', 'expired'])

function isTerminalPostgameStatus(status: MultiplayerGameStatus): boolean {
  return TERMINAL_POSTGAME_STATUSES.has(status)
}

function isPositiveTimeLimit(value: unknown): value is PracticeMultiplayerTimeLimitMs {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function getSeatForUser(game: MultiplayerGame, userId: string | null | undefined): MultiplayerPlayerId | undefined {
  if (!userId) {
    return undefined
  }
  if (game.playerUserIds?.['player-one'] === userId) {
    return 'player-one'
  }
  if (game.playerUserIds?.['player-two'] === userId) {
    return 'player-two'
  }
  return undefined
}

function getOpponentSeat(seat: MultiplayerPlayerId | undefined): MultiplayerPlayerId | undefined {
  if (!seat) {
    return undefined
  }
  return seat === 'player-one' ? 'player-two' : 'player-one'
}

function hasBothDistinctParticipants(game: MultiplayerGame): boolean {
  const playerOne = game.playerUserIds?.['player-one']
  const playerTwo = game.playerUserIds?.['player-two']
  return typeof playerOne === 'string'
    && playerOne.trim().length > 0
    && typeof playerTwo === 'string'
    && playerTwo.trim().length > 0
    && playerOne !== playerTwo
}

function getPracticePostgameSettings(game: MultiplayerGame): PracticePostgameSettings | undefined {
  if (game.scope !== 'practice' || game.dailyDateKey) {
    return undefined
  }
  if (!Number.isInteger(game.wordLength) || game.wordLength < 2) {
    return undefined
  }
  if (game.mode !== 'og' && game.mode !== 'go') {
    return undefined
  }

  const timeLimitMs = isPositiveTimeLimit(game.timeLimitMs) ? game.timeLimitMs : undefined
  const ratingBucket = game.ranked === true ? game.ratingBucket ?? getRatingBucket(game.mode) : undefined
  return {
    customGameCode: game.customGameCode,
    goPuzzleCount: game.mode === 'go' ? normalizeGoPuzzleCount(game.goPuzzleCount) : undefined,
    hardMode: game.hardMode === true,
    mode: game.mode,
    ranked: game.ranked === true,
    ratingBucket,
    timeLimitMs,
    wordLength: game.wordLength,
  }
}

function unavailable(unavailableReason: string, viewerSeat?: MultiplayerPlayerId, opponentSeat?: MultiplayerPlayerId): PracticePostgameActions {
  return {
    canPlayAgain: false,
    canRequestRematch: false,
    canSearchAgain: false,
    continuationKind: 'none',
    opponentSeat,
    unavailableReason,
    viewerSeat,
  }
}

export function getPracticePostgameActions(
  game: MultiplayerGame,
  viewerUserId: string | null | undefined,
): PracticePostgameActions {
  const viewerSeat = getSeatForUser(game, viewerUserId)
  const opponentSeat = getOpponentSeat(viewerSeat)
  if (game.scope === 'daily' || game.dailyDateKey) {
    return unavailable('Daily Multiplayer does not support rematch or same-settings postgame shortcuts.', viewerSeat, opponentSeat)
  }
  if (game.scope !== 'practice') {
    return unavailable('Postgame actions are only available for Practice multiplayer games.', viewerSeat, opponentSeat)
  }
  if (!isTerminalPostgameStatus(game.status)) {
    return unavailable('Postgame actions require a terminal Practice multiplayer game.', viewerSeat, opponentSeat)
  }
  if (!viewerSeat) {
    return unavailable('Only game participants can use Practice postgame actions.', viewerSeat, opponentSeat)
  }

  const settings = getPracticePostgameSettings(game)
  if (!settings || !hasBothDistinctParticipants(game)) {
    return unavailable('Practice postgame actions require a complete two-player game.', viewerSeat, opponentSeat)
  }

  if (settings.ranked) {
    const rankedTimeLimitMs = normalizeRankedPracticeTimeLimitMs(settings.timeLimitMs)
    if (rankedTimeLimitMs === undefined) {
      return {
        canPlayAgain: false,
        canRequestRematch: false,
        canSearchAgain: false,
        continuationKind: 'none',
        opponentSeat,
        rematchUnavailableReason: 'Ranked Practice rematches must use the trusted ranked queue instead of direct rematch.',
        settings,
        unavailableReason: 'Timed Practice ranked search-again supports only the five-minute ranked queue.',
        viewerSeat,
      }
    }
    const rankedSettings: PracticePostgameSettings = {
      ...settings,
      ratingBucket: getRankedPracticeRatingBucket(settings.mode, rankedTimeLimitMs) ?? settings.ratingBucket,
      timeLimitMs: rankedTimeLimitMs === null ? undefined : rankedTimeLimitMs as PracticeMultiplayerTimeLimitMs,
    }
    return {
      canPlayAgain: false,
      canRequestRematch: false,
      canSearchAgain: true,
      continuationKind: 'ranked-search-again',
      opponentSeat,
      rematchUnavailableReason: 'Ranked Practice rematches must use the trusted ranked queue instead of direct rematch.',
      settings: rankedSettings,
      viewerSeat,
    }
  }

  if (settings.customGameCode) {
    return {
      canPlayAgain: true,
      canRequestRematch: false,
      canSearchAgain: false,
      continuationKind: 'custom-play-again',
      opponentSeat,
      rematchUnavailableReason: 'Custom Practice games use setup-prefill instead of direct rematch.',
      settings,
      viewerSeat,
    }
  }

  return {
    canPlayAgain: true,
    canRequestRematch: true,
    canSearchAgain: false,
    continuationKind: 'unranked-play-again',
    opponentSeat,
    settings,
    viewerSeat,
  }
}

function isDirectPracticeRematchSource(game: MultiplayerGame): boolean {
  return game.scope === 'practice'
    && !game.dailyDateKey
    && isTerminalPostgameStatus(game.status)
    && game.ranked !== true
    && !game.matchmakingRequestId
    && !game.customGameCode
    && hasBothDistinctParticipants(game)
    && !!getPracticePostgameSettings(game)
}

export function createPracticeRematchGameProjection(
  sourceGame: MultiplayerGame,
  input: CreatePracticeRematchGameProjectionInput = {},
): MultiplayerGame | undefined {
  if (!isDirectPracticeRematchSource(sourceGame)) {
    return undefined
  }
  const settings = getPracticePostgameSettings(sourceGame)
  if (!settings) {
    return undefined
  }
  return createMultiplayerGame({
    createdAt: input.now,
    difficulty: sourceGame.difficulty,
    goPuzzleCount: sourceGame.mode === 'go' ? settings.goPuzzleCount : undefined,
    hardMode: settings.hardMode,
    id: input.id,
    mode: sourceGame.mode,
    playerProfiles: sourceGame.playerProfiles,
    playerUserIds: {
      'player-one': sourceGame.playerUserIds?.['player-one'],
      'player-two': sourceGame.playerUserIds?.['player-two'],
    },
    ranked: false,
    scope: 'practice',
    seed: input.seed,
    timeLimitMs: settings.timeLimitMs ?? null,
    wordLength: sourceGame.wordLength,
  })
}
