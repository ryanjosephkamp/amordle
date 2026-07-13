import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_GO_PUZZLE_COUNT } from '../game/constants'
import {
  createPracticeGoSetup,
  createPracticeOgSetup,
  deleteGoLetter,
  deleteLetter,
  deriveKeyboardLetterStates,
  enterGoLetter,
  enterLetter,
  restoreGoSession,
  restoreOgSession,
  submitGoGuess,
  submitGuess,
  useKeyboardInput,
  type GoSessionState,
  type GuessResult,
  type KeyboardInput,
  type PuzzleSessionState,
  type TileState,
} from '../game'
import { dateKeyToLocalDate, getUtcDailyDateKey } from '../daily'
import { useSound } from '../sound'
import { Keyboard } from '../ui'
import { GAMEPLAY_AUTOCENTER_TARGET_ATTRIBUTE, GAMEPLAY_AUTOCENTER_TARGETS } from '../app/gameplayAutoCenter'
import { classNames } from '../ui/classNames'
import { getMultiplayerSessionForPlayer, type MultiplayerGame, type MultiplayerPlayerId } from './multiplayer'
import { createDailyMultiplayerGoSetup, createDailyMultiplayerOgSetup } from './dailyMultiplayer'

interface MultiplayerGameSurfaceProps {
  readonly disabled?: boolean
  readonly game: MultiplayerGame
  readonly onSubmitGuess: (guess: string) => void
  readonly playerId?: MultiplayerPlayerId
  readonly statusLabel: string
}

type GridTileState = TileState | 'empty' | 'current'
type SolvedGoTransition = { readonly moveId: string; readonly puzzleIndex: number }

const SOLVED_GO_TRANSITION_MS = 2000

const tileStateClasses: Record<GridTileState, string> = {
  absent: 'border-slate-700 bg-slate-950 text-slate-400',
  correct: 'border-emerald-300/70 bg-emerald-300/25 text-emerald-50',
  current: 'border-cyan-200/70 bg-cyan-300/10 text-cyan-50',
  empty: 'border-slate-700 bg-slate-950/60 text-slate-500',
  present: 'border-amber-300/70 bg-amber-300/20 text-amber-50',
}

function getModelKey(game: MultiplayerGame, playerId?: MultiplayerPlayerId): string {
  const session = playerId ? getMultiplayerSessionForPlayer(game, playerId) : game.serializedSession
  const currentGuess = session.mode === 'og'
    ? session.session.currentGuess
    : session.session.puzzles[session.session.currentPuzzleIndex]?.currentGuess ?? ''
  const moveKey = game.moves.map((move) => `${move.id}:${move.playerId}:${move.puzzleIndex}:${move.guess}`).join('|')
  return `${game.id}:${game.currentTurn}:${game.status}:${playerId ?? 'shared'}:${moveKey}:${currentGuess}`
}

function getValidGuesses(game: MultiplayerGame): ReadonlySet<string> {
  if (game.mode === 'og') {
    return game.scope === 'daily'
      ? createDailyMultiplayerOgSetup(dateKeyToLocalDate(game.dailyDateKey ?? getUtcDailyDateKey()), game.difficulty).validGuesses
      : createPracticeOgSetup(game.wordLength, game.seed, game.difficulty).validGuesses
  }

  return game.scope === 'daily'
    ? createDailyMultiplayerGoSetup(dateKeyToLocalDate(game.dailyDateKey ?? getUtcDailyDateKey()), game.difficulty, game.goPuzzleCount ?? DEFAULT_GO_PUZZLE_COUNT).validGuesses
    : createPracticeGoSetup(game.wordLength, game.seed, game.difficulty, game.goPuzzleCount ?? DEFAULT_GO_PUZZLE_COUNT).validGuesses
}

