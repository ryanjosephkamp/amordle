import { expect, test, type Page } from '@playwright/test'
import { dateKeyToLocalDate } from '../../src/daily'
import { createDailyOgSetup, createPracticeOgSetup } from '../../src/game/og/session'
import { expectNoConsoleFailures, installConsoleGuards } from '../fixtures/assertions'
import { installFixedBrowserTime } from '../fixtures/dailyClock'
import { chooseSoloPracticeMode, navigateToSoloPractice, submitSoloGuessWithKeyboard } from '../fixtures/gameActions'

const FIXED_DAILY_DATE_KEY = '2026-06-11'
const FIXED_DAILY_ISO = `${FIXED_DAILY_DATE_KEY}T16:00:00.000Z`

async function navigateToDailyOg(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Solo$/i }).click()
  await expect(page.locator('#solo-workspace-title')).toBeVisible()
  await page.getByRole('tab', { name: /^Daily Solo$/i }).click()
  await page.getByRole('group', { name: /^Daily Solo mode$/i }).getByRole('button', { name: /^OG$/i }).click()
  await expect(page.getByRole('region', { name: /Daily og puzzle/i })).toBeVisible()
}

async function expectSolvedOg(page: Page): Promise<void> {
  await expect(page.getByText(/^Solved\./i).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('grid', { name: /^Guess grid$/i })).toBeVisible()
}

test.describe('Solo OG characterization @solo', () => {
  test('solves and restores a Practice OG game after refresh and explicit re-entry @practice', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'og')

    const answer = createPracticeOgSetup(5, 0).answer
    await submitSoloGuessWithKeyboard(page, /Practice og puzzle/i, answer)
    await expectSolvedOg(page)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('#dashboard-home-title')).toBeVisible()
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'og')
    await expectSolvedOg(page)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('solves and restores Daily OG after refresh and explicit re-entry @daily', async ({ browser }) => {
    const context = await browser.newContext()
    await installFixedBrowserTime(context, FIXED_DAILY_ISO)
    const page = await context.newPage()
    const consoleFailures = installConsoleGuards(page)
    try {
      await page.goto('/')
      await navigateToDailyOg(page)

      const answer = createDailyOgSetup(dateKeyToLocalDate(FIXED_DAILY_DATE_KEY)).answer
      await submitSoloGuessWithKeyboard(page, /Daily og puzzle/i, answer)
      await expectSolvedOg(page)

      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.locator('#dashboard-home-title')).toBeVisible()
      await navigateToDailyOg(page)
      await expectSolvedOg(page)
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await context.close()
    }
  })
})
