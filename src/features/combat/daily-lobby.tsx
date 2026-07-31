'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  cancelRankedDaily,
  claimRankedDaily,
  createDailyLobby,
  createRankedDaily,
  findRecoverableRankedDaily,
  finalizeRankedDaily,
  getRankedDailyStatus,
  joinDailyLobby,
  listDailyLobbies,
} from '@/adapters/supabase/combat';
import { operationId } from '@/adapters/supabase/shared';
import {
  readRankedDailyQueueIntent,
  removeRankedDailyQueueIntent,
  writeRankedDailyQueueIntent,
} from '@/adapters/session-combat';
import type { RankedDailyQueueIntent } from '@/adapters/session-combat';
import { useAuth } from '@/components/providers';
import { AccountGate } from '@/components/route-states';

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
  const [rankedIntent, setRankedIntent] = useState<RankedDailyQueueIntent | null>(null);
  const [message, setMessage] = useState('');
  const router = useRouter();
  const queryClient = useQueryClient();
  const dailyDateKey = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const userId = auth.user?.id;
    let active = true;
    queueMicrotask(() => setRankedIntent(null));
    if (!userId) return;
    const restore = async () => {
      const stored = readRankedDailyQueueIntent(userId);
      let intent = stored.status === 'valid' ? stored.intent : null;
      if (intent && intent.dailyDateKey !== dailyDateKey) {
        removeRankedDailyQueueIntent(userId);
        intent = null;
      }
      if (!intent) {
        const recovered = await findRecoverableRankedDaily(dailyDateKey);
        if (recovered) {
          intent = {
            schemaVersion: 3,
            ownerUserId: userId,
            dailyDateKey: recovered.daily_date_key,
            mode: recovered.mode,
            hardMode: recovered.hard_mode,
            requestId: recovered.id,
            matchedGameId: recovered.matched_game_id ?? `ranked-daily-${crypto.randomUUID()}`,
            creationKey: `recovered:${recovered.id}`,
            claimActionId: operationId('ranked-daily-claim'),
            finalizeActionId: operationId('ranked-daily-finalize'),
            createdAt: recovered.queued_at,
          };
          writeRankedDailyQueueIntent(intent);
        }
      }
      if (!active) return;
      if (!intent) {
        if (stored.status === 'corrupt') {
          setMessage('A damaged ranked Daily search record was discarded for this account.');
        }
        return;
      }
      setMode(intent.mode);
      setHardMode(intent.hardMode);
      setRankedIntent(intent);
      setMessage('Restored your ranked Daily search for this account and tab.');
    };
    void restore().catch(() => {
      if (active) {
        setMessage(
          'Ranked Daily recovery could not refresh. You can retry without losing the queue.',
        );
      }
    });
    return () => {
      active = false;
    };
  }, [auth.user?.id, dailyDateKey]);
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
          schemaVersion: 3,
          ownerUserId: userId,
          dailyDateKey,
          mode,
          hardMode,
          requestId: created.request_id,
          matchedGameId: `ranked-daily-${crypto.randomUUID()}`,
          creationKey,
          claimActionId: operationId('ranked-daily-claim'),
          finalizeActionId: operationId('ranked-daily-finalize'),
          createdAt: new Date().toISOString(),
        };
        setRankedIntent(intent);
        writeRankedDailyQueueIntent(intent);
      }
      if (intent.ownerUserId !== userId || intent.dailyDateKey !== dailyDateKey) {
        throw new Error('This ranked Daily search belongs to another account or UTC day.');
      }
      const status = await getRankedDailyStatus(intent.requestId);
      const matchedGameId =
        status.status === 'matched' && status.matchedGameId
          ? status.matchedGameId
          : (await claimRankedDaily(intent.requestId, intent.matchedGameId)).matched_game_id;
      if (!matchedGameId) return null;
      const finalized = await finalizeRankedDaily(
        intent.requestId,
        matchedGameId,
        intent.finalizeActionId,
      );
      removeRankedDailyQueueIntent(userId);
      setRankedIntent(null);
      return finalized.id;
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
  const pollRankedDaily = ranked.mutate;
  const rankedDailyPollPending = ranked.isPending;
  useEffect(() => {
    if (!rankedIntent) return;
    const timer = window.setInterval(() => {
      if (new Date().toISOString().slice(0, 10) !== rankedIntent.dailyDateKey) {
        void cancelRankedDaily(rankedIntent.requestId).catch(() => undefined);
        removeRankedDailyQueueIntent(rankedIntent.ownerUserId);
        setRankedIntent(null);
        setMessage('The UTC Daily changed. Start a new search for today.');
      } else if (!rankedDailyPollPending) {
        pollRankedDaily();
      }
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [pollRankedDaily, rankedDailyPollPending, rankedIntent]);
  const cancelRanked = useMutation({
    mutationFn: async () => {
      if (rankedIntent) await cancelRankedDaily(rankedIntent.requestId);
    },
    onSuccess: () => {
      if (rankedIntent) removeRankedDailyQueueIntent(rankedIntent.ownerUserId);
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
            <select
              aria-label="Mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as 'og' | 'go')}
            >
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
