import { expect, test } from '@playwright/test';

test.describe('core browser coverage', () => {
  test('loads Home, Solo, authentication, multiplayer recovery, and spectation surfaces', async ({
    page,
  }) => {
    const routes: Array<[string, RegExp]> = [
      ['/', /choose your next game/i],
      ['/play/solo', /solo setup/i],
      ['/auth', /account/i],
      ['/combat/active', /active combat/i],
      ['/combat/live', /live/i],
      ['/combat/match/not-a-real-match', /sign in|unavailable|match/i],
    ];
    for (const [route, text] of routes) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBeLessThan(500);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.locator('body')).toContainText(text);
    }
  });

  test('plays and restores a real five-letter Solo Practice game', async ({ page }) => {
    await page.goto('/play/solo/practice/og?length=5&difficulty=standard&generation=0');
    await expect(page.getByRole('heading', { name: /OG puzzle/i })).toBeVisible();
    await page.getByRole('button', { name: /Sound on/i }).click();

    const answer = await page.evaluate(async () => {
      const response = await fetch(
        '/play/solo/practice/og?length=5&difficulty=standard&generation=0',
        { headers: { RSC: '1' } },
      );
      const body = await response.text();
      const words = [...body.matchAll(/"answers":\["([a-z]{5})"/g)];
      return words.at(-1)?.[1] ?? null;
    });
    // Local fixture authority may derive Solo answers. Hosted multiplayer
    // scenarios never use browser projections or logs as an answer source.
    expect(answer).toMatch(/^[a-z]{5}$/);
    await page.keyboard.type(answer as string);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'You solved it' })).toBeVisible();
    await expect(page.getByText(/local save ok|cloud retry needed/i)).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('heading', { name: 'You solved it' })).toBeVisible();
    await expect(
      page.getByRole('row', { name: new RegExp(`Accepted guess: ${answer as string}`, 'i') }),
    ).toBeVisible();
  });
});
