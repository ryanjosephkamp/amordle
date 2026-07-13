import { describe, expect, it } from 'vitest'
import { DEFAULT_DIFFICULTY_TIER } from '../data/difficulty'
import { createPracticeGoSetup, createPracticeOgSetup, restoreGoSession, restoreOgSession } from '../game'
import {
  MAX_MULTIPLAYER_GAMES,
  addMultiplayerGame,
  canCreateMultiplayerGame,
  canViewerCancelMultiplayerGame,
  cancelMultiplayerGame,
  createMultiplayerGame,
  createEmptyMultiplayerState,
  expireStaleDailyMultiplayerGames,
  expireTimedOutPracticeMultiplayerGames,
  forfeitMultiplayerGame,
  getMultiplayerClockState,
  getMultiplayerSessionForPlayer,
  getViewerMultiplayerPlayerId,
  getMultiplayerAnswerWords,
  hasDailyMultiplayerParticipation,
  joinMultiplayerGame,
  submitMultiplayerGuess,
} from './multiplayer'
import { createDailyMultiplayerGoSetup, createDailyMultiplayerOgSetup } from './dailyMultiplayer'

describe('multiplayer foundation', () => {
  it('creates a daily multiplayer game with a UTC date key and deadline', () => {
    const game = createMultiplayerGame({
      createdAt: '2026-05-26T23:30:00.000Z',
      mode: 'og',
      scope: 'daily',
    })

    expect(game.dailyDateKey).toBe('2026-05-26')
    expect(game.deadlineAt).toBe('2026-05-27T00:00:00.000Z')
    expect(game.wordLength).toBe(5)
  })

  it.each([7, 10] as const)('preserves a configured %i-puzzle chain for unranked Daily GO', (goPuzzleCount) => {
    const game = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      goPuzzleCount,
      mode: 'go',
      ranked: false,
      scope: 'daily',
    })

    expect(game.goPuzzleCount).toBe(goPuzzleCount)
    expect(getMultiplayerAnswerWords(game)).toHaveLength(goPuzzleCount)
  })

  it('submits a winning og turn and records the move history', () => {
    const game = createMultiplayerGame({ mode: 'og', scope: 'practice', wordLength: 5, seed: 1 })
    const answer = getMultiplayerAnswerWords(game)[0]
    const state = addMultiplayerGame(createEmptyMultiplayerState(), game)
    const result = submitMultiplayerGuess(state, {
      gameId: game.id,
      guess: answer,
      now: '2026-05-26T12:00:00.000Z',
    })

    expect(result.error).toBeUndefined()
    expect(result.game?.status).toBe('won')
    expect(result.game?.winnerId).toBe('player-one')
    expect(result.game?.moves).toHaveLength(1)
    expect(result.game?.moves[0].guess).toBe(answer)
  })

  it('keeps online multiplayer matches waiting until a second user joins', () => {
    const game = createMultiplayerGame({
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      wordLength: 5,
    })
    const waiting = addMultiplayerGame(createEmptyMultiplayerState(), game)
    const blocked = submitMultiplayerGuess(waiting, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      playerId: 'player-one',
    })
    const joined = joinMultiplayerGame(waiting, {
      gameId: game.id,
      userId: 'rival-user',
    })

    expect(game.status).toBe('waiting')
    expect(blocked.error).toContain('Waiting for another player')
    expect(joined.error).toBeUndefined()
    expect(joined.game?.status).toBe('playing')
    expect(joined.game?.playerUserIds?.['player-two']).toBe('rival-user')
    expect(getViewerMultiplayerPlayerId(joined.game!, 'rival-user')).toBe('player-two')
  })

  it('rejects a second Daily Multiplayer claim for the same user, day, and mode', () => {
    const claimed = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1' },
      scope: 'daily',
    })
    const available = createMultiplayerGame({
      createdAt: '2026-06-04T12:05:00.000Z',
      dailyDateKey: '2026-06-04',
      mode: 'og',
      playerUserIds: { 'player-one': 'other-user' },
      scope: 'daily',
    })
    const state = { games: [available, claimed] }
    const result = joinMultiplayerGame(state, {
      gameId: available.id,
      userId: 'user-1',
    })

    expect(hasDailyMultiplayerParticipation(state, '2026-06-04', 'og', 'user-1')).toBe(true)
    expect(result.error).toContain('already claimed')
  })

  it('allows separate Daily Multiplayer OG and GO claims for the same user and UTC day', () => {
    const og = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1' },
      scope: 'daily',
    })
    const go = createMultiplayerGame({
      createdAt: '2026-06-04T12:02:00.000Z',
      dailyDateKey: '2026-06-04',
      mode: 'go',
      playerUserIds: { 'player-one': 'user-1' },
      scope: 'daily',
    })
    const state = addMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), og), go)

    expect(state.games.map((game) => game.mode).sort()).toEqual(['go', 'og'])
    expect(hasDailyMultiplayerParticipation(state, '2026-06-04', 'og', 'user-1')).toBe(true)
    expect(hasDailyMultiplayerParticipation(state, '2026-06-04', 'go', 'user-1')).toBe(true)
  })

  it('allows independent ranked and unranked Daily claims for each mode', () => {
    const games = [
      createMultiplayerGame({ dailyDateKey: '2026-06-04', mode: 'og', playerUserIds: { 'player-one': 'user-1' }, ranked: false, scope: 'daily' }),
      createMultiplayerGame({ dailyDateKey: '2026-06-04', hardMode: true, mode: 'og', playerUserIds: { 'player-one': 'user-1' }, ranked: true, ratingBucket: 'multiplayer:og:daily:v1', scope: 'daily' }),
      createMultiplayerGame({ dailyDateKey: '2026-06-04', mode: 'go', playerUserIds: { 'player-one': 'user-1' }, ranked: false, scope: 'daily' }),
      createMultiplayerGame({ dailyDateKey: '2026-06-04', mode: 'go', playerUserIds: { 'player-one': 'user-1' }, ranked: true, ratingBucket: 'multiplayer:go:daily:v1', scope: 'daily' }),
    ]
    const state = games.reduce(addMultiplayerGame, createEmptyMultiplayerState())

    expect(state.games).toHaveLength(4)
    expect(hasDailyMultiplayerParticipation(state, '2026-06-04', 'og', 'user-1', false)).toBe(true)
    expect(hasDailyMultiplayerParticipation(state, '2026-06-04', 'og', 'user-1', true)).toBe(true)
    expect(hasDailyMultiplayerParticipation(state, '2026-06-04', 'go', 'user-1', false)).toBe(true)
    expect(hasDailyMultiplayerParticipation(state, '2026-06-04', 'go', 'user-1', true)).toBe(true)
  })

  it('enables Hard Mode only for ranked Daily and uses the ranked answer namespace', () => {
    const ranked = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      hardMode: true,
      mode: 'og',
      ranked: true,
      ratingBucket: 'multiplayer:og:daily:v1',
      scope: 'daily',
    })
    const unranked = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      hardMode: true,
      mode: 'og',
      ranked: false,
      scope: 'daily',
    })
    const rankedSetup = createDailyMultiplayerOgSetup(new Date('2026-06-04T12:00:00.000Z'), DEFAULT_DIFFICULTY_TIER, true)
    const rankedGo = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      goPuzzleCount: 7,
      mode: 'go',
      ranked: true,
      ratingBucket: 'multiplayer:go:daily:v1',
      scope: 'daily',
    })

    expect(ranked.hardMode).toBe(true)
    expect(getMultiplayerSessionForPlayer(ranked, 'player-one').session.hardMode).toBe(true)
    expect(ranked.serializedSession.mode).toBe('og')
    expect(ranked.serializedSession.mode === 'og' ? ranked.serializedSession.session.answer : '').toBe(rankedSetup.answer)
    expect(unranked.hardMode).toBe(false)
    expect(getMultiplayerSessionForPlayer(unranked, 'player-one').session.hardMode).toBe(false)
    expect(getMultiplayerAnswerWords(ranked)).not.toEqual(getMultiplayerAnswerWords(unranked))
    expect(rankedGo.goPuzzleCount).toBe(5)
    expect(getMultiplayerAnswerWords(rankedGo)).toHaveLength(5)
  })

  it('rejects multiplayer turns from the wrong player seat', () => {
    const game = createMultiplayerGame({
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      wordLength: 5,
    })
    const joined = joinMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), game), {
      gameId: game.id,
      userId: 'rival-user',
    })
    const rejected = submitMultiplayerGuess(joined.state, {
      gameId: game.id,
      guess: getMultiplayerAnswerWords(game)[0],
      playerId: 'player-two',
    })

    expect(rejected.error).toContain('not this player')
  })

  it('lets either player forfeit an online multiplayer match', () => {
    const game = createMultiplayerGame({
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      seed: 1,
      scope: 'practice',
      wordLength: 5,
    })
    const setup = createPracticeOgSetup(5, 1)
    const answer = getMultiplayerAnswerWords(game)[0]
    const wrongGuess = [...setup.validGuesses].find((candidate) => candidate !== answer)
    expect(wrongGuess).toBeTruthy()
    const joined = joinMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), game), {
      gameId: game.id,
      userId: 'rival-user',
    })
    const submitted = submitMultiplayerGuess(joined.state, {
      gameId: game.id,
      guess: wrongGuess!,
      now: '2026-06-04T12:30:00.000Z',
      playerId: 'player-one',
    })
    const forfeited = forfeitMultiplayerGame(submitted.state, {
      gameId: game.id,
      now: '2026-06-04T13:00:00.000Z',
      playerId: 'player-two',
    })

    expect(forfeited.error).toBeUndefined()
    expect(forfeited.game?.status).toBe('lost')
    expect(forfeited.game?.winnerId).toBe('player-one')
    expect(forfeited.game?.endedAt).toBe('2026-06-04T13:00:00.000Z')
  })

  it('treats a pre-guess online multiplayer forfeit as a cancellation without a winner', () => {
    const game = createMultiplayerGame({
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      wordLength: 5,
    })
    const joined = joinMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), game), {
      gameId: game.id,
      userId: 'rival-user',
    })
    const forfeited = forfeitMultiplayerGame(joined.state, {
      gameId: game.id,
      now: '2026-06-04T13:00:00.000Z',
      playerId: 'player-two',
    })

    expect(forfeited.error).toBeUndefined()
    expect(forfeited.game?.status).toBe('cancelled')
    expect(forfeited.game?.winnerId).toBeUndefined()
    expect(forfeited.game?.endedAt).toBe('2026-06-04T13:00:00.000Z')
  })

  it('advances a go chain turn without losing the serialized chain state', () => {
    const game = createMultiplayerGame({ goPuzzleCount: 5, mode: 'go', scope: 'practice', wordLength: 5, seed: 1 })
    const firstAnswer = getMultiplayerAnswerWords(game)[0]
    const state = addMultiplayerGame(createEmptyMultiplayerState(), game)
    const result = submitMultiplayerGuess(state, {
      gameId: game.id,
      guess: firstAnswer,
      now: '2026-05-26T12:00:00.000Z',
    })

    expect(result.error).toBeUndefined()
    expect(result.game?.status).toBe('playing')
    expect(result.game?.currentTurn).toBe('player-two')
    expect(result.game?.serializedSession.mode).toBe('go')
    if (result.game?.serializedSession.mode === 'go') {
      expect(result.game.serializedSession.session.currentPuzzleIndex).toBe(1)
    }
  })

  it('advances both player go sessions when either player solves a shared puzzle', () => {
    const game = createMultiplayerGame({
      goPuzzleCount: 5,
      mode: 'go',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const setup = createPracticeGoSetup(5, 1)
    const firstAnswer = getMultiplayerAnswerWords(game)[0]
    const joined = joinMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), game), {
      gameId: game.id,
      now: '2026-06-04T12:00:00.000Z',
      userId: 'rival-user',
    })
    const submitted = submitMultiplayerGuess(joined.state, {
      gameId: game.id,
      guess: firstAnswer,
      now: '2026-06-04T12:00:05.000Z',
      playerId: 'player-one',
    })

    const playerOneSession = getMultiplayerSessionForPlayer(submitted.game!, 'player-one')
    const playerTwoSession = getMultiplayerSessionForPlayer(submitted.game!, 'player-two')
    expect(playerOneSession.mode).toBe('go')
    expect(playerTwoSession.mode).toBe('go')
    if (playerOneSession.mode !== 'go' || playerTwoSession.mode !== 'go') {
      throw new Error('Expected GO player sessions')
    }
    const playerOneRestored = restoreGoSession(playerOneSession.session, setup.validGuesses)
    const playerTwoRestored = restoreGoSession(playerTwoSession.session, setup.validGuesses)

    expect(submitted.error).toBeUndefined()
    expect(submitted.game?.moves[0]).toMatchObject({ guess: firstAnswer, puzzleIndex: 0 })
    expect(playerOneRestored.currentPuzzleIndex).toBe(1)
    expect(playerTwoRestored.currentPuzzleIndex).toBe(1)
    expect(playerOneRestored.priorAnswers).toEqual([firstAnswer])
    expect(playerTwoRestored.priorAnswers).toEqual([firstAnswer])
  })

  it('finishes both player go sessions when either player solves the final shared puzzle', () => {
    const game = createMultiplayerGame({
      goPuzzleCount: 5,
      mode: 'go',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const setup = createPracticeGoSetup(5, 1)
    const answers = getMultiplayerAnswerWords(game)
    const joined = joinMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), game), {
      gameId: game.id,
      now: '2026-06-04T12:00:00.000Z',
      userId: 'rival-user',
    })
    let state = joined.state
    let current = joined.game!

    for (let index = 0; index < answers.length; index += 1) {
      const playerId = current.currentTurn
      const submitted = submitMultiplayerGuess(state, {
        gameId: current.id,
        guess: answers[index],
        now: `2026-06-04T12:00:${(index + 1).toString().padStart(2, '0')}.000Z`,
        playerId,
      })
      expect(submitted.error).toBeUndefined()
      state = submitted.state
      current = submitted.game!
    }

    const playerOneSession = getMultiplayerSessionForPlayer(current, 'player-one')
    const playerTwoSession = getMultiplayerSessionForPlayer(current, 'player-two')
    expect(playerOneSession.mode).toBe('go')
    expect(playerTwoSession.mode).toBe('go')
    if (playerOneSession.mode !== 'go' || playerTwoSession.mode !== 'go') {
      throw new Error('Expected GO player sessions')
    }
    const playerOneRestored = restoreGoSession(playerOneSession.session, setup.validGuesses)
    const playerTwoRestored = restoreGoSession(playerTwoSession.session, setup.validGuesses)

    expect(current.status).toBe('won')
    expect(playerOneRestored.status).toBe('won')
    expect(playerTwoRestored.status).toBe('won')
    expect(playerOneRestored.priorAnswers).toEqual(answers)
    expect(playerTwoRestored.priorAnswers).toEqual(answers)
  })

  it.each(['practice', 'daily'] as const)('keeps the final %s go puzzle playing until a correct solve', (scope) => {
    const game = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      goPuzzleCount: 5,
      mode: 'go',
      playerUserIds: { 'player-one': 'host-user' },
      scope,
      seed: 1,
      wordLength: 5,
    })
    const setup = scope === 'daily'
      ? createDailyMultiplayerGoSetup(new Date('2026-06-04T00:00:00.000Z'), DEFAULT_DIFFICULTY_TIER, 5)
      : createPracticeGoSetup(5, 1)
    const answers = getMultiplayerAnswerWords(game)
    const joined = joinMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), game), {
      gameId: game.id,
      now: '2026-06-04T12:00:00.000Z',
      userId: 'rival-user',
    })
    let state = joined.state
    let current = joined.game!

    for (let index = 0; index < answers.length - 1; index += 1) {
      const submitted = submitMultiplayerGuess(state, {
        gameId: current.id,
        guess: answers[index],
        now: `2026-06-04T12:00:${(index + 1).toString().padStart(2, '0')}.000Z`,
        playerId: current.currentTurn,
      })
      expect(submitted.error).toBeUndefined()
      state = submitted.state
      current = submitted.game!
      expect(current.status).toBe('playing')
    }

    const finalAnswer = answers[answers.length - 1]
    const wrongGuesses = [...setup.validGuesses].filter((candidate) => candidate !== finalAnswer).slice(0, 4)
    expect(wrongGuesses).toHaveLength(4)

    for (const [index, wrongGuess] of wrongGuesses.entries()) {
      const submitted = submitMultiplayerGuess(state, {
        gameId: current.id,
        guess: wrongGuess,
        now: `2026-06-04T12:01:${(index + 1).toString().padStart(2, '0')}.000Z`,
        playerId: current.currentTurn,
      })
      expect(submitted.error).toBeUndefined()
      state = submitted.state
      current = submitted.game!
      expect(current.status).toBe('playing')
    }

    const playerOneSession = getMultiplayerSessionForPlayer(current, 'player-one')
    const playerTwoSession = getMultiplayerSessionForPlayer(current, 'player-two')
    expect(playerOneSession.mode).toBe('go')
    expect(playerTwoSession.mode).toBe('go')
    if (playerOneSession.mode !== 'go' || playerTwoSession.mode !== 'go') {
      throw new Error('Expected GO player sessions')
    }
    expect(restoreGoSession(playerOneSession.session, setup.validGuesses).status).toBe('playing')
    expect(restoreGoSession(playerTwoSession.session, setup.validGuesses).status).toBe('playing')

    const solved = submitMultiplayerGuess(state, {
      gameId: current.id,
      guess: finalAnswer,
      now: '2026-06-04T12:02:00.000Z',
      playerId: current.currentTurn,
    })
    expect(solved.error).toBeUndefined()
    expect(solved.game?.status).toBe('won')
  })

  it.each(['practice', 'daily'] as const)('advances both %s go players when one solves a shared puzzle after the rival has run out of attempts', (scope) => {
    const game = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      goPuzzleCount: 5,
      mode: 'go',
      playerUserIds: { 'player-one': 'host-user' },
      scope,
      seed: 1,
      wordLength: 5,
    })
    const setup = scope === 'daily'
      ? createDailyMultiplayerGoSetup(new Date('2026-06-04T00:00:00.000Z'), DEFAULT_DIFFICULTY_TIER, 5)
      : createPracticeGoSetup(5, 1)
    const answers = getMultiplayerAnswerWords(game)
    const joined = joinMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), game), {
      gameId: game.id,
      now: '2026-06-04T12:00:00.000Z',
      userId: 'rival-user',
    })
    let state = joined.state
    let current = joined.game!

    for (let index = 0; index < 3; index += 1) {
      const submitted = submitMultiplayerGuess(state, {
        gameId: current.id,
        guess: answers[index],
        now: `2026-06-04T12:00:${(index + 1).toString().padStart(2, '0')}.000Z`,
        playerId: current.currentTurn,
      })
      expect(submitted.error).toBeUndefined()
      state = submitted.state
      current = submitted.game!
      expect(current.status).toBe('playing')
    }

    const fourthAnswer = answers[3]
    const wrongGuesses = [...setup.validGuesses].filter((candidate) => candidate !== fourthAnswer).slice(0, 5)
    expect(wrongGuesses).toHaveLength(5)

    for (const [index, wrongGuess] of wrongGuesses.entries()) {
      const submitted = submitMultiplayerGuess(state, {
        gameId: current.id,
        guess: wrongGuess,
        now: `2026-06-04T12:01:${(index + 1).toString().padStart(2, '0')}.000Z`,
        playerId: current.currentTurn,
      })
      expect(submitted.error).toBeUndefined()
      state = submitted.state
      current = submitted.game!
      expect(current.status).toBe('playing')
    }

    const playerTwoBeforeSolve = getMultiplayerSessionForPlayer(current, 'player-two')
    expect(playerTwoBeforeSolve.mode).toBe('go')
    if (playerTwoBeforeSolve.mode !== 'go') {
      throw new Error('Expected player two GO session.')
    }
    expect(restoreGoSession(playerTwoBeforeSolve.session, setup.validGuesses).status).toBe('lost')
    expect(current.currentTurn).toBe('player-one')

    const solved = submitMultiplayerGuess(state, {
      gameId: current.id,
      guess: fourthAnswer,
      now: '2026-06-04T12:02:00.000Z',
      playerId: 'player-one',
    })
    expect(solved.error).toBeUndefined()
    expect(solved.game?.status).toBe('playing')
    expect(solved.game?.currentTurn).toBe('player-two')

    const playerOneSession = getMultiplayerSessionForPlayer(solved.game!, 'player-one')
    const playerTwoSession = getMultiplayerSessionForPlayer(solved.game!, 'player-two')
    expect(playerOneSession.mode).toBe('go')
    expect(playerTwoSession.mode).toBe('go')
    if (playerOneSession.mode !== 'go' || playerTwoSession.mode !== 'go') {
      throw new Error('Expected GO player sessions.')
    }

    const playerOneRestored = restoreGoSession(playerOneSession.session, setup.validGuesses)
    const playerTwoRestored = restoreGoSession(playerTwoSession.session, setup.validGuesses)
    expect(playerOneRestored.currentPuzzleIndex).toBe(4)
    expect(playerTwoRestored.currentPuzzleIndex).toBe(4)
    expect(playerOneRestored.status).toBe('playing')
    expect(playerTwoRestored.status).toBe('playing')
    expect(playerOneRestored.priorAnswers).toEqual(answers.slice(0, 4))
    expect(playerTwoRestored.priorAnswers).toEqual(answers.slice(0, 4))

    const fifthAnswer = answers[4]
    const fifthWrongGuess = [...setup.validGuesses].find((candidate) => candidate !== fifthAnswer)!
    const fifthSubmitted = submitMultiplayerGuess(solved.state, {
      gameId: current.id,
      guess: fifthWrongGuess,
      now: '2026-06-04T12:02:01.000Z',
      playerId: 'player-two',
    })
    expect(fifthSubmitted.error).toBeUndefined()
    expect(fifthSubmitted.game?.status).toBe('playing')
    expect(fifthSubmitted.game?.moves[fifthSubmitted.game.moves.length - 1]).toMatchObject({
      playerId: 'player-two',
      puzzleIndex: 4,
    })
    expect(fifthSubmitted.game?.currentTurn).toBe('player-one')
  })

  it('expires in-progress daily multiplayer games after their UTC day changes', () => {
    const game = createMultiplayerGame({
      createdAt: '2026-05-26T12:00:00.000Z',
      mode: 'og',
      scope: 'daily',
    })
    const expired = expireStaleDailyMultiplayerGames(
      addMultiplayerGame(createEmptyMultiplayerState(), game),
      new Date('2026-05-27T00:00:01.000Z'),
    )

    expect(expired.games[0].status).toBe('expired')
    expect(expired.games[0].endedAt).toBe('2026-05-27T00:00:01.000Z')
  })

  it('enforces the five active multiplayer game limit', () => {
    let state = createEmptyMultiplayerState()
    for (let index = 0; index < MAX_MULTIPLAYER_GAMES; index += 1) {
      state = addMultiplayerGame(state, createMultiplayerGame({ mode: 'og', scope: 'practice', seed: index, wordLength: 5 }))
    }

    expect(canCreateMultiplayerGame(state)).toBe(false)
    const rejected = addMultiplayerGame(state, createMultiplayerGame({ mode: 'og', scope: 'practice', seed: 99, wordLength: 5 }))
    expect(rejected.games).toHaveLength(MAX_MULTIPLAYER_GAMES)
  })

  it('scopes the active multiplayer game limit to the authenticated player', () => {
    let state = createEmptyMultiplayerState()
    for (let index = 0; index < MAX_MULTIPLAYER_GAMES; index += 1) {
      state = addMultiplayerGame(state, createMultiplayerGame({
        mode: 'og',
        playerUserIds: { 'player-one': `other-${index}` },
        scope: 'practice',
        seed: index,
        wordLength: 5,
      }))
    }

    expect(canCreateMultiplayerGame(state, 'user-1')).toBe(true)

    for (let index = 0; index < MAX_MULTIPLAYER_GAMES; index += 1) {
      state = addMultiplayerGame(state, createMultiplayerGame({
        mode: 'og',
        playerUserIds: { 'player-one': 'user-1' },
        scope: 'practice',
        seed: 100 + index,
        wordLength: 5,
      }))
    }

    expect(canCreateMultiplayerGame(state, 'user-1')).toBe(false)
    const rejected = addMultiplayerGame(state, createMultiplayerGame({
      mode: 'og',
      playerUserIds: { 'player-one': 'user-1' },
      scope: 'practice',
      seed: 999,
      wordLength: 5,
    }))
    expect(rejected.games.filter((game) => game.playerUserIds?.['player-one'] === 'user-1')).toHaveLength(MAX_MULTIPLAYER_GAMES)
  })

  it('blocks duplicate Daily Multiplayer creation in the domain layer', () => {
    const first = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      mode: 'go',
      playerUserIds: { 'player-one': 'user-1' },
      scope: 'daily',
    })
    const duplicate = createMultiplayerGame({
      createdAt: '2026-06-04T12:02:00.000Z',
      dailyDateKey: '2026-06-04',
      mode: 'go',
      playerUserIds: { 'player-one': 'user-1' },
      scope: 'daily',
    })
    const state = addMultiplayerGame(createEmptyMultiplayerState(), first)
    const next = addMultiplayerGame(state, duplicate)

    expect(next.games.map((game) => game.id)).toEqual([first.id])
  })

  it('lets only the creator cancel an unjoined multiplayer lobby and releases the Daily claim', () => {
    const lobby = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'daily',
    })
    const state = addMultiplayerGame(createEmptyMultiplayerState(), lobby)
    const rivalDenied = cancelMultiplayerGame(state, {
      gameId: lobby.id,
      userId: 'rival-user',
    })
    const cancelled = cancelMultiplayerGame(state, {
      gameId: lobby.id,
      now: '2026-06-04T12:05:00.000Z',
      userId: 'host-user',
    })

    expect(canViewerCancelMultiplayerGame(lobby, 'host-user')).toBe(true)
    expect(rivalDenied.error).toContain('Only the creator')
    expect(cancelled.error).toBeUndefined()
    expect(cancelled.game?.status).toBe('cancelled')
    expect(canCreateMultiplayerGame(cancelled.state, 'host-user')).toBe(true)
    expect(hasDailyMultiplayerParticipation(cancelled.state, '2026-06-04', 'og', 'host-user')).toBe(false)
  })

  it('runs a Practice multiplayer chess clock only after the rival joins', () => {
    const waiting = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      timeLimitMs: 30_000,
      wordLength: 5,
    })

    expect(waiting.status).toBe('waiting')
    expect(waiting.turnStartedAt).toBeUndefined()
    expect(waiting.timeRemainingMs?.['player-one']).toBe(30_000)
    expect(waiting.timeRemainingMs?.['player-two']).toBe(30_000)

    const joined = joinMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), waiting), {
      gameId: waiting.id,
      now: '2026-06-04T12:00:05.000Z',
      userId: 'rival-user',
    })
    const clock = getMultiplayerClockState(joined.game!, new Date('2026-06-04T12:00:15.000Z'))

    expect(joined.game?.status).toBe('playing')
    expect(joined.game?.turnStartedAt).toBe('2026-06-04T12:00:05.000Z')
    expect(clock?.remainingByPlayer['player-one']).toBe(20_000)
    expect(clock?.remainingByPlayer['player-two']).toBe(30_000)
  })

  it('keeps non-terminal timed Practice clock ticks local until a turn is submitted', () => {
    const waiting = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      timeLimitMs: 30_000,
      wordLength: 5,
    })
    const joined = joinMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), waiting), {
      gameId: waiting.id,
      now: '2026-06-04T12:00:00.000Z',
      userId: 'rival-user',
    })

    const firstTick = expireTimedOutPracticeMultiplayerGames(joined.state, new Date('2026-06-04T12:00:10.000Z'), 'host-user')
    const secondTick = expireTimedOutPracticeMultiplayerGames(firstTick, new Date('2026-06-04T12:00:15.000Z'), 'host-user')
    const game = secondTick.games[0]
    const clock = getMultiplayerClockState(game, new Date('2026-06-04T12:00:15.000Z'))

    expect(firstTick.games[0].timeRemainingMs?.['player-one']).toBe(30_000)
    expect(firstTick.games[0].turnStartedAt).toBe('2026-06-04T12:00:00.000Z')
    expect(game.status).toBe('playing')
    expect(game.timeRemainingMs?.['player-one']).toBe(30_000)
    expect(game.turnStartedAt).toBe('2026-06-04T12:00:00.000Z')
    expect(clock?.remainingByPlayer['player-one']).toBe(15_000)
    expect(clock?.remainingByPlayer['player-two']).toBe(30_000)
  })

  it('keeps timed Practice boards per-player and decrements only the active player clock', () => {
    const waiting = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      seed: 1,
      timeLimitMs: 30_000,
      wordLength: 5,
    })
    const setup = createPracticeOgSetup(5, 1)
    const answer = getMultiplayerAnswerWords(waiting)[0]
    const firstGuess = [...setup.validGuesses].find((word) => word !== answer)
    expect(firstGuess).toBeTruthy()
    const joined = joinMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), waiting), {
      gameId: waiting.id,
      now: '2026-06-04T12:00:00.000Z',
      userId: 'rival-user',
    })

    const submitted = submitMultiplayerGuess(joined.state, {
      gameId: waiting.id,
      guess: firstGuess!,
      now: '2026-06-04T12:00:05.000Z',
      playerId: 'player-one',
    })
    const playerOneSession = getMultiplayerSessionForPlayer(submitted.game!, 'player-one')
    const playerTwoSession = getMultiplayerSessionForPlayer(submitted.game!, 'player-two')
    expect(playerOneSession.mode).toBe('og')
    expect(playerTwoSession.mode).toBe('og')
    if (playerOneSession.mode !== 'og' || playerTwoSession.mode !== 'og') {
      throw new Error('Expected OG multiplayer sessions')
    }
    const playerOneRestored = restoreOgSession(playerOneSession.session, setup.validGuesses)
    const playerTwoRestored = restoreOgSession(playerTwoSession.session, setup.validGuesses)
    const clock = getMultiplayerClockState(submitted.game!, new Date('2026-06-04T12:00:10.000Z'))

    expect(submitted.error).toBeUndefined()
    expect(submitted.game?.moves).toHaveLength(1)
    expect(submitted.game?.currentTurn).toBe('player-two')
    expect(playerOneRestored.guesses.map((guess) => guess.guess)).toEqual([firstGuess])
    expect(playerTwoRestored.guesses).toHaveLength(0)
    expect(clock?.remainingByPlayer['player-one']).toBe(25_000)
    expect(clock?.remainingByPlayer['player-two']).toBe(25_000)
  })

  it('creates Practice Multiplayer Hard Mode games and validates guesses with canonical constraints', () => {
    const waiting = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      hardMode: true,
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const setup = createPracticeOgSetup(5, 1)
    const answer = getMultiplayerAnswerWords(waiting)[0]
    const joined = joinMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), waiting), {
      gameId: waiting.id,
      now: '2026-06-04T12:00:00.000Z',
      userId: 'rival-user',
    })
    const firstGuess = [...setup.validGuesses].find((candidate) => {
      if (candidate === answer) {
        return false
      }
      const submitted = submitMultiplayerGuess(joined.state, {
        gameId: waiting.id,
        guess: candidate,
        now: '2026-06-04T12:00:05.000Z',
        playerId: 'player-one',
      })
      return submitted.game?.moves[0]?.tiles.some((tile) => tile.state === 'present' || tile.state === 'correct')
    })
    expect(firstGuess).toBeTruthy()
    const first = submitMultiplayerGuess(joined.state, {
      gameId: waiting.id,
      guess: firstGuess!,
      now: '2026-06-04T12:00:05.000Z',
      playerId: 'player-one',
    })
    const requiredLetter = first.game!.moves[0].tiles.find((tile) => tile.state === 'present' || tile.state === 'correct')!.letter
    const invalidHardModeGuess = [...setup.validGuesses].find((candidate) => candidate.length === 5 && !candidate.includes(requiredLetter))
    expect(invalidHardModeGuess).toBeTruthy()
    const second = submitMultiplayerGuess({ games: [{ ...first.game!, currentTurn: 'player-one' }] }, {
      gameId: waiting.id,
      guess: invalidHardModeGuess!,
      now: '2026-06-04T12:00:10.000Z',
      playerId: 'player-one',
    })

    expect(waiting.hardMode).toBe(true)
    expect(getMultiplayerSessionForPlayer(waiting, 'player-one').session.hardMode).toBe(true)
    expect(getMultiplayerSessionForPlayer(waiting, 'player-two').session.hardMode).toBe(true)
    expect(second.error).toContain(requiredLetter.toUpperCase())
    expect(second.game?.moves).toHaveLength(1)
  })

  it('enforces Practice Multiplayer Hard Mode constraints from the shared board across alternating turns', () => {
    const waiting = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      hardMode: true,
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const setup = createPracticeOgSetup(5, 1)
    const answer = getMultiplayerAnswerWords(waiting)[0]
    const joined = joinMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), waiting), {
      gameId: waiting.id,
      now: '2026-06-04T12:00:00.000Z',
      userId: 'rival-user',
    })
    let correctIndex = -1
    let correctLetter = ''
    const firstGuess = [...setup.validGuesses].find((candidate) => {
      if (candidate === answer) {
        return false
      }
      const submitted = submitMultiplayerGuess(joined.state, {
        gameId: waiting.id,
        guess: candidate,
        now: '2026-06-04T12:00:05.000Z',
        playerId: 'player-one',
      })
      if (submitted.game?.status !== 'playing') {
        return false
      }
      const index = submitted.game.moves[0]?.tiles.findIndex((tile) => tile.state === 'correct') ?? -1
      if (index < 0) {
        return false
      }
      correctIndex = index
      correctLetter = submitted.game.moves[0].tiles[index].letter
      return true
    })
    expect(firstGuess).toBeTruthy()
    const first = submitMultiplayerGuess(joined.state, {
      gameId: waiting.id,
      guess: firstGuess!,
      now: '2026-06-04T12:00:05.000Z',
      playerId: 'player-one',
    })
    expect(first.error).toBeUndefined()
    expect(first.game?.currentTurn).toBe('player-two')
    expect(correctIndex).toBeGreaterThanOrEqual(0)
    const invalidHardModeGuess = [...setup.validGuesses].find((candidate) => candidate !== answer && candidate[correctIndex] !== correctLetter)
    expect(invalidHardModeGuess).toBeTruthy()

    const second = submitMultiplayerGuess(first.state, {
      gameId: waiting.id,
      guess: invalidHardModeGuess!,
      now: '2026-06-04T12:00:10.000Z',
      playerId: 'player-two',
    })
    const playerTwoSession = getMultiplayerSessionForPlayer(second.game!, 'player-two')

    expect(second.error).toContain(correctLetter.toUpperCase())
    expect(second.game?.moves).toHaveLength(1)
    expect(second.game?.currentTurn).toBe('player-two')
    expect(playerTwoSession.mode).toBe('og')
    if (playerTwoSession.mode !== 'og') {
      throw new Error('Expected OG player-two session')
    }
    expect(playerTwoSession.session.guesses).toHaveLength(0)
  })

  it('expires a timed Practice multiplayer game as a loss when the active player runs out', () => {
    const waiting = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      timeLimitMs: 30_000,
      wordLength: 5,
    })
    const joined = joinMultiplayerGame(addMultiplayerGame(createEmptyMultiplayerState(), waiting), {
      gameId: waiting.id,
      now: '2026-06-04T12:00:00.000Z',
      userId: 'rival-user',
    })
    const expired = expireTimedOutPracticeMultiplayerGames(joined.state, new Date('2026-06-04T12:00:31.000Z'))

    expect(expired.games[0].status).toBe('lost')
    expect(expired.games[0].timedOutPlayerId).toBe('player-one')
    expect(expired.games[0].winnerId).toBe('player-two')
  })
})
