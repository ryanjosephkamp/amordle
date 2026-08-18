/*
 * Exports the stylesheets that paint the Help figures, for the blog article.
 *
 * The figures are drawn by `board-surface.css` and `help-figures.css`, which are
 * written against the game's token layer — `--ink`, `--correct`, `--surface` and
 * so on, declared in `tui-shell.css`. Copying the rules without the tokens gives
 * a board with no colours, and hand-copying the tokens gives a second set to
 * keep in step. So this resolves them: it collects every custom property the two
 * files actually reference, follows references between them, and emits the
 * values from the game's DARK scheme onto a wrapper class.
 *
 * Dark on purpose. The figures show what the game looks like, and pinning one
 * scheme means the blog's own light/dark toggle cannot repaint a board into a
 * combination the game never renders.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const board = read('src/features/board/board-surface.css');
const figures = read('src/app/help/help-figures.css');
// globals.css carries spacing, motion and type tokens; tui-shell.css the colours.
const shell = `${read('src/app/globals.css')}\n${read('src/app/tui-shell.css')}`;

/*
 * The game declares its light scheme at :root and overrides it inside
 * `prefers-color-scheme: dark` blocks. The blog has light, dark AND system
 * modes, so the figures need both sets rather than one — a figure frozen in the
 * game's dark palette sits in a light article as a black hole, and one frozen
 * light is unreadable at night.
 *
 * Walking the file with a brace counter separates them: declarations seen
 * outside a dark block are the light scheme, declarations inside it are the dark
 * overrides.
 */
const lightTokens = new Map();
const darkTokens = new Map();
{
  /*
   * Only plain `:root` counts.
   *
   * The game also declares these properties under variant selectors —
   * `:root[data-accent='custom']` re-points the key colours at `--custom-*`
   * values that a player's chosen accent writes onto the element at runtime.
   * Collecting those overwrote the real `:root` values with references to
   * something that does not exist outside the app, and the figures rendered
   * keyboards with no border, background or ink at all.
   */
  // Comments first: this file is heavily commented, and a comment sitting above
  // a rule lands inside the captured selector, so `:root` stops matching itself.
  const source = shell.replace(/\/\*[\s\S]*?\*\//g, '');

  const darkRanges = [];
  const darkOpen = /@media[^{]*prefers-color-scheme:\s*dark[^{]*\{/gi;
  for (let match; (match = darkOpen.exec(source)); ) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < source.length && depth > 0) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') depth -= 1;
      index += 1;
    }
    darkRanges.push([match.index, index]);
  }
  const inDark = (index) => darkRanges.some(([from, to]) => index >= from && index < to);

  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // Whatever preceded the rule — an @import, the previous rule's tail — rides
    // along in the capture, so compare against the last statement only.
    const selector = match[1].split(';').pop().trim();
    if (selector !== ':root') continue;
    const target = inDark(match.index) ? darkTokens : lightTokens;
    for (const [, name, value] of match[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+);/gi)) {
      target.set(name, value.trim());
    }
  }
}

// Anything the dark scheme does not override keeps its light value.
const tokens = new Map([...lightTokens, ...darkTokens]);

// The figure stylesheets declare a few of their own (--tile-size), and those
// declarations travel with the rules, so they are already satisfied.
const declaredInPlace = new Set();
for (const [, name] of `${board}\n${figures}`.matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
  declaredInPlace.add(name);
}

