# Amordle v6.1 Word Authority — Upload-Quota Handoff

## Outcome

The zero-cost deployment-bundled word authority and the associated COMBAT acceptance repairs are implemented and locally green on:

- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Exact local candidate: `5ea61624c6c2e88922598aee160d50bff9042128`
- Word revision: `6e60b3b6d7d2e121ca36d8006ec8d7162f76fe852000f8fd4b31256e77661703`
- English Open List upstream commit: `5bda5dec2a7ee0f7b2d770ea45ef3254d02b5e08`

The exact final candidate is not yet deployed. Vercel refused its upload with the Hobby-plan `api-upload-free` limit after more than 5,000 API upload requests and instructed a retry after 24 hours. No paid upgrade was selected.

## Implemented

- Replaced browser runtime Vercel Blob word publication with same-deployment, content-addressed static assets.
- Preserved server-local answer authority and private ranked answer/seed boundaries.
- Generates all 34 lengths (2–35) deterministically at build time without placing word data in JavaScript bundles.
- Preserves selected-length-only loading, Home loading no word bank, SHA-256 and byte verification, IndexedDB/Cache Storage offline fallback, and revision-aware cleanup.
- Added the zero-cost architecture decision, contract amendment, operator runbook, deterministic Hugging Face updater, provenance reports, and an optional separately authorized GitHub Actions proposal.
- Removed the runtime `@vercel/blob` dependency and Blob output tracing.
- Kept exactly three application HTTP interfaces. Admin and cron now provide truthful immutable-deployment freshness diagnostics rather than pretending to mutate a running deployment.
- Applied and synchronized the separately authorized additive COMBAT migration. The migration history is 45 immutable bootstrap migrations plus one authorized additive migration.
- Hardened ranked Daily expiry, strict response parsing, same-tab queue recovery, polling, deterministic-seat hosted evidence, clock-free Daily presentation, and independent-lane recovery.

## Local acceptance receipt

`pnpm test:acceptance:local` passed at the exact candidate:

- `pnpm check`: green
- Domain tests: 39 passed
- Browser component tests: 12 passed
- Fixture E2E: 15 passed across Chromium, Firefox, and WebKit
- Visual E2E: 9 passed
- Functional parity: 237/237
- MP clause audit: 73/73
- Bootstrap baseline: 107/107
- Migrations: 45 immutable plus 1 authorized additive
- Word assets: 34/34, 6,097,886 bytes
- HTTP interfaces: exactly 3
- Home budget: 179,911 B compressed JavaScript; 16,706 B CSS
- Game budget: 185,616 B compressed JavaScript; 20,848 B CSS
- Representative raw/gzip word transfers:
  - Length 5: 95,744 / 32,596 B
  - Length 7: 338,046 / 106,579 B
  - Length 10: 662,474 / 195,106 B

## Hosted evidence completed before the quota stop

The last deployed application checkpoint was:

- Commit: `f3df01c7cc04036545e34424eab88af24d9a9fa9`
- Deployment: `dpl_2XNRuJ6TRu1XH31GofbTdMnDG7UV`
- Preview: `https://amordle-33ym313yi-ryanjosephkamps-projects.vercel.app`

That run proved 15/15 public fixture journeys and the complete primary real-account service journey. The expanded COMBAT journey reached ranked Daily terminal settlement and exposed the final completed-lane recovery defect, which is fixed in the local candidate.

Its disposable run `e2e_20260731T033557598Z_f3df01c7_6c1e8883` cleaned three Auth users, seven games, five ranked queue records, one private request, one rematch request, all dependent rows, and all private COMBAT authority rows with zero residue on the first cleanup attempt.

The older Preview is not the final review candidate and is explicitly superseded by the local commit.

## Protected stop

The final `vercel deploy --prebuilt` failed before creating a deployment:

- Code: `api-upload-free`
- Scope: Vercel Hobby API uploads
- Message: more than 5,000 requests; retry after 24 hours

This is an external zero-cost quota stop, not an application build or test failure. The prebuilt final candidate completed successfully before the upload was refused.

## Exact resume sequence

After Vercel’s upload window resets:

1. Verify the branch is clean and still at `5ea61624c6c2e88922598aee160d50bff9042128`.
2. Re-run `pnpm test:acceptance:local` if any file, dependency, service identity, or migration state changed.
3. Build and deploy the exact commit to a protected Preview using the existing prebuilt workflow.
4. Run `E2E_BASE_URL=<exact-preview> pnpm test:acceptance`.
5. Require 15 public fixtures, both serial hosted service journeys, 9 visual journeys, 237/237 parity, and zero disposable residue.
6. Only after that green run, remove `BLOB_READ_WRITE_TOKEN` from the Preview environment scope. Do not remove or change the Production entry.
7. Redeploy and rerun hosted acceptance to prove the same application without Blob credentials.
8. Leave the old Blob store undeleted unless separately authorized.
9. Produce the final paired report and checklist with the exact final deployment and evidence commits.

## Preserved boundaries

- Production deployment `dpl_739mtwiXc9pZPef3pxsKumwC9DfG` is unchanged.
- The default branch is unchanged.
- No merge or Production release occurred.
- Real players and Auth users were not deleted.
- Supabase project `squqdstdvbsvhagfuzgj` remains the Amordle authority.
- BRRRDLE-DEV and its locked shell remain unchanged.
- The old Blob store remains undeleted.
- The Preview Blob token has not been retired prematurely.

## Quota references

- Vercel documents finite platform limits and Hobby-plan restrictions: <https://vercel.com/docs/limits> and <https://vercel.com/docs/plans/hobby>
- GitHub Actions included usage is finite and must fail safely if exhausted: <https://docs.github.com/en/billing/reference/product-usage-included>
- Supabase egress is avoided for word assets by the selected architecture: <https://supabase.com/docs/guides/platform/manage-your-usage/egress>
