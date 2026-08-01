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
  hapticsEnabled = false,
  reducedEffects = false,
}: {
  evidence?: Readonly<Record<string, KeyState>>;
  disabled?: boolean;
  submitDisabled?: boolean;
  deleteDisabled?: boolean;
  onLetter(letter: string): void;
  onSubmit(): void;
  onDelete(): void;
  hapticsEnabled?: boolean;
  reducedEffects?: boolean;
}) {
  const touchFeedback = (pointerType: string) => {
    if (
      pointerType === 'touch' &&
      hapticsEnabled &&
      !reducedEffects &&
      typeof navigator.vibrate === 'function'
    ) {
      navigator.vibrate(8);
    }
  };
  return (
    <div className="keyboard" aria-label="On-screen keyboard">
      {keyboardRows.map((row, rowIndex) => (
        <div className="keyboard-row" key={row}>
          {rowIndex === 2 && (
            <button
              type="button"
              className="key is-wide is-unknown"
              onClick={onSubmit}
              onPointerDown={(event) => touchFeedback(event.pointerType)}
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
                onPointerDown={(event) => touchFeedback(event.pointerType)}
                aria-label={`${letter.toUpperCase()}, ${state}`}
                disabled={disabled || state === 'removed'}
                data-evidence={state}
              >
                <span>{letter.toUpperCase()}</span>
                {state === 'absent' && (
                  <span className="key-evidence" aria-hidden="true">
                    ×
                  </span>
                )}
                {state === 'removed' && (
                  <span className="key-evidence" aria-hidden="true">
                    −
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
              onPointerDown={(event) => touchFeedback(event.pointerType)}
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
