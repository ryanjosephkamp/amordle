import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DIFFICULTY_TIER } from '../data/difficulty'
import { createPracticeGoSetup, createPracticeOgSetup } from '../game'
import { getGuessResult } from '../game/tileStates'
import { createMultiplayerGame, getMultiplayerAnswerWords, joinMultiplayerGame, submitMultiplayerGuess } from './multiplayer'
import { createDailyMultiplayerGoSetup } from './dailyMultiplayer'
import { MultiplayerGameSurface } from './MultiplayerGameSurface'

describe('MultiplayerGameSurface', () => {
  it('renders a full board and on-screen keyboard without pay-to-continue controls', () => {
    const game = createMultiplayerGame({
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const joined = joinMultiplayerGame({ games: [game] }, {
      gameId: game.id,
      userId: 'rival-user',
    })

    const html = renderToStaticMarkup(
      <MultiplayerGameSurface
        game={joined.game!}
        onSubmitGuess={() => undefined}
        playerId="player-one"
        statusLabel="Your turn"
      />,
    )

    expect(html).toContain('Multiplayer guess grid')
    expect(html).toContain('Use the on-screen keyboard')
    expect(html).toContain('min-h-20')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('Q')
    expect(html).toContain('Enter')
    expect(html).not.toContain('Pay to Continue')
    expect(html).not.toContain('Reveal answer')
    expect(html).not.toContain('<input')
  })

  it('renders submitted multiplayer moves on the rival board and keyboard', () => {
    const game = createMultiplayerGame({
      mode: 'og',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const setup = createPracticeOgSetup(5, 1)
    const answer = getMultiplayerAnswerWords(game)[0]
    const firstGuess = [...setup.validGuesses].find((candidate) => candidate !== answer)!
    const joined = joinMultiplayerGame({ games: [game] }, {
      gameId: game.id,
      userId: 'rival-user',
    })
    const submitted = submitMultiplayerGuess(joined.state, {
      gameId: game.id,
      guess: firstGuess,
      playerId: 'player-one',
    })

    const rivalHtml = renderToStaticMarkup(
      <MultiplayerGameSurface
        game={submitted.game!}
        onSubmitGuess={() => undefined}
        playerId="player-two"
        statusLabel="Your turn"
      />,
    )

    for (const [index, letter] of [...firstGuess].entries()) {
      expect(rivalHtml).toContain(`Row 1, tile ${index + 1}, ${letter}`)
    }
    const keyMatch = rivalHtml.match(new RegExp(`<button[^>]*aria-label="Enter ${firstGuess[0].toLocaleUpperCase('en-US')}"[^>]*class="([^"]*)"`))
    expect(keyMatch?.[1]).toBeDefined()
    expect(keyMatch?.[1]).not.toContain('border-slate-600 bg-slate-800')
    expect(rivalHtml).toContain('5 attempts remaining.')
    expect(rivalHtml).toContain('Use the on-screen keyboard')
  })

  it('briefly renders a solved go puzzle on the rival board before showing the next puzzle', () => {
    const game = createMultiplayerGame({
      goPuzzleCount: 5,
      mode: 'go',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const answer = getMultiplayerAnswerWords(game)[0]
    const joined = joinMultiplayerGame({ games: [game] }, {
      gameId: game.id,
      userId: 'rival-user',
    })
    const submitted = submitMultiplayerGuess(joined.state, {
      gameId: game.id,
      guess: answer,
      playerId: 'player-one',
    })

    const rivalHtml = renderToStaticMarkup(
      <MultiplayerGameSurface
        disabled
        game={submitted.game!}
        onSubmitGuess={() => undefined}
        playerId="player-two"
        statusLabel="Advancing to the next puzzle"
      />,
    )

    expect(rivalHtml).toContain('Puzzle 1 of 5')
    for (const [index, letter] of [...answer].entries()) {
      expect(rivalHtml).toContain(`Row 1, tile ${index + 1}, ${letter}`)
    }
  })

  it('keeps prior go answers visible during the solved-row transition hold', () => {
    const game = createMultiplayerGame({
      goPuzzleCount: 5,
      mode: 'go',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'practice',
      seed: 1,
      wordLength: 5,
    })
    const [firstAnswer, secondAnswer] = getMultiplayerAnswerWords(game)
    const joined = joinMultiplayerGame({ games: [game] }, {
      gameId: game.id,
      userId: 'rival-user',
    })
    const firstSolved = submitMultiplayerGuess(joined.state, {
      gameId: game.id,
      guess: firstAnswer,
      playerId: 'player-one',
    })
    const secondSolved = submitMultiplayerGuess(firstSolved.state, {
      gameId: game.id,
      guess: secondAnswer,
      playerId: 'player-two',
    })

    const rivalHtml = renderToStaticMarkup(
      <MultiplayerGameSurface
        disabled
        game={secondSolved.game!}
        onSubmitGuess={() => undefined}
        playerId="player-one"
        statusLabel="Advancing to the next puzzle"
      />,
    )

    expect(rivalHtml).toContain('Puzzle 2 of 5')
    for (const [index, letter] of [...firstAnswer].entries()) {
      expect(rivalHtml).toContain(`Row 1, tile ${index + 1}, ${letter}`)
    }
    for (const [index, letter] of [...secondAnswer].entries()) {
      expect(rivalHtml).toContain(`Row 2, tile ${index + 1}, ${letter}`)
    }
  })

  it('keeps every prior go solution visible when projecting a shared move on a later puzzle', () => {
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
    const joined = joinMultiplayerGame({ games: [game] }, {
      gameId: game.id,
      userId: 'rival-user',
    })
    const firstSolved = submitMultiplayerGuess(joined.state, {
      gameId: game.id,
      guess: answers[0],
      playerId: 'player-one',
    })
    const secondSolved = submitMultiplayerGuess(firstSolved.state, {
      gameId: game.id,
      guess: answers[1],
      playerId: 'player-two',
    })
    const currentPuzzleAnswer = answers[2]
    const currentPuzzleGuess = [...setup.validGuesses].find((candidate) => candidate !== currentPuzzleAnswer)!
    const sharedCurrentMove = submitMultiplayerGuess(secondSolved.state, {
      gameId: game.id,
      guess: currentPuzzleGuess,
      playerId: 'player-one',
    })

    const rivalHtml = renderToStaticMarkup(
      <MultiplayerGameSurface
        game={sharedCurrentMove.game!}
        onSubmitGuess={() => undefined}
        playerId="player-two"
        statusLabel="Your turn"
      />,
    )

    expect(rivalHtml).toContain('Puzzle 3 of 5')
    for (const [rowIndex, guess] of [answers[0], answers[1], currentPuzzleGuess].entries()) {
      for (const [tileIndex, letter] of [...guess].entries()) {
        expect(rivalHtml).toContain(`Row ${rowIndex + 1}, tile ${tileIndex + 1}, ${letter}`)
      }
    }
  })

  it('colors the Practice Multiplayer GO keyboard from prior solution evidence when projecting a later shared move', () => {
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
    const joined = joinMultiplayerGame({ games: [game] }, {
      gameId: game.id,
      userId: 'rival-user',
    })
    const firstSolved = submitMultiplayerGuess(joined.state, {
      gameId: game.id,
      guess: answers[0],
      playerId: 'player-one',
    })
    const secondSolved = submitMultiplayerGuess(firstSolved.state, {
      gameId: game.id,
      guess: answers[1],
      playerId: 'player-two',
    })
    const currentPuzzleAnswer = answers[2]
    const currentPuzzleGuess = [...setup.validGuesses].find((candidate) => candidate !== currentPuzzleAnswer)!
    const priorEvidence = [
      ...getGuessResult(answers[0], currentPuzzleAnswer).tiles,
      ...getGuessResult(answers[1], currentPuzzleAnswer).tiles,
    ]
    const priorOnlyEvidence = priorEvidence.find((tile) => (
      (tile.state === 'absent' || tile.state === 'present')
      && !currentPuzzleGuess.includes(tile.letter)
    ))
    if (!priorOnlyEvidence) {
      throw new Error('Expected seed 1 Practice GO setup to provide prior-only gray/orange keyboard evidence.')
    }
    const sharedCurrentMove = submitMultiplayerGuess(secondSolved.state, {
      gameId: game.id,
      guess: currentPuzzleGuess,
      playerId: 'player-one',
    })

    const rivalHtml = renderToStaticMarkup(
      <MultiplayerGameSurface
        game={sharedCurrentMove.game!}
        onSubmitGuess={() => undefined}
        playerId="player-two"
        statusLabel="Your turn"
      />,
    )

    const keyMatch = rivalHtml.match(new RegExp(`<button[^>]*aria-label="Enter ${priorOnlyEvidence.letter.toLocaleUpperCase('en-US')}"[^>]*class="([^"]*)"`))
    expect(keyMatch?.[1]).toBeDefined()
    expect(keyMatch?.[1]).not.toContain('border-slate-600 bg-slate-800')
  })

  it('colors the Daily Multiplayer GO final-puzzle keyboard from prior solution evidence', () => {
    const game = createMultiplayerGame({
      createdAt: '2026-06-04T12:00:00.000Z',
      dailyDateKey: '2026-06-04',
      goPuzzleCount: 5,
      mode: 'go',
      playerUserIds: { 'player-one': 'host-user' },
      scope: 'daily',
      seed: 1,
      wordLength: 5,
    })
    const setup = createDailyMultiplayerGoSetup(new Date('2026-06-04T00:00:00.000Z'), DEFAULT_DIFFICULTY_TIER, 5)
    const answers = getMultiplayerAnswerWords(game)
    const joined = joinMultiplayerGame({ games: [game] }, {
      gameId: game.id,
      userId: 'rival-user',
    })
    let state = joined.state
    let current = joined.game!
    for (const answer of answers.slice(0, -1)) {
      const submitted = submitMultiplayerGuess(state, {
        gameId: current.id,
        guess: answer,
        playerId: current.currentTurn,
      })
      expect(submitted.error).toBeUndefined()
      state = submitted.state
      current = submitted.game!
    }

    const finalAnswer = answers[answers.length - 1]
    const priorEvidence = answers.slice(0, -1).flatMap((answer) => getGuessResult(answer, finalAnswer).tiles)
    const finalGuess = [...setup.validGuesses].find((candidate) => (
      candidate !== finalAnswer
      && priorEvidence.some((tile) => (
        (tile.state === 'absent' || tile.state === 'present')
        && !candidate.includes(tile.letter)
      ))
    ))
    if (!finalGuess) {
      throw new Error('Expected 2026-06-04 Daily GO setup to provide prior-only gray/orange keyboard evidence.')
    }
    const priorOnlyEvidence = priorEvidence.find((tile) => (
      (tile.state === 'absent' || tile.state === 'present')
      && !finalGuess.includes(tile.letter)
    ))
    if (!priorOnlyEvidence) {
      throw new Error('Expected final guess to omit at least one prior gray/orange evidence letter.')
    }
    const sharedFinalMove = submitMultiplayerGuess(state, {
      gameId: current.id,
      guess: finalGuess,
      playerId: current.currentTurn,
    })
    expect(sharedFinalMove.error).toBeUndefined()

    const rivalPlayerId = current.currentTurn === 'player-one' ? 'player-two' : 'player-one'
    const rivalHtml = renderToStaticMarkup(
      <MultiplayerGameSurface
        game={sharedFinalMove.game!}
        onSubmitGuess={() => undefined}
        playerId={rivalPlayerId}
        statusLabel="Your turn"
      />,
    )

    const keyMatch = rivalHtml.match(new RegExp(`<button[^>]*aria-label="Enter ${priorOnlyEvidence.letter.toLocaleUpperCase('en-US')}"[^>]*class="([^"]*)"`))
    expect(keyMatch?.[1]).toBeDefined()
    expect(keyMatch?.[1]).not.toContain('border-slate-600 bg-slate-800')
  })
})
