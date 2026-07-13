import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createDefaultGuestProgress } from '../../src/account'
import { expectNoConsoleFailures, installConsoleGuards } from '../fixtures/assertions'
import { cleanupE2eRun } from '../fixtures/cleanup'
import { chooseSoloPracticeMode, navigateToSoloPractice } from '../fixtures/gameActions'
import {
  createAdminSupabaseClient,
  createAnonSupabaseClient,
  createAuthenticatedSupabaseClient,
} from '../fixtures/supabaseAdmin'
import { createE2eUser, createRunId, signInThroughUi, type E2eUser } from '../fixtures/testUsers'

interface EconomyRow {
  readonly applied: boolean
  readonly coins: number
  readonly operation_id: string
  readonly remove_incorrect_letters: number
  readonly reveal_one_letter: number
  readonly revision: number
}

const ECONOMY_RESULT_KEYS = [
  'applied',
  'coins',
  'operation_id',
  'remove_incorrect_letters',
  'reveal_one_letter',
  'revision',
]

function firstRow(data: unknown): EconomyRow {
  const row = (Array.isArray(data) ? data[0] : data) as EconomyRow | null
  expect(row).not.toBeNull()
  expect(Object.keys(row ?? {}).sort()).toEqual([...ECONOMY_RESULT_KEYS].sort())
  return row!
}

async function seedProgress(user: E2eUser, coins: number): Promise<void> {
  const admin = createAdminSupabaseClient()
  const progress = createDefaultGuestProgress()
  const { error } = await admin.from('progress_snapshots').upsert({
    progress: {
      ...progress,
      progression: {
        ...progress.progression,
        coins,
      },
    },
    updated_at: new Date().toISOString(),
    user_id: user.id,
  })
  if (error) throw new Error(`Unable to seed Phase 57 progress snapshot: ${error.message}`)
}

async function economyRpc(client: SupabaseClient, name: string, args: Record<string, unknown> = {}): Promise<EconomyRow> {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error(error.message)
  return firstRow(data)
}

async function waitForSignedInProgressHydration(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Settings$/i }).click()
  await expect(page.locator('#settings-title')).toBeVisible()
  await expect(page.getByText(/^Syncing signed-in progress with Supabase\.$/i)).toBeHidden({ timeout: 20_000 })
}

async function openMarketplace(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Market$/i }).click()
  await expect(page.locator('#marketplace-title')).toBeVisible({ timeout: 20_000 })
}

async function createSignedInPage(context: BrowserContext, user: E2eUser): Promise<{
  readonly consoleFailures: string[]
  readonly page: Page
}> {
  const page = await context.newPage()
  const consoleFailures = installConsoleGuards(page)
  await signInThroughUi(page, user)
  await waitForSignedInProgressHydration(page)
  return { consoleFailures, page }
}

async function expectNoPhase57Residue(userIds: readonly string[]): Promise<void> {
  const admin = createAdminSupabaseClient()
  for (const table of ['player_economy_state', 'player_economy_operations', 'progress_snapshots', 'game_history']) {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).in('user_id', [...userIds])
    if (error) throw new Error(`Unable to inspect Phase 57 cleanup residue for ${table}: ${error.message}`)
    expect(count).toBe(0)
  }
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('body *')]
    .map((element) => {
      const rect = element.getBoundingClientRect()
      return {
        className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
        id: element.id,
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        tag: element.tagName.toLocaleLowerCase('en-US'),
      }
    })
    .filter((entry) => entry.left < -1 || entry.right > window.innerWidth + 1)
    .slice(0, 10))
  expect(overflow).toEqual([])
}

