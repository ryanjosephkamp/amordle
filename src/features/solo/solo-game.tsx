'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { readEnvelope, writeEnvelope } from '@/adapters/indexeddb';
import type { VersionedEnvelope } from '@/adapters/indexeddb';
import { queueAccountCompletion, reconcileCompletionOutbox } from '@/application/completion-outbox';
import { matchDirectNavigationShortcut } from '@/application/keyboard-shortcuts';
import { accountEconomyNamespace, economyQueryKey } from '@/application/query-keys';
import {
  consumeLocalConsumable,
  creditLocalCoins,
  getLocalEconomy,
  spendLocalCoins,
} from '@/adapters/local-account';
import { consumeConsumable, getEconomy, spendCoins } from '@/adapters/supabase/account';
import {
  buildSoloHistoryRow,
  loadCloudSolo,
  saveCloudSolo,
  setDailyEntitlement,
} from '@/adapters/supabase/solo';
import { operationId } from '@/adapters/supabase/shared';
import { GameHistoryViewport } from '@/components/game-history-viewport';
import { GameKeyboard } from '@/components/game-keyboard';
import { useAuth } from '@/components/providers';
import { useFeedbackPreferences } from '@/components/feedback-preferences';
import { WordDefinition } from '@/features/words/word-definition';
import { selectEncounteredSoloGoAnswers } from '@/domain/solo-go-review';
import {
  continuationCost,
  selectIncorrectLettersToRemove,
  selectRevealPosition,
} from '@/domain/economy';
import {
  completionPercentage,
  createGameSession,
  deriveKeyboardEvidence,
  playableAttemptBudget,
  reduceGame,
} from '@/domain/game';
import type { GameCommand, GameSession, GameSettings, GuessRow } from '@/domain/game';
import { reconcileRevisioned } from '@/domain/reconciliation';
import { gameSessionSchema } from './session-schema';
import { soloReward } from '@/adapters/supabase/solo';
import { registerSoloSessionSummary, upsertSoloSessionSummary } from '@/adapters/solo-sessions';
import { soloSessionsQueryKey } from '@/application/solo-query-keys';
import { invalidateAccountProjections } from '@/application/account-query-freshness';
import { playKeyboardSound } from '@/application/keyboard-feedback';
import type { KeyboardFeedbackEvent } from '@/domain/feedback';
import { EncounteredGoReview } from './encountered-go-review';

interface SoloGameProps {
  sessionId: string;
  ownerNamespace: string;
  settings: GameSettings;
  answers: string[];
  validGuesses: string[];
  dailyDate?: string;
  resumeHref: string;
}

function now(): string {
  return new Date().toISOString();
}

