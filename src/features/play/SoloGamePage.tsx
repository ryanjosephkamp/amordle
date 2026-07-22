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
  completionPercentage,
  continueOgSession,
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
  continueGoSession,
  createGoSession,
  currentGoPuzzle,
  goAutoAdvanceRemainingDelay,
  goAnswerGenerationVersion,
  goKeyboardEvidence,
  goPriorSeededEvidence,
  needsGoAttemptPolicyRestart,
  revealGoAnswer,
  selectDailyGoAnswers,
  selectDeterministicChain,
  submitGoGuess,
  type GoSession,
} from '../../domain/go';
import {
  continuationCost,
  selectIncorrectLettersToRemove,
  selectRevealPosition,
} from '../../domain/economy';
import { buildSoloDefinitionResults, buildSoloShareText } from '../../domain/solo-results';
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
import { AccountRepository } from '../../services/account-repository';
import {
  commitPracticeGeneration,
  currentPracticeGeneration,
  type PracticeGenerationLane,
} from './practice-generation-repository';
import { ownerStorageSegment, type VersionedEnvelope } from '../../persistence/local-repository';
import { normalizeSoloLaunch, type SoloLaunchSpec } from './solo-launch';
import { soloSessionRepository, type SoloSession } from './solo-session-repository';
import {
  createSoloSessionCloudRepository,
  syncSoloCloudLane,
  type SoloCloudPayload,
} from './solo-session-cloud';
import { SoloCompletionCoordinator } from './solo-completion-coordinator';
import {
  applySoloConsumableEffect,
  consumableIntentSnapshot,
  SoloConsumableIntentCoordinator,
} from './solo-consumable-intent';
import { SoloContinuationIntentCoordinator } from './solo-continuation-intent';
import { recordSoloHistory, type SoloHistoryEntry } from './solo-history-repository';

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

