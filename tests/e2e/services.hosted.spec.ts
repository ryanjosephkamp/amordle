import { expect, test } from '@playwright/test';
import { unlockProtectedPreview } from './protected-preview';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? '';
const enabled =
  process.env.AMORDLE_ENABLE_HOSTED_API_E2E === '1' &&
  baseUrl.startsWith('https://') &&
  new URL(baseUrl).hostname !== 'amordle.vercel.app';

function expectSafeBody(body: string): void {
  expect(body).not.toMatch(
    /service[_-]?role|CRON_SECRET|BLOB_READ_WRITE_TOKEN|SUPABASE_DB_PASSWORD/i,
  );
}

test.describe('protected preview API contracts', () => {
  test.skip(!enabled, 'Requires an explicitly authorized non-production HTTPS preview base URL.');
  test.describe.configure({ mode: 'serial' });

  test('serves safe public manifest metadata with bounded caching', async ({ page }) => {
    await unlockProtectedPreview(page);
    const response = await page.request.get('/api/word-lists/manifest');
    expect([200, 502]).toContain(response.status());
    expect(response.headers()['content-type']).toContain('application/json');
    const body = await response.text();
    expectSafeBody(body);
    if (response.status() === 200) {
      // Vercel consumes the handler's s-maxage directive at its CDN boundary
      // and returns the remaining bounded browser max-age to the client.
      expect(response.headers()['cache-control']).toContain('max-age=60');
      expect(JSON.parse(body)).toHaveProperty('manifest');
    }
  });

  test('enforces method and missing-bearer behavior on all three APIs', async ({ page }) => {
    await unlockProtectedPreview(page);
    const cases = [
      { method: 'get', path: '/api/admin-refresh', status: 405 },
      { method: 'post', path: '/api/admin-refresh', status: 401 },
      { method: 'post', path: '/api/cron/refresh-word-lists', status: 405 },
      { method: 'get', path: '/api/cron/refresh-word-lists', status: 401 },
      { method: 'post', path: '/api/word-lists/manifest', status: 405 },
    ] as const;
    for (const scenario of cases) {
      const response = await page.request[scenario.method](scenario.path);
      expect(response.status(), `${scenario.method.toUpperCase()} ${scenario.path}`).toBe(
        scenario.status,
      );
      expectSafeBody(await response.text());
    }
  });

  test('renders the protected mobile preview within visual stability budgets', async ({
    page,
  }, testInfo) => {
    await unlockProtectedPreview(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const metrics = { cls: 0, lcp: 0 };
      Object.defineProperty(window, '__amordleMetrics', { value: metrics });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
          if (!shift.hadRecentInput) metrics.cls += shift.value ?? 0;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    const requestedWordBanks: string[] = [];
    page.on('request', (request) => {
      if (/words_length_\d+\.json/.test(request.url())) requestedWordBanks.push(request.url());
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await page.waitForTimeout(500);
    const metrics = await page.evaluate(
      () =>
        (
          window as unknown as Window & {
            __amordleMetrics: { cls: number; lcp: number };
          }
        ).__amordleMetrics,
    );
    expect(metrics.lcp).toBeGreaterThan(0);
    expect(metrics.lcp).toBeLessThanOrEqual(2_500);
    expect(metrics.cls).toBeLessThanOrEqual(0.1);
    expect(requestedWordBanks).toEqual([]);
    expect(await page.request.get('/manifest.webmanifest')).toBeOK();
    expect(await page.request.get('/sw.js')).toBeOK();
    await testInfo.attach('protected-preview-performance.json', {
      body: JSON.stringify(metrics, null, 2),
      contentType: 'application/json',
    });
    console.info(JSON.stringify({ protectedPreviewPerformance: metrics }));
  });
});
