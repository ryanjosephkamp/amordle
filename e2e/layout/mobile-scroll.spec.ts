import { expect, test, type Page } from '@playwright/test'
import { createPracticeOgSetup } from '../../src/game'
import {
  collectScrollDiagnostics,
  expectLocatorCenterNotCovered,
  expectNoConsoleFailures,
  expectNoHorizontalOverflow,
  expectPageCanScrollToEnd,
  expectPageCanScrollVertically,
  installConsoleGuards,
} from '../fixtures/assertions'
import { chooseSoloPracticeMode, navigateToSoloPractice } from '../fixtures/gameActions'
import { createE2eUser, deleteE2eUser, signInThroughUi, type E2eUser } from '../fixtures/testUsers'

const MOBILE_VIEWPORT = { height: 844, width: 390 } as const

interface MobileRouteTarget {
  readonly label: string
  readonly navigationName?: RegExp
  readonly title: RegExp
}

const MOBILE_SCROLL_TARGETS: readonly MobileRouteTarget[] = [
  { label: 'Home', title: /^Home$/i },
  { label: 'Solo', navigationName: /^Solo$/i, title: /^Solo$/i },
  { label: 'Calendar', navigationName: /^Calendar$/i, title: /^Calendar$/i },
  { label: 'Multiplayer', navigationName: /^Multiplayer$/i, title: /^Multiplayer$/i },
  { label: 'History', navigationName: /^History$/i, title: /^History$/i },
  { label: 'Stats', navigationName: /^Stats$/i, title: /^Stats$/i },
  { label: 'Leaderboard', navigationName: /^Leaderboard$/i, title: /^Leaderboard$/i },
  { label: 'Word Explorer', navigationName: /^Words$/i, title: /^Word Explorer$/i },
  { label: 'Profile', navigationName: /^Profile$/i, title: /^Profile$/i },
  { label: 'Settings', navigationName: /^Settings$/i, title: /^Settings$/i },
  { label: 'About amordle', navigationName: /^About$/i, title: /^About amordle$/i },
]

function getWrongPracticeOgGuess(): string {
  const setup = createPracticeOgSetup(5, 0)
  const guess = [...setup.validGuesses].find((candidate) => candidate !== setup.answer)
  if (!guess) {
    throw new Error('Practice OG fixture did not include a wrong valid guess.')
  }
  return guess
}

async function installScrollIntoViewCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as Window & {
      __brrrdleOriginalScrollIntoView?: Element['scrollIntoView']
      __brrrdleScrollIntoViewCalls?: number
    }
    if (!win.__brrrdleOriginalScrollIntoView) {
      win.__brrrdleOriginalScrollIntoView = Element.prototype.scrollIntoView
      Element.prototype.scrollIntoView = function scrollIntoViewCounter(...args: Parameters<Element['scrollIntoView']>) {
        win.__brrrdleScrollIntoViewCalls = (win.__brrrdleScrollIntoViewCalls ?? 0) + 1
        return win.__brrrdleOriginalScrollIntoView!.apply(this, args)
      }
    }
    win.__brrrdleScrollIntoViewCalls = 0
  })
}

async function expectNoAppScrollIntoView(page: Page): Promise<void> {
  await page.waitForTimeout(120)
  const calls = await page.evaluate(() => (window as Window & { __brrrdleScrollIntoViewCalls?: number }).__brrrdleScrollIntoViewCalls ?? 0)
  expect(calls, 'ordinary Solo navigation should not call scrollIntoView').toBe(0)
}

test('progression HUD opens the existing Stats route @layout', async ({ page }) => {
  const consoleFailures = installConsoleGuards(page)
  await page.goto('/')

  await page.getByRole('button', { name: /^Open Stats for progression details$/i }).click()

  await expect(page.getByRole('heading', { level: 1, name: /^Stats$/i })).toBeVisible()
  await expect(page.getByText(/Stats separates private Solo gameplay/i)).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: /^Multiplayer performance summary$/i })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectNoConsoleFailures(consoleFailures)
})

