import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test, type Page, type TestInfo } from '@playwright/test';

const evidenceDirectory = resolve('test-results/visual-review/modular-keyboard-rebuild');

function evidencePath(testInfo: TestInfo, name: string) {
  mkdirSync(evidenceDirectory, { recursive: true });
  return resolve(evidenceDirectory, `${testInfo.project.name}-${name}.png`);
}

async function assertKeyboardReady(page: Page) {
  await expect(page.locator('.route-error')).toHaveCount(0);
  await expect(page.locator('[data-keyboard-theme="thermal-deck-v1"]')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator('[data-keyboard-layout="qwerty-v1"]')).toBeVisible();
  await expect(page.locator('.key')).toHaveCount(28);
}

async function captureViewport(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: evidencePath(testInfo, name), fullPage: false });
}

test('captures the modular thermal-deck keyboard across real route states', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);

  await page.goto('/play/practice/og?length=5');
  await assertKeyboardReady(page);
  await page.locator('.keyboard').scrollIntoViewIfNeeded();
  await captureViewport(page, testInfo, 'solo-neutral');

  const aKey = page.locator('.key[data-key="A"]');
  const aBox = await aKey.boundingBox();
  expect(aBox).not.toBeNull();
  await page.mouse.move(aBox!.x + aBox!.width / 2, aBox!.y + aBox!.height / 2);
  await page.mouse.down();
  await expect(aKey).toHaveAttribute('data-pressed', 'true');
  await captureViewport(page, testInfo, 'solo-pointer-pressed');
  await page.mouse.up();
  await expect(aKey).not.toHaveAttribute('data-pressed');

  await page.goto('/play/practice/og?length=5&focus=1');
  await assertKeyboardReady(page);
  await page.locator('.keyboard').scrollIntoViewIfNeeded();
  await captureViewport(page, testInfo, 'solo-focus');

  // COMBAT keyboard evidence and disabled states are rendered with an injected
  // repository in browser-component tests. Production routes do not expose a
  // proof id or query-string fixture switch.
});

test('keeps keyboard geometry, motion preferences, and forced colors bounded', async ({ page }) => {
  test.setTimeout(60_000);
  for (const width of [320, 360, 390, 412, 768, 960, 1440, 1920]) {
    await page.setViewportSize({ width, height: width <= 412 ? 844 : 1024 });
    await page.goto('/play/practice/og?length=5');
    await assertKeyboardReady(page);
    const geometry = await page.evaluate(() => {
      const keyboard = document.querySelector<HTMLElement>('.keyboard');
      const key = document.querySelector<HTMLElement>('.key[data-key="A"]');
      return {
        documentOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        keyboardOverflow: keyboard ? keyboard.scrollWidth - keyboard.clientWidth : 999,
        keyHeight: key?.getBoundingClientRect().height ?? 0,
      };
    });
    expect(geometry.documentOverflow, `${width}px document overflow`).toBeLessThanOrEqual(1);
    expect(geometry.keyboardOverflow, `${width}px keyboard overflow`).toBeLessThanOrEqual(1);
    expect(geometry.keyHeight, `${width}px key height`).toBeGreaterThanOrEqual(44);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/play/practice/og?length=5');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(page.locator('.key[data-key="ENTER"]')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.key[data-key="A"]')).toBeVisible();
  const reducedMotion = await page
    .locator('[data-effect-surface]')
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        animationName: style.animationName,
        transitionDuration: Number.parseFloat(style.transitionDuration),
      };
    });

  expect(reducedMotion.animationName).toBe('none');
  expect(reducedMotion.transitionDuration).toBeLessThanOrEqual(0.00001);

  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await expect(page.locator('.key[data-key="A"]')).toHaveCSS('forced-color-adjust', 'auto');
});
