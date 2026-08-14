import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { accentCssVariableMap } from '../../src/domain/profile';

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
/*
 * B2. `custom` is not out of reach after all — ProfileAccentBridge only sets
 * `data-accent` and the fourteen `--custom-*` variables, both of which a page script can
 * do. These hexes are chosen to straddle bestForeground's ink flip at luminance 0.1842
 * and to push the accent-soft surface to both extremes in each scheme; #32BFA2 is the
 * app's own default preview colour, which measured 4.29:1 on the unread row before B2.
 */
const contrastCustomHexes = [
  '#767676',
  '#0B1F3A',
  '#B4004E',
  '#FFE066',
  '#32BFA2',
  '#FFFFFF',
] as const;
// Accent-backed *surfaces*, not controls — which is why controlSelector never saw them.
const accentSurfaceSelector = [
  '.badge',
  '.attention-badge',
  '.notification-list a.is-unread',
  /*
   * v8-B3. The selected filter chip is `--ink` on `--accent-soft` with an
   * `--accent-text` count riding it. That is the exact pairing that measured 1.31:1
   * under a custom accent in v7.4, so it goes through the named-and-custom sweep
   * rather than being reasoned about.
   */
  '.notification-filters button',
  /*
   * v8-B2. Not accent-backed, but it belongs to this probe rather than the control
   * sweep for the same reason the chips do: it only exists while a ranked search is
   * running, so the sweep that walks a real page can never reach it. Its controls
   * declare their own rest surface, which is precisely the shape that loses its ink to
   * `button:hover` if the hover surface is not declared with it.
   */
  '.ranked-search-status a',
  '.ranked-search-status button',
].join(', ');
/*
 * W3. Three separate defects now — the alerts badge, the notification row, and the
 * profile custom-accent card — have been the same thing: secondary text keeping
 * `--muted` after its surface flipped to the light/inverse `--terminal-selected`
 * treatment. Patching the third would have guaranteed a fourth, so this sweeps the
 * family instead of the instance.
 *
 * It exists as its own probe because the control sweep cannot reach these, for three
 * independent reasons that each had to be closed:
 *   1. `.custom-accent-option` is a <div>. It matches nothing in `controlSelector`, and
 *      note that `.accent-option` does NOT match it — class matching is exact.
 *   2. The defect needs `input:checked`. `contrastStates` forces rest/hover/focus-visible
 *      and nothing else, and `:checked` is real DOM state that cannot be forced by CDP
 *      at all. Here the inputs are simply mounted checked.
 *   3. `/profile` IS swept, but signed out, where ProfileEditor short-circuits to a
 *      skeleton and the accent fieldset never mounts.
 */
