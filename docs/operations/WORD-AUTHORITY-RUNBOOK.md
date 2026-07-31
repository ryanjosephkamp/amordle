# Deployment-bundled Word Authority Runbook

> The top-level `README.md`, `.env.example`, `.gitignore`, and
> `.prettierignore` remain byte-identical bootstrap authorities. This successor
> runbook—not the intentionally historical bootstrap README—describes the
> implemented application and its current word-data operations.

## Purpose

This runbook operates Amordle’s word banks without Vercel Blob, Supabase
Storage, database rows, or another storage vendor. The running game serves the
last green word revision from its own deployment even if Hugging Face, GitHub
Actions, or an operator workflow is unavailable.

## Current authority

- Dataset: `ryanjosephkamp/english-openlist`
- Upstream revision:
  `5bda5dec2a7ee0f7b2d770ea45ef3254d02b5e08`
- Runtime revision:
  `6e60b3b6d7d2e121ca36d8006ec8d7162f76fe852000f8fd4b31256e77661703`
- Generator: `2.1.0`
- Lengths: 2–35, 34/34 files
- Committed runtime output: 6,097,886 bytes
- Generated public output: 6,097,886 bytes, ignored by Git

Generator 2.1 validates the upstream curation seed but removes it from runtime
and public files. Public assets contain candidate answers and accepted guesses;
they contain no active answer, ranked answer, game seed, raw identity, or future
selection authority.

## Local or Codex-operated refresh

1. Inspect the current upstream head without changing the repository:

   ```sh
   pnpm word-data:check-upstream
   ```

2. Resolve and record the exact 40-character Hugging Face commit. Never refresh
   from an unpinned `main` reference.
3. Generate the bounded candidate:

   ```sh
   pnpm word-data:refresh -- --revision <exact-commit>
   ```

4. Review both files created under `reports/word-refresh/`. Review every
   per-length count and the bounded addition/removal samples. A material drift
   guard stops before replacing `data/word-lists`.
5. Run:

   ```sh
   pnpm verify:word-assets
   pnpm test:acceptance:local
   ```

6. Commit and push a normal private checkpoint. Deploy only that exact green
   commit to a protected Preview. Never auto-merge or release Production.

If any upstream file is missing, malformed, duplicated, the wrong length,
oversized, or outside the expected schema, the updater leaves the previous
authority intact.

## Optional GitHub Actions proposal

`.github/workflows/word-data-refresh.yml` is a proposal-only workflow. A
schedule becomes active only if the file eventually reaches the default
branch. It uses the repository-scoped `GITHUB_TOKEN`, pins the upstream commit,
creates a dedicated branch and pull request, and never merges or deploys.

GitHub currently documents 2,000 included Actions minutes per month for GitHub
Free personal and Free organization accounts. Configure an Actions budget to
stop usage when the included allowance is exhausted; the running game does not
depend on the workflow. See
[GitHub’s included-usage table](https://docs.github.com/en/billing/reference/product-usage-included)
and
[Actions billing guidance](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

## Transfer and quota envelope

Local build measurements for representative selected-length assets are:

| Length | Raw bytes | Local gzip bytes |
| ---: | ---: | ---: |
| 5 | 95,744 | 32,596 |
| 7 | 338,046 | 106,579 |
| 10 | 662,474 | 195,106 |

These are data-file measurements, not JavaScript bundle bytes. Hosted
acceptance must record the deployed response headers and actual transferred
size because CDN compression is an observed property, not an assumption.

Vercel’s current limits page lists a 100 MB Hobby static-file upload limit and
100 GB of included Fast Data Transfer. The 6.1 MB generated authority is below
the per-deployment static limit. The free tier remains finite; quota exhaustion
must stop or defer activity rather than trigger a paid upgrade. See
[Vercel limits](https://vercel.com/docs/limits) and
[Vercel Hobby behavior](https://vercel.com/docs/plans/hobby).

Not using Supabase Storage avoids spending its word-list transfer against
Supabase’s currently documented 5 GB uncached and 5 GB cached Free egress
allowances. See
[Supabase egress guidance](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

The updater uses Hugging Face resolver downloads only during a reviewed refresh,
not during gameplay. Hugging Face documents resolver rate limits in five-minute
windows and returns HTTP 429 when exhausted. A failed refresh leaves the
deployed game unchanged. See
[Hugging Face Hub rate limits](https://huggingface.co/docs/hub/main/rate-limits).

## Admin and cron behavior

The retained Admin and cron interfaces perform bounded freshness checks. They
report `current` or `upstream_release_available`; they cannot mutate an
immutable deployment. A refresh is a repository operation followed by a new
build and protected Preview.

## Cache and offline behavior

- The manifest is stored in a public IndexedDB envelope.
- One selected length is stored in
  `amordle-public-word-lists-v2` only after byte, SHA-256, schema, count,
  uniqueness, and subset validation.
- A new manifest revision prunes old word-asset revisions.
- A corrupt cached object is deleted and rejected.
- A visited Word Explorer page and visited Solo route can restore offline; Auth,
  API, COMBAT, and private responses are not added to the shell cache.

## Rollback and credential retirement

Rollback is a forward Git revert followed by redeployment of an exact known-good
commit. Do not use a down migration.

After a new protected Preview proves manifest, assets, browser loading, offline
fallback, gameplay, and hosted services:

1. remove only the Preview-scoped `BLOB_READ_WRITE_TOKEN` binding;
2. redeploy the same exact application commit;
3. rerun the critical hosted word and gameplay probes;
4. confirm Production configuration is unchanged.

Do not delete the old Blob store without separate authorization.
