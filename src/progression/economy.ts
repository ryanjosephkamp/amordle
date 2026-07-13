import type { GuessResult, PlayScope } from '../game/types'
import { CONSUMABLE_COSTS, type ConsumableEffects, type ConsumableType } from './consumables'

export interface EconomySnapshot {
  readonly appliedOperationIds: readonly string[]
  readonly coins: number
  readonly consumables: Readonly<Record<ConsumableType, number>>
  readonly revision: number
}

export type { ConsumableEffects } from './consumables'

export type EconomyCommand =
  | { readonly operationId: string; readonly type: 'award'; readonly amount: number }
  | { readonly operationId: string; readonly type: 'spend'; readonly amount: number }
  | { readonly operationId: string; readonly type: 'purchase'; readonly consumable: ConsumableType }
  | { readonly operationId: string; readonly type: 'consume'; readonly consumable: ConsumableType; readonly scope: PlayScope }

export type EconomyCommandFailureReason = 'insufficient-coins' | 'insufficient-inventory' | 'invalid-command' | 'practice-only'
export type EconomyCommandResult =
  | { readonly ok: true; readonly snapshot: EconomySnapshot }
  | { readonly ok: false; readonly reason: EconomyCommandFailureReason; readonly snapshot: EconomySnapshot }

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

export function createEconomySnapshot(input: {
  readonly appliedOperationIds?: readonly string[]
  readonly coins?: number
  readonly consumables?: Partial<Record<ConsumableType, number>>
  readonly revision?: number
} = {}): EconomySnapshot {
  return {
    appliedOperationIds: Array.from(new Set((input.appliedOperationIds ?? []).filter((id) => typeof id === 'string' && id.length > 0))).slice(-500),
    coins: count(input.coins),
    consumables: {
      removeIncorrectLetters: count(input.consumables?.removeIncorrectLetters),
      revealOneLetter: count(input.consumables?.revealOneLetter),
    },
    revision: count(input.revision),
  }
}

export function applyEconomyCommand(snapshot: EconomySnapshot, command: EconomyCommand): EconomyCommandResult {
  if (!command.operationId.trim()) return { ok: false, reason: 'invalid-command', snapshot }
  if (snapshot.appliedOperationIds.includes(command.operationId)) return { ok: true, snapshot }

  let coins = snapshot.coins
  const consumables = { ...snapshot.consumables }
  if (command.type === 'award') {
    if (!Number.isInteger(command.amount) || command.amount <= 0) return { ok: false, reason: 'invalid-command', snapshot }
    coins += command.amount
  } else if (command.type === 'spend') {
    if (!Number.isInteger(command.amount) || command.amount <= 0) return { ok: false, reason: 'invalid-command', snapshot }
    if (coins < command.amount) return { ok: false, reason: 'insufficient-coins', snapshot }
    coins -= command.amount
  } else if (command.type === 'purchase') {
    const cost = CONSUMABLE_COSTS[command.consumable]
    if (coins < cost) return { ok: false, reason: 'insufficient-coins', snapshot }
    coins -= cost
    consumables[command.consumable] += 1
  } else {
    if (command.scope !== 'practice') return { ok: false, reason: 'practice-only', snapshot }
    if (consumables[command.consumable] <= 0) return { ok: false, reason: 'insufficient-inventory', snapshot }
    consumables[command.consumable] -= 1
  }

  return {
    ok: true,
    snapshot: createEconomySnapshot({
      appliedOperationIds: [...snapshot.appliedOperationIds, command.operationId],
      coins,
      consumables,
      revision: snapshot.revision + 1,
    }),
  }
}

export function createInitialConsumableEffects(value?: Partial<ConsumableEffects>): ConsumableEffects {
  const revealedHints = (value?.revealedHints ?? [])
    .filter((hint) => Number.isInteger(hint.index) && hint.index >= 0 && /^[a-z]$/i.test(hint.letter))
    .map((hint) => ({ index: hint.index, letter: hint.letter.toLocaleLowerCase('en-US') }))
    .filter((hint, index, hints) => hints.findIndex((candidate) => candidate.index === hint.index) === index)
    .sort((left, right) => left.index - right.index)
  const removedLetters = Array.from(new Set((value?.removedLetters ?? [])
    .filter((letter) => /^[a-z]$/i.test(letter))
    .map((letter) => letter.toLocaleLowerCase('en-US')))).sort()
  return { removedLetters, revealedHints }
}

