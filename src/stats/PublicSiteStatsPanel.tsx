import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, LoadingState, Panel } from '../ui'
import type { PublicSiteStats, PublicSiteStatsRepository } from './siteStats'

export type PublicSiteStatsLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PublicSiteStatsPanelProps {
  readonly repository?: PublicSiteStatsRepository
}

export interface PublicSiteStatsViewProps {
  readonly onRefresh?: () => void
  readonly stats?: PublicSiteStats
  readonly status: PublicSiteStatsLoadStatus
}

const countFormatter = new Intl.NumberFormat('en-US')

function formatCount(value: number): string {
  return countFormatter.format(value)
}

function formatDateTime(value: string | undefined): string {
  if (!value) {
    return 'Not available'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Not available'
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

function PublicSiteStatsMetric({
  label,
  value,
}: {
  readonly label: string
  readonly value: number
}) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/25 p-3">
      <p className="break-words text-2xl font-black text-white">{formatCount(value)}</p>
      <p className="mt-1 break-words text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
    </div>
  )
}

export function PublicSiteStatsView({ onRefresh, stats, status }: PublicSiteStatsViewProps) {
  const loading = status === 'loading'

  return (
    <section className="space-y-3" aria-labelledby="public-site-stats-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">public site stats</p>
          <h3 id="public-site-stats-title" className="text-3xl font-bold text-white">Live site snapshot</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Public totals are aggregate-only and separate from your private local gameplay statistics.
          </p>
        </div>
        <Button disabled={!onRefresh || loading} onClick={onRefresh} size="sm" variant="secondary">
          Refresh
        </Button>
      </div>

      <Panel className="space-y-5" tone="muted">
        {status === 'idle' ? (
          <p className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm leading-6 text-slate-300">
            Supabase is not configured in this environment, so public site stats are unavailable here.
          </p>
        ) : null}

        {loading ? <LoadingState label="Loading public site stats..." /> : null}

        {status === 'error' ? (
          <p className="rounded-lg border border-rose-300/30 bg-rose-950/20 p-4 text-sm leading-6 text-rose-100" role="alert">
            Unable to load public site stats right now.
          </p>
        ) : null}

        {status === 'ready' && stats ? (
          <>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <PublicSiteStatsMetric label="Active public profiles" value={stats.publicProfilesActive} />
              <PublicSiteStatsMetric label="Ranked Practice players" value={stats.rankedPracticePublicPlayers} />
              <PublicSiteStatsMetric label="Ranked Practice results" value={stats.rankedPracticePublicPlayerResults} />
              <PublicSiteStatsMetric label="OG ranked players" value={stats.rankedPracticePublicOgPlayers} />
              <PublicSiteStatsMetric label="GO ranked players" value={stats.rankedPracticePublicGoPlayers} />
            </div>

            <dl className="grid min-w-0 gap-3 text-sm text-slate-300 md:grid-cols-3">
              <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Generated</dt>
                <dd className="mt-1 break-words text-slate-100">{formatDateTime(stats.generatedAt)}</dd>
              </div>
              <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Leaderboard freshness</dt>
                <dd className="mt-1 break-words text-slate-100">{formatDateTime(stats.leaderboardUpdatedAt)}</dd>
              </div>
              <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Profile freshness</dt>
                <dd className="mt-1 break-words text-slate-100">{formatDateTime(stats.publicProfilesUpdatedAt)}</dd>
              </div>
            </dl>
          </>
        ) : null}
      </Panel>
    </section>
  )
}

export function PublicSiteStatsPanel({ repository }: PublicSiteStatsPanelProps) {
  const [reloadNonce, setReloadNonce] = useState(0)
  const [stats, setStats] = useState<PublicSiteStats | undefined>(undefined)
  const [status, setStatus] = useState<PublicSiteStatsLoadStatus>(repository ? 'loading' : 'idle')

  useEffect(() => {
    if (!repository) {
      return undefined
    }

    let isActive = true
    const timeoutId = setTimeout(() => {
      setStatus('loading')
      void repository.loadPublicSiteStats()
        .then((nextStats) => {
          if (!isActive) {
            return
          }
          setStats(nextStats)
          setStatus(nextStats ? 'ready' : 'error')
        })
        .catch(() => {
          if (!isActive) {
            return
          }
          setStats(undefined)
          setStatus('error')
        })
    }, 0)

    return () => {
      isActive = false
      clearTimeout(timeoutId)
    }
  }, [reloadNonce, repository])

  const handleRefresh = useCallback(() => {
    setReloadNonce((current) => current + 1)
  }, [])

  const effectiveStatus = useMemo<PublicSiteStatsLoadStatus>(() => {
    if (!repository) {
      return 'idle'
    }
    return status
  }, [repository, status])

  return (
    <PublicSiteStatsView
      onRefresh={repository ? handleRefresh : undefined}
      stats={repository ? stats : undefined}
      status={effectiveStatus}
    />
  )
}