function restoreModelSession(game: MultiplayerGame, playerId?: MultiplayerPlayerId): PuzzleSessionState | GoSessionState {
  const serialized = playerId ? getMultiplayerSessionForPlayer(game, playerId) : game.serializedSession
  const validGuesses = getValidGuesses(game)
  return serialized.mode === 'og'
    ? restoreOgSession(serialized.session, validGuesses)
    : restoreGoSession(serialized.session, validGuesses)
}

function getActivePuzzle(session: PuzzleSessionState | GoSessionState): PuzzleSessionState {
  return 'puzzles' in session ? session.puzzles[session.currentPuzzleIndex] : session
}

function getActivePuzzleIndex(session: PuzzleSessionState | GoSessionState): number {
  return 'puzzles' in session ? session.currentPuzzleIndex : 0
}

function getLatestSolvedGoMove(game: MultiplayerGame) {
  if (game.mode !== 'go') {
    return undefined
  }
  return [...game.moves].reverse().find((move) => (
    move.tiles.length > 0 && move.tiles.every((tile) => tile.state === 'correct')
  ))
}

function getInitialSolvedGoTransition(game: MultiplayerGame, session: PuzzleSessionState | GoSessionState): SolvedGoTransition | undefined {
  if (!('puzzles' in session)) {
    return undefined
  }
  const latestSolvedMove = getLatestSolvedGoMove(game)
  if (!latestSolvedMove) {
    return undefined
  }
  const latestMove = game.moves[game.moves.length - 1]
  if (game.scope === 'practice' && latestMove && latestMove.id !== latestSolvedMove.id) {
    return undefined
  }
  if (latestSolvedMove.puzzleIndex < session.currentPuzzleIndex) {
    return { moveId: latestSolvedMove.id, puzzleIndex: latestSolvedMove.puzzleIndex }
  }
  if (session.status === 'won' && latestSolvedMove.puzzleIndex === session.currentPuzzleIndex) {
    return { moveId: latestSolvedMove.id, puzzleIndex: latestSolvedMove.puzzleIndex }
  }
  return undefined
}

function getCurrentGuess(session: PuzzleSessionState | GoSessionState): string {
  return getActivePuzzle(session).currentGuess
}

function getSharedMoveGuesses(game: MultiplayerGame, puzzleIndex: number): readonly GuessResult[] {
  return game.moves
    .filter((move) => move.puzzleIndex === puzzleIndex)
    .map((move): GuessResult => ({ guess: move.guess, tiles: move.tiles }))
}

function isSameGuessResult(left: GuessResult, right: GuessResult): boolean {
  return left.guess === right.guess
    && left.tiles.length === right.tiles.length
    && left.tiles.every((tile, index) => {
      const other = right.tiles[index]
      return other?.letter === tile.letter && other.state === tile.state
    })
}

function mergeDisplayGuesses(
  sessionGuesses: readonly GuessResult[],
  sharedGuesses: readonly GuessResult[],
  preservedPrefixLength = 0,
): readonly GuessResult[] {
  if (sharedGuesses.length === 0) {
    return sessionGuesses
  }
  if (sessionGuesses.length === 0) {
    return sharedGuesses
  }

  const prefixLength = Math.max(0, Math.min(preservedPrefixLength, sessionGuesses.length))
  if (prefixLength > 0) {
    const prefix = sessionGuesses.slice(0, prefixLength)
    const localSubmittedGuesses = sessionGuesses.slice(prefixLength)
    const mergedSubmittedGuesses = [
      ...sharedGuesses,
      ...localSubmittedGuesses.filter((guess) => !sharedGuesses.some((sharedGuess) => isSameGuessResult(sharedGuess, guess))),
    ]
    return [...prefix, ...mergedSubmittedGuesses]
  }

  const suffixStart = sessionGuesses.length - sharedGuesses.length
  if (suffixStart >= 0 && sharedGuesses.every((guess, index) => isSameGuessResult(sessionGuesses[suffixStart + index], guess))) {
    return sessionGuesses
  }

  const preservedPrefix = suffixStart > 0 ? sessionGuesses.slice(0, suffixStart) : []
  return [...preservedPrefix, ...sharedGuesses]
}

