import type { GameHistoryEntry } from '../account'
import type { HistoryFilters } from '../app/navigationState'
import type { GameMode, PlayScope } from '../game/types'
import { normalizeCompetitiveMultiplayerState, type MultiplayerCompetitiveState } from '../multiplayer/competitiveMultiplayer'
import type { MultiplayerMatchPerformance, MultiplayerPlayerPerformance } from '../multiplayer/scoring'

export type HistoryResultKind = 'solo' | 'multiplayer'
export type HistoryResultStatus = 'won' | 'lost' | 'draw' | 'completed' | 'expired' | 'aborted'

export interface HistoryResultViewModel {
  readonly id: string
  readonly kind: HistoryResultKind
  readonly kindLabel: string
  readonly mode: GameMode
  readonly modeLabel: string
  readonly scope: PlayScope
  readonly scopeLabel: string
  readonly title: string
  readonly completedAt: string
  readonly status: HistoryResultStatus
  readonly statusLabel: string
  readonly detailLabel: string
  readonly contextLabel: string
  readonly rewardLabel?: string
}

export interface HistorySummaryViewModel {
  readonly total: number
  readonly solo: number
  readonly multiplayer: number
  readonly won: number
  readonly lost: number
  readonly draws: number
}

export interface SelectHistoryRowsInput {
  readonly competitiveState?: MultiplayerCompetitiveState
  readonly filters?: HistoryFilters
  readonly history?: readonly GameHistoryEntry[]
  readonly viewerUserId?: string
}

const DEFAULT_FILTERS: HistoryFilters = {
  mode: 'all',
  player: 'all',
  scope: 'all',
}

function getModeLabel(mode: GameMode): string {
  return mode.toUpperCase()
}

function getScopeLabel(kind: HistoryResultKind, scope: PlayScope): string {
  const area = kind === 'solo' ? 'Solo' : 'Multiplayer'
  return `${scope === 'daily' ? 'Daily' : 'Practice'} ${area}`
}

function getSoloWordLabel(entry: GameHistoryEntry): string {
  return entry.mode === 'go'
    ? entry.word.split(',').map((word) => word.trim().toUpperCase()).filter(Boolean).join(' / ')
    : entry.word.toUpperCase()
}

function toSoloHistoryRow(entry: GameHistoryEntry): HistoryResultViewModel {
  const statusLabel = entry.status === 'won' ? 'Won' : 'Lost'
  const scopeLabel = getScopeLabel('solo', entry.scope)
  const modeLabel = getModeLabel(entry.mode)
  return {
    completedAt: entry.completedAt,
    contextLabel: `${getSoloWordLabel(entry)} - ${entry.wordLength} letters`,
    detailLabel: `${entry.attemptsUsed} ${entry.attemptsUsed === 1 ? 'guess' : 'guesses'}`,
    id: `solo:${entry.gameId}`,
    kind: 'solo',
    kindLabel: 'Solo',
    mode: entry.mode,
    modeLabel,
    rewardLabel: `+${entry.xpAward} XP / +${entry.coinAward} coins`,
    scope: entry.scope,
    scopeLabel,
    status: entry.status,
    statusLabel,
    title: `${scopeLabel} ${modeLabel}`,
  }
}

function getViewerPerformance(result: MultiplayerMatchPerformance, viewerUserId: string | undefined): MultiplayerPlayerPerformance | undefined {
  return viewerUserId ? result.players.find((player) => player.userId === viewerUserId) : undefined
}

function getMultiplayerStatus(
  result: MultiplayerMatchPerformance,
  viewerUserId: string | undefined,
): Pick<HistoryResultViewModel, 'status' | 'statusLabel'> {
  const viewer = getViewerPerformance(result, viewerUserId)
  if (viewer?.outcome === 'win') {
    return { status: 'won', statusLabel: 'Won' }
  }
  if (viewer?.outcome === 'loss') {
    return { status: 'lost', statusLabel: 'Lost' }
  }
  if (viewer?.outcome === 'draw') {
    return { status: 'draw', statusLabel: 'Draw' }
  }
  if (result.status === 'expired') {
    return { status: 'expired', statusLabel: 'Expired' }
  }
  if (result.status === 'aborted') {
    return { status: 'aborted', statusLabel: 'Aborted' }
  }
  return { status: 'completed', statusLabel: 'Completed' }
}

function getMultiplayerDetailLabel(result: MultiplayerMatchPerformance, viewerUserId: string | undefined): string {
  const viewer = getViewerPerformance(result, viewerUserId)
  return viewer?.summary ?? result.summary
}

function getMultiplayerContextLabel(result: MultiplayerMatchPerformance): string {
  const parts = [
    result.dailyDateKey ? `UTC ${result.dailyDateKey}` : undefined,
    result.ranked ? 'Ranked' : 'Unranked',
    `${result.players.length} players`,
  ]
  return parts.filter(Boolean).join(' - ')
}

function toMultiplayerHistoryRow(
  result: MultiplayerMatchPerformance,
  viewerUserId: string | undefined,
): HistoryResultViewModel {
  const scopeLabel = getScopeLabel('multiplayer', result.scope)
  const modeLabel = getModeLabel(result.mode)
  const status = getMultiplayerStatus(result, viewerUserId)
  return {
    completedAt: result.endedAt ?? '',
    contextLabel: getMultiplayerContextLabel(result),
    detailLabel: getMultiplayerDetailLabel(result, viewerUserId),
    id: `multiplayer:${result.sourceMatchId}`,
    kind: 'multiplayer',
    kindLabel: 'Multiplayer',
    mode: result.mode,
    modeLabel,
    scope: result.scope,
    scopeLabel,
    status: status.status,
    statusLabel: status.statusLabel,
    title: `${scopeLabel} ${modeLabel}`,
  }
}

function passesFilters(row: HistoryResultViewModel, filters: HistoryFilters): boolean {
  return (filters.player === 'all' || row.kind === filters.player)
    && (filters.scope === 'all' || row.scope === filters.scope)
    && (filters.mode === 'all' || row.mode === filters.mode)
}

export function selectHistoryRows({
  competitiveState,
  filters = DEFAULT_FILTERS,
  history,
  viewerUserId,
}: SelectHistoryRowsInput): readonly HistoryResultViewModel[] {
  const soloRows = (history ?? []).map(toSoloHistoryRow)
  const multiplayerRows = viewerUserId
    ? normalizeCompetitiveMultiplayerState(competitiveState).results.map((result) => (
        toMultiplayerHistoryRow(result, viewerUserId)
      ))
    : []

  return [...soloRows, ...multiplayerRows]
    .filter((row) => passesFilters(row, filters))
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt) || left.title.localeCompare(right.title))
}

export function selectHistorySummary(rows: readonly HistoryResultViewModel[]): HistorySummaryViewModel {
  return rows.reduce<HistorySummaryViewModel>((summary, row) => ({
    draws: summary.draws + (row.status === 'draw' ? 1 : 0),
    lost: summary.lost + (row.status === 'lost' ? 1 : 0),
    multiplayer: summary.multiplayer + (row.kind === 'multiplayer' ? 1 : 0),
    solo: summary.solo + (row.kind === 'solo' ? 1 : 0),
    total: summary.total + 1,
    won: summary.won + (row.status === 'won' ? 1 : 0),
  }), {
    draws: 0,
    lost: 0,
    multiplayer: 0,
    solo: 0,
    total: 0,
    won: 0,
  })
}
