# Amordle Stage 2 v5 local checkpoint

## Outcome

The quiet system-shell correction is implemented at application commit
`8b092bf002584bef402ab37efbdd8ef2b4c58852`.

This checkpoint removes the faux macOS window frame and traffic lights, reduces
global chrome, makes Calendar materially quieter, and contains active Solo and
COMBAT play within the available browser viewport. At the initial six-row game
state, the full board and complete keyboard are visible without document
scrolling at every tested standard portrait and landscape phone size.

Rows beyond the initial history remain available through an internally scrolling
history viewport. The viewport follows new rows only while the player is already
at the latest row; manual review is preserved until the visible `Latest row`
control is used. COMBAT now uses one chronological, actor-labelled transcript
instead of side-by-side histories.

## Local acceptance receipt

- `pnpm check`: green
- `pnpm test:domain`: 18 passed
- `pnpm test:browser`: 6 passed
- `pnpm test:e2e:fixture`: 12 passed across Chromium, Firefox, and WebKit
- `pnpm test:visual`: 6 passed
- `pnpm test:acceptance:local`: green
- Responsive play matrix: 9/9 green
- Mobile synthetic vitals: LCP 104 ms, INP 40 ms, CLS 0
- Home compressed budget: 173,388 B JavaScript; 14,273 B CSS
- Gameplay compressed budget: 179,940 B JavaScript; 18,074 B CSS
- Contract checks: 237/237 parity rows, 107/107 bootstrap files, 45/45
  migrations, exactly three HTTP interfaces

The responsive matrix covers portrait 320×568, 360×640, 390×667, 390×844, and
412×915, plus landscape 568×320, 667×390, and 844×390. The wider regression
matrix also covers 768, 960, 1440, and 1920 widths, system light/dark,
forced-colors behavior, reduced motion, Focus Mode, and 200% zoom.

## Hosted boundary

No v5 Preview was deployed. `pnpm test:e2e:services` stopped before test or
service mutation because the protected `E2E_BASE_URL` context was intentionally
not supplied. No disposable accounts, games, rows, Storage objects, or Blob
objects were created.

The existing protected v4 Preview remains
`dpl_5oQcXaBsCf8uUDLGeSnV3BnfMaYN`. Production
`dpl_739mtwiXc9pZPef3pxsKumwC9DfG`, the default branch, 45 migrations, real
accounts, and the locked shell remain unchanged.

Protected v5 deployment and hosted service acceptance resume only after the
account owner rotates or revokes the previously exposed Preview-scoped Vercel
Blob credential.

## Review references

- Design authority:
  `design/references/stage2/v5-quiet-system-shell-responsive-play-2026-07-28/REFERENCE-MANIFEST.md`
- Fidelity ledger:
  `design/references/stage2/v5-quiet-system-shell-responsive-play-2026-07-28/fidelity-ledger.md`
- Hosted follow-up:
  `acceptance/stage-2-v5-hosted-follow-up.md`