const used = new Set();
const collect = (css) => {
  for (const [, name] of css.matchAll(/var\((--[a-z0-9-]+)/gi)) used.add(name);
};
collect(board);
collect(figures);

/*
 * The wrapper below paints its own surface and ink, and those two are not
 * necessarily referenced by the imported rules. Left implicit, `var(--surface)`
 * resolved to nothing and the figures rendered the game's near-white ink on the
 * blog's white page — invisible, and only caught by reading computed styles.
 */
used.add('--surface');
used.add('--ink');

// A token's value can reference another token, so keep resolving until closed.
for (let pass = 0; pass < 10; pass += 1) {
  const before = used.size;
  for (const name of [...used]) {
    const value = tokens.get(name);
    if (value) collect(value);
  }
  if (used.size === before) break;
}

/*
 * `--custom-*` is the per-player custom accent, written onto the element at
 * runtime rather than declared in a stylesheet. Nothing in a figure carries a
 * custom accent, so those rules never match and the tokens are correctly
 * absent. Anything else missing is a real gap and should stop the export.
 */
const runtimeProvided = (name) =>
  // Written onto the element at runtime, or supplied by next/font with a
  // fallback already spelled out in the rule that uses it.
  name.startsWith('--custom-') || name === '--font-geist-mono';

const missing = [...used].filter(
  (name) => !tokens.has(name) && !declaredInPlace.has(name) && !runtimeProvided(name),
);
if (missing.length) {
  throw new Error(`tokens referenced by the figures but not declared: ${missing.join(', ')}`);
}

const declare = (source, indent = '  ') =>
  [...used]
    .filter((name) => source.has(name))
    .sort()
    .map((name) => `${indent}${name}: ${source.get(name)};`)
    .join('\n');

// Only the tokens the dark scheme actually changes need re-declaring.
const darkOverrides = new Map(
  [...darkTokens].filter(([name, value]) => used.has(name) && lightTokens.get(name) !== value),
);

/*
 * `--dark` emits a single dark palette on the wrapper with no media queries and
 * no theme selectors. The blog needs both schemes because the reader chooses;
 * a video has no reader and no preference to consult, so it needs one palette
 * that is true regardless of what the rendering browser happens to prefer.
 */
const darkOnly = process.argv.includes('--dark');
const out = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? resolve(root, 'amordle-figures.css');

writeFileSync(
  out,
  `/*
 * GENERATED by scripts/export-help-figure-css.mjs in the amordle repository.
 * Do not edit by hand — re-run the exporter instead.
 *
 * The Help-page figures, with the game's own tokens resolved onto a wrapper so
 * they cannot leak into the rest of the page.
 *
 * Both schemes are carried. The figures follow the article rather than being
 * pinned: a board frozen in the game's dark palette is a black hole in a light
 * page, and one frozen light is unreadable at night. The three selectors below
 * mirror how the blog itself resolves a theme — an explicit choice, or the
 * system preference on a storage-free page.
 */
.amordle-figure {
${declare(darkOnly ? new Map([...lightTokens, ...darkTokens]) : lightTokens)}
  color: var(--ink);
  background: var(--surface);
  border: 1px solid color-mix(in oklch, var(--ink) 25%, transparent);
  padding: 1rem;
  overflow-x: auto;
}

${
  darkOnly
    ? '/* Dark-only build: no theme selectors, no media queries. */'
    : `:root[data-resolved-theme='dark'] .amordle-figure {
${declare(darkOverrides)}
}

@media (prefers-color-scheme: dark) {
  :root[data-storage-free-theme='system'] .amordle-figure,
  :root[data-theme-choice='system'] .amordle-figure {
${declare(darkOverrides, '    ')}
  }
}`
}

/* Doubled class: the imported rules come after this block, and a figure that
   loses its own background shows the game's ink on the host page's colour. */
.amordle-figure.amordle-figure {
  color: var(--ink);
  background: var(--surface);
}

${board}

${figures}

/*
 * Overflow safety, added by the exporter rather than the game.
 *
 * The game's figures centre their contents, which is right when they fit. Inside
 * a scroll container they do not fit at every width, and centred overflow puts
 * the left half of a board where nothing can scroll to it — the figure reads as
 * shoved to the right. \`safe\` is the keyword for exactly this: centre when there
 * is room, fall back to start when there is not.
 */
.amordle-figure .help-board,
.amordle-figure .help-combat,
.amordle-figure .help-calendar,
.amordle-figure .help-tool-bar {
  align-items: safe center;
  justify-content: safe center;
}

.amordle-figure .help-board-entry {
  justify-content: safe center;
}
`,
);

process.stdout.write(
  `WROTE ${out}\n${used.size} tokens resolved, ${darkOverrides.size} dark overrides\n`,
);
