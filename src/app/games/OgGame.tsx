import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_DIFFICULTY_TIER, useWordListPreparation, type DifficultyTier } from '../../data'
import { createSoloCloudSessionKey, type CompletedGameInput, type OgResumeSlot, type ResumeCapture, type SoloCloudMutation, type SoloCloudMutationEventInput } from '../../account'
import { createAccountPracticeSeed } from '../../account/practiceSeeds'
import { DefinitionPanel } from '../../definitions'
import {
  createDailyOgSetup,
  createOgSession,
  createPracticeOgSetup,
  continueAfterLoss,
  deleteLetter,
  deriveKeyboardLetterStates,
  enterLetter,
  getAvailableOgPracticeLengths,
  restoreOgSession,
  serializeOgSession,
  submitGuess,
  useKeyboardInput,
  type KeyboardInput,
  type OgPuzzleSetup,
  type PuzzleSessionState,
  type TileState,
  formatOgShare,
} from '../../game'
import { clearDailyOgStoredSession, loadDailyOgStoredSession, saveDailyOgStoredSession } from '../../game/storage/dailyOgStorage'
import { dateKeyToLocalDate, getActiveDailyDate } from '../../daily'
import { applyPracticeHintsToDraft, calculatePayToContinueCost, createInitialConsumableEffects, deletePracticeDraftLetter, enterPracticeDraftLetter, getPracticeDraftTiles, removePracticeIncorrectLetters, revealNextPracticeLetter, type ConsumableEffects, type ConsumableType } from '../../progression'
import { PracticeConsumableControls } from '../../marketplace'
import { useSound } from '../../sound'
import { Button, Keyboard, Panel, ShareButton } from '../../ui'
import { classNames } from '../../ui/classNames'
import { GAMEPLAY_AUTOCENTER_TARGET_ATTRIBUTE, GAMEPLAY_AUTOCENTER_TARGETS } from '../gameplayAutoCenter'
import { CustomizeMenu } from './CustomizeMenu'
import { createOgGameSessionKey } from './soloSessionKeys'
import { getSoloInputSoundEvents, getSoloSubmitSoundEvents } from './soloSoundEvents'
import { WordListPreparationPanel } from './WordListPreparationPanel'

interface OgGameProps {
  readonly coins: number
  readonly consumables?: Readonly<Record<ConsumableType, number>>
  readonly defaultDifficulty?: DifficultyTier
  readonly defaultHardMode?: boolean
  readonly initialResume?: OgResumeSlot
  readonly keyboardDisabled?: boolean
  readonly onGameComplete?: (input: CompletedGameInput) => void
  readonly onResumeCapture?: (capture: ResumeCapture) => void
  readonly onSoloCloudMutation?: (mutation: SoloCloudMutation) => void
  readonly onSaveDifficultyDefault?: (tier: DifficultyTier) => void
  readonly onConsumeConsumable?: (type: ConsumableType, operationId: string) => boolean | Promise<boolean>
  readonly onSpendCoins: (amount: number, operationId?: string) => boolean | Promise<boolean>
  readonly onAdvancePracticeSeed?: () => void
  readonly practiceSeedCounter?: number
  readonly practiceSeedUserId?: string
  readonly progressOwnerKey?: string
  readonly scope: 'daily' | 'practice'
  /**
   * Phase 22 Addendum (§27.10) — when set, this daily renders a specific *past*
   * day (instead of today's granted daily). The puzzle, persistence, and stats
   * are all keyed to this date so it behaves as a full daily experience.
   */
  readonly pastDailyDateKey?: string
  /**
   * Invoked once the player makes their first guess on a past daily, so the
   * caller can mark it permanently unlocked.
   */
  readonly onMarkDailyUnlocked?: () => void
}

type GridTileState = TileState | 'empty' | 'current'

const tileStateClasses: Record<GridTileState, string> = {
  absent: 'border-slate-700 bg-slate-950 text-slate-400',
  correct: 'border-emerald-300/70 bg-emerald-300/25 text-emerald-50',
  current: 'border-cyan-200/70 bg-cyan-300/10 text-cyan-50',
  empty: 'border-slate-700 bg-slate-950/60 text-slate-500',
  present: 'border-amber-300/70 bg-amber-300/20 text-amber-50',
}

