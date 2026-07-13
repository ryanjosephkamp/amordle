import type { KeyboardInput, KeyboardLetterStates } from '../game/input/useKeyboardInput'
import { classNames } from './classNames'

interface KeyboardProps {
  readonly disabled?: boolean
  readonly disabledLetters?: readonly string[]
  readonly letterStates?: KeyboardLetterStates
  readonly onInput: (input: KeyboardInput) => void
}

const keyboardRows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const

const stateClasses = {
  unknown: 'border-slate-600 bg-slate-800 text-slate-100 hover:border-[var(--color-ice-300)] hover:bg-slate-700',
  absent: 'border-slate-700 bg-slate-950 text-slate-400',
  present: 'border-amber-300/60 bg-amber-300/20 text-amber-50',
  correct: 'border-emerald-300/60 bg-emerald-300/25 text-emerald-50',
} as const

function KeyboardButton({
  children,
  className,
  disabled,
  isAction = false,
  onClick,
  state = 'unknown',
  title,
}: {
  readonly children: string
  readonly className?: string
  readonly disabled?: boolean
  readonly isAction?: boolean
  readonly onClick: () => void
  readonly state?: keyof typeof stateClasses
  readonly title: string
}) {
  return (
    <button
      aria-label={title}
      className={classNames(
        'flex items-center justify-center rounded-md border font-bold uppercase transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50',
        stateClasses[state],
        className,
      )}
      data-state={state}
      disabled={disabled}
      onClick={onClick}
      style={{
        minHeight: 'var(--brrrdle-key-min)',
        minWidth: isAction
          ? 'clamp(2.75rem, 13cqi, 4.5rem)'
          : 'clamp(1.75rem, 8.5cqi, var(--brrrdle-key-max))',
        paddingInline: isAction ? '0.5rem' : '0.25rem',
        fontSize: isAction ? 'var(--brrrdle-key-action-font)' : 'var(--brrrdle-key-font)',
        touchAction: 'manipulation',
      }}
      type="button"
    >
      {children}
    </button>
  )
}

export function Keyboard({ disabled = false, disabledLetters = [], letterStates = {}, onInput }: KeyboardProps) {
  const removed = new Set(disabledLetters.map((letter) => letter.toLocaleLowerCase('en-US')))
  return (
    <section
      aria-label="Keyboard"
      className="@container mx-auto w-full max-w-2xl space-y-1.5 rounded-lg border border-white/10 bg-slate-950 px-2 py-2 sm:space-y-2"
    >
      {keyboardRows.map((row, rowIndex) => (
        <div className="flex justify-center gap-1 sm:gap-1.5" key={row}>
          {rowIndex === 2 ? (
            <KeyboardButton disabled={disabled} isAction onClick={() => onInput({ type: 'submit' })} title="Submit guess">
              Enter
            </KeyboardButton>
          ) : null}
          {[...row].map((letter) => (
            <KeyboardButton
              disabled={disabled || removed.has(letter)}
              key={letter}
              onClick={() => onInput({ type: 'letter', value: letter })}
              state={letterStates[letter] ?? 'unknown'}
              title={`Enter ${letter.toLocaleUpperCase('en-US')}`}
            >
              {letter}
            </KeyboardButton>
          ))}
          {rowIndex === 2 ? (
            <KeyboardButton disabled={disabled} isAction onClick={() => onInput({ type: 'delete' })} title="Delete letter">
              Del
            </KeyboardButton>
          ) : null}
        </div>
      ))}
    </section>
  )
}
