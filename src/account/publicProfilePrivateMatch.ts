import {
  DEFAULT_GO_PUZZLE_COUNT,
  MAX_PRACTICE_WORD_LENGTH,
  MIN_PRACTICE_WORD_LENGTH,
  normalizeGoPuzzleCount,
  type GoPuzzleCount,
} from '../game/constants'
import type { GameMode } from '../game/types'
import {
  PRACTICE_MULTIPLAYER_TIME_LIMIT_OPTIONS,
  type PracticeMultiplayerTimeLimitMs,
} from '../multiplayer/multiplayer'
import type { OwnerPublicProfile } from './publicProfile'

export const PRIVATE_MATCH_REQUESTER_PUBLIC_PROFILE_REQUIRED_MESSAGE = 'Private Practice requests require your account to have an active public profile with a display name. Ranked Elo is not required.'
export const PRIVATE_PRACTICE_REQUEST_IDEMPOTENCY_PREFIX = 'phase52-private-request:create'

export interface PrivatePracticeRequestSettingsInput {
  readonly goPuzzleCount?: unknown
  readonly hardMode?: boolean
  readonly mode?: unknown
  readonly timeLimitMs?: unknown
  readonly wordLength?: unknown
}

export interface PrivatePracticeRequestSettings {
  readonly goPuzzleCount?: GoPuzzleCount
  readonly hardMode: boolean
  readonly mode: GameMode
  readonly timeLimitMs: PracticeMultiplayerTimeLimitMs | null
  readonly wordLength: number
}

export type PrivatePracticeRequestSettingsResult =
  | { readonly ok: true; readonly settings: PrivatePracticeRequestSettings }
  | { readonly message: string; readonly ok: false }

function parseMode(value: unknown): GameMode | undefined {
  return value === 'go' || value === 'og' ? value : undefined
}

function parseWordLength(value: unknown): number | undefined {
  const numericValue = typeof value === 'string' && value.trim() !== ''
    ? Number(value)
    : value
  return typeof numericValue === 'number'
    && Number.isInteger(numericValue)
    && numericValue >= MIN_PRACTICE_WORD_LENGTH
    && numericValue <= MAX_PRACTICE_WORD_LENGTH
    ? numericValue
    : undefined
}

function parseTimeLimitMs(value: unknown): PracticeMultiplayerTimeLimitMs | null | undefined {
  if (value === undefined || value === null || value === '') {
    return null
  }
  const numericValue = typeof value === 'string' && value.trim() !== ''
    ? Number(value)
    : value
  const option = PRACTICE_MULTIPLAYER_TIME_LIMIT_OPTIONS.find((candidate) => candidate.value === numericValue)
  if (!option) {
    return undefined
  }
  return option.value === null ? null : option.value
}

function formatPrivatePracticeClock(ms: PracticeMultiplayerTimeLimitMs): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function normalizePrivatePracticeRequestSettings(
  input: PrivatePracticeRequestSettingsInput,
): PrivatePracticeRequestSettingsResult {
  const mode = parseMode(input.mode ?? 'og')
  if (!mode) {
    return { message: 'Private Practice requests support OG or GO only.', ok: false }
  }

  const wordLength = parseWordLength(input.wordLength ?? 5)
  if (!wordLength) {
    return { message: `Private Practice word length must be ${MIN_PRACTICE_WORD_LENGTH}-${MAX_PRACTICE_WORD_LENGTH}.`, ok: false }
  }

  const timeLimitMs = parseTimeLimitMs(input.timeLimitMs)
  if (timeLimitMs === undefined) {
    return { message: 'Private Practice time control is not supported.', ok: false }
  }

  const goPuzzleCount = mode === 'go'
    ? normalizeGoPuzzleCount(input.goPuzzleCount ?? DEFAULT_GO_PUZZLE_COUNT)
    : undefined

  return {
    ok: true,
    settings: {
      goPuzzleCount,
      hardMode: input.hardMode === true,
      mode,
      timeLimitMs,
      wordLength,
    },
  }
}

export function getPrivatePracticeRequestSettingsLabel(settings: PrivatePracticeRequestSettings): string {
  const modeLabel = settings.mode.toUpperCase()
  const goPuzzleLabel = settings.mode === 'go' && settings.goPuzzleCount ? `, ${settings.goPuzzleCount} puzzles` : ''
  const hardModeLabel = settings.hardMode ? 'Hard Mode on' : 'Hard Mode off'
  const timeLabel = settings.timeLimitMs ? `${formatPrivatePracticeClock(settings.timeLimitMs)} per side` : 'no clock'
  return `${modeLabel}, ${settings.wordLength} letters${goPuzzleLabel}, ${hardModeLabel}, ${timeLabel}`
}

export function createPrivatePracticeRequestIdempotencyKey(
  targetPublicProfileId: string,
  settings: PrivatePracticeRequestSettings,
  nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
): string {
  return [
    PRIVATE_PRACTICE_REQUEST_IDEMPOTENCY_PREFIX,
    settings.mode,
    settings.wordLength.toString(10),
    settings.hardMode ? 'hard' : 'normal',
    settings.timeLimitMs?.toString(10) ?? 'no-clock',
    settings.goPuzzleCount?.toString(10) ?? 'og',
    targetPublicProfileId,
    nonce,
  ].join(':')
}

export function isOwnerPublicProfileEligibleForPrivateMatch(profile: OwnerPublicProfile | undefined): boolean {
  return Boolean(
    profile
    && profile.visibility === 'public'
    && profile.moderationStatus === 'active'
    && profile.displayName,
  )
}

export function getPrivateMatchRequestErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : ''
  if (/requester must have an active public profile/iu.test(message)) {
    return PRIVATE_MATCH_REQUESTER_PUBLIC_PROFILE_REQUIRED_MESSAGE
  }
  return message || 'Unable to send private match request right now.'
}
