import type { GameHistoryEntry, ResumeSlot, ResumeSlotCollection, ResumeSlotKey } from '../account'

export type SoloMode = 'og' | 'go'
export type SoloScope = 'daily' | 'practice'
export type SoloActiveGameKey = ResumeSlotKey

export interface SoloActiveGameViewModel {
  readonly key: SoloActiveGameKey
  readonly mode: SoloMode
  readonly modeLabel: string
  readonly scope: SoloScope
  readonly scopeLabel: string
  readonly title: string
  readonly wordLength: number
  readonly wordLengthLabel: string
  readonly updatedAt: string
  readonly progressLabel: string
  readonly detailLabel: string
  readonly actionLabel: string
}

export interface SoloRecentResultViewModel {
  readonly gameId: string
  readonly mode: SoloMode
  readonly modeLabel: string
  readonly scope: SoloScope
  readonly scopeLabel: string
  readonly title: string
  readonly completedAt: string
  readonly statusLabel: string
  readonly attemptsLabel: string
  readonly wordLabel: string
  readonly rewardLabel: string
}

export const SOLO_ACTIVE_GAME_KEYS = ['daily-og', 'daily-go', 'practice-og', 'practice-go'] as const satisfies readonly SoloActiveGameKey[]

export function isSoloActiveGameKey(value: unknown): value is SoloActiveGameKey {
  return typeof value === 'string' && SOLO_ACTIVE_GAME_KEYS.includes(value as SoloActiveGameKey)
}

function getModeLabel(mode: SoloMode): string {
  return mode.toUpperCase()
}

function getScopeLabel(scope: SoloScope): string {
  return scope === 'daily' ? 'Daily Solo' : 'Practice Solo'
}

function getActiveGameTitle(slot: ResumeSlot): string {
  return `${getScopeLabel(slot.scope)} ${getModeLabel(slot.mode)}`
}

function getActiveGameProgress(slot: ResumeSlot): string {
  if (slot.mode === 'og') {
    return `${slot.serializedSession.guesses.length}/${slot.serializedSession.maxAttempts} guesses`
  }

  const currentPuzzle = slot.serializedSession.puzzles[Math.min(slot.serializedSession.currentPuzzleIndex, slot.serializedSession.puzzles.length - 1)]
  return `Puzzle ${slot.serializedSession.currentPuzzleIndex + 1}/${slot.serializedSession.puzzles.length} · ${currentPuzzle.guesses.length}/${currentPuzzle.maxAttempts} guesses`
}

function getActiveGameDetail(slot: ResumeSlot): string {
  if (slot.mode === 'og') {
    const draftLength = slot.serializedSession.currentGuess.length
    return draftLength > 0 ? `Draft in progress: ${draftLength}/${slot.wordLength} letters` : 'Ready for the next guess'
  }

  const currentPuzzle = slot.serializedSession.puzzles[Math.min(slot.serializedSession.currentPuzzleIndex, slot.serializedSession.puzzles.length - 1)]
  const draftLength = currentPuzzle.currentGuess.length
  const carried = slot.serializedSession.priorAnswers.length
  const draftText = draftLength > 0 ? `Draft in progress: ${draftLength}/${slot.wordLength} letters` : 'Ready for the next guess'
  return carried > 0 ? `${draftText} · ${carried} prior answer${carried === 1 ? '' : 's'} carried` : draftText
}

function toActiveGameViewModel(key: SoloActiveGameKey, slot: ResumeSlot): SoloActiveGameViewModel {
  return {
    actionLabel: `Resume ${getModeLabel(slot.mode)}`,
    detailLabel: getActiveGameDetail(slot),
    key,
    mode: slot.mode,
    modeLabel: getModeLabel(slot.mode),
    progressLabel: getActiveGameProgress(slot),
    scope: slot.scope,
    scopeLabel: getScopeLabel(slot.scope),
    title: getActiveGameTitle(slot),
    updatedAt: slot.updatedAt,
    wordLength: slot.wordLength,
    wordLengthLabel: `${slot.wordLength} letters`,
  }
}

export function selectActiveSoloGames(resumeSlots: ResumeSlotCollection | undefined): readonly SoloActiveGameViewModel[] {
  return SOLO_ACTIVE_GAME_KEYS
    .flatMap((key) => {
      const slot = resumeSlots?.[key]
      return slot ? [toActiveGameViewModel(key, slot)] : []
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function isSoloHistoryEntry(entry: GameHistoryEntry): boolean {
  return (entry.scope === 'daily' || entry.scope === 'practice') && (entry.mode === 'og' || entry.mode === 'go')
}

function getWordLabel(entry: GameHistoryEntry): string {
  return entry.mode === 'go'
    ? entry.word.split(',').map((word) => word.trim().toUpperCase()).join(' / ')
    : entry.word.toUpperCase()
}

function toRecentResultViewModel(entry: GameHistoryEntry): SoloRecentResultViewModel {
  const statusLabel = entry.status === 'won' ? 'Won' : 'Lost'
  return {
    attemptsLabel: `${entry.attemptsUsed} ${entry.attemptsUsed === 1 ? 'guess' : 'guesses'}`,
    completedAt: entry.completedAt,
    gameId: entry.gameId,
    mode: entry.mode,
    modeLabel: getModeLabel(entry.mode),
    rewardLabel: `+${entry.xpAward} XP · +${entry.coinAward} coins`,
    scope: entry.scope,
    scopeLabel: getScopeLabel(entry.scope),
    statusLabel,
    title: `${getScopeLabel(entry.scope)} ${getModeLabel(entry.mode)} · ${statusLabel}`,
    wordLabel: getWordLabel(entry),
  }
}

export function selectRecentSoloResults(
  history: readonly GameHistoryEntry[] | undefined,
  limit = 5,
): readonly SoloRecentResultViewModel[] {
  return [...(history ?? [])]
    .filter(isSoloHistoryEntry)
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, Math.max(0, limit))
    .map(toRecentResultViewModel)
}
