'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { listActiveCombat, listLegacyActive } from '@/adapters/supabase/combat';
import { writeCombatAttentionProjection } from '@/adapters/session-combat';
import { PlayerIdentityLink } from '@/components/player-identity-link';
import { useAuth } from '@/components/providers';
import { AccountGate, SkeletonRows } from '@/components/route-states';

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
      const authoritative = await listActiveCombat();
      const legacy = await listLegacyActive(userId);
      writeCombatAttentionProjection({
        schemaVersion: 1,
        ownerUserId: userId,
        updatedAt: new Date().toISOString(),
        games: [
          ...authoritative.map((game) => ({
            id: game.id,
            label: `${game.ranked ? 'Ranked ' : ''}${game.scope} ${game.mode.toUpperCase()}`,
            status: game.status,
            href: `/combat/match/${game.id}`,
          })),
          ...legacy.map((game) => ({
            id: game.id,
            label: `Public Practice ${game.mode.toUpperCase()}`,
            status: game.status,
            href: `/combat/match/${game.id}`,
          })),
        ],
      });
      return { authoritative, legacy };
    },
    enabled: Boolean(userId),
    refetchInterval: () => (document.visibilityState === 'visible' ? 5_000 : false),
  });
  if (active.isPending) return <SkeletonRows label="Loading active games…" rows={4} />;
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
            <p>
              <PlayerIdentityLink
                publicProfileId={
                  game.players.find((player) => player.seat !== game.viewerSeat)?.publicProfileId
                }
                displayName={
                  game.players.find((player) => player.seat !== game.viewerSeat)?.displayName ??
                  'Private player'
                }
              />{' '}
              · {game.currentTurn === game.viewerSeat ? 'your turn' : 'waiting on rival'}
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
