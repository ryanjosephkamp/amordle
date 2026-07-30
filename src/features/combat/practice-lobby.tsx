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
  getRankedPracticeStatus,
  joinUnrankedPractice,
  listUnrankedPractice,
} from '@/adapters/supabase/combat';
import { operationId } from '@/adapters/supabase/shared';
import {
  normalizeRankedPracticeConfig,
  readRankedPracticeQueueIntent,
  removeRankedPracticeQueueIntent,
  writeRankedPracticeQueueIntent,
} from '@/adapters/session-combat';
import type { RankedPracticeQueueIntent } from '@/adapters/session-combat';
import { useAuth } from '@/components/providers';
import { AccountGate } from '@/components/route-states';
import type { Difficulty } from '@/domain/game';
import { rankedPracticeQueueTransition, sameRankedPracticeConfig } from '@/domain/multiplayer';
import type { RankedPracticeConfig, RankedPracticeQueuePhase } from '@/domain/multiplayer';

interface Props {
  length: number;
  candidates: string[];
}

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
  const [timeLimitMs, setTimeLimitMs] = useState<300_000 | null>(null);
  const [queue, setQueue] = useState<RankedPracticeQueueIntent | null>(null);
  const [queuePhase, setQueuePhase] = useState<RankedPracticeQueuePhase>('idle');
  const [message, setMessage] = useState('');
  const invalidateCombat = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['combat'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);

  const currentConfig = useMemo<RankedPracticeConfig>(
    () =>
      normalizeRankedPracticeConfig({
        mode,
        wordLength: length,
        difficulty,
        hardMode,
        goPuzzleCount: mode === 'go' ? goCount : null,
        timeLimitMs,
      }),
    [difficulty, goCount, hardMode, length, mode, timeLimitMs],
  );

  useEffect(() => {
    const userId = auth.user?.id;
    queueMicrotask(() => {
      setQueue(null);
      setQueuePhase('idle');
    });
    if (!userId) return;
    const restored = readRankedPracticeQueueIntent(userId);
    if (restored.status === 'corrupt') {
      queueMicrotask(() =>
        setMessage('A damaged ranked search record was discarded. You can start a new search.'),
      );
      return;
    }
    if (restored.status !== 'valid') return;
    if (restored.intent.config.wordLength !== length) {
      queueMicrotask(() => {
        setQueue(restored.intent);
        setQueuePhase('queued');
        setMessage(
          `A ranked ${restored.intent.config.wordLength}-letter search is still recoverable on its matching Practice route.`,
        );
      });
      return;
    }
    queueMicrotask(() => {
      setMode(restored.intent.config.mode);
      setDifficulty(restored.intent.config.difficulty);
      setHardMode(restored.intent.config.hardMode);
      setGoCount(restored.intent.config.goPuzzleCount ?? 5);
      setTimeLimitMs(restored.intent.config.timeLimitMs);
      setQueue(restored.intent);
      setQueuePhase('queued');
      setMessage('Restored your ranked search for this account and tab.');
    });
  }, [auth.user?.id, length]);

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
      void invalidateCombat();
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
    onSuccess: (row) => {
      void invalidateCombat();
      router.push(`/combat/match/${row.id}`);
    },
    onError: () => {
      setMessage('That match changed before you joined. The list has been refreshed.');
      void lobbies.refetch();
    },
  });

  const ranked = useMutation({
    mutationFn: async (existing: RankedPracticeQueueIntent | null) => {
      const userId = auth.user?.id;
      if (!userId) throw new Error('Sign in first.');
      let intent = existing;
      let status;
      if (!intent) {
        const config = currentConfig;
        const creationKey = operationId('ranked-practice-create');
        const created = await createRankedPractice({
          ...config,
          creationKey,
        });
        intent = {
          schemaVersion: 2,
          ownerUserId: userId,
          requestId: created.requestId,
          creationKey,
          claimActionId: operationId('ranked-practice-claim'),
          finalizeActionId: operationId('ranked-practice-finalize'),
          createdAt: new Date().toISOString(),
          config,
        };
        setQueue(intent);
        setQueuePhase('queued');
        writeRankedPracticeQueueIntent(intent);
        status = created;
      } else {
        if (
          intent.ownerUserId !== userId ||
          !sameRankedPracticeConfig(intent.config, currentConfig)
        ) {
          throw new Error('This ranked search belongs to another account or configuration.');
        }
        status = await getRankedPracticeStatus(intent.requestId);
      }

      if (status.status === 'queued') {
        status = await claimRankedPractice(intent.requestId, intent.claimActionId);
      }
      const transition = rankedPracticeQueueTransition(status.status);
      if (transition.shouldFinalize) {
        if (!status.matchedGameId) {
          throw new Error('The match reservation is missing its game identifier.');
        }
        const projection = await finalizeRankedPractice(
          intent.requestId,
          status.matchedGameId,
          intent.finalizeActionId,
        );
        return { intent, transition, gameId: projection.id };
      }
      return { intent, transition, gameId: null };
    },
    onSuccess: ({ gameId, intent, transition }) => {
      if (auth.user?.id !== intent.ownerUserId) return;
      void invalidateCombat();
      setQueuePhase(transition.phase);
      if (gameId) {
        removeRankedPracticeQueueIntent(intent.ownerUserId);
        setQueue(null);
        router.push(`/combat/match/${gameId}`);
        return;
      }
      if (transition.shouldClearIntent) {
        removeRankedPracticeQueueIntent(intent.ownerUserId);
        setQueue(null);
      }
      setMessage(queuePhaseMessage(transition.phase));
    },
    onError: (error) => {
      const conflict =
        error instanceof Error &&
        /conflict|stale|version|configuration|another account/i.test(error.message);
      setQueuePhase(conflict ? 'conflict' : 'failed');
      setMessage(
        conflict
          ? 'The ranked search changed. Reread its authoritative status or cancel it.'
          : 'Ranked matchmaking needs attention. Your account-scoped request remains recoverable.',
      );
    },
  });

  const advanceRanked = ranked.mutate;
  useEffect(() => {
    if (!queue) return;
    if (queue.config.wordLength !== length) return;
    if (!['queued', 'conflict', 'failed'].includes(queuePhase)) return;
    const timer = window.setTimeout(() => {
      if (!ranked.isPending && document.visibilityState === 'visible') {
        advanceRanked(queue);
      }
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [advanceRanked, length, queue, queuePhase, ranked.isPending]);

  const cancelQueue = useMutation({
    mutationFn: async () => {
      if (!queue) return;
      return cancelRankedPractice(queue.requestId, operationId('ranked-practice-cancel'));
    },
    onSuccess: (status) => {
      if (queue) removeRankedPracticeQueueIntent(queue.ownerUserId);
      setQueue(null);
      setQueuePhase(status?.status === 'expired' ? 'expired' : 'cancelled');
      setMessage(
        status?.status === 'expired' ? 'Ranked search expired.' : 'Ranked search cancelled.',
      );
      void invalidateCombat();
    },
    onError: () => {
      setQueuePhase('failed');
      setMessage('The cancel request needs attention. The ranked search remains recoverable.');
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
            <select
              value={mode}
              disabled={Boolean(queue)}
              onChange={(event) => setMode(event.target.value as 'og' | 'go')}
            >
              <option value="og">OG</option>
              <option value="go">GO</option>
            </select>
          </label>
          <label>
            Difficulty
            <select
              value={difficulty}
              disabled={Boolean(queue)}
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
                disabled={Boolean(queue)}
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
              disabled={Boolean(queue)}
              onChange={(event) => setHardMode(event.target.checked)}
            />
            Hard Mode
          </label>
          <label>
            Ranked clock
            <select
              value={timeLimitMs ?? 'untimed'}
              disabled={Boolean(queue)}
              onChange={(event) => setTimeLimitMs(event.target.value === '300000' ? 300_000 : null)}
            >
              <option value="untimed">Untimed</option>
              <option value="300000">Five minutes per player</option>
            </select>
          </label>
          <p className="mono">{length} letters</p>
          <div className="action-row">
            <button className="primary" disabled={create.isPending || Boolean(queue)}>
              {create.isPending ? 'Creating…' : 'Create public unranked'}
            </button>
            <button
              type="button"
              disabled={ranked.isPending || Boolean(queue)}
              onClick={() => ranked.mutate(null)}
            >
              {queue ? queueButtonLabel(queuePhase) : 'Find ranked match'}
            </button>
            {queue && ['conflict', 'failed'].includes(queuePhase) && (
              <button
                type="button"
                disabled={ranked.isPending}
                onClick={() => ranked.mutate(queue)}
              >
                Reread status
              </button>
            )}
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
          {queue && (
            <p className="mono" role="status">
              {queue.config.mode.toUpperCase()} · {queue.config.wordLength} letters ·{' '}
              {queue.config.difficulty} ·{' '}
              {queue.config.timeLimitMs === null ? 'untimed' : '5:00 per player'}
            </p>
          )}
          {queue && queue.config.wordLength !== length && (
            <Link href={`/combat/practice?length=${queue.config.wordLength}`}>
              Return to this ranked search
            </Link>
          )}
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

function queueButtonLabel(phase: RankedPracticeQueuePhase): string {
  switch (phase) {
    case 'matched':
      return 'Opening match…';
    case 'expired':
      return 'Search expired';
    case 'cancelled':
      return 'Search cancelled';
    case 'conflict':
      return 'Status changed';
    case 'failed':
      return 'Search needs attention';
    case 'queued':
    case 'idle':
      return 'Searching…';
  }
}

function queuePhaseMessage(phase: RankedPracticeQueuePhase): string {
  switch (phase) {
    case 'expired':
      return 'Ranked search expired. Your settings are ready for a new search.';
    case 'cancelled':
      return 'Ranked search was cancelled. Your settings are ready for a new search.';
    case 'matched':
      return 'A compatible opponent was found. Opening the match…';
    case 'conflict':
      return 'The ranked search changed. Its authoritative status was restored.';
    case 'failed':
      return 'Ranked matchmaking needs attention. Your request remains recoverable.';
    case 'queued':
      return 'Searching for a compatible ranked opponent…';
    case 'idle':
      return '';
  }
}
