import type { ReactNode } from 'react'
import type { GameHistoryEntry, ResumeSlotCollection } from '../account'
import type { SoloWorkspaceAttentionMap } from '../app/attentionViewModels'
import type { SoloSubtabId } from '../app/navigationState'
import { Button, Panel, SubtabBar, type SubtabOption } from '../ui'
import {
  selectActiveSoloGames,
  selectRecentSoloResults,
  type SoloActiveGameKey,
  type SoloActiveGameViewModel,
  type SoloMode,
  type SoloRecentResultViewModel,
  type SoloScope,
} from './soloViewModels'

const SOLO_SUBTABS = [
  { id: 'overview', label: 'Overview', description: 'Solo workspace overview.' },
  { id: 'daily', label: 'Daily Solo', description: 'Daily solo entry.' },
  { id: 'practice', label: 'Practice Solo', description: 'Practice solo entry.' },
  { id: 'active', label: 'Active Games', description: 'Active solo games.' },
] as const satisfies readonly SubtabOption<SoloSubtabId>[]

interface SoloWorkspaceProps {
  readonly activeSubtab: SoloSubtabId
  readonly attention?: SoloWorkspaceAttentionMap
  readonly dailyMode: SoloMode
  readonly history: readonly GameHistoryEntry[]
  readonly onDailyModeChange: (mode: SoloMode) => void
  readonly onOpenCalendar: () => void
  readonly onOpenHistory: (filters?: { readonly mode?: SoloMode; readonly scope?: SoloScope }) => void
  readonly onPracticeModeChange: (mode: SoloMode) => void
  readonly onResumeGame: (key: SoloActiveGameKey) => void
  readonly onSubtabChange: (subtab: SoloSubtabId) => void
  readonly practiceMode: SoloMode
  readonly renderDailyGame: (mode: SoloMode) => ReactNode
  readonly renderPracticeGame: (mode: SoloMode) => ReactNode
  readonly resumeSlots: ResumeSlotCollection
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time'
  }

  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(date)
}

function ModeSelector({
  activeMode,
  label,
  onSelect,
}: {
  readonly activeMode: SoloMode
  readonly label: string
  readonly onSelect: (mode: SoloMode) => void
}) {
  return (
    <div aria-label={label} className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-white/10 bg-slate-950/60 p-1 shadow-inner shadow-white/5" role="group">
      <Button isActive={activeMode === 'og'} onClick={() => onSelect('og')} size="sm" variant="secondary">OG</Button>
      <Button isActive={activeMode === 'go'} onClick={() => onSelect('go')} size="sm" variant="secondary">GO</Button>
    </div>
  )
}

function EmptyState({ children }: { readonly children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-black/20 p-4 text-sm leading-6 text-slate-400">
      {children}
    </div>
  )
}

function ActiveGameCard({
  game,
  onResume,
}: {
  readonly game: SoloActiveGameViewModel
  readonly onResume: (key: SoloActiveGameKey) => void
}) {
  return (
    <article
      aria-label={game.title}
      className="rounded-lg border border-white/10 bg-black/30 p-4 shadow-xl shadow-black/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ice-200)]">{game.scopeLabel}</p>
          <h3 className="mt-1 text-lg font-bold text-white">{game.modeLabel}</h3>
        </div>
        <span className="rounded border border-white/10 px-2 py-1 text-xs font-semibold text-cyan-100">{game.wordLengthLabel}</span>
      </div>
      <dl className="mt-4 space-y-2 text-sm text-slate-300">
        <div>
          <dt className="sr-only">Progress</dt>
          <dd>{game.progressLabel}</dd>
        </div>
        <div>
          <dt className="sr-only">Current state</dt>
          <dd>{game.detailLabel}</dd>
        </div>
        <div>
          <dt className="sr-only">Updated</dt>
          <dd>Updated {formatDateTime(game.updatedAt)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => onResume(game.key)} size="sm" variant="primary">{game.actionLabel}</Button>
      </div>
    </article>
  )
}

function ActiveGameList({
  activeGames,
  onResumeGame,
}: {
  readonly activeGames: readonly SoloActiveGameViewModel[]
  readonly onResumeGame: (key: SoloActiveGameKey) => void
}) {
  if (activeGames.length === 0) {
    return <EmptyState>No active solo games.</EmptyState>
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {activeGames.map((game) => (
        <ActiveGameCard
          game={game}
          key={game.key}
          onResume={onResumeGame}
        />
      ))}
    </div>
  )
}

function RecentResultsList({
  onOpenHistory,
  recentResults,
}: {
  readonly onOpenHistory: (filters?: { readonly mode?: SoloMode; readonly scope?: SoloScope }) => void
  readonly recentResults: readonly SoloRecentResultViewModel[]
}) {
  if (recentResults.length === 0) {
    return <EmptyState>No recent solo results.</EmptyState>
  }

  return (
    <div className="grid min-w-0 gap-3 md:grid-cols-2">
      {recentResults.map((result) => (
        <article className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-slate-200" key={result.gameId}>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-ice-200)]">{result.scopeLabel} {result.modeLabel}</p>
              <h4 className="mt-1 break-words text-base font-bold text-white">{result.statusLabel} · {result.attemptsLabel}</h4>
            </div>
            <Button onClick={() => onOpenHistory({ mode: result.mode, scope: result.scope })} size="sm" variant="ghost">History</Button>
          </div>
          <p className="mt-3 break-words font-mono text-sm text-cyan-100">{result.wordLabel}</p>
          <p className="mt-2 break-words text-xs text-slate-400">{result.rewardLabel} · Completed {formatDateTime(result.completedAt)}</p>
        </article>
      ))}
    </div>
  )
}

