import type { HistoryFilters } from '../app/navigationState'
import type { GameHistoryEntry } from '../account'
import type { MultiplayerCompetitiveState } from '../multiplayer'
import { Button, Panel } from '../ui'
import { selectHistoryRows, selectHistorySummary } from './historyViewModels'

interface HistoryFilterOption<TValue extends string> {
  readonly id: TValue
  readonly label: string
}

const PLAYER_FILTERS: readonly HistoryFilterOption<HistoryFilters['player']>[] = [
  { id: 'all', label: 'All' },
  { id: 'solo', label: 'Solo' },
  { id: 'multiplayer', label: 'Multiplayer' },
]

const SCOPE_FILTERS: readonly HistoryFilterOption<HistoryFilters['scope']>[] = [
  { id: 'all', label: 'All games' },
  { id: 'daily', label: 'Daily' },
  { id: 'practice', label: 'Practice' },
]

const MODE_FILTERS: readonly HistoryFilterOption<HistoryFilters['mode']>[] = [
  { id: 'all', label: 'All modes' },
  { id: 'og', label: 'OG' },
  { id: 'go', label: 'GO' },
]

function formatCompletedAt(value: string): string {
  if (!value) {
    return 'Unknown time'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time'
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)
}

function HistoryFilterGroup<TValue extends keyof HistoryFilters>({
  filters,
  label,
  name,
  onChange,
  options,
}: {
  readonly filters: HistoryFilters
  readonly label: string
  readonly name: TValue
  readonly onChange: (filters: HistoryFilters) => void
  readonly options: readonly HistoryFilterOption<HistoryFilters[TValue]>[]
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            aria-pressed={filters[name] === option.id}
            isActive={filters[name] === option.id}
            key={option.id}
            onClick={() => onChange({ ...filters, [name]: option.id })}
            size="sm"
            variant="ghost"
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

export function HistoryWorkspace({
  competitiveState,
  filters,
  history,
  onFiltersChange,
  viewerUserId,
}: {
  readonly competitiveState?: MultiplayerCompetitiveState
  readonly filters: HistoryFilters
  readonly history?: readonly GameHistoryEntry[]
  readonly onFiltersChange: (filters: HistoryFilters) => void
  readonly viewerUserId?: string
}) {
  const rows = selectHistoryRows({ competitiveState, filters, history, viewerUserId })
  const summary = selectHistorySummary(rows)

  return (
    <section className="space-y-5" aria-labelledby="history-workspace-title">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">History</p>
        <h2 id="history-workspace-title" className="text-3xl font-bold text-white">History</h2>
        <p className="max-w-3xl text-base leading-7 text-slate-300">
          Review completed Solo and Multiplayer results from existing local and synced progress.
        </p>
      </div>

      <Panel className="grid gap-4 md:grid-cols-5" tone="muted" aria-label="History summary">
        {[
          { label: 'Results', value: summary.total },
          { label: 'Solo', value: summary.solo },
          { label: 'Multiplayer', value: summary.multiplayer },
          { label: 'Won', value: summary.won },
          { label: 'Lost', value: summary.lost },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-white/10 bg-black/20 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{item.label}</p>
            <p className="mt-2 text-2xl font-black text-white">{item.value}</p>
          </div>
        ))}
      </Panel>

      <Panel className="space-y-5" tone="muted">
        <div className="grid gap-4 lg:grid-cols-3">
          <HistoryFilterGroup filters={filters} label="Player area" name="player" onChange={onFiltersChange} options={PLAYER_FILTERS} />
          <HistoryFilterGroup filters={filters} label="Source" name="scope" onChange={onFiltersChange} options={SCOPE_FILTERS} />
          <HistoryFilterGroup filters={filters} label="Mode" name="mode" onChange={onFiltersChange} options={MODE_FILTERS} />
        </div>
      </Panel>

      <Panel className="space-y-4" tone="default">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Completed results</h3>
            <p className="text-sm leading-6 text-slate-300">Newest results appear first. Rich replay and per-guess review remain deferred.</p>
          </div>
          <p className="text-sm font-semibold text-cyan-100">{rows.length} shown</p>
        </div>

        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-slate-400">
                <tr>
                  <th className="px-3 py-3 font-semibold" scope="col">Game</th>
                  <th className="px-3 py-3 font-semibold" scope="col">Result</th>
                  <th className="px-3 py-3 font-semibold" scope="col">Details</th>
                  <th className="px-3 py-3 font-semibold" scope="col">Context</th>
                  <th className="px-3 py-3 font-semibold" scope="col">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-slate-200">
                {rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-3 py-4">
                      <p className="font-semibold text-white">{row.title}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">{row.kindLabel}</p>
                    </td>
                    <td className="px-3 py-4">
                      <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-cyan-100">
                        {row.statusLabel}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <p>{row.detailLabel}</p>
                      {row.rewardLabel ? <p className="mt-1 text-xs text-slate-400">{row.rewardLabel}</p> : null}
                    </td>
                    <td className="px-3 py-4 text-slate-300">{row.contextLabel}</td>
                    <td className="px-3 py-4 text-slate-300">{formatCompletedAt(row.completedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-white/15 bg-black/20 p-6 text-sm leading-6 text-slate-300">
            <p className="font-semibold text-white">No matching results yet.</p>
            <p className="mt-2">Finish a Solo or Multiplayer game, or adjust the filters to show a broader result set.</p>
          </div>
        )}
      </Panel>
    </section>
  )
}
