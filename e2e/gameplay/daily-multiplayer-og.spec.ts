import { expect, test } from '@playwright/test'
import { expectNoConsoleFailures, expectVisibleStatus } from '../fixtures/assertions'
import { getCurrentAnswer, projectionFromRow } from '../fixtures/answers'
import { launchDailyMultiplayer, openMultiplayerMatch, joinWaitingMultiplayerGame, selectMultiplayerGame, submitGuessWithKeyboard, waitForTurn } from '../fixtures/gameActions'
import { waitForMultiplayerRowByIdForUsers, waitForMultiplayerRowForUsers } from '../fixtures/supabaseAdmin'
import { createTwoClientSession } from '../fixtures/twoClientGame'

test.describe('Daily Multiplayer OG @daily @multiplayer', () => {
  test('creates, joins, completes, and keeps the Daily claim guarded', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      await launchDailyMultiplayer(session.host.page)
      await openMultiplayerMatch(session.host.page)
      const waitingRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'daily',
        status: 'waiting',
        userIds: [session.host.user.id],
      })
      await session.host.page.waitForTimeout(1500)
      const stableWaitingRow = await waitForMultiplayerRowByIdForUsers({
        id: waitingRow.id,
        mode: 'og',
        scope: 'daily',
        status: 'waiting',
        userIds: [session.host.user.id],
      })
      expect(stableWaitingRow.id).toBe(waitingRow.id)

      await launchDailyMultiplayer(session.rival.page)
      await joinWaitingMultiplayerGame(session.rival.page, waitingRow.id, { via: 'selected' })
      const playingRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'daily',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const game = projectionFromRow(playingRow)
      expect(game.wordLength).toBe(5)
      expect(game.timeLimitMs).toBeNull()
      expect(game.hardMode).toBe(false)

      await selectMultiplayerGame(session.host.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      await waitForTurn(session.host.page)
      await submitGuessWithKeyboard(session.host.page, getCurrentAnswer(game))

      const wonRow = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'daily',
        status: 'won',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      expect(wonRow.winner_player_id).toBe('player-one')
      await expectVisibleStatus(session.host.page, /Match finished\. You won this multiplayer match\./)
      await expect(session.host.page.getByRole('button', { name: /^Daily multiplayer already claimed$/i })).toBeVisible()

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })
})
