import { expect, test } from '@playwright/test';

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

  test('serves safe public manifest metadata with bounded caching', async ({ request }) => {
    const response = await request.get('/api/word-lists/manifest');
    expect([200, 502]).toContain(response.status());
    expect(response.headers()['content-type']).toContain('application/json');
    const body = await response.text();
    expectSafeBody(body);
    if (response.status() === 200) {
      expect(response.headers()['cache-control']).toContain('s-maxage=300');
      expect(JSON.parse(body)).toHaveProperty('manifest');
    }
  });

  test('enforces method and missing-bearer behavior on all three APIs', async ({ request }) => {
    const cases = [
      { method: 'get', path: '/api/admin-refresh', status: 405 },
      { method: 'post', path: '/api/admin-refresh', status: 401 },
      { method: 'post', path: '/api/cron/refresh-word-lists', status: 405 },
      { method: 'get', path: '/api/cron/refresh-word-lists', status: 401 },
      { method: 'post', path: '/api/word-lists/manifest', status: 405 },
    ] as const;
    for (const scenario of cases) {
      const response = await request[scenario.method](scenario.path);
      expect(response.status(), `${scenario.method.toUpperCase()} ${scenario.path}`).toBe(
        scenario.status,
      );
      expectSafeBody(await response.text());
    }
  });
});
