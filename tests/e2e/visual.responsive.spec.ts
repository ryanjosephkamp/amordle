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

const overflowSurfaces = [
  '/',
  '/play',
  '/play/solo',
  '/calendar',
  '/combat',
  '/combat/practice',
  '/combat/daily',
  '/combat/active',
  '/combat/lobby',
  '/combat/live',
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
  '/about',
  '/auth',
  '/admin',
] as const;

// --- ANNOT-03/04/07/09 + W-8 control contrast sweep -------------------------------
const contrastSchemes = ['light', 'dark'] as const;
// Every accent the token system can resolve. `custom` is driven by JS-injected
// variables that only exist for a signed-in account with an active preset, so the
// named set is the complete signed-out matrix.
const contrastAccents = ['aurora', 'ice', 'cyan', 'violet', 'rose', 'amber'] as const;
// `:active` carries no colour semantics in this design (`button:active` only sets
// `translate`), so forcing it duplicates `rest` and doubles runtime for no signal.
const contrastStates = ['rest', 'hover', 'focus-visible'] as const;
const contrastSurfaces = overflowSurfaces;
const controlSelector = [
  'button',
  '.button',
  '[role="menuitem"]',
  '[aria-pressed]',
  '[aria-current="page"]',
  '.command-row',
  '.route-link',
  '.accent-option',
].join(', ');

interface ControlContrastResult {
  ok: boolean;
  label: string;
  ratio: number;
  required: number;
  color: string;
  background: string;
}

