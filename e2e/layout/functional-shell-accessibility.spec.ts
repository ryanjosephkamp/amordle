import { expect, test, type Page } from '@playwright/test'
import { expectNoConsoleFailures, expectNoHorizontalOverflow, installConsoleGuards } from '../fixtures/assertions'
import { createE2eUser, deleteE2eUser, signInThroughUi, type E2eUser } from '../fixtures/testUsers'

const ROUTES = [
  { button: /^PLAY$/i, source: 'rail', title: /^PLAY$/i },
  { button: /^DAILY$/i, source: 'rail', title: /^DAILY$/i },
  { button: /^COMBAT$/i, source: 'rail', title: /^COMBAT$/i },
  { button: /^CALENDAR$/i, source: 'rail', title: /^Calendar$/i },
  { button: /^STATS$/i, source: 'rail', title: /^Stats$/i },
  { button: /^History$/i, source: 'more', title: /^History$/i },
  { button: /^Leaderboard$/i, source: 'more', title: /^Leaderboard$/i },
  { button: /^Word Explorer$/i, source: 'more', title: /^Word Explorer$/i },
  { button: /^Profile$/i, source: 'more', title: /^Profile$/i },
  { button: /^Settings$/i, source: 'utility', title: /^Settings$/i },
  { button: /^Help$/i, source: 'utility', title: /^Help$/i },
  { button: /^Feedback$/i, source: 'more', title: /^Feedback$/i },
  { button: /^About amordle$/i, source: 'more', title: /^About amordle$/i },
] as const

async function triggerLocalDailyNotification(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Open simulate time developer tool$/i }).click()
  const simulateTime = page.getByRole('region', { name: /^Simulate time \(developer tool\)$/i })
  await simulateTime.getByRole('button', { name: /^Jump to next midnight$/i }).click()
  await expect(page.locator('.brrrdle-notification-count')).not.toHaveText('0', { timeout: 10_000 })
}

test.describe('Functional shell characterization @layout', () => {
  test('keeps primary destinations keyboard reachable with one main landmark', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')

    const navigation = page.getByRole('navigation', { name: /^Primary destinations$/i })
    await expect(navigation).toBeVisible()
    await expect(page.getByRole('main')).toHaveCount(1)

    for (const route of ROUTES) {
      let button
      if (route.source === 'rail') {
        button = navigation.getByRole('button', { name: route.button })
      } else if (route.source === 'utility') {
        button = page.getByRole('navigation', { name: /^Utility destinations$/i }).getByRole('button', { name: route.button })
      } else {
        await navigation.getByRole('button', { name: /^MORE$/i }).click()
        const dialog = page.getByRole('dialog', { name: /^More destinations$/i })
        await expect(dialog).toBeFocused()
        button = dialog.getByRole('button', { name: route.button })
      }
      await button.focus()
      await expect(button).toBeFocused()
      await button.press('Enter')
      await expect(page.getByRole('heading', { level: 1, name: route.title })).toBeVisible()
      if (route.source !== 'more') {
        await expect(button).toHaveAttribute('aria-current', 'page')
      } else {
        await expect(navigation.getByRole('button', { name: /^MORE$/i })).toHaveAttribute('aria-current', 'page')
      }
    }

    await expectNoConsoleFailures(consoleFailures)
  })

  test('keeps Focus Mode reversible and the mobile shell free of horizontal overflow', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.setViewportSize({ height: 844, width: 390 })
    await page.goto('/')

    const focusToggle = page.getByRole('button', { name: /^Enter focus mode$/i })
    await focusToggle.click()
    await expect(page.getByRole('button', { name: /^Exit focus mode and restore the full shell$/i })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('navigation', { name: /^Mobile destinations$/i })).toBeHidden()
    await expectNoHorizontalOverflow(page)

    await page.getByRole('button', { name: /^Exit focus mode and restore the full shell$/i }).click()
    await expect(page.getByRole('button', { name: /^Enter focus mode$/i })).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('navigation', { name: /^Mobile destinations$/i })).toBeVisible()
    await expectNoConsoleFailures(consoleFailures)
  })

  test('keeps authenticated account controls available inside the mobile viewport', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    let user: E2eUser | undefined
    try {
      user = await createE2eUser('shell-accessibility')
      await page.setViewportSize({ height: 844, width: 390 })
      await signInThroughUi(page, user)

      const accountButton = page.getByRole('button', { name: /open account menu for/i })
      await accountButton.focus()
      await expect(accountButton).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('account-menu')).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await deleteE2eUser(user)
    }
  })

  test('collapses the notification center after Open routes to its target', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear())
    await page.setViewportSize({ height: 844, width: 390 })
    await page.goto('/')
    await triggerLocalDailyNotification(page)

    const summary = page.locator('.brrrdle-notification-summary')
    await summary.click()
    const panel = page.getByRole('region', { name: /^In-app notifications$/i })
    await expect(panel).toBeVisible()
    const open = panel.getByRole('button', { name: /^Open$/i }).first()
    await expect(open).toBeVisible()
    await open.click()

    await expect(summary).toHaveAttribute('aria-expanded', 'false')
    await expect(panel).toHaveCount(0)
  })

  test('keeps the notification center open for local read and hide actions', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear())
    await page.goto('/')
    await triggerLocalDailyNotification(page)

    const summary = page.locator('.brrrdle-notification-summary')
    await summary.click()
    const panel = page.getByRole('region', { name: /^In-app notifications$/i })
    await panel.getByRole('button', { name: /^Mark read$/i }).first().click()
    await expect(panel).toBeVisible()
    await expect(summary).toHaveAttribute('aria-expanded', 'true')

    const hide = panel.getByRole('button', { name: /^Hide$/i }).first()
    if (await hide.count()) {
      await hide.click()
      await expect(panel).toBeVisible()
      await expect(summary).toHaveAttribute('aria-expanded', 'true')
    }
  })

  test('keeps the notification center open after Mark all read', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.clear())
    await page.goto('/')
    await triggerLocalDailyNotification(page)

    const summary = page.locator('.brrrdle-notification-summary')
    await summary.click()
    const panel = page.getByRole('region', { name: /^In-app notifications$/i })
    await panel.getByRole('button', { name: /^Mark all read$/i }).click()

    await expect(panel).toBeVisible()
    await expect(summary).toHaveAttribute('aria-expanded', 'true')
  })

})