function stableHash(value: string): number {
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function stableSelection<T extends string | number>(values: readonly T[], selectionKey: string, limit: number): readonly T[] {
  return [...values]
    .sort((left, right) => {
      const score = stableHash(`${selectionKey}:${String(left)}`) - stableHash(`${selectionKey}:${String(right)}`)
      return score || String(left).localeCompare(String(right), 'en-US')
    })
    .slice(0, limit)
}

function resolvedPracticePositions(guesses: readonly GuessResult[], effects: ConsumableEffects): ReadonlySet<number> {
  const resolved = new Set(effects.revealedHints.map((hint) => hint.index))
  for (const guess of guesses) {
    guess.tiles.forEach((tile, index) => {
      if (tile.state === 'correct') resolved.add(index)
    })
  }
  return resolved
}

export function revealNextPracticeLetter(
  answer: string,
  effects: ConsumableEffects,
  options: { readonly guesses?: readonly GuessResult[]; readonly selectionKey: string },
):
  | { readonly ok: true; readonly completed: boolean; readonly effects: ConsumableEffects; readonly hint: { readonly index: number; readonly letter: string } }
  | { readonly ok: false; readonly effects: ConsumableEffects; readonly reason: 'fully-revealed' } {
  const normalizedAnswer = answer.toLocaleLowerCase('en-US')
  const resolved = resolvedPracticePositions(options.guesses ?? [], effects)
  const unresolved = Array.from(normalizedAnswer, (_, index) => index).filter((index) => !resolved.has(index))
  const index = stableSelection(unresolved, options.selectionKey, 1)[0]
  if (index === undefined) return { ok: false, effects, reason: 'fully-revealed' }
  const hint = { index, letter: normalizedAnswer[index] }
  const next = createInitialConsumableEffects({ ...effects, revealedHints: [...effects.revealedHints, { index: hint.index, letter: hint.letter }] })
  return { ok: true, completed: unresolved.length === 1, effects: next, hint }
}

export function removePracticeIncorrectLetters(
  answer: string,
  effects: ConsumableEffects,
  options: {
    readonly batchSize?: number
    readonly candidates?: string
    readonly currentGuess?: string
    readonly guesses?: readonly GuessResult[]
    readonly selectionKey: string
  },
):
  | { readonly ok: true; readonly effects: ConsumableEffects; readonly removedLetters: readonly string[] }
  | { readonly ok: false; readonly effects: ConsumableEffects; readonly reason: 'no-eligible-letters' } {
  const answerLetters = new Set(answer.toLocaleLowerCase('en-US'))
  const alreadyAbsent = new Set((options.guesses ?? []).flatMap((guess) => guess.tiles
    .filter((tile) => tile.state === 'absent')
    .map((tile) => tile.letter.toLocaleLowerCase('en-US'))))
  const draftLetters = new Set((options.currentGuess ?? '').toLocaleLowerCase('en-US').replace(/[^a-z]/g, ''))
  const alreadyRemoved = new Set(effects.removedLetters)
  const eligible = Array.from(new Set((options.candidates ?? 'abcdefghijklmnopqrstuvwxyz')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z]/g, '')))
    .filter((letter) => !answerLetters.has(letter) && !alreadyAbsent.has(letter) && !alreadyRemoved.has(letter) && !draftLetters.has(letter))
  const removedLetters = stableSelection(eligible, options.selectionKey, Math.max(0, options.batchSize ?? 5))
  if (removedLetters.length === 0) return { ok: false, effects, reason: 'no-eligible-letters' }
  return {
    ok: true,
    effects: createInitialConsumableEffects({ ...effects, removedLetters: [...effects.removedLetters, ...removedLetters] }),
    removedLetters,
  }
}

function revealedPositionSet(effects: ConsumableEffects): ReadonlySet<number> {
  return new Set(effects.revealedHints.map((hint) => hint.index))
}

export function applyPracticeHintsToDraft(currentGuess: string, wordLength: number, effects: ConsumableEffects): string {
  const draft = Array.from({ length: wordLength }, (_, index) => currentGuess[index] ?? ' ')
  for (const hint of effects.revealedHints) {
    if (hint.index < wordLength) draft[hint.index] = hint.letter
  }
  return draft.join('')
}

export function enterPracticeDraftLetter(
  currentGuess: string,
  wordLength: number,
  effects: ConsumableEffects,
  letter: string,
): string {
  const draft = Array.from(applyPracticeHintsToDraft(currentGuess, wordLength, effects))
  const locked = revealedPositionSet(effects)
  const index = draft.findIndex((value, candidateIndex) => !locked.has(candidateIndex) && value === ' ')
  if (index < 0 || !/^[a-z]$/i.test(letter)) return draft.join('')
  draft[index] = letter.toLocaleLowerCase('en-US')
  return draft.join('')
}

export function deletePracticeDraftLetter(currentGuess: string, wordLength: number, effects: ConsumableEffects): string {
  const draft = Array.from(applyPracticeHintsToDraft(currentGuess, wordLength, effects))
  const locked = revealedPositionSet(effects)
  for (let index = draft.length - 1; index >= 0; index -= 1) {
    if (!locked.has(index) && draft[index] !== ' ') {
      draft[index] = ' '
      break
    }
  }
  return draft.join('')
}

export function getPracticeDraftTiles(currentGuess: string, wordLength: number, effects: ConsumableEffects): readonly { readonly letter: string; readonly locked: boolean }[] {
  const draft = Array.from(applyPracticeHintsToDraft(currentGuess, wordLength, effects))
  const locked = revealedPositionSet(effects)
  return draft.map((letter, index) => ({ letter: letter === ' ' ? '' : letter, locked: locked.has(index) }))
}
