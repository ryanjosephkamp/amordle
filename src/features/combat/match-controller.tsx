'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
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
import { useAuth } from '@/components/providers';
import { AccountGate } from '@/components/route-states';
import { scoreGuess } from '@/domain/game';

interface MatchState {
  authority: 0 | 1 | 2;
  legacy?: LegacyRow;
  rankedDaily?: RankedDailyProjection;
  game?: CombatProjection;
}

const keyboardRows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const;

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

  if (match.isPending) return <p aria-live="polite">Loading match…</p>;
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
        moves={game.moves.map((move) => ({
          id: move.id,
          seat: move.playerId,
          guess: move.guess,
          tiles: move.tiles,
          acceptedAt: move.createdAt,
        }))}
        length={5}
      />
      {!terminal && (
        <CombatInput
          draft={draft}
          length={5}
          setDraft={setDraft}
          submit={submit}
          disabled={!turn || pending}
        />
      )}
      <p className="game-message" aria-live="assertive">
        {message}
      </p>
      {!terminal && (
        <button type="button" onClick={forfeit} disabled={pending}>
          {game.moves.length ? 'Forfeit match' : 'Cancel before play'}
        </button>
      )}
      {terminal && game.status !== 'cancelled' && (
        <div className="result-panel">
          <h2>Ranked result</h2>
          <p>The terminal result is durable. Rating settlement is idempotent.</p>
          <div className="action-row">
            <button className="primary" onClick={settle} disabled={pending}>
              Settle rating
            </button>
            <Link className="button" href={`/combat/results/${game.id}`}>
              View result
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
      {game.mode === 'go' && currentPuzzleIndex > 0 && (
        <div className="seeded-evidence">
          <h2>Chain evidence</h2>
          {Array.from({ length: currentPuzzleIndex }, (_, puzzleIndex) => {
            const solvedMove = game.moves.find(
              (move) =>
                (move.puzzleIndex ?? 0) === puzzleIndex &&
                move.tiles.every((tile) => tile.state === 'correct'),
            );
            return solvedMove ? (
              <TileRow
                key={solvedMove.id}
                guess={solvedMove.guess}
                tiles={scoreGuess(game.answer, solvedMove.guess)}
              />
            ) : null;
          })}
        </div>
      )}
      <MoveBoards moves={game.moves} length={game.wordLength} />
      {!terminal && game.status === 'playing' && (
        <CombatInput
          draft={draft}
          length={game.wordLength}
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
            View result
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
          Request rematch
        </button>
      ) : latest.viewer_can_accept ? (
        <div className="action-row">
          <button
            className="primary"
            disabled={act.isPending}
            onClick={() => act.mutate({ action: 'accept', request: latest })}
          >
            Accept rematch
          </button>
          <button
            disabled={act.isPending}
            onClick={() => act.mutate({ action: 'decline', request: latest })}
          >
            Decline
          </button>
        </div>
      ) : latest.viewer_can_cancel ? (
        <button
          disabled={act.isPending}
          onClick={() => act.mutate({ action: 'cancel', request: latest })}
        >
          Cancel rematch request
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
          <h2>Chain evidence</h2>
          {game.seededRows.map((row) => (
            <TileRow key={row.sourcePuzzleIndex} guess={row.guess} tiles={row.tiles} />
          ))}
        </div>
      )}
      <MoveBoards
        moves={game.moves
          .filter((move) => move.type === 'guess')
          .map((move) => ({
            id: move.actionId,
            seat: move.seat,
            guess: move.guess ?? '',
            tiles: move.tiles,
            acceptedAt: move.createdAt,
          }))}
        length={game.wordLength}
      />
      {!terminal && game.status === 'playing' && (
        <CombatInput
          draft={draft}
          length={game.wordLength}
          setDraft={setDraft}
          submit={submit}
          disabled={!turn || pending}
        />
      )}
      <p className="game-message" aria-live="assertive">
        {message}
      </p>
      {!terminal && game.capabilities.canForfeit && (
        <button type="button" onClick={forfeit} disabled={pending}>
          Forfeit match
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
                Settle rating
              </button>
            )}
            <Link className="button" href={`/combat/results/${game.id}`}>
              View result
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
    <header className="game-status">
      <div>
        <h1 id="combat-heading">{title}</h1>
        <p className="mono">{detail}</p>
      </div>
      <strong className="badge" aria-live="polite">
        {status}
      </strong>
    </header>
  );
}

function MoveBoards({
  moves,
  length,
}: {
  moves: Array<{
    id: string;
    seat: 'player-one' | 'player-two';
    guess: string;
    tiles: Array<{ letter: string; state: 'correct' | 'present' | 'absent' }>;
    acceptedAt: string;
  }>;
  length: number;
}) {
  const bySeat = useMemo(
    () => ({
      'player-one': moves.filter((move) => move.seat === 'player-one'),
      'player-two': moves.filter((move) => move.seat === 'player-two'),
    }),
    [moves],
  );
  return (
    <div className="dual-board">
      {(['player-one', 'player-two'] as const).map((seat) => (
        <section key={seat} aria-label={`${seat.replace('-', ' ')} board`}>
          <h2>{seat === 'player-one' ? 'Player one' : 'Player two'}</h2>
          <div className="compact-board">
            {bySeat[seat].map((move) => (
              <TileRow key={move.id} guess={move.guess} tiles={move.tiles} />
            ))}
            {!bySeat[seat].length && <EmptyTileRow length={length} />}
          </div>
        </section>
      ))}
    </div>
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
      {tiles.map((tile, index) => (
        <div
          key={`${index}:${tile.letter}`}
          className={`tile is-${tile.state}`}
          role="cell"
          aria-label={`${tile.letter}, ${tile.state}`}
        >
          {tile.letter.toUpperCase()}
        </div>
      ))}
    </div>
  );
}

function EmptyTileRow({ length }: { length: number }) {
  return (
    <div className="board-row" aria-label="No accepted guesses">
      {Array.from({ length }, (_, index) => (
        <div className="tile" key={index} />
      ))}
    </div>
  );
}

function CombatInput({
  draft,
  length,
  setDraft,
  submit,
  disabled,
}: {
  draft: string;
  length: number;
  setDraft(value: string): void;
  submit(): void;
  disabled: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (disabled || event.metaKey || event.ctrlKey || event.altKey) return;
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
    <div className="combat-input">
      <div className="board-row is-draft" aria-label="Current guess">
        {Array.from({ length }, (_, index) => (
          <div className="tile" key={index}>
            {draft[index]?.toUpperCase() ?? ''}
          </div>
        ))}
      </div>
      <div className="keyboard" aria-label="On-screen keyboard">
        {keyboardRows.map((row) => (
          <div className="keyboard-row" key={row}>
            {[...row].map((letter) => (
              <button
                type="button"
                className="key"
                key={letter}
                disabled={disabled}
                onClick={() => {
                  if (draft.length < length) setDraft(`${draft}${letter}`);
                }}
              >
                {letter.toUpperCase()}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="action-row">
        <button className="primary" disabled={disabled || draft.length !== length} onClick={submit}>
          Submit guess
        </button>
        <button disabled={disabled || !draft} onClick={() => setDraft(draft.slice(0, -1))}>
          Delete
        </button>
      </div>
    </div>
  );
}

function formatClock(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