test.describe('mobile scroll and layout regression harness @layout', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: MOBILE_VIEWPORT })

  for (const route of MOBILE_SCROLL_TARGETS) {
    test(`${route.label} remains scrollable without overflow or overlay occlusion`, async ({ page }) => {
      const consoleFailures = installConsoleGuards(page)
      await page.goto('/')

      if (route.navigationName) {
        const routeRail = page.getByRole('navigation', { name: /^amordle destinations$/i })
        await expect(routeRail).toBeVisible()
        await routeRail.getByRole('button', { name: route.navigationName }).click()
      }

      const routeTitle = page.getByRole('heading', { level: 1, name: route.title })
      await expect(routeTitle).toBeVisible()
      await expectNoHorizontalOverflow(page)

      const diagnostics = await expectPageCanScrollVertically(page)
      console.log(`mobile-scroll-diagnostics ${route.label}: ${JSON.stringify(diagnostics)}`)
      await expectPageCanScrollToEnd(page)

      await expectLocatorCenterNotCovered(routeTitle)
      if (route.navigationName) {
        const routeRail = page.getByRole('navigation', { name: /^amordle destinations$/i })
        await expectLocatorCenterNotCovered(routeRail.getByRole('button', { name: route.navigationName }))
      }

      const finalDiagnostics = await collectScrollDiagnostics(page)
      expect(finalDiagnostics.scrollWidth).toBeLessThanOrEqual(finalDiagnostics.clientWidth + 1)
      await expectNoConsoleFailures(consoleFailures)
    })
  }

  test('signed-in account menu stays inside the mobile viewport @layout', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    let user: E2eUser | undefined
    try {
      user = await createE2eUser('mobile-menu')
      await signInThroughUi(page, user)

      const accountButton = page.getByRole('button', { name: /open account menu for/i })
      await accountButton.click()

      const accountMenu = page.getByTestId('account-menu')
      await expect(accountMenu).toBeVisible()
      await expectNoHorizontalOverflow(page)

      const bounds = await accountMenu.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
          left: rect.left,
          right: rect.right,
          viewportWidth: window.innerWidth,
        }
      })
      expect(bounds.left, 'account menu should not clip beyond the left viewport edge').toBeGreaterThanOrEqual(0)
      expect(bounds.right, 'account menu should not clip beyond the right viewport edge').toBeLessThanOrEqual(bounds.viewportWidth + 1)
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await deleteE2eUser(user)
    }
  })

  test('ordinary Solo Practice OG navigation does not auto-scroll to the game surface', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')
    await installScrollIntoViewCounter(page)
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'og')

    const soloRegion = page.getByRole('region', { name: /Practice og puzzle/i })
    await expect(soloRegion.getByText(/6 attempts remaining/i)).toBeVisible()
    await expectNoAppScrollIntoView(page)
    await expectPageCanScrollToEnd(page)
    await expectNoHorizontalOverflow(page)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('ordinary Solo Daily GO navigation does not auto-scroll to the game surface', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')
    await installScrollIntoViewCounter(page)
    await page.getByRole('button', { name: /^Solo$/i }).click()
    await expect(page.locator('#solo-workspace-title')).toBeVisible()
    await page.getByRole('tab', { name: /^Daily Solo$/i }).click()
    const modeGroup = page.getByRole('group', { name: /^Daily Solo mode$/i })
    await modeGroup.getByRole('button', { name: /^GO$/i }).click()

    const soloRegion = page.getByRole('region', { name: /Daily go chain/i })
    await expect(soloRegion.getByText(/6 attempts remaining/i)).toBeVisible()
    await expectNoAppScrollIntoView(page)
    await expectPageCanScrollToEnd(page)
    await expectNoHorizontalOverflow(page)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('Solo Practice OG physical-keyboard submission does not auto-scroll the page', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'og')
    await installScrollIntoViewCounter(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    const soloRegion = page.getByRole('region', { name: /Practice og puzzle/i })
    await expect(soloRegion.getByText(/6 attempts remaining/i)).toBeVisible()
    await page.evaluate(() => new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
    }))
    await page.keyboard.type(getWrongPracticeOgGuess())
    await page.keyboard.press('Enter')

    await expect(soloRegion.getByText(/5 attempts remaining/i)).toBeVisible()
    await expectNoAppScrollIntoView(page)
    await expectNoHorizontalOverflow(page)
    await expectNoConsoleFailures(consoleFailures)
  })
})
