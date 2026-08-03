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
- The full local acceptance stack passed with 120 domain, 21 browser, 20 fixture, and 13 visual
  tests.
- Functional parity remains 237/237, multiplayer audit remains 73/73, and the Next.js application
  still exposes exactly three API routes.

## Boundaries

The migration and function were applied only to linked project `squqdstdvbsvhagfuzgj`. Production,
the default branch, real accounts, the locked shell, word authority, and the previous protected
Preview were not modified during this authority-application step.

Protected Preview deployment, disposable-user lifecycle acceptance, exact cleanup, final evidence,
and the private golden checkpoint remain in progress.
