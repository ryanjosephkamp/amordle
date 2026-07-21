import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useAuth } from '../../app/auth-context';
import { usePlayerState } from '../../app/player-state-context';
import { Button, ButtonLink } from '../../components/Button';
import { Disclosure } from '../../components/Disclosure';
import {
  GameBoard,
  Keyboard,
  TileLegend,
  type Tile,
  type TileState,
} from '../../components/GameBoard';
import { emptyRow } from '../../components/gameBoardData';
import { Icon } from '../../components/Icon';
import { StatusDot } from '../../components/Surface';
import { canAccessDaily, dailyDateKey, dailySeedNamespace, isDateKey } from '../../domain/daily';
import {
  createOgSession,
  deleteLetter,
  draftWord,
  enterLetter,
  mergeKeyboardEvidence,
  revealOgAnswer,
  submitOgGuess,
  type OgSession,
} from '../../domain/game';
import {
  advanceGoSession,
  createGoSession,
  currentGoPuzzle,
  dailyGoStreamKey,
  goAnswerGenerationVersion,
  goKeyboardEvidence,
  revealGoAnswer,
  selectDeterministicChain,
  submitGoGuess,
  type GoSession,
} from '../../domain/go';
import { answerPoolForDifficulty, type Difficulty, type WordList } from '../../domain/words';
import { wordListProvider } from '../../services/word-list-provider';
import { soloSessionRepository, type SoloSession } from './solo-session-repository';

type SoloConfig = {
  mode: 'og' | 'go';
  scope: 'daily' | 'practice';
  length: number;
  difficulty: Difficulty;
  hardMode: boolean;
  count: 5 | 7 | 10;
  dateKey: string;
};

function integerParam(search: URLSearchParams, name: string, fallback: number): number {
  const raw = search.get(name);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isInteger(value) ? value : fallback;
}

function configuration(mode: 'og' | 'go', scope: 'daily' | 'practice', search: string): SoloConfig {
  const params = new URLSearchParams(search);
  const requestedLength = integerParam(params, 'length', mode === 'go' ? 7 : 5);
  const requestedCount = integerParam(params, 'count', 5);
  const difficultyValue = params.get('difficulty');
  const dateValue = params.get('date');
  return {
    mode,
    scope,
    length: Math.min(35, Math.max(2, requestedLength)),
    difficulty:
      difficultyValue === 'casual' || difficultyValue === 'standard' ? difficultyValue : 'expert',
    hardMode: params.get('hard') === '1',
    count: requestedCount === 7 || requestedCount === 10 ? requestedCount : 5,
    dateKey: dateValue && isDateKey(dateValue) ? dateValue : dailyDateKey('local'),
  };
}

function sessionKey(config: SoloConfig): string {
  return [
    config.scope,
    config.mode,
    config.scope === 'daily' ? config.dateKey : 'active',
    `${config.length}l`,
    config.difficulty,
    config.hardMode ? 'hard' : 'normal',
    config.mode === 'go' ? `${config.count}p` : 'single',
  ].join(':');
}

function selectAnswers(
  config: SoloConfig,
  wordList: WordList,
  generation: number,
): readonly string[] {
  const pool = answerPoolForDifficulty(wordList, config.difficulty);
  const count = config.mode === 'go' ? (config.scope === 'daily' ? 5 : config.count) : 1;
  const stream =
    config.scope === 'daily'
      ? config.mode === 'go'
        ? dailyGoStreamKey({
            player: 'solo',
            lane: 'unranked',
            dateKey: config.dateKey,
            wordLength: config.length,
            difficulty: config.difficulty,
            puzzleCount: count,
          })
        : dailySeedNamespace({
            player: 'solo',
            mode: config.mode,
            dateKey: config.dateKey,
            version: wordList.revision,
          })
      : `solo-practice:${config.mode}:${config.length}:${config.difficulty}:${generation}:${wordList.revision}`;
  return selectDeterministicChain(pool, count, stream);
}

