import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import rawLength3 from '../../src/latest/words_length_3.json' with { type: 'json' }
import rawLength5 from '../../src/latest/words_length_5.json' with { type: 'json' }
import rawLength8 from '../../src/latest/words_length_8.json' with { type: 'json' }
import rawLength35 from '../../src/latest/words_length_35.json' with { type: 'json' }
import {
  prepareBundledWordList,
  setWordListImporterForTests,
} from '../../src/data/loadWordList'
import { createPracticeOgSetup } from '../../src/game'
import {
  createMultiplayerGame,
  getMultiplayerAnswerWords,
  joinMultiplayerGame,
  submitMultiplayerGuess,
  type MultiplayerGame,
} from '../../src/multiplayer/multiplayer'
import type { MultiplayerLiveGameViewModel } from '../../src/multiplayer/multiplayerViewModels'
import { expectNoHorizontalOverflow } from '../fixtures/assertions'

const evidenceDirectory = process.env.WAVE04_EVIDENCE_DIR
const rawWordLists = new Map<number, unknown>([
  [3, rawLength3],
  [5, rawLength5],
  [8, rawLength8],
  [35, rawLength35],
])

setWordListImporterForTests(async (length) => rawWordLists.get(length))
for (const length of rawWordLists.keys()) {
  const prepared = await prepareBundledWordList('practice', length)
  if (!prepared.ok) {
    throw new Error(`Unable to prepare the ${length}-letter Wave 04 word-list fixture: ${prepared.reason}`)
  }
}

function createPlayingGame(wordLength: number, mode: 'go' | 'og' = 'og'): MultiplayerGame {
  const game = createMultiplayerGame({
    goPuzzleCount: 5,
    mode,
    playerProfiles: {
      'player-one': { label: 'Dennis' },
      'player-two': { label: 'Mayar' },
    },
    playerUserIds: { 'player-one': 'host-user' },
    scope: 'practice',
    seed: 1,
    timeLimitMs: wordLength === 3 ? 300_000 : null,
    wordLength,
  })
  return joinMultiplayerGame({ games: [game] }, {
    gameId: game.id,
    userId: 'rival-user',
  }).game!
}

function createSubmittedFiveLetterGame(): MultiplayerGame {
  const game = createPlayingGame(5)
  const setup = createPracticeOgSetup(5, 1)
  const answer = getMultiplayerAnswerWords(game)[0]
  const guess = [...setup.validGuesses].find((candidate) => candidate !== answer)!
  return submitMultiplayerGuess({ games: [game] }, {
    gameId: game.id,
    guess,
    playerId: 'player-one',
  }).game!
}

function createTerminalGame(reason: 'cancelled' | 'forfeit' | 'points' | 'timeout'): MultiplayerGame {
  const playing = createSubmittedFiveLetterGame()
  if (reason === 'cancelled') {
    return {
      ...playing,
      moves: [],
      status: 'cancelled',
      winnerId: undefined,
    }
  }
  if (reason === 'forfeit') {
    return {
      ...playing,
      forfeitedPlayerId: 'player-one',
      status: 'lost',
      winnerId: 'player-two',
    }
  }
  if (reason === 'timeout') {
    return {
      ...playing,
      status: 'expired',
      timedOutPlayerId: 'player-one',
      winnerId: 'player-two',
    }
  }
  return {
    ...playing,
    status: 'won',
    winnerId: 'player-one',
  }
}

function createDailyWaitingGame(): MultiplayerGame {
  const game = createMultiplayerGame({
    createdAt: '2026-07-20T16:00:00.000Z',
    dailyDateKey: '2026-07-20',
    mode: 'og',
    playerProfiles: {
      'player-one': { label: 'Dennis' },
      'player-two': { label: 'Mayar' },
    },
    playerUserIds: { 'player-one': 'host-user' },
    scope: 'daily',
    wordLength: 5,
  })
  return joinMultiplayerGame({ games: [game] }, {
    gameId: game.id,
    userId: 'rival-user',
  }).game!
}

