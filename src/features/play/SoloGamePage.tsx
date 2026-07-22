import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router';
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
import { canAccessDaily, dailyDateKey, isDateKey } from '../../domain/daily';
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
  autoAdvanceGoSession,
  createGoSession,
  currentGoPuzzle,
  goAutoAdvanceRemainingDelay,
  goAnswerGenerationVersion,
  goKeyboardEvidence,
  goPriorSeededEvidence,
  revealGoAnswer,
  selectDailyGoAnswers,
  selectDeterministicChain,
  submitGoGuess,
  type GoSession,
} from '../../domain/go';
import {
  answerPoolForDifficulty,
  selectDailyOgAnswer,
  type Difficulty,
  type WordList,
} from '../../domain/words';
import {
  readSoundEnabled,
  settingsStorageKey,
  SOUND_PREFERENCE_EVENT,
  soundEngine,
} from '../../services/sound-controller';
import { wordListProvider } from '../../services/word-list-provider';
import {
  commitPracticeGeneration,
  currentPracticeGeneration,
  type PracticeGenerationLane,
} from './practice-generation-repository';
import { ownerStorageSegment } from '../../persistence/local-repository';
import { normalizeSoloLaunch, type SoloLaunchSpec } from './solo-launch';
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

type SoloRouteResolution =
  | { readonly ok: false; readonly message: string }
  | { readonly ok: true; readonly config: SoloConfig; readonly canonicalSearch?: string };

function resolveSoloRoute(
  mode: 'og' | 'go',
  scope: 'daily' | 'practice',
  search: string,
): SoloRouteResolution {
  const params = new URLSearchParams(search);
  const normalized = normalizeSoloLaunch({
    mode,
    scope,
    wordLength: params.get('length'),
    goPuzzleCount: params.get('count'),
    difficulty: params.get('difficulty'),
    hardMode: params.get('hard'),
  });
  if (!normalized.ok) return { ok: false, message: normalized.message };
  const dateValue = params.get('date');
  const dateKey = dateValue && isDateKey(dateValue) ? dateValue : dailyDateKey('local');
  const spec: SoloLaunchSpec = normalized.spec;
  const config: SoloConfig = {
    mode: spec.mode,
    scope: spec.scope,
    length: spec.wordLength,
    difficulty: spec.difficulty,
    hardMode: spec.hardMode,
    count: spec.mode === 'go' ? spec.goPuzzleCount : 5,
    dateKey,
  };

  const canonical = new URLSearchParams();
  if (scope === 'practice' && params.has('length')) {
    canonical.set('length', String(spec.wordLength));
  }
  if (scope === 'practice' && spec.mode === 'go' && params.has('count')) {
    canonical.set('count', String(spec.goPuzzleCount));
  }
  if (spec.difficulty !== 'expert') canonical.set('difficulty', spec.difficulty);
  if (spec.hardMode) canonical.set('hard', '1');
  if (scope === 'daily' && dateValue && isDateKey(dateValue)) canonical.set('date', dateValue);
  if (params.get('focus') === '1') canonical.set('focus', '1');
  const canonicalSearch = canonical.toString();
  const currentSearch = new URLSearchParams(search).toString();
  return {
    ok: true,
    config,
    ...(canonicalSearch !== currentSearch ? { canonicalSearch } : {}),
  };
}