const selectedSurfaceSelector = [
  '.custom-accent-option',
  '.accent-option',
  '.route-link',
  '.word-list button',
  'button.calendar-day',
  '.segmented button',
  '.combat-wait-state',
  '.confirmation-panel',
].join(', ');
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
  /*
   * W3. `::before` and `::after` paint real, visible words in this design — the `›` on
   * every route link, the `●` unread marker, the `[` `]` brackets on tool buttons, the
   * DATE/GAME/RESULT labels on the mobile history card. All of them carry their own
   * `color`, and none of them was ever measured, because `getComputedStyle(el)` does not
   * see a pseudo-element. Two of the surfaces repaired in this pass are pseudo-elements
   * sitting at 1.32:1, so this is not hypothetical.
   */
  const textRuns: Array<{ element: Element; pseudo: string | null }> = [];
  const seen = new Set<string>();
  for (const control of Array.from(document.querySelectorAll(selector))) {
    const candidates = [control, ...Array.from(control.querySelectorAll('*'))];
    for (const candidate of candidates) {
      const ownsText = Array.from(candidate.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0,
      );
      const key = (suffix: string) => {
        const index = Array.from(document.querySelectorAll('*')).indexOf(candidate);
        return `${index}${suffix}`;
      };
      if (ownsText && !seen.has(key(''))) {
        seen.add(key(''));
        textRuns.push({ element: candidate, pseudo: null });
      }
      for (const pseudo of ['::before', '::after']) {
        const content = getComputedStyle(candidate, pseudo).content;
        // `none` means no box; `normal` is what a non-generating element reports. An
        // empty or whitespace-only string paints nothing and has no foreground to judge.
        if (!content || content === 'none' || content === 'normal') continue;
        if (!/[^\s"']/.test(content.replace(/^"|"$/g, ''))) continue;
        if (seen.has(key(pseudo))) continue;
        seen.add(key(pseudo));
        textRuns.push({ element: candidate, pseudo });
      }
    }
  }

  const results: ControlContrastResult[] = [];
  for (const { element, pseudo } of textRuns) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const style = getComputedStyle(element, pseudo);
    if (style.visibility === 'hidden' || style.display === 'none') continue;

    // Cumulative opacity: a control faded by an ancestor is judged as rendered.
    let opacity = 1;
    for (let node: Element | null = element; node; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity || '1');
    }

    // A pseudo-element paints over its originating element's backdrop, plus whatever
    // background the pseudo sets for itself.
    const elementBackdrop = backdropOf(element);
    const pseudoBackground = pseudo ? parse(style.backgroundColor) : null;
    const backdrop =
      pseudoBackground && pseudoBackground[3] > 0
        ? over(pseudoBackground, elementBackdrop)
        : elementBackdrop;
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
    /*
     * A pseudo-element whose whole content is a single non-alphanumeric glyph — `›`, `●`,
     * `▸`, the `[` `]` around tool labels — is a graphical marker, not prose, and WCAG
     * scores those against the 3:1 non-text floor. Anything containing a letter or a
     * digit is real content and stays at 4.5:1: `.responsive-table td::before` carries
     * the words DATE and RESULT, and `.evidence-legend::before` carries "evidence".
     *
     * This is a category, not an exemption. The `›` on a hovered route link measured
     * 1.01:1 and is repaired; it would fail either floor.
     */
    const pseudoText = pseudo ? style.content.replace(/^"|"$/g, '').trim() : '';
    const marker = pseudo !== null && pseudoText.length <= 2 && !/[\p{L}\p{N}]/u.test(pseudoText);
    const required = large || disabled || marker ? 3 : 4.5;

    const label = `${element.tagName.toLowerCase()}${
      element.className && typeof element.className === 'string'
        ? `.${element.className.trim().split(/\s+/).join('.')}`
        : ''
    }${pseudo ?? ''} "${(pseudo ? style.content.replace(/^"|"$/g, '') : (element.textContent ?? ''))
      .trim()
      .slice(0, 32)}"`;

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

  // ANNOT-06: no Stats section may strand unexplained width. `.rating-bucket-grid` sat
  // in one of four `.stats-metrics` columns, leaving three empty — the blank area the
  // owner marked in SS-06.
  test('Stats sections claim their full row width', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.goto('/stats');
    const stranded = await page.evaluate(() => {
      const findings: string[] = [];
      for (const section of Array.from(document.querySelectorAll('.stats-metrics'))) {
        const row = section.getBoundingClientRect();
        for (const child of Array.from(section.children)) {
          const style = getComputedStyle(child);
          // A full-bleed child must span every column; a metric tile legitimately does
          // not, so only elements that already declare `grid-column: 1 / -1` are held
          // to full width.
          if (!style.gridColumnStart.includes('1') || !style.gridColumnEnd.includes('-1')) continue;
          const box = child.getBoundingClientRect();
          if (box.width === 0) continue;
          if (row.width - box.width > 2) {
            findings.push(
              `${child.className || child.tagName} spans ${Math.round(box.width)} of ${Math.round(row.width)}`,
            );
          }
        }
      }
      return findings;
    });
    expect(stranded, `\n${stranded.join('\n')}\n`).toEqual([]);

    // The section exists and is full-bleed even when signed out shows a gate.
    const ratingGridColumn = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'rating-bucket-grid';
      const host = document.createElement('div');
      host.className = 'stats-metrics';
      host.append(probe);
      document.body.append(host);
      const value = getComputedStyle(probe).gridColumn;
      host.remove();
      return value;
    });
    expect(ratingGridColumn).toContain('1 / -1');
  });

  /*
   * W6. The two figures added to Stats. `/stats` is behind the account gate, so like the
   * rating grid above they are asserted through a probe carrying the real markup.
   *
   * The obligations checked here are the ones this page already imposes on every visual:
   * full-bleed rather than stranded in one grid column, no horizontal overflow at the
   * narrowest supported width, and a dash pattern on the second line so the pair stays
   * separable when forced colours collapse the palette.
   */
  test('the new Stats figures are full-bleed, contained, and separable without colour', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/stats');
    const probe = await page.evaluate(() => {
      const host = document.createElement('div');
      host.className = 'stats-metrics';
      host.innerHTML =
        '<figure class="stats-visual stats-result-timeline">' +
        '<figcaption>Games per day</figcaption>' +
        '<svg class="trajectory-chart" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="probe">' +
        '<polyline class="trajectory-line" points="0,10 50,4 100,20"></polyline>' +
        '<polyline class="timeline-wins" points="0,20 50,12 100,28"></polyline>' +
        '</svg>' +
        '<ol class="trajectory-values"><li><time datetime="2026-08-08">8/8/2026</time>' +
        '<span>3 games</span><strong>2 won</strong></li></ol></figure>' +
        '<figure class="stats-visual stats-comparison">' +
        '<figcaption>Win rate by difficulty</figcaption>' +
        '<div class="comparison-row" tabindex="0" aria-label="probe">' +
        '<span>standard</span><span class="comparison-track"><span style="width:40%"></span></span>' +
        '<strong>40%</strong></div></figure>';
      document.body.append(host);
      const row = host.getBoundingClientRect();
      const read = (selector: string) => {
        const element = host.querySelector(selector)!;
        const box = element.getBoundingClientRect();
        return { gridColumn: getComputedStyle(element).gridColumn, width: Math.round(box.width) };
      };
      const wins = getComputedStyle(host.querySelector('.timeline-wins')!);
      const games = getComputedStyle(host.querySelector('.trajectory-line')!);
      const result = {
        rowWidth: Math.round(row.width),
        timeline: read('.stats-result-timeline'),
        difficulty: read('.stats-comparison'),
        winsDash: wins.strokeDasharray,
        gamesDash: games.strokeDasharray,
        winsStroke: wins.stroke,
        gamesStroke: games.stroke,
        documentOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
      host.remove();
      return result;
    });

    for (const figure of [probe.timeline, probe.difficulty]) {
      expect(figure.gridColumn, 'Stats visuals must span the full row').toContain('1 / -1');
      expect(probe.rowWidth - figure.width).toBeLessThanOrEqual(2);
    }
    expect(probe.documentOverflow, 'no horizontal scrolling at 320px').toBeLessThanOrEqual(1);
    // Colour alone must not be what separates the two lines.
    expect(probe.winsDash).not.toBe(probe.gamesDash);
    expect(probe.winsStroke).not.toBe(probe.gamesStroke);
  });

  // ANNOT-11: the account trigger carries identity while staying bounded, so the
  // toolbar cannot grow, collide, or overflow at any supported width or zoom.
  test('Account trigger shows guest and stays bounded in the toolbar', async ({ page }) => {
    for (const width of [320, 360, 412, 768, 1440, 1920] as const) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      const trigger = page.locator('.account-menu > a, .account-menu > button').first();
      await expect(trigger).toBeVisible();
      expect((await trigger.innerText()).trim().toLowerCase()).toBe('guest');
      expect(await trigger.getAttribute('aria-label')).toMatch(/sign in/i);

      const containment = await page.evaluate(() => {
        const toolbar = document.querySelector('.app-toolbar')!.getBoundingClientRect();
        const account = document
          .querySelector('.account-menu > a, .account-menu > button')!
          .getBoundingClientRect();
        return {
          overflowsToolbar: account.right > toolbar.right + 1,
          documentOverflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(containment.overflowsToolbar, `${width}px toolbar containment`).toBe(false);
      expect(containment.documentOverflow, `${width}px document overflow`).toBeLessThanOrEqual(1);
    }

    // A long label must ellipsize rather than push the toolbar wider.
    await page.setViewportSize({ width: 320, height: 844 });
    const bounded = await page.evaluate(() => {
      const label = document.querySelector<HTMLElement>('.account-label')!;
      label.textContent = 'anextremelylongplayername';
      const style = getComputedStyle(label);
      return {
        clipped: label.scrollWidth > label.clientWidth,
        textOverflow: style.textOverflow,
        documentOverflow:
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(bounded.clipped).toBe(true);
    expect(bounded.textOverflow).toBe('ellipsis');
    expect(bounded.documentOverflow).toBeLessThanOrEqual(1);
  });

  // ANNOT-08: modal dialogs are centered and dismissible from the backdrop. Tailwind's
  // preflight zeroes `margin` on `*`, cancelling the `margin: auto` the UA
  // `dialog:modal` rule relies on, which is why the account dialogs pinned to the
  // top-left corner in SS-08. `.app-modal` is the single geometry authority now.
  test('modal dialogs are centered and dismiss from the backdrop', async ({ page }) => {
    for (const width of [1440, 768, 390] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/words?length=5&q=cr&sort=az');
      await page.locator('.word-list button').first().click();
      const dialog = page.locator('dialog.app-modal');
      await expect(dialog).toBeVisible();
      const box = await dialog.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        };
      });
      expect(box.left, `${width}px left gutter`).toBeGreaterThan(0);
      expect(box.top, `${width}px top gutter`).toBeGreaterThan(0);
      expect(
        Math.abs(box.left - (box.viewportWidth - box.right)),
        `${width}px horizontal centering`,
      ).toBeLessThanOrEqual(2);
      expect(
        Math.abs(box.top - (box.viewportHeight - box.bottom)),
        `${width}px vertical centering`,
      ).toBeLessThanOrEqual(2);

      // Background scroll is locked while a modal is open. The lock is applied and
      // released by a React effect, so poll instead of sampling a single frame.
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
        .toBe('hidden');

      // Click the vertical gutter above the dialog — the widest backdrop region at
      // every tested width, so the target never becomes marginal on narrow viewports.
      await page.mouse.click(box.viewportWidth / 2, Math.max(2, box.top / 2));
      await expect(dialog).toBeHidden();
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
        .not.toBe('hidden');
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

  /*
   * ANNOT-01 + B3 + v8-A3 + v8-A3-redux. Nothing in a notification row may overlap
   * anything else in it, in any engine, at any width.
   *
   * The history matters, because it is why this test is shaped the way it is. The row
   * began as auto-placed grid children with an implicit second row and a baseline group
   * spanning both — the construct where Gecko and Blink diverge — and on Firefox for
   * Android the title painted over the date. The original test could not have caught it:
   * it ran at 1440 only, and the `visual` project drives Chromium alone.
   *
   * v8-A3 fixed the placement and added Firefox and WebKit runs. v8-A3-redux went
   * further after the owner reported the overlap STILL present on their phone: the row
   * is now a column of block-level lines, each a single flex line, because block boxes
   * in normal flow cannot overlap and a flex line cannot spill onto the one above it.
   *
   * So this asserts two things. Geometry — no pair of pieces intersects, at every
   * viewport the suite cares about, in all three engines. And structure — the row is a
   * column, its lines are stacked, and no line wraps, because a wrapped line is the last
   * place this class of defect could return. Everything under @crossbrowser must stay
   * free of CDP, which is Chromium-only.
   */
  test('Notification rows never overlap and never wrap, in any engine @crossbrowser', async ({
    page,
  }) => {
    await page.goto('/');
    const failures: string[] = [];
    for (const viewport of [{ id: '1440x1024', width: 1440, height: 1024 }, ...gameViewports]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const shape of ['bare', 'rich'] as const) {
        const layout = await page.evaluate((rowShape) => {
          const anchor = document.createElement('a');
          anchor.className = 'is-unread';
          anchor.href = '#';
          anchor.innerHTML =
            '<span class="notification-head">' +
            '<strong class="notification-status">Your turn in Ranked Practice</strong>' +
            '<span class="notification-stamp">' +
            '<time class="notification-date">8/9/26</time>' +
            '<time class="notification-time">11:47:03 AM</time>' +
            '</span></span>' +
            (rowShape === 'rich'
              ? '<span class="notification-summary">' +
                '<span class="notification-detail">Nova · Ranked · OG · 5 letters</span>' +
                '<span class="notification-board" style="--snapshot-columns:5">' +
                '<span class="notification-board-row">' +
                '<span class="notification-board-tile is-absent"></span>'.repeat(5) +
                '</span></span></span>'
              : '');
          const list = document.createElement('div');
          list.className = 'notification-list';
          const popover = document.createElement('div');
          popover.className = 'menu-popover notification-popover';
          popover.style.opacity = '1';
          popover.style.animation = 'none';
          popover.append(list);
          list.append(anchor);
          document.body.append(popover);

          const rect = (selector: string) => {
            const node = anchor.querySelector(selector);
            return node ? (node.getBoundingClientRect().toJSON() as DOMRect) : null;
          };
          const pieces: Array<[string, DOMRect | null]> = [
            ['status', rect('.notification-status')],
            ['date', rect('.notification-date')],
            ['time', rect('.notification-time')],
            ['detail', rect('.notification-detail')],
            ['board', rect('.notification-board')],
          ];
          const overlap = (a: DOMRect, b: DOMRect) =>
            Math.round(
              Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
                Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)),
            );
          const collisions: string[] = [];
          for (let i = 0; i < pieces.length; i += 1) {
            for (let j = i + 1; j < pieces.length; j += 1) {
              const [aName, a] = pieces[i]!;
              const [bName, b] = pieces[j]!;
              if (!a || !b) continue;
              const area = overlap(a, b);
              if (area > 0) collisions.push(`${aName}/${bName} ${area}px²`);
            }
          }

          const head = anchor.querySelector('.notification-head')!;
          const summary = anchor.querySelector('.notification-summary');
          const headRect = head.getBoundingClientRect();
          const summaryRect = summary?.getBoundingClientRect() ?? null;
          const anchorStyle = getComputedStyle(anchor);
          const headStyle = getComputedStyle(head);
          const popoverRect = popover.getBoundingClientRect();
          const status = rect('.notification-status')!;
          const date = rect('.notification-date')!;
          const time = rect('.notification-time')!;
          const result = {
            collisions,
            display: anchorStyle.display,
            direction: anchorStyle.flexDirection,
            headWrap: headStyle.flexWrap,
            stampWrap: getComputedStyle(anchor.querySelector('.notification-stamp')!).flexWrap,
            // Lines are stacked: the summary begins at or below the head's bottom edge.
            linesStacked: summaryRect ? summaryRect.top >= headRect.bottom - 1 : true,
            dateBeforeTime: date.right <= time.left + 1,
            statusSharesLineWithDate: status.bottom > date.top + 1 && date.bottom > status.top + 1,
            escapes:
              status.left < popoverRect.left - 1 ||
              time.right > popoverRect.right + 1 ||
              (summaryRect ? summaryRect.right > popoverRect.right + 1 : false),
            overflow: Math.round(anchor.scrollWidth - anchor.clientWidth),
            tabularTime: getComputedStyle(
              anchor.querySelector('.notification-time')!,
            ).fontVariantNumeric.includes('tabular-nums'),
          };
          popover.remove();
          return result;
        }, shape);

        const note = (message: string) => failures.push(`${viewport.id} ${shape}: ${message}`);
        for (const collision of layout.collisions) note(`overlap ${collision}`);
        if (layout.display !== 'flex') note(`row display is ${layout.display}`);
        if (layout.direction !== 'column') note(`row direction is ${layout.direction}`);
        // A wrapped flex line is the flexbox analogue of the grid construct that caused
        // the original defect. Neither line may ever wrap.
        if (layout.headWrap !== 'nowrap') note(`the head line wraps (${layout.headWrap})`);
        if (layout.stampWrap !== 'nowrap') note(`the stamp wraps (${layout.stampWrap})`);
        if (!layout.linesStacked) note('the summary line is not below the head line');
        if (!layout.dateBeforeTime) note('date does not precede time');
        if (layout.escapes) note('a piece escapes the popover box');
        if (layout.overflow > 0) note(`the row scrolls sideways by ${layout.overflow}px`);
        if (!layout.tabularTime) note('time is not tabular');
        // Desktop keeps date and time on the title's line; phones drop them below it.
        const shouldShare = viewport.width >= 768;
        if (layout.statusSharesLineWithDate !== shouldShare) {
          note(
            shouldShare
              ? 'desktop title and date are not on one line'
              : 'phone title and date share a line',
          );
        }
      }
    }
    expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
  });

  /*
   * v8-A3-redux-2. A full notification list must not compress its rows.
   *
   * The owner saw the timestamp printing through the row separator in BOTH engines,
   * after a fix aimed at an engine difference. It was never an engine difference. The
   * list was `display: grid` with a `max-height`, and a height-constrained grid sizes
   * its `auto` tracks down to each item's automatic minimum — here the 2.5rem
   * `min-height` every popover link carries. Past roughly eight rows every row's box
   * became 40px while its content needed 59px, so the second line overflowed onto the
   * next row's border.
   *
   * It is quantity-specific, so every earlier test missed it: they mounted one row, or
   * five. This mounts twenty, which is what a real account looks like, and asserts the
   * property directly — no row's box may be shorter than the content inside it.
   */
  /*
   * v8.2-P1. The panel header must not overlap itself.
   *
   * `.section-heading` is a two-child layout with no wrap. Adding Clear all made it three
   * children inside a 24rem panel, so the title was flexed below its own text width and,
   * with nothing clipping it, printed underneath the buttons — which is what the owner
   * photographed. The actions are one group now and the heading may wrap.
   *
   * Geometry, not class names: the title and the action group must never intersect, and
   * no button may break its own label across lines.
   */
  test('the notification header never overlaps its actions @crossbrowser', async ({ page }) => {
    const failures: string[] = [];
    for (const viewport of [{ id: '1440x1024', width: 1440, height: 1024 }, ...gameViewports]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      const layout = await page.evaluate(() => {
        const popover = document.createElement('div');
        popover.className = 'menu-popover notification-popover';
        popover.style.opacity = '1';
        popover.style.animation = 'none';
        /*
         * Deliberately the BROKEN shape: both buttons as direct siblings of the title,
         * exactly as they were when the owner photographed the overlap.
         *
         * Testing the grouped markup would prove nothing — grouping is itself most of the
         * repair, so that version passes with or without the stylesheet. Reproducing the
         * shape that failed is what makes this a regression test: the heading has to wrap
         * and the labels have to hold together even under the pressure that broke it.
         */
        popover.innerHTML =
          '<div class="section-heading notification-heading">' +
          '<strong>Notifications</strong>' +
          '<button type="button">Mark all read</button>' +
          '<button type="button">Clear all</button>' +
          '</div>';
        document.body.append(popover);
        const title = popover.querySelector('strong')!.getBoundingClientRect();
        const buttons = [...popover.querySelectorAll<HTMLElement>('button')];
        /*
         * Each action is checked against the title on its own. Unioning them into one box
         * reports a false overlap the moment they wrap onto separate lines, because the
         * union then spans the title's row as well — measuring the gap between the buttons
         * rather than anything either of them covers.
         */
        const overlap = buttons.reduce((worst, button) => {
          const box = button.getBoundingClientRect();
          const area = Math.round(
            Math.max(0, Math.min(title.right, box.right) - Math.max(title.left, box.left)) *
              Math.max(0, Math.min(title.bottom, box.bottom) - Math.max(title.top, box.top)),
          );
          return Math.max(worst, area);
        }, 0);
        /*
         * A label broken mid-phrase reads as damage, and it is the same squeeze that
         * produced the overlap. Measured on the TEXT, with a Range: a button's own height
         * carries padding and a 44px minimum, so comparing that against a line height
         * reports every button in the app as wrapped.
         */
        const wrapped = buttons.filter((button) => {
          const node = button.firstChild;
          if (!node) return false;
          const range = document.createRange();
          range.selectNodeContents(node);
          return range.getClientRects().length > 1;
        }).length;
        const escapes = title.left < popover.getBoundingClientRect().left - 1;
        popover.remove();
        return { overlap, wrapped, escapes };
      });
      if (layout.overlap > 0)
        failures.push(`${viewport.id}: title/actions overlap ${layout.overlap}px²`);
      if (layout.wrapped > 0)
        failures.push(`${viewport.id}: ${layout.wrapped} button label(s) wrapped`);
      if (layout.escapes) failures.push(`${viewport.id}: the title escapes the panel`);
    }
    expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
  });

  /*
   * v8.2-P2. An occupied time control must not look like an empty one.
   *
   * The portal's whole purpose is showing where players are, and every tile rendered
   * identically whether anyone was there or not — the owner reported exactly that. So this
   * asserts the difference is real and that it is not carried by colour alone: the tile's
   * own text has to change too, or a colour-blind reader and a forced-colors user learn
   * nothing from the page.
   */
  test('an occupied time control reads differently from an empty one @crossbrowser', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/combat');
    const tiles = page.locator('.portal-tile');
    await expect(tiles).toHaveCount(10);

    const before = await page.evaluate(() => {
      const tile = document.querySelectorAll<HTMLElement>('.portal-tile')[1]!;
      const style = getComputedStyle(tile);
      return {
        text: tile.innerText.replace(/\s+/g, ' ').trim(),
        border: style.borderTopColor,
        background: style.backgroundColor,
        shadow: style.boxShadow,
      };
    });
    const after = await page.evaluate(() => {
      const tile = document.querySelectorAll<HTMLElement>('.portal-tile')[1]!;
      tile.classList.add('is-occupied');
      tile.setAttribute('data-band', 'some');
      tile.querySelector('.portal-tile-occupancy')!.innerHTML =
        '<span class="portal-tile-count">3–5 waiting</span>';
      const style = getComputedStyle(tile);
      return {
        text: tile.innerText.replace(/\s+/g, ' ').trim(),
        border: style.borderTopColor,
        background: style.backgroundColor,
        shadow: style.boxShadow,
      };
    });

    expect(after.text, 'the occupied tile must say so in words').not.toBe(before.text);
    expect(after.text).toContain('waiting');
    const visuallyDifferent =
      after.border !== before.border ||
      after.background !== before.background ||
      after.shadow !== before.shadow;
    expect(visuallyDifferent, 'an occupied tile must also look different').toBe(true);

    // The grid is a grid, not a strip: four columns at desktop, two on a phone.
    const desktopColumns = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.portal-tiles')!).gridTemplateColumns.split(' ')
          .length,
    );
    expect(desktopColumns).toBeGreaterThanOrEqual(3);
    expect(desktopColumns).toBeLessThanOrEqual(5);
    await page.setViewportSize({ width: 390, height: 900 });
    const phoneColumns = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('.portal-tiles')!).gridTemplateColumns.split(' ')
          .length,
    );
    expect(phoneColumns).toBe(2);
  });

  test('a full notification list never compresses a row @crossbrowser', async ({ page }) => {
    const failures: string[] = [];
    for (const viewport of [{ id: '1440x1024', width: 1440, height: 1024 }, ...gameViewports]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      const worst = await page.evaluate(() => {
        const labels = ['Match result', 'Your turn', 'Rematch update', 'Private match request'];
        const popover = document.createElement('div');
        popover.className = 'menu-popover notification-popover';
        popover.style.opacity = '1';
        popover.style.animation = 'none';
        popover.innerHTML =
          '<div class="notification-list">' +
          Array.from({ length: 20 }, (_, index) => {
            const label = labels[index % labels.length];
            return (
              '<a class="is-unread" href="#">' +
              '<span class="notification-head">' +
              `<strong class="notification-status">${label}</strong>` +
              '<span class="notification-stamp">' +
              '<time class="notification-date">8/9/2026</time>' +
              '<time class="notification-time">7:03:44 PM</time>' +
              '</span></span></a>'
            );
          }).join('') +
          '</div>';
        document.body.append(popover);
        let squeeze = 0;
        let spill = 0;
        for (const row of Array.from(
          popover.querySelectorAll<HTMLElement>('.notification-list a'),
        )) {
          const box = row.getBoundingClientRect();
          squeeze = Math.max(squeeze, Math.round(row.scrollHeight - box.height));
          const stamp = row.querySelector('.notification-stamp');
          if (stamp) {
            spill = Math.max(spill, Math.round(stamp.getBoundingClientRect().bottom - box.bottom));
          }
        }
        const list = popover.querySelector('.notification-list')!;
        const scrolls = list.scrollHeight > list.clientHeight + 1;
        popover.remove();
        return { squeeze, spill, scrolls };
      });
      if (worst.squeeze > 0) {
        failures.push(`${viewport.id}: a row is ${worst.squeeze}px shorter than its content`);
      }
      if (worst.spill > 0) {
        failures.push(`${viewport.id}: the timestamp spills ${worst.spill}px past its row`);
      }
      // The list must be the thing that scrolls. If it is not, twenty rows have been
      // absorbed somewhere they should not fit, which is the same defect wearing a hat.
      if (!worst.scrolls) failures.push(`${viewport.id}: twenty rows did not make the list scroll`);
    }
    expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
  });

  /*
   * v8-A3-redux. The dropdown panels must never paint on top of the header.
   *
   * The owner reported the notification overlap STILL present on Firefox for Android
   * after v8-A3 hardened the row's internal layout — and every engine on this machine
   * said the row was fine, because the row was not the problem.
   *
   * The panels are `position: fixed` at hard-coded offsets, each a guess at the header's
   * height, and at phone width the guess cleared the header by 3.6px. Firefox for
   * Android's Accessibility font setting is a text-only zoom: it scales type but not
   * `rem` lengths, so the toolbar wraps and grows while the panel stays put. This
   * reproduces that by scaling every element's computed font size once, leaving lengths
   * alone — which is what that setting does — and asserts the panel still clears the
   * header. It fails on the pre-fix CSS from 1.5x upward.
   */
  test('dropdown panels stay clear of the header under text-only zoom @crossbrowser', async ({
    page,
  }) => {
    const failures: string[] = [];
    for (const viewport of [{ id: '1440x1024', width: 1440, height: 1024 }, ...gameViewports]) {
      for (const zoom of [1, 1.3, 1.5, 2]) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto('/');
        await page.evaluate((factor) => {
          if (factor === 1) return;
          for (const element of Array.from(document.querySelectorAll('*'))) {
            const size = Number.parseFloat(getComputedStyle(element).fontSize);
            if (Number.isFinite(size)) {
              (element as HTMLElement).style.fontSize = `${size * factor}px`;
            }
          }
        }, zoom);
        /*
         * The shell publishes the header's height from a ResizeObserver, which fires a
         * frame after the layout changes. Waiting for the published value to agree with
         * the measured header is therefore also the assertion that the observer works —
         * a version that measured immediately would read the pre-zoom value and report
         * a failure that is only the test being early.
         */
        await page
          .waitForFunction(
            () => {
              const chrome = document.querySelector('.global-chrome');
              if (!chrome) return true;
              const published = getComputedStyle(document.documentElement).getPropertyValue(
                '--chrome-bottom',
              );
              return (
                Math.abs(Number.parseFloat(published) - chrome.getBoundingClientRect().bottom) <=
                1.5
              );
            },
            { timeout: 5_000 },
          )
          .catch(() => {
            failures.push(`${viewport.id} @ ${zoom}x: the header height was never published`);
          });
        const clearance = await page.evaluate(() => {
          const header = document.querySelector('.global-chrome');
          if (!header) return null;
          const panel = document.createElement('div');
          panel.className = 'menu-popover notification-popover';
          panel.style.opacity = '1';
          panel.style.animation = 'none';
          panel.innerHTML = '<div class="notification-list"></div>';
          document.body.append(panel);
          const measured =
            panel.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
          panel.remove();
          return Math.round(measured);
        });
        if (clearance === null) continue;
        if (clearance < 0) {
          failures.push(
            `${viewport.id} @ ${zoom}x text zoom: the panel covers the header by ${-clearance}px`,
          );
        }
      }
    }
    expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
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

  /*
   * B2. The sweep above is signed-out, so it skipped custom accents entirely — and it
   * walks `controlSelector`, which is controls. The two surfaces that failed were an
   * accent-backed *surface* (`.badge`, `.attention-badge`) and an accent-tinted row
   * (`.notification-list a.is-unread`), neither of which is a control and neither of
   * which renders signed-out. Both gaps are closed here: the accent variables are
   * applied by script exactly as ProfileAccentBridge applies them, so no account is
   * needed, and the surfaces are mounted directly.
   */
  /*
   * C3. This previously swept custom accents only, and only at rest, and it mounted the
   * alerts badge as a bare child of a <div>. All three of those hid the same defect: a
   * rule setting `color: inherit` on spans inside a *hovered button* out-specifies the
   * badge's own ink, so the badge inherited the trigger's muted grey while keeping its
   * accent background — 6.93:1 at rest, 2.89:1 hovered. A badge that is not inside a
   * button cannot match that rule, so the probe now mounts the real structure, forces
   * the same pseudo-states the control sweep uses, and covers named accents too, since
   * the failure was never custom-specific.
   */
  for (const scheme of contrastSchemes) {
    test(`accent-backed surfaces stay readable in every state (${scheme})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 1024 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      // Controls transition colour over 90ms; forcing a state and reading immediately
      // would sample mid-flight and report a colour no player ever sees.
      await page.addStyleTag({
        content:
          '*, *::before, *::after { transition: none !important; animation: none !important }',
      });
      const client = await page.context().newCDPSession(page);
      await client.send('DOM.enable');
      await client.send('CSS.enable');

      const accents: Array<{ label: string; hex: string | null }> = [
        ...contrastAccents.map((name) => ({ label: name, hex: null })),
        ...contrastCustomHexes.map((hex) => ({ label: `custom ${hex}`, hex })),
      ];

      const failures: string[] = [];
      for (const accent of accents) {
        const variables = accent.hex ? accentCssVariableMap(accent.hex) : null;
        if (accent.hex) expect(variables, accent.hex).not.toBeNull();
        await page.evaluate(
          ({ name, values }) => {
            const root = document.documentElement;
            for (const key of Array.from(root.style)) {
              if (key.startsWith('--custom-')) root.style.removeProperty(key);
            }
            root.dataset.accent = name;
            for (const [property, value] of Object.entries(values ?? {})) {
              root.style.setProperty(property, value);
            }
            document.querySelector('[data-accent-surface-probe]')?.remove();
            const probe = document.createElement('div');
            probe.setAttribute('data-accent-surface-probe', 'true');
            /*
             * The alerts badge is a <span> inside the trigger <button>, and the popover
             * fades in — the measurement composites inherited opacity, so the popover is
             * settled inline or every run reads text at partial alpha and reports a
             * spurious 1.00:1.
             */
            probe.innerHTML =
              '<span class="badge">Unavailable</span>' +
              '<div class="notification-menu">' +
              '<button type="button" data-accent-probe-control>' +
              'Alerts<span class="attention-badge">11</span>' +
              '</button></div>' +
              '<div class="menu-popover notification-popover" ' +
              'style="opacity:1;animation:none;position:static">' +
              '<div class="notification-filters">' +
              '<button type="button" class="is-selected" data-accent-probe-control>' +
              'Your turn<span class="notification-filter-count">3</span>' +
              '</button>' +
              '<button type="button" data-accent-probe-control>' +
              'Results<span class="notification-filter-count">2</span>' +
              '</button></div>' +
              '<div class="notification-list">' +
              '<a class="is-unread" href="#" data-accent-probe-control>' +
              '<span class="notification-head">' +
              '<strong class="notification-status">Your turn</strong>' +
              '<span class="notification-stamp">' +
              '<time class="notification-date">8/6/26</time>' +
              '<time class="notification-time">11:47:03 AM</time>' +
              '</span></span>' +
              '<span class="notification-summary">' +
              '<span class="notification-detail">Nova · Ranked · OG · 5 letters</span>' +
              '</span>' +
              '</a></div></div>' +
              '<aside class="ranked-search-status is-searching" style="position:static">' +
              '<strong>SEARCHING</strong>' +
              '<span>Ranked OG · 5 letters · <span class="ranked-search-elapsed">1:04</span></span>' +
              '<div class="ranked-search-actions">' +
              '<a class="button" href="#" data-accent-probe-control>Open lobby</a>' +
              '<button type="button" data-accent-probe-control>Cancel search</button>' +
              '</div></aside>';
            document.body.append(probe);
          },
          { name: accent.hex ? 'custom' : accent.label, values: variables },
        );

        const { root } = await client.send('DOM.getDocument', { depth: -1 });
        const { nodeIds } = await client.send('DOM.querySelectorAll', {
          nodeId: root.nodeId,
          selector: '[data-accent-probe-control]',
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
          const results = await page.evaluate(measureControlContrast, accentSurfaceSelector);
          for (const result of results) {
            if (result.ok) continue;
            failures.push(
              `${scheme} · ${accent.label} · ${state} · ${result.label} — ` +
                `${result.ratio.toFixed(2)}:1 (needs ${result.required}:1) ` +
                `fg ${result.color} on bg ${result.background}`,
            );
          }
        }
      }
      await page.evaluate(() => document.querySelector('[data-accent-surface-probe]')?.remove());
      expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
    });
  }

  for (const scheme of contrastSchemes) {
    test(`secondary text stays readable on every selected surface (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 1024 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await page.addStyleTag({
        content:
          '*, *::before, *::after { transition: none !important; animation: none !important }',
      });
      const client = await page.context().newCDPSession(page);
      await client.send('DOM.enable');
      await client.send('CSS.enable');

      const failures: string[] = [];
      /*
       * Named and custom alike. `.combat-wait-state span` and `.confirmation-panel p`
       * sit on `--accent-soft`, which tracks the scheme and so passes comfortably for
       * every named accent — they can only fail under a custom hex, which is exactly the
       * blind spot that produced the unread-row defect in v7.1.
       */
      const accents: Array<{ label: string; hex: string | null }> = [
        ...contrastAccents.map((name) => ({ label: name, hex: null })),
        ...contrastCustomHexes.map((hex) => ({ label: `custom ${hex}`, hex })),
      ];
      for (const accent of accents) {
        const variables = accent.hex ? accentCssVariableMap(accent.hex) : null;
        if (accent.hex) expect(variables, accent.hex).not.toBeNull();
        await page.evaluate(
          ({ name, values }) => {
            const root = document.documentElement;
            for (const key of Array.from(root.style)) {
              if (key.startsWith('--custom-')) root.style.removeProperty(key);
            }
            root.dataset.accent = name;
            for (const [property, value] of Object.entries(values ?? {})) {
              root.style.setProperty(property, value);
            }
            document.querySelector('[data-selected-surface-probe]')?.remove();
            const probe = document.createElement('div');
            probe.setAttribute('data-selected-surface-probe', 'true');
            /*
             * The real markup, not a simplification. The custom accent card in particular
             * only fails as a nested structure: `.custom-accent-option:has(input:checked)`
             * flips a <div>, and the ink for the preset name comes from `.field-stack
             * label` two levels up, so flattening it would hide the defect exactly the way
             * mounting the alerts badge outside a <button> hid the last one.
             */
            probe.innerHTML =
              '<div class="field-stack">' +
              '<div class="custom-accent-option">' +
              '<label><input type="radio" name="probe-accent" checked />' +
              '<span class="accent-swatch"></span>' +
              '<span>Gay<small>#8702B0</small></span></label>' +
              '<button type="button" class="text-action">EDIT</button>' +
              '</div>' +
              '<label class="accent-option"><input type="radio" name="probe-named" checked />' +
              '<span class="accent-swatch"></span><span>Aurora</span></label>' +
              '</div>' +
              '<a class="route-link" href="#" data-selected-probe-control>' +
              '<strong>Leaderboards</strong><span>Ranked standings</span></a>' +
              '<div class="word-list"><button type="button" aria-selected="true">' +
              '<strong>CRANE</strong><span>encountered</span></button></div>' +
              '<div class="calendar-grid"><button type="button" class="calendar-day is-selected">' +
              '<span>12</span><strong>Locked</strong></button></div>' +
              '<div class="segmented"><button type="button" aria-pressed="true">' +
              'Practice<span>unlimited</span></button></div>' +
              '<p class="combat-wait-state">Waiting<span>Their turn</span></p>' +
              '<div class="confirmation-panel"><h3>Unlock this Daily?</h3>' +
              '<p>Sixty coins, and the date opens for play.</p></div>';
            document.body.append(probe);
          },
          { name: accent.hex ? 'custom' : accent.label, values: variables },
        );

        const { root } = await client.send('DOM.getDocument', { depth: -1 });
        const { nodeIds } = await client.send('DOM.querySelectorAll', {
          nodeId: root.nodeId,
          selector: '[data-selected-probe-control]',
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
          const results = await page.evaluate(measureControlContrast, selectedSurfaceSelector);
          for (const result of results) {
            if (result.ok) continue;
            failures.push(
              `${scheme} · ${accent.label} · ${state} · ${result.label} — ` +
                `${result.ratio.toFixed(2)}:1 (needs ${result.required}:1) ` +
                `fg ${result.color} on bg ${result.background}`,
            );
          }
        }
      }
      await page.evaluate(() => document.querySelector('[data-selected-surface-probe]')?.remove());
      expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
    });
  }

  /*
   * W2b. The contrast sweep has never measured a keyboard key in any state. `button` is
   * in `controlSelector`, but `GameKeyboard` renders only on the three play and match
   * routes, and none of them is in `contrastSurfaces` — so deepening the opponent's-turn
   * dim would have been an unmeasured change to how legible the keyboard is.
   *
   * Adding those routes to the main sweep would have cost 36 more page-states per scheme
   * against a suite already carrying a 300s timeout, and they need a live match anyway.
   * A mounted probe measures the same CSS for a fraction of the time.
   */
  for (const scheme of contrastSchemes) {
    test(`the opponent's-turn keyboard stays legible while reading as unavailable (${scheme})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 1024 });
      await page.emulateMedia({ colorScheme: scheme });
      /*
       * Not `/`. Every rule under test lives in `solo-game.css`, which is imported by the
       * four play and combat route files rather than shipped globally, so a probe mounted
       * on the home page measures unstyled buttons and passes vacuously — the first
       * version of this test did exactly that and reported the untouched 0.74. The combat
       * route-group layout imports the stylesheet, so it is present here even signed out,
       * where the page itself is only the account gate.
       */
      await page.goto('/combat/practice');
      await page.addStyleTag({
        content:
          '*, *::before, *::after { transition: none !important; animation: none !important }',
      });

      const failures: string[] = [];
      const dims: number[] = [];
      for (const accent of contrastAccents) {
        const measured = await page.evaluate((name) => {
          document.documentElement.dataset.accent = name;
          document.querySelector('[data-keyboard-probe]')?.remove();
          const probe = document.createElement('div');
          probe.setAttribute('data-keyboard-probe', 'true');
          // The real structure: the dim is a wrapper rule that composites with each
          // key's own `button:disabled` opacity, so a bare keyboard would under-report.
          probe.innerHTML =
            '<div class="combat-input" data-turn-locked="true" data-word-length="5">' +
            '<div class="keyboard">' +
            '<div class="keyboard-row">' +
            ['q', 'w', 'e', 'r', 't']
              .map(
                (letter) =>
                  `<button type="button" class="key is-unknown" disabled>${letter.toUpperCase()}</button>`,
              )
              .join('') +
            '<button type="button" class="key is-correct" disabled>A</button>' +
            '<button type="button" class="key is-present" disabled>S</button>' +
            '<button type="button" class="key is-absent" disabled>D</button>' +
            '</div></div></div>';
          document.body.append(probe);
          const key = probe.querySelector('.key') as HTMLElement;
          let opacity = 1;
          for (let node: Element | null = key; node; node = node.parentElement) {
            opacity *= Number(getComputedStyle(node).opacity || '1');
          }
          return opacity;
        }, accent);
        dims.push(measured);

        const results = await page.evaluate(measureControlContrast, '[data-keyboard-probe] .key');
        for (const result of results) {
          if (result.ok) continue;
          failures.push(
            `${scheme} · ${accent} · ${result.label} — ${result.ratio.toFixed(2)}:1 ` +
              `(needs ${result.required}:1) fg ${result.color} on bg ${result.background}`,
          );
        }
      }
      await page.evaluate(() => document.querySelector('[data-keyboard-probe]')?.remove());

      // The point of the change is that it is visibly deeper than the ordinary disabled
      // treatment. If someone later reverts the wrapper rule, this fails rather than
      // quietly restoring the dim the owner called too weak.
      expect(
        Math.max(...dims),
        `effective key opacity per accent: ${dims.join(', ')}`,
      ).toBeLessThan(0.74);
      expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
    });
  }

  /*
   * v7.4. The Help figure keyboards are `<span class="key">`, which `controlSelector`
   * cannot match — so nothing swept them, in any state, even though `/help` is a swept
   * route. Three new things need measuring: the pressed state, and the two accents the
   * COMBAT figure now renders side by side.
   *
   * Measured on the real figures rather than a mounted probe, because these exist on the
   * page already and a probe would only re-prove the CSS I just wrote.
   */
  for (const scheme of contrastSchemes) {
    test(`Help figure keys stay readable pressed and in both accents (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/help');
      await page.locator('.help-combat-side').first().waitFor();
      await page.addStyleTag({
        content:
          '*, *::before, *::after { transition: none !important; animation: none !important }',
      });

      const failures: string[] = [];
      for (const state of ['rest', 'pressed'] as const) {
        // `:is-pressed` is applied by the sequence, not by a pseudo-class, so it is set
        // directly rather than forced through CDP.
        await page.evaluate((pressed) => {
          for (const key of document.querySelectorAll('.help-figure .key')) {
            key.classList.toggle('is-pressed', pressed === 'pressed');
          }
        }, state);
        const results = await page.evaluate(measureControlContrast, '.help-figure .keyboard');
        for (const result of results) {
          if (result.ok) continue;
          failures.push(
            `${scheme} · ${state} · ${result.label} — ${result.ratio.toFixed(2)}:1 ` +
              `(needs ${result.required}:1) fg ${result.color} on bg ${result.background}`,
          );
        }
      }
      expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
    });
  }

  /*
   * v8-A5. The end-of-match actions had nine-plus controls in one wrapping flex row with no
   * mobile rule at all. Asserted as structure rather than screenshots: two tiers, buttons
   * on a shared grid so none is stranded, and no horizontal overflow at the narrowest width.
   */
  test('the end-of-match actions are laid out, not piled @crossbrowser', async ({ page }) => {
    await page.goto('/combat/practice');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => {
        document.querySelector('[data-actions-probe]')?.remove();
        const probe = document.createElement('div');
        probe.setAttribute('data-actions-probe', 'true');
        probe.className = 'result-panel';
        probe.innerHTML =
          '<nav class="result-actions">' +
          '<div class="result-actions-primary">' +
          '<a class="button primary" href="#">SEARCH AGAIN</a>' +
          '<a class="button" href="#">NEW COMBAT</a>' +
          '<a class="button" href="#">PLAY DAILY</a>' +
          '</div>' +
          '<div class="result-actions-secondary">' +
          '<a class="button" href="#">VIEW RESULT</a><a class="button" href="#">VIEW RIVAL</a>' +
          '<a class="button" href="#">HISTORY</a><a class="button" href="#">ACTIVE</a>' +
          '</div></nav>';
        document.body.append(probe);
        const widths = (selector: string) =>
          [...probe.querySelectorAll(`${selector} .button`)].map((node) =>
            Math.round(node.getBoundingClientRect().width),
          );
        const result = {
          primary: widths('.result-actions-primary'),
          secondary: widths('.result-actions-secondary'),
          overflow: probe.scrollWidth - probe.clientWidth,
          docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
        probe.remove();
        return result;
      });
      const even = (list: number[]) => new Set(list).size === 1;
      // Equal widths within a tier is the difference between a grid and a wrapped pile.
      expect(even(layout.primary), `${width}px primary widths ${layout.primary.join()}`).toBe(true);
      expect(even(layout.secondary), `${width}px secondary widths ${layout.secondary.join()}`).toBe(
        true,
      );
      expect(layout.overflow, `${width}px cluster overflows`).toBeLessThanOrEqual(1);
      expect(layout.docOverflow, `${width}px document overflows`).toBeLessThanOrEqual(1);
    }
  });

  /*
   * v8-A4. The forfeit answer row introduces the first red tile in the game, and no sweep
   * has ever measured a tile — `controlSelector` is controls, and the board only exists on
   * routes the sweep does not visit. Measured here in both schemes.
   */
  for (const scheme of contrastSchemes) {
    test(`the forfeited answer row stays readable (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/combat/practice');
      const failures: string[] = [];
      await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.setAttribute('data-answer-probe', 'true');
        probe.innerHTML =
          '<div class="board-row is-answer">' +
          [...'waste']
            .map(
              (letter) =>
                `<div class="tile is-answer"><span class="tile-letter">${letter.toUpperCase()}</span></div>`,
            )
            .join('') +
          '</div>';
        document.body.append(probe);
      });
      const results = await page.evaluate(measureControlContrast, '[data-answer-probe] .board-row');
      for (const result of results) {
        if (result.ok) continue;
        failures.push(
          `${scheme} · ${result.label} — ${result.ratio.toFixed(2)}:1 ` +
            `(needs ${result.required}:1) fg ${result.color} on bg ${result.background}`,
        );
      }
      // Red must be unmistakably not-green: the answer row is the one place red appears.
      const distinct = await page.evaluate(() => {
        const answer = getComputedStyle(document.querySelector('[data-answer-probe] .tile')!);
        const solved = document.createElement('div');
        solved.className = 'tile is-correct';
        document.querySelector('[data-answer-probe]')!.append(solved);
        const correct = getComputedStyle(solved);
        const pair = [
          answer.color !== correct.color,
          answer.borderTopColor !== correct.borderTopColor,
        ];
        document.querySelector('[data-answer-probe]')?.remove();
        return pair;
      });
      expect(distinct, 'the answer row must not read as a solved row').toEqual([true, true]);
      expect(failures, `\n${failures.join('\n')}\n`).toEqual([]);
    });
  }

  /*
   * W2a. The draft caret is the one thing on the board that says "type here". It blinked
   * all the way through the opponent's turn, which is most misleading at the very start
   * of a match, when the board is empty and neither player has moved.
   *
   * Asserted through the generated pseudo-element rather than a screenshot, because the
   * thing that must be true is that the element is not generated at all — `content: none`
   * rather than a hidden box. That is also what settles the reduced-motion and
   * forced-colors rules aimed at the same selector: with no pseudo-element, neither has
   * anything to paint.
   */
  test('the draft caret invites input only when it is the viewer turn', async ({ page }) => {
    await page.goto('/combat/practice');
    const carets = await page.evaluate(() => {
      const mount = (locked: boolean) => {
        const host = document.createElement('div');
        host.innerHTML =
          `<div class="combat-input" data-word-length="5"${locked ? ' data-turn-locked="true"' : ''}>` +
          '<div class="board-row is-draft">' +
          '<div class="tile"></div><div class="tile"></div><div class="tile"></div>' +
          '</div></div>';
        document.body.append(host);
        const tile = host.querySelector('.tile') as HTMLElement;
        const style = getComputedStyle(tile, '::after');
        return { content: style.content, background: style.backgroundColor };
      };
      return { locked: mount(true), open: mount(false) };
    });
    // Solo shares this stylesheet and never sets the attribute, so its caret is the
    // `open` case and is unaffected by this change.
    expect(carets.open.content, 'the caret must still exist on your own turn').not.toBe('none');
    expect(carets.locked.content, "no caret during the opponent's turn").toBe('none');
  });

  /*
   * W4. `/history` is swept, but signed out, where it is only the account gate — so the
   * completed-game table has never been measured at all. Both stylesheets ship globally,
   * so the real rules apply to a mounted probe.
   *
   * Note the card is a MOBILE presentation: the two-column label/value grid exists only
   * below 47.99rem. Above that it is an ordinary table where the link already aligned,
   * which is why the reported defect is width-dependent.
   */
  const historyRowMarkup =
    '<div class="table-scroll"><table class="responsive-table"><tbody>' +
    '<tr data-history-probe-row>' +
    '<td data-label="Date">8/8/2026</td>' +
    '<td data-label="Game">solo practice · OG</td>' +
    '<td data-label="Result" data-result="won">won</td>' +
    '<td data-label="Progress">1 solved · 4 guesses</td>' +
    '<td data-label="Reward">12 coins · 30 XP</td>' +
    '<td data-label="Status">Synced</td>' +
    '<td data-label="Definitions"><button type="button" class="text-action">Definition</button></td>' +
    '</tr>' +
    '<tr><td data-label="Result" data-result="lost">lost</td></tr>' +
    '<tr><td data-label="Result" data-result="draw">draw</td></tr>' +
    '<tr><td data-label="Result" data-result="cancelled">cancelled</td></tr>' +
    '</tbody></table></div>';

  test('every history value shares its label row and column, definitions included', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const cells = await page.evaluate((markup) => {
      const host = document.createElement('div');
      host.setAttribute('data-history-probe', 'true');
      host.innerHTML = markup;
      document.body.append(host);
      const row = host.querySelector('[data-history-probe-row]')!;
      // Measure the painted text itself with a Range, not the element box: the value is a
      // bare text node in six cells and a <button> in the seventh, and comparing element
      // boxes would compare two different things.
      return Array.from(row.querySelectorAll('td')).map((cell) => {
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node && !(node.textContent ?? '').trim()) node = walker.nextNode();
        const range = document.createRange();
        range.selectNodeContents(node!);
        const text = range.getBoundingClientRect();
        const box = cell.getBoundingClientRect();
        return {
          label: cell.getAttribute('data-label')!,
          left: Math.round(text.left - box.left),
          offsetFromRowCentre: Math.round(text.top + text.height / 2 - (box.top + box.height / 2)),
        };
      });
    }, historyRowMarkup);
    await page.evaluate(() => document.querySelector('[data-history-probe]')?.remove());

    const detail = cells.map((c) => `${c.label} left=${c.left} dy=${c.offsetFromRowCentre}`);
    const lefts = new Set(cells.map((cell) => cell.left));
    expect(lefts.size, `values must share one column edge — ${detail.join(' | ')}`).toBe(1);
    for (const cell of cells) {
      expect(
        Math.abs(cell.offsetFromRowCentre),
        `${cell.label} must sit on its label's row — ${detail.join(' | ')}`,
      ).toBeLessThanOrEqual(1);
    }
  });

  for (const scheme of contrastSchemes) {
    test(`history result colours stay legible at rest and under the row hover (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await page.addStyleTag({
        content:
          '*, *::before, *::after { transition: none !important; animation: none !important }',
      });
      const client = await page.context().newCDPSession(page);
      await client.send('DOM.enable');
      await client.send('CSS.enable');
      await page.evaluate((markup) => {
        const host = document.createElement('div');
        host.setAttribute('data-history-probe', 'true');
        host.innerHTML = markup;
        document.body.append(host);
      }, historyRowMarkup);

      const failures: string[] = [];
      const { root } = await client.send('DOM.getDocument', { depth: -1 });
      const { nodeIds } = await client.send('DOM.querySelectorAll', {
        nodeId: root.nodeId,
        selector: '[data-history-probe] tbody tr',
      });
      /*
       * Swept across every accent, named and custom, because `tbody tr:hover` flips the
       * row to `--accent-soft` — an accent-derived surface. A verdict colour that reads
       * against the page can still fail once a pointer lands on it, which is how the
       * first version of this caught `--danger` at 3.76:1 and produced `--danger-text`.
       */
      const accents: Array<{ label: string; hex: string | null }> = [
        ...contrastAccents.map((name) => ({ label: name, hex: null })),
        ...contrastCustomHexes.map((hex) => ({ label: `custom ${hex}`, hex })),
      ];
      for (const accent of accents) {
        const variables = accent.hex ? accentCssVariableMap(accent.hex) : null;
        await page.evaluate(
          ({ name, values }) => {
            const root2 = document.documentElement;
            for (const key of Array.from(root2.style)) {
              if (key.startsWith('--custom-')) root2.style.removeProperty(key);
            }
            root2.dataset.accent = name;
            for (const [property, value] of Object.entries(values ?? {})) {
              root2.style.setProperty(property, value);
            }
          },
          { name: accent.hex ? 'custom' : accent.label, values: variables },
        );
        for (const state of ['rest', 'hover'] as const) {
          for (const nodeId of nodeIds) {
            await client
              .send('CSS.forcePseudoState', {
                nodeId,
                forcedPseudoClasses: state === 'rest' ? [] : [state],
              })
              .catch(() => undefined);
          }
          const results = await page.evaluate(
            measureControlContrast,
            '[data-history-probe] td[data-result]',
          );
          for (const result of results) {
            if (result.ok) continue;
            failures.push(
              `${scheme} · ${accent.label} · ${state} · ${result.label} — ` +
                `${result.ratio.toFixed(2)}:1 (needs ${result.required}:1) ` +
                `fg ${result.color} on bg ${result.background}`,
            );
          }
        }
      }
      await page.evaluate(() => document.querySelector('[data-history-probe]')?.remove());
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
