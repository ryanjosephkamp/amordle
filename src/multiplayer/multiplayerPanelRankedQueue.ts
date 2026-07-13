import { DEFAULT_DIFFICULTY_TIER, type DifficultyTier } from '../data'
import { DEFAULT_GO_PUZZLE_COUNT, type GoPuzzleCount } from '../game/constants'
import type { GameMode, PlayScope } from '../game/types'
import type { MultiplayerProfileSummary } from './dailyMultiplayer'
import {
  createMultiplayerGame,
  type MultiplayerGame,
  type MultiplayerPlayerId,
  type PracticeMultiplayerTimeLimitMs,
} from './multiplayer'
import type { CreateRankedQueueRequestInput, RankedQueueStatusResult } from './multiplayerRepository'
import {
  getRankedDailyRatingBucket,
  normalizeRankedPracticeTimeLimitMs,
  TIMED_RANKED_PRACTICE_TIME_LIMIT_MS,
} from './rating'

export interface RankedQueueSelectionSettings {
  readonly dailyDateKey?: string
  readonly hardMode: boolean
  readonly mode: GameMode
  readonly scope?: PlayScope
  readonly timeLimitMs?: PracticeMultiplayerTimeLimitMs | null
  readonly wordLength: number
}

export const RANKED_QUEUE_REQUEST_TTL_MS = 5 * 60 * 1000

export interface BuildFinalizedRankedGameInput {
  readonly defaultDifficulty: DifficultyTier
  readonly defaultGoPuzzleCount: GoPuzzleCount
  readonly status: RankedQueueStatusResult
  readonly viewerProfile?: MultiplayerProfileSummary
}

function getRankedPracticeTimeLimitMs(value: unknown): PracticeMultiplayerTimeLimitMs | null | undefined {
  const normalized = normalizeRankedPracticeTimeLimitMs(value)
  if (normalized === undefined) {
    return undefined
  }
  return normalized === null ? null : TIMED_RANKED_PRACTICE_TIME_LIMIT_MS
}

export function buildRankedQueueRequestInput(
  settings: RankedQueueSelectionSettings,
): CreateRankedQueueRequestInput | undefined {
  const scope = settings.scope ?? 'practice'
  if (scope === 'daily') {
    const dailyDateKey = normalizeDailyDateKey(settings.dailyDateKey)
    if (!dailyDateKey || settings.wordLength !== 5 || (settings.timeLimitMs !== null && settings.timeLimitMs !== undefined)) {
      return undefined
    }
    return {
      dailyDateKey,
      hardMode: settings.hardMode,
      mode: settings.mode,
      scope: 'daily',
      timeLimitMs: null,
      wordLength: 5,
    }
  }
  const timeLimitMs = getRankedPracticeTimeLimitMs(settings.timeLimitMs)
  if (timeLimitMs === undefined) {
    return undefined
  }
  const request: CreateRankedQueueRequestInput = {
    hardMode: settings.hardMode,
    mode: settings.mode,
    timeLimitMs,
    wordLength: settings.wordLength,
  }
  return settings.scope === 'practice' ? { ...request, scope: 'practice' } : request
}

function normalizeDailyDateKey(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined
  }
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? undefined : value
}

export function withRankedQueueExpiry(
  request: CreateRankedQueueRequestInput,
  now: Date = new Date(),
): CreateRankedQueueRequestInput {
  if (request.scope === 'daily') {
    const dailyDateKey = normalizeDailyDateKey(request.dailyDateKey)
    if (!dailyDateKey) {
      return request
    }
    const expiresAt = new Date(`${dailyDateKey}T00:00:00.000Z`)
    expiresAt.setUTCDate(expiresAt.getUTCDate() + 1)
    return {
      ...request,
      expiresAt: expiresAt.toISOString(),
    }
  }
  return {
    ...request,
    expiresAt: new Date(now.getTime() + RANKED_QUEUE_REQUEST_TTL_MS).toISOString(),
  }
}

export function getRankedQueueFinalizationIdempotencyKey(status: RankedQueueStatusResult): string | undefined {
  if (!status.matchedGameId) {
    return undefined
  }
  const namespace = status.scope === 'daily'
    ? 'phase55-ranked-daily-v1'
    : status.timeLimitMs === TIMED_RANKED_PRACTICE_TIME_LIMIT_MS
    ? 'phase33-ranked-timed-v1'
    : 'phase27-ranked-v1'
  return `${namespace}:finalize:${status.matchedGameId}`
}

export function getRankedQueueCreationIdempotencyKey(
  request: CreateRankedQueueRequestInput,
  viewerUserId: string,
): string | undefined {
  if (request.scope !== 'daily' || !request.dailyDateKey || !viewerUserId) {
    return undefined
  }
  return `phase55-ranked-daily-v1:queue:${viewerUserId}:${request.dailyDateKey}:${request.mode}:${request.hardMode === true}`
}

export function buildFinalizedRankedGameFromStatus({
  defaultDifficulty,
  defaultGoPuzzleCount,
  status,
  viewerProfile,
}: BuildFinalizedRankedGameInput): MultiplayerGame | undefined {
  const scope = status.scope
  const dailyDateKey = normalizeDailyDateKey(status.dailyDateKey)
  const rankedTimeLimitMs = getRankedPracticeTimeLimitMs(status.timeLimitMs)
  if (
    status.requestStatus !== 'matched'
    || !status.matchedGameId
    || !status.mode
    || (scope !== 'practice' && scope !== 'daily')
    || !status.ratingBucket
    || !status.wordLength
    || status.hardMode === undefined
    || rankedTimeLimitMs === undefined
    || !status.playerOneUserId
    || !status.playerTwoUserId
    || status.playerOneUserId === status.playerTwoUserId
    || !status.viewerSeat
  ) {
    return undefined
  }
  if (scope === 'daily') {
    if (
      !dailyDateKey
      || status.wordLength !== 5
      || status.timeLimitMs !== undefined
      || status.ratingBucket !== getRankedDailyRatingBucket(status.mode)
    ) {
      return undefined
    }
  } else if (dailyDateKey || getRankedPracticeTimeLimitMs(status.timeLimitMs) === undefined) {
    return undefined
  }
  const playerProfiles: Partial<Record<MultiplayerPlayerId, MultiplayerProfileSummary>> | undefined = viewerProfile
    ? { [status.viewerSeat]: viewerProfile }
    : undefined
  return createMultiplayerGame({
    createdAt: status.matchedAt ?? status.queuedAt,
    dailyDateKey: scope === 'daily' ? dailyDateKey : undefined,
    difficulty: scope === 'daily' ? DEFAULT_DIFFICULTY_TIER : defaultDifficulty,
    goPuzzleCount: scope === 'daily' ? DEFAULT_GO_PUZZLE_COUNT : defaultGoPuzzleCount,
    hardMode: status.hardMode,
    id: status.matchedGameId,
    matchmakingRequestId: status.requestId,
    mode: status.mode,
    playerProfiles,
    playerUserIds: {
      'player-one': status.playerOneUserId,
      'player-two': status.playerTwoUserId,
    },
    ranked: true,
    ratingBucket: status.ratingBucket,
    scope,
    timeLimitMs: scope === 'practice' ? rankedTimeLimitMs : undefined,
    wordLength: status.wordLength,
  })
}
