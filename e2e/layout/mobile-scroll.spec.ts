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
import { chooseSoloPracticeMode } from '../fixtures/gameActions'
import { createE2eUser, deleteE2eUser, signInThroughUi, type E2eUser } from '../fixtures/testUsers'

const MOBILE_VIEWPORT = { height: 844, width: 390 } as const

interface MobileRouteTarget {
  readonly label: string
  readonly navigationName?: RegExp
  readonly source?: 'dock' | 'more'
  readonly title: RegExp
}

const MOBILE_SCROLL_TARGETS: readonly MobileRouteTarget[] = [
  { label: 'Home', title: /^Home$/i },
  { label: 'Play', navigationName: /^PLAY$/i, source: 'dock', title: /^PLAY$/i },
  { label: 'Daily', navigationName: /^DAILY$/i, source: 'dock', title: /^DAILY$/i },
  { label: 'Calendar', navigationName: /^Calendar$/i, source: 'more', title: /^Calendar$/i },
  { label: 'Combat', navigationName: /^COMBAT$/i, source: 'dock', title: /^COMBAT$/i },
  { label: 'History', navigationName: /^History$/i, source: 'more', title: /^History$/i },
  { label: 'Stats', navigationName: /^Stats$/i, source: 'more', title: /^Stats$/i },
  { label: 'Leaderboard', navigationName: /^Leaderboard$/i, source: 'more', title: /^Leaderboard$/i },
  { label: 'Word Explorer', navigationName: /^Word Explorer$/i, source: 'more', title: /^Word Explorer$/i },
  { label: 'Profile', navigationName: /^Profile$/i, source: 'more', title: /^Profile$/i },
  { label: 'Settings', navigationName: /^Settings$/i, source: 'more', title: /^Settings$/i },
  { label: 'About amordle', navigationName: /^About amordle$/i, source: 'more', title: /^About amordle$/i },
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

async function navigateToSoloPracticeWave02(page: Page): Promise<void> {
  await page.getByRole('navigation', { name: /^Mobile destinations$/i }).getByRole('button', { name: /^PLAY$/i }).click()
  await expect(page.locator('#solo-workspace-title')).toBeVisible()
  await page.getByRole('tab', { name: /^Practice Solo$/i }).click()
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

      const mobileDock = page.getByRole('navigation', { name: /^Mobile destinations$/i })
      if (route.navigationName && route.source === 'dock') {
        await expect(mobileDock).toBeVisible()
        await mobileDock.getByRole('button', { name: route.navigationName }).click()
      } else if (route.navigationName && route.source === 'more') {
        await mobileDock.getByRole('button', { name: /^MORE$/i }).click()
        await page.getByRole('dialog', { name: /^More destinations$/i }).getByRole('button', { name: route.navigationName }).click()
      }

      const routeTitle = page.getByRole('heading', { level: 1, name: route.title })
      await expect(routeTitle).toBeVisible()
      await expectNoHorizontalOverflow(page)

      const diagnostics = await expectPageCanScrollVertically(page, 0)
      console.log(`mobile-scroll-diagnostics ${route.label}: ${JSON.stringify(diagnostics)}`)
      await expectPageCanScrollToEnd(page)

      await expectLocatorCenterNotCovered(routeTitle)
      if (route.navigationName) {
        const visibleDockButtonName = route.source === 'more' ? /^MORE$/i : route.navigationName
        await expectLocatorCenterNotCovered(mobileDock.getByRole('button', { name: visibleDockButtonName }))
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
    await navigateToSoloPracticeWave02(page)
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
    await page.getByRole('navigation', { name: /^Mobile destinations$/i }).getByRole('button', { name: /^PLAY$/i }).click()
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
    await navigateToSoloPracticeWave02(page)
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
