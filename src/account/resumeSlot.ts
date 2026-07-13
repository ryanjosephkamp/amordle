import { normalizeDifficultyTier, type DifficultyTier } from '../data/difficulty'
import { normalizeGoPuzzleCount, type GoPuzzleCount } from '../game/constants'
import type { SerializedGoSession } from '../game/go/session'
import type { SerializedOgSession } from '../game/og/session'
import type { PlayScope } from '../game/types'

/**
 * Phase 19.3 — typed "resume most recent unfinished game" slot. Replaces the
 * forward-compatible `resumeSlot?: unknown` reserved in Phase 18.8. The slot is
 * additive: it is only ever populated while a game is genuinely in progress and
 * is cleared the moment that game finishes, so the default behaviour (no slot)
 * is preserved for everyone who is not mid-game.
 */
export interface OgResumeSlot {
  readonly difficulty: DifficultyTier
  readonly mode: 'og'
  readonly scope: PlayScope
  readonly serializedSession: SerializedOgSession
  readonly updatedAt: string
  readonly wordLength: number
}

export interface GoResumeSlot {
  readonly difficulty: DifficultyTier
  readonly goPuzzleCount: GoPuzzleCount
  readonly mode: 'go'
  readonly scope: PlayScope
  readonly serializedSession: SerializedGoSession
  readonly updatedAt: string
  readonly wordLength: number
}

export type ResumeSlot = OgResumeSlot | GoResumeSlot

/** A resume slot without its timestamp, as captured by a live game component. */
export type ResumeCapture = Omit<OgResumeSlot, 'updatedAt'> | Omit<GoResumeSlot, 'updatedAt'>

export type ResumeSlotKey = 'daily-og' | 'daily-go' | 'practice-og' | 'practice-go'
export type ResumeSlotCollection = Partial<Record<ResumeSlotKey, ResumeSlot>>

const RESUME_SLOT_KEYS = ['daily-og', 'daily-go', 'practice-og', 'practice-go'] as const
type SlotStatePredicate = {
  readonly go: (session: SerializedGoSession) => boolean
  readonly og: (session: SerializedOgSession) => boolean
}

function isScope(value: unknown): value is PlayScope {
  return value === 'daily' || value === 'practice'
}

/**
 * True when an og session has been started but is neither solved nor out of
 * attempts — i.e. it is worth offering to resume.
 */
export function isOgSessionInProgress(session: SerializedOgSession): boolean {
  const solved = session.guesses.some((guess) => guess === session.answer)
  const lost = !solved && session.guesses.length >= session.maxAttempts
  const started = session.guesses.length > 0
    || session.currentGuess.length > 0
    || Boolean(session.consumableEffects?.removedLetters.length)
    || Boolean(session.consumableEffects?.revealedHints.length)
  return started && !solved && !lost
}

/**
 * True when a go chain has been started but is neither fully solved nor lost on
 * the active puzzle.
 */
export function isGoSessionInProgress(session: SerializedGoSession): boolean {
  if (session.puzzles.length === 0) {
    return false
  }

  const current = session.puzzles[Math.min(session.currentPuzzleIndex, session.puzzles.length - 1)]
  const currentSolved = current.guesses.some((guess) => guess === current.answer)
  const currentLost = !currentSolved && current.guesses.length >= current.maxAttempts
  const chainWon = currentSolved && session.currentPuzzleIndex >= session.puzzles.length - 1
  const hasConsumableEffects = Object.values(session.consumableEffectsByPuzzle ?? {}).some(
    (effects) => effects.removedLetters.length > 0 || effects.revealedHints.length > 0,
  )
  const started = session.currentPuzzleIndex > 0
    || session.puzzles.some((puzzle) => puzzle.guesses.length > 0 || puzzle.currentGuess.length > 0)
    || hasConsumableEffects
  return started && !chainWon && !currentLost
}

/** True when the captured session is in progress for its mode. */
export function isCaptureInProgress(capture: ResumeCapture): boolean {
  return capture.mode === 'og' ? isOgSessionInProgress(capture.serializedSession) : isGoSessionInProgress(capture.serializedSession)
}

