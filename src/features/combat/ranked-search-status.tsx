'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useRankedQueue } from './ranked-queue';

/*
 * v8-B2. The persistent face of a background ranked search.
 *
 * The search now outlives the lobby, which means it can be running while the player is
 * anywhere in the app — and an invisible thing that will eventually seize the screen is
 * worse than one that never ran. This strip is the standing evidence that a search
 * exists, how long it has been going, and how to stop it, from any route.
 *
 * When the match lands it announces itself and offers the link rather than navigating:
 * auto-navigation only happens on the lobby, where the player is already waiting for
 * exactly this. Interrupting a Solo game or a Help page is not a feature.
 *
 * It sits alongside `ConnectivityStatus`, uses `role="status"` with a polite live
 * region, and is dismissible so it can never become a permanent obstruction.
 */

function elapsedLabel(sinceIso: string, now: number): string {
  const started = Date.parse(sinceIso);
  if (!Number.isFinite(started)) return '';
  const seconds = Math.max(0, Math.floor((now - started) / 1_000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function RankedSearchStatus() {
  const queue = useRankedQueue();
  const pathname = usePathname();
  const [now, setNow] = useState(() => Date.now());
  /*
   * Stand down on the lobby. That page renders the search inline, with its own
   * configuration line and its own cancel, and it is where a match auto-opens. Showing
   * the strip there would duplicate every control and, because both are polite live
   * regions, announce the same search twice to a screen reader.
   */
  const onLobby = pathname?.startsWith('/combat/practice') ?? false;
  const searching = queue.phase === 'queued' || queue.phase === 'conflict';
  const matched = queue.phase === 'matched' && Boolean(queue.matchedGameId);

  useEffect(() => {
    if (!searching || onLobby) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [onLobby, searching]);

  if (!queue.hydrated || onLobby) return null;
  if (matched) {
    return (
      <aside className="ranked-search-status is-matched" role="status" aria-live="polite">
        <strong>MATCH READY</strong>
        <span>Your ranked opponent is waiting.</span>
        <div className="ranked-search-actions">
          <Link
            className="button"
            href={`/combat/match/${queue.matchedGameId}`}
            onClick={queue.acknowledge}
          >
            Open match
          </Link>
          <button type="button" onClick={queue.acknowledge}>
            Dismiss
          </button>
        </div>
      </aside>
    );
  }
  if (!searching || !queue.intent) return null;

  const { config } = queue.intent;
  return (
    <aside className="ranked-search-status is-searching" role="status" aria-live="polite">
      <strong>SEARCHING</strong>
      <span>
        Ranked {config.mode.toUpperCase()} · {config.wordLength} letters ·{' '}
        <span className="ranked-search-elapsed">{elapsedLabel(queue.intent.createdAt, now)}</span>
      </span>
      <div className="ranked-search-actions">
        <Link className="button" href={`/combat/practice?length=${config.wordLength}`}>
          Open lobby
        </Link>
        <button type="button" onClick={queue.cancel} disabled={queue.isBusy}>
          Cancel search
        </button>
      </div>
    </aside>
  );
}
