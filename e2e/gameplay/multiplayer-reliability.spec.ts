import { expect, test, type Page } from '@playwright/test'
import { expectNoConsoleFailures } from '../fixtures/assertions'
import { getCurrentAnswer, getValidWrongGuess, projectionFromRow } from '../fixtures/answers'
import {
  cancelRankedPracticeQueue,
  chooseMultiplayerMode,
  enterRankedPracticeQueue,
  joinWaitingMultiplayerGame,
  navigateToDailyMultiplayer,
  navigateToLeaderboard,
  navigateToPracticeMultiplayer,
  openMultiplayerMatch,
  openPublicProfileRoute,
  selectMultiplayerGame,
  setDailyMultiplayerMatchType,
  setPracticeMultiplayerMatchType,
  submitGuessWithKeyboard,
  waitForTurn,
} from '../fixtures/gameActions'
import {
  fetchMultiplayerRowsForUsers,
  fetchPublicProfileIdForUser,
  fetchPublicRankedLeaderboardRowsForUser,
  fetchRankedQueueRowsForUsers,
  createAuthenticatedSupabaseClient,
  upsertPublicProfileForUser,
  waitForMultiplayerRowForExactUsers,
  waitForMultiplayerRowForUsers,
  waitForRankedQueueRowsForUsers,
} from '../fixtures/supabaseAdmin'
import { createThreeClientSession } from '../fixtures/threeClientGame'
import { createTwoClientSession } from '../fixtures/twoClientGame'

async function expectSelectedGame(page: Page, gameId: string): Promise<void> {
  await expect(page.getByTestId('multiplayer-selected-game')).toHaveAttribute('data-game-id', gameId, { timeout: 30_000 })
  await expect(page.getByTestId('multiplayer-selected-game')).toHaveAttribute('data-status', 'playing', { timeout: 30_000 })
}

async function expectPrivateRequestCount(page: Page, count: number): Promise<void> {
  const panel = page.getByTestId('private-match-requests')
  await expect(panel).toContainText(`${count} active`, { timeout: 30_000 })
  if (count === 0) {
    await expect(panel).toContainText(/No active private match requests\./i)
  }
}

async function sendPrivatePracticeRequest(
  page: Page,
  targetPublicProfileId: string,
  mode: 'go' | 'og' = 'og',
): Promise<void> {
  await openPublicProfileRoute(page, targetPublicProfileId)
  if (mode === 'go') {
    await page.getByLabel(/^Private Practice mode$/i).selectOption('go')
  }
  await page.getByRole('button', { name: /^Request Practice match$/i }).click()
  await expect(page.getByText(/Private Practice request pending/i)).toBeVisible({ timeout: 30_000 })
}

const PARTICIPANT_RELOAD_DEADLINE_MS = 5_000

function remainingDeadlineMs(deadline: number): number {
  return Math.max(1, deadline - Date.now())
}

