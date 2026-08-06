import { expect, test } from '@playwright/test';

test.describe('Solo persistence, input, Focus, and offline behavior', () => {
  test('physical and on-screen commands share state and key response stays below budget', async ({
    page,
  }) => {
    await page.goto('/play/solo/practice/og?length=5&difficulty=standard&generation=19');
    await expect(page.getByRole('heading', { name: /OG puzzle/i })).toBeVisible();
    await page.getByRole('button', { name: /Sound on/i }).click();

    const samples = await page.evaluate(async () => {
      const values: number[] = [];
      const draft = document.querySelector('.board-row.is-draft');
      if (!draft) throw new Error('Draft row unavailable.');
      const text = () => draft.textContent ?? '';
      const nextMutation = (before: string) =>
        new Promise<void>((resolve, reject) => {
          const observer = new MutationObserver(() => {
            if (text() !== before) {
              window.clearTimeout(timeout);
              observer.disconnect();
              resolve();
            }
          });
          const timeout = window.setTimeout(() => {
            observer.disconnect();
            reject(new Error('Draft did not update.'));
          }, 1_000);
          observer.observe(draft, { subtree: true, childList: true, characterData: true });
        });
      for (let index = 0; index < 20; index += 1) {
        const beforeInsert = text();
        const inserted = nextMutation(beforeInsert);
        const started = performance.now();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
        await inserted;
        values.push(performance.now() - started);
        const beforeDelete = text();
        const deleted = nextMutation(beforeDelete);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
        await deleted;
      }
      return values.sort((left, right) => left - right);
    });
    expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(100);

    await page.getByRole('button', { name: /^A, unknown$/i }).click();
    await expect(page.locator('.board-row.is-draft')).toContainText('A');
    await page.getByRole('button', { name: /More navigation/i }).click();
    await page.getByRole('menuitem', { name: /Enter Focus Mode/i }).click();
    await expect(page.locator('.global-chrome')).toHaveCount(0);
    await expect(page.locator('.board-row.is-draft')).toContainText('A');
    // ANNOT-11: the signed-out account trigger reads "guest" but keeps an explicit
    // sign-in affordance in its accessible name.
    await expect(page.getByRole('link', { name: /sign in.*guest/i })).toBeVisible();
    await page.getByRole('link', { name: /Exit focus/i }).click();
    await expect(page.locator('.global-chrome')).toBeVisible();
    await expect(page).toHaveURL(/generation=19$/);
  });

  test('service worker restores a visited Solo route offline without private caches', async ({
    context,
    page,
  }) => {
    await page.goto('/play/solo/practice/og?length=5&difficulty=standard&generation=23');
    await page.waitForFunction(() => 'serviceWorker' in navigator);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.getByRole('heading', { name: /OG puzzle/i })).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: /OG puzzle/i })).toBeVisible();
    const forbidden = await page.evaluate(async () => {
      const requests: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const path = new URL(request.url).pathname;
          if (path.startsWith('/api/') || path.startsWith('/auth') || path.startsWith('/combat')) {
            requests.push(path);
          }
        }
      }
      return requests;
    });
    expect(forbidden).toEqual([]);
  });

  test('global Shift shortcuts navigate without disrupting game input or editable fields', async ({
    page,
  }) => {
    await page.goto('/play/solo/practice/og?length=5&difficulty=standard&generation=29');
    await expect(page.getByText('Ready for your guess.')).toBeVisible();
    const before = await page.evaluate(() => ({
      boardTop: document.querySelector('.game-board-region')?.getBoundingClientRect().top ?? 0,
      keyboardTop: document.querySelector('.keyboard')?.getBoundingClientRect().top ?? 0,
    }));

    await page.keyboard.press('a');
    await expect(page.locator('.board-row.is-draft')).toContainText('A');
    await expect(page.getByText(/saving…|syncing…/i)).toHaveCount(0);
    const after = await page.evaluate(() => ({
      boardTop: document.querySelector('.game-board-region')?.getBoundingClientRect().top ?? 0,
      keyboardTop: document.querySelector('.keyboard')?.getBoundingClientRect().top ?? 0,
    }));
    expect(Math.abs(after.boardTop - before.boardTop)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.keyboardTop - before.keyboardTop)).toBeLessThanOrEqual(1);
    await page.keyboard.press('Backspace');

    await page.keyboard.press('Shift+M');
    await expect(page.getByRole('menu', { name: 'More navigation' })).toBeVisible();
    await expect(page.locator('.board-row.is-draft')).not.toContainText('M');
    await page.keyboard.press('Escape');

    await page.keyboard.press('Shift+1');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#main-content')).toBeFocused();
    await page.keyboard.press('Shift+2');
    await expect(page).toHaveURL(/\/play\/solo$/);
    await page.keyboard.press('Shift+3');
    await expect(page).toHaveURL(/\/calendar$/);
    await page.keyboard.press('Shift+4');
    await expect(page).toHaveURL(/\/combat$/);
    await page.keyboard.press('Shift+5');
    await expect(page).toHaveURL(/\/history$/);

    await page.goto('/auth');
    const email = page.getByLabel('Email');
    await email.focus();
    await page.keyboard.press('Shift+1');
    await expect(page).toHaveURL(/\/auth$/);
  });

  test('keeps three OG and three GO Practice sessions independently resumable', async ({
    page,
  }) => {
    for (const mode of ['og', 'go'] as const) {
      for (let index = 0; index < 3; index += 1) {
        await page.goto('/play/solo');
        await page.getByLabel('Mode', { exact: true }).selectOption(mode);
        await page.getByRole('button', { name: 'START NEW PRACTICE' }).click();
        await expect(
          page.getByRole('heading', { name: new RegExp(`${mode} (puzzle|run)`, 'i') }),
        ).toBeVisible();
      }
    }

    await page.goto('/play/solo');
    // ANNOT-02 replaced the generic `.data-row` presentation with the shared
    // `.responsive-table` primitive, so sessions are addressed as table rows and each
    // field lives in its own cell instead of one concatenated inline run.
    const activeSessions = page.locator('.solo-session-table');
    await expect(activeSessions.locator('tbody tr')).toHaveCount(6);
    const resumeTargets = await activeSessions
      .getByRole('link', { name: 'RESUME' })
      .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
    expect(new Set(resumeTargets)).toHaveProperty('size', 6);

    await page.getByLabel('Mode', { exact: true }).selectOption('og');
    await expect(page.getByRole('button', { name: 'START NEW PRACTICE' })).toBeDisabled();
    await expect(page.getByText(/three active OG Practice games/i)).toBeVisible();
    await activeSessions
      .locator('tbody tr')
      .filter({ has: page.locator('td[data-label="Lane"]', { hasText: 'Practice' }) })
      .filter({ has: page.locator('td[data-label="Mode"]', { hasText: 'OG' }) })
      .first()
      .getByRole('button', { name: 'ABANDON' })
      .click();
    await expect(page.getByRole('button', { name: 'START NEW PRACTICE' })).toBeEnabled();
  });

  test('renders both terminal menu frame edges at mobile widths', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play/solo/practice/og?length=5&difficulty=standard&generation=31');
    await page.getByRole('button', { name: /more navigation/i }).click();
    await expect(page.getByRole('menu', { name: 'More navigation' })).toBeVisible();
    const frame = await page.evaluate(() => {
      const top = document.querySelector('.menu-heading');
      const bottom = document.querySelector('.menu-footer');
      if (!top || !bottom) return null;
      return {
        top: getComputedStyle(top, '::before').borderTopStyle,
        bottom: getComputedStyle(bottom, '::before').borderBottomStyle,
      };
    });
    expect(frame).toEqual({ top: 'solid', bottom: 'solid' });
  });

  test('renders the terminal menu above the game status row on mobile and desktop', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/play/solo/practice/go?length=5&difficulty=standard&count=5&generation=41');
      /*
       * Wait for the play surface before touching anything. `solo-game.tsx` is a client
       * component that renders "Restoring your game…" until it has hydrated and restored
       * the session, so `.game-status` does not exist on first paint. The shell — and
       * therefore the menu — is available immediately, so without this the probe below
       * could open the menu and measure while the route was still restoring, and read a
       * missing status row as a layering failure. Locally that race is always won; on a
       * hosted Preview it is not. Establish both participants before measuring either.
       */
      await expect(page.locator('.game-status')).toBeVisible();
      await page.getByRole('button', { name: /more navigation/i }).click();
      await expect(page.getByRole('menu', { name: 'More navigation' })).toBeVisible();

      /*
       * V7-07. The guarantee under test is that the open menu is never occluded by the
       * play surface. This previously probed the geometric intersection of the menu and
       * the status row and failed outright when there was none, which made it depend on
       * the play column happening to reach the menu's edge of the viewport. Since the
       * play surface became one 44rem column, that intersection no longer exists at
       * desktop widths — the menu opens over empty margin, so there is nothing to
       * occlude it.
       *
       * The probe now always samples the menu's own centre, so the layering assertion
       * holds at every viewport rather than only where the two boxes happen to meet,
       * and the intersection itself is still required at mobile widths, which is where
       * the play surface genuinely does run underneath the menu.
       */
      const overlay = await page.evaluate(() => {
        const menu = document.querySelector<HTMLElement>('#more-navigation');
        const status = document.querySelector<HTMLElement>('.game-status');
        if (!menu || !status) return null;
        const menuBox = menu.getBoundingClientRect();
        const statusBox = status.getBoundingClientRect();
        const left = Math.max(menuBox.left, statusBox.left);
        const right = Math.min(menuBox.right, statusBox.right);
        const top = Math.max(menuBox.top, statusBox.top);
        const bottom = Math.min(menuBox.bottom, statusBox.bottom);
        const intersects = right > left && bottom > top;
        const target = document.elementFromPoint(
          menuBox.left + menuBox.width / 2,
          menuBox.top + menuBox.height / 2,
        );
        return {
          intersects,
          menuOwnsTopLayer: Boolean(target && menu.contains(target)),
          targetClass: target instanceof HTMLElement ? target.className : null,
        };
      });

      expect(
        overlay,
        `${viewport.width}px should render both the menu and the status row`,
      ).not.toBeNull();
      expect(
        overlay?.menuOwnsTopLayer,
        `${viewport.width}px top layer: ${overlay?.targetClass}`,
      ).toBe(true);
      if (viewport.width < 768) {
        expect(overlay?.intersects, `${viewport.width}px should still overlap the status row`).toBe(
          true,
        );
      }
    }
  });

  test('keeps game tools present while sound updates immediately', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play/solo/practice/og?length=5&difficulty=standard&generation=37');
    const disclosure = page.getByRole('button', { name: 'Evidence and game tools' });
    if ((await disclosure.getAttribute('aria-expanded')) === 'false') await disclosure.click();
    const sound = page.getByRole('button', { name: /SOUND (ON|OFF)/i });
    const before = await sound.textContent();
    await sound.click();
    await expect(sound).toHaveText(before?.includes('ON') ? /SOUND OFF/i : /SOUND ON/i);
    await expect(page.getByRole('button', { name: /REVEAL LETTER/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /REMOVE LETTERS/i })).toBeVisible();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  });
});
