'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
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
  settleRankedDaily,
  settleRankedPractice,
} from '@/adapters/supabase/combat';
import type {
  CombatProjection,
  LegacyRow,
  RankedDailyProjection,
  RematchRequest,
} from '@/adapters/supabase/combat';
import { getBrowserSupabase } from '@/adapters/supabase/browser';
import { ServiceError, operationId } from '@/adapters/supabase/shared';
import { loadPublicWordSet } from '@/adapters/word-lists';
import { queueAccountCompletion, reconcileCompletionOutbox } from '@/application/completion-outbox';
import { matchDirectNavigationShortcut } from '@/application/keyboard-shortcuts';
import { GameKeyboard } from '@/components/game-keyboard';
import { useAuth } from '@/components/providers';
import { AccountGate, SkeletonRows } from '@/components/route-states';
import { derivePuzzleKeyboardEvidence, scoreGuess } from '@/domain/game';
import type { EvidenceState } from '@/domain/game';
import { historyRowSchema } from '@/domain/account-continuity';
import type { AccountHistoryRow } from '@/domain/account-continuity';
import { MoveBoards } from './combat-transcript';

interface MatchState {
  authority: 0 | 1 | 2;
  legacy?: LegacyRow;
  rankedDaily?: RankedDailyProjection;
  game?: CombatProjection;
}

async function loadMatch(gameId: string): Promise<MatchState> {
  try {
    return { authority: 2, game: await getCombatGame(gameId) };
  } catch (error) {
    if (
      error instanceof ServiceError &&
      !['P0002', 'NOT_FOUND', 'FORBIDDEN', '42501'].includes(error.code)
    ) {
      throw error;
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
    if (!legacy) throw new ServiceError('That match was not found.', 'NOT_FOUND');
    return { authority: 0, legacy };
  }
}

export function MatchController({ gameId }: { gameId: string }) {
  return (
    <AccountGate>
      <MatchControllerInner gameId={gameId} />
    </AccountGate>
  );
}

function MatchControllerInner({ gameId }: { gameId: string }) {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const match = useQuery({
    queryKey: ['combat', 'match', gameId],
    queryFn: () => loadMatch(gameId),
    refetchInterval: 5_000,
  });
  const length = match.data?.game?.wordLength ?? match.data?.legacy?.projection.wordLength;
  const words = useQuery({
    queryKey: ['word-set', length],
    queryFn: () => loadPublicWordSet(length ?? 0),
    enabled: match.data?.authority === 0 && Boolean(length),
    staleTime: Number.POSITIVE_INFINITY,
  });

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

  const command = useMutation({
    mutationFn: async (kind: 'guess' | 'advance' | 'cancel' | 'forfeit') => {
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
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : 'That action was not accepted.');
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
    mutationFn: () =>
      match.data?.authority === 1
        ? settleRankedDaily(gameId, `ranked-daily:settle:${gameId}`)
        : settleRankedPractice(gameId, operationId('combat:settle')),
    onSuccess: () => {
      setMessage('Rating settled.');
      void match.refetch();
    },
    onError: () => setMessage('Rating settlement needs attention. It is safe to retry.'),
  });

  useEffect(() => {
    const userId = auth.user?.id;
    const row = userId && match.data ? combatHistoryRow(match.data, userId) : null;
    if (!row || !userId) return;
    void queueAccountCompletion(row)
      .then(() => reconcileCompletionOutbox(userId))
      .then(() =>
        Promise.all([
          queryClient.invalidateQueries({ queryKey: ['completion-outbox', userId] }),
          queryClient.invalidateQueries({ queryKey: ['history', userId] }),
          queryClient.invalidateQueries({ queryKey: ['progress', userId] }),
        ]),
      )
      .catch(() => undefined);
  }, [auth.user?.id, match.data, queryClient]);

  if (match.isPending) return <SkeletonRows label="Loading match…" rows={5} />;
  if (match.isError || !match.data) {
    return (
      <section className="status-panel">
        <h2>Match unavailable</h2>
        <p>It may be absent, private to other players, or temporarily unavailable.</p>
        <button onClick={() => void match.refetch()}>Try again</button>
      </section>
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
        {...(words.data === undefined ? {} : { sanctionedWords: words.data })}
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
      draft={draft}
      setDraft={setDraft}
      submit={() => command.mutate('guess')}
      forfeit={() => {
        if (window.confirm('Forfeit this match? This cannot be reversed.'))
          command.mutate('forfeit');
      }}
      settle={() => settle.mutate()}
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
  sanctionedWords,
}: {
  row: LegacyRow;
  userId: string;
  draft: string;
  setDraft(value: string): void;
  submit(): void;
  pending: boolean;
  wordsReady: boolean;
  message: string;
  sanctionedWords?: ReadonlySet<string>;
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
      {game.mode === 'go' && currentPuzzleIndex > 0 && (
        <div className="seeded-evidence">
          <h2>SEED EVIDENCE</h2>
          {seededRows.map((seededRow) => (
            <TileRow key={seededRow.id} guess={seededRow.guess} tiles={seededRow.tiles} />
          ))}
        </div>
      )}
      <MoveBoards
        moves={visibleMoves}
        length={game.wordLength}
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
          {sanctionedWords && (
            <RematchActions sourceGameId={game.id} sanctionedWords={sanctionedWords} />
          )}
        </div>
      )}
    </section>
  );
}

