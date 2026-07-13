import { describe, expect, it } from 'vitest'
import { createResumeSlot, type ResumeSlotCollection } from './resumeSlot'
import {
  clearSoloCompletionDisplaySlots,
  loadSoloCompletionDisplaySlots,
  saveSoloCompletionDisplaySlots,
  SOLO_COMPLETION_DISPLAY_STORAGE_KEY,
  type SoloCompletionDisplayStorage,
} from './soloCompletionDisplayStorage'

function createMemoryStorage(): SoloCompletionDisplayStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
    values,
  }
}

const completedPracticeOg = createResumeSlot({
  difficulty: 'expert',
  mode: 'og',
  scope: 'practice',
  serializedSession: {
    answer: 'crane',
    continuationCount: 0,
    currentGuess: '',
    guesses: ['crane'],
    hardMode: false,
    maxAttempts: 6,
  },
  wordLength: 5,
}, '2026-07-06T00:00:00.000Z')

const inProgressDailyOg = createResumeSlot({
  difficulty: 'expert',
  mode: 'og',
  scope: 'daily',
  serializedSession: {
    answer: 'plumb',
    continuationCount: 0,
    currentGuess: 'pl',
    guesses: [],
    hardMode: false,
    maxAttempts: 6,
  },
  wordLength: 5,
}, '2026-07-06T00:01:00.000Z')

describe('solo completion display storage', () => {
  it('persists only terminal display slots for the active owner', () => {
    const storage = createMemoryStorage()
    const slots: ResumeSlotCollection = {
      'daily-og': inProgressDailyOg,
      'practice-og': completedPracticeOg,
    }

    saveSoloCompletionDisplaySlots('guest', slots, storage)

    expect(loadSoloCompletionDisplaySlots('guest', storage)).toEqual({
      'practice-og': completedPracticeOg,
    })
  })

  it('separates owners without writing raw account identifiers', () => {
    const storage = createMemoryStorage()
    const rawOwnerKey = 'account:user-123-private'

    saveSoloCompletionDisplaySlots(rawOwnerKey, { 'practice-og': completedPracticeOg }, storage)

    expect(loadSoloCompletionDisplaySlots(rawOwnerKey, storage)).toEqual({
      'practice-og': completedPracticeOg,
    })
    expect(loadSoloCompletionDisplaySlots('guest', storage)).toEqual({})
    expect(storage.values.get(SOLO_COMPLETION_DISPLAY_STORAGE_KEY)).not.toContain(rawOwnerKey)
    expect(storage.values.get(SOLO_COMPLETION_DISPLAY_STORAGE_KEY)).not.toContain('user-123-private')
  })

  it('clears an owner cache and removes the payload when empty', () => {
    const storage = createMemoryStorage()
    saveSoloCompletionDisplaySlots('guest', { 'practice-og': completedPracticeOg }, storage)

    clearSoloCompletionDisplaySlots('guest', storage)

    expect(loadSoloCompletionDisplaySlots('guest', storage)).toEqual({})
    expect(storage.values.has(SOLO_COMPLETION_DISPLAY_STORAGE_KEY)).toBe(false)
  })
})
