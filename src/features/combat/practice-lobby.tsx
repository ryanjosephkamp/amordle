'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  cancelRankedPractice,
  claimRankedPractice,
  createRankedPractice,
  createUnrankedPractice,
  finalizeRankedPractice,
  joinUnrankedPractice,
  listUnrankedPractice,
} from '@/adapters/supabase/combat';
import { operationId } from '@/adapters/supabase/shared';
import { useAuth } from '@/components/providers';
import { AccountGate } from '@/components/route-states';
import type { Difficulty } from '@/domain/game';

interface Props {
  length: number;
  candidates: string[];
}

interface ProvisionalQueue {
  requestId: string;
  creationKey: string;
}

const provisionalKey = 'amordle:combat:ranked-practice:provisional';

export function PracticeLobby(props: Props) {
  return (
    <AccountGate>
      <PracticeLobbyInner {...props} />
    </AccountGate>
  );
}

function PracticeLobbyInner({ length, candidates }: Props) {
  const auth = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'og' | 'go'>('og');
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [hardMode, setHardMode] = useState(false);
  const [goCount, setGoCount] = useState<5 | 7 | 10>(5);
  const [queue, setQueue] = useState<ProvisionalQueue | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const raw = sessionStorage.getItem(provisionalKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as ProvisionalQueue;
      if (parsed.requestId && parsed.creationKey) {
        queueMicrotask(() => setQueue(parsed));
      }
    } catch {
      sessionStorage.removeItem(provisionalKey);
    }
  }, []);

  const lobbies = useQuery({
    queryKey: ['combat', 'practice', 'unranked', auth.user?.id],
    queryFn: () => listUnrankedPractice(auth.user?.id ?? ''),
    enabled: Boolean(auth.user?.id),
    refetchInterval: 5_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const userId = auth.user?.id;
      if (!userId) throw new Error('Sign in first.');
      if (!candidates.length) throw new Error('No answer is available for this length.');
      return createUnrankedPractice({
        userId,
        mode,
        wordLength: length,
        difficulty,
        hardMode,
        goPuzzleCount: mode === 'go' ? goCount : null,
        candidates,
      });
    },
    onSuccess: (row) => {
      void queryClient.invalidateQueries({ queryKey: ['combat'] });
      router.push(`/combat/match/${row.id}`);
    },
    onError: () => setMessage('The public match could not be created.'),
  });

  const join = useMutation({
    mutationFn: async (gameId: string) => {
      const userId = auth.user?.id;
      if (!userId) throw new Error('Sign in first.');
      return joinUnrankedPractice(gameId, userId);
    },
    onSuccess: (row) => router.push(`/combat/match/${row.id}`),
    onError: () => {
      setMessage('That match changed before you joined. The list has been refreshed.');
      void lobbies.refetch();
    },
  });

  const ranked = useMutation({
    mutationFn: async () => {
      const current = queue ?? {
        requestId: '',
        creationKey: operationId('ranked-practice-create'),
      };
      const created = current.requestId
        ? current
        : await createRankedPractice({
            mode,
            wordLength: length,
            difficulty,
            hardMode,
            goPuzzleCount: mode === 'go' ? goCount : null,
            timeLimitMs: null,
            creationKey: current.creationKey,
          }).then((result) => ({ requestId: result.requestId, creationKey: current.creationKey }));
      setQueue(created);
      sessionStorage.setItem(provisionalKey, JSON.stringify(created));
      const claimed = await claimRankedPractice(created.requestId, operationId('ranked-claim'));
      if (claimed.status === 'matched' && claimed.matchedGameId) {
        const projection = await finalizeRankedPractice(
          created.requestId,
          claimed.matchedGameId,
          operationId('ranked-finalize'),
        );
        sessionStorage.removeItem(provisionalKey);
        setQueue(null);
        return projection.id;
      }
      return null;
    },
    onSuccess: (gameId) => {
      if (gameId) router.push(`/combat/match/${gameId}`);
      else setMessage('Searching for a compatible ranked opponent…');
    },
    onError: () =>
      setMessage('Ranked matchmaking needs attention. Your request remains recoverable.'),
  });

  useEffect(() => {
    if (!queue) return;
    const timer = window.setInterval(() => {
      if (!ranked.isPending) ranked.mutate();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [queue, ranked]);

  const cancelQueue = useMutation({
    mutationFn: async () => {
      if (!queue) return;
      await cancelRankedPractice(queue.requestId, operationId('ranked-cancel'));
    },
    onSuccess: () => {
      sessionStorage.removeItem(provisionalKey);
      setQueue(null);
      setMessage('Ranked search cancelled.');
    },
  });

  const available = useMemo(
    () => lobbies.data?.filter((row) => !row.canCancel) ?? [],
    [lobbies.data],
  );

  return (
    <div className="split-layout">
      <section className="form-panel" aria-labelledby="practice-create-heading">
        <h2 id="practice-create-heading">Create or find a match</h2>
        <form
          className="field-stack"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <label>
            Mode
            <select value={mode} onChange={(event) => setMode(event.target.value as 'og' | 'go')}>
              <option value="og">OG</option>
              <option value="go">GO</option>
            </select>
          </label>
          <label>
            Difficulty
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as Difficulty)}
            >
              <option value="casual">Casual</option>
              <option value="standard">Standard</option>
              <option value="expert">Expert</option>
            </select>
          </label>
          {mode === 'go' && (
            <label>
              Puzzles
              <select
                value={goCount}
                onChange={(event) => setGoCount(Number(event.target.value) as 5 | 7 | 10)}
              >
                <option value="5">5</option>
                <option value="7">7</option>
                <option value="10">10</option>
              </select>
            </label>
          )}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hardMode}
              onChange={(event) => setHardMode(event.target.checked)}
            />
            Hard Mode
          </label>
          <p className="mono">{length} letters</p>
          <div className="action-row">
            <button className="primary" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create public unranked'}
            </button>
            <button
              type="button"
              disabled={ranked.isPending || Boolean(queue)}
              onClick={() => ranked.mutate()}
            >
              {queue ? 'Searching…' : 'Find ranked match'}
            </button>
            {queue && (
              <button
                type="button"
                disabled={cancelQueue.isPending}
                onClick={() => cancelQueue.mutate()}
              >
                Cancel search
              </button>
            )}
          </div>
        </form>
        <p aria-live="polite">{message}</p>
      </section>
      <section aria-labelledby="open-practice-heading">
        <div className="section-heading">
          <h2 id="open-practice-heading">Open public matches</h2>
          <button type="button" onClick={() => void lobbies.refetch()}>
            Refresh
          </button>
        </div>
        {lobbies.isPending ? (
          <p aria-live="polite">Loading matches…</p>
        ) : available.length ? (
          <div className="data-list">
            {available.map((row) => (
              <div className="data-row" data-game-id={row.id} key={row.id}>
                <div>
                  <strong>
                    {row.mode.toUpperCase()} · {row.word_length} letters
                  </strong>
                  <p>
                    {row.difficulty}
                    {row.hard_mode ? ' · Hard Mode' : ''}
                  </p>
                </div>
                <button disabled={join.isPending} onClick={() => join.mutate(row.id)}>
                  Join
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="prose">No other player is waiting. Create the first match.</p>
        )}
        <p className="prose">
          <Link href={`/combat/practice?length=${length === 5 ? 7 : 5}`}>Change word length</Link>
        </p>
      </section>
    </div>
  );
}
