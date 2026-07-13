import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { expectNoConsoleFailures, installConsoleGuards } from '../fixtures/assertions'
import { getValidWrongGuess, projectionFromRow } from '../fixtures/answers'
import { cleanupE2eRun } from '../fixtures/cleanup'
import {
  joinWaitingMultiplayerGame,
  navigateToPracticeMultiplayer,
  openMultiplayerMatch,
  selectMultiplayerGame,
  submitGuessWithKeyboard,
  waitForTurn,
} from '../fixtures/gameActions'
import { upsertPublicProfileForUser, waitForMultiplayerRowForUsers } from '../fixtures/supabaseAdmin'
import { createE2eUser, createRunId, signInThroughUi, type E2eUser } from '../fixtures/testUsers'

interface BrowserSeat {
  readonly consoleFailures: readonly string[]
  readonly context: BrowserContext
  readonly page: Page
  readonly user: E2eUser
}

const LIVE_SMOKE_VIEWPORTS = [
  { height: 900, label: 'desktop', width: 1440 },
  { height: 1180, label: 'tablet', width: 820 },
  { height: 844, label: 'mobile', width: 390 },
] as const

async function createSignedInSeat(browser: Browser, label: string, runId: string): Promise<BrowserSeat> {
  const user = await createE2eUser(label, runId)
  const context = await browser.newContext()
  const page = await context.newPage()
  const consoleFailures = installConsoleGuards(page)
  await signInThroughUi(page, user)
  return {
    consoleFailures,
    context,
    page,
    user,
  }
}

async function expectParticipantLiveResume(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Multiplayer$/i }).click()
  await page.getByRole('tab', { name: /^Live$/i }).click()
  await expect(page.getByRole('button', { name: /^Resume live game$/i })).toBeVisible({ timeout: 30_000 })
}

async function expectParticipantPublicProfileAndReturn(page: Page, opponentDisplayName: string): Promise<void> {
  const profileButton = page.getByRole('button', { name: `Open public profile for ${opponentDisplayName}` })
  await expect(profileButton).toBeVisible({ timeout: 30_000 })
  await profileButton.click()
  await expect(page.getByRole('heading', { name: /^Player profile$/i })).toBeVisible()
  await expect(page.getByText(/^Public ranked multiplayer metadata$/i)).toBeVisible()
  await page.getByRole('button', { name: /^Back to Multiplayer$/i }).click()
  await expect(page.getByRole('tab', { name: /^Live$/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Resume live game$/i })).toBeVisible()
}

async function expectSpectatorLiveReadOnly(
  page: Page,
  submittedGuess: string,
  participantDisplayNames: readonly [string, string],
): Promise<void> {
  if (page.url() === 'about:blank') {
    await page.goto('/')
  }
  await page.getByRole('button', { name: /^Multiplayer$/i }).click()
  await page.getByRole('tab', { name: /^Live$/i }).click()
  const submittedGuessLabel = submittedGuess.toLocaleUpperCase('en-US')
  const liveGame = page
    .getByLabel(/^Practice Multiplayer OG$/i)
    .filter({ hasText: participantDisplayNames[0] })
    .filter({ hasText: participantDisplayNames[1] })
    .first()
  const spectateButton = liveGame.getByRole('button', { name: /^Spectate live game$/i })
  await expect(spectateButton).toBeVisible({ timeout: 30_000 })
  await spectateButton.click()
  await expect(page.getByText(/^Focused spectator view$/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Back to Live list$/i })).toBeVisible()
  await expect(page.getByText(/^Spectator view$/i)).toBeVisible()
  await expect(page.getByText(/^Read-only$/i).first()).toBeVisible()
  await expect(page.getByText(/Read-only spectator view/i)).toBeVisible()
  await expect(page.getByLabel(/submitted/i)).toContainText(submittedGuessLabel)
  await expect(page.getByRole('button', { name: /^Submit guess$/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Forfeit$/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Cancel game$/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Join multiplayer match$/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Open public profile/i })).toHaveCount(0)
  await page.getByRole('button', { name: /^Back to Live list$/i }).click()
  await expect(page.getByRole('tab', { name: /^Live$/i })).toBeVisible()
}

async function expectSpectatorTerminalReadOnly(
  page: Page,
  participantDisplayNames: readonly [string, string],
  expectedLabel: string,
): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /^Multiplayer$/i }).click()
  await page.getByRole('tab', { name: /^Live$/i }).click()
  const liveGame = page
    .getByLabel(/^Practice Multiplayer OG$/i)
    .filter({ hasText: participantDisplayNames[0] })
    .filter({ hasText: participantDisplayNames[1] })
    .filter({ hasText: expectedLabel })
    .first()

  await expect(liveGame.getByRole('button', { name: /^Spectate live game$/i })).toBeVisible({ timeout: 30_000 })
  await expect(liveGame).toContainText(expectedLabel)
  await expect(liveGame).toContainText(/Read-only/i)
  await expect(liveGame.getByRole('button')).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^Submit guess$/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Forfeit$/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Cancel Lobby$/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Join multiplayer match$/i })).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText(/@example\.test/i)
}

