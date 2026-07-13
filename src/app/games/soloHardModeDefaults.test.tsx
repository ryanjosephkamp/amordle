import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DIFFICULTY_TIER } from '../../data'
import { DEFAULT_GO_PUZZLE_COUNT } from '../../game/constants'
import {
  createDailyGoSetup,
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
import { getSoloGoSolvedTransition } from './goTransitions'
import { OgGame } from './OgGame'

function spendNothing() {
  return false
}

function submitGoAnswer() {
  const setup = createPracticeGoSetup(5, 0)
  const filled = [...setup.puzzles[0].answer].reduce((session, letter) => enterGoLetter(session, letter), createGoSession(setup))
  return serializeGoSession(submitGoGuess(filled))
}

function findWrongGuess(answer: string, validGuesses: ReadonlySet<string>): string {
  const wrongGuess = [...validGuesses].find((guess) => guess !== answer)
  if (!wrongGuess) {
    throw new Error(`No wrong ${answer.length}-letter guess is available for this fixture.`)
  }
  return wrongGuess
}

function submitOgWrongGuess() {
  const setup = createPracticeOgSetup(5, 0, DEFAULT_DIFFICULTY_TIER)
  const guess = findWrongGuess(setup.answer, setup.validGuesses)
  const filled = [...guess].reduce((session, letter) => enterLetter(session, letter), createOgSession(setup))
  return serializeOgSession(submitGuess(filled))
}

function submitGoWrongGuess() {
  const setup = createPracticeGoSetup(5, 0)
  const activePuzzle = setup.puzzles[0]
  if (!activePuzzle) {
    throw new Error('Practice GO setup did not produce an active puzzle.')
  }
  const guess = findWrongGuess(activePuzzle.answer, setup.validGuesses)
  const filled = [...guess].reduce((session, letter) => enterGoLetter(session, letter), createGoSession(setup))
  return serializeGoSession(submitGoGuess(filled))
}

function submitFirstGoAnswer(setup: ReturnType<typeof createPracticeGoSetup> | ReturnType<typeof createDailyGoSetup>) {
  const initial = createGoSession(setup)
  const filled = [...setup.puzzles[0].answer].reduce((session, letter) => enterGoLetter(session, letter), initial)
  return { initial, next: submitGoGuess(filled) }
}

describe('solo game defaults', () => {
  it('starts fresh og games in Hard Mode when requested by settings', () => {
    const html = renderToStaticMarkup(
      <OgGame
        coins={0}
        defaultHardMode
        keyboardDisabled
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/)
    expect(html).toContain('Hard mode')
  })

  it('starts fresh go games in Hard Mode when requested by settings', () => {
    const html = renderToStaticMarkup(
      <GoGame
        coins={0}
        defaultHardMode
        keyboardDisabled
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/)
    expect(html).toContain('Hard mode')
  })

  it('keeps the Hard Mode toggle enabled on fresh practice go chains', () => {
    const html = renderToStaticMarkup(
      <GoGame
        coins={0}
        keyboardDisabled
        onSaveDifficultyDefault={() => undefined}
        onSaveGoPuzzleCountDefault={() => undefined}
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    const hardModeInput = html.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0]
    expect(hardModeInput).toBeDefined()
    expect(hardModeInput).not.toContain('disabled')
  })

  it('locks the Hard Mode toggle on practice go chains after the first submitted guess', () => {
    const html = renderToStaticMarkup(
      <GoGame
        coins={0}
        initialResume={{
          difficulty: DEFAULT_DIFFICULTY_TIER,
          goPuzzleCount: DEFAULT_GO_PUZZLE_COUNT,
          mode: 'go',
          scope: 'practice',
          serializedSession: submitGoAnswer(),
          updatedAt: '2026-06-08T22:00:00.000Z',
          wordLength: 5,
        }}
        keyboardDisabled
        onSaveDifficultyDefault={() => undefined}
        onSaveGoPuzzleCountDefault={() => undefined}
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    const hardModeInput = html.match(/<input[^>]*type="checkbox"[^>]*>/)?.[0]
    expect(hardModeInput).toBeDefined()
    expect(hardModeInput).toContain('disabled')
  })

  it('keeps Customize unlocked on fresh practice og puzzles', () => {
    const html = renderToStaticMarkup(
      <OgGame
        coins={0}
        keyboardDisabled
        onSaveDifficultyDefault={() => undefined}
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).not.toContain('Difficulty is locked because this puzzle has started.')
  })

  it('keeps fresh practice og setup controls without redundant metadata rows', () => {
    const html = renderToStaticMarkup(
      <OgGame
        coins={0}
        keyboardDisabled
        onSaveDifficultyDefault={() => undefined}
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).toContain('Practice length')
    expect(html).toContain('Customize')
    expect(html).toContain('Hard mode')
    expect(html).toContain('min-h-20')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-gameplay-autocenter-target="solo"')
    expect(html).toContain('data-gameplay-autocenter-target="solo-keyboard"')
    expect(html).not.toContain('Puzzle status')
    expect(html).not.toContain('Seed lists')
  })

  it('keeps practice og keyboard ahead of optional reveal controls in the post-guess mobile layout', () => {
    const html = renderToStaticMarkup(
      <OgGame
        coins={10}
        initialResume={{
          difficulty: DEFAULT_DIFFICULTY_TIER,
          mode: 'og',
          scope: 'practice',
          serializedSession: submitOgWrongGuess(),
          updatedAt: '2026-07-04T22:00:00.000Z',
          wordLength: 5,
        }}
        keyboardDisabled
        onSaveDifficultyDefault={() => undefined}
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).toContain('brrrdle-solo-gameplay')
    expect(html).toContain('brrrdle-solo-post-guess-controls')
    expect(html).toContain('order-1 md:order-2')
    expect(html).toContain('order-2 flex flex-col gap-4 md:order-1')
    expect(html.indexOf('data-gameplay-autocenter-target="solo-keyboard"')).toBeLessThan(
      html.indexOf('Give Up / Reveal Answer'),
    )
  })

  it('keeps Customize unlocked on fresh practice go chains until the first submitted guess', () => {
    const html = renderToStaticMarkup(
      <GoGame
        coins={0}
        keyboardDisabled
        onSaveDifficultyDefault={() => undefined}
        onSaveGoPuzzleCountDefault={() => undefined}
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).not.toContain('Difficulty and chain length are locked because this puzzle has started.')
  })

  it('keeps fresh practice go setup controls without redundant chain metadata rows', () => {
    const html = renderToStaticMarkup(
      <GoGame
        coins={0}
        keyboardDisabled
        onSaveDifficultyDefault={() => undefined}
        onSaveGoPuzzleCountDefault={() => undefined}
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).toContain('Practice length')
    expect(html).toContain('Customize')
    expect(html).toContain('Hard mode')
    expect(html).toContain('min-h-20')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-gameplay-autocenter-target="solo"')
    expect(html).toContain('data-gameplay-autocenter-target="solo-keyboard"')
    expect(html).not.toContain('Current puzzle')
    expect(html).not.toContain('Chain status')
    expect(html).not.toContain('Seed lists')
  })

  it('keeps practice go keyboard ahead of optional reveal controls in the post-guess mobile layout', () => {
    const html = renderToStaticMarkup(
      <GoGame
        coins={10}
        initialResume={{
          difficulty: DEFAULT_DIFFICULTY_TIER,
          goPuzzleCount: DEFAULT_GO_PUZZLE_COUNT,
          mode: 'go',
          scope: 'practice',
          serializedSession: submitGoWrongGuess(),
          updatedAt: '2026-07-04T22:00:00.000Z',
          wordLength: 5,
        }}
        keyboardDisabled
        onSaveDifficultyDefault={() => undefined}
        onSaveGoPuzzleCountDefault={() => undefined}
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).toContain('brrrdle-solo-gameplay')
    expect(html).toContain('brrrdle-solo-post-guess-controls')
    expect(html.indexOf('data-gameplay-autocenter-target="solo-keyboard"')).toBeLessThan(
      html.indexOf('Give Up / Reveal Answer'),
    )
  })

  it('locks Customize on practice go chains after the first submitted guess', () => {
    const html = renderToStaticMarkup(
      <GoGame
        coins={0}
        initialResume={{
          difficulty: DEFAULT_DIFFICULTY_TIER,
          goPuzzleCount: DEFAULT_GO_PUZZLE_COUNT,
          mode: 'go',
          scope: 'practice',
          serializedSession: submitGoAnswer(),
          updatedAt: '2026-06-08T22:00:00.000Z',
          wordLength: 5,
        }}
        keyboardDisabled
        onSaveDifficultyDefault={() => undefined}
        onSaveGoPuzzleCountDefault={() => undefined}
        onSpendCoins={spendNothing}
        scope="practice"
      />,
    )

    expect(html).toContain('Difficulty and chain length are locked because this puzzle has started.')
  })

  it.each(['practice', 'daily'] as const)('detects solved-row transitions for intermediate solo %s go puzzles', (scope) => {
    const setup = scope === 'daily'
      ? createDailyGoSetup(new Date('2026-06-09T00:00:00.000Z'))
      : createPracticeGoSetup(5, 0)
    const { initial, next } = submitFirstGoAnswer(setup)

    expect(next.currentPuzzleIndex).toBe(1)
    expect(getSoloGoSolvedTransition(initial, next)).toEqual({ puzzleIndex: 0 })
  })
})