async function expectGameAfterSameTabReload(
  page: Page,
  gameId: string,
  mode: 'go' | 'og',
  scope: 'daily' | 'practice',
): Promise<void> {
  const startedAt = Date.now()
  const deadline = startedAt + PARTICIPANT_RELOAD_DEADLINE_MS
  await page.addInitScript((eventName) => {
    const readinessWindow = window as Window & {
      __brrrdleMultiplayerReadiness?: unknown[]
      __brrrdleMultiplayerStateReadiness?: unknown[]
    }
    readinessWindow.__brrrdleMultiplayerReadiness = []
    readinessWindow.__brrrdleMultiplayerStateReadiness = []
    window.addEventListener(eventName, (event) => {
      readinessWindow.__brrrdleMultiplayerReadiness?.push((event as CustomEvent).detail)
    })
    window.addEventListener('brrrdle:multiplayer-state-readiness', (event) => {
      readinessWindow.__brrrdleMultiplayerStateReadiness?.push((event as CustomEvent).detail)
    })
  }, 'brrrdle:multiplayer-repository-readiness')
  const participantReadEvents: { readonly elapsedMs: number; readonly rowCount: number; readonly status: number }[] = []
  const isParticipantRead = (response: import('@playwright/test').Response) => {
    const url = decodeURIComponent(response.url())
    return response.request().method() === 'GET'
      && url.includes('/rest/v1/async_multiplayer_games')
      && url.includes('player_one_user_id.eq.')
      && url.includes('player_two_user_id.eq.')
  }
  const recordParticipantRead = (response: import('@playwright/test').Response) => {
    if (!isParticipantRead(response)) return
    void response.json().then((data: unknown) => {
      participantReadEvents.push({
        elapsedMs: Date.now() - startedAt,
        rowCount: Array.isArray(data) ? data.length : -1,
        status: response.status(),
      })
    }).catch(() => {
      participantReadEvents.push({ elapsedMs: Date.now() - startedAt, rowCount: -1, status: response.status() })
    })
  }
  page.on('response', recordParticipantRead)
  const participantRead = page.waitForResponse(isParticipantRead, { timeout: PARTICIPANT_RELOAD_DEADLINE_MS })

  try {
    await page.reload({
      timeout: remainingDeadlineMs(deadline),
      waitUntil: 'domcontentloaded',
    })
    await expect(page.locator('#dashboard-home-title')).toBeVisible({ timeout: remainingDeadlineMs(deadline) })
    await page.getByRole('button', { name: /^Multiplayer$/i }).click({ timeout: remainingDeadlineMs(deadline) })
    await expect(page.getByRole('tab', { name: /^Overview$/i })).toHaveAttribute('aria-selected', 'true', {
      timeout: remainingDeadlineMs(deadline),
    })
    await expect(page.getByTestId(`multiplayer-active-resume-${gameId}`)).toBeVisible({
      timeout: remainingDeadlineMs(deadline),
    })

    await page.getByRole('tab', { name: scope === 'daily' ? /^Daily Multiplayer$/i : /^Practice Multiplayer$/i }).click({
      timeout: remainingDeadlineMs(deadline),
    })
    await expect(page.getByTestId(`multiplayer-game-tab-${gameId}`)).toBeVisible({
      timeout: remainingDeadlineMs(deadline),
    })

    await page.getByRole('tab', { name: /^Active Games$/i }).click({ timeout: remainingDeadlineMs(deadline) })
    await expect(page.getByTestId(`multiplayer-active-resume-${gameId}`)).toBeVisible({
      timeout: remainingDeadlineMs(deadline),
    })

    await page.getByRole('tab', { name: /^Live$/i }).click({ timeout: remainingDeadlineMs(deadline) })
    await expect(page.getByRole('article', {
      name: new RegExp(`^${scope === 'daily' ? 'Daily' : 'Practice'} Multiplayer ${mode.toUpperCase()}`, 'i'),
    }).filter({
      has: page.getByRole('button', { name: /^Resume live game$/i }),
    }).first()).toBeVisible({ timeout: remainingDeadlineMs(deadline) })

    const participantResponse = await participantRead
    expect(participantResponse.ok()).toBe(true)
    expect(Date.now() - startedAt).toBeLessThanOrEqual(PARTICIPANT_RELOAD_DEADLINE_MS)
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 0))
    const repositoryEvents = await page.evaluate(() => (
      (window as Window & { __brrrdleMultiplayerReadiness?: unknown[] }).__brrrdleMultiplayerReadiness ?? []
    ))
    const stateEvents = await page.evaluate(() => (
      (window as Window & { __brrrdleMultiplayerStateReadiness?: unknown[] }).__brrrdleMultiplayerStateReadiness ?? []
    ))
    throw new Error(`Participant reload readiness failed: network=${JSON.stringify(participantReadEvents)} repository=${JSON.stringify(repositoryEvents)} state=${JSON.stringify(stateEvents)}`)
  } finally {
    page.off('response', recordParticipantRead)
  }
}

