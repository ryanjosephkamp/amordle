import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

const NAVIGATION_STORAGE_KEY = 'brrrdle:navigation:v2'
const BROWSER_NAVIGATION_HISTORY_KEY = '__brrrdleNavigation'

export async function navigateToSoloPractice(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Solo$/i }).click()
  await expect(page.locator('#solo-workspace-title')).toBeVisible()
  await page.getByRole('tab', { name: /^Practice Solo$/i }).click()
  await expect(page.getByRole('group', { name: /^Practice Solo mode$/i })).toBeVisible()
}

export async function chooseSoloPracticeMode(page: Page, mode: 'go' | 'og'): Promise<void> {
  const modeGroup = page.getByRole('group', { name: /^Practice Solo mode$/i })
  await modeGroup.getByRole('button', { name: new RegExp(`^${mode.toLocaleUpperCase('en-US')}$`, 'i') }).click()
}

export async function navigateToPracticeMultiplayer(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Multiplayer$/i }).click()
  await expect(page.locator('#multiplayer-workspace-title')).toBeVisible()
  await page.getByRole('tab', { name: /^Practice Multiplayer$/i }).click()
  await expect(page.getByRole('heading', { level: 3, name: /^Practice Multiplayer$/i })).toBeVisible()
}

export async function navigateToDailyMultiplayer(page: Page): Promise<void> {
  await ensureMultiplayerWorkspace(page)
  await page.getByRole('tab', { name: /^Daily Multiplayer$/i }).click()
  await expect(page.getByRole('heading', { level: 3, name: /^Daily Multiplayer$/i })).toBeVisible()
}

async function ensureMultiplayerWorkspace(page: Page): Promise<void> {
  if (await page.locator('#multiplayer-workspace-title').isVisible({ timeout: 1_000 }).catch(() => false)) {
    return
  }
  await page.getByRole('button', { name: /^Multiplayer$/i }).click()
  await expect(page.locator('#multiplayer-workspace-title')).toBeVisible({ timeout: 20_000 })
}

export async function navigateToCalendar(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Calendar$/i }).click()
  await expect(page.getByRole('heading', { level: 1, name: /^Calendar$/i })).toBeVisible()
}

export async function navigateToLeaderboard(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Leaderboard$/i }).click()
  await expect(page.locator('#leaderboard-title')).toBeVisible()
}

export async function chooseMultiplayerMode(page: Page, mode: 'go' | 'og', scope: 'daily' | 'practice' = 'practice'): Promise<void> {
  const panel = page.getByTestId(`multiplayer-panel-${scope}`)
  await expect(panel).toBeVisible()
  const modeSelect = panel.locator('select').first()
  await expect(modeSelect).toBeVisible()
  await modeSelect.selectOption(mode)
  await expect(modeSelect).toHaveValue(mode)
}

export async function setPracticeMultiplayerTimeLimit(page: Page, valueMs: string): Promise<void> {
  const panel = page.getByTestId('multiplayer-panel-practice')
  await expect(panel).toBeVisible()
  const timeLimitSelect = panel.locator('select').nth(2)
  await expect(timeLimitSelect).toBeVisible()
  await timeLimitSelect.selectOption(valueMs)
  await expect(timeLimitSelect).toHaveValue(valueMs)
}

export async function setPracticeMultiplayerWordLength(page: Page, wordLength: number): Promise<void> {
  const panel = page.getByTestId('multiplayer-panel-practice')
  await expect(panel).toBeVisible()
  const lengthInput = panel.getByLabel(/^Length$/i)
  await expect(lengthInput).toBeVisible()
  await lengthInput.fill(String(wordLength))
  await expect(lengthInput).toHaveValue(String(wordLength))
}

export async function setPracticeMultiplayerMatchType(page: Page, matchType: 'custom' | 'ranked' | 'unranked'): Promise<void> {
  const panel = page.getByTestId('multiplayer-panel-practice')
  const matchTypeSelect = panel.locator('select').nth(1)
  await expect(matchTypeSelect).toBeVisible()
  await matchTypeSelect.selectOption(matchType)
  await expect(matchTypeSelect).toHaveValue(matchType)
}

export async function setDailyMultiplayerMatchType(page: Page, matchType: 'ranked' | 'unranked'): Promise<void> {
  const panel = page.getByTestId('multiplayer-panel-daily')
  const matchTypeSelect = panel.locator('select').nth(1)
  await expect(matchTypeSelect).toBeVisible()
  await matchTypeSelect.selectOption(matchType)
  await expect(matchTypeSelect).toHaveValue(matchType)
}

