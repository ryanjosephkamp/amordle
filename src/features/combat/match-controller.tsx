'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  acceptPracticeRematch,
  advanceLegacyGo,
  cancelPracticeRematch,
  declinePracticeRematch,
  getCombatGame,
  getLegacyPractice,
  getRankedDailyGame,
  saveCombatCommand,
  saveLegacyGuess,
  saveRankedDailyAction,
  listPracticeRematches,
  requestPracticeRematch,
  settleLegacyRankedDaily,
  settleRankedDaily,
  settleRankedPractice,
} from '@/adapters/supabase/combat';
import type {
  CombatProjection,
  LegacyRow,
  RankedDailyProjection,
  RankedPracticeSettlement,
  RematchRequest,
} from '@/adapters/supabase/combat';
import { getBrowserSupabase } from '@/adapters/supabase/browser';
import { ServiceError, operationId } from '@/adapters/supabase/shared';
import { loadPublicWordSet } from '@/adapters/word-lists';
import { queueAccountCompletion, reconcileCompletionOutbox } from '@/application/completion-outbox';
import { invalidateAccountProjections } from '@/application/account-query-freshness';
import { playKeyboardSound } from '@/application/keyboard-feedback';
import { matchDirectNavigationShortcut } from '@/application/keyboard-shortcuts';
import { GameKeyboard } from '@/components/game-keyboard';
import { PlayerIdentityLink } from '@/components/player-identity-link';
import { useAuth } from '@/components/providers';
import { useFeedbackPreferences } from '@/components/feedback-preferences';
import { AccountGate, SkeletonRows } from '@/components/route-states';
import { derivePuzzleKeyboardEvidence, scoreGuess } from '@/domain/game';
import type { EvidenceState } from '@/domain/game';
import type { KeyboardFeedbackEvent } from '@/domain/feedback';
import { isGuessRuleRejection } from '@/domain/feedback';
import { historyRowSchema } from '@/domain/account-continuity';
import { canClaimTimeout } from '@/domain/clock';
import { rematchViewState } from '@/domain/combat-rematch';
import { classifyServiceFailure } from '@/domain/service-failure';
import { MatchUnavailable } from './match-unavailable';
import { validSeededTranscriptRows } from '@/domain/combat-transcript';
import type { AccountHistoryRow } from '@/domain/account-continuity';
import { WordDefinition } from '@/features/words/word-definition';
import { ClockValue, useCombatClockReading } from './match-clock';
import { MoveBoards } from './combat-transcript';

interface MatchState {
  authority: 0 | 1 | 2;
  legacy?: LegacyRow;
  rankedDaily?: RankedDailyProjection;
  game?: CombatProjection;
}

async function loadMatch(gameId: string): Promise<MatchState> {
  /*
   * A3. Control flow is unchanged; only the reason survives it. The legacy fallback used
   * to replace every failure with a flat NOT_FOUND, so a match that was private to two
   * other players reported itself as a broken link and the "private" wording could never
   * be reached.
   */
  let primary: ServiceError | null = null;
  try {
    return { authority: 2, game: await getCombatGame(gameId) };
  } catch (error) {
    if (error instanceof ServiceError) {
      if (!['P0002', 'NOT_FOUND', 'FORBIDDEN', '42501'].includes(error.code)) throw error;
      primary = error;
    }
    try {
      const rankedDaily = await getRankedDailyGame(gameId);
      if (rankedDaily) return { authority: 1, rankedDaily };
    } catch (dailyError) {
      if (
        dailyError instanceof ServiceError &&
        !['P0002', 'NOT_FOUND', 'FORBIDDEN', '42501'].includes(dailyError.code)
      ) {
        throw dailyError;
      }
    }
    const legacy = await getLegacyPractice(gameId);
    if (!legacy) throw primary ?? new ServiceError('That match was not found.', 'NOT_FOUND');
    return { authority: 0, legacy };
  }
}

export function MatchController({
  gameId,
  presentation = 'auto',
}: {
  gameId: string;
  presentation?: 'auto' | 'review';
}) {
  return (
    <AccountGate>
      <MatchControllerInner gameId={gameId} presentation={presentation} />
    </AccountGate>
  );
}