export function isOgSessionWon(session: SerializedOgSession): boolean {
  return session.guesses.some((guess) => guess === session.answer)
}

export function isGoSessionWon(session: SerializedGoSession): boolean {
  if (session.puzzles.length === 0) {
    return false
  }

  const currentPuzzleIndex = Math.min(session.currentPuzzleIndex, session.puzzles.length - 1)
  const current = session.puzzles[currentPuzzleIndex]
  return currentPuzzleIndex >= session.puzzles.length - 1
    && current.guesses.some((guess) => guess === current.answer)
}

/** True when the captured session represents a completed winning terminal state. */
export function isCaptureWon(capture: ResumeCapture): boolean {
  return capture.mode === 'og' ? isOgSessionWon(capture.serializedSession) : isGoSessionWon(capture.serializedSession)
}

export function isOgSessionComplete(session: SerializedOgSession): boolean {
  return isOgSessionWon(session) || Boolean(session.revealedAnswer)
}

export function isGoSessionComplete(session: SerializedGoSession): boolean {
  return isGoSessionWon(session) || Boolean(session.revealedAnswer)
}

/** True when the captured session is a recordable Solo terminal state. */
export function isCaptureComplete(capture: ResumeCapture): boolean {
  return capture.mode === 'og' ? isOgSessionComplete(capture.serializedSession) : isGoSessionComplete(capture.serializedSession)
}

/** Stamp a capture with a timestamp to produce a persisted resume slot. */
export function createResumeSlot(capture: ResumeCapture, updatedAt: string = new Date().toISOString()): ResumeSlot {
  return { ...capture, updatedAt }
}

export function getResumeSlotKey(slot: Pick<ResumeSlot, 'mode' | 'scope'>): ResumeSlotKey {
  return `${slot.scope}-${slot.mode}` as ResumeSlotKey
}

function isResumeSlotKey(value: string): value is ResumeSlotKey {
  return RESUME_SLOT_KEYS.includes(value as ResumeSlotKey)
}

function isSerializedOgSession(value: unknown): value is SerializedOgSession {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.answer === 'string' &&
    typeof record.continuationCount === 'number' &&
    typeof record.currentGuess === 'string' &&
    Array.isArray(record.guesses) &&
    record.guesses.every((guess) => typeof guess === 'string') &&
    typeof record.hardMode === 'boolean' &&
    typeof record.maxAttempts === 'number'
  )
}

function isSerializedGoSession(value: unknown): value is SerializedGoSession {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  if (typeof record.currentPuzzleIndex !== 'number' || typeof record.hardMode !== 'boolean') {
    return false
  }
  if (!Array.isArray(record.priorAnswers) || !record.priorAnswers.every((answer) => typeof answer === 'string')) {
    return false
  }
  if (!Array.isArray(record.puzzles) || record.puzzles.length === 0) {
    return false
  }
  return record.puzzles.every((puzzle) => {
    if (typeof puzzle !== 'object' || puzzle === null) {
      return false
    }
    const entry = puzzle as Record<string, unknown>
    return (
      typeof entry.answer === 'string' &&
      typeof entry.continuationCount === 'number' &&
      typeof entry.currentGuess === 'string' &&
      Array.isArray(entry.guesses) &&
      entry.guesses.every((guess) => typeof guess === 'string') &&
      typeof entry.maxAttempts === 'number' &&
      Array.isArray(entry.prefilledGuesses) &&
      entry.prefilledGuesses.every((guess) => typeof guess === 'string')
    )
  })
}