function createSession(config: SoloConfig, wordList: WordList, generation: number): SoloSession {
  const answers = selectAnswers(config, wordList, generation);
  const id = `${sessionKey(config)}:${wordList.revision}:${generation}`;
  if (config.mode === 'go') {
    return createGoSession({
      id,
      answers,
      scope: config.scope,
      difficulty: config.difficulty,
      hardMode: config.hardMode,
      answerGenerationVersion: goAnswerGenerationVersion(config.dateKey, 'go'),
    });
  }
  const answer = answers[0];
  if (!answer) throw new Error('The selected answer pool was empty.');
  return createOgSession({
    id,
    answer,
    scope: config.scope,
    difficulty: config.difficulty,
    hardMode: config.hardMode,
  });
}

function activePuzzle(session: SoloSession): OgSession {
  return session.mode === 'go' ? currentGoPuzzle(session) : session;
}

function updateGoPuzzle(session: GoSession, puzzle: OgSession): GoSession {
  const puzzles = [...session.puzzles];
  puzzles[session.currentPuzzleIndex] = puzzle;
  return { ...session, puzzles, updatedAt: puzzle.updatedAt };
}

function sessionRows(session: SoloSession): Tile[][] {
  const puzzle = activePuzzle(session);
  const submitted = puzzle.guesses.map((guess) =>
    guess.tiles.map((tile) => ({ letter: tile.letter, state: tile.state as TileState })),
  );
  const rows: Tile[][] = [...submitted];
  if (puzzle.status === 'playing') rows.push(emptyRow(puzzle.wordLength, draftWord(puzzle)));
  while (rows.length < puzzle.maxAttempts) rows.push(emptyRow(puzzle.wordLength));
  return rows.slice(0, Math.max(puzzle.maxAttempts, submitted.length + 1));
}

function LoadingGame({ message }: { message: string }) {
  return (
    <section className="route-loading" aria-live="polite">
      <span aria-hidden="true" />
      <p>{message}</p>
      <small>Only the selected word length is requested.</small>
    </section>
  );
}

