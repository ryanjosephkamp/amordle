'use client';

import type { CSSProperties } from 'react';
import { GameHistoryViewport } from '@/components/game-history-viewport';
import { PlayerIdentityLink } from '@/components/player-identity-link';
import type { SeededTranscriptRow } from '@/domain/combat-transcript';

export interface CombatTranscriptMove {
  id: string;
  seat: 'player-one' | 'player-two';
  guess: string;
  tiles: Array<{ letter: string; state: 'correct' | 'present' | 'absent' }>;
  acceptedAt: string;
}

/**
 * v8-A4. The answer, shown on the board when a match ends by forfeit.
 *
 * Not a guess and not evidence — nobody played it. It is rendered in red, which no tile
 * state has ever used (the three are green, amber and slate), precisely so it cannot be
 * mistaken for a solve.
 */
export interface CombatTranscriptAnswer {
  id: string;
  kind: 'answer';
  guess: string;
}

export type CombatTranscriptRow =
  SeededTranscriptRow | (CombatTranscriptMove & { kind: 'guess' }) | CombatTranscriptAnswer;

export function MoveBoards({
  moves,
  length,
  viewerSeat,
  actorLabels,
  actorProfileIds,
  seededRows = [],
  forfeitedAnswer,
}: {
  moves: CombatTranscriptMove[];
  length: number;
  viewerSeat?: 'player-one' | 'player-two';
  actorLabels?: Partial<Record<'player-one' | 'player-two', string>>;
  actorProfileIds?: Partial<Record<'player-one' | 'player-two', string>>;
  seededRows?: SeededTranscriptRow[];
  /*
   * Optional and off by default, deliberately. This component is shared with the public
   * spectator view, whose RPC withholds `revealedAnswers` on purpose — a shared component
   * that can render the solution is a leak waiting to happen, so the caller must opt in
   * and only the two seated players ever do.
   */
  forfeitedAnswer?: string | undefined;
}) {
  const orderedMoves = [...moves].sort(
    (left, right) =>
      Date.parse(left.acceptedAt) - Date.parse(right.acceptedAt) || left.id.localeCompare(right.id),
  );
  const rows: CombatTranscriptRow[] = [
    ...seededRows,
    ...orderedMoves.map((move) => ({ ...move, kind: 'guess' as const })),
    ...(forfeitedAnswer
      ? [{ id: `answer:${forfeitedAnswer}`, kind: 'answer' as const, guess: forfeitedAnswer }]
      : []),
  ];
  const visibleRows = Math.max(6, rows.length + 1);
  return (
    <section
      className="combat-transcript-frame"
      aria-label="Shared chronological guess board"
      data-word-length={length}
      style={{ '--word-length': length } as CSSProperties}
    >
      <div className="combat-transcript-header" aria-hidden="true">
        <span className="combat-transcript-meta">
          <span>ROW</span>
          <span className="combat-meta-divider">·</span>
          <span>PLAYER</span>
        </span>
        <span>GUESS</span>
        <span />
      </div>
      <GameHistoryViewport
        followKey={rows.at(-1)?.id ?? 'empty'}
        label="Chronological COMBAT guess history"
        className="combat-history"
      >
        <div className="combat-transcript" role="table" aria-label="Accepted guesses in order">
          {Array.from({ length: visibleRows }, (_, index) => {
            const row = rows[index];
            if (!row) {
              return (
                <div className="combat-transcript-entry is-empty" key={`empty:${index}`}>
                  <span className="combat-transcript-meta">
                    <span className="board-row-number" aria-hidden="true">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="combat-meta-divider" aria-hidden="true">
                      ·
                    </span>
                    <span className="combat-actor" aria-hidden="true" />
                  </span>
                  <div className="combat-transcript-empty">
                    <EmptyTileRow length={length} />
                  </div>
                </div>
              );
            }
            const seeded = row.kind === 'seeded';
            const answer = row.kind === 'answer';
            const perspective = answer
              ? 'answer'
              : seeded
                ? 'seeded'
                : viewerSeat === undefined
                  ? row.seat
                  : row.seat === viewerSeat
                    ? 'you'
                    : 'opponent';
            const actorLabel = answer
              ? 'ANSWER'
              : row.kind === 'seeded'
                ? row.actorLabel
                : (actorLabels?.[row.seat] ??
                  (viewerSeat === undefined
                    ? row.seat === 'player-one'
                      ? 'P1'
                      : 'P2'
                    : perspective));
            return (
              <div
                className={`combat-transcript-entry is-${perspective}`}
                key={row.id}
                data-actor={perspective}
              >
                <span className="combat-transcript-meta">
                  <span className="board-row-number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="combat-meta-divider" aria-hidden="true">
                    ·
                  </span>
                  {row.kind === 'answer' ? (
                    <span className="combat-actor">ANSWER</span>
                  ) : row.kind === 'seeded' ? (
                    <span className="combat-actor">SEED {row.sourcePuzzleIndex + 1}</span>
                  ) : (
                    <PlayerIdentityLink
                      className="combat-actor"
                      publicProfileId={actorProfileIds?.[row.seat]}
                      displayName={actorLabel}
                    />
                  )}
                </span>
                <div className="combat-transcript-move">
                  {row.kind === 'answer' ? (
                    <AnswerTileRow guess={row.guess} />
                  ) : (
                    <TranscriptTileRow
                      guess={row.guess}
                      tiles={row.tiles}
                      actorLabel={actorLabel}
                      seeded={seeded}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </GameHistoryViewport>
    </section>
  );
}

function TranscriptTileRow({
  guess,
  tiles,
  actorLabel,
  seeded,
}: {
  guess: string;
  tiles: Array<{ letter: string; state: 'correct' | 'present' | 'absent' }>;
  actorLabel: string;
  seeded: boolean;
}) {
  return (
    <div
      className="board-row"
      role="row"
      aria-label={seeded ? `${actorLabel} ${guess}` : `${actorLabel} guessed ${guess}`}
    >
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

/**
 * v8-A4. The unplayed answer, in red.
 *
 * Its own component rather than a fourth state on `TranscriptTileRow`, because it is not
 * evidence: there is no per-letter verdict to show, so it carries no ✓/~/× glyph. The row
 * is marked `is-answer` and announced as the answer, not as a guess, so a screen reader
 * gets the same distinction the colour makes visually.
 */
function AnswerTileRow({ guess }: { guess: string }) {
  return (
    <div className="board-row is-answer" role="row" aria-label={`Answer ${guess}`}>
      {[...guess].map((letter, index) => (
        <div key={`${index}:${letter}`} className="tile is-answer" role="cell">
          <span className="tile-letter">{letter.toUpperCase()}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyTileRow({ length }: { length: number }) {
  return (
    <div className="board-row" aria-label="No accepted guess">
      {Array.from({ length }, (_, index) => (
        <div className="tile" key={index} />
      ))}
    </div>
  );
}
