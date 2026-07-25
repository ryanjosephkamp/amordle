import type { Tile } from './gameBoardData';

export type { Tile, TileState } from './gameBoardData';

export function GameBoard({
  rows,
  length,
  activeRow,
  actors,
  rowLabels,
  compact = false,
}: {
  rows: Tile[][];
  length: number;
  activeRow?: number | undefined;
  actors?: string[] | undefined;
  rowLabels?: (string | undefined)[] | undefined;
  compact?: boolean;
}) {
  const attributed = actors !== undefined || rowLabels?.some(Boolean) === true;
  return (
    <div
      className={`board-viewport ${attributed ? 'board-viewport--attributed' : ''} ${compact ? 'board-viewport--compact' : ''}`}
      data-length={length}
    >
      <div
        className={`game-board ${attributed ? 'game-board--attributed' : ''}`}
        role="grid"
        aria-label={`${length}-letter word board`}
        style={{ '--word-length': length } as React.CSSProperties}
      >
        {rows.map((row, rowIndex) => {
          const actor = actors?.[rowIndex];
          const rowLabel = rowLabels?.[rowIndex];
          const attribution = actor ?? rowLabel;
          return (
            <div
              className={`board-row ${attributed ? 'board-row--attributed' : ''}`}
              role="row"
              key={`${rowIndex}-${row.map((tile) => tile.letter).join('')}`}
              aria-label={
                actor
                  ? `${actor} guess ${rowIndex + 1}`
                  : rowLabel
                    ? `${rowLabel} seeded evidence row; consumes one GO attempt slot`
                    : `Guess ${rowIndex + 1}`
              }
            >
              {attributed ? (
                <span
                  className={`actor-gutter ${actor ? 'actor-mark' : ''} ${rowLabel ? 'evidence-mark' : ''} ${attribution ? '' : 'actor-gutter--empty'}`}
                  aria-hidden="true"
                >
                  {attribution ?? ''}
                </span>
              ) : null}
              {row.map((tile, colIndex) => {
                const letter = tile.letter?.toUpperCase() ?? '';
                return (
                  <div
                    role="gridcell"
                    key={colIndex}
                    className={`tile tile--${tile.state} ${activeRow === rowIndex ? 'tile--active-row' : ''}`}
                    aria-label={
                      letter ? `${letter}, ${tile.state}` : `empty position ${colIndex + 1}`
                    }
                  >
                    <span aria-hidden="true">{letter}</span>
                  </div>
                );
              })}
              {attributed ? (
                <span className="actor-gutter actor-gutter--balance" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TileLegend() {
  return (
    <ul className="tile-legend" aria-label="Tile meaning">
      <li>
        <span className="swatch swatch--correct" />
        Correct
      </li>
      <li>
        <span className="swatch swatch--present" />
        Present
      </li>
      <li>
        <span className="swatch swatch--absent" />
        Absent
      </li>
      <li>
        <span className="swatch swatch--removed" />
        Removed
      </li>
    </ul>
  );
}
