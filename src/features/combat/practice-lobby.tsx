'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { PublicPracticeLobby } from '@/adapters/supabase/combat';
import { operationId } from '@/adapters/supabase/shared';
import {
  normalizeRankedPracticeConfig,
  readRankedPracticeQueueIntent,
  removeRankedPracticeQueueIntent,
  writeRankedPracticeQueueIntent,
} from '@/adapters/session-combat';
import type { RankedPracticeQueueIntent } from '@/adapters/session-combat';
import { PlayerIdentityLink } from '@/components/player-identity-link';
import { useAuth } from '@/components/providers';
import { AccountGate } from '@/components/route-states';
import type { Difficulty } from '@/domain/game';
import { rankedPracticeQueueTransition, sameRankedPracticeConfig } from '@/domain/multiplayer';
import type { RankedPracticeConfig, RankedPracticeQueuePhase } from '@/domain/multiplayer';

interface Props {
  length: number;
  /** v8-A5. Arrive already searching, for SEARCH AGAIN at the end of a ranked match. */
  autoQueueRanked?: boolean;
}

export function PracticeLobby(props: Props) {
  return (
    <AccountGate>
      <PracticeLobbyInner {...props} />
    </AccountGate>
  );
}

function PracticeLobbyInner({ length: routeLength, autoQueueRanked = false }: Props) {
  const auth = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  /*
   * C2. Word length was route-derived only, so the sole way to change it was a link that
   * reloaded the page. It is now an editable field seeded from the route, with the route
   * kept in step on commit rather than on every keystroke — the URL is what the ranked
   * search-recovery path compares against after a reload, so it has to record the length
   * a search was actually created at.
   *
   * The draft is held as a string because an `<input type="number">` legitimately passes
   * through states that are not numbers: clearing it yields '' (Number('') === 0) and a
   * lone '-' yields NaN. Either would reach `normalizeRankedPracticeConfig`, which is a
   * zod `.parse` running inside a `useMemo` during render — it throws, and the error
   * boundary blanks the page. Solo has no such parse, which is why it can be naive here.
   */
  const [wordLengthDraft, setWordLengthDraft] = useState(String(routeLength));
  /*
   * Reseed when the route changes, so inbound links still set the field — SEARCH AGAIN,
   * "Return to this ranked search", and the legacy bridges all arrive as a new prop on a
   * component that is already mounted. Adjusting during render rather than in an effect
   * is React's own pattern for this, and a `key` remount is wrong here: it would also
   * throw away the mode, difficulty and clock the player had already chosen.
   */
  const [seededFrom, setSeededFrom] = useState(routeLength);
  if (seededFrom !== routeLength) {
    setSeededFrom(routeLength);
    setWordLengthDraft(String(routeLength));
  }
  const parsedWordLength = Number(wordLengthDraft);
  const wordLengthValid =
    Number.isInteger(parsedWordLength) && parsedWordLength >= 2 && parsedWordLength <= 35;
  const wordLength = wordLengthValid ? parsedWordLength : routeLength;
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

  // `wordLength` is already clamped to the route value while the draft is invalid, so
  // this parse cannot throw mid-typing.
  const currentConfig = useMemo<RankedPracticeConfig>(
    () =>
      normalizeRankedPracticeConfig({
        mode,
        wordLength,
        difficulty,
        hardMode,
        goPuzzleCount: mode === 'go' ? goCount : null,
        timeLimitMs,
      }),
    [difficulty, goCount, hardMode, mode, timeLimitMs, wordLength],
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
    if (restored.intent.config.wordLength !== routeLength) {
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
  }, [auth.user?.id, routeLength]);

  const lobbies = useQuery({
    queryKey: ['combat', 'practice', 'unranked', auth.user?.id],
    queryFn: listUnrankedPractice,
    enabled: Boolean(auth.user?.id),
    refetchInterval: 5_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const userId = auth.user?.id;
      if (!userId) throw new Error('Sign in first.');
      return createUnrankedPractice({
        mode,
        wordLength,
        difficulty,
        hardMode,
        goPuzzleCount: mode === 'go' ? goCount : null,
        timeLimitMs,
        creationKey: operationId('public-practice-create'),
      });
    },
    onSuccess: (row) => {
      void invalidateCombat();
      router.push(`/combat/match/${row.id}`);
    },
    onError: () => setMessage('The public match could not be created.'),
  });

  const join = useMutation({
    mutationFn: async (lobby: PublicPracticeLobby) => {
      const userId = auth.user?.id;
      if (!userId) throw new Error('Sign in first.');
      return joinUnrankedPractice(lobby, operationId('public-practice-join'));
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

  /*
   * The ranked search poll.
   *
   * This was a one-shot `setTimeout` that re-armed only as a side effect of dependency
   * churn: firing the mutation flipped `isPending`, which re-ran the effect, which
   * scheduled the next timeout. It also refused to fire while the tab was hidden — and
   * that combination is a permanent stall, because refusing to fire changes no state, so
   * nothing re-runs the effect and no further timer is ever scheduled.
   *
   * That is the reported bug exactly. The player who creates a ranked search switches to
   * their opponent's window, their tab goes hidden, one tick is skipped, and their search
   * is dead until the component remounts — which is why a refresh "fixed" it. The joiner
   * never saw it because `claim_amordle_ranked_practice_v2` returns the game id
   * synchronously; only the waiter has to discover the match by polling.
   *
   * The server was never at fault: the claim stamps BOTH queue rows with `status='matched'`
   * and the game id in one transaction.
   *
   * A real interval driven through refs, exactly as the ranked-Daily lobby already does —
   * which is why Daily never had this bug. Nothing is gated on visibility any more, and a
   * `visibilitychange` listener polls immediately on return so coming back to the tab is
   * instant rather than waiting out a tick that a hidden tab may have throttled to a minute.
   */
  const rankedPoll = useRef(ranked.mutate);
  const rankedPollPending = useRef(ranked.isPending);
  useEffect(() => {
    rankedPoll.current = ranked.mutate;
    rankedPollPending.current = ranked.isPending;
  }, [ranked.isPending, ranked.mutate]);

  /*
   * v8-A5. SEARCH AGAIN, honouring its own label.
   *
   * The old button of that name navigated to this form and stopped, which is not what
   * "search again" means to anyone reading it. It now arrives with `?requeue=1` and starts
   * the search on landing.
   *
   * Fires once per mount and only when there is nothing already in flight, so it can never
   * fight the restore effect above — a player who still has a live search recovers that one
   * instead of stacking a second against the five-request cap.
   */
  const autoQueued = useRef(false);
  useEffect(() => {
    if (!autoQueueRanked || autoQueued.current) return;
    if (!auth.user?.id || queue || queuePhase !== 'idle') return;
    autoQueued.current = true;
    rankedPoll.current(null);
  }, [auth.user?.id, autoQueueRanked, queue, queuePhase]);

  const pollableQueue =
    queue &&
    queue.config.wordLength === wordLength &&
    ['queued', 'conflict', 'failed'].includes(queuePhase)
      ? queue
      : null;

  useEffect(() => {
    if (!pollableQueue) return;
    const poll = () => {
      if (!rankedPollPending.current) rankedPoll.current(pollableQueue);
    };
    const pollOnReturn = () => {
      if (document.visibilityState === 'visible') poll();
    };
    const timer = window.setInterval(poll, 5_000);
    document.addEventListener('visibilitychange', pollOnReturn);
    window.addEventListener('online', pollOnReturn);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', pollOnReturn);
      window.removeEventListener('online', pollOnReturn);
    };
  }, [pollableQueue]);

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
    () => lobbies.data?.filter((row) => !row.capabilities.canCancel) ?? [],
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
              aria-label="Mode"
              value={mode}
              disabled={Boolean(queue)}
              onChange={(event) => setMode(event.target.value as 'og' | 'go')}
            >
              <option value="og">OG</option>
              <option value="go">GO</option>
            </select>
          </label>
          {/*
           * C2. Same control as Solo setup, in the same place relative to Mode and
           * Difficulty, so the two setup screens read the same way. The implicit label
           * gives it the accessible name "Word length", matching how the private
           * challenge form's equivalent is already targeted.
           */}
          <label>
            Word length
            <input
              type="number"
              min={2}
              max={35}
              step={1}
              value={wordLengthDraft}
              disabled={Boolean(queue)}
              aria-invalid={wordLengthValid ? undefined : true}
              onChange={(event) => setWordLengthDraft(event.target.value)}
              onBlur={() => {
                // Commit to the route only once the value settles, and only when there
                // is no search to disturb — the restore effect keys on the route and
                // clears the queue before reading storage.
                if (wordLengthValid && !queue && parsedWordLength !== routeLength) {
                  router.replace(`/combat/practice?length=${parsedWordLength}`);
                }
              }}
            />
          </label>
          {!wordLengthValid && <p className="field-error">Word length must be from 2 to 35.</p>}
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
          <div className="action-row">
            <button
              className="primary"
              disabled={create.isPending || Boolean(queue) || !wordLengthValid}
            >
              {create.isPending ? 'Creating…' : 'Create public unranked'}
            </button>
            <button
              type="button"
              disabled={ranked.isPending || Boolean(queue) || !wordLengthValid}
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
          {queue && queue.config.wordLength !== wordLength && (
            <Link href={`/combat/practice?length=${queue.config.wordLength}`}>
              Return to this ranked search
            </Link>
          )}
        </form>
        <p aria-live="polite">{message}</p>
      </section>
      {/*
       * B1. `.open-lobbies` is the only element declaring `container-type: inline-size`,
       * which the `.lobby-row` container query below 42rem depends on. Without it the
       * row would stay two-column at every width.
       */}
      <section className="open-lobbies" aria-labelledby="open-practice-heading">
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
              <div className="data-row lobby-row" data-game-id={row.id} key={row.id}>
                <div className="lobby-row-summary">
                  <strong>
                    {/*
                     * B1. The same row shape the "Open public games" list already uses.
                     * PlayerIdentityLink links only when the projection carries a
                     * sanctioned public profile id, and degrades to plain text
                     * otherwise, so the privacy rule holds without a check here.
                     */}
                    <PlayerIdentityLink
                      publicProfileId={row.owner.publicProfileId}
                      displayName={row.owner.displayName || 'Open Practice player'}
                    />
                  </strong>
                  <p>
                    Practice · {row.mode.toUpperCase()} · {row.wordLength} letters ·{' '}
                    {row.difficulty}
                    {row.hardMode ? ' · Hard Mode' : ''}
                    {row.timeLimitMs === 300_000 ? ' · 5:00 per player' : ' · untimed'}
                  </p>
                </div>
                <button disabled={join.isPending} onClick={() => join.mutate(row)}>
                  Join
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="prose">No other player is waiting. Create the first match.</p>
        )}
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
