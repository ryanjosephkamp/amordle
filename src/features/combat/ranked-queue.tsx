'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import {
  cancelRankedPractice,
  claimRankedPractice,
  createRankedPractice,
  finalizeRankedPractice,
  getRankedPracticeStatus,
} from '@/adapters/supabase/combat';
import {
  readRankedQueueIntent,
  removeRankedQueueIntent,
  writeRankedQueueIntent,
} from '@/adapters/durable-combat';
import { operationId, ServiceError } from '@/adapters/supabase/shared';
import type { RankedPracticeQueueIntent } from '@/adapters/session-combat';
import { useAuth } from '@/components/providers';
import { rankedPracticeQueueTransition, sameRankedPracticeConfig } from '@/domain/multiplayer';
import type { RankedPracticeConfig, RankedPracticeQueuePhase } from '@/domain/multiplayer';

/*
 * v8-B1. One ranked search, owned by the application rather than by a page.
 *
 * Cycle A fixed the poll itself; it was still a property of the Practice lobby, so
 * navigating anywhere else stopped it. This lifts the whole search — intent, poll,
 * claim, finalize, cancel — into a provider mounted for the entire shell, and moves
 * the intent onto the durable account-scoped envelope store. A search now survives
 * navigation, a reload, and a second tab.
 *
 * There is deliberately exactly ONE poller. The lobby no longer owns a timer; it
 * reads this context and drives it. Two pollers against the same request would both
 * be safe — the claim and finalize action ids live in the shared intent, so the RPCs
 * are idempotent — but they would race on the resulting navigation and double the
 * request rate for nothing.
 *
 * Two tabs each run their own provider and therefore do poll twice. That is safe for
 * the same reason: both read the same durable intent and therefore send the same
 * action ids, so the server treats the second call as a replay of the first.
 */

const POLL_INTERVAL_MS = 5_000;

/*
 * v8.1-C2. Where a found match opens itself.
 *
 * This used to be a `startsWith('/combat/practice')` test, which meant the portal at
 * `/combat` — the page whose whole purpose is a button that says "find me a game" — was
 * the one place a match did NOT open. The player pressed a time control, a match was
 * made, and nothing visibly happened beyond a small strip in the corner.
 *
 * Both waiting rooms qualify; nothing else does. In particular it must never fire on
 * `/combat/match/...`, where the player is already in a game and being moved out of it
 * would be indefensible.
 */
function autoOpensMatch(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === '/combat' || pathname.startsWith('/combat/practice');
}

/*
 * v8.1-C3. The limits, said out loud.
 *
 * The authority raises `COMBAT_LIMIT` with a detail naming which one was hit. Without
 * this map every case collapsed into "matchmaking needs attention", which told a player
 * with ten games in progress nothing they could act on.
 */
function limitMessage(detail: string | undefined): string | null {
  if (!detail?.startsWith('COMBAT_LIMIT')) return null;
  if (detail === 'COMBAT_LIMIT_BUCKET') {
    return 'You already have a ranked game at this time control. Finish it before starting another.';
  }
  if (detail === 'COMBAT_LIMIT_CORRESPONDENCE') {
    return 'You have five correspondence games in progress. Finish or forfeit one to start another.';
  }
  if (detail === 'COMBAT_LIMIT_TIMED') {
    return 'You have five timed games in progress. Finish or forfeit one to start another.';
  }
  return 'You have ten games in progress, which is the limit. Finish or forfeit one to start another.';
}

export interface RankedQueueValue {
  /** False until the durable intent has been read, so callers never flash "no search". */
  hydrated: boolean;
  phase: RankedPracticeQueuePhase;
  intent: RankedPracticeQueueIntent | null;
  /** Set once, when a search resolves to a game, so a banner can offer the link. */
  matchedGameId: string | null;
  message: string;
  isBusy: boolean;
  start: (config: RankedPracticeConfig) => void;
  poll: () => void;
  cancel: () => void;
  /** Dismiss a matched or terminal banner without touching the server. */
  acknowledge: () => void;
}

const idleValue: RankedQueueValue = {
  hydrated: false,
  phase: 'idle',
  intent: null,
  matchedGameId: null,
  message: '',
  isBusy: false,
  start: () => undefined,
  poll: () => undefined,
  cancel: () => undefined,
  acknowledge: () => undefined,
};

const RankedQueueContext = createContext<RankedQueueValue>(idleValue);

export function useRankedQueue(): RankedQueueValue {
  return useContext(RankedQueueContext);
}

export function queuePhaseMessage(phase: RankedPracticeQueuePhase): string {
  if (phase === 'queued') return 'Searching for a ranked opponent…';
  if (phase === 'matched') return 'Ranked match ready.';
  if (phase === 'cancelled') return 'Ranked search cancelled.';
  if (phase === 'expired') return 'Ranked search expired.';
  if (phase === 'conflict') {
    return 'The ranked search changed. Reread its authoritative status or cancel it.';
  }
  if (phase === 'failed') {
    return 'Ranked matchmaking needs attention. Your account-scoped request remains recoverable.';
  }
  return '';
}

