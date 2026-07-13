import { expect, test } from '@playwright/test'
import { getCurrentAnswer, getValidWrongGuess } from '../fixtures/answers'
import { expectNoConsoleFailures, expectNoHorizontalOverflow, installConsoleGuards } from '../fixtures/assertions'
import { cleanupE2eRun } from '../fixtures/cleanup'
import { createAuthenticatedSupabaseClient, createAnonSupabaseClient, waitForMultiplayerRowForUsers } from '../fixtures/supabaseAdmin'
import { createE2eUser, signInThroughUi, type E2eUser } from '../fixtures/testUsers'
import { forfeitMultiplayerGame, submitMultiplayerGuess, type MultiplayerGame, type MultiplayerPlayerId } from '../../src/multiplayer/multiplayer'
import {
  buildFinalizedRankedGameFromStatus,
  buildRankedQueueRequestInput,
  getRankedQueueCreationIdempotencyKey,
  getRankedQueueFinalizationIdempotencyKey,
  withRankedQueueExpiry,
} from '../../src/multiplayer/multiplayerPanelRankedQueue'
import {
  createSupabaseMultiplayerRepository,
  type MultiplayerRepository,
} from '../../src/multiplayer/multiplayerRepository'
import type { GameMode } from '../../src/game/types'

interface RankedDailyPair {
  readonly gameId: string
  readonly hostRepository: MultiplayerRepository
  readonly hostRequestId: string
  readonly hostUser: E2eUser
  readonly rivalRepository: MultiplayerRepository
  readonly rivalRequestId: string
  readonly rivalUser: E2eUser
}

function getGame(snapshot: Awaited<ReturnType<MultiplayerRepository['load']>>, gameId: string): MultiplayerGame {
  const game = snapshot.state.games.find((candidate) => candidate.id === gameId)
  if (!game) {
    throw new Error('Ranked Daily E2E could not load the durable game.')
  }
  return game
}

function buildQueueInput(mode: GameMode, userId: string) {
  const dailyDateKey = new Date().toISOString().slice(0, 10)
  const base = buildRankedQueueRequestInput({
    dailyDateKey,
    hardMode: false,
    mode,
    scope: 'daily',
    wordLength: 5,
  })
  if (!base) {
    throw new Error('Unable to build ranked Daily E2E queue input.')
  }
  return withRankedQueueExpiry({
    ...base,
    idempotencyKey: getRankedQueueCreationIdempotencyKey(base, userId),
  })
}

async function queueAndFinalizeRankedDaily(
  mode: GameMode,
  hostUser: E2eUser,
  rivalUser: E2eUser,
  injectUnknownProjectionFields = false,
  confirmParticipantLoads = true,
): Promise<RankedDailyPair> {
  const hostClient = await createAuthenticatedSupabaseClient(hostUser)
  const rivalClient = await createAuthenticatedSupabaseClient(rivalUser)
  const hostRepository = createSupabaseMultiplayerRepository({ client: hostClient, userId: hostUser.id })
  const rivalRepository = createSupabaseMultiplayerRepository({ client: rivalClient, userId: rivalUser.id })
  const hostInput = buildQueueInput(mode, hostUser.id)
  const rivalInput = buildQueueInput(mode, rivalUser.id)
  const hostRequest = await hostRepository.createRankedQueueRequest(hostInput)
  const hostRetry = await hostRepository.createRankedQueueRequest(hostInput)
  expect(hostRetry.requestId).toBe(hostRequest.requestId)
  const rivalRequest = await rivalRepository.createRankedQueueRequest(rivalInput)
  const claim = await rivalRepository.claimRankedQueuePair({ requestId: rivalRequest.requestId })
  expect(claim.requestStatus).toBe('matched')
  const hostStatus = await hostRepository.getRankedQueueStatus(hostRequest.requestId)
  const rivalStatus = await rivalRepository.getRankedQueueStatus(rivalRequest.requestId)
  expect(hostStatus.requestStatus).toBe('matched')
  expect(rivalStatus.requestStatus).toBe('matched')
  expect(hostStatus.matchedGameId).toBe(rivalStatus.matchedGameId)

  const hostGame = buildFinalizedRankedGameFromStatus({
    defaultDifficulty: 'expert',
    defaultGoPuzzleCount: 5,
    status: hostStatus,
  })
  const hostIdempotencyKey = getRankedQueueFinalizationIdempotencyKey(hostStatus)
  if (!hostGame || !hostIdempotencyKey || !hostStatus.matchedGameId) {
    throw new Error('Unable to build ranked Daily E2E finalization evidence.')
  }
  const projection = injectUnknownProjectionFields
    ? ({
        ...hostGame,
        nestedPrivateEvidence: { answer: 'must-not-persist' },
        secretToken: 'must-not-persist',
      } as MultiplayerGame)
    : hostGame
  await hostRepository.finalizeRankedQueueGame({
    game: projection,
    idempotencyKey: hostIdempotencyKey,
    matchedGameId: hostStatus.matchedGameId,
    requestId: hostStatus.requestId,
  })

  const rivalGame = buildFinalizedRankedGameFromStatus({
    defaultDifficulty: 'expert',
    defaultGoPuzzleCount: 5,
    status: rivalStatus,
  })
  const rivalIdempotencyKey = getRankedQueueFinalizationIdempotencyKey(rivalStatus)
  if (!rivalGame || !rivalIdempotencyKey) {
    throw new Error('Unable to build rival ranked Daily E2E finalization evidence.')
  }
  const rivalFinalization = await rivalRepository.finalizeRankedQueueGame({
    game: rivalGame,
    idempotencyKey: rivalIdempotencyKey,
    matchedGameId: hostStatus.matchedGameId,
    requestId: rivalStatus.requestId,
  })
  expect(rivalFinalization.gameId).toBe(hostStatus.matchedGameId)

  if (confirmParticipantLoads) {
    await hostRepository.load()
    await rivalRepository.load()
  }
  return {
    gameId: hostStatus.matchedGameId,
    hostRepository,
    hostRequestId: hostRequest.requestId,
    hostUser,
    rivalRepository,
    rivalRequestId: rivalRequest.requestId,
    rivalUser,
  }
}

