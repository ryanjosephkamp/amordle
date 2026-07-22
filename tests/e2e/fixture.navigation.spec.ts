import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const canonicalRoutes = [
  '/',
  '/play',
  '/play/daily/og',
  '/play/daily/go',
  '/play/practice/og',
  '/play/practice/go',
  '/calendar',
  '/combat',
  '/combat/daily',
  '/combat/practice',
  '/combat/active',
  '/combat/lobby',
  '/combat/live',
  '/marketplace',
  '/history',
  '/leaderboards',
  '/word-explorer',
  '/definitions',
  '/stats',
  '/profile',
  '/players/public-proof',
  '/settings',
  '/help',
  '/feedback',
  '/about',
  '/admin',
];

test('all canonical destinations load with one main landmark', async ({ page }) => {
  for (const route of canonicalRoutes) {
    await page.goto(route);
    await expect(page.locator('main')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText('Lazy route was not initialized');
  }
});

test('primary Home, Solo, and COMBAT surfaces have no serious accessibility violations', async ({
  page,
}) => {
  for (const route of ['/', '/play/practice/og', '/combat/lobby']) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      result.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
      `${route} serious accessibility findings`,
    ).toEqual([]);
  }
});

test('Home does not request answer banks', async ({ page }) => {
  const requestedWordBanks: string[] = [];
  page.on('request', (request) => {
    if (/words_length_\d+\.json/.test(request.url())) requestedWordBanks.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await page.waitForTimeout(500);
  expect(requestedWordBanks).toEqual([]);
});

test('invalid Solo route segments fail before requesting a word bank', async ({ page }) => {
  const requestedWordBanks: string[] = [];
  page.on('request', (request) => {
    if (/words_length_\d+\.json/.test(request.url())) requestedWordBanks.push(request.url());
  });
  await page.goto('/play/not-a-mode/not-a-scope');
  await expect(page.getByRole('heading', { name: 'Invalid game configuration' })).toBeVisible();
  await expect(page.getByText(/No word list was requested/)).toBeVisible();
  await page.waitForTimeout(250);
  expect(requestedWordBanks).toEqual([]);
});

test('Checkpoint 1 calendar and Word Explorer treatments remain readable and aligned', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto('/calendar');
  for (const lane of ['S-OG', 'S-GO', 'C-OG', 'C-GO']) {
    await expect(page.getByText(lane, { exact: true }).first()).toBeVisible();
  }
  await expect(
    page.getByRole('img', { name: /Solo OG: (available|locked)/ }).first(),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: 'Combat OG: recorded' }).first()).toBeVisible();
  await expect(
    page.locator('button.calendar-day').filter({ hasText: 'S-OG' }).first(),
  ).toHaveAccessibleName(/Solo OG: (available|locked).*Combat OG: recorded/);
  await expect(page.getByText('●Recorded', { exact: true })).toBeVisible();

  await page.goto('/word-explorer');
  await expect(page.locator('.search-metadata')).toContainText(
    /^\d+ visible .* 5-letter bundled data/,
  );
  await expect(page.locator('.ruled-list .word-row').first()).toBeVisible();
  const searchGap = await page.evaluate(() => {
    const input = document.querySelector('.search-control input')?.getBoundingClientRect();
    const metadata = document.querySelector('.search-metadata')?.getBoundingClientRect();
    return input && metadata ? metadata.top - input.bottom : -1;
  });
  expect(searchGap).toBeGreaterThanOrEqual(10);
  const actionAlignment = await page.locator('.word-actions').evaluate((actions) => {
    const boxes = [...actions.querySelectorAll<HTMLElement>('.button')].map((item) =>
      item.getBoundingClientRect(),
    );
    return {
      bottomDelta: Math.abs((boxes[0]?.bottom ?? 0) - (boxes[1]?.bottom ?? 0)),
      topDelta: Math.abs((boxes[0]?.top ?? 0) - (boxes[1]?.top ?? 0)),
    };
  });
  expect(actionAlignment.topDelta).toBeLessThanOrEqual(1);
  expect(actionAlignment.bottomDelta).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/word-explorer');
  await expect(page.locator('.word-actions .button')).toHaveCount(2);
  await page.locator('.word-actions .button').nth(1).scrollIntoViewIfNeeded();
  await expect(page.locator('.word-actions .button').nth(1)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('compatibility routes resolve to canonical destinations', async ({ page }) => {
  const redirects = new Map([
    ['/home', '/'],
    ['/solo', '/play'],
    ['/multiplayer', '/combat'],
    ['/practice', '/play/practice/og'],
    ['/og-daily', '/play/daily/og'],
    ['/go-daily', '/play/daily/go'],
    ['/leaderboard', '/leaderboards'],
  ]);
  for (const [from, to] of redirects) {
    await page.goto(from);
    await expect(page).toHaveURL(new RegExp(`${to.replaceAll('/', '\\/')}$`));
  }

  await page.goto('/og-daily?date=2026-07-20&focus=1');
  await expect(page).toHaveURL('/play/daily/og?date=2026-07-20&focus=1');
  await page.goto('/public-profile/ember-17?from=history');
  await expect(page).toHaveURL('/players/ember-17?from=history');
});

test('Solo keyboard, rejection, durable restore, focus, and terminal recovery are interactive', async ({
  page,
}) => {
  await page.goto('/play/practice/og');
  await expect(page.getByRole('heading', { name: 'Practice OG' })).toBeVisible();
  await page.waitForFunction(() =>
    Object.keys(localStorage).some((key) => key.startsWith('amordle:solo:practice:og:')),
  );
  const answer = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith('amordle:solo:practice:og:'),
    );
    if (!key) return '';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      payload?: { answer?: string };
    };
    return stored.payload?.answer ?? '';
  });
  expect(answer).toMatch(/^[a-z]{5}$/);
  await page.keyboard.type('x');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('exactly 5 letters');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(answer);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').first()).toContainText(/saved|recorded locally/);
  await page.reload();
  await expect(page.getByRole('status').first()).toContainText('restored');
  await expect(page.getByRole('heading', { name: 'OG puzzle complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Focus' }).click();
  await expect(page).toHaveURL(/focus=1/);
  await page
    .getByRole('button', { name: /Exit focus/i })
    .first()
    .click();
  await expect(page).not.toHaveURL(/focus=1/);
});

