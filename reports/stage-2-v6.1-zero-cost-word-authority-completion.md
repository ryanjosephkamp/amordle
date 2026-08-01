# Amordle Stage 2 v6.1 — Zero-Cost Word Authority Completion

## Outcome

Amordle v6.1 is review-ready on a protected Preview. The deployment-bundled word authority, COMBAT acceptance authority, and credential cutover are complete without a paid storage service.

- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Application commit: `7f33829803eb93b560307b4b859d8109e1998db7`
- Final deployment: `dpl_12LwcLEg3yXFMHr9ynMZMgiN78Ni`
- Protected Preview: <https://amordle-hynrefg79-ryanjosephkamps-projects.vercel.app>
- Final hosted run: `e2e_20260801T012945823Z_7f338298_6f887a6e`
- Status: Ready for manual review; not merged and not released to Production.

## Completed authority change

- Browser word lists now use 34 same-deployment, content-addressed static assets for lengths 2–35.
- Server answer selection remains deployment-local and private.
- Home requests no word bank; gameplay and Word Explorer request only the selected length.
- Browser reads retain schema, revision, byte-count, and SHA-256 validation plus integrity-checked offline fallback.
- Word data is not embedded in application JavaScript.
- The three existing HTTP interfaces remain the only application HTTP interfaces.
- Admin and cron word endpoints report immutable-deployment freshness rather than attempting runtime publication.
- Runtime Vercel Blob and Supabase Storage word-list dependencies are absent.
- The old Blob store remains undeleted.

## COMBAT and parity evidence

- Functional parity: 237/237 verified.
- MP audit: 73/73 proven with named local tests and protected hosted scenarios.
- Hosted public/private/recovery journey: passed.
- Hosted ranked Practice/Daily journey: passed.
- Ranked Practice proved a timed match with one result, two player results, and two rating transactions; an untimed ten-puzzle GO queue cancellation was also proved.
- Daily proved unranked OG, unranked GO, ranked OG settlement, and ranked GO cancellation as independent clock-free lanes.
- Private request acceptance, participant refresh recovery, sanitized spectation, History/Stats continuity, alerts, result/rematch flow, and idempotent cleanup passed.

## Acceptance receipts

The exact application commit passed the complete local stack:

- `pnpm check`
- `pnpm test:domain`: 60 passed
- `pnpm test:browser`: 14 passed
- `pnpm test:e2e:fixture`: 15 passed across Chromium, Firefox, and WebKit
- `pnpm test:e2e:services`: 2 protected hosted journeys passed
- `pnpm test:visual`: 9 passed
- `pnpm test:acceptance:local`: passed
- `pnpm test:acceptance`: passed before and after Preview credential retirement

Invariant receipts:

- Bootstrap baseline: 107/107
- Migrations: 45/45 immutable plus 1/1 separately authorized additive migration
- Word assets: 34/34, 6,097,886 deployment bytes
- HTTP interfaces: exactly 3
- Home bundle: 180,986 B compressed JavaScript; 16,706 B CSS
- Game bundle: 185,662 B compressed JavaScript; 20,848 B CSS
- Representative raw/gzip word transfers: length 5 95,744/32,596 B; length 7 338,046/106,579 B; length 10 662,474/195,106 B

## Two-stage hosted credential proof

The same exact application commit first passed protected hosted acceptance on:

- Deployment: `dpl_9gWfu7PGjLyGkRQdcCsynsu7ZJyi`
- URL: <https://amordle-bag1lnmk7-ryanjosephkamps-projects.vercel.app>
- Run: `e2e_20260801T012508075Z_7f338298_ec174743`

Only after that proof, `BLOB_READ_WRITE_TOKEN` was removed from Preview scope. The Production/Development binding was not changed. A fresh build of the same application commit, using a newly pulled Preview environment without that key, produced the final deployment and passed the complete hosted suite again.

## Final cleanup receipt

Run `e2e_20260801T012945823Z_7f338298_6f887a6e` completed cleanup on attempt 1:

- 3 disposable Auth users removed
- 7 games removed
- 3 ranked Practice queue records and 3 ranked Daily queue records removed
- 1 private request and 1 rematch request removed
- All game, action, result, authority, reservation, rating, History, progression, economy, profile, settings, and private-preference probes returned zero
- Auth residue: zero

## Operational recovery notes

The Vercel upload window reset successfully. During packaging, an old generated development cache exceeded the single-file upload limit; the production build now removes only generated `dist/dev` data before building. One intermediate deployment used remotely pulled legacy project settings and returned only a 404; local ignored Vercel project metadata was restored to the verified Next.js configuration and the exact application commit was rebuilt. Neither event changed application authority, Production, or the hosted project configuration.

## Preserved boundaries

- Frozen Production deployment remains `dpl_739mtwiXc9pZPef3pxsKumwC9DfG` and Ready.
- The private repository default branch remains `bootstrap/greenfield-2026-07-20`.
- Supabase project `squqdstdvbsvhagfuzgj` remains `ACTIVE_HEALTHY`.
- No merge, Production release, default-branch change, down migration, real-account deletion, or Blob-store deletion occurred.
- The locked BRRRDLE-DEV shell was not modified.

## Manual review gate

Review the final protected Preview and the paired checklist. Any merge or Production release remains a separate authorization.
