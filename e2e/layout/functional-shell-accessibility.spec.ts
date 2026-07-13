import { expect, test, type Page } from '@playwright/test'
import { expectNoConsoleFailures, expectNoHorizontalOverflow, installConsoleGuards } from '../fixtures/assertions'
import { createE2eUser, deleteE2eUser, signInThroughUi, type E2eUser } from '../fixtures/testUsers'

const ROUTES = [
  { button: /^Solo$/i, title: /^Solo$/i },
  { button: /^Multiplayer$/i, title: /^Multiplayer$/i },
  { button: /^Calendar$/i, title: /^Calendar$/i },
  { button: /^History$/i, title: /^History$/i },
  { button: /^Stats$/i, title: /^Stats$/i },
  { button: /^Leaderboard$/i, title: /^Leaderboard$/i },
  { button: /^Words$/i, title: /^Word Explorer$/i },
  { button: /^Profile$/i, title: /^Profile$/i },
  { button: /^Settings$/i, title: /^Settings$/i },
  { button: /^Help$/i, title: /^Help$/i },
  { button: /^Feedback$/i, title: /^Feedback$/i },
  { button: /^About$/i, title: /^About Awordle$/i },
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

    const navigation = page.getByRole('navigation', { name: /^Awordle destinations$/i })
    await expect(navigation).toBeVisible()
    await expect(page.getByRole('main')).toHaveCount(1)

    for (const route of ROUTES) {
      const button = navigation.getByRole('button', { name: route.button })
      await button.focus()
      await expect(button).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { level: 1, name: route.title })).toBeVisible()
      await expect(button).toHaveAttribute('aria-current', 'page')
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
    await expect(page.getByRole('navigation', { name: /^Awordle destinations$/i })).toBeVisible()
    await expectNoHorizontalOverflow(page)

    await page.getByRole('button', { name: /^Exit focus mode and restore the full shell$/i }).click()
    await expect(page.getByRole('button', { name: /^Enter focus mode$/i })).toHaveAttribute('aria-pressed', 'false')
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
