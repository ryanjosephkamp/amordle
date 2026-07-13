import type { GuessResult, TileResult, TileState } from './types'

function normalizeWord(word: string): string {
  return word.trim().toLocaleLowerCase('en-US')
}

export function getTileStates(guess: string, answer: string): readonly TileState[] {
  const normalizedGuess = normalizeWord(guess)
  const normalizedAnswer = normalizeWord(answer)

  if (normalizedGuess.length !== normalizedAnswer.length) {
    throw new Error('Guess and answer must have the same length.')
  }

  const states: TileState[] = Array.from({ length: normalizedGuess.length }, () => 'absent')
  const remainingAnswerLetters = new Map<string, number>()

  for (let index = 0; index < normalizedAnswer.length; index += 1) {
    const guessLetter = normalizedGuess[index]
    const answerLetter = normalizedAnswer[index]

    if (guessLetter === answerLetter) {
      states[index] = 'correct'
    } else {
      remainingAnswerLetters.set(
        answerLetter,
        (remainingAnswerLetters.get(answerLetter) ?? 0) + 1,
      )
    }
  }

  for (let index = 0; index < normalizedGuess.length; index += 1) {
    if (states[index] === 'correct') {
      continue
    }

    const guessLetter = normalizedGuess[index]
    const remainingCount = remainingAnswerLetters.get(guessLetter) ?? 0

    if (remainingCount > 0) {
      states[index] = 'present'
      if (remainingCount === 1) {
        remainingAnswerLetters.delete(guessLetter)
      } else {
        remainingAnswerLetters.set(guessLetter, remainingCount - 1)
      }
    }
  }

  return states
}

export function getGuessResult(guess: string, answer: string): GuessResult {
  const normalizedGuess = normalizeWord(guess)
  const states = getTileStates(normalizedGuess, answer)
  const tiles: TileResult[] = [...normalizedGuess].map((letter, index) => ({
    letter,
    state: states[index],
  }))

  return {
    guess: normalizedGuess,
    tiles,
  }
}
