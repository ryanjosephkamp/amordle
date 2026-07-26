import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../app/auth-context';
import type { TileState } from '../../components/gameBoardData';
import type { KeyboardCommand } from '../../components/keyboard/keyboard-model';
import { CombatParticipantIdentityRepository } from '../../services/combat-participant-identity';
import { CombatPreviewRepository } from '../../services/combat-preview-repository';
import { combatCommandFailure } from '../../services/combat-command-failure';
import { RealtimeReconciler } from '../../services/realtime-reconciler';
import { readSoundEnabled, soundEngine } from '../../services/sound-controller';
import { wordListProvider } from '../../services/word-list-provider';

export function useRankedDailyCombatMatch(gameId: string) {
  const { client, user, identity } = useAuth();
  const queryClient = useQueryClient();
  const repository = useMemo(() => (client ? new CombatPreviewRepository(client) : null), [client]);
  const identityRepository = useMemo(
    () => (client ? new CombatParticipantIdentityRepository(client) : null),
    [client],
  );
  const queryKey = useMemo(
    () => ['combat', 'match', gameId, 'ranked-daily', user?.id] as const,
    [gameId, user?.id],
  );
  const projection = useQuery({
    queryKey,
    enabled: Boolean(repository && user),
    queryFn: async () => {
      const loaded = await repository!.loadProjection(gameId, user!.id);
      if (loaded?.kind !== 'ranked-daily') throw new Error('Ranked Daily game unavailable.');
      return loaded;
    },
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const identities = useQuery({
    queryKey: ['combat', 'match', gameId, 'identities'],
    enabled: Boolean(identityRepository && projection.data),
    queryFn: () => identityRepository!.forGame(gameId),
    staleTime: 30_000,
  });
  const wordList = useQuery({
    queryKey: ['word-list', 5],
    enabled: Boolean(projection.data),
    queryFn: ({ signal }) => wordListProvider.load(5, signal),
    staleTime: Infinity,
  });
  const storageKey = `amordle:ranked-daily-draft:${identity.kind === 'authenticated' ? identity.userId : 'guest'}:${gameId}`;
  const [draft, setDraft] = useState(() => sessionStorage.getItem(storageKey) ?? '');
  const [message, setMessage] = useState('Loading Ranked Daily…');
  const [saving, setSaving] = useState(false);
  const [settlement, setSettlement] = useState<Awaited<
    ReturnType<CombatPreviewRepository['settleRankedDaily']>
  > | null>(null);
  const soundEnabled = readSoundEnabled(
    identity,
    typeof localStorage === 'undefined' ? undefined : localStorage,
  );

  useEffect(() => {
    if (!client || !user) return;
    const reconciler = new RealtimeReconciler(client, {
      channelName: `ranked-daily-${gameId}`,
      table: 'async_multiplayer_games',
      filter: `id=eq.${gameId}`,
      pollIntervalMs: 5_000,
      reconcile: async () => {
        await queryClient.invalidateQueries({ queryKey });
      },
      onError: () => setMessage('Connection changed. Reconnecting…'),
    });
    reconciler.start();
    return () => reconciler.stop();
  }, [client, gameId, queryClient, queryKey, user]);

  const current = projection.data;
  const canEdit = Boolean(
    current?.capabilities.canSubmit && current.status === 'playing' && wordList.data && !saving,
  );

  const submit = useCallback(
    async (forfeit = false) => {
      if (!repository || !user || !current || current.authorityVersion === null) return false;
      setSaving(true);
      try {
        const accepted = await repository.saveRankedDailyAction({
          gameId,
          viewerUserId: user.id,
          actionId: crypto.randomUUID(),
          expectedVersion: current.authorityVersion,
          expectedMoveCount: current.moves.length,
          ...(forfeit ? { forfeit: true } : { guess: draft.toLocaleLowerCase('en-US') }),
        });
        queryClient.setQueryData(queryKey, accepted);
        if (['won', 'lost', 'expired', 'cancelled'].includes(accepted.status)) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['combat', 'active'] }),
            queryClient.invalidateQueries({ queryKey: ['combat', 'hub'] }),
            queryClient.invalidateQueries({ queryKey: ['combat', 'lobbies'] }),
          ]);
        }
        sessionStorage.removeItem(storageKey);
        setDraft('');
        setMessage(
          ['won', 'lost', 'expired', 'cancelled'].includes(accepted.status)
            ? 'Game complete. Results are ready.'
            : 'Move accepted. Waiting for the other player.',
        );
        return true;
      } catch (error) {
        const failure = combatCommandFailure(error);
        if (failure.reread) await projection.refetch();
        setMessage(failure.message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [current, draft, gameId, projection, queryClient, queryKey, repository, storageKey, user],
  );

  useEffect(() => {
    if (
      !repository ||
      !user ||
      !current ||
      !['won', 'lost', 'expired'].includes(current.status) ||
      settlement
    )
      return;
    void repository
      .settleRankedDaily({ gameId, viewerUserId: user.id })
      .then(setSettlement)
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Rating update is still pending.'),
      );
  }, [current, gameId, repository, settlement, user]);

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
        if (draft.length !== 5) {
          setMessage('Ranked Daily guesses contain exactly five letters.');
          void soundEngine.play('invalid', soundEnabled);
          return true;
        }
        void submit().then((accepted) => {
          if (accepted) void soundEngine.play('tile-submit', soundEnabled);
        });
        return true;
      }
      if (draft.length >= 5) return false;
      const next = `${draft}${command}`;
      setDraft(next);
      sessionStorage.setItem(storageKey, next);
      void soundEngine.play('keyboard-click', soundEnabled);
      return true;
    },
    [canEdit, current, draft, soundEnabled, storageKey, submit],
  );

  return {
    projection,
    identities,
    current,
    draft,
    message,
    saving,
    settlement,
    canEdit,
    evidence: current
      ? current.moves.reduce<Record<string, TileState>>((evidence, move) => {
          const rank: Readonly<Record<TileState, number>> = {
            empty: 0,
            draft: 0,
            absent: 1,
            present: 2,
            correct: 3,
            removed: 4,
          };
          for (const tile of move.tiles) {
            const prior = evidence[tile.letter] ?? 'empty';
            if (rank[tile.state] > rank[prior]) evidence[tile.letter] = tile.state;
          }
          return evidence;
        }, {})
      : {},
    onCommand,
    forfeit: () => submit(true),
  };
}
