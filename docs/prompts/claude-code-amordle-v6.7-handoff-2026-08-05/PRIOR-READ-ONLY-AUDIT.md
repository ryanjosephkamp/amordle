# Prior Read-only Audit Findings

These findings came from the final Codex Plan-mode repository audit immediately
before the Claude Code handoff. They are **advisory leads**, not substitutes for
Claude's independent source audit. Revalidate every path, selector, state, and
contract before relying on it.

## Current implementation leads

- Light-control contrast appears to be a systemic cascade problem. The existing
  Profile selected-accent/Save Profile foreground is the intended dark
  foreground authority, while generic `.data-row` descendant rules can
  re-inherit a muted foreground on light controls.
- Notifications currently render a strong status followed by one combined
  localized timestamp. The owner wants separately aligned status, local date,
  and local time on desktop with a compact responsive form.
- Active Solo currently uses a generic data-row presentation, which does not
  provide a stable desktop field/action grid.
- Players filter inputs, selects, and Apply action do not share one explicit
  control block-size token.
- The durable rating authority currently identifies six separate ranked lanes:
  - `async:og:amordle:v2`
  - `async:go:amordle:v2`
  - `async:og:timed:amordle:v2`
  - `async:go:timed:amordle:v2`
  - `async:og:daily:v1`
  - `async:go:daily:v1`
- Stats already uses durable projections and code-native visual elements, but
  current generic rating labels and narrow card allocation obscure lane
  identity and strand unused width. The owner requested a source-grounded
  visualization overhaul, not fabricated history.
- Account security/danger dialogs use native `<dialog>` surfaces. The accent
  preset dialog already demonstrates a centered presentation; the account
  dialogs require a shared modal geometry and safe dismissal audit.
- Ordinary sign-in currently completes authentication without routing the user
  to Home. Any protected-route `returnTo` behavior must be constrained to safe
  same-origin application destinations.
- The toolbar Account trigger is currently generic. Its new label must use the
  current account's player name, then a bounded owner-only email-derived
  fallback, then `guest`, without cross-account cache flash.
- `WordDefinition` receives the authorized word but does not itself guarantee
  that the word is visibly rendered in the same definition region. The fix must
  preserve existing reveal authority and never broaden answer access.

## Prior implementation recommendation

No database migration, new application API route, provider mutation, paid
service, or chart dependency was expected to be necessary for the mandatory
owner feedback. Claude must stop and prepare a separate decision packet if its
fresh audit proves otherwise.

The previously recommended order was:

1. add failing regressions and revalidate the v6.6 golden baseline;
2. repair shared contrast tokens plus Notifications, Active Solo, and Players;
3. standardize true modal dialogs without changing anchored menus/tooltips;
4. implement safe sign-in routing and identity-aware Account labeling;
5. enforce the definition-word invariant with answer-privacy tests;
6. complete the source-grounded Stats overhaul;
7. run full local acceptance;
8. deploy the exact green commit to a protected Preview;
9. run bounded hosted acceptance and privacy probes;
10. clean exact disposable resources;
11. reconcile parity, run state, reports, and checklists;
12. create the final private golden checkpoint for owner review.

## Additional whole-product review requested for Claude

Beyond the twelve mandatory annotations, the owner wants Claude to inspect the
complete current game and propose evidence-backed improvements that make the
frontend materially more polished. Claude should:

- audit every route at representative mobile, intermediate, desktop, zoom,
  light/dark, forced-color, reduced-motion, keyboard, mouse, and touch states;
- inspect empty, loading, partial, offline, error, success, pending, disabled,
  and terminal states;
- identify genuine bugs, accessibility failures, layout collisions, ambiguous
  copy, inconsistent control rhythms, and performance risks;
- classify findings as mandatory regression, high-value polish, optional
  enhancement, or separately gated architecture/service work;
- provide source or reproducible evidence for every finding;
- avoid reopening accepted behavior merely for personal taste;
- keep dependency/framework upgrades optional and separately justified with
  compatibility, migration, bundle, testing, cost, and rollback analysis.
