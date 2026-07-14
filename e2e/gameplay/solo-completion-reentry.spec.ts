import { expect, test, type Page } from '@playwright/test'
import { createAccountPracticeSeed, createSoloCloudSessionKey } from '../../src/account'
import { dateKeyToLocalDate } from '../../src/daily'
import { createDailyGoSetup, createPracticeGoSetup } from '../../src/game/go/session'
import { createDailyOgSetup, createPracticeOgSetup } from '../../src/game/og/session'
import { expectNoConsoleFailures, installConsoleGuards } from '../fixtures/assertions'
import { cleanupE2eRun } from '../fixtures/cleanup'
import { installFixedBrowserTime } from '../fixtures/dailyClock'
import { getE2eEnv } from '../fixtures/env'
import { chooseSoloPracticeMode, navigateToSoloPractice, submitSoloGuessWithKeyboard } from '../fixtures/gameActions'
import { createAuthenticatedSupabaseClient } from '../fixtures/supabaseAdmin'
import { createE2eUser, createRunId, signInThroughUi, type E2eUser } from '../fixtures/testUsers'

const GUEST_PROGRESS_STORAGE_KEY = 'brrrdle:guest-progress:v1'
const FIXED_DAILY_DATE_KEY = '2026-06-11'
const FIXED_DAILY_ISO = `${FIXED_DAILY_DATE_KEY}T16:00:00.000Z`

type SoloSlotKey = 'daily-og' | 'daily-go' | 'practice-og' | 'practice-go'

interface GuestProgressSnapshot {
  readonly completedGameIds: readonly string[]
  readonly history: readonly { readonly gameId: string }[]
  readonly progression: { readonly coins: number; readonly xp: number }
  readonly resumeSlot?: unknown
  readonly resumeSlots?: Partial<Record<SoloSlotKey, unknown>>
}

async function readGuestProgress(page: Page): Promise<GuestProgressSnapshot> {
  const rawProgress = await page.evaluate((key) => window.localStorage.getItem(key), GUEST_PROGRESS_STORAGE_KEY)
  if (!rawProgress) {
    throw new Error('Guest progress was not written to localStorage.')
  }
  return JSON.parse(rawProgress) as GuestProgressSnapshot
}

async function waitForCompletedGame(page: Page, gameId: string, slotKey: SoloSlotKey): Promise<GuestProgressSnapshot> {
  await expect.poll(async () => {
    const progress = await readGuestProgress(page)
    return progress.completedGameIds.includes(gameId) && !progress.resumeSlots?.[slotKey]
  }, { timeout: 20_000 }).toBe(true)
  return readGuestProgress(page)
}

async function navigateToSoloDaily(page: Page, mode: 'go' | 'og'): Promise<void> {
  await page.getByRole('button', { name: /^Solo$/i }).click()
  await expect(page.locator('#solo-workspace-title')).toBeVisible()
  await page.getByRole('tab', { name: /^Daily Solo$/i }).click()
  const modeGroup = page.getByRole('group', { name: /^Daily Solo mode$/i })
  await expect(modeGroup).toBeVisible()
  await modeGroup.getByRole('button', { name: new RegExp(`^${mode.toLocaleUpperCase('en-US')}$`, 'i') }).click()
}

async function typeSoloLettersWithKeyboard(page: Page, regionName: RegExp, letters: string): Promise<void> {
  const game = page.getByRole('region', { name: regionName })
  for (const letter of letters.toLocaleUpperCase('en-US')) {
    await game.getByRole('button', { name: new RegExp(`^Enter ${letter}$`, 'i') }).click()
  }
}

async function deleteSoloLettersWithKeyboard(page: Page, regionName: RegExp, count: number): Promise<void> {
  const game = page.getByRole('region', { name: regionName })
  for (let index = 0; index < count; index += 1) {
    await game.getByRole('button', { name: /^Delete letter$/i }).click()
  }
}

async function goHome(page: Page): Promise<void> {
  await page.getByRole('button', { name: /amordle Command Center/i }).click()
  await expect(page.locator('#dashboard-home-title')).toBeVisible()
}

