'use client';

import { GameHistoryViewport } from '@/components/game-history-viewport';

export interface CombatTranscriptMove {
  id: string;
  seat: 'player-one' | 'player-two';
  guess: string;
  tiles: Array<{ letter: string; state: 'correct' | 'present' | 'absent' }>;
  acceptedAt: string;
}

export function MoveBoards({
  moves,
  length,
  viewerSeat,
}: {
  moves: CombatTranscriptMove[];
  length: number;
  viewerSeat: 'player-one' | 'player-two';
}) {
  const orderedMoves = [...moves].sort(
    (left, right) =>
      Date.parse(left.acceptedAt) - Date.parse(right.acceptedAt) || left.id.localeCompare(right.id),
  );
  const visibleRows = Math.max(6, orderedMoves.length + 1);
  return (
    <section className="combat-transcript-frame" aria-label="Shared chronological guess board">
      <div className="combat-transcript-header" aria-hidden="true">
        <span>ROW</span>
        <span>YOU</span>
        <span>OPPONENT</span>
      </div>
      <GameHistoryViewport
        followKey={orderedMoves.at(-1)?.id ?? 'empty'}
        label="Chronological COMBAT guess history"
        className="combat-history"
      >
        <div className="combat-transcript" role="table" aria-label="Accepted guesses in order">
          {Array.from({ length: visibleRows }, (_, index) => {
            const move = orderedMoves[index];
            if (!move) {
              return (
                <div className="combat-transcript-entry is-empty" key={`empty:${index}`}>
                  <span className="board-row-number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="combat-transcript-empty">
                    <EmptyTileRow length={length} />
                  </div>
                </div>
              );
            }
            const actor = move.seat === viewerSeat ? 'you' : 'opponent';
            return (
              <div
                className={`combat-transcript-entry is-${actor}`}
                key={move.id}
                data-actor={actor}
              >
                <span className="board-row-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="combat-actor">{actor.toUpperCase()}</span>
                <div className="combat-transcript-move">
                  <TranscriptTileRow guess={move.guess} tiles={move.tiles} />
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

function EmptyTileRow({ length }: { length: number }) {
  return (
    <div className="board-row" aria-label="No accepted guess">
      {Array.from({ length }, (_, index) => (
        <div className="tile" key={index} />
      ))}
    </div>
  );
}
