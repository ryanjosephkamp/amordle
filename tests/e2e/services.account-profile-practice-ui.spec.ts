import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';

import { RealServiceHarness } from '../server/real-service-harness';
import { unlockProtectedPreview } from './protected-preview';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? '';
const enabled =
  process.env.AMORDLE_ENABLE_REAL_SERVICE_E2E === '1' &&
  baseUrl.startsWith('https://') &&
  new URL(baseUrl).hostname !== 'amordle.vercel.app';

type TemporaryUser = Awaited<ReturnType<RealServiceHarness['createTemporaryUser']>>;

const practiceConfigurationFingerprint = JSON.stringify({
  mode: 'og',
  wordLength: 2,
  difficulty: 'expert',
  hardMode: false,
  puzzleCount: 1,
  timeLimitMs: null,
});

async function signIn(page: Page, user: TemporaryUser): Promise<void> {
  await unlockProtectedPreview(page);
  await page.goto('/auth?returnTo=/profile');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  await expect(page.getByLabel('Player name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry account restore' })).toHaveCount(0);
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in or open account menu' })).toBeVisible();
}

async function saveProfile(
  page: Page,
  input: {
    displayName: string;
    visibility: 'private' | 'public';
    bio: string;
    accent?: 'Aurora' | 'Cyan';
  },
): Promise<void> {
  await page.goto('/profile');
  await page.getByLabel('Player name').fill(input.displayName);
  await page.getByLabel('Public visibility').selectOption(input.visibility);
  await page.getByLabel(input.accent ?? 'Aurora').check();
  await page.getByLabel('Public bio').fill(input.bio);
  await page.getByRole('button', { name: 'Save player profile' }).click();
  await expect(page.getByText('Player profile saved by account authority.')).toBeVisible();
}

async function writePendingLobbyIntent(
  page: Page,
  ownerNamespace: string,
  gameId: string,
): Promise<void> {
  await page.evaluate(
    ({ fingerprint, gameId: pendingGameId, owner }) => {
      sessionStorage.setItem(
        `amordle:practice-lobby-intent:v1:${owner}`,
        JSON.stringify({
          schemaVersion: 1,
          gameId: pendingGameId,
          ownerNamespace: owner,
          configurationFingerprint: fingerprint,
          requestedAt: new Date().toISOString(),
        }),
      );
    },
    { fingerprint: practiceConfigurationFingerprint, gameId, owner: ownerNamespace },
  );
}

async function createTwoLetterLobby(
  page: Page,
  ownerNamespace: string,
  gameId: string,
): Promise<void> {
  await page.goto('/combat/practice');
  await writePendingLobbyIntent(page, ownerNamespace, gameId);
  await page.getByLabel('Word length').fill('2');
  await page.getByRole('button', { name: 'Create public lobby' }).click();
  await expect(page).toHaveURL(new RegExp(`/combat/match/${gameId}$`));
  await expect(
    page.getByRole('heading', { name: 'Waiting for a second participant' }),
  ).toBeVisible();
}

function lobbyPanel(page: Page, ownership: 'Open' | 'Your lobby') {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'OG · 2 letters' }) })
    .filter({ hasText: ownership })
    .first();
}

async function attachScreenshot(testInfo: TestInfo, page: Page, name: string): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

async function closeContexts(contexts: readonly BrowserContext[]): Promise<void> {
  await Promise.allSettled(contexts.map((context) => context.close()));
}

