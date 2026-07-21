import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createPracticeGoSetup } from '../../src/game/go/session'
import { createPracticeOgSetup } from '../../src/game/og/session'
import {
  expectNoConsoleFailures,
  expectNoHorizontalOverflow,
  installConsoleGuards,
} from '../fixtures/assertions'
import {
  chooseSoloPracticeMode,
  submitSoloGuessWithKeyboard,
} from '../fixtures/gameActions'
import { navigateToSoloPractice } from './soloTestNavigation'

const evidenceDirectory = process.env.WAVE03_EVIDENCE_DIR

async function installDeterministicLocalState(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('2026-07-20T16:00:00.000Z'))
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.localStorage.setItem('brrrdle:sound-effects-enabled', 'false')
  })
}

async function openSoloOverview(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /^PLAY$/i }).click()
  await expect(page.locator('#solo-workspace-title')).toBeVisible()
  await expect(page.getByRole('tab', { name: /^Overview$/i })).toHaveAttribute('aria-selected', 'true')
}

async function openPracticeGame(page: Page, mode: 'go' | 'og'): Promise<void> {
  await page.goto('/')
  await navigateToSoloPractice(page)
  await chooseSoloPracticeMode(page, mode)
  await expect(page.getByRole('region', {
    name: mode === 'go' ? /Practice go chain/i : /Practice og puzzle/i,
  })).toBeVisible()
}

async function setPracticeLength(page: Page, length: number): Promise<void> {
  await page.getByRole('combobox', { name: /^Practice length$/i }).selectOption(String(length))
  await expect(page.locator('[data-solo-board-viewport="true"]')).toHaveAttribute('data-word-length', String(length), {
    timeout: 20_000,
  })
}

async function solvePracticeGoChain(page: Page): Promise<void> {
  const answers = createPracticeGoSetup(5, 0).puzzles.map((puzzle) => puzzle.answer)
  for (const [index, answer] of answers.entries()) {
    await submitSoloGuessWithKeyboard(page, /Practice go chain/i, answer)
    if (index < answers.length - 1) {
      await expect(page.getByText(new RegExp(`Puzzle ${index + 2} of ${answers.length}`, 'i')).first()).toBeVisible({
        timeout: 20_000,
      })
    }
  }
  await expect(page.getByRole('region', { name: /^GO result$/i })).toBeVisible({ timeout: 20_000 })
}

async function addCaptureStyles(page: Page): Promise<void> {
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; } .brrrdle-sim-time { display: none !important; }',
  })
}

async function capture(page: Page, filename: string): Promise<void> {
  await addCaptureStyles(page)
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: path.join(evidenceDirectory ?? '', filename),
  })
}

