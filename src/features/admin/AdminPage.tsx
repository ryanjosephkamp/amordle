import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../../app/auth-context';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Metric, PageHeader, RuledList, StatusDot } from '../../components/Surface';

type AdminState =
  | 'unconfigured'
  | 'anonymous'
  | 'denied'
  | 'ready'
  | 'confirm'
  | 'inflight'
  | 'success'
  | 'failure';

const metrics = [
  ['Accounts', '20'],
  ['Public profiles', '12'],
  ['Active public profiles', '8'],
  ['Suspended profiles', '1'],
  ['Ranked profiles', '10'],
  ['Established ratings', '7'],
  ['Pending ranked queue', '3'],
  ['Stale queue candidates', '1'],
  ['Active async games', '5'],
  ['Terminal async games', '101'],
  ['Pending private requests', '2'],
  ['Daily claims today', '9'],
] as const;

function LockedAdmin({ state }: { state: 'unconfigured' | 'anonymous' | 'denied' }) {
  const title = 'Developer operations locked';
  const message =
    state === 'unconfigured'
      ? 'Supabase is not configured in this environment, so developer operations are unavailable.'
      : state === 'anonymous'
        ? 'Sign in with a Supabase account before using protected developer operations.'
        : 'Your Supabase account does not have the admin role required for developer operations.';
  return (
    <div className="admin-locked">
      <p className="eyebrow">Admin</p>
      <div className="lock-mark">
        <Icon name="lock" />
      </div>
      <div role="alert">
        <h1>{title}</h1>
        <p>{message}</p>
      </div>
    </div>
  );
}

