# amordle Fresh-Build Source and Service Reference Manifest

**Status:** Canonical nonsecret source and service reference.
**Date:** 2026-07-20

## Repository identities

- Target repository retained for the fresh build: <https://github.com/ryanjosephkamp/amordle>
- Read-only functional-shell provenance repository: <https://github.com/ryanjosephkamp/brrrdle-dev>
- Exact final functional-shell release: <https://github.com/ryanjosephkamp/brrrdle-dev/releases/tag/phase-58-final-functional-shell-golden-2026-07-13>
- Golden source commit: `062624b2fb7c8d039a2eba3aec5b059c26628a11`
- Original amordle clean-history seed: `0b51cafdcf4437f693ab9fe1afe426d28c557fb8`

The fresh build may use these links as behavioral and recovery references. It must never modify, deploy, relink, reconfigure, or use the read-only repository as a working service target.

## Live functional-shell reference

- Accepted hosted functional shell: <https://amordle.vercel.app>
- Accepted production deployment recorded by Wave 00: `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`

This live site is the behavioral comparison surface. It is not the visual target. During the reset and fresh build, it should remain available as the known-good recovery and manual-comparison baseline until Ryan separately accepts a replacement deployment.

## Dedicated service identities

### Supabase

- Project name: `amordle`
- Project ref: `squqdstdvbsvhagfuzgj`
- Region: `us-east-2`
- PostgreSQL major version recorded at Wave 00: 17
- Status at Wave 00 verification: `ACTIVE_HEALTHY`

### Vercel

- Project name: `amordle`
- Project ID: `prj_8DsbwXWKUtUz7dQl9xoPCgFUuxzH`
- Team ID: `team_0vEdA7fHR2HdGWr7QWWP2m6x`
- Production alias: <https://amordle.vercel.app>

These identifiers are nonsecret but must still be verified before any mutation. The existing remote configuration, Auth tenant, applied migrations, Blob store, cron secret, environment variables, and legitimate manual-test accounts/data must be preserved.

## Known accepted backend state

- 42 local migration versions and 42 remote migration versions were exactly equal after the additive ranked-Practice claim idempotence repair.
- All 24 public application tables had RLS enabled.
- The dedicated Blob store held 34 word-list data objects and one manifest after Wave 00 verification.
- Production static app, web manifest, service worker, word-list manifest, protected Admin behavior, cron authorization, Blob access, responsive behavior, privacy probes, and the accepted hosted test matrix passed at Wave 00 closeout.
- Legitimate accounts and data now exist and must not be treated as disposable or unrelated residue.

## Fresh-workspace private configuration

No secret value belongs in this starter pack or Git.

The future reset execution should, after exact identity verification:

1. retain the existing Vercel project-level environment configuration;
2. create or link the fresh local workspace to the exact Vercel project without printing values;
3. populate a new ignored `.env.local` by copying only an explicit allowlist of required variable names from the current private local file or by an authorized `vercel env pull` plus a nonprinting local transfer for Node-only E2E credentials;
4. set `.env.local` mode to `0600` and prove it is ignored and untracked;
5. never place a privileged key in a `VITE_*` variable or Vercel browser environment.
