import { describe, expect, it } from 'vitest'
import { clearDailyGoStoredSession, DAILY_GO_STORAGE_KEY, loadDailyGoStoredSession, saveDailyGoStoredSession } from './dailyGoStorage'
import type { KeyValueStorage } from './dailyOgStorage'

function createMemoryStorage(): KeyValueStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

describe('daily go storage', () => {
  it('saves, loads, and clears daily go sessions', () => {
    const storage = createMemoryStorage()
    const value = {
      dateKey: '2026-05-26',
      session: {
        currentPuzzleIndex: 0,
        hardMode: true,
        priorAnswers: [],
        puzzles: [
          {
            answer: 'slate',
            continuationCount: 0,
            currentGuess: '',
            guesses: [],
            maxAttempts: 6,
            prefilledGuesses: [],
          },
        ],
      },
    }

    saveDailyGoStoredSession(value, storage)
    expect(loadDailyGoStoredSession(storage)).toEqual(value)
    expect(storage.values.has(DAILY_GO_STORAGE_KEY)).toBe(true)

    clearDailyGoStoredSession(storage)
    expect(loadDailyGoStoredSession(storage)).toBeUndefined()
  })
})