function revealTerminalSession(session: SoloSession): SoloSession {
  if (session.mode === 'og') return revealOgAnswer(session, true);
  if (session.status === 'playing') return revealGoAnswer(session, true);
  const puzzle = currentGoPuzzle(session);
  const revealed = revealOgAnswer(puzzle, true);
  return {
    ...updateGoPuzzle(session, revealed),
    status: 'lost',
    revealedAnswer: true,
    updatedAt: revealed.updatedAt,
  };
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

function SoloRuntime({
  config,
  wordList,
  cloud,
  cloudRepository,
}: {
  config: SoloConfig;
  wordList: WordList;
  cloud?: VersionedEnvelope<SoloCloudPayload> | undefined;
  cloudRepository?: ReturnType<typeof createSoloSessionCloudRepository> | undefined;
}) {
  const { client, identity, user } = useAuth();
  const { progression, economyPending, reward, promoteDailyUnlock, consumeConsumable, spendCoins } =
    usePlayerState();
  const repository = useMemo(() => soloSessionRepository(sessionKey(config)), [config]);
  const accountRepository = useMemo(
    () => (client ? new AccountRepository(client) : null),
    [client],
  );
  const completionCoordinator = useMemo(
    () => new SoloCompletionCoordinator(identity, sessionKey(config), progression),
    [config, identity, progression],
  );
  const continuationIntentCoordinator = useMemo(
    () => new SoloContinuationIntentCoordinator(identity, sessionKey(config)),
    [config, identity],
  );
  const consumableIntentCoordinator = useMemo(
    () => new SoloConsumableIntentCoordinator(identity, sessionKey(config)),
    [config, identity],
  );
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
    const cloudSession = cloud?.payload.lanes[sessionKey(config)];
    const localSession = loaded.status === 'ok' ? loaded.envelope.payload : undefined;
    const fromCloud = Boolean(
      cloudSession &&
      (!localSession || Date.parse(cloudSession.updatedAt) > Date.parse(localSession.updatedAt)),
    );
    const restored = fromCloud && cloudSession ? cloudSession : localSession;
    if (restored) {
      const puzzle = activePuzzle(restored);
      const legacyRestartNeeded = restored.mode === 'go' && needsGoAttemptPolicyRestart(restored);
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
          revision: loaded.status === 'ok' ? loaded.envelope.revision : 0,
          restored: true,
          fromCloud,
          generation: practiceGeneration,
          legacyRestartNeeded,
        };
      }
      return {
        session: createSession(config, wordList, practiceGeneration),
        revision: loaded.status === 'ok' ? loaded.envelope.revision : 0,
        restored: false,
        fromCloud: false,
        generation: practiceGeneration,
        legacyRestartNeeded: false,
      };
    }
    return {
      session: createSession(config, wordList, practiceGeneration),
      revision: 0,
      restored: false,
      fromCloud: false,
      generation: practiceGeneration,
      legacyRestartNeeded: false,
    };
  }, [cloud, config, generationLane, identity, repository, wordList]);
  const [session, setSession] = useState(initial.session);
  const revision = useRef(initial.revision);
  const continuationRecoveryInFlight = useRef(false);
  const consumableRecoveryInFlight = useRef(false);
  const [message, setMessage] = useState(
    initial.legacyRestartNeeded
      ? 'GO attempt rules were updated. This active chain will restart after durable actions recover.'
      : initial.restored
        ? 'Saved session restored from this account namespace.'
        : 'Enter a valid word. Attempts are not consumed by rejected guesses.',
  );
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [terminalFinalized, setTerminalFinalized] = useState(() =>
    completionCoordinator.isCompleted(initial.session.id),
  );
  const [continuationBlocked, setContinuationBlocked] = useState(() => {
    const pending = continuationIntentCoordinator.pending();
    return !pending.ok || pending.value !== undefined;
  });
  const [consumableBlocked, setConsumableBlocked] = useState(() => {
    const pending = consumableIntentCoordinator.pending();
    return !pending.ok || pending.value !== undefined;
  });
  const [legacyRestartPending, setLegacyRestartPending] = useState(initial.legacyRestartNeeded);
  const soloActionsBlocked = continuationBlocked || consumableBlocked || legacyRestartPending;
  const [soundEnabled, setSoundEnabled] = useState(() =>
    readSoundEnabled(identity, typeof localStorage === 'undefined' ? undefined : localStorage),
  );
  const navigate = useNavigate();
  const location = useLocation();
  const focus = new URLSearchParams(location.search).get('focus') === '1';
  const validWords = useMemo(() => new Set(wordList.validGuesses), [wordList]);
  const puzzle = activePuzzle(session);
  const keyboardEvidence = useMemo(() => {
    const evidence = {
      ...(session.mode === 'go'
        ? goKeyboardEvidence(session)
        : mergeKeyboardEvidence(session.guesses)),
    } as Record<string, TileState>;
    for (const letter of activePuzzle(session).removedLetters) evidence[letter] = 'removed';
    return evidence;
  }, [session]);

  const persist = useCallback(
    (next: SoloSession, confirmation?: string): boolean => {
      const result = repository.save(identity, next, {
        expectedRevision: revision.current,
        replaceCorrupt: false,
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
      if (cloudRepository && identity.kind === 'authenticated') {
        void syncSoloCloudLane({
          repository: cloudRepository,
          identity,
          lane: sessionKey(config),
          session: next,
        }).then(
          (sync) => {
            if (sync.status === 'corrupt' || sync.status === 'conflict') {
              setMessage('Saved locally. Account sync requires reconciliation before retrying.');
            }
          },
          () => setMessage('Saved locally. Account sync is pending a network retry.'),
        );
      }
      return true;
    },
    [cloudRepository, config, identity, repository],
  );

  const finalizeTerminal = useCallback(
    async (completed: SoloSession) => {
      if (completed.status === 'playing') return false;
      const puzzles = completed.mode === 'go' ? completed.puzzles : [completed];
      const completion = {
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
      } as const;
      const completedAt = completed.updatedAt;
      const acceptedGuesses = puzzles.reduce((total, item) => total + item.guesses.length, 0);
      const historyEntry: SoloHistoryEntry = {
        id: completed.id,
        mode: completed.mode,
        scope: completed.scope,
        status: completed.status,
        wordLength: activePuzzle(completed).wordLength,
        difficulty: completed.difficulty,
        hardMode: completed.hardMode,
        puzzleCount: completed.mode === 'go' ? completed.puzzles.length : 1,
        completedPuzzles:
          completed.mode === 'go'
            ? completed.puzzles.filter((item) => item.status === 'won').length
            : completed.status === 'won'
              ? 1
              : 0,
        acceptedGuesses,
        completedAt,
        ...(completed.scope === 'daily' ? { dateKey: config.dateKey } : {}),
      };
      if (!(await reward(completion))) {
        setMessage(
          'Result saved, but its once-only reward could not be persisted. Retry finalization.',
        );
        return false;
      }
      const history = recordSoloHistory(identity, historyEntry);
      if (!history.ok) {
        setMessage('Result and reward are safe, but local History could not be finalized. Retry.');
        return false;
      }
      if (!completionCoordinator.settle(completion, completedAt)) {
        setMessage('Result is saved, but the completion handoff could not be finalized. Retry.');
        return false;
      }
      setTerminalFinalized(true);
      if (accountRepository && user) {
        void accountRepository
          .saveHistory({
            id: historyEntry.id,
            user_id: user.id,
            completed_at: historyEntry.completedAt,
            entry: {
              area: 'solo',
              mode: historyEntry.mode,
              scope: historyEntry.scope,
              status: historyEntry.status,
              result: historyEntry.status,
              wordLength: historyEntry.wordLength,
              difficulty: historyEntry.difficulty,
              hardMode: historyEntry.hardMode,
              puzzleCount: historyEntry.puzzleCount,
              completedPuzzles: historyEntry.completedPuzzles,
              acceptedGuesses: historyEntry.acceptedGuesses,
              ...(historyEntry.dateKey ? { dateKey: historyEntry.dateKey } : {}),
            },
          })
          .catch(() => {
            setMessage('Completion is safe locally. Account History sync is pending a retry.');
          });
      }
      return true;
    },
    [accountRepository, completionCoordinator, config.dateKey, identity, reward, user],
  );

  useEffect(() => {
    if (
      session.status === 'playing' ||
      terminalFinalized ||
      (config.scope === 'practice' && session.status === 'lost' && !session.revealedAnswer)
    )
      return;
    const task = window.setTimeout(() => void finalizeTerminal(session), 0);
    return () => window.clearTimeout(task);
  }, [config.scope, finalizeTerminal, session, terminalFinalized]);

  useEffect(() => {
    if (initial.restored && !initial.fromCloud) return;
    const result = repository.save(identity, initial.session, {
      expectedRevision: initial.revision,
      replaceCorrupt: false,
    });
    if (result.ok) {
      revision.current = result.envelope.revision;
      if (cloudRepository && identity.kind === 'authenticated' && !initial.fromCloud) {
        void syncSoloCloudLane({
          repository: cloudRepository,
          identity,
          lane: sessionKey(config),
          session: initial.session,
        });
      }
    }
  }, [cloudRepository, config, identity, initial, repository]);

  useEffect(() => {
    completionCoordinator.prepare(session.id, session.createdAt);
  }, [completionCoordinator, session.createdAt, session.id]);

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
    if (soloActionsBlocked) {
      setMessage('Finish the pending durable economy recovery before submitting another guess.');
      return;
    }
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
        if (config.scope === 'daily') promoteDailyUnlock(config.mode, config.dateKey);
        if (
          result.session.status === 'won' ||
          (result.session.status === 'lost' && config.scope === 'daily')
        ) {
          void finalizeTerminal(result.session);
        }
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
      if (config.scope === 'daily') promoteDailyUnlock(config.mode, config.dateKey);
      if (
        result.session.status === 'won' ||
        (result.session.status === 'lost' && config.scope === 'daily')
      ) {
        void finalizeTerminal(result.session);
      }
      void soundEngine.play(
        result.session.status === 'won'
          ? 'win'
          : result.session.status === 'lost'
            ? 'loss'
            : 'tile-submit',
        soundEnabled,
      );
    }
  }, [
    config,
    soloActionsBlocked,
    finalizeTerminal,
    persist,
    promoteDailyUnlock,
    session,
    soundEnabled,
    validWords,
  ]);

  const onKey = useCallback(
    (key: string) => {
      const current = activePuzzle(session);
      if (
        soloActionsBlocked ||
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
    [persist, session, soloActionsBlocked, soundEnabled, submit],
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
  const resultDefinitions = buildSoloDefinitionResults({
    session,
    definitions: wordList.definitions,
    answerAccessAuthorized: terminalFinalized,
  });
  const shareText = buildSoloShareText({
    session,
    finalized: terminalFinalized,
    ...(config.scope === 'daily' ? { dateKey: config.dateKey } : {}),
  });

  const setFocus = (enabled: boolean) => {
    const search = new URLSearchParams(location.search);
    if (enabled) search.set('focus', '1');
    else search.delete('focus');
    navigate(`${location.pathname}${search.size ? `?${search}` : ''}`);
  };

  const newSession = () => {
    if (config.scope !== 'practice' || soloActionsBlocked) return;
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
    if (!completionCoordinator.prepare(next.id, next.createdAt)) {
      setMessage('New game saved, but completion tracking is unavailable.');
      return;
    }
    setTerminalFinalized(false);
    if (!commitPracticeGeneration(identity, generationLane, currentGeneration, nextGeneration)) {
      setMessage(
        'New deterministic session saved. Its generation counter will reconcile before the next game.',
      );
    }
  };

  const currentContinuationCost = continuationCost({
    wordLength: puzzle.wordLength,
    completionPercentage: completionPercentage(puzzle),
    continuationCount: puzzle.continuationCount,
  });

  const reconcileContinuationIntent = useCallback(async (): Promise<boolean> => {
    if (continuationRecoveryInFlight.current || economyPending) return false;
    const pending = continuationIntentCoordinator.pending();
    if (!pending.ok) {
      setContinuationBlocked(true);
      setMessage('Continuation recovery is unavailable. No coin operation was attempted.');
      return false;
    }
    const intent = pending.value;
    if (!intent) {
      setContinuationBlocked(false);
      return true;
    }
    setContinuationBlocked(true);
    if (intent.sessionId !== session.id) {
      setMessage('A continuation for another saved session must be recovered before play resumes.');
      return false;
    }
    const current = activePuzzle(session);
    const alreadyApplied = current.appliedContinuationIds.includes(intent.operationId);
    const expectedStatus = alreadyApplied
      ? current.continuationCount === intent.expectedContinuationCount + 1
      : session.status === 'lost' &&
        !current.revealedAnswer &&
        current.continuationCount === intent.expectedContinuationCount;
    let expectedCost: number;
    try {
      expectedCost = continuationCost({
        wordLength: current.wordLength,
        completionPercentage: completionPercentage(current),
        continuationCount: intent.expectedContinuationCount,
      });
    } catch {
      expectedCost = -1;
    }
    if (
      !expectedStatus ||
      current.wordLength !== intent.wordLength ||
      completionPercentage(current) !== intent.completionPercentage ||
      expectedCost !== intent.cost
    ) {
      setMessage('Prepared continuation does not match this saved session. No coins were charged.');
      return false;
    }

    continuationRecoveryInFlight.current = true;
    try {
      const charged = await spendCoins(intent.cost, intent.operationId);
      if (!charged.ok) {
        setMessage(
          charged.code === 'insufficient_coins'
            ? `Continuation requires ${intent.cost} coins.`
            : 'Continuation charge is pending recovery. No attempt was added.',
        );
        return false;
      }
      const marked = continuationIntentCoordinator.markCharged(
        intent.operationId,
        new Date().toISOString(),
      );
      if (!marked.ok || marked.value === 'missing' || marked.value === 'idempotency_conflict') {
        setMessage('The idempotent charge is safe, but its continuation intent needs recovery.');
        return false;
      }
      if (!alreadyApplied) {
        const continued =
          session.mode === 'go'
            ? continueGoSession(session, intent.operationId)
            : continueOgSession(session, intent.operationId);
        if (continued === session || !persist(continued, 'One paid attempt added and saved.')) {
          setMessage('The idempotent charge is safe; reload or retry to add the prepared attempt.');
          return false;
        }
      }
      const settled = continuationIntentCoordinator.settle(intent.operationId);
      if (
        !settled.ok ||
        settled.value === 'missing' ||
        settled.value === 'not_charged' ||
        settled.value === 'idempotency_conflict'
      ) {
        setMessage('The paid attempt is saved. Continuation cleanup will retry after reload.');
        return false;
      }
      setContinuationBlocked(false);
      setTerminalFinalized(false);
      return true;
    } finally {
      continuationRecoveryInFlight.current = false;
    }
  }, [continuationIntentCoordinator, economyPending, persist, session, spendCoins]);

  useEffect(() => {
    const pending = continuationIntentCoordinator.pending();
    if (!pending.ok) {
      setContinuationBlocked(true);
      setMessage('Continuation recovery storage is unavailable. Gameplay is paused safely.');
      return;
    }
    if (!pending.value) {
      setContinuationBlocked(false);
      return;
    }
    if (economyPending) return;
    void reconcileContinuationIntent();
  }, [continuationIntentCoordinator, economyPending, reconcileContinuationIntent]);

  const reconcileConsumableIntent = useCallback(async (): Promise<boolean> => {
    if (consumableRecoveryInFlight.current || economyPending || continuationBlocked) return false;
    const pending = consumableIntentCoordinator.pending();
    if (!pending.ok) {
      setConsumableBlocked(true);
      setMessage('Consumable recovery is unavailable. No inventory operation was attempted.');
      return false;
    }
    const intent = pending.value;
    if (!intent) {
      setConsumableBlocked(false);
      return true;
    }
    setConsumableBlocked(true);
    const inspected = applySoloConsumableEffect(session, intent);
    if (!inspected.ok) {
      setMessage(
        intent.phase === 'authorized'
          ? 'An authorized consumable no longer matches this saved board. Gameplay is paused safely.'
          : 'The prepared consumable does not match this saved board. Inventory was not used.',
      );
      return false;
    }

    consumableRecoveryInFlight.current = true;
    try {
      const consumed = await consumeConsumable(intent.consumable, intent.operationId);
      if (!consumed.ok) {
        setMessage(
          consumed.code === 'insufficient_inventory'
            ? intent.consumable === 'revealOneLetter'
              ? 'No Reveal One Letter items are available.'
              : 'No Remove Incorrect Letters items are available.'
            : 'The prepared inventory operation is pending recovery. The board is unchanged.',
        );
        return false;
      }
      const marked = consumableIntentCoordinator.markAuthorized(
        intent.operationId,
        new Date().toISOString(),
      );
      if (!marked.ok || marked.value === 'missing' || marked.value === 'idempotency_conflict') {
        setMessage('The inventory operation is idempotent, but its durable intent needs recovery.');
        return false;
      }

      if (inspected.applied) {
        const confirmation =
          intent.effect.kind === 'reveal'
            ? `Position ${intent.effect.position + 1} revealed and locked.`
            : `${intent.effect.letters.length} incorrect keyboard letters removed.`;
        if (!persist(inspected.session, confirmation)) {
          setMessage('The inventory operation is safe; reload to apply its prepared board effect.');
          return false;
        }
      }

      const settled = consumableIntentCoordinator.settle(intent.operationId);
      if (
        !settled.ok ||
        settled.value === 'missing' ||
        settled.value === 'not_authorized' ||
        settled.value === 'idempotency_conflict'
      ) {
        setMessage('The consumable effect is saved. Intent cleanup will retry after reload.');
        return false;
      }
      setConsumableBlocked(false);
      return true;
    } finally {
      consumableRecoveryInFlight.current = false;
    }
  }, [
    consumeConsumable,
    consumableIntentCoordinator,
    continuationBlocked,
    economyPending,
    persist,
    session,
  ]);

  useEffect(() => {
    const pending = consumableIntentCoordinator.pending();
    if (!pending.ok) {
      setConsumableBlocked(true);
      setMessage('Consumable recovery storage is unavailable. Gameplay is paused safely.');
      return;
    }
    if (!pending.value) {
      setConsumableBlocked(false);
      return;
    }
    if (economyPending || continuationBlocked) return;
    void reconcileConsumableIntent();
  }, [consumableIntentCoordinator, continuationBlocked, economyPending, reconcileConsumableIntent]);

  useEffect(() => {
    if (
      !legacyRestartPending ||
      session.mode !== 'go' ||
      !needsGoAttemptPolicyRestart(session) ||
      continuationBlocked ||
      consumableBlocked ||
      economyPending
    ) {
      return;
    }
    let restartGeneration = initial.generation;
    if (config.scope === 'practice') {
      const currentGeneration = currentPracticeGeneration(identity, generationLane);
      restartGeneration = currentGeneration + 1;
      if (
        !commitPracticeGeneration(identity, generationLane, currentGeneration, restartGeneration)
      ) {
        setMessage(
          'The corrected GO chain could not reserve a new Practice generation. Reload to retry; the saved chain is unchanged.',
        );
        return;
      }
    }
    const restarted = createSession(config, wordList, restartGeneration);
    if (!persist(restarted)) {
      setMessage(
        'The corrected GO chain could not replace the saved lane. Reload to retry; no reward or history entry was created.',
      );
      return;
    }
    setLegacyRestartPending(false);
    setTerminalFinalized(false);
    setMessage(
      config.scope === 'daily'
        ? 'GO attempt rules updated. This Daily chain restarted with its canonical answers.'
        : 'GO attempt rules updated. A new deterministic Practice chain is ready.',
    );
  }, [
    config,
    consumableBlocked,
    continuationBlocked,
    economyPending,
    generationLane,
    identity,
    initial.generation,
    legacyRestartPending,
    persist,
    session,
    wordList,
  ]);

  const continueAfterLoss = async () => {
    if (
      config.scope !== 'practice' ||
      consumableBlocked ||
      session.status !== 'lost' ||
      puzzle.revealedAnswer
    )
      return;
    const operationId = `continue:${session.id}:${puzzle.continuationCount + 1}`;
    const prepared = continuationIntentCoordinator.prepare({
      operationId,
      sessionId: session.id,
      expectedContinuationCount: puzzle.continuationCount,
      wordLength: puzzle.wordLength,
      completionPercentage: completionPercentage(puzzle),
      cost: currentContinuationCost,
      preparedAt: new Date().toISOString(),
    });
    if (!prepared.ok || prepared.value === 'idempotency_conflict') {
      setMessage('Continuation could not be prepared durably. No coin operation was attempted.');
      return;
    }
    if (prepared.value === 'settled' && !puzzle.appliedContinuationIds.includes(operationId)) {
      setMessage(
        'Continuation settlement conflicts with this session. No coin operation was attempted.',
      );
      return;
    }
    setContinuationBlocked(prepared.value !== 'settled');
    await reconcileContinuationIntent();
  };

  const revealAndFinalize = async () => {
    if (config.scope !== 'practice' || session.status === 'won' || soloActionsBlocked) return;
    const revealed = revealTerminalSession(session);
    if (revealed === session || !persist(revealed, 'Answer revealed. Loss saved locally.')) {
      setMessage('The reveal authorization is safe to retry; the loss did not finalize.');
      return;
    }
    await finalizeTerminal(revealed);
    void soundEngine.play('loss', soundEnabled);
    setConfirmReveal(false);
  };

  const applyRevealConsumable = async () => {
    if (
      config.scope !== 'practice' ||
      soloActionsBlocked ||
      session.status !== 'playing' ||
      puzzle.status !== 'playing'
    )
      return;
    const position = selectRevealPosition({
      answer: puzzle.answer,
      revealedPositions: puzzle.revealedPositions,
      seed: `${session.id}:reveal:${puzzle.revealedPositions.filter(Boolean).length}`,
    });
    if (position === undefined) {
      setMessage('Every position is already revealed. Inventory was not used.');
      return;
    }
    const operationId = `consume:reveal:${puzzle.id}:${position}`;
    const prepared = consumableIntentCoordinator.prepare(
      consumableIntentSnapshot(session, {
        operationId,
        consumable: 'revealOneLetter',
        effect: { kind: 'reveal', position },
        preparedAt: new Date().toISOString(),
      }),
    );
    if (!prepared.ok || prepared.value === 'idempotency_conflict') {
      setMessage('Reveal could not be prepared durably. Inventory was not used.');
      return;
    }
    if (prepared.value === 'settled' && !puzzle.revealedPositions[position]) {
      setMessage('Reveal settlement conflicts with this board. Inventory was not used.');
      return;
    }
    setConsumableBlocked(prepared.value !== 'settled');
    await reconcileConsumableIntent();
  };

  const applyRemoveConsumable = async () => {
    if (
      config.scope !== 'practice' ||
      soloActionsBlocked ||
      session.status !== 'playing' ||
      puzzle.status !== 'playing'
    )
      return;
    const absent = Object.entries(keyboardEvidence)
      .filter(([, state]) => state === 'absent' || state === 'removed')
      .map(([letter]) => letter);
    const letters = selectIncorrectLettersToRemove({
      answer: puzzle.answer,
      draft: draftWord(puzzle),
      alreadyAbsentOrRemoved: absent,
      seed: `${session.id}:remove:${puzzle.removedLetters.join('')}:${puzzle.guesses.length}`,
    });
    if (letters.length === 0) {
      setMessage('No eligible incorrect keyboard letters remain. Inventory was not used.');
      return;
    }
    const operationId = `consume:remove:${puzzle.id}:${letters.join('')}`;
    const prepared = consumableIntentCoordinator.prepare(
      consumableIntentSnapshot(session, {
        operationId,
        consumable: 'removeIncorrectLetters',
        effect: { kind: 'remove', letters: [...letters] },
        preparedAt: new Date().toISOString(),
      }),
    );
    if (!prepared.ok || prepared.value === 'idempotency_conflict') {
      setMessage('Removal could not be prepared durably. Inventory was not used.');
      return;
    }
    if (
      prepared.value === 'settled' &&
      !letters.every((letter) => puzzle.removedLetters.includes(letter))
    ) {
      setMessage('Removal settlement conflicts with this board. Inventory was not used.');
      return;
    }
    setConsumableBlocked(prepared.value !== 'settled');
    await reconcileConsumableIntent();
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
                : terminalFinalized || session.revealedAnswer || config.scope === 'daily'
                  ? `The active answer was ${puzzle.answer.toUpperCase()}.`
                  : 'Choose one paid attempt or reveal the answer to finalize this loss.'}
            </p>
            {terminalFinalized && resultDefinitions.length > 0 ? (
              <Disclosure label="Definitions" meta={`${resultDefinitions.length} result words`}>
                <dl className="data-list">
                  {resultDefinitions.map((result) => (
                    <div key={result.word}>
                      <dt>{result.word.toUpperCase()}</dt>
                      <dd>
                        {result.source === 'curated' ? (
                          result.definitions.map((definition, index) => (
                            <span key={`${result.word}:${index}`}>
                              {definition.partOfSpeech ? `${definition.partOfSpeech} · ` : ''}
                              {definition.text}
                            </span>
                          ))
                        ) : (
                          <a href={result.fallbackUrl} rel="noreferrer" target="_blank">
                            No curated entry. Search Google for a definition.
                          </a>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Disclosure>
            ) : null}
            <div className="button-row">
              {config.scope === 'practice' && session.status === 'lost' && !terminalFinalized ? (
                <>
                  {!puzzle.revealedAnswer ? (
                    <Button
                      tone="primary"
                      disabled={economyPending || progression.coins < currentContinuationCost}
                      onClick={() => void continueAfterLoss()}
                    >
                      Continue · {currentContinuationCost} coins
                    </Button>
                  ) : null}
                  <Button
                    tone="danger"
                    disabled={economyPending || soloActionsBlocked}
                    onClick={() => void revealAndFinalize()}
                  >
                    Reveal and record loss
                  </Button>
                </>
              ) : null}
              {config.scope === 'practice' && terminalFinalized ? (
                <Button tone="primary" onClick={newSession}>
                  New {config.mode.toUpperCase()} {session.mode === 'go' ? 'chain' : 'game'}
                </Button>
              ) : null}
              {terminalFinalized ? (
                <>
                  <Button
                    onClick={() =>
                      shareText ? void navigator.clipboard?.writeText(shareText) : undefined
                    }
                  >
                    Copy result
                  </Button>
                  <ButtonLink to="/definitions">Definitions</ButtonLink>
                  <ButtonLink to="/history">History</ButtonLink>
                </>
              ) : null}
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
            <Button
              disabled={
                economyPending ||
                soloActionsBlocked ||
                (progression.consumables?.revealOneLetter ?? 0) < 1
              }
              onClick={() => void applyRevealConsumable()}
            >
              <Icon name="info" /> Reveal one letter ·{' '}
              {progression.consumables?.revealOneLetter ?? 0} owned
            </Button>
            <Button
              disabled={
                economyPending ||
                soloActionsBlocked ||
                (progression.consumables?.removeIncorrectLetters ?? 0) < 1
              }
              onClick={() => void applyRemoveConsumable()}
            >
              <Icon name="backspace" /> Remove incorrect ·{' '}
              {progression.consumables?.removeIncorrectLetters ?? 0} owned
            </Button>
            <ButtonLink to="/marketplace">Manage inventory</ButtonLink>
          </>
        ) : null}
        {config.scope === 'practice' && session.status === 'playing' ? (
          <Disclosure label="Game controls" meta="Setup locked after first guess">
            <Button
              tone="danger"
              disabled={soloActionsBlocked}
              onClick={() => setConfirmReveal(true)}
            >
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
                  disabled={economyPending || soloActionsBlocked}
                  onClick={() => void revealAndFinalize()}
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
  const { client, identity } = useAuth();
  const cloudRepository = useMemo(
    () => (client ? createSoloSessionCloudRepository(client) : undefined),
    [client],
  );
  const cloudState = useQuery({
    queryKey: [
      'solo-cloud',
      identity.kind === 'authenticated' ? identity.userId : 'guest-local-only',
    ],
    enabled: Boolean(cloudRepository && identity.kind === 'authenticated'),
    queryFn: () => cloudRepository!.load(identity),
    staleTime: 5_000,
    retry: 1,
  });
  const wordList = useQuery({
    queryKey: ['word-list', config.length],
    queryFn: ({ signal }) => wordListProvider.load(config.length, signal),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  if (wordList.isPending || (identity.kind === 'authenticated' && cloudState.isPending))
    return <LoadingGame message={`Loading ${config.length}-letter word data…`} />;
  if (cloudState.isError || cloudState.data?.status === 'corrupt') {
    return (
      <section className="route-error" role="alert">
        <p className="eyebrow">Account continuity</p>
        <h1>Solo cloud state unavailable</h1>
        <p>No local session was changed. Retry before entering this account-owned lane.</p>
        <Button tone="primary" onClick={() => void cloudState.refetch()}>
          Retry account state
        </Button>
        <ButtonLink to="/play">Back to Play</ButtonLink>
      </section>
    );
  }
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
  const localContinuity = soloSessionRepository(sessionKey(config)).load(identity);
  if (localContinuity.status === 'corrupt' || localContinuity.status === 'unavailable') {
    return (
      <section className="route-error" role="alert">
        <p className="eyebrow">Local continuity</p>
        <h1>Saved Solo state requires recovery</h1>
        <p>
          The active identity namespace was not replaced. Resolve or reset its saved state before
          playing this lane.
        </p>
        <ButtonLink to="/settings">Open recovery settings</ButtonLink>
        <ButtonLink to="/play">Back to Play</ButtonLink>
      </section>
    );
  }
  return (
    <SoloRuntime
      key={`${ownerStorageSegment(identity)}:${sessionKey(config)}:${wordList.data.revision}:${config.difficulty}:${config.hardMode ? 'hard' : 'normal'}`}
      config={config}
      wordList={wordList.data}
      cloud={cloudState.data?.status === 'ok' ? cloudState.data.envelope : undefined}
      cloudRepository={cloudRepository}
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
  const dailyEntitlements = [
    ...progression.unlockedDailies,
    ...Object.keys(progression.pendingDailyUnlocks ?? {}),
  ];
  if (
    route.config.scope === 'daily' &&
    !canAccessDaily({
      mode: route.config.mode,
      dateKey: route.config.dateKey,
      todayKey,
      unlocked: dailyEntitlements,
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
