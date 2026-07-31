'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { getAdminDashboard, getMyRole, requestWordFreshness } from '@/adapters/supabase/admin';
import { useAuth } from '@/components/providers';
import { AccountGate } from '@/components/route-states';

export function AdminDashboard() {
  return (
    <AccountGate>
      <AdminDashboardInner />
    </AccountGate>
  );
}

function AdminDashboardInner() {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const role = useQuery({
    queryKey: ['role', userId],
    queryFn: () => getMyRole(userId),
    enabled: Boolean(userId),
  });
  const dashboard = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: getAdminDashboard,
    enabled: role.data === 'admin',
  });
  const refresh = useMutation({
    mutationFn: requestWordFreshness,
    onSuccess: () => void dashboard.refetch(),
  });
  if (role.isPending) return <p aria-live="polite">Checking authorization…</p>;
  if (role.data !== 'admin') {
    return (
      <section className="status-panel">
        <h2>Admin access required</h2>
        <p>This account is signed in but is not authorized for operator diagnostics.</p>
      </section>
    );
  }
  return (
    <>
      <div className="section-heading">
        <div>
          <h2>Bounded diagnostics</h2>
          <p className="prose">
            Counts and timestamps only; no player rows or private projections.
          </p>
        </div>
        <button onClick={() => void dashboard.refetch()}>Refresh view</button>
      </div>
      {dashboard.data ? (
        <div className="metric-grid">
          <Metric label="Accounts" value={dashboard.data.accounts_total} />
          <Metric label="Active async games" value={dashboard.data.async_games_active} />
          <Metric label="Queued ranked" value={dashboard.data.ranked_queue_pending} />
          <Metric
            label="Pending private requests"
            value={dashboard.data.private_match_requests_pending}
          />
          <Metric label="Public profiles" value={dashboard.data.public_profiles_active_public} />
          <Metric label="Daily claims today" value={dashboard.data.daily_claims_today} />
        </div>
      ) : (
        <p aria-live="polite">Loading diagnostics…</p>
      )}
      <section className="status-panel admin-refresh">
        <h2>Word-list freshness</h2>
        <p>
          The running deployment is immutable. This check compares its packaged word authority with
          the latest bounded English OpenList release; updates are prepared and reviewed in the
          repository.
        </p>
        <button className="primary" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
          {refresh.isPending ? 'Checking…' : 'Check source freshness'}
        </button>
        <p aria-live="polite">
          {refresh.data
            ? refresh.data.status === 'current'
              ? `Current · release ${refresh.data.observedReleaseDate} · checked ${new Date(refresh.data.checkedAt).toLocaleString()}`
              : `A newer source release (${refresh.data.observedReleaseDate}) is ready for a reviewed repository refresh.`
            : refresh.isError
              ? 'Freshness check is unavailable; the packaged word revision remains active.'
              : ''}
        </p>
      </section>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className="mono">{value}</strong>
    </div>
  );
}
