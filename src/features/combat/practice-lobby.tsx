'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUnrankedPractice,
  joinUnrankedPractice,
  listUnrankedPractice,
} from '@/adapters/supabase/combat';
import type { PublicPracticeLobby } from '@/adapters/supabase/combat';
import { operationId } from '@/adapters/supabase/shared';
import { normalizeRankedPracticeConfig } from '@/adapters/session-combat';
import { PlayerIdentityLink } from '@/components/player-identity-link';
import { useAuth } from '@/components/providers';
import { AccountGate } from '@/components/route-states';
import type { Difficulty } from '@/domain/game';
import type { RankedPracticeConfig, RankedPracticeQueuePhase } from '@/domain/multiplayer';
import { rankedClockLadder } from '@/domain/profile';
import { useRankedQueue } from './ranked-queue';

/*
 * v8-C. The ranked format, matching what
 * `create_amordle_ranked_practice_request_v2` now enforces. The server is the
 * authority; these exist so the UI never composes a search it would refuse.
 */
const RANKED_WORD_LENGTH = 5;
const RANKED_DIFFICULTY = 'expert' as const;
const RANKED_GO_PUZZLES = 5 as const;

interface Props {
  length: number;
  /** v8-A5. Arrive already searching, for SEARCH AGAIN at the end of a ranked match. */
  autoQueueRanked?: boolean;
}

export function PracticeLobby(props: Props) {
  return (
    <AccountGate>
      <PracticeLobbyInner {...props} />
    </AccountGate>
  );
}