function RematchActions({
  sourceGameId,
  sanctionedWords,
}: {
  sourceGameId: string;
  sanctionedWords: ReadonlySet<string>;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const requests = useQuery({
    queryKey: ['combat', 'rematches', sourceGameId],
    queryFn: () => listPracticeRematches(sourceGameId),
    refetchInterval: 5_000,
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
      const answers = [...sanctionedWords];
      if (!answers.length) throw new Error('The word list is unavailable.');
      return acceptPracticeRematch(
        request,
        answers,
        operationId(`rematch-accept:${request.request_id}`),
      );
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
  return (
    <div className="field-stack">
      {!latest || latest.request_status !== 'pending' ? (
        <button
          type="button"
          disabled={act.isPending}
          onClick={() => act.mutate({ action: 'request' })}
        >
          REQUEST REMATCH
        </button>
      ) : latest.viewer_can_accept ? (
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
      ) : latest.viewer_can_cancel ? (
        <button
          disabled={act.isPending}
          onClick={() => act.mutate({ action: 'cancel', request: latest })}
        >
          CANCEL REMATCH REQUEST
        </button>
      ) : null}
      <p aria-live="polite">{message}</p>
    </div>
  );
}

function AuthoritativeMatch({
  game,
  draft,
  setDraft,
  submit,
  forfeit,
  settle,
  pending,
  message,
}: {
  game: CombatProjection;
  draft: string;
  setDraft(value: string): void;
  submit(): void;
  forfeit(): void;
  settle(): void;
  pending: boolean;
  message: string;
}) {
  const terminal = game.outcome.terminal;
  const player = game.playerState[game.viewerSeat];
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
              {participant.displayName}
              {participant.seat === game.viewerSeat ? ' (you)' : ''}
            </span>
            <strong>{game.playerState[participant.seat].points} pts</strong>
            {game.playerState[participant.seat].timeRemainingMs !== null && (
              <ClockValue game={game} seat={participant.seat} />
            )}
          </div>
        ))}
      </div>
      {game.seededRows.length > 0 && (
        <div className="seeded-evidence">
          <h2>SEED EVIDENCE</h2>
          {game.seededRows.map((row) => (
            <TileRow key={row.sourcePuzzleIndex} guess={row.guess} tiles={row.tiles} />
          ))}
        </div>
      )}
      <MoveBoards
        moves={visibleMoves.map((move) => ({
          id: move.actionId,
          seat: move.seat,
          guess: move.guess ?? '',
          tiles: move.tiles,
          acceptedAt: move.createdAt,
        }))}
        length={game.wordLength}
        viewerSeat={game.viewerSeat}
        actorLabels={Object.fromEntries(
          game.players.map((participant) => [
            participant.seat,
            participant.seat === game.viewerSeat ? 'You' : participant.displayName || 'Rival',
          ]),
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
      {!terminal && game.capabilities.canForfeit && (
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
          {game.revealedAnswers && <p className="mono">{game.revealedAnswers.join(' · ')}</p>}
          <div className="action-row">
            {game.capabilities.canSettleRating && (
              <button className="primary" onClick={settle} disabled={pending}>
                UPDATE RATING
              </button>
            )}
            <Link className="button" href={`/combat/results/${game.id}`}>
              VIEW RESULT
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

function ClockValue({ game, seat }: { game: CombatProjection; seat: 'player-one' | 'player-two' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (game.outcome.terminal || game.currentTurn !== seat || game.status !== 'playing') {
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [game.currentTurn, game.outcome.terminal, game.status, seat]);
  const durable = game.playerState[seat].timeRemainingMs ?? 0;
  const elapsed =
    !game.outcome.terminal && game.currentTurn === seat && game.status === 'playing'
      ? Math.max(0, now - Date.parse(game.serverNow))
      : 0;
  return (
    <span className="mono" aria-label={`${seat.replace('-', ' ')} time remaining`}>
      {formatClock(Math.max(0, durable - elapsed))}
    </span>
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

function TileRow({
  guess,
  tiles,
}: {
  guess: string;
  tiles: Array<{ letter: string; state: 'correct' | 'present' | 'absent' }>;
}) {
  return (
    <div className="board-row" role="row" aria-label={guess}>
      {tiles.map((tile, index) => {
        const glyph = tile.state === 'correct' ? '✓' : tile.state === 'present' ? '~' : '×';
        return (
          <div
            key={`${index}:${tile.letter}`}
            className={`tile is-${tile.state}`}
            role="cell"
            aria-label={`${tile.letter}, ${tile.state}`}
          >
            <span className="tile-letter">{tile.letter.toUpperCase()}</span>
            <span className="tile-evidence" aria-hidden="true">
              {glyph}
            </span>
          </div>
        );
      })}
    </div>
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
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        disabled ||
        matchDirectNavigationShortcut(event) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return;
      }
      if (/^[a-zA-Z]$/.test(event.key) && draft.length < length) {
        event.preventDefault();
        setDraft(`${draft}${event.key.toLowerCase()}`);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        setDraft(draft.slice(0, -1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, draft, length, setDraft, submit]);
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
          if (draft.length < length) setDraft(`${draft}${letter}`);
        }}
        onSubmit={submit}
        onDelete={() => setDraft(draft.slice(0, -1))}
      />
    </div>
  );
}

function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function combatHistoryRow(state: MatchState, userId: string): AccountHistoryRow | null {
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
        schemaVersion: 2,
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
        ratingDelta: null,
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
        schemaVersion: 2,
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
        opponent: { displayName: 'Rival' },
      },
    });
  }

  return null;
}
