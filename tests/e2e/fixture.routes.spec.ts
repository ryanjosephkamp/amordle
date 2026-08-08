import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';

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
  '/players',
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
    await expect(page.getByRole('heading', { name: /choose your next game/i })).toBeVisible();
    expect(wordRequests).toEqual([]);

    await page.goto(
      '/?view=practice-game&mode=go&length=7&difficulty=expert&count=7&hard=1&generation=4',
    );
    await expect(page).toHaveURL(
      /\/play\/solo\/practice\/go\?length=7&difficulty=expert&count=7&hard=1&generation=4$/,
    );
    await expect(page.getByRole('heading', { name: /GO run/i })).toBeVisible();
    await expect(page.locator('.game-status')).toContainText(/7 letters/i);
    await expect(page.locator('.game-status')).toContainText(/1 \/ 7 puzzles/i);
    await expect(page.locator('.game-status')).toContainText(/Hard Mode/i);
  });

  test('the three HTTP interfaces expose only retained public method behavior', async ({
    request,
  }) => {
    const manifestResponse = await request.get('/api/word-lists/manifest');
    expect(manifestResponse.status()).toBe(200);
    const body = (await manifestResponse.json()) as {
      manifest: {
        schemaVersion: number;
        revision: string;
        entries: Array<{ length: number; bytes: number; sha256: string; url: string }>;
      };
    };
    expect(body.manifest.schemaVersion).toBe(2);
    expect(body.manifest.entries).toHaveLength(34);
    expect(body.manifest.entries.map((entry) => entry.length)).toEqual(
      Array.from({ length: 34 }, (_, index) => index + 2),
    );
    for (const length of [2, 5, 7, 10, 35]) {
      const entry = body.manifest.entries.find((candidate) => candidate.length === length);
      expect(entry).toBeDefined();
      const asset = await request.get(entry!.url);
      expect(asset.status()).toBe(200);
      const raw = await asset.body();
      expect(raw.byteLength).toBe(entry!.bytes);
      expect(createHash('sha256').update(raw).digest('hex')).toBe(entry!.sha256);
      expect(asset.headers()['cache-control']).toContain('immutable');
    }

    expect((await request.get('/api/cron/refresh-word-lists')).status()).toBe(401);
    expect((await request.post('/api/admin-refresh')).status()).toBe(401);
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

  test('Word Explorer opens immediate details and Calendar uses bounded month navigation', async ({
    page,
  }) => {
    const wordRequests: string[] = [];
    page.on('request', (request) => {
      if (/\/word-lists\/[a-f0-9]{64}\//.test(request.url())) {
        wordRequests.push(request.url());
      }
    });
    await page.goto('/words?length=5&q=cr&sort=az');
    const search = page.getByLabel('Search');
    await expect(search).toBeVisible();
    await expect(search).toHaveCSS('background-color', /.+/);
    await expect(page.getByText(/accepted guesses/i)).toBeVisible();
    expect(wordRequests).toHaveLength(1);
    expect(wordRequests[0]).toMatch(/\/5-[a-f0-9]{64}\.json$/);
    const firstWord = page.getByRole('region', { name: 'Words' }).getByRole('option').first();
    const label = ((await firstWord.textContent()) ?? '').trim().slice(0, 5);
    await firstWord.click();
    await expect(page.getByRole('dialog', { name: new RegExp(label, 'i') })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(firstWord).toBeFocused();

    await page.goto('/calendar');
    await expect(page.locator('.calendar-grid')).toBeVisible();
    const now = new Date();
    await expect(page.locator('.calendar-grid .calendar-day')).toHaveCount(
      new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    );
    await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled();
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page.getByRole('button', { name: 'Next month' })).toBeEnabled();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('Word Explorer restores its integrity-checked selected-length cache offline', async ({
    page,
  }) => {
    await page.goto('/words?length=7');
    await expect(page.getByText(/accepted guesses/i)).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.getByText(/accepted guesses/i)).toBeVisible();
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await page.reload();
    await expect(page.getByText(/accepted guesses/i)).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async (currentUrl) => {
          // The key is derived from the build stamp now, so resolve it rather than
          // hardcoding a version that a deploy is supposed to change.
          const key = (await caches.keys()).find((name) => name.startsWith('amordle-shell-'));
          if (!key) return false;
          const cache = await caches.open(key);
          return Boolean(await cache.match(currentUrl));
        }, page.url()),
      )
      .toBe(true);
    const assetUrl = await page.evaluate(async () => {
      const response = await fetch('/api/word-lists/manifest');
      const body = (await response.json()) as {
        manifest: { entries: Array<{ length: number; url: string }> };
      };
      return body.manifest.entries.find((entry) => entry.length === 7)!.url;
    });
    const cached = await page.evaluate(async (url) => {
      const cache = await caches.open('amordle-public-word-lists-v2');
      return Boolean(await cache.match(url));
    }, assetUrl);
    expect(cached).toBe(true);
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.getByText(/accepted guesses/i)).toBeVisible();
    await page.context().setOffline(false);
  });

  /*
   * B3. The shell cache key was the literal `amordle-shell-v1`, and sw.js never changed
   * bytes, so the browser's update check never fired and the activate purge never ran —
   * a device could serve a precached HTML document, and the hashed CSS it referenced,
   * from a build that was weeks old. Deriving the key from the build stamp is what makes
   * a deploy actually evict it, so the tie between registration and cache is the thing
   * worth asserting.
   */
  test('the shell cache key is derived from the deployed build, not a literal', async ({
    page,
  }) => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const scriptURL = registration?.active?.scriptURL ?? '';
      return {
        version: new URL(scriptURL, location.href).searchParams.get('v'),
        shellKeys: (await caches.keys()).filter((key) => key.startsWith('amordle-shell-')),
      };
    });
    expect(state.version, 'the registration must carry a build stamp').toBeTruthy();
    expect(state.shellKeys).toEqual([`amordle-shell-${state.version}`]);
  });

  /*
   * C5. The Hard Mode aid judges each candidate with `hardModeViolationForEvidence`, the
   * same function the game enforces, so these assertions are on the real rule rather than
   * on prose that could drift away from it. One accept plus all three refusal families.
   */
  test('Help judges Hard Mode candidates with the real rule', async ({ page }) => {
    await page.goto('/help');
    const verdict = page.locator('.help-hard-verdict');
    await expect(verdict).toContainText('No guess tried yet.');

    await page.getByRole('button', { name: 'MEETS' }).click();
    await expect(verdict).toContainText('ACCEPTED');

    await page.getByRole('button', { name: 'MATES' }).click();
    await expect(verdict).toContainText('Use at least 2 Es.');

    await page.getByRole('button', { name: 'GLEES' }).click();
    await expect(verdict).toContainText('G has already been ruled out.');

    await page.getByRole('button', { name: 'MELEE' }).click();
    await expect(verdict).toContainText('Keep S in position 5.');
    await expect(page.getByRole('button', { name: 'MELEE' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Operable without a pointer.
    await page.getByRole('button', { name: 'MEETS' }).focus();
    await page.keyboard.press('Enter');
    await expect(verdict).toContainText('ACCEPTED');
  });

  /*
   * C5. The aids render finished and only wind back if a client that can animate scrolls
   * them into view, so reduced motion must leave the complete figure rather than a frame
   * mid-sequence. That is the whole safety argument for the design, and /help had no
   * reduced-motion or forced-colors coverage at all before this.
   */
  test('Help teaching aids rest in a complete state under reduced motion and forced colors', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await page.goto('/help');

    /*
     * W5.1 and W5.3 removed the sequences from these two figures, so they no longer rest
     * in a complete state — they only ever have one state. The assertions are repointed
     * at what must now be true rather than deleted, because the property that matters is
     * unchanged: a reader with reduced motion sees the whole figure.
     */
    for (const state of ['is-correct', 'is-present', 'is-absent']) {
      await expect(page.locator(`.help-tile-row .tile.${state}`)).toHaveCount(1);
    }
    // The pending treatment and the blinking cursor belonged to the sequence and are gone.
    await expect(page.locator('.help-tile-row .tile.is-pending')).toHaveCount(0);
    await expect(page.locator('.help-tile-row .tile[data-cursor]')).toHaveCount(0);
    // The lane rail is unconditional now, so it must paint without any attribute at all.
    const lanes = page.locator('.help-lane-comparison > div');
    await expect(lanes).toHaveCount(2);
    await expect(page.locator('.help-lane-comparison > div[data-reached]')).toHaveCount(0);
    for (const index of [0, 1]) {
      await expect(lanes.nth(index)).toHaveCSS('border-inline-start-width', '2px');
    }
    // The GO chain still animates until W5.2 replaces it, so it must still rest complete.
    await expect(page.locator('.help-chain li:not([data-reached])')).toHaveCount(0);

    const axe = await new AxeBuilder({ page }).analyze();
    const blocking = axe.violations.filter((item) =>
      ['serious', 'critical'].includes(item.impact ?? ''),
    );
    expect(blocking, blocking.map((item) => item.id).join(', ')).toEqual([]);
  });

  test('Help separates core teaching aids from collapsed advanced shortcuts', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByText(/ONE ANSWER BECOMES THE NEXT PUZZLE/i)).toBeVisible();
    await expect(page.getByText(/BUILD A COMPATIBLE HARD MODE GUESS/i)).toBeVisible();
    const advanced = page.getByText(/Mouse-free mode — for keyboard diehards/i);
    await expect(advanced).toBeVisible();
    await expect(page.locator('#keyboard-navigation')).not.toHaveAttribute('open', '');
    await advanced.click();
    await expect(page.locator('#keyboard-navigation')).toHaveAttribute('open', '');
    await expect(page.getByRole('columnheader', { name: 'Keys' })).toBeVisible();
  });
});