async function expectHomeAfterStartupSettles(page: Page): Promise<void> {
  await expect(page.locator('#dashboard-home-title')).toBeVisible({ timeout: 20_000 })
  // There is no explicit "auth hydration complete" signal on Home. Give async
  // auth/progress resume effects a short window, then assert they did not route
  // the app away from Home without a user action.
  await page.waitForTimeout(2_000)
  await expect(page.locator('#dashboard-home-title')).toBeVisible()
  await expect(page.locator('#solo-workspace-title')).toBeHidden()
}

async function waitForSignedInProgressHydration(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Settings$/i }).click()
  await expect(page.locator('#settings-title')).toBeVisible()
  await expect(page.getByText(/^Syncing signed-in progress with Supabase\.$/i)).toBeHidden({ timeout: 20_000 })
}

async function waitForSoloCloudSessionStatus(user: E2eUser, sessionKey: string, status: 'playing' | 'won' | 'lost'): Promise<void> {
  const client = await createAuthenticatedSupabaseClient(user)
  await expect.poll(async () => {
    const { data, error } = await client
      .from('game_history')
      .select('entry')
      .eq('user_id', user.id)
      .eq('id', sessionKey)
      .maybeSingle()
    if (error || !data) {
      return undefined
    }
    const entry = data.entry as { readonly kind?: string; readonly session?: { readonly status?: string } } | undefined
    return entry?.kind === 'solo-cloud-session-v1' ? entry.session?.status : undefined
  }, { timeout: 20_000 }).toBe(status)
}

async function waitForSoloCloudGuessCount(user: E2eUser, sessionKey: string, expectedCount: number): Promise<void> {
  const client = await createAuthenticatedSupabaseClient(user)
  await expect.poll(async () => {
    const { data, error } = await client
      .from('game_history')
      .select('entry')
      .eq('user_id', user.id)
      .eq('id', sessionKey)
      .maybeSingle()
    if (error || !data) {
      return -1
    }
    const entry = data.entry as {
      readonly kind?: string
      readonly session?: {
        readonly mode?: string
        readonly serializedSession?: {
          readonly guesses?: readonly string[]
          readonly puzzles?: readonly { readonly guesses?: readonly string[] }[]
        }
      }
    } | undefined
    if (entry?.kind !== 'solo-cloud-session-v1') {
      return -1
    }
    if (entry.session?.mode === 'go') {
      return entry.session.serializedSession?.puzzles?.[0]?.guesses?.length ?? -1
    }
    return entry.session?.serializedSession?.guesses?.length ?? -1
  }, { timeout: 20_000 }).toBe(expectedCount)
}

function findWrongGuess(validGuesses: ReadonlySet<string>, answer: string): string {
  const guess = [...validGuesses].find((candidate) => candidate.length === answer.length && candidate !== answer)
  if (!guess) {
    throw new Error(`No wrong ${answer.length}-letter guess is available for the test fixture.`)
  }
  return guess
}

async function expectSubmittedWord(page: Page, gridLabel: RegExp, word: string, rowNumber: number): Promise<void> {
  const grid = page.getByRole('grid', { name: gridLabel }).first()
  await expect(grid).toBeVisible()
  for (const [index, letter] of [...word.toLocaleUpperCase('en-US')].entries()) {
    const tile = grid.getByLabel(new RegExp(`^Row ${rowNumber}, tile ${index + 1}, ${letter}$`, 'i'))
    await expect(tile).toBeVisible()
    await expect(tile).toHaveClass(/bg-emerald-300\/25/)
  }
}

async function expectWordVisible(page: Page, gridLabel: RegExp, word: string, rowNumber: number): Promise<void> {
  const grid = page.getByRole('grid', { name: gridLabel }).first()
  await expect(grid).toBeVisible()
  for (const [index, letter] of [...word.toLocaleUpperCase('en-US')].entries()) {
    await expect(grid.getByLabel(new RegExp(`^Row ${rowNumber}, tile ${index + 1}, ${letter}$`, 'i'))).toBeVisible()
  }
}

async function expectDraftRowEmpty(page: Page, gridLabel: RegExp, rowNumber: number): Promise<void> {
  const grid = page.getByRole('grid', { name: gridLabel }).first()
  await expect(grid).toBeVisible()
  for (let index = 0; index < 5; index += 1) {
    await expect(grid.getByLabel(new RegExp(`^Row ${rowNumber}, tile ${index + 1}$`, 'i'))).toBeVisible()
  }
}

