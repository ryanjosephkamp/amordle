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
} from '../../game'
import { GoGame } from './GoGame'
import { OgGame } from './OgGame'

function spendNothing() {
  return false
}

function submitOgWord(session: ReturnType<typeof createOgSession>, word: string) {
  return submitGuess([...word].reduce((current, letter) => enterLetter(current, letter), session))
}

function submitGoWord(session: ReturnType<typeof createGoSession>, word: string) {
  return submitGoGuess([...word].reduce((current, letter) => enterGoLetter(current, letter), session))
}

describe('Solo presentation integration', () => {
  it('uses the shared board viewport for an active OG game', () => {
    const html = renderToStaticMarkup(
      <OgGame
        coins={0}
        keyboardDisabled
        onOpenHistory={() => undefined}
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).toContain('data-solo-board-viewport="true"')
    expect(html).toContain('aria-label="Guess grid"')
    expect(html).toContain('aria-label="Keyboard"')
  })

  it('hands a completed OG game to the result ledger without an inactive keyboard', () => {
    const setup = createPracticeOgSetup(5, 0, DEFAULT_DIFFICULTY_TIER)
    const session = submitOgWord(createOgSession(setup), setup.answer)
    const html = renderToStaticMarkup(
      <OgGame
        coins={0}
        initialResume={{
          difficulty: DEFAULT_DIFFICULTY_TIER,
          mode: 'og',
          scope: 'practice',
          serializedSession: serializeOgSession(session),
          updatedAt: '2026-07-20T12:00:00.000Z',
          wordLength: 5,
        }}
        keyboardDisabled
        onOpenHistory={() => undefined}
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).toContain('PUZZLE SOLVED')
    expect(html).toContain('Solved in 1 guesses')
    expect(html).not.toContain('aria-label="Keyboard"')
    expect(html).toContain('New practice puzzle')
    expect(html).toContain('Solo history')
  })

  it('renders every solved GO answer in the completed chain ledger', () => {
    const setup = createPracticeGoSetup(5, 0, DEFAULT_DIFFICULTY_TIER, 5)
    const session = setup.puzzles.reduce(
      (current, puzzle) => submitGoWord(current, puzzle.answer),
      createGoSession(setup),
    )
    const html = renderToStaticMarkup(
      <GoGame
        coins={0}
        initialResume={{
          difficulty: DEFAULT_DIFFICULTY_TIER,
          goPuzzleCount: 5,
          mode: 'go',
          scope: 'practice',
          serializedSession: serializeGoSession(session),
          updatedAt: '2026-07-20T12:00:00.000Z',
          wordLength: 5,
        }}
        keyboardDisabled
        onOpenHistory={() => undefined}
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).toContain('CHAIN COMPLETE')
    expect(html).toContain('5 of 5 puzzles solved')
    for (const puzzle of setup.puzzles) {
      expect(html).toContain(puzzle.answer.toLocaleUpperCase('en-US'))
    }
    expect(html).not.toContain('aria-label="Keyboard"')
    expect(html).toContain('New go chain')
    expect(html).toContain('Solo history')
  })
})
