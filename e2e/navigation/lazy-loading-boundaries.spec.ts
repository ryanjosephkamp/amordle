import { expect, test } from '@playwright/test'
import { expectNoConsoleFailures, installConsoleGuards } from '../fixtures/assertions'

const settingsModuleRequest = /\/(?:src\/account\/Settings\.tsx|assets\/Settings-[^/]+\.js)(?:\?.*)?$/

test.describe('deeper functional-shell loading boundaries @navigation @performance', () => {
  test.use({ serviceWorkers: 'block' })

  test('keeps Home answer-free and loads only the selected Solo word length', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))

    await page.goto('/')
    await expect(page.locator('#dashboard-home-title')).toBeVisible()
    expect(requests.some((url) => /words_length_|word-list-/.test(url))).toBe(false)
    expect(requests.some((url) => /SoloWorkspace/.test(url))).toBe(false)

    const navigation = page.getByRole('navigation', { name: /^Awordle destinations$/i })
    await navigation.getByRole('button', { name: /^Solo$/i }).click()
    await expect(page.locator('#solo-workspace-title')).toBeVisible()
    expect(requests.some((url) => /SoloWorkspace/.test(url))).toBe(true)
    expect(requests.some((url) => /words_length_|word-list-/.test(url))).toBe(false)

    await page.getByRole('tab', { name: /^Daily Solo$/i }).click()
    await expect(page.getByRole('grid', { name: /guess grid/i })).toBeVisible()
    const wordRequests = requests.filter((url) => /words_length_|word-list-/.test(url))
    expect(wordRequests.length).toBeGreaterThanOrEqual(1)
    expect(wordRequests.every((url) => /(?:words_length_|word-list-)5/.test(url))).toBe(true)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('shows a retryable route error without replacing the shell or main landmark', async ({ page }) => {
    await page.route(settingsModuleRequest, (route) => route.abort())
    await page.goto('/')

    const navigation = page.getByRole('navigation', { name: /^Awordle destinations$/i })
    await navigation.getByRole('button', { name: /^Settings$/i }).click()
    await expect(page.getByRole('heading', { name: /^Settings could not load$/i })).toBeVisible()
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(navigation).toBeVisible()

    await page.unroute(settingsModuleRequest)
    await page.getByRole('button', { name: /^Retry$/i }).click()
    await expect(page.locator('#dashboard-home-title')).toBeVisible()
    await expect(page.getByRole('main')).toHaveCount(1)
  })
})
