import { describe, expect, it } from 'vitest'
import {
  getAnswerCandidates,
  getDefinitionsForWord,
  getRequestedWordLength,
  getValidGuesses,
  getWordRepository,
} from './wordRepository.js'

describe('wordRepository', () => {
  it('forces daily requests to the launch daily length', () => {
    expect(getRequestedWordLength('daily', 35)).toBe(5)
    const repository = getWordRepository({ mode: 'og', scope: 'daily', length: 35 })
    expect(repository.ok).toBe(true)
    if (!repository.ok) {
      throw new Error('Expected daily repository to load.')
    }
    expect(repository.wordList.metadata.length).toBe(5)
  })

  it('loads practice answers and guesses for supported seeded lengths', () => {
    expect(getAnswerCandidates({ mode: 'go', scope: 'practice', length: 2 }).map((entry) => entry.word)).toContain('go')
    // Phase 17.2: length-35 valid-guesses now come from the local source at
    // src/latest/words_length_35.json (real 35-letter chemistry/biology terms),
    // replacing the Phase 12 deterministic synthetic placeholder. The intent
    // of this assertion (verify length-35 validGuesses contains a known
    // 35-letter token) is preserved with a real word from the local list.
    expect(getValidGuesses({ mode: 'go', scope: 'practice', length: 35 }).has('carboxymethylhydroxyethylcelluloses')).toBe(true)
  })

  it('returns populated collections for every supported practice length', () => {
    expect(getAnswerCandidates({ mode: 'og', scope: 'practice', length: 4 }).length).toBeGreaterThan(0)
    expect(getValidGuesses({ mode: 'og', scope: 'practice', length: 4 }).size).toBeGreaterThan(0)
  })

  it('returns bundled definitions when present', () => {
    const definitions = getDefinitionsForWord({ mode: 'og', scope: 'daily', length: 5 }, ' CRANE ')
    expect(definitions[0].definition).toContain('bird')
  })
})
