import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_DIFFICULTY_TIER, useWordListPreparation, type DifficultyTier } from '../../data'
import { DEFAULT_GO_PUZZLE_COUNT, type GoPuzzleCount } from '../../game/constants'
import { createSoloCloudSessionKey, type CompletedGameInput, type GoResumeSlot, type ResumeCapture, type SoloCloudMutation, type SoloCloudMutationEventInput } from '../../account'
import { createAccountPracticeSeed } from '../../account/practiceSeeds'
import { DefinitionPanel } from '../../definitions'
import {
  createDailyGoSetup,
  createGoSession,
  createPracticeGoSetup,
  continueGoAfterLoss,
  deleteGoLetter,
  deriveKeyboardLetterStates,
  enterGoLetter,
  getAvailableGoPracticeLengths,
  restoreGoSession,
  revealGoPuzzle,
  serializeGoSession,
  setGoHardMode,
  submitGoGuess,
  useKeyboardInput,
  type GoSessionSetup,
  type GoSessionState,
  type KeyboardInput,
  type PuzzleSessionState,
  type TileState,
  formatGoShare,
} from '../../game'
import { clearDailyGoStoredSession, loadDailyGoStoredSession, saveDailyGoStoredSession } from '../../game/storage/dailyGoStorage'
import { dateKeyToLocalDate, getActiveDailyDate } from '../../daily'
import { applyPracticeHintsToDraft, calculatePayToContinueCost, createInitialConsumableEffects, deletePracticeDraftLetter, enterPracticeDraftLetter, getPracticeDraftTiles, removePracticeIncorrectLetters, revealNextPracticeLetter, type ConsumableEffects, type ConsumableType } from '../../progression'
import { PracticeConsumableControls } from '../../marketplace'
import { Button, Keyboard, Panel, ShareButton } from '../../ui'
import { useSound } from '../../sound'
import { classNames } from '../../ui/classNames'
import { GAMEPLAY_AUTOCENTER_TARGET_ATTRIBUTE, GAMEPLAY_AUTOCENTER_TARGETS } from '../gameplayAutoCenter'
import { CustomizeMenu } from './CustomizeMenu'
import { getSoloGoSolvedTransition, type SoloGoSolvedTransition } from './goTransitions'
import { createGoGameSessionKey } from './soloSessionKeys'
import { getSoloInputSoundEvents, getSoloSubmitSoundEvents } from './soloSoundEvents'
import { WordListPreparationPanel } from './WordListPreparationPanel'

interface GoGameProps {
  readonly coins: number
  readonly consumables?: Readonly<Record<ConsumableType, number>>
  readonly defaultDifficulty?: DifficultyTier
  readonly defaultGoPuzzleCount?: GoPuzzleCount
  readonly defaultHardMode?: boolean
  readonly initialResume?: GoResumeSlot
  readonly keyboardDisabled?: boolean
  readonly onGameComplete?: (input: CompletedGameInput) => void
  readonly onResumeCapture?: (capture: ResumeCapture) => void
  readonly onSoloCloudMutation?: (mutation: SoloCloudMutation) => void
  readonly onSaveDifficultyDefault?: (tier: DifficultyTier) => void
  readonly onSaveGoPuzzleCountDefault?: (count: GoPuzzleCount) => void
  readonly onConsumeConsumable?: (type: ConsumableType, operationId: string) => boolean | Promise<boolean>
  readonly onSpendCoins: (amount: number, operationId?: string) => boolean | Promise<boolean>
  readonly onAdvancePracticeSeed?: () => void
  readonly practiceSeedCounter?: number
  readonly practiceSeedUserId?: string
  readonly progressOwnerKey?: string
  readonly scope: 'daily' | 'practice'
  /**
   * Phase 22 Addendum (§27.10) — when set, this daily renders a specific *past*
   * day instead of today's granted daily. Puzzle, persistence, and stats are
   * keyed to this date so it is a full daily experience.
   */
  readonly pastDailyDateKey?: string
  /** Invoked on the first guess of a past daily so the caller can permanently unlock it. */
  readonly onMarkDailyUnlocked?: () => void
}

type GridTileState = TileState | 'empty' | 'current'
const SOLO_GO_TRANSITION_MS = 2000

const tileStateClasses: Record<GridTileState, string> = {
  absent: 'border-slate-700 bg-slate-950 text-slate-400',
  correct: 'border-emerald-300/70 bg-emerald-300/25 text-emerald-50',
  current: 'border-cyan-200/70 bg-cyan-300/10 text-cyan-50',
  empty: 'border-slate-700 bg-slate-950/60 text-slate-500',
  present: 'border-amber-300/70 bg-amber-300/20 text-amber-50',
}

function canRestoreDailySession(serialized: ReturnType<typeof serializeGoSession>, setup: GoSessionSetup): boolean {
  return serialized.puzzles.length === setup.puzzles.length
    && serialized.puzzles.every((puzzle, index) => puzzle.answer === setup.puzzles[index]?.answer)
}

