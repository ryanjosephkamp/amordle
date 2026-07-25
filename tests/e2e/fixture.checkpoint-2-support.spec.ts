import { expect, test } from '@playwright/test';

test('APP-01 reaches dynamic, auth, support, and protected Admin routes', async ({ page }) => {
  const routes = [
    '/combat/match/unavailable-example',
    '/combat/match/unavailable-example/result',
    '/combat/live/unavailable-example',
    '/players/11111111-1111-4111-8111-111111111111',
    '/auth',
    '/auth/callback',
    '/auth/recovery',
    '/help',
    '/feedback',
    '/about',
    '/admin',
  ];

  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('main')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText('Lazy route was not initialized');
  }
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Developer operations locked' })).toBeVisible();
});

test('APP-03 preserves a local draft through in-app navigation, Back, and Forward', async ({
  page,
}) => {
  await page.goto('/play/practice/og?length=5');
  await expect(page.getByRole('grid', { name: '5-letter word board' })).toBeVisible({
    timeout: 15_000,
  });
  await page.keyboard.type('c');
  await expect(page.locator('.tile--draft').first()).toHaveText('C');

  await page.getByRole('link', { name: 'Help' }).click();
  await expect(page).toHaveURL(/\/help$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/play\/practice\/og\?length=5$/);
  await expect(page.locator('.tile--draft').first()).toHaveText('C');

  await page.goForward();
  await expect(page).toHaveURL(/\/help$/);
  await page.goBack();
  await expect(page.locator('.tile--draft').first()).toHaveText('C');
});

test('APP-05 keeps manual scroll position stable during an in-place settings action', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto('/settings');
  const notifications = page.locator('#alerts .switch input').first();
  await notifications.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);

  await notifications.click();
  const after = await page.evaluate(() => window.scrollY);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
});

test('identity-local reset includes continuation and notification state only for its owner', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.evaluate(() => {
    localStorage.setItem('amordle:solo-continuation:practice-og:guest', 'guest continuation');
    localStorage.setItem('amordle:solo-consumable:practice-og:guest', 'guest consumable');
    localStorage.setItem('amordle:notifications:guest', 'guest notifications');
    localStorage.setItem(
      'amordle:solo-continuation:practice-og:account:other',
      'other continuation',
    );
    localStorage.setItem('amordle:solo-consumable:practice-og:account:other', 'other consumable');
    localStorage.setItem('amordle:notifications:account:other', 'other notifications');
  });

  await page.locator('summary').filter({ hasText: 'Account & local data' }).click();
  await page.getByRole('button', { name: 'Reset this browser namespace' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Confirm local reset' })).toContainText(
    'continuation and consumable operations, and notifications',
  );
  await page.getByRole('button', { name: 'Confirm local reset' }).click();
  await expect(page).toHaveURL(/\/$/);

  const residue = await page.evaluate(() => ({
    guestContinuation: localStorage.getItem('amordle:solo-continuation:practice-og:guest'),
    guestConsumable: localStorage.getItem('amordle:solo-consumable:practice-og:guest'),
    guestNotifications: localStorage.getItem('amordle:notifications:guest'),
    otherContinuation: localStorage.getItem('amordle:solo-continuation:practice-og:account:other'),
    otherConsumable: localStorage.getItem('amordle:solo-consumable:practice-og:account:other'),
    otherNotifications: localStorage.getItem('amordle:notifications:account:other'),
  }));
  expect(residue).toEqual({
    guestContinuation: null,
    guestConsumable: null,
    guestNotifications: null,
    otherContinuation: 'other continuation',
    otherConsumable: 'other consumable',
    otherNotifications: 'other notifications',
  });
});

test('APP-09 account and More surfaces dismiss and route predictably', async ({ page }) => {
  await page.goto('/');
  const accountButton = page.getByRole('button', { name: 'Sign in or open account menu' });
  await accountButton.click();
  await expect(page.getByRole('dialog', { name: 'Guest account' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Guest account' })).toHaveCount(0);

  await accountButton.click();
  await page.getByRole('button', { name: 'Open profile' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('dialog', { name: 'Guest account' })).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open more destinations' }).click();
  const more = page.getByRole('dialog', { name: 'More destinations' });
  await expect(more).toBeVisible();
  await more.getByRole('link', { name: 'Help' }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(more).toHaveCount(0);
});

test('APP-12 exposes the truthful active-session count independently of color', async ({
  page,
}) => {
  await page.goto('/play/practice/og?length=5');
  await expect(page.getByRole('grid', { name: '5-letter word board' })).toBeVisible({
    timeout: 15_000,
  });
  await page.goto('/play');
  const badge = page.locator('.subnav-badge');
  await expect(badge).toHaveText('1');
  await expect(badge).toHaveAttribute('aria-label', '1 active Solo session');
  await expect(page.locator('.subnav a[aria-current="page"]')).toContainText('Overview');
});

test('SUP-03 separates instructions and rating explanation from About product notes', async ({
  page,
}) => {
  await page.goto('/help');
  await page.getByRole('button', { name: /4 Play & score/ }).click();
  await expect(
    page.getByText(/Elo changes only after eligible ranked server settlement/),
  ).toBeVisible();
  await expect(page.getByText(/Live points, result points, rating, turn, and clock/)).toBeVisible();

  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'About amordle' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Release' })).toBeVisible();
  await expect(page.getByText(/does not claim production promotion/)).toBeVisible();
});

test('truthful Admin route has no query-driven fixture metrics or receipts', async ({ page }) => {
  await page.goto('/admin?visual=ready');
  await expect(page).toHaveURL(/\/admin\?visual=ready$/);
  await expect(page.getByRole('heading', { name: 'Developer operations locked' })).toBeVisible();
  await expect(page.locator('.operations-matrix')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('Attention');
  await expect(page.locator('main')).not.toContainText('Jul 21, 2026');

  await page.goto('/admin?visual=success');
  await expect(page.getByRole('heading', { name: 'Developer operations locked' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Refresh succeeded.' })).toHaveCount(0);
});