test.describe('Live v1 spectator @multiplayer', () => {
  test('lets authenticated and public nonparticipants spectate a live match read-only', async ({ browser }) => {
    const runId = createRunId()
    const seats: BrowserSeat[] = []
    const signedOutContext = await browser.newContext()
    const signedOutPage = await signedOutContext.newPage()
    const signedOutConsoleFailures = installConsoleGuards(signedOutPage)

    try {
      const host = await createSignedInSeat(browser, 'host', runId)
      const rival = await createSignedInSeat(browser, 'rival', runId)
      seats.push(host, rival)
      await Promise.all([
        upsertPublicProfileForUser(host.user, 'cyan'),
        upsertPublicProfileForUser(rival.user, 'rose'),
      ])

      await navigateToPracticeMultiplayer(host.page)
      await openMultiplayerMatch(host.page)
      const waitingRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'waiting',
        userIds: [host.user.id],
      })

      await navigateToPracticeMultiplayer(rival.page)
      await joinWaitingMultiplayerGame(rival.page, waitingRow.id)
      const playingRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [host.user.id, rival.user.id],
      })
      const game = projectionFromRow(playingRow)
      const wrongGuess = getValidWrongGuess(game)

      await selectMultiplayerGame(host.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      await waitForTurn(host.page)
      await submitGuessWithKeyboard(host.page, wrongGuess)
      await waitForTurn(rival.page)

      const spectator = await createSignedInSeat(browser, 'spectator', runId)
      seats.push(spectator)

      await expectParticipantLiveResume(host.page)
      await expectParticipantPublicProfileAndReturn(host.page, rival.user.displayName)

      for (const viewport of LIVE_SMOKE_VIEWPORTS) {
        await host.page.setViewportSize(viewport)
        await spectator.page.setViewportSize(viewport)
        await signedOutPage.setViewportSize(viewport)
        await expectParticipantLiveResume(host.page)
        await expectSpectatorLiveReadOnly(spectator.page, wrongGuess, [host.user.displayName, rival.user.displayName])
        await expectSpectatorLiveReadOnly(signedOutPage, wrongGuess, [host.user.displayName, rival.user.displayName])
      }

      await expectNoConsoleFailures(host.consoleFailures)
      await expectNoConsoleFailures(rival.consoleFailures)
      await expectNoConsoleFailures(spectator.consoleFailures)
      await expectNoConsoleFailures(signedOutConsoleFailures)
    } finally {
      await Promise.allSettled([
        ...seats.map((seat) => seat.context.close()),
        signedOutContext.close(),
      ])
      await cleanupE2eRun(seats.map((seat) => seat.user))
    }
  })

  test('shows privacy-safe cancellation and forfeit labels to authenticated and public spectators', async ({ browser }) => {
    test.setTimeout(180_000)
    const runId = createRunId()
    const seats: BrowserSeat[] = []
    const signedOutContext = await browser.newContext()
    const signedOutPage = await signedOutContext.newPage()
    const signedOutConsoleFailures = installConsoleGuards(signedOutPage)

    try {
      const host = await createSignedInSeat(browser, 'terminal-host', runId)
      const rival = await createSignedInSeat(browser, 'terminal-rival', runId)
      const spectator = await createSignedInSeat(browser, 'terminal-spectator', runId)
      seats.push(host, rival, spectator)
      await Promise.all([
        upsertPublicProfileForUser(host.user, 'cyan'),
        upsertPublicProfileForUser(rival.user, 'rose'),
      ])
      const participantDisplayNames = [host.user.displayName, rival.user.displayName] as const

      await navigateToPracticeMultiplayer(host.page)
      await openMultiplayerMatch(host.page)
      const waitingCancellation = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'waiting',
        userIds: [host.user.id],
      })
      await navigateToPracticeMultiplayer(rival.page)
      await joinWaitingMultiplayerGame(rival.page, waitingCancellation.id)
      const playingCancellation = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [host.user.id, rival.user.id],
      })
      await selectMultiplayerGame(host.page, playingCancellation.id, { status: 'playing' })
      await host.page.getByRole('button', { name: /^Forfeit$/i }).click()
      await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'cancelled',
        userIds: [host.user.id, rival.user.id],
      })
      await Promise.all([
        expectSpectatorTerminalReadOnly(spectator.page, participantDisplayNames, 'Match cancelled before the first turn'),
        expectSpectatorTerminalReadOnly(signedOutPage, participantDisplayNames, 'Match cancelled before the first turn'),
      ])

      await navigateToPracticeMultiplayer(host.page)
      await openMultiplayerMatch(host.page)
      const waitingForfeit = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'waiting',
        userIds: [host.user.id],
      })
      await navigateToPracticeMultiplayer(rival.page)
      await joinWaitingMultiplayerGame(rival.page, waitingForfeit.id)
      const playingForfeit = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [host.user.id, rival.user.id],
      })
      const wrongGuess = getValidWrongGuess(projectionFromRow(playingForfeit))
      await selectMultiplayerGame(host.page, playingForfeit.id, { status: 'playing' })
      await waitForTurn(host.page)
      await submitGuessWithKeyboard(host.page, wrongGuess)
      await waitForTurn(rival.page)
      await rival.page.getByRole('button', { name: /^Forfeit$/i }).click()
      await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'lost',
        userIds: [host.user.id, rival.user.id],
      })
      const forfeitLabel = `${rival.user.displayName} forfeited. ${host.user.displayName} won`
      await Promise.all([
        expectSpectatorTerminalReadOnly(spectator.page, participantDisplayNames, forfeitLabel),
        expectSpectatorTerminalReadOnly(signedOutPage, participantDisplayNames, forfeitLabel),
      ])

      await expectNoConsoleFailures(host.consoleFailures)
      await expectNoConsoleFailures(rival.consoleFailures)
      await expectNoConsoleFailures(spectator.consoleFailures)
      await expectNoConsoleFailures(signedOutConsoleFailures)
    } finally {
      await Promise.allSettled([
        ...seats.map((seat) => seat.context.close()),
        signedOutContext.close(),
      ])
      await cleanupE2eRun(seats.map((seat) => seat.user))
    }
  })
})
