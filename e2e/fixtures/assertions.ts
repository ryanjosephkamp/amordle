import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import rawLength5 from '../../src/latest/words_length_5.json' with { type: 'json' }
import {
  prepareBundledWordList,
  setWordListImporterForTests,
} from '../../src/data/loadWordList.js'

// Browser E2E helpers also exercise synchronous domain setup in the worker.
// Prepare the canonical five-letter payload once per worker before those helpers run.
setWordListImporterForTests(async (length) => length === 5 ? rawLength5 : undefined)
const e2eWordList = await prepareBundledWordList('practice', 5)
if (!e2eWordList.ok) {
  throw new Error(`Unable to prepare the E2E word-list fixture: ${e2eWordList.reason}`)
}

export interface ScrollDiagnostics {
  readonly clientHeight: number
  readonly clientWidth: number
  readonly costlyLayerCounts: {
    readonly backdrop: number
    readonly fixed: number
    readonly shadow: number
    readonly sticky: number
  }
  readonly maxScrollY: number
  readonly routeTitle: string
  readonly scrollHeight: number
  readonly scrollLoopElapsedMs: number
  readonly scrollLoopSteps: readonly number[]
  readonly scrollWidth: number
}

export function installConsoleGuards(page: Page): string[] {
  const failures: string[] = []
  const isBenignExternalBrowserWarning = (text: string): boolean => /Cookie .*__cf_bm.*rejected.*invalid domain/u.test(text)
    && /supabase\.co\/realtime\/v1\/websocket/u.test(text)
  const isBenignDefinitionLookupFailure = (text: string): boolean => (
    /\/api\/definition/u.test(text)
      || /api\.dictionaryapi\.dev\/api\/v2\/entries/u.test(text)
      || /en\.wiktionary\.org\/api\/rest_v1\/page\/definition/u.test(text)
  ) && (
    /Failed to load resource: the server responded with a status of 404/u.test(text)
      || /access control checks/u.test(text)
  )
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location()
      const detail = `${message.text()}${location.url ? ` (${location.url})` : ''}`
      if (isBenignExternalBrowserWarning(detail)) {
        return
      }
      if (isBenignDefinitionLookupFailure(`${message.text()} ${location.url}`)) {
        return
      }
      failures.push(detail)
    }
  })
  page.on('pageerror', (error) => {
    if (isBenignExternalBrowserWarning(error.message)) {
      return
    }
    if (isBenignDefinitionLookupFailure(error.message)) {
      return
    }
    failures.push(error.message)
  })
  return failures
}

export async function expectNoConsoleFailures(failures: readonly string[]): Promise<void> {
  expect(failures, failures.join('\n')).toEqual([])
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
  expect(overflow).toBe(false)
}

export async function collectScrollDiagnostics(page: Page): Promise<ScrollDiagnostics> {
  return page.evaluate(async () => {
    const scrollingElement = document.scrollingElement ?? document.documentElement
    const routeTitle = document.querySelector('#active-route-title')?.textContent?.trim() ?? document.title
    const maxScrollY = Math.max(0, scrollingElement.scrollHeight - window.innerHeight)
    window.scrollTo({ behavior: 'auto', top: 0 })
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

    const steps: number[] = []
    const targets = [0.25, 0.5, 0.75, 1].map((fraction) => Math.round(maxScrollY * fraction))
    const startedAt = window.performance.now()
    for (const target of targets) {
      window.scrollTo({ behavior: 'auto', top: target })
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
      steps.push(Math.round(window.scrollY))
    }
    const elapsed = Math.round(window.performance.now() - startedAt)

    const visibleElements = Array.from(document.querySelectorAll('*')).filter((element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
    })
    const costlyLayerCounts = visibleElements.reduce<ScrollDiagnostics['costlyLayerCounts']>((counts, element) => {
      const style = window.getComputedStyle(element)
      const webkitStyle = style as CSSStyleDeclaration & { readonly webkitBackdropFilter?: string }
      if (style.position === 'fixed') {
        counts.fixed += 1
      }
      if (style.position === 'sticky') {
        counts.sticky += 1
      }
      if (
        (style.backdropFilter && style.backdropFilter !== 'none')
        || (webkitStyle.webkitBackdropFilter && webkitStyle.webkitBackdropFilter !== 'none')
      ) {
        counts.backdrop += 1
      }
      if (style.boxShadow && style.boxShadow !== 'none') {
        counts.shadow += 1
      }
      return counts
    }, {
      backdrop: 0,
      fixed: 0,
      shadow: 0,
      sticky: 0,
    })

    window.scrollTo({ behavior: 'auto', top: 0 })
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))

    return {
      clientHeight: window.innerHeight,
      clientWidth: document.documentElement.clientWidth,
      costlyLayerCounts,
      maxScrollY,
      routeTitle,
      scrollHeight: scrollingElement.scrollHeight,
      scrollLoopElapsedMs: elapsed,
      scrollLoopSteps: steps,
      scrollWidth: document.documentElement.scrollWidth,
    }
  })
}

