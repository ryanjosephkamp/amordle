# Amordle Stage 2 v6.3 — Accent Personalization Completion

## Outcome

Amordle v6.3 is review-ready on a new protected Preview. Named and custom accent personalization, stable gameplay persistence presentation, centered desktop framing, the compact Profile disclosure, and mobile Stats containment are implemented and acceptance-proven.

- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Application candidate: `35597069a5852a0f42017b0e995f98b5c15cbf83`
- Acceptance evidence checkpoint: `6922cd59ddfeeb79d53c2a4d4922ac1b5e8dc4d5`
- Deployment: `dpl_GJe7uVkz57vS7G9cDAocjuQVBmb7`
- Protected Preview: <https://amordle-p04gk2mv2-ryanjosephkamps-projects.vercel.app>
- Hosted run: `e2e_20260801T195633978Z_35597069_50360ac8`
- Status: ready for owner review; not merged and not released to Production.

## Authorized database authority

The owner authorized `20260801193000_amordle_accent_presets_v2.sql` with SHA-256 `26d488ee2d64e69a6a08a28ef7891e01289874ab6c1de7a1f1eb1ffc6fa75f84`. It is applied to linked project `squqdstdvbsvhagfuzgj` as version `20260801193000`.

The additive authority provides:

- a private owner-scoped preset table with cascade cleanup;
- a transactional 24-preset cap protected by an advisory lock;
- case-insensitive unique preset names and canonical `#RRGGBB` values;
- owner-only list, upsert, and delete security-definer RPCs;
- nullable active-preset metadata and Aurora fallback;
- versioned private/public profile and community projections exposing only the active sanitized hex;
- unchanged v1 profile/community signatures for the existing Production client.

Direct table access remains revoked. RLS is enabled and forced. Public projections expose no preset names, preset ownership, raw Auth IDs, email, settings, private history, economy data, answer, seed, or draft data. Linked types were regenerated after migration application. Local and remote histories are synchronized at 49 migrations: 45 immutable plus four separately authorized additive migrations.

## Implemented experience

- Aurora is the real default for new, missing, invalid, and signed-out accent state; existing saved accents remain unchanged.
- Ice, Aurora, Cyan, Violet, Rose, and Amber have explicit light/dark keyboard palettes.
- Players can create, name, edit, select, and delete up to 24 custom presets from a keyboard-accessible native dialog.
- The active accent controls prompt/focus/cursor surfaces, alert count, unknown keyboard keys, profile decoration, and sanitized public community decoration.
- Correct, present, absent, removed, warning, danger, disabled, and ranked states remain semantic and accent-independent.
- Custom foreground and key colors are derived by deterministic sRGB luminance/contrast logic; forced-colors mode defers to system colors.
- Routine save/sync activity is silent. A fixed-height status rail contains durable backup recovery without shifting the board or keyboard.
- Desktop route frames and COMBAT content are centered and balanced; the approved mobile COMBAT composition remains unchanged.
- Profile visibility information is now a compact Public/Private disclosure below Flair.
- Mobile rating buckets use full-width cards and a stable 2×2 detail grid without one-character wrapping.
- The 320×568 and 390×667 low-height play layouts retain all six initial rows and the complete stationary keyboard.

## Accent contrast matrix

The pure resolver was exercised against edge and semantic-adjacent custom colors. Ratios below are foreground-to-background WCAG contrast ratios.

| Custom hex | Alert ink / ratio |  Light key / ink / ratio |    Dark key / ink / ratio |
| ---------- | ----------------: | -----------------------: | ------------------------: |
| `#000000`  |     white / 21.00 |  `#B0B5B6` / dark / 9.74 | `#11181C` / white / 17.93 |
| `#FFFFFF`  |      dark / 20.19 | `#EDF2F4` / dark / 17.89 |  `#585F63` / white / 6.50 |
| `#777777`  |       dark / 4.51 | `#CCD1D3` / dark / 13.10 | `#32393D` / white / 11.74 |
| `#008000`  |      white / 5.14 | `#B0D4B6` / dark / 12.44 | `#113C1C` / white / 12.45 |
| `#E85D75`  |       dark / 6.01 | `#E7CBD2` / dark / 13.33 | `#52323D` / white / 11.16 |
| `#D28A00`  |       dark / 7.09 | `#E2D6B6` / dark / 13.96 | `#4B3E1C` / white / 10.47 |
| `#121826`  |     white / 17.73 | `#B4BBC0` / dark / 10.39 | `#161E27` / white / 16.81 |

