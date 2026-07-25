import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../app/auth-context';
import type { TileState } from '../../components/gameBoardData';
import type { KeyboardCommand } from '../../components/keyboard/keyboard-model';
import { mergeKeyboardEvidence } from '../../domain/game';
import {
  AuthoritativeCombatRepository,
  authoritativeClockRemainingMs,
  authoritativeGuessMoves,
  type AuthoritativeCombatProjection,
  type RankedPracticeSettlement,
} from '../../services/authoritative-combat-repository';
import { RealtimeReconciler } from '../../services/realtime-reconciler';
import { readSoundEnabled, soundEngine } from '../../services/sound-controller';

function commandMessage(projection: AuthoritativeCombatProjection): string {
  if (projection.status === 'holding') {
    return 'Puzzle solved and saved. Advancing after the durable evidence hold.';
  }
  if (projection.status === 'completed') {
    return projection.ranked
      ? 'Terminal result is server-owned. Ranked settlement is reconciling.'
      : 'Terminal Daily result saved. No rating mutation was attempted.';
  }
  if (projection.status === 'cancelled') {
    return 'The game was cancelled before an eligible terminal result.';
  }
  return 'Move accepted by the server. Waiting for the next participant action.';
}

export function useAuthoritativeCombatMatch(gameId: string) {
  const { client, user, identity } = useAuth();
  const queryClient = useQueryClient();
  const repository = useMemo(
    () => (client ? new AuthoritativeCombatRepository(client) : null),
    [client],
  );
  const queryKey = useMemo(
    () => ['combat', 'match', gameId, 'authoritative-v2', user?.id] as const,
    [gameId, user?.id],
  );
  const projection = useQuery({
    queryKey,
    enabled: Boolean(repository && user),
    queryFn: () => repository!.getGame(gameId),
    refetchInterval: (query) =>
      query.state.data &&
      ['playing', 'holding'].includes(query.state.data.status) &&
      document.visibilityState === 'visible'
        ? 5_000
        : 30_000,
    refetchIntervalInBackground: false,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: 'always',
    retry: 1,
  });
  const storageKey = `amordle:combat-draft:${identity.kind === 'authenticated' ? identity.userId : 'guest'}:${gameId}`;
  const [draft, setDraft] = useState(() => sessionStorage.getItem(storageKey) ?? '');
  const [message, setMessage] = useState('Loading server-authoritative COMBAT state…');
  const [saving, setSaving] = useState(false);
  const [settlement, setSettlement] = useState<RankedPracticeSettlement | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const soundEnabled = readSoundEnabled(
    identity,
    typeof localStorage === 'undefined' ? undefined : localStorage,
  );

  useEffect(() => {
    setDraft(sessionStorage.getItem(storageKey) ?? '');
  }, [storageKey]);

  useEffect(() => {
    if (!client || !user) return;
    const reconciler = new RealtimeReconciler(client, {
      channelName: `authoritative-combat-v2-${gameId}`,
      table: 'async_multiplayer_games',
      filter: `id=eq.${gameId}`,
      pollIntervalMs: 5_000,
      reconcile: async () => {
        await queryClient.invalidateQueries({ queryKey });
      },
      onError: () =>
        setMessage('Realtime invalidation changed. Durable five-second polling remains active.'),
    });
    reconciler.start();
    return () => reconciler.stop();
  }, [client, gameId, queryClient, queryKey, user]);

  const saveCommand = useCallback(
    async (input: {
      command: 'guess' | 'cancel' | 'forfeit' | 'advance' | 'timeout';
      guess?: string;
      actionId?: string;
    }) => {
      const current = projection.data;
      if (!repository || !user || !current || saving) return false;
      setSaving(true);
      try {
        const accepted = await repository.saveCommand({
          gameId,
          actionId: input.actionId ?? crypto.randomUUID(),
          expectedVersion: current.version,
          expectedMoveCount: current.moveCount,
          command: input.command,
          ...(input.guess === undefined ? {} : { guess: input.guess }),
        });
        queryClient.setQueryData(queryKey, accepted);
        setMessage(commandMessage(accepted));
        return true;
      } catch (error) {
        await projection.refetch();
        setMessage(
          error instanceof Error
            ? `${error.message} Durable state was reread before another action.`
            : 'The authoritative command failed. Durable state was reread.',
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [gameId, projection, queryClient, queryKey, repository, saving, user],
  );

  useEffect(() => {
    const current = projection.data;
    if (
      !current ||
      current.status !== 'holding' ||
      current.holdUntil === undefined ||
      current.currentTurn !== current.viewerSeat ||
      saving
    ) {
      return;
    }
    const remaining = Math.max(0, Date.parse(current.holdUntil) - Date.now());
    const timer = window.setTimeout(() => {
      void saveCommand({ command: 'advance' });
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [projection.data, saveCommand, saving]);

  useEffect(() => {
    const current = projection.data;
    if (
      !current ||
      current.status !== 'playing' ||
      current.timeLimitMs === null ||
      current.currentTurn !== current.viewerSeat ||
      saving
    ) {
      return;
    }
    const remaining = authoritativeClockRemainingMs(current, current.viewerSeat);
    if (remaining === null) return;
    const timer = window.setTimeout(() => {
      void saveCommand({ command: 'timeout' });
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [projection.data, saveCommand, saving]);

  useEffect(() => {
    const current = projection.data;
    if (
      !repository ||
      !current ||
      current.scope !== 'practice' ||
      !current.ranked ||
      current.status !== 'completed' ||
      !current.capabilities.canSettleRating ||
      settlement !== null
    ) {
      return;
    }
    let active = true;
    void repository
      .settleRankedPractice({
        gameId,
        actionId: `amordle-ranked-practice-v2:settle:${gameId}`,
      })
      .then((result) => {
        if (!active) return;
        setSettlement(result);
        setMessage(
          `Ranked result settled: ${result.oldRating} → ${result.newRating} (${result.ratingDelta >= 0 ? '+' : ''}${result.ratingDelta}).`,
        );
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : 'Ranked settlement is retrying.');
      });
    return () => {
      active = false;
    };
  }, [gameId, projection.data, repository, settlement]);

  const current = projection.data;
  useEffect(() => {
    if (
      !current ||
      current.status !== 'playing' ||
      current.timeLimitMs === null ||
      current.currentTurn === null ||
      current.currentTurn === undefined
    ) {
      return;
    }
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [current]);
  const canEdit =
    current?.status === 'playing' &&
    current.capabilities.canSubmitGuess &&
    current.currentTurn === current.viewerSeat &&
    !saving;

  useEffect(() => {
    if (current?.status === 'completed' || current?.status === 'cancelled') {
      sessionStorage.removeItem(storageKey);
      setDraft('');
    }
  }, [current?.status, storageKey]);

  const onCommand = useCallback(
    (command: KeyboardCommand) => {
      if (!canEdit || !current) return false;
      if (command === 'BACKSPACE') {
        if (draft.length === 0) return false;
        const next = draft.slice(0, -1);
        setDraft(next);
        sessionStorage.setItem(storageKey, next);
        void soundEngine.play('keyboard-click', soundEnabled);
        return true;
      }
      if (command === 'ENTER') {
        if (draft.length !== current.wordLength) {
          setMessage(`Guess must contain exactly ${current.wordLength} letters.`);
          void soundEngine.play('invalid', soundEnabled);
          return true;
        }
        void saveCommand({ command: 'guess', guess: draft }).then((accepted) => {
          if (!accepted) {
            void soundEngine.play('invalid', soundEnabled);
            return;
          }
          sessionStorage.removeItem(storageKey);
          setDraft('');
          void soundEngine.play('tile-submit', soundEnabled);
        });
        return true;
      }
      if (draft.length >= current.wordLength) return false;
      const next = `${draft}${command}`;
      setDraft(next);
      sessionStorage.setItem(storageKey, next);
      void soundEngine.play('keyboard-click', soundEnabled);
      return true;
    },
    [canEdit, current, draft, saveCommand, soundEnabled, storageKey],
  );

  const evidence = useMemo(() => {
    if (!current) return {};
    const rows = [
      ...current.seededRows,
      ...authoritativeGuessMoves(current).filter(
        (move) => move.puzzleIndex === current.currentPuzzleIndex,
      ),
    ].map((row) => ({
      tiles: (row.tiles ?? []).map((tile, position) => ({ ...tile, position })),
    }));
    const merged = mergeKeyboardEvidence(rows);
    return Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== 'unknown'),
    ) as Readonly<Record<string, TileState>>;
  }, [current]);

  return {
    projection,
    current,
    draft,
    message,
    saving,
    settlement,
    clockRemainingMs:
      current?.currentTurn === null || current?.currentTurn === undefined
        ? null
        : authoritativeClockRemainingMs(current, current.currentTurn, clockNow),
    canEdit,
    evidence,
    setMessage,
    onCommand,
    saveCommand,
  };
}
