import { normalizeDifficultyTier, type DifficultyTier } from '../data/difficulty'
import { normalizeGoPuzzleCount, type GoPuzzleCount } from '../game/constants'
import type { SerializedGoSession } from '../game/go/session'
import type { SerializedOgSession } from '../game/og/session'
import type { GameMode, GameStatus, PlayScope } from '../game/types'
import type { ConsumableType } from '../progression'
import type { BrrrdleSupabaseClient } from './supabaseClient'
import type { GuestProgressState } from './storageSchema'
import {
  createResumeSlot,
  getLatestResumeSlot,
  getResumeSlotKey,
  isCaptureComplete,
  isCaptureInProgress,
  isGoSessionComplete,
  isOgSessionComplete,
  normalizeResumeSlots,
  type ResumeSlot,
  type ResumeSlotCollection,
} from './resumeSlot'

const SOLO_CLOUD_HISTORY_KIND = 'solo-cloud-session-v1'
const SOLO_CLOUD_HISTORY_ID_PREFIX = 'solo'

export type SoloCloudMutationEventType = 'valid_guess' | 'pay_to_continue' | 'reveal' | 'consumable_use'

export interface SoloCloudMutationEventInput {
  readonly cost?: number
  readonly consumableType?: ConsumableType
  readonly eventType: SoloCloudMutationEventType
  readonly guess?: string
  readonly puzzleIndex: number
}

export interface SoloCloudMutation {
  readonly dailyDateKey?: string
  readonly difficulty: DifficultyTier
  readonly event: SoloCloudMutationEventInput
  readonly goPuzzleCount?: GoPuzzleCount
  readonly hardMode: boolean
  readonly mode: GameMode
  readonly practiceSeed?: number
  readonly scope: PlayScope
  readonly serializedSession: SerializedOgSession | SerializedGoSession
  readonly sessionKey: string
  readonly wordLength: number
}

export interface SoloCloudEvent {
  readonly cost?: number
  readonly consumableType?: ConsumableType
  readonly createdAt: string
  readonly eventId: string
  readonly eventType: SoloCloudMutationEventType
  readonly guess?: string
  readonly puzzleIndex: number
  readonly status: GameStatus
}

export interface SoloCloudSessionRecord {
  readonly completedAt?: string
  readonly currentPuzzleIndex: number
  readonly dailyDateKey?: string
  readonly difficulty: DifficultyTier
  readonly events: readonly SoloCloudEvent[]
  readonly goPuzzleCount?: GoPuzzleCount
  readonly hardMode: boolean
  readonly mode: GameMode
  readonly practiceSeed?: number
  readonly scope: PlayScope
  readonly serializedSession: SerializedOgSession | SerializedGoSession
  readonly sessionKey: string
  readonly status: GameStatus
  readonly updatedAt: string
  readonly wordLength: number
}

export interface SoloCloudHydrationResult {
  readonly completedSlots: ResumeSlotCollection
  readonly progress: GuestProgressState
}

export interface SoloCloudHydrationOptions {
  readonly currentPracticeSeeds?: Partial<Record<GameMode, number>>
}

export interface SoloCloudProgressRepository {
  readonly loadRecentSessions: (userId: string, limit?: number) => Promise<readonly SoloCloudSessionRecord[]>
  readonly saveMutation: (userId: string, mutation: SoloCloudMutation) => Promise<SoloCloudSessionRecord>
}

interface SoloCloudHistoryEntry {
  readonly kind: typeof SOLO_CLOUD_HISTORY_KIND
  readonly session: SoloCloudSessionRecord
}