function canRestoreDailySession(serialized: ReturnType<typeof serializeOgSession>, setup: OgPuzzleSetup): boolean {
  return serialized.answer === setup.answer && serialized.answer.length === setup.wordLength
}

function createInitialDailySession(setup: ReturnType<typeof createDailyOgSetup>, pastDailyDateKey?: string, hardMode = false): PuzzleSessionState {
  if (!pastDailyDateKey) {
    return createOgSession(setup, hardMode)
  }

  const stored = loadDailyOgStoredSession(undefined, pastDailyDateKey)
  if (stored && stored.dateKey === setup.dateKey && stored.session.answer === setup.answer) {
    return restoreOgSession(stored.session, setup.validGuesses)
  }

  clearDailyOgStoredSession(undefined, pastDailyDateKey)
  return createOgSession(setup, hardMode)
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
      aria-label="Guess grid"
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

function OgGameSession({
  coins,
  consumables,
  defaultDifficulty,
  defaultHardMode,
  difficulty,
  keyboardDisabled,
  onDifficultyChange,
  onGameComplete,
  onPracticeLengthChange,
  onPracticeSeedChange,
  onResumeCapture,
  onSoloCloudMutation,
  onMarkDailyUnlocked,
  pastDailyDateKey,
  onSaveDifficultyDefault,
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
  readonly defaultHardMode: boolean
  readonly difficulty: DifficultyTier
  readonly keyboardDisabled: boolean
  readonly onDifficultyChange: (tier: DifficultyTier) => void
  readonly onGameComplete?: (input: CompletedGameInput) => void
  readonly onPracticeLengthChange: (length: number) => void
  readonly onPracticeSeedChange: () => void
  readonly onResumeCapture?: (capture: ResumeCapture) => void
  readonly onSoloCloudMutation?: (mutation: SoloCloudMutation) => void
  readonly onMarkDailyUnlocked?: () => void
  readonly pastDailyDateKey?: string
  readonly onSaveDifficultyDefault?: (tier: DifficultyTier) => void
  readonly onConsumeConsumable?: (type: ConsumableType, operationId: string) => boolean | Promise<boolean>
  readonly onSpendCoins: (amount: number, operationId?: string) => boolean | Promise<boolean>
  readonly practiceLength: number
  readonly practiceLengths: readonly number[]
  readonly practiceSeed: number
  readonly restoreFrom?: ReturnType<typeof serializeOgSession>
  readonly scope: OgGameProps['scope']
  readonly setup: OgPuzzleSetup
}) {
  const [session, setSession] = useState(() => {
    if (restoreFrom && (scope !== 'daily' || canRestoreDailySession(restoreFrom, setup))) {
      return restoreOgSession(restoreFrom, setup.validGuesses)
    }
    return scope === 'daily' ? createInitialDailySession(setup, pastDailyDateKey, defaultHardMode) : createOgSession(setup, defaultHardMode)
  })
  const suppressInitialCompletionReportRef = useRef(Boolean(restoreFrom) && session.status !== 'playing')
  const [continuationMessage, setContinuationMessage] = useState<string>()
  const [consumableEffects, setConsumableEffects] = useState<ConsumableEffects>(() => createInitialConsumableEffects(restoreFrom?.consumableEffects))
  const completionPercentage = getCompletionPercentage(session)
  const continuationCost = calculatePayToContinueCost({
    completionPercentage,
    continuationCount: session.continuationCount,
    wordLength: session.wordLength,
  })
  const canAffordContinuation = session.status === 'lost' && !session.revealedAnswer && coins >= continuationCost
  const canPayToContinue = session.status === 'lost' && !session.revealedAnswer
  const lossAnswerRevealed = session.status === 'lost' && (!canPayToContinue || Boolean(session.revealedAnswer))
  const endStateRevealed = session.status === 'won' || lossAnswerRevealed
  const canReveal = scope === 'practice' && session.status === 'playing' && session.guesses.length > 0
  const emitSoloCloudMutation = useCallback((nextSession: PuzzleSessionState, event: SoloCloudMutationEventInput, effects: ConsumableEffects = consumableEffects) => {
    onSoloCloudMutation?.({
      ...(scope === 'daily' && setup.dateKey ? { dailyDateKey: setup.dateKey } : {}),
      difficulty,
      event,
      hardMode: nextSession.hardMode,
      mode: 'og',
      ...(scope === 'practice' ? { practiceSeed } : {}),
      scope,
      serializedSession: { ...serializeOgSession(nextSession), consumableEffects: effects },
      sessionKey: createSoloCloudSessionKey({
        ...(scope === 'daily' && setup.dateKey ? { dailyDateKey: setup.dateKey } : {}),
        difficulty,
        mode: 'og',
        ...(scope === 'practice' ? { practiceSeed } : {}),
        scope,
        wordLength: nextSession.wordLength,
      }),
      wordLength: nextSession.wordLength,
    })
  }, [consumableEffects, difficulty, onSoloCloudMutation, practiceSeed, scope, setup.dateKey])
  const scheduleSoloCloudMutation = useCallback((nextSession: PuzzleSessionState, event: SoloCloudMutationEventInput, effects: ConsumableEffects = consumableEffects) => {
    if (!onSoloCloudMutation) {
      return
    }
    window.setTimeout(() => emitSoloCloudMutation(nextSession, event, effects), 0)
  }, [consumableEffects, emitSoloCloudMutation, onSoloCloudMutation])

  useEffect(() => {
    if (scope !== 'daily' || !setup.dateKey || !pastDailyDateKey) {
      return
    }

    saveDailyOgStoredSession({
      dateKey: setup.dateKey,
      session: serializeOgSession(session),
    }, undefined, pastDailyDateKey)
  }, [pastDailyDateKey, scope, session, setup.dateKey])

  // Phase 22 Addendum (§27.10): the first guess on a past daily permanently
  // unlocks it, so the player never has to pay the coin cost again.
  useEffect(() => {
    if (pastDailyDateKey && session.guesses.length > 0) {
      onMarkDailyUnlocked?.()
    }
  }, [onMarkDailyUnlocked, pastDailyDateKey, session.guesses.length])

  useEffect(() => {
    onResumeCapture?.({
      difficulty,
      mode: 'og',
      scope,
      serializedSession: { ...serializeOgSession(session), consumableEffects },
      wordLength: session.wordLength,
    })
  }, [consumableEffects, difficulty, onResumeCapture, scope, session])

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

    onGameComplete?.({
      attemptsUsed: session.guesses.length,
      difficulty,
      gameId: scope === 'daily' ? `og:daily:${setup.dateKey}` : `og:practice:${practiceLength}:${practiceSeed}:${setup.answer}`,
      maxAttempts: session.maxAttempts,
      mode: 'og',
      scope,
      status: session.status,
      word: session.answer,
      wordLength: session.wordLength,
      ...(pastDailyDateKey ? { affectsStreak: false } : {}),
    })
  }, [canPayToContinue, difficulty, onGameComplete, pastDailyDateKey, practiceLength, practiceSeed, scope, session.answer, session.guesses.length, session.maxAttempts, session.status, session.wordLength, setup.answer, setup.dateKey])

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
          return {
            ...currentSession,
            currentGuess: enterPracticeDraftLetter(currentSession.currentGuess, currentSession.wordLength, consumableEffects, input.value),
            lastValidation: undefined,
          }
        }
        return enterLetter(currentSession, input.value)
      }

      if (input.type === 'delete') {
        if (scope === 'practice' && consumableEffects.revealedHints.length > 0) {
          return {
            ...currentSession,
            currentGuess: deletePracticeDraftLetter(currentSession.currentGuess, currentSession.wordLength, consumableEffects),
            lastValidation: undefined,
          }
        }
        return deleteLetter(currentSession)
      }

      const nextSession = submitGuess(currentSession)
      const submittedGuess = nextSession.guesses[nextSession.guesses.length - 1]?.guess
      if (!nextSession.lastValidation && submittedGuess && nextSession.guesses.length > currentSession.guesses.length) {
        scheduleSoloCloudMutation(nextSession, {
          eventType: 'valid_guess',
          guess: submittedGuess,
          puzzleIndex: 0,
        })
      }
      for (const event of getSoloSubmitSoundEvents({
        solved: nextSession.status === 'won',
        validationFailed: Boolean(nextSession.lastValidation),
      })) {
        sound.play(event)
      }
      return nextSession
    })
  }, [consumableEffects, scheduleSoloCloudMutation, scope, sound])

  const handleUseConsumable = useCallback(async (type: ConsumableType) => {
    if (scope !== 'practice' || session.status !== 'playing' || !onConsumeConsumable) {
      return
    }
    const result = type === 'revealOneLetter'
      ? revealNextPracticeLetter(session.answer, consumableEffects, {
          guesses: session.guesses,
          selectionKey: `practice:og:${practiceSeed}:reveal:${consumableEffects.revealedHints.length}`,
        })
      : removePracticeIncorrectLetters(session.answer, consumableEffects, {
          currentGuess: session.currentGuess,
          guesses: session.guesses,
          selectionKey: `practice:og:${practiceSeed}:remove:${consumableEffects.removedLetters.length}`,
        })
    if (!result.ok) {
      setContinuationMessage(type === 'revealOneLetter' ? 'Every answer position is already resolved.' : 'No eligible incorrect letters remain.')
      return
    }
    const operationId = `consume:practice:og:${practiceSeed}:${type}:${result.effects.revealedHints.length}:${result.effects.removedLetters.length}`
    if (!await onConsumeConsumable(type, operationId)) {
      setContinuationMessage('This consumable is not available in your inventory.')
      return
    }
    const isRevealResult = 'completed' in result
    const nextSession = isRevealResult
      ? result.completed
        ? submitGuess({ ...session, currentGuess: session.answer, lastValidation: undefined })
        : { ...session, currentGuess: applyPracticeHintsToDraft(session.currentGuess, session.wordLength, result.effects), lastValidation: undefined }
      : session
    setConsumableEffects(result.effects)
    setSession(nextSession)
    scheduleSoloCloudMutation(nextSession, { consumableType: type, eventType: 'consumable_use', puzzleIndex: 0 }, result.effects)
    if (isRevealResult && result.completed) {
      for (const event of getSoloSubmitSoundEvents({ solved: true, validationFailed: false })) sound.play(event)
    }
    setContinuationMessage(isRevealResult
      ? result.completed ? 'The final letter was revealed. Puzzle solved.' : 'Revealed one letter on the board.'
      : `Removed ${result.removedLetters.length} incorrect keyboard letter${result.removedLetters.length === 1 ? '' : 's'}.`)
  }, [consumableEffects, onConsumeConsumable, practiceSeed, scheduleSoloCloudMutation, scope, session, sound])

  const handlePayToContinue = useCallback(async () => {
    if (session.status !== 'lost') {
      return
    }

    if (!await onSpendCoins(continuationCost, `spend:${scope}:og:${setup.dateKey ?? practiceSeed}:continue:${session.continuationCount + 1}`)) {
      setContinuationMessage(`You need ${continuationCost} coins to continue this puzzle.`)
      return
    }

    setSession((currentSession) => {
      const nextSession = continueAfterLoss(currentSession)
      if (nextSession !== currentSession) {
        scheduleSoloCloudMutation(nextSession, {
          cost: continuationCost,
          eventType: 'pay_to_continue',
          puzzleIndex: 0,
        })
      }
      return nextSession
    })
    setContinuationMessage(`Spent ${continuationCost} coins for one more attempt.`)
  }, [continuationCost, onSpendCoins, practiceSeed, scheduleSoloCloudMutation, scope, session.continuationCount, session.status, setup.dateKey])

  const handleRevealAfterLoss = useCallback(() => {
    if (!canPayToContinue) {
      return
    }

    const answer = session.answer.toLocaleUpperCase('en-US')
    setSession((currentSession) => {
      const nextSession: PuzzleSessionState = {
        ...currentSession,
        currentGuess: '',
        lastValidation: undefined,
        revealedAnswer: true,
        status: 'lost',
      }
      scheduleSoloCloudMutation(nextSession, {
        eventType: 'reveal',
        puzzleIndex: 0,
      })
      return nextSession
    })
    setContinuationMessage(`Revealed the answer: ${answer}. This puzzle counts as a loss.`)
  }, [canPayToContinue, scheduleSoloCloudMutation, session.answer])

  const handleReveal = useCallback(async () => {
    if (!canReveal) {
      return
    }

    if (!await onSpendCoins(continuationCost, `spend:practice:og:${practiceSeed}:reveal`)) {
      setContinuationMessage(`You need ${continuationCost} coins to reveal this answer.`)
      return
    }

    const answer = session.answer.toLocaleUpperCase('en-US')
    setSession((currentSession) => {
      const nextSession: PuzzleSessionState = {
        ...currentSession,
        currentGuess: '',
        lastValidation: undefined,
        revealedAnswer: true,
        status: 'lost',
      }
      scheduleSoloCloudMutation(nextSession, {
        cost: continuationCost,
        eventType: 'reveal',
        puzzleIndex: 0,
      })
      return nextSession
    })
    setContinuationMessage(`Revealed the answer: ${answer}. This puzzle counts as a loss.`)
  }, [canReveal, continuationCost, onSpendCoins, practiceSeed, scheduleSoloCloudMutation, session.answer])

  useKeyboardInput({ disabled: keyboardDisabled, onInput: handleInput })

  const letterStates = {
    ...deriveKeyboardLetterStates(session.guesses),
    ...Object.fromEntries(consumableEffects.revealedHints.map((hint) => [hint.letter, 'correct' as const])),
  }
  const statusMessage = session.status === 'won'
    ? 'Solved. Daily completion is preserved on refresh.'
    : session.status === 'lost'
      ? lossAnswerRevealed
        ? `Out of attempts. The answer was ${session.answer.toLocaleUpperCase('en-US')}.`
        : 'Out of attempts. Continue this puzzle or reveal the answer to finish it.'
      : `${session.maxAttempts - session.guesses.length} attempts remaining.`
  const terminalControl = session.status === 'lost'
    ? canPayToContinue ? (
      <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-50">
        <p className="font-bold">Pay to Continue</p>
        <p>Spend {continuationCost} coins for one more attempt. Current balance: {coins} coins.</p>
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
    : continuationMessage ? (
      <div className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 p-3 text-sm font-semibold text-cyan-50">{continuationMessage}</div>
    ) : null
  const revealControl = canReveal ? (
    <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-4 text-sm leading-6 text-rose-50">
      <p className="font-bold">Give Up / Reveal Answer</p>
      <p>Reveal this answer for {continuationCost} coins. This counts as a loss. Current balance: {coins} coins.</p>
      <Button onClick={handleReveal} variant="secondary">
        Reveal answer ({continuationCost} coins)
      </Button>
    </div>
  ) : null
  const hasPostGuessControls = Boolean(terminalControl || revealControl)

  return (
    <section className="brrrdle-solo-gameplay space-y-5" aria-labelledby="og-game-title">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">og {scope}</p>
        <h2 id="og-game-title" className="text-3xl font-bold text-white">
          {scope === 'daily' ? 'Daily og puzzle' : 'Practice og puzzle'}
        </h2>
        <p className="max-w-3xl text-base leading-7 text-slate-300">
          Classic single-board Awordle is active with canonical tile states, physical keyboard input, on-screen keyboard input, and optional hard mode.
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
            <Button onClick={onPracticeSeedChange} variant="secondary">New practice puzzle</Button>
          </div>
        ) : null}

        {onSaveDifficultyDefault ? (
          <CustomizeMenu
            defaultDifficulty={defaultDifficulty}
            difficulty={difficulty}
            locked={session.guesses.length > 0}
            onDifficultyChange={onDifficultyChange}
            onSaveDefault={() => onSaveDifficultyDefault(difficulty)}
          />
        ) : null}

        <label className="flex items-center gap-3 text-sm font-semibold text-cyan-100">
          <input
            checked={session.hardMode}
            className="h-4 w-4 accent-cyan-300"
            disabled={session.guesses.length > 0}
            onChange={(event) => setSession((currentSession) => ({ ...currentSession, hardMode: event.target.checked, lastValidation: undefined }))}
            type="checkbox"
          />
          Hard mode
        </label>

        <GuessGrid effects={scope === 'practice' ? consumableEffects : createInitialConsumableEffects()} session={session} />

        <div aria-live="polite" className="min-h-20 rounded-2xl border border-slate-700 bg-slate-950/70 p-3 text-sm leading-6 text-slate-200" role="status">
          <p>{statusMessage}</p>
          {session.lastValidation ? <p className="mt-1 min-h-6 font-semibold text-amber-100">{session.lastValidation.message}</p> : <p aria-hidden="true" className="mt-1 min-h-6" />}
        </div>

        <div className="brrrdle-solo-post-guess-controls flex flex-col gap-4">
          <div
            className={classNames(hasPostGuessControls ? 'order-1 md:order-2' : undefined)}
            tabIndex={-1}
            {...{ [GAMEPLAY_AUTOCENTER_TARGET_ATTRIBUTE]: GAMEPLAY_AUTOCENTER_TARGETS.soloKeyboard }}
          >
            <Keyboard disabled={session.status !== 'playing'} disabledLetters={scope === 'practice' ? consumableEffects.removedLetters : undefined} letterStates={letterStates} onInput={handleInput} />
          </div>
          {hasPostGuessControls ? (
            <div className="order-2 flex flex-col gap-4 md:order-1">
              {terminalControl}
              {revealControl}
            </div>
          ) : null}
        </div>

        {scope === 'practice' ? (
          <PracticeConsumableControls consumables={consumables} disabled={session.status !== 'playing'} effects={consumableEffects} onUse={handleUseConsumable} />
        ) : null}


        {endStateRevealed ? (
          <ShareButton
            label="Share og result"
            text={formatOgShare({
              dateKey: setup.dateKey,
              guesses: session.guesses,
              maxAttempts: session.maxAttempts,
              mode: 'og',
              scope,
              status: session.status,
            })}
          />
        ) : null}

        <DefinitionPanel
          enabled={endStateRevealed}
          mode="og"
          scope={scope}
          word={session.answer}
          wordLength={session.wordLength}
        />
      </Panel>
    </section>
  )
}

