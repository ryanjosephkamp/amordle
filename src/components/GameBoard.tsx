import { Icon } from './Icon';
import type { Tile, TileState } from './gameBoardData';

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
      className={`board-viewport ${compact ? 'board-viewport--compact' : ''}`}
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

const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

const keyboardStatePriority: Record<TileState, number> = {
  empty: 0,
  draft: 0,
  absent: 1,
  present: 2,
  correct: 3,
  removed: 4,
};

function normalizeKeyboardEvidence(
  evidence: Readonly<Record<string, TileState>>,
): Readonly<Record<string, TileState>> {
  const normalized: Record<string, TileState> = {};
  for (const [rawLetter, state] of Object.entries(evidence)) {
    const letter = rawLetter.toUpperCase();
    const prior = normalized[letter] ?? 'empty';
    if (keyboardStatePriority[state] > keyboardStatePriority[prior]) normalized[letter] = state;
  }
  return normalized;
}

export function Keyboard({
  evidence = {},
  disabled = false,
  onKey,
}: {
  evidence?: Record<string, TileState>;
  disabled?: boolean;
  onKey: (key: string) => void;
}) {
  const normalizedEvidence = normalizeKeyboardEvidence(evidence);
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
            const state = normalizedEvidence[letter] ?? 'empty';
            return (
              <button
                key={letter}
                type="button"
                onClick={() => onKey(letter)}
                disabled={disabled || state === 'removed'}
                className={`key key--${state}`}
                data-state={state}
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
