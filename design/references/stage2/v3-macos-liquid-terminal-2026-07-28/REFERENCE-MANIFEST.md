# Amordle Stage 2 v3 Reference Manifest

Status: **pending explicit user approval**

Package ID: `amordle-stage2-v3-macos-liquid-terminal-2026-07-28`

This package proposes a replacement for the approved Quiet Workbench v2
presentation. It does not change game rules, routes, persistence, service
authority, APIs, migrations, or acceptance requirements. Quiet Workbench
remains the binding visual authority until this package is explicitly approved.

## Recommendation

Approve **Mac shell + Grok core** as the Stage 2 v3 visual authority.

The design combines:

- a unified macOS-like application window;
- regular Liquid Glass for navigation, toolbars, docks, popovers, and sheets;
- a matte terminal content plane for boards, tables, forms, and transcripts;
- SF Pro system typography for human-readable prose and controls;
- SF Mono system typography for navigation, prompts, game state, and data;
- Grok Build-inspired TUI density, alignment, shortcuts, and selection;
- ordinary browser controls that remain understandable without terminal
  experience.

## Governing assets

| Asset                                     | Binding role                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `approval-board-shell-home.png`           | App window, titlebar, desktop/mobile navigation, Home command launcher, status footer, shell anatomy |
| `approval-board-solo-daily.png`           | Solo OG/GO, board, keyboard, evidence, HUD, Calendar, purchase confirmation                          |
| `approval-board-combat.png`               | Waiting, active play, mobile priority, results/rematch, recovery, privacy-safe spectation            |
| `approval-board-account-data-support.png` | Profile, Settings, History, Stats, Leaderboards, Word Explorer, exceptional states                   |
| `approval-board-mobile-materials.png`     | Mobile translation, component variants, material boundaries, light/dark/forced-colors behavior       |
| `assets/background-dark.png`              | Original dark backplate source for derived production assets                                         |
| `assets/background-light.png`             | Original light backplate source for derived production assets                                        |

The images bind layout, hierarchy, material placement, typography character,
palette relationship, density, component anatomy, and responsive direction.
Generated names, words, dates, ratings, balances, histories, definitions, and
icons are layout samples only. Repository contracts and real service data
remain authoritative.

## Decision locks

- Desktop uses one centered application window; mobile is edge-to-edge.
- Decorative traffic lights appear only on desktop and are not interactive.
- Glass is a functional control layer, never the default content material.
- The board, keyboard, tables, inspectors, transcripts, and forms remain matte.
- Dark appearance is the primary approval view; system light appearance has
  equal functional and accessibility quality.
- SF system stacks are used without redistributing Apple font files.
- A command palette may accelerate navigation, but typed commands never become
  required gameplay.
- Code-native UI uses a consistent line-icon family. No Apple or xAI marks,
  logos, wallpapers, or distinctive trade dress are copied.
- Background sources are optimized into responsive AVIF/WebP derivatives
  before shipping; source PNGs remain design provenance.

## Governing documents

- `reference-manifest.json`: machine-readable provenance and binding roles.
- `component-anatomy.md`: exact typography, material, geometry, layout, and
  responsive rules.
- `copy-register.md`: visible copy and prompt-language limits.
- `research-notes.md`: structural, technical, mood, and anti-reference
  classifications.
- `generation-prompts.md`: exact Image Gen provenance.
- `rejected-directions.md`: alternatives that may not re-enter implementation.
- `approval-checklist.md`: the single user decision requested at this gate.

## Higher authority

The following remain higher authority than this visual package:

1. `bootstrap/CONSTITUTION.md`
2. `bootstrap/FUNCTIONAL-CONTRACT.md`
3. `bootstrap/BACKEND-AND-SERVICES-CONTRACT.md`
4. `bootstrap/TESTING-AND-ACCEPTANCE-CONTRACT.md`
5. `bootstrap/PRODUCT-BRIEF.md`
6. `PRODUCT.md`

If approved, `DESIGN.md` will be updated in a separate checkpoint to name this
package as the binding visual authority. Until then, no application code may be
implemented from these images.
