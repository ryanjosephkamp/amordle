# Amordle Stage 2 v5.3 protected Preview candidate

## Review candidate

- Protected Preview:
  `https://amordle-1bj4496rq-ryanjosephkamps-projects.vercel.app`
- Deployment: `dpl_27v13DcnvNf4TyETMjeahHuNDpVY`
- Application commit: `31be382e50fa451a9a8a961780f317f9555ed408`
- Evidence commit: `fb2b2a5d120f8df4c06b5f6f11412ae6c675d4ad`
- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Rollback application commit:
  `bdc492fc2edbe7ceb367529166cd472f5aaff1d3`

The Preview is protected by Vercel authentication. It was built with the
pinned Node 24.18.0 application toolchain and deployed from the exact clean
application commit above.

## Implemented outcome

### Keyboard semantics

The untouched keyboard no longer resembles ruled-out Wordle evidence.
Unguessed letters and neutral Submit/Delete actions use a raised blue-gray
field surface. A ruled-out letter uses a near-black surface with light text and
a visible `×`, matching the absent board tile without relying on color alone.
The previous warm gray/tan ruled-out treatment was removed.

Evidence remains domain-derived with `correct > present > absent > unknown`
precedence. Consumable removal remains a distinct disabled overlay. New domain,
component, responsive, and hosted coverage proves duplicate-letter precedence,
accessible labels, contrast, and visual differentiation.

### COMBAT current-puzzle evidence and layout

Both participants now derive the on-screen keyboard from the same shared,
chronological current-puzzle transcript. A guess submitted by either player
updates both keyboards. GO filters accepted moves to the active puzzle,
rescoring seed rows against that puzzle and resetting stale evidence at the
next puzzle boundary.

Mobile COMBAT gives the match detail and turn status independent grid cells so
`YOUR TURN` or `OPPONENT'S TURN` cannot sit behind another layer. Transcript
metadata now uses separate row, divider, and actor columns. Hosted evidence
shows `01 · YOU` and `02 · RIVAL` without overlap, with the guess grid centered
on the keyboard axis.

### Stable persistence presentation

Routine `SAVING…` and `SYNCING…` text was removed from the active game header.
IndexedDB and account reconciliation behavior is unchanged. Only actionable
backup failure remains visible, so typing no longer inserts or removes a
status row and the board/keyboard do not jump.

### Account quick tools

The account popover is now a compact account utility instead of a duplicate
site menu. A signed-in player sees their identity, Level, XP, Coins, View
profile, and Sign out. Stats, History, Marketplace, and Settings remain in the
main Menu. Economy query keys now consistently use the account namespace, so
the quick totals and other account surfaces share one cache identity.

### Physical-keyboard navigation

One canonical registry defines:

- Shift+1: Home
- Shift+2: Solo
- Shift+3: Daily
- Shift+4: COMBAT
- Shift+5: Data/History
- Shift+M: open or close Menu

The shell uses physical key codes, announces route changes, and focuses the new
main landmark. Shortcuts do not run in an input, textarea, select, editable
region, or modal dialog. Shift+M is reserved before Solo or COMBAT letter
handlers, while a normal `m` still enters M.

The same registry drives the Help table and the maintained
`docs/keyboard-navigation.md` and `docs/keyboard-navigation.html` manuals.
The HTML manual is responsive, searchable, printable, light/dark aware, and
provides optional copy controls. `pnpm check` rejects drift between the
registry and both manuals.

## Acceptance receipt

