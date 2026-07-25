import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../app/auth-context';
import type { TileState } from '../../components/gameBoardData';
import type { KeyboardCommand } from '../../components/keyboard/keyboard-model';
import {
  practiceCombatEvidence,
  practiceCombatHoldRemainingMs,
  reducePracticeCombatPreview,
  type PracticeCombatActor,
  type PracticeCombatPreviewAction,
} from '../../domain/practice-combat-preview';
import { mergeKeyboardEvidence } from '../../domain/game';
import { readSoundEnabled, soundEngine } from '../../services/sound-controller';
import { RealtimeReconciler } from '../../services/realtime-reconciler';
import {
  PracticeCombatConflictError,
  PracticeCombatTransportRepository,
} from '../../services/practice-combat-transport';
import { CombatParticipantIdentityRepository } from '../../services/combat-participant-identity';
import { wordListProvider } from '../../services/word-list-provider';

function actionTime(after: string): string {
  return new Date(Math.max(Date.now(), Date.parse(after) + 1)).toISOString();
}

function actorForSeat(seat: 'player-one' | 'player-two' | null): PracticeCombatActor | null {
  return seat === 'player-one' ? 'left' : seat === 'player-two' ? 'right' : null;
}

export function choosePracticeAnswers(
  pool: readonly string[],
  count: number,
  randomValues: Uint32Array = crypto.getRandomValues(new Uint32Array(count)),
): string[] {
  if (pool.length < count) throw new RangeError('The selected word pool cannot fill this chain.');
  const available = [...pool];
  const answers: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const random = randomValues[index] ?? 0;
    const selectedIndex = random % available.length;
    const selected = available.splice(selectedIndex, 1)[0];
    if (!selected) throw new RangeError('Practice answer selection failed.');
    answers.push(selected);
  }
  return answers;
}

