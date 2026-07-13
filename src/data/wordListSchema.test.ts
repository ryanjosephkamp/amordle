import { describe, expect, it } from 'vitest'
import { validateWordListFile } from './wordListSchema.js'
import wordsLength2 from './bundled/words_length_2.json' with { type: 'json' }
import wordsLength5 from './bundled/words_length_5.json' with { type: 'json' }
import wordsLength35 from './bundled/words_length_35.json' with { type: 'json' }

describe('validateWordListFile', () => {
  it('accepts representative bundled lengths', () => {
    expect(validateWordListFile(wordsLength2).ok).toBe(true)
    expect(validateWordListFile(wordsLength5).ok).toBe(true)
    expect(validateWordListFile(wordsLength35).ok).toBe(true)
  })

  it('normalizes string and object word entries with optional definitions', () => {
    const result = validateWordListFile(wordsLength2)
    expect(result.ok).toBe(true)
    if (!result.ok) {
      throw new Error('Expected valid word list.')
    }

    expect(result.value.answers[0].word).toBe('go')
    expect(result.value.answers[0].definitions?.[0].definition).toBe('To move or travel.')
    expect(result.value.answers[1]).toEqual({ word: 'ox' })
  })

  it('rejects invalid word lengths and missing answer guesses', () => {
    const result = validateWordListFile({
      metadata: {
        length: 5,
        source: 'test',
        version: 'test',
        generatedAt: '2026-05-25T00:00:00Z',
      },
      answers: ['toolong'],
      validGuesses: ['crane'],
    })

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('Expected invalid word list.')
    }
    expect(result.issues.some((issue) => issue.path === 'answers[0]')).toBe(true)
    expect(result.issues.some((issue) => issue.message.includes('must also be a valid guess'))).toBe(true)
  })
})
