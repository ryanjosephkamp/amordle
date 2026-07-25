import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { localDateKey } from '../../src/domain/daily';
import { RealServiceHarness } from '../server/real-service-harness';
import { unlockProtectedPreview } from './protected-preview';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? '';
const enabled =
  process.env.AMORDLE_ENABLE_REAL_SERVICE_E2E === '1' &&
  baseUrl.startsWith('https://') &&
  new URL(baseUrl).hostname !== 'amordle.vercel.app';

type TemporaryUser = Awaited<ReturnType<RealServiceHarness['createTemporaryUser']>>;

async function signIn(page: Page, user: TemporaryUser): Promise<void> {
  await unlockProtectedPreview(page);
  await page.goto('/auth?returnTo=/calendar');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByRole('button', { name: 'Retry account restore' })).toHaveCount(0);
}

async function closeContexts(contexts: readonly BrowserContext[]): Promise<void> {
  await Promise.allSettled(contexts.map((context) => context.close()));
}

test.describe('protected Preview mobile Calendar Daily entitlement', () => {
  test.skip(!enabled, 'Requires authorized protected Preview and real-service cleanup authority.');
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test('selects for free, spends once, restores pending access, and promotes after one guess', async ({
    browser,
  }, testInfo) => {
    const harness = await RealServiceHarness.create();
    const contexts: BrowserContext[] = [];
    let cleaned = false;
    try {
      const player = await harness.createTemporaryUser('calendar-daily');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateKey = localDateKey(yesterday);
      const operationId = `past-daily:og:${dateKey}`;
      await harness.registerRow('player_economy_state', { user_id: player.userId });
      await harness.registerRow('player_economy_operations', {
        user_id: player.userId,
        operation_id: operationId,
      });
      await harness.registerRow('progress_snapshots', { user_id: player.userId });
      await harness.registerRow('game_history', { user_id: player.userId });
      const economy = await harness.admin.from('player_economy_state').insert({
        user_id: player.userId,
        coins: 100,
        reveal_one_letter: 0,
        remove_incorrect_letters: 0,
        revision: 1,
      });
      expect(economy.error).toBeNull();

      const context = await browser.newContext({
        baseURL: baseUrl,
        viewport: { width: 390, height: 844 },
        isMobile: true,
      });
      contexts.push(context);
      const page = await context.newPage();
      await signIn(page, player);
      await expect(page.getByText('100 coins', { exact: true })).toBeVisible({
        timeout: 15_000,
      });

      const lane = page.locator(`.calendar-lane-button[data-date="${dateKey}"][data-mode="og"]`);
      await expect(lane).toBeEnabled();
      await lane.click();
      await expect(page.getByRole('heading', { name: 'Past Solo Daily' })).toBeVisible();
      await expect(page.getByText(`Solo OG · ${dateKey}`, { exact: true })).toBeVisible();
      await expect(page.getByText('100 coins available', { exact: true })).toBeVisible();
      const beforeSelection = await harness.admin
        .from('player_economy_state')
        .select('coins,revision')
        .eq('user_id', player.userId)
        .single();
      expect(beforeSelection.error).toBeNull();
      expect(beforeSelection.data).toMatchObject({ coins: 100, revision: 1 });

      const unlock = page.getByRole('button', {
        name: `Unlock Solo OG for ${dateKey}`,
      });
      await expect(unlock).toBeEnabled();
      await unlock.click();
      await expect(page.getByRole('status')).toContainText(`OG entitlement saved for ${dateKey}`);
      await expect(page.getByRole('link', { name: `Play OG · ${dateKey}` })).toBeVisible();
      await expect
        .poll(async () => {
          const state = await harness.admin
            .from('player_economy_state')
            .select('coins,revision')
            .eq('user_id', player.userId)
            .single();
          return state.data;
        })
        .toMatchObject({ coins: 40, revision: 2 });
      await expect
        .poll(async () => {
          const operations = await harness.admin
            .from('player_economy_operations')
            .select('operation_id', { count: 'exact' })
            .eq('user_id', player.userId)
            .eq('operation_id', operationId);
          return operations.count;
        })
        .toBe(1);

      await testInfo.attach('mobile-past-daily-unlocked.png', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
      await page.reload();
      await expect(page.getByText('40 coins', { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      const restoredLane = page.locator(
        `.calendar-lane-button[data-date="${dateKey}"][data-mode="og"]`,
      );
      await restoredLane.click();
      await page.getByRole('link', { name: `Play OG · ${dateKey}` }).click();
      await expect(page.getByRole('grid', { name: '5-letter word board' })).toBeVisible({
        timeout: 15_000,
      });
      const answer = await page.evaluate((selectedDate) => {
        const key = Object.keys(localStorage).find(
          (candidate) =>
            candidate.startsWith(`amordle:solo:daily:og:${selectedDate}:`) &&
            candidate.includes(':account:'),
        );
        if (!key) return null;
        const envelope = JSON.parse(localStorage.getItem(key) ?? 'null') as {
          payload?: { answer?: unknown };
        } | null;
        return typeof envelope?.payload?.answer === 'string' ? envelope.payload.answer : null;
      }, dateKey);
      if (!answer || !/^[a-z]{5}$/.test(answer)) {
        throw new Error('The disposable Daily answer could not be resolved in the test browser.');
      }
      await page.keyboard.type(answer);
      await page.keyboard.press('Enter');
      await expect(
        page.getByText(/Completion recorded locally|Guess accepted and saved/),
      ).toBeVisible({
        timeout: 15_000,
      });
      await expect
        .poll(async () => {
          const progress = await harness.admin
            .from('progress_snapshots')
            .select('progress')
            .eq('user_id', player.userId)
            .maybeSingle();
          const progression = (
            progress.data?.progress as {
              progression?: {
                pendingDailyUnlocks?: Record<string, string>;
                unlockedDailies?: string[];
              };
            } | null
          )?.progression;
          return {
            pending: progression?.pendingDailyUnlocks?.[`og:${dateKey}`] ?? null,
            unlocked: progression?.unlockedDailies?.includes(`og:${dateKey}`) ?? false,
          };
        })
        .toEqual({ pending: null, unlocked: true });

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
