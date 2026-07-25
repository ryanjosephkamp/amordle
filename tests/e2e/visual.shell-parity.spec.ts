import { expect, test, type Page } from '@playwright/test';

async function capture(page: Page, path: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, fullPage: true });
}

test('captures Checkpoint 1 Solo, Calendar, Word Explorer, and centered COMBAT evidence', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto('/play/daily/go?length=7&count=10');
  await expect(page).toHaveURL(/\/play\/daily\/go$/);
  await expect(page.getByRole('grid', { name: '5-letter word board' })).toBeVisible({
    timeout: 15_000,
  });
  await capture(page, testInfo.outputPath('daily-go-fixed-five.png'));

  await page.goto('/play/practice/go?length=5&count=5');
  await expect(page.getByRole('grid', { name: '5-letter word board' })).toBeVisible({
    timeout: 15_000,
  });
  const answer = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((candidate) =>
      candidate.startsWith('amordle:solo:practice:go:'),
    );
    if (!key) return '';
    const stored = JSON.parse(localStorage.getItem(key) ?? '{}') as {
      payload?: { answers?: string[] };
    };
    return stored.payload?.answers?.[0] ?? '';
  });
  expect(answer).toMatch(/^[a-z]{5}$/);
  await page.keyboard.type(answer);
  await page.keyboard.press('Enter');
  await expect(page.getByText(/holding solved evidence/i)).toBeVisible();
  await capture(page, testInfo.outputPath('practice-go-solved-hold.png'));
  await expect(page.getByRole('row', { name: /P1 seeded evidence row/ })).toBeVisible({
    timeout: 3_500,
  });
  await capture(page, testInfo.outputPath('practice-go-prior-evidence.png'));

  await page.goto('/calendar');
  await expect(page.getByText('S-OG', { exact: true }).first()).toBeVisible();
  await capture(page, testInfo.outputPath('calendar-readable-lanes.png'));

  await page.goto('/word-explorer');
  await expect(page.locator('.search-metadata')).toContainText(/^\d+ matching valid words/);
  await expect(page.locator('.ruled-list .word-row').first()).toBeVisible();
  await expect(page.locator('.word-actions .button')).toHaveCount(2);
  await page.locator('.word-actions .button').nth(1).scrollIntoViewIfNeeded();
  await expect(page.locator('.word-actions .button').nth(1)).toBeVisible();
  await capture(page, testInfo.outputPath('word-explorer-alignment.png'));

  await page.goto('/combat/lobby');
  await expect(page.getByRole('heading', { name: 'Open public Practice lobbies' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/MAYAR|LEXI_99|proof match/i);
  await capture(page, testInfo.outputPath('combat-real-lobby-surface.png'));
});
