# Amordle Stage 1 Design Foundation

Status: Stage 1 functional terminal foundation is green. Three coordinated
Stage 2 boards and their provenance manifest are ready under
`design/references/stage2/`; final visual direction remains gated for explicit
approval.

## Scene and strategy

A player opens Amordle at a desk, on a train, or in bed under whatever ambient
light their system theme already reflects, and wants the board to become
immediately legible without visual ceremony.

Use a restrained product palette: neutral system surfaces and one sky-teal
accent occupying less than ten percent of the interface. Color communicates
interaction and evidence; it is not decoration.

## Theme

- Follow the system light/dark preference by default.
- Use true neutral or brand-hued neutral backgrounds, never cream, parchment,
  atmospheric texture, or ornamental gradients.
- Keep material depth subtle and removable. No glass is required for state
  meaning.

## Color tokens

Use OKLCH values throughout.

| Token      | Light                    | Dark                     | Role              |
| ---------- | ------------------------ | ------------------------ | ----------------- |
| Background | `oklch(0.985 0.004 200)` | `oklch(0.145 0.012 220)` | Page              |
| Surface    | `oklch(0.955 0.008 205)` | `oklch(0.205 0.014 220)` | Panels and rails  |
| Ink        | `oklch(0.205 0.018 220)` | `oklch(0.94 0.008 205)`  | Primary text      |
| Muted      | `oklch(0.45 0.018 220)`  | `oklch(0.72 0.014 210)`  | Secondary text    |
| Border     | `oklch(0.84 0.012 210)`  | `oklch(0.34 0.016 220)`  | Separation        |
| Accent     | `oklch(0.65 0.10 200)`   | `oklch(0.74 0.105 200)`  | Actions and focus |
| Correct    | `oklch(0.63 0.15 145)`   | `oklch(0.70 0.15 145)`   | Exact evidence    |
| Present    | `oklch(0.72 0.14 85)`    | `oklch(0.78 0.14 85)`    | Present evidence  |
| Absent     | `oklch(0.58 0.018 220)`  | `oklch(0.46 0.018 220)`  | Absent evidence   |
| Removed    | `oklch(0.52 0.06 25)`    | `oklch(0.66 0.07 25)`    | Removed key       |
| Danger     | `oklch(0.58 0.20 28)`    | `oklch(0.70 0.18 28)`    | Destructive/error |

## Typography

- Geist for prose, headings, labels, and standard controls.
- Geist Mono for boards, status lines, tables, shortcuts, clocks, and data.
- Use a compact fixed type scale. Do not use fluid display typography in the
  product shell.
- Cap explanatory prose at 72 characters per line.

## Layout and components

- Desktop uses a top navigation rail with clear grouped destinations.
- Mobile uses reachable bottom navigation where it improves play.
- Gameplay keeps status, board, and keyboard together in the usable viewport.
- Prefer open rails, lists, tables, and controlled scroll regions over repeated
  cards.
- All controls have default, hover, focus, active, disabled, loading, and error
  states where applicable.
- Standard radius: 8px controls, 12px bounded panels, full-pill only for true
  tags or compact status.
- Semantic z-index layers: navigation, dropdown, sticky game status, backdrop,
  modal, toast, tooltip.

## Motion

Use 150–250ms state transitions with an ease-out curve. Motion may confirm
state, reveal accepted tiles, or support GO transitions. It may not delay
operation or decorate page load. Respect `prefers-reduced-motion`.

## Stage 2 gate

The proposed Stage 2 concepts record exact copy, palette, typography, component
and container rules, icon treatment, responsive behavior, SHA-256, dimensions,
provenance, binding role, and required corrections in
`design/references/stage2/reference-manifest.json`. They are not approved yet.
Stage 1 functionality and service contracts remain immutable through that
review.