function BoardRow({
  row,
  length,
  label,
  number,
}: {
  row?: GuessRow;
  length: number;
  label: string;
  number: number;
}) {
  return (
    <div className="board-entry" role="presentation">
      {row?.kind === 'seeded' && <span className="board-entry-label">SEED EVIDENCE</span>}
      <span className="board-row-number" aria-hidden="true">
        {String(number).padStart(2, '0')}
      </span>
      <div className="board-row" role="row" aria-label={label}>
        {Array.from({ length }, (_, index) => {
          const tile = row?.tiles[index];
          const glyph =
            tile?.state === 'correct' ? '✓' : tile?.state === 'present' ? '~' : tile ? '×' : '';
          return (
            <div
              key={index}
              className={`tile ${tile ? `is-${tile.state}` : ''}`}
              role="cell"
              aria-label={
                tile ? `${tile.letter.toUpperCase()}, ${tile.state}` : `Empty position ${index + 1}`
              }
            >
              <span className="tile-letter">{tile?.letter.toUpperCase() ?? ''}</span>
              {glyph && (
                <span className="tile-evidence" aria-hidden="true">
                  {glyph}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DraftRow({
  draft,
  length,
  revealed,
  number,
}: {
  draft: string;
  length: number;
  revealed: Record<string, string>;
  number: number;
}) {
  return (
    <div className="board-entry" role="presentation">
      <span className="board-row-number" aria-hidden="true">
        {String(number).padStart(2, '0')}
      </span>
      <div className="board-row is-draft" role="row" aria-label="Current guess and locked hints">
        {Array.from({ length }, (_, index) => {
          const revealedLetter = revealed[String(index)];
          return (
            <div
              className={`tile ${revealedLetter ? 'is-revealed' : ''}`}
              role="cell"
              aria-label={
                revealedLetter
                  ? `Revealed ${revealedLetter.toUpperCase()} in position ${index + 1}`
                  : `Draft position ${index + 1}`
              }
              key={index}
            >
              {(revealedLetter ?? draft[index])?.toUpperCase() ?? ''}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceLegend() {
  return (
    <div className="evidence-legend" aria-label="Tile evidence legend" tabIndex={0}>
      <span>
        <b aria-hidden="true">✓</b> Correct spot
      </span>
      <span>
        <b aria-hidden="true">~</b> Present elsewhere
      </span>
      <span>
        <b aria-hidden="true">×</b> Not in word
      </span>
      <span>
        <b aria-hidden="true">—</b> Removed key
      </span>
    </div>
  );
}

export function SoloGame({
  sessionId,
  ownerNamespace,
  settings,
  answers,
  validGuesses,
  dailyDate,
  resumeHref,
}: SoloGameProps) {
  const auth = useAuth();
  const feedback = useFeedbackPreferences();
  const queryClient = useQueryClient();
  const sanctionedWords = useMemo(() => new Set(validGuesses), [validGuesses]);
  const initial = useMemo(
    () =>
      createGameSession({
        id: sessionId,
        ownerNamespace,
        settings,
        answers,
        now: now(),
      }),
    [answers, ownerNamespace, sessionId, settings],
  );
  const [session, setSession] = useState<GameSession>(initial);
  const [hydrated, setHydrated] = useState(false);
  const [cloudBackupNeedsAttention, setCloudBackupNeedsAttention] = useState(false);
  const [actionState, setActionState] = useState('');
  const [toolState, setToolState] = useState('');
  const [pendingTool, setPendingTool] = useState<'reveal' | 'remove' | 'sound' | null>(null);
  const [continuationPending, setContinuationPending] = useState(false);
  const [sessionRegistryError, setSessionRegistryError] = useState('');
  const [auxiliaryOpen, setAuxiliaryOpen] = useState(true);
  const revision = useRef(0);
  const persistQueue = useRef<Promise<void>>(Promise.resolve());
  const latestEnvelope = useRef<VersionedEnvelope<GameSession> | null>(null);
  const sessionRef = useRef(session);
  const finalized = useRef(false);
  const revealOperation = useRef<string | null>(null);
  const removalOperation = useRef<string | null>(null);
  const continuationOperation = useRef<string | null>(null);
  const boardRegion = useRef<HTMLDivElement | null>(null);
  const resultPanel = useRef<HTMLElement | null>(null);
  const announcedTerminal = useRef(false);
  const domain = `solo:${sessionId}`;
  const signedInUserId = auth.status === 'signed-in' ? auth.user?.id : undefined;
  const isPractice = dailyDate === undefined;
  const economyNamespace = signedInUserId
    ? accountEconomyNamespace(signedInUserId)
    : ownerNamespace;
  const economy = useQuery({
    queryKey: economyQueryKey(economyNamespace),
    queryFn: () => (signedInUserId ? getEconomy() : getLocalEconomy(ownerNamespace)),
    enabled: isPractice,
  });
  const soundEnabled = feedback.settings.sound;
  const soundProfile = feedback.settings.keyboardSoundProfile;

  const syncRegistry = useCallback(
    async (next: GameSession, lifecycle?: 'reserved' | 'active' | 'terminal') => {
      const acceptedGuesses = next.rows.filter((row) => row.kind === 'accepted').length;
      const resolvedLifecycle =
        lifecycle ?? (next.status === 'won' || next.status === 'lost' ? 'terminal' : 'active');
      const registry = await upsertSoloSessionSummary(ownerNamespace, signedInUserId, {
        schemaVersion: 2,
        id: next.id,
        ownerNamespace,
        lane: dailyDate ? 'daily' : 'practice',
        settings: next.settings,
        localDate: dailyDate ?? null,
        resumeHref,
        lifecycle: resolvedLifecycle,
        acceptedGuesses,
        puzzleIndex: next.puzzleIndex,
        createdAt: next.createdAt,
        updatedAt: next.updatedAt,
        lastPlayedAt: next.updatedAt,
      });
      queryClient.setQueryData(soloSessionsQueryKey(ownerNamespace), registry);
    },
    [dailyDate, ownerNamespace, queryClient, resumeHref, signedInUserId],
  );

  const registerRegistry = useCallback(
    async (next: GameSession) => {
      const acceptedGuesses = next.rows.filter((row) => row.kind === 'accepted').length;
      const registry = await registerSoloSessionSummary(ownerNamespace, signedInUserId, {
        schemaVersion: 2,
        id: next.id,
        ownerNamespace,
        lane: dailyDate ? 'daily' : 'practice',
        settings: next.settings,
        localDate: dailyDate ?? null,
        resumeHref,
        lifecycle: next.status === 'won' || next.status === 'lost' ? 'terminal' : 'active',
        acceptedGuesses,
        puzzleIndex: next.puzzleIndex,
        createdAt: next.createdAt,
        updatedAt: next.updatedAt,
        lastPlayedAt: next.updatedAt,
      });
      queryClient.setQueryData(soloSessionsQueryKey(ownerNamespace), registry);
    },
    [dailyDate, ownerNamespace, queryClient, resumeHref, signedInUserId],
  );

  useEffect(() => {
    const compact = window.matchMedia('(max-width: 47.99rem), (max-height: 43.75rem)');
    const adapt = () => setAuxiliaryOpen(!compact.matches);
    adapt();
    compact.addEventListener('change', adapt);
    return () => compact.removeEventListener('change', adapt);
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const playCue = useCallback(
    (event: KeyboardFeedbackEvent) => {
      if (!soundEnabled) return;
      void playKeyboardSound(soundProfile, event);
    },
    [soundEnabled, soundProfile],
  );

  const syncCloudEnvelope = useCallback(
    async (envelope: VersionedEnvelope<GameSession>) => {
      if (!signedInUserId) return true;
      try {
        await saveCloudSolo(signedInUserId, envelope);
        setCloudBackupNeedsAttention(false);
        return true;
      } catch {
        setCloudBackupNeedsAttention(true);
        return false;
      }
    },
    [signedInUserId],
  );

  const persist = useCallback(
    (next: GameSession) => {
      const operation = persistQueue.current
        .catch(() => undefined)
        .then(async () => {
          const nextRevision = revision.current + 1;
          const envelope: VersionedEnvelope<GameSession> = {
            schemaVersion: 1 as const,
            ownerNamespace,
            domain,
            revision: nextRevision,
            updatedAt: next.updatedAt,
            state: next,
          };
          await writeEnvelope(envelope);
          revision.current = nextRevision;
          latestEnvelope.current = envelope;
          await syncCloudEnvelope(envelope);
        });
      persistQueue.current = operation;
      return operation;
    },
    [domain, ownerNamespace, syncCloudEnvelope],
  );

  const retryCloudBackup = useCallback(async () => {
    const envelope = latestEnvelope.current;
    if (!envelope || envelope.ownerNamespace !== ownerNamespace) return;
    await syncCloudEnvelope(envelope);
  }, [ownerNamespace, syncCloudEnvelope]);

  useEffect(() => {
    if (auth.status === 'loading') return;
    let active = true;
    const hydrate = async () => {
      try {
        const local = await readEnvelope(ownerNamespace, domain, gameSessionSchema);
        let remote = null;
        if (signedInUserId) {
          try {
            remote = await loadCloudSolo(signedInUserId, domain);
          } catch {
            if (active) setCloudBackupNeedsAttention(true);
          }
        }
        const reconciled = reconcileRevisioned(local, remote);
        const stored = reconciled === remote ? remote : local;
        if (active && stored && stored.state.id === sessionId) {
          revision.current = stored.revision;
          latestEnvelope.current = stored;
          setSession(stored.state);
          void registerRegistry(stored.state).catch((error: unknown) => {
            if (active) {
              setSessionRegistryError(
                error instanceof Error ? error.message : 'This Solo game cannot be resumed safely.',
              );
            }
          });
          if (remote && stored === remote) await writeEnvelope(stored);
        } else if (active) {
          void registerRegistry(initial).catch((error: unknown) => {
            if (active) {
              setSessionRegistryError(
                error instanceof Error ? error.message : 'This Solo game cannot be started safely.',
              );
            }
          });
        }
      } finally {
        if (active) setHydrated(true);
      }
    };
    void hydrate();
    return () => {
      active = false;
    };
  }, [auth.status, domain, initial, ownerNamespace, registerRegistry, sessionId, signedInUserId]);

  const issue = useCallback(
    async (command: GameCommand) => {
      const current = sessionRef.current;
      const next = reduceGame(current, command);
      if (next === current) return false;
      const accepted =
        next.rows.filter((row) => row.kind === 'accepted').length >
        current.rows.filter((row) => row.kind === 'accepted').length;
      if (command.type === 'submit') {
        playCue(accepted ? (next.status === 'won' ? 'success' : 'submit') : 'reject');
      } else if (command.type === 'insert' || command.type === 'delete') {
        playCue(command.type === 'delete' ? 'delete' : 'input');
      }
      if (accepted) {
        try {
          await persist(next);
          setSession(next);
          void syncRegistry(next).catch(() => undefined);
          if (dailyDate && signedInUserId) {
            void setDailyEntitlement(signedInUserId, `${dailyDate}:${settings.mode}`, 'unlocked')
              .then(() =>
                queryClient.invalidateQueries({
                  queryKey: ['progress', signedInUserId],
                }),
              )
              .catch(() =>
                setActionState('Daily access will finish unlocking when the connection returns.'),
              );
          }
        } catch {
          setSession({
            ...current,
            rejection: 'Your guess was not saved. Nothing changed; try again.',
          });
          return false;
        }
        return true;
      }
      setSession(next);
      try {
        await persist(next);
        if (command.type !== 'insert' && command.type !== 'delete') {
          void syncRegistry(next).catch(() => undefined);
        }
      } catch {
        setSession({
          ...current,
          rejection: 'Your change was not saved. Nothing changed; try again.',
        });
        return false;
      }
      return true;
    },
    [dailyDate, persist, playCue, queryClient, settings.mode, signedInUserId, syncRegistry],
  );

  useEffect(() => {
    if (!hydrated || session.status !== 'holding' || !session.holdUntil) return;
    const delay = Math.max(0, Date.parse(session.holdUntil) - Date.now());
    const timer = window.setTimeout(() => {
      void issue({ type: 'advance', now: now() });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [hydrated, issue, session.holdUntil, session.status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        matchDirectNavigationShortcut(event) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault();
        void issue({ type: 'insert', letter: event.key, now: now() });
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        void issue({ type: 'delete', now: now() });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        void issue({ type: 'submit', sanctionedWords, now: now() });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [issue, sanctionedWords]);

  useEffect(() => {
    const terminalDecision =
      session.status === 'won' ||
      (session.status === 'lost' && (dailyDate !== undefined || session.answerRevealed));
    if (!hydrated || !signedInUserId || finalized.current || !terminalDecision) return;
    finalized.current = true;
    const row = buildSoloHistoryRow(
      signedInUserId,
      session,
      dailyDate ? 'solo-daily' : 'solo-practice',
      dailyDate,
    );
    void queueAccountCompletion(row)
      .then(() => reconcileCompletionOutbox(signedInUserId))
      .then((result) => {
        setActionState(
          result.pending
            ? 'Result is saved on this device. Account sync will retry automatically.'
            : 'Result, History, XP, and coins are synced.',
        );
        void invalidateAccountProjections(queryClient, signedInUserId);
      })
      .catch(() => {
        finalized.current = false;
        setActionState('Result sync needs attention. Reloading safely retries it.');
      });
  }, [dailyDate, hydrated, queryClient, session, signedInUserId]);

  useEffect(() => {
    const terminalDecision =
      session.status === 'won' ||
      (session.status === 'lost' && (dailyDate !== undefined || session.answerRevealed));
    if (!hydrated || signedInUserId || finalized.current || !terminalDecision) return;
    finalized.current = true;
    const reward = soloReward(session);
    void creditLocalCoins(ownerNamespace, reward.coins, `solo-reward:${session.id}`)
      .then((nextEconomy) => {
        queryClient.setQueryData(economyQueryKey(economyNamespace), nextEconomy);
        setActionState('Result and guest coins are saved on this device.');
      })
      .catch(() => {
        finalized.current = false;
        setActionState('Result is saved; guest reward will safely retry after reload.');
      });
  }, [dailyDate, economyNamespace, hydrated, ownerNamespace, queryClient, session, signedInUserId]);

  const currentRows = session.rows.filter((row) => row.puzzleIndex === session.puzzleIndex);
  const acceptedRows = currentRows.filter((row) => row.kind === 'accepted');
  const budget =
    settings.mode === 'go'
      ? playableAttemptBudget(session.puzzleIndex) + session.continuationCount
      : 6 + session.continuationCount;
  const keyboard = deriveKeyboardEvidence(currentRows, new Set(session.removedLetters));
  const isTerminal = session.status === 'won' || session.status === 'lost';
  const seededCount = session.rows.filter((row) => row.kind === 'seeded').length;
  const encounteredGoReview = useMemo(
    () =>
      settings.mode === 'go'
        ? selectEncounteredSoloGoAnswers(session, isPractice ? 'practice' : 'daily')
        : null,
    [isPractice, session, settings.mode],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.gamePresentation = isTerminal ? 'review' : 'active';
    return () => {
      if (root.dataset.gamePresentation === (isTerminal ? 'review' : 'active')) {
        delete root.dataset.gamePresentation;
      }
    };
  }, [isTerminal]);

  useEffect(() => {
    if (!isTerminal || announcedTerminal.current) return;
    announcedTerminal.current = true;
    const frame = window.requestAnimationFrame(() => {
      resultPanel.current?.focus({ preventScroll: true });
      resultPanel.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isTerminal]);
  const shareText = [
    `Amordle ${dailyDate ? `Daily ${dailyDate}` : 'Practice'} ${settings.mode.toUpperCase()}`,
    `${settings.length} letters · ${settings.difficulty}${settings.hardMode ? ' · Hard Mode' : ''}`,
    settings.mode === 'go'
      ? `${session.puzzleIndex + (session.status === 'won' ? 1 : 0)}/${settings.goCount} puzzles`
      : `${acceptedRows.length}/${budget}`,
    ...(seededCount ? [`Seeded evidence: ${seededCount} prior answer rows`] : []),
    ...session.rows
      .filter((row) => row.kind === 'accepted')
      .map((row) =>
        row.tiles
          .map((tile) => (tile.state === 'correct' ? '🟩' : tile.state === 'present' ? '🟨' : '⬛'))
          .join(''),
      ),
  ].join('\n');

  const applyReveal = async () => {
    if (pendingTool) return;
    if ((economy.data?.reveal_one_letter ?? 0) < 1) {
      setToolState('Obtain a Reveal One Letter item first.');
      return;
    }
    const id = revealOperation.current ?? operationId(`solo-reveal:${session.id}`);
    revealOperation.current = id;
    const known = new Set<number>(Object.keys(session.revealedPositions).map(Number));
    for (const row of currentRows) {
      row.tiles.forEach((tile, index) => {
        if (tile.state === 'correct') known.add(index);
      });
    }
    const position = selectRevealPosition({
      answer: session.answers[session.puzzleIndex] ?? '',
      knownPositions: known,
      operationId: id,
    });
    if (position === null) {
      revealOperation.current = null;
      setToolState('Every position is already known.');
      return;
    }
    setPendingTool('reveal');
    setToolState('Revealing one letter…');
    try {
      const nextEconomy = signedInUserId
        ? await consumeConsumable('reveal_one_letter', id)
        : await consumeLocalConsumable(ownerNamespace, 'reveal_one_letter', id);
      const applied = await issue({
        type: 'reveal-position',
        operationId: id,
        position,
        letter: session.answers[session.puzzleIndex]?.[position] ?? '',
        now: now(),
      });
      if (!applied) throw new Error('The revealed position was not saved.');
      queryClient.setQueryData(economyQueryKey(economyNamespace), nextEconomy);
      revealOperation.current = null;
      setToolState(`Position ${position + 1} is now locked.`);
    } catch {
      setToolState('Reveal was not applied. Retry will use the same operation.');
    } finally {
      setPendingTool(null);
    }
  };

  const applyRemoval = async () => {
    if (pendingTool) return;
    if ((economy.data?.remove_incorrect_letters ?? 0) < 1) {
      setToolState('Obtain a Remove Incorrect Letters item first.');
      return;
    }
    const id = removalOperation.current ?? operationId(`solo-remove:${session.id}`);
    removalOperation.current = id;
    const letters = selectIncorrectLettersToRemove({
      answer: session.answers[session.puzzleIndex] ?? '',
      draft: session.draft,
      alreadyAbsentOrRemoved: new Set(
        Object.entries(keyboard)
          .filter(([, state]) => state === 'absent' || state === 'removed')
          .map(([letter]) => letter),
      ),
      operationId: id,
    });
    if (letters.length === 0) {
      removalOperation.current = null;
      setToolState('No additional impossible letters can be removed right now.');
      return;
    }
    setPendingTool('remove');
    setToolState('Removing impossible letters…');
    try {
      const nextEconomy = signedInUserId
        ? await consumeConsumable('remove_incorrect_letters', id)
        : await consumeLocalConsumable(ownerNamespace, 'remove_incorrect_letters', id);
      const applied = await issue({ type: 'remove-letters', operationId: id, letters, now: now() });
      if (!applied) throw new Error('The removed letters were not saved.');
      queryClient.setQueryData(economyQueryKey(economyNamespace), nextEconomy);
      removalOperation.current = null;
      setToolState(`${letters.length} impossible letters were removed.`);
    } catch {
      setToolState('Letters were not removed. Retry will use the same operation.');
    } finally {
      setPendingTool(null);
    }
  };

  const continueGame = async () => {
    if (continuationPending) return;
    const id = continuationOperation.current ?? operationId(`solo-continuation:${session.id}`);
    continuationOperation.current = id;
    const cost = continuationCost({
      wordLength: settings.length,
      completionPercentage: completionPercentage(session),
      continuationCount: session.continuationCount,
    });
    setContinuationPending(true);
    try {
      const nextEconomy = signedInUserId
        ? await spendCoins(cost, id)
        : await spendLocalCoins(ownerNamespace, cost, id);
      const applied = await issue({ type: 'continue', operationId: id, now: now() });
      if (!applied) throw new Error('The continuation was not saved.');
      queryClient.setQueryData(economyQueryKey(economyNamespace), nextEconomy);
      continuationOperation.current = null;
      finalized.current = false;
      setActionState(`One attempt added for ${cost} coins.`);
    } catch {
      setActionState(`Continuation was not applied. ${cost} coins are required.`);
    } finally {
      setContinuationPending(false);
    }
  };

  if (!hydrated) {
    return (
      <section className="game-loading" aria-live="polite">
        Restoring your game…
      </section>
    );
  }

  if (sessionRegistryError) {
    return (
      <section className="status-panel" role="alert">
        <h1>Solo session limit reached</h1>
        <p>{sessionRegistryError}</p>
        <Link className="button primary" href="/play/solo">
          REVIEW ACTIVE SOLO GAMES
        </Link>
      </section>
    );
  }

  return (
    <section
      className="game-layout"
      aria-labelledby="game-heading"
      data-word-length={settings.length}
      style={{ '--word-length': settings.length } as CSSProperties}
    >
      <header className="game-status">
        <div className="game-mode-lockup">
          <span className="game-context">
            SOLO / {dailyDate ? `DAILY / ${dailyDate}` : 'PRACTICE'}
          </span>
          <h1 id="game-heading">
            {settings.mode.toUpperCase()} {settings.mode === 'go' ? 'RUN' : 'PUZZLE'}
          </h1>
        </div>
        <div className="game-status-facts" aria-label="Game status facts" tabIndex={0}>
          <span>
            <b>{settings.length}</b> LETTERS
          </span>
          <span>
            <b>{acceptedRows.length}</b> / {budget} ATTEMPTS
          </span>
          {settings.mode === 'go' && (
            <span>
              <b>{session.puzzleIndex + 1}</b> / {settings.goCount} PUZZLES
            </span>
          )}
          {settings.hardMode && <span>HARD MODE</span>}
        </div>
      </header>

      <div className="game-board-region" ref={boardRegion} id="solo-board-review">
        <div className="game-region-header" aria-hidden="true">
          <span>GUESS BOARD</span>
          <span>{session.status.toUpperCase()}</span>
        </div>
        <GameHistoryViewport
          followKey={`${session.puzzleIndex}:${currentRows.length}:${budget}`}
          label="Guess board history"
        >
          <div className="game-board" role="table" aria-label="Guess board">
            {currentRows.map((row, index) => (
              <BoardRow
                key={row.id}
                row={row}
                length={settings.length}
                number={index + 1}
                label={
                  row.kind === 'seeded'
                    ? `Seeded evidence: ${row.guess}`
                    : `Accepted guess: ${row.guess}`
                }
              />
            ))}
            {!isTerminal && session.status === 'active' && (
              <DraftRow
                draft={session.draft}
                length={settings.length}
                revealed={session.revealedPositions}
                number={currentRows.length + 1}
              />
            )}
            {Array.from({
              length: Math.max(
                0,
                budget - acceptedRows.length - (!isTerminal && session.status === 'active' ? 1 : 0),
              ),
            }).map((_, index) => (
              <BoardRow
                key={`empty:${index}`}
                length={settings.length}
                number={
                  currentRows.length +
                  (!isTerminal && session.status === 'active' ? 1 : 0) +
                  index +
                  1
                }
                label={`Empty attempt ${acceptedRows.length + index + 2}`}
              />
            ))}
          </div>
        </GameHistoryViewport>
      </div>

      <div className="game-message">
        <span className="game-message-copy">
          <span aria-hidden="true">❯ </span>
          <span aria-live="assertive">
            {session.rejection ??
              (session.status === 'holding'
                ? 'Solved. Carrying that answer into the next puzzle…'
                : session.status === 'won'
                  ? 'Solved. Nice work.'
                  : session.status === 'lost'
                    ? 'No attempts remain.'
                    : 'Ready for your guess.')}
          </span>
        </span>
        <span
          className="game-backup-warning"
          role={cloudBackupNeedsAttention ? 'status' : undefined}
          aria-hidden={!cloudBackupNeedsAttention}
          data-visible={cloudBackupNeedsAttention ? 'true' : 'false'}
        >
          <span>ACCOUNT BACKUP</span>
          <button type="button" onClick={() => void retryCloudBackup()}>
            RETRY
          </button>
        </span>
      </div>

      <section className="game-auxiliary" aria-labelledby="game-auxiliary-heading">
        <button
          id="game-auxiliary-heading"
          type="button"
          className="game-auxiliary-toggle"
          aria-expanded={auxiliaryOpen}
          aria-controls="game-auxiliary-content"
          onClick={() => setAuxiliaryOpen((current) => !current)}
        >
          Evidence and game tools
        </button>
        <div id="game-auxiliary-content" className="game-auxiliary-content" hidden={!auxiliaryOpen}>
          <EvidenceLegend />
          {isPractice && session.status === 'active' && (
            <>
              <div
                className="game-tools"
                aria-label="Solo Practice tools"
                aria-busy={Boolean(pendingTool)}
              >
                <button
                  type="button"
                  disabled={Boolean(pendingTool) || (economy.data?.reveal_one_letter ?? 0) < 1}
                  onClick={() => void applyReveal()}
                >
                  {pendingTool === 'reveal' ? 'REVEALING' : 'REVEAL LETTER'} ·{' '}
                  {economy.data?.reveal_one_letter ?? 0}
                </button>
                <button
                  type="button"
                  disabled={
                    Boolean(pendingTool) || (economy.data?.remove_incorrect_letters ?? 0) < 1
                  }
                  onClick={() => void applyRemoval()}
                >
                  {pendingTool === 'remove' ? 'REMOVING' : 'REMOVE LETTERS'} ·{' '}
                  {economy.data?.remove_incorrect_letters ?? 0}
                </button>
                <button
                  type="button"
                  disabled={pendingTool === 'sound' || feedback.status === 'saving'}
                  onClick={() => {
                    if (pendingTool) return;
                    const next = !soundEnabled;
                    setPendingTool('sound');
                    setToolState(`Turning sound ${next ? 'on' : 'off'}…`);
                    void feedback
                      .update({ sound: next })
                      .then(() => setToolState(`Sound is ${next ? 'on' : 'off'}.`))
                      .catch(() => setToolState('Sound preference was not saved. Try again.'))
                      .finally(() => setPendingTool(null));
                  }}
                >
                  SOUND {soundEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              <p className="game-tool-status" aria-live="polite">
                {toolState}
              </p>
            </>
          )}
        </div>
      </section>

      {!isTerminal && (
        <GameKeyboard
          evidence={keyboard}
          disabled={session.status !== 'active'}
          onLetter={(letter) => void issue({ type: 'insert', letter, now: now() })}
          onSubmit={() =>
            void issue({
              type: 'submit',
              sanctionedWords,
              now: now(),
            })
          }
          onDelete={() => void issue({ type: 'delete', now: now() })}
        />
      )}

      {session.status === 'lost' && isPractice && !session.answerRevealed && (
        <section className="result-panel" aria-labelledby="continue-heading">
          <h2 id="continue-heading">No attempts remain</h2>
          <p>Continue with one more attempt, or reveal the answer and keep this loss final.</p>
          <div className="action-row">
            <button
              className="primary"
              disabled={continuationPending}
              onClick={() => void continueGame()}
            >
              {continuationPending ? 'CONTINUING' : 'CONTINUE'} ·{' '}
              {continuationCost({
                wordLength: settings.length,
                completionPercentage: completionPercentage(session),
                continuationCount: session.continuationCount,
              })}{' '}
              coins
            </button>
            <button
              disabled={continuationPending}
              onClick={() => void issue({ type: 'reveal-answer', now: now() })}
            >
              REVEAL ANSWER
            </button>
          </div>
        </section>
      )}

      {isTerminal && (session.status === 'won' || session.answerRevealed || !isPractice) && (
        <section
          className="result-panel"
          aria-labelledby="result-heading"
          ref={resultPanel}
          tabIndex={-1}
          id="solo-result-review"
        >
          <h2 id="result-heading">
            {session.status === 'won' ? 'You solved it' : 'Game complete'}
          </h2>
          {settings.mode === 'go' ? (
            encounteredGoReview?.status === 'available' ? (
              <>
                <p>
                  {session.status === 'won'
                    ? `Completed all ${settings.goCount} puzzles.`
                    : `Reached puzzle ${session.puzzleIndex + 1} of ${settings.goCount}.`}
                </p>
                <EncounteredGoReview entries={encounteredGoReview.entries} />
              </>
            ) : (
              <p role="status">Encountered-word review is unavailable for this saved game.</p>
            )
          ) : (
            <>
              <p>
                The answer was{' '}
                <strong className="mono">
                  {session.answers[session.puzzleIndex]?.toUpperCase()}
                </strong>
                .
              </p>
              {session.answers[session.puzzleIndex] && (
                <WordDefinition word={session.answers[session.puzzleIndex] ?? ''} />
              )}
            </>
          )}
          <div className="action-row">
            <button
              type="button"
              onClick={() =>
                boardRegion.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
              }
            >
              VIEW BOARD
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => void navigator.clipboard.writeText(shareText)}
            >
              COPY RESULT
            </button>
            <Link className="button" href="/play/solo">
              PLAY AGAIN
            </Link>
          </div>
        </section>
      )}
      <p className="game-message" aria-live="polite">
        {actionState}
      </p>
    </section>
  );
}