function createExtendedGame(): MultiplayerGame {
  const game = createPlayingGame(5)
  const extendedSession = {
    ...game.serializedSession,
    session: {
      ...game.serializedSession.session,
      maxAttempts: 9,
    },
  }
  return {
    ...game,
    playerSessions: {
      ...game.playerSessions,
      'player-one': extendedSession,
    },
    serializedSession: extendedSession,
  } as MultiplayerGame
}

const spectatorGame: MultiplayerLiveGameViewModel = {
  actionLabel: 'Spectate live game',
  canResume: false,
  canSpectate: true,
  detailLabel: '3 shared guesses',
  id: 'wave-04-public-spectator',
  mode: 'og',
  modeLabel: 'OG',
  opponentLabel: 'Two-player match',
  rankingLabel: 'Unranked',
  ruleLabel: '5 letters · No time limit',
  scope: 'practice',
  scopeLabel: 'Practice Multiplayer',
  spectatorDetails: {
    capabilityLabel: 'Shared board evidence only · no score, Elo, answer, latency, or mutation controls',
    moves: [
      {
        createdAt: '2026-07-20T16:01:00.000Z',
        guess: 'CRANE',
        playerLabel: 'Player one',
        puzzleLabel: 'Puzzle 1',
        tiles: 'CRANE'.split('').map((letter, index) => ({
          letter,
          state: index === 2 ? 'present' as const : 'absent' as const,
        })),
      },
      {
        createdAt: '2026-07-20T16:02:00.000Z',
        guess: 'SLATE',
        playerLabel: 'Player two',
        puzzleLabel: 'Puzzle 1',
        tiles: 'SLATE'.split('').map((letter, index) => ({
          letter,
          state: index === 0 ? 'correct' as const : 'absent' as const,
        })),
      },
    ],
    players: [
      { identityAvailable: false, label: 'Player one', seat: 'player-one' },
      { identityAvailable: false, label: 'Player two', seat: 'player-two' },
    ],
    progressLabel: '2 shared guesses',
    terminal: false,
  },
  status: 'playing',
  title: 'Practice Multiplayer OG',
  turnLabel: 'Player one turn',
  updatedAt: '2026-07-20T16:02:00.000Z',
  viewerRole: 'spectator',
}

type PresentationFixture =
  | {
    readonly game: MultiplayerGame
    readonly includeClock?: boolean
    readonly includeScoreboard?: boolean
    readonly kind: 'participant'
    readonly playerId: 'player-one' | 'player-two'
  }
  | {
    readonly game: MultiplayerGame
    readonly kind: 'result'
  }
  | {
    readonly kind: 'live'
    readonly spectatorGame: MultiplayerLiveGameViewModel
  }