export async function expectPageCanScrollVertically(page: Page, minScrollableDistance = 120): Promise<ScrollDiagnostics> {
  const diagnostics = await collectScrollDiagnostics(page)
  expect(diagnostics.maxScrollY, `${diagnostics.routeTitle} should have enough vertical scroll distance for the mobile smoke`).toBeGreaterThanOrEqual(minScrollableDistance)
  return diagnostics
}

export async function expectPageCanScrollToEnd(page: Page): Promise<void> {
  const reached = await page.evaluate(async () => {
    const scrollingElement = document.scrollingElement ?? document.documentElement
    const initialMaxScrollY = Math.max(0, scrollingElement.scrollHeight - window.innerHeight)
    window.scrollTo({ behavior: 'auto', top: initialMaxScrollY })
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    const maxScrollY = Math.max(0, scrollingElement.scrollHeight - window.innerHeight)
    if (Math.abs(window.scrollY - maxScrollY) > 2) {
      window.scrollTo({ behavior: 'auto', top: maxScrollY })
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    }
    const settledMaxScrollY = Math.max(0, scrollingElement.scrollHeight - window.innerHeight)
    const bottomReached = Math.abs(window.scrollY - settledMaxScrollY) <= 2
    window.scrollTo({ behavior: 'auto', top: 0 })
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    return {
      bottomReached,
      maxScrollY: settledMaxScrollY,
      topReached: window.scrollY <= 2,
    }
  })
  expect(reached.bottomReached, `Page should scroll to bottom near ${reached.maxScrollY}px`).toBe(true)
  expect(reached.topReached).toBe(true)
}

export async function expectLocatorCenterNotCovered(locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded()
  await expect(locator).toBeVisible()
  const coverage = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2))
    const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2))
    const topElement = document.elementFromPoint(x, y)
    return {
      covered: Boolean(topElement && topElement !== element && !element.contains(topElement)),
      topElementTagName: topElement?.tagName ?? 'none',
    }
  })
  expect(coverage.covered, `Element center should not be covered by ${coverage.topElementTagName}`).toBe(false)
}

export async function expectKeyboardState(page: Page, letter: string, state: 'absent' | 'correct' | 'present' | 'unknown'): Promise<void> {
  const multiplayerGame = page.getByTestId('multiplayer-selected-game')
  const root = await multiplayerGame.count() > 0 ? multiplayerGame : page
  const key = root.getByRole('button', { name: new RegExp(`^Enter ${letter}$`, 'i') })
  await expect(key).toBeVisible()
  await expect(key).toHaveAttribute('data-state', state)
}

export async function expectVisibleStatus(page: Page, text: RegExp | string): Promise<void> {
  await expect(page.getByText(text)).toBeVisible()
}
