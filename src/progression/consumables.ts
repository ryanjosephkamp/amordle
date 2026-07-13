export type ConsumableType = 'revealOneLetter' | 'removeIncorrectLetters'

export interface ConsumableEffects {
  readonly removedLetters: readonly string[]
  readonly revealedHints: readonly { readonly index: number; readonly letter: string }[]
}

export const CONSUMABLE_COSTS: Readonly<Record<ConsumableType, number>> = {
  removeIncorrectLetters: 40,
  revealOneLetter: 25,
}

export interface SpendConsumableSuccess {
  readonly ok: true
  readonly remainingCoins: number
}

export interface SpendConsumableFailure {
  readonly ok: false
  readonly reason: 'insufficient-coins'
  readonly requiredCoins: number
}

export type SpendConsumableResult = SpendConsumableSuccess | SpendConsumableFailure

export function spendConsumable(coins: number, type: ConsumableType): SpendConsumableResult {
  const cost = CONSUMABLE_COSTS[type]
  if (coins < cost) {
    return { ok: false, reason: 'insufficient-coins', requiredCoins: cost }
  }

  return { ok: true, remainingCoins: coins - cost }
}

export function revealOneLetter(answer: string, revealedIndices: readonly number[] = []): { readonly ok: true; readonly index: number; readonly letter: string } | { readonly ok: false; readonly reason: 'fully-revealed' } {
  const normalizedAnswer = answer.toLocaleLowerCase('en-US')
  const revealed = new Set(revealedIndices)
  const index = Array.from(normalizedAnswer).findIndex((_, candidateIndex) => !revealed.has(candidateIndex))
  if (index < 0) {
    return { ok: false, reason: 'fully-revealed' }
  }

  return { ok: true, index, letter: normalizedAnswer[index] }
}

export function removeIncorrectLetters(answer: string, candidates = 'abcdefghijklmnopqrstuvwxyz'): readonly string[] {
  const answerLetters = new Set(answer.toLocaleLowerCase('en-US'))
  return Array.from(new Set(candidates.toLocaleLowerCase('en-US').replace(/[^a-z]/g, ''))).filter((letter) => !answerLetters.has(letter))
}
