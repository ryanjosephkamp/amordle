import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

async function capture(page: Page, outputPath: string) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('.route-error')).toHaveCount(0);
  await page.screenshot({ path: outputPath, fullPage: true });
}

test('captures Checkpoint 2 truthful product breadth', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  for (const [name, route] of [
    ['home-truthful', '/'],
    ['play-truthful', '/play'],
    ['history-truthful', '/history'],
    ['stats-truthful', '/stats'],
    ['marketplace-truthful', '/marketplace'],
    ['leaderboards-private', '/leaderboards'],
    ['profile-private', '/profile'],
    ['word-explorer-safe', '/word-explorer'],
    ['settings-versioned', '/settings'],
    ['help-complete', '/help'],
    ['feedback-sanitized', '/feedback'],
    ['about-release', '/about'],
  ] as const) {
    await page.goto(route);
    if (route === '/word-explorer') {
      await expect(page.locator('.search-metadata')).toContainText(/^\d+ matching valid words/);
    }
    await capture(page, testInfo.outputPath(`${name}.png`));
  }
});

test('captures the source-derived notification center', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem(
      'amordle:notifications:guest',
      JSON.stringify({
        schemaVersion: 1,
        owner: { kind: 'guest' },
        revision: 1,
        updatedAt: '2026-07-22T12:00:00.000Z',
        payload: {
          events: [
            {
              id: 'visual-private-request',
              fingerprint: 'private-request:visual-private-request:pending',
              kind: 'private-request',
              title: 'Private Practice request',
              body: 'A public player invited you to a Practice match.',
              target: '/combat/lobby?request=visual-private-request',
              createdAt: '2026-07-22T12:00:00.000Z',
            },
          ],
          readIds: [],
          hiddenIds: [],
        },
      }),
    );
  });
  await page.reload();
  await page.getByRole('button', { name: 'Notifications, 1 unread' }).click();
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
  await capture(page, testInfo.outputPath('notifications-source-derived.png'));
});

test('captures the sculpted keyboard and corrected GO attempt budget', async ({
  page,
}, testInfo) => {
  test.setTimeout(45_000);
  const evidenceDirectory = resolve('test-results/visual-review/go-keyboard-refinement');
  mkdirSync(evidenceDirectory, { recursive: true });
  const evidencePath = (name: string) =>
    resolve(evidenceDirectory, `${testInfo.project.name}-${name}.png`);
  const captureGameplay = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('.route-error')).toHaveCount(0);
    if ((page.viewportSize()?.width ?? 1_000) <= 760) {
      await page.locator('.game-stage').screenshot({ path: evidencePath(name) });
      return;
    }
    await capture(page, evidencePath(name));
  };

  await page.goto('/play/practice/og?length=5');
  await expect(page.locator('.keyboard')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.key').first()).toHaveCSS('border-radius', /5px|7px/);
  if ((page.viewportSize()?.width ?? 1_000) <= 760) {
    const enter = page.locator('.key[data-key="ENTER"]');
    await enter.scrollIntoViewIfNeeded();
    const enterBox = await enter.boundingBox();
    const dockBox = await page.locator('.mobile-dock').boundingBox();
    expect(enterBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(enterBox!.y + enterBox!.height).toBeLessThanOrEqual(dockBox!.y + 1);
  }
  await captureGameplay('keyboard-neutral');

  await page.keyboard.down('a');
  await expect(page.locator('.key[data-key="A"]')).toHaveAttribute('data-pressed', 'true');
  await captureGameplay('keyboard-physical-press');
  await page.keyboard.up('a');
  await expect(page.locator('.key[data-key="A"]')).not.toHaveAttribute('data-pressed');

  await page.goto('/play/daily/go');
  await expect(page.getByText('6 attempts remaining')).toBeVisible({ timeout: 15_000 });
  const solveCurrentPuzzle = async () => {
    await expect(page.locator('.keyboard')).toBeVisible();
    const answer = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((candidate) =>
        candidate.startsWith('amordle:solo:daily:go:'),
      );
      const envelope = key ? JSON.parse(localStorage.getItem(key) ?? '{}') : {};
      const index = envelope?.payload?.currentPuzzleIndex;
      return typeof index === 'number' && typeof envelope?.payload?.answers?.[index] === 'string'
        ? envelope.payload.answers[index]
        : '';
    });
    expect(answer).toMatch(/^[a-z]{5}$/);
    await page.keyboard.type(answer);
    await page.keyboard.press('Enter');
    await expect(page.locator('.game-transition-band.is-active')).toBeVisible();
  };
  await solveCurrentPuzzle();
  await expect(page.getByText('5 attempts remaining')).toBeVisible({ timeout: 5_000 });
  await solveCurrentPuzzle();
  await expect(page.getByText('4 attempts remaining')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('row')).toHaveCount(6);
  await expect(page.getByRole('row', { name: /P2 seeded evidence row/ })).toBeVisible();
  await captureGameplay('daily-go-puzzle-3');
});
