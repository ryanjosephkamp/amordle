'use client';

import { useQuery } from '@tanstack/react-query';
import { loadHistory, loadProgress } from '@/adapters/supabase/account';
import { AccountGate, SkeletonRows } from '@/components/route-states';
import { useAuth } from '@/components/providers';

export function PrivateStats() {
  return (
    <AccountGate>
      <PrivateStatsInner />
    </AccountGate>
  );
}

function PrivateStatsInner() {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const progress = useQuery({
    queryKey: ['progress', userId],
    queryFn: () => loadProgress(userId),
    enabled: Boolean(userId),
  });
  const history = useQuery({
    queryKey: ['history', userId],
    queryFn: () => loadHistory(userId),
    enabled: Boolean(userId),
  });
  if (progress.isPending || history.isPending) {
    return <SkeletonRows label="Loading statistics…" rows={3} />;
  }
  if (progress.isError || history.isError || !progress.data || !history.data) {
    return (
      <section className="status-panel">
        <h2>Statistics unavailable</h2>
        <p>Your account is still available. These totals could not refresh.</p>
        <button
          onClick={() => {
            void progress.refetch();
            void history.refetch();
          }}
        >
          Try again
        </button>
      </section>
    );
  }
  const wins = history.data.filter((row) => row.entry.result === 'won').length;
  const guesses = history.data.reduce((sum, row) => sum + row.entry.acceptedGuesses, 0);
  return (
    <div className="metric-grid">
      <Metric label="Level" value={progress.data.level} />
      <Metric label="XP" value={progress.data.xp} />
      <Metric label="Daily streak" value={progress.data.dailyStreak} />
      <Metric label="Completed games" value={history.data.length} />
      <Metric label="Wins" value={wins} />
      <Metric
        label="Average guesses"
        value={history.data.length ? (guesses / history.data.length).toFixed(1) : '—'}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className="mono">{value}</strong>
    </div>
  );
}
