# Amordle Quiet System Shell

Status: the user authorized the v5.1 UX continuity refinement on 2026-07-29.
This authority builds on the v5 responsive shell and preserves every prior
package as immutable provenance under `design/references/stage2/`.

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
- COMBAT presents one centered chronological, actor-labelled transcript at
  every viewport. Actor labels sit beside the shared row; players never own
  separate left and right guess lanes.
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
- Calendar uses a seven-column month grid, concise day states, arrow and swipe
  month navigation, one compact selected-day inspector, and progressive
  disclosure for arbitrary-date and date-basis details.
- Routine successful persistence is silent. A failed account backup is a
  bounded, retryable notice that accurately says the device save is safe.
- Word selection opens an accessible detail dialog; the player never has to
  travel to the bottom of a long list to copy or search the word.
- Recognized legacy account state is projected into the current UI without
  overwriting its source payload. New successor state remains private and
  separately revisioned.

## Keyboard evidence semantics

- An unguessed key uses the raised blue-gray field surface. It remains visually
  distinct from every scored state.
- A ruled-out key uses the same near-black surface and light lettering as an
  absent board tile, plus a visible `×` cue and an announced absent state.
- Correct, present, absent, and removed evidence follows the precedence defined
  by the game domain. Consumable removal overlays scored evidence and remains
  visibly distinct.
- In multiplayer, both participants derive their keyboard from the shared
  chronological board. In GO, the keyboard resets at each puzzle boundary and
  is rebuilt from the current puzzle and its rescored seed evidence.
- Submit and Delete are neutral action keys and use the unguessed field
  surface; they never imply letter evidence.

## Physical keyboard contract

- Global navigation uses the single registry at
  `src/config/keyboard-shortcuts.json`.
- Direct route shortcuts require Shift so ordinary gameplay letters and numbers
  retain their normal meaning.
- Global shortcuts pause while an editable field or modal dialog owns focus.
- The Help surface and the Markdown/HTML keyboard manuals are generated or
  rendered from the same registry; `pnpm check` rejects manual drift.

## Prohibited presentation

Do not restore faux traffic lights, titlebars, window borders, decorative
wallpaper, fixed bottom navigation during play, box-drawing frames around every
region, nested glass cards, generic SaaS dashboards, scanlines, CRT distortion,
Matrix effects, fake command output, excessive glow, or terminal-only
interaction.

## v6.2 community and review-state extension

- The six named profile accents may replace the shell's non-semantic cyan
  tokens. Correct, present, absent, removed, warning, danger, and disabled
  colors never inherit the player accent.
- Profile images are square, profile-page-only identity elements. They do not
  appear inside boards, leaderboards, lobbies, notifications, or dense player
  lists. Missing and failed images use a deterministic initials treatment.
- Player names are links only when the current projection includes a sanctioned
  public profile identifier. The UI never constructs a profile route from an
  Auth UUID or private identifier.
- Public ratings use responsive terminal records rather than fixed desktop
  tables. Mobile labels and values must not wrap one character per line.
- Active play retains the contained dynamic-viewport contract. Terminal result
  and review routes deliberately release the document for vertical touch
  scrolling, render normal-flow navigation, and must not overlap the result.
- Definition content uses an accessible modal or inline terminal section and
  is fetched only after a deliberate request. It does not prefetch an entire
  word list or History page.
