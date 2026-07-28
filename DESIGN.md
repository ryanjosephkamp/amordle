# Amordle Quiet System Shell

Status: the user authorized the responsive shell correction on 2026-07-28.
This v5 authority supersedes the Alt-Screen v4 presentation while preserving it
as immutable provenance under `design/references/stage2/`.

This is a presentation-only authority. Game rules, routes, controllers,
persistence, services, the three HTTP interfaces, all 237 clauses, the 107-file
bootstrap baseline, and all 45 migrations remain unchanged.

## Thesis

Amordle should feel like a disciplined terminal-native application without
pretending to be a macOS window. The interface keeps SF Mono, prompt markers,
inverse selection, aligned rows, compact status facts, and dense readable data.
It removes decorative traffic lights, titlebar imitation, wallpaper, enclosing
window borders, box-drawing frames around ordinary content, and fixed mobile
navigation that competes with play.

The browser surface is the application surface. On desktop, one 48-pixel
toolbar carries identity, route context, primary navigation, account state, and
utilities. On mobile, non-game routes add one compact route rail. Active games
use only the 44-pixel play toolbar and dedicate the remaining dynamic viewport
to the board, status, tools, and keyboard.

## Typography and palette

- Use `ui-monospace`, `SFMono-Regular`, `"SF Mono"`, Menlo, Monaco, Consolas,
  and Geist Mono fallbacks throughout visible product UI.
- Preserve the restrained graphite/light-neutral palette and cyan focus role.
  Green, amber, slate, and red retain semantic game meanings.
- Hierarchy comes from alignment, weight, whitespace, rules, and inverse
  selection—not ornamental panels, oversized headings, or extra color.

## Responsive play contract

- Active Solo and COMBAT routes are contained within `100dvh`; the document
  does not scroll at standard supported viewports.
- The keyboard is fully visible on entry from 320×568 portrait and 568×320
  landscape upward, accounting for safe areas and the play toolbar.
- Default six-row boards are visible on entry. Longer histories, purchased
  continuations, GO evidence, and long words scroll only inside named history
  regions.
- New accepted rows follow the latest row only while the player is already
  following. Manual history scrolling is never overridden. A visible
  `Latest row` control restores following.
- COMBAT presents one chronological, actor-labelled transcript. Desktop aligns
  the two actors into symmetric lanes; mobile uses a single readable stream.
- Mobile short-height layouts collapse evidence and optional Solo tools behind
  one disclosure. Core play never depends on opening it.
- Portrait and landscape are distinct compositions rather than scaled copies.

## Shell and component rules

- `AppShell` owns one adaptive toolbar and an optional mobile route rail.
- `WorkbenchRegion` defaults to an open ruled section. The `pane` variant is
  reserved for content that genuinely needs containment.
- Boards and data stay matte. Menus and transient controls may use restrained
  material separation, but decorative glass nesting is prohibited.
- Touch targets remain at least 44 pixels. Keyboard, mouse, touch, screen
  reader, reduced-motion, forced-colors, and 200% reflow operation remain
  mandatory.
- Calendar uses one horizontal 35-day rail, one compact selected-day
  inspector, and progressive disclosure for arbitrary-date and date-basis
  details.

## Prohibited presentation

Do not restore faux traffic lights, titlebars, window borders, decorative
wallpaper, fixed bottom navigation during play, box-drawing frames around every
region, nested glass cards, generic SaaS dashboards, scanlines, CRT distortion,
Matrix effects, fake command output, excessive glow, or terminal-only
interaction.
