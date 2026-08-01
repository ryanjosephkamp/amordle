'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { abandonSoloSession, loadSoloSessionRegistry } from '@/adapters/solo-sessions';
import { soloSessionsQueryKey } from '@/application/solo-query-keys';
import { useAuth } from '@/components/providers';
import { activeSoloSessions } from '@/domain/solo-sessions';

export function ActiveSoloSessions({
  ownerNamespace,
  compact = false,
}: {
  ownerNamespace: string;
  compact?: boolean;
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const userId = auth.status === 'signed-in' ? auth.user?.id : undefined;
  const registry = useQuery({
    queryKey: soloSessionsQueryKey(ownerNamespace),
    queryFn: () => loadSoloSessionRegistry(ownerNamespace, userId),
    refetchOnMount: 'always',
  });
  const abandon = useMutation({
    mutationFn: (sessionId: string) => abandonSoloSession(ownerNamespace, userId, sessionId),
    onSuccess: (next) => queryClient.setQueryData(soloSessionsQueryKey(ownerNamespace), next),
  });
  const sessions = registry.data ? activeSoloSessions(registry.data) : [];

  if (registry.isPending) return <p>Checking saved Solo games…</p>;
  if (registry.isError) {
    return (
      <div className="data-row">
        <strong>Solo saves need attention</strong>
        <button type="button" onClick={() => void registry.refetch()}>
          RETRY
        </button>
      </div>
    );
  }
  if (sessions.length === 0) {
    return compact ? <span>No active Solo games</span> : <p>No active Solo games yet.</p>;
  }

  if (compact) {
    return (
      <div className="active-solo-compact" aria-label="Active Solo games">
        {sessions.map((session) => (
          <Link key={session.id} href={session.resumeHref as Route}>
            {session.lane === 'daily' ? 'Daily' : 'Practice'} ·{' '}
            {session.settings.mode.toUpperCase()} · {session.settings.length} letters ·{' '}
            {session.acceptedGuesses} accepted
          </Link>
        ))}
        <Link href="/play/solo">Manage Solo games</Link>
      </div>
    );
  }

  return (
    <div className="data-list active-solo-list" aria-label="Active Solo games">
      {sessions.map((session) => (
        <div className="data-row" key={session.id}>
          <div>
            <strong>
              {session.lane === 'daily' ? `Daily ${session.localDate ?? ''}` : 'Practice'} ·{' '}
              {session.settings.mode.toUpperCase()}
            </strong>
            <span>
              {session.settings.length} letters · {session.settings.difficulty}
              {session.settings.hardMode ? ' · Hard Mode' : ''} · {session.acceptedGuesses} accepted
              {session.settings.mode === 'go'
                ? ` · puzzle ${Math.min(session.puzzleIndex + 1, session.settings.goCount)}/${session.settings.goCount}`
                : ''}
            </span>
            {session.lifecycle === 'conflict' && (
              <span role="status">This offline session exceeded the category limit.</span>
            )}
          </div>
          <div className="action-row">
            {session.lifecycle !== 'conflict' && (
              <Link className="button primary" href={session.resumeHref as Route}>
                RESUME
              </Link>
            )}
            <button
              type="button"
              disabled={abandon.isPending}
              onClick={() => abandon.mutate(session.id)}
            >
              ABANDON
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