async function expectTerminalState(page: Page, statusText: RegExp, gridLabel: RegExp, finalAnswer: string, rowNumber: number): Promise<void> {
  await expect(page.getByText(statusText).first()).toBeVisible({ timeout: 20_000 })
  await expectSubmittedWord(page, gridLabel, finalAnswer, rowNumber)
}

async function expectCompletionSurvivesReentry(
  page: Page,
  options: {
    readonly gameId: string
    readonly slotKey: SoloSlotKey
    readonly statusText: RegExp
    readonly gridLabel: RegExp
    readonly finalAnswer: string
    readonly finalAnswerRow: number
    readonly reenter: () => Promise<void>
  },
): Promise<void> {
  const completedProgress = await waitForCompletedGame(page, options.gameId, options.slotKey)
  expect(completedProgress.history.filter((entry) => entry.gameId === options.gameId)).toHaveLength(1)
  expect(completedProgress.resumeSlots?.[options.slotKey]).toBeUndefined()

  await page.goBack()
  await page.goForward()
  await expectTerminalState(page, options.statusText, options.gridLabel, options.finalAnswer, options.finalAnswerRow)
  await expect(readGuestProgress(page)).resolves.toEqual(completedProgress)

  await goHome(page)
  await page.goBack()
  await expectTerminalState(page, options.statusText, options.gridLabel, options.finalAnswer, options.finalAnswerRow)
  await expect(readGuestProgress(page)).resolves.toEqual(completedProgress)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#dashboard-home-title')).toBeVisible({ timeout: 20_000 })
  await expect(readGuestProgress(page)).resolves.toEqual(completedProgress)

  await options.reenter()
  await expectTerminalState(page, options.statusText, options.gridLabel, options.finalAnswer, options.finalAnswerRow)
  await expect(readGuestProgress(page)).resolves.toEqual(completedProgress)
}

async function solveGoChain(page: Page, regionName: RegExp, answers: readonly string[]): Promise<void> {
  for (const [index, answer] of answers.entries()) {
    await submitSoloGuessWithKeyboard(page, regionName, answer)
    if (index < answers.length - 1) {
      await expect(page.getByText(new RegExp(`Puzzle ${index + 2} of ${answers.length}`, 'i')).first()).toBeVisible({ timeout: 20_000 })
    }
  }
}

async function installRevealAnimationRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const eventKey = '__brrrdleRevealAnimationEvents'
    const listenerKey = '__brrrdleRevealAnimationListenerInstalled'
    const targetWindow = window as typeof window & {
      [eventKey]?: string[]
      [listenerKey]?: boolean
    }
    targetWindow[eventKey] = []
    if (targetWindow[listenerKey]) {
      return
    }
    document.addEventListener('animationstart', (event) => {
      if (event.animationName.includes('brrrdle-tile-reveal')) {
        targetWindow[eventKey]?.push((event.target as HTMLElement | null)?.getAttribute('aria-label') ?? event.animationName)
      }
    }, true)
    targetWindow[listenerKey] = true
  })
}

async function expectNoRevealAnimationsRecorded(page: Page): Promise<void> {
  await page.waitForTimeout(500)
  const events = await page.evaluate(() => (window as typeof window & { __brrrdleRevealAnimationEvents?: string[] }).__brrrdleRevealAnimationEvents ?? [])
  expect(events).toEqual([])
}