| Gate                         | Result                                                              |
| ---------------------------- | ------------------------------------------------------------------- |
| `pnpm check`                 | Green                                                               |
| `pnpm test:domain`           | 29 passed                                                           |
| `pnpm test:browser`          | 7 passed                                                            |
| Local fixture E2E            | 14 passed across Chromium, Firefox, and WebKit                      |
| Local visual E2E             | 9 passed                                                            |
| `pnpm test:acceptance:local` | Green                                                               |
| Hosted fixture E2E           | 14 passed across Chromium, Firefox, and WebKit                      |
| Hosted service E2E           | 1 serial real-service journey passed                                |
| Hosted visual E2E            | 9 passed                                                            |
| `pnpm test:acceptance`       | Green at the exact application commit                               |
| Hosted mobile vitals         | LCP 380 ms, INP 32 ms, CLS 0                                        |
| Contract integrity           | 237/237 clauses, 107/107 bootstrap, 45/45 linked migrations, 3 APIs |
| Compressed budgets           | Home 179973 B JS / 16706 B CSS; game 185678 B JS / 20848 B CSS      |

The responsive matrix covers 320, 360, 390, 412, 768, 960, 1440, and 1920
widths, 200% zoom, system light/dark, reduced motion, forced colors, keyboard,
mouse, and touch operation. No serious or critical axe finding, unexpected
console/page/network failure, or horizontal document overflow remains in the
accepted matrix.

Interactive inspection at 390×844 measured the document at exactly 390×844,
with the keyboard bottom at 838.4 CSS pixels. Scored and untouched keyboard
states remained distinct, persistence text remained absent, Shift+M opened the
menu without typing M, Help showed the registry, and an Auth email field kept
Shift+1 as typed field input rather than navigating.

## Hosted service evidence

Final run:
`.codex-internal/evidence/e2e_20260730T015100863Z_31be382e_79abdb4c`

The protected service journey used three disposable accounts and proved:

- real UI sign-in in isolated contexts and commit-scoped word publication;
- profile, progression, economy, History, Stats, and alert continuity;
- the bounded account popover content;
- signed-in Solo completion and idempotent reconciliation;
- public Practice creation/join and alternating accepted turns;
- refresh recovery with one chronological actor-labelled transcript;
- identical current-puzzle evidence on both participant keyboards;
- match, turn, result, and rematch notification transitions;
- privacy-safe, visibly read-only spectation.

Cleanup succeeded on attempt one. Three Auth users, one game, one private
request, one rematch request, and all dependent History, progress, settings,
profile, economy, and rating rows were removed. Database and Auth residue are
zero.

An earlier prebuilt candidate
`dpl_5oadsHfQvk4L6VdmSMQrDyDgMzve` failed closed before gameplay because its
local packaging envelope omitted the public Supabase configuration. Its
three disposable accounts were also removed with zero residue on attempt one.
The same application commit was rebuilt with the verified project URL,
locally custodied anon key, and exact Git metadata without changing hosted
project settings. The final candidate passed the unauthenticated 401 boundary
before the complete hosted rerun.

## Evidence package

The committed package is
`design/references/stage2/v5.3-input-semantics-keyboard-navigation-2026-07-29`.
Its manifest records exact dimensions and SHA-256 hashes for seven sanitized
local/hosted captures. The fidelity ledger maps each user annotation to
implementation, automation, rendered evidence, and acceptance.

## Operational boundaries

- Frozen Production `dpl_739mtwiXc9pZPef3pxsKumwC9DfG` remains Ready and
  unchanged.
- The private repository and existing default branch remain unchanged.
- Supabase remains `squqdstdvbsvhagfuzgj` with 45/45 migration identity.
- All 107 manifested bootstrap files remain intact.
- The locked BRRRDLE-DEV shell remains
  `062624b2fb7c8d039a2eba3aec5b059c26628a11`.
- Real players and Auth users were not selected for deletion.
- Leaderboards were not materially changed.
- No merge, Production release, schema change, default-branch change, branch
  deletion, stash inspection, or shell mutation was performed.

The previously exposed Preview-scoped Blob credential still requires rotation
or revocation by the account owner. Its value is not recorded in repository
evidence.

## Manual gate

This candidate is ready for manual review only. Review does not authorize a
merge, Production release, default-branch change, schema change, branch
deletion, or real-account deletion.
