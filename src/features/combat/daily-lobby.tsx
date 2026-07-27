'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  cancelRankedDaily,
  claimRankedDaily,
  createDailyLobby,
  createRankedDaily,
  finalizeRankedDaily,
  joinDailyLobby,
  listDailyLobbies,
} from '@/adapters/supabase/combat';
import { operationId } from '@/adapters/supabase/shared';
import { useAuth } from '@/components/providers';
import { AccountGate } from '@/components/route-states';

interface RankedDailyIntent {
  userId: string;
  dailyDateKey: string;
  mode: 'og' | 'go';
  hardMode: boolean;
  requestId: string;
  matchedGameId: string;
  creationKey: string;
}

const rankedIntentKey = 'amordle:combat:ranked-daily:intent';

export function DailyLobby() {
  return (
    <AccountGate>
      <DailyLobbyInner />
    </AccountGate>
  );
}

function DailyLobbyInner() {
  const auth = useAuth();
  const [mode, setMode] = useState<'og' | 'go'>('og');
  const [hardMode, setHardMode] = useState(false);
  const [rankedIntent, setRankedIntent] = useState<RankedDailyIntent | null>(null);
  const [message, setMessage] = useState('');
  const router = useRouter();
  const queryClient = useQueryClient();
  const dailyDateKey = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const raw = sessionStorage.getItem(rankedIntentKey);
    if (!raw || !auth.user) return;
    try {
      const parsed = JSON.parse(raw) as RankedDailyIntent;
      if (parsed.userId === auth.user.id && parsed.dailyDateKey === dailyDateKey) {
        queueMicrotask(() => {
          setMode(parsed.mode);
          setHardMode(parsed.hardMode);
          setRankedIntent(parsed);
        });
      } else {
        sessionStorage.removeItem(rankedIntentKey);
      }
    } catch {
      sessionStorage.removeItem(rankedIntentKey);
    }
  }, [auth.user, dailyDateKey]);
  const lobbies = useQuery({
    queryKey: ['combat', 'daily', mode],
    queryFn: () => listDailyLobbies(mode),
    refetchInterval: 5_000,
  });
  const create = useMutation({
    mutationFn: () => createDailyLobby(mode, hardMode, operationId(`daily:${mode}`)),
    onSuccess: (game) => {
      void queryClient.invalidateQueries({ queryKey: ['combat', 'daily'] });
      router.push(`/combat/match/${game.id}`);
    },
    onError: () => setMessage('The Daily lobby could not be created.'),
  });
  const join = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      joinDailyLobby(id, version, operationId('daily-join')),
    onSuccess: (game) => router.push(`/combat/match/${game.id}`),
    onError: () => {
      setMessage('That lobby changed before you joined. The list has been refreshed.');
      void lobbies.refetch();
    },
  });
  const ranked = useMutation({
    mutationFn: async () => {
      const userId = auth.user?.id;
      if (!userId) throw new Error('Sign in first.');
      let intent = rankedIntent;
      if (!intent) {
        const creationKey = operationId(`ranked-daily:${dailyDateKey}:${mode}`);
        const created = await createRankedDaily({
          mode,
          hardMode,
          dailyDateKey,
          idempotencyKey: creationKey,
        });
        intent = {
          userId,
          dailyDateKey,
          mode,
          hardMode,
          requestId: created.request_id,
          matchedGameId: `ranked-daily-${crypto.randomUUID()}`,
          creationKey,
        };
        setRankedIntent(intent);
        sessionStorage.setItem(rankedIntentKey, JSON.stringify(intent));
      }
      const claimed = await claimRankedDaily(intent.requestId, intent.matchedGameId);
      if (claimed.request_status !== 'matched' || !claimed.matched_game_id) return null;
      const finalized = await finalizeRankedDaily(
        intent.requestId,
        claimed.matched_game_id,
        `ranked-daily-finalize:${intent.requestId}:${claimed.matched_game_id}`,
      );
      sessionStorage.removeItem(rankedIntentKey);
      setRankedIntent(null);
      return finalized.game_id;
    },
    onSuccess: (gameId) => {
      if (gameId) router.push(`/combat/match/${gameId}`);
      else setMessage('Searching the ranked Daily lane…');
    },
    onError: (error) =>
      setMessage(
        error instanceof Error
          ? `${error.message} Your same-account queue intent remains recoverable.`
          : 'Ranked Daily needs attention.',
      ),
  });
  useEffect(() => {
    if (!rankedIntent) return;
    const timer = window.setInterval(() => {
      if (new Date().toISOString().slice(0, 10) !== rankedIntent.dailyDateKey) {
        void cancelRankedDaily(rankedIntent.requestId).catch(() => undefined);
        sessionStorage.removeItem(rankedIntentKey);
        setRankedIntent(null);
        setMessage('The UTC Daily changed. Start a new search for today.');
      } else if (!ranked.isPending) {
        ranked.mutate();
      }
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [ranked, rankedIntent]);
  const cancelRanked = useMutation({
    mutationFn: async () => {
      if (rankedIntent) await cancelRankedDaily(rankedIntent.requestId);
    },
    onSuccess: () => {
      sessionStorage.removeItem(rankedIntentKey);
      setRankedIntent(null);
      setMessage('Ranked Daily search cancelled.');
    },
  });
  return (
    <div className="split-layout">
      <section className="form-panel" aria-labelledby="daily-create-heading">
        <h2 id="daily-create-heading">Today’s unranked lane</h2>
        <div className="field-stack">
          <label>
            Mode
            <select value={mode} onChange={(event) => setMode(event.target.value as 'og' | 'go')}>
              <option value="og">OG</option>
              <option value="go">GO · five puzzles</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hardMode}
              onChange={(event) => setHardMode(event.target.checked)}
            />
            Hard Mode
          </label>
          <button className="primary" disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create Daily lobby'}
          </button>
          <button
            disabled={ranked.isPending || Boolean(rankedIntent)}
            onClick={() => ranked.mutate()}
          >
            {rankedIntent ? 'Searching ranked…' : 'Find ranked Daily'}
          </button>
          {rankedIntent && (
            <button disabled={cancelRanked.isPending} onClick={() => cancelRanked.mutate()}>
              Cancel ranked search
            </button>
          )}
          <p className="mono">UTC lane · {dailyDateKey}</p>
        </div>
        <p aria-live="polite">{message}</p>
      </section>
      <section aria-labelledby="daily-open-heading">
        <div className="section-heading">
          <h2 id="daily-open-heading">Open {mode.toUpperCase()} lobbies</h2>
          <button type="button" onClick={() => void lobbies.refetch()}>
            Refresh
          </button>
        </div>
        {lobbies.isPending ? (
          <p aria-live="polite">Loading lobbies…</p>
        ) : lobbies.data?.length ? (
          <div className="data-list">
            {lobbies.data.map((lobby) => (
              <div className="data-row" key={lobby.id}>
                <div>
                  <strong>{lobby.owner.displayName}</strong>
                  <p>
                    {lobby.mode.toUpperCase()}
                    {lobby.hardMode ? ' · Hard Mode' : ''}
                  </p>
                </div>
                {lobby.capabilities.canJoin ? (
                  <button
                    disabled={join.isPending}
                    onClick={() => join.mutate({ id: lobby.id, version: lobby.version })}
                  >
                    Join
                  </button>
                ) : (
                  <span className="badge">Your lobby</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="prose">No open lobbies for this mode.</p>
        )}
      </section>
    </div>
  );
}
