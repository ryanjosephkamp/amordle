import { expect, test, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { expectNoConsoleFailures } from '../fixtures/assertions'
import { navigateToPracticeMultiplayer } from '../fixtures/gameActions'
import {
  cleanupE2eRun,
} from '../fixtures/cleanup'
import {
  createAuthenticatedSupabaseClient,
  fetchPublicProfileIdForUser,
  upsertPublicProfileForUser,
} from '../fixtures/supabaseAdmin'
import { createThreeClientSession } from '../fixtures/threeClientGame'
import { createE2eUser, type E2eUser } from '../fixtures/testUsers'

const NAVIGATION_STORAGE_KEY = 'brrrdle:navigation:v2'
const BROWSER_NAVIGATION_HISTORY_KEY = '__brrrdleNavigation'

interface PrivateRequestRpcRow {
  readonly request_id?: string
  readonly request_status?: string
}

async function openPublicProfile(page: Page, publicProfileId: string): Promise<void> {
  await page.evaluate(({ historyKey, key, profileId }) => {
    const navigation = {
      activeRouteId: 'public-profile',
      historyFilters: { mode: 'all', player: 'all', scope: 'all' },
      legacyPracticeMode: 'og',
      multiplayerSubtab: 'overview',
      selectedPublicProfileId: profileId,
      soloSubtab: 'overview',
    }
    window.localStorage.setItem(key, JSON.stringify(navigation))
    window.history.replaceState({ [historyKey]: { version: 1, viewState: { navigation } } }, '', window.location.href)
    window.location.assign('/')
  }, { historyKey: BROWSER_NAVIGATION_HISTORY_KEY, key: NAVIGATION_STORAGE_KEY, profileId: publicProfileId })
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('heading', { name: /^Player profile$/i })).toBeVisible({ timeout: 30_000 })
}

async function createRequest(
  client: SupabaseClient,
  targetPublicProfileId: string,
  mode: 'go' | 'og',
  idempotencyKey: string,
  expiresAt: string | null = null,
): Promise<PrivateRequestRpcRow> {
  const { data, error } = await client.rpc('create_private_multiplayer_match_request_v2', {
    p_expires_at: expiresAt,
    p_go_puzzle_count: mode === 'go' ? 5 : null,
    p_hard_mode: false,
    p_idempotency_key: idempotencyKey,
    p_mode: mode,
    p_target_public_profile_id: targetPublicProfileId,
    p_time_limit_ms: null,
    p_word_length: 5,
  })
  if (error) throw new Error(error.message)
  const row = (Array.isArray(data) ? data[0] : data) as PrivateRequestRpcRow | null
  expect(row?.request_id).toEqual(expect.any(String))
  return row ?? {}
}