Every tested alert and key foreground is at least 4.5:1. Amber-like custom values remain visually separate from the brighter fixed “present elsewhere” evidence state.

## Acceptance receipts

The complete local stack passed:

- `pnpm check`
- `pnpm test:domain`: 83 passed
- `pnpm test:browser`: 16 passed
- `pnpm test:e2e:fixture`: 15 passed across Chromium, Firefox, and WebKit
- `pnpm test:visual`: 11 passed
- `pnpm test:acceptance:local`: passed

The complete hosted command `pnpm test:acceptance` passed against the exact protected Preview:

- 15 fixture journeys;
- 2 serial real-service journeys;
- 11 visual/responsive journeys;
- 237/237 functional clauses acceptance-verified;
- 73/73 multiplayer audit clauses remain proven.

Hosted v6.3 evidence proved owner isolation, cross-device custom-preset hydration, sanitized public active-color projection, 24 concurrent successful creates with the 25th rejected, custom-accent gameplay, and active-preset deletion falling back to Aurora in both contexts. The existing Solo, public community, definitions, alerts, private requests, rematch, spectation, ranked Practice, all four Daily lanes, rating, History, and Stats journeys also remained green.

Invariant receipts:

- bootstrap: 107/107;
- migrations: 45/45 immutable plus 4/4 authorized additive;
- word assets: 34/34 and 6,097,886 deployment bytes;
- HTTP interfaces: exactly 3;
- Home bundle: 183,541 B compressed JavaScript and 21,307 B CSS;
- gameplay bundle: 190,072 B compressed JavaScript and 25,630 B CSS;
- Home requests no word bank; gameplay and Word Explorer load only the selected length.

## Native-size fidelity ledger

| Supplied concern                 | Implemented comparison                                       | Evidence and disposition                                                 |
| -------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Desktop COMBAT empty right side  | Transcript, score, draft, and keyboard share a centered axis | `VISUAL-DESKTOP-FRAME`; hosted COMBAT captures; corrected                |
| Gameplay jumps while typing      | Backup recovery moved into the fixed status rail             | fixture bounding-box assertion ≤1 px; corrected                          |
| Mobile COMBAT already correct    | Mobile breakpoints retained                                  | 320/360/390/412 and landscape visual matrix; intentionally unchanged     |
| Profile public/private paragraph | Compact semantic two-row disclosure below Flair              | hosted desktop Profile capture; corrected                                |
| Alert badge and keyboard accent  | Both use active accent with semantic evidence invariant      | named-accent visual matrix and hosted custom gameplay capture; corrected |
| Mobile Stats status overflow     | Full-width single-column cards with stable 2×2 details       | mobile Stats hosted capture and 320–412 containment probes; corrected    |
| General desktop left anchoring   | Shared fluid centered frame capped at readable measure       | 960/1440/1920 equal-side-gap assertions; corrected                       |
| Custom accent creation           | Native dialog, live sample, hex/name editing, rename/delete  | browser dialog tests and `V6.3-HOSTED-ACCENT-PRESETS`; implemented       |

Native-size evidence remains in the run-scoped local evidence directory and Playwright output. No supplied screenshot was overwritten. Intentional differences are limited to responsive fitting, semantic evidence preservation, and forced-colors system overrides.

## Cleanup receipt

Run `e2e_20260801T195633978Z_35597069_50360ac8` completed cleanup on attempt 1:

- 25 accent-preset records removed;
- 3 disposable Auth users removed;
- 7 games, 3 ranked Practice queues, 3 ranked Daily queues, 1 private request, and 1 rematch request removed;
- all game, action, result, authority, reservation, rating, History, progression, economy, profile, settings, preference, preset, and Auth probes returned zero.

Status: `zero-residue`.

## Preserved boundaries and rollback

- Production remains Ready at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.
- The private default branch remains `bootstrap/greenfield-2026-07-20`.
- No merge, Production release, default-branch change, Vercel project-setting change, paid service, real-account deletion, or down migration occurred.
- Existing visible E2E profiles were not deleted.
- Word Explorer, game rules, ratings, matchmaking, persistence envelopes, the old Blob store, and the locked BRRRDLE-DEV shell were not modified by v6.3.
- Code rollback is a forward revert to the v6.2 golden checkpoint `e4c0857bbe3749a8ffd44afebee300682bc48175`; database correction, if ever required, is forward-only.

## Manual review gate

Review the protected Preview with the paired checklist. Any merge or Production release requires separate authorization.