export function AdminPage() {
  const location = useLocation();
  const visual = new URLSearchParams(location.search).get('visual') as AdminState | null;
  const { client, service, status: authStatus, user } = useAuth();
  const [state, setState] = useState<AdminState>('ready');
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const isAdmin = user?.app_metadata.role === 'admin';
  const dashboard = useQuery({
    queryKey: ['admin-operational-dashboard'],
    enabled: Boolean(client && isAdmin && !(import.meta.env.DEV && visual)),
    queryFn: async () => {
      if (!client) throw new Error('Admin client is unavailable.');
      const { data, error } = await client.rpc('get_admin_operational_dashboard_v1');
      if (error) throw error;
      return data?.[0] ?? null;
    },
    staleTime: 10_000,
    retry: false,
  });

  if (import.meta.env.DEV && visual) {
    if (visual === 'unconfigured' || visual === 'anonymous' || visual === 'denied') {
      return <LockedAdmin state={visual} />;
    }
    if (visual === 'ready') return <Dashboard onConfirm={() => setState('confirm')} />;
    return <RefreshOperation state={visual} onState={setState} receipt={receipt} />;
  }
  if (authStatus === 'unconfigured') return <LockedAdmin state="unconfigured" />;
  if (authStatus === 'loading') return <p role="status">Verifying developer authorization…</p>;
  if (!user) return <LockedAdmin state="anonymous" />;
  if (!isAdmin) return <LockedAdmin state="denied" />;
  if (dashboard.isPending) return <p role="status">Loading authorized operational metrics…</p>;
  if (dashboard.isError) {
    return (
      <div className="admin-locked" role="alert">
        <h1>Developer operations unavailable</h1>
        <p>The authorized aggregate projection could not be loaded.</p>
        <Button onClick={() => void dashboard.refetch()}>Retry</Button>
      </div>
    );
  }
  if (state === 'ready') {
    return (
      <Dashboard
        onConfirm={() => setState('confirm')}
        onReload={() => void dashboard.refetch()}
        {...(dashboard.data ? { data: dashboard.data as Record<string, unknown> } : {})}
      />
    );
  }

  const execute = async () => {
    setState('inflight');
    try {
      const session = await service?.session();
      if (!session?.access_token) throw new Error('The verified account session is unavailable.');
      const response = await fetch('/api/admin-refresh', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const payload: unknown = await response.json();
      if (!response.ok || typeof payload !== 'object' || payload === null) {
        throw new Error('The refresh server returned a bounded failure.');
      }
      setReceipt(payload as Record<string, unknown>);
      setState('success');
    } catch (error) {
      setReceipt({ detail: error instanceof Error ? error.message : 'Refresh failed.' });
      setState('failure');
    }
  };
  return (
    <RefreshOperation
      state={state as Exclude<AdminState, 'unconfigured' | 'anonymous' | 'denied' | 'ready'>}
      onState={setState}
      onExecute={execute}
      receipt={receipt}
    />
  );
}

function Dashboard({
  onConfirm,
  onReload,
  data,
}: {
  onConfirm: () => void;
  onReload?: () => void;
  data?: Record<string, unknown>;
}) {
  const [stamp, setStamp] = useState('Snapshot ready');
  const rows = data
    ? [
        ['Accounts', data.accounts_total],
        ['Public profiles', data.public_profiles_total],
        ['Active public profiles', data.public_profiles_active_public],
        ['Suspended profiles', data.public_profiles_suspended],
        ['Ranked profiles', data.ranked_profiles_total],
        ['Established ratings', data.ranked_profiles_established],
        ['Pending ranked queue', data.ranked_queue_pending],
        ['Stale queue candidates', data.ranked_queue_stale_candidates],
        ['Active async games', data.async_games_active],
        ['Terminal async games', data.async_games_terminal],
        ['Pending private requests', data.private_match_requests_pending],
        ['Daily claims today', data.daily_claims_today],
      ].map(([label, value]) => [String(label), String(value ?? 0)] as const)
    : metrics;
  return (
    <div className="page page--admin">
      <PageHeader
        title="Developer Operations"
        eyebrow="Protected Admin · Admin only"
        description="Aggregate operational counts for review. Access remains enforced by the server route gate."
      />
      <div className="dashboard-title">
        <h2>Operational dashboard</h2>
        <Button
          onClick={() => {
            onReload?.();
            setStamp(`Reloaded ${new Date().toLocaleTimeString()}`);
          }}
        >
          <Icon name="refresh" /> Refresh
        </Button>
        <span>{stamp}</span>
      </div>
      <div className="operations-matrix" role="list" aria-label="Approved aggregate metrics">
        {rows.map(([label, value]) => (
          <div role="listitem" key={label}>
            <Metric
              value={value}
              label={label}
              tone={['1', '3', '5', '2'].includes(value) ? 'amber' : 'green'}
            />
            {['1', '3', '5', '2'].includes(value) ? <small>Attention</small> : null}
          </div>
        ))}
      </div>
      <RuledList label="Activity timestamps">
        {['Generated', 'Ranked queue', 'Private requests', 'Async games'].map((label) => (
          <div className="activity-row" role="listitem" key={label}>
            <Icon name="clock" />
            <span>{label}</span>
            <time>Jul 21, 2026 · 2:22 PM</time>
          </div>
        ))}
      </RuledList>
      <Button tone="primary" onClick={onConfirm}>
        Manual word-list refresh
      </Button>
    </div>
  );
}

function RefreshOperation({
  state,
  onState,
  onExecute,
  receipt,
}: {
  state: Exclude<AdminState, 'unconfigured' | 'anonymous' | 'denied' | 'ready'>;
  onState: (state: AdminState) => void;
  onExecute?: () => Promise<void>;
  receipt?: Record<string, unknown> | null;
}) {
  const inFlight = state === 'inflight';
  return (
    <div className="page page--admin">
      <StatusDot>Admin access verified · signed in</StatusDot>
      <PageHeader
        title="Manual word-list refresh"
        eyebrow="Developer Operations"
        description={
          state === 'confirm'
            ? 'Review the full operation before execution.'
            : state === 'inflight'
              ? 'The protected request is active. The server remains the authority.'
              : 'The protected request returned the status below.'
        }
      />
      <dl className="operation-ledger">
        <div>
          <dt>Target</dt>
          <dd>All Practice word lists</dd>
        </div>
        <div>
          <dt>Coverage</dt>
          <dd>34 files · lengths 2–35</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>Hugging Face</dd>
        </div>
      </dl>
      <p className="privacy-band">
        <Icon name="info" /> Every length validates before persistence changes. If any length fails,
        the operation aborts and the currently served set remains intact.
      </p>
      {state === 'confirm' ? (
        <div className="two-up">
          <Button
            tone="primary"
            onClick={() => (onExecute ? void onExecute() : onState('inflight'))}
          >
            <Icon name="check" /> Confirm refresh
          </Button>
          <Button onClick={() => onState('ready')}>Cancel</Button>
        </div>
      ) : null}
      {inFlight ? (
        <div className="operation-status" role="status">
          <Icon name="clock" />
          <div>
            <h2>Refreshing word lists…</h2>
            <p>No percentage, stage, ETA, or partial outcome is available.</p>
          </div>
          <Button disabled>Refreshing…</Button>
        </div>
      ) : null}
      {state === 'success' ? (
        <div className="operation-status operation-status--success" role="status">
          <Icon name="check" />
          <div>
            <h2>Refresh succeeded.</h2>
            <dl className="receipt">
              <div>
                <dt>Revision</dt>
                <dd>{String(receipt?.revision ?? 'validated revision')}</dd>
              </div>
              <div>
                <dt>Generated at</dt>
                <dd>{String(receipt?.generatedAt ?? receipt?.generated_at ?? 'validated')}</dd>
              </div>
              <div>
                <dt>Fetched at</dt>
                <dd>{String(receipt?.fetchedAt ?? receipt?.fetched_at ?? 'validated')}</dd>
              </div>
              <div>
                <dt>Lengths refreshed</dt>
                <dd>{String(receipt?.lengthsRefreshed ?? receipt?.lengths_refreshed ?? 34)}</dd>
              </div>
              <div>
                <dt>Persistence</dt>
                <dd>Swapped</dd>
              </div>
            </dl>
          </div>
          <Button onClick={() => onState('ready')}>Reset status</Button>
        </div>
      ) : null}
      {state === 'failure' ? (
        <div className="operation-status operation-status--failure" role="alert">
          <Icon name="info" />
          <div>
            <h2>The refresh server returned an error.</h2>
            <p>
              {String(
                receipt?.detail ??
                  'The request aborted before the manifest pointer changed; the currently served set remains intact.',
              )}
            </p>
            <div className="button-row">
              <Button onClick={() => onState('confirm')}>Refresh now</Button>
              <Button onClick={() => onState('ready')}>Reset status</Button>
            </div>
          </div>
        </div>
      ) : null}
      {import.meta.env.DEV && inFlight ? (
        <div className="visual-state-controls" aria-label="Local visual-state controls">
          <Button onClick={() => onState('success')}>Show success</Button>
          <Button onClick={() => onState('failure')}>Show failure</Button>
        </div>
      ) : null}
    </div>
  );
}
