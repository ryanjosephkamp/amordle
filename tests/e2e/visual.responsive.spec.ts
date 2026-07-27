import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const widths = [320, 360, 390, 412, 768, 960, 1440, 1920] as const;

test.describe('responsive and alternate presentation evidence', () => {
  test('Home and active gameplay remain contained at every required width', async ({
    page,
  }, testInfo) => {
    for (const width of widths) {
      await page.setViewportSize({ width, height: width <= 412 ? 844 : 1024 });
      for (const [name, route] of [
        ['home', '/'],
        ['solo', '/play/solo/practice/og?length=5&difficulty=standard&generation=31'],
      ] as const) {
        await page.goto(route);
        await expect(page.getByRole('main')).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${name} at ${width}px`).toBeLessThanOrEqual(1);
        await page.screenshot({
          path: testInfo.outputPath(`${name}-${width}.png`),
          animations: 'disabled',
          fullPage: true,
        });
      }
    }
  });

  test('200 percent reflow, reduced motion, and forced colors preserve operation', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await page.setViewportSize({ width: 720, height: 900 });
    await page.goto('/play/solo/practice/og?length=5&difficulty=standard&generation=32');
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await expect(page.getByRole('button', { name: 'Submit guess' })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(
      axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath('solo-200-percent-forced-colors.png'),
      animations: 'disabled',
      fullPage: true,
    });
  });
});
