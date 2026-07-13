import { useEffect } from 'react'
import type { GuessResult, TileState } from '../types'

export type KeyboardInput =
  | { readonly type: 'letter'; readonly value: string }
  | { readonly type: 'delete' }
  | { readonly type: 'submit' }

export type KeyboardLetterStates = Readonly<Record<string, TileState>>

interface UseKeyboardInputOptions {
  readonly disabled?: boolean
  readonly onInput: (input: KeyboardInput) => void
}

const tileStatePriority: Record<TileState, number> = {
  absent: 1,
  present: 2,
  correct: 3,
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLocaleLowerCase('en-US')
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

export function normalizeKeyboardKey(key: string): KeyboardInput | undefined {
  if (/^[a-z]$/i.test(key)) {
    return { type: 'letter', value: key.toLocaleLowerCase('en-US') }
  }

  if (key === 'Backspace' || key === 'Delete') {
    return { type: 'delete' }
  }

  if (key === 'Enter') {
    return { type: 'submit' }
  }

  return undefined
}

export function deriveKeyboardLetterStates(guesses: readonly GuessResult[]): KeyboardLetterStates {
  const letterStates: Record<string, TileState> = {}

  for (const guess of guesses) {
    for (const tile of guess.tiles) {
      const letter = tile.letter.toLocaleLowerCase('en-US')
      const previousState = letterStates[letter]
      if (!previousState || tileStatePriority[tile.state] > tileStatePriority[previousState]) {
        letterStates[letter] = tile.state
      }
    }
  }

  return letterStates
}

export function useKeyboardInput({ disabled = false, onInput }: UseKeyboardInputOptions) {
  useEffect(() => {
    if (disabled) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || isEditableTarget(event.target)) {
        return
      }

      const input = normalizeKeyboardKey(event.key)
      if (!input) {
        return
      }

      event.preventDefault()
      onInput(input)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [disabled, onInput])
}
