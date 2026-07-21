import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  expectNoConsoleFailures,
  expectNoHorizontalOverflow,
  installConsoleGuards,
} from '../fixtures/assertions'

const evidenceDirectory = process.env.WAVE04_EVIDENCE_DIR

async function installDeterministicLocalState(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-07-20T16:00:00.000Z'))
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.localStorage.setItem('brrrdle:sound-effects-enabled', 'false')
  })
}

async function openCombatOverview(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /^COMBAT$/i }).click()
  await expect(page.locator('#multiplayer-workspace-title')).toHaveText('COMBAT')
  await expect(page.getByRole('tab', { name: /^Overview$/i })).toHaveAttribute('aria-selected', 'true')
}

async function capture(page: Page, filename: string): Promise<void> {
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; } .brrrdle-sim-time { display: none !important; }',
  })
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: path.join(evidenceDirectory ?? '', filename),
  })
}

test.describe('Wave 04 COMBAT shell and overview @layout @multiplayer @wave04', () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicLocalState(page)
  })

  test('uses the accepted standalone COMBAT hierarchy and Practice-only Live context', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.setViewportSize({ height: 1024, width: 1440 })
    await openCombatOverview(page)

    await expect(page.getByText(/^Shared-board word duels$/i)).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Active Multiplayer Games$/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Lobby$/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Live v1$/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Recent Multiplayer Results$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Open Live$/i })).toBeVisible()
    await expect(page.getByText(/Eligible Practice Multiplayer games appear here/i)).toBeVisible()
    await expect(page.locator('.combat-live-rail').getByText(/Daily/i)).toHaveCount(0)
    await expectNoHorizontalOverflow(page)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('preserves the mounted COMBAT workspace through Focus and regular presentation', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 })
    await openCombatOverview(page)
    const workspace = page.locator('#multiplayer-workspace-title')
    await workspace.evaluate((element) => {
      element.dataset.wave04SessionIdentity = 'preserved'
    })

    await page.getByRole('button', { name: /^Enter focus mode$/i }).click()
    await expect(page.getByRole('button', { name: /^Exit focus mode and restore the full shell$/i })).toBeVisible()
    await expect(page.getByRole('navigation', { name: /^Mobile destinations$/i })).toBeHidden()
    await expect(workspace).toHaveAttribute('data-wave04-session-identity', 'preserved')

    await page.getByRole('button', { name: /^Exit focus mode and restore the full shell$/i }).click()
    await expect(page.getByRole('navigation', { name: /^Mobile destinations$/i })).toBeVisible()
    await expect(workspace).toHaveAttribute('data-wave04-session-identity', 'preserved')
  })

  test('keeps Practice queue controls distinct from the fixed asynchronous Daily lane', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 })
    await openCombatOverview(page)

    await page.getByRole('tab', { name: /^Practice Multiplayer$/i }).click()
    await expect(page.getByRole('heading', { name: /^Practice Multiplayer$/i })).toHaveText('PRACTICE COMBAT')
    await expect(page.getByRole('combobox', { name: /^Match type$/i })).toHaveValue('unranked')
    await expect(page.getByRole('spinbutton', { name: /^Length$/i })).toHaveValue('5')
    await expect(page.getByRole('combobox', { name: /^Time per side$/i })).toHaveValue('')
    await expect(page.getByRole('checkbox', { name: /^Hard Mode Off$/i })).not.toBeChecked()
    await expect(page.getByRole('button', { name: /^Sign in required$/i })).toBeDisabled()

    await page.getByRole('tab', { name: /^Daily Multiplayer$/i }).click()
    await expect(page.getByRole('heading', { name: /^Daily Multiplayer$/i })).toHaveText('DAILY COMBAT')
    await expect(page.getByText(/asynchronous, five-letter, UTC-day keyed, and clock-free/i)).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: /^Length$/i })).toHaveCount(0)
    await expect(page.getByRole('combobox', { name: /^Time per side$/i })).toHaveCount(0)
    await expect(page.getByRole('checkbox', { name: /Hard Mode/i })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: /^Live$/i })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  for (const width of [320, 390, 768, 960, 1360, 1440, 1920]) {
    test(`contains the COMBAT overview at ${width}px without page-level horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ height: width <= 390 ? 844 : 1024, width })
      await openCombatOverview(page)
      await expectNoHorizontalOverflow(page)

      const grid = page.locator('.combat-command-grid')
      const columns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns)
      if (width >= 1360) {
        expect(columns.split(' ').length).toBeGreaterThanOrEqual(2)
      } else {
        expect(columns.split(' ')).toHaveLength(1)
      }
    })
  }

  test('keeps COMBAT usable at 200 percent reflow with sound off, reduced motion, and no serious axe violations', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.setViewportSize({ height: 844, width: 320 })
    await openCombatOverview(page)
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })

    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('brrrdle:sound-effects-enabled'))).toBe('false')
    await expect(page.locator('.combat-workspace')).toHaveCSS('animation-name', 'none')
    await expectNoHorizontalOverflow(page)

    const clippedControls = await page.locator('.combat-workspace button:visible, .combat-workspace [role="tab"]:visible').evaluateAll((elements) => {
      const viewportWidth = document.documentElement.clientWidth
      return elements.flatMap((element) => {
        const bounds = element.getBoundingClientRect()
        const label = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? element.tagName
        return bounds.left < -1 || bounds.right > viewportWidth + 1
          ? [{ label, left: bounds.left, right: bounds.right, viewportWidth }]
          : []
      })
    })
    expect(clippedControls).toEqual([])

    const accessibility = await new AxeBuilder({ page }).analyze()
    expect(accessibility.violations.filter((violation) => (
      violation.impact === 'serious' || violation.impact === 'critical'
    ))).toEqual([])
    await expectNoConsoleFailures(consoleFailures)
  })

  test('captures the deterministic COMBAT overview evidence matrix', async ({ page }) => {
    test.skip(!evidenceDirectory, 'Set WAVE04_EVIDENCE_DIR only for the ignored formal review capture.')
    mkdirSync(evidenceDirectory!, { recursive: true })

    await page.setViewportSize({ height: 1024, width: 1440 })
    await openCombatOverview(page)
    await capture(page, 'AMORDLE-WAVE-04-COMBAT-HUB-DESKTOP-1440x1024.png')
    writeFileSync(
      path.join(evidenceDirectory!, 'AMORDLE-WAVE-04-COMBAT-HUB-MAIN-ARIA-SNAPSHOT.txt'),
      await page.getByRole('main').ariaSnapshot(),
      'utf8',
    )

    await page.setViewportSize({ height: 844, width: 390 })
    await openCombatOverview(page)
    await capture(page, 'AMORDLE-WAVE-04-COMBAT-HUB-MOBILE-390x844.png')

    await page.setViewportSize({ height: 720, width: 320 })
    await openCombatOverview(page)
    await capture(page, 'AMORDLE-WAVE-04-COMBAT-HUB-CONTAINMENT-320x720.png')

    await page.setViewportSize({ height: 1024, width: 768 })
    await openCombatOverview(page)
    await capture(page, 'AMORDLE-WAVE-04-COMBAT-HUB-TABLET-768x1024.png')
  })
})
