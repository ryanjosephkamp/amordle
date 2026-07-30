# Amordle Stage 2 v5.3 evidence package

Status: implemented and accepted as a protected Preview review candidate.

This package records the bounded v5.3 refinement authorized on 2026-07-29.
It does not supersede the v5.1 visual authority. It documents the approved
keyboard semantics, multiplayer presentation repairs, silent persistence UI,
account quick tools, and physical-keyboard navigation added on top of that
authority.

## Binding refinements

- Unguessed keys use a raised blue-gray field surface.
- Ruled-out keys use a near-black surface with light text and a visible `×`.
- Correct, present, absent, and removed evidence retains domain precedence.
- COMBAT derives both participants' keyboards from the same current-puzzle
  chronological board.
- GO resets keyboard evidence between puzzles and rebuilds it from current
  moves and rescored seed rows.
- Routine saving and synchronization remain silent and do not shift gameplay.
- The mobile COMBAT status row, row number, separator, actor, and guess columns
  remain independently legible.
- The account popover is limited to Level, XP, Coins, View profile, and Sign
  out.
- Global navigation uses Shift+1 through Shift+5 and Shift+M from one canonical
  registry without taking ordinary gameplay input or editable-field input.

## Evidence

The machine-readable inventory is `manifest.json`. Hosted screenshots came
from the zero-residue disposable run
`e2e_20260730T015100863Z_31be382e_79abdb4c`. Local responsive screenshots came
from the exact same application commit under the required Playwright matrix.

All controls, text, tiles, keyboards, and game states are code-native. No
generated art or copied third-party asset is included.
