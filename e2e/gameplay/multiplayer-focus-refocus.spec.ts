import { expect, test, type Page } from '@playwright/test'
import { navigateToPracticeMultiplayer, openMultiplayerMatch, joinWaitingMultiplayerGame } from '../fixtures/gameActions'
import { waitForMultiplayerRowForUsers } from '../fixtures/supabaseAdmin'
import { createTwoClientSession } from '../fixtures/twoClientGame'

declare global {
  interface Window {
    __brrrdleMultiplayerFocusFlashEvents?: string[]
    __brrrdleMultiplayerFocusFlashObserver?: MutationObserver
  }
}

async function openMultiplayerOverview(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Multiplayer$/i }).click()
  await expect(page.locator('#multiplayer-workspace-title')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('tab', { name: /^Overview$/i }).click()
  await expect(page.getByRole('heading', { name: /^Active Multiplayer Games$/i })).toBeVisible()
  await expect(page.getByText(/^1 active/i).first()).toBeVisible({ timeout: 20_000 })
}

async function installFocusFlashRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__brrrdleMultiplayerFocusFlashEvents = []
    window.__brrrdleMultiplayerFocusFlashObserver?.disconnect()
    const record = () => {
      const bodyText = document.body.innerText
      if (bodyText.includes('No active multiplayer games.')) {
        window.__brrrdleMultiplayerFocusFlashEvents?.push('no-active-games-empty-state')
      }
      if (/\b0 active\b/i.test(bodyText)) {
        window.__brrrdleMultiplayerFocusFlashEvents?.push('zero-active-count')
      }
    }
    const observer = new MutationObserver(record)
    observer.observe(document.body, { childList: true, characterData: true, subtree: true })
    window.__brrrdleMultiplayerFocusFlashObserver = observer
  })
}

async function readFocusFlashEvents(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => window.__brrrdleMultiplayerFocusFlashEvents ?? [])
}

async function refocus(page: Page): Promise<void> {
  await page.bringToFront()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(1_000)
}

test.describe('Multiplayer focus/refocus stability @multiplayer @practice', () => {
  test('keeps active multiplayer rows visible when switching between signed-in browsers', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      await navigateToPracticeMultiplayer(session.host.page)
      await openMultiplayerMatch(session.host.page)
      const waitingRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'waiting',
        userIds: [session.host.user.id],
      })

      await navigateToPracticeMultiplayer(session.rival.page)
      await joinWaitingMultiplayerGame(session.rival.page, waitingRow.id)
      await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })

      await openMultiplayerOverview(session.host.page)
      await openMultiplayerOverview(session.rival.page)
      await installFocusFlashRecorder(session.host.page)
      await installFocusFlashRecorder(session.rival.page)

      await refocus(session.rival.page)
      await refocus(session.host.page)
      await refocus(session.rival.page)
      await refocus(session.host.page)

      expect(await readFocusFlashEvents(session.host.page)).toEqual([])
      expect(await readFocusFlashEvents(session.rival.page)).toEqual([])
    } finally {
      await session.cleanup()
    }
  })
})