interface GameHistoryRow {
  readonly completed_at?: unknown
  readonly entry?: unknown
  readonly id?: unknown
  readonly user_id?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isScope(value: unknown): value is PlayScope {
  return value === 'daily' || value === 'practice'
}

function isMode(value: unknown): value is GameMode {
  return value === 'og' || value === 'go'
}

function isStatus(value: unknown): value is GameStatus {
  return value === 'playing' || value === 'won' || value === 'lost'
}

function isSerializedOgSession(value: unknown): value is SerializedOgSession {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.answer === 'string'
    && typeof value.continuationCount === 'number'
    && typeof value.currentGuess === 'string'
    && Array.isArray(value.guesses)
    && value.guesses.every((guess) => typeof guess === 'string')
    && typeof value.hardMode === 'boolean'
    && typeof value.maxAttempts === 'number'
}

function isSerializedGoSession(value: unknown): value is SerializedGoSession {
  if (!isRecord(value) || typeof value.currentPuzzleIndex !== 'number' || typeof value.hardMode !== 'boolean') {
    return false
  }
  if (!Array.isArray(value.priorAnswers) || !value.priorAnswers.every((answer) => typeof answer === 'string')) {
    return false
  }
  return Array.isArray(value.puzzles) && value.puzzles.length > 0 && value.puzzles.every((puzzle) => {
    if (!isRecord(puzzle)) {
      return false
    }
    return typeof puzzle.answer === 'string'
      && typeof puzzle.continuationCount === 'number'
      && typeof puzzle.currentGuess === 'string'
      && Array.isArray(puzzle.guesses)
      && puzzle.guesses.every((guess) => typeof guess === 'string')
      && typeof puzzle.maxAttempts === 'number'
      && Array.isArray(puzzle.prefilledGuesses)
      && puzzle.prefilledGuesses.every((guess) => typeof guess === 'string')
  })
}

function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString()
}

function normalizeSoloCloudEvent(value: unknown): SoloCloudEvent | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  if (
    value.eventType !== 'valid_guess'
    && value.eventType !== 'pay_to_continue'
    && value.eventType !== 'reveal'
    && value.eventType !== 'consumable_use'
  ) {
    return undefined
  }
  if (typeof value.eventId !== 'string' || typeof value.puzzleIndex !== 'number' || !isStatus(value.status)) {
    return undefined
  }
  const createdAt = normalizeDate(value.createdAt)
  if (!createdAt) {
    return undefined
  }
  return {
    ...(typeof value.cost === 'number' ? { cost: Math.max(0, Math.trunc(value.cost)) } : {}),
    createdAt,
    ...(value.consumableType === 'revealOneLetter' || value.consumableType === 'removeIncorrectLetters'
      ? { consumableType: value.consumableType }
      : {}),
    eventId: value.eventId,
    eventType: value.eventType,
    ...(typeof value.guess === 'string' ? { guess: value.guess.toLocaleUpperCase('en-US') } : {}),
    puzzleIndex: Math.max(0, Math.trunc(value.puzzleIndex)),
    status: value.status,
  }
}

export function createSoloCloudSessionKey(input: {
  readonly dailyDateKey?: string
  readonly difficulty: DifficultyTier
  readonly goPuzzleCount?: GoPuzzleCount
  readonly mode: GameMode
  readonly practiceSeed?: number
  readonly scope: PlayScope
  readonly wordLength: number
}): string {
  const difficulty = normalizeDifficultyTier(input.difficulty)
  if (input.scope === 'daily') {
    const dateKey = input.dailyDateKey ?? 'current'
    if (input.mode === 'go') {
      return `${SOLO_CLOUD_HISTORY_ID_PREFIX}:daily:go:${difficulty}:${normalizeGoPuzzleCount(input.goPuzzleCount)}:${dateKey}`
    }
    return `${SOLO_CLOUD_HISTORY_ID_PREFIX}:daily:og:${difficulty}:${dateKey}`
  }

  const practiceSeed = Math.trunc(input.practiceSeed ?? 0)
  if (input.mode === 'go') {
    return `${SOLO_CLOUD_HISTORY_ID_PREFIX}:practice:go:${difficulty}:${normalizeGoPuzzleCount(input.goPuzzleCount)}:${Math.trunc(input.wordLength)}:${practiceSeed}`
  }
  return `${SOLO_CLOUD_HISTORY_ID_PREFIX}:practice:og:${difficulty}:${Math.trunc(input.wordLength)}:${practiceSeed}`
}

function getSoloCloudStatus(mutation: Pick<SoloCloudMutation, 'mode' | 'serializedSession'>): GameStatus {
  if (mutation.mode === 'og' && isSerializedOgSession(mutation.serializedSession)) {
    const session = mutation.serializedSession
    if (session.guesses.some((guess) => guess === session.answer)) {
      return 'won'
    }
    return isOgSessionComplete(session) ? 'lost' : 'playing'
  }

  if (mutation.mode === 'go' && isSerializedGoSession(mutation.serializedSession)) {
    const session = mutation.serializedSession
    if (isGoSessionComplete(session)) {
      const currentPuzzle = session.puzzles[Math.min(
        session.currentPuzzleIndex,
        session.puzzles.length - 1,
      )]
      return currentPuzzle?.guesses.includes(currentPuzzle.answer) && session.currentPuzzleIndex >= session.puzzles.length - 1
        ? 'won'
        : 'lost'
    }
    return 'playing'
  }

  return 'playing'
}

