import type { ReactNode } from 'react'
import { Button } from '../ui'
import type { MultiplayerLobbyRowViewModel } from './multiplayerViewModels'

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

export function MultiplayerLobby({
  limit,
  onJoinGame,
  onOpenGame,
  rows,
}: {
  readonly limit?: number
  readonly onJoinGame?: (id: string) => void
  readonly onOpenGame: (id: string) => void
  readonly rows: readonly MultiplayerLobbyRowViewModel[]
}) {
  const visibleRows = typeof limit === 'number' ? rows.slice(0, Math.max(0, limit)) : rows
  if (visibleRows.length === 0) {
    return <EmptyState>No open multiplayer lobbies.</EmptyState>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[48rem] border-separate border-spacing-y-2 text-left text-sm">
        <thead className="text-xs uppercase tracking-[0.18em] text-slate-400">
          <tr>
            <th className="px-3 py-1">Lobby</th>
            <th className="px-3 py-1">Host</th>
            <th className="px-3 py-1">Rules</th>
            <th className="px-3 py-1">Opened</th>
            <th className="px-3 py-1">Status</th>
            <th className="px-3 py-1"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <MultiplayerLobbyRow
              key={row.id}
              onJoinGame={onJoinGame}
              onOpenGame={onOpenGame}
              row={row}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function getMultiplayerLobbyActionTarget(row: Pick<MultiplayerLobbyRowViewModel, 'canJoin'>): 'join' | 'open' {
  return row.canJoin ? 'join' : 'open'
}

function getMultiplayerLobbyActionAriaLabel(row: MultiplayerLobbyRowViewModel): string {
  if (row.canJoin) {
    return 'Join multiplayer match'
  }
  return row.actionLabel
}

function MultiplayerLobbyRow({
  onJoinGame,
  onOpenGame,
  row,
}: {
  readonly onJoinGame?: (id: string) => void
  readonly onOpenGame: (id: string) => void
  readonly row: MultiplayerLobbyRowViewModel
}) {
  const actionTarget = getMultiplayerLobbyActionTarget(row)
  const disabled = row.claimBlocked || (!row.canJoin && !row.canCancel)

  return (
    <tr className="bg-black/30 text-slate-200">
      <td className="rounded-l-lg border-y border-l border-white/10 px-3 py-3">
        <p className="font-semibold">{row.scopeLabel} {row.modeLabel}</p>
        <p className="text-xs text-slate-400">{row.timeLimitLabel}{row.hardModeLabel ? ` · ${row.hardModeLabel}` : ''}</p>
      </td>
      <td className="border-y border-white/10 px-3 py-3">{row.hostLabel}</td>
      <td className="border-y border-white/10 px-3 py-3">{row.detailLabel}</td>
      <td className="border-y border-white/10 px-3 py-3">{formatDateTime(row.updatedAt)}</td>
      <td className="border-y border-white/10 px-3 py-3">{row.claimBlocked ? 'Claim blocked' : row.statusLabel}</td>
      <td className="rounded-r-lg border-y border-r border-white/10 px-3 py-3 text-right">
        <Button
          aria-label={getMultiplayerLobbyActionAriaLabel(row)}
          data-action-target={actionTarget}
          data-testid={`multiplayer-lobby-action-${row.id}`}
          disabled={disabled}
          onClick={() => {
            if (actionTarget === 'join' && onJoinGame) {
              onJoinGame(row.id)
              return
            }
            onOpenGame(row.id)
          }}
          size="sm"
          variant={row.canJoin ? 'primary' : 'ghost'}
        >
          {row.actionLabel}
        </Button>
      </td>
    </tr>
  )
}
