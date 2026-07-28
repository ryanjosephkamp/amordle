import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const widths = [320, 360, 390, 412, 768, 960, 1440, 1920] as const;
const gameViewports = [
  { id: '320x568-portrait', width: 320, height: 568 },
  { id: '360x640-portrait', width: 360, height: 640 },
  { id: '390x667-portrait', width: 390, height: 667 },
  { id: '390x844-portrait', width: 390, height: 844 },
  { id: '412x915-portrait', width: 412, height: 915 },
  { id: '568x320-landscape', width: 568, height: 320 },
  { id: '667x390-landscape', width: 667, height: 390 },
  { id: '844x390-landscape', width: 844, height: 390 },
] as const;
const professionalSurfaces = [
  {
    id: 'shell-home',
    route: '/',
    expected: 'Choose your next game',
  },
  {
    id: 'solo',
    route: '/play/solo/practice/og?length=5&difficulty=standard&generation=41',
    expected: 'OG PUZZLE',
  },
  {
    id: 'daily-economy',
    route: '/calendar',
    expected: 'Calendar',
  },
  {
    id: 'combat',
    route: '/combat',
    expected: 'COMBAT',
  },
  {
    id: 'account-data',
    route: '/stats',
    expected: 'Your stats',
  },
  {
    id: 'words-support',
    route: '/words?length=5&q=cr&sort=az',
    expected: 'Word Explorer',
  },
  {
    id: 'exceptional-states',
    route: '/history',
    expected: /account service unavailable|sign in required/i,
  },
] as const;

const professionalVariants = [
  {
    id: '1440x1024-light',
    width: 1440,
    height: 1024,
    colorScheme: 'light' as const,
    forcedColors: 'none' as const,
    reducedMotion: 'no-preference' as const,
    zoom: 1,
  },
  {
    id: '1440x1024-dark',
    width: 1440,
    height: 1024,
    colorScheme: 'dark' as const,
    forcedColors: 'none' as const,
    reducedMotion: 'no-preference' as const,
    zoom: 1,
  },
  {
    id: '390x844-mobile',
    width: 390,
    height: 844,
    colorScheme: 'light' as const,
    forcedColors: 'none' as const,
    reducedMotion: 'no-preference' as const,
    zoom: 1,
  },
  {
    id: '320x844-stress',
    width: 320,
    height: 844,
    colorScheme: 'dark' as const,
    forcedColors: 'none' as const,
    reducedMotion: 'reduce' as const,
    zoom: 1,
  },
  {
    id: '200-percent-forced-colors',
    width: 720,
    height: 900,
    colorScheme: 'light' as const,
    forcedColors: 'active' as const,
    reducedMotion: 'reduce' as const,
    zoom: 2,
  },
] as const;

