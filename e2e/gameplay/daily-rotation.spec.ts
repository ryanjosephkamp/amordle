import { expect, test } from '@playwright/test'
import { expectNoConsoleFailures, installConsoleGuards } from '../fixtures/assertions'
import { installFixedBrowserTime } from '../fixtures/dailyClock'
import { launchDailyMultiplayer } from '../fixtures/gameActions'

test.describe('Daily rotation @daily @solo', () => {
  test('exposes a new Daily Multiplayer date after midnight UTC', async ({ browser }) => {
    const beforeContext = await browser.newContext()
    await installFixedBrowserTime(beforeContext, '2026-06-11T23:59:50.000Z')
    const beforePage = await beforeContext.newPage()
    const beforeConsole = installConsoleGuards(beforePage)

    const afterContext = await browser.newContext()
    await installFixedBrowserTime(afterContext, '2026-06-12T00:00:05.000Z')
    const afterPage = await afterContext.newPage()
    const afterConsole = installConsoleGuards(afterPage)

    try {
      await beforePage.goto('/')
      await launchDailyMultiplayer(beforePage)
      await expect(beforePage.getByText(/Daily Multiplayer · 2026-06-11 · UTC active/i)).toBeVisible()

      await afterPage.goto('/')
      await launchDailyMultiplayer(afterPage)
      await expect(afterPage.getByText(/Daily Multiplayer · 2026-06-12 · UTC active/i)).toBeVisible()

      await expectNoConsoleFailures(beforeConsole)
      await expectNoConsoleFailures(afterConsole)
    } finally {
      await Promise.all([beforeContext.close(), afterContext.close()])
    }
  })
})
