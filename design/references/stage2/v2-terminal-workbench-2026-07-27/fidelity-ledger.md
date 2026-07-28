# Stage 2 v2 Fidelity Ledger

Status: **local fidelity green; protected hosted-state evidence pending**

Quiet Workbench is the approved baseline. The machine-readable ledger is
[`fidelity-ledger.json`](./fidelity-ledger.json).

## Result

The implementation passes all objective professional thresholds:

- every score is at least 4/5;
- every surface total is at least 43/50;
- terminal authenticity is at least 4/5 for every surface;
- no forbidden fake-terminal, cyberpunk, glass, glow, scanline, code-rain, or
  generic SaaS-card anti-pattern was observed;
- every major surface has five browser comparisons;
- the matrix covers system light, system dark, 390px mobile, 320px stress,
  reduced motion, forced colors, and 200% zoom;
- every capture was inspected at native size;
- above-the-fold copy and intentional deviations are recorded in the JSON
  ledger.

| Surface | Comparisons | Score | Status |
| --- | ---: | ---: | --- |
| Shell and Home | 5 | 46/50 | Pass |
| Solo | 5 | 48/50 | Pass |
| Daily and economy | 5 | 44/50 | Pass |
| COMBAT | 5 | 43/50 | Local pass; hosted match states pending |
| Account and data | 5 | 44/50 | Local pass; signed-in states pending |
| Word Explorer and support | 5 | 46/50 | Pass |
| Exceptional states | 5 | 48/50 | Pass |

## Evidence

The reproducible capture root is:

`test-results/visual.responsive-responsi-1c758-serves-hierarchy-and-reflow-visual`

Each surface contains:

1. `1440x1024-light`
2. `1440x1024-dark`
3. `390x844-mobile`
4. `320x844-stress`
5. `200-percent-forced-colors`

`pnpm test:visual` also produces the eight-width Home/Solo matrix at 320, 360,
390, 412, 768, 960, 1440, and 1920, plus a separate 200% Solo
forced-colors capture and mobile Web Vitals evidence.

## Native-size comparison findings

- **Shell/Home:** command and context rails, ruled regions, compact typography,
  restrained teal, and player-first command hierarchy bind closely. The
  implementation uses real account attention instead of generated match
  samples.
- **Solo:** game-first composition, evidence-aware tiles, keyboard, status,
  tools, and dark/light relationship are binding and present. Blank state is
  intentionally authoritative; generated words are excluded.
- **Daily/economy:** the ruled calendar, mode rail, date selection, and explicit
  spend boundary bind. The contract-authoritative rolling 35-day calendar
  replaces the generated month sample.
- **COMBAT:** overview hierarchy binds locally. Waiting, symmetric participant
  boards, mobile participant priority, recovery, result/rematch, and
  privacy-safe spectation require protected disposable-user evidence.
- **Account/data:** local unavailable boundaries are deliberate. The protected
  run must add Profile, Settings, Stats, History, and Leaderboard captures from
  disposable accounts.
- **Word Explorer/support:** compact filters, ruled word list, selected-word
  work region, and explicit actions bind. The implementation’s curated
  definition fallback replaces generated dictionary copy.
- **Exceptional states:** text-first status regions and structural skeleton
  rows replace generated icons and spinners, preserving terminal authenticity
  and accessibility.

## Visual acceptance criteria

The local implementation is accepted only while all of the following remain
true:

- one coherent command/context/work-region hierarchy across routes;
- fixed, compact typography with tabular data and readable prose;
- purposeful density without decorative card grids;
- 4/8/12/16/24/32/48 spacing rhythm and low-radius one-rule anatomy;
- system light/dark parity and restrained semantic color;
- complete hover, focus, disabled, selected, loading, empty, unavailable,
  offline, reconnecting, unauthorized, and recovery treatments;
- no horizontal document overflow at required widths or 200% zoom;
- 44px mobile targets, keyboard operation, reduced motion, and forced colors;
- copy remains player-facing and never describes implementation authority;
- terminal identity remains structural, calm, and legible rather than
  theatrical.

The final ledger remains open only for protected signed-in account and real
COMBAT state screenshots, exact service cleanup evidence, and the final
Preview commit/deployment identifiers.
