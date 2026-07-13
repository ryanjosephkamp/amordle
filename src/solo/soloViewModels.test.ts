import { describe, expect, it } from 'vitest'
import { createResumeSlot, type GameHistoryEntry, type ResumeSlotCollection } from '../account'
import {
  isSoloActiveGameKey,
  selectActiveSoloGames,
  selectRecentSoloResults,
} from './soloViewModels'

function ogSession(overrides: Partial<Parameters<typeof createResumeSlot>[0]['serializedSession']> = {}) {
  return {
    answer: 'crane',
    continuationCount: 0,
    currentGuess: '',
    guesses: [],
    hardMode: false,
    maxAttempts: 6,
    ...overrides,
  }
}

function goSession(overrides: Partial<Extract<Parameters<typeof createResumeSlot>[0], { readonly mode: 'go' }>['serializedSession']> = {}) {
  return {
    currentPuzzleIndex: 1,
    hardMode: false,
    priorAnswers: ['crane'],
    puzzles: [
      { answer: 'crane', continuationCount: 0, currentGuess: '', guesses: ['crane'], maxAttempts: 6, prefilledGuesses: [] },
      { answer: 'plumb', continuationCount: 0, currentGuess: 'pl', guesses: [], maxAttempts: 6, prefilledGuesses: ['crane'] },
      { answer: 'sleet', continuationCount: 0, currentGuess: '', guesses: [], maxAttempts: 6, prefilledGuesses: [] },
    ],
    ...overrides,
  }
}

describe('soloViewModels', () => {
  it('validates known active solo game keys', () => {
    expect(isSoloActiveGameKey('daily-og')).toBe(true)
    expect(isSoloActiveGameKey('practice-go')).toBe(true)
    expect(isSoloActiveGameKey('multiplayer-go')).toBe(false)
    expect(isSoloActiveGameKey(undefined)).toBe(false)
  })

  it('projects active solo games from resume slots newest first', () => {
    const slots: ResumeSlotCollection = {
      'daily-og': createResumeSlot({
        difficulty: 'expert',
        mode: 'og',
        scope: 'daily',
        serializedSession: ogSession({ guesses: ['slate'] }),
        wordLength: 5,
      }, '2026-06-13T01:00:00.000Z'),
      'practice-go': createResumeSlot({
        difficulty: 'casual',
        goPuzzleCount: 5,
        mode: 'go',
        scope: 'practice',
        serializedSession: goSession(),
        wordLength: 5,
      }, '2026-06-13T02:00:00.000Z'),
    }

    const active = selectActiveSoloGames(slots)

    expect(active.map((game) => game.key)).toEqual(['practice-go', 'daily-og'])
    expect(active[0]).toMatchObject({
      detailLabel: 'Draft in progress: 2/5 letters · 1 prior answer carried',
      modeLabel: 'GO',
      progressLabel: 'Puzzle 2/3 · 0/6 guesses',
      scopeLabel: 'Practice Solo',
      wordLengthLabel: '5 letters',
    })
    expect(active[1]).toMatchObject({
      detailLabel: 'Ready for the next guess',
      modeLabel: 'OG',
      progressLabel: '1/6 guesses',
      scopeLabel: 'Daily Solo',
    })
  })

  it('projects recent solo results newest first and respects the limit', () => {
    const history: GameHistoryEntry[] = [
      {
        attemptsUsed: 4,
        coinAward: 8,
        completedAt: '2026-06-13T01:00:00.000Z',
        gameId: 'old-practice-og',
        mode: 'og',
        scope: 'practice',
        status: 'won',
        word: 'crane',
        wordLength: 5,
        xpAward: 40,
      },
      {
        attemptsUsed: 11,
        coinAward: 12,
        completedAt: '2026-06-13T03:00:00.000Z',
        gameId: 'new-daily-go',
        mode: 'go',
        scope: 'daily',
        status: 'lost',
        word: 'crane,plumb,sleet',
        wordLength: 5,
        xpAward: 60,
      },
      {
        attemptsUsed: 2,
        coinAward: 10,
        completedAt: '2026-06-13T02:00:00.000Z',
        gameId: 'middle-daily-og',
        mode: 'og',
        scope: 'daily',
        status: 'won',
        word: 'brisk',
        wordLength: 5,
        xpAward: 50,
      },
    ]

    const recent = selectRecentSoloResults(history, 2)

    expect(recent.map((result) => result.gameId)).toEqual(['new-daily-go', 'middle-daily-og'])
    expect(recent[0]).toMatchObject({
      attemptsLabel: '11 guesses',
      modeLabel: 'GO',
      rewardLabel: '+60 XP · +12 coins',
      statusLabel: 'Lost',
      wordLabel: 'CRANE / PLUMB / SLEET',
    })
  })

  it('handles missing collections without surfacing phantom cards', () => {
    expect(selectActiveSoloGames(undefined)).toEqual([])
    expect(selectRecentSoloResults(undefined)).toEqual([])
    expect(selectRecentSoloResults([], -1)).toEqual([])
  })
})
