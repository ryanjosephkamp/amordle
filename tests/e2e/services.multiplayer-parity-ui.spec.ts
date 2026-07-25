import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

import type { AmordleSupabaseClient } from '../../src/lib/supabase-browser';
import { PublicRepository } from '../../src/services/public-repository';
import { RealServiceHarness } from '../server/real-service-harness';
import { unlockProtectedPreview } from './protected-preview';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? '';
const enabled =
  process.env.AMORDLE_ENABLE_REAL_SERVICE_E2E === '1' &&
  baseUrl.startsWith('https://') &&
  new URL(baseUrl).hostname !== 'amordle.vercel.app';

type TemporaryUser = Awaited<ReturnType<RealServiceHarness['createTemporaryUser']>>;

async function closeContexts(contexts: readonly BrowserContext[]): Promise<void> {
  await Promise.allSettled(contexts.map((context) => context.close()));
}

async function signIn(page: Page, user: TemporaryUser, returnTo: string): Promise<void> {
  await unlockProtectedPreview(page);
  await page.goto(`/auth?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${returnTo.replaceAll('/', '\\/')}$`));
  await expect(page.getByRole('button', { name: 'Retry account restore' })).toHaveCount(0);
}

async function createPublicProfile(
  harness: RealServiceHarness,
  user: TemporaryUser,
  displayName: string,
): Promise<string> {
  const client = harness.browserClient();
  try {
    expect((await client.auth.signInWithPassword(user)).error).toBeNull();
    await harness.registerRow('public_player_profiles', { user_id: user.userId });
    const profile = await new PublicRepository(
      client as unknown as AmordleSupabaseClient,
    ).updateMyProfile({
      displayName,
      visibility: 'public',
      accentColor: 'aurora',
      flairKey: 'none',
      bio: 'Disposable multiplayer parity profile.',
    });
    return profile.publicProfileId;
  } finally {
    await client.removeAllChannels();
    await client.auth.signOut();
  }
}

async function selectedTurnPage(left: Page, right: Page): Promise<Page> {
  await expect
    .poll(
      async () =>
        Number(
          await left
            .getByText('Your turn', { exact: true })
            .isVisible()
            .catch(() => false),
        ) +
        Number(
          await right
            .getByText('Your turn', { exact: true })
            .isVisible()
            .catch(() => false),
        ),
      { timeout: 30_000 },
    )
    .toBe(1);
  return (await left
    .getByText('Your turn', { exact: true })
    .isVisible()
    .catch(() => false))
    ? left
    : right;
}

async function expectSixRowsAndVisibleKeyboard(page: Page): Promise<void> {
  const board = page.getByRole('grid', { name: /word board/i });
  await expect(board.getByRole('row')).toHaveCount(6);
  const keyboard = page.getByRole('group', { name: /game keyboard/i });
  await expect(keyboard).toBeVisible();
  const [box, viewport, dockBox, matchBox, scrollTop] = await Promise.all([
    keyboard.boundingBox(),
    page.viewportSize(),
    page.locator('.mobile-dock').boundingBox(),
    page.locator('.page--combat-match').boundingBox(),
    page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY),
  ]);
  if (!box || !viewport) throw new Error('Keyboard viewport evidence was unavailable.');
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  if (dockBox) {
    expect(box.y + box.height).toBeLessThanOrEqual(dockBox.y + 1);
    expect(matchBox).not.toBeNull();
    expect(matchBox!.y + matchBox!.height).toBeLessThanOrEqual(dockBox.y + 1);
    expect(scrollTop).toBe(0);
  }
}

async function inspectAnswer(
  harness: RealServiceHarness,
  gameId: string,
  userIds: string[],
): Promise<string> {
  const inspected = await harness.admin.rpc('inspect_amordle_combat_e2e_v2', {
    p_run_id: harness.runId,
    p_game_id: gameId,
    p_user_ids: userIds,
  });
  expect(inspected.error).toBeNull();
  const answer = (inspected.data as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(answer) || typeof answer[0] !== 'string') {
    throw new Error('Private E2E inspection did not return an answer.');
  }
  return answer[0];
}

