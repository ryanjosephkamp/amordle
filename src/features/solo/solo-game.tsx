'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readEnvelope, writeEnvelope } from '@/adapters/indexeddb';
import {
  consumeLocalConsumable,
  creditLocalCoins,
  getLocalEconomy,
  loadLocalPreferences,
  saveLocalSound,
  spendLocalCoins,
} from '@/adapters/local-account';
import {
  consumeConsumable,
  getEconomy,
  loadSettings,
  saveSettings,
  spendCoins,
} from '@/adapters/supabase/account';
import {
  finalizeSignedInSolo,
  loadCloudSolo,
  saveCloudSolo,
  setDailyEntitlement,
} from '@/adapters/supabase/solo';
import { operationId } from '@/adapters/supabase/shared';
import { GameHistoryViewport } from '@/components/game-history-viewport';
import { GameKeyboard } from '@/components/game-keyboard';
import { useAuth } from '@/components/providers';
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

interface SoloGameProps {
  sessionId: string;
  ownerNamespace: string;
  settings: GameSettings;
  answers: string[];
  validGuesses: string[];
  dailyDate?: string;
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
}: SoloGameProps) {
  const auth = useAuth();
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
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'syncing' | 'error'>('saved');
  const [actionState, setActionState] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [auxiliaryOpen, setAuxiliaryOpen] = useState(true);
  const revision = useRef(0);
  const sessionRef = useRef(session);
  const finalized = useRef(false);
  const pendingOperation = useRef<string | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const domain = `solo:${sessionId}`;
  const signedInUserId = auth.status === 'signed-in' ? auth.user?.id : undefined;
  const isPractice = dailyDate === undefined;
  const economy = useQuery({
    queryKey: ['economy', ownerNamespace],
    queryFn: () => (signedInUserId ? getEconomy() : getLocalEconomy(ownerNamespace)),
    enabled: isPractice,
  });
  const preferences = useQuery({
    queryKey: ['solo-preferences', ownerNamespace],
    queryFn: async () =>
      signedInUserId ? loadSettings(signedInUserId) : loadLocalPreferences(ownerNamespace),
  });

  useEffect(() => {
    if (preferences.data) {
      queueMicrotask(() => setSoundEnabled(preferences.data.sound));
    }
  }, [preferences.data]);

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
    (frequency: number) => {
      if (!soundEnabled) return;
      const context = audioContext.current ?? new AudioContext();
      audioContext.current = context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.06);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.06);
    },
    [soundEnabled],
  );

  const persist = useCallback(
    async (next: GameSession) => {
      const nextRevision = revision.current + 1;
      const envelope = {
        schemaVersion: 1 as const,
        ownerNamespace,
        domain,
        revision: nextRevision,
        updatedAt: next.updatedAt,
        state: next,
      };
      setSaveState('saving');
      await writeEnvelope(envelope);
      revision.current = nextRevision;
      if (!signedInUserId) {
        setSaveState('saved');
        return;
      }
      setSaveState('syncing');
      try {
        await saveCloudSolo(signedInUserId, envelope);
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    },
    [domain, ownerNamespace, signedInUserId],
  );

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
            if (active) setSaveState('error');
          }
        }
        const reconciled = reconcileRevisioned(local, remote);
        const stored = reconciled === remote ? remote : local;
        if (
          active &&
          stored &&
          stored.state.id === sessionId &&
          JSON.stringify(stored.state.answers) === JSON.stringify(answers)
        ) {
          revision.current = stored.revision;
          setSession(stored.state);
          if (remote && stored === remote) await writeEnvelope(stored);
        }
      } finally {
        if (active) setHydrated(true);
      }
    };
    void hydrate();
    return () => {
      active = false;
    };
  }, [answers, auth.status, domain, ownerNamespace, sessionId, signedInUserId]);

  const issue = useCallback(
    async (command: GameCommand) => {
      const current = sessionRef.current;
      const next = reduceGame(current, command);
      if (next === current) return false;
      const accepted =
        next.rows.filter((row) => row.kind === 'accepted').length >
        current.rows.filter((row) => row.kind === 'accepted').length;
      if (command.type === 'submit') {
        playCue(accepted ? (next.status === 'won' ? 660 : 420) : 190);
      } else if (command.type === 'insert' || command.type === 'delete') {
        playCue(300);
      }
      if (accepted) {
        try {
          await persist(next);
          setSession(next);
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
          setSaveState('error');
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
      } catch {
        setSaveState('error');
      }
      return true;
    },
    [dailyDate, persist, playCue, queryClient, settings.mode, signedInUserId],
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
    void finalizeSignedInSolo(
      signedInUserId,
      session,
      dailyDate ? 'solo-daily' : 'solo-practice',
      dailyDate,
    )
      .then(() => {
        setActionState('Result, History, XP, and coins are synced.');
        void queryClient.invalidateQueries({ queryKey: ['economy'] });
        void queryClient.invalidateQueries({ queryKey: ['history'] });
        void queryClient.invalidateQueries({ queryKey: ['progress'] });
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
        queryClient.setQueryData(['economy', ownerNamespace], nextEconomy);
        setActionState('Result and guest coins are saved on this device.');
      })
      .catch(() => {
        finalized.current = false;
        setActionState('Result is saved; guest reward will safely retry after reload.');
      });
  }, [dailyDate, hydrated, ownerNamespace, queryClient, session, signedInUserId]);

  const currentRows = session.rows.filter((row) => row.puzzleIndex === session.puzzleIndex);
  const acceptedRows = currentRows.filter((row) => row.kind === 'accepted');
  const budget =
    settings.mode === 'go'
      ? playableAttemptBudget(session.puzzleIndex) + session.continuationCount
      : 6 + session.continuationCount;
  const keyboard = deriveKeyboardEvidence(currentRows, new Set(session.removedLetters));
  const isTerminal = session.status === 'won' || session.status === 'lost';
  const seededCount = session.rows.filter((row) => row.kind === 'seeded').length;
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
    if (!economy.data) {
      setActionState('Obtain a Reveal One Letter item first.');
      return;
    }
    const id = pendingOperation.current ?? operationId(`solo-reveal:${session.id}`);
    pendingOperation.current = id;
    const known = new Set<number>(Object.keys(session.revealedPositions).map(Number));
    for (const row of currentRows) {
      row.tiles.forEach((tile, index) => {
        if (tile.state === 'correct') known.add(index);
      });
    }
    const position = selectRevealPosition({
      answer: answers[session.puzzleIndex] ?? '',
      knownPositions: known,
      operationId: id,
    });
    if (position === null) {
      pendingOperation.current = null;
      setActionState('Every position is already known.');
      return;
    }
    try {
      const nextEconomy = signedInUserId
        ? await consumeConsumable('reveal_one_letter', id)
        : await consumeLocalConsumable(ownerNamespace, 'reveal_one_letter', id);
      await issue({
        type: 'reveal-position',
        operationId: id,
        position,
        letter: answers[session.puzzleIndex]?.[position] ?? '',
        now: now(),
      });
      queryClient.setQueryData(['economy', ownerNamespace], nextEconomy);
      pendingOperation.current = null;
      setActionState(`Position ${position + 1} is now locked.`);
    } catch {
      setActionState('Reveal was not applied. Retrying uses the same operation.');
    }
  };

  const applyRemoval = async () => {
    if (!economy.data) {
      setActionState('Obtain a Remove Incorrect Letters item first.');
      return;
    }
    const id = pendingOperation.current ?? operationId(`solo-remove:${session.id}`);
    pendingOperation.current = id;
    const letters = selectIncorrectLettersToRemove({
      answer: answers[session.puzzleIndex] ?? '',
      draft: session.draft,
      alreadyAbsentOrRemoved: new Set(
        Object.entries(keyboard)
          .filter(([, state]) => state === 'absent' || state === 'removed')
          .map(([letter]) => letter),
      ),
      operationId: id,
    });
    try {
      const nextEconomy = signedInUserId
        ? await consumeConsumable('remove_incorrect_letters', id)
        : await consumeLocalConsumable(ownerNamespace, 'remove_incorrect_letters', id);
      await issue({ type: 'remove-letters', operationId: id, letters, now: now() });
      queryClient.setQueryData(['economy', ownerNamespace], nextEconomy);
      pendingOperation.current = null;
      setActionState(`${letters.length} impossible letters were removed.`);
    } catch {
      setActionState('Letters were not removed. Retrying uses the same operation.');
    }
  };

  const continueGame = async () => {
    const id = pendingOperation.current ?? operationId(`solo-continuation:${session.id}`);
    pendingOperation.current = id;
    const cost = continuationCost({
      wordLength: settings.length,
      completionPercentage: completionPercentage(session),
      continuationCount: session.continuationCount,
    });
    try {
      const nextEconomy = signedInUserId
        ? await spendCoins(cost, id)
        : await spendLocalCoins(ownerNamespace, cost, id);
      await issue({ type: 'continue', operationId: id, now: now() });
      queryClient.setQueryData(['economy', ownerNamespace], nextEconomy);
      pendingOperation.current = null;
      finalized.current = false;
      setActionState(`One attempt added for ${cost} coins.`);
    } catch {
      setActionState(`Continuation was not applied. ${cost} coins are required.`);
    }
  };

  if (!hydrated) {
    return (
      <section className="game-loading" aria-live="polite">
        Restoring your game…
      </section>
    );
  }

  return (
    <section className="game-layout" aria-labelledby="game-heading">
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
          {(saveState === 'saving' || saveState === 'syncing') && (
            <span className={`save-state is-${saveState}`} aria-live="polite">
              {saveState === 'saving' ? 'SAVING…' : 'SYNCING…'}
            </span>
          )}
        </div>
        {saveState === 'error' && (
          <div className="game-sync-notice" role="status">
            <span>Saved on this device. Account backup needs attention.</span>
            <button type="button" onClick={() => void persist(sessionRef.current)}>
              RETRY
            </button>
          </div>
        )}
      </header>

      <div className="game-board-region">
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

      <div className="game-message" aria-live="assertive">
        <span aria-hidden="true">❯ </span>
        {session.rejection ??
          (session.status === 'holding'
            ? 'Solved. Carrying that answer into the next puzzle…'
            : session.status === 'won'
              ? 'Solved. Nice work.'
              : session.status === 'lost'
                ? 'No attempts remain.'
                : 'Ready for your guess.')}
      </div>

      <details
        className="game-auxiliary"
        open={auxiliaryOpen}
        onToggle={(event) => setAuxiliaryOpen(event.currentTarget.open)}
      >
        <summary>Evidence and game tools</summary>
        <div className="game-auxiliary-content">
          <EvidenceLegend />
          {isPractice && session.status === 'active' && (
            <div className="game-tools" aria-label="Solo Practice tools">
              <button
                type="button"
                disabled={(economy.data?.reveal_one_letter ?? 0) < 1}
                onClick={() => void applyReveal()}
              >
                REVEAL LETTER · {economy.data?.reveal_one_letter ?? 0}
              </button>
              <button
                type="button"
                disabled={(economy.data?.remove_incorrect_letters ?? 0) < 1}
                onClick={() => void applyRemoval()}
              >
                REMOVE LETTERS · {economy.data?.remove_incorrect_letters ?? 0}
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  void (signedInUserId
                    ? loadSettings(signedInUserId).then((current) =>
                        saveSettings(signedInUserId, { ...current, sound: next }),
                      )
                    : saveLocalSound(ownerNamespace, next));
                }}
              >
                SOUND {soundEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          )}
        </div>
      </details>

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
            <button className="primary" onClick={() => void continueGame()}>
              CONTINUE ·{' '}
              {continuationCost({
                wordLength: settings.length,
                completionPercentage: completionPercentage(session),
                continuationCount: session.continuationCount,
              })}{' '}
              coins
            </button>
            <button onClick={() => void issue({ type: 'reveal-answer', now: now() })}>
              REVEAL ANSWER
            </button>
          </div>
        </section>
      )}

      {isTerminal && (session.status === 'won' || session.answerRevealed || !isPractice) && (
        <section className="result-panel" aria-labelledby="result-heading">
          <h2 id="result-heading">
            {session.status === 'won' ? 'You solved it' : 'Game complete'}
          </h2>
          <p>
            The answer was{' '}
            <strong className="mono">{answers[session.puzzleIndex]?.toUpperCase()}</strong>.
          </p>
          <div className="action-row">
            <button
              type="button"
              className="primary"
              onClick={() => void navigator.clipboard.writeText(shareText)}
            >
              COPY RESULT
            </button>
            <a
              className="button"
              href={`https://www.google.com/search?q=define+${encodeURIComponent(
                answers[session.puzzleIndex] ?? '',
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              FIND DEFINITION
            </a>
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
