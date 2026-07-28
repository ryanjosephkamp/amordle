# macOS Liquid Terminal Component Anatomy

## Typography

```css
--font-interface:
  -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif;
--font-terminal:
  ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
```

- Use the interface stack for explanations, long labels, dialogs, and prose.
- Use the terminal stack for the wordmark, navigation, prompts, boards,
  keyboards, clocks, status, shortcuts, tables, and compact metadata.
- Fixed scale: 12, 13, 14, 16, 20, and 24px.
- Default product UI is 14px. Metadata never drops below 12px.
- Use tabular numerals for time, score, progress, balance, rating, and tables.
- Disable discretionary ligatures in terminal and game regions.
- Do not distribute Apple font files. Native macOS receives SF Pro/SF Mono;
  other platforms receive the declared system fallbacks.

## Material layers

### Backplate

- Desktop uses the original light/dark backplate behind the application window.
- Crop from the center and preserve low-detail space behind the window.
- Derive AVIF and WebP production files; retain PNGs only as design provenance.
- Mobile removes the backplate and extends the terminal canvas edge-to-edge.

### Regular Liquid Glass

Allowed only for:

- titlebar;
- navigation selector;
- utility cluster;
- mobile topbar and bottom dock;
- menus, popovers, sheets, and command palette;
- compact action toolbars that float above content.

Baseline implementation:

```css
backdrop-filter: blur(28px) saturate(1.25);
-webkit-backdrop-filter: blur(28px) saturate(1.25);
```

Use a translucent neutral fill, a one-pixel specular edge, a subtle inner top
highlight, and a small controlled shadow. Do not use broad glowing shadows.
Use opaque material when backdrop filters are unsupported, contrast is
increased, or forced colors are active.

### Matte content

The following are always matte standard material:

- boards, tiles, and keyboards;
- transcripts, tables, source lists, and inspectors;
- forms and settings groups;
- results, empty states, and recovery content;
- nested work regions.

Glass may sit above matte content; glass may not contain another glass panel.

## Geometry

| Element                      |            Radius |     Minimum height |
| ---------------------------- | ----------------: | -----------------: |
| Desktop application window   |              16px | viewport-dependent |
| Glass selector/popover/sheet |              12px |  content-dependent |
| Standard control             |               7px |      44px on touch |
| Matte content pane           |               6px |  content-dependent |
| Tile/key                     |               4px |      44px on touch |
| Compact status token         | full pill allowed |               24px |

Spacing uses 4, 8, 12, 16, 24, and 32px. Do not invent one-off page spacing.

## Application frame

### Desktop

- Window width: `min(94vw, 1480px)`.
- Window height may fill available space but retains safe outer background.
- Titlebar: 52px, traffic lights left, wordmark, centered navigation selector,
  utility cluster right.
- Traffic lights are decorative, `aria-hidden`, and `pointer-events: none`.
- Context/status line: 32px immediately below the titlebar.
- Main content is one continuous terminal canvas.
- Footer status/shortcut line: 34px when the route benefits from it.

### Mobile

- Edge-to-edge terminal canvas; no fake desktop window or traffic lights.
- Topbar: 48px minimum.
- Bottom dock: 64px minimum plus safe-area inset.
- Primary gameplay stays above the dock and within the usable viewport.
- Five destinations: Home, Solo, Daily, Combat, Data/More as route context
  permits.

## Navigation and command palette

- Desktop navigation is a compact glass selector with text labels.
- Selection uses background luminosity, cyan-teal rule, and current-page
  semantics; never color alone.
- `Command-K` opens a code-native command palette for route navigation.
- The palette lists human-readable actions with optional shortcuts.
- It closes on Escape, restores focus, and never captures keys while a form or
  game text input is active.
- No gameplay flow requires a typed command.

## Terminal panes

A terminal pane has:

1. optional source-list or prompt rail;
2. compact title/context line;
3. matte content body;
4. optional inspector;
5. optional terminal status line.

Pane borders are quiet separators, not card decoration. Nested equal-weight
panes are prohibited.

## Home

- First task: `Choose a game`.
- Three primary command rows: Start Solo, Play Daily, Open Combat.
- Each row has prompt/selection state, ordinary-language description, optional
  shortcut, and visible focus.
- Real active-session/account attention follows as transcript rows.
- Progress, balance, save/connectivity, and sound live in the compact status
  footer rather than separate cards.

## Solo and Daily

- Board, keyboard, and next valid action dominate.
- Numbered rows may supplement but never replace semantic row labels.
- Draft row uses a cyan-teal cursor/focus treatment.
- Correct: green plus `✓`; present: amber plus `~`; absent: slate plus `×`;
  removed: strike plus legend.
- GO seeded rows are labeled `SEED EVIDENCE`.
- HUD reports mode, length, difficulty, puzzle progress, attempt/move count,
  timer where applicable, and save state.
- Secondary evidence and definitions use a matte inspector or transient sheet.
- Glass is limited to the top action toolbar and transient confirmation.

## COMBAT

- Desktop active play uses symmetric participant panes and a shared
  turn/clock line.
- Mobile shows a compact opponent summary above the dominant player board.
- Waiting gives a plain-language explanation and safe exit.
- Recovery states explain automatic retry and preserve the authoritative game.
- Result order: outcome, participant score/rating facts, rewards/settlement,
  rematch, navigation.
- Spectation is labeled `READ ONLY` and has no mutation controls.

## Forms and dense data

- Profile/Auth use grouped inspector rows, not one giant bordered form.
- Settings use familiar grouped preferences and explicit save state.
- Tables have stable columns, sticky headers where useful, tabular numerals,
  selected rows, and a detail inspector.
- Mobile tables become key/value transcript rows without changing data.
- Word Explorer uses source list plus definition inspector on desktop and
  list/detail navigation on mobile.

## Interaction states

Every interactive component implements:

- default;
- hover;
- focus-visible;
- pressed/active;
- selected;
- disabled;
- loading;
- error where applicable.

Motion lasts 150–220ms with ease-out. Reduced motion removes transforms and
animated blur, leaving immediate state changes or short opacity transitions.

## Accessibility fallbacks

- Forced colors remove backplates, transparency, blur, decorative shadow, and
  specular highlights.
- Unsupported `backdrop-filter` uses opaque system material.
- Focus rings remain outside component edges and meet contrast requirements.
- Mobile targets are at least 44×44 CSS pixels.
- 200% zoom and 320px width must not create document-level horizontal scroll.
- Evidence, selection, save, turn, and error state never depend on color alone.