test.describe('Solo completion re-entry @solo @practice @daily', () => {
  test('keeps authenticated Daily OG and GO wrong guesses across focus, route re-entry, and refresh', async ({ browser }) => {
    getE2eEnv()
    const runId = createRunId()
    const users: E2eUser[] = []
    const context = await browser.newContext()
    await installFixedBrowserTime(context, FIXED_DAILY_ISO)
    const page = await context.newPage()
    const consoleFailures = installConsoleGuards(page)
    try {
      const user = await createE2eUser('solo-daily-in-progress', runId)
      users.push(user)
      await signInThroughUi(page, user)
      await waitForSignedInProgressHydration(page)

      const ogSetup = createDailyOgSetup(dateKeyToLocalDate(FIXED_DAILY_DATE_KEY))
      const ogWrongGuess = findWrongGuess(ogSetup.validGuesses, ogSetup.answer)
      await navigateToSoloDaily(page, 'og')
      await submitSoloGuessWithKeyboard(page, /Daily og puzzle/i, ogWrongGuess)
      await expectWordVisible(page, /^Guess grid$/i, ogWrongGuess, 1)
      await waitForSoloCloudGuessCount(user, createSoloCloudSessionKey({
        dailyDateKey: FIXED_DAILY_DATE_KEY,
        difficulty: 'expert',
        mode: 'og',
        scope: 'daily',
        wordLength: 5,
      }), 1)

      const otherPage = await context.newPage()
      await otherPage.goto('about:blank')
      await otherPage.bringToFront()
      await page.bringToFront()
      await expectWordVisible(page, /^Guess grid$/i, ogWrongGuess, 1)
      await otherPage.close()

      await goHome(page)
      await navigateToSoloDaily(page, 'og')
      await expectWordVisible(page, /^Guess grid$/i, ogWrongGuess, 1)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectHomeAfterStartupSettles(page)
      await navigateToSoloDaily(page, 'og')
      await expectWordVisible(page, /^Guess grid$/i, ogWrongGuess, 1)

      const goSetup = createDailyGoSetup(dateKeyToLocalDate(FIXED_DAILY_DATE_KEY))
      const goWrongGuess = findWrongGuess(goSetup.validGuesses, goSetup.puzzles[0].answer)
      await navigateToSoloDaily(page, 'go')
      await submitSoloGuessWithKeyboard(page, /Daily go chain/i, goWrongGuess)
      await expectWordVisible(page, /^Go guess grid$/i, goWrongGuess, 1)
      await waitForSoloCloudGuessCount(user, createSoloCloudSessionKey({
        dailyDateKey: FIXED_DAILY_DATE_KEY,
        difficulty: 'expert',
        mode: 'go',
        scope: 'daily',
        wordLength: 5,
      }), 1)

      await goHome(page)
      await navigateToSoloDaily(page, 'go')
      await expectWordVisible(page, /^Go guess grid$/i, goWrongGuess, 1)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectHomeAfterStartupSettles(page)
      await navigateToSoloDaily(page, 'go')
      await expectWordVisible(page, /^Go guess grid$/i, goWrongGuess, 1)
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await context.close()
      await cleanupE2eRun(users)
    }
  })

  test('keeps Daily OG deleted draft letters cleared after scroll and route re-entry', async ({ browser }) => {
    const context = await browser.newContext()
    await installFixedBrowserTime(context, FIXED_DAILY_ISO)
    const page = await context.newPage()
    const consoleFailures = installConsoleGuards(page)
    try {
      await page.goto('/')
      await navigateToSoloDaily(page, 'og')

      await typeSoloLettersWithKeyboard(page, /Daily og puzzle/i, 'crane')
      await deleteSoloLettersWithKeyboard(page, /Daily og puzzle/i, 5)
      await expectDraftRowEmpty(page, /^Guess grid$/i, 1)

      await page.evaluate(() => window.scrollTo({ behavior: 'auto', top: document.body.scrollHeight }))
      await expectDraftRowEmpty(page, /^Guess grid$/i, 1)

      await goHome(page)
      await navigateToSoloDaily(page, 'og')
      await expectDraftRowEmpty(page, /^Guess grid$/i, 1)
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await context.close()
    }
  })

  test('keeps Daily GO settled rows stable during ordinary keyboard input', async ({ browser }) => {
    const context = await browser.newContext()
    await installFixedBrowserTime(context, FIXED_DAILY_ISO)
    const page = await context.newPage()
    const consoleFailures = installConsoleGuards(page)
    try {
      await page.goto('/')
      await navigateToSoloDaily(page, 'go')

      const answers = createDailyGoSetup(dateKeyToLocalDate(FIXED_DAILY_DATE_KEY)).puzzles.map((puzzle) => puzzle.answer)
      await submitSoloGuessWithKeyboard(page, /Daily go chain/i, answers[0])
      await expect(page.getByText(/Puzzle 2 of 5/i).first()).toBeVisible({ timeout: 20_000 })
      await installRevealAnimationRecorder(page)

      await typeSoloLettersWithKeyboard(page, /Daily go chain/i, answers[1][0])
      await expectNoRevealAnimationsRecorded(page)
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await context.close()
    }
  })

  test('keeps completed Practice OG visible across route re-entry and browser Back without duplicate rewards', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'og')

    const answer = createPracticeOgSetup(5, 0).answer
    await submitSoloGuessWithKeyboard(page, /Practice og puzzle/i, answer)
    await expectTerminalState(page, /^Solved\. Daily completion is preserved on refresh\.$/i, /^Guess grid$/i, answer, 1)

    await expectCompletionSurvivesReentry(page, {
      finalAnswer: answer,
      finalAnswerRow: 1,
      gameId: `og:practice:5:0:${answer}`,
      gridLabel: /^Guess grid$/i,
      reenter: async () => {
        await navigateToSoloPractice(page)
        await chooseSoloPracticeMode(page, 'og')
      },
      slotKey: 'practice-og',
      statusText: /^Solved\. Daily completion is preserved on refresh\.$/i,
    })
    await expectNoConsoleFailures(consoleFailures)
  })

  test('keeps completed Practice GO visible across route re-entry and browser Back without duplicate rewards', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'go')

    const answers = createPracticeGoSetup(5, 0).puzzles.map((puzzle) => puzzle.answer)
    await solveGoChain(page, /Practice go chain/i, answers)
    await expectTerminalState(page, /^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i, /^Go guess grid$/i, answers[answers.length - 1], answers.length)

    await expectCompletionSurvivesReentry(page, {
      finalAnswer: answers[answers.length - 1],
      finalAnswerRow: answers.length,
      gameId: `go:practice:5:${answers.join('-')}`,
      gridLabel: /^Go guess grid$/i,
      reenter: async () => {
        await navigateToSoloPractice(page)
        await chooseSoloPracticeMode(page, 'go')
      },
      slotKey: 'practice-go',
      statusText: /^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i,
    })
    await expectNoConsoleFailures(consoleFailures)
  })

  test('keeps a fresh Practice GO chain selected after a completed chain is superseded and the page refreshes', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'go')

    const completedAnswers = createPracticeGoSetup(5, 0).puzzles.map((puzzle) => puzzle.answer)
    await solveGoChain(page, /Practice go chain/i, completedAnswers)
    await expectTerminalState(page, /^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i, /^Go guess grid$/i, completedAnswers[completedAnswers.length - 1], completedAnswers.length)

    await page.getByRole('button', { name: /^New go chain$/i }).click()
    await expect(page.getByText(/Puzzle 1 of 5/i).first()).toBeVisible({ timeout: 20_000 })
    await expectDraftRowEmpty(page, /^Go guess grid$/i, 1)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('#dashboard-home-title')).toBeVisible({ timeout: 20_000 })
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'go')
    await expect(page.getByRole('region', { name: /Practice go chain/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i).first()).toBeHidden()
    await expect(page.getByText(/Puzzle 1 of 5/i).first()).toBeVisible({ timeout: 20_000 })
    await expectDraftRowEmpty(page, /^Go guess grid$/i, 1)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('restores a valid first guess in a superseding Practice GO chain after refresh', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'go')

    const completedAnswers = createPracticeGoSetup(5, 0).puzzles.map((puzzle) => puzzle.answer)
    await solveGoChain(page, /Practice go chain/i, completedAnswers)
    await expectTerminalState(page, /^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i, /^Go guess grid$/i, completedAnswers[completedAnswers.length - 1], completedAnswers.length)

    await page.getByRole('button', { name: /^New go chain$/i }).click()
    const nextSetup = createPracticeGoSetup(5, 1)
    const wrongGuess = findWrongGuess(nextSetup.validGuesses, nextSetup.puzzles[0].answer)
    await submitSoloGuessWithKeyboard(page, /Practice go chain/i, wrongGuess)
    await expectWordVisible(page, /^Go guess grid$/i, wrongGuess, 1)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('#dashboard-home-title')).toBeVisible({ timeout: 20_000 })
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'go')
    await expect(page.getByRole('region', { name: /Practice go chain/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i).first()).toBeHidden()
    await expectWordVisible(page, /^Go guess grid$/i, wrongGuess, 1)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('restores a valid first guess in a superseding Practice OG puzzle after refresh', async ({ page }) => {
    const consoleFailures = installConsoleGuards(page)
    await page.goto('/')
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'og')

    const completedAnswer = createPracticeOgSetup(5, 0).answer
    await submitSoloGuessWithKeyboard(page, /Practice og puzzle/i, completedAnswer)
    await expectTerminalState(page, /^Solved\. Daily completion is preserved on refresh\.$/i, /^Guess grid$/i, completedAnswer, 1)

    await page.getByRole('button', { name: /^New practice puzzle$/i }).click()
    const nextSetup = createPracticeOgSetup(5, 1)
    const wrongGuess = findWrongGuess(nextSetup.validGuesses, nextSetup.answer)
    await submitSoloGuessWithKeyboard(page, /Practice og puzzle/i, wrongGuess)
    await expectWordVisible(page, /^Guess grid$/i, wrongGuess, 1)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('#dashboard-home-title')).toBeVisible({ timeout: 20_000 })
    await navigateToSoloPractice(page)
    await chooseSoloPracticeMode(page, 'og')
    await expect(page.getByRole('region', { name: /Practice og puzzle/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/^Solved\. Daily completion is preserved on refresh\.$/i).first()).toBeHidden()
    await expectWordVisible(page, /^Guess grid$/i, wrongGuess, 1)
    await expectNoConsoleFailures(consoleFailures)
  })

  test('keeps completed Daily OG visible across route re-entry and browser Back without duplicate rewards', async ({ browser }) => {
    const context = await browser.newContext()
    await installFixedBrowserTime(context, FIXED_DAILY_ISO)
    const page = await context.newPage()
    const consoleFailures = installConsoleGuards(page)
    try {
      await page.goto('/')
      await navigateToSoloDaily(page, 'og')

      const answer = createDailyOgSetup(dateKeyToLocalDate(FIXED_DAILY_DATE_KEY)).answer
      await submitSoloGuessWithKeyboard(page, /Daily og puzzle/i, answer)
      await expectTerminalState(page, /^Solved\. Daily completion is preserved on refresh\.$/i, /^Guess grid$/i, answer, 1)

      await expectCompletionSurvivesReentry(page, {
        finalAnswer: answer,
        finalAnswerRow: 1,
        gameId: `og:daily:${FIXED_DAILY_DATE_KEY}`,
        gridLabel: /^Guess grid$/i,
        reenter: () => navigateToSoloDaily(page, 'og'),
        slotKey: 'daily-og',
        statusText: /^Solved\. Daily completion is preserved on refresh\.$/i,
      })
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await context.close()
    }
  })

  test('keeps completed Daily GO visible across route re-entry and browser Back without duplicate rewards', async ({ browser }) => {
    const context = await browser.newContext()
    await installFixedBrowserTime(context, FIXED_DAILY_ISO)
    const page = await context.newPage()
    const consoleFailures = installConsoleGuards(page)
    try {
      await page.goto('/')
      await navigateToSoloDaily(page, 'go')

      const answers = createDailyGoSetup(dateKeyToLocalDate(FIXED_DAILY_DATE_KEY)).puzzles.map((puzzle) => puzzle.answer)
      await solveGoChain(page, /Daily go chain/i, answers)
      await expectTerminalState(page, /^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i, /^Go guess grid$/i, answers[answers.length - 1], answers.length)

      await expectCompletionSurvivesReentry(page, {
        finalAnswer: answers[answers.length - 1],
        finalAnswerRow: answers.length,
        gameId: `go:daily:${FIXED_DAILY_DATE_KEY}`,
        gridLabel: /^Go guess grid$/i,
        reenter: () => navigateToSoloDaily(page, 'go'),
        slotKey: 'daily-go',
        statusText: /^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i,
      })
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await context.close()
    }
  })

  test('restores authenticated Daily GO puzzle-two progress in a fresh browser after first puzzle solve', async ({ browser }) => {
    getE2eEnv()

    const runId = createRunId()
    const users: E2eUser[] = []
    const context = await browser.newContext()
    await installFixedBrowserTime(context, FIXED_DAILY_ISO)
    const page = await context.newPage()
    const consoleFailures = installConsoleGuards(page)
    let restoreContext: Awaited<ReturnType<typeof browser.newContext>> | undefined
    try {
      const user = await createE2eUser('solo-daily-go-transition', runId)
      users.push(user)

      await signInThroughUi(page, user)
      await waitForSignedInProgressHydration(page)
      await navigateToSoloDaily(page, 'go')

      const answers = createDailyGoSetup(dateKeyToLocalDate(FIXED_DAILY_DATE_KEY)).puzzles.map((puzzle) => puzzle.answer)
      await submitSoloGuessWithKeyboard(page, /Daily go chain/i, answers[0])
      await expect(page.getByText(/Puzzle 2 of 5/i).first()).toBeVisible({ timeout: 20_000 })
      await waitForSoloCloudSessionStatus(user, createSoloCloudSessionKey({
        dailyDateKey: FIXED_DAILY_DATE_KEY,
        difficulty: 'expert',
        mode: 'go',
        scope: 'daily',
        wordLength: 5,
      }), 'playing')

      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectHomeAfterStartupSettles(page)
      await navigateToSoloDaily(page, 'go')
      await expect(page.getByText(/Puzzle 2 of 5/i).first()).toBeVisible({ timeout: 20_000 })
      await expectWordVisible(page, /^Go guess grid$/i, answers[0], 1)

      restoreContext = await browser.newContext()
      await installFixedBrowserTime(restoreContext, FIXED_DAILY_ISO)
      const restorePage = await restoreContext.newPage()
      const restoreConsoleFailures = installConsoleGuards(restorePage)
      await signInThroughUi(restorePage, user)
      await waitForSignedInProgressHydration(restorePage)
      await navigateToSoloDaily(restorePage, 'go')
      await expect(restorePage.getByText(/Puzzle 2 of 5/i).first()).toBeVisible({ timeout: 20_000 })
      await expectWordVisible(restorePage, /^Go guess grid$/i, answers[0], 1)
      await expectNoConsoleFailures(restoreConsoleFailures)
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await restoreContext?.close()
      await context.close()
      await cleanupE2eRun(users)
    }
  })

  test('keeps completed authenticated Daily OG and GO visible after reload and account hydration', async ({ browser }) => {
    getE2eEnv()

    const runId = createRunId()
    const users: E2eUser[] = []
    const context = await browser.newContext()
    await installFixedBrowserTime(context, FIXED_DAILY_ISO)
    const page = await context.newPage()
    const consoleFailures = installConsoleGuards(page)
    let restoreContext: Awaited<ReturnType<typeof browser.newContext>> | undefined
    try {
      const user = await createE2eUser('solo-daily-go', runId)
      users.push(user)

      await signInThroughUi(page, user)
      await waitForSignedInProgressHydration(page)

      await navigateToSoloDaily(page, 'og')
      const ogAnswer = createDailyOgSetup(dateKeyToLocalDate(FIXED_DAILY_DATE_KEY)).answer
      await submitSoloGuessWithKeyboard(page, /Daily og puzzle/i, ogAnswer)
      await expectTerminalState(page, /^Solved\. Daily completion is preserved on refresh\.$/i, /^Guess grid$/i, ogAnswer, 1)
      await waitForSoloCloudSessionStatus(user, createSoloCloudSessionKey({
        dailyDateKey: FIXED_DAILY_DATE_KEY,
        difficulty: 'expert',
        mode: 'og',
        scope: 'daily',
        wordLength: 5,
      }), 'won')

      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectHomeAfterStartupSettles(page)
      await navigateToSoloDaily(page, 'og')
      await expectTerminalState(page, /^Solved\. Daily completion is preserved on refresh\.$/i, /^Guess grid$/i, ogAnswer, 1)

      await goHome(page)
      await page.goBack()
      await expectTerminalState(page, /^Solved\. Daily completion is preserved on refresh\.$/i, /^Guess grid$/i, ogAnswer, 1)

      await navigateToSoloDaily(page, 'go')

      const answers = createDailyGoSetup(dateKeyToLocalDate(FIXED_DAILY_DATE_KEY)).puzzles.map((puzzle) => puzzle.answer)
      await solveGoChain(page, /Daily go chain/i, answers)
      await expectTerminalState(page, /^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i, /^Go guess grid$/i, answers[answers.length - 1], answers.length)
      await waitForSoloCloudSessionStatus(user, createSoloCloudSessionKey({
        dailyDateKey: FIXED_DAILY_DATE_KEY,
        difficulty: 'expert',
        mode: 'go',
        scope: 'daily',
        wordLength: 5,
      }), 'won')

      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectHomeAfterStartupSettles(page)
      await navigateToSoloDaily(page, 'go')
      await expectTerminalState(page, /^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i, /^Go guess grid$/i, answers[answers.length - 1], answers.length)

      await goHome(page)
      await page.goBack()
      await expectTerminalState(page, /^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i, /^Go guess grid$/i, answers[answers.length - 1], answers.length)

      restoreContext = await browser.newContext()
      await installFixedBrowserTime(restoreContext, FIXED_DAILY_ISO)
      const restorePage = await restoreContext.newPage()
      const restoreConsoleFailures = installConsoleGuards(restorePage)
      await signInThroughUi(restorePage, user)
      await waitForSignedInProgressHydration(restorePage)
      await navigateToSoloDaily(restorePage, 'og')
      await expectTerminalState(restorePage, /^Solved\. Daily completion is preserved on refresh\.$/i, /^Guess grid$/i, ogAnswer, 1)
      await navigateToSoloDaily(restorePage, 'go')
      await expectTerminalState(restorePage, /^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i, /^Go guess grid$/i, answers[answers.length - 1], answers.length)
      await expectNoConsoleFailures(restoreConsoleFailures)
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await restoreContext?.close()
      await context.close()
      await cleanupE2eRun(users)
    }
  })

  test('restores authenticated Practice GO superseding-chain progress in a fresh browser', async ({ browser }) => {
    getE2eEnv()

    const runId = createRunId()
    const users: E2eUser[] = []
    const context = await browser.newContext()
    const page = await context.newPage()
    const consoleFailures = installConsoleGuards(page)
    let restoreContext: Awaited<ReturnType<typeof browser.newContext>> | undefined
    try {
      const user = await createE2eUser('solo-practice-go-supersede', runId)
      users.push(user)

      await signInThroughUi(page, user)
      await waitForSignedInProgressHydration(page)
      await navigateToSoloPractice(page)
      await chooseSoloPracticeMode(page, 'go')

      const firstSeed = createAccountPracticeSeed('go', user.id, 0)
      const firstAnswers = createPracticeGoSetup(5, firstSeed).puzzles.map((puzzle) => puzzle.answer)
      await solveGoChain(page, /Practice go chain/i, firstAnswers)
      await expectTerminalState(page, /^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i, /^Go guess grid$/i, firstAnswers[firstAnswers.length - 1], firstAnswers.length)
      await waitForSoloCloudSessionStatus(user, createSoloCloudSessionKey({
        difficulty: 'expert',
        goPuzzleCount: 5,
        mode: 'go',
        practiceSeed: firstSeed,
        scope: 'practice',
        wordLength: 5,
      }), 'won')

      await page.getByRole('button', { name: /^New go chain$/i }).click()
      const nextSeed = createAccountPracticeSeed('go', user.id, 1)
      const nextSetup = createPracticeGoSetup(5, nextSeed)
      const wrongGuess = findWrongGuess(nextSetup.validGuesses, nextSetup.puzzles[0].answer)
      await submitSoloGuessWithKeyboard(page, /Practice go chain/i, wrongGuess)
      await expectWordVisible(page, /^Go guess grid$/i, wrongGuess, 1)
      await waitForSoloCloudSessionStatus(user, createSoloCloudSessionKey({
        difficulty: 'expert',
        goPuzzleCount: 5,
        mode: 'go',
        practiceSeed: nextSeed,
        scope: 'practice',
        wordLength: 5,
      }), 'playing')

      restoreContext = await browser.newContext()
      const restorePage = await restoreContext.newPage()
      const restoreConsoleFailures = installConsoleGuards(restorePage)
      await signInThroughUi(restorePage, user)
      await waitForSignedInProgressHydration(restorePage)
      await navigateToSoloPractice(restorePage)
      await chooseSoloPracticeMode(restorePage, 'go')
      await expect(restorePage.getByText(/^Solved all 5 go puzzles\. Daily completion is preserved on refresh\.$/i).first()).toBeHidden()
      await expectWordVisible(restorePage, /^Go guess grid$/i, wrongGuess, 1)
      await expectNoConsoleFailures(restoreConsoleFailures)
      await expectNoConsoleFailures(consoleFailures)
    } finally {
      await restoreContext?.close()
      await context.close()
      await cleanupE2eRun(users)
    }
  })
})
