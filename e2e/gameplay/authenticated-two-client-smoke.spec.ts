import { test, type BrowserContext } from '@playwright/test'
import { expectNoConsoleFailures, installConsoleGuards } from '../fixtures/assertions'
import { cleanupE2eRun } from '../fixtures/cleanup'
import { getE2eEnv } from '../fixtures/env'
import { createE2eUser, createRunId, signInThroughUi, type E2eUser } from '../fixtures/testUsers'

test('two isolated authenticated browser contexts can sign in @multiplayer', async ({ browser }) => {
  getE2eEnv()

  const runId = createRunId()
  const users: E2eUser[] = []
  const contexts: BrowserContext[] = []
  try {
    const host = await createE2eUser('host', runId)
    const rival = await createE2eUser('rival', runId)
    users.push(host, rival)

    const hostContext = await browser.newContext()
    const rivalContext = await browser.newContext()
    contexts.push(hostContext, rivalContext)

    const hostPage = await hostContext.newPage()
    const rivalPage = await rivalContext.newPage()
    const hostConsole = installConsoleGuards(hostPage)
    const rivalConsole = installConsoleGuards(rivalPage)

    await signInThroughUi(hostPage, host)
    await signInThroughUi(rivalPage, rival)

    await expectNoConsoleFailures(hostConsole)
    await expectNoConsoleFailures(rivalConsole)
  } finally {
    await Promise.all(contexts.map((context) => context.close()))
    await cleanupE2eRun(users)
  }
})