async function setPresentation(
  page: Page,
  fixture: PresentationFixture,
  viewport: { readonly height: number; readonly width: number },
): Promise<void> {
  const renderFailures: string[] = []
  page.on('pageerror', (error) => renderFailures.push(error.message))
  await page.setViewportSize(viewport)
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await page.goto('/')
  await page.evaluate(async (activeFixture) => {
    const ReactModule = await import('/node_modules/.vite/deps/react.js')
    const ReactDomModule = await import('/node_modules/.vite/deps/react-dom_client.js')
    const scoreboardModule = await import('/src/multiplayer/CombatScoreboard.tsx')
    const surfaceModule = await import('/src/multiplayer/MultiplayerGameSurface.tsx')
    const liveModule = await import('/src/multiplayer/MultiplayerLive.tsx')
    const panelModule = await import('/src/multiplayer/MultiplayerPanel.tsx')
    const wordListModule = await import('/src/data/loadWordList.ts')
    const React = ReactModule.default ?? ReactModule
    const ReactDomClient = ReactDomModule.default ?? ReactDomModule
    const h = React.createElement
    const mount = document.createElement('main')
    mount.id = 'wave04-presentation-root'
    mount.className = 'brrrdle-lunar-shell'
    mount.style.width = '100%'
    mount.style.minWidth = '0'
    mount.style.maxWidth = '100%'
    document.body.replaceChildren(mount)

    let content
    if (activeFixture.kind === 'participant') {
      const prepared = await wordListModule.prepareBundledWordList(
        activeFixture.game.scope,
        activeFixture.game.wordLength,
      )
      if (!prepared.ok) {
        throw new Error(prepared.message)
      }
      content = h('div', { className: 'combat-workspace' },
        activeFixture.includeScoreboard === false
          ? null
          : h(scoreboardModule.CombatScoreboard, {
              game: activeFixture.game,
              viewerUserId: 'host-user',
            }),
        activeFixture.includeClock
          ? h(panelModule.CombatClockSummary, {
              game: activeFixture.game,
              now: new Date(activeFixture.game.createdAt),
            })
          : null,
        h(surfaceModule.MultiplayerGameSurface, {
          game: activeFixture.game,
          onSubmitGuess: () => undefined,
          playerId: activeFixture.playerId,
          statusLabel: 'Your turn',
        }))
    } else if (activeFixture.kind === 'result') {
      const prepared = await wordListModule.prepareBundledWordList(
        activeFixture.game.scope,
        activeFixture.game.wordLength,
      )
      if (!prepared.ok) {
        throw new Error(prepared.message)
      }
      content = h('div', { className: 'combat-workspace' },
        h(scoreboardModule.CombatResultPanel, {
          game: activeFixture.game,
          viewerUserId: 'host-user',
        }))
    } else {
      content = h('div', { className: 'combat-workspace' },
        h('h1', null, 'OPEN LIVE'),
        h(liveModule.MultiplayerLive, {
          liveGames: [activeFixture.spectatorGame],
          onResumeGame: () => undefined,
          restrictedGameCount: 2,
          selectedGameId: activeFixture.spectatorGame.id,
        }),
        h('h2', null, 'FOCUSED SPECTATOR VIEW'),
        h(liveModule.MultiplayerLiveSpectatorDetails, {
          details: activeFixture.spectatorGame.spectatorDetails,
        }))
    }

    ReactDomClient.createRoot(mount).render(content)
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    mount.dataset.wave04FixtureMounted = 'true'
  }, fixture)
  await expect(page.locator('[data-wave04-fixture-mounted="true"]')).toHaveCount(1)
  await page.waitForTimeout(100)
  if (await page.locator('#wave04-presentation-root').getByText(/COMBAT|LIVE|MATCH|attempts/i).count() === 0) {
    throw new Error(`Wave 04 presentation fixture did not render. ${renderFailures.join(' | ')}`)
  }
}

async function capture(page: Page, filename: string): Promise<void> {
  await expectNoHorizontalOverflow(page)
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: path.join(evidenceDirectory ?? '', filename),
  })
}

async function expectPresentationContained(page: Page): Promise<void> {
  const diagnostics = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth
    const elements = Array.from(document.querySelectorAll<HTMLElement>('body *'))
    const offenders = elements.flatMap((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.left < -1 || bounds.right > viewportWidth + 1
        ? [{
            className: element.className,
            left: Math.round(bounds.left),
            right: Math.round(bounds.right),
            tagName: element.tagName,
          }]
        : []
    }).slice(0, 12)
    const scrollContainers = elements.flatMap((element) => (
      element.scrollWidth > element.clientWidth + 1
        ? [{
            className: element.className,
            clientWidth: element.clientWidth,
            overflowX: getComputedStyle(element).overflowX,
            scrollWidth: element.scrollWidth,
            tagName: element.tagName,
          }]
        : []
    )).slice(0, 12)
    return {
      clientWidth: viewportWidth,
      offenders,
      scrollContainers,
      scrollWidth: document.documentElement.scrollWidth,
    }
  })
  expect(
    diagnostics.scrollWidth <= diagnostics.clientWidth + 1,
    JSON.stringify(diagnostics),
  ).toBe(true)
}

