import { applyEconomyCommand, calculateCoinAward, calculateXpAward, createEconomySnapshot, getLevelForXp } from '../progression'
import type { DifficultyTier } from '../data/difficulty'
import { updateStatistics } from '../stats/statistics'
import type { CompletedGameStatsInput } from '../stats/types'
import { normalizeUnlockedDailies } from '../daily/pastDailies'
import { normalizeMultiplayerState, normalizeCompetitiveMultiplayerState } from '../multiplayer'
import { createDefaultGuestProgress, GUEST_PROGRESS_SCHEMA_VERSION, normalizeGuestSettings, type GameHistoryEntry, type GuestProgressState } from './storageSchema'
import { getLatestResumeSlot, getResumeSlotKey, normalizeResumeSlot, normalizeResumeSlots, type ResumeSlotCollection } from './resumeSlot'
import { normalizePracticeSeedState } from './practiceSeeds'

export interface KeyValueStorage {
  readonly getItem: (key: string) => string | null
  readonly removeItem: (key: string) => void
  readonly setItem: (key: string, value: string) => void
}

export const GUEST_PROGRESS_STORAGE_KEY = 'brrrdle:guest-progress:v1'

function getBrowserStorage(): KeyValueStorage | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  return window.localStorage
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isGuestProgressState(value: unknown): value is GuestProgressState {
  return isRecord(value)
    && (value.schemaVersion === 1 || value.schemaVersion === 2 || value.schemaVersion === 3 || value.schemaVersion === 4 || value.schemaVersion === 5 || value.schemaVersion === 6 || value.schemaVersion === 7 || value.schemaVersion === 8 || value.schemaVersion === 9 || value.schemaVersion === 10 || value.schemaVersion === GUEST_PROGRESS_SCHEMA_VERSION)
    && isRecord(value.progression)
    && typeof value.progression.xp === 'number'
    && typeof value.progression.level === 'number'
    && typeof value.progression.coins === 'number'
    && isRecord(value.settings)
    && isRecord(value.stats)
    && Array.isArray(value.history)
    && Array.isArray(value.completedGameIds)
}

function migrateResumeSlots(value: GuestProgressState): ResumeSlotCollection | undefined {
  const slots = normalizeResumeSlots(value.resumeSlots)
  const legacySlot = normalizeResumeSlot(value.resumeSlot)
  if (legacySlot) {
    slots[getResumeSlotKey(legacySlot)] ??= legacySlot
  }

  return Object.keys(slots).length > 0 ? slots : undefined
}

/**
 * Phase 18.3 — upgrade a structurally-valid persisted payload (schema v1 or v2)
 * to the current schema, preserving all existing data. The only field added in
 * v2 is `settings.difficultyDefault`, which is filled with its Expert default
 * for legacy v1 payloads via `normalizeGuestSettings`. Returns `undefined` when
 * the payload is not a recognizable guest-progress object so callers can fall
 * back to a fresh default (no partial/corrupt state is ever surfaced).
 */
export function migrateGuestProgress(value: unknown): GuestProgressState | undefined {
  if (!isGuestProgressState(value)) {
    return undefined
  }

  const economy = createEconomySnapshot({
    appliedOperationIds: Array.isArray(value.progression.economyOperationIds)
      ? value.progression.economyOperationIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [],
    coins: value.progression.coins,
    consumables: value.progression.consumables,
    revision: value.progression.economyRevision,
  })
  return {
    ...value,
    multiplayer: normalizeMultiplayerState(value.multiplayer ?? (value as unknown as Record<string, unknown>).asyncMultiplayer),
    competitiveMultiplayer: normalizeCompetitiveMultiplayerState(value.competitiveMultiplayer),
    practiceSeeds: normalizePracticeSeedState(value.practiceSeeds),
    progression: {
      ...value.progression,
      coins: economy.coins,
      consumables: economy.consumables,
      economyOperationIds: economy.appliedOperationIds,
      economyRevision: economy.revision,
    },
    resumeSlot: normalizeResumeSlot(value.resumeSlot),
    resumeSlots: migrateResumeSlots(value),
    schemaVersion: GUEST_PROGRESS_SCHEMA_VERSION,
    settings: normalizeGuestSettings(value.settings),
    unlockedDailies: normalizeUnlockedDailies(value.unlockedDailies),
  }
}

