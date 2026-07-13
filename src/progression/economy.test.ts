import { describe, expect, it } from 'vitest'
import {
  applyEconomyCommand,
  applyPracticeHintsToDraft,
  createEconomySnapshot,
  createInitialConsumableEffects,
  deletePracticeDraftLetter,
  enterPracticeDraftLetter,
  getPracticeDraftTiles,
  revealNextPracticeLetter,
  removePracticeIncorrectLetters,
} from './economy'

describe('Phase 57 economy', () => {
  it('purchases one inventory item once for an idempotent operation id', () => {
    const initial = createEconomySnapshot({ coins: 50 })
    const first = applyEconomyCommand(initial, {
      operationId: 'purchase:one',
      type: 'purchase',
      consumable: 'revealOneLetter',
    })
    expect(first).toMatchObject({ ok: true, snapshot: { coins: 25, consumables: { revealOneLetter: 1 } } })

    const retry = first.ok ? applyEconomyCommand(first.snapshot, {
      operationId: 'purchase:one',
      type: 'purchase',
      consumable: 'revealOneLetter',
    }) : first
    expect(retry).toEqual(first)
  })

  it('rejects insufficient coins and inventory without changing state', () => {
    const initial = createEconomySnapshot({ coins: 24 })
    expect(applyEconomyCommand(initial, {
      operationId: 'purchase:short',
      type: 'purchase',
      consumable: 'revealOneLetter',
    })).toEqual({ ok: false, reason: 'insufficient-coins', snapshot: initial })
    expect(applyEconomyCommand(initial, {
      operationId: 'consume:empty',
      type: 'consume',
      consumable: 'removeIncorrectLetters',
      scope: 'practice',
    })).toEqual({ ok: false, reason: 'insufficient-inventory', snapshot: initial })
  })

  it('rejects consumable use outside Solo Practice', () => {
    const initial = createEconomySnapshot({ coins: 0, consumables: { revealOneLetter: 1 } })
    expect(applyEconomyCommand(initial, {
      operationId: 'consume:daily',
      type: 'consume',
      consumable: 'revealOneLetter',
      scope: 'daily',
    })).toEqual({ ok: false, reason: 'practice-only', snapshot: initial })
  })

  it('reveals a stable unresolved position and ignores positions already solved by guesses', () => {
    const initial = createInitialConsumableEffects()
    const guesses = [{
      guess: 'crate',
      tiles: [
        { letter: 'c', state: 'correct' as const },
        { letter: 'r', state: 'correct' as const },
        { letter: 'a', state: 'correct' as const },
        { letter: 't', state: 'absent' as const },
        { letter: 'e', state: 'correct' as const },
      ],
    }]
    const revealed = revealNextPracticeLetter('crane', initial, { guesses, selectionKey: 'session:one:0' })
    expect(revealed).toMatchObject({ ok: true, completed: true, hint: { index: 3, letter: 'n' } })
    expect(revealNextPracticeLetter('crane', initial, { guesses, selectionKey: 'session:one:0' })).toEqual(revealed)
  })

  it('treats duplicate answer letters as independent positions', () => {
    const guesses = [{
      guess: 'arrrx',
      tiles: [
        { letter: 'a', state: 'correct' as const },
        { letter: 'r', state: 'correct' as const },
        { letter: 'r', state: 'correct' as const },
        { letter: 'r', state: 'present' as const },
        { letter: 'x', state: 'absent' as const },
      ],
    }]
    const effects = createInitialConsumableEffects({ revealedHints: [{ index: 4, letter: 'y' }] })
    expect(revealNextPracticeLetter('array', effects, { guesses, selectionKey: 'duplicate:3' })).toMatchObject({
      ok: true,
      completed: true,
      hint: { index: 3, letter: 'a' },
    })
  })

  it('projects revealed letters as locked green draft tiles while input and delete skip them', () => {
    const effects = createInitialConsumableEffects({ revealedHints: [{ index: 2, letter: 'a' }] })
    const revealedDraft = applyPracticeHintsToDraft('cr', 5, effects)
    expect(revealedDraft).toBe('cra  ')
    expect(getPracticeDraftTiles(revealedDraft, 5, effects)).toEqual([
      { letter: 'c', locked: false },
      { letter: 'r', locked: false },
      { letter: 'a', locked: true },
      { letter: '', locked: false },
      { letter: '', locked: false },
    ])

    const entered = enterPracticeDraftLetter(revealedDraft, 5, effects, 'n')
    expect(entered).toBe('cran ')
    expect(deletePracticeDraftLetter(entered, 5, effects)).toBe('cra  ')
    expect(deletePracticeDraftLetter('  a  ', 5, effects)).toBe('  a  ')
  })

  it('removes at most five eligible letters per stable use and supports repeated batches', () => {
    const initial = createInitialConsumableEffects()
    const first = removePracticeIncorrectLetters('crane', initial, {
      candidates: 'abcdefghijklmnopqrstuvwxyz',
      currentGuess: 'bl',
      selectionKey: 'session:remove:0',
    })
    expect(first).toMatchObject({ ok: true })
    expect(first.ok && first.removedLetters).toHaveLength(5)
    expect(first.ok && first.removedLetters).not.toContain('b')
    expect(first.ok && first.removedLetters).not.toContain('l')
    expect(removePracticeIncorrectLetters('crane', initial, {
      candidates: 'abcdefghijklmnopqrstuvwxyz',
      currentGuess: 'bl',
      selectionKey: 'session:remove:0',
    })).toEqual(first)

    const second = first.ok ? removePracticeIncorrectLetters('crane', first.effects, {
      candidates: 'abcdefghijklmnopqrstuvwxyz',
      currentGuess: 'bl',
      selectionKey: 'session:remove:1',
    }) : first
    expect(second).toMatchObject({ ok: true })
    expect(second.ok && second.removedLetters).toHaveLength(5)
    expect(second.ok && second.effects.removedLetters).toHaveLength(10)
    expect(second.ok && second.removedLetters.every((letter) => first.ok && !first.effects.removedLetters.includes(letter))).toBe(true)

    const third = second.ok ? removePracticeIncorrectLetters('crane', second.effects, {
      candidates: 'abcdefghijklmnopqrstuvwxyz',
      currentGuess: 'bl',
      selectionKey: 'session:remove:2',
    }) : second
    expect(third.ok && third.removedLetters).toHaveLength(5)
    const remainder = third.ok ? removePracticeIncorrectLetters('crane', third.effects, {
      candidates: 'abcdefghijklmnopqrstuvwxyz',
      currentGuess: 'bl',
      selectionKey: 'session:remove:3',
    }) : third
    expect(remainder.ok && remainder.removedLetters).toHaveLength(4)
    expect(remainder.ok && removePracticeIncorrectLetters('crane', remainder.effects, {
      candidates: 'abcdefghijklmnopqrstuvwxyz',
      currentGuess: 'bl',
      selectionKey: 'session:remove:4',
    })).toMatchObject({ ok: false, reason: 'no-eligible-letters' })
  })

  it('excludes submitted absent evidence and the unsent draft from removal candidates', () => {
    const removed = removePracticeIncorrectLetters('ace', createInitialConsumableEffects(), {
      candidates: 'abcdef',
      currentGuess: 'd',
      guesses: [{
        guess: 'bbb',
        tiles: [
          { letter: 'b', state: 'absent' as const },
          { letter: 'b', state: 'absent' as const },
          { letter: 'b', state: 'absent' as const },
        ],
      }],
      selectionKey: 'evidence',
    })
    expect(removed).toMatchObject({ ok: true, removedLetters: ['f'] })
  })

  it('does not consume a removal when no eligible keyboard letters remain', () => {
    const effects = createInitialConsumableEffects({ removedLetters: ['b', 'd'] })
    const removed = removePracticeIncorrectLetters('ace', effects, {
      candidates: 'abcde',
      selectionKey: 'session:none',
    })
    expect(removed).toEqual({ ok: false, effects, reason: 'no-eligible-letters' })

    const smallBatch = removePracticeIncorrectLetters('ace', createInitialConsumableEffects(), {
      candidates: 'abcde',
      selectionKey: 'session:small',
    })
    expect(smallBatch).toMatchObject({ ok: true, effects: { removedLetters: ['b', 'd'] } })
    expect(smallBatch.ok && [...smallBatch.removedLetters].sort()).toEqual(['b', 'd'])
  })
})
