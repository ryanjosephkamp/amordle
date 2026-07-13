import { expect, test } from '@playwright/test'
import { getGuessResult } from '../../src/game/tileStates'
import { expectKeyboardState, expectNoConsoleFailures } from '../fixtures/assertions'
import { getCurrentAnswer, getValidWrongGuess, projectionFromRow } from '../fixtures/answers'
import { chooseMultiplayerMode, navigateToPracticeMultiplayer, openMultiplayerMatch, joinWaitingMultiplayerGame, selectMultiplayerGame, setPracticeMultiplayerMatchType, setPracticeMultiplayerWordLength, submitGuessWithKeyboard, waitForTurn } from '../fixtures/gameActions'
import { upsertPublicProfileForUser, waitForMultiplayerRowByIdForUsers, waitForMultiplayerRowForUsers } from '../fixtures/supabaseAdmin'
import { createTwoClientSession } from '../fixtures/twoClientGame'

const RANKED_GO_E2E_WORD_LENGTH = 7

test.describe('Practice Multiplayer GO @practice @multiplayer', () => {
  test('matches ranked Practice GO queue requests for two real clients', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      await Promise.all([
        upsertPublicProfileForUser(session.host.user, 'cyan'),
        upsertPublicProfileForUser(session.rival.user, 'rose'),
      ])

      await navigateToPracticeMultiplayer(session.host.page)
      await chooseMultiplayerMode(session.host.page, 'go')
      await setPracticeMultiplayerWordLength(session.host.page, RANKED_GO_E2E_WORD_LENGTH)
      await setPracticeMultiplayerMatchType(session.host.page, 'ranked')
      await session.host.page.getByRole('button', { name: /^Enter ranked queue$/i }).click()
      await expect(session.host.page.getByTestId('ranked-queue-status')).toContainText(/Waiting for a compatible signed-in rival/i)

      await navigateToPracticeMultiplayer(session.rival.page)
      await chooseMultiplayerMode(session.rival.page, 'go')
      await setPracticeMultiplayerWordLength(session.rival.page, RANKED_GO_E2E_WORD_LENGTH)
      await setPracticeMultiplayerMatchType(session.rival.page, 'ranked')
      await session.rival.page.getByRole('button', { name: /^Enter ranked queue$/i }).click()

      const rankedRow = await waitForMultiplayerRowForUsers({
        mode: 'go',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const rankedGame = projectionFromRow(rankedRow)
      expect(rankedGame.mode).toBe('go')
      expect(rankedGame.ranked).toBe(true)
      expect(rankedGame.wordLength).toBe(RANKED_GO_E2E_WORD_LENGTH)
      await expect(session.host.page.getByTestId('multiplayer-selected-game')).toHaveAttribute('data-game-id', rankedRow.id, { timeout: 30_000 })
      await expect(session.rival.page.getByTestId('multiplayer-selected-game')).toHaveAttribute('data-game-id', rankedRow.id, { timeout: 30_000 })

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('keeps clients synchronized across a solved GO transition with prior rows and keyboard evidence', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      await navigateToPracticeMultiplayer(session.host.page)
      await chooseMultiplayerMode(session.host.page, 'go')
      await openMultiplayerMatch(session.host.page)
      const waitingRow = await waitForMultiplayerRowForUsers({
        mode: 'go',
        scope: 'practice',
        status: 'waiting',
        userIds: [session.host.user.id],
      })
      await session.host.page.waitForTimeout(1500)
      const stableWaitingRow = await waitForMultiplayerRowByIdForUsers({
        id: waitingRow.id,
        mode: 'go',
        scope: 'practice',
        status: 'waiting',
        userIds: [session.host.user.id],
      })
      expect(stableWaitingRow.id).toBe(waitingRow.id)

      await navigateToPracticeMultiplayer(session.rival.page)
      await chooseMultiplayerMode(session.rival.page, 'go')
      await joinWaitingMultiplayerGame(session.rival.page, waitingRow.id)

      const playingRow = await waitForMultiplayerRowForUsers({
        mode: 'go',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const game = projectionFromRow(playingRow)
      const firstAnswer = getCurrentAnswer(game)
      const secondAnswer = game.serializedSession.mode === 'go'
        ? game.serializedSession.session.puzzles[1]?.answer
        : undefined
      if (!secondAnswer) throw new Error('Practice GO E2E projection is missing puzzle two.')
      const keyboardLetter = firstAnswer[0]!
      const keyboardStates = getGuessResult(firstAnswer, secondAnswer).tiles
        .filter((tile) => tile.letter === keyboardLetter)
        .map((tile) => tile.state)
      const expectedKeyboardState = keyboardStates.includes('correct')
        ? 'correct'
        : keyboardStates.includes('present')
          ? 'present'
          : 'absent'

      await selectMultiplayerGame(session.host.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      await waitForTurn(session.host.page)
      await submitGuessWithKeyboard(session.host.page, firstAnswer)

      const visibleAnswer = firstAnswer.toLocaleUpperCase('en-US')
      await expect(session.host.page.getByText(visibleAnswer, { exact: true }).first()).toBeVisible({ timeout: 20_000 })
      await expect(session.rival.page.getByText(visibleAnswer, { exact: true }).first()).toBeVisible({ timeout: 20_000 })
      await expect(session.host.page.getByText(/Puzzle 2 of 5/i).first()).toBeVisible({ timeout: 20_000 })
      await expect(session.rival.page.getByText(/Puzzle 2 of 5/i).first()).toBeVisible({ timeout: 20_000 })
      await expectKeyboardState(session.rival.page, keyboardLetter, expectedKeyboardState)

      await session.rival.page.reload()
      await selectMultiplayerGame(session.rival.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      await expect(session.rival.page.getByText(/Puzzle 2 of 5/i).first()).toBeVisible({ timeout: 20_000 })
      await expect(session.rival.page.getByText(visibleAnswer, { exact: true }).first()).toBeVisible()

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })

  test('durably forfeits an unranked GO match after a submitted turn', async ({ browser }) => {
    const session = await createTwoClientSession(browser)
    try {
      await navigateToPracticeMultiplayer(session.host.page)
      await chooseMultiplayerMode(session.host.page, 'go')
      await openMultiplayerMatch(session.host.page)
      const waitingRow = await waitForMultiplayerRowForUsers({
        mode: 'go',
        scope: 'practice',
        status: 'waiting',
        userIds: [session.host.user.id],
      })

      await navigateToPracticeMultiplayer(session.rival.page)
      await chooseMultiplayerMode(session.rival.page, 'go')
      await joinWaitingMultiplayerGame(session.rival.page, waitingRow.id)
      const playingRow = await waitForMultiplayerRowForUsers({
        mode: 'go',
        scope: 'practice',
        status: 'playing',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const wrongGuess = getValidWrongGuess(projectionFromRow(playingRow))

      await selectMultiplayerGame(session.host.page, playingRow.id, { reloadOnStaleStatus: true, status: 'playing' })
      await waitForTurn(session.host.page)
      await submitGuessWithKeyboard(session.host.page, wrongGuess)
      await waitForTurn(session.rival.page)
      await session.rival.page.getByRole('button', { name: /^Forfeit$/i }).click()

      const forfeitedRow = await waitForMultiplayerRowByIdForUsers({
        id: playingRow.id,
        mode: 'go',
        scope: 'practice',
        status: 'lost',
        userIds: [session.host.user.id, session.rival.user.id],
      })
      const forfeitedGame = projectionFromRow(forfeitedRow)
      expect(forfeitedGame.forfeitedPlayerId).toBe('player-two')
      expect(forfeitedGame.winnerId).toBe('player-one')

      await expectNoConsoleFailures(session.host.consoleFailures)
      await expectNoConsoleFailures(session.rival.consoleFailures)
    } finally {
      await session.cleanup()
    }
  })
})