// Runs in the page. Composites alpha and inherited `opacity` (so a disabled control at
// opacity .52 is judged on what a player actually sees) and walks ancestors for the
// first opaque backdrop.
function measureControlContrast(selector: string): ControlContrastResult[] {
  // Computed colours serialize in whatever space the author used (this project is
  // almost entirely `oklch()`), so rasterize through a canvas instead of scraping
  // numbers out of the string.
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const parseCache = new Map<string, [number, number, number, number]>();
  const parse = (value: string): [number, number, number, number] => {
    const cached = parseCache.get(value);
    if (cached) return cached;
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#000';
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const [red = 0, green = 0, blue = 0, alpha = 255] = context.getImageData(0, 0, 1, 1).data;
    const parsed: [number, number, number, number] = [red, green, blue, alpha / 255];
    parseCache.set(value, parsed);
    return parsed;
  };
  const over = (
    top: [number, number, number, number],
    bottom: [number, number, number, number],
  ): [number, number, number, number] => {
    const alpha = top[3] + bottom[3] * (1 - top[3]);
    if (alpha === 0) return [0, 0, 0, 0];
    return [
      (top[0] * top[3] + bottom[0] * bottom[3] * (1 - top[3])) / alpha,
      (top[1] * top[3] + bottom[1] * bottom[3] * (1 - top[3])) / alpha,
      (top[2] * top[3] + bottom[2] * bottom[3] * (1 - top[3])) / alpha,
      alpha,
    ];
  };
  const luminance = ([red, green, blue]: [number, number, number, number]) =>
    [red, green, blue]
      .map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      })
      .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index]!, 0);

  const backdropOf = (element: Element): [number, number, number, number] => {
    const layers: [number, number, number, number][] = [];
    let node: Element | null = element;
    while (node) {
      const colour = parse(getComputedStyle(node).backgroundColor);
      if (colour[3] > 0) layers.push(colour);
      if (colour[3] >= 1) break;
      node = node.parentElement;
    }
    layers.push([255, 255, 255, 1]);
    return layers.reduceRight((bottom, top) => over(top, bottom));
  };

  // Measure the elements that actually paint text — a control plus any descendant that
  // owns a text node — rather than the control box alone. A container with no direct
  // text has no foreground of its own, and ANNOT-09 is specifically about descendant
  // labels re-inheriting the wrong colour.
  const textRuns: Element[] = [];
  for (const control of Array.from(document.querySelectorAll(selector))) {
    const candidates = [control, ...Array.from(control.querySelectorAll('*'))];
    for (const candidate of candidates) {
      const ownsText = Array.from(candidate.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0,
      );
      if (ownsText && !textRuns.includes(candidate)) textRuns.push(candidate);
    }
  }

  const results: ControlContrastResult[] = [];
  for (const element of textRuns) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') continue;

    // Cumulative opacity: a control faded by an ancestor is judged as rendered.
    let opacity = 1;
    for (let node: Element | null = element; node; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity || '1');
    }

    const backdrop = backdropOf(element);
    const raw = parse(style.color);
    const foreground = over([raw[0], raw[1], raw[2], raw[3] * opacity], backdrop);

    const first = luminance(foreground);
    const second = luminance(backdrop);
    const ratio = (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);

    const size = Number.parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    // Disabled controls must stay readable and unmistakably disabled, so they are held
    // to the 3:1 non-text/large-text floor rather than the 4.5:1 body-text floor.
    const disabled =
      (element as HTMLButtonElement).disabled === true ||
      element.getAttribute('aria-disabled') === 'true' ||
      element.closest('[disabled], [aria-disabled="true"]') !== null;
    const required = large || disabled ? 3 : 4.5;

    const label = `${element.tagName.toLowerCase()}${
      element.className && typeof element.className === 'string'
        ? `.${element.className.trim().split(/\s+/).join('.')}`
        : ''
    } "${(element.textContent ?? '').trim().slice(0, 32)}"`;

    results.push({
      ok: ratio >= required,
      label,
      ratio,
      required,
      color: `rgb(${foreground.slice(0, 3).map(Math.round).join(' ')})`,
      background: `rgb(${backdrop.slice(0, 3).map(Math.round).join(' ')})`,
    });
  }
  return results;
}

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
    await expect(page.locator('.app-shell.is-game-surface').first()).toBeVisible();
    await expect(page.locator('.mobile-route-rail')).toBeHidden();
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
    const stableBefore = await page.evaluate(() => ({
      boardTop: document.querySelector('.game-board-region')?.getBoundingClientRect().top ?? 0,
      keyboardTop: document.querySelector('.keyboard')?.getBoundingClientRect().top ?? 0,
    }));
    await page.keyboard.type('guess');
    for (let index = 0; index < 5; index += 1) await page.keyboard.press('Backspace');
    const stableAfter = await page.evaluate(() => ({
      boardTop: document.querySelector('.game-board-region')?.getBoundingClientRect().top ?? 0,
      keyboardTop: document.querySelector('.keyboard')?.getBoundingClientRect().top ?? 0,
    }));
    expect(Math.abs(stableAfter.boardTop - stableBefore.boardTop)).toBeLessThanOrEqual(1);
    expect(Math.abs(stableAfter.keyboardTop - stableBefore.keyboardTop)).toBeLessThanOrEqual(1);
    const keyboardContrast = await page.evaluate(() => {
      const key = document.querySelector<HTMLButtonElement>('button.key.is-unknown');
      if (!key) return null;
      const sample = (css: string) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) return [0, 0, 0] as const;
        context.fillStyle = css;
        context.fillRect(0, 0, 1, 1);
        const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
        return [red, green, blue] as const;
      };
      const luminance = ([red, green, blue]: readonly [number, number, number]) => {
        const channels = [red, green, blue].map((value) => {
          const normalized = value / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return (
          0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
        );
      };
      const contrast = (
        foreground: readonly [number, number, number],
        background: readonly [number, number, number],
      ) => {
        const lighter = Math.max(luminance(foreground), luminance(background));
        const darker = Math.min(luminance(foreground), luminance(background));
        return (lighter + 0.05) / (darker + 0.05);
      };
      const unknownStyle = getComputedStyle(key);
      const unknownBackgroundCss = unknownStyle.backgroundColor;
      const unknownBackground = sample(unknownBackgroundCss);
      const unknownContrast = contrast(sample(unknownStyle.color), unknownBackground);
      key.classList.remove('is-unknown');
      key.classList.add('is-absent');
      const absentStyle = getComputedStyle(key);
      const absentBackgroundCss = absentStyle.backgroundColor;
      const absentBackground = sample(absentBackgroundCss);
      const absentContrast = contrast(sample(absentStyle.color), absentBackground);
      key.classList.remove('is-absent');
      key.classList.add('is-unknown');
      return {
        unknownContrast,
        absentContrast,
        backgroundsDiffer: unknownBackgroundCss !== absentBackgroundCss,
      };
    });
    expect(keyboardContrast).not.toBeNull();
    expect(keyboardContrast!.unknownContrast).toBeGreaterThanOrEqual(4.5);
    expect(keyboardContrast!.absentContrast).toBeGreaterThanOrEqual(4.5);
    expect(keyboardContrast!.backgroundsDiffer).toBe(true);
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

  test('named accents personalize unknown keys and alert counts without changing evidence', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/play/solo/practice/og?length=5&difficulty=standard&generation=82');
    await expect(page.locator('button.key.is-unknown').first()).toBeVisible();

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      let semanticBaseline: Record<string, string> | null = null;
      const unknownBackgrounds = new Set<string>();

      for (const accent of ['ice', 'aurora', 'cyan', 'violet', 'rose', 'amber'] as const) {
        await page.evaluate((nextAccent) => {
          document.documentElement.dataset.accent = nextAccent;
        }, accent);
        await page.waitForTimeout(200);
        const metrics = await page.evaluate(() => {
          const source = document.querySelector<HTMLButtonElement>('button.key.is-unknown');
          if (!source) return null;
          const sample = (css: string): readonly [number, number, number] => {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const context = canvas.getContext('2d');
            if (!context) return [0, 0, 0];
            context.fillStyle = css;
            context.fillRect(0, 0, 1, 1);
            const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
            return [red, green, blue];
          };
          const luminance = ([red, green, blue]: readonly [number, number, number]) =>
            [red, green, blue]
              .map((value) => {
                const normalized = value / 255;
                return normalized <= 0.04045
                  ? normalized / 12.92
                  : ((normalized + 0.055) / 1.055) ** 2.4;
              })
              .reduce(
                (total, channel, index) => total + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0),
                0,
              );
          const contrast = (foreground: string, background: string) => {
            const first = luminance(sample(foreground));
            const second = luminance(sample(background));
            return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
          };
          let attention = document.querySelector<HTMLElement>('[data-test-attention]');
          if (!attention) {
            attention = document.createElement('span');
            attention.dataset.testAttention = 'true';
            attention.className = 'attention-badge';
            attention.textContent = '6';
            document.body.append(attention);
          }
          const keyStyle = getComputedStyle(source);
          const attentionStyle = getComputedStyle(attention);
          const semantic = Object.fromEntries(
            ['is-correct', 'is-present', 'is-absent', 'is-removed'].map((state) => {
              const clone = source.cloneNode(true) as HTMLButtonElement;
              clone.className = `key ${state}`;
              document.body.append(clone);
              const background = getComputedStyle(clone).backgroundColor;
              clone.remove();
              return [state, background];
            }),
          );
          return {
            unknownBackground: keyStyle.backgroundColor,
            unknownContrast: contrast(keyStyle.color, keyStyle.backgroundColor),
            attentionContrast: contrast(attentionStyle.color, attentionStyle.backgroundColor),
            semantic,
          };
        });
        expect(metrics).not.toBeNull();
        expect(metrics!.unknownContrast).toBeGreaterThanOrEqual(4.5);
        expect(metrics!.attentionContrast).toBeGreaterThanOrEqual(4.5);
        unknownBackgrounds.add(metrics!.unknownBackground);
        semanticBaseline ??= metrics!.semantic;
        expect(metrics!.semantic).toEqual(semanticBaseline);
      }
      expect(unknownBackgrounds.size).toBe(6);
    }
  });

  test('desktop frames are balanced while mobile rating buckets remain contained', async ({
    page,
  }) => {
    for (const width of [960, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1024 });
      await page.goto('/profile');
      await expect(page.locator('.route-frame')).toBeVisible();
      const frameGaps = await page.evaluate(() => {
        const frame = document.querySelector('.route-frame')?.getBoundingClientRect();
        if (!frame) return null;
        return { left: frame.left, right: innerWidth - frame.right };
      });
      expect(frameGaps).not.toBeNull();
      expect(Math.abs(frameGaps!.left - frameGaps!.right)).toBeLessThanOrEqual(1);

      await page.goto('/play/solo/practice/og?length=5&difficulty=standard&generation=83');
      await expect(page.locator('.game-layout')).toBeVisible();
      const gameGaps = await page.evaluate(() => {
        const game = document.querySelector('.game-layout')?.getBoundingClientRect();
        if (!game) return null;
        return { left: game.left, right: innerWidth - game.right };
      });
      expect(gameGaps).not.toBeNull();
      expect(Math.abs(gameGaps!.left - gameGaps!.right)).toBeLessThanOrEqual(1);
    }

    for (const width of [320, 360, 390, 412]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/stats');
      const containment = await page.evaluate(() => {
        const fixture = document.createElement('section');
        fixture.className = 'stats-section';
        fixture.innerHTML = `<div class="rating-bucket-grid"><article class="rating-bucket"><header><span>Ranked COMBAT</span><strong>1220</strong></header><dl><div><dt>games</dt><dd>1</dd></div><div><dt>w–l–d</dt><dd>1–0–0</dd></div><div><dt>status</dt><dd>provisional</dd></div><div><dt>updated</dt><dd>7/19/2026</dd></div></dl></article></div>`;
        document.body.append(fixture);
        const bucket = fixture.querySelector('.rating-bucket') as HTMLElement | null;
        const status = bucket?.querySelector('dl > div:nth-child(3) dd') as HTMLElement | null;
        const measurements = {
          documentOverflow: document.documentElement.scrollWidth - innerWidth,
          bucketOverflow: bucket ? bucket.scrollWidth - bucket.clientWidth : 1,
          statusOverflow: status ? status.scrollWidth - status.clientWidth : 1,
        };
        fixture.remove();
        return measurements;
      });
      expect(containment.documentOverflow).toBeLessThanOrEqual(1);
      expect(containment.bucketOverflow).toBeLessThanOrEqual(1);
      expect(containment.statusOverflow).toBeLessThanOrEqual(1);
    }
  });

  test('Solo entry keeps the complete keyboard visible across the play viewport matrix', async ({
    page,
  }, testInfo) => {
    for (const viewport of gameViewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/play/solo/practice/og?length=5&difficulty=standard&generation=113');
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

  test('standard five-letter gameplay uses the approved generous scale and centered axis', async ({
    page,
  }) => {
    for (const viewport of [
      { id: 'desktop', width: 1440, height: 1024, minimum: 58, maximum: 72 },
      { id: 'mobile', width: 390, height: 844, minimum: 46, maximum: 54 },
    ] as const) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(
        `/play/solo/practice/og?length=5&difficulty=standard&generation=${viewport.width}`,
      );
      await expect(page.locator('.board-row.is-draft .tile').first()).toBeVisible();
      const geometry = await page.evaluate(() => {
        const region = document.querySelector('.game-board-region')?.getBoundingClientRect();
        const row = document.querySelector('.board-row.is-draft')?.getBoundingClientRect();
        const tile = document.querySelector('.board-row.is-draft .tile')?.getBoundingClientRect();
        if (!region || !row || !tile) return null;
        return {
          tileWidth: tile.width,
          axisDelta: Math.abs(region.left + region.width / 2 - (row.left + row.width / 2)),
        };
      });
      expect(geometry, viewport.id).not.toBeNull();
      expect(geometry!.tileWidth, viewport.id).toBeGreaterThanOrEqual(viewport.minimum);
      expect(geometry!.tileWidth, viewport.id).toBeLessThanOrEqual(viewport.maximum + 0.5);
      // The mobile history viewport reserves a narrow scrollbar gutter; keep
      // the board visually centered within that usable area.
      expect(geometry!.axisDelta, viewport.id).toBeLessThanOrEqual(3);
    }
  });

  // ANNOT-02: the desktop Active Solo collection must expose each session field as its
  // own aligned column instead of one concatenated inline run, and must still collapse
  // to labelled rows on mobile.
  test('Active Solo presents aligned session fields on desktop and collapses on mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1024 });
    // Two sessions so column alignment is actually observable across rows.
    for (const mode of ['og', 'go'] as const) {
      await page.goto('/play/solo');
      await page.getByLabel('Mode', { exact: true }).selectOption(mode);
      await page.getByRole('button', { name: 'START NEW PRACTICE' }).click();
      await expect(
        page.getByRole('heading', { name: new RegExp(`${mode} (puzzle|run)`, 'i') }),
      ).toBeVisible();
    }
    await page.goto('/play/solo');
    const table = page.locator('.solo-session-table');
    await expect(table).toBeVisible();
    // `th` is `text-transform: lowercase`, and innerText reflects the rendered casing.
    const headers = await table.locator('thead th').allInnerTexts();
    expect(headers.map((header) => header.trim().toLowerCase())).toEqual([
      'lane',
      'mode',
      'setup',
      'progress',
      'actions',
    ]);

    // Every body cell carries the label its mobile presentation needs.
    const labels = await table
      .locator('tbody td')
      .evaluateAll((cells) => cells.map((cell) => cell.getAttribute('data-label')));
    expect(labels.every((label) => label && label.length > 0)).toBe(true);

    // Desktop: cells in a column share a left edge, which the old inline run could not do.
    const columnLefts = await table
      .locator('tbody tr')
      .evaluateAll((rows) =>
        rows.map((row) =>
          Array.from(row.querySelectorAll('td')).map((cell) =>
            Math.round(cell.getBoundingClientRect().left),
          ),
        ),
      );
    if (columnLefts.length > 1) {
      for (let column = 0; column < columnLefts[0]!.length; column += 1) {
        const edges = columnLefts.map((row) => row[column]!);
        expect(new Set(edges).size, `column ${column} left edges ${edges.join(',')}`).toBe(1);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const collapsed = await table
      .locator('tbody td')
      .first()
      .evaluate((cell) => getComputedStyle(cell).display);
    expect(collapsed).toBe('grid');
  });

  // ANNOT-01: status, date, and time must be separable and aligned, never concatenated.
  test('Notification rows separate status, date, and time', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto('/');
    const layout = await page.evaluate(() => {
      const anchor = document.createElement('a');
      anchor.className = 'is-unread';
      anchor.innerHTML =
        '<strong class="notification-status">Match ready</strong>' +
        '<time class="notification-date">8/2/2026</time>' +
        '<time class="notification-time">4:40:46 PM</time>';
      const list = document.createElement('div');
      list.className = 'notification-list';
      const popover = document.createElement('div');
      popover.className = 'menu-popover notification-popover';
      popover.append(list);
      list.append(anchor);
      document.body.append(popover);
      const style = getComputedStyle(anchor);
      const status = anchor.querySelector('.notification-status')!.getBoundingClientRect();
      const date = anchor.querySelector('.notification-date')!.getBoundingClientRect();
      const time = anchor.querySelector('.notification-time')!.getBoundingClientRect();
      const result = {
        display: style.display,
        columns: style.gridTemplateColumns.split(' ').length,
        statusBeforeDate: status.right <= date.left + 1,
        dateBeforeTime: date.right <= time.left + 1,
        tabularTime: getComputedStyle(
          anchor.querySelector('.notification-time')!,
        ).fontVariantNumeric.includes('tabular-nums'),
      };
      popover.remove();
      return result;
    });
    expect(layout.display).toBe('grid');
    expect(layout.columns).toBe(3);
    expect(layout.statusBeforeDate).toBe(true);
    expect(layout.dateBeforeTime).toBe(true);
    expect(layout.tabularTime).toBe(true);
  });

  // ANNOT-05: the Players filter inputs, selects, and Apply action must share one
  // control block-size and one baseline at every width that keeps them on a row.
  test('Players filter controls share one height and baseline', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    for (const width of [1440, 1920, 960] as const) {
      await page.setViewportSize({ width, height: 1024 });
      await page.goto('/players');
      await expect(page.locator('.directory-controls')).toBeVisible();
      const geometry = await page.locator('.directory-controls').evaluate((form) => {
        const controls = Array.from(
          form.querySelectorAll<HTMLElement>('input, select, button, .button'),
        );
        return controls.map((control) => {
          const rect = control.getBoundingClientRect();
          return {
            tag: control.tagName.toLowerCase(),
            height: rect.height,
            top: rect.top,
            bottom: rect.bottom,
          };
        });
      });
      expect(geometry.length).toBe(6);
      const heights = geometry.map((item) => item.height);
      // Sub-pixel layout rounding is acceptable; a different control size is not.
      expect(
        Math.max(...heights) - Math.min(...heights),
        `${width}px heights ${JSON.stringify(geometry)}`,
      ).toBeLessThanOrEqual(1);
      expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
      // Below 63.99rem the filter grid deliberately wraps to two columns, so compare
      // baselines within each rendered row rather than across the whole form.
      const rows = new Map<number, number[]>();
      for (const item of geometry) {
        const key = Math.round(item.top);
        rows.set(key, [...(rows.get(key) ?? []), item.bottom]);
      }
      for (const [top, bottoms] of rows) {
        expect(
          Math.max(...bottoms) - Math.min(...bottoms),
          `${width}px row ${top} baselines ${JSON.stringify(geometry)}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  test('shared form fields remain visibly identifiable without relying on placeholders', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/auth');
    await expect(page.getByLabel('Email')).toBeVisible();
    const fields = await page
      .locator('input[type="email"], input[type="password"]')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            border: style.borderColor,
          };
        }),
      );
    expect(fields).toHaveLength(2);
    for (const field of fields) {
      expect(field.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(field.background).not.toBe('transparent');
      expect(field.border).not.toBe('rgba(0, 0, 0, 0)');
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

  test('standard route surfaces never create horizontal document scrolling', async ({ page }) => {
    test.setTimeout(120_000);
    for (const width of [320, 390, 768, 960] as const) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1024 });
      for (const route of overflowSurfaces) {
        await page.goto(route);
        await expect(page.getByRole('main')).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${route} at ${width}px`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('intermediate desktop widths truncate toolbar context and stack lobby panels before collision', async ({
    page,
  }) => {
    const longMatchId = `amordle-public-practice-v3-${'990e1b31-8dfe-41b2-aaf0-'.repeat(4)}536b28227163`;
    for (const width of [1280, 1024, 853, 768, 640]) {
      await page.setViewportSize({ width, height: 1024 });
      await page.goto(`/combat/match/${longMatchId}`);
      await expect(page.locator('.app-toolbar')).toBeVisible();
      const toolbar = await page.evaluate(() => {
        const context = document.querySelector('.toolbar-context')?.getBoundingClientRect();
        const title = document
          .querySelector('.toolbar-context > span:first-child')
          ?.getBoundingClientRect();
        const tools = document.querySelector('.topbar-tools')?.getBoundingClientRect();
        const titleElement = document.querySelector<HTMLElement>(
          '.toolbar-context > span:first-child',
        );
        if (!context || !title || !tools || !titleElement) return null;
        return {
          contextRight: context.right,
          titleRight: title.right,
          toolsLeft: tools.left,
          titleOverflow: titleElement.scrollWidth - titleElement.clientWidth,
          documentOverflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
      expect(toolbar).not.toBeNull();
      expect(toolbar!.contextRight).toBeLessThanOrEqual(toolbar!.toolsLeft + 1);
      expect(toolbar!.titleRight).toBeLessThanOrEqual(toolbar!.contextRight + 1);
      expect(toolbar!.documentOverflow).toBeLessThanOrEqual(1);

      await page.goto('/combat/lobby');
      await expect(page.locator('.combat-lobby-region--private')).toBeVisible();
      const lobby = await page.evaluate(() => {
        const privateRegion = document.querySelector('.combat-lobby-region--private');
        if (!privateRegion) return null;
        const fixture = document.createElement('div');
        fixture.className = 'split-layout';
        fixture.innerHTML = `
          <section class="form-panel"><div class="field-stack"><label>Public profile ID<input value="player-identifier-that-must-remain-contained" /></label><button>Send private request</button></div></section>
          <section><div class="section-heading"><h2>Request center</h2><button>Refresh</button></div><p>Open match details remain in their own panel.</p></section>`;
        privateRegion.append(fixture);
        const [first, second] = [...fixture.children].map((child) => child.getBoundingClientRect());
        const input = fixture.querySelector('input')?.getBoundingClientRect();
        const result =
          first && second && input
            ? {
                separated:
                  first.right <= second.left + 1 ||
                  second.right <= first.left + 1 ||
                  first.bottom <= second.top + 1 ||
                  second.bottom <= first.top + 1,
                inputContained: input.right <= first.right + 1,
                documentOverflow: document.documentElement.scrollWidth - innerWidth,
              }
            : null;
        fixture.remove();
        return result;
      });
      expect(lobby).not.toBeNull();
      expect(lobby!.separated).toBe(true);
      expect(lobby!.inputContained).toBe(true);
      expect(lobby!.documentOverflow).toBeLessThanOrEqual(1);
    }
  });

  // ANNOT-03/04/07/09 + W-8. The previous version of this test sampled a single hovered
  // `.route-link` on /combat, which is not inside a `.data-row` and therefore could not
  // observe the white-on-white and grey-on-white defects the owner reported. This sweep
  // walks every control on every route, in both schemes, across every accent, in every
  // interaction state. Pseudo-states are forced through CDP rather than by moving the
  // mouse so the whole matrix stays fast and deterministic.
  for (const scheme of contrastSchemes) {
    test(`every control keeps a readable foreground in every state (${scheme})`, async ({
      page,
    }, testInfo) => {
      testInfo.setTimeout(300_000);
      await page.setViewportSize({ width: 1440, height: 1024 });
      await page.emulateMedia({ colorScheme: scheme });
      const client = await page.context().newCDPSession(page);
      await client.send('DOM.enable');
      await client.send('CSS.enable');

      const failures: string[] = [];
      for (const route of contrastSurfaces) {
        for (const accent of contrastAccents) {
          await page.goto(route);
          await page.evaluate((name) => {
            document.documentElement.dataset.accent = name;
          }, accent);
          // Controls transition `background-color`/`color` over 160ms. Forcing a
          // pseudo-state and reading immediately samples the animation mid-flight and
          // reports a colour no player ever sees, so settle to end-state values.
          await page.addStyleTag({
            content:
              '*, *::before, *::after { transition: none !important; animation: none !important; }',
          });
          // Resolve node ids exactly once per page state. Re-running DOM.getDocument
          // reassigns ids and orphans previously forced pseudo-states, which silently
          // accumulates (every later pass then measures a stuck `:hover`).
          const { root } = await client.send('DOM.getDocument', { depth: -1 });
          const { nodeIds } = await client.send('DOM.querySelectorAll', {
            nodeId: root.nodeId,
            selector: controlSelector,
          });
          for (const state of contrastStates) {
            for (const nodeId of nodeIds) {
              await client
                .send('CSS.forcePseudoState', {
                  nodeId,
                  forcedPseudoClasses: state === 'rest' ? [] : [state],
                })
                .catch(() => undefined);
            }
            const results = await page.evaluate(measureControlContrast, controlSelector);
            for (const result of results) {
              if (result.ok) continue;
              failures.push(
                `${route} · ${scheme} · ${accent} · ${state} · ${result.label} — ` +
                  `${result.ratio.toFixed(2)}:1 (needs ${result.required}:1) ` +
                  `fg ${result.color} on bg ${result.background}`,
              );
            }
          }
        }
      }
      expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
    });
  }

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