test.describe('responsive and alternate presentation evidence', () => {
  test('Quiet System Shell remains structural and gameplay-first', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('.app-shell')).toBeVisible();
    await expect(page.locator('.app-toolbar')).toContainText('amordle');
    await expect(page.locator('.toolbar-context')).toContainText('amordle / home');
    await expect(page.locator('.traffic-lights')).toHaveCount(0);
    await expect(page.locator('.terminal-titlebar')).toHaveCount(0);
    await expect(page.locator('.command-row.is-primary')).toContainText('solo practice');
    await expect(page.locator('.workbench-region-footer')).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('quiet-system-home-1440x1024-dark.png'),
      animations: 'disabled',
      fullPage: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/play/solo/practice/og?length=5&difficulty=standard&generation=45');
    await expect(page.locator('.app-shell.is-game-surface')).toBeVisible();
    await expect(page.locator('.mobile-route-rail')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /more navigation/i })).toBeVisible();
    await expect(page.locator('.board-row-number').first()).toHaveText('01');
    await expect(page.locator('.board-row.is-draft .tile').first()).toBeVisible();
    const playFit = await page.evaluate(() => {
      const keyboard = document.querySelector('.keyboard')?.getBoundingClientRect();
      const board = document.querySelector('.game-board-region')?.getBoundingClientRect();
      if (!keyboard || !board) return null;
      return {
        keyboardBottom: keyboard.bottom,
        boardTop: board.top,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: window.innerHeight,
      };
    });
    expect(playFit).not.toBeNull();
    expect(playFit!.keyboardBottom).toBeLessThanOrEqual(playFit!.viewportHeight + 1);
    expect(playFit!.boardTop).toBeGreaterThan(0);
    expect(playFit!.documentHeight).toBeLessThanOrEqual(playFit!.viewportHeight + 1);
    await page.screenshot({
      path: testInfo.outputPath('quiet-system-solo-390x844-light.png'),
      animations: 'disabled',
      fullPage: false,
    });
    await page.goto('/play/solo/practice/og?length=5&difficulty=standard&generation=45&focus=1');
    await expect(page.locator('.global-chrome')).toHaveCount(0);
    const focusFit = await page.evaluate(() => ({
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      keyboardBottom: document.querySelector('.keyboard')?.getBoundingClientRect().bottom ?? 0,
    }));
    expect(focusFit.documentHeight).toBeLessThanOrEqual(focusFit.viewportHeight + 1);
    expect(focusFit.keyboardBottom).toBeLessThanOrEqual(focusFit.viewportHeight + 1);
  });

  test('Solo entry keeps the complete keyboard visible across the play viewport matrix', async ({
    page,
  }, testInfo) => {
    for (const viewport of gameViewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(
        `/play/solo/practice/og?length=5&difficulty=standard&generation=${viewport.width + viewport.height}`,
      );
      await expect(page.getByRole('heading', { name: /OG puzzle/i })).toBeVisible();
      const fit = await page.evaluate(() => {
        const keyboard = document.querySelector('.keyboard')?.getBoundingClientRect();
        const boardViewport = document
          .querySelector('.game-history-viewport')
          ?.getBoundingClientRect();
        const boardRows = document.querySelectorAll('.board-entry');
        const firstRow = boardRows.item(0).getBoundingClientRect();
        const lastRow = boardRows.item(boardRows.length - 1).getBoundingClientRect();
        const layout = document.querySelector('.game-layout')?.getBoundingClientRect();
        const keyboardRow = document.querySelector('.keyboard-row')?.getBoundingClientRect();
        if (!keyboard || !boardViewport || !boardRows.length) return null;
        return {
          layoutWidth: layout?.width ?? 0,
          keyboardTop: keyboard.top,
          keyboardBottom: keyboard.bottom,
          keyboardLeft: keyboard.left,
          keyboardRight: keyboard.right,
          keyboardWidth: keyboard.width,
          keyboardRowWidth: keyboardRow?.width ?? 0,
          keyboardMaxWidth: getComputedStyle(document.querySelector('.keyboard') as Element)
            .maxWidth,
          boardTop: boardViewport.top,
          boardBottom: boardViewport.bottom,
          boardRight: boardViewport.right,
          firstRowTop: firstRow.top,
          lastRowBottom: lastRow.bottom,
          documentHeight: document.documentElement.scrollHeight,
          viewportHeight: window.innerHeight,
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(fit, viewport.id).not.toBeNull();
      if (viewport.width > viewport.height) {
        expect(fit!.keyboardLeft, viewport.id).toBeGreaterThanOrEqual(fit!.boardRight - 1);
      } else {
        expect(fit!.keyboardTop, viewport.id).toBeGreaterThan(fit!.boardTop);
      }
      expect(fit!.keyboardBottom, viewport.id).toBeLessThanOrEqual(fit!.viewportHeight + 1);
      expect(fit!.keyboardLeft, viewport.id).toBeGreaterThanOrEqual(-1);
      expect(fit!.keyboardRight, `${viewport.id}: ${JSON.stringify(fit)}`).toBeLessThanOrEqual(
        viewport.width + 1,
      );
      expect(fit!.firstRowTop, viewport.id).toBeGreaterThanOrEqual(fit!.boardTop - 1);
      expect(fit!.lastRowBottom, viewport.id).toBeLessThanOrEqual(fit!.boardBottom + 1);
      expect(fit!.documentHeight, viewport.id).toBeLessThanOrEqual(fit!.viewportHeight + 1);
      expect(fit!.overflowX, viewport.id).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: testInfo.outputPath(`solo-entry-${viewport.id}.png`),
        animations: 'disabled',
        fullPage: false,
      });
    }
  });

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
    await expect(page.getByRole('button', { name: /submit/i })).toBeVisible();
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

  test('professional surface fidelity matrix preserves hierarchy and reflow', async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    for (const surface of professionalSurfaces) {
      for (const variant of professionalVariants) {
        await page.setViewportSize({ width: variant.width, height: variant.height });
        await page.emulateMedia({
          colorScheme: variant.colorScheme,
          forcedColors: variant.forcedColors,
          reducedMotion: variant.reducedMotion,
        });
        await page.goto(surface.route);
        await page.evaluate((zoom) => {
          document.documentElement.style.zoom = String(zoom);
        }, variant.zoom);
        await expect(page.getByRole('main')).toBeVisible();
        await expect(page.getByRole('heading', { name: surface.expected }).first()).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${surface.id} at ${variant.id}`).toBeLessThanOrEqual(1);
        await page.screenshot({
          path: testInfo.outputPath(`${surface.id}-${variant.id}.png`),
          animations: 'disabled',
          fullPage: true,
        });
      }
    }
  });

  test('mobile Preview vitals stay inside the interaction and stability budgets', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.addScriptTag({
      path: path.resolve('node_modules/web-vitals/dist/web-vitals.iife.js'),
    });
    await page.evaluate(() => {
      const state = window as typeof window & {
        __amordleVitals?: Record<string, number>;
        webVitals: {
          onCLS(callback: (metric: { value: number }) => void, options: object): void;
          onINP(callback: (metric: { value: number }) => void, options: object): void;
          onLCP(callback: (metric: { value: number }) => void, options: object): void;
        };
      };
      state.__amordleVitals = { CLS: 0 };
      const record = (name: string) => (metric: { value: number }) => {
        state.__amordleVitals![name] = metric.value;
      };
      state.webVitals.onCLS(record('CLS'), { reportAllChanges: true });
      state.webVitals.onINP(record('INP'), { reportAllChanges: true });
      state.webVitals.onLCP(record('LCP'), { reportAllChanges: true });
    });
    await page.getByRole('button', { name: /more/i }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /more/i }).click();
    await page.waitForTimeout(1_000);
    const metrics = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __amordleVitals?: Record<string, number>;
          }
        ).__amordleVitals ?? {},
    );
    expect(metrics.LCP, 'LCP was not observed').toBeDefined();
    expect(metrics.INP, 'INP was not observed').toBeDefined();
    expect(metrics.LCP).toBeLessThanOrEqual(2_500);
    expect(metrics.INP).toBeLessThanOrEqual(200);
    expect(metrics.CLS).toBeLessThanOrEqual(0.1);
    const metricsPath = testInfo.outputPath('mobile-web-vitals.json');
    await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
    await testInfo.attach('mobile-web-vitals.json', {
      path: metricsPath,
      contentType: 'application/json',
    });
  });
});