export async function enterRankedPracticeQueue(
  page: Page,
  { expectQueuedStatus = true }: { readonly expectQueuedStatus?: boolean } = {},
): Promise<void> {
  await navigateToPracticeMultiplayer(page)
  await setPracticeMultiplayerMatchType(page, 'ranked')
  await page.getByRole('button', { name: /^Enter ranked queue$/i }).click()
  if (expectQueuedStatus) {
    await expect(page.getByTestId('ranked-queue-status')).toContainText(/Waiting for a compatible signed-in rival|Ranked queue request created/i)
  }
}

export async function cancelRankedPracticeQueue(page: Page): Promise<void> {
  const rankedStatus = page.getByTestId('ranked-queue-status')
  await rankedStatus.getByRole('button', { name: /^Cancel ranked queue$/i }).click()
  await expect(rankedStatus).toContainText(/Ranked queue request cancelled\./i)
}

export async function openMultiplayerMatch(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Open multiplayer match$/i }).click()
  await expect.poll(async () => {
    const statusMessage = await page.getByTestId('multiplayer-status-message').textContent().catch(() => '')
    const selectedStatus = await page.getByTestId('multiplayer-selected-game').getAttribute('data-status').catch(() => '')
    return `${statusMessage ?? ''} ${selectedStatus ?? ''}`
  }, { timeout: 30_000 }).toMatch(/Multiplayer match opened|Ranked multiplayer match opened|Custom multiplayer lobby|waiting/i)
}

type MultiplayerRenderedStatus = 'cancelled' | 'expired' | 'lost' | 'playing' | 'waiting' | 'won'

interface SelectMultiplayerGameOptions {
  readonly reloadOnStaleStatus?: boolean
  readonly status?: MultiplayerRenderedStatus | RegExp
  readonly timeoutMs?: number
}

interface JoinWaitingMultiplayerGameOptions {
  readonly via?: 'lobby' | 'selected'
}

async function expectSelectedMultiplayerGame(page: Page, gameId: string, options: SelectMultiplayerGameOptions = {}): Promise<void> {
  const timeout = options.timeoutMs ?? 30_000
  const selectedGame = page.getByTestId('multiplayer-selected-game')
  await expect(selectedGame).toHaveAttribute('data-game-id', gameId, { timeout })
  if (options.status) {
    await expect(selectedGame).toHaveAttribute('data-status', options.status, { timeout })
  }
}

async function expandCollapsedMultiplayerGameTab(page: Page, panelTab: Locator): Promise<void> {
  const collapsedDetails = page.locator('details').filter({ has: panelTab }).first()
  if (await collapsedDetails.count() === 0) {
    return
  }

  const isOpen = await collapsedDetails.evaluate((node) => (node as HTMLDetailsElement).open)
  if (!isOpen) {
    await collapsedDetails.locator('summary').click()
  }
}

export async function selectMultiplayerGame(page: Page, gameId: string, options: SelectMultiplayerGameOptions = {}): Promise<void> {
  await ensureMultiplayerWorkspace(page)
  const selectedGame = page.getByTestId('multiplayer-selected-game')
  const selectedLookupTimeout = 5_000
  if (await selectedGame.getAttribute('data-game-id', { timeout: selectedLookupTimeout }).catch(() => null) === gameId) {
    try {
      await expectSelectedMultiplayerGame(page, gameId, options)
      return
    } catch (error) {
      if (!options.status || !options.reloadOnStaleStatus) {
        throw error
      }
      await page.reload({ waitUntil: 'domcontentloaded' })
      await ensureMultiplayerWorkspace(page)
      try {
        await expectSelectedMultiplayerGame(page, gameId, { ...options, timeoutMs: 5_000 })
        return
      } catch {
        // The selected game did not hydrate after the refresh, so fall back to
        // the tab/lobby/active-game selectors below.
      }
    }
  }
  const panelTab = page.getByTestId(`multiplayer-game-tab-${gameId}`)
  try {
    await expandCollapsedMultiplayerGameTab(page, panelTab)
    await panelTab.click({ timeout: 5_000 })
  } catch {
    try {
      await expectSelectedMultiplayerGame(page, gameId, { ...options, timeoutMs: 5_000 })
      return
    } catch {
      // The selected surface is not yet usable; continue through the tab fallbacks.
    }
    const lobbyTab = page.getByRole('tab', { name: /^Lobby$/i })
    await lobbyTab.click()
    const lobbyAction = page.getByTestId(`multiplayer-lobby-action-${gameId}`)
    try {
      await lobbyAction.click({ timeout: 10_000 })
    } catch {
      try {
        await expectSelectedMultiplayerGame(page, gameId, { ...options, timeoutMs: 5_000 })
        return
      } catch {
        // Try the Active Games resume control as the last explicit selector.
      }
      await page.getByRole('tab', { name: /^Active Games$/i }).click()
      await page.getByTestId(`multiplayer-active-resume-${gameId}`).click({ timeout: 10_000 })
    }
  }
  await expectSelectedMultiplayerGame(page, gameId, options)
}