function getDisplayPuzzle(session: PuzzleSessionState, sharedGuesses: readonly GuessResult[], preservedPrefixLength = 0): PuzzleSessionState {
  const guesses = mergeDisplayGuesses(session.guesses, sharedGuesses, preservedPrefixLength)
  const maxAttempts = Math.max(session.maxAttempts, guesses.length + (session.status === 'playing' ? 1 : 0))
  if (guesses === session.guesses && maxAttempts === session.maxAttempts) {
    return session
  }
  return {
    ...session,
    guesses,
    maxAttempts,
  }
}

function applyInput(session: PuzzleSessionState | GoSessionState, input: KeyboardInput): PuzzleSessionState | GoSessionState {
  if ('puzzles' in session) {
    if (input.type === 'letter') {
      return enterGoLetter(session, input.value)
    }
    if (input.type === 'delete') {
      return deleteGoLetter(session)
    }
    return submitGoGuess(session)
  }
  if (input.type === 'letter') {
    return enterLetter(session, input.value)
  }
  if (input.type === 'delete') {
    return deleteLetter(session)
  }
  return submitGuess(session)
}

function GuessGrid({ session }: { readonly session: PuzzleSessionState }) {
  type GridTile = { readonly isSubmitted: boolean; readonly letter: string; readonly state: GridTileState }
  const rows = useMemo(() => Array.from({ length: session.maxAttempts }, (_, rowIndex) => {
    const submittedGuess = session.guesses[rowIndex]
    if (submittedGuess) {
      return submittedGuess.tiles.map((tile): GridTile => ({ isSubmitted: true, letter: tile.letter, state: tile.state }))
    }

    if (rowIndex === session.guesses.length && session.status === 'playing') {
      return Array.from({ length: session.wordLength }, (_, tileIndex): GridTile => ({
        isSubmitted: false,
        letter: session.currentGuess[tileIndex] ?? '',
        state: session.currentGuess[tileIndex] ? 'current' : 'empty',
      }))
    }

    return Array.from({ length: session.wordLength }, (): GridTile => ({ isSubmitted: false, letter: '', state: 'empty' }))
  }), [session.currentGuess, session.guesses, session.maxAttempts, session.status, session.wordLength])

  return (
    <div aria-label="Multiplayer guess grid" className="@container space-y-1.5 sm:space-y-2" role="grid">
      {rows.map((row, rowIndex) => (
        <div
          className={classNames('mx-auto grid gap-1 sm:gap-1.5', session.lastValidation && rowIndex === session.guesses.length ? 'motion-safe:animate-[brrrdle-row-shake_180ms_ease-in-out]' : undefined)}
          key={rowIndex}
          role="row"
          style={{
            gridTemplateColumns: `repeat(${session.wordLength}, minmax(0, 1fr))`,
            maxWidth: `calc(var(--brrrdle-tile-max) * ${session.wordLength} + 0.375rem * ${session.wordLength - 1})`,
          }}
        >
          {row.map((tile, tileIndex) => (
            <div
              aria-label={`Row ${rowIndex + 1}, tile ${tileIndex + 1}${tile.letter ? `, ${tile.letter}` : ''}`}
              className={classNames(
                '@container flex aspect-square items-center justify-center rounded-md border font-black uppercase',
                tileStateClasses[tile.state],
                tile.state === 'current' ? 'motion-safe:animate-[brrrdle-tile-pop_180ms_ease-out]' : undefined,
                tile.isSubmitted ? 'motion-safe:animate-[brrrdle-tile-reveal_360ms_ease-out]' : undefined,
              )}
              data-state={tile.state}
              key={`${rowIndex}-${tileIndex}`}
              role="gridcell"
              style={{ fontSize: 'clamp(0.625rem, 50cqi, 1.75rem)' }}
            >
              {tile.letter}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export function MultiplayerGameSurface({ disabled = false, game, onSubmitGuess, playerId, statusLabel }: MultiplayerGameSurfaceProps) {
  const sound = useSound()
  const baseSession = useMemo(() => restoreModelSession(game, playerId), [game, playerId])
  const [draftModel, setDraftModel] = useState(() => ({
    key: getModelKey(game, playerId),
    session: baseSession as PuzzleSessionState | GoSessionState | undefined,
  }))
  const [clearedSolvedGoMoveId, setClearedSolvedGoMoveId] = useState<string | undefined>(undefined)
  const draftSessionRef = useRef<PuzzleSessionState | GoSessionState | undefined>(baseSession)
  const previousMoveCountRef = useRef(game.moves.length)
  const previousStatusRef = useRef(game.status)
  const nextSessionKey = getModelKey(game, playerId)
  const draftSession = draftModel.key === nextSessionKey ? draftModel.session : baseSession
  const pendingSolvedGoTransition = useMemo(() => getInitialSolvedGoTransition(game, baseSession), [baseSession, game])
  const solvedGoTransition = pendingSolvedGoTransition?.moveId === clearedSolvedGoMoveId ? undefined : pendingSolvedGoTransition

  useEffect(() => {
    draftSessionRef.current = draftSession
  }, [draftSession])

  useEffect(() => {
    if (!solvedGoTransition) {
      return undefined
    }
    const timeoutId = window.setTimeout(() => {
      setClearedSolvedGoMoveId(solvedGoTransition.moveId)
    }, SOLVED_GO_TRANSITION_MS)
    return () => window.clearTimeout(timeoutId)
  }, [solvedGoTransition])

  const activePuzzle = draftSession
    ? 'puzzles' in draftSession && solvedGoTransition
      ? draftSession.puzzles[solvedGoTransition.puzzleIndex] ?? getActivePuzzle(draftSession)
      : getActivePuzzle(draftSession)
    : undefined
  const activePuzzleIndex = draftSession
    ? 'puzzles' in draftSession && solvedGoTransition
      ? solvedGoTransition.puzzleIndex
      : getActivePuzzleIndex(draftSession)
    : 0
  const sharedGuesses = useMemo(() => getSharedMoveGuesses(game, activePuzzleIndex), [activePuzzleIndex, game])
  const isGo = draftSession ? 'puzzles' in draftSession : game.serializedSession.mode === 'go'
  const preservedGoPrefixLength = isGo ? activePuzzleIndex : 0
  const displayPuzzle = activePuzzle ? getDisplayPuzzle(activePuzzle, sharedGuesses, preservedGoPrefixLength) : undefined
  const keyboardGuesses = isGo && displayPuzzle
    ? displayPuzzle.guesses
    : sharedGuesses.length > 0
      ? sharedGuesses
      : activePuzzle?.guesses ?? []
  const letterStates = deriveKeyboardLetterStates(keyboardGuesses)
  const inputDisabled = disabled || Boolean(solvedGoTransition) || !draftSession || getActivePuzzle(draftSession).status !== 'playing'

  useEffect(() => {
    const previousMoveCount = previousMoveCountRef.current
    if (game.moves.length > previousMoveCount) {
      const latestMove = game.moves[game.moves.length - 1]
      sound.play('tile-flip')
      if (latestMove?.tiles.every((tile) => tile.state === 'correct')) {
        sound.play('correct-guess')
      }
    }

    const previousStatus = previousStatusRef.current
    if ((previousStatus === 'waiting' || previousStatus === 'playing') && game.status !== previousStatus && game.status !== 'waiting' && game.status !== 'playing') {
      if (game.winnerId && playerId && game.winnerId === playerId) {
        sound.play('game-over-win')
      } else if (game.status === 'lost' || game.winnerId) {
        sound.play('game-over-loss')
      }
    }

    previousMoveCountRef.current = game.moves.length
    previousStatusRef.current = game.status
  }, [game.moves, game.status, game.winnerId, playerId, sound])

  const handleInput = useCallback((input: KeyboardInput) => {
    const currentDraft = draftSessionRef.current
    if (!currentDraft || disabled) {
      return
    }
    sound.play('keyboard-click')
    if (input.type !== 'submit') {
      setDraftModel((current) => {
        const source = current.key === nextSessionKey ? current.session ?? currentDraft : currentDraft
        const next = applyInput(source, input)
        draftSessionRef.current = next
        return { key: nextSessionKey, session: next }
      })
      return
    }

    const submitted = applyInput(currentDraft, input)
    const submittedPuzzle = getActivePuzzle(submitted)
    if (submittedPuzzle.lastValidation) {
      sound.play('invalid-guess')
      draftSessionRef.current = submitted
      setDraftModel({ key: nextSessionKey, session: submitted })
      return
    }
    const guess = getCurrentGuess(currentDraft)
    if (guess) {
      onSubmitGuess(guess)
    }
  }, [disabled, nextSessionKey, onSubmitGuess, sound])

  useKeyboardInput({ disabled: inputDisabled, onInput: handleInput })

  if (!draftSession || !activePuzzle) {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-300">
        Waiting for the multiplayer session to initialize.
      </div>
    )
  }

  const statusPuzzle = displayPuzzle ?? activePuzzle
  const statusMessage = isGo && 'puzzles' in draftSession
    ? `Puzzle ${activePuzzleIndex + 1} of ${draftSession.puzzles.length}; ${statusPuzzle.maxAttempts - statusPuzzle.guesses.length} attempts remaining.`
    : `${statusPuzzle.maxAttempts - statusPuzzle.guesses.length} attempts remaining.`

  return (
    <div
      className="space-y-4 rounded-lg border border-white/10 bg-slate-950/70 p-3"
      tabIndex={-1}
      {...{ [GAMEPLAY_AUTOCENTER_TARGET_ATTRIBUTE]: GAMEPLAY_AUTOCENTER_TARGETS.multiplayer }}
    >
      <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
        <div>
          <p className="font-semibold text-cyan-100">Board</p>
          <p>{activePuzzle.wordLength} letters</p>
        </div>
        <div>
          <p className="font-semibold text-cyan-100">Status</p>
          <p>{statusLabel}</p>
        </div>
        <div>
          <p className="font-semibold text-cyan-100">Attempts</p>
          <p>{statusMessage}</p>
        </div>
      </div>

      {'puzzles' in draftSession ? (
        <div className="grid gap-2 sm:grid-cols-5" aria-label="Multiplayer go puzzle progress">
          {draftSession.puzzles.map((puzzle, index) => (
            <div
              className={classNames(
                'rounded-2xl border p-3 text-sm',
                index === activePuzzleIndex ? 'border-cyan-200/70 bg-cyan-300/10 text-cyan-50' : 'border-slate-700 bg-slate-950/50 text-slate-300',
              )}
              key={`${puzzle.answer}-${index}`}
            >
              <p className="font-bold">Puzzle {index + 1}</p>
              <p className="capitalize">{puzzle.status}</p>
              {index < draftSession.currentPuzzleIndex ? <p>{puzzle.answer.toLocaleUpperCase('en-US')}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      <GuessGrid session={displayPuzzle ?? activePuzzle} />

      <div aria-live="polite" className="min-h-20 rounded-2xl border border-slate-700 bg-black/30 p-3 text-sm leading-6 text-slate-200" role="status">
        <p>{inputDisabled ? statusLabel : 'Use the on-screen keyboard to enter your guess.'}</p>
        {activePuzzle.lastValidation ? <p className="mt-1 min-h-6 font-semibold text-amber-100">{activePuzzle.lastValidation.message}</p> : <p aria-hidden="true" className="mt-1 min-h-6" />}
      </div>

      <Keyboard disabled={inputDisabled} letterStates={letterStates} onInput={handleInput} />
    </div>
  )
}
