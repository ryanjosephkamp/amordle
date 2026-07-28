# Alt-Screen TUI Shell v4 Fidelity Ledger

Status: local functional-shell fidelity green. Hosted candidate fields are
completed only after deployment and protected acceptance.

## Comparison

The implementation was inspected against the 1536 × 1024 planning concept and
against native browser captures.

| Comparison point           | Concept authority                                       | Browser result                                                                 | Status |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ | ------ |
| Native terminal frame      | Thin titlebar, traffic lights, centered title           | One responsive root window; decorative lights disappear in forced colors       | Pass   |
| Alternate-screen hierarchy | Path, launcher, buffer, bottom status                   | All routes share path, textual navigation, main buffer, and status line        | Pass   |
| Selection and navigation   | Inverse-video active row and visible shortcuts          | Current route and Home command use inverse video; every row remains clickable  | Pass   |
| Gameplay anatomy           | Numbered rows, contiguous cells, cursor, evidence, keys | Solo and COMBAT reuse numbered/cell/key grammar with a visible active cursor   | Pass   |
| Mobile translation         | Edge-to-edge terminal and unobstructed touch keyboard   | 390px game removes the route dock, retains menu, and keeps 44px keys visible   | Pass   |
| Dense/support surfaces     | Aligned rows rather than cards                          | COMBAT, data, forms, tables, Word Explorer, and status states use shared rules | Pass   |
| Accessibility fallback     | No reliance on translucency or color                    | Forced colors is opaque; status returns to flow; reduced motion stops cursor   | Pass   |

## Native-size evidence inspected

- `shell-home-1440x1024-dark.png`
- `shell-home-320x844-stress.png`
- `solo-390x844-mobile.png`
- `solo-200-percent-forced-colors.png`
- Browser/IAB Home, Solo, COMBAT, Stats, and Word Explorer at 1280 × 720

## Above-the-fold copy

The Home launcher keeps the concept's `solo practice`, `daily`, `combat`,
`words`, and `history` order. Descriptions are player-facing and point to real
routes. The implementation retains the existing `Choose your next game`
heading because route tests, accessibility, and established product language
already use it.

## Intentional deviations

- The functional shell retains real `HomeAttention` data in its own ruled
  region rather than inventing the concept's sample transcript.
- Desktop gameplay keeps authoritative status facts above the board instead of
  moving derived statistics into a right inspector.
- The live board is blank until the player acts; generated guesses and answers
  are never copied into product state.
- Standard gameplay keeps a visible menu on mobile while removing the route
  dock, preserving navigation without covering the keyboard.
- Light mode follows the existing system-theme contract rather than forcing a
  dark-only terminal.
