import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const canonicalRoutes = [
  '/',
  '/play',
  '/play/solo',
  '/play/solo/practice/og?length=2&difficulty=casual&generation=0',
  '/play/solo/practice/go?length=35&difficulty=expert&count=5&hard=1&generation=0',
  `/play/solo/daily/${new Date().toISOString().slice(0, 10)}/og`,
  '/calendar',
  '/combat',
  '/combat/practice',
  '/combat/daily',
  '/combat/active',
  '/combat/lobby',
  '/combat/live',
  '/combat/match/not-a-real-match',
  '/combat/results/not-a-real-result',
  '/marketplace',
  '/history',
  '/leaderboards',
  '/words',
  '/profile',
  '/players/not-a-real-profile',
  '/stats',
  '/settings',
  '/help',
  '/feedback',
  '/about',
  '/auth',
  '/auth/callback',
  '/auth/recovery',
  '/admin',
] as const;

test.describe('route and public boundary matrix', () => {
  test('every canonical route has one reachable main landmark without unexpected errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    for (const route of canonicalRoutes) {
      const routeErrors: string[] = [];
      const capture = (error: Error) => routeErrors.push(`${route}: ${error.message}`);
      page.on('pageerror', capture);
      const response = await page.goto(route);
      expect(response?.status(), route).toBeLessThan(500);
      await expect(page.getByRole('main')).toHaveCount(1);
      page.off('pageerror', capture);
      errors.push(...routeErrors);
    }
    expect(errors).toEqual([]);
  });

  test('Home loads no word bank and legacy context redirects canonically', async ({ page }) => {
    const wordRequests: string[] = [];
    page.on('request', (request) => {
      if (/word-lists|words_length_\d+/.test(request.url())) wordRequests.push(request.url());
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /your next word is ready/i })).toBeVisible();
    expect(wordRequests).toEqual([]);

    await page.goto(
      '/?view=practice-game&mode=go&length=7&difficulty=expert&count=7&hard=1&generation=4',
    );
    await expect(page).toHaveURL(
      /\/play\/solo\/practice\/go\?length=7&difficulty=expert&count=7&hard=1&generation=4$/,
    );
    await expect(page.getByText(/7 letters · puzzle 1\/7 · Hard Mode/i)).toBeVisible();
  });

  test('the three HTTP interfaces expose only retained public method behavior', async ({
    request,
  }) => {
    const manifest = await request.get('/api/word-lists/manifest');
    expect(manifest.status()).toBe(200);
    expect(await manifest.json()).toHaveProperty('manifest');

    expect((await request.get('/api/cron/refresh-word-lists')).status()).toBe(401);
    expect((await request.post('/api/admin-refresh')).status()).toBe(502);
    expect((await request.get('/api/admin-refresh')).status()).toBe(405);
  });

  test('public representative routes have no serious or critical axe findings', async ({
    page,
  }) => {
    for (const route of ['/', '/play/solo', '/calendar', '/combat', '/words', '/help']) {
      await page.goto(route);
      const result = await new AxeBuilder({ page }).analyze();
      const blocking = result.violations.filter((item) =>
        ['serious', 'critical'].includes(item.impact ?? ''),
      );
      expect(blocking, `${route}: ${blocking.map((item) => item.id).join(', ')}`).toEqual([]);
    }
  });
});
