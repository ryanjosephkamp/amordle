# ADR-0001: Deployment-bundled word authority

- Status: accepted for implementation
- Date: 2026-07-30
- Decision owner: Amordle product authority
- Replaces: Vercel Blob runtime word publication

## Context

Amordle needs public candidate word banks for lengths 2 through 35 while the
server retains answer selection and active-game authority. The application
previously published those candidate banks through Vercel Blob. Hobby-plan Blob
advanced-operation limits suspended that store, and a Preview-scoped Blob
credential also requires retirement.

The repository already contains a complete validated runtime bank for every
supported length. Those banks are small enough to ship with a deployment and
must never be embedded into JavaScript or loaded together in a browser.

## Decision

`data/word-lists` is the reviewed, refreshable runtime authority. It is separate
from the immutable bootstrap copy. Before every development or production
build, a deterministic generator creates ignored files at:

```text
public/word-lists/<revision>/<length>-<sha256>.json
```

The server reads `data/word-lists` locally. The browser reads the bounded
manifest API and fetches only the selected length from the same deployment.
Every asset is checked by byte length, SHA-256, schema, length, counts,
uniqueness, and answer-subset rules before use.

The revision is the SHA-256 of the ordered asset descriptor. A Vercel
deployment activates its manifest and all 34 immutable objects together. A
failed build publishes nothing. Rollback redeploys an exact prior deployment or
uses a forward Git revert.

The three HTTP interfaces remain:

- `POST /api/admin-refresh`
- `GET /api/cron/refresh-word-lists`
- `GET /api/word-lists/manifest`

The first two now perform bounded freshness diagnostics. They cannot and do not
claim to mutate an immutable running deployment. Actual refresh authority is a
revision-pinned repository operation.

## Refresh authority

`pnpm word-data:refresh -- --revision <commit>` downloads the English OpenList
`data/brrrdle` manifest and 34 primary files from the exact Hugging Face commit.
It validates and normalizes a complete candidate in a temporary directory,
emits a review packet, and swaps the runtime directory only after all checks
pass. Volatile upstream timestamps and build-machine paths are excluded from
individual gameplay assets.

An optional GitHub Actions workflow may later prepare a refresh branch and
review packet. It is not required at runtime and may never merge or release
Production automatically.

## Consequences

- No Blob, Supabase Storage, database, or new vendor is required for words.
- Home loads no bank; each game or Explorer context loads one selected length.
- Word data does not increase JavaScript bundles.
- Static transfer consumes ordinary deployment bandwidth, whose free allowance
  remains finite.
- Cached data is revision-specific. A current game never silently validates
  against an older revision.
- The old Blob store remains undeleted until separately authorized.

## Rejected alternatives

Continued Blob publication, Supabase Storage, Postgres rows, direct runtime
Hugging Face reads, GitHub raw/release assets, another object-storage vendor,
and JavaScript embedding add quota, privacy, availability, or bundle costs
without improving the deployment-atomic model.
