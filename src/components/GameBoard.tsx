import { Icon } from './Icon';
import type { Tile, TileState } from './gameBoardData';

export type { Tile, TileState } from './gameBoardData';

export function GameBoard({
  rows,
  length,
  activeRow,
  actors,
  compact = false,
}: {
  rows: Tile[][];
  length: number;
  activeRow?: number | undefined;
  actors?: string[] | undefined;
  compact?: boolean;
}) {
  return (
    <div
      className={`board-viewport ${compact ? 'board-viewport--compact' : ''}`}
      data-length={length}
    >
      <div
        className="game-board"
        role="grid"
        aria-label={`${length}-letter word board`}
        style={{ '--word-length': length } as React.CSSProperties}
      >
        {rows.map((row, rowIndex) => (
          <div
            className="board-row"
            role="row"
            key={`${rowIndex}-${row.map((tile) => tile.letter).join('')}`}
            aria-label={
              actors?.[rowIndex]
                ? `${actors[rowIndex]} guess ${rowIndex + 1}`
                : `Guess ${rowIndex + 1}`
            }
          >
            {actors?.[rowIndex] ? (
              <span className="actor-mark" aria-hidden="true">
                {actors[rowIndex]}
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
          </div>
        ))}
      </div>
    </div>
  );
}

const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export function Keyboard({
  evidence = {},
  disabled = false,
  onKey,
}: {
  evidence?: Record<string, TileState>;
  disabled?: boolean;
  onKey: (key: string) => void;
}) {
  return (
    <div className="keyboard" role="group" aria-label="Game keyboard">
      {rows.map((letters, index) => (
        <div className="keyboard__row" key={letters}>
          {index === 2 ? (
            <button
              type="button"
              onClick={() => onKey('ENTER')}
              disabled={disabled}
              className="key key--wide"
            >
              Enter
            </button>
          ) : null}
          {[...letters].map((letter) => {
            const state = evidence[letter] ?? 'empty';
            return (
              <button
                key={letter}
                type="button"
                onClick={() => onKey(letter)}
                disabled={disabled || state === 'removed'}
                className={`key key--${state}`}
                aria-label={`${letter}${state !== 'empty' ? `, ${state}` : ''}`}
              >
                {letter}
              </button>
            );
          })}
          {index === 2 ? (
            <button
              type="button"
              onClick={() => onKey('BACKSPACE')}
              disabled={disabled}
              className="key key--wide"
              aria-label="Backspace"
            >
              <Icon name="backspace" />
            </button>
          ) : null}
        </div>
      ))}
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