function sessionKey(config: SoloConfig): string {
  if (config.scope === 'daily') return ['daily', config.mode, config.dateKey].join(':');
  return [
    config.scope,
    config.mode,
    'active',
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
  if (config.scope === 'daily') {
    if (config.mode === 'go') {
      return selectDailyGoAnswers({
        catalog: pool,
        dateKey: config.dateKey,
        difficulty: config.difficulty,
      }).answers;
    }
    return [selectDailyOgAnswer(pool, config.dateKey)];
  }
  const count = config.mode === 'go' ? config.count : 1;
  return selectDeterministicChain(
    pool,
    count,
    `solo-practice:${config.mode}:${config.length}:${config.difficulty}:${config.hardMode ? 'hard' : 'normal'}:${config.count}:${generation}:${wordList.revision}`,
  );
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

function sessionRows(session: SoloSession): {
  readonly rows: Tile[][];
  readonly seededCount: number;
} {
  const puzzle = activePuzzle(session);
  const seeded =
    session.mode === 'go'
      ? goPriorSeededEvidence(session).map((guess) =>
          guess.tiles.map((tile) => ({ letter: tile.letter, state: tile.state as TileState })),
        )
      : [];
  const submitted = puzzle.guesses.map((guess) =>
    guess.tiles.map((tile) => ({ letter: tile.letter, state: tile.state as TileState })),
  );
  const playableRows: Tile[][] = [...submitted];
  if (puzzle.status === 'playing') {
    playableRows.push(emptyRow(puzzle.wordLength, draftWord(puzzle)));
  }
  while (playableRows.length < puzzle.maxAttempts) playableRows.push(emptyRow(puzzle.wordLength));
  return {
    rows: [...seeded, ...playableRows.slice(0, Math.max(puzzle.maxAttempts, submitted.length + 1))],
    seededCount: seeded.length,
  };
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
  const generationLane = useMemo<PracticeGenerationLane>(
    () => ({
      mode: config.mode,
      wordLength: config.length,
      difficulty: config.difficulty,
      goPuzzleCount: config.mode === 'go' ? config.count : 1,
    }),
    [config],
  );
  const initial = useMemo(() => {
    const practiceGeneration =
      config.scope === 'practice' ? currentPracticeGeneration(identity, generationLane) : 0;
    const loaded = repository.load(identity);
    if (loaded.status === 'ok') {
      const restored = loaded.envelope.payload;
      const puzzle = activePuzzle(restored);
      const dailyConfigurationLocked =
        config.scope === 'daily' && (puzzle.guesses.length > 0 || restored.status !== 'playing');
      if (
        restored.mode === config.mode &&
        restored.scope === config.scope &&
        puzzle.wordLength === config.length &&
        (dailyConfigurationLocked || restored.difficulty === config.difficulty) &&
        (dailyConfigurationLocked || restored.hardMode === config.hardMode)
      ) {
        return {
          session: restored,
          revision: loaded.envelope.revision,
          restored: true,
          generation: practiceGeneration,
        };
      }
      return {
        session: createSession(config, wordList, practiceGeneration),
        revision: loaded.envelope.revision,
        restored: false,
        generation: practiceGeneration,
      };
    }
    return {
      session: createSession(config, wordList, practiceGeneration),
      revision: 0,
      restored: false,
      generation: practiceGeneration,
    };
  }, [config, generationLane, identity, repository, wordList]);
  const [session, setSession] = useState(initial.session);
  const revision = useRef(initial.revision);
  const [message, setMessage] = useState(
    initial.restored
      ? 'Saved session restored from this account namespace.'
      : 'Enter a valid word. Attempts are not consumed by rejected guesses.',
  );
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() =>
    readSoundEnabled(identity, typeof localStorage === 'undefined' ? undefined : localStorage),
  );
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
        puzzleCount:
          completed.mode === 'go'
            ? completed.status === 'lost'
              ? completed.currentPuzzleIndex + 1
              : puzzles.length
            : 1,
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
    const result = repository.save(identity, initial.session, {
      expectedRevision: initial.revision,
      replaceCorrupt: true,
    });
    if (result.ok) revision.current = result.envelope.revision;
  }, [identity, initial, repository]);

  useEffect(() => {
    const storageKey = settingsStorageKey(identity);
    const listener = (event: Event) => {
      const custom = event as CustomEvent<{ storageKey?: string; enabled?: boolean }>;
      if (custom.detail?.storageKey === storageKey && typeof custom.detail.enabled === 'boolean') {
        setSoundEnabled(custom.detail.enabled);
      }
    };
    window.addEventListener(SOUND_PREFERENCE_EVENT, listener);
    return () => window.removeEventListener(SOUND_PREFERENCE_EVENT, listener);
  }, [identity]);

  const submit = useCallback(() => {
    const current = activePuzzle(session);
    if (session.mode === 'go') {
      const result = submitGoGuess(session, draftWord(current), validWords);
      if (!result.ok) {
        setMessage(result.error.message);
        void soundEngine.play('invalid', soundEnabled);
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
              ? 'Puzzle solved and saved. The next puzzle opens in two seconds.'
              : 'Guess accepted and saved.',
      );
      if (saved) {
        rewardTerminal(result.session);
        void soundEngine.play(
          result.session.status === 'won'
            ? 'win'
            : result.session.status === 'lost'
              ? 'loss'
              : solved
                ? 'solve'
                : 'tile-submit',
          soundEnabled,
        );
      }
      return;
    }
    const result = submitOgGuess(session, draftWord(session), validWords);
    if (!result.ok) {
      setMessage(result.error.message);
      void soundEngine.play('invalid', soundEnabled);
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
    if (saved) {
      rewardTerminal(result.session);
      void soundEngine.play(
        result.session.status === 'won'
          ? 'win'
          : result.session.status === 'lost'
            ? 'loss'
            : 'tile-submit',
        soundEnabled,
      );
    }
  }, [persist, rewardTerminal, session, soundEnabled, validWords]);

  const onKey = useCallback(
    (key: string) => {
      const current = activePuzzle(session);
      if (
        current.status !== 'playing' ||
        session.status !== 'playing' ||
        (session.mode === 'go' && session.pendingAdvance)
      )
        return;
      if (key === 'ENTER') {
        submit();
        return;
      }
      const nextPuzzle = key === 'BACKSPACE' ? deleteLetter(current) : enterLetter(current, key);
      if (nextPuzzle === current) return;
      if (persist(session.mode === 'go' ? updateGoPuzzle(session, nextPuzzle) : nextPuzzle)) {
        void soundEngine.play('keyboard-click', soundEnabled);
      }
    },
    [persist, session, soundEnabled, submit],
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
      if (event.key === 'Enter') {
        event.preventDefault();
        onKey('ENTER');
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        onKey('BACKSPACE');
      } else if (/^[a-z]$/i.test(event.key)) {
        event.preventDefault();
        onKey(event.key.toUpperCase());
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [onKey]);

  useEffect(() => {
    if (session.mode !== 'go' || !session.pendingAdvance || session.status !== 'playing') return;
    const remaining = goAutoAdvanceRemainingDelay(session);
    if (remaining === undefined) return;
    const timer = window.setTimeout(() => {
      const advanced = autoAdvanceGoSession(session);
      if (advanced !== session) {
        persist(advanced, 'Next puzzle ready. Prior-answer evidence carried forward.');
      }
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [persist, session]);

  const board = sessionRows(session);
  const activeRow =
    puzzle.status === 'playing' ? board.seededCount + puzzle.guesses.length : undefined;
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
    if (config.scope !== 'practice') return;
    let currentGeneration = currentPracticeGeneration(identity, generationLane);
    let nextGeneration = currentGeneration + 1;
    let next = createSession(config, wordList, nextGeneration);

    // If a prior session save succeeded but its counter commit was interrupted,
    // reconcile that exact generation before moving to the next deterministic seed.
    if (next.id === session.id) {
      if (!commitPracticeGeneration(identity, generationLane, currentGeneration, nextGeneration)) {
        setMessage(
          'The Practice generation could not be reconciled. The current game is unchanged.',
        );
        return;
      }
      currentGeneration = nextGeneration;
      nextGeneration += 1;
      next = createSession(config, wordList, nextGeneration);
    }

    if (!persist(next, 'New deterministic session saved.')) return;
    if (!commitPracticeGeneration(identity, generationLane, currentGeneration, nextGeneration)) {
      setMessage(
        'New deterministic session saved. Its generation counter will reconcile before the next game.',
      );
    }
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
            <span>{session.difficulty}</span>
            {session.mode === 'go' ? ` · puzzle ${puzzleIndex + 1} / ${goCount}` : ''}
          </p>
          <Button tone="quiet" className="focus-button" onClick={() => setFocus(!focus)}>
            <Icon name="focus" />
            {focus ? 'Exit focus' : 'Focus'}
          </Button>
        </div>
        <GameBoard
          rows={board.rows}
          length={puzzle.wordLength}
          activeRow={activeRow}
          rowLabels={board.rows.map((_, index) =>
            index < board.seededCount ? `P${index + 1}` : undefined,
          )}
        />
        <p className="game-message" role="status" aria-live="polite">
          {message}
        </p>
        <p className="attempts">
          {Math.max(0, puzzle.maxAttempts - puzzle.guesses.length)} attempts remaining
        </p>
        <div
          className={`game-transition-band ${session.mode === 'go' && session.pendingAdvance ? 'is-active' : ''}`}
          aria-live="polite"
        >
          {session.mode === 'go' && session.pendingAdvance ? (
            <StatusDot>Puzzle {puzzleIndex + 1} saved</StatusDot>
          ) : null}
          {session.mode === 'go' && session.pendingAdvance ? (
            <span>Holding solved evidence · puzzle {puzzleIndex + 2} opens automatically</span>
          ) : null}
        </div>
        {session.status === 'playing' && !(session.mode === 'go' && session.pendingAdvance) ? (
          <>
            <Keyboard evidence={keyboardEvidence as Record<string, TileState>} onKey={onKey} />
            <TileLegend />
          </>
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
              {config.scope === 'practice' ? (
                <Button tone="primary" onClick={newSession}>
                  New {config.mode.toUpperCase()} {session.mode === 'go' ? 'chain' : 'game'}
                </Button>
              ) : null}
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
        {config.scope === 'practice' &&
        session.status === 'playing' &&
        puzzle.status === 'playing' &&
        !(session.mode === 'go' && session.pendingAdvance) ? (
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
        {config.scope === 'practice' ? (
          <Disclosure label="Game controls" meta="Setup locked after first guess">
            <Button tone="danger" onClick={() => setConfirmReveal(true)}>
              Give up / reveal answer
            </Button>
            {confirmReveal ? (
              <div
                className="confirmation-bar"
                role="alertdialog"
                aria-label="Confirm reveal answer"
              >
                <p>This records a loss. Reveal the answer?</p>
                <Button
                  tone="danger"
                  onClick={() => {
                    const next =
                      session.mode === 'go'
                        ? revealGoAnswer(session, true)
                        : revealOgAnswer(session, true);
                    if (next === session) {
                      setConfirmReveal(false);
                      return;
                    }
                    if (persist(next, 'Answer revealed. Loss recorded locally.')) {
                      rewardTerminal(next);
                      void soundEngine.play('loss', soundEnabled);
                    }
                    setConfirmReveal(false);
                  }}
                >
                  Reveal answer
                </Button>
                <Button onClick={() => setConfirmReveal(false)}>Keep playing</Button>
              </div>
            ) : null}
          </Disclosure>
        ) : null}
      </aside>
    </div>
  );
}

function SoloWordListLoader({ config }: { config: SoloConfig }) {
  const { identity } = useAuth();
  const wordList = useQuery({
    queryKey: ['word-list', config.length],
    queryFn: ({ signal }) => wordListProvider.load(config.length, signal),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
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
      key={`${ownerStorageSegment(identity)}:${sessionKey(config)}:${wordList.data.revision}:${config.difficulty}:${config.hardMode ? 'hard' : 'normal'}`}
      config={config}
      wordList={wordList.data}
    />
  );
}

export function SoloGamePage() {
  const params = useParams();
  const location = useLocation();
  const validSegments =
    (params.mode === 'og' || params.mode === 'go') &&
    (params.scope === 'daily' || params.scope === 'practice');
  const mode = params.mode === 'go' ? 'go' : 'og';
  const scope = params.scope === 'daily' ? 'daily' : 'practice';
  const route = useMemo(
    () =>
      validSegments
        ? resolveSoloRoute(mode, scope, location.search)
        : {
            ok: false as const,
            message: 'The requested Solo mode or scope does not exist.',
          },
    [location.search, mode, scope, validSegments],
  );
  const { progression } = usePlayerState();

  if (!route.ok) {
    return (
      <section className="route-error" role="alert">
        <p className="eyebrow">Practice setup</p>
        <h1>Invalid game configuration</h1>
        <p>{route.message}</p>
        <p className="continuity-note">No word list was requested and no session was changed.</p>
        <ButtonLink to="/play">Choose a valid setup</ButtonLink>
      </section>
    );
  }

  if (route.canonicalSearch !== undefined) {
    return (
      <Navigate
        replace
        to={`${location.pathname}${route.canonicalSearch ? `?${route.canonicalSearch}` : ''}`}
      />
    );
  }

  const todayKey = dailyDateKey('local');
  if (
    route.config.scope === 'daily' &&
    !canAccessDaily({
      mode: route.config.mode,
      dateKey: route.config.dateKey,
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

  return <SoloWordListLoader config={route.config} />;
}