export function RankedQueueProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const userId = auth.user?.id ?? '';

  const [hydrated, setHydrated] = useState(false);
  const [intent, setIntent] = useState<RankedPracticeQueueIntent | null>(null);
  const [phase, setPhase] = useState<RankedPracticeQueuePhase>('idle');
  const [matchedGameId, setMatchedGameId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  /*
   * Clear everything the instant the account changes, during render rather than in an
   * effect. One player's live search must never be visible to the next, and an effect
   * would leave a committed frame in which it was — including the cancel button, which
   * would then act on a request the signed-in account does not own.
   */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (loadedFor !== null && loadedFor !== userId) {
    setLoadedFor(null);
    setHydrated(false);
    setIntent(null);
    setPhase('idle');
    setMatchedGameId(null);
    setMessage('');
  } else if (loadedFor === null && !userId) {
    // A signed-out visitor has nothing durable to read, so hydration is immediate and
    // the effect below never has to run for them.
    setLoadedFor('');
    setHydrated(true);
  }

  /*
   * Auto-navigation is limited to the lobby. Yanking a player out of a Solo game or a
   * Help page because a background search resolved is hostile; everywhere else the
   * match announces itself and waits to be clicked.
   */
  const onLobbyRoute = useRef(false);
  useEffect(() => {
    onLobbyRoute.current = autoOpensMatch(pathname);
  }, [pathname]);

  const invalidateCombat = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['combat'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]),
    [queryClient],
  );

  useEffect(() => {
    if (!userId || loadedFor === userId) return;
    let active = true;
    const settle = () => {
      if (!active) return;
      setLoadedFor(userId);
      setHydrated(true);
    };
    void readRankedQueueIntent(userId)
      .then((restored) => {
        if (!active) return;
        if (restored.status === 'valid') {
          setIntent(restored.intent);
          setPhase('queued');
          setMessage(queuePhaseMessage('queued'));
        } else if (restored.status === 'corrupt') {
          setMessage('A damaged ranked search record was discarded. You can start a new search.');
        }
      })
      .catch(() => undefined)
      .finally(settle);
    return () => {
      active = false;
    };
  }, [loadedFor, userId]);

  const advance = useMutation({
    mutationFn: async (input: {
      existing: RankedPracticeQueueIntent | null;
      config: RankedPracticeConfig | null;
    }) => {
      if (!userId) throw new Error('Sign in first.');
      let next = input.existing;
      let status;
      if (!next) {
        if (!input.config) throw new Error('A ranked search needs a configuration.');
        const creationKey = operationId('ranked-practice-create');
        const created = await createRankedPractice({ ...input.config, creationKey });
        next = {
          schemaVersion: 2,
          ownerUserId: userId,
          requestId: created.requestId,
          creationKey,
          claimActionId: operationId('ranked-practice-claim'),
          finalizeActionId: operationId('ranked-practice-finalize'),
          createdAt: new Date().toISOString(),
          config: input.config,
        };
        await writeRankedQueueIntent(next);
        status = created;
      } else {
        if (next.ownerUserId !== userId) {
          throw new Error('This ranked search belongs to another account.');
        }
        if (input.config && !sameRankedPracticeConfig(next.config, input.config)) {
          throw new Error('This ranked search belongs to another configuration.');
        }
        status = await getRankedPracticeStatus(next.requestId);
      }

      if (status.status === 'queued') {
        status = await claimRankedPractice(next.requestId, next.claimActionId);
      }
      const transition = rankedPracticeQueueTransition(status.status);
      if (transition.shouldFinalize) {
        if (!status.matchedGameId) {
          throw new Error('The match reservation is missing its game identifier.');
        }
        const projection = await finalizeRankedPractice(
          next.requestId,
          status.matchedGameId,
          next.finalizeActionId,
        );
        return { intent: next, transition, gameId: projection.id };
      }
      return { intent: next, transition, gameId: null };
    },
    onMutate: ({ existing }) => {
      if (!existing) {
        setPhase('queued');
        setMessage(queuePhaseMessage('queued'));
      }
    },
    onSuccess: ({ gameId, intent: settled, transition }) => {
      if (auth.user?.id !== settled.ownerUserId) return;
      void invalidateCombat();
      setIntent(settled);
      setPhase(transition.phase);
      if (gameId) {
        void removeRankedQueueIntent(settled.ownerUserId).catch(() => undefined);
        setIntent(null);
        setMatchedGameId(gameId);
        setMessage(queuePhaseMessage('matched'));
        if (onLobbyRoute.current) router.push(`/combat/match/${gameId}`);
        return;
      }
      if (transition.shouldClearIntent) {
        void removeRankedQueueIntent(settled.ownerUserId).catch(() => undefined);
        setIntent(null);
      }
      setMessage(queuePhaseMessage(transition.phase));
    },
    onError: (error) => {
      /*
       * v8.1-C3. A limit is not a malfunction, so it does not get the malfunction copy.
       * It is reported as `failed` because the search genuinely cannot proceed, but with
       * a sentence that names the limit and the way past it.
       */
      const limit = error instanceof ServiceError ? limitMessage(error.detail) : null;
      if (limit) {
        setPhase('failed');
        setMessage(limit);
        return;
      }
      const conflict =
        error instanceof Error &&
        /conflict|stale|version|configuration|another account/i.test(error.message);
      setPhase(conflict ? 'conflict' : 'failed');
      setMessage(queuePhaseMessage(conflict ? 'conflict' : 'failed'));
    },
  });

  /*
   * v8.1-C1. Where a switch is remembered while the old search is being cancelled.
   *
   * Pressing a second time control used to mint a second queue request and abandon the
   * first — which stayed `queued` on the server, kept counting against the five-request
   * cap, and, because the authority pairs candidates oldest-first, could be matched by an
   * opponent while no client was watching it. That is a game neither player can reach.
   *
   * A switch is therefore cancel-then-create, never create-then-forget.
   */
  const pendingSwitch = useRef<RankedPracticeConfig | null>(null);

  const cancelSearch = useMutation({
    mutationFn: async (current: RankedPracticeQueueIntent) =>
      cancelRankedPractice(current.requestId, operationId('ranked-practice-cancel')),
    onSuccess: (status) => {
      if (intent) void removeRankedQueueIntent(intent.ownerUserId).catch(() => undefined);
      setIntent(null);
      const queued = pendingSwitch.current;
      pendingSwitch.current = null;
      if (queued) {
        setPhase('queued');
        setMessage(queuePhaseMessage('queued'));
        advanceRef.current({ existing: null, config: queued });
        return;
      }
      const next = status?.status === 'expired' ? 'expired' : 'cancelled';
      setPhase(next);
      setMessage(queuePhaseMessage(next));
      void invalidateCombat();
    },
    onError: () => {
      pendingSwitch.current = null;
      setPhase('failed');
      setMessage('The cancel request needs attention. The ranked search remains recoverable.');
    },
  });

  /*
   * The poll, driven through refs so the interval survives every mutation state change.
   * Rebuilding the timer whenever `isPending` flips would drift the real cadence and, in
   * the worst case, means a tick is never reached.
   */
  const advanceRef = useRef(advance.mutate);
  const busyRef = useRef(false);
  const intentRef = useRef<RankedPracticeQueueIntent | null>(null);
  useEffect(() => {
    intentRef.current = intent;
  }, [intent]);
  useEffect(() => {
    advanceRef.current = advance.mutate;
    busyRef.current = advance.isPending || cancelSearch.isPending;
  }, [advance.isPending, advance.mutate, cancelSearch.isPending]);

  const pollable = phase === 'queued' || phase === 'conflict' || phase === 'failed' ? intent : null;

  useEffect(() => {
    if (!pollable) return;
    const poll = () => {
      if (!busyRef.current) advanceRef.current({ existing: pollable, config: null });
    };
    const pollOnReturn = () => {
      if (document.visibilityState === 'visible') poll();
    };
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', pollOnReturn);
    window.addEventListener('online', pollOnReturn);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', pollOnReturn);
      window.removeEventListener('online', pollOnReturn);
    };
  }, [pollable]);

  const start = useCallback(
    (config: RankedPracticeConfig) => {
      if (busyRef.current) return;
      setMatchedGameId(null);
      const current = intentRef.current;
      if (current) {
        // Same control pressed again while it is already running: nothing to do.
        if (sameRankedPracticeConfig(current.config, config)) return;
        pendingSwitch.current = config;
        cancelSearch.mutate(current);
        return;
      }
      advanceRef.current({ existing: null, config });
    },
    [cancelSearch],
  );

  const poll = useCallback(() => {
    if (busyRef.current || !intent) return;
    advanceRef.current({ existing: intent, config: null });
  }, [intent]);

  const cancel = useCallback(() => {
    if (!intent) return;
    cancelSearch.mutate(intent);
  }, [cancelSearch, intent]);

  const acknowledge = useCallback(() => {
    setMatchedGameId(null);
    setMessage('');
    setPhase((current) =>
      current === 'matched' || current === 'cancelled' || current === 'expired' ? 'idle' : current,
    );
  }, []);

  const value = useMemo<RankedQueueValue>(
    () => ({
      hydrated,
      phase,
      intent,
      matchedGameId,
      message,
      isBusy: advance.isPending || cancelSearch.isPending,
      start,
      poll,
      cancel,
      acknowledge,
    }),
    [
      acknowledge,
      advance.isPending,
      cancel,
      cancelSearch.isPending,
      hydrated,
      intent,
      matchedGameId,
      message,
      phase,
      poll,
      start,
    ],
  );

  return <RankedQueueContext.Provider value={value}>{children}</RankedQueueContext.Provider>;
}