test.describe('Multiplayer reliability characterization @multiplayer', () => {
  for (const mode of ['og', 'go'] as const) {
  test(`rediscovers a ranked Practice ${mode.toUpperCase()} game after reloading the matched participant page`, async ({ browser }) => {
    const session = await createTwoClientSession(browser)

    try {
      await navigateToPracticeMultiplayer(session.host.page)
      await chooseMultiplayerMode(session.host.page, mode)
      await setPracticeMultiplayerMatchType(session.host.page, 'ranked')
      await session.host.page.getByRole('button', { name: /^Enter ranked queue$/i }).click()
      await waitForRankedQueueRowsForUsers({
        status: 'queued',
        userIds: [session.host.user.id],
      })

      await navigateToPracticeMultiplayer(session.rival.page)
      await chooseMultiplayerMode(session.rival.page, mode)
      await setPracticeMultiplayerMatchType(session.rival.page, 'ranked')
      await session.rival.page.getByRole('button', { name: /^Enter ranked queue$/i }).click()

      const playingRow = await waitForMultiplayerRowForExactUsers({
        mode,
        scope: 'practice',
        status: 'playing',
        timeoutMs: 30_000,
        userIds: [session.host.user.id, session.rival.user.id],
      })
      await expectSelectedGame(session.host.page, playingRow.id)
      await expectSelectedGame(session.rival.page, playingRow.id)

      const initialGame = projectionFromRow(playingRow)
      const actorUserId = initialGame.playerUserIds?.[initialGame.currentTurn]
      const actor = actorUserId === session.host.user.id ? session.host : session.rival
      const reloaded = actor === session.host ? session.rival : session.host
      await selectMultiplayerGame(actor.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      await waitForTurn(actor.page)
      await submitGuessWithKeyboard(actor.page, getValidWrongGuess(initialGame))
      await expect.poll(async () => {
        const rows = await fetchMultiplayerRowsForUsers([session.host.user.id, session.rival.user.id])
        const row = rows.find((candidate) => candidate.id === playingRow.id)
        return row ? projectionFromRow(row).moves.length : 0
      }, { timeout: 20_000 }).toBe(1)
      await expectGameAfterSameTabReload(reloaded.page, playingRow.id, mode, 'practice')

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })
  }

  for (const mode of ['og', 'go'] as const) {
  test(`rediscovers a ranked Daily ${mode.toUpperCase()} game after reloading the matched participant page`, async ({ browser }) => {
    const session = await createTwoClientSession(browser)

    try {
      await navigateToDailyMultiplayer(session.host.page)
      await chooseMultiplayerMode(session.host.page, mode, 'daily')
      await setDailyMultiplayerMatchType(session.host.page, 'ranked')
      await session.host.page.getByRole('button', { name: /^Enter ranked Daily queue$/i }).click()
      await waitForRankedQueueRowsForUsers({
        status: 'queued',
        userIds: [session.host.user.id],
      })

      await navigateToDailyMultiplayer(session.rival.page)
      await chooseMultiplayerMode(session.rival.page, mode, 'daily')
      await setDailyMultiplayerMatchType(session.rival.page, 'ranked')
      await session.rival.page.getByRole('button', { name: /^Enter ranked Daily queue$/i }).click()

      const playingRow = await waitForMultiplayerRowForExactUsers({
        mode,
        scope: 'daily',
        status: 'playing',
        timeoutMs: 30_000,
        userIds: [session.host.user.id, session.rival.user.id],
      })
      await expectSelectedGame(session.host.page, playingRow.id)
      await expectSelectedGame(session.rival.page, playingRow.id)
      const reloaded = session.host
      await expectGameAfterSameTabReload(reloaded.page, playingRow.id, mode, 'daily')

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })
  }

  for (const mode of ['og', 'go'] as const) {
  test(`rediscovers an unranked Practice ${mode.toUpperCase()} game after reloading the matched participant page`, async ({ browser }) => {
    const session = await createTwoClientSession(browser)

    try {
      await navigateToPracticeMultiplayer(session.host.page)
      await chooseMultiplayerMode(session.host.page, mode)
      await setPracticeMultiplayerMatchType(session.host.page, 'unranked')
      await openMultiplayerMatch(session.host.page)
      const waitingRow = await waitForMultiplayerRowForUsers({
        mode,
        scope: 'practice',
        status: 'waiting',
        userIds: [session.host.user.id],
      })

      await navigateToPracticeMultiplayer(session.rival.page)
      await chooseMultiplayerMode(session.rival.page, mode)
      await setPracticeMultiplayerMatchType(session.rival.page, 'unranked')
      await joinWaitingMultiplayerGame(session.rival.page, waitingRow.id)
      const playingRow = await waitForMultiplayerRowForExactUsers({
        mode,
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      await expectSelectedGame(session.host.page, playingRow.id)
      await expectSelectedGame(session.rival.page, playingRow.id)

      await expectGameAfterSameTabReload(session.host.page, playingRow.id, mode, 'practice')

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })
  }

  for (const mode of ['og', 'go'] as const) {
  test(`rediscovers an unranked Daily ${mode.toUpperCase()} game after reloading the matched participant page`, async ({ browser }) => {
    const session = await createTwoClientSession(browser)

    try {
      await navigateToDailyMultiplayer(session.host.page)
      await chooseMultiplayerMode(session.host.page, mode, 'daily')
      await setDailyMultiplayerMatchType(session.host.page, 'unranked')
      await openMultiplayerMatch(session.host.page)
      const waitingRow = await waitForMultiplayerRowForUsers({
        mode,
        scope: 'daily',
        status: 'waiting',
        userIds: [session.host.user.id],
      })

      await navigateToDailyMultiplayer(session.rival.page)
      await chooseMultiplayerMode(session.rival.page, mode, 'daily')
      await setDailyMultiplayerMatchType(session.rival.page, 'unranked')
      await joinWaitingMultiplayerGame(session.rival.page, waitingRow.id, { via: 'selected' })
      const playingRow = await waitForMultiplayerRowForExactUsers({
        mode,
        scope: 'daily',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      await expectSelectedGame(session.host.page, playingRow.id)
      await expectSelectedGame(session.rival.page, playingRow.id)

      await expectGameAfterSameTabReload(session.host.page, playingRow.id, mode, 'daily')

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })
  }

  for (const mode of ['og', 'go'] as const) {
  test(`rediscovers a private Practice ${mode.toUpperCase()} game after reloading the matched participant page`, async ({ browser }) => {
    const session = await createTwoClientSession(browser)

    try {
      await Promise.all([
        upsertPublicProfileForUser(session.host.user, 'cyan'),
        upsertPublicProfileForUser(session.rival.user, 'rose'),
      ])
      const rivalPublicProfileId = await fetchPublicProfileIdForUser(session.rival.user)

      const requesterClient = await createAuthenticatedSupabaseClient(session.host.user)
      const { error: requestError } = await requesterClient.rpc('create_private_multiplayer_match_request_v2', {
        p_expires_at: null,
        p_go_puzzle_count: mode === 'go' ? 5 : null,
        p_hard_mode: false,
        p_idempotency_key: `${session.runId}-reload-${mode}`,
        p_mode: mode,
        p_target_public_profile_id: rivalPublicProfileId,
        p_time_limit_ms: null,
        p_word_length: 5,
      })
      expect(requestError).toBeNull()
      await navigateToPracticeMultiplayer(session.rival.page)
      const rivalRequests = session.rival.page.getByTestId('private-match-requests')
      await expect(rivalRequests).toContainText(`${session.host.user.displayName} requested a private match.`, { timeout: 30_000 })
      await rivalRequests.getByRole('button', { name: /^Accept private match$/i }).click()

      const playingRow = await waitForMultiplayerRowForExactUsers({
        mode,
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      await expectSelectedGame(session.rival.page, playingRow.id)
      await navigateToPracticeMultiplayer(session.host.page)
      await expectSelectedGame(session.host.page, playingRow.id)

      await expectGameAfterSameTabReload(session.host.page, playingRow.id, mode, 'practice')

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })
  }

  test('keeps cancelled ranked queue rows out of later three-client matching', async ({ browser }) => {
    const session = await createThreeClientSession(browser)

    try {
      await Promise.all([
        upsertPublicProfileForUser(session.host.user, 'cyan'),
        upsertPublicProfileForUser(session.rival.user, 'rose'),
        upsertPublicProfileForUser(session.third.user, 'violet'),
      ])

      await enterRankedPracticeQueue(session.host.page)
      await waitForRankedQueueRowsForUsers({
        status: 'queued',
        userIds: [session.host.user.id],
      })

      await cancelRankedPracticeQueue(session.host.page)
      await waitForRankedQueueRowsForUsers({
        status: 'cancelled',
        userIds: [session.host.user.id],
      })

      await enterRankedPracticeQueue(session.rival.page)
      await waitForRankedQueueRowsForUsers({
        status: 'queued',
        userIds: [session.rival.user.id],
      })
      await enterRankedPracticeQueue(session.third.page, { expectQueuedStatus: false })

      const matchedRow = await waitForMultiplayerRowForExactUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        timeoutMs: 30_000,
        userIds: [session.rival.user.id, session.third.user.id],
      })
      await expectSelectedGame(session.rival.page, matchedRow.id)
      await expectSelectedGame(session.third.page, matchedRow.id)

      const hostRows = await fetchMultiplayerRowsForUsers([session.host.user.id])
      expect(hostRows.some((row) => (
        row.status === 'playing'
        && (row.player_one_user_id === session.rival.user.id
          || row.player_two_user_id === session.rival.user.id
          || row.player_one_user_id === session.third.user.id
          || row.player_two_user_id === session.third.user.id)
      ))).toBe(false)

      const hostQueueRows = await fetchRankedQueueRowsForUsers([session.host.user.id])
      expect(hostQueueRows.some((row) => row.status === 'matched')).toBe(false)

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
      await expectNoConsoleFailures(session.third.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('re-enters ranked Practice queue from the current request after cancellation', async ({ browser }) => {
    const session = await createTwoClientSession(browser)

    try {
      await Promise.all([
        upsertPublicProfileForUser(session.host.user, 'cyan'),
        upsertPublicProfileForUser(session.rival.user, 'rose'),
      ])

      await enterRankedPracticeQueue(session.host.page)
      await waitForRankedQueueRowsForUsers({
        status: 'queued',
        userIds: [session.host.user.id],
      })

      await cancelRankedPracticeQueue(session.host.page)
      await waitForRankedQueueRowsForUsers({
        status: 'cancelled',
        userIds: [session.host.user.id],
      })
      await expect(session.host.page.getByRole('button', { name: /^Enter ranked queue$/i })).toBeEnabled({ timeout: 30_000 })
      await expect(session.host.page.getByRole('button', { name: /^Already queued$/i })).toHaveCount(0)

      await enterRankedPracticeQueue(session.host.page)
      await waitForRankedQueueRowsForUsers({
        status: 'queued',
        userIds: [session.host.user.id],
      })
      await enterRankedPracticeQueue(session.rival.page, { expectQueuedStatus: false })

      const matchedRow = await waitForMultiplayerRowForExactUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        timeoutMs: 30_000,
        userIds: [session.host.user.id, session.rival.user.id],
      })
      await expectSelectedGame(session.host.page, matchedRow.id)
      await expectSelectedGame(session.rival.page, matchedRow.id)

      const hostQueueRows = await fetchRankedQueueRowsForUsers([session.host.user.id])
      const cancelledRows = hostQueueRows.filter((row) => row.status === 'cancelled')
      const matchedRows = hostQueueRows.filter((row) => row.status === 'matched')
      expect(cancelledRows).toHaveLength(1)
      expect(matchedRows).toHaveLength(1)
      expect(matchedRows[0]?.id).not.toBe(cancelledRows[0]?.id)

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('refreshes public ranked leaderboard after a trusted ranked Practice settlement', async ({ browser }) => {
    const session = await createTwoClientSession(browser)

    try {
      await Promise.all([
        upsertPublicProfileForUser(session.host.user, 'cyan'),
        upsertPublicProfileForUser(session.rival.user, 'rose'),
      ])

      await enterRankedPracticeQueue(session.host.page)
      await waitForRankedQueueRowsForUsers({
        status: 'queued',
        userIds: [session.host.user.id],
      })
      await enterRankedPracticeQueue(session.rival.page, { expectQueuedStatus: false })

      const playingRow = await waitForMultiplayerRowForExactUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        timeoutMs: 30_000,
        userIds: [session.host.user.id, session.rival.user.id],
      })
      await expectSelectedGame(session.host.page, playingRow.id)
      await expectSelectedGame(session.rival.page, playingRow.id)

      const game = projectionFromRow(playingRow)
      await selectMultiplayerGame(session.host.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      await waitForTurn(session.host.page)
      await submitGuessWithKeyboard(session.host.page, getCurrentAnswer(game))
      await navigateToLeaderboard(session.host.page)

      const settledRow = await waitForMultiplayerRowForExactUsers({
        mode: 'og',
        scope: 'practice',
        status: 'won',
        timeoutMs: 60_000,
        userIds: [session.host.user.id, session.rival.user.id],
      })
      expect(settledRow.id).toBe(playingRow.id)
      await expect(session.host.page.getByRole('button', {
        name: `Open public profile for ${session.host.user.displayName}`,
      })).toBeVisible({ timeout: 60_000 })

      const leaderboardRows = await fetchPublicRankedLeaderboardRowsForUser(session.host.user, {
        bucket: 'multiplayer:og',
        limit: 50,
      })
      expect(leaderboardRows.some((row) => row.display_name === session.host.user.displayName)).toBe(true)
      for (const row of leaderboardRows) {
        expect(Object.keys(row)).not.toEqual(expect.arrayContaining([
          'answer',
          'auth_user_id',
          'email',
          'player_sessions',
          'queue_id',
          'rating_transaction_id',
          'serialized_session',
          'user_id',
        ]))
      }
      expect(JSON.stringify(leaderboardRows)).not.toContain(session.host.user.email)
      expect(JSON.stringify(leaderboardRows)).not.toContain(session.rival.user.email)
      expect(JSON.stringify(leaderboardRows)).not.toContain('playerUserIds')

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('refreshes mobile Practice request cancel and decline lifecycle lists on route re-entry', async ({ browser }) => {
    const session = await createTwoClientSession(browser)

    try {
      await Promise.all([
        session.host.page.setViewportSize({ width: 390, height: 844 }),
        session.rival.page.setViewportSize({ width: 390, height: 844 }),
      ])
      await Promise.all([
        upsertPublicProfileForUser(session.host.user, 'cyan'),
        upsertPublicProfileForUser(session.rival.user, 'rose'),
      ])
      const rivalPublicProfileId = await fetchPublicProfileIdForUser(session.rival.user)

      await sendPrivatePracticeRequest(session.host.page, rivalPublicProfileId)
      await navigateToPracticeMultiplayer(session.host.page)
      await navigateToPracticeMultiplayer(session.rival.page)
      await expectPrivateRequestCount(session.host.page, 1)
      await expectPrivateRequestCount(session.rival.page, 1)
      await expect(session.rival.page.getByTestId('private-match-requests')).toContainText(`${session.host.user.displayName} requested a private match.`, { timeout: 30_000 })

      await navigateToLeaderboard(session.rival.page)
      await session.host.page.getByTestId('private-match-requests').getByRole('button', { name: /^Cancel request$/i }).click()
      await expect(session.host.page.getByTestId('private-match-requests').getByRole('status')).toContainText(/Private match request cancelled\./i, { timeout: 30_000 })
      await expectPrivateRequestCount(session.host.page, 0)
      await navigateToPracticeMultiplayer(session.rival.page)
      await expectPrivateRequestCount(session.rival.page, 0)

      await navigateToLeaderboard(session.rival.page)
      await sendPrivatePracticeRequest(session.host.page, rivalPublicProfileId)
      await navigateToPracticeMultiplayer(session.host.page)
      await navigateToPracticeMultiplayer(session.rival.page)
      await expectPrivateRequestCount(session.host.page, 1)
      await expectPrivateRequestCount(session.rival.page, 1)

      await navigateToLeaderboard(session.host.page)
      await session.rival.page.getByTestId('private-match-requests').getByRole('button', { name: /^Decline$/i }).click()
      await expect(session.rival.page.getByTestId('private-match-requests').getByRole('status')).toContainText(/Private match request declined\./i, { timeout: 30_000 })
      await expectPrivateRequestCount(session.rival.page, 0)
      await navigateToPracticeMultiplayer(session.host.page)
      await expectPrivateRequestCount(session.host.page, 0)

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('probes private request acceptance routing and public ranked leaderboard access without exposing raw identifiers', async ({ browser }) => {
    const session = await createTwoClientSession(browser)

    try {
      await Promise.all([
        upsertPublicProfileForUser(session.host.user, 'cyan'),
        upsertPublicProfileForUser(session.rival.user, 'rose'),
      ])
      const rivalPublicProfileId = await fetchPublicProfileIdForUser(session.rival.user)

      await sendPrivatePracticeRequest(session.host.page, rivalPublicProfileId)
      await navigateToPracticeMultiplayer(session.rival.page)
      const rivalRequests = session.rival.page.getByTestId('private-match-requests')
      await expect(rivalRequests).toContainText(`${session.host.user.displayName} requested a private match.`, { timeout: 30_000 })
      await rivalRequests.getByRole('button', { name: /^Accept private match$/i }).click()

      const createdRow = await waitForMultiplayerRowForExactUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      await expectSelectedGame(session.rival.page, createdRow.id)

      await navigateToPracticeMultiplayer(session.host.page)
      await expectPrivateRequestCount(session.host.page, 0)
      await expectSelectedGame(session.host.page, createdRow.id)

      const leaderboardRows = await fetchPublicRankedLeaderboardRowsForUser(session.host.user, {
        bucket: 'multiplayer:og',
        limit: 10,
      })
      for (const row of leaderboardRows) {
        expect(Object.keys(row)).not.toEqual(expect.arrayContaining([
          'answer',
          'auth_user_id',
          'email',
          'player_sessions',
          'queue_id',
          'rating_transaction_id',
          'serialized_session',
          'user_id',
        ]))
      }
      expect(JSON.stringify(leaderboardRows)).not.toContain(session.host.user.email)
      expect(JSON.stringify(leaderboardRows)).not.toContain(session.rival.user.email)
      expect(JSON.stringify(leaderboardRows)).not.toContain('playerUserIds')

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })
})
