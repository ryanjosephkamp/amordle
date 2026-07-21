import { expect, test } from '@playwright/test';

const visualStates = [
  ['home', '/'],
  ['play', '/play'],
  ['calendar', '/calendar'],
  ['combat-lobby', '/combat/lobby'],
  ['solo-regular', '/play/practice/go'],
  ['solo-focus', '/play/practice/go?focus=1'],
  ['combat-active', '/combat/match/proof'],
  ['combat-live', '/combat/live/proof'],
  ['history', '/history'],
  ['stats', '/stats'],
  ['marketplace', '/marketplace'],
  ['word-explorer', '/word-explorer'],
  ['settings', '/settings'],
  ['help', '/help'],
  ['admin-locked', '/admin'],
  ['combat-result', '/combat/match/proof/result'],
  ['solo-result', '/play/practice/og'],
  ['combat-eight-letter-go', '/combat/match/proof?length=8'],
  ['combat-three-letter-timed', '/combat/match/proof?length=3&timed=1'],
  ['combat-daily-async', '/combat/match/daily-proof'],
  ['combat-timeout', '/combat/match/proof/result?outcome=timeout'],
  ['combat-forfeit', '/combat/match/proof/result?outcome=forfeit'],
  ['combat-cancelled', '/combat/match/proof/result?outcome=cancelled'],
  ['system-recovery', '/route-that-does-not-exist'],
] as const;

for (const [name, route] of visualStates) {
  test(`captures ${name}`, async ({ page }, testInfo) => {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('main > :not(.route-loading)').first()).toBeVisible({
      timeout: 15_000,
    });
    if (name !== 'system-recovery') {
      await expect(page.locator('.route-error')).toHaveCount(0);
    }
    if (name === 'solo-result') {
      await page.getByText('Game controls', { exact: true }).click();
      await page.getByRole('button', { name: 'Give up / reveal answer' }).click();
      await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'No attempts remain' })).toBeVisible();
    }
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  });
}

test('captures local Admin visual-state family without external calls', async ({
  page,
}, testInfo) => {
  for (const state of [
    'denied',
    'anonymous',
    'unconfigured',
    'ready',
    'confirm',
    'inflight',
    'success',
    'failure',
  ]) {
    await page.goto(`/admin?visual=${state}`);
    await expect(page.locator('main')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`admin-${state}.png`), fullPage: true });
  }
});
