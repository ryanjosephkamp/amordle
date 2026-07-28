'use client';

type KeyState = 'unknown' | 'correct' | 'present' | 'absent' | 'removed';

const keyboardRows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const;

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
              className="key is-wide"
              onClick={onSubmit}
              aria-label="Submit guess"
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
              >
                {letter.toUpperCase()}
              </button>
            );
          })}
          {rowIndex === 2 && (
            <button
              type="button"
              className="key is-wide"
              onClick={onDelete}
              aria-label="Delete letter"
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
