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
    await page.goto(`${page.url()}&focus=1`);
    await expect(page.locator('.topbar')).toHaveCount(0);
    await expect(page.locator('.board-row.is-draft')).toContainText('A');
    await page.getByRole('link', { name: /Exit focus/i }).click();
    await expect(page.locator('.topbar')).toBeVisible();
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
});
