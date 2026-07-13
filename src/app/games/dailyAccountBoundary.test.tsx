import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DIFFICULTY_TIER } from '../../data'
import { getActiveDailyDate, dateKeyToLocalDate } from '../../daily'
import {
  createDailyGoSetup,
  createDailyOgSetup,
  createGoSession,
  createOgSession,
  enterGoLetter,
  enterLetter,
  serializeGoSession,
  serializeOgSession,
  submitGoGuess,
  submitGuess,
  type SerializedGoSession,
  type SerializedOgSession,
} from '../../game'
import { DAILY_GO_STORAGE_KEY, dailyGoStorageKey } from '../../game/storage/dailyGoStorage'
import { DAILY_OG_STORAGE_KEY, dailyOgStorageKey } from '../../game/storage/dailyOgStorage'
import { GoGame } from './GoGame'
import { OgGame } from './OgGame'
import { createGoGameSessionKey, createOgGameSessionKey } from './soloSessionKeys'

function spendNothing() {
  return false
}

function createMemoryStorage(initial: Record<string, string> = {}) {
  const entries = { ...initial }
  return {
    getItem: vi.fn((key: string) => entries[key] ?? null),
    removeItem: vi.fn((key: string) => {
      delete entries[key]
    }),
    setItem: vi.fn((key: string, value: string) => {
      entries[key] = value
    }),
  }
}

function findWrongGuess(validGuesses: ReadonlySet<string>, answer: string): string {
  const guess = Array.from(validGuesses).find((candidate) => candidate.length === answer.length && candidate !== answer)
  if (!guess) {
    throw new Error(`No wrong ${answer.length}-letter guess is available for the test fixture.`)
  }
  return guess
}

function submitOgWord(session: ReturnType<typeof createOgSession>, word: string) {
  return submitGuess([...word].reduce((currentSession, letter) => enterLetter(currentSession, letter), session))
}

function submitGoWord(session: ReturnType<typeof createGoSession>, word: string) {
  return submitGoGuess([...word].reduce((currentSession, letter) => enterGoLetter(currentSession, letter), session))
}

function countDefinitionPanels(html: string): number {
  return html.match(/>Definitions</g)?.length ?? 0
}

function createStartedDailyOgSession(date = getActiveDailyDate()): {
  readonly dateKey: string
  readonly serializedSession: SerializedOgSession
} {
  const setup = createDailyOgSetup(date, DEFAULT_DIFFICULTY_TIER)
  const session = submitOgWord(createOgSession(setup), findWrongGuess(setup.validGuesses, setup.answer))
  expect(session.status).toBe('playing')
  return {
    dateKey: setup.dateKey ?? '',
    serializedSession: serializeOgSession(session),
  }
}

function createStartedDailyGoSession(date = getActiveDailyDate()): {
  readonly dateKey: string
  readonly serializedSession: SerializedGoSession
} {
  const setup = createDailyGoSetup(date, DEFAULT_DIFFICULTY_TIER)
  const activeAnswer = setup.puzzles[0]?.answer ?? ''
  const session = submitGoWord(createGoSession(setup), findWrongGuess(setup.validGuesses, activeAnswer))
  expect(session.status).toBe('playing')
  return {
    dateKey: setup.dateKey ?? '',
    serializedSession: serializeGoSession(session),
  }
}

function createCompletedDailyOgSession(date = getActiveDailyDate()): {
  readonly dateKey: string
  readonly serializedSession: SerializedOgSession
} {
  const setup = createDailyOgSetup(date, DEFAULT_DIFFICULTY_TIER)
  const session = submitOgWord(createOgSession(setup), setup.answer)
  expect(session.status).toBe('won')
  return {
    dateKey: setup.dateKey ?? '',
    serializedSession: serializeOgSession(session),
  }
}

