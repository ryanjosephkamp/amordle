import { expect, test, type Page } from '@playwright/test'
import { expectNoConsoleFailures, installConsoleGuards } from '../fixtures/assertions'

const BROWSER_NAVIGATION_HISTORY_KEY = '__brrrdleNavigation'
const NAVIGATION_STORAGE_KEY = 'brrrdle:navigation:v2'

async function expectHome(page: Page): Promise<void> {
  await expect(page.locator('#dashboard-home-title')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1_000)
  await expect(page.locator('#dashboard-home-title')).toBeVisible()
  await expect(page.locator('#solo-workspace-title')).toBeHidden()
  await expect(page.locator('#multiplayer-workspace-title')).toBeHidden()
  await expect(page.locator('#settings-title')).toBeHidden()
}

test.describe('refresh route persistence @navigation', () => {
  test('resets to Home when saved tab navigation and browser history point elsewhere', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')

    await page.evaluate(({ historyKey, storageKey }) => {
      const currentNavigation = {
        activeRouteId: 'solo',
        historyFilters: { mode: 'all', player: 'all', scope: 'all' },
        legacyPracticeMode: 'go',
        multiplayerSubtab: 'overview',
        selectedSoloGameKey: 'practice-go',
        soloSubtab: 'practice',
      }
      const staleNavigation = {
        activeRouteId: 'multiplayer',
        historyFilters: { mode: 'all', player: 'all', scope: 'all' },
        legacyPracticeMode: 'og',
        multiplayerSubtab: 'lobby',
        soloSubtab: 'overview',
      }
      window.localStorage.setItem(storageKey, JSON.stringify(currentNavigation))
      window.sessionStorage.setItem(storageKey, JSON.stringify(currentNavigation))
      window.history.replaceState({
        [historyKey]: {
          version: 1,
          viewState: { navigation: staleNavigation },
        },
      }, '', window.location.href)
    }, {
      historyKey: BROWSER_NAVIGATION_HISTORY_KEY,
      storageKey: NAVIGATION_STORAGE_KEY,
    })

    await page.reload({ waitUntil: 'domcontentloaded' })

    await expectHome(page)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('resets a newly selected Solo Practice GO surface to Home after an immediate browser refresh', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')

    await page.getByRole('button', { name: /^Solo$/i }).click()
    await expect(page.locator('#solo-workspace-title')).toBeVisible()
    await page.getByRole('tab', { name: /^Practice Solo$/i }).click()
    await expect(page.getByRole('group', { name: /^Practice Solo mode$/i })).toBeVisible()
    await page.getByRole('group', { name: /^Practice Solo mode$/i }).getByRole('button', { name: /^GO$/i }).click()

    await page.reload({ waitUntil: 'domcontentloaded' })

    await expectHome(page)
    await page.getByRole('button', { name: /^Solo$/i }).click()
    await expect(page.locator('#solo-workspace-title')).toBeVisible()
    await page.getByRole('tab', { name: /^Practice Solo$/i }).click()
    await page.getByRole('group', { name: /^Practice Solo mode$/i }).getByRole('button', { name: /^GO$/i }).click()
    await expect(page.getByRole('region', { name: /Practice go chain/i })).toBeVisible()
    await expectNoConsoleFailures(consoleFailures)
  })

  test('resets a newly selected Multiplayer Lobby surface to Home after an immediate browser refresh', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')

    await page.getByRole('button', { name: /^Multiplayer$/i }).click()
    await expect(page.locator('#multiplayer-workspace-title')).toBeVisible()
    await page.getByRole('tab', { name: /^Lobby$/i }).click()

    await page.reload({ waitUntil: 'domcontentloaded' })

    await expectHome(page)
    await page.getByRole('button', { name: /^Multiplayer$/i }).click()
    await expect(page.locator('#multiplayer-workspace-title')).toBeVisible()
    await page.getByRole('tab', { name: /^Lobby$/i }).click()
    await expect(page.getByRole('heading', { level: 3, name: /^Lobby$/i })).toBeVisible()
    await expectNoConsoleFailures(consoleFailures)
  })

  test('resets non-game utility routes to Home after an immediate browser refresh', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')

    await page.getByRole('button', { name: /^Settings$/i }).click()
    await expect(page.locator('#settings-title')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })

    await expectHome(page)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('keeps browser Back and Forward navigation within the current tab session', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')

    await page.getByRole('button', { name: /^Solo$/i }).click()
    await expect(page.locator('#solo-workspace-title')).toBeVisible()
    await page.getByRole('button', { name: /^Multiplayer$/i }).click()
    await expect(page.locator('#multiplayer-workspace-title')).toBeVisible()

    await page.goBack()
    await expect(page.locator('#solo-workspace-title')).toBeVisible()
    await page.goForward()
    await expect(page.locator('#multiplayer-workspace-title')).toBeVisible()
    await expectNoConsoleFailures(consoleFailures)
  })
})