function SoloOverview({
  activeGames,
  onDailyModeChange,
  onOpenHistory,
  onPracticeModeChange,
  onResumeGame,
  onSubtabChange,
  recentResults,
}: {
  readonly activeGames: readonly SoloActiveGameViewModel[]
  readonly onDailyModeChange: (mode: SoloMode) => void
  readonly onOpenHistory: (filters?: { readonly mode?: SoloMode; readonly scope?: SoloScope }) => void
  readonly onPracticeModeChange: (mode: SoloMode) => void
  readonly onResumeGame: (key: SoloActiveGameKey) => void
  readonly onSubtabChange: (subtab: SoloSubtabId) => void
  readonly recentResults: readonly SoloRecentResultViewModel[]
}) {
  const startDaily = (mode: SoloMode) => {
    onDailyModeChange(mode)
    onSubtabChange('daily')
  }
  const startPractice = (mode: SoloMode) => {
    onPracticeModeChange(mode)
    onSubtabChange('practice')
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Button onClick={() => startDaily('og')} variant="primary">Daily OG</Button>
        <Button onClick={() => startDaily('go')} variant="primary">Daily GO</Button>
        <Button onClick={() => startPractice('og')} variant="secondary">Practice OG</Button>
        <Button onClick={() => startPractice('go')} variant="secondary">Practice GO</Button>
      </div>

      <Panel className="space-y-4" tone="muted">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">Active Solo Games</h3>
            <p className="text-sm text-slate-400">{activeGames.length} active</p>
          </div>
          <Button onClick={() => onSubtabChange('active')} size="sm" variant="ghost">View Active</Button>
        </div>
        <ActiveGameList activeGames={activeGames.slice(0, 4)} onResumeGame={onResumeGame} />
      </Panel>

      <Panel className="space-y-4" tone="muted">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">Recent Solo Results</h3>
            <p className="text-sm text-slate-400">{recentResults.length} shown</p>
          </div>
          <Button onClick={() => onOpenHistory({})} size="sm" variant="ghost">Solo History</Button>
        </div>
        <RecentResultsList onOpenHistory={onOpenHistory} recentResults={recentResults.slice(0, 5)} />
      </Panel>
    </div>
  )
}

function DailySoloPanel({
  dailyMode,
  onDailyModeChange,
  onOpenCalendar,
  renderDailyGame,
}: {
  readonly dailyMode: SoloMode
  readonly onDailyModeChange: (mode: SoloMode) => void
  readonly onOpenCalendar: () => void
  readonly renderDailyGame: (mode: SoloMode) => ReactNode
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <ModeSelector activeMode={dailyMode} label="Daily Solo mode" onSelect={onDailyModeChange} />
        <Button onClick={onOpenCalendar} variant="ghost">Calendar</Button>
      </div>
      {renderDailyGame(dailyMode)}
    </div>
  )
}

function PracticeSoloPanel({
  onPracticeModeChange,
  practiceMode,
  renderPracticeGame,
}: {
  readonly onPracticeModeChange: (mode: SoloMode) => void
  readonly practiceMode: SoloMode
  readonly renderPracticeGame: (mode: SoloMode) => ReactNode
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <ModeSelector activeMode={practiceMode} label="Practice Solo mode" onSelect={onPracticeModeChange} />
      </div>
      {renderPracticeGame(practiceMode)}
    </div>
  )
}

export function SoloWorkspace({
  activeSubtab,
  attention,
  dailyMode,
  history,
  onDailyModeChange,
  onOpenCalendar,
  onOpenHistory,
  onPracticeModeChange,
  onResumeGame,
  onSubtabChange,
  practiceMode,
  renderDailyGame,
  renderPracticeGame,
  resumeSlots,
}: SoloWorkspaceProps) {
  const activeGames = selectActiveSoloGames(resumeSlots)
  const recentResults = selectRecentSoloResults(history, 5)
  const subtabs = SOLO_SUBTABS.map((subtab) => ({
    ...subtab,
    attention: attention?.[subtab.id],
  }))

  return (
    <section className="space-y-5" aria-labelledby="solo-workspace-title">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">Solo</p>
        <h2 id="solo-workspace-title" className="text-3xl font-bold text-white">Solo</h2>
      </div>
      <SubtabBar activeId={activeSubtab} label="Solo workspace sections" onSelect={onSubtabChange} options={subtabs} />
      {activeSubtab === 'daily' ? (
        <DailySoloPanel dailyMode={dailyMode} onDailyModeChange={onDailyModeChange} onOpenCalendar={onOpenCalendar} renderDailyGame={renderDailyGame} />
      ) : activeSubtab === 'practice' ? (
        <PracticeSoloPanel onPracticeModeChange={onPracticeModeChange} practiceMode={practiceMode} renderPracticeGame={renderPracticeGame} />
      ) : activeSubtab === 'active' ? (
        <Panel className="space-y-4" tone="muted">
          <div>
            <h3 className="text-lg font-bold text-white">Active Solo Games</h3>
            <p className="text-sm text-slate-400">{activeGames.length} active</p>
          </div>
          <ActiveGameList activeGames={activeGames} onResumeGame={onResumeGame} />
        </Panel>
      ) : (
        <SoloOverview
          activeGames={activeGames}
          onDailyModeChange={onDailyModeChange}
          onOpenHistory={onOpenHistory}
          onPracticeModeChange={onPracticeModeChange}
          onResumeGame={onResumeGame}
          onSubtabChange={onSubtabChange}
          recentResults={recentResults}
        />
      )}
    </section>
  )
}
