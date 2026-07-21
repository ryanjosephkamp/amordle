import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expectNoConsoleFailures, expectNoHorizontalOverflow, installConsoleGuards } from '../fixtures/assertions'

const evidenceDirectory = process.env.WAVE02_EVIDENCE_DIR

test.describe('Wave 02 global shell @layout @navigation', () => {
  test('exposes the accepted desktop rail, utilities, and typed destination behavior', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.setViewportSize({ height: 1024, width: 1440 })
    await page.goto('/')

    const rail = page.getByRole('navigation', { name: /^Primary destinations$/i })
    await expect(rail).toBeVisible()
    await expect(rail.getByRole('button')).toHaveCount(6)
    await expect(rail.locator('.brrrdle-shell-destination-label').allTextContents()).resolves.toEqual([
      'PLAY',
      'DAILY',
      'COMBAT',
      'CALENDAR',
      'STATS',
      'MORE',
    ])
    await expect(page.getByRole('navigation', { name: /^Mobile destinations$/i })).toBeHidden()
    await expect(page.getByRole('button', { name: /^Help$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Settings$/i })).toBeVisible()

    await rail.getByRole('button', { name: /^Daily$/i }).click()
    await expect(page.getByRole('heading', { level: 1, name: /^Daily$/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /^Daily Solo$/i })).toHaveAttribute('aria-selected', 'true')

    await rail.getByRole('button', { name: /^Combat$/i }).click()
    await expect(page.getByRole('heading', { level: 1, name: /^Combat$/i })).toBeVisible()
    await expect(page.locator('#multiplayer-workspace-title')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('uses a four-item mobile dock, leaves Home unclaimed, and navigates through More', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.setViewportSize({ height: 844, width: 390 })
    await page.goto('/')

    const dock = page.getByRole('navigation', { name: /^Mobile destinations$/i })
    await expect(dock).toBeVisible()
    await expect(page.getByRole('navigation', { name: /^Primary destinations$/i })).toBeHidden()
    await expect(dock.getByRole('button')).toHaveCount(4)
    await expect(dock.locator('.brrrdle-shell-destination-label').allTextContents()).resolves.toEqual([
      'PLAY',
      'DAILY',
      'COMBAT',
      'MORE',
    ])
    await expect(dock.locator('[aria-current]')).toHaveCount(0)

    const moreButton = dock.getByRole('button', { name: /^More$/i })
    await moreButton.click()
    const dialog = page.getByRole('dialog', { name: /^More destinations$/i })
    await expect(dialog).toBeVisible()
    await expect(dialog).toBeFocused()
    await expect(dialog.getByRole('button', { name: /^Calendar$/i })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^Definitions$/i })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^Admin$/i })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: /^Practice$/i })).toHaveCount(0)

    await dialog.getByRole('button', { name: /^History$/i }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: /^History$/i })).toBeVisible()
    await expect(moreButton).toHaveAttribute('aria-current', 'page')
    await expectNoHorizontalOverflow(page)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('keeps focus recovery visible while preserving the live route surface', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 })
    await page.goto('/')
    await page.getByRole('navigation', { name: /^Mobile destinations$/i }).getByRole('button', { name: /^Combat$/i }).click()
    const workspace = page.locator('#multiplayer-workspace-title')
    await expect(workspace).toBeVisible()
    await workspace.evaluate((element) => {
      element.dataset.wave02Identity = 'preserved'
    })

    await page.getByRole('button', { name: /^Enter focus mode$/i }).click()
    await expect(page.getByRole('button', { name: /^Exit focus mode and restore the full shell$/i })).toBeVisible()
    await expect(page.getByRole('navigation', { name: /^Mobile destinations$/i })).toBeHidden()
    await expect(workspace).toBeVisible()
    await expect(workspace).toHaveAttribute('data-wave02-identity', 'preserved')

    await page.getByRole('button', { name: /^Exit focus mode and restore the full shell$/i }).click()
    await expect(page.getByRole('navigation', { name: /^Mobile destinations$/i })).toBeVisible()
    await expect(workspace).toBeVisible()
    await expect(workspace).toHaveAttribute('data-wave02-identity', 'preserved')
  })

  test('keeps More dismissible with focus restoration and 200 percent narrow reflow', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 320 })
    await page.goto('/')
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })

    const moreButton = page.getByRole('navigation', { name: /^Mobile destinations$/i }).getByRole('button', { name: /^More$/i })
    await moreButton.click()
    const dialog = page.getByRole('dialog', { name: /^More destinations$/i })
    await expect(dialog).toBeFocused()
    const geometry = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return {
        clientWidth: element.clientWidth,
        left: bounds.left,
        right: bounds.right,
        scrollWidth: element.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1)
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(moreButton).toBeFocused()
    await expectNoHorizontalOverflow(page)
  })

  test('keeps thermal atmosphere static under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('.brrrdle-shell-atmosphere')).toHaveCSS('animation-name', 'none')
  })

  for (const width of [320, 768, 960, 1920]) {
    test(`keeps shell geometry contained at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ height: width === 320 ? 720 : 1024, width })
      await page.goto('/')

      const dock = page.getByRole('navigation', { name: /^Mobile destinations$/i })
      const rail = page.getByRole('navigation', { name: /^Primary destinations$/i })
      if (width < 960) {
        await expect(dock).toBeVisible()
        await expect(rail).toBeHidden()
        const targetSizes = await dock.getByRole('button').evaluateAll((buttons) => buttons.map((button) => {
          const bounds = button.getBoundingClientRect()
          return { height: bounds.height, width: bounds.width }
        }))
        expect(targetSizes.every((target) => target.height >= 44 && target.width >= 44)).toBe(true)
      } else {
        await expect(rail).toBeVisible()
        await expect(dock).toBeHidden()
        await expect(rail).toHaveCSS('width', '232px')
      }
      await expectNoHorizontalOverflow(page)
    })
  }

  test('has no serious axe violations in desktop and mobile shell states', async ({ page }) => {
    for (const viewport of [{ height: 844, width: 390 }, { height: 1024, width: 1440 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/')
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])
    }
  })

  test('captures deterministic internal review evidence', async ({ page }) => {
    test.skip(!evidenceDirectory, 'Set WAVE02_EVIDENCE_DIR only for the ignored formal review capture.')
    mkdirSync(evidenceDirectory!, { recursive: true })
    await page.clock.setFixedTime(new Date('2026-07-20T16:00:00.000Z'))
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
    })

    async function capture(filename: string, width: number, height: number) {
      await page.setViewportSize({ height, width })
      await page.goto('/')
      await page.addStyleTag({
        content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; } .brrrdle-sim-time { display: none !important; }',
      })
      await expectNoHorizontalOverflow(page)
      await page.screenshot({
        animations: 'disabled',
        path: path.join(evidenceDirectory!, filename),
      })
    }

    await capture('AMORDLE-WAVE-02-DESKTOP-1440x1024.png', 1440, 1024)
    writeFileSync(
      path.join(evidenceDirectory!, 'AMORDLE-WAVE-02-DESKTOP-MAIN-ARIA-SNAPSHOT.txt'),
      await page.getByRole('main').ariaSnapshot(),
      'utf8',
    )
    await capture('AMORDLE-WAVE-02-MOBILE-390x844.png', 390, 844)

    const moreButton = page.getByRole('navigation', { name: /^Mobile destinations$/i }).getByRole('button', { name: /^More$/i })
    await moreButton.click()
    await expect(page.getByRole('dialog', { name: /^More destinations$/i })).toBeFocused()
    await page.screenshot({
      animations: 'disabled',
      path: path.join(evidenceDirectory!, 'AMORDLE-WAVE-02-MOBILE-MORE-390x844.png'),
    })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /^Enter focus mode$/i }).click()
    await page.screenshot({
      animations: 'disabled',
      path: path.join(evidenceDirectory!, 'AMORDLE-WAVE-02-MOBILE-FOCUS-390x844.png'),
    })

    await capture('AMORDLE-WAVE-02-CONTAINMENT-320x720.png', 320, 720)
    await capture('AMORDLE-WAVE-02-TABLET-DOCK-768x1024.png', 768, 1024)
    await capture('AMORDLE-WAVE-02-BREAKPOINT-960x1024.png', 960, 1024)
    await capture('AMORDLE-WAVE-02-DESKTOP-WIDE-1920x1080.png', 1920, 1080)
  })
})
