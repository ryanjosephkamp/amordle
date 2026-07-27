'use client';

import { useQuery } from '@tanstack/react-query';
import { loadHistory } from '@/adapters/supabase/account';
import { AccountGate } from '@/components/route-states';
import { useAuth } from '@/components/providers';

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
    queryFn: () => loadHistory(userId),
    enabled: Boolean(userId),
  });
  if (history.isPending) return <p aria-live="polite">Loading History…</p>;
  if (history.isError) {
    return (
      <section className="status-panel">
        <h2>History unavailable</h2>
        <button onClick={() => void history.refetch()}>Try again</button>
      </section>
    );
  }
  if (!history.data.length) {
    return <p className="prose">Completed signed-in games will appear here.</p>;
  }
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Game</th>
            <th>Result</th>
            <th>Progress</th>
            <th>Reward</th>
          </tr>
        </thead>
        <tbody>
          {history.data.map((row) => (
            <tr key={row.id}>
              <td>{new Date(row.completed_at).toLocaleDateString()}</td>
              <td>
                {row.entry.kind.replaceAll('-', ' ')} · {row.entry.mode.toUpperCase()}
              </td>
              <td>{row.entry.result}</td>
              <td>
                {row.entry.puzzlesSolved} solved · {row.entry.acceptedGuesses} guesses
              </td>
              <td>
                {row.entry.rewardCoins} coins · {row.entry.rewardXp} XP
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