function getCurrentPuzzleIndex(mutation: Pick<SoloCloudMutation, 'mode' | 'serializedSession'>): number {
  if (mutation.mode === 'go' && isSerializedGoSession(mutation.serializedSession)) {
    return Math.max(0, Math.trunc(mutation.serializedSession.currentPuzzleIndex))
  }
  return 0
}

function getEventSequence(mutation: SoloCloudMutation): string {
  if (mutation.mode === 'og' && isSerializedOgSession(mutation.serializedSession)) {
    if (mutation.event.eventType === 'consumable_use') {
      const effects = mutation.serializedSession.consumableEffects
      return `${effects?.revealedHints.length ?? 0}-${effects?.removedLetters.length ?? 0}`
    }
    if (mutation.event.eventType === 'pay_to_continue') {
      return String(mutation.serializedSession.continuationCount)
    }
    if (mutation.event.eventType === 'reveal') {
      return 'revealed'
    }
    return String(mutation.serializedSession.guesses.length)
  }

  if (mutation.mode === 'go' && isSerializedGoSession(mutation.serializedSession)) {
    const puzzle = mutation.serializedSession.puzzles[mutation.event.puzzleIndex]
    if (!puzzle) {
      return 'unknown'
    }
    if (mutation.event.eventType === 'consumable_use') {
      const effects = mutation.serializedSession.consumableEffectsByPuzzle?.[String(mutation.event.puzzleIndex)]
      return `${effects?.revealedHints.length ?? 0}-${effects?.removedLetters.length ?? 0}`
    }
    if (mutation.event.eventType === 'pay_to_continue') {
      return String(puzzle.continuationCount)
    }
    if (mutation.event.eventType === 'reveal') {
      return 'revealed'
    }
    return String(puzzle.guesses.length)
  }

  return 'unknown'
}

function createSoloCloudEvent(mutation: SoloCloudMutation, status: GameStatus, createdAt: string): SoloCloudEvent {
  const eventId = [
    mutation.sessionKey,
    mutation.event.eventType,
    Math.max(0, Math.trunc(mutation.event.puzzleIndex)),
    getEventSequence(mutation),
  ].join(':')

  return {
    ...(typeof mutation.event.cost === 'number' ? { cost: Math.max(0, Math.trunc(mutation.event.cost)) } : {}),
    createdAt,
    ...(mutation.event.consumableType ? { consumableType: mutation.event.consumableType } : {}),
    eventId,
    eventType: mutation.event.eventType,
    ...(mutation.event.guess ? { guess: mutation.event.guess.toLocaleUpperCase('en-US') } : {}),
    puzzleIndex: Math.max(0, Math.trunc(mutation.event.puzzleIndex)),
    status,
  }
}

function mergeEvents(
  existingEvents: readonly SoloCloudEvent[] | undefined,
  event: SoloCloudEvent,
): readonly SoloCloudEvent[] {
  const events = existingEvents ?? []
  if (events.some((entry) => entry.eventId === event.eventId)) {
    return events
  }
  return [...events, event]
}

function createSessionRecordFromMutation(
  mutation: SoloCloudMutation,
  existing: SoloCloudSessionRecord | undefined,
  now = new Date().toISOString(),
): SoloCloudSessionRecord {
  const status = getSoloCloudStatus(mutation)
  const event = createSoloCloudEvent(mutation, status, now)
  return {
    ...(status === 'playing' ? existing?.completedAt ? { completedAt: existing.completedAt } : {} : { completedAt: now }),
    ...(mutation.dailyDateKey ? { dailyDateKey: mutation.dailyDateKey } : existing?.dailyDateKey ? { dailyDateKey: existing.dailyDateKey } : {}),
    currentPuzzleIndex: getCurrentPuzzleIndex(mutation),
    difficulty: normalizeDifficultyTier(mutation.difficulty),
    events: mergeEvents(existing?.events, event),
    ...(mutation.mode === 'go' ? { goPuzzleCount: normalizeGoPuzzleCount(mutation.goPuzzleCount) } : {}),
    hardMode: mutation.hardMode,
    mode: mutation.mode,
    ...(typeof mutation.practiceSeed === 'number' ? { practiceSeed: Math.trunc(mutation.practiceSeed) } : existing?.practiceSeed !== undefined ? { practiceSeed: existing.practiceSeed } : {}),
    scope: mutation.scope,
    serializedSession: mutation.serializedSession,
    sessionKey: mutation.sessionKey,
    status,
    updatedAt: now,
    wordLength: Math.max(1, Math.trunc(mutation.wordLength)),
  }
}

