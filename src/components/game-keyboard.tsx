'use client';

type KeyState = 'unknown' | 'correct' | 'present' | 'absent' | 'removed';

const keyboardRows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const;

/*
 * The same marks the board's tiles carry, so a key never depends on its color alone.
 * A correct key once differed from an untried one by a few points of blue (RGB 179, 211,
 * 186 against 179, 211, 196 under the default accent) and had no mark at all.
 */
const keyMarks: Partial<Record<KeyState, string>> = {
  correct: '✓',
  present: '~',
  absent: '×',
  removed: '−',
};

export function GameKeyboard({
  evidence = {},
  disabled = false,
  submitDisabled = disabled,
  deleteDisabled = disabled,
  onLetter,
  onSubmit,
  onDelete,
}: {
  evidence?: Readonly<Record<string, KeyState>>;
  disabled?: boolean;
  submitDisabled?: boolean;
  deleteDisabled?: boolean;
  onLetter(letter: string): void;
  onSubmit(): void;
  onDelete(): void;
}) {
  return (
    <div className="keyboard" aria-label="On-screen keyboard">
      {keyboardRows.map((row, rowIndex) => (
        <div className="keyboard-row" key={row}>
          {rowIndex === 2 && (
            <button
              type="button"
              className="key is-wide is-unknown"
              onClick={onSubmit}
              aria-label="Submit guess"
              data-evidence="unknown"
              disabled={submitDisabled}
            >
              SUBMIT
            </button>
          )}
          {[...row].map((letter) => {
            const state = evidence[letter] ?? 'unknown';
            return (
              <button
                type="button"
                className={`key is-${state}`}
                key={letter}
                onClick={() => onLetter(letter)}
                aria-label={`${letter.toUpperCase()}, ${state}`}
                disabled={disabled || state === 'removed'}
                data-evidence={state}
              >
                <span>{letter.toUpperCase()}</span>
                {keyMarks[state] && (
                  <span className="key-evidence" aria-hidden="true">
                    {keyMarks[state]}
                  </span>
                )}
              </button>
            );
          })}
          {rowIndex === 2 && (
            <button
              type="button"
              className="key is-wide is-unknown"
              onClick={onDelete}
              aria-label="Delete letter"
              data-evidence="unknown"
              disabled={deleteDisabled}
            >
              DELETE
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