async function attachScreenshot(testInfo: TestInfo, page: Page, name: string): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: false }),
    contentType: 'image/png',
  });
}

async function seedRankedPracticeCleanupIntent(
  page: Page,
  userId: string,
  runId: string,
  suffix: string,
): Promise<void> {
  await page.evaluate(
    ({ ownerNamespace, idempotencyKey, requestedAt }) => {
      sessionStorage.setItem(
        'amordle:ranked-practice-search-v1',
        JSON.stringify({
          schemaVersion: 1,
          ownerNamespace,
          fingerprint: 'og:2:casual:normal:1:untimed',
          idempotencyKey,
          mode: 'og',
          wordLength: 2,
          difficulty: 'casual',
          hardMode: false,
          puzzleCount: 5,
          timeLimitMs: null,
          requestedAt,
          requestId: null,
        }),
      );
    },
    {
      ownerNamespace: userId,
      idempotencyKey: `${runId}:ui-ranked-${suffix}`,
      requestedAt: new Date().toISOString(),
    },
  );
}

async function seedUnrankedDailyCleanupIntent(
  page: Page,
  userId: string,
  runId: string,
): Promise<void> {
  await page.evaluate(
    ({ ownerNamespace, creationKey, dailyDateKey, requestedAt }) => {
      sessionStorage.setItem(
        'amordle:unranked-daily-lobby-v2',
        JSON.stringify({
          schemaVersion: 2,
          ownerNamespace,
          creationKey,
          mode: 'og',
          hardMode: false,
          dailyDateKey,
          requestedAt,
        }),
      );
    },
    {
      ownerNamespace: userId,
      creationKey: `${runId}:ui-daily`,
      dailyDateKey: new Date().toISOString().slice(0, 10),
      requestedAt: new Date().toISOString(),
    },
  );
}