function toHistoryEntry(session: SoloCloudSessionRecord): SoloCloudHistoryEntry {
  return {
    kind: SOLO_CLOUD_HISTORY_KIND,
    session,
  }
}

function normalizeSoloCloudSessionRecord(entry: unknown): SoloCloudSessionRecord | undefined {
  if (!isRecord(entry) || entry.kind !== SOLO_CLOUD_HISTORY_KIND || !isRecord(entry.session)) {
    return undefined
  }
  const session = entry.session
  if (
    typeof session.sessionKey !== 'string'
    || !isMode(session.mode)
    || !isScope(session.scope)
    || !isStatus(session.status)
    || typeof session.wordLength !== 'number'
    || typeof session.currentPuzzleIndex !== 'number'
    || typeof session.hardMode !== 'boolean'
  ) {
    return undefined
  }
  const updatedAt = normalizeDate(session.updatedAt)
  if (!updatedAt) {
    return undefined
  }
  const completedAt = normalizeDate(session.completedAt)
  const mode = session.mode
  const serializedSession = mode === 'og'
    ? isSerializedOgSession(session.serializedSession) ? session.serializedSession : undefined
    : isSerializedGoSession(session.serializedSession) ? session.serializedSession : undefined
  if (!serializedSession) {
    return undefined
  }
  const events = Array.isArray(session.events)
    ? session.events.flatMap((event) => {
        const normalized = normalizeSoloCloudEvent(event)
        return normalized ? [normalized] : []
      })
    : []

  return {
    ...(completedAt ? { completedAt } : {}),
    ...(typeof session.dailyDateKey === 'string' ? { dailyDateKey: session.dailyDateKey } : {}),
    currentPuzzleIndex: Math.max(0, Math.trunc(session.currentPuzzleIndex)),
    difficulty: normalizeDifficultyTier(session.difficulty),
    events,
    ...(mode === 'go' ? { goPuzzleCount: normalizeGoPuzzleCount(session.goPuzzleCount) } : {}),
    hardMode: session.hardMode,
    mode,
    ...(typeof session.practiceSeed === 'number' ? { practiceSeed: Math.trunc(session.practiceSeed) } : {}),
    scope: session.scope,
    serializedSession,
    sessionKey: session.sessionKey,
    status: session.status,
    updatedAt,
    wordLength: Math.max(1, Math.trunc(session.wordLength)),
  }
}

function createSlotFromSoloCloudSession(session: SoloCloudSessionRecord): ResumeSlot | undefined {
  const slot = session.mode === 'og' && isSerializedOgSession(session.serializedSession)
    ? createResumeSlot({
        difficulty: session.difficulty,
        mode: 'og',
        scope: session.scope,
        serializedSession: session.serializedSession,
        wordLength: session.wordLength,
      }, session.updatedAt)
    : session.mode === 'go' && isSerializedGoSession(session.serializedSession)
      ? createResumeSlot({
          difficulty: session.difficulty,
          goPuzzleCount: normalizeGoPuzzleCount(session.goPuzzleCount),
          mode: 'go',
          scope: session.scope,
          serializedSession: session.serializedSession,
          wordLength: session.wordLength,
        }, session.updatedAt)
      : undefined

  return slot && (isCaptureInProgress(slot) || isCaptureComplete(slot)) ? slot : undefined
}

function isNewerSlot(left: ResumeSlot | undefined, right: ResumeSlot): boolean {
  return !left || right.updatedAt.localeCompare(left.updatedAt) > 0
}

function getCanonicalProgressRank(slot: ResumeSlot): readonly number[] {
  if (slot.mode === 'og') {
    const effects = slot.serializedSession.consumableEffects
    return [
      0,
      slot.serializedSession.guesses.length,
      slot.serializedSession.continuationCount,
      effects?.revealedHints.length ?? 0,
      effects?.removedLetters.length ?? 0,
    ]
  }

  const sessions = slot.serializedSession.puzzles
  return [
    slot.serializedSession.currentPuzzleIndex,
    sessions.reduce((total, puzzle) => total + puzzle.guesses.length, 0),
    sessions.reduce((total, puzzle) => total + puzzle.continuationCount, 0),
    Object.values(slot.serializedSession.consumableEffectsByPuzzle ?? {})
      .reduce((total, effects) => total + effects.revealedHints.length, 0),
    Object.values(slot.serializedSession.consumableEffectsByPuzzle ?? {})
      .reduce((total, effects) => total + effects.removedLetters.length, 0),
  ]
}

