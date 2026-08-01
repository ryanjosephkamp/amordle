'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getEconomy, loadHistory, loadProgress } from '@/adapters/supabase/account';
import { listActiveCombat, listLegacyActive } from '@/adapters/supabase/combat';
import {
  readCombatAttentionProjection,
  writeCombatAttentionProjection,
} from '@/adapters/session-combat';
import type { CombatAttentionProjection } from '@/adapters/session-combat';
import { accountEconomyNamespace, economyQueryKey } from '@/application/query-keys';
import { useAuth } from '@/components/providers';
import { SkeletonRows } from '@/components/route-states';

export function HomeAttention() {
  const auth = useAuth();
  const [mounted, setMounted] = useState(false);
  const [provisionalCombat, setProvisionalCombat] = useState<CombatAttentionProjection | null>(
    null,
  );
  const userId = auth.user?.id ?? '';
  const enabled = Boolean(userId);
  const economy = useQuery({
    queryKey: economyQueryKey(accountEconomyNamespace(userId)),
    queryFn: getEconomy,
    enabled,
  });
  const progress = useQuery({
    queryKey: ['progress', userId],
    queryFn: () => loadProgress(userId),
    enabled,
  });
  const history = useQuery({
    queryKey: ['history', userId],
    queryFn: () => loadHistory(userId),
    enabled,
  });
  const combat = useQuery({
    queryKey: ['combat', 'home-attention', userId],
    queryFn: async () => {
      // Read the participant-authorized projection before the separate legacy
      // waiting lane, then persist only a display-only same-account summary.
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
    enabled,
    refetchInterval: 30_000,
  });
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);
  useEffect(() => {
    queueMicrotask(() => {
      if (!userId) {
        setProvisionalCombat(null);
        return;
      }
      const cached = readCombatAttentionProjection(userId);
      setProvisionalCombat(cached.status === 'valid' ? cached.projection : null);
    });
  }, [userId]);
  if (!mounted || auth.status === 'loading') {
    return <SkeletonRows label="Checking your current games…" rows={2} />;
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
  const queries = [economy, progress, history, combat];
  if (queries.every((query) => query.isPending)) {
    return <SkeletonRows label="Restoring account activity…" rows={3} />;
  }
  const active = combat.data
    ? combat.data.authoritative.length + combat.data.legacy.length
    : (provisionalCombat?.games.length ?? 0);
  const recent = history.data?.[0];
  const progressionUnavailable = economy.isError || progress.isError;
  const combatUnavailable = combat.isError && !provisionalCombat;
  return (
    <div className="data-list">
      <div className="data-row">
        <strong>Progression</strong>
        {progressionUnavailable ? (
          <span>Refresh unavailable</span>
        ) : progress.data && economy.data ? (
          <span>
            Level {progress.data.level} · {progress.data.xp} XP · {economy.data.coins} coins
          </span>
        ) : (
          <span>Loading…</span>
        )}
      </div>
      <div className="data-row">
        <strong>COMBAT attention</strong>
        {combatUnavailable ? (
          <span>Refresh unavailable</span>
        ) : active ? (
          <Link href="/combat/active">
            {active} active {active === 1 ? 'game' : 'games'}
            {!combat.data && provisionalCombat ? ' · checking latest' : ''}
          </Link>
        ) : (
          <span>No active games</span>
        )}
      </div>
      <div className="data-row">
        <strong>Recent result</strong>
        {history.isError ? (
          <span>Refresh unavailable</span>
        ) : recent ? (
          <Link href="/history">
            {recent.entry.kind.replaceAll('-', ' ')} · {recent.entry.result}
          </Link>
        ) : (
          <span>No completed account games yet</span>
        )}
      </div>
      {queries.some((query) => query.isError) && (
        <div className="data-row">
          <strong>Some account details need attention</strong>
          <button
            type="button"
            onClick={() => {
              for (const query of queries) {
                if (query.isError) void query.refetch();
              }
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
