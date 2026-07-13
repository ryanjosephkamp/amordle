import { useCallback, useEffect, useState } from 'react'
import { Button, LoadingState, Panel } from '../ui'
import type { AdminOperationalDashboardRepository, AdminOperationalDashboardSnapshot } from './adminDashboard'

export type AdminOperationalDashboardLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface AdminOperationalDashboardProps {
  readonly repository?: AdminOperationalDashboardRepository
}

export interface AdminOperationalDashboardViewProps {
  readonly dashboard?: AdminOperationalDashboardSnapshot
  readonly onRefresh?: () => void
  readonly status: AdminOperationalDashboardLoadStatus
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

function DashboardMetric({
  label,
  tone = 'neutral',
  value,
}: {
  readonly label: string
  readonly tone?: 'attention' | 'neutral'
  readonly value: number
}) {
  const toneClasses = tone === 'attention'
    ? 'border-amber-200/35 bg-amber-300/10 text-amber-50'
    : 'border-white/10 bg-black/25 text-slate-100'

  return (
    <div className={`min-w-0 rounded-lg border p-3 ${toneClasses}`}>
      <p className="break-words text-2xl font-black text-white">{formatCount(value)}</p>
      <p className="mt-1 break-words text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
    </div>
  )
}

export function AdminOperationalDashboardView({
  dashboard,
  onRefresh,
  status,
}: AdminOperationalDashboardViewProps) {
  const loading = status === 'loading'

  return (
    <Panel aria-labelledby="admin-operational-dashboard-title" className="space-y-5" tone="muted">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">admin only</p>
          <h3 id="admin-operational-dashboard-title" className="text-2xl font-bold text-white">Operational dashboard</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            Aggregate operational counts for review. Access is enforced by Supabase admin checks as well as the route gate.
          </p>
        </div>
        <Button disabled={!onRefresh || loading} onClick={onRefresh} size="sm" variant="secondary">
          Refresh
        </Button>
      </div>

      {status === 'idle' ? (
        <p className="rounded-lg border border-white/10 bg-black/30 p-4 text-sm leading-6 text-slate-300">
          Supabase is not configured in this environment, so the operational dashboard is unavailable here.
        </p>
      ) : null}

      {loading ? <LoadingState label="Loading admin operational dashboard..." /> : null}

      {status === 'error' ? (
        <p className="rounded-lg border border-rose-300/30 bg-rose-950/20 p-4 text-sm leading-6 text-rose-100" role="alert">
          Unable to load the admin operational dashboard for this account.
        </p>
      ) : null}

      {status === 'ready' && dashboard ? (
        <>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardMetric label="Accounts" value={dashboard.accountsTotal} />
            <DashboardMetric label="Public profiles" value={dashboard.publicProfilesTotal} />
            <DashboardMetric label="Active public profiles" value={dashboard.publicProfilesActivePublic} />
            <DashboardMetric label="Suspended profiles" tone={dashboard.publicProfilesSuspended > 0 ? 'attention' : 'neutral'} value={dashboard.publicProfilesSuspended} />
            <DashboardMetric label="Ranked profiles" value={dashboard.rankedProfilesTotal} />
            <DashboardMetric label="Established ratings" value={dashboard.rankedProfilesEstablished} />
            <DashboardMetric label="Pending ranked queue" tone={dashboard.rankedQueuePending > 0 ? 'attention' : 'neutral'} value={dashboard.rankedQueuePending} />
            <DashboardMetric label="Stale queue candidates" tone={dashboard.rankedQueueStaleCandidates > 0 ? 'attention' : 'neutral'} value={dashboard.rankedQueueStaleCandidates} />
            <DashboardMetric label="Active async games" tone={dashboard.asyncGamesActive > 0 ? 'attention' : 'neutral'} value={dashboard.asyncGamesActive} />
            <DashboardMetric label="Terminal async games" value={dashboard.asyncGamesTerminal} />
            <DashboardMetric label="Pending private requests" tone={dashboard.privateMatchRequestsPending > 0 ? 'attention' : 'neutral'} value={dashboard.privateMatchRequestsPending} />
            <DashboardMetric label="Daily claims today" value={dashboard.dailyClaimsToday} />
          </div>

          <dl className="grid min-w-0 gap-3 text-sm text-slate-300 md:grid-cols-4">
            <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Generated</dt>
              <dd className="mt-1 break-words text-slate-100">{formatDateTime(dashboard.generatedAt)}</dd>
            </div>
            <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Ranked queue</dt>
              <dd className="mt-1 break-words text-slate-100">{formatDateTime(dashboard.latestRankedQueueActivityAt)}</dd>
            </div>
            <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Private requests</dt>
              <dd className="mt-1 break-words text-slate-100">{formatDateTime(dashboard.latestPrivateRequestActivityAt)}</dd>
            </div>
            <div className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Async games</dt>
              <dd className="mt-1 break-words text-slate-100">{formatDateTime(dashboard.latestAsyncGameActivityAt)}</dd>
            </div>
          </dl>
        </>
      ) : null}
    </Panel>
  )
}

export function AdminOperationalDashboard({ repository }: AdminOperationalDashboardProps) {
  const [reloadNonce, setReloadNonce] = useState(0)
  const [dashboard, setDashboard] = useState<AdminOperationalDashboardSnapshot | undefined>(undefined)
  const [status, setStatus] = useState<AdminOperationalDashboardLoadStatus>(repository ? 'loading' : 'idle')

  useEffect(() => {
    if (!repository) {
      return undefined
    }

    let isActive = true
    const timeoutId = setTimeout(() => {
      setStatus('loading')
      void repository.loadAdminOperationalDashboard()
        .then((nextDashboard) => {
          if (!isActive) {
            return
          }
          setDashboard(nextDashboard)
          setStatus(nextDashboard ? 'ready' : 'error')
        })
        .catch(() => {
          if (!isActive) {
            return
          }
          setDashboard(undefined)
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

  return (
    <AdminOperationalDashboardView
      dashboard={repository ? dashboard : undefined}
      onRefresh={repository ? handleRefresh : undefined}
      status={repository ? status : 'idle'}
    />
  )
}