function createInitialDailySession(setup: ReturnType<typeof createDailyGoSetup>, pastDailyDateKey?: string, hardMode = false): GoSessionState {
  if (!pastDailyDateKey) {
    return createGoSession(setup, hardMode)
  }

  const stored = loadDailyGoStoredSession(undefined, pastDailyDateKey)
  if (
    stored &&
    stored.dateKey === setup.dateKey &&
    stored.session.puzzles.length === setup.puzzles.length &&
    stored.session.puzzles[0]?.answer === setup.puzzles[0]?.answer
  ) {
    return restoreGoSession(stored.session, setup.validGuesses)
  }

  clearDailyGoStoredSession(undefined, pastDailyDateKey)
  return createGoSession(setup, hardMode)
}

function GuessGrid({ effects, session }: { readonly effects: ConsumableEffects; readonly session: PuzzleSessionState }) {
  type GridTile = { readonly isSubmitted: boolean; readonly letter: string; readonly state: GridTileState }
  const rows = useMemo(() => Array.from({ length: session.maxAttempts }, (_, rowIndex) => {
    const submittedGuess = session.guesses[rowIndex]
    if (submittedGuess) {
      return submittedGuess.tiles.map((tile): GridTile => ({ isSubmitted: true, letter: tile.letter, state: tile.state }))
    }

    if (rowIndex === session.guesses.length && session.status === 'playing') {
      return getPracticeDraftTiles(session.currentGuess, session.wordLength, effects).map((tile): GridTile => ({
        isSubmitted: false,
        letter: tile.letter,
        state: tile.locked ? 'correct' : tile.letter ? 'current' : 'empty',
      }))
    }

    return Array.from({ length: session.wordLength }, (): GridTile => ({ isSubmitted: false, letter: '', state: 'empty' }))
  }), [effects, session.currentGuess, session.guesses, session.maxAttempts, session.status, session.wordLength])

  return (
    <div
      aria-label="Go guess grid"
      className="@container space-y-1.5 sm:space-y-2"
      role="grid"
      tabIndex={-1}
      {...{ [GAMEPLAY_AUTOCENTER_TARGET_ATTRIBUTE]: GAMEPLAY_AUTOCENTER_TARGETS.solo }}
    >
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

function getCompletionPercentage(session: PuzzleSessionState): number {
  const bestCorrectTiles = session.guesses.reduce((best, guess) => {
    const correctTiles = guess.tiles.filter((tile) => tile.state === 'correct').length
    return Math.max(best, correctTiles)
  }, 0)

  return Math.round((bestCorrectTiles / session.wordLength) * 100)
}

function hasSubmittedGoGuess(session: GoSessionState, setup: GoSessionSetup): boolean {
  return session.puzzles.some((puzzle, index) => {
    const prefilledCount = setup.puzzles[index]?.prefilledGuesses.length ?? 0
    return puzzle.guesses.length > prefilledCount
  })
}

function GoGameSession({
  coins,
  consumables,
  defaultDifficulty,
  defaultGoPuzzleCount,
  defaultHardMode,
  difficulty,
  goPuzzleCount,
  keyboardDisabled,
  onDifficultyChange,
  onGameComplete,
  onGoPuzzleCountChange,
  onPracticeLengthChange,
  onPracticeSeedChange,
  onResumeCapture,
  onSoloCloudMutation,
  onMarkDailyUnlocked,
  pastDailyDateKey,
  onSaveDifficultyDefault,
  onSaveGoPuzzleCountDefault,
  onConsumeConsumable,
  onSpendCoins,
  practiceLength,
  practiceLengths,
  practiceSeed,
  restoreFrom,
  scope,
  setup,
}: {
  readonly coins: number
  readonly consumables: Readonly<Record<ConsumableType, number>>
  readonly defaultDifficulty: DifficultyTier
  readonly defaultGoPuzzleCount: GoPuzzleCount
  readonly defaultHardMode: boolean
  readonly difficulty: DifficultyTier
  readonly goPuzzleCount: GoPuzzleCount
  readonly keyboardDisabled: boolean
  readonly onDifficultyChange: (tier: DifficultyTier) => void
  readonly onGameComplete?: (input: CompletedGameInput) => void
  readonly onGoPuzzleCountChange: (count: GoPuzzleCount) => void
  readonly onPracticeLengthChange: (length: number) => void
  readonly onPracticeSeedChange: () => void
  readonly onResumeCapture?: (capture: ResumeCapture) => void
  readonly onSoloCloudMutation?: (mutation: SoloCloudMutation) => void
  readonly onMarkDailyUnlocked?: () => void
  readonly pastDailyDateKey?: string
  readonly onSaveDifficultyDefault?: (tier: DifficultyTier) => void
  readonly onSaveGoPuzzleCountDefault?: (count: GoPuzzleCount) => void
  readonly onConsumeConsumable?: (type: ConsumableType, operationId: string) => boolean | Promise<boolean>
  readonly onSpendCoins: (amount: number, operationId?: string) => boolean | Promise<boolean>
  readonly practiceLength: number
  readonly practiceLengths: readonly number[]
  readonly practiceSeed: number
  readonly restoreFrom?: ReturnType<typeof serializeGoSession>
  readonly scope: GoGameProps['scope']
  readonly setup: GoSessionSetup
}) {
  const [session, setSession] = useState(() => {
    if (restoreFrom && (scope !== 'daily' || canRestoreDailySession(restoreFrom, setup))) {
      return restoreGoSession(restoreFrom, setup.validGuesses)
    }
    return scope === 'daily' ? createInitialDailySession(setup, pastDailyDateKey, defaultHardMode) : createGoSession(setup, defaultHardMode)
  })
  const suppressInitialCompletionReportRef = useRef(Boolean(restoreFrom) && session.status !== 'playing')
  const [continuationMessage, setContinuationMessage] = useState<string>()
  const [consumableEffectsByPuzzle, setConsumableEffectsByPuzzle] = useState<Readonly<Record<string, ConsumableEffects>>>(() => Object.fromEntries(
    Object.entries(restoreFrom?.consumableEffectsByPuzzle ?? {}).map(([key, effects]) => [key, createInitialConsumableEffects(effects)]),
  ))
  const [solvedTransition, setSolvedTransition] = useState<SoloGoSolvedTransition | undefined>()
  const [showDefinitions, setShowDefinitions] = useState(true)
  const currentPuzzle = session.puzzles[session.currentPuzzleIndex]
  const consumableEffects = createInitialConsumableEffects(consumableEffectsByPuzzle[String(session.currentPuzzleIndex)])
  const transitionPuzzle = solvedTransition ? session.puzzles[solvedTransition.puzzleIndex] : undefined
  const displayPuzzle = transitionPuzzle ?? currentPuzzle
  const displayPuzzleIndex = solvedTransition?.puzzleIndex ?? session.currentPuzzleIndex
  const isSolvedTransitionActive = Boolean(solvedTransition)
  const completionPercentage = getCompletionPercentage(currentPuzzle)
  const continuationCost = calculatePayToContinueCost({
    completionPercentage,
    continuationCount: currentPuzzle.continuationCount,
    wordLength: currentPuzzle.wordLength,
  })
  const canAffordContinuation = session.status === 'lost' && !session.revealedAnswer && coins >= continuationCost
  const canPayToContinue = session.status === 'lost' && !session.revealedAnswer
  const lossAnswerRevealed = session.status === 'lost' && (!canPayToContinue || Boolean(session.revealedAnswer))
  const endStateRevealed = session.status === 'won' || lossAnswerRevealed
  const revealCost = calculatePayToContinueCost({
    completionPercentage,
    continuationCount: currentPuzzle.continuationCount,
    wordLength: currentPuzzle.wordLength,
  })
  const canReveal = scope === 'practice' && session.status === 'playing' && !isSolvedTransitionActive && currentPuzzle.guesses.length > 0
  const showEndState = endStateRevealed && !isSolvedTransitionActive
  const solvedPuzzles = showEndState ? session.puzzles.filter((puzzle) => puzzle.status === 'won') : []
  const showCurrentPuzzleDefinition = showEndState && !solvedPuzzles.some((puzzle) => puzzle.answer === currentPuzzle.answer)
  const customizeLocked = hasSubmittedGoGuess(session, setup)
  const hardModeLocked = scope === 'practice'
    ? customizeLocked
    : session.puzzles.some((puzzle) => puzzle.guesses.length > 0)
  const emitSoloCloudMutation = useCallback((nextSession: GoSessionState, event: SoloCloudMutationEventInput, effectsByPuzzle = consumableEffectsByPuzzle) => {
    onSoloCloudMutation?.({
      ...(scope === 'daily' && setup.dateKey ? { dailyDateKey: setup.dateKey } : {}),
      difficulty,
      event,
      goPuzzleCount,
      hardMode: nextSession.hardMode,
      mode: 'go',
      ...(scope === 'practice' ? { practiceSeed } : {}),
      scope,
      serializedSession: { ...serializeGoSession(nextSession), consumableEffectsByPuzzle: effectsByPuzzle },
      sessionKey: createSoloCloudSessionKey({
        ...(scope === 'daily' && setup.dateKey ? { dailyDateKey: setup.dateKey } : {}),
        difficulty,
        goPuzzleCount,
        mode: 'go',
        ...(scope === 'practice' ? { practiceSeed } : {}),
        scope,
        wordLength: nextSession.wordLength,
      }),
      wordLength: nextSession.wordLength,
    })
  }, [consumableEffectsByPuzzle, difficulty, goPuzzleCount, onSoloCloudMutation, practiceSeed, scope, setup.dateKey])
  const scheduleSoloCloudMutation = useCallback((nextSession: GoSessionState, event: SoloCloudMutationEventInput, effectsByPuzzle = consumableEffectsByPuzzle) => {
    if (!onSoloCloudMutation) {
      return
    }
    window.setTimeout(() => emitSoloCloudMutation(nextSession, event, effectsByPuzzle), 0)
  }, [consumableEffectsByPuzzle, emitSoloCloudMutation, onSoloCloudMutation])

  useEffect(() => {
    if (scope !== 'daily' || !setup.dateKey || !pastDailyDateKey) {
      return
    }

    saveDailyGoStoredSession({
      dateKey: setup.dateKey,
      session: serializeGoSession(session),
    }, undefined, pastDailyDateKey)
  }, [pastDailyDateKey, scope, session, setup.dateKey])

  useEffect(() => {
    if (!solvedTransition) {
      return undefined
    }
    const timeoutId = window.setTimeout(() => setSolvedTransition(undefined), SOLO_GO_TRANSITION_MS)
    return () => window.clearTimeout(timeoutId)
  }, [solvedTransition])

  // Phase 22 Addendum (§27.10): the first guess on a past daily permanently
  // unlocks it, so the player never has to pay the coin cost again.
  const hasAnyGoGuess = session.puzzles.some((puzzle) => puzzle.guesses.length > 0)
  useEffect(() => {
    if (pastDailyDateKey && hasAnyGoGuess) {
      onMarkDailyUnlocked?.()
    }
  }, [hasAnyGoGuess, onMarkDailyUnlocked, pastDailyDateKey])

  useEffect(() => {
    onResumeCapture?.({
      difficulty,
      goPuzzleCount,
      mode: 'go',
      scope,
      serializedSession: { ...serializeGoSession(session), consumableEffectsByPuzzle },
      wordLength: session.wordLength,
    })
  }, [consumableEffectsByPuzzle, difficulty, goPuzzleCount, onResumeCapture, scope, session])

  useEffect(() => {
    if (session.status === 'playing') {
      return
    }

    if (session.status === 'lost' && canPayToContinue) {
      return
    }

    if (suppressInitialCompletionReportRef.current) {
      suppressInitialCompletionReportRef.current = false
      return
    }

    const attemptsUsed = session.puzzles.reduce((total, puzzle) => total + puzzle.guesses.length, 0)
    const maxAttempts = session.puzzles.reduce((total, puzzle) => total + puzzle.maxAttempts, 0)
    const puzzleCount = session.status === 'won' ? session.puzzles.length : session.currentPuzzleIndex + 1
    onGameComplete?.({
      attemptsUsed,
      difficulty,
      gameId: scope === 'daily' ? `go:daily:${setup.dateKey}` : `go:practice:${practiceLength}:${setup.puzzles.map((puzzle) => puzzle.answer).join('-')}`,
      maxAttempts,
      mode: 'go',
      puzzleCount,
      scope,
      status: session.status,
      word: session.status === 'won' ? session.puzzles.map((puzzle) => puzzle.answer).join(',') : session.puzzles[session.currentPuzzleIndex].answer,
      wordLength: session.wordLength,
      ...(pastDailyDateKey ? { affectsStreak: false } : {}),
    })
  }, [canPayToContinue, difficulty, onGameComplete, pastDailyDateKey, practiceLength, scope, session.currentPuzzleIndex, session.puzzles, session.status, session.wordLength, setup.dateKey, setup.puzzles])

  const sound = useSound()
  const handleInput = useCallback((input: KeyboardInput) => {
    setContinuationMessage(undefined)
    for (const event of getSoloInputSoundEvents(input)) {
      sound.play(event)
    }
    setSession((currentSession) => {
      if (input.type === 'letter') {
        if (consumableEffects.removedLetters.includes(input.value.toLocaleLowerCase('en-US'))) {
          setContinuationMessage(`${input.value.toLocaleUpperCase('en-US')} was removed for this puzzle.`)
          return currentSession
        }
        if (scope === 'practice' && consumableEffects.revealedHints.length > 0) {
          const puzzleIndex = currentSession.currentPuzzleIndex
          const puzzle = currentSession.puzzles[puzzleIndex]
          if (!puzzle) return currentSession
          const puzzles = [...currentSession.puzzles]
          puzzles[puzzleIndex] = {
            ...puzzle,
            currentGuess: enterPracticeDraftLetter(puzzle.currentGuess, puzzle.wordLength, consumableEffects, input.value),
            lastValidation: undefined,
          }
          return { ...currentSession, puzzles }
        }
        return enterGoLetter(currentSession, input.value)
      }

      if (input.type === 'delete') {
        if (scope === 'practice' && consumableEffects.revealedHints.length > 0) {
          const puzzleIndex = currentSession.currentPuzzleIndex
          const puzzle = currentSession.puzzles[puzzleIndex]
          if (!puzzle) return currentSession
          const puzzles = [...currentSession.puzzles]
          puzzles[puzzleIndex] = {
            ...puzzle,
            currentGuess: deletePracticeDraftLetter(puzzle.currentGuess, puzzle.wordLength, consumableEffects),
            lastValidation: undefined,
          }
          return { ...currentSession, puzzles }
        }
        return deleteGoLetter(currentSession)
      }

      const previousPuzzleIndex = currentSession.currentPuzzleIndex
      const previousPuzzle = currentSession.puzzles[previousPuzzleIndex]
      const nextSession = submitGoGuess(currentSession)
      const nextPreviousPuzzle = nextSession.puzzles[previousPuzzleIndex]
      const submittedGuess = nextPreviousPuzzle?.guesses[nextPreviousPuzzle.guesses.length - 1]?.guess
      if (
        submittedGuess
        && nextPreviousPuzzle
        && previousPuzzle
        && !nextPreviousPuzzle.lastValidation
        && nextPreviousPuzzle.guesses.length > previousPuzzle.guesses.length
      ) {
        scheduleSoloCloudMutation(nextSession, {
          eventType: 'valid_guess',
          guess: submittedGuess,
          puzzleIndex: previousPuzzleIndex,
        })
      }
      const transition = getSoloGoSolvedTransition(currentSession, nextSession)
      const activePuzzle = nextSession.puzzles[nextSession.currentPuzzleIndex]
      for (const event of getSoloSubmitSoundEvents({
        solved: Boolean(transition),
        validationFailed: Boolean(activePuzzle?.lastValidation),
      })) {
        sound.play(event)
      }
      if (transition) {
        setSolvedTransition(transition)
      }
      return nextSession
    })
  }, [consumableEffects, scheduleSoloCloudMutation, scope, sound])

  useKeyboardInput({ disabled: keyboardDisabled || isSolvedTransitionActive, onInput: handleInput })

  const handleUseConsumable = useCallback(async (type: ConsumableType) => {
    if (scope !== 'practice' || session.status !== 'playing' || isSolvedTransitionActive || !onConsumeConsumable) {
      return
    }
    const result = type === 'revealOneLetter'
      ? revealNextPracticeLetter(currentPuzzle.answer, consumableEffects, {
          guesses: currentPuzzle.guesses,
          selectionKey: `practice:go:${practiceSeed}:${session.currentPuzzleIndex}:reveal:${consumableEffects.revealedHints.length}`,
        })
      : removePracticeIncorrectLetters(currentPuzzle.answer, consumableEffects, {
          currentGuess: currentPuzzle.currentGuess,
          guesses: currentPuzzle.guesses,
          selectionKey: `practice:go:${practiceSeed}:${session.currentPuzzleIndex}:remove:${consumableEffects.removedLetters.length}`,
        })
    if (!result.ok) {
      setContinuationMessage(type === 'revealOneLetter' ? 'Every answer position is already resolved.' : 'No eligible incorrect letters remain.')
      return
    }
    const operationId = `consume:practice:go:${practiceSeed}:${session.currentPuzzleIndex}:${type}:${result.effects.revealedHints.length}:${result.effects.removedLetters.length}`
    if (!await onConsumeConsumable(type, operationId)) {
      setContinuationMessage('This consumable is not available in your inventory.')
      return
    }
    const puzzleIndex = session.currentPuzzleIndex
    const nextEffectsByPuzzle = { ...consumableEffectsByPuzzle, [String(puzzleIndex)]: result.effects }
    let nextSession = session
    const isRevealResult = 'completed' in result
    if (isRevealResult) {
      const puzzles = [...session.puzzles]
      puzzles[puzzleIndex] = {
        ...currentPuzzle,
        currentGuess: result.completed
          ? currentPuzzle.answer
          : applyPracticeHintsToDraft(currentPuzzle.currentGuess, currentPuzzle.wordLength, result.effects),
        lastValidation: undefined,
      }
      const draftSession = { ...session, puzzles }
      nextSession = result.completed ? submitGoGuess(draftSession) : draftSession
      if (result.completed) {
        const transition = getSoloGoSolvedTransition(session, nextSession)
        if (transition) setSolvedTransition(transition)
        for (const event of getSoloSubmitSoundEvents({ solved: true, validationFailed: false })) sound.play(event)
      }
    }
    setConsumableEffectsByPuzzle(nextEffectsByPuzzle)
    setSession(nextSession)
    scheduleSoloCloudMutation(nextSession, { consumableType: type, eventType: 'consumable_use', puzzleIndex }, nextEffectsByPuzzle)
    setContinuationMessage(isRevealResult
      ? result.completed ? 'The final letter was revealed. Puzzle solved.' : 'Revealed one letter on the board.'
      : `Removed ${result.removedLetters.length} incorrect keyboard letter${result.removedLetters.length === 1 ? '' : 's'}.`)
  }, [consumableEffects, consumableEffectsByPuzzle, currentPuzzle, isSolvedTransitionActive, onConsumeConsumable, practiceSeed, scheduleSoloCloudMutation, scope, session, sound])

  const handlePayToContinue = useCallback(async () => {
    if (session.status !== 'lost') {
      return
    }

    if (!await onSpendCoins(continuationCost, `spend:${scope}:go:${setup.dateKey ?? practiceSeed}:continue:${session.currentPuzzleIndex}:${currentPuzzle.continuationCount + 1}`)) {
      setContinuationMessage(`You need ${continuationCost} coins to continue this puzzle.`)
      return
    }

    setSession((currentSession) => {
      const nextSession = continueGoAfterLoss(currentSession)
      if (nextSession !== currentSession) {
        scheduleSoloCloudMutation(nextSession, {
          cost: continuationCost,
          eventType: 'pay_to_continue',
          puzzleIndex: currentSession.currentPuzzleIndex,
        })
      }
      return nextSession
    })
    setContinuationMessage(`Spent ${continuationCost} coins for one more attempt.`)
  }, [continuationCost, currentPuzzle.continuationCount, onSpendCoins, practiceSeed, scheduleSoloCloudMutation, scope, session.currentPuzzleIndex, session.status, setup.dateKey])

  const handleReveal = useCallback(async () => {
    if (!canReveal) {
      return
    }

    if (!await onSpendCoins(revealCost, `spend:practice:go:${practiceSeed}:reveal:${session.currentPuzzleIndex}`)) {
      setContinuationMessage(`You need ${revealCost} coins to reveal this answer.`)
      return
    }

    const revealedAnswer = currentPuzzle.answer.toLocaleUpperCase('en-US')
    setSession((currentSession) => {
      const nextSession = revealGoPuzzle(currentSession)
      if (nextSession !== currentSession) {
        scheduleSoloCloudMutation(nextSession, {
          cost: revealCost,
          eventType: 'reveal',
          puzzleIndex: currentSession.currentPuzzleIndex,
        })
      }
      return nextSession
    })
    setContinuationMessage(`Revealed the answer: ${revealedAnswer}. This puzzle counts as a loss.`)
  }, [canReveal, currentPuzzle.answer, onSpendCoins, practiceSeed, revealCost, scheduleSoloCloudMutation, session.currentPuzzleIndex])

  const handleRevealAfterLoss = useCallback(() => {
    if (!canPayToContinue) {
      return
    }

    const revealedAnswer = currentPuzzle.answer.toLocaleUpperCase('en-US')
    setSession((currentSession) => {
      const nextSession = revealGoPuzzle(currentSession)
      if (nextSession !== currentSession) {
        scheduleSoloCloudMutation(nextSession, {
          eventType: 'reveal',
          puzzleIndex: currentSession.currentPuzzleIndex,
        })
      }
      return nextSession
    })
    setContinuationMessage(`Revealed the answer: ${revealedAnswer}. This puzzle counts as a loss.`)
  }, [canPayToContinue, currentPuzzle.answer, scheduleSoloCloudMutation])

  const letterStates = {
    ...deriveKeyboardLetterStates(displayPuzzle.guesses),
    ...Object.fromEntries(consumableEffects.revealedHints.map((hint) => [hint.letter, 'correct' as const])),
  }
  const statusMessage = isSolvedTransitionActive
    ? displayPuzzleIndex === session.puzzles.length - 1
      ? 'Advancing to final results.'
      : 'Advancing to the next puzzle.'
    : session.status === 'won'
      ? `Solved all ${session.puzzles.length} go puzzles. Daily completion is preserved on refresh.`
      : session.status === 'lost'
        ? lossAnswerRevealed
          ? `The chain ended on puzzle ${session.currentPuzzleIndex + 1}. The answer was ${currentPuzzle.answer.toLocaleUpperCase('en-US')}.`
          : `The chain ended on puzzle ${session.currentPuzzleIndex + 1}. Continue this puzzle or reveal the answer to finish it.`
        : `Puzzle ${session.currentPuzzleIndex + 1} of ${session.puzzles.length}; ${currentPuzzle.maxAttempts - currentPuzzle.guesses.length} attempts remaining.`
  const terminalControl = canPayToContinue ? (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-50">
      <p className="font-bold">Pay to Continue</p>
      <p>Spend {continuationCost} coins for one more attempt on puzzle {session.currentPuzzleIndex + 1}. Current balance: {coins} coins.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={!canAffordContinuation} onClick={handlePayToContinue} variant="secondary">
          {canAffordContinuation ? `Pay ${continuationCost} coins to continue` : `Need ${continuationCost} coins to continue`}
        </Button>
        <Button onClick={handleRevealAfterLoss} variant="ghost">Reveal answer instead</Button>
      </div>
      {continuationMessage ? <p className="mt-2 font-semibold">{continuationMessage}</p> : null}
    </div>
  ) : continuationMessage ? (
    <div className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-3 text-sm font-semibold text-cyan-50">{continuationMessage}</div>
  ) : null
  const revealControl = canReveal ? (
    <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-4 text-sm leading-6 text-rose-50">
      <p className="font-bold">Give Up / Reveal Answer</p>
      <p>Reveal puzzle {session.currentPuzzleIndex + 1} for {revealCost} coins. This counts as a loss for this puzzle. Current balance: {coins} coins.</p>
      <Button onClick={handleReveal} variant="secondary">
        Reveal answer ({revealCost} coins)
      </Button>
    </div>
  ) : null
  const hasPostGuessControls = Boolean(terminalControl || revealControl)

  return (
    <section className="brrrdle-solo-gameplay space-y-5" aria-labelledby="go-game-title">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">go {scope}</p>
        <h2 id="go-game-title" className="text-3xl font-bold text-white">
          {scope === 'daily' ? 'Daily go chain' : 'Practice go chain'}
        </h2>
        <p className="max-w-3xl text-base leading-7 text-slate-300">
          {session.puzzles.length} linked amordle puzzles are active with prior answers carried forward as pre-filled rows on later puzzles.
        </p>
      </div>

      <Panel className="space-y-4" tone="muted">
        {scope === 'practice' ? (
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-700 bg-slate-950/50 p-3">
            <label className="grid gap-1 text-sm font-semibold text-cyan-100">
              Practice length
              <select
                className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
                onChange={(event) => onPracticeLengthChange(Number(event.target.value))}
                value={practiceLength}
              >
                {practiceLengths.map((length) => (
                  <option key={length} value={length}>{length} letters</option>
                ))}
              </select>
            </label>
            <Button onClick={onPracticeSeedChange} variant="secondary">New go chain</Button>
            <p className="text-sm leading-6 text-slate-300">The selected length applies to all five practice puzzles.</p>
          </div>
        ) : null}

        {onSaveDifficultyDefault ? (
          <CustomizeMenu
            defaultDifficulty={defaultDifficulty}
            defaultGoPuzzleCount={defaultGoPuzzleCount}
            difficulty={difficulty}
            goPuzzleCount={goPuzzleCount}
            locked={customizeLocked}
            onDifficultyChange={onDifficultyChange}
            onGoPuzzleCountChange={onGoPuzzleCountChange}
            onSaveDefault={() => onSaveDifficultyDefault(difficulty)}
            onSaveGoPuzzleCountDefault={onSaveGoPuzzleCountDefault ? () => onSaveGoPuzzleCountDefault(goPuzzleCount) : undefined}
          />
        ) : null}

        <label className="flex items-center gap-3 text-sm font-semibold text-cyan-100">
          <input
            checked={session.hardMode}
            className="h-4 w-4 accent-cyan-300"
            disabled={hardModeLocked}
            onChange={(event) => setSession((currentSession) => setGoHardMode(currentSession, event.target.checked))}
            type="checkbox"
          />
          Hard mode
        </label>

        <div className="grid gap-2 sm:grid-cols-5" aria-label="Go puzzle progress">
          {session.puzzles.map((puzzle, index) => (
            <div
              className={classNames(
                'rounded-2xl border p-3 text-sm',
                index === displayPuzzleIndex ? 'border-cyan-200/70 bg-cyan-300/10 text-cyan-50' : 'border-slate-700 bg-slate-950/50 text-slate-300',
              )}
              key={`${puzzle.answer}-${index}`}
            >
              <p className="font-bold">Puzzle {index + 1}</p>
              <p className="capitalize">{puzzle.status}</p>
              {index < session.currentPuzzleIndex || (isSolvedTransitionActive && index === displayPuzzleIndex && displayPuzzle.status === 'won') ? <p>{puzzle.answer.toLocaleUpperCase('en-US')}</p> : null}
            </div>
          ))}
        </div>

        <GuessGrid effects={scope === 'practice' && !isSolvedTransitionActive ? consumableEffects : createInitialConsumableEffects()} session={displayPuzzle} />

        <div aria-live="polite" className="min-h-20 rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-sm leading-6 text-slate-200" role="status">
          <p>{statusMessage}</p>
          {currentPuzzle.lastValidation ? <p className="mt-1 min-h-6 font-semibold text-amber-100">{currentPuzzle.lastValidation.message}</p> : <p aria-hidden="true" className="mt-1 min-h-6" />}
        </div>

        <div className="brrrdle-solo-post-guess-controls flex flex-col gap-4">
          <div
            className={classNames(hasPostGuessControls ? 'order-1 md:order-2' : undefined)}
            tabIndex={-1}
            {...{ [GAMEPLAY_AUTOCENTER_TARGET_ATTRIBUTE]: GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard }}
          >
            <Keyboard disabled={session.status !== 'playing' || isSolvedTransitionActive} disabledLetters={scope === 'practice' ? consumableEffects.removedLetters : undefined} letterStates={letterStates} onInput={handleInput} />
          </div>
          {hasPostGuessControls ? (
            <div className="order-2 flex flex-col gap-4 md:order-1">
              {terminalControl}
              {revealControl}
            </div>
          ) : null}
        </div>

        {scope === 'practice' ? (
          <PracticeConsumableControls consumables={consumables} disabled={session.status !== 'playing' || isSolvedTransitionActive} effects={consumableEffects} onUse={handleUseConsumable} />
        ) : null}


        {showEndState ? (
          <ShareButton
            label="Share go result"
            text={formatGoShare({
              currentPuzzleIndex: session.currentPuzzleIndex,
              dateKey: setup.dateKey,
              mode: 'go',
              puzzles: session.puzzles,
              scope,
              status: session.status,
            })}
          />
        ) : null}

        {solvedPuzzles.length > 0 ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-cyan-100">Solved puzzle definitions</p>
              <Button onClick={() => setShowDefinitions((value) => !value)} variant="ghost">
                {showDefinitions ? 'Hide Definitions' : 'Show All'}
              </Button>
            </div>
            {showDefinitions ? (
              <div className="mt-3 flex flex-col gap-3">
                {solvedPuzzles.map((puzzle, index) => (
                  <DefinitionPanel
                    enabled
                    key={`${puzzle.answer}-${index}`}
                    mode="go"
                    scope={scope}
                    word={puzzle.answer}
                    wordLength={puzzle.wordLength}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <DefinitionPanel
          enabled={showCurrentPuzzleDefinition}
          mode="go"
          scope={scope}
          word={currentPuzzle.answer}
          wordLength={currentPuzzle.wordLength}
        />
      </Panel>
    </section>
  )
}

export function GoGame({ coins, consumables = { removeIncorrectLetters: 0, revealOneLetter: 0 }, defaultDifficulty = DEFAULT_DIFFICULTY_TIER, defaultGoPuzzleCount = DEFAULT_GO_PUZZLE_COUNT, defaultHardMode = false, initialResume, keyboardDisabled = false, onAdvancePracticeSeed, onConsumeConsumable, onGameComplete, onResumeCapture, onSoloCloudMutation, onSaveDifficultyDefault, onSaveGoPuzzleCountDefault, onSpendCoins, practiceSeedCounter = 0, practiceSeedUserId, progressOwnerKey, scope, pastDailyDateKey, onMarkDailyUnlocked }: GoGameProps) {
  const [initialPracticeResume] = useState(() => initialResume?.scope === 'practice' ? initialResume : undefined)
  const initialDailyResume = initialResume?.scope === 'daily' ? initialResume : undefined
  // Practice resume captures are written on every input. Treat the incoming
  // resume slot as a one-shot restore source so those live captures do not
  // remount the active chain and replay submitted-row animations.
  const resumePractice = initialPracticeResume
  const practiceLengths = useMemo(() => getAvailableGoPracticeLengths(), [])
  const [practiceLength, setPracticeLength] = useState(() => resumePractice?.wordLength ?? 5)
  const [localPracticeSeed, setLocalPracticeSeed] = useState(0)
  const [difficulty, setDifficulty] = useState<DifficultyTier>(resumePractice?.difficulty ?? defaultDifficulty)
  const [goPuzzleCount, setGoPuzzleCount] = useState<GoPuzzleCount>(resumePractice?.goPuzzleCount ?? defaultGoPuzzleCount)
  const [resumeConsumed, setResumeConsumed] = useState(false)
  const activeResume = scope === 'practice'
    ? resumePractice && !resumeConsumed ? resumePractice : undefined
    : initialDailyResume
  const practiceSeed = practiceSeedUserId
    ? createAccountPracticeSeed('go', practiceSeedUserId, practiceSeedCounter)
    : localPracticeSeed
  const dailyDate = useMemo(
    () => pastDailyDateKey ? dateKeyToLocalDate(pastDailyDateKey) : getActiveDailyDate(),
    [pastDailyDateKey],
  )
  const requiredWordLength = scope === 'daily' ? 5 : practiceLength
  const preparation = useWordListPreparation(scope, requiredWordLength)
  const setup = useMemo(
    () => preparation.isReady
      ? (scope === 'daily' ? createDailyGoSetup(dailyDate, difficulty, goPuzzleCount) : createPracticeGoSetup(practiceLength, practiceSeed, difficulty, goPuzzleCount))
      : undefined,
    [dailyDate, difficulty, goPuzzleCount, practiceLength, practiceSeed, preparation.isReady, scope],
  )
  if (!setup) {
    return <WordListPreparationPanel error={preparation.error} onRetry={preparation.retry} />
  }
  const sessionKey = createGoGameSessionKey({
    activeResume,
    difficulty,
    goPuzzleCount,
    practiceLength,
    practiceSeed,
    progressOwnerKey,
    scope,
    setupDateKey: setup.dateKey,
  })

  return (
    <GoGameSession
      key={sessionKey}
      coins={coins}
      consumables={consumables}
      defaultDifficulty={defaultDifficulty}
      defaultGoPuzzleCount={defaultGoPuzzleCount}
      defaultHardMode={defaultHardMode}
      difficulty={difficulty}
      goPuzzleCount={goPuzzleCount}
      keyboardDisabled={keyboardDisabled}
      onDifficultyChange={(tier) => { setResumeConsumed(true); setDifficulty(tier) }}
      onGameComplete={onGameComplete}
      onGoPuzzleCountChange={(count) => { setResumeConsumed(true); setGoPuzzleCount(count) }}
      onMarkDailyUnlocked={onMarkDailyUnlocked}
      onConsumeConsumable={onConsumeConsumable}
      onPracticeLengthChange={(length) => { setResumeConsumed(true); setPracticeLength(length) }}
      onPracticeSeedChange={() => {
        setResumeConsumed(true)
        if (practiceSeedUserId && onAdvancePracticeSeed) {
          onAdvancePracticeSeed()
          return
        }
        setLocalPracticeSeed((seed) => seed + 1)
      }}
      onResumeCapture={pastDailyDateKey ? undefined : onResumeCapture}
      onSaveDifficultyDefault={onSaveDifficultyDefault}
      onSaveGoPuzzleCountDefault={onSaveGoPuzzleCountDefault}
      onSoloCloudMutation={onSoloCloudMutation}
      onSpendCoins={onSpendCoins}
      pastDailyDateKey={pastDailyDateKey}
      practiceLength={practiceLength}
      practiceLengths={practiceLengths}
      practiceSeed={practiceSeed}
      restoreFrom={activeResume?.serializedSession}
      scope={scope}
      setup={setup}
    />
  )
}
