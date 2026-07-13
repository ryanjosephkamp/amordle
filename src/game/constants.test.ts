import { describe, expect, it } from 'vitest'
import {
  DAILY_WORD_LENGTH,
  MAX_PRACTICE_WORD_LENGTH,
  MIN_PRACTICE_WORD_LENGTH,
  SUPPORTED_PRACTICE_WORD_LENGTHS,
  isSupportedDailyWordLength,
  isSupportedPracticeWordLength,
} from './constants'

describe('word length constants', () => {
  it('supports practice lengths from 2 through 35', () => {
    expect(MIN_PRACTICE_WORD_LENGTH).toBe(2)
    expect(MAX_PRACTICE_WORD_LENGTH).toBe(35)
    expect(SUPPORTED_PRACTICE_WORD_LENGTHS).toHaveLength(34)
    expect(SUPPORTED_PRACTICE_WORD_LENGTHS[0]).toBe(2)
    expect(SUPPORTED_PRACTICE_WORD_LENGTHS.at(-1)).toBe(35)
    expect(isSupportedPracticeWordLength(2)).toBe(true)
    expect(isSupportedPracticeWordLength(35)).toBe(true)
    expect(isSupportedPracticeWordLength(1)).toBe(false)
    expect(isSupportedPracticeWordLength(36)).toBe(false)
  })

  it('keeps daily length fixed at five letters', () => {
    expect(DAILY_WORD_LENGTH).toBe(5)
    expect(isSupportedDailyWordLength(5)).toBe(true)
    expect(isSupportedDailyWordLength(4)).toBe(false)
  })
})
