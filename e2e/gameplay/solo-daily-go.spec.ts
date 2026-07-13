import { expect, test } from '@playwright/test'
import { dateKeyToLocalDate } from '../../src/daily'
import { createDailyGoSetup } from '../../src/game/go/session'
import { expectNoConsoleFailures, installConsoleGuards } from '../fixtures/assertions'
import { installFixedBrowserTime } from '../fixtures/dailyClock'
import { navigateToCalendar, submitSoloGuessWithKeyboard } from '../fixtures/gameActions'

test.describe('Solo Daily GO @solo @daily', () => {
  test('solves the first Daily GO puzzle under deterministic browser time', async ({ browser }) => {
    const context = await browser.newContext()
    await installFixedBrowserTime(context, '2026-06-11T16:00:00.000Z')
    const page = await context.newPage()
    const consoleFailures = installConsoleGuards(page)
    try {
      await page.goto('/')
      await navigateToCalendar(page)
      await page.getByRole('button', { name: /^Play Today’s GO$/i }).click()

      const answer = createDailyGoSetup(dateKeyToLocalDate('2026-06-11')).puzzles[0]?.answer
      if (!answer) {
        throw new Error('Daily GO setup did not produce an answer.')
      }

      await submitSoloGuessWithKeyboard(page, /Daily go chain/i, answer)
      await expect(page.getByText(/Puzzle 2 of 5/i).first()).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText(answer.toLocaleUpperCase('en-US'), { exact: true }).first()).toBeVisible()
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await context.close()
    }
  })
})
