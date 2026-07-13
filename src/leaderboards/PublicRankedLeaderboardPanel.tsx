import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, LoadingState, Panel } from '../ui'
import { classNames } from '../ui/classNames'
import type {
  PublicRankedLeaderboardBucket,
  PublicRankedLeaderboardRepository,
  PublicRankedLeaderboardRow,
} from './publicRankedLeaderboard'
import {
  DEFAULT_PUBLIC_RANKED_LEADERBOARD_BUCKET,
  PUBLIC_RANKED_LEADERBOARD_BUCKET_OPTIONS,
  PUBLIC_RANKED_LEADERBOARD_LIMIT_OPTIONS,
  createPublicRankedLeaderboardViewRows,
  formatPublicRankedLeaderboardBucket,
  type PublicRankedLeaderboardViewRow,
} from './publicRankedLeaderboardViewModels'

export type PublicRankedLeaderboardAuthStatus = 'anonymous' | 'authenticated' | 'unconfigured'
export type PublicRankedLeaderboardLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PublicRankedLeaderboardPanelProps {
  readonly authStatus: PublicRankedLeaderboardAuthStatus
  readonly freshnessKey?: string
  readonly onOpenPublicProfile?: (publicProfileId: string) => void
  readonly repository?: PublicRankedLeaderboardRepository
}

export interface PublicRankedLeaderboardViewProps {
  readonly authStatus: PublicRankedLeaderboardAuthStatus
  readonly bucket: PublicRankedLeaderboardBucket | null
  readonly errorMessage?: string
  readonly limit: number
  readonly onBucketChange?: (bucket: PublicRankedLeaderboardBucket) => void
  readonly onLimitChange?: (limit: number) => void
  readonly onOpenPublicProfile?: (publicProfileId: string) => void
  readonly onRefresh?: () => void
  readonly rows: readonly PublicRankedLeaderboardRow[]
  readonly status: PublicRankedLeaderboardLoadStatus
}

const accentAvatarClasses = {
  amber: 'from-amber-300 to-orange-700 text-slate-950',
  aurora: 'from-emerald-300 to-cyan-700 text-slate-950',
  cyan: 'from-cyan-200 to-sky-700 text-slate-950',
  ice: 'from-slate-100 to-cyan-500 text-slate-950',
  rose: 'from-rose-200 to-fuchsia-700 text-slate-950',
  violet: 'from-violet-200 to-indigo-700 text-slate-950',
} as const

function renderAvatar(row: PublicRankedLeaderboardViewRow) {
  if (row.avatarUrl) {
    return (
      <img
        alt={`${row.displayName} public avatar`}
        className="h-10 w-10 rounded-lg border border-white/15 object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        src={row.avatarUrl}
      />
    )
  }

  const initial = row.displayName.trim().charAt(0).toLocaleUpperCase() || '?'
  return (
    <span className={classNames(
      'flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br text-sm font-black shadow-inner shadow-white/20',
      accentAvatarClasses[row.accentColor],
    )}>
      {initial}
    </span>
  )
}

function PublicRankedLeaderboardIdentity({
  onOpenPublicProfile,
  row,
}: {
  readonly onOpenPublicProfile?: (publicProfileId: string) => void
  readonly row: PublicRankedLeaderboardViewRow
}) {
  const content = (
    <>
      {renderAvatar(row)}
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{row.displayName}</p>
        <p className="text-xs text-slate-500">{row.gamesLabel}</p>
      </div>
    </>
  )

  if (!onOpenPublicProfile) {
    return <div className="flex min-w-48 items-center gap-3">{content}</div>
  }

  return (
    <button
      aria-label={`Open public profile for ${row.displayName}`}
      className="group flex min-w-48 items-center gap-3 rounded-lg text-left transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-cyan-200/70"
      onClick={() => onOpenPublicProfile(row.publicProfileId)}
      type="button"
    >
      {content}
    </button>
  )
}

