'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { listActiveCombat, listLegacyActive } from '@/adapters/supabase/combat';
import { useAuth } from '@/components/providers';
import { AccountGate } from '@/components/route-states';

export function ActiveGames() {
  return (
    <AccountGate>
      <ActiveGamesInner />
    </AccountGate>
  );
}

function ActiveGamesInner() {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const active = useQuery({
    queryKey: ['combat', 'active', userId],
    queryFn: async () => {
      const [authoritative, legacy] = await Promise.all([
        listActiveCombat(),
        listLegacyActive(userId),
      ]);
      return { authoritative, legacy };
    },
    enabled: Boolean(userId),
    refetchInterval: 30_000,
  });
  if (active.isPending) return <p aria-live="polite">Loading active games…</p>;
  if (active.isError || !active.data) {
    return (
      <section className="status-panel">
        <h2>Active games unavailable</h2>
        <button onClick={() => void active.refetch()}>Try again</button>
      </section>
    );
  }
  const count = active.data.authoritative.length + active.data.legacy.length;
  if (!count) return <p className="prose">You have no current or recent COMBAT games.</p>;
  return (
    <div className="data-list">
      {active.data.authoritative.map((game) => (
        <div className="data-row" key={game.id}>
          <div>
            <strong>
              {game.ranked ? 'Ranked ' : ''}
              {game.scope} {game.mode.toUpperCase()}
            </strong>
            <p>
              {game.status} · {game.wordLength} letters · move {game.moveCount}
            </p>
          </div>
          <Link className="button" href={`/combat/match/${game.id}`}>
            {game.outcome.terminal ? 'Result' : 'Resume'}
          </Link>
        </div>
      ))}
      {active.data.legacy.map((row) => (
        <div className="data-row" key={row.id}>
          <div>
            <strong>Public Practice {row.mode.toUpperCase()}</strong>
            <p>
              {row.status} · {row.word_length} letters · move {row.move_count}
            </p>
          </div>
          <Link className="button" href={`/combat/match/${row.id}`}>
            {['won', 'lost'].includes(row.status) ? 'Result' : 'Resume'}
          </Link>
        </div>
      ))}
    </div>
  );
}