export async function joinMultiplayerMatch(page: Page): Promise<void> {
  const joinButton = page.getByRole('button', { name: /^Join multiplayer match$/i }).first()
  if (await joinButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await joinButton.click()
  }
  await expect(page.getByText(/Joined multiplayer match|Waiting for the next player|Your turn|Rival joined/i)).toBeVisible()
}

export async function joinWaitingMultiplayerGame(page: Page, gameId: string, options: JoinWaitingMultiplayerGameOptions = {}): Promise<void> {
  if (options.via === 'selected') {
    const findJoinButton = () => page.getByRole('button', { name: /^Join multiplayer match$/i }).first()
    const reopenSelectedLobby = async () => {
      await ensureMultiplayerWorkspace(page)
      await page.getByRole('tab', { name: /^Lobby$/i }).click()
      await page.getByTestId(`multiplayer-lobby-action-${gameId}`).click({ timeout: 20_000 })
    }
    let joinButton = findJoinButton()
    if (!await joinButton.isVisible({ timeout: 20_000 }).catch(() => false)) {
      await reopenSelectedLobby()
      joinButton = findJoinButton()
      if (!await joinButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await reopenSelectedLobby()
        joinButton = findJoinButton()
      }
      await expect(joinButton).toBeVisible({ timeout: 20_000 })
    }
    await joinButton.click({ timeout: 20_000 })
    try {
      await expectSelectedMultiplayerGame(page, gameId, { status: 'playing' })
    } catch {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectSelectedMultiplayerGame(page, gameId, { status: 'playing' })
    }
    return
  }

  const lobbyTab = page.getByRole('tab', { name: /^Lobby$/i })
  await expect(lobbyTab).toBeVisible({ timeout: 20_000 })
  await lobbyTab.click()
  const lobbyAction = page.getByTestId(`multiplayer-lobby-action-${gameId}`)
  try {
    await expect(lobbyAction).toBeVisible({ timeout: 30_000 })
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(lobbyTab).toBeVisible({ timeout: 20_000 })
    await lobbyTab.click()
    await expect(lobbyAction).toBeVisible({ timeout: 30_000 })
  }
  await lobbyAction.click({ timeout: 20_000 })
  await expect(page.getByText(/Joined multiplayer match|Waiting for the next player|Your turn|Rival joined/i)).toBeVisible()
  await expectSelectedMultiplayerGame(page, gameId, { status: 'playing' })
}

export async function submitGuessWithKeyboard(page: Page, guess: string): Promise<void> {
  const game = page.getByTestId('multiplayer-selected-game')
  for (const letter of guess.toLocaleUpperCase('en-US')) {
    await game.getByRole('button', { name: new RegExp(`^Enter ${letter}$`, 'i') }).click()
  }
  await game.getByRole('button', { name: /^Submit guess$/i }).click()
}

export async function submitSoloGuessWithKeyboard(page: Page, regionName: RegExp, guess: string): Promise<void> {
  const game = page.getByRole('region', { name: regionName })
  for (const letter of guess.toLocaleUpperCase('en-US')) {
    await game.getByRole('button', { name: new RegExp(`^Enter ${letter}$`, 'i') }).click()
  }
  await game.getByRole('button', { name: /^Submit guess$/i }).click()
}

export async function waitForTurn(page: Page): Promise<void> {
  await expect(page.getByText(/^Your turn$/i)).toBeVisible({ timeout: 20_000 })
}

export async function launchDailyMultiplayer(page: Page): Promise<void> {
  await navigateToCalendar(page)
  await page.getByRole('button', { name: /^Daily Multiplayer$/i }).click()
  await expect(page.getByRole('heading', { name: /^Daily Multiplayer$/i })).toBeVisible()
}

export async function openPublicProfileRoute(page: Page, publicProfileId: string): Promise<void> {
  await page.evaluate(({ historyKey, key, profileId }) => {
    const navigation = {
      activeRouteId: 'public-profile',
      historyFilters: {
        mode: 'all',
        player: 'all',
        scope: 'all',
      },
      legacyPracticeMode: 'og',
      multiplayerSubtab: 'overview',
      selectedPublicProfileId: profileId,
      soloSubtab: 'overview',
    }
    window.localStorage.setItem(key, JSON.stringify(navigation))
    window.history.replaceState({
      [historyKey]: {
        version: 1,
        viewState: {
          navigation,
        },
      },
    }, '', window.location.href)
    window.location.assign('/')
  }, {
    historyKey: BROWSER_NAVIGATION_HISTORY_KEY,
    key: NAVIGATION_STORAGE_KEY,
    profileId: publicProfileId,
  })
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('heading', { name: /^Player profile$/i })).toBeVisible({ timeout: 30_000 })
}
