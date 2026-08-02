# Amordle Stage 2 v6.5.1 — Menu Layering Repair

## Outcome

The terminal Menu now renders above the game status/header row and all normal
page content on both mobile and desktop. The repair is deployed to a protected
Preview and has passed the complete local and hosted acceptance stacks.

- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- v6.5 golden baseline: `68c28c1be51f3db75eb9facc8478e285bfd6c473`
- Application repair: `f4ba9de031400eef3be7fa2ef134750e1d8e265c`
- Evidence checkpoint: `d27081b7128e0c769716363357204297ed83ea8a`
- Deployment: `dpl_4QniuMyXds5vjRSqtVJxewtJ8ti1`
- Protected Preview: <https://amordle-77f8b403z-ryanjosephkamps-projects.vercel.app>
- Hosted run: `e2e_20260802T043218080Z_f4ba9de0_5eccd35b`
- Status: ready for owner review; not merged and not released to Production.

## Root cause and repair

The Menu itself used the dropdown layer, but its `.global-chrome` ancestor
created a lower stacking context than the game's sticky status row. A child
cannot escape its ancestor's stacking context, so part of the status row could
paint over the open Menu.

The shared layer scale now gives the global chrome its own explicit layer:

| Surface                        |            Layer |
| ------------------------------ | ---------------: |
| Normal page and game content   |             base |
| Dropdowns inside global chrome | 30 within chrome |
| Sticky game/page content       |               40 |
| Global chrome and its popovers |               45 |
| Modal backdrop                 |               50 |
| Modal dialog                   |               60 |

This keeps the Menu, Account, and Alerts popovers above ordinary page content
while preserving the required ordering of modal backdrops and dialogs.

## Regression proof

A new browser journey opens a Solo GO game at 390×844 and 1440×900, opens the
Menu, samples the geometric intersection between the Menu and game status row,
and verifies with hit testing that the topmost rendered element belongs to the
Menu. The test failed at the mobile width before the CSS repair and passes at
both widths afterward.

The complete local stack passed for the exact application repair:

- `pnpm check`;
- 109 domain tests;
- 20 browser/component tests;
- 20 fixture journeys across Chromium, Firefox, and WebKit;
- 11 visual/responsive journeys;
- 237/237 functional clauses and 73/73 multiplayer audit clauses;
- 107/107 bootstrap files;
- 45 immutable plus 6 authorized additive migrations;
- exactly 3 application HTTP interfaces.

The complete hosted `pnpm test:acceptance` command passed against the protected
Preview:

- 20 fixture journeys;
- 2 serial real-service multiplayer journeys;
- 11 visual/responsive journeys;
- 237/237 acceptance-verified parity rows.

Bundle receipts remain inside the established budgets:

- Home: 191,258 B compressed JavaScript and 23,026 B CSS;
- gameplay: 197,126 B compressed JavaScript and 27,513 B CSS;
- deployment word assets: 34/34 and 6,097,886 B.

## Hosted cleanup

Run `e2e_20260802T043218080Z_f4ba9de0_5eccd35b` completed cleanup on attempt 1:

- 3 disposable Auth users removed;
- 7 games removed;
- 3 ranked Practice and 3 ranked Daily queue records removed;
- 1 private request and 1 rematch request removed;
- 25 accent presets and 1 avatar object removed;
- all dependent game, rating, History, progression, economy, profile,
  preference, Storage, and Auth residue probes returned zero.

Status: `zero-residue`.

## Preserved boundaries

- Production remains Ready at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.
- No migration, Storage authority, provider setting, dependency, HTTP
  interface, game rule, data contract, or persistence format changed.
- The private default branch, real players, existing visible E2E profiles,
  word authority, and locked BRRRDLE-DEV shell remain unchanged.
- No merge, Production release, force push, history rewrite, or paid capability
  occurred.

Rollback is a forward revert and redeployment of the exact v6.5 golden baseline
`68c28c1be51f3db75eb9facc8478e285bfd6c473`.

## Manual review gate

Use the paired v6.5.1 checklist on the protected Preview. Merge and Production
release remain separately authorized actions.