function compareCanonicalProgress(left: ResumeSlot, right: ResumeSlot): number {
  const leftRank = getCanonicalProgressRank(left)
  const rightRank = getCanonicalProgressRank(right)
  for (let index = 0; index < Math.max(leftRank.length, rightRank.length); index += 1) {
    const difference = (leftRank[index] ?? 0) - (rightRank[index] ?? 0)
    if (difference !== 0) {
      return difference
    }
  }
  return 0
}

function shouldUseIncomingInProgressSlot(current: ResumeSlot | undefined, incoming: ResumeSlot): boolean {
  if (!current) {
    return true
  }
  return compareCanonicalProgress(incoming, current) > 0
}

function collectionHasSlots(slots: ResumeSlotCollection): boolean {
  return Object.keys(slots).length > 0
}

function isSupersededPracticeSession(session: SoloCloudSessionRecord, options: SoloCloudHydrationOptions | undefined): boolean {
  if (session.scope !== 'practice') {
    return false
  }
  const currentSeed = options?.currentPracticeSeeds?.[session.mode]
  return typeof currentSeed === 'number'
    && typeof session.practiceSeed === 'number'
    && session.practiceSeed !== currentSeed
}

export function mergeSoloCloudSessionsIntoProgress(
  progress: GuestProgressState,
  sessions: readonly SoloCloudSessionRecord[],
  options?: SoloCloudHydrationOptions,
): SoloCloudHydrationResult {
  const resumeSlots = { ...normalizeResumeSlots(progress.resumeSlots) }
  const completedSlots: ResumeSlotCollection = {}

  for (const session of sessions) {
    if (isSupersededPracticeSession(session, options)) {
      continue
    }
    const slot = createSlotFromSoloCloudSession(session)
    if (!slot) {
      continue
    }
    const key = getResumeSlotKey(slot)
    if (isCaptureComplete(slot)) {
      delete resumeSlots[key]
      if (isNewerSlot(completedSlots[key], slot)) {
        completedSlots[key] = slot
      }
      continue
    }
    if (isCaptureInProgress(slot) && shouldUseIncomingInProgressSlot(resumeSlots[key], slot)) {
      resumeSlots[key] = slot
    }
  }

  const nextProgress = {
    ...progress,
    resumeSlot: getLatestResumeSlot(resumeSlots),
    resumeSlots: collectionHasSlots(resumeSlots) ? resumeSlots : undefined,
  }

  return {
    completedSlots,
    progress: nextProgress,
  }
}

export function createSupabaseSoloCloudProgressRepository(client: BrrrdleSupabaseClient): SoloCloudProgressRepository {
  async function loadSessionRow(userId: string, sessionKey: string): Promise<SoloCloudSessionRecord | undefined> {
    const { data, error } = await client
      .from('game_history')
      .select('id, user_id, entry, completed_at')
      .eq('user_id', userId)
      .eq('id', sessionKey)
      .maybeSingle()

    if (error || !data) {
      return undefined
    }
    return normalizeSoloCloudSessionRecord((data as GameHistoryRow).entry)
  }

  return {
    async loadRecentSessions(userId, limit = 50) {
      const { data, error } = await client
        .from('game_history')
        .select('id, user_id, entry, completed_at')
        .eq('user_id', userId)
        .like('id', `${SOLO_CLOUD_HISTORY_ID_PREFIX}:%`)
        .order('completed_at', { ascending: false })
        .limit(Math.max(1, Math.min(100, Math.trunc(limit))))

      if (error || !data) {
        return []
      }

      return (data as readonly GameHistoryRow[]).flatMap((row) => {
        const session = normalizeSoloCloudSessionRecord(row.entry)
        return session ? [session] : []
      })
    },
    async saveMutation(userId, mutation) {
      const existing = await loadSessionRow(userId, mutation.sessionKey)
      const session = createSessionRecordFromMutation(mutation, existing)
      const { error } = await client
        .from('game_history')
        .upsert({
          completed_at: session.completedAt ?? session.updatedAt,
          entry: toHistoryEntry(session),
          id: session.sessionKey,
          user_id: userId,
        })

      if (error) {
        throw new Error(error.message)
      }

      return session
    },
  }
}
