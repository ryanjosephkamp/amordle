import type { ReactNode } from 'react'
import { Button } from '../ui'
import type { MultiplayerActiveGameViewModel } from './multiplayerViewModels'

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

function EmptyState({ children }: { readonly children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-black/20 p-4 text-sm leading-6 text-slate-400">
      {children}
    </div>
  )
}

function MultiplayerActiveGameCard({
  game,
  onOpenPublicProfile,
  onResume,
  selected,
}: {
  readonly game: MultiplayerActiveGameViewModel
  readonly onOpenPublicProfile?: (publicProfileId: string) => void
  readonly onResume: (id: string) => void
  readonly selected: boolean
}) {
  const needsTurn = game.turnLabel === 'Your turn'
  const cardTone = needsTurn
    ? 'border-cyan-200/50 bg-cyan-400/10 ring-1 ring-cyan-200/20'
    : selected
      ? 'border-[var(--color-ice-300)]/70 bg-black/30'
      : 'border-white/10 bg-black/30'

  return (
    <article
      aria-label={game.title}
      aria-current={selected ? 'true' : undefined}
      className={`rounded-lg border p-4 shadow-xl shadow-black/20 ${cardTone}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ice-200)]">{game.scopeLabel}</p>
          <h3 className="mt-1 text-lg font-bold text-white">{game.modeLabel}</h3>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {needsTurn ? (
            <span
              aria-label="Your turn in this multiplayer game"
              className="rounded-full border border-cyan-200/50 bg-cyan-300/15 px-2 py-1 text-xs font-bold text-cyan-50"
            >
              Your turn
            </span>
          ) : null}
          <span className="rounded border border-white/10 px-2 py-1 text-xs font-semibold text-cyan-100">{game.statusLabel}</span>
        </div>
      </div>
      <dl className="mt-4 space-y-2 text-sm text-slate-300">
        <div>
          <dt className="sr-only">Opponent</dt>
          <dd>
            {game.opponentPublicProfileId && onOpenPublicProfile ? (
              <Button
                aria-label={`Open public profile for ${game.opponentLabel}`}
                onClick={() => onOpenPublicProfile(game.opponentPublicProfileId!)}
                size="sm"
                variant="ghost"
              >
                {game.opponentLabel}
              </Button>
            ) : game.opponentLabel}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Progress</dt>
          <dd>{game.detailLabel}</dd>
        </div>
        <div>
          <dt className="sr-only">Rules</dt>
          <dd>{game.ruleLabel}</dd>
        </div>
        <div>
          <dt className="sr-only">Updated</dt>
          <dd>Updated {formatDateTime(game.updatedAt)}</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button data-testid={`multiplayer-active-resume-${game.id}`} disabled={!game.canResume} onClick={() => onResume(game.id)} size="sm" variant="primary">{game.actionLabel}</Button>
      </div>
    </article>
  )
}

export function MultiplayerActiveGames({
  activeGames,
  limit,
  onOpenPublicProfile,
  onResumeGame,
  selectedGameId,
}: {
  readonly activeGames: readonly MultiplayerActiveGameViewModel[]
  readonly limit?: number
  readonly onOpenPublicProfile?: (publicProfileId: string) => void
  readonly onResumeGame: (id: string) => void
  readonly selectedGameId?: string
}) {
  const visibleGames = typeof limit === 'number' ? activeGames.slice(0, Math.max(0, limit)) : activeGames
  if (visibleGames.length === 0) {
    return <EmptyState>No active multiplayer games.</EmptyState>
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {visibleGames.map((game) => (
        <MultiplayerActiveGameCard
          game={game}
          key={game.id}
          onOpenPublicProfile={onOpenPublicProfile}
          onResume={onResumeGame}
          selected={game.id === selectedGameId}
        />
      ))}
    </div>
  )
}