async function submitCurrentTurn(
  pair: RankedDailyPair,
  guessForGame: (game: MultiplayerGame) => string,
): Promise<MultiplayerGame> {
  const observerSnapshot = await pair.hostRepository.load()
  const observerGame = getGame(observerSnapshot, pair.gameId)
  const playerId = observerGame.currentTurn
  const actorUserId = observerGame.playerUserIds?.[playerId]
  const actor = actorUserId === pair.hostUser.id
    ? { playerId, repository: pair.hostRepository }
    : actorUserId === pair.rivalUser.id
      ? { playerId, repository: pair.rivalRepository }
      : undefined
  if (!actor) {
    throw new Error('Ranked Daily E2E could not resolve the current participant seat.')
  }
  const actorSnapshot = await actor.repository.load()
  const actorGame = getGame(actorSnapshot, pair.gameId)
  const submitted = submitMultiplayerGuess(actorSnapshot.state, {
    gameId: pair.gameId,
    guess: guessForGame(actorGame),
    playerId: actor.playerId,
  })
  expect(submitted.error).toBeUndefined()
  const saved = await actor.repository.save(submitted.state, actorSnapshot.version)
  return getGame(saved, pair.gameId)
}

test.describe('Ranked Daily controls @daily @multiplayer', () => {
  test('discovers a ranked Daily participant game on a fresh authenticated page', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    const users: E2eUser[] = []
    try {
      const hostUser = await createE2eUser('phase55-refresh-host')
      users.push(hostUser)
      const rivalUser = await createE2eUser('phase55-refresh-rival')
      users.push(rivalUser)
      const pair = await queueAndFinalizeRankedDaily('og', hostUser, rivalUser, false, false)
      await submitCurrentTurn(pair, (game) => getValidWrongGuess(game))

      await signInThroughUi(page, rivalUser)
      const freshPage = await page.context().newPage()
      const freshConsoleFailures = installConsoleGuards(freshPage)
      await freshPage.goto('/', { waitUntil: 'domcontentloaded' })
      await expect(freshPage.locator('#dashboard-home-title')).toBeVisible({ timeout: 20_000 })
      await expect(freshPage.getByRole('button', { name: /open (?:account menu|profile(?: tab)?) for/i })).toBeVisible({ timeout: 20_000 })
      await freshPage.getByRole('button', { name: /^Multiplayer$/i }).click()
      await freshPage.getByRole('tab', { name: /^Daily Multiplayer$/i }).click()
      await expect(freshPage.getByTestId(`multiplayer-game-tab-${pair.gameId}`)).toBeVisible({ timeout: 5_000 })

      await freshPage.getByRole('tab', { name: /^Active Games$/i }).click()
      await expect(freshPage.getByTestId(`multiplayer-active-resume-${pair.gameId}`)).toBeVisible({ timeout: 5_000 })

      await freshPage.getByRole('tab', { name: /^Live$/i }).click()
      const currentDateKey = new Date().toISOString().slice(0, 10)
      await expect(freshPage.getByRole('article', { name: new RegExp(`^Daily Multiplayer OG · ${currentDateKey}$`, 'i') })).toBeVisible({ timeout: 5_000 })
      await expectNoConsoleFailures(freshConsoleFailures)
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await cleanupE2eRun(users)
    }
  })

  test('creates and cancels a fixed-settings ranked Daily request without mobile overflow', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    let user: E2eUser | undefined
    try {
      user = await createE2eUser('ranked-daily-controls')
      await page.setViewportSize({ height: 844, width: 390 })
      await signInThroughUi(page, user)

      await page.getByRole('button', { name: /^Multiplayer$/i }).click()
      await page.getByRole('tab', { name: /^Daily Multiplayer$/i }).click()
      const panel = page.getByTestId('multiplayer-panel-daily')
      await expect(panel).toBeVisible()
      await panel.locator('select').nth(1).selectOption('ranked')

      await expect(panel.getByRole('checkbox', { name: /^Hard Mode/i })).toBeVisible()
      await expect(panel.getByLabel(/^Length$/i)).toHaveCount(0)
      await expect(panel.getByLabel(/^Time per side$/i)).toHaveCount(0)
      await expect(panel.getByRole('button', { name: /^Enter ranked Daily queue$/i })).toBeEnabled()
      await expect(panel).toContainText('Ranked Daily v1')
      await panel.getByRole('button', { name: /^Enter ranked Daily queue$/i }).click()
      await expect(panel).toContainText('Ranked Daily queue request created. Waiting for a compatible signed-in rival.')
      await panel.getByRole('button', { name: /^Cancel ranked queue$/i }).click()
      await expect(panel).toContainText('Ranked queue request cancelled.')
      await expectNoHorizontalOverflow(page)
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await cleanupE2eRun(user ? [user] : [])
    }
  })

  test('finalizes answerless ranked Daily OG, discards unknown fields, persists a turn, and settles', async () => {
    const users: E2eUser[] = []
    try {
      const hostUser = await createE2eUser('phase55-og-host')
      users.push(hostUser)
      const rivalUser = await createE2eUser('phase55-og-rival')
      users.push(rivalUser)
      const pair = await queueAndFinalizeRankedDaily('og', hostUser, rivalUser, true)
      const row = await waitForMultiplayerRowForUsers({
        mode: 'og',
        scope: 'daily',
        status: 'playing',
        userIds: users.map((user) => user.id),
      })
      const publicProjection = row.projection as Record<string, unknown>
      expect(publicProjection.serializedSession).toBeUndefined()
      expect(publicProjection.secretToken).toBeUndefined()
      expect(publicProjection.nestedPrivateEvidence).toBeUndefined()

      const afterWrongGuess = await submitCurrentTurn(pair, (game) => getValidWrongGuess(game))
      expect(afterWrongGuess.moves).toHaveLength(1)
      expect(afterWrongGuess.status).toBe('playing')
      const completed = await submitCurrentTurn(pair, (game) => getCurrentAnswer(game))
      expect(completed.status).toBe('won')
      const settlement = await pair.rivalRepository.settleRankedGame(completed)
      expect(settlement?.transactions).toHaveLength(2)
      const reloaded = getGame(await pair.hostRepository.load(), pair.gameId)
      expect(reloaded.moves).toHaveLength(2)
      expect(reloaded.status).toBe('won')

      const anon = createAnonSupabaseClient()
      const authenticated = await createAuthenticatedSupabaseClient(hostUser)
      const anonCleanup = await anon.rpc('cleanup_ranked_daily_multiplayer_for_users', { p_user_ids: [] })
      const authenticatedCleanup = await authenticated.rpc('cleanup_ranked_daily_multiplayer_for_users', { p_user_ids: [] })
      expect(anonCleanup.error).toBeTruthy()
      expect(authenticatedCleanup.error).toBeTruthy()
    } finally {
      await cleanupE2eRun(users)
    }
  })

  test('requeues with fresh request ids after pre-move cancellation and keeps ranked Daily GO puzzle five active', async () => {
    const users: E2eUser[] = []
    try {
      const hostUser = await createE2eUser('phase55-go-host')
      users.push(hostUser)
      const rivalUser = await createE2eUser('phase55-go-rival')
      users.push(rivalUser)
      const cancelledPair = await queueAndFinalizeRankedDaily('go', hostUser, rivalUser)
      const hostSnapshot = await cancelledPair.hostRepository.load()
      const hostGame = getGame(hostSnapshot, cancelledPair.gameId)
      const hostPlayerId = (Object.entries(hostGame.playerUserIds ?? {})
        .find(([, userId]) => userId === hostUser.id)?.[0]) as MultiplayerPlayerId | undefined
      if (!hostPlayerId) {
        throw new Error('Ranked Daily E2E could not resolve the host participant seat.')
      }
      const cancelled = forfeitMultiplayerGame(hostSnapshot.state, {
        gameId: cancelledPair.gameId,
        playerId: hostPlayerId,
      })
      expect(cancelled.error).toBeUndefined()
      await cancelledPair.hostRepository.save(cancelled.state, hostSnapshot.version)

      const pair = await queueAndFinalizeRankedDaily('go', hostUser, rivalUser)
      expect(pair.gameId).not.toBe(cancelledPair.gameId)
      expect(pair.hostRequestId).not.toBe(cancelledPair.hostRequestId)
      expect(pair.rivalRequestId).not.toBe(cancelledPair.rivalRequestId)

      for (let puzzleIndex = 0; puzzleIndex < 4; puzzleIndex += 1) {
        const solved = await submitCurrentTurn(pair, (game) => getCurrentAnswer(game))
        expect(solved.serializedSession.mode).toBe('go')
        if (solved.serializedSession.mode === 'go') {
          expect(solved.serializedSession.session.currentPuzzleIndex).toBe(puzzleIndex + 1)
        }
      }
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const continued = await submitCurrentTurn(pair, (game) => getValidWrongGuess(game))
        expect(continued.status).toBe('playing')
        expect(continued.serializedSession.mode).toBe('go')
        if (continued.serializedSession.mode === 'go') {
          expect(continued.serializedSession.session.currentPuzzleIndex).toBe(4)
        }
      }
      const completed = await submitCurrentTurn(pair, (game) => getCurrentAnswer(game))
      expect(completed.status).toBe('won')
      expect(completed.moves.length).toBeGreaterThanOrEqual(10)
      const settlement = await pair.hostRepository.settleRankedGame(completed)
      expect(settlement?.transactions).toHaveLength(2)
    } finally {
      await cleanupE2eRun(users)
    }
  })

  test('serializes concurrent ranked Daily claims around the oldest queued request', async () => {
    const users: E2eUser[] = []
    try {
      for (const label of ['phase55-fifo-oldest', 'phase55-fifo-second', 'phase55-fifo-third']) {
        users.push(await createE2eUser(label))
      }
      const repositories: MultiplayerRepository[] = []
      for (const user of users) {
        const client = await createAuthenticatedSupabaseClient(user)
        repositories.push(createSupabaseMultiplayerRepository({ client, userId: user.id }))
      }
      const requests = []
      for (let index = 0; index < users.length; index += 1) {
        requests.push(await repositories[index]!.createRankedQueueRequest(buildQueueInput('og', users[index]!.id)))
        await new Promise((resolve) => setTimeout(resolve, 25))
      }

      const claims = await Promise.allSettled([
        repositories[1]!.claimRankedQueuePair({ requestId: requests[1]!.requestId }),
        repositories[2]!.claimRankedQueuePair({ requestId: requests[2]!.requestId }),
      ])
      expect(claims.every((claim) => claim.status === 'fulfilled')).toBe(true)
      const statuses = await Promise.all(repositories.map((repository, index) => (
        repository.getRankedQueueStatus(requests[index]!.requestId)
      )))
      expect(statuses[0]!.requestStatus).toBe('matched')
      expect(statuses.filter((status) => status.requestStatus === 'matched')).toHaveLength(2)
      expect(statuses.filter((status) => status.requestStatus === 'queued')).toHaveLength(1)
      expect(new Set(statuses.flatMap((status) => status.matchedGameId ?? [])).size).toBe(1)
    } finally {
      await cleanupE2eRun(users)
    }
  })
})
