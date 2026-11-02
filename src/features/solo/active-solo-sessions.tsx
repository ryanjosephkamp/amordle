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
    <div className="table-scroll">
      <table className="responsive-table solo-session-table">
        <caption className="sr-only">Active Solo games</caption>
        <thead>
          <tr>
            <th scope="col">Lane</th>
            <th scope="col">Mode</th>
            <th scope="col">Setup</th>
            <th scope="col">Progress</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id}>
              <td data-label="Lane">
                {session.lane === 'daily' ? 'Daily' : 'Practice'}
                {session.lane === 'daily' && session.localDate ? (
                  <span className="solo-session-note">{session.localDate}</span>
                ) : null}
              </td>
              <td data-label="Mode">{session.settings.mode.toUpperCase()}</td>
              <td data-label="Setup">
                {session.settings.length} letters · {session.settings.difficulty}
                {session.settings.hardMode ? ' · Hard Mode' : ''}
              </td>
              <td data-label="Progress">
                {session.acceptedGuesses} accepted
                {session.settings.mode === 'go' ? (
                  <span className="solo-session-note">
                    puzzle {Math.min(session.puzzleIndex + 1, session.settings.goCount)}/
                    {session.settings.goCount}
                  </span>
                ) : null}
                {session.lifecycle === 'conflict' && (
                  <span className="solo-session-note" role="status">
                    This offline session exceeded the category limit.
                  </span>
                )}
              </td>
              <td data-label="Actions">
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
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
