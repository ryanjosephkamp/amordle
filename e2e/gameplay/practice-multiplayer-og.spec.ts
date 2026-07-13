import { expect, test } from '@playwright/test'
import { expectNoConsoleFailures, expectVisibleStatus } from '../fixtures/assertions'
import { getCurrentAnswer, getValidWrongGuess, projectionFromRow } from '../fixtures/answers'
import { navigateToPracticeMultiplayer, openMultiplayerMatch, joinWaitingMultiplayerGame, selectMultiplayerGame, setPracticeMultiplayerTimeLimit, setPracticeMultiplayerWordLength, submitGuessWithKeyboard, waitForTurn } from '../fixtures/gameActions'
import { updateMultiplayerProjection, upsertPublicProfileForUser, waitForMultiplayerRowByIdForUsers, waitForMultiplayerRowForUsers } from '../fixtures/supabaseAdmin'
import { createTwoClientSession, type TwoClientSession } from '../fixtures/twoClientGame'

const TIMED_RANKED_PRACTICE_TIME_LIMIT_MS = 300_000
const RANKED_E2E_WORD_LENGTH = 7

async function getContrastRatio(locator: import('@playwright/test').Locator): Promise<number> {
  return locator.evaluate((element) => {
    const parseRgb = (value: string) => value.match(/[\d.]+/gu)?.slice(0, 3).map(Number) ?? []
    const luminance = (channels: readonly number[]) => {
      const normalized = channels.map((channel) => {
        const value = channel / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * (normalized[0] ?? 0) + 0.7152 * (normalized[1] ?? 0) + 0.0722 * (normalized[2] ?? 0)
    }
    const styles = window.getComputedStyle(element)
    const foreground = luminance(parseRgb(styles.color))
    const background = luminance(parseRgb(styles.backgroundColor))
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
  })
}

async function openAndJoinPracticeOgMatch(session: TwoClientSession) {
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

  return waitForMultiplayerRowForUsers({
    mode: 'og',
    scope: 'practice',
    status: 'playing',
    userIds: [session.host.user.id, session.rival.user.id],
  })
}

async function finishPracticeOgMatchAsHost(session: TwoClientSession, gameId: string) {
  const playingRow = await waitForMultiplayerRowForUsers({
    mode: 'og',
    scope: 'practice',
    status: 'playing',
    userIds: [session.host.user.id, session.rival.user.id],
  })
  expect(playingRow.id).toBe(gameId)
  const game = projectionFromRow(playingRow)
  const answer = getCurrentAnswer(game)

  await selectMultiplayerGame(session.host.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
  await waitForTurn(session.host.page)
  await submitGuessWithKeyboard(session.host.page, answer)

  const wonRow = await waitForMultiplayerRowForUsers({
    mode: 'og',
    scope: 'practice',
    status: 'won',
    userIds: [session.host.user.id, session.rival.user.id],
  })
  expect(wonRow.id).toBe(gameId)
  await expectVisibleStatus(session.host.page, /Match finished\. You won this multiplayer match\./)
  await expectVisibleStatus(session.rival.page, /Match finished\. You lost this multiplayer match\./)
  await expect(session.host.page.getByRole('button', { name: /^Request rematch$/i })).toBeVisible({ timeout: 20_000 })
  await expect(session.rival.page.getByRole('button', { name: /^Request rematch$/i })).toBeVisible({ timeout: 20_000 })
  return wonRow
}

async function expectSelectedGame(page: TwoClientSession['host']['page'], gameId: string): Promise<void> {
  await expect(page.getByTestId('multiplayer-selected-game')).toHaveAttribute('data-game-id', gameId, { timeout: 30_000 })
}

async function expectOpponentNamesVisible(session: TwoClientSession): Promise<void> {
  await expect(session.host.page.getByText(session.rival.user.displayName, { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(session.rival.page.getByText(session.host.user.displayName, { exact: true }).first()).toBeVisible({ timeout: 20_000 })
}

async function setPracticeMatchType(page: TwoClientSession['host']['page'], matchType: 'custom' | 'ranked' | 'unranked'): Promise<void> {
  const panel = page.getByTestId('multiplayer-panel-practice')
  const matchTypeSelect = panel.locator('select').nth(1)
  await expect(matchTypeSelect).toBeVisible()
  await matchTypeSelect.selectOption(matchType)
  await expect(matchTypeSelect).toHaveValue(matchType)
}

async function enterTimedRankedPracticeQueue(page: TwoClientSession['host']['page']): Promise<void> {
  await navigateToPracticeMultiplayer(page)
  await setPracticeMatchType(page, 'ranked')
  await setPracticeMultiplayerTimeLimit(page, String(TIMED_RANKED_PRACTICE_TIME_LIMIT_MS))
  await page.getByRole('button', { name: /^Enter timed ranked queue$/i }).click()
}

async function searchRankedPracticeAgain(page: TwoClientSession['host']['page']): Promise<void> {
  const action = page.getByTestId('multiplayer-selected-game').getByRole('button', { name: /^Search ranked Practice again$/i })
  await expect(action).toBeVisible({ timeout: 20_000 })
  await action.scrollIntoViewIfNeeded()
  await action.click({ timeout: 20_000 })
}

test.describe('Practice Multiplayer OG @practice @multiplayer', () => {
  test('creates, joins, submits, and completes an OG match through two real clients', async ({ browser }) => {
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
      await session.host.page.waitForTimeout(1500)
      const stableWaitingRow = await waitForMultiplayerRowByIdForUsers({
        id: waitingRow.id,
        mode: 'og',
        scope: 'practice',
        status: 'waiting',
        userIds: [session.host.user.id],
      })
      expect(stableWaitingRow.id).toBe(waitingRow.id)

      await navigateToPracticeMultiplayer(session.rival.page)
      await joinWaitingMultiplayerGame(session.rival.page, waitingRow.id)

      const playingRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const game = projectionFromRow(playingRow)
      const answer = getCurrentAnswer(game)

      await selectMultiplayerGame(session.host.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      await waitForTurn(session.host.page)
      await submitGuessWithKeyboard(session.host.page, answer)

      const wonRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'won',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      expect(wonRow.winner_player_id).toBe('player-one')
      await expectVisibleStatus(session.host.page, /Match finished\. You won this multiplayer match\./)
      await expectVisibleStatus(session.rival.page, /Match finished\. You lost this multiplayer match\./)

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('keeps post-guess forfeits as losses for the forfeiting player', async ({ browser }) => {
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
      const playingRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const game = projectionFromRow(playingRow)
      const wrongGuess = getValidWrongGuess(game)

      await selectMultiplayerGame(session.host.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      await waitForTurn(session.host.page)
      await submitGuessWithKeyboard(session.host.page, wrongGuess)
      await waitForTurn(session.rival.page)
      await session.rival.page.getByRole('button', { name: /^Forfeit$/i }).click()

      const forfeitedRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'lost',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const forfeitedGame = projectionFromRow(forfeitedRow)
      expect(forfeitedGame.forfeitedPlayerId).toBe('player-two')
      expect(forfeitedGame.winnerId).toBe('player-one')
      await expectVisibleStatus(session.rival.page, /You forfeited this multiplayer match\./)
      await expectVisibleStatus(session.host.page, /Rival forfeited\. You won this multiplayer match\./)

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('retries an older-shaped participant forfeit after one durable write conflict', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      const playingRow = await openAndJoinPracticeOgMatch(session)
      const overviewTab = session.rival.page.getByRole('tab', { name: /^Overview$/i })
      await overviewTab.click()
      const activeBadge = overviewTab.locator('.brrrdle-attention-badge[data-active="true"]')
      await expect(activeBadge).toBeVisible()
      expect(await getContrastRatio(activeBadge)).toBeGreaterThanOrEqual(4.5)
      await session.rival.page.setViewportSize({ height: 844, width: 390 })
      await expect(activeBadge).toBeVisible()
      expect(await getContrastRatio(activeBadge)).toBeGreaterThanOrEqual(4.5)
      await session.rival.page.getByRole('tab', { name: /^Practice Multiplayer$/i }).click()
      await selectMultiplayerGame(session.rival.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      const game = projectionFromRow(playingRow)
      const wrongGuess = getValidWrongGuess(game)

      await selectMultiplayerGame(session.host.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      await waitForTurn(session.host.page)
      await submitGuessWithKeyboard(session.host.page, wrongGuess)
      await waitForTurn(session.rival.page)
      const afterGuessRow = await waitForMultiplayerRowByIdForUsers({
        id: playingRow.id,
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const afterGuess = projectionFromRow(afterGuessRow)
      const {
        authorityVersion: omittedAuthorityVersion,
        playerProfiles: omittedPlayerProfiles,
        ...olderProjection
      } = afterGuess
      void omittedAuthorityVersion
      void omittedPlayerProfiles
      const conflictUpdatedAt = new Date(Date.parse(afterGuess.updatedAt) + 1).toISOString()
      let conflictInjected = false

      await session.rival.page.route('**/rest/v1/async_multiplayer_games*', async (route) => {
        const request = route.request()
        if (!conflictInjected && request.method() === 'PATCH' && request.url().includes(`id=eq.${playingRow.id}`)) {
          conflictInjected = true
          await updateMultiplayerProjection({ ...olderProjection, updatedAt: conflictUpdatedAt })
        }
        await route.continue()
      })

      await session.rival.page.getByRole('button', { name: /^Forfeit$/i }).click()

      const forfeitedRow = await waitForMultiplayerRowByIdForUsers({
        id: playingRow.id,
        mode: 'og',
        scope: 'practice',
        status: 'lost',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const forfeitedGame = projectionFromRow(forfeitedRow)
      expect(conflictInjected).toBe(true)
      expect(forfeitedGame.forfeitedPlayerId).toBe('player-two')
      expect(forfeitedGame.winnerId).toBe('player-one')

      await session.rival.page.reload()
      await navigateToPracticeMultiplayer(session.rival.page)
      await expect(session.rival.page.getByText(/You forfeited this multiplayer match\./i)).toBeVisible({ timeout: 20_000 })
      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('reports a durable forfeit failure after both bounded write attempts conflict', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      const playingRow = await openAndJoinPracticeOgMatch(session)
      const game = projectionFromRow(playingRow)
      const wrongGuess = getValidWrongGuess(game)

      await selectMultiplayerGame(session.host.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      await waitForTurn(session.host.page)
      await submitGuessWithKeyboard(session.host.page, wrongGuess)
      await waitForTurn(session.rival.page)
      const afterGuessRow = await waitForMultiplayerRowByIdForUsers({
        id: playingRow.id,
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const afterGuess = projectionFromRow(afterGuessRow)
      let conflictCount = 0

      await session.rival.page.route('**/rest/v1/async_multiplayer_games*', async (route) => {
        const request = route.request()
        if (request.method() === 'PATCH' && request.url().includes(`id=eq.${playingRow.id}`) && conflictCount < 2) {
          conflictCount += 1
          await updateMultiplayerProjection({
            ...afterGuess,
            updatedAt: new Date(Date.parse(afterGuess.updatedAt) + conflictCount).toISOString(),
          })
        }
        await route.continue()
      })

      await session.rival.page.getByRole('button', { name: /^Forfeit$/i }).click()

      await expect(session.rival.page.getByRole('alert')).toContainText(
        'Unable to save this multiplayer update. The durable game was reloaded; please try again.',
      )
      const durableRow = await waitForMultiplayerRowByIdForUsers({
        id: playingRow.id,
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      expect(conflictCount).toBe(2)
      expect(projectionFromRow(durableRow).forfeitedPlayerId).toBeUndefined()
      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('preserves timeout loser precedence for timed Practice matches', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      await navigateToPracticeMultiplayer(session.host.page)
      await setPracticeMultiplayerTimeLimit(session.host.page, '30000')
      await openMultiplayerMatch(session.host.page)
      const waitingRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'waiting',
        userIds: [session.host.user.id],
      })

      await navigateToPracticeMultiplayer(session.rival.page)
      await joinWaitingMultiplayerGame(session.rival.page, waitingRow.id)
      const playingRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const game = projectionFromRow(playingRow)
      expect(game.timeLimitMs).toBe(30_000)
      await selectMultiplayerGame(session.host.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      await waitForTurn(session.host.page)
      const backdatedGame = {
        ...game,
        timeRemainingMs: { 'player-one': 1, 'player-two': 30_000 },
        turnStartedAt: new Date(Date.now() - 35_000).toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await updateMultiplayerProjection(backdatedGame)
      await session.host.page.reload({ waitUntil: 'domcontentloaded' })
      await selectMultiplayerGame(session.host.page, playingRow.id)

      const timedOutRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'lost',
        timeoutMs: 30_000,
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const timedOutGame = projectionFromRow(timedOutRow)
      expect(timedOutGame.timedOutPlayerId).toBe('player-one')
      expect(timedOutGame.winnerId).toBe('player-two')
      await expectVisibleStatus(session.host.page, /You ran out of time and lost this multiplayer match\./)
      await expectVisibleStatus(session.rival.page, /Rival ran out of time\. You won this multiplayer match\./)

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('syncs one-request rematch decline through two real clients', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      const playingRow = await openAndJoinPracticeOgMatch(session)
      await finishPracticeOgMatchAsHost(session, playingRow.id)

      await session.host.page.getByRole('button', { name: /^Request rematch$/i }).click()
      await expect(session.host.page.getByText(/Rematch request sent\./i)).toBeVisible()
      await expect(session.rival.page.getByText(/Rival requested a rematch\./i)).toBeVisible({ timeout: 20_000 })
      await expect(session.rival.page.getByRole('button', { name: /^Accept rematch$/i })).toBeVisible()
      await session.rival.page.getByRole('button', { name: /^Decline$/i }).click()

      await expect(session.rival.page.getByText(/Rematch request declined\./i).first()).toBeVisible()
      await expect(session.host.page.getByText(/Rematch request declined\./i).first()).toBeVisible({ timeout: 20_000 })

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('accepts an eligible rematch and opens the fresh game for both clients', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      const playingRow = await openAndJoinPracticeOgMatch(session)
      await finishPracticeOgMatchAsHost(session, playingRow.id)

      await session.host.page.getByRole('button', { name: /^Request rematch$/i }).click()
      await expect(session.rival.page.getByText(/Rival requested a rematch\./i)).toBeVisible({ timeout: 20_000 })
      await session.rival.page.getByRole('button', { name: /^Accept rematch$/i }).click()

      const rematchRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      expect(rematchRow.id).not.toBe(playingRow.id)
      await expectSelectedGame(session.rival.page, rematchRow.id)
      await expectSelectedGame(session.host.page, rematchRow.id)
      await expectVisibleStatus(session.host.page, /Rival joined\. Your turn\./)
      await expectVisibleStatus(session.rival.page, /Joined multiplayer match\. Waiting for the next player\./)

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('routes ranked search-again creators into the finalized game with safe opponent names', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      await Promise.all([
        upsertPublicProfileForUser(session.host.user, 'cyan'),
        upsertPublicProfileForUser(session.rival.user, 'rose'),
      ])

      await navigateToPracticeMultiplayer(session.host.page)
      await setPracticeMultiplayerWordLength(session.host.page, RANKED_E2E_WORD_LENGTH)
      await setPracticeMatchType(session.host.page, 'ranked')
      await session.host.page.getByRole('button', { name: /^Enter ranked queue$/i }).click()
      await expect(session.host.page.getByTestId('ranked-queue-status')).toContainText(/Waiting for a compatible signed-in rival/i)

      await navigateToPracticeMultiplayer(session.rival.page)
      await setPracticeMultiplayerWordLength(session.rival.page, RANKED_E2E_WORD_LENGTH)
      await setPracticeMatchType(session.rival.page, 'ranked')
      await session.rival.page.getByRole('button', { name: /^Enter ranked queue$/i }).click()

      const firstRankedRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      await expectSelectedGame(session.host.page, firstRankedRow.id)
      await expectSelectedGame(session.rival.page, firstRankedRow.id)
      await expectOpponentNamesVisible(session)

      const firstRankedGame = projectionFromRow(firstRankedRow)
      expect(firstRankedGame.wordLength).toBe(RANKED_E2E_WORD_LENGTH)
      await waitForTurn(session.host.page)
      await submitGuessWithKeyboard(session.host.page, getCurrentAnswer(firstRankedGame))
      const terminalRankedRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'won',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      expect(terminalRankedRow.id).toBe(firstRankedRow.id)
      await selectMultiplayerGame(session.host.page, firstRankedRow.id)
      await selectMultiplayerGame(session.rival.page, firstRankedRow.id)
      await expect(session.host.page.getByTestId('multiplayer-selected-game')).toHaveAttribute('data-status', 'won', { timeout: 30_000 })
      await expect(session.rival.page.getByTestId('multiplayer-selected-game')).toHaveAttribute('data-status', 'won', { timeout: 30_000 })
      await expect(session.host.page.getByRole('button', { name: /^Search ranked Practice again$/i })).toBeVisible({ timeout: 20_000 })
      await expect(session.rival.page.getByRole('button', { name: /^Search ranked Practice again$/i })).toBeVisible({ timeout: 20_000 })

      await searchRankedPracticeAgain(session.host.page)
      await expect(session.host.page.getByTestId('ranked-queue-status')).toContainText(/Waiting for a compatible signed-in rival/i)
      await searchRankedPracticeAgain(session.rival.page)

      const nextRankedRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        timeoutMs: 45_000,
        userIds: [session.host.user.id, session.rival.user.id],
      })
      expect(nextRankedRow.id).not.toBe(firstRankedRow.id)
      await expectSelectedGame(session.host.page, nextRankedRow.id)
      await expectSelectedGame(session.rival.page, nextRankedRow.id)
      await expectOpponentNamesVisible(session)

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('matches canonical timed ranked Practice and search-again preserves the five-minute track', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      await Promise.all([
        upsertPublicProfileForUser(session.host.user, 'cyan'),
        upsertPublicProfileForUser(session.rival.user, 'rose'),
      ])

      await enterTimedRankedPracticeQueue(session.host.page)
      await expect(session.host.page.getByTestId('ranked-queue-status')).toContainText(/Timed ranked queue request created/i)
      await enterTimedRankedPracticeQueue(session.rival.page)

      const timedRankedRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      await expectSelectedGame(session.host.page, timedRankedRow.id)
      await expectSelectedGame(session.rival.page, timedRankedRow.id)
      await expectOpponentNamesVisible(session)

      const timedRankedGame = projectionFromRow(timedRankedRow)
      expect(timedRankedGame.ranked).toBe(true)
      expect(timedRankedGame.ratingBucket).toBe('multiplayer:og:timed:v1')
      expect(timedRankedGame.timeLimitMs).toBe(TIMED_RANKED_PRACTICE_TIME_LIMIT_MS)
      expect(timedRankedGame.timeRemainingMs).toMatchObject({
        'player-one': TIMED_RANKED_PRACTICE_TIME_LIMIT_MS,
        'player-two': TIMED_RANKED_PRACTICE_TIME_LIMIT_MS,
      })
      await expect(session.host.page.getByText('5:00').first()).toBeVisible()
      await expect(session.rival.page.getByText('5:00').first()).toBeVisible()

      await waitForTurn(session.host.page)
      await submitGuessWithKeyboard(session.host.page, getCurrentAnswer(timedRankedGame))
      const terminalTimedRankedRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'won',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      expect(terminalTimedRankedRow.id).toBe(timedRankedRow.id)
      await selectMultiplayerGame(session.host.page, timedRankedRow.id)
      await selectMultiplayerGame(session.rival.page, timedRankedRow.id)
      await expect(session.host.page.getByText(/Same settings: OG, 5 letters, Hard Mode off, 5:00 per side/i)).toBeVisible({ timeout: 20_000 })
      await expect(session.rival.page.getByRole('button', { name: /^Search ranked Practice again$/i })).toBeVisible({ timeout: 20_000 })

      await searchRankedPracticeAgain(session.host.page)
      await expect(session.host.page.getByTestId('ranked-queue-status')).toContainText(/Timed ranked queue request created/i)
      await searchRankedPracticeAgain(session.rival.page)

      const nextTimedRankedRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        timeoutMs: 45_000,
        userIds: [session.host.user.id, session.rival.user.id],
      })
      expect(nextTimedRankedRow.id).not.toBe(timedRankedRow.id)
      const nextTimedRankedGame = projectionFromRow(nextTimedRankedRow)
      expect(nextTimedRankedGame.ratingBucket).toBe('multiplayer:og:timed:v1')
      expect(nextTimedRankedGame.timeLimitMs).toBe(TIMED_RANKED_PRACTICE_TIME_LIMIT_MS)
      await expectSelectedGame(session.host.page, nextTimedRankedRow.id)
      await expectSelectedGame(session.rival.page, nextTimedRankedRow.id)
      await expectOpponentNamesVisible(session)

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('auto-routes an unranked lobby creator when a rival joins from a terminal game', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      await Promise.all([
        upsertPublicProfileForUser(session.host.user, 'cyan'),
        upsertPublicProfileForUser(session.rival.user, 'rose'),
      ])

      const firstPlayingRow = await openAndJoinPracticeOgMatch(session)
      const terminalRow = await finishPracticeOgMatchAsHost(session, firstPlayingRow.id)

      await openMultiplayerMatch(session.host.page)
      const waitingRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'waiting',
        userIds: [session.host.user.id],
      })
      expect(waitingRow.id).not.toBe(terminalRow.id)
      await selectMultiplayerGame(session.host.page, terminalRow.id)
      await expectSelectedGame(session.host.page, terminalRow.id)

      await joinWaitingMultiplayerGame(session.rival.page, waitingRow.id)
      const joinedRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      expect(joinedRow.id).toBe(waitingRow.id)
      await expectSelectedGame(session.host.page, joinedRow.id)
      await expectSelectedGame(session.rival.page, joinedRow.id)
      await expectOpponentNamesVisible(session)

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })
})