function MatchControllerInner({
  gameId,
  presentation,
}: {
  gameId: string;
  presentation: 'auto' | 'review';
}) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const feedback = useFeedbackPreferences();
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const [rankedPracticeSettlement, setRankedPracticeSettlement] =
    useState<RankedPracticeSettlement | null>(null);
  const match = useQuery({
    queryKey: ['combat', 'match', gameId],
    queryFn: () => loadMatch(gameId),
    refetchInterval: () => (document.visibilityState === 'visible' ? 5_000 : false),
  });
  const length = match.data?.game?.wordLength ?? match.data?.legacy?.projection.wordLength;
  const words = useQuery({
    queryKey: ['word-set', length],
    queryFn: () => loadPublicWordSet(length ?? 0),
    enabled: match.data?.authority === 0 && Boolean(length),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const refetchMatch = match.refetch;
  const terminal = Boolean(
    match.data?.game?.outcome.terminal ||
    (match.data?.rankedDaily &&
      ['won', 'lost', 'cancelled'].includes(match.data.rankedDaily.status)) ||
    (match.data?.legacy &&
      ['won', 'lost', 'cancelled'].includes(match.data.legacy.projection.status)),
  );

  useEffect(() => {
    document.documentElement.dataset.gamePresentation =
      presentation === 'review' || terminal ? 'review' : 'active';
    return () => {
      delete document.documentElement.dataset.gamePresentation;
    };
  }, [presentation, terminal]);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel(`combat:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'async_multiplayer_games',
          filter: `id=eq.${gameId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['combat', 'match', gameId] });
          void queryClient.invalidateQueries({ queryKey: ['combat', 'active'] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, queryClient]);

  useEffect(() => {
    const refetch = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void refetchMatch();
      }
    };
    document.addEventListener('visibilitychange', refetch);
    window.addEventListener('online', refetch);
    return () => {
      document.removeEventListener('visibilitychange', refetch);
      window.removeEventListener('online', refetch);
    };
  }, [refetchMatch]);

  const command = useMutation({
    mutationFn: async (kind: 'guess' | 'advance' | 'cancel' | 'forfeit' | 'timeout') => {
      const state = match.data;
      const userId = auth.user?.id;
      if (!state || !userId) throw new Error('Match state is unavailable.');
      if (state.authority === 2 && state.game) {
        return {
          authority: 2 as const,
          game: await saveCombatCommand({
            gameId,
            actionId: operationId(`combat:${kind}`),
            expectedVersion: state.game.version,
            expectedMoveCount: state.game.moveCount,
            command: kind,
            ...(kind === 'guess' ? { guess: draft } : {}),
          }),
        };
      }
      if (state.authority === 1 && state.rankedDaily) {
        if (kind !== 'guess' && kind !== 'forfeit') {
          throw new Error('That action is unavailable in this ranked Daily.');
        }
        // Ranked Daily has no player-owned clock, so `timeout` cannot reach here.
        return {
          authority: 1 as const,
          rankedDaily: await saveRankedDailyAction({
            gameId,
            expectedVersion: state.rankedDaily.authorityVersion,
            expectedMoveCount: state.rankedDaily.moves.length,
            actionId: operationId(`ranked-daily:${kind}`),
            ...(kind === 'guess' ? { guess: draft } : { forfeit: true }),
          }),
        };
      }
      if (kind !== 'guess' || !state.legacy) {
        throw new Error('That action is unavailable in this match.');
      }
      if (!words.data) throw new Error('The selected word list is still loading.');
      return {
        authority: 0 as const,
        legacy: await saveLegacyGuess({
          gameId,
          userId,
          guess: draft,
          sanctionedWords: words.data,
          actionId: operationId('combat:guess'),
        }),
      };
    },
    onSuccess: (state) => {
      setDraft('');
      setMessage('');
      queryClient.setQueryData(['combat', 'match', gameId], state);
      void queryClient.invalidateQueries({ queryKey: ['combat', 'active'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error, kind) => {
      if (
        kind === 'guess' &&
        feedback.settings.sound &&
        !feedback.settings.reducedEffects &&
        isGuessRuleRejection(error)
      ) {
        void playKeyboardSound(feedback.settings.keyboardSoundProfile, 'reject');
      }
      /*
       * TIMEOUT_PENDING is the authority saying the opponent's clock has not actually
       * run out yet — a refusal, not a failure. It reaches the client as the raw
       * Postgres exception message, so it needs words a player can act on.
       */
      const raw = error instanceof Error ? error.message : '';
      setMessage(
        raw.includes('TIMEOUT_PENDING')
          ? 'Their clock has not run out yet.'
          : raw || 'That action was not accepted.',
      );
      void match.refetch();
    },
  });

  const game = match.data?.game;
  useEffect(() => {
    if (!game || game.status !== 'holding' || !game.holdUntil || !game.capabilities.canAdvance) {
      return;
    }
    const delay = Math.max(0, Date.parse(game.holdUntil) - Date.now());
    const timer = window.setTimeout(() => command.mutate('advance'), delay);
    return () => window.clearTimeout(timer);
  }, [command, game]);

  useEffect(() => {
    const legacy = match.data?.legacy?.projection;
    if (
      match.data?.authority !== 0 ||
      legacy?.status !== 'holding' ||
      !legacy.holdUntil ||
      !words.data
    ) {
      return;
    }
    const delay = Math.max(0, Date.parse(legacy.holdUntil) - Date.now());
    const timer = window.setTimeout(() => {
      void advanceLegacyGo(gameId, words.data)
        .then((row) =>
          queryClient.setQueryData(['combat', 'match', gameId], {
            authority: 0 as const,
            legacy: row,
          }),
        )
        .catch(() => void match.refetch());
    }, delay);
    return () => window.clearTimeout(timer);
  }, [gameId, match, queryClient, words.data]);

  const settle = useMutation({
    mutationFn: async () => {
      if (match.data?.authority === 1) {
        await settleLegacyRankedDaily(gameId, `ranked-daily:settle:${gameId}`);
        return { authority: 1 as const, receipt: null };
      }
      const receipt =
        match.data?.game?.scope === 'daily'
          ? await settleRankedDaily(gameId, `amordle-ranked-daily-v3:settle:${gameId}`)
          : await settleRankedPractice(gameId, `amordle-ranked-practice-v2:settle:${gameId}`);
      return { authority: 2 as const, receipt };
    },
    onSuccess: (result) => {
      if (result.authority === 2 && result.receipt) {
        setRankedPracticeSettlement(result.receipt);
        setMessage(
          `Rating ${result.receipt.ratingDelta >= 0 ? '+' : ''}${result.receipt.ratingDelta} · ${result.receipt.newRating}.`,
        );
      } else {
        setMessage('Rating settled.');
      }
      void match.refetch();
      if (auth.user?.id) {
        void invalidateAccountProjections(queryClient, auth.user.id, { includeRanked: true });
      }
    },
    onError: () => setMessage('Rating settlement needs attention. It is safe to retry.'),
  });

  useEffect(() => {
    const userId = auth.user?.id;
    const row =
      userId && match.data
        ? combatHistoryRow(match.data, userId, rankedPracticeSettlement?.ratingDelta ?? null)
        : null;
    if (!row || !userId) return;
    void queueAccountCompletion(row)
      .then(() => reconcileCompletionOutbox(userId))
      .then(() => invalidateAccountProjections(queryClient, userId, { includeRanked: true }))
      .catch(() => undefined);
  }, [auth.user?.id, match.data, queryClient, rankedPracticeSettlement?.ratingDelta]);

  if (match.isPending) return <SkeletonRows label="Loading match…" rows={5} />;
  if (match.isError || !match.data) {
    return (
      <MatchUnavailable
        gameId={gameId}
        kind={classifyServiceFailure({
          code: match.error instanceof ServiceError ? match.error.code : undefined,
          online: typeof navigator === 'undefined' ? true : navigator.onLine,
        })}
        onRetry={() => void match.refetch()}
      />
    );
  }
  if (match.data.authority === 0 && match.data.legacy) {
    return (
      <LegacyMatch
        row={match.data.legacy}
        userId={auth.user?.id ?? ''}
        draft={draft}
        setDraft={setDraft}
        submit={() => command.mutate('guess')}
        pending={command.isPending}
        wordsReady={Boolean(words.data)}
        message={message || (words.isError ? 'The published word list is unavailable.' : '')}
      />
    );
  }
  if (match.data.authority === 1 && match.data.rankedDaily) {
    return (
      <RankedDailyMatch
        game={match.data.rankedDaily}
        userId={auth.user?.id ?? ''}
        draft={draft}
        setDraft={setDraft}
        submit={() => command.mutate('guess')}
        forfeit={() => {
          if (window.confirm('Forfeit this ranked Daily? This cannot be reversed.')) {
            command.mutate('forfeit');
          }
        }}
        settle={() => settle.mutate()}
        pending={command.isPending || settle.isPending}
        message={message}
      />
    );
  }
  if (!game) return null;
  return (
    <AuthoritativeMatch
      game={game}
      observedAtMs={match.dataUpdatedAt}
      draft={draft}
      setDraft={setDraft}
      submit={() => command.mutate('guess')}
      forfeit={() => {
        if (window.confirm('Forfeit this match? This cannot be reversed.'))
          command.mutate('forfeit');
      }}
      cancel={() => {
        if (
          window.confirm('Cancel this match before play? No result or rating will be recorded.')
        ) {
          command.mutate('cancel');
        }
      }}
      claimTimeout={() => command.mutate('timeout')}
      settle={() => settle.mutate()}
      settlement={rankedPracticeSettlement}
      pending={command.isPending || settle.isPending}
      message={message}
    />
  );
}

function RankedDailyMatch({
  game,
  userId,
  draft,
  setDraft,
  submit,
  forfeit,
  settle,
  pending,
  message,
}: {
  game: RankedDailyProjection;
  userId: string;
  draft: string;
  setDraft(value: string): void;
  submit(): void;
  forfeit(): void;
  settle(): void;
  pending: boolean;
  message: string;
}) {
  const viewerSeat = game.playerUserIds['player-one'] === userId ? 'player-one' : 'player-two';
  const terminal = game.status === 'won' || game.status === 'lost' || game.status === 'cancelled';
  const turn = !terminal && game.currentTurn === viewerSeat;
  const lastMove = game.moves.at(-1);
  const puzzleIndex =
    game.mode === 'go' &&
    lastMove &&
    lastMove.tiles.every((tile) => tile.state === 'correct') &&
    lastMove.puzzleIndex < 4
      ? lastMove.puzzleIndex + 1
      : (lastMove?.puzzleIndex ?? 0);
  const visibleMoves = game.moves.filter((move) => move.puzzleIndex === puzzleIndex);
  const keyboardEvidence = derivePuzzleKeyboardEvidence({
    currentPuzzleIndex: puzzleIndex,
    moves: game.moves,
  });
  return (
    <section className="combat-game" aria-labelledby="combat-heading">
      <CombatHeader
        title="Ranked Daily"
        detail={`${game.mode.toUpperCase()} · UTC ${game.dailyDateKey}${game.hardMode ? ' · Hard Mode' : ''}${
          game.mode === 'go' ? ` · puzzle ${puzzleIndex + 1}/5` : ''
        }`}
        status={
          terminal
            ? game.winnerId === viewerSeat
              ? 'You won'
              : game.winnerId
                ? 'Opponent won'
                : 'Match complete'
            : turn
              ? 'Your turn'
              : 'Opponent’s turn'
        }
      />
      <MoveBoards
        moves={visibleMoves.map((move) => ({
          id: move.id,
          seat: move.playerId,
          guess: move.guess,
          tiles: move.tiles,
          acceptedAt: move.createdAt,
        }))}
        length={5}
        viewerSeat={viewerSeat}
        actorLabels={{
          [viewerSeat]: 'You',
          [viewerSeat === 'player-one' ? 'player-two' : 'player-one']: 'Rival',
        }}
      />
      {!terminal && (
        <CombatInput
          draft={draft}
          length={5}
          evidence={keyboardEvidence}
          setDraft={setDraft}
          submit={submit}
          disabled={!turn || pending}
        />
      )}
      <p className="game-message" aria-live="assertive">
        {message}
      </p>
      {!terminal && (
        <button
          type="button"
          className="combat-secondary-action"
          onClick={forfeit}
          disabled={pending}
        >
          {game.moves.length ? 'FORFEIT MATCH' : 'CANCEL BEFORE PLAY'}
        </button>
      )}
      {terminal && game.status !== 'cancelled' && (
        <div className="result-panel">
          <h2>Ranked result</h2>
          <p>The result is final. Update your rating to finish this match.</p>
          <div className="action-row">
            <button className="primary" onClick={settle} disabled={pending}>
              UPDATE RATING
            </button>
            <Link className="button" href={`/combat/results/${game.id}`}>
              VIEW RESULT
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

function LegacyMatch({
  row,
  userId,
  draft,
  setDraft,
  submit,
  pending,
  wordsReady,
  message,
}: {
  row: LegacyRow;
  userId: string;
  draft: string;
  setDraft(value: string): void;
  submit(): void;
  pending: boolean;
  wordsReady: boolean;
  message: string;
}) {
  const game = row.projection;
  const currentPuzzleIndex = game.currentPuzzleIndex ?? 0;
  const seat = row.player_one_user_id === userId ? 'player-one' : 'player-two';
  const turn = game.status === 'playing' && game.currentTurn === seat;
  const terminal = game.status === 'won' || game.status === 'lost' || game.status === 'cancelled';
  const seededRows =
    game.mode === 'go' && currentPuzzleIndex > 0
      ? Array.from({ length: currentPuzzleIndex }, (_, puzzleIndex) => {
          const solvedMove = game.moves.find(
            (move) =>
              (move.puzzleIndex ?? 0) === puzzleIndex &&
              move.tiles.every((tile) => tile.state === 'correct'),
          );
          return solvedMove
            ? {
                id: solvedMove.id,
                sourcePuzzleIndex: puzzleIndex,
                guess: solvedMove.guess,
                tiles: scoreGuess(game.answer, solvedMove.guess),
              }
            : null;
        }).filter((candidate) => candidate !== null)
      : [];
  const visibleMoves = game.moves.filter((move) => (move.puzzleIndex ?? 0) === currentPuzzleIndex);
  const keyboardEvidence = derivePuzzleKeyboardEvidence({
    currentPuzzleIndex,
    moves: game.moves,
    seededRows,
  });
  return (
    <section className="combat-game" aria-labelledby="combat-heading">
      <CombatHeader
        title="Public Practice"
        detail={`${game.mode.toUpperCase()} · ${game.wordLength} letters · ${game.difficulty}`}
        status={
          game.status === 'waiting'
            ? 'Waiting for another player'
            : game.status === 'holding'
              ? 'Puzzle solved · preparing next board'
              : terminal
                ? game.winnerSeat === seat
                  ? 'You won'
                  : 'Match complete'
                : turn
                  ? 'Your turn'
                  : 'Opponent’s turn'
        }
      />
      {game.status === 'waiting' && (
        <div className="combat-wait-state" role="status">
          <strong>Waiting for another player</strong>
          <span>Both players get the same puzzle.</span>
        </div>
      )}
      <MoveBoards
        moves={visibleMoves}
        length={game.wordLength}
        seededRows={validSeededTranscriptRows({
          candidates: seededRows.map((row) => ({
            sourcePuzzleIndex: row.sourcePuzzleIndex,
            guess: row.guess,
            tiles: row.tiles,
          })),
          currentPuzzleIndex,
          wordLength: game.wordLength,
        })}
        viewerSeat={seat}
        actorLabels={{
          [seat]: 'You',
          [seat === 'player-one' ? 'player-two' : 'player-one']: 'Rival',
        }}
      />
      {!terminal && game.status === 'playing' && (
        <CombatInput
          draft={draft}
          length={game.wordLength}
          evidence={keyboardEvidence}
          setDraft={setDraft}
          submit={submit}
          disabled={!turn || pending || !wordsReady}
        />
      )}
      <p className="game-message" aria-live="assertive">
        {message}
      </p>
      {terminal && (
        <div className="result-panel">
          <h2>Answer</h2>
          <p className="mono">{game.answer.toUpperCase()}</p>
          <Link className="button primary" href={`/combat/results/${game.id}`}>
            VIEW RESULT
          </Link>
          <RematchActions sourceGameId={game.id} />
        </div>
      )}
    </section>
  );
}

function RematchActions({ sourceGameId }: { sourceGameId: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const requests = useQuery({
    queryKey: ['combat', 'rematches', sourceGameId],
    queryFn: () => listPracticeRematches(sourceGameId),
    // Stop once a rematch exists to join, and never poll a tab nobody is looking at.
    refetchInterval: (query) =>
      document.visibilityState === 'visible' && !query.state.data?.[0]?.created_game_id
        ? 5_000
        : false,
  });
  const act = useMutation({
    mutationFn: async ({
      action,
      request,
    }: {
      action: 'request' | 'accept' | 'decline' | 'cancel';
      request?: RematchRequest;
    }) => {
      if (action === 'request') {
        return requestPracticeRematch(sourceGameId, operationId(`rematch-request:${sourceGameId}`));
      }
      if (!request) throw new Error('Rematch request is unavailable.');
      if (action === 'cancel') return cancelPracticeRematch(request.request_id);
      if (action === 'decline') return declinePracticeRematch(request.request_id);
      return acceptPracticeRematch(request, operationId(`rematch-accept:${request.request_id}`));
    },
    onSuccess: (request) => {
      void queryClient.invalidateQueries({
        queryKey: ['combat', 'rematches', sourceGameId],
      });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      if (request.created_game_id) {
        window.location.assign(`/combat/match/${request.created_game_id}`);
      } else {
        setMessage(`Rematch ${request.request_status}.`);
      }
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'Rematch action was not accepted.'),
  });
  const latest = requests.data?.[0];
  // Evaluated as of the last poll rather than `Date.now()`: pure during render, and at
  // most one 5s interval stale, which is the same freshness the row itself has.
  const view = rematchViewState(latest, requests.dataUpdatedAt);
  /*
   * A1. A link rather than an automatic redirect: navigating a player out of the page
   * from a background poll takes away the back button and fires at a moment they did
   * not choose. The accepting player keeps their existing redirect because that
   * navigation follows their own click.
   */
  const notice =
    view.action === 'join'
      ? 'Your rematch is ready.'
      : message || (view.lastOutcome ? `Rematch ${view.lastOutcome}.` : '');
  return (
    <div className="field-stack">
      {view.action === 'join' && view.joinGameId ? (
        <Link className="button primary" href={`/combat/match/${view.joinGameId}`}>
          JOIN REMATCH
        </Link>
      ) : view.action !== 'respond' && view.action !== 'cancel' ? (
        <button
          type="button"
          disabled={act.isPending}
          onClick={() => act.mutate({ action: 'request' })}
        >
          REQUEST REMATCH
        </button>
      ) : !latest ? null : view.action === 'respond' ? (
        <div className="action-row">
          <button
            className="primary"
            disabled={act.isPending}
            onClick={() => act.mutate({ action: 'accept', request: latest })}
          >
            ACCEPT REMATCH
          </button>
          <button
            disabled={act.isPending}
            onClick={() => act.mutate({ action: 'decline', request: latest })}
          >
            DECLINE
          </button>
        </div>
      ) : (
        <button
          disabled={act.isPending}
          onClick={() => act.mutate({ action: 'cancel', request: latest })}
        >
          CANCEL REMATCH REQUEST
        </button>
      )}
      <p aria-live="polite">{notice}</p>
    </div>
  );
}

function AuthoritativeMatch({
  game,
  observedAtMs,
  draft,
  setDraft,
  submit,
  forfeit,
  cancel,
  claimTimeout,
  settle,
  settlement,
  pending,
  message,
}: {
  game: CombatProjection;
  observedAtMs: number;
  draft: string;
  setDraft(value: string): void;
  submit(): void;
  forfeit(): void;
  cancel(): void;
  claimTimeout(): void;
  settle(): void;
  settlement: RankedPracticeSettlement | null;
  pending: boolean;
  message: string;
}) {
  const terminal = game.outcome.terminal;
  const player = game.playerState[game.viewerSeat];
  const opponent = game.players.find((participant) => participant.seat !== game.viewerSeat);
  const opponentSeat = game.viewerSeat === 'player-one' ? 'player-two' : 'player-one';
  const opponentClock = useCombatClockReading(game, opponentSeat, observedAtMs);
  const claimable = canClaimTimeout({
    status: game.status,
    terminal,
    viewerSeat: game.viewerSeat,
    currentTurn: game.currentTurn,
    opponentClock,
  });
  const turn = game.currentTurn === game.viewerSeat && game.capabilities.canSubmitGuess;
  const visibleMoves = game.moves.filter(
    (move) => move.type === 'guess' && move.puzzleIndex === game.currentPuzzleIndex,
  );
  const keyboardEvidence = derivePuzzleKeyboardEvidence({
    currentPuzzleIndex: game.currentPuzzleIndex,
    moves: game.moves.filter((move) => move.type === 'guess'),
    seededRows: game.seededRows,
  });
  return (
    <section className="combat-game" aria-labelledby="combat-heading">
      <CombatHeader
        title={`${game.ranked ? 'Ranked ' : ''}${game.scope === 'daily' ? 'Daily' : 'Practice'}`}
        detail={`${game.mode.toUpperCase()} · ${game.wordLength} letters · ${game.difficulty}${game.hardMode ? ' · Hard Mode' : ''}`}
        status={
          terminal
            ? game.outcome.winnerSeat === game.viewerSeat
              ? 'You won'
              : game.outcome.winnerSeat
                ? 'Opponent won'
                : 'Match complete'
            : game.status === 'waiting'
              ? 'Waiting for another player'
              : game.status === 'holding'
                ? 'Puzzle solved · preparing next board'
                : turn
                  ? 'Your turn'
                  : 'Opponent’s turn'
        }
      />
      {game.status === 'waiting' && (
        <div className="combat-wait-state" role="status">
          <strong>Waiting for another player</strong>
          <span>Both players get the same puzzle.</span>
        </div>
      )}
      <div className="combat-score" aria-label="Match score">
        {game.players.map((participant) => (
          <div key={participant.seat}>
            <span>
              <PlayerIdentityLink
                publicProfileId={participant.publicProfileId}
                displayName={participant.displayName}
              />
              {participant.seat === game.viewerSeat ? ' (you)' : ''}
            </span>
            <strong>{game.playerState[participant.seat].points} pts</strong>
            {game.playerState[participant.seat].timeRemainingMs != null && (
              <ClockValue game={game} seat={participant.seat} observedAtMs={observedAtMs} />
            )}
          </div>
        ))}
      </div>
      <MoveBoards
        moves={visibleMoves.map((move) => ({
          id: move.actionId,
          seat: move.seat,
          guess: move.guess ?? '',
          tiles: move.tiles,
          acceptedAt: move.createdAt,
        }))}
        length={game.wordLength}
        seededRows={validSeededTranscriptRows({
          candidates: game.seededRows,
          currentPuzzleIndex: game.currentPuzzleIndex,
          wordLength: game.wordLength,
        })}
        viewerSeat={game.viewerSeat}
        actorLabels={Object.fromEntries(
          game.players.map((participant) => [
            participant.seat,
            participant.seat === game.viewerSeat ? 'You' : participant.displayName || 'Rival',
          ]),
        )}
        actorProfileIds={Object.fromEntries(
          game.players
            .filter((participant) => participant.publicProfileId)
            .map((participant) => [participant.seat, participant.publicProfileId]),
        )}
      />
      {!terminal && game.status === 'playing' && (
        <CombatInput
          draft={draft}
          length={game.wordLength}
          evidence={keyboardEvidence}
          setDraft={setDraft}
          submit={submit}
          disabled={!turn || pending}
        />
      )}
      <p className="game-message" aria-live="assertive">
        {message}
      </p>
      {claimable && (
        <button
          type="button"
          className="combat-secondary-action"
          onClick={claimTimeout}
          disabled={pending}
        >
          CLAIM WIN ON TIME
        </button>
      )}
      {!terminal && game.capabilities.canCancel && (
        <button
          type="button"
          className="combat-secondary-action"
          onClick={cancel}
          disabled={pending}
        >
          CANCEL BEFORE PLAY
        </button>
      )}
      {!terminal && !game.capabilities.canCancel && game.capabilities.canForfeit && (
        <button
          type="button"
          className="combat-secondary-action"
          onClick={forfeit}
          disabled={pending}
        >
          FORFEIT MATCH
        </button>
      )}
      {terminal && (
        <div className="result-panel">
          <h2>Match complete</h2>
          <p>
            {game.outcome.reason?.replaceAll('_', ' ') ?? 'Final result recorded'} · {player.points}{' '}
            points
          </p>
          {game.revealedAnswers && game.revealedAnswers.length > 0 && (
            <div className="result-definitions" aria-label="Answer definitions">
              {game.revealedAnswers.map((answer) => (
                <WordDefinition word={answer} key={answer} />
              ))}
            </div>
          )}
          <div className="action-row">
            {game.capabilities.canSettleRating && !settlement && (
              <button className="primary" onClick={settle} disabled={pending}>
                UPDATE RATING
              </button>
            )}
            <Link className="button" href={`/combat/results/${game.id}`}>
              VIEW RESULT
            </Link>
          </div>
          {settlement && (
            <p className="mono" role="status">
              RATING {settlement.oldRating} → {settlement.newRating} (
              {settlement.ratingDelta >= 0 ? '+' : ''}
              {settlement.ratingDelta})
            </p>
          )}
          {!game.ranked && game.scope === 'practice' && <RematchActions sourceGameId={game.id} />}
          <nav className="action-row" aria-label="Next COMBAT actions">
            {game.scope === 'practice' && (
              <Link className="button" href={`/combat/practice?length=${game.wordLength}`}>
                SEARCH AGAIN
              </Link>
            )}
            {game.scope === 'practice' && (
              <Link className="button" href="/combat/daily">
                PLAY DAILY
              </Link>
            )}
            {opponent?.publicProfileId && (
              <Link className="button" href={`/players/${opponent.publicProfileId}`}>
                VIEW RIVAL
              </Link>
            )}
            {game.status !== 'cancelled' && (
              <Link className="button" href="/history">
                HISTORY
              </Link>
            )}
            <Link className="button" href="/combat/active">
              ACTIVE
            </Link>
          </nav>
        </div>
      )}
    </section>
  );
}

function CombatHeader({
  title,
  detail,
  status,
}: {
  title: string;
  detail: string;
  status: string;
}) {
  return (
    <header className="game-status combat-game-status">
      <div className="game-mode-lockup">
        <span className="game-context">COMBAT / MATCH</span>
        <h1 id="combat-heading">{title}</h1>
      </div>
      <div className="game-status-facts combat-status-facts">
        <span className="combat-match-detail">{detail.toUpperCase()}</span>
        <strong className="combat-turn-state" aria-live="polite">
          {status.toUpperCase()}
        </strong>
      </div>
    </header>
  );
}

function CombatInput({
  draft,
  length,
  evidence,
  setDraft,
  submit,
  disabled,
}: {
  draft: string;
  length: number;
  evidence: Readonly<Record<string, EvidenceState>>;
  setDraft(value: string): void;
  submit(): void;
  disabled: boolean;
}) {
  const feedback = useFeedbackPreferences();
  const soundEnabled = feedback.settings.sound;
  const soundProfile = feedback.settings.keyboardSoundProfile;
  const playCue = useCallback(
    (event: KeyboardFeedbackEvent) => {
      if (soundEnabled) void playKeyboardSound(soundProfile, event);
    },
    [soundEnabled, soundProfile],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        disabled ||
        matchDirectNavigationShortcut(event) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (/^[a-zA-Z]$/.test(event.key) && draft.length < length) {
        event.preventDefault();
        setDraft(`${draft}${event.key.toLowerCase()}`);
        playCue('input');
      } else if (event.key === 'Backspace' && draft.length > 0) {
        event.preventDefault();
        setDraft(draft.slice(0, -1));
        playCue('delete');
      } else if (event.key === 'Enter' && draft.length === length) {
        event.preventDefault();
        playCue('submit');
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, draft, length, playCue, setDraft, submit]);
  return (
    <div
      className="combat-input"
      data-word-length={length}
      style={{ '--word-length': length } as CSSProperties}
    >
      <div className="board-row is-draft" aria-label="Current guess">
        {Array.from({ length }, (_, index) => (
          <div className="tile" key={index}>
            {draft[index]?.toUpperCase() ?? ''}
          </div>
        ))}
      </div>
      <GameKeyboard
        evidence={evidence}
        disabled={disabled}
        submitDisabled={disabled || draft.length !== length}
        deleteDisabled={disabled || !draft}
        onLetter={(letter) => {
          if (draft.length < length) {
            setDraft(`${draft}${letter}`);
            playCue('input');
          }
        }}
        onSubmit={() => {
          playCue('submit');
          submit();
        }}
        onDelete={() => {
          setDraft(draft.slice(0, -1));
          playCue('delete');
        }}
      />
    </div>
  );
}

function combatHistoryRow(
  state: MatchState,
  userId: string,
  rankedPracticeRatingDelta: number | null,
): AccountHistoryRow | null {
  if (state.authority === 2 && state.game?.outcome.terminal) {
    const game = state.game;
    const viewerSeat = game.viewerSeat;
    const opponent = game.players.find((player) => player.seat !== viewerSeat);
    const guesses = game.moves.filter((move) => move.type === 'guess' && move.seat === viewerSeat);
    if (game.status === 'cancelled' && guesses.length === 0) return null;
    return historyRowSchema.parse({
      id: `combat:${game.id}:${viewerSeat}`,
      user_id: userId,
      completed_at: game.endedAt ?? game.updatedAt,
      entry: {
        schemaVersion: 3,
        kind: game.scope === 'daily' ? 'combat-daily' : 'combat-practice',
        lane: game.scope,
        mode: game.mode,
        ranked: game.ranked,
        result:
          game.status === 'cancelled'
            ? 'cancelled'
            : game.outcome.winnerSeat === viewerSeat
              ? 'won'
              : game.outcome.winnerSeat
                ? 'lost'
                : 'draw',
        terminalReason: game.outcome.reason ?? game.status,
        wordLength: game.wordLength,
        difficulty: game.difficulty,
        hardMode: game.hardMode,
        goPuzzleCount: game.mode === 'go' ? (game.goPuzzleCount ?? 5) : null,
        acceptedGuesses: guesses.length,
        puzzlesSolved: game.playerState[viewerSeat].puzzlesSolved,
        points: game.playerState[viewerSeat].points,
        rewardCoins: 0,
        rewardXp: 0,
        ...(game.dailyDateKey === undefined ? {} : { dailyDate: game.dailyDateKey }),
        ratingDelta: game.ranked ? rankedPracticeRatingDelta : null,
        revealedAnswers: game.revealedAnswers ?? [],
        ...(opponent
          ? {
              opponent: {
                ...(opponent.publicProfileId === undefined
                  ? {}
                  : { publicProfileId: opponent.publicProfileId }),
                displayName: opponent.displayName || 'Rival',
              },
            }
          : {}),
      },
    });
  }

  if (state.authority === 1 && state.rankedDaily) {
    const game = state.rankedDaily;
    if (!['won', 'lost', 'cancelled'].includes(game.status)) return null;
    const viewerSeat = game.playerUserIds['player-one'] === userId ? 'player-one' : 'player-two';
    const guesses = game.moves.filter((move) => move.playerId === viewerSeat);
    if (game.status === 'cancelled' && guesses.length === 0) return null;
    const solved = new Set(
      guesses
        .filter((move) => move.tiles.every((tile) => tile.state === 'correct'))
        .map((move) => move.puzzleIndex),
    ).size;
    return historyRowSchema.parse({
      id: `combat:${game.id}:${viewerSeat}`,
      user_id: userId,
      completed_at: game.endedAt ?? game.updatedAt,
      entry: {
        schemaVersion: 2,
        kind: 'combat-daily',
        lane: 'daily',
        mode: game.mode,
        ranked: true,
        result:
          game.status === 'cancelled'
            ? 'cancelled'
            : game.winnerId === viewerSeat
              ? 'won'
              : game.winnerId
                ? 'lost'
                : 'draw',
        terminalReason: game.status,
        wordLength: game.wordLength,
        difficulty: game.difficulty,
        hardMode: game.hardMode,
        goPuzzleCount: game.mode === 'go' ? 5 : null,
        acceptedGuesses: guesses.length,
        puzzlesSolved: solved,
        points: solved,
        rewardCoins: 0,
        rewardXp: 0,
        dailyDate: game.dailyDateKey,
        ratingDelta: null,
        opponent: { displayName: 'Rival' },
      },
    });
  }

  if (state.authority === 0 && state.legacy) {
    const row = state.legacy;
    const game = row.projection;
    if (!['won', 'lost', 'cancelled'].includes(game.status)) return null;
    const viewerSeat =
      row.player_one_user_id === userId
        ? 'player-one'
        : row.player_two_user_id === userId
          ? 'player-two'
          : null;
    if (!viewerSeat) return null;
    const guesses = game.moves.filter((move) => move.seat === viewerSeat);
    if (game.status === 'cancelled' && guesses.length === 0) return null;
    const solved = new Set(
      guesses
        .filter((move) => move.tiles.every((tile) => tile.state === 'correct'))
        .map((move) => move.puzzleIndex ?? 0),
    ).size;
    return historyRowSchema.parse({
      id: `combat:${game.id}:${viewerSeat}`,
      user_id: userId,
      completed_at: row.updated_at,
      entry: {
        schemaVersion: 3,
        kind: 'combat-practice',
        lane: 'practice',
        mode: game.mode,
        ranked: false,
        result:
          game.status === 'cancelled'
            ? 'cancelled'
            : game.winnerSeat === viewerSeat
              ? 'won'
              : 'lost',
        terminalReason: game.status,
        wordLength: game.wordLength,
        difficulty: game.difficulty,
        hardMode: game.hardMode,
        goPuzzleCount: game.mode === 'go' ? game.goPuzzleCount : null,
        acceptedGuesses: guesses.length,
        puzzlesSolved: solved,
        points: solved,
        rewardCoins: 0,
        rewardXp: 0,
        ratingDelta: null,
        revealedAnswers: [game.answer],
        opponent: { displayName: 'Rival' },
      },
    });
  }

  return null;
}
