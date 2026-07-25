# Full Shell Multiplayer-Parity Visual Comparison

## Scope

This ledger records the release-candidate comparison for the routed multiplayer
surfaces implemented after the existing-backend preview. The locked shell
remains behavioral authority; Amordle retains its graphite, fire-and-ice visual
system and does not copy the shell frontend.

## Automated screenshot evidence

- `tests/e2e/services.multiplayer-parity-ui.spec.ts` captures real protected
  Preview states for Ranked Practice at `1440×1024` and `390×844`, plus the
  anonymous mobile Live projection.
- `tests/e2e/visual.gallery.spec.ts` covers desktop and mobile COMBAT overview,
  Lobby, Active, Live, Ranked Daily, privacy boundary, result-unavailable, and
  recovery states.
- `tests/e2e/visual.shell-parity.spec.ts` covers centered shared-board
  composition and the responsive Solo/COMBAT comparison set.
- The required-width fixture matrix passes at 320, 360, 390, 412, 768, 960,
  1440, and 1920 pixels with no document overflow.
- The complete visual run passed 56 of 56 cases.

## Protected Preview browser review

Reviewed against protected Preview deployment
`dpl_iuxRShCciAmVCS9TfNbUNGgGZZYi` at source commit
`aa20bdd411ec24dcc710f2564756fcd8e8c9332b`. A new exact-HEAD Preview is still
required for the final acceptance command.

### Desktop COMBAT overview — 1440×1024

1. **Composition:** persistent left rail, compact top workspace navigation,
   centered COMBAT ledger, and contextual capability rail preserve the locked
   concept hierarchy.
2. **Density:** Daily, Practice, and attention cards expose the primary actions
   without oversized dead space.
3. **Typography:** condensed headings and monospace operational copy remain
   legible and restrained.
4. **Hierarchy:** the Ranked Practice authority notice is subordinate to the
   lane controls but visually distinct through a narrow ice accent.
5. **State:** the backend indicator, zero-active count, and server-authority
   copy reflect the live service rather than a proof fixture.
6. **Responsive behavior:** the 1440-pixel viewport has no horizontal document
   overflow.

### Mobile Practice setup — 390×844

1. **Composition:** the page recomposes into a board-first single column with
   the bottom dock fixed in the safe interaction region.
2. **Density:** mode, length, difficulty, clock, Hard Mode, and lobby action
   remain visible in one coherent setup flow.
3. **Typography:** field labels, selected values, and the primary action remain
   readable without desktop-scale padding.
4. **Hierarchy:** Practice stays selected in the horizontal COMBAT navigation;
   the create action remains the clear primary control.
5. **Interaction state:** native controls and the create button remain
   reachable with one main landmark.
6. **Responsive behavior:** `scrollWidth` equals the 390-pixel client width;
   the bottom dock remains present.

### Real public Live projection — desktop and mobile

The browser reviewed an eligible, live public Practice game through the exact
read-only spectator route.

1. **Composition:** the shared tile matrix is centered exactly within its
   desktop board region (`centerDelta = 0`).
2. **Capacity:** the untouched shared board renders exactly six total rows, not
   six rows per participant.
3. **Identity:** sanctioned public names and compact actor markers are shown;
   no raw Auth identifier is rendered.
4. **Privacy:** the spectator surface declares read-only status, contains zero
   keyboard keys, and exposes no draft, answer, seed, or mutation control.
5. **Mobile behavior:** at 390 and 320 pixels the board remains in flow, the
   bottom dock remains visible, and `scrollWidth` equals `clientWidth`.
6. **Console health:** no warning or error entries were emitted during the
   reviewed COMBAT, Practice, Live, or exact spectator states.

## Real participant viewport assertions

The protected two-account UI test asserts before capture that:

- the initial shared board contains exactly six rows;
- the modular game keyboard is visible;
- the entire keyboard bounding box remains within the active viewport;
- desktop and mobile participants converge on the same Ranked Practice game;
- anonymous spectation has no keyboard;
- invalid guesses do not mutate the authoritative move ledger;
- the server-owned terminal result and rating settlement become visible.

## Concept alignment

- **L01–L06:** lane selection, Lobby, Active, and supporting COMBAT hierarchy
  retain the dense ledger composition.
- **L27–L28:** actor-attributed shared evidence stays centered and chronological.
- **L35–L38:** waiting, active, terminal, and recovery states remain distinct
  without fictional data.
- **L41–L46:** mobile controls, read-only Live, responsive board containment,
  and postgame actions preserve the fire/ice identity.

## Acceptance

The affected multiplayer compositions pass automated screenshots, the live
Browser review, responsive structure checks, and the real protected
multi-account flow. Final acceptance still requires an immutable protected
Preview built from the exact final tracked commit and the complete protected
acceptance command.