function createCompletedDailyGoSession(date = getActiveDailyDate()): {
  readonly dateKey: string
  readonly serializedSession: SerializedGoSession
} {
  const setup = createDailyGoSetup(date, DEFAULT_DIFFICULTY_TIER)
  const session = setup.puzzles.reduce((currentSession, puzzle) => submitGoWord(currentSession, puzzle.answer), createGoSession(setup))
  expect(session.status).toBe('won')
  return {
    dateKey: setup.dateKey ?? '',
    serializedSession: serializeGoSession(session),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Daily Solo account boundaries', () => {
  it('never exposes Solo Practice consumables in Daily OG or GO', () => {
    const og = renderToStaticMarkup(<OgGame coins={0} keyboardDisabled onSpendCoins={spendNothing} scope="daily" />)
    const go = renderToStaticMarkup(<GoGame coins={0} keyboardDisabled onSpendCoins={spendNothing} scope="daily" />)
    expect(og).not.toContain('Solo Practice tools')
    expect(go).not.toContain('Solo Practice tools')
  })
  it('keeps Daily OG in-progress live resume updates from remounting the active puzzle', () => {
    const started = createStartedDailyOgSession()
    const firstKey = createOgGameSessionKey({
      activeResume: {
        difficulty: DEFAULT_DIFFICULTY_TIER,
        mode: 'og',
        scope: 'daily',
        serializedSession: started.serializedSession,
        updatedAt: '2026-07-05T12:00:00.000Z',
        wordLength: 5,
      },
      difficulty: DEFAULT_DIFFICULTY_TIER,
      practiceLength: 5,
      practiceSeed: 0,
      progressOwnerKey: 'account:one',
      scope: 'daily',
      setupDateKey: started.dateKey,
    })
    const nextKey = createOgGameSessionKey({
      activeResume: {
        difficulty: DEFAULT_DIFFICULTY_TIER,
        mode: 'og',
        scope: 'daily',
        serializedSession: { ...started.serializedSession, currentGuess: `${started.serializedSession.currentGuess}a`.slice(0, 5) },
        updatedAt: '2026-07-05T12:00:01.000Z',
        wordLength: 5,
      },
      difficulty: DEFAULT_DIFFICULTY_TIER,
      practiceLength: 5,
      practiceSeed: 0,
      progressOwnerKey: 'account:one',
      scope: 'daily',
      setupDateKey: started.dateKey,
    })

    expect(nextKey).toBe(firstKey)
  })

  it('keeps Daily GO in-progress live resume updates from remounting settled rows', () => {
    const started = createStartedDailyGoSession()
    const firstKey = createGoGameSessionKey({
      activeResume: {
        difficulty: DEFAULT_DIFFICULTY_TIER,
        goPuzzleCount: 5,
        mode: 'go',
        scope: 'daily',
        serializedSession: started.serializedSession,
        updatedAt: '2026-07-05T12:00:00.000Z',
        wordLength: 5,
      },
      difficulty: DEFAULT_DIFFICULTY_TIER,
      goPuzzleCount: 5,
      practiceLength: 5,
      practiceSeed: 0,
      progressOwnerKey: 'account:one',
      scope: 'daily',
      setupDateKey: started.dateKey,
    })
    const [firstPuzzle, ...remainingPuzzles] = started.serializedSession.puzzles
    const nextKey = createGoGameSessionKey({
      activeResume: {
        difficulty: DEFAULT_DIFFICULTY_TIER,
        goPuzzleCount: 5,
        mode: 'go',
        scope: 'daily',
        serializedSession: {
          ...started.serializedSession,
          puzzles: [
            { ...firstPuzzle, currentGuess: `${firstPuzzle.currentGuess}a`.slice(0, 5) },
            ...remainingPuzzles,
          ],
        },
        updatedAt: '2026-07-05T12:00:01.000Z',
        wordLength: 5,
      },
      difficulty: DEFAULT_DIFFICULTY_TIER,
      goPuzzleCount: 5,
      practiceLength: 5,
      practiceSeed: 0,
      progressOwnerKey: 'account:one',
      scope: 'daily',
      setupDateKey: started.dateKey,
    })

    expect(nextKey).toBe(firstKey)
  })

  it('still remounts Daily OG when completed display evidence arrives after hydration', () => {
    const started = createStartedDailyOgSession()
    const completed = createCompletedDailyOgSession(dateKeyToLocalDate(started.dateKey))
    const firstKey = createOgGameSessionKey({
      activeResume: {
        difficulty: DEFAULT_DIFFICULTY_TIER,
        mode: 'og',
        scope: 'daily',
        serializedSession: started.serializedSession,
        updatedAt: '2026-07-05T12:00:00.000Z',
        wordLength: 5,
      },
      difficulty: DEFAULT_DIFFICULTY_TIER,
      practiceLength: 5,
      practiceSeed: 0,
      progressOwnerKey: 'account:one',
      scope: 'daily',
      setupDateKey: started.dateKey,
    })
    const completedKey = createOgGameSessionKey({
      activeResume: {
        difficulty: DEFAULT_DIFFICULTY_TIER,
        mode: 'og',
        scope: 'daily',
        serializedSession: completed.serializedSession,
        updatedAt: '2026-07-05T12:00:02.000Z',
        wordLength: 5,
      },
      difficulty: DEFAULT_DIFFICULTY_TIER,
      practiceLength: 5,
      practiceSeed: 0,
      progressOwnerKey: 'account:one',
      scope: 'daily',
      setupDateKey: started.dateKey,
    })

    expect(completedKey).not.toBe(firstKey)
  })

  it('still remounts Daily GO when completed display evidence arrives after hydration', () => {
    const started = createStartedDailyGoSession()
    const completed = createCompletedDailyGoSession(dateKeyToLocalDate(started.dateKey))
    const firstKey = createGoGameSessionKey({
      activeResume: {
        difficulty: DEFAULT_DIFFICULTY_TIER,
        goPuzzleCount: 5,
        mode: 'go',
        scope: 'daily',
        serializedSession: started.serializedSession,
        updatedAt: '2026-07-05T12:00:00.000Z',
        wordLength: 5,
      },
      difficulty: DEFAULT_DIFFICULTY_TIER,
      goPuzzleCount: 5,
      practiceLength: 5,
      practiceSeed: 0,
      progressOwnerKey: 'account:one',
      scope: 'daily',
      setupDateKey: started.dateKey,
    })
    const completedKey = createGoGameSessionKey({
      activeResume: {
        difficulty: DEFAULT_DIFFICULTY_TIER,
        goPuzzleCount: 5,
        mode: 'go',
        scope: 'daily',
        serializedSession: completed.serializedSession,
        updatedAt: '2026-07-05T12:00:02.000Z',
        wordLength: 5,
      },
      difficulty: DEFAULT_DIFFICULTY_TIER,
      goPuzzleCount: 5,
      practiceLength: 5,
      practiceSeed: 0,
      progressOwnerKey: 'account:one',
      scope: 'daily',
      setupDateKey: started.dateKey,
    })

    expect(completedKey).not.toBe(firstKey)
  })

  it('does not restore current Daily OG from the legacy bare browser-local key', () => {
    const started = createStartedDailyOgSession()
    const storage = createMemoryStorage({
      [DAILY_OG_STORAGE_KEY]: JSON.stringify({ dateKey: started.dateKey, session: started.serializedSession }),
    })
    vi.stubGlobal('window', { localStorage: storage })

    const html = renderToStaticMarkup(
      <OgGame coins={0} keyboardDisabled onSpendCoins={spendNothing} progressOwnerKey="account:one" scope="daily" />,
    )

    expect(storage.getItem).not.toHaveBeenCalledWith(DAILY_OG_STORAGE_KEY)
    expect(html).toContain('6 attempts remaining.')
    expect(html).not.toContain('5 attempts remaining.')
  })

  it('restores current Daily OG from the scoped active progress resume slot', () => {
    const started = createStartedDailyOgSession()

    const html = renderToStaticMarkup(
      <OgGame
        coins={0}
        initialResume={{
          difficulty: DEFAULT_DIFFICULTY_TIER,
          mode: 'og',
          scope: 'daily',
          serializedSession: started.serializedSession,
          updatedAt: '2026-07-05T12:00:00.000Z',
          wordLength: 5,
        }}
        keyboardDisabled
        onSpendCoins={spendNothing}
        progressOwnerKey="account:one"
        scope="daily"
      />,
    )

    expect(html).toContain('5 attempts remaining.')
  })

  it('does not restore current Daily GO from the legacy bare browser-local key', () => {
    const started = createStartedDailyGoSession()
    const storage = createMemoryStorage({
      [DAILY_GO_STORAGE_KEY]: JSON.stringify({ dateKey: started.dateKey, session: started.serializedSession }),
    })
    vi.stubGlobal('window', { localStorage: storage })

    const html = renderToStaticMarkup(
      <GoGame coins={0} keyboardDisabled onSpendCoins={spendNothing} progressOwnerKey="account:one" scope="daily" />,
    )

    expect(storage.getItem).not.toHaveBeenCalledWith(DAILY_GO_STORAGE_KEY)
    expect(html).toContain('6 attempts remaining.')
    expect(html).not.toContain('5 attempts remaining.')
  })

  it('restores current Daily GO from the scoped active progress resume slot', () => {
    const started = createStartedDailyGoSession()

    const html = renderToStaticMarkup(
      <GoGame
        coins={0}
        initialResume={{
          difficulty: DEFAULT_DIFFICULTY_TIER,
          goPuzzleCount: 5,
          mode: 'go',
          scope: 'daily',
          serializedSession: started.serializedSession,
          updatedAt: '2026-07-05T12:00:00.000Z',
          wordLength: 5,
        }}
        keyboardDisabled
        onSpendCoins={spendNothing}
        progressOwnerKey="account:one"
        scope="daily"
      />,
    )

    expect(html).toContain('5 attempts remaining.')
  })

  it('renders each completed Daily GO answer definition once after restore', () => {
    const completed = createCompletedDailyGoSession()

    const html = renderToStaticMarkup(
      <GoGame
        coins={0}
        initialResume={{
          difficulty: DEFAULT_DIFFICULTY_TIER,
          goPuzzleCount: 5,
          mode: 'go',
          scope: 'daily',
          serializedSession: completed.serializedSession,
          updatedAt: '2026-07-05T12:00:02.000Z',
          wordLength: 5,
        }}
        keyboardDisabled
        onSpendCoins={spendNothing}
        progressOwnerKey="account:one"
        scope="daily"
      />,
    )

    expect(html).toContain('Solved puzzle definitions')
    expect(countDefinitionPanels(html)).toBe(completed.serializedSession.puzzles.length)
  })

  it('keeps past Daily OG restore on its date-keyed legacy storage path', () => {
    const dateKey = '2026-07-01'
    const started = createStartedDailyOgSession(dateKeyToLocalDate(dateKey))
    const storage = createMemoryStorage({
      [dailyOgStorageKey(dateKey)]: JSON.stringify({ dateKey: started.dateKey, session: started.serializedSession }),
    })
    vi.stubGlobal('window', { localStorage: storage })

    const html = renderToStaticMarkup(
      <OgGame coins={0} keyboardDisabled onSpendCoins={spendNothing} pastDailyDateKey={dateKey} scope="daily" />,
    )

    expect(storage.getItem).toHaveBeenCalledWith(dailyOgStorageKey(dateKey))
    expect(html).toContain('5 attempts remaining.')
  })

  it('keeps past Daily GO restore on its date-keyed legacy storage path', () => {
    const dateKey = '2026-07-01'
    const started = createStartedDailyGoSession(dateKeyToLocalDate(dateKey))
    const storage = createMemoryStorage({
      [dailyGoStorageKey(dateKey)]: JSON.stringify({ dateKey: started.dateKey, session: started.serializedSession }),
    })
    vi.stubGlobal('window', { localStorage: storage })

    const html = renderToStaticMarkup(
      <GoGame coins={0} keyboardDisabled onSpendCoins={spendNothing} pastDailyDateKey={dateKey} scope="daily" />,
    )

    expect(storage.getItem).toHaveBeenCalledWith(dailyGoStorageKey(dateKey))
    expect(html).toContain('5 attempts remaining.')
  })
})