test.describe('protected Preview account, profile, and Practice COMBAT recovery', () => {
  test.skip(!enabled, 'Requires authorized protected Preview and real-service cleanup authority.');
  test.describe.configure({ mode: 'serial', timeout: 240_000 });

  test('hydrates two real accounts, saves sanitized profiles, and completes routed Practice flows', async ({
    browser,
  }, testInfo) => {
    const harness = await RealServiceHarness.create();
    const contexts: BrowserContext[] = [];
    let cleaned = false;
    try {
      const playerA = await harness.createTemporaryUser('ui-player-a');
      const playerB = await harness.createTemporaryUser('ui-player-b');

      for (const player of [playerA, playerB]) {
        await harness.registerRow('settings', { user_id: player.userId });
        await harness.registerRow('progress_snapshots', { user_id: player.userId });
        await harness.registerRow('public_player_profiles', { user_id: player.userId });
        const timestamp = new Date().toISOString().replace('Z', '+00:00');
        const settings = await harness.admin.from('settings').insert({
          user_id: player.userId,
          settings: { soundEnabled: true, testRun: harness.runId },
          updated_at: timestamp,
        });
        expect(settings.error).toBeNull();
        const progress = await harness.admin.from('progress_snapshots').insert({
          user_id: player.userId,
          progress: { testRun: harness.runId, restored: true },
          updated_at: timestamp,
        });
        expect(progress.error).toBeNull();
      }

      const switchContext = await browser.newContext({
        baseURL: baseUrl,
        viewport: { width: 1440, height: 1024 },
      });
      contexts.push(switchContext);
      const switchPage = await switchContext.newPage();
      await signIn(switchPage, playerA);

      const playerAName = `Ember ${harness.runId.slice(-8)}`;
      const playerBName = `Frost ${harness.runId.slice(-8)}`;
      await saveProfile(switchPage, {
        displayName: playerAName,
        visibility: 'private',
        bio: 'Private until the owner explicitly publishes this test projection.',
      });
      await switchPage.reload();
      await expect(switchPage.getByLabel('Player name')).toHaveValue(playerAName);

      const ownerProfile = await harness.admin
        .from('public_player_profiles')
        .select('public_profile_id,visibility')
        .eq('user_id', playerA.userId)
        .single();
      expect(ownerProfile.error).toBeNull();
      expect(ownerProfile.data?.visibility).toBe('private');
      const publicProfileId = ownerProfile.data?.public_profile_id;
      if (!publicProfileId) throw new Error('Profile upsert did not create a public identifier.');

      const anonymousContext = await browser.newContext({
        baseURL: baseUrl,
        viewport: { width: 390, height: 844 },
      });
      contexts.push(anonymousContext);
      const anonymousPage = await anonymousContext.newPage();
      await unlockProtectedPreview(anonymousPage);
      await anonymousPage.goto(`/players/${publicProfileId}`);
      await expect(
        anonymousPage.getByRole('heading', { name: 'Player unavailable' }),
      ).toBeVisible();

      await saveProfile(switchPage, {
        displayName: playerAName,
        visibility: 'public',
        bio: 'Sanitized public test profile.',
      });
      await attachScreenshot(testInfo, switchPage, 'desktop-saved-public-profile.png');
      await anonymousPage.reload();
      await expect(
        anonymousPage.getByRole('heading', { name: 'Player', exact: true }),
      ).toBeVisible();
      await expect(anonymousPage.getByRole('heading', { name: playerAName })).toBeVisible();
      const anonymousBody = await anonymousPage.locator('body').innerText();
      expect(anonymousBody).not.toContain(playerA.email);
      expect(anonymousBody).not.toContain(playerA.userId);
      expect(anonymousBody).not.toContain(harness.runId);

      await signOut(switchPage);
      await signIn(switchPage, playerB);
      await expect(switchPage.getByLabel('Player name')).not.toHaveValue(playerAName);
      await signOut(switchPage);
      await switchContext.close();
      contexts.splice(contexts.indexOf(switchContext), 1);

      const playerAContext = await browser.newContext({
        baseURL: baseUrl,
        viewport: { width: 1440, height: 1024 },
      });
      const playerBContext = await browser.newContext({
        baseURL: baseUrl,
        viewport: { width: 390, height: 844 },
        isMobile: true,
      });
      contexts.push(playerAContext, playerBContext);
      const playerAPage = await playerAContext.newPage();
      const playerBPage = await playerBContext.newPage();
      await signIn(playerAPage, playerA);
      await signIn(playerBPage, playerB);
      await saveProfile(playerBPage, {
        displayName: playerBName,
        visibility: 'public',
        bio: 'Second sanitized public test profile.',
        accent: 'Cyan',
      });

      const gameId = `amordle-practice-${harness.runId}`;
      await harness.registerRow('async_multiplayer_games', { id: gameId });
      await createTwoLetterLobby(playerAPage, playerA.userId, gameId);
      await attachScreenshot(testInfo, playerAPage, 'desktop-created-practice-lobby.png');

      await playerAPage.goto('/combat/practice');
      await writePendingLobbyIntent(playerAPage, playerA.userId, gameId);
      await playerAPage.getByLabel('Word length').fill('2');
      await playerAPage.getByRole('button', { name: 'Create public lobby' }).click();
      await expect(playerAPage).toHaveURL(new RegExp(`/combat/match/${gameId}$`));
      const duplicateCount = await harness.admin
        .from('async_multiplayer_games')
        .select('id', { count: 'exact', head: true })
        .eq('id', gameId);
      expect(duplicateCount.error).toBeNull();
      expect(duplicateCount.count).toBe(1);

      await playerBPage.goto('/combat/lobby');
      const openLobby = lobbyPanel(playerBPage, 'Open');
      await expect(openLobby).toBeVisible();
      await openLobby.getByRole('button', { name: 'Join lobby' }).click();
      await expect(playerBPage).toHaveURL(new RegExp(`/combat/match/${gameId}$`));
      await expect(playerBPage.getByText(playerAName, { exact: false }).first()).toBeVisible();
      await expect(playerBPage.getByText(playerBName, { exact: false }).first()).toBeVisible();
      await attachScreenshot(testInfo, playerBPage, 'mobile-joined-practice-match.png');

      await playerAPage.reload();
      await expect(playerAPage.getByText('Your turn', { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(playerAPage.getByText(playerAName, { exact: false }).first()).toBeVisible();
      const beforeInvalid = await harness.admin
        .from('async_multiplayer_games')
        .select('projection')
        .eq('id', gameId)
        .single();
      expect(beforeInvalid.error).toBeNull();
      const beforeProjection = beforeInvalid.data?.projection as
        { state?: { moves?: unknown[]; answers?: string[] } } | undefined;
      const moveCountBefore = beforeProjection?.state?.moves?.length ?? 0;
      await playerAPage.keyboard.type('qq');
      await playerAPage.keyboard.press('Enter');
      await expect(playerAPage.getByText(/accepted guess list/i)).toBeVisible();
      const afterInvalid = await harness.admin
        .from('async_multiplayer_games')
        .select('projection')
        .eq('id', gameId)
        .single();
      const afterInvalidProjection = afterInvalid.data?.projection as
        { state?: { moves?: unknown[]; answers?: string[] } } | undefined;
      expect(afterInvalidProjection?.state?.moves?.length ?? 0).toBe(moveCountBefore);
      await playerAPage.keyboard.press('Backspace');
      await playerAPage.keyboard.press('Backspace');

      const answer = afterInvalidProjection?.state?.answers?.[0];
      if (!answer || !/^[a-z]{2}$/.test(answer)) {
        throw new Error('Node-only durable inspection could not resolve the disposable answer.');
      }
      await playerAPage.keyboard.type(answer);
      await playerAPage.keyboard.press('Enter');
      await expect(playerAPage.getByRole('link', { name: 'Review result' })).toBeVisible({
        timeout: 15_000,
      });
      await expect(playerBPage.getByRole('link', { name: 'Review result' })).toBeVisible({
        timeout: 15_000,
      });
      await playerAPage.reload();
      await playerBPage.reload();
      await expect(playerAPage.getByRole('link', { name: 'Review result' })).toBeVisible();
      await expect(playerBPage.getByRole('link', { name: 'Review result' })).toBeVisible();
      await playerAPage.getByRole('link', { name: 'Review result' }).click();
      await expect(playerAPage.getByText(/won|drawn/i).first()).toBeVisible();
      await attachScreenshot(testInfo, playerAPage, 'desktop-terminal-practice-result.png');

      const ratedResult = await harness.admin
        .from('multiplayer_match_results')
        .select('id', { count: 'exact', head: true })
        .eq('source_match_id', gameId);
      expect(ratedResult.error).toBeNull();
      expect(ratedResult.count).toBe(0);

      const cancelGameId = `${gameId}-cancel`;
      await harness.registerRow('async_multiplayer_games', { id: cancelGameId });
      await createTwoLetterLobby(playerAPage, playerA.userId, cancelGameId);
      await playerAPage.goto('/combat/lobby');
      const ownedLobby = lobbyPanel(playerAPage, 'Your lobby');
      await expect(ownedLobby).toBeVisible();
      await ownedLobby.getByRole('button', { name: 'Cancel lobby' }).click();
      await expect(ownedLobby).toHaveCount(0);
      const cancelled = await harness.admin
        .from('async_multiplayer_games')
        .select('status,projection')
        .eq('id', cancelGameId)
        .single();
      expect(cancelled.error).toBeNull();
      expect(cancelled.data?.status).toBe('cancelled');

      const sensitiveTokens = [playerA.email, playerB.email, playerA.userId, playerB.userId];
      for (const page of [playerAPage, playerBPage, anonymousPage]) {
        const body = await page.locator('body').innerText();
        for (const token of sensitiveTokens) expect(body).not.toContain(token);
      }

      await closeContexts(contexts);
      contexts.length = 0;
      await harness.cleanup();
      cleaned = true;
    } finally {
      await closeContexts(contexts);
      if (!cleaned) await harness.cleanup();
    }
  });
});
