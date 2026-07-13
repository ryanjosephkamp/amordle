import type { Browser, BrowserContext, Page } from '@playwright/test'
import { cleanupE2eRun, cleanupStaleE2eArtifactsOnce, type CleanupSummary } from './cleanup'
import { createE2eUser, createRunId, signInThroughUi, type E2eUser } from './testUsers'
import { expectNoConsoleFailures, installConsoleGuards } from './assertions'

export interface TwoClientSession {
  readonly cleanup: () => Promise<CleanupSummary>
  readonly host: {
    readonly consoleFailures: readonly string[]
    readonly context: BrowserContext
    readonly page: Page
    readonly user: E2eUser
  }
  readonly rival: {
    readonly consoleFailures: readonly string[]
    readonly context: BrowserContext
    readonly page: Page
    readonly user: E2eUser
  }
  readonly runId: string
}

export async function createTwoClientSession(browser: Browser): Promise<TwoClientSession> {
  await cleanupStaleE2eArtifactsOnce()
  const runId = createRunId()
  const hostUser = await createE2eUser('host', runId)
  const rivalUser = await createE2eUser('rival', runId)
  const hostContext = await browser.newContext()
  const rivalContext = await browser.newContext()
  const hostPage = await hostContext.newPage()
  const rivalPage = await rivalContext.newPage()
  const hostConsoleFailures = installConsoleGuards(hostPage)
  const rivalConsoleFailures = installConsoleGuards(rivalPage)

  const protectedPreviewAccessUrl = process.env.E2E_PROTECTED_PREVIEW_ACCESS_URL
  if (protectedPreviewAccessUrl) {
    await Promise.all([
      hostPage.goto(protectedPreviewAccessUrl, { waitUntil: 'domcontentloaded' }),
      rivalPage.goto(protectedPreviewAccessUrl, { waitUntil: 'domcontentloaded' }),
    ])
  }

  await signInThroughUi(hostPage, hostUser)
  await signInThroughUi(rivalPage, rivalUser)

  let cleaned = false
  let cleanupPromise: Promise<CleanupSummary> | undefined
  async function cleanup(): Promise<CleanupSummary> {
    if (cleaned) {
      return {
        multiplayerRowsDeleted: 0,
        privateMatchRequestsDeleted: 0,
        rankedDailyAuthorityRowsDeleted: 0,
        rankedQueueRowsDeleted: 0,
        rankedRatingRowsDeleted: 0,
        usersDeleted: 0,
      }
    }
    cleanupPromise ??= (async () => {
      await Promise.allSettled([
        expectNoConsoleFailures(hostConsoleFailures),
        expectNoConsoleFailures(rivalConsoleFailures),
      ])
      await Promise.allSettled([
        hostContext.close(),
        rivalContext.close(),
      ])
      const summary = await cleanupE2eRun([hostUser, rivalUser])
      cleaned = true
      return summary
    })().catch((error: unknown) => {
      cleanupPromise = undefined
      throw error
    })
    return cleanupPromise
  }

  return {
    cleanup,
    host: {
      consoleFailures: hostConsoleFailures,
      context: hostContext,
      page: hostPage,
      user: hostUser,
    },
    rival: {
      consoleFailures: rivalConsoleFailures,
      context: rivalContext,
      page: rivalPage,
      user: rivalUser,
    },
    runId,
  }
}
