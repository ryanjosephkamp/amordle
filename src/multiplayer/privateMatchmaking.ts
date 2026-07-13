import type { DifficultyTier } from '../data'
import { DEFAULT_GO_PUZZLE_COUNT, normalizeGoPuzzleCount, type GoPuzzleCount } from '../game/constants'
import type { MultiplayerProfileSummary } from './dailyMultiplayer'
import {
  createMultiplayerGame,
  PRACTICE_MULTIPLAYER_TIME_LIMIT_OPTIONS,
  type MultiplayerGame,
  type PracticeMultiplayerTimeLimitMs,
} from './multiplayer'
import type { PrivateMatchProfileSummary, PrivateMatchRequestResult } from './multiplayerRepository'

export interface CreatePrivateMatchGameProjectionInput {
  readonly defaultDifficulty: DifficultyTier
  readonly defaultGoPuzzleCount?: GoPuzzleCount
  readonly id?: string
  readonly now?: string
  readonly seed?: number
}

function safeProfileSummary(
  profile: PrivateMatchProfileSummary,
  fallbackLabel: string,
): MultiplayerProfileSummary | undefined {
  if (!profile.identityAvailable || !profile.displayName) {
    return undefined
  }
  return {
    accentColor: profile.accentColor,
    avatarUrl: profile.avatarUrl,
    displayName: profile.displayName,
    label: profile.displayName || fallbackLabel,
  }
}

function getPrivateMatchTimeLimitMs(value: number | undefined): PracticeMultiplayerTimeLimitMs | null | undefined {
  if (value === undefined) {
    return null
  }
  return PRACTICE_MULTIPLAYER_TIME_LIMIT_OPTIONS.some((option) => option.value === value)
    ? value as PracticeMultiplayerTimeLimitMs
    : undefined
}

export function getPrivateMatchAcceptIdempotencyKey(
  request: Pick<PrivateMatchRequestResult, 'requestId'>,
  gameId: string,
): string {
  return `phase40-private-request:accept:v2:${request.requestId}:${gameId}`
}

export function createPrivateMatchGameProjection(
  request: PrivateMatchRequestResult,
  input: CreatePrivateMatchGameProjectionInput,
): MultiplayerGame | undefined {
  if (
    request.expired
    || request.requestStatus !== 'requested'
    || request.viewerRole !== 'opponent'
    || !request.viewerCanAccept
  ) {
    return undefined
  }
  const timeLimitMs = getPrivateMatchTimeLimitMs(request.timeLimitMs)
  if (timeLimitMs === undefined) {
    return undefined
  }
  const goPuzzleCount = request.mode === 'go'
    ? normalizeGoPuzzleCount(request.goPuzzleCount ?? input.defaultGoPuzzleCount ?? DEFAULT_GO_PUZZLE_COUNT)
    : undefined
  if (request.mode === 'go' && goPuzzleCount !== request.goPuzzleCount) {
    return undefined
  }

  return createMultiplayerGame({
    createdAt: input.now,
    difficulty: input.defaultDifficulty,
    goPuzzleCount,
    hardMode: request.hardMode,
    id: input.id,
    mode: request.mode,
    playerProfiles: {
      'player-one': safeProfileSummary(request.requester, 'Requester'),
      'player-two': safeProfileSummary(request.opponent, 'Opponent'),
    },
    ranked: false,
    scope: 'practice',
    seed: input.seed,
    timeLimitMs,
    wordLength: request.wordLength,
  })
}