test.describe('protected Preview full multiplayer parity', () => {
  test.skip(!enabled, 'Requires the exact protected Preview and real-service cleanup authority.');
  test.describe.configure({ mode: 'serial', timeout: 360_000 });

  test('routes Ranked Practice, Live, Daily, private requests, and rematches through real accounts', async ({
    browser,
  }, testInfo) => {
    const harness = await RealServiceHarness.create();
    const contexts: BrowserContext[] = [];
    let users: TemporaryUser[] = [];
    let cleaned = false;
    try {
      const playerOne = await harness.createTemporaryUser('parity-ui-one');
      const playerTwo = await harness.createTemporaryUser('parity-ui-two');
      users = [playerOne, playerTwo];
      const playerOneName = `Ember ${harness.runId.slice(-8)}`;
      const playerTwoName = `Frost ${harness.runId.slice(-8)}`;
      const playerOneProfileId = await createPublicProfile(harness, playerOne, playerOneName);
      const playerTwoProfileId = await createPublicProfile(harness, playerTwo, playerTwoName);

      const playerOneContext = await browser.newContext({
        baseURL: baseUrl,
        viewport: { width: 1440, height: 1024 },
      });
      const playerTwoContext = await browser.newContext({
        baseURL: baseUrl,
        viewport: { width: 390, height: 844 },
        isMobile: true,
      });
      const anonymousContext = await browser.newContext({
        baseURL: baseUrl,
        viewport: { width: 390, height: 844 },
        isMobile: true,
      });
      contexts.push(playerOneContext, playerTwoContext, anonymousContext);
      const playerOnePage = await playerOneContext.newPage();
      const playerTwoPage = await playerTwoContext.newPage();
      const anonymousPage = await anonymousContext.newPage();
      await signIn(playerOnePage, playerOne, '/combat/practice');
      await signIn(playerTwoPage, playerTwo, '/combat/practice');
      await unlockProtectedPreview(anonymousPage);

      for (const page of [playerOnePage, playerTwoPage]) {
        await page.getByLabel('Word length').fill('2');
        await page.getByLabel('Difficulty').selectOption('casual');
        await expect(page.getByRole('button', { name: 'Find ranked opponent' })).toBeEnabled();
      }
      await seedRankedPracticeCleanupIntent(playerOnePage, playerOne.userId, harness.runId, 'one');
      await seedRankedPracticeCleanupIntent(playerTwoPage, playerTwo.userId, harness.runId, 'two');
      await playerOnePage.getByRole('button', { name: 'Find ranked opponent' }).click();
      await expect(
        playerOnePage.getByText(
          'Ranked Practice search accepted by the server-owned reservation service.',
          { exact: true },
        ),
      ).toBeVisible({ timeout: 30_000 });
      await playerTwoPage.getByRole('button', { name: 'Find ranked opponent' }).click();
      await expect
        .poll(
          async () => {
            if (/\/combat\/match\/amordle-combat-v2-/i.test(playerTwoPage.url())) return 'matched';
            return (
              (await playerTwoPage
                .locator('.game-message')
                .textContent()
                .catch(() => null)) ?? ''
            );
          },
          { timeout: 30_000 },
        )
        .toMatch(/Ranked Practice search accepted|matched|finalizing/i);
      await harness.discoverAndRegisterAuthoritativeCombatForUsers(
        users.map(({ userId }) => userId),
      );
      await expect(playerOnePage).toHaveURL(/\/combat\/match\/amordle-combat-v2-/i, {
        timeout: 45_000,
      });
      await expect(playerTwoPage).toHaveURL(/\/combat\/match\/amordle-combat-v2-/i, {
        timeout: 45_000,
      });
      const rankedGameId = new URL(playerOnePage.url()).pathname.split('/').at(-1)!;
      expect(new URL(playerTwoPage.url()).pathname).toContain(rankedGameId);
      await harness.discoverAndRegisterAuthoritativeCombatForUsers(
        users.map(({ userId }) => userId),
      );

      const turnPage = await selectedTurnPage(playerOnePage, playerTwoPage);
      await expectSixRowsAndVisibleKeyboard(turnPage);
      await attachScreenshot(testInfo, playerOnePage, 'ranked-practice-desktop-viewport.png');
      await attachScreenshot(testInfo, playerTwoPage, 'ranked-practice-mobile-viewport.png');

      await anonymousPage.goto(`/combat/live/${rankedGameId}`);
      await expect(anonymousPage.getByText('Live · read-only', { exact: true })).toBeVisible();
      await expect(anonymousPage.getByRole('group', { name: /game keyboard/i })).toHaveCount(0);
      const spectatorBody = await anonymousPage.locator('body').innerText();
      for (const token of [playerOne.email, playerTwo.email, playerOne.userId, playerTwo.userId]) {
        expect(spectatorBody).not.toContain(token);
      }
      await attachScreenshot(testInfo, anonymousPage, 'ranked-practice-live-mobile.png');

      const beforeInvalid = await harness.admin.rpc('inspect_amordle_combat_e2e_v2', {
        p_run_id: harness.runId,
        p_game_id: rankedGameId,
        p_user_ids: users.map(({ userId }) => userId),
      });
      expect(beforeInvalid.error).toBeNull();
      const beforeMoveCount = Number(
        (beforeInvalid.data as { moveCount?: number } | null)?.moveCount ?? -1,
      );
      await turnPage.keyboard.type('qq');
      await turnPage.keyboard.press('Enter');
      await expect(turnPage.getByText('Save authoritative COMBAT command failed.')).toBeVisible();
      const afterInvalid = await harness.admin.rpc('inspect_amordle_combat_e2e_v2', {
        p_run_id: harness.runId,
        p_game_id: rankedGameId,
        p_user_ids: users.map(({ userId }) => userId),
      });
      expect(afterInvalid.error).toBeNull();
      expect((afterInvalid.data as { moveCount?: number } | null)?.moveCount).toBe(beforeMoveCount);
      await turnPage.keyboard.press('Backspace');
      await turnPage.keyboard.press('Backspace');

      const rankedAnswer = await inspectAnswer(
        harness,
        rankedGameId,
        users.map(({ userId }) => userId),
      );
      await turnPage.keyboard.type(rankedAnswer);
      await turnPage.keyboard.press('Enter');
      await expect(turnPage.getByRole('link', { name: 'Review trusted result' })).toBeVisible({
        timeout: 30_000,
      });
      await turnPage.getByRole('link', { name: 'Review trusted result' }).click();
      await expect(turnPage.getByText(/Server reconstruction settled the rating/i)).toBeVisible({
        timeout: 30_000,
      });

      await playerOnePage.goto('/combat/daily');
      await seedUnrankedDailyCleanupIntent(playerOnePage, playerOne.userId, harness.runId);
      await playerOnePage.getByRole('button', { name: 'Create unranked Daily lobby' }).click();
      await expect(playerOnePage).toHaveURL(/\/combat\/match\/amordle-daily-v2-/i);
      const dailyGameId = new URL(playerOnePage.url()).pathname.split('/').at(-1)!;
      await harness.discoverAndRegisterAuthoritativeCombatForUsers(
        users.map(({ userId }) => userId),
      );
      await playerTwoPage.goto('/combat/daily');
      await expect(playerTwoPage.getByRole('button', { name: 'Join Daily' })).toBeVisible({
        timeout: 30_000,
      });
      await playerTwoPage.getByRole('button', { name: 'Join Daily' }).click();
      await expect(playerTwoPage).toHaveURL(new RegExp(`/combat/match/${dailyGameId}$`));
      const dailyTurnPage = await selectedTurnPage(playerOnePage, playerTwoPage);
      await expectSixRowsAndVisibleKeyboard(dailyTurnPage);
      await anonymousPage.goto(`/combat/live/${dailyGameId}`);
      await expect(
        anonymousPage.getByRole('heading', {
          name: 'This match is not available for public spectation',
        }),
      ).toBeVisible();
      const dailyAnswer = await inspectAnswer(
        harness,
        dailyGameId,
        users.map(({ userId }) => userId),
      );
      await dailyTurnPage.keyboard.type(dailyAnswer);
      await dailyTurnPage.keyboard.press('Enter');
      await expect(dailyTurnPage.getByRole('link', { name: 'Review trusted result' })).toBeVisible({
        timeout: 30_000,
      });

      await playerOnePage.goto(`/players/${playerTwoProfileId}`);
      await playerOnePage.getByRole('link', { name: 'Request private Practice match' }).click();
      await expect(playerOnePage.getByText(playerTwoName, { exact: true })).toBeVisible();
      await playerOnePage.getByRole('button', { name: 'Send private request' }).click();
      await expect(playerOnePage.getByText(/Private Practice request sent/i)).toBeVisible();
      await expect
        .poll(async () => {
          const request = await harness.admin
            .from('multiplayer_private_match_requests')
            .select('id,created_game_id')
            .eq('requester_user_id', playerOne.userId)
            .eq('opponent_user_id', playerTwo.userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          return request.data !== null;
        })
        .toBe(true);
      const privateRequestRow = await harness.admin
        .from('multiplayer_private_match_requests')
        .select('id')
        .eq('requester_user_id', playerOne.userId)
        .eq('opponent_user_id', playerTwo.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      expect(privateRequestRow.error).toBeNull();
      await harness.registerRow('multiplayer_private_match_requests', {
        id: privateRequestRow.data!.id,
      });

      await playerTwoPage.goto('/combat/lobby');
      await expect(playerTwoPage.getByText(playerOneName, { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      await playerTwoPage.getByRole('button', { name: 'Accept', exact: true }).click();
      await expect(playerTwoPage).toHaveURL(/\/combat\/match\/amordle-private-/i, {
        timeout: 30_000,
      });
      const privateGameId = new URL(playerTwoPage.url()).pathname.split('/').at(-1)!;
      await harness.registerRow('async_multiplayer_games', { id: privateGameId });
      await playerOnePage.goto(`/combat/match/${privateGameId}`);
      const privateTurnPage = await selectedTurnPage(playerOnePage, playerTwoPage);
      const privateGame = await harness.admin
        .from('async_multiplayer_games')
        .select('projection')
        .eq('id', privateGameId)
        .single();
      expect(privateGame.error).toBeNull();
      const privateAnswer = (
        privateGame.data?.projection as { state?: { answers?: unknown } } | undefined
      )?.state?.answers;
      if (!Array.isArray(privateAnswer) || typeof privateAnswer[0] !== 'string') {
        throw new Error('Private participant game did not contain its participant answer.');
      }
      await privateTurnPage.keyboard.type(privateAnswer[0]);
      await privateTurnPage.keyboard.press('Enter');
      const conflictMessage = privateTurnPage.getByText(
        'The match changed in another tab. Durable state was reloaded; retry your action.',
        { exact: true },
      );
      await expect
        .poll(async () => {
          if (
            await privateTurnPage
              .getByRole('link', { name: 'Review result' })
              .isVisible()
              .catch(() => false)
          ) {
            return 'result';
          }
          return (await conflictMessage.isVisible().catch(() => false)) ? 'conflict' : 'pending';
        })
        .toMatch(/result|conflict/);
      if (await conflictMessage.isVisible()) {
        await expect(
          privateTurnPage.getByRole('button', { name: 'Enter', exact: true }),
        ).toBeEnabled();
        await privateTurnPage.keyboard.press('Enter');
      }
      await expect(privateTurnPage.getByRole('link', { name: 'Review result' })).toBeVisible({
        timeout: 30_000,
      });
      await privateTurnPage.getByRole('link', { name: 'Review result' }).click();
      await privateTurnPage.getByRole('button', { name: 'Request rematch' }).click();
      await expect(privateTurnPage.getByText(/Rematch requested/i)).toBeVisible();
      await harness.registerRow('multiplayer_practice_rematch_requests', {
        source_game_id: privateGameId,
      });
      await playerTwoPage.goto('/combat/lobby');
      await expect(playerTwoPage.getByText('rematch', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
      const acceptRematch = playerTwoPage.getByRole('button', {
        name: 'Accept',
        exact: true,
      });
      await expect(acceptRematch).toBeVisible();
      await expect(acceptRematch).toBeEnabled();
      await acceptRematch.click({ noWaitAfter: true, timeout: 30_000 });
      await expect(playerTwoPage).toHaveURL(/\/combat\/match\/amordle-rematch-/i, {
        timeout: 30_000,
      });
      const rematchGameId = new URL(playerTwoPage.url()).pathname.split('/').at(-1)!;
      await harness.registerRow('async_multiplayer_games', { id: rematchGameId });

      await playerTwoPage.goto('/settings');
      await expect(playerTwoPage.getByRole('button', { name: 'Accepting requests' })).toBeVisible();
      await harness.registerRow('multiplayer_private_request_preferences', {
        user_id: playerTwo.userId,
      });
      await playerTwoPage.getByRole('button', { name: 'Accepting requests' }).click();
      await expect(playerTwoPage.getByRole('button', { name: 'Requests paused' })).toBeVisible();
      await playerTwoPage.getByRole('button', { name: 'Requests paused' }).click();
      await expect(playerTwoPage.getByRole('button', { name: 'Accepting requests' })).toBeVisible();

      await playerOnePage.goto(`/players/${playerTwoProfileId}`);
      await playerOnePage.getByRole('link', { name: 'Manage private-request block' }).click();
      await expect(playerOnePage.getByText(playerTwoName, { exact: true })).toBeVisible();
      await harness.registerRow('multiplayer_private_request_blocks', {
        blocker_user_id: playerOne.userId,
        blocked_user_id: playerTwo.userId,
      });
      await playerOnePage.getByRole('button', { name: 'Block player' }).click();
      await expect(playerOnePage.getByRole('button', { name: 'Unblock' })).toBeVisible();
      await playerOnePage.getByRole('button', { name: 'Unblock' }).click();
      await expect(playerOnePage.getByText('No public players are blocked.')).toBeVisible();

      expect(playerOneProfileId).not.toBe(playerTwoProfileId);
      await closeContexts(contexts);
      contexts.length = 0;
      await harness.cleanup();
      cleaned = true;
    } finally {
      await closeContexts(contexts);
      if (!cleaned) {
        if (users.length > 0) {
          await harness
            .discoverAndRegisterAuthoritativeCombatForUsers(users.map(({ userId }) => userId))
            .catch(() => undefined);
        }
        await harness.cleanup();
      }
    }
  });
});