function normalizeSlotForState(value: unknown, predicate: SlotStatePredicate): ResumeSlot | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as Record<string, unknown>
  if (!isScope(record.scope) || typeof record.wordLength !== 'number' || record.wordLength <= 0) {
    return undefined
  }
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString()
  const base = {
    difficulty: normalizeDifficultyTier(record.difficulty),
    scope: record.scope,
    updatedAt,
    wordLength: Math.trunc(record.wordLength),
  }

  if (record.mode === 'og' && isSerializedOgSession(record.serializedSession)) {
    const slot: OgResumeSlot = { ...base, mode: 'og', serializedSession: record.serializedSession }
    return predicate.og(slot.serializedSession) ? slot : undefined
  }

  if (record.mode === 'go' && isSerializedGoSession(record.serializedSession)) {
    const slot: GoResumeSlot = {
      ...base,
      goPuzzleCount: normalizeGoPuzzleCount(record.goPuzzleCount),
      mode: 'go',
      serializedSession: record.serializedSession,
    }
    return predicate.go(slot.serializedSession) ? slot : undefined
  }

  return undefined
}

/**
 * Validate and normalize an untrusted persisted resume slot. Returns `undefined`
 * for any malformed, finished, or missing slot so a corrupt payload can never
 * break load or surface a dead "Resume" button.
 */
export function normalizeResumeSlot(value: unknown): ResumeSlot | undefined {
  return normalizeSlotForState(value, {
    go: isGoSessionInProgress,
    og: isOgSessionInProgress,
  })
}

/**
 * Validate and normalize a display-only terminal slot. These slots are not
 * resumable; they exist only so a solved/lost Solo board can be re-rendered
 * after route changes or reloads without replaying completion rewards.
 */
export function normalizeCompletedSoloDisplaySlot(value: unknown): ResumeSlot | undefined {
  return normalizeSlotForState(value, {
    go: isGoSessionComplete,
    og: isOgSessionComplete,
  })
}

function normalizeSlotCollection(
  value: unknown,
  normalizeSlot: (value: unknown) => ResumeSlot | undefined,
): ResumeSlotCollection {
  if (typeof value !== 'object' || value === null) {
    return {}
  }

  const record = value as Record<string, unknown>
  return Object.fromEntries(RESUME_SLOT_KEYS.flatMap((key) => {
    const slot = normalizeSlot(record[key])
    if (!slot || getResumeSlotKey(slot) !== key) {
      return []
    }
    return [[key, slot]]
  })) as ResumeSlotCollection
}

export function normalizeResumeSlots(value: unknown): ResumeSlotCollection {
  return normalizeSlotCollection(value, normalizeResumeSlot)
}

export function normalizeCompletedSoloDisplaySlots(value: unknown): ResumeSlotCollection {
  return normalizeSlotCollection(value, normalizeCompletedSoloDisplaySlot)
}

export function getLatestResumeSlot(slots: ResumeSlotCollection): ResumeSlot | undefined {
  return Object.values(slots)
    .filter((slot): slot is ResumeSlot => Boolean(slot))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

export function mergeResumeSlots(left: ResumeSlotCollection | undefined, right: ResumeSlotCollection | undefined): ResumeSlotCollection | undefined {
  const merged: ResumeSlotCollection = {}
  const leftSlots = normalizeResumeSlots(left)
  const rightSlots = normalizeResumeSlots(right)

  for (const key of RESUME_SLOT_KEYS) {
    const leftSlot = leftSlots[key]
    const rightSlot = rightSlots[key]
    if (leftSlot && rightSlot) {
      merged[key] = leftSlot.updatedAt >= rightSlot.updatedAt ? leftSlot : rightSlot
    } else if (leftSlot || rightSlot) {
      merged[key] = leftSlot ?? rightSlot
    }
  }

  return Object.keys(merged).some(isResumeSlotKey) ? merged : undefined
}

/** Human-readable summary used for the home-screen Resume button. */
export function describeResumeSlot(slot: ResumeSlot): string {
  const mode = slot.mode === 'og' ? 'og' : 'go'
  const where = slot.scope === 'daily' ? 'daily' : 'practice'
  if (slot.mode === 'go') {
    return `Resume ${mode} ${where} — ${slot.goPuzzleCount} puzzles, ${slot.wordLength} letters`
  }
  return `Resume ${mode} ${where} — ${slot.wordLength} letters`
}
