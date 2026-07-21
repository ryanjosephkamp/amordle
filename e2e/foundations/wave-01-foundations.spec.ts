import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const HARNESS_ROUTE = '/.codex-internal/design/evidence/wave-01-foundations/harness/'
const evidenceDirectory = process.env.WAVE01_EVIDENCE_DIR

async function installLocalNetworkGuard(page: Page): Promise<string[]> {
  const externalRequests: string[] = []
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.hostname === '127.0.0.1' || requestUrl.hostname === 'localhost') {
      await route.continue()
      return
    }
    externalRequests.push(route.request().url())
    await route.abort()
  })
  return externalRequests
}

async function openHarnessDialog(page: Page) {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto(HARNESS_ROUTE)
  const opener = page.getByRole('button', { name: 'Open foundation dialog' })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Foundation dialog' })
  await expect(dialog).toBeVisible()
  return { dialog, opener }
}

test.describe('Wave 01 deterministic foundations @foundations', () => {
  test.use({
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  })

  test('Dialog establishes focus containment, background isolation, Escape, and focus restoration', async ({ page }) => {
    const externalRequests = await installLocalNetworkGuard(page)
    const { dialog, opener } = await openHarnessDialog(page)
    const initialField = page.getByLabel('Foundation label')
    const closeButton = page.getByRole('button', { name: 'Close dialog' })
    const applyButton = page.getByRole('button', { name: 'Apply sanitized state' })

    await expect(initialField).toBeFocused()
    await expect(page.locator('#root')).toHaveAttribute('inert', '')
    await expect(page.locator('#root')).toHaveAttribute('aria-hidden', 'true')

    await closeButton.focus()
    await page.keyboard.press('Shift+Tab')
    await expect(applyButton).toBeFocused()

    await applyButton.focus()
    await page.keyboard.press('Tab')
    await expect(closeButton).toBeFocused()

    await initialField.focus()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
    await expect(page.locator('#root')).not.toHaveAttribute('inert', '')
    await expect(externalRequests).toEqual([])
  })

  test('Dialog preserves nested scrolling and 200 percent narrow reflow without background scroll', async ({ page }) => {
    const externalRequests = await installLocalNetworkGuard(page)
    await page.setViewportSize({ height: 760, width: 320 })
    await page.goto(HARNESS_ROUTE)
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await page.getByRole('button', { name: 'Open foundation dialog' }).click()

    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
    const dialog = page.getByRole('dialog', { name: 'Foundation dialog' })
    const geometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        clientWidth: element.clientWidth,
        left: rect.left,
        right: rect.right,
        scrollWidth: element.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }
    })
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1)
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1)
    expect(await page.evaluate(() => document.scrollingElement?.scrollLeft ?? 0)).toBeLessThanOrEqual(1)

    const nestedScroll = page.getByTestId('nested-scroll')
    const nestedResult = await nestedScroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        scrollTop: element.scrollTop,
      }
    })
    expect(nestedResult.scrollHeight).toBeGreaterThan(nestedResult.clientHeight)
    expect(nestedResult.scrollTop).toBeGreaterThan(0)
    expect(externalRequests).toEqual([])
  })

  test('harness has a stable accessible structure, no axe violations, and reduced functional motion', async ({ page }) => {
    const externalRequests = await installLocalNetworkGuard(page)
    const { dialog } = await openHarnessDialog(page)

    await expect(dialog).toMatchAriaSnapshot(`
      - dialog "Foundation dialog":
        - heading "Foundation dialog" [level=2]
        - paragraph: A service-free modal fixture for keyboard, focus, reflow, and accessibility evidence.
        - button "Close dialog": ×
        - text: Foundation label
        - textbox "Foundation label": SANITIZED
        - paragraph: Deterministic long-content specimen
        - code: /SANITIZED-FIXTURE-CONTENT-/
        - paragraph: Sanitized evidence row 1
        - paragraph: Sanitized evidence row 2
        - paragraph: Sanitized evidence row 3
        - paragraph: Sanitized evidence row 4
        - paragraph: Sanitized evidence row 5
        - paragraph: Sanitized evidence row 6
        - paragraph: Sanitized evidence row 7
        - paragraph: Sanitized evidence row 8
        - paragraph: Sanitized evidence row 9
        - paragraph: Sanitized evidence row 10
        - paragraph: Sanitized evidence row 11
        - paragraph: Sanitized evidence row 12
        - paragraph: Sanitized evidence row 13
        - paragraph: Sanitized evidence row 14
        - paragraph: Sanitized evidence row 15
        - paragraph: Sanitized evidence row 16
        - paragraph: Sanitized evidence row 17
        - paragraph: Sanitized evidence row 18
        - button "Apply sanitized state"
    `)

    const accessibilityScan = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze()
    expect(accessibilityScan.violations).toEqual([])

    const reducedMotion = await page.evaluate(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    )
    const transitionDurationMs = await page.getByTestId('motion-sample').evaluate((element) => {
      const duration = getComputedStyle(element).transitionDuration
      return duration.endsWith('ms')
        ? Number.parseFloat(duration)
        : Number.parseFloat(duration) * 1_000
    })
    expect(reducedMotion).toBe(true)
    expect(transitionDurationMs).toBeLessThanOrEqual(1)
    expect(externalRequests).toEqual([])
  })

  test('captures the canonical deterministic desktop and mobile evidence', async ({ page }) => {
    test.skip(!evidenceDirectory, 'WAVE01_EVIDENCE_DIR is required only for canonical evidence capture.')
    const externalRequests = await installLocalNetworkGuard(page)

    for (const viewport of [
      { fileName: 'AMORDLE-WAVE-01-FOUNDATIONS-DESKTOP-1440x1024.png', height: 1024, width: 1440 },
      { fileName: 'AMORDLE-WAVE-01-FOUNDATIONS-MOBILE-390x844.png', height: 844, width: 390 },
    ]) {
      await page.setViewportSize({ height: viewport.height, width: viewport.width })
      await page.goto(HARNESS_ROUTE)
      await page.getByRole('button', { name: 'Open foundation dialog' }).click()
      await page.screenshot({
        animations: 'disabled',
        path: path.join(evidenceDirectory ?? '', viewport.fileName),
      })
    }

    expect(externalRequests).toEqual([])
  })
})
