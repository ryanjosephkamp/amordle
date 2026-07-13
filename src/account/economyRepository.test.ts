import { describe, expect, it } from 'vitest'
import { parseEconomyRpcResult } from './economyRepository'

describe('economy repository privacy parser', () => {
  it('accepts only the allowlisted authoritative economy projection', () => {
    expect(parseEconomyRpcResult({
      applied: true,
      coins: 25,
      operation_id: 'purchase:one',
      remove_incorrect_letters: 0,
      reveal_one_letter: 1,
      revision: 2,
    })).toEqual({
      applied: true,
      coins: 25,
      operationId: 'purchase:one',
      consumables: { removeIncorrectLetters: 0, revealOneLetter: 1 },
      revision: 2,
    })
  })

  it('rejects raw identity, answer, or session fields', () => {
    expect(parseEconomyRpcResult({ coins: 25, reveal_one_letter: 1, remove_incorrect_letters: 0, revision: 1, applied: true, operation_id: 'x', user_id: 'private' })).toBeUndefined()
    expect(parseEconomyRpcResult({ coins: 25, reveal_one_letter: 1, remove_incorrect_letters: 0, revision: 1, applied: true, operation_id: 'x', answer: 'crane' })).toBeUndefined()
  })
})