test.describe.serial('Phase 57 signed-in economy authority @solo @practice', () => {
  test('enforces bootstrap, pricing, ranges, idempotency, concurrency, and privacy', async () => {
    const runId = createRunId()
    const users: E2eUser[] = []
    let cleaned = false
    try {
      const owner = await createE2eUser('phase57-authority-owner', runId)
      const other = await createE2eUser('phase57-authority-other', runId)
      users.push(owner, other)
      await Promise.all([seedProgress(owner, 100), seedProgress(other, 42)])

      const [ownerClient, otherClient] = await Promise.all([
        createAuthenticatedSupabaseClient(owner),
        createAuthenticatedSupabaseClient(other),
      ])
      const anon = createAnonSupabaseClient()

      expect(firstRow((await ownerClient.rpc('get_player_economy_state')).data)).toMatchObject({ coins: 100, revision: 0 })
      expect(firstRow((await otherClient.rpc('get_player_economy_state')).data)).toMatchObject({ coins: 42, revision: 0 })

      const { error: anonRpcError } = await anon.rpc('get_player_economy_state')
      expect(anonRpcError).not.toBeNull()
      const { error: directStateError } = await ownerClient.from('player_economy_state').select('*')
      const { error: directOperationsError } = await ownerClient.from('player_economy_operations').select('*')
      expect(directStateError).not.toBeNull()
      expect(directOperationsError).not.toBeNull()

      const revealPurchase = await economyRpc(ownerClient, 'purchase_solo_practice_consumable', {
        p_consumable_type: 'revealOneLetter',
        p_operation_id: `${runId}:purchase:reveal`,
      })
      expect(revealPurchase).toMatchObject({ applied: true, coins: 75, reveal_one_letter: 1, revision: 1 })
      const duplicatePurchase = await economyRpc(ownerClient, 'purchase_solo_practice_consumable', {
        p_consumable_type: 'revealOneLetter',
        p_operation_id: `${runId}:purchase:reveal`,
      })
      expect(duplicatePurchase).toMatchObject({ applied: false, coins: 75, reveal_one_letter: 1, revision: 1 })

      const distinctPurchases = await Promise.all([
        ownerClient.rpc('purchase_solo_practice_consumable', {
          p_consumable_type: 'removeIncorrectLetters',
          p_operation_id: `${runId}:purchase:remove:a`,
        }),
        ownerClient.rpc('purchase_solo_practice_consumable', {
          p_consumable_type: 'removeIncorrectLetters',
          p_operation_id: `${runId}:purchase:remove:b`,
        }),
      ])
      expect(distinctPurchases.filter((result) => result.error === null)).toHaveLength(1)
      expect(distinctPurchases.filter((result) => result.error !== null)).toHaveLength(1)
      expect(await economyRpc(ownerClient, 'get_player_economy_state')).toMatchObject({
        coins: 35,
        remove_incorrect_letters: 1,
        reveal_one_letter: 1,
        revision: 2,
      })

      const duplicateAwards = await Promise.all([
        ownerClient.rpc('credit_player_economy_coins', { p_amount: 50, p_operation_id: `${runId}:award:duplicate` }),
        ownerClient.rpc('credit_player_economy_coins', { p_amount: 50, p_operation_id: `${runId}:award:duplicate` }),
      ])
      expect(duplicateAwards.every((result) => result.error === null)).toBe(true)
      expect(duplicateAwards.map((result) => firstRow(result.data).applied).sort()).toEqual([false, true])
      expect(await economyRpc(ownerClient, 'get_player_economy_state')).toMatchObject({ coins: 85, revision: 3 })

      for (const amount of [0, 10_001]) {
        expect((await ownerClient.rpc('credit_player_economy_coins', { p_amount: amount, p_operation_id: `${runId}:invalid-award:${amount}` })).error).not.toBeNull()
        expect((await ownerClient.rpc('spend_player_economy_coins', { p_amount: amount, p_operation_id: `${runId}:invalid-spend:${amount}` })).error).not.toBeNull()
      }
      expect((await ownerClient.rpc('consume_solo_practice_consumable', {
        p_consumable_type: 'revealOneLetter',
        p_operation_id: `${runId}:consume:daily`,
        p_scope: 'daily',
      })).error).not.toBeNull()
      expect((await ownerClient.rpc('spend_player_economy_coins', {
        p_amount: 10_000,
        p_operation_id: `${runId}:spend:underflow`,
      })).error).not.toBeNull()

      expect(await economyRpc(ownerClient, 'consume_solo_practice_consumable', {
        p_consumable_type: 'revealOneLetter',
        p_operation_id: `${runId}:consume:practice`,
        p_scope: 'practice',
      })).toMatchObject({ applied: true, coins: 85, reveal_one_letter: 0, revision: 4 })
      expect((await ownerClient.rpc('consume_solo_practice_consumable', {
        p_consumable_type: 'revealOneLetter',
        p_operation_id: `${runId}:consume:underflow`,
        p_scope: 'practice',
      })).error).not.toBeNull()

      expect(await economyRpc(otherClient, 'get_player_economy_state')).toMatchObject({
        coins: 42,
        remove_incorrect_letters: 0,
        reveal_one_letter: 0,
        revision: 0,
      })

      await Promise.all([ownerClient.auth.signOut(), otherClient.auth.signOut(), anon.auth.signOut()])
      const userIds = users.map((user) => user.id)
      await cleanupE2eRun(users)
      cleaned = true
      await expectNoPhase57Residue(userIds)
    } finally {
      if (!cleaned) await cleanupE2eRun(users)
    }
  })

  test('hydrates purchases cross-browser and restores OG/GO puzzle effects without exposing Daily or Multiplayer controls', async ({ browser }) => {
    const runId = createRunId()
    const users: E2eUser[] = []
    const contexts: BrowserContext[] = []
    let cleaned = false
    try {
      const user = await createE2eUser('phase57-browser', runId)
      users.push(user)
      await seedProgress(user, 200)
      const bootstrapClient = await createAuthenticatedSupabaseClient(user)
      expect(await economyRpc(bootstrapClient, 'get_player_economy_state')).toMatchObject({ coins: 200, revision: 0 })
      await bootstrapClient.auth.signOut()

      const purchaseContext = await browser.newContext({ viewport: { height: 844, width: 390 } })
      contexts.push(purchaseContext)
      const purchase = await createSignedInPage(purchaseContext, user)
      await openMarketplace(purchase.page)
      await expect(purchase.page.getByText('200 coins available.')).toBeVisible()
      for (const expectedCoins of [175, 150]) {
        await purchase.page.getByRole('button', { name: /Buy for 25 coins/i }).click()
        await expect(purchase.page.getByText(`${expectedCoins} coins available.`)).toBeVisible()
      }
      for (const expectedCoins of [110, 70]) {
        await purchase.page.getByRole('button', { name: /Buy for 40 coins/i }).click()
        await expect(purchase.page.getByText(`${expectedCoins} coins available.`)).toBeVisible()
      }
      await expectNoHorizontalOverflow(purchase.page)
      await expectNoConsoleFailures(purchase.consoleFailures)

      const ogContext = await browser.newContext({ viewport: { height: 844, width: 390 } })
      contexts.push(ogContext)
      const og = await createSignedInPage(ogContext, user)
      await openMarketplace(og.page)
      await expect(og.page.getByText('70 coins available.')).toBeVisible()
      await expect(og.page.getByRole('heading', { name: 'Reveal One Letter' }).locator('..')).toContainText('Owned: 2')
      await expect(og.page.getByRole('heading', { name: 'Remove Incorrect Letters' }).locator('..')).toContainText('Owned: 2')
      await navigateToSoloPractice(og.page)
      await chooseSoloPracticeMode(og.page, 'og')
      const ogGame = og.page.getByRole('region', { name: /Practice og puzzle/i })
      await ogGame.getByRole('button', { name: /Reveal letter \(2\)/i }).click()
      const ogRevealText = ogGame.getByText(/^Revealed:/i)
      await expect(ogRevealText).toBeVisible()
      const ogRevealMatch = (await ogRevealText.textContent())?.match(/(\d+):\s*([A-Z])/i)
      expect(ogRevealMatch).toBeTruthy()
      await expect(ogGame.getByRole('gridcell', { name: new RegExp(`^Row 1, tile ${ogRevealMatch![1]}, ${ogRevealMatch![2]}$`, 'i') })).toHaveAttribute('data-state', 'correct')
      await ogGame.getByRole('button', { name: /Remove incorrect letters \(2\)/i }).click()
      await expect(ogGame.getByText(/^Removed 5 incorrect keyboard letters\.$/i)).toBeVisible()
      const ogRemovedLabels = await ogGame.locator('section[aria-label="Keyboard"] button[aria-label^="Enter "]:disabled').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
      expect(ogRemovedLabels).toHaveLength(5)

      const restoreOgContext = await browser.newContext({ viewport: { height: 844, width: 390 } })
      contexts.push(restoreOgContext)
      const restoreOg = await createSignedInPage(restoreOgContext, user)
      await navigateToSoloPractice(restoreOg.page)
      await chooseSoloPracticeMode(restoreOg.page, 'og')
      const restoredOgGame = restoreOg.page.getByRole('region', { name: /Practice og puzzle/i })
      await expect(restoredOgGame.getByText(/^Revealed:/i)).toBeVisible({ timeout: 20_000 })
      for (const label of ogRemovedLabels) await expect(restoredOgGame.getByRole('button', { name: label! })).toBeDisabled()

      await chooseSoloPracticeMode(restoreOg.page, 'go')
      const goGame = restoreOg.page.getByRole('region', { name: /Practice go chain/i })
      await goGame.getByRole('button', { name: /Reveal letter \(1\)/i }).click()
      await expect(goGame.getByText(/^Revealed:/i)).toBeVisible()
      await goGame.getByRole('button', { name: /Remove incorrect letters \(1\)/i }).click()
      await expect(goGame.getByText(/^Removed 5 incorrect keyboard letters\.$/i)).toBeVisible()
      const goRemovedLabels = await goGame.locator('section[aria-label="Keyboard"] button[aria-label^="Enter "]:disabled').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
      expect(goRemovedLabels).toHaveLength(5)

      const restoreGoContext = await browser.newContext({ viewport: { height: 844, width: 390 } })
      contexts.push(restoreGoContext)
      const restoreGo = await createSignedInPage(restoreGoContext, user)
      await navigateToSoloPractice(restoreGo.page)
      await chooseSoloPracticeMode(restoreGo.page, 'go')
      const restoredGoGame = restoreGo.page.getByRole('region', { name: /Practice go chain/i })
      await expect(restoredGoGame.getByText(/^Revealed:/i)).toBeVisible({ timeout: 20_000 })
      for (const label of goRemovedLabels) await expect(restoredGoGame.getByRole('button', { name: label! })).toBeDisabled()

      await restoreGo.page.getByRole('tab', { name: /^Daily Solo$/i }).click()
      await expect(restoreGo.page.getByText('Solo Practice tools')).toHaveCount(0)
      await restoreGo.page.getByRole('button', { name: /^Multiplayer$/i }).click()
      await expect(restoreGo.page.getByText('Solo Practice tools')).toHaveCount(0)

      for (const item of [og, restoreOg, restoreGo]) await expectNoConsoleFailures(item.consoleFailures)
      await Promise.all(contexts.map((context) => context.close()))
      contexts.length = 0
      const userIds = users.map((entry) => entry.id)
      await cleanupE2eRun(users)
      cleaned = true
      await expectNoPhase57Residue(userIds)
    } finally {
      await Promise.all(contexts.map((context) => context.close().catch(() => undefined)))
      if (!cleaned) await cleanupE2eRun(users)
    }
  })
})