test.describe('Wave 03 Solo vertical slice @solo @wave03', () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicLocalState(page)
  })

  test('uses format-first OG and GO gates without changing source-authorized destinations', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.setViewportSize({ height: 1024, width: 1440 })
    await openSoloOverview(page)

    await expect(page.getByText(/^OG · ONE BOARD$/i)).toBeVisible()
    await expect(page.getByText(/^GO · LINKED CHAIN$/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Daily OG$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Practice OG$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Daily GO$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Practice GO$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Calendar$/i }).last()).toBeVisible()
    await expect(page.getByRole('button', { name: /^Solo History$/i })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('keeps one mounted Practice GO session through regular and Focus presentation', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 })
    await openPracticeGame(page, 'go')

    const game = page.getByRole('region', { name: /Practice go chain/i })
    await game.evaluate((element) => {
      element.dataset.wave03SessionIdentity = 'preserved'
    })
    await expect(game.locator('.brrrdle-go-chain-spine')).toBeVisible()
    await expect(game.locator('.brrrdle-solo-tools-disclosure')).toBeVisible()
    await expect(game.locator('.brrrdle-solo-setup-controls')).toBeVisible()

    await page.getByRole('button', { name: /^Enter focus mode$/i }).click()
    await expect(page.getByRole('button', { name: /^Exit focus mode and restore the full shell$/i })).toBeVisible()
    await expect(page.getByRole('navigation', { name: /^Mobile destinations$/i })).toBeHidden()
    await expect(game).toHaveAttribute('data-wave03-session-identity', 'preserved')
    await expect(game.locator('.brrrdle-solo-setup-controls')).toBeHidden()
    await expect(game.locator('.brrrdle-go-chain-spine')).toBeVisible()
    await expect(game.locator('.brrrdle-solo-tools-disclosure')).toBeVisible()

    await page.getByRole('button', { name: /^Exit focus mode and restore the full shell$/i }).click()
    await expect(page.getByRole('navigation', { name: /^Mobile destinations$/i })).toBeVisible()
    await expect(game).toHaveAttribute('data-wave03-session-identity', 'preserved')
  })

  test('uses one local board viewport with a 32px tile floor for 2L, 3L, 5L, 8L, and 35L', async ({ page }) => {
    await page.setViewportSize({ height: 844, width: 390 })
    await openPracticeGame(page, 'og')

    for (const length of [2, 3, 5, 8, 35]) {
      await setPracticeLength(page, length)
      const viewport = page.locator('[data-solo-board-viewport="true"]')
      const board = viewport.getByRole('grid', { name: /^Guess grid$/i })
      await expect(viewport).toHaveCount(1)
      await expect(board.getByRole('row')).toHaveCount(6)
      await expect(board.getByRole('gridcell')).toHaveCount(length * 6)
      const geometry = await viewport.evaluate((element) => {
        const tiles = Array.from(element.querySelectorAll<HTMLElement>('[role="gridcell"]'))
        return {
          clientWidth: element.clientWidth,
          minTileWidth: Math.min(...tiles.map((tile) => tile.getBoundingClientRect().width)),
          overflowX: getComputedStyle(element).overflowX,
          scrollWidth: element.scrollWidth,
        }
      })
      expect(geometry.minTileWidth).toBeGreaterThanOrEqual(32)
      expect(geometry.overflowX).toBe('auto')
      if (length === 35) {
        expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth)
      }
      await expectNoHorizontalOverflow(page)
    }
  })

  test('keeps Solo operable with sound off, reduced motion, narrow reflow, and no serious axe violations', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.setViewportSize({ height: 844, width: 320 })
    await openPracticeGame(page, 'og')
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })

    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('brrrdle:sound-effects-enabled'))).toBe('false')
    await page.getByRole('button', { name: /^Enter A$/i }).click()
    await expect(page.getByRole('gridcell', { name: /^Row 1, tile 1, A$/i })).toBeVisible()
    const animationDurationMs = await page.locator('.brrrdle-solo-board-tile[data-state="current"]').first().evaluate((element) => {
      const duration = getComputedStyle(element).animationDuration
      return duration.endsWith('ms')
        ? Number.parseFloat(duration)
        : Number.parseFloat(duration) * 1_000
    })
    expect(animationDurationMs).toBeLessThanOrEqual(0.001)
    await expectNoHorizontalOverflow(page)

    const clippedControls = await page.locator([
      '.brrrdle-lunar-topbar button:visible',
      '.brrrdle-solo-gameplay button:visible',
      '.brrrdle-solo-gameplay select:visible',
      '.brrrdle-solo-gameplay summary:visible',
    ].join(', ')).evaluateAll((elements) => {
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

  test('hands a solved OG session to a verdict-first result without an inactive board or keyboard', async ({ page }) => {
    await page.setViewportSize({ height: 1024, width: 1440 })
    await openPracticeGame(page, 'og')

    const answer = createPracticeOgSetup(5, 0).answer
    await submitSoloGuessWithKeyboard(page, /Practice og puzzle/i, answer)
    const result = page.getByRole('region', { name: /^OG result$/i })
    await expect(result).toBeVisible({ timeout: 20_000 })
    await expect(result.getByRole('heading', { level: 3, name: /^PUZZLE SOLVED$/i })).toBeVisible()
    await expect(result).toContainText(answer.toLocaleUpperCase('en-US'))
    await expect(page.getByRole('grid', { name: /^Guess grid$/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Submit guess$/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^New practice puzzle$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Solo history$/i })).toBeVisible()
  })

  test('captures the deterministic Wave 03 review matrix', async ({ page }) => {
    test.skip(!evidenceDirectory, 'Set WAVE03_EVIDENCE_DIR only for the ignored formal review capture.')
    mkdirSync(evidenceDirectory!, { recursive: true })

    await page.setViewportSize({ height: 1024, width: 1440 })
    await openSoloOverview(page)
    await capture(page, 'AMORDLE-WAVE-03-SOLO-OVERVIEW-DESKTOP-1440x1024.png')
    writeFileSync(
      path.join(evidenceDirectory!, 'AMORDLE-WAVE-03-SOLO-OVERVIEW-MAIN-ARIA-SNAPSHOT.txt'),
      await page.getByRole('main').ariaSnapshot(),
      'utf8',
    )

    await page.setViewportSize({ height: 844, width: 390 })
    await openSoloOverview(page)
    await capture(page, 'AMORDLE-WAVE-03-SOLO-OVERVIEW-MOBILE-390x844.png')

    for (const viewport of [
      { height: 1024, label: 'DESKTOP-1440x1024', width: 1440 },
      { height: 844, label: 'MOBILE-390x844', width: 390 },
    ]) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width })
      await openPracticeGame(page, 'go')
      await capture(page, `AMORDLE-WAVE-03-PRACTICE-GO-REGULAR-${viewport.label}.png`)
      await page.getByRole('button', { name: /^Enter focus mode$/i }).click()
      await capture(page, `AMORDLE-WAVE-03-PRACTICE-GO-FOCUS-${viewport.label}.png`)
    }

    await page.setViewportSize({ height: 844, width: 390 })
    await openPracticeGame(page, 'og')
    for (const length of [2, 3, 8, 35]) {
      await setPracticeLength(page, length)
      await capture(page, `AMORDLE-WAVE-03-PRACTICE-OG-${length}L-MOBILE-390x844.png`)
    }

    await page.setViewportSize({ height: 1024, width: 1440 })
    await openSoloOverview(page)
    await page.getByRole('button', { name: /^Daily OG$/i }).click()
    await expect(page.getByRole('region', { name: /Daily og puzzle/i })).toBeVisible()
    await capture(page, 'AMORDLE-WAVE-03-DAILY-OG-5L-DESKTOP-1440x1024.png')

    await openPracticeGame(page, 'go')
    await solvePracticeGoChain(page)
    await capture(page, 'AMORDLE-WAVE-03-GO-RESULT-DESKTOP-1440x1024.png')

    await page.setViewportSize({ height: 844, width: 390 })
    await capture(page, 'AMORDLE-WAVE-03-GO-RESULT-MOBILE-390x844.png')

    await page.setViewportSize({ height: 1024, width: 768 })
    await openPracticeGame(page, 'go')
    await capture(page, 'AMORDLE-WAVE-03-PRACTICE-GO-TABLET-768x1024.png')

    await page.setViewportSize({ height: 720, width: 320 })
    await openPracticeGame(page, 'og')
    await capture(page, 'AMORDLE-WAVE-03-PRACTICE-OG-NARROW-320x720.png')
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await capture(page, 'AMORDLE-WAVE-03-PRACTICE-OG-REFLOW-320x720.png')

    const accessibility = await new AxeBuilder({ page }).analyze()
    writeFileSync(
      path.join(evidenceDirectory!, 'AMORDLE-WAVE-03-AXE-SUMMARY.json'),
      `${JSON.stringify({
        seriousOrCritical: accessibility.violations.filter((violation) => (
          violation.impact === 'serious' || violation.impact === 'critical'
        )).map((violation) => violation.id),
        violationCount: accessibility.violations.length,
      }, null, 2)}\n`,
      'utf8',
    )
  })
})
