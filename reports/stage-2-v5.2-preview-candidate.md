# Amordle Stage 2 v5.2 protected Preview candidate

## Review candidate

- Protected Preview:
  `https://amordle-a9w7pjo4g-ryanjosephkamps-projects.vercel.app`
- Deployment: `dpl_DAFZrppgyVeDE5rABLdtRqBbqSq2`
- Application commit: `bdc492fc2edbe7ceb367529166cd472f5aaff1d3`
- Evidence commit: `16e3d80301d55ae8a416d47bf0c28d0925e78929`
- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Rollback application commit:
  `098bdb5ef2335fff86d04a89acdbd122414246fb`

The Preview is protected by Vercel authentication. The candidate was built
with Node 24.18.0 and deployed from the exact application commit above.

## Implemented outcome

### Lobby and alerts

`/combat/lobby` is now the canonical discovery surface for joinable public
Practice and Daily games. It excludes private, ranked, full, terminal, stale,
blocked, or otherwise incompatible rows; retains private requests separately;
and parses legacy rows independently so one malformed record cannot suppress
the valid list. Join, cancel, Realtime, visibility, online, and 30-second
polling paths refresh the projection.

The existing Alerts control now projects durable private-request, match, turn,
result, and rematch events with deterministic revisions and persistent local
read state. Empty and partially unavailable notification states are distinct.

### Profile accent

The incompatible native color field has been replaced with the six backend
accent names: ice, aurora, cyan, violet, rose, and amber. The radio-swatch
selector is keyboard operable, uses one shared schema and color map, persists
the successful server response as its baseline, and is also used by public
profiles.

### History and Stats continuity

Signed-in completions now enter an account-namespaced IndexedDB outbox before
remote settlement. Reconciliation performs idempotent History, reward, and
progression operations and retains pending local completions without inventing
remote rewards or ratings.

History accepts legacy and v1 records and writes a richer backward-compatible
v2 payload. Solo and completed Practice/Daily COMBAT results project once into
History. Stats now presents progression, overall results, mode/lane
breakdowns, attempt distribution, rating buckets, recent activity, provenance,
and pending-sync count. New accounts receive truthful zeros; partial-source
failures preserve usable sections and expose a retry notice.

### Annotated gameplay and field repairs

- Five-letter desktop Solo tiles measure approximately 71.7 CSS px at
  1440×1024 and remain centered on the keyboard axis.
- At 390×844, the complete initial six-row board and keyboard fit in one
  dynamic viewport with no horizontal or vertical document scroll.
- Longer and purchased boards scroll inside the board history region while the
  keyboard remains stationary.
- Absent keyboard evidence has a stronger filled state and visible `×`; the
  evidence precedence is correct, present, absent, unknown, with consumable
  removal applied separately.
- Text, search, email, password, number, date, URL, textarea, select, and
  combobox controls share a perceptible inset surface, border, focus, invalid,
  disabled, autofill, and placeholder treatment.
- The COMBAT transcript remains one chronological center board with actor
  labels beside accepted rows. Split-player columns were not reintroduced.

Leaderboards received regression coverage only and were not redesigned.

## Acceptance receipt

| Gate                         | Result                                                              |
| ---------------------------- | ------------------------------------------------------------------- |
| `pnpm check`                 | Green                                                               |
| `pnpm test:domain`           | 26 passed                                                           |
| `pnpm test:browser`          | 6 passed                                                            |
| Local fixture E2E            | 13 passed across Chromium, Firefox, and WebKit                      |
| Local visual E2E             | 9 passed                                                            |
| `pnpm test:acceptance:local` | Green                                                               |
| Hosted fixture E2E           | 13 passed across Chromium, Firefox, and WebKit                      |
| Hosted service E2E           | 1 serial real-service journey passed                                |
| Hosted visual E2E            | 9 passed                                                            |
| `pnpm test:acceptance`       | Green at the exact application commit                               |
| Hosted mobile vitals         | LCP 212 ms, INP 40 ms, CLS 0                                        |
| Contract integrity           | 237/237 clauses, 107/107 bootstrap, 45/45 linked migrations, 3 APIs |
| Compressed budgets           | Home 178293 B JS / 16155 B CSS; game 183999 B JS / 20218 B CSS      |

The responsive matrix covers 320, 360, 390, 412, 768, 960, 1440, and 1920
widths, 200% zoom, system light/dark, reduced motion, forced colors, keyboard,
mouse, and touch-oriented operation. No serious or critical axe finding,
unexpected console/page/network failure, or horizontal document overflow
remains in the accepted matrix.

## Hosted service evidence

Final run:
`.codex-internal/evidence/e2e_20260729T202419108Z_bdc492fc_b45c3146`

The protected service journey used three disposable accounts and proved:

- real UI sign-in in isolated contexts and commit-scoped word publication;
- private-request notification delivery with persistent read state;
- preservation of an existing schema-v11 snapshot and creation of its
  successor state;
- one signed-in Solo completion producing exactly one History entry after
  repeated reconciliation and reload;
- public Practice creation/join, alternating accepted turns, refresh recovery,
  and a terminal result;
- exactly one COMBAT History projection for each participant;
- match, turn, result, and rematch alert transitions;
- privacy-safe, visibly read-only spectation.

Cleanup succeeded on attempt one. Three Auth users, one game, one private
request, one rematch request, and all dependent history, progress, profile,
settings, economy, and rating records were removed. Database and Auth residue
are zero.

## Packaging notes

The final package was built locally with Node 24.18.0 and deployed as Vercel
Build Output API artifacts. Browser-safe Supabase configuration was supplied
from the verified Preview project aliases for the build; hosted project
configuration was not changed.

A direct remote-settings pull temporarily restored stale local ignored
packaging metadata and produced an oversized local artifact. Upload was
stopped before mutation, the ignored metadata was restored to the verified
Next.js envelope, and the malformed local outputs were moved to `/tmp`.

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