test('Daily GO is canonical five-letter play and Practice GO auto-advances with prior evidence', async ({
  page,
}) => {
  await page.goto('/play/daily/go?length=7&count=10');
  await expect(page).toHaveURL(/\/play\/daily\/go$/);
  await expect(page.getByRole('grid', { name: '5-letter word board' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/daily go · 5 letters/i)).toBeVisible();

  await page.goto('/play/practice/go?length=5&count=5');
  await expect(page.getByRole('grid', { name: '5-letter word board' })).toBeVisible({
    timeout: 15_000,
  });
  const firstAnswer = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith('amordle:solo:practice:go:'),
    );
    if (!key) return '';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      payload?: { answers?: string[] };
    };
    return stored.payload?.answers?.[0] ?? '';
  });
  expect(firstAnswer).toMatch(/^[a-z]{5}$/);
  await page.keyboard.type(firstAnswer);
  await page.keyboard.press('Enter');
  await expect(page.getByText(/holding solved evidence/i)).toBeVisible();
  await expect(page.getByText(/puzzle 2 \/ 5/i)).toBeVisible({ timeout: 3_500 });
  await expect(page.getByRole('row', { name: 'P1 seeded evidence row' })).toBeVisible();
  await expect(page.getByText('P1', { exact: true })).toBeVisible();
});

test('physical-key input reaches a tile below the 100ms p95 budget', async ({ page }, testInfo) => {
  await page.goto('/play/practice/og');
  await expect(page.getByRole('grid', { name: '5-letter word board' })).toBeVisible({
    timeout: 15_000,
  });
  const firstTile = page.getByRole('gridcell').first();
  const samples: number[] = [];
  for (let index = 0; index < 20; index += 1) {
    await page.evaluate(() => {
      const runtime = window as unknown as Window & {
        __amordleKeyStarted: number | undefined;
        __amordleKeyLatency: number | undefined;
      };
      runtime.__amordleKeyLatency = undefined;
      runtime.__amordleKeyStarted = performance.now();
      const board = document.querySelector('[role="grid"]');
      const observer = new MutationObserver(() => {
        const tile = document.querySelector('[role="gridcell"]');
        if (tile?.getAttribute('aria-label') === 'A, draft') {
          runtime.__amordleKeyLatency = performance.now() - (runtime.__amordleKeyStarted ?? 0);
          observer.disconnect();
        }
      });
      if (board) observer.observe(board, { childList: true, subtree: true, attributes: true });
    });
    await page.keyboard.press('a');
    await expect(firstTile).toHaveAttribute('aria-label', 'A, draft');
    const elapsed = await page.waitForFunction(
      () => (window as unknown as Window & { __amordleKeyLatency?: number }).__amordleKeyLatency,
    );
    samples.push(Number(await elapsed.jsonValue()));
    await page.keyboard.press('Backspace');
    await expect(firstTile).toHaveAttribute('aria-label', 'empty position 1');
  }
  samples.sort((left, right) => left - right);
  const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  expect(p95).toBeLessThan(100);
  await testInfo.attach('key-to-tile-performance.json', {
    body: JSON.stringify({ p95Ms: p95, samplesMs: samples }, null, 2),
    contentType: 'application/json',
  });
  console.info(JSON.stringify({ keyToTileP95Ms: p95 }));
});

for (const width of [320, 360, 390, 412, 768, 960, 1440, 1920]) {
  test(`has no page overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    for (const route of [
      '/',
      '/play/practice/go',
      '/calendar',
      '/combat/lobby',
      '/word-explorer',
      '/admin',
    ]) {
      await page.goto(route);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    }
  });
}
