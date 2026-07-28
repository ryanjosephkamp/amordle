import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const widths = [320, 360, 390, 412, 768, 960, 1440, 1920] as const;
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
    expected: 'Account service unavailable',
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
        await expect(
          page.getByRole('heading', { name: surface.expected, exact: false }).first(),
        ).toBeVisible();
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
