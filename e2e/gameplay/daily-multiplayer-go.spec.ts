import { expect, test } from '@playwright/test'
import { expectKeyboardState, expectNoConsoleFailures } from '../fixtures/assertions'
import { getCurrentAnswer, projectionFromRow } from '../fixtures/answers'
import { chooseMultiplayerMode, launchDailyMultiplayer, openMultiplayerMatch, joinWaitingMultiplayerGame, selectMultiplayerGame, submitGuessWithKeyboard, waitForTurn } from '../fixtures/gameActions'
import { waitForMultiplayerRowByIdForUsers, waitForMultiplayerRowForUsers } from '../fixtures/supabaseAdmin'
import { createTwoClientSession } from '../fixtures/twoClientGame'

test.describe('Daily Multiplayer GO @daily @multiplayer', () => {
  test('keeps Daily GO clients synchronized across the first solved transition', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      await launchDailyMultiplayer(session.host.page)
      await chooseMultiplayerMode(session.host.page, 'go', 'daily')
      await openMultiplayerMatch(session.host.page)
      const waitingRow = await waitForMultiplayerRowForUsers({
        mode: 'go',
        scope: 'daily',
        status: 'waiting',
        userIds: [session.host.user.id],
      })
      await session.host.page.waitForTimeout(1500)
      const stableWaitingRow = await waitForMultiplayerRowByIdForUsers({
        id: waitingRow.id,
        mode: 'go',
        scope: 'daily',
        status: 'waiting',
        userIds: [session.host.user.id],
      })
      expect(stableWaitingRow.id).toBe(waitingRow.id)

      await launchDailyMultiplayer(session.rival.page)
      await chooseMultiplayerMode(session.rival.page, 'go', 'daily')
      await joinWaitingMultiplayerGame(session.rival.page, waitingRow.id, { via: 'selected' })
      const playingRow = await waitForMultiplayerRowForUsers({
        mode: 'go',
        scope: 'daily',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const game = projectionFromRow(playingRow)
      expect(game.wordLength).toBe(5)
      expect(game.timeLimitMs).toBeNull()
      expect(game.hardMode).toBe(false)
      const firstAnswer = getCurrentAnswer(game)

      await selectMultiplayerGame(session.host.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      await waitForTurn(session.host.page)
      await submitGuessWithKeyboard(session.host.page, firstAnswer)

      await expect(session.host.page.getByText(/Puzzle 2 of 5/i).first()).toBeVisible({ timeout: 20_000 })
      await expect(session.rival.page.getByText(/Puzzle 2 of 5/i).first()).toBeVisible({ timeout: 20_000 })
      const visibleAnswer = firstAnswer.toLocaleUpperCase('en-US')
      await expect(session.host.page.getByText(visibleAnswer, { exact: true }).first()).toBeVisible({ timeout: 20_000 })
      await expect(session.rival.page.getByText(visibleAnswer, { exact: true }).first()).toBeVisible({ timeout: 20_000 })
      await expectKeyboardState(session.rival.page, firstAnswer[0], 'correct')

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })
})