export function OgGame({ coins, consumables = { removeIncorrectLetters: 0, revealOneLetter: 0 }, defaultDifficulty = DEFAULT_DIFFICULTY_TIER, defaultHardMode = false, initialResume, keyboardDisabled = false, onAdvancePracticeSeed, onConsumeConsumable, onGameComplete, onResumeCapture, onSoloCloudMutation, onSaveDifficultyDefault, onSpendCoins, practiceSeedCounter = 0, practiceSeedUserId, progressOwnerKey, scope, pastDailyDateKey, onMarkDailyUnlocked }: OgGameProps) {
  const [initialPracticeResume] = useState(() => initialResume?.scope === 'practice' ? initialResume : undefined)
  const initialDailyResume = initialResume?.scope === 'daily' ? initialResume : undefined
  // Practice resume captures are written on every input. Treat the incoming
  // resume slot as a one-shot restore source so those live captures do not
  // remount the active puzzle and replay submitted-row animations.
  const resumePractice = initialPracticeResume
  const practiceLengths = useMemo(() => getAvailableOgPracticeLengths(), [])
  const [practiceLength, setPracticeLength] = useState(() => resumePractice?.wordLength ?? 5)
  const [localPracticeSeed, setLocalPracticeSeed] = useState(0)
  const [difficulty, setDifficulty] = useState<DifficultyTier>(resumePractice?.difficulty ?? defaultDifficulty)
  const [resumeConsumed, setResumeConsumed] = useState(false)
  const activeResume = scope === 'practice'
    ? resumePractice && !resumeConsumed ? resumePractice : undefined
    : initialDailyResume
  const practiceSeed = practiceSeedUserId
    ? createAccountPracticeSeed('og', practiceSeedUserId, practiceSeedCounter)
    : localPracticeSeed
  const dailyDate = useMemo(
    () => pastDailyDateKey ? dateKeyToLocalDate(pastDailyDateKey) : getActiveDailyDate(),
    [pastDailyDateKey],
  )
  const requiredWordLength = scope === 'daily' ? 5 : practiceLength
  const preparation = useWordListPreparation(scope, requiredWordLength)
  const setup = useMemo(
    () => preparation.isReady
      ? (scope === 'daily' ? createDailyOgSetup(dailyDate, difficulty) : createPracticeOgSetup(practiceLength, practiceSeed, difficulty))
      : undefined,
    [dailyDate, difficulty, practiceLength, practiceSeed, preparation.isReady, scope],
  )
  if (!setup) {
    return <WordListPreparationPanel error={preparation.error} onRetry={preparation.retry} />
  }
  const sessionKey = createOgGameSessionKey({
    activeResume,
    difficulty,
    practiceLength,
    practiceSeed,
    progressOwnerKey,
    scope,
    setupDateKey: setup.dateKey,
  })

  return (
    <OgGameSession
      key={sessionKey}
      coins={coins}
      consumables={consumables}
      defaultDifficulty={defaultDifficulty}
      defaultHardMode={defaultHardMode}
      difficulty={difficulty}
      keyboardDisabled={keyboardDisabled}
      onDifficultyChange={(tier) => { setResumeConsumed(true); setDifficulty(tier) }}
      onGameComplete={onGameComplete}
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
