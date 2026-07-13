import type { ReactNode } from 'react'
import { Button } from '../ui'
import type { MultiplayerLiveGameViewModel, MultiplayerLiveSpectatorDetailsViewModel } from './multiplayerViewModels'

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

function LiveStateNotice({ children }: { readonly children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-white/15 bg-black/20 p-4 text-sm leading-6 text-slate-400">
      {children}
    </div>
  )
}

export function MultiplayerLiveSpectatorDetails({
  details,
  id,
}: {
  readonly details: MultiplayerLiveSpectatorDetailsViewModel
  readonly id?: string
}) {
  return (
    <div className="mt-4 space-y-4 rounded-lg border border-cyan-200/15 bg-cyan-400/5 p-4 text-sm leading-6 text-slate-300" id={id}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">Spectator view</p>
          <p className="mt-1 text-slate-300">{details.progressLabel}</p>
        </div>
        <span className="rounded border border-cyan-200/20 bg-cyan-400/10 px-2 py-1 text-xs font-semibold text-cyan-100">
          Read-only
        </span>
      </div>

      {details.terminalLabel ? (
        <div className="rounded border border-emerald-200/25 bg-emerald-400/10 p-3 text-emerald-50">
          <p className="font-semibold">{details.terminalLabel}</p>
          {details.terminalHoldUntil ? (
            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-emerald-100">
              Visible until {formatDateTime(details.terminalHoldUntil)}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        {details.players.map((player) => (
          <div className="min-w-0 rounded border border-white/10 bg-black/20 px-3 py-2" key={player.seat}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{player.seat === 'player-one' ? 'Player one' : 'Player two'}</p>
            <p className="break-words font-semibold text-white">{player.profile?.displayName ?? player.label}</p>
          </div>
        ))}
      </div>

      <p className="break-words text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
        {details.capabilityLabel}
      </p>

      {details.moves.length === 0 ? (
        <div className="rounded border border-dashed border-white/15 bg-black/20 p-3 text-slate-400">
          No submitted turns visible yet.
        </div>
      ) : (
        <div className="space-y-2">
          {details.moves.map((move, index) => (
            <div className="min-w-0 rounded border border-white/10 bg-black/20 p-3" key={`${move.playerLabel}:${move.guess}:${index}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="break-words font-semibold text-white">{move.playerLabel} · {move.puzzleLabel}</p>
                {move.createdAt ? <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{formatDateTime(move.createdAt)}</p> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1" aria-label={`${move.playerLabel} submitted ${move.guess}`}>
                {move.tiles.length > 0 ? move.tiles.map((tile, tileIndex) => (
                  <span
                    className={`grid h-7 w-7 place-items-center rounded border text-xs font-bold uppercase ${
                      tile.state === 'correct'
                        ? 'border-emerald-200/40 bg-emerald-400/25 text-emerald-50'
                        : tile.state === 'present'
                          ? 'border-amber-200/40 bg-amber-400/25 text-amber-50'
                          : 'border-slate-300/20 bg-slate-500/20 text-slate-200'
                    }`}
                    key={`${tile.letter}:${tileIndex}`}
                  >
                    {tile.letter}
                  </span>
                )) : (
                  <span className="break-all font-mono text-sm font-semibold tracking-[0.12em] text-slate-200">{move.guess}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MultiplayerLiveCard({
  game,
  onOpenFocusedSpectatorGame,
  onOpenPublicProfile,
  onResumeGame,
  onSelectGame,
  selected,
}: {
  readonly game: MultiplayerLiveGameViewModel
  readonly onOpenFocusedSpectatorGame?: (id: string) => void
  readonly onOpenPublicProfile?: (publicProfileId: string) => void
  readonly onResumeGame: (id: string) => void
  readonly onSelectGame?: (id: string) => void
  readonly selected: boolean
}) {
  const handleAction = () => {
    if (game.viewerRole === 'spectator') {
      onSelectGame?.(game.id)
      onOpenFocusedSpectatorGame?.(game.id)
      return
    }
    onResumeGame(game.id)
  }
  const spectatorDetailsId = game.viewerRole === 'spectator' ? `live-spectator-details-${game.id}` : undefined

  return (
    <article className="rounded-lg border border-white/10 bg-black/30 p-4 shadow-xl shadow-black/20" aria-label={game.title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ice-200)]">{game.scopeLabel}</p>
          <h3 className="mt-1 break-words text-lg font-bold text-white">{game.modeLabel}</h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className={`rounded border px-2 py-1 text-xs font-semibold ${
            game.rankingLabel === 'Ranked'
              ? 'border-amber-200/30 bg-amber-400/10 text-amber-100'
              : 'border-slate-200/20 bg-white/5 text-slate-200'
          }`}>
            {game.rankingLabel}
          </span>
          <span className={`rounded border px-2 py-1 text-xs font-semibold ${
            game.viewerRole === 'spectator'
              ? 'border-cyan-200/30 bg-cyan-400/10 text-cyan-100'
              : 'border-emerald-200/30 bg-emerald-400/10 text-emerald-100'
          }`}>
            {game.viewerRole === 'spectator' ? 'Spectator' : 'Live'}
          </span>
        </div>
      </div>
      <dl className="mt-4 space-y-2 text-sm text-slate-300">
        <div>
          <dt className="sr-only">Opponent</dt>
          <dd>
            {game.viewerRole === 'participant' && game.opponentPublicProfileId && onOpenPublicProfile ? (
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
          <dt className="sr-only">Turn</dt>
          <dd>{game.turnLabel}</dd>
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
      <div className="mt-4">
        <Button
          aria-controls={game.viewerRole === 'spectator' && !onOpenFocusedSpectatorGame ? spectatorDetailsId : undefined}
          aria-expanded={game.viewerRole === 'spectator' && !onOpenFocusedSpectatorGame ? selected : undefined}
          onClick={handleAction}
          size="sm"
          variant={game.viewerRole === 'spectator' ? 'secondary' : 'primary'}
        >
          {game.actionLabel}
        </Button>
      </div>
      {selected && game.spectatorDetails ? <MultiplayerLiveSpectatorDetails details={game.spectatorDetails} id={spectatorDetailsId} /> : null}
    </article>
  )
}

export function MultiplayerLive({
  liveGames,
  onOpenFocusedSpectatorGame,
  onOpenPublicProfile,
  onResumeGame,
  onSelectGame,
  restrictedGameCount,
  selectedGameId,
  viewerUserId,
}: {
  readonly liveGames: readonly MultiplayerLiveGameViewModel[]
  readonly onOpenFocusedSpectatorGame?: (id: string) => void
  readonly onOpenPublicProfile?: (publicProfileId: string) => void
  readonly onResumeGame: (id: string) => void
  readonly onSelectGame?: (id: string) => void
  readonly restrictedGameCount: number
  readonly selectedGameId?: string
  readonly viewerUserId?: string
}) {
  if (liveGames.length === 0) {
    return (
      <LiveStateNotice>
        <p className="font-semibold text-white">{viewerUserId ? 'No Live games visible right now.' : 'No public Live games visible right now.'}</p>
        <p className="mt-1">
          {viewerUserId
            ? 'Start, join, or spectate a Multiplayer game, then return here while it is in progress.'
            : 'Eligible Practice Multiplayer games appear here when they are safe for public read-only spectation.'}
        </p>
        {restrictedGameCount > 0 ? (
          <p className="mt-2 text-cyan-100">
            {restrictedGameCount} active {restrictedGameCount === 1 ? 'game is' : 'games are'} hidden by Live privacy rules.
          </p>
        ) : null}
      </LiveStateNotice>
    )
  }

  const spectatorGameCount = liveGames.filter((game) => game.viewerRole === 'spectator').length

  return (
    <div className="space-y-4">
      {restrictedGameCount > 0 ? (
        <div className="rounded-lg border border-cyan-200/20 bg-cyan-400/10 p-4 text-sm leading-6 text-cyan-50">
          {restrictedGameCount} active {restrictedGameCount === 1 ? 'game is' : 'games are'} hidden by Live privacy rules.
        </div>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {liveGames.map((game) => (
          <MultiplayerLiveCard
            game={game}
            key={game.id}
            onOpenFocusedSpectatorGame={onOpenFocusedSpectatorGame}
            onOpenPublicProfile={onOpenPublicProfile}
            onResumeGame={onResumeGame}
            onSelectGame={onSelectGame}
            selected={game.viewerRole === 'spectator' && (selectedGameId === game.id || (!selectedGameId && spectatorGameCount === 1))}
          />
        ))}
      </div>
    </div>
  )
}
