import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { accentCssVariableMap, contrastRatio } from '@/domain/profile';

const stylesheets = [
  'src/app/globals.css',
  'src/app/tui-shell.css',
  'src/features/board/board-surface.css',
  'src/features/solo/solo-game.css',
] as const;

const SEMANTIC = /--(correct|present|absent|removed|danger|warning|disabled)\b/;
const ACCENT_DERIVED = /--(accent|attention-ink|custom-accent|custom-key-ink|key-unknown-ink)/;

interface Rule {
  file: string;
  line: number;
  selector: string;
  declarations: Map<string, string>;
}

/*
 * Deliberately a flat scan of `selector { ... }` blocks rather than a real parser: the
 * rule being enforced is about what a single rule *declares* together, so nesting and
 * at-rule context do not change the answer, and a dependency-free check is one that
 * actually keeps running.
 */
function readRules(): Rule[] {
  const rules: Rule[] = [];
  for (const file of stylesheets) {
    const source = readFileSync(path.resolve(process.cwd(), file), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      const selector = match[1]!.trim();
      const body = match[2]!;
      if (!selector || selector.startsWith('@')) continue;
      const declarations = new Map<string, string>();
      for (const declaration of body.split(';')) {
        const index = declaration.indexOf(':');
        if (index < 0) continue;
        declarations.set(declaration.slice(0, index).trim(), declaration.slice(index + 1).trim());
      }
      rules.push({
        file,
        line: source.slice(0, match.index).split('\n').length,
        selector,
        declarations,
      });
    }
  }
  return rules;
}

describe('accent and semantic colour contract', () => {
  /*
   * DESIGN.md 110-112: semantic colours never inherit the player accent. `.badge` paired
   * `background: var(--present)` with `color: var(--accent-ink)`, and because a custom
   * accent flips that ink to white by luminance, the pairing measured 2.02:1 in dark
   * scheme. Nothing caught it: the contrast sweep only walks controls, and it excluded
   * custom accents entirely.
   */
  it('never paints accent-derived ink on a semantic background', () => {
    const offenders = readRules()
      .filter((rule) => {
        const background =
          rule.declarations.get('background') ?? rule.declarations.get('background-color');
        const color = rule.declarations.get('color');
        if (!background || !color) return false;
        return SEMANTIC.test(background) && ACCENT_DERIVED.test(color);
      })
      .map(
        (rule) => `${rule.file}:${rule.line} ${rule.selector} -> ${rule.declarations.get('color')}`,
      );
    expect(offenders).toEqual([]);
  });

  /*
   * The generated custom-accent variables are what the six named accents cannot cover.
   * Every one of them has to survive the whole hex space, so this walks the worst cases
   * rather than a happy path: `#767676` sits on bestForeground's ink flip, and the two
   * extremes drive the accent-soft surface to opposite ends in each scheme.
   */
  it('keeps every generated custom-accent pairing readable across the hex space', () => {
    const hexes = ['#767676', '#0B1F3A', '#B4004E', '#FFE066', '#32BFA2', '#FFFFFF', '#000000'];
    const failures: string[] = [];
    for (const hex of hexes) {
      const variables = accentCssVariableMap(hex);
      expect(variables, hex).not.toBeNull();
      if (!variables) continue;
      const pairs: Array<[string, string, string]> = [
        ['accent badge', variables['--custom-accent']!, variables['--custom-accent-ink']!],
        [
          'key light',
          variables['--custom-key-background-light']!,
          variables['--custom-key-ink-light']!,
        ],
        [
          'key dark',
          variables['--custom-key-background-dark']!,
          variables['--custom-key-ink-dark']!,
        ],
        [
          'unread row light',
          variables['--custom-accent-soft-light']!,
          variables['--custom-accent-soft-muted-light']!,
        ],
        [
          'unread row dark',
          variables['--custom-accent-soft-dark']!,
          variables['--custom-accent-soft-muted-dark']!,
        ],
      ];
      for (const [label, background, ink] of pairs) {
        const ratio = contrastRatio(background, ink) ?? 0;
        if (ratio < 4.5) failures.push(`${hex} ${label}: ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });
});