export function usePracticeCombatMatch(gameId: string) {
  const { client, user, identity } = useAuth();
  const queryClient = useQueryClient();
  const transport = useMemo(
    () => (client ? new PracticeCombatTransportRepository(client) : null),
    [client],
  );
  const identityRepository = useMemo(
    () => (client ? new CombatParticipantIdentityRepository(client) : null),
    [client],
  );
  const queryKey = useMemo(
    () => ['combat', 'match', gameId, 'cooperative-preview', user?.id] as const,
    [gameId, user?.id],
  );
  const projection = useQuery({
    queryKey,
    enabled: Boolean(transport && user),
    queryFn: () => transport!.load(gameId, user!.id),
    refetchInterval: (query) =>
      query.state.data?.kind === 'cooperative-participant' && query.state.data.status === 'playing'
        ? 5_000
        : 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const participantIdentities = useQuery({
    queryKey: ['combat', 'match', gameId, 'identities'],
    enabled:
      Boolean(identityRepository && user) && projection.data?.kind === 'cooperative-participant',
    queryFn: () => identityRepository!.forGame(gameId),
    staleTime: 30_000,
    retry: 1,
  });
  const wordList = useQuery({
    queryKey: ['word-list', projection.data?.wordLength],
    enabled: projection.data?.kind === 'cooperative-participant',
    queryFn: ({ signal }) => wordListProvider.load(projection.data!.wordLength, signal),
    staleTime: Infinity,
    retry: 1,
  });
  const storageKey = `amordle:combat-draft:${identity.kind === 'authenticated' ? identity.userId : 'guest'}:${gameId}`;
  const [draft, setDraft] = useState(() => sessionStorage.getItem(storageKey) ?? '');
  const [message, setMessage] = useState('Loading the durable participant projection…');
  const [saving, setSaving] = useState(false);
  const settlement = null as {
    outcome: 'win' | 'loss' | 'draw';
    oldRating: number;
    newRating: number;
    ratingDelta: number;
    idempotent: boolean;
  } | null;
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
      channelName: `practice-game-${gameId}`,
      table: 'async_multiplayer_games',
      filter: `id=eq.${gameId}`,
      pollIntervalMs: 5_000,
      reconcile: async () => {
        await queryClient.invalidateQueries({ queryKey });
      },
      onError: () => setMessage('Connection changed. Durable polling remains active.'),
    });
    reconciler.start();
    return () => reconciler.stop();
  }, [client, gameId, queryClient, queryKey, user]);

  const saveAction = useCallback(
    async (action: PracticeCombatPreviewAction) => {
      const current = projection.data;
      if (!transport || !user || current?.kind !== 'cooperative-participant' || !wordList.data)
        return false;
      const reduced = reducePracticeCombatPreview(current.state, action, {
        validGuesses: new Set(wordList.data.validGuesses),
      });
      if (!reduced.ok) {
        setMessage(reduced.message);
        void soundEngine.play('invalid', soundEnabled);
        return false;
      }
      setSaving(true);
      try {
        const accepted = await transport.save({
          viewerUserId: user.id,
          expectedUpdatedAt: current.updatedAt,
          expectedCurrentTurn: current.currentTurn,
          expectedStatus: 'playing',
          state: reduced.state,
        });
        queryClient.setQueryData(queryKey, accepted);
        setMessage(
          reduced.state.status === 'holding'
            ? 'Puzzle solved and saved. Advancing after the evidence hold.'
            : reduced.state.status === 'terminal' || reduced.state.status === 'cancelled'
              ? current.ranked
                ? 'Terminal result saved. Trusted shell settlement is reconciling.'
                : 'Terminal result saved. No rating mutation was attempted.'
              : 'Move accepted and saved. Waiting for the other participant.',
        );
        return true;
      } catch (error) {
        await projection.refetch();
        setMessage(
          error instanceof PracticeCombatConflictError
            ? 'The match changed in another tab. Durable state was reloaded; retry your action.'
            : error instanceof Error
              ? error.message
              : 'The participant update could not be saved.',
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [projection, queryClient, queryKey, soundEnabled, transport, user, wordList.data],
  );

  useEffect(() => {
    const current = projection.data;
    if (current?.kind !== 'cooperative-participant' || current.state.hold === null || saving)
      return;
    const remaining = practiceCombatHoldRemainingMs(current.state, new Date().toISOString());
    const timer = window.setTimeout(
      () => {
        void saveAction({
          type: 'advance-hold',
          actionId: crypto.randomUUID(),
          expectedRevision: current.state.revision,
          expectedMoveCount: current.state.moves.length,
          now: actionTime(current.state.updatedAt),
        });
      },
      Math.max(remaining ?? 0, 0),
    );
    return () => window.clearTimeout(timer);
  }, [projection.data, saveAction, saving]);

  useEffect(() => {
    const current = projection.data;
    if (current?.kind !== 'cooperative-participant' || current.state.deadlineAt === null || saving)
      return;
    const actor = actorForSeat(current.viewerSeat);
    if (actor === null || current.state.activeActor !== actor) return;
    const remaining = Math.max(0, Date.parse(current.state.deadlineAt) - Date.now());
    const timer = window.setTimeout(() => {
      void saveAction({
        type: 'timeout',
        actor,
        actionId: crypto.randomUUID(),
        expectedRevision: current.state.revision,
        expectedMoveCount: current.state.moves.length,
        now: actionTime(current.state.updatedAt),
      });
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [projection.data, saveAction, saving]);

  const state = projection.data?.kind === 'cooperative-participant' ? projection.data.state : null;
  const viewerActor = actorForSeat(projection.data?.viewerSeat ?? null);
  const canEdit =
    projection.data?.kind === 'cooperative-participant' &&
    projection.data.capabilities.canEditDraft &&
    !saving &&
    state?.status === 'playing' &&
    wordList.data !== undefined;

  useEffect(() => {
    if (state?.status === 'terminal' || state?.status === 'cancelled') {
      sessionStorage.removeItem(storageKey);
      setDraft('');
    }
  }, [state?.status, storageKey]);

  const onCommand = useCallback(
    (command: KeyboardCommand) => {
      if (!canEdit || !state || !viewerActor) return false;
      if (command === 'BACKSPACE') {
        if (draft.length === 0) return false;
        const next = draft.slice(0, -1);
        setDraft(next);
        sessionStorage.setItem(storageKey, next);
        void soundEngine.play('keyboard-click', soundEnabled);
        return true;
      }
      if (command === 'ENTER') {
        void saveAction({
          type: 'submit',
          actor: viewerActor,
          guess: draft,
          actionId: crypto.randomUUID(),
          expectedRevision: state.revision,
          expectedMoveCount: state.moves.length,
          now: actionTime(state.updatedAt),
        }).then((accepted) => {
          if (!accepted) return;
          sessionStorage.removeItem(storageKey);
          setDraft('');
          void soundEngine.play('tile-submit', soundEnabled);
        });
        return true;
      }
      if (draft.length >= state.config.wordLength) return false;
      const next = `${draft}${command}`;
      setDraft(next);
      sessionStorage.setItem(storageKey, next);
      void soundEngine.play('keyboard-click', soundEnabled);
      return true;
    },
    [canEdit, draft, saveAction, soundEnabled, state, storageKey, viewerActor],
  );

  const evidence = useMemo(() => {
    if (!state) return {};
    const merged = mergeKeyboardEvidence(practiceCombatEvidence(state));
    return Object.fromEntries(
      Object.entries(merged).filter(([, value]) => value !== 'unknown'),
    ) as Readonly<Record<string, TileState>>;
  }, [state]);

  return {
    projection,
    participantIdentities,
    wordList,
    state,
    viewerActor,
    draft,
    evidence,
    canEdit,
    saving,
    message,
    settlement,
    setMessage,
    onCommand,
    saveAction,
  };
}
