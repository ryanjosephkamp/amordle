'use client';

import { useQuery } from '@tanstack/react-query';
import { loadHistoryWithDiagnostics } from '@/adapters/supabase/account';
import { loadPendingCompletions, resetCompletionOutbox } from '@/application/completion-outbox';
import { AccountGate, SkeletonRows } from '@/components/route-states';
import { useAuth } from '@/components/providers';
import { HistoryDefinitions } from '@/features/words/history-definitions';

export function HistoryPanel() {
  return (
    <AccountGate>
      <HistoryInner />
    </AccountGate>
  );
}

function HistoryInner() {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const history = useQuery({
    queryKey: ['history', userId],
    queryFn: () => loadHistoryWithDiagnostics(userId),
    enabled: Boolean(userId),
    refetchOnMount: 'always',
  });
  const pending = useQuery({
    queryKey: ['completion-outbox', userId],
    queryFn: () => loadPendingCompletions(userId),
    enabled: Boolean(userId),
    refetchOnMount: 'always',
  });
  if (history.isPending && pending.isPending) {
    return <SkeletonRows label="Loading History…" rows={5} />;
  }
  const pendingRows = pending.data ?? [];
  const pendingIds = new Set(pendingRows.map((row) => row.id));
  const byId = new Map(pendingRows.map((row) => [row.id, row]));
  for (const row of history.data?.rows ?? []) byId.set(row.id, row);
  const rows = [...byId.values()].sort((left, right) =>
    right.completed_at.localeCompare(left.completed_at),
  );
  if (history.isError && !rows.length) {
    return (
      <section className="status-panel">
        <h2>History unavailable</h2>
        <button onClick={() => void history.refetch()}>Try again</button>
      </section>
    );
  }
  if (!rows.length) {
    return <p className="prose">Completed signed-in games will appear here.</p>;
  }
  return (
    <>
      {(history.isError || pending.isError || (history.data?.failedSources ?? 0) > 0) && (
        <div className="status-line status-line--warning" role="status">
          <span>
            {pending.isError
              ? 'Saved result synchronization data could not be read safely.'
              : 'Some History sources could not refresh. Available account results are still shown.'}
          </span>
          {pending.isError && (
            <button
              className="text-action"
              onClick={() =>
                void resetCompletionOutbox(userId).then(() => {
                  void pending.refetch();
                })
              }
            >
              Reset pending sync data
            </button>
          )}
        </div>
      )}
      <div className="table-scroll">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Game</th>
              <th>Result</th>
              <th>Progress</th>
              <th>Reward</th>
              <th>Status</th>
              <th>Definitions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td data-label="Date">{new Date(row.completed_at).toLocaleDateString()}</td>
                <td data-label="Game">
                  {row.entry.kind.replaceAll('-', ' ')} · {row.entry.mode.toUpperCase()}
                </td>
                {/*
                 * W4b. Colour is carried on the cell, not on a wrapper element, so the
                 * mobile card's `::before` label is unaffected — it sets `--muted`
                 * explicitly and so keeps its own ink rather than inheriting the verdict.
                 * The word itself always remains, so colour is never the only signal.
                 */}
                <td data-label="Result" data-result={row.entry.result}>
                  {row.entry.result}
                </td>
                <td data-label="Progress">
                  {row.entry.puzzlesSolved === null
                    ? `${row.entry.acceptedGuesses} guesses`
                    : `${row.entry.puzzlesSolved} solved · ${row.entry.acceptedGuesses} guesses`}
                </td>
                <td data-label="Reward">
                  {pendingIds.has(row.id)
                    ? 'Pending confirmation'
                    : `${row.entry.rewardCoins} coins · ${row.entry.rewardXp} XP`}
                </td>
                <td data-label="Status">{pendingIds.has(row.id) ? 'Sync pending' : 'Synced'}</td>
                {/*
                 * W4a. `HistoryDefinitions` renders nothing when a v3 row happens to have
                 * no revealed answers, which left a DEFINITIONS label on the mobile card
                 * with an empty column beside it. The em-dash branch already existed for
                 * older rows; the emptiness test just has to reach it.
                 */}
                <td data-label="Definitions">
                  {row.entry.schemaVersion === 3 && row.entry.revealedAnswers.length ? (
                    <HistoryDefinitions words={row.entry.revealedAnswers} />
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
