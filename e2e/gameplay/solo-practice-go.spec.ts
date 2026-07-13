import { expect, test } from '@playwright/test'
import { createPracticeGoSetup } from '../../src/game/go/session'
import { expectNoConsoleFailures, installConsoleGuards } from '../fixtures/assertions'
import { chooseSoloPracticeMode, navigateToSoloPractice, submitSoloGuessWithKeyboard } from '../fixtures/gameActions'

test.describe('Solo Practice GO @solo @practice', () => {
  test('solves the first GO puzzle and carries it into the next board', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'go')

    const answer = createPracticeGoSetup(5, 0).puzzles[0]?.answer
    if (!answer) {
      throw new Error('Practice GO setup did not produce an answer.')
    }

    await submitSoloGuessWithKeyboard(page, /Practice go chain/i, answer)
    await expect(page.getByText(/Puzzle 2 of 5/i).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(answer.toLocaleUpperCase('en-US'), { exact: true }).first()).toBeVisible()
    await expectNoConsoleFailures(consoleFailures)
  })
})