function SoloRuntime({ config, wordList }: { config: SoloConfig; wordList: WordList }) {
  const { identity } = useAuth();
  const { reward } = usePlayerState();
  const repository = useMemo(() => soloSessionRepository(sessionKey(config)), [config]);
  const initial = useMemo(() => {
    const loaded = repository.load(identity);
    if (loaded.status === 'ok') {
      const restored = loaded.envelope.payload;
      const puzzle = activePuzzle(restored);
      if (
        restored.mode === config.mode &&
        restored.scope === config.scope &&
        puzzle.wordLength === config.length &&
        restored.difficulty === config.difficulty &&
        restored.hardMode === config.hardMode
      ) {
        return { session: restored, revision: loaded.envelope.revision, restored: true };
      }
    }
    return { session: createSession(config, wordList, 0), revision: 0, restored: false };
  }, [config, identity, repository, wordList]);
  const [session, setSession] = useState(initial.session);
  const [generation, setGeneration] = useState(0);
  const revision = useRef(initial.revision);
  const [message, setMessage] = useState(
    initial.restored
      ? 'Saved session restored from this account namespace.'
      : 'Enter a valid word. Attempts are not consumed by rejected guesses.',
  );
  const [confirmReveal, setConfirmReveal] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const focus = new URLSearchParams(location.search).get('focus') === '1';
  const validWords = useMemo(() => new Set(wordList.validGuesses), [wordList]);
  const puzzle = activePuzzle(session);
  const keyboardEvidence = useMemo(
    () =>
      session.mode === 'go' ? goKeyboardEvidence(session) : mergeKeyboardEvidence(session.guesses),
    [session],
  );

  const persist = useCallback(
    (next: SoloSession, confirmation?: string): boolean => {
      const result = repository.save(identity, next, {
        expectedRevision: revision.current,
        replaceCorrupt: true,
      });
      if (!result.ok) {
        setMessage(
          result.reason === 'conflict'
            ? 'A newer saved session exists. Reload before continuing.'
            : 'Local persistence is unavailable. The durable action was not confirmed.',
        );
        return false;
      }
      revision.current = result.envelope.revision;
      setSession(next);
      if (confirmation) setMessage(confirmation);
      return true;
    },
    [identity, repository],
  );

  const rewardTerminal = useCallback(
    (completed: SoloSession) => {
      if (completed.status === 'playing') return;
      const puzzles = completed.mode === 'go' ? completed.puzzles : [completed];
      reward({
        gameId: completed.id,
        status: completed.status,
        mode: completed.mode,
        scope: completed.scope,
        wordLength: activePuzzle(completed).wordLength,
        puzzleCount: completed.mode === 'go' ? puzzles.length : 1,
        unusedAttempts:
          completed.status === 'won'
            ? puzzles.reduce(
                (total, item) => total + Math.max(0, item.maxAttempts - item.guesses.length),
                0,
              )
            : 0,
      });
    },
    [reward],
  );

  useEffect(() => {
    if (initial.restored) return;
    const result = repository.save(identity, initial.session, { replaceCorrupt: true });
    if (result.ok) revision.current = result.envelope.revision;
  }, [identity, initial, repository]);

  const submit = useCallback(() => {
    const current = activePuzzle(session);
    if (session.mode === 'go') {
      const result = submitGoGuess(session, draftWord(current), validWords);
      if (!result.ok) {
        setMessage(result.error.message);
        return;
      }
      const solved = result.session.pendingAdvance !== undefined;
      const saved = persist(
        result.session,
        result.session.status === 'won'
          ? 'GO chain complete. Result saved locally.'
          : result.session.status === 'lost'
            ? 'No attempts remain. The chain result was saved.'
            : solved
              ? 'Puzzle solved and saved. Advance when ready.'
              : 'Guess accepted and saved.',
      );
      if (saved) rewardTerminal(result.session);
      return;
    }
    const result = submitOgGuess(session, draftWord(session), validWords);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    const saved = persist(
      result.session,
      result.session.status === 'won'
        ? 'Puzzle solved. Completion recorded locally.'
        : result.session.status === 'lost'
          ? 'No attempts remain. The result was saved.'
          : 'Guess accepted and saved.',
    );
    if (saved) rewardTerminal(result.session);
  }, [persist, rewardTerminal, session, validWords]);

  const onKey = useCallback(
    (key: string) => {
      if (key === 'ENTER') {
        submit();
        return;
      }
      const current = activePuzzle(session);
      const nextPuzzle = key === 'BACKSPACE' ? deleteLetter(current) : enterLetter(current, key);
      if (nextPuzzle === current) return;
      persist(session.mode === 'go' ? updateGoPuzzle(session, nextPuzzle) : nextPuzzle);
    },
    [persist, session, submit],
  );

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.key === 'Enter') onKey('ENTER');
      else if (event.key === 'Backspace' || event.key === 'Delete') onKey('BACKSPACE');
      else if (/^[a-z]$/i.test(event.key)) onKey(event.key.toUpperCase());
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onKey]);

  const rows = sessionRows(session);
  const activeRow = puzzle.status === 'playing' ? puzzle.guesses.length : undefined;
  const resultVisible = session.status !== 'playing';
  const goCount = session.mode === 'go' ? session.puzzles.length : 1;
  const puzzleIndex = session.mode === 'go' ? session.currentPuzzleIndex : 0;

  const setFocus = (enabled: boolean) => {
    const search = new URLSearchParams(location.search);
    if (enabled) search.set('focus', '1');
    else search.delete('focus');
    navigate(`${location.pathname}${search.size ? `?${search}` : ''}`);
  };

  const newSession = () => {
    const nextGeneration = generation + 1;
    const next = createSession(config, wordList, nextGeneration);
    if (persist(next, 'New deterministic session saved.')) setGeneration(nextGeneration);
  };

  return (
    <div className={`game-layout ${focus ? 'game-layout--focus' : ''}`}>
      <aside
        className="game-spine"
        aria-label={session.mode === 'go' ? 'GO chain' : 'Puzzle context'}
      >
        <p className="eyebrow">Solo</p>
        <h1>
          {config.scope} {config.mode}
        </h1>
        <p>
          {config.scope === 'practice'
            ? 'Practice solo. Build your evidence.'
            : `${config.dateKey} · local Daily.`}
        </p>
        {session.mode === 'go' ? (
          <ol className="chain-spine">
            {session.puzzles.map((item, index) => (
              <li
                className={
                  index < puzzleIndex ? 'is-complete' : index === puzzleIndex ? 'is-active' : ''
                }
                key={item.id}
              >
                <span>{index + 1}</span>
                <div>
                  <strong>
                    {index < puzzleIndex
                      ? item.answer.toUpperCase()
                      : index === puzzleIndex
                        ? 'Active'
                        : 'Pending'}
                  </strong>
                  <small>
                    {index < puzzleIndex
                      ? 'Won'
                      : index === puzzleIndex
                        ? `Puzzle ${index + 1} of ${goCount}`
                        : 'Locked'}
                  </small>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mode-card">
            <span className="mode-mark">OG</span>
            <p>One word · one board</p>
          </div>
        )}
      </aside>

      <section className="game-stage" aria-labelledby="game-context">
        <div className="game-stage__top">
          <p id="game-context">
            <span>Solo</span> · {config.scope} {config.mode} · {puzzle.wordLength} letters ·{' '}
            <span>{config.difficulty}</span>
            {session.mode === 'go' ? ` · puzzle ${puzzleIndex + 1} / ${goCount}` : ''}
          </p>
          <Button tone="quiet" className="focus-button" onClick={() => setFocus(!focus)}>
            <Icon name="focus" />
            {focus ? 'Exit focus' : 'Focus'}
          </Button>
        </div>
        <GameBoard rows={rows} length={puzzle.wordLength} activeRow={activeRow} />
        <p className="game-message" role="status" aria-live="polite">
          {message}
        </p>
        <p className="attempts">
          {Math.max(0, puzzle.maxAttempts - puzzle.guesses.length)} attempts remaining
        </p>
        <Keyboard
          evidence={keyboardEvidence as Record<string, TileState>}
          disabled={
            puzzle.status !== 'playing' || Boolean(session.mode === 'go' && session.pendingAdvance)
          }
          onKey={onKey}
        />
        <TileLegend />
        {session.mode === 'go' && session.pendingAdvance ? (
          <div className="game-result">
            <StatusDot>Puzzle {puzzleIndex + 1} saved</StatusDot>
            <Button
              tone="primary"
              onClick={() =>
                persist(
                  advanceGoSession(session),
                  'Next puzzle ready. Prior-answer evidence carried forward.',
                )
              }
            >
              Continue to puzzle {puzzleIndex + 2}
            </Button>
          </div>
        ) : null}
        {resultVisible ? (
          <section className="game-result" aria-labelledby="result-title">
            <StatusDot tone={session.status === 'won' ? 'green' : 'red'}>
              {session.status === 'won' ? 'Complete' : 'Puzzle ended'}
            </StatusDot>
            <h2 id="result-title">
              {session.status === 'won'
                ? `${config.mode.toUpperCase()} ${session.mode === 'go' ? 'chain' : 'puzzle'} complete`
                : 'No attempts remain'}
            </h2>
            <p>
              {session.status === 'won'
                ? `Completed with ${session.mode === 'go' ? session.puzzles.reduce((total, item) => total + item.guesses.length, 0) : session.guesses.length} accepted guesses.`
                : `The active answer was ${puzzle.answer.toUpperCase()}.`}
            </p>
            <div className="button-row">
              <Button tone="primary" onClick={newSession}>
                New {config.mode.toUpperCase()} {session.mode === 'go' ? 'chain' : 'game'}
              </Button>
              <Button
                onClick={() =>
                  void navigator.clipboard?.writeText(
                    `Amordle ${config.mode.toUpperCase()} · ${session.status} · ${puzzle.guesses.length}/${puzzle.maxAttempts}`,
                  )
                }
              >
                Copy result
              </Button>
              <ButtonLink to="/definitions">Definitions</ButtonLink>
              <ButtonLink to="/history">History</ButtonLink>
            </div>
          </section>
        ) : null}
      </section>

      <aside className="game-tools">
        <h2>Session</h2>
        <dl className="data-list">
          <div>
            <dt>Puzzle</dt>
            <dd>
              {puzzleIndex + 1} / {goCount}
            </dd>
          </div>
          <div>
            <dt>Letters</dt>
            <dd>{puzzle.wordLength}</dd>
          </div>
          <div>
            <dt>Attempts</dt>
            <dd>{puzzle.maxAttempts - puzzle.guesses.length}</dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>{identity.kind === 'guest' ? 'Guest local' : 'Account local'}</dd>
          </div>
        </dl>
        {config.scope === 'practice' ? (
          <>
            <h2>Practice tools</h2>
            <ButtonLink to="/marketplace">
              <Icon name="info" /> Manage reveal inventory
            </ButtonLink>
            <ButtonLink to="/marketplace">
              <Icon name="backspace" /> Manage removal inventory
            </ButtonLink>
          </>
        ) : null}
        <Disclosure label="Game controls" meta="Setup locked after first guess">
          <Button tone="danger" onClick={() => setConfirmReveal(true)}>
            Give up / reveal answer
          </Button>
          {confirmReveal ? (
            <div className="confirmation-bar" role="alertdialog" aria-label="Confirm reveal answer">
              <p>This records a loss. Reveal the answer?</p>
              <Button
                tone="danger"
                onClick={() => {
                  const next =
                    session.mode === 'go'
                      ? revealGoAnswer(session, true)
                      : revealOgAnswer(session, true);
                  if (persist(next, 'Answer revealed. Loss recorded locally.'))
                    rewardTerminal(next);
                  setConfirmReveal(false);
                }}
              >
                Reveal answer
              </Button>
              <Button onClick={() => setConfirmReveal(false)}>Keep playing</Button>
            </div>
          ) : null}
        </Disclosure>
      </aside>
    </div>
  );
}

export function SoloGamePage() {
  const params = useParams();
  const location = useLocation();
  const mode = params.mode === 'go' ? 'go' : 'og';
  const scope = params.scope === 'daily' ? 'daily' : 'practice';
  const config = useMemo(
    () => configuration(mode, scope, location.search),
    [location.search, mode, scope],
  );
  const { progression } = usePlayerState();
  const todayKey = dailyDateKey('local');
  const wordList = useQuery({
    queryKey: ['word-list', config.length],
    queryFn: ({ signal }) => wordListProvider.load(config.length, signal),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  if (
    config.scope === 'daily' &&
    !canAccessDaily({
      mode: config.mode,
      dateKey: config.dateKey,
      todayKey,
      unlocked: progression.unlockedDailies,
    })
  ) {
    return (
      <section className="route-error" role="alert">
        <p className="eyebrow">Daily access</p>
        <h1>Past puzzle locked</h1>
        <p>Unlock this exact mode and local date from the Daily calendar before play.</p>
        <ButtonLink to="/calendar">Open Daily calendar</ButtonLink>
      </section>
    );
  }
  if (wordList.isPending)
    return <LoadingGame message={`Loading ${config.length}-letter word data…`} />;
  if (wordList.isError || !wordList.data) {
    return (
      <section className="route-error" role="alert">
        <p className="eyebrow">Word data</p>
        <h1>Selected length unavailable</h1>
        <p>The requested word data could not be validated. No session was changed.</p>
        <p className="continuity-note">
          {wordList.error instanceof Error ? wordList.error.message : 'Unknown word-data failure.'}
        </p>
        <Button tone="primary" onClick={() => void wordList.refetch()}>
          Retry
        </Button>
        <ButtonLink to="/play">Choose another setup</ButtonLink>
      </section>
    );
  }
  return (
    <SoloRuntime
      key={`${sessionKey(config)}:${wordList.data.revision}`}
      config={config}
      wordList={wordList.data}
    />
  );
}