function PublicRankedLeaderboardRows({
  onOpenPublicProfile,
  rows,
}: {
  readonly onOpenPublicProfile?: (publicProfileId: string) => void
  readonly rows: readonly PublicRankedLeaderboardViewRow[]
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 bg-black/25">
      <table className="min-w-full divide-y divide-white/10 text-left text-sm text-slate-200">
        <caption className="sr-only">Public ranked multiplayer leaderboard rows</caption>
        <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-3 py-3 font-semibold" scope="col">Rank</th>
            <th className="px-3 py-3 font-semibold" scope="col">Player</th>
            <th className="px-3 py-3 font-semibold" scope="col">Bucket</th>
            <th className="px-3 py-3 font-semibold" scope="col">Rating</th>
            <th className="px-3 py-3 font-semibold" scope="col">Record</th>
            <th className="px-3 py-3 font-semibold" scope="col">Status</th>
            <th className="px-3 py-3 font-semibold" scope="col">Movement</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map((row) => (
            <tr className="align-top" key={`${row.bucket}-${row.publicProfileId}`}>
              <td className="px-3 py-4 text-lg font-black text-white">{row.rankLabel}</td>
              <td className="px-3 py-4">
                <PublicRankedLeaderboardIdentity onOpenPublicProfile={onOpenPublicProfile} row={row} />
              </td>
              <td className="px-3 py-4 text-slate-300">{row.bucketLabel}</td>
              <td className="px-3 py-4">
                <p className="text-lg font-black text-white">{row.ratingLabel}</p>
                <p className="text-xs text-slate-500">{row.peakLabel}</p>
                <p className="text-xs font-semibold text-cyan-100">{row.rankBandLabel} band</p>
              </td>
              <td className="px-3 py-4">
                <p className="font-semibold text-cyan-100">{row.recordLabel}</p>
                <p className="text-xs text-slate-500">wins-losses-draws</p>
              </td>
              <td className="px-3 py-4">
                <span className={classNames(
                  'inline-flex rounded-lg border px-2 py-1 text-xs font-bold',
                  row.provisionalLabel === 'Provisional'
                    ? 'border-amber-200/40 bg-amber-300/10 text-amber-100'
                    : 'border-cyan-200/30 bg-cyan-300/10 text-cyan-100',
                )}>
                  {row.provisionalLabel}
                </span>
              </td>
              <td className="px-3 py-4">
                <p className="font-semibold text-slate-100">{row.latestMovementLabel}</p>
                <p className="text-xs text-slate-500">Updated {row.updatedLabel}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PublicRankedLeaderboardView({
  authStatus,
  bucket,
  errorMessage,
  limit,
  onBucketChange,
  onLimitChange,
  onOpenPublicProfile,
  onRefresh,
  rows,
  status,
}: PublicRankedLeaderboardViewProps) {
  const viewRows = useMemo(() => createPublicRankedLeaderboardViewRows(rows), [rows])
  const selectedBucket = bucket ?? DEFAULT_PUBLIC_RANKED_LEADERBOARD_BUCKET
  const selectedBucketLabel = formatPublicRankedLeaderboardBucket(selectedBucket)
  const isSignedIn = authStatus === 'authenticated'

  return (
    <Panel aria-labelledby="public-ranked-leaderboard-title" className="space-y-5" tone="muted">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">public leaderboard</p>
          <h3 id="public-ranked-leaderboard-title" className="text-2xl font-bold text-white">Ranked multiplayer leaderboard</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Signed-in players can view opt-in public profiles ranked by trusted Practice or Daily Elo. Private, hidden, suspended, or zero-game profiles are omitted.
          </p>
        </div>
        <Button disabled={!isSignedIn || status === 'loading'} onClick={onRefresh} size="sm" variant="secondary">
          Refresh
        </Button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Bucket</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PUBLIC_RANKED_LEADERBOARD_BUCKET_OPTIONS.map((option) => (
              <Button
                aria-label={option.description}
                disabled={!isSignedIn}
                isActive={option.bucket === selectedBucket}
                key={option.label}
                onClick={() => onBucketChange?.(option.bucket)}
                size="sm"
                variant="secondary"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Rows</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PUBLIC_RANKED_LEADERBOARD_LIMIT_OPTIONS.map((option) => (
              <Button
                disabled={!isSignedIn}
                isActive={option === limit}
                key={option}
                onClick={() => onLimitChange?.(option)}
                size="sm"
                variant="secondary"
              >
                Top {option}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <p className="rounded-lg border border-white/10 bg-black/25 p-3 text-xs leading-5 text-slate-400">
        Showing {selectedBucketLabel}. Rank bands are display labels for current Elo ranges; match points, Elo settlement, profile visibility, and gameplay authority remain separate trusted systems.
      </p>

      {authStatus === 'unconfigured' ? (
        <p className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-slate-300">
          Supabase is not configured in this environment, so public ranked leaderboards are unavailable here.
        </p>
      ) : null}

      {authStatus === 'anonymous' ? (
        <p className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm text-slate-300">
          Sign in to view public ranked multiplayer leaderboards. This view is authenticated-only.
        </p>
      ) : null}

      {isSignedIn && status === 'loading' ? <LoadingState label="Loading public ranked leaderboard..." /> : null}

      {isSignedIn && status === 'error' ? (
        <p className="rounded-lg border border-rose-300/30 bg-rose-950/20 p-4 text-sm leading-6 text-rose-100" role="alert">
          {errorMessage ?? 'Unable to load the public ranked leaderboard right now.'}
        </p>
      ) : null}

      {isSignedIn && status !== 'loading' && status !== 'error' && viewRows.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm leading-6 text-slate-300">
          No public ranked multiplayer rows yet. Players appear after opting into a public profile and completing ranked Practice or Daily games.
        </p>
      ) : null}

      {isSignedIn && status !== 'loading' && status !== 'error' && viewRows.length > 0 ? (
        <PublicRankedLeaderboardRows onOpenPublicProfile={onOpenPublicProfile} rows={viewRows} />
      ) : null}
    </Panel>
  )
}

export function PublicRankedLeaderboardPanel({
  authStatus,
  freshnessKey,
  onOpenPublicProfile,
  repository,
}: PublicRankedLeaderboardPanelProps) {
  const [bucket, setBucket] = useState<PublicRankedLeaderboardBucket>(DEFAULT_PUBLIC_RANKED_LEADERBOARD_BUCKET)
  const [limit, setLimit] = useState(50)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [rows, setRows] = useState<readonly PublicRankedLeaderboardRow[]>([])
  const [status, setStatus] = useState<PublicRankedLeaderboardLoadStatus>(
    authStatus === 'authenticated' && repository ? 'loading' : 'idle',
  )
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (authStatus !== 'authenticated' || !repository) {
      return undefined
    }

    let isActive = true
    const timeoutId = setTimeout(() => {
      setStatus('loading')
      setErrorMessage(undefined)
      void repository.loadRankedPracticeLeaderboard({ bucket, limit, offset: 0 })
        .then((nextRows) => {
          if (isActive) {
            setRows(nextRows)
            setStatus('ready')
          }
        })
        .catch(() => {
          if (isActive) {
            setRows([])
            setErrorMessage('Unable to load the public ranked leaderboard right now.')
            setStatus('error')
          }
        })
    }, 0)

    return () => {
      isActive = false
      clearTimeout(timeoutId)
    }
  }, [authStatus, bucket, freshnessKey, limit, reloadNonce, repository])

  const handleRefresh = useCallback(() => {
    setReloadNonce((current) => current + 1)
  }, [])
  const effectiveRows = authStatus === 'authenticated' && repository ? rows : []
  const effectiveStatus: PublicRankedLeaderboardLoadStatus = authStatus === 'authenticated'
    ? repository ? status === 'idle' ? 'loading' : status : 'error'
    : 'idle'
  const effectiveErrorMessage = authStatus === 'authenticated' && !repository
    ? 'Public leaderboard access is unavailable in this environment.'
    : errorMessage

  return (
    <PublicRankedLeaderboardView
      authStatus={authStatus}
      bucket={bucket}
      errorMessage={effectiveErrorMessage}
      limit={limit}
      onBucketChange={setBucket}
      onLimitChange={setLimit}
      onOpenPublicProfile={onOpenPublicProfile}
      onRefresh={handleRefresh}
      rows={effectiveRows}
      status={effectiveStatus}
    />
  )
}