export function loadGuestProgress(storage: KeyValueStorage | undefined = getBrowserStorage()): GuestProgressState {
  const rawValue = storage?.getItem(GUEST_PROGRESS_STORAGE_KEY)
  if (!rawValue) {
    return createDefaultGuestProgress()
  }

  try {
    const parsed: unknown = JSON.parse(rawValue)
    return migrateGuestProgress(parsed) ?? createDefaultGuestProgress()
  } catch {
    return createDefaultGuestProgress()
  }
}

export function saveGuestProgress(value: GuestProgressState, storage: KeyValueStorage | undefined = getBrowserStorage()): void {
  storage?.setItem(GUEST_PROGRESS_STORAGE_KEY, JSON.stringify(value))
}

export function resetGuestProgress(storage: KeyValueStorage | undefined = getBrowserStorage()): GuestProgressState {
  const progress = createDefaultGuestProgress()
  saveGuestProgress(progress, storage)
  return progress
}

export function exportGuestProgress(progress: GuestProgressState = loadGuestProgress()): string {
  return JSON.stringify(progress, null, 2)
}

export interface CompletedGameInput extends CompletedGameStatsInput {
  readonly difficulty?: DifficultyTier
  readonly gameId: string
  readonly maxAttempts: number
  readonly puzzleCount?: number
  readonly word: string
}

export function recordCompletedGame(
  input: CompletedGameInput,
  currentProgress: GuestProgressState = loadGuestProgress(),
): GuestProgressState {
  if (currentProgress.completedGameIds.includes(input.gameId)) {
    return currentProgress
  }

  const xpAward = calculateXpAward(input)
  const coinAward = calculateCoinAward(input)
  const economyResult = applyEconomyCommand(createEconomySnapshot({
    appliedOperationIds: currentProgress.progression.economyOperationIds,
    coins: currentProgress.progression.coins,
    consumables: currentProgress.progression.consumables,
    revision: currentProgress.progression.economyRevision,
  }), {
    amount: coinAward,
    operationId: `reward:${input.gameId}`,
    type: 'award',
  })
  const xp = currentProgress.progression.xp + xpAward
  const historyEntry: GameHistoryEntry = {
    attemptsUsed: input.attemptsUsed,
    coinAward,
    completedAt: new Date().toISOString(),
    ...(input.difficulty ? { difficulty: input.difficulty } : {}),
    gameId: input.gameId,
    mode: input.mode,
    scope: input.scope,
    status: input.status,
    word: input.word,
    wordLength: input.wordLength,
    xpAward,
  }
  const resumeSlots = normalizeResumeSlots(currentProgress.resumeSlots)
  delete resumeSlots[getResumeSlotKey(input)]
  const nextResumeSlots = Object.keys(resumeSlots).length > 0 ? resumeSlots : undefined

  return {
    ...currentProgress,
    completedGameIds: [...currentProgress.completedGameIds, input.gameId],
    history: [historyEntry, ...currentProgress.history].slice(0, 200),
    progression: {
      ...currentProgress.progression,
      coins: economyResult.snapshot.coins,
      consumables: economyResult.snapshot.consumables,
      economyOperationIds: economyResult.snapshot.appliedOperationIds,
      economyRevision: economyResult.snapshot.revision,
      level: getLevelForXp(xp),
      xp,
    },
    resumeSlot: getLatestResumeSlot(nextResumeSlots ?? {}),
    resumeSlots: nextResumeSlots,
    stats: updateStatistics(currentProgress.stats, input),
  }
}
