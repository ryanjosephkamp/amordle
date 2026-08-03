# Amordle Stage 2 v6.6 account-lifecycle application receipt

## Authorized operation

On 2026-08-02, the owner authorized the exact reviewed v6.6 account-lifecycle artifacts for the
linked Amordle Supabase project `squqdstdvbsvhagfuzgj`. The authorization excludes merge and
Production release.

## Applied authority

| Artifact | Authorized SHA-256 | Applied state |
| --- | --- | --- |
| `supabase/migrations/20260802193000_amordle_account_lifecycle_v1.sql` | `caad339a608a0a23f5589a25bed6a1f2d415d033e04db707fce214687192c9f3` | Applied; linked ledger synchronized at 52/52 |
| `supabase/functions/account-lifecycle-v1/index.ts` | `fb961d9e60d39008c50492561a8fa2c04fde12e49264c0a534f3522709cb5dc1` | Deployed as `account-lifecycle-v1` version 1 |
| `supabase/functions/account-lifecycle-v1/deno.json` | `fc9fc38c21441b7f67a91280ed28b8ca4ad67fc69d713db441f5c0fd9a6abf9f` | Deployed with the function bundle |

Supabase assigned function ID `8e75a009-e375-4a6e-8de6-6ebb92e1e2c0`. The deployed function is
`ACTIVE`, has `verify_jwt=true`, and reports bundle SHA-256
`02abfe93956535d9de1c26c227dba0245e25b7522eb61de0b6a2b609ca991031`.

## Verification

- Pre-write migration dry run named only `20260802193000_amordle_account_lifecycle_v1.sql`.
- Post-write migration listing reports identical local and remote version `20260802193000`.
- Linked TypeScript types were regenerated from schemas `public,brrrdle_private`.
- Bootstrap verification reports 45/45 immutable plus 7/7 authorized additive migrations and
  0/0 pending.
- The full local acceptance stack passed with 121 domain, 21 browser, 20 fixture, and 13 visual
  tests.
- Functional parity remains 237/237, multiplayer audit remains 73/73, and the Next.js application
  still exposes exactly three API routes.

## Boundaries

The migration and function were applied only to linked project `squqdstdvbsvhagfuzgj`. Production,
the default branch, real accounts, the locked shell, word authority, and the previous protected
Preview were not modified during this authority-application step.

## Protected acceptance and cleanup

- Application candidate: `f0a3a10c116530641cb23bafce0aea22f8ba53e5`
- Deployment: `dpl_526Pf8MBtD2GionGGuX7y5ViyuGf`
- Protected Preview: <https://amordle-j0a0ycuc0-ryanjosephkamps-projects.vercel.app>
- Final hosted run: `e2e_20260803T010541643Z_f0a3a10c_110a3c24`

The final hosted run passed 20 fixture journeys, 3 serial real-service journeys, 13 visual and
responsive journeys, 237/237 functional clauses, and the 73/73 multiplayer audit. It exercised
wrong-password rejection, Solo reset with economy preservation, competitive reset across all six
rating buckets, queue cancellation, opponent-safe permanent deletion, avatar removal, public-profile
removal, and deleted-player sanitization.

Cleanup completed on attempt 1. Exact probes returned zero database, Storage, private COMBAT,
function-test, and Auth residue after removing 6 disposable Auth users, 7 games, 7 queue rows,
1 private request, 1 rematch request, 25 accent presets, 2 avatar objects, and 1 lifecycle result.

Final evidence reconciliation and the private golden checkpoint are the only remaining repository
steps. Merge and Production release remain unauthorized.
