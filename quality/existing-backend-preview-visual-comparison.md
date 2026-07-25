# Existing-backend preview visual comparison

This ledger compares the routed existing-backend preview with the locked Concept
Gallery. It records visual fidelity separately from functional availability so a
disabled capability cannot look deceptively complete.

## Evidence reviewed

- Authority: `.codex-internal/authority/bootstrap/concepts/locked/L03.png` and
  `L04.png` (COMBAT hub desktop and mobile).
- Runtime captures:
  `test-results/visual.shell-parity-captur-0cd08-nd-centered-COMBAT-evidence-visual-desktop/combat-real-lobby-surface.png`
  and
  `test-results/visual.shell-parity-captur-0cd08-nd-centered-COMBAT-evidence-visual-mobile/combat-real-lobby-surface.png`.
- Broader automated capture: `tests/e2e/visual.gallery.spec.ts` and
  `tests/e2e/visual.shell-parity.spec.ts`.
- Interaction coverage: `tests/browser/combat-preview-components.test.tsx`,
  `tests/e2e/fixture.navigation.spec.ts`, and
  `tests/e2e/fixture.checkpoint-2-support.spec.ts`.

## Comparison

| Dimension           | Locked intent                                                                                                                   | Preview result                                                                                                                                                                                                                                | Decision                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Composition         | Lobby-first COMBAT workspace with a persistent destination shell, central exchange, and contextual right rail.                  | The routed Lobby remains the central reading surface. The capability boundary occupies the contextual rail without displacing the lobby or turning the route into a generic dashboard.                                                        | Pass for the enabled preview.                                            |
| Density             | Thin ledger rules, compact tabs, small status text, and scan-friendly rows.                                                     | Header, tabs, empty-state copy, capability rows, and help handoff retain the compact ledger rhythm. Empty live data is not padded with fictional opponents or matches.                                                                        | Pass.                                                                    |
| Hierarchy           | `COMBAT` and active attention lead; Lobby state is primary; ranked and Live actions are secondary.                              | Active count and COMBAT title lead. The Lobby tab and public-Practice heading precede the capability disclosure. Disabled lanes are explicit and subordinate.                                                                                 | Pass with truthful capability substitution.                              |
| Typography          | Condensed display hierarchy with monospaced operational copy.                                                                   | Display headings, tab labels, status values, and body copy preserve the established condensed/mono pairing and restrained tracking.                                                                                                           | Pass.                                                                    |
| Interaction state   | Resume, join, creator cancel, ranked queue, and Live are distinguishable and cannot rely on color alone.                        | Enabled Practice create/join/cancel and Ranked Daily queue actions have text labels, status announcements, and disabled/empty representations. Ranked Practice and Live are labeled `Disabled` rather than rendered as fake interactive rows. | Pass for enabled paths; deferred paths remain intentionally unavailable. |
| Responsive behavior | Desktop rails recompose into a board-first/mobile ledger with persistent bottom navigation and no horizontal document overflow. | The mobile capture moves the capability ledger in-flow and retains the bottom dock. The tab strip is horizontally scrollable at narrow widths so targets remain usable without document overflow.                                             | Pass with a documented navigation-strip deviation.                       |
| Fire/ice identity   | Ember-left and frost-right atmosphere frames a calm graphite center.                                                            | The preview keeps the same perimeter treatment, near-black central ledger, fine borders, green interaction emphasis, and restrained status color.                                                                                             | Pass.                                                                    |
| Privacy meaning     | Public rows are sanctioned and answerless; restricted states are not implied to be public.                                      | The empty lobby copy is answerless, the boundary names cooperative authority limits, and public Live/exact-ID spectation fail closed.                                                                                                         | Pass; this is stricter than the illustrative concept.                    |

## Copy differences

- Locked illustrative player names, active counts, scores, latency, and Live
  totals are not copied. Runtime data appears only when returned by approved
  projections.
- `CAPABILITY BOUNDARY`, `Cooperative preview`, and the explicit disabled-lane
  descriptions are new. They prevent a participant-writable Practice preview
  from being mistaken for cheat-resistant ranked authority.
- The locked `OPEN LIVE` handoff is absent because the retained schema cannot
  prove that an exact Practice game is public rather than private, Daily, or a
  rematch.

## Interaction review

- Public Practice setup validates length, difficulty, Hard Mode, GO count, and
  clock before any word-list request.
- Lobby create, join, creator cancel, reload, query reconciliation, and
  same-account draft restoration use the routed repository rather than proof
  fixtures.
- Ranked Daily create, claim, cancel, finalize, play, and settlement use the
  retained private RPC authority and expose answerless projections.
- Physical and on-screen keyboard commands share the existing reducer; the
  keyboard component itself is unchanged.
- Realtime only invalidates durable reads. Polling pauses when hidden/offline
  and rereads immediately after visibility or connectivity returns.

## Deviations and fidelity statement

The preview materially retains the concepts' composition, density, hierarchy,
typography, responsive ledger behavior, and fire/ice identity. It deliberately
does not reproduce fictional data or interactive affordances for Ranked
Practice, public Live, unranked Daily, or complete private/rematch handoffs.
Those differences are functional honesty, not visual drift. Active and terminal
states for disabled capabilities remain test-harness visual evidence only and
must not be interpreted as production runtime availability.
