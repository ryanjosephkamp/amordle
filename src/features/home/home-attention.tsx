'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { getEconomy, loadHistory, loadProgress } from '@/adapters/supabase/account';
import { listActiveCombat, listLegacyActive } from '@/adapters/supabase/combat';
import { useAuth } from '@/components/providers';

export function HomeAttention() {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const account = useQuery({
    queryKey: ['account-summary', userId],
    queryFn: async () => {
      const [economy, progress, history, combat, legacy] = await Promise.all([
        getEconomy(),
        loadProgress(userId),
        loadHistory(userId),
        listActiveCombat(),
        listLegacyActive(userId),
      ]);
      return { economy, progress, history, combat, legacy };
    },
    enabled: Boolean(userId),
    refetchInterval: 30_000,
  });
  if (auth.status === 'loading') {
    return <p aria-live="polite">Checking your current games…</p>;
  }
  if (auth.status !== 'signed-in') {
    return (
      <div className="data-list">
        <div className="data-row">
          <strong>Guest Solo</strong>
          <span>Games save on this device.</span>
        </div>
        <div className="data-row">
          <strong>Account play</strong>
          <Link href="/auth">Sign in for cloud saves and COMBAT</Link>
        </div>
      </div>
    );
  }
  if (account.isPending) return <p aria-live="polite">Restoring account attention…</p>;
  if (account.isError || !account.data) {
    return (
      <section className="status-panel">
        <h2>Account summary unavailable</h2>
        <p>Your routes remain available; this summary could not refresh.</p>
        <button onClick={() => void account.refetch()}>Try again</button>
      </section>
    );
  }
  const active =
    account.data.combat.filter((game) => !game.outcome.terminal).length +
    account.data.legacy.filter((game) => !['won', 'lost'].includes(game.status)).length;
  const recent = account.data.history[0];
  return (
    <div className="data-list">
      <div className="data-row">
        <strong>Progression</strong>
        <span>
          Level {account.data.progress.level} · {account.data.progress.xp} XP ·{' '}
          {account.data.economy.coins} coins
        </span>
      </div>
      <div className="data-row">
        <strong>COMBAT attention</strong>
        {active ? (
          <Link href="/combat/active">
            {active} active {active === 1 ? 'game' : 'games'}
          </Link>
        ) : (
          <span>No active games</span>
        )}
      </div>
      <div className="data-row">
        <strong>Recent result</strong>
        {recent ? (
          <Link href="/history">
            {recent.entry.kind.replaceAll('-', ' ')} · {recent.entry.result}
          </Link>
        ) : (
          <span>No completed account games yet</span>
        )}
      </div>
    </div>
  );
}
