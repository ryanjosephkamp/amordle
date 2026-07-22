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