function PracticeLobbyInner({ length: routeLength, autoQueueRanked = false }: Props) {
  const auth = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  /*
   * C2. Word length was route-derived only, so the sole way to change it was a link that
   * reloaded the page. It is now an editable field seeded from the route, with the route
   * kept in step on commit rather than on every keystroke — the URL is what the ranked
   * search-recovery path compares against after a reload, so it has to record the length
   * a search was actually created at.
   *
   * The draft is held as a string because an `<input type="number">` legitimately passes
   * through states that are not numbers: clearing it yields '' (Number('') === 0) and a
   * lone '-' yields NaN. Either would reach `normalizeRankedPracticeConfig`, which is a
   * zod `.parse` running inside a `useMemo` during render — it throws, and the error
   * boundary blanks the page. Solo has no such parse, which is why it can be naive here.
   */
  const [wordLengthDraft, setWordLengthDraft] = useState(String(routeLength));
  /*
   * Reseed when the route changes, so inbound links still set the field — SEARCH AGAIN,
   * "Return to this ranked search", and the legacy bridges all arrive as a new prop on a
   * component that is already mounted. Adjusting during render rather than in an effect
   * is React's own pattern for this, and a `key` remount is wrong here: it would also
   * throw away the mode, difficulty and clock the player had already chosen.
   */
  const [seededFrom, setSeededFrom] = useState(routeLength);
  if (seededFrom !== routeLength) {
    setSeededFrom(routeLength);
    setWordLengthDraft(String(routeLength));
  }
  const parsedWordLength = Number(wordLengthDraft);
  const wordLengthValid =
    Number.isInteger(parsedWordLength) && parsedWordLength >= 2 && parsedWordLength <= 35;
  const wordLength = wordLengthValid ? parsedWordLength : routeLength;
  const [mode, setMode] = useState<'og' | 'go'>('og');
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [hardMode, setHardMode] = useState(false);
  const [goCount, setGoCount] = useState<5 | 7 | 10>(5);
  const [timeLimitMs, setTimeLimitMs] = useState<RankedPracticeConfig['timeLimitMs']>(null);
  /*
   * v8-B1. The ranked search is no longer this page's property. It is owned by
   * `RankedQueueProvider` above the shell, so it keeps running when the player
   * navigates away and is still here when they come back — including in a second tab.
   * This page drives it and renders it; it does not hold it.
   */
  const rankedQueue = useRankedQueue();
  const queue = rankedQueue.intent;
  const queuePhase = rankedQueue.phase;
  const [message, setMessage] = useState('');
  /*
   * Whether the live search was started from this form, on this mount. State rather
   * than a ref because the seed below reads it while rendering, and a ref read during
   * render is a value React does not guarantee is current.
   */
  const [startedHere, setStartedHere] = useState(false);
  const invalidateCombat = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['combat'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);

  // `wordLength` is already clamped to the route value while the draft is invalid, so
  // this parse cannot throw mid-typing.
  const currentConfig = useMemo<RankedPracticeConfig>(
    () =>
      normalizeRankedPracticeConfig({
        mode,
        wordLength,
        difficulty,
        hardMode,
        goPuzzleCount: mode === 'go' ? goCount : null,
        timeLimitMs,
      }),
    [difficulty, goCount, hardMode, mode, timeLimitMs, wordLength],
  );

  /*
   * v8-C. Ranked is one comparable format, so its configuration is derived rather than
   * whatever the form happens to hold.
   *
   * This form creates unranked matches too, and those keep every option — any length
   * from 2 to 35, any difficulty, any GO count. Ranked takes only the three choices
   * that identify a rating pool: mode, clock and hard mode. Deriving it here means the
   * player cannot compose a ranked search the server would refuse.
   */
  const rankedConfig = useMemo<RankedPracticeConfig>(
    () =>
      normalizeRankedPracticeConfig({
        mode,
        wordLength: RANKED_WORD_LENGTH,
        difficulty: RANKED_DIFFICULTY,
        hardMode,
        goPuzzleCount: mode === 'go' ? RANKED_GO_PUZZLES : null,
        timeLimitMs,
      }),
    [hardMode, mode, timeLimitMs],
  );

  const startSearch = useCallback(() => {
    setStartedHere(true);
    rankedQueue.start(rankedConfig);
  }, [rankedConfig, rankedQueue]);

  /*
   * Two message sources — this page's own outcomes and the app-wide search's phase —
   * so one of them has to yield. This page's wins while it has something to say, and a
   * change of phase clears it, because a phase change makes anything said before it
   * stale by definition. Both adjustments below run in the same render, and the seed
   * runs second so a restore can speak over the generic "searching".
   */
  const [trackedPhase, setTrackedPhase] = useState<RankedPracticeQueuePhase>(queuePhase);
  if (trackedPhase !== queuePhase) {
    setTrackedPhase(queuePhase);
    setMessage('');
  }

  /*
   * Seed the form from a search that is already running, once per search.
   *
   * The provider hydrates asynchronously from IndexedDB, so the intent arrives after
   * the first render rather than during it. Latching on the request id means a player
   * who edits the form while a search is live is not fought with on every re-render,
   * and that arriving on the page a second time does not re-seed over their edits.
   *
   * Adjusted during render rather than in an effect, the same way `seededFrom` above
   * handles a changed route: this is React's own pattern for deriving state from a
   * changed input, and it avoids the extra committed render an effect would cost.
   */
  const [seededSearch, setSeededSearch] = useState<string | null>(null);
  if (!queue && seededSearch !== null) {
    setSeededSearch(null);
    setStartedHere(false);
  } else if (queue && seededSearch !== queue.requestId) {
    setSeededSearch(queue.requestId);
    if (!startedHere) {
      /*
       * A search this mount did not start: it came back from the durable store, so the
       * form has to be told what it is searching for. Announced, because the player did
       * not just press for it — saying "restored" about a search someone started a
       * second ago would be nonsense.
       */
      // Only what identifies a ranked pool. Length, difficulty and GO count are fixed
      // for ranked, so restoring them over the player's unranked settings would be
      // rewriting choices the search never made.
      setMode(queue.config.mode);
      setHardMode(queue.config.hardMode);
      setTimeLimitMs(queue.config.timeLimitMs);
      setMessage('Restored your ranked search for this account.');
    }
  }

  const lobbies = useQuery({
    queryKey: ['combat', 'practice', 'unranked', auth.user?.id],
    queryFn: listUnrankedPractice,
    enabled: Boolean(auth.user?.id),
    refetchInterval: 5_000,
  });

  const create = useMutation({
    mutationFn: async () => {
      const userId = auth.user?.id;
      if (!userId) throw new Error('Sign in first.');
      // Unranked takes the form exactly as the player set it. Only ranked is
      // standardised, and `rankedConfig` above is where that happens.
      return createUnrankedPractice({
        ...currentConfig,
        creationKey: operationId('public-practice-create'),
      });
    },
    onSuccess: (row) => {
      void invalidateCombat();
      router.push(`/combat/match/${row.id}`);
    },
    onError: () => setMessage('The public match could not be created.'),
  });

  const join = useMutation({
    mutationFn: async (lobby: PublicPracticeLobby) => {
      const userId = auth.user?.id;
      if (!userId) throw new Error('Sign in first.');
      return joinUnrankedPractice(lobby, operationId('public-practice-join'));
    },
    onSuccess: (row) => {
      void invalidateCombat();
      router.push(`/combat/match/${row.id}`);
    },
    onError: () => {
      setMessage('That match changed before you joined. The list has been refreshed.');
      void lobbies.refetch();
    },
  });

  /*
   * v8-A5. SEARCH AGAIN, honouring its own label.
   *
   * The old button of that name navigated to this form and stopped, which is not what
   * "search again" means to anyone reading it. It now arrives with `?requeue=1` and starts
   * the search on landing.
   *
   * Fires once per mount, and only once the provider has finished reading the durable
   * intent — otherwise a player who already has a live search would stack a second one
   * against the five-request cap during the hydration gap.
   */
  const autoQueued = useRef(false);
  useEffect(() => {
    if (!autoQueueRanked || autoQueued.current || !rankedQueue.hydrated) return;
    if (!auth.user?.id || queue || queuePhase !== 'idle') return;
    autoQueued.current = true;
    // Deferred a tick: starting the search sets state, and this effect is reacting to
    // arrival rather than synchronising with anything, so it must not cascade renders.
    queueMicrotask(startSearch);
  }, [auth.user?.id, autoQueueRanked, queue, queuePhase, rankedQueue.hydrated, startSearch]);

  const available = useMemo(
    () => lobbies.data?.filter((row) => !row.capabilities.canCancel) ?? [],
    [lobbies.data],
  );

  return (
    <div className="split-layout">
      <section className="form-panel" aria-labelledby="practice-create-heading">
        <h2 id="practice-create-heading">Create or find a match</h2>
        <form
          className="field-stack"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <label>
            Mode
            <select
              aria-label="Mode"
              value={mode}
              disabled={Boolean(queue)}
              onChange={(event) => setMode(event.target.value as 'og' | 'go')}
            >
              <option value="og">OG</option>
              <option value="go">GO</option>
            </select>
          </label>
          {/*
           * C2. Same control as Solo setup, in the same place relative to Mode and
           * Difficulty, so the two setup screens read the same way. The implicit label
           * gives it the accessible name "Word length", matching how the private
           * challenge form's equivalent is already targeted.
           */}
          <label>
            Word length
            <input
              type="number"
              min={2}
              max={35}
              step={1}
              value={wordLengthDraft}
              disabled={Boolean(queue)}
              aria-invalid={wordLengthValid ? undefined : true}
              onChange={(event) => setWordLengthDraft(event.target.value)}
              onBlur={() => {
                // Commit to the route only once the value settles, and only when there
                // is no search to disturb — the restore effect keys on the route and
                // clears the queue before reading storage.
                if (wordLengthValid && !queue && parsedWordLength !== routeLength) {
                  router.replace(`/combat/practice?length=${parsedWordLength}`);
                }
              }}
            />
          </label>
          {!wordLengthValid && <p className="field-error">Word length must be from 2 to 35.</p>}
          <label>
            Difficulty
            <select
              value={difficulty}
              disabled={Boolean(queue)}
              onChange={(event) => setDifficulty(event.target.value as Difficulty)}
            >
              <option value="casual">Casual</option>
              <option value="standard">Standard</option>
              <option value="expert">Expert</option>
            </select>
          </label>
          {mode === 'go' && (
            <label>
              Puzzles
              <select
                value={goCount}
                disabled={Boolean(queue)}
                onChange={(event) => setGoCount(Number(event.target.value) as 5 | 7 | 10)}
              >
                <option value="5">5</option>
                <option value="7">7</option>
                <option value="10">10</option>
              </select>
            </label>
          )}
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={hardMode}
              disabled={Boolean(queue)}
              onChange={(event) => setHardMode(event.target.checked)}
            />
            Hard Mode
          </label>
          <label>
            Clock
            <select
              value={timeLimitMs ?? 'untimed'}
              disabled={Boolean(queue)}
              onChange={(event) =>
                setTimeLimitMs(
                  event.target.value === 'untimed'
                    ? null
                    : (Number(event.target.value) as RankedPracticeConfig['timeLimitMs']),
                )
              }
            >
              {rankedClockLadder.map((entry) => (
                <option key={entry.label} value={entry.timeLimitMs ?? 'untimed'}>
                  {entry.display}
                </option>
              ))}
            </select>
          </label>
          <div className="action-row">
            <button
              className="primary"
              disabled={create.isPending || Boolean(queue) || !wordLengthValid}
            >
              {create.isPending ? 'Creating…' : 'Create public unranked'}
            </button>
            <button
              type="button"
              disabled={rankedQueue.isBusy || Boolean(queue) || !wordLengthValid}
              onClick={startSearch}
            >
              {queue ? queueButtonLabel(queuePhase) : 'Find ranked match'}
            </button>
            {queue && ['conflict', 'failed'].includes(queuePhase) && (
              <button type="button" disabled={rankedQueue.isBusy} onClick={rankedQueue.poll}>
                Reread status
              </button>
            )}
            {queue && (
              <button type="button" disabled={rankedQueue.isBusy} onClick={rankedQueue.cancel}>
                Cancel search
              </button>
            )}
          </div>
          {queue && (
            <p className="mono" role="status">
              {queue.config.mode.toUpperCase()} · {queue.config.wordLength} letters ·{' '}
              {queue.config.difficulty} ·{' '}
              {queue.config.timeLimitMs === null ? 'untimed' : '5:00 per player'}
            </p>
          )}
          {queue && queue.config.wordLength !== wordLength && (
            <Link href={`/combat/practice?length=${queue.config.wordLength}`}>
              Return to this ranked search
            </Link>
          )}
        </form>
        <p aria-live="polite">{message || rankedQueue.message}</p>
      </section>
      {/*
       * B1. `.open-lobbies` is the only element declaring `container-type: inline-size`,
       * which the `.lobby-row` container query below 42rem depends on. Without it the
       * row would stay two-column at every width.
       */}
      <section className="open-lobbies" aria-labelledby="open-practice-heading">
        <div className="section-heading">
          <h2 id="open-practice-heading">Open public matches</h2>
          <button type="button" onClick={() => void lobbies.refetch()}>
            Refresh
          </button>
        </div>
        {lobbies.isPending ? (
          <p aria-live="polite">Loading matches…</p>
        ) : available.length ? (
          <div className="data-list">
            {available.map((row) => (
              <div className="data-row lobby-row" data-game-id={row.id} key={row.id}>
                <div className="lobby-row-summary">
                  <strong>
                    {/*
                     * B1. The same row shape the "Open public games" list already uses.
                     * PlayerIdentityLink links only when the projection carries a
                     * sanctioned public profile id, and degrades to plain text
                     * otherwise, so the privacy rule holds without a check here.
                     */}
                    <PlayerIdentityLink
                      publicProfileId={row.owner.publicProfileId}
                      displayName={row.owner.displayName || 'Open Practice player'}
                    />
                  </strong>
                  <p>
                    Practice · {row.mode.toUpperCase()} · {row.wordLength} letters ·{' '}
                    {row.difficulty}
                    {row.hardMode ? ' · Hard Mode' : ''}
                    {row.timeLimitMs === 300_000 ? ' · 5:00 per player' : ' · untimed'}
                  </p>
                </div>
                <button disabled={join.isPending} onClick={() => join.mutate(row)}>
                  Join
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="prose">No other player is waiting. Create the first match.</p>
        )}
      </section>
    </div>
  );
}

function queueButtonLabel(phase: RankedPracticeQueuePhase): string {
  switch (phase) {
    case 'matched':
      return 'Opening match…';
    case 'expired':
      return 'Search expired';
    case 'cancelled':
      return 'Search cancelled';
    case 'conflict':
      return 'Status changed';
    case 'failed':
      return 'Search needs attention';
    case 'queued':
    case 'idle':
      return 'Searching…';
  }
}
