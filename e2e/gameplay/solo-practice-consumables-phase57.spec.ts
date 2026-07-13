import { expect, test } from '@playwright/test'
import { createDefaultGuestProgress } from '../../src/account'
import { DEFAULT_DIFFICULTY_TIER } from '../../src/data'
import { createGoSession, createPracticeGoSetup, enterGoLetter, serializeGoSession, submitGoGuess } from '../../src/game'
import { expectNoConsoleFailures, installConsoleGuards } from '../fixtures/assertions'
import { chooseSoloPracticeMode, navigateToSoloPractice } from '../fixtures/gameActions'

const GUEST_PROGRESS_STORAGE_KEY = 'brrrdle:guest-progress:v1'

test.describe('Phase 57 Solo Practice marketplace and consumables @solo @practice', () => {
  test('a final reveal completes OG and advances GO through canonical game flow', async ({ page }) => {
    const seeded = createDefaultGuestProgress()
    await page.addInitScript(({ key, progress }) => {
      window.localStorage.setItem(key, JSON.stringify(progress))
    }, {
      key: GUEST_PROGRESS_STORAGE_KEY,
      progress: {
        ...seeded,
        progression: {
          ...seeded.progression,
          consumables: { removeIncorrectLetters: 0, revealOneLetter: 10 },
        },
      },
    })
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'og')
    const ogGame = page.getByRole('region', { name: /Practice og puzzle/i })
    for (const inventory of [10, 9, 8, 7, 6]) {
      await ogGame.getByRole('button', { name: new RegExp(`Reveal letter \\(${inventory}\\)`, 'i') }).click()
    }
    await expect(ogGame.getByText(/^Solved\./i)).toBeVisible()
    await expect(ogGame.locator('[role="row"]').first().locator('[data-state="correct"]')).toHaveCount(5)

    await chooseSoloPracticeMode(page, 'go')
    const goGame = page.getByRole('region', { name: /Practice go chain/i })
    for (const inventory of [5, 4, 3, 2, 1]) {
      await goGame.getByRole('button', { name: new RegExp(`Reveal letter \\(${inventory}\\)`, 'i') }).click()
    }
    await expect(goGame.getByText(/^Advancing to the next puzzle\.$/i)).toBeVisible()
    await expect(goGame.getByText(/^Puzzle 2 of 5; 5 attempts remaining\.$/i)).toBeVisible({ timeout: 5_000 })
    await expectNoConsoleFailures(consoleFailures)
  })

  test('a final unresolved reveal finishes the GO chain once', async ({ page }) => {
    const seeded = createDefaultGuestProgress()
    const setup = createPracticeGoSetup(5, 0)
    let session = createGoSession(setup)
    for (const puzzle of setup.puzzles.slice(0, -1)) {
      session = submitGoGuess([...puzzle.answer].reduce((current, letter) => enterGoLetter(current, letter), session))
    }
    const serialized = serializeGoSession(session)
    const finalPuzzle = serialized.puzzles[serialized.currentPuzzleIndex]!
    const replacement = [...'abcdefghijklmnopqrstuvwxyz'].find((letter) => !finalPuzzle.answer.includes(letter))!
    const almostCorrect = `${finalPuzzle.answer.slice(0, -1)}${replacement}`
    const finalPuzzleResume = {
      ...serialized,
      puzzles: serialized.puzzles.map((puzzle, index) => index === serialized.currentPuzzleIndex
        ? { ...puzzle, currentGuess: '', guesses: [almostCorrect], prefilledGuesses: [] }
        : puzzle),
    }
    await page.addInitScript(({ key, progress }) => {
      window.localStorage.setItem(key, JSON.stringify(progress))
    }, {
      key: GUEST_PROGRESS_STORAGE_KEY,
      progress: {
        ...seeded,
        progression: {
          ...seeded.progression,
          consumables: { removeIncorrectLetters: 0, revealOneLetter: 1 },
        },
        resumeSlots: {
          'practice-go': {
            difficulty: DEFAULT_DIFFICULTY_TIER,
            goPuzzleCount: 5,
            mode: 'go',
            scope: 'practice',
            serializedSession: finalPuzzleResume,
            updatedAt: '2026-07-11T15:00:00.000Z',
            wordLength: 5,
          },
        },
      },
    })
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'go')
    const game = page.getByRole('region', { name: /Practice go chain/i })
    await game.getByRole('button', { name: /^Reveal letter \(1\)$/i }).click()
    await expect(game.getByText(/^Advancing to final results\.$/i)).toBeVisible()
    await expect(game.getByText(/^Solved all 5 go puzzles\./i)).toBeVisible({ timeout: 5_000 })
    await expect(game.getByText(/^Solved puzzle definitions$/i)).toBeVisible()
    await expectNoConsoleFailures(consoleFailures)
  })

  test('buys, uses, persists, and scope-gates both consumables', async ({ page }) => {
    const seeded = createDefaultGuestProgress()
    await page.addInitScript(({ key, progress }) => {
      if (!window.localStorage.getItem(key)) {
        window.localStorage.setItem(key, JSON.stringify(progress))
      }
    }, {
      key: GUEST_PROGRESS_STORAGE_KEY,
      progress: { ...seeded, progression: { ...seeded.progression, coins: 140 } },
    })
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')

    await page.getByRole('button', { name: /^Market$/i }).click()
    await expect(page.locator('#marketplace-title')).toBeVisible()
    await page.getByRole('button', { name: /Buy for 25 coins/i }).click()
    await expect(page.getByText('Purchase complete.')).toBeVisible()
    await expect(page.getByText('115 coins available.')).toBeVisible()
    await page.getByRole('button', { name: /Buy for 40 coins/i }).click()
    await expect(page.getByText('75 coins available.')).toBeVisible()
    await page.getByRole('button', { name: /Buy for 40 coins/i }).click()
    await expect(page.getByText('35 coins available.')).toBeVisible()

    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'og')
    const game = page.getByRole('region', { name: /Practice og puzzle/i })
    await expect(game.getByText('Solo Practice tools')).toBeVisible()
    await game.getByRole('button', { name: /Reveal letter \(1\)/i }).click()
    const revealedText = game.getByText(/^Revealed:/i)
    await expect(revealedText).toBeVisible()
    const revealedMatch = (await revealedText.textContent())?.match(/(\d+):\s*([A-Z])/i)
    expect(revealedMatch).toBeTruthy()
    const revealedPosition = Number(revealedMatch![1])
    const revealedLetter = revealedMatch![2]!
    const revealedTile = game.getByRole('gridcell', { name: new RegExp(`^Row 1, tile ${revealedPosition}, ${revealedLetter}$`, 'i') })
    await expect(revealedTile).toHaveAttribute('data-state', 'correct')
    await game.getByRole('button', { name: /^Enter Q$/i }).click()
    await game.getByRole('button', { name: /^Delete letter$/i }).click()
    await expect(revealedTile).toHaveAttribute('data-state', 'correct')

    const keyboard = game.locator('section[aria-label="Keyboard"]')
    await game.getByRole('button', { name: /Remove incorrect letters \(2\)/i }).click()
    await expect(keyboard.locator('button[aria-label^="Enter "]:disabled')).toHaveCount(5)
    await game.getByRole('button', { name: /Remove incorrect letters \(1\)/i }).click()
    const disabledKeyLabels = await keyboard.locator('button[aria-label^="Enter "]:disabled').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
    expect(disabledKeyLabels).toHaveLength(10)
    await expect.poll(async () => page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) return undefined
      const progress = JSON.parse(raw) as { resumeSlots?: { 'practice-og'?: { serializedSession?: { consumableEffects?: { removedLetters?: string[]; revealedHints?: unknown[] } } } } }
      const effects = progress.resumeSlots?.['practice-og']?.serializedSession?.consumableEffects
      return effects ? { removedCount: effects.removedLetters?.length, revealedCount: effects.revealedHints?.length } : undefined
    }, GUEST_PROGRESS_STORAGE_KEY)).toEqual({
      removedCount: 10,
      revealedCount: 1,
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('#dashboard-home-title')).toBeVisible()
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'og')
    const restoredOg = page.getByRole('region', { name: /Practice og puzzle/i })
    await expect(restoredOg.getByText(/^Revealed:/i)).toBeVisible()
    await expect(restoredOg.getByRole('gridcell', { name: new RegExp(`^Row 1, tile ${revealedPosition}, ${revealedLetter}$`, 'i') })).toHaveAttribute('data-state', 'correct')
    for (const label of disabledKeyLabels) await expect(restoredOg.getByRole('button', { name: label! })).toBeDisabled()

    await page.getByRole('tab', { name: /^Daily Solo$/i }).click()
    await expect(page.getByText('Solo Practice tools')).toHaveCount(0)
    await page.getByRole('button', { name: /^Multiplayer$/i }).click()
    await expect(page.getByText('Solo Practice tools')).toHaveCount(0)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('persists GO consumable effects for the active chain puzzle', async ({ page }) => {
    const seeded = createDefaultGuestProgress()
    await page.addInitScript(({ key, progress }) => {
      if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, JSON.stringify(progress))
    }, {
      key: GUEST_PROGRESS_STORAGE_KEY,
      progress: {
        ...seeded,
        progression: {
          ...seeded.progression,
          consumables: { removeIncorrectLetters: 1, revealOneLetter: 1 },
        },
      },
    })
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'go')
    const game = page.getByRole('region', { name: /Practice go chain/i })
    await game.getByRole('button', { name: /Reveal letter \(1\)/i }).click()
    await game.getByRole('button', { name: /Remove incorrect letters \(1\)/i }).click()

    const removedKeyLabels = await game.locator('section[aria-label="Keyboard"] button[aria-label^="Enter "]:disabled').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
    expect(removedKeyLabels).toHaveLength(5)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('#dashboard-home-title')).toBeVisible()
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'go')
    const restored = page.getByRole('region', { name: /Practice go chain/i })
    await expect(restored.getByText(/^Revealed:/i)).toBeVisible()
    for (const label of removedKeyLabels) await expect(restored.getByRole('button', { name: label! })).toBeDisabled()
    await expectNoConsoleFailures(consoleFailures)
  })
})