test.describe('Phase 56 private request center @multiplayer', () => {
  test('enforces directional lanes, privacy, preferences, blocks, lifecycle views, and mobile fit', async ({ browser }) => {
    const session = await createThreeClientSession(browser)
    let extraUser: E2eUser | undefined

    try {
      extraUser = await createE2eUser('extra', session.runId)
      await Promise.all([
        upsertPublicProfileForUser(session.host.user, 'cyan'),
        upsertPublicProfileForUser(session.rival.user, 'rose'),
        upsertPublicProfileForUser(session.third.user, 'violet'),
        upsertPublicProfileForUser(extraUser, 'amber'),
      ])
      const [hostProfileId, rivalProfileId, thirdProfileId, extraProfileId] = await Promise.all([
        fetchPublicProfileIdForUser(session.host.user),
        fetchPublicProfileIdForUser(session.rival.user),
        fetchPublicProfileIdForUser(session.third.user),
        fetchPublicProfileIdForUser(extraUser),
      ])
      const [hostClient, rivalClient, thirdClient] = await Promise.all([
        createAuthenticatedSupabaseClient(session.host.user),
        createAuthenticatedSupabaseClient(session.rival.user),
        createAuthenticatedSupabaseClient(session.third.user),
      ])

      const [duplicateA, duplicateB] = await Promise.all([
        createRequest(hostClient, rivalProfileId, 'og', `${session.runId}-duplicate-a`),
        createRequest(hostClient, rivalProfileId, 'og', `${session.runId}-duplicate-b`),
      ])
      expect(duplicateA.request_id).toBe(duplicateB.request_id)

      const goRequest = await createRequest(hostClient, rivalProfileId, 'go', `${session.runId}-go`)
      const reverseRequest = await createRequest(rivalClient, hostProfileId, 'og', `${session.runId}-reverse`)
      expect(new Set([duplicateA.request_id, goRequest.request_id, reverseRequest.request_id]).size).toBe(3)

      const { data: thirdVisible } = await thirdClient.rpc('get_private_multiplayer_match_requests', { p_limit: 100, p_status: null })
      expect(thirdVisible).toEqual([])
      const { error: privateTableError } = await thirdClient.from('multiplayer_private_request_blocks').select('*')
      expect(privateTableError).not.toBeNull()

      await navigateToPracticeMultiplayer(session.rival.page)
      const requestCenter = session.rival.page.getByTestId('private-match-requests')
      await expect(requestCenter).toContainText(session.host.user.displayName, { timeout: 30_000 })
      await requestCenter.getByRole('button', { name: /^Incoming$/i }).click()
      await expect(requestCenter.locator('article')).toHaveCount(2)
      await requestCenter.getByRole('button', { name: /^Outgoing$/i }).click()
      await expect(requestCenter).toContainText(session.host.user.displayName)
      await requestCenter.getByRole('button', { name: /^Cancel request$/i }).click()
      await expect(requestCenter.getByRole('status')).toContainText(/cancelled/i)
      await requestCenter.locator('select').selectOption('cancelled')
      await expect(requestCenter).toContainText(/cancelled/i)
      const { data: declinedData, error: declinedError } = await rivalClient.rpc('decline_private_multiplayer_match_request', {
        p_request_id: goRequest.request_id,
      })
      expect(declinedError).toBeNull()
      expect((Array.isArray(declinedData) ? declinedData[0] : declinedData) as PrivateRequestRpcRow).toMatchObject({ request_status: 'declined' })

      await session.rival.page.getByRole('button', { name: /^Settings$/i }).click()
      const lifecycleNotifications = session.rival.page.getByLabel(/^Show private Practice request notifications$/i)
      await lifecycleNotifications.uncheck()
      await expect(lifecycleNotifications).not.toBeChecked()
      await lifecycleNotifications.check()
      const allowRequests = session.rival.page.getByLabel(/^Allow new private Practice requests$/i)
      await allowRequests.click()
      await expect(session.rival.page.getByText(/Private request preference saved/i)).toBeVisible({ timeout: 30_000 })
      await expect(allowRequests).not.toBeChecked()

      const unavailable = await createRequest(thirdClient, rivalProfileId, 'og', `${session.runId}-optout`).catch((error: unknown) => error)
      expect(unavailable).toBeInstanceOf(Error)
      await allowRequests.click()
      await expect(session.rival.page.getByText(/Private request preference saved/i)).toBeVisible({ timeout: 30_000 })
      await expect(allowRequests).toBeChecked()

      await openPublicProfile(session.host.page, rivalProfileId)
      session.host.page.once('dialog', (dialog) => dialog.accept())
      await session.host.page.getByRole('button', { name: /^Block private requests$/i }).click()
      await expect(session.host.page.getByRole('button', { name: /^Unblock private requests$/i })).toBeVisible({ timeout: 30_000 })
      const blocked = await createRequest(rivalClient, hostProfileId, 'go', `${session.runId}-blocked`).catch((error: unknown) => error)
      expect(blocked).toBeInstanceOf(Error)
      await session.host.page.getByRole('button', { name: /^Unblock private requests$/i }).click()
      await expect(session.host.page.getByRole('button', { name: /^Block private requests$/i })).toBeVisible({ timeout: 30_000 })

      const expiring = await createRequest(
        thirdClient,
        hostProfileId,
        'go',
        `${session.runId}-expiry`,
        new Date(Date.now() + 1_000).toISOString(),
      )
      await session.third.page.waitForTimeout(1_200)
      const { data: expiredData, error: expiredError } = await thirdClient.rpc('get_private_multiplayer_match_requests', {
        p_limit: 100,
        p_status: 'expired',
      })
      expect(expiredError).toBeNull()
      expect((expiredData as readonly PrivateRequestRpcRow[]).some((row) => row.request_id === expiring.request_id && row.request_status === 'expired')).toBe(true)

      const activeRequests = await Promise.all([
        createRequest(hostClient, rivalProfileId, 'og', `${session.runId}-active-1`),
        createRequest(hostClient, rivalProfileId, 'go', `${session.runId}-active-2`),
        createRequest(hostClient, thirdProfileId, 'og', `${session.runId}-active-3`),
        createRequest(hostClient, thirdProfileId, 'go', `${session.runId}-active-4`),
        createRequest(hostClient, extraProfileId, 'og', `${session.runId}-active-5`),
      ])
      const activeLimitError = await createRequest(hostClient, extraProfileId, 'go', `${session.runId}-active-6`).catch((error: unknown) => error)
      expect(activeLimitError).toBeInstanceOf(Error)
      expect((activeLimitError as Error).message).toMatch(/Too many active outgoing private match requests/i)
      for (const request of activeRequests) {
        const { error } = await hostClient.rpc('cancel_private_multiplayer_match_request', { p_request_id: request.request_id })
        expect(error).toBeNull()
      }

      let recentLimitError: Error | undefined
      for (let index = 0; index < 25 && !recentLimitError; index += 1) {
        try {
          const request = await createRequest(hostClient, extraProfileId, 'og', `${session.runId}-recent-${index}`)
          const { error } = await hostClient.rpc('cancel_private_multiplayer_match_request', { p_request_id: request.request_id })
          expect(error).toBeNull()
        } catch (error) {
          recentLimitError = error as Error
        }
      }
      expect(recentLimitError?.message).toMatch(/Too many recent private match requests/i)

      await session.rival.page.setViewportSize({ height: 844, width: 390 })
      await navigateToPracticeMultiplayer(session.rival.page)
      expect(await session.rival.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
      await expectNoConsoleFailures(session.third.consoleFailures)
    } finally {
      await session.cleanup()
      if (extraUser) await cleanupE2eRun([extraUser])
    }
  })
})