test.describe('Wave 04 deterministic COMBAT presentation @layout @multiplayer @wave04', () => {
  for (const [wordLength, mode] of [[3, 'og'], [5, 'og'], [8, 'go'], [35, 'og']] as const) {
    test(`keeps the ${wordLength}L ${mode.toUpperCase()} participant board actor-attributed and board-local`, async ({ page }) => {
      const game = createPlayingGame(wordLength, mode)
      await setPresentation(page, {
        game,
        kind: 'participant',
        playerId: 'player-one',
      }, { height: 844, width: 390 })

      const sharedBoard = page.locator('[data-combat-shared-board="true"]')
      await expect(sharedBoard).toHaveCount(1)
      await expect(sharedBoard.getByRole('row')).toHaveCount(6)
      await expect(sharedBoard.getByRole('gridcell')).toHaveCount(wordLength * 6)
      const geometry = await sharedBoard.evaluate((element) => {
        const cells = Array.from(element.querySelectorAll<HTMLElement>('[role="gridcell"]'))
        return {
          clientWidth: element.clientWidth,
          minTileWidth: Math.min(...cells.map((cell) => cell.getBoundingClientRect().width)),
          overflowX: getComputedStyle(element).overflowX,
          scrollWidth: element.scrollWidth,
        }
      })
      expect(geometry.minTileWidth).toBeGreaterThanOrEqual(32)
      expect(geometry.overflowX).toBe('auto')
      if (wordLength === 35) {
        expect(geometry.scrollWidth).toBeGreaterThan(geometry.clientWidth)
      }
      await expectPresentationContained(page)
    })
  }

  test('distinguishes live points, turn, lead, rating availability, clocks, and personal attempts without parallel boards', async ({ page }) => {
    const game = createPlayingGame(3)
    await setPresentation(page, {
      game,
      includeClock: true,
      kind: 'participant',
      playerId: 'player-one',
    }, { height: 1024, width: 1440 })

    await expect(page.getByRole('region', { name: /^COMBAT scoreline$/i })).toContainText('0 PTS')
    await expect(page.getByRole('region', { name: /^COMBAT scoreline$/i })).toContainText('UNRATED')
    await expect(page.getByRole('region', { name: /^COMBAT clocks$/i })).toContainText('5:00')
    await expect(page.getByRole('region', { name: /^COMBAT clocks$/i })).toContainText('Clock running')
    await expect(page.getByRole('region', { name: /^COMBAT clocks$/i })).toContainText('Clock paused')
    await expect(page.getByText(/^ACTIVE TURN$/i)).toHaveCount(1)
    await expect(page.getByText(/attempts remaining/i)).toBeVisible()
    await expect(page.locator('[data-combat-shared-board="true"]')).toHaveCount(1)
  })

  for (const reason of ['points', 'timeout', 'forfeit', 'cancelled'] as const) {
    test(`renders the ${reason} result without inventing a contradictory score or settlement`, async ({ page }) => {
      const game = createTerminalGame(reason)
      await setPresentation(page, { game, kind: 'result' }, { height: 844, width: 390 })

      await expect(page.locator('.combat-result')).toHaveAttribute('data-result-reason', reason === 'points' ? /points|solve/ : reason)
      if (reason === 'cancelled') {
        await expect(page.getByText(/^MATCH CANCELLED$/i)).toBeVisible()
        await expect(page.locator('[data-combat-scoreline="true"]')).toHaveCount(0)
        await expect(page.getByText(/No settlement/i)).toBeVisible()
      } else {
        await expect(page.locator('[data-combat-scoreline="true"]')).toHaveCount(1)
      }
      if (reason === 'forfeit') {
        await expect(page.getByText(/^POINTS LEADER$/i)).toBeVisible()
        await expect(page.getByText(/^FINAL LEADER$/i)).toHaveCount(0)
      }
      await expectNoHorizontalOverflow(page)
    })
  }

  test('has no serious accessibility violations in the deterministic active presentation', async ({ page }) => {
    const game = createSubmittedFiveLetterGame()
    await setPresentation(page, {
      game,
      kind: 'participant',
      playerId: 'player-two',
    }, { height: 844, width: 390 })
    const accessibility = await new AxeBuilder({ page }).analyze()
    expect(accessibility.violations.filter((violation) => (
      violation.impact === 'serious' || violation.impact === 'critical'
    ))).toEqual([])
  })

  test('keeps the Practice-only Live list and focused evidence read-only and sanitized', async ({ page }) => {
    await setPresentation(page, {
      kind: 'live',
      spectatorGame,
    }, { height: 844, width: 390 })

    await expect(page.getByText(/^Spectator view$/i)).toHaveCount(2)
    await expect(page.getByText(/^Read-only$/i)).toHaveCount(2)
    await expect(page.locator('[data-live-shared-board="true"]')).toHaveCount(2)
    await expect(page.getByText(/hidden by Live privacy rules/i)).toBeVisible()
    await expect(page.getByText(/Daily/i)).toHaveCount(0)
    await expect(page.getByText(/Elo/i)).toHaveCount(2)
    await expect(page.getByRole('button', { name: /Forfeit|Join|Submit|Cancel/i })).toHaveCount(0)
  })

  test('captures the deterministic participant, geometry, and result evidence matrix', async ({ page }) => {
    test.skip(!evidenceDirectory, 'Set WAVE04_EVIDENCE_DIR only for the ignored formal review capture.')
    mkdirSync(evidenceDirectory!, { recursive: true })

    for (const viewport of [
      { height: 1024, label: 'DESKTOP-1440x1024', width: 1440 },
      { height: 844, label: 'MOBILE-390x844', width: 390 },
    ]) {
      for (const [label, game] of [
        ['PRACTICE-5L-OG', createSubmittedFiveLetterGame()],
        ['PRACTICE-8L-GO', createPlayingGame(8, 'go')],
        ['TIMED-PRACTICE-3L-OG', createPlayingGame(3)],
        ['DAILY-5L-OG-WAITING', createDailyWaitingGame()],
      ] as const) {
        await setPresentation(page, {
          game,
          includeClock: Boolean(game.timeLimitMs),
          kind: 'participant',
          playerId: 'player-one',
        }, viewport)
        await capture(page, `AMORDLE-WAVE-04-${label}-${viewport.label}.png`)
      }
    }

    for (const viewport of [
      { height: 1024, label: 'DESKTOP-1440x1024', width: 1440 },
      { height: 844, label: 'MOBILE-390x844', width: 390 },
    ]) {
      for (const reason of ['points', 'timeout', 'forfeit', 'cancelled'] as const) {
        await setPresentation(page, {
          game: createTerminalGame(reason),
          kind: 'result',
        }, viewport)
        await capture(page, `AMORDLE-WAVE-04-RESULT-${reason.toLocaleUpperCase('en-US')}-${viewport.label}.png`)
      }

      await setPresentation(page, {
        kind: 'live',
        spectatorGame,
      }, viewport)
      await capture(page, `AMORDLE-WAVE-04-LIVE-LIST-AND-FOCUSED-${viewport.label}.png`)
    }

    await setPresentation(page, {
      game: createPlayingGame(35),
      includeScoreboard: false,
      kind: 'participant',
      playerId: 'player-one',
    }, { height: 720, width: 320 })
    await capture(page, 'AMORDLE-WAVE-04-GEOMETRY-35L-320x720.png')
    writeFileSync(
      path.join(evidenceDirectory!, 'AMORDLE-WAVE-04-PARTICIPANT-ARIA-SNAPSHOT.txt'),
      await page.getByRole('main').ariaSnapshot(),
      'utf8',
    )

    await setPresentation(page, {
      game: createExtendedGame(),
      includeScoreboard: false,
      kind: 'participant',
      playerId: 'player-one',
    }, { height: 1024, width: 768 })
    await capture(page, 'AMORDLE-WAVE-04-EXTENDED-ATTEMPTS-TABLET-768x1024.png')
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await capture(page, 'AMORDLE-WAVE-04-EXTENDED-ATTEMPTS-200-PERCENT-REFLOW-768x1024.png')
  })
})
