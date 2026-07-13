import { describe, expect, it } from 'vitest'
import { validateHardModeGuess } from './hardMode'
import { getGuessResult } from './tileStates'

describe('validateHardModeGuess', () => {
  it('requires green letters to stay fixed', () => {
    const previous = [getGuessResult('cigar', 'couch')]
    const result = validateHardModeGuess('bough', previous)
    expect(result.ok).toBe(false)
    expect(result.ok ? undefined : result.violations[0].rule).toBe('correct-position')
  })

  it('requires yellow letters to be reused', () => {
    const previous = [getGuessResult('crate', 'trace')]
    const result = validateHardModeGuess('doing', previous)
    expect(result.ok).toBe(false)
    expect(result.ok ? undefined : result.violations.some((violation) => violation.rule === 'required-letter')).toBe(true)
  })

  it('blocks reuse of letters known only as gray', () => {
    const previous = [getGuessResult('fjord', 'backs')]
    const result = validateHardModeGuess('foggy', previous)
    expect(result.ok).toBe(false)
    expect(result.ok ? undefined : result.violations.some((violation) => violation.rule === 'absent-letter')).toBe(true)
  })

  it('does not forbid a duplicated letter when another copy is known present', () => {
    const previous = [getGuessResult('allee', 'apple')]
    expect(validateHardModeGuess('ample', previous).ok).toBe(true)
  })

  it('accepts guesses satisfying known constraints', () => {
    const previous = [getGuessResult('crane', 'cared')]
    expect(validateHardModeGuess('cared', previous)).toEqual({ ok: true })
  })
})
