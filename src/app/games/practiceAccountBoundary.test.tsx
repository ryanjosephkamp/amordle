import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DIFFICULTY_TIER } from '../../data'
import {
  createGoSession,
  createOgSession,
  createPracticeGoSetup,
  createPracticeOgSetup,
  enterGoLetter,
  enterLetter,
  serializeGoSession,
  serializeOgSession,
  submitGoGuess,
  submitGuess,
  type SerializedGoSession,
  type SerializedOgSession,
} from '../../game'
import { GoGame } from './GoGame'
import { OgGame } from './OgGame'

function spendNothing() {
  return false
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

function createStartedPracticeOgSession(): SerializedOgSession {
  const setup = createPracticeOgSetup(5, 0, DEFAULT_DIFFICULTY_TIER)
  const session = submitOgWord(createOgSession(setup), findWrongGuess(setup.validGuesses, setup.answer))
  expect(session.status).toBe('playing')
  return serializeOgSession(session)
}

function createStartedPracticeGoSession(): SerializedGoSession {
  const setup = createPracticeGoSetup(5, 0, DEFAULT_DIFFICULTY_TIER, 5)
  const activeAnswer = setup.puzzles[0]?.answer ?? ''
  const session = submitGoWord(createGoSession(setup), findWrongGuess(setup.validGuesses, activeAnswer))
  expect(session.status).toBe('playing')
  return serializeGoSession(session)
}

function createCompletedPracticeGoSession(): SerializedGoSession {
  const setup = createPracticeGoSetup(5, 0, DEFAULT_DIFFICULTY_TIER, 5)
  const session = setup.puzzles.reduce((currentSession, puzzle) => submitGoWord(currentSession, puzzle.answer), createGoSession(setup))
  expect(session.status).toBe('won')
  return serializeGoSession(session)
}

describe('Practice Solo account boundaries', () => {
  it('restores Practice OG from the active owner scoped resume slot', () => {
    const html = renderToStaticMarkup(
      <OgGame
        coins={0}
        initialResume={{
          difficulty: DEFAULT_DIFFICULTY_TIER,
          mode: 'og',
          scope: 'practice',
          serializedSession: createStartedPracticeOgSession(),
          updatedAt: '2026-07-05T12:00:00.000Z',
          wordLength: 5,
        }}
        keyboardDisabled
        onSpendCoins={spendNothing}
        progressOwnerKey="account:one"
        scope="practice"
      />,
    )

    expect(html).toContain('5 attempts remaining.')
  })

  it('starts Practice OG fresh when the active owner has no scoped resume slot', () => {
    const html = renderToStaticMarkup(
      <OgGame coins={0} keyboardDisabled onSpendCoins={spendNothing} progressOwnerKey="account:one" scope="practice" />,
    )

    expect(html).toContain('6 attempts remaining.')
    expect(html).not.toContain('5 attempts remaining.')
  })

  it('restores Practice GO from the active owner scoped resume slot', () => {
    const html = renderToStaticMarkup(
      <GoGame
        coins={0}
        initialResume={{
          difficulty: DEFAULT_DIFFICULTY_TIER,
          goPuzzleCount: 5,
          mode: 'go',
          scope: 'practice',
          serializedSession: createStartedPracticeGoSession(),
          updatedAt: '2026-07-05T12:00:00.000Z',
          wordLength: 5,
        }}
        keyboardDisabled
        onSpendCoins={spendNothing}
        progressOwnerKey="account:one"
        scope="practice"
      />,
    )

    expect(html).toContain('5 attempts remaining.')
  })

  it('renders each completed Practice GO answer definition once after restore', () => {
    const completed = createCompletedPracticeGoSession()

    const html = renderToStaticMarkup(
      <GoGame
        coins={0}
        initialResume={{
          difficulty: DEFAULT_DIFFICULTY_TIER,
          goPuzzleCount: 5,
          mode: 'go',
          scope: 'practice',
          serializedSession: completed,
          updatedAt: '2026-07-05T12:00:02.000Z',
          wordLength: 5,
        }}
        keyboardDisabled
        onSpendCoins={spendNothing}
        progressOwnerKey="account:one"
        scope="practice"
      />,
    )

    expect(html).toContain('Solved puzzle definitions')
    expect(countDefinitionPanels(html)).toBe(completed.puzzles.length)
  })

  it('starts Practice GO fresh when the active owner has no scoped resume slot', () => {
    const html = renderToStaticMarkup(
      <GoGame coins={0} keyboardDisabled onSpendCoins={spendNothing} progressOwnerKey="account:one" scope="practice" />,
    )

    expect(html).toContain('6 attempts remaining.')
    expect(html).not.toContain('5 attempts remaining.')
  })

  it('renders owned consumables in Practice OG and restores durable hint effects', () => {
    const serializedSession = {
      ...createStartedPracticeOgSession(),
      consumableEffects: { removedLetters: ['z'], revealedHints: [{ index: 0, letter: 'a' }] },
    }
    const html = renderToStaticMarkup(
      <OgGame
        coins={0}
        consumables={{ removeIncorrectLetters: 2, revealOneLetter: 3 }}
        initialResume={{ difficulty: DEFAULT_DIFFICULTY_TIER, mode: 'og', scope: 'practice', serializedSession, updatedAt: '2026-07-11T01:00:00.000Z', wordLength: 5 }}
        keyboardDisabled
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).toContain('Solo Practice tools')
    expect(html).toContain('Reveal letter (3)')
    expect(html).toContain('Remove incorrect letters (2)')
    expect(html).toContain('Revealed: 1: A')
    expect(html).toMatch(/aria-label="Row 2, tile 1, a"[^>]*data-state="correct"/)
    expect(html).toMatch(/aria-label="Enter A"[^>]*data-state="correct"/)
    expect(html).toMatch(/aria-label="Enter Z"[^>]*disabled=""/)
    expect(html.match(/<button[^>]*>Remove incorrect letters \(2\)<\/button>/)?.[0]).not.toContain(' disabled=""')
  })

  it('renders owned consumables in Practice GO and restores effects for the active puzzle only', () => {
    const serializedSession = {
      ...createStartedPracticeGoSession(),
      consumableEffectsByPuzzle: { '0': { removedLetters: ['x'], revealedHints: [{ index: 1, letter: 'b' }] } },
    }
    const html = renderToStaticMarkup(
      <GoGame
        coins={0}
        consumables={{ removeIncorrectLetters: 1, revealOneLetter: 4 }}
        initialResume={{ difficulty: DEFAULT_DIFFICULTY_TIER, goPuzzleCount: 5, mode: 'go', scope: 'practice', serializedSession, updatedAt: '2026-07-11T01:00:00.000Z', wordLength: 5 }}
        keyboardDisabled
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).toContain('Reveal letter (4)')
    expect(html).toContain('Revealed: 2: B')
    expect(html).toMatch(/aria-label="Row 2, tile 2, b"[^>]*data-state="correct"/)
    expect(html).toMatch(/aria-label="Enter B"[^>]*data-state="correct"/)
    expect(html).toMatch(/aria-label="Enter X"[^>]*disabled=""/)
  })
})
