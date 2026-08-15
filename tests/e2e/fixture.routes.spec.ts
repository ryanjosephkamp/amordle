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
  '/methodology',
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
    /*
     * v10. There is a window during hydration where this selector matches TWO
     * identical nodes, and the assertion below then fails on strict mode rather
     * than on anything about Hard Mode. Reproduced 1 in 8 against a Preview and
     * 1 in 12 against Production, so it predates this cycle; the duplicate is
     * gone by the time the failure snapshot is taken, which is why it reads as
     * a mystery in the report rather than as a defect.
     *
     * Asserting the count first is deliberately a STRENGTHENING, not a wait
     * dressed up as one: nothing here previously said how many of these the
     * page should have, and now it does. Playwright retries it, so it also
     * outlasts the window instead of racing it.
     */
    await expect(verdict).toHaveCount(1);
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
    /*
     * W5. The six figures rest on their TERMINAL frame, because `useFrameSequence` starts
     * at the last frame and only winds back for a client that can animate. This is what a
     * reader with reduced motion, a browser with no JavaScript, and a crawler all get —
     * so it has to be the frame worth seeing, and these assert exactly that rather than
     * that "something rendered".
     */
    const figureOf = (caption: RegExp) =>
      page.locator('figure.help-figure').filter({ has: page.getByText(caption) });

    // GO: six board entries, and puzzle five's four seeded rows carried forward.
    const go = figureOf(/ONE ANSWER BECOMES THE NEXT PUZZLE/i);
    await expect(go.locator('.help-board-entry')).toHaveCount(6);
    await expect(go.locator('.help-row-meta.is-seed')).toHaveCount(4);

    // COMBAT: nine slots, not six — the board does not end at row six, which is the
    // entire lesson. The eighth row is the win, so every tile in it is correct.
    const combat = figureOf(/BOTH PLAYERS READ ONE BOARD/i);
    await expect(combat.locator('.help-board-entry')).toHaveCount(9);
    await expect(
      combat.locator('.help-board-entry').nth(7).locator('.tile.is-correct'),
    ).toHaveCount(5);
    // Two keyboards drawn from one evidence object. Exactly one side declares an accent:
    // Nova deliberately declares none so it inherits the viewer's own, which is the point.
    await expect(combat.locator('.keyboard')).toHaveCount(2);
    await expect(combat.locator('.help-combat-side[data-accent]')).toHaveCount(1);
    await expect(combat.locator('.help-combat-side:not([data-accent])')).toHaveCount(1);

    // Remove strikes out five keys, which is what the tool does — not "all wrong letters".
    await expect(figureOf(/REMOVE FIVE WRONG LETTERS/i).locator('.key.is-removed')).toHaveCount(5);

    // Continue ends with a seventh row past the sixth.
    await expect(figureOf(/CONTINUE PAST THE LAST ROW/i).locator('.help-board-entry')).toHaveCount(
      7,
    );

    // The figures are decorative subtrees with the lesson in the caption, so they must not
    // put 56 keyboard keys and 45 tiles into the tab order.
    await expect(page.locator('.help-stage button')).toHaveCount(0);

    /*
     * v7.4. The figure keyboards must be the real keyboard, not an approximation of it.
     * Row three carries SUBMIT and DELETE, so it is nine items and its letters end up
     * NARROWER than row one — the figure previously had seven and got that backwards.
     */
    const rows = combat.locator('[data-accent="violet"] .keyboard-row');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0).locator('.key')).toHaveCount(10);
    await expect(rows.nth(1).locator('.key')).toHaveCount(9);
    await expect(rows.nth(2).locator('.key')).toHaveCount(9);
    await expect(rows.nth(2).locator('.key').first()).toHaveText('SUBMIT');
    await expect(rows.nth(2).locator('.key').last()).toHaveText('DELETE');

    /*
     * A `<span>` key has to be indistinguishable from a `<button>` key. The properties that
     * centre a key's glyph live on `button, .button`, which a span does not match, so
     * without an explicit parity rule the letters sit top-left at weight 400.
     */
    const keyParity = await combat
      .locator('.keyboard-row')
      .first()
      .evaluate((row) => {
        /*
         * Compared against a real <button class="key"> injected into the same row, not
         * against remembered constants: parity IS the property under test, and a
         * hardcoded value would drift the moment the real key changed. It also sidesteps
         * a trap — a flex item is blockified, so both compute `flex`, not `inline-flex`.
         */
        const probe = document.createElement('button');
        probe.type = 'button';
        probe.className = 'key is-unknown';
        probe.textContent = 'Q';
        row.append(probe);
        const read = (node: Element) => {
          const style = getComputedStyle(node);
          return [
            style.display,
            style.alignItems,
            style.justifyContent,
            style.fontWeight,
            style.letterSpacing,
          ].join(' | ');
        };
        const result = { span: read(row.querySelector('span.key')!), button: read(probe) };
        probe.remove();
        return result;
      });
    expect(keyParity.span, 'a figure key must render exactly like a real key').toBe(
      keyParity.button,
    );
    // 650, not 700: tui-shell.css redeclares `button, .button` after globals.css does.
    expect(keyParity.span).toContain('center | center | 650');

    // The two-accent assertion cannot live here: forced colors replaces every colour with
    // a system colour, so both keyboards legitimately read white. It has its own test.

    const axe = await new AxeBuilder({ page }).analyze();
    const blocking = axe.violations.filter((item) =>
      ['serious', 'critical'].includes(item.impact ?? ''),
    );
    expect(blocking, blocking.map((item) => item.id).join(', ')).toEqual([]);
  });

  /*
   * v7.4. The regression that shipped in v7.3, asserted directly.
   *
   * Both COMBAT keyboards carried a `data-accent` attribute and NEITHER resolved: the
   * accent blocks were scoped to `:root`, which is <html>, so an attribute on a nested
   * <div> matched nothing and both keyboards rendered in the page accent. The figure's
   * whole two-player reading was lost, and no test noticed because nothing compared them.
   *
   * Its own test rather than part of the reduced-motion one, because that runs with
   * forced colors active, where every colour is a system colour and both sides
   * legitimately read white.
   */
  test('the two COMBAT keyboards render in different accents', async ({ page }) => {
    await page.goto('/help');
    /*
     * Waited for rather than read straight after `goto`: the whole app shell sits inside a
     * Suspense boundary that suspends during SSR, so the initial HTML of EVERY route is the
     * skeleton fallback and all page content — server and client components alike — arrives
     * after hydration. Pre-existing and app-wide, not specific to these figures.
     */
    await page.locator('.help-combat-side').first().waitFor();
    const sides = await page.evaluate(() => {
      const nodes = document.querySelectorAll('.help-combat-side');
      const keyOf = (side: Element) => {
        const key = side.querySelector('.key')!;
        const style = getComputedStyle(key);
        return { background: style.backgroundColor, border: style.borderColor };
      };
      return { nova: keyOf(nodes[0]!), rook: keyOf(nodes[1]!), count: nodes.length };
    });
    expect(sides.count).toBe(2);
    expect(sides.nova.background, 'the two keyboards must not share one accent').not.toBe(
      sides.rook.background,
    );
    expect(sides.nova.border).not.toBe(sides.rook.border);

    /*
     * And the draft row follows the turn. The board carries the accent of whoever is on
     * move, so its outline and caret alternate with the keyboards — asserted by driving
     * the sequence rather than trusting the markup, since the terminal frame only ever
     * shows one of the two states.
     */
    const draftBorders = await page.evaluate(async () => {
      const figure = [...document.querySelectorAll('figure.help-figure')].find((node) =>
        /BOTH PLAYERS/i.test(node.textContent ?? ''),
      )!;
      const seen = new Set<string>();
      const sample = () => {
        const tile = figure.querySelector('.board-row.is-draft .tile');
        if (tile) seen.add(getComputedStyle(tile).borderTopColor);
      };
      sample();
      (figure.querySelector('.help-replay') as HTMLButtonElement | null)?.click();
      for (let tick = 0; tick < 60; tick += 1) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        sample();
      }
      return [...seen];
    });
    expect(
      draftBorders.length,
      `the draft row must change accent with the turn — saw ${draftBorders.join(', ')}`,
    ).toBeGreaterThan(1);
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
