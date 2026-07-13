import type { ReactNode } from 'react'
import { Button, Panel } from '../ui'
import type {
  DashboardActionTarget,
  DashboardDailyCardViewModel,
  DashboardLiveGameViewModel,
  DashboardLobbyRowViewModel,
  DashboardMultiplayerActiveGameViewModel,
  DashboardMultiplayerRecentResultViewModel,
  DashboardQuickActionViewModel,
  DashboardSoloActiveGameViewModel,
  DashboardSoloRecentResultViewModel,
  DashboardViewModel,
} from './dashboardViewModels'

interface DashboardHomeProps {
  readonly dashboard: DashboardViewModel
  readonly onAction: (target: DashboardActionTarget) => void
}

function formatDateTime(value: string | undefined): string {
  if (!value) {
    return 'Unknown time'
  }

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

function SummaryMetric({
  label,
  tone = 'neutral',
  value,
}: {
  readonly label: string
  readonly tone?: 'neutral' | 'attention'
  readonly value: number
}) {
  const toneClasses = tone === 'attention'
    ? 'border-[var(--color-ice-300)]/35 bg-cyan-400/10 text-cyan-50'
    : 'border-white/10 bg-black/30 text-slate-100'

  return (
    <div className={`flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2 ${toneClasses}`}>
      <p className="min-w-0 break-words text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="shrink-0 text-xl font-black text-white">{value}</p>
    </div>
  )
}

function EmptyState({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-dashed border-white/15 bg-black/20 p-4 text-sm leading-6 text-slate-400">
      {children}
    </div>
  )
}

function SectionHeader({
  action,
  children,
  title,
}: {
  readonly action?: ReactNode
  readonly children?: ReactNode
  readonly title: string
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-lg font-bold text-white">{title}</h3>
        {children ? <p className="mt-1 break-words text-sm leading-6 text-slate-400">{children}</p> : null}
      </div>
      {action}
    </div>
  )
}

function QuickActions({
  actions,
  onAction,
}: {
  readonly actions: readonly DashboardQuickActionViewModel[]
  readonly onAction: (target: DashboardActionTarget) => void
}) {
  return (
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" aria-label="Dashboard quick actions">
      {actions.map((action) => (
        <Button
          className="h-full min-h-14 flex-col items-start justify-center text-left"
          key={action.id}
          onClick={() => onAction(action.actionTarget)}
          variant={action.attentionCount > 0 ? 'primary' : 'secondary'}
        >
          <span className="min-w-0 max-w-full break-words">{action.label}</span>
          <span className="min-w-0 max-w-full break-words text-xs font-normal opacity-80">
            {action.attentionCount > 0 ? `${action.attentionCount} attention` : action.detailLabel}
          </span>
        </Button>
      ))}
    </div>
  )
}

function DailyStatus({
  daily,
  onAction,
}: {
  readonly daily: readonly DashboardDailyCardViewModel[]
  readonly onAction: (target: DashboardActionTarget) => void
}) {
  return (
    <div className="grid min-w-0 gap-3 2xl:grid-cols-2">
      {daily.map((card) => (
        <article className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-4" key={card.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ice-200)]">
                {card.ready ? 'Ready' : 'Daily'}
              </p>
              <h4 className="mt-1 break-words text-lg font-bold text-white">{card.title}</h4>
            </div>
            <Button onClick={() => onAction(card.actionTarget)} size="sm" variant={card.ready ? 'primary' : 'secondary'}>
              {card.actionLabel}
            </Button>
          </div>
          <p className="mt-3 break-words text-sm leading-6 text-slate-300">{card.detailLabel}</p>
          {card.resetAt ? (
            <p className="mt-2 break-words text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Reset {formatDateTime(card.resetAt)}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  )
}

function ActiveSoloList({
  games,
  onAction,
}: {
  readonly games: readonly DashboardSoloActiveGameViewModel[]
  readonly onAction: (target: DashboardActionTarget) => void
}) {
  if (games.length === 0) {
    return <EmptyState>No active Solo games.</EmptyState>
  }

  return (
    <div className="grid min-w-0 gap-3 2xl:grid-cols-2">
      {games.map((game) => (
        <article className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-4" key={game.key}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ice-200)]">{game.scopeLabel}</p>
              <h4 className="mt-1 break-words text-lg font-bold text-white">{game.title}</h4>
            </div>
            <Button onClick={() => onAction(game.actionTarget)} size="sm" variant="secondary">Open</Button>
          </div>
          <dl className="mt-3 space-y-2 text-sm text-slate-300">
            <div>
              <dt className="sr-only">Progress</dt>
              <dd>{game.progressLabel}</dd>
            </div>
            <div>
              <dt className="sr-only">State</dt>
              <dd>{game.detailLabel}</dd>
            </div>
            <div>
              <dt className="sr-only">Updated</dt>
              <dd>Updated {formatDateTime(game.updatedAt)}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  )
}

function ActiveMultiplayerList({
  games,
  onAction,
}: {
  readonly games: readonly DashboardMultiplayerActiveGameViewModel[]
  readonly onAction: (target: DashboardActionTarget) => void
}) {
  if (games.length === 0) {
    return <EmptyState>No active Multiplayer games.</EmptyState>
  }

  return (
    <div className="grid min-w-0 gap-3 2xl:grid-cols-2">
      {games.map((game) => (
        <article className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-4" key={game.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ice-200)]">{game.scopeLabel}</p>
              <h4 className="mt-1 break-words text-lg font-bold text-white">{game.title}</h4>
            </div>
            <Button onClick={() => onAction(game.actionTarget)} size="sm" variant={game.turnLabel === 'Your turn' ? 'primary' : 'secondary'}>
              Open
            </Button>
          </div>
          <dl className="mt-3 space-y-2 text-sm text-slate-300">
            <div>
              <dt className="sr-only">Turn</dt>
              <dd>{game.turnLabel}</dd>
            </div>
            <div>
              <dt className="sr-only">Opponent</dt>
              <dd>{game.opponentLabel}</dd>
            </div>
            <div>
              <dt className="sr-only">Rules</dt>
              <dd>{game.ruleLabel}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  )
}

function LobbyPreview({
  rows,
  onAction,
}: {
  readonly rows: readonly DashboardLobbyRowViewModel[]
  readonly onAction: (target: DashboardActionTarget) => void
}) {
  if (rows.length === 0) {
    return <EmptyState>No open lobbies.</EmptyState>
  }

  return (
    <div className="grid min-w-0 gap-3">
      {rows.map((row) => (
        <article className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-4" key={row.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ice-200)]">{row.scopeLabel}</p>
              <h4 className="mt-1 break-words text-base font-bold text-white">{row.title} hosted by {row.hostLabel}</h4>
            </div>
            <Button disabled={!row.canJoin && !row.canCancel} onClick={() => onAction(row.actionTarget)} size="sm" variant={row.canJoin ? 'primary' : 'secondary'}>
              {row.actionLabel}
            </Button>
          </div>
          <p className="mt-3 break-words text-sm leading-6 text-slate-300">{row.detailLabel}</p>
        </article>
      ))}
    </div>
  )
}

function LivePreview({
  games,
  restrictedCount,
  onAction,
}: {
  readonly games: readonly DashboardLiveGameViewModel[]
  readonly restrictedCount: number
  readonly onAction: (target: DashboardActionTarget) => void
}) {
  if (games.length === 0) {
    return (
      <EmptyState>
        {restrictedCount > 0
          ? `${restrictedCount} nonparticipant game${restrictedCount === 1 ? '' : 's'} hidden by Live privacy rules.`
          : 'No Live games.'}
      </EmptyState>
    )
  }

  return (
    <div className="grid min-w-0 gap-3">
      {games.map((game) => (
        <article className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-4" key={game.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ice-200)]">{game.scopeLabel}</p>
              <h4 className="mt-1 break-words text-base font-bold text-white">{game.title} live</h4>
            </div>
            <Button onClick={() => onAction(game.actionTarget)} size="sm" variant="secondary">{game.actionLabel}</Button>
          </div>
          <p className="mt-3 break-words text-sm leading-6 text-slate-300">{game.detailLabel}</p>
        </article>
      ))}
      {restrictedCount > 0 ? (
        <p className="break-words text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {restrictedCount} nonparticipant game{restrictedCount === 1 ? '' : 's'} hidden by Live privacy rules.
        </p>
      ) : null}
    </div>
  )
}

function RecentResults({
  multiplayer,
  onAction,
  solo,
}: {
  readonly multiplayer: readonly DashboardMultiplayerRecentResultViewModel[]
  readonly onAction: (target: DashboardActionTarget) => void
  readonly solo: readonly DashboardSoloRecentResultViewModel[]
}) {
  const rows = [
    ...solo.map((row) => ({
      actionTarget: row.actionTarget,
      completedAt: row.completedAt,
      detail: `${row.statusLabel} · ${row.attemptsLabel}`,
      id: `solo:${row.gameId}`,
      source: 'Solo',
      title: `${row.scopeLabel} ${row.modeLabel}`,
    })),
    ...multiplayer.map((row) => ({
      actionTarget: row.actionTarget,
      completedAt: row.completedAt,
      detail: `${row.outcomeLabel} · ${row.detailLabel}`,
      id: `multiplayer:${row.id}`,
      source: 'Multiplayer',
      title: `${row.scopeLabel} ${row.modeLabel}`,
    })),
  ].sort((left, right) => right.completedAt.localeCompare(left.completedAt))

  if (rows.length === 0) {
    return <EmptyState>No recent results.</EmptyState>
  }

  return (
    <div className="grid min-w-0 gap-3 md:grid-cols-2">
      {rows.map((row) => (
        <article className="min-w-0 rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-slate-200" key={row.id}>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-ice-200)]">{row.source}</p>
              <h4 className="mt-1 break-words text-base font-bold text-white">{row.title}</h4>
            </div>
            <Button onClick={() => onAction(row.actionTarget)} size="sm" variant="ghost">History</Button>
          </div>
          <p className="mt-3 break-words text-sm leading-6 text-slate-300">{row.detail}</p>
          <p className="mt-2 break-words text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Completed {formatDateTime(row.completedAt)}
          </p>
        </article>
      ))}
    </div>
  )
}

export function DashboardHome({ dashboard, onAction }: DashboardHomeProps) {
  return (
    <section className="min-w-0 space-y-5" aria-labelledby="dashboard-home-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">Home</p>
          <h2 id="dashboard-home-title" className="mt-2 break-words text-3xl font-bold text-white">Dashboard</h2>
        </div>
        <p className="break-words text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Updated {formatDateTime(dashboard.generatedAt)}
        </p>
      </div>

      <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Active Solo" value={dashboard.summary.activeSoloCount} />
        <SummaryMetric label="Active Multiplayer" value={dashboard.summary.activeMultiplayerCount} />
        <SummaryMetric label="Your Turn" tone={dashboard.summary.yourTurnMultiplayerCount > 0 ? 'attention' : 'neutral'} value={dashboard.summary.yourTurnMultiplayerCount} />
        <SummaryMetric label="Lobby" tone={dashboard.summary.openLobbyCount > 0 ? 'attention' : 'neutral'} value={dashboard.summary.openLobbyCount} />
      </div>

      <QuickActions actions={dashboard.quickActions} onAction={onAction} />

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.82fr)]">
        <div className="min-w-0 space-y-5">
          <Panel className="space-y-4" tone="muted">
            <SectionHeader title="Daily Status">Solo and Multiplayer daily entry points.</SectionHeader>
            <DailyStatus daily={dashboard.daily} onAction={onAction} />
          </Panel>

          <Panel className="space-y-4" tone="muted">
            <SectionHeader
              action={<Button onClick={() => onAction({ routeId: 'solo', soloSubtab: 'active' })} size="sm" variant="ghost">Solo Active</Button>}
              title="Active Solo"
            >
              In-progress Solo boards from existing resume slots.
            </SectionHeader>
            <ActiveSoloList games={dashboard.activeSolo} onAction={onAction} />
          </Panel>

          <Panel className="space-y-4" tone="muted">
            <SectionHeader
              action={<Button onClick={() => onAction({ multiplayerSubtab: 'active', routeId: 'multiplayer' })} size="sm" variant="ghost">Multiplayer Active</Button>}
              title="Active Multiplayer"
            >
              Participant-owned games and turn attention.
            </SectionHeader>
            <ActiveMultiplayerList games={dashboard.activeMultiplayer} onAction={onAction} />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel className="space-y-4" tone="muted">
            <SectionHeader
              action={<Button onClick={() => onAction({ multiplayerSubtab: 'lobby', routeId: 'multiplayer' })} size="sm" variant="ghost">Open Lobby</Button>}
              title="Lobby"
            >
              Joinable or manageable open lobbies.
            </SectionHeader>
            <LobbyPreview rows={dashboard.lobbyPreview} onAction={onAction} />
          </Panel>

          <Panel className="space-y-4" tone="muted">
            <SectionHeader
              action={<Button onClick={() => onAction({ multiplayerSubtab: 'live', routeId: 'multiplayer' })} size="sm" variant="ghost">Open Live</Button>}
              title="Live v1"
            >
              Participant resume and read-only spectator visibility.
            </SectionHeader>
            <LivePreview games={dashboard.livePreview} onAction={onAction} restrictedCount={dashboard.summary.restrictedLiveGameCount} />
          </Panel>

          <Panel className="space-y-4" tone="muted">
            <SectionHeader
              action={<Button onClick={() => onAction({ historyFilters: { mode: 'all', player: 'all', scope: 'all' }, routeId: 'history' })} size="sm" variant="ghost">Open History</Button>}
              title="Recent Results"
            >
              Latest Solo and Multiplayer completions.
            </SectionHeader>
            <RecentResults multiplayer={dashboard.recentMultiplayer} onAction={onAction} solo={dashboard.recentSolo} />
          </Panel>
        </div>
      </div>
    </section>
  )
}
